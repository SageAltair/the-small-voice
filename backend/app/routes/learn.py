"""Public Learn API.

Everything here is readable without an account and never returns unpublished
content: paths, lessons and categories are filtered on ``status`` and on the
requested language, and a missing translation yields an explicit
``translation_missing`` error instead of quietly leaking the other language.

Progress is written through one endpoint and accepted both for signed-in
visitors (via the existing bearer token) and for anonymous visitors (via the
``X-Learn-Client`` id the Learn UI keeps in local storage), which is what lets
Learn stay useful without forcing anyone to register.
"""

import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from jose import JWTError, jwt
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.config import ALGORITHM, SECRET_KEY
from app.database import get_db
from app.learn_content import (
    EVENT_TYPES,
    build_progress,
    clamp_text,
    clean_bool,
    clean_id,
    clean_int,
    clean_language,
    iso,
    published_blocks,
    translation_map,
    OTHER_LANGUAGE,
)
from app.models.learn import (
    LearnCategory,
    LearnCategoryTranslation,
    LearnEvent,
    LearnLesson,
    LearnLessonProgress,
    LearnLessonTranslation,
    LearnPath,
    LearnPathProgress,
    LearnPathTranslation,
)
from app.models.resource import Resource
from app.models.story import Story
from app.models.user import User


router = APIRouter(prefix="/learn", tags=["Learn"])

CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


# ---------------------------------------------------------------------------
# Learner identity + progress helpers
# ---------------------------------------------------------------------------

def learn_client_id(request: Request) -> str | None:
    """The anonymous Learn client id, when the browser sent a usable one."""
    raw = request.headers.get("X-Learn-Client", "")
    return raw if CLIENT_ID_PATTERN.match(raw or "") else None


def optional_user(request: Request, db: Session) -> User | None:
    """Resolve a bearer token leniently: an anonymous visitor is not an error."""
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        return None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


def learner(request: Request, db: Session) -> dict[str, Any]:
    return {
        "user": optional_user(request, db),
        "client_id": learn_client_id(request),
    }


def _learner_filter(model, owner: dict[str, Any]):
    """Match progress rows for this learner.

    A signed-in visitor also sees the rows written anonymously on this device;
    the first write folds those rows into their account.
    """
    user = owner["user"]
    client_id = owner["client_id"]
    clauses = []
    if user is not None:
        clauses.append(model.user_id == user.id)
    if client_id:
        clauses.append(model.client_id == client_id)
    if not clauses:
        return None
    return or_(*clauses)


def lesson_progress_map(
    db: Session, owner: dict[str, Any], lesson_ids: list[int]
) -> dict[int, LearnLessonProgress]:
    if not lesson_ids:
        return {}
    condition = _learner_filter(LearnLessonProgress, owner)
    if condition is None:
        return {}
    rows = db.execute(
        select(LearnLessonProgress).where(
            condition, LearnLessonProgress.lesson_id.in_(lesson_ids)
        )
    ).scalars().all()
    result: dict[int, LearnLessonProgress] = {}
    for row in rows:
        # A signed-in row wins over an anonymous row for the same lesson.
        existing = result.get(row.lesson_id)
        if existing is None or (row.user_id and not existing.user_id):
            result[row.lesson_id] = row
    return result


def path_progress_row(db: Session, owner: dict[str, Any], path_id: int) -> LearnPathProgress | None:
    condition = _learner_filter(LearnPathProgress, owner)
    if condition is None:
        return None
    rows = db.execute(
        select(LearnPathProgress).where(condition, LearnPathProgress.path_id == path_id)
    ).scalars().all()
    if not rows:
        return None
    signed_in = [row for row in rows if row.user_id]
    return (signed_in or rows)[0]


def visible_lessons(
    db: Session, path_id: int, language: str, *, published_only: bool = True
) -> tuple[list[LearnLesson], dict[int, LearnLessonTranslation]]:
    """Lessons of a path that exist in this language, in order.

    A lesson without a title in the requested language is not part of that
    language version of the path at all.
    """
    query = (
        select(LearnLesson, LearnLessonTranslation)
        .join(LearnLessonTranslation, LearnLessonTranslation.lesson_id == LearnLesson.id)
        .where(
            LearnLesson.path_id == path_id,
            LearnLesson.deleted_at.is_(None),
            LearnLessonTranslation.language == language,
            LearnLessonTranslation.title != "",
        )
        .order_by(LearnLesson.position.asc(), LearnLesson.id.asc())
    )
    if published_only:
        query = query.where(LearnLesson.status == "published")
    rows = db.execute(query).all()
    return [row[0] for row in rows], {row[0].id: row[1] for row in rows}


def visible_paths(db: Session, language: str) -> list[tuple[LearnPath, LearnPathTranslation]]:
    """Published paths that have a title in the requested language."""
    rows = db.execute(
        select(LearnPath, LearnPathTranslation)
        .join(LearnPathTranslation, LearnPathTranslation.path_id == LearnPath.id)
        .where(
            LearnPath.status == "published",
            LearnPath.deleted_at.is_(None),
            LearnPathTranslation.language == language,
            LearnPathTranslation.title != "",
        )
        .order_by(LearnPath.display_order.asc(), LearnPath.created_at.desc())
    ).all()
    return [(row[0], row[1]) for row in rows]


def other_language_available(db: Session, language: str) -> bool:
    """True when the site has published Learn content in the other language."""
    other = OTHER_LANGUAGE.get(clean_language(language), "sw")
    return db.execute(
        select(LearnPathTranslation.id)
        .join(LearnPath, LearnPath.id == LearnPathTranslation.path_id)
        .where(
            LearnPath.status == "published",
            LearnPath.deleted_at.is_(None),
            LearnPathTranslation.language == other,
            LearnPathTranslation.title != "",
        )
        .limit(1)
    ).scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------

def category_payload(category: LearnCategory | None, language: str) -> dict[str, Any] | None:
    if category is None:
        return None
    row = translation_map(list(category.translations)).get(language)
    if row is None or not clamp_text(row.name, 240):
        return None
    return {
        "id": category.id,
        "slug": category.slug,
        "name": clamp_text(row.name, 240),
        "description": clamp_text(row.description, 2000),
        "icon": category.icon,
    }


def lesson_reference(db: Session, block: dict[str, Any], language: str) -> dict[str, Any] | None:
    """Resolve a block's reference to an existing Story or Resource.

    Learn never copies media: a lesson points at the record it already has, and
    the public page is told whether that record is still published - including
    the language it was written in, so the UI can be honest when a Swahili
    lesson links to an English-only story.
    """
    block_type = block["block_type"]
    config = block.get("config") or {}

    if block_type == "story":
        story_id = clean_id(config.get("story_id"))
        if not story_id:
            return None
        story = db.get(Story, story_id)
        if story is None:
            return {"kind": "story", "id": story_id, "available": False, "title": None}
        return {
            "kind": "story",
            "id": story.id,
            "title": clamp_text(story.title, 240),
            "url": f"/stories/{story.id}",
            "cover_url": story.image_url,
            "language": story.language,
            "available": bool(story.published) and story.deleted_at is None,
        }

    if block_type == "resource":
        resource_id = clean_id(config.get("resource_id"))
        if not resource_id:
            return None
        resource = db.get(Resource, resource_id)
        if resource is None:
            return {"kind": "resource", "id": resource_id, "available": False, "title": None}
        return {
            "kind": "resource",
            "id": resource.id,
            "title": clamp_text(resource.title, 240),
            "url": resource.url,
            "cover_url": resource.cover_url,
            "resource_type": resource.type or resource.resource_type,
            "language": resource.language,
            "available": bool(resource.published or resource.status == "published")
            and resource.deleted_at is None,
        }

    return None


def public_lesson_rows(
    lessons: list[LearnLesson],
    translations: dict[int, LearnLessonTranslation],
) -> list[dict[str, Any]]:
    rows = []
    for lesson in lessons:
        trans = translations.get(lesson.id)
        rows.append({
            "id": lesson.id,
            "slug": lesson.slug,
            "position": lesson.position,
            "status": lesson.status,
            "estimated_minutes": lesson.estimated_minutes,
            "thumbnail_url": lesson.thumbnail_url,
            "title": clamp_text(getattr(trans, "title", ""), 240) if trans else "",
            "summary": clamp_text(getattr(trans, "summary", ""), 2000) if trans else "",
            "next_step": clamp_text(getattr(trans, "next_step", ""), 2000) if trans else "",
            "block_count": len(lesson.blocks),
        })
    return rows


def path_summary(
    db: Session,
    path: LearnPath,
    translation: LearnPathTranslation | None,
    language: str,
    owner: dict[str, Any],
) -> dict[str, Any]:
    lessons, lesson_translations = visible_lessons(db, path.id, language)
    rows = public_lesson_rows(lessons, lesson_translations)
    progress_rows = lesson_progress_map(db, owner, [row["id"] for row in rows])
    completed = {
        lesson_id for lesson_id, row in progress_rows.items() if row.status == "completed"
    }
    path_row = path_progress_row(db, owner, path.id)
    progress = build_progress(
        lessons=rows,
        completed_ids=completed,
        started=path_row is not None,
        current_lesson_id=path_row.current_lesson_id if path_row else None,
        completed_at=path_row.completed_at if path_row else None,
    )
    return {
        "id": path.id,
        "slug": path.slug,
        "title": clamp_text(getattr(translation, "title", ""), 240),
        "description": clamp_text(getattr(translation, "description", ""), 2000),
        "cover_url": path.cover_url,
        "level": path.level,
        "language": language,
        "estimated_minutes": path.estimated_minutes or sum(
            lesson.estimated_minutes or 0 for lesson in lessons
        ),
        "lesson_count": len(lessons),
        "category": category_payload(path.category, language),
        "featured": bool(path.featured),
        "progress": progress,
    }


def lesson_detail(
    db: Session,
    path: LearnPath,
    lesson: LearnLesson,
    translation: LearnLessonTranslation,
    language: str,
    owner: dict[str, Any],
    *,
    preview: bool = False,
) -> dict[str, Any]:
    """The exact payload the public lesson page renders (also used by preview)."""
    blocks = published_blocks(lesson, language)
    for block in blocks:
        reference = lesson_reference(db, block, language)
        if reference:
            block["reference"] = reference

    # In preview the draft lesson itself must be part of its own navigation.
    lessons, lesson_translations = visible_lessons(
        db, path.id, language, published_only=not preview
    )
    index = next((position for position, item in enumerate(lessons) if item.id == lesson.id), None)
    rows = public_lesson_rows(lessons, lesson_translations)
    progress_rows = lesson_progress_map(db, owner, [row["id"] for row in rows])
    completed = {
        lesson_id for lesson_id, row in progress_rows.items() if row.status == "completed"
    }
    path_row = path_progress_row(db, owner, path.id)
    progress = build_progress(
        lessons=rows,
        completed_ids=completed,
        started=path_row is not None or bool(progress_rows),
        current_lesson_id=path_row.current_lesson_id if path_row else None,
        completed_at=path_row.completed_at if path_row else None,
    )
    own = progress_rows.get(lesson.id)

    def neighbour(offset: int) -> dict[str, Any] | None:
        if index is None:
            return None
        target = index + offset
        if target < 0 or target >= len(lessons):
            return None
        item = lessons[target]
        return {
            "id": item.id,
            "slug": item.slug,
            "title": clamp_text(getattr(lesson_translations.get(item.id), "title", ""), 240),
        }

    path_translation = translation_map(list(path.translations)).get(language)
    payload: dict[str, Any] = {
        "path": {
            "id": path.id,
            "slug": path.slug,
            "title": clamp_text(getattr(path_translation, "title", ""), 240),
            "level": path.level,
        },
        "lesson": {
            "id": lesson.id,
            "slug": lesson.slug,
            "position": lesson.position,
            "title": clamp_text(translation.title, 240),
            "summary": clamp_text(translation.summary, 2000),
            "estimated_minutes": lesson.estimated_minutes,
            "thumbnail_url": lesson.thumbnail_url,
            "objective": {
                "before": clamp_text(translation.objective_before, 2000),
                "after": clamp_text(translation.objective_after, 2000),
                "action": clamp_text(translation.objective_action, 2000),
            },
            "next_step": clamp_text(translation.next_step, 2000),
            "blocks": blocks,
        },
        "navigation": {
            "index": (index or 0) + 1,
            "total": len(lessons),
            "previous": neighbour(-1),
            "next": neighbour(1),
            "is_last": index is not None and index == len(lessons) - 1,
        },
        "progress": progress,
        "my_progress": {
            "status": getattr(own, "status", "not_started"),
            "completed": bool(own and own.status == "completed"),
            "completed_at": iso(own.completed_at) if own else None,
            "responses": (own.responses if own else {}) or {},
            "completed_blocks": (own.completed_blocks if own else []) or [],
            "last_block_position": getattr(own, "last_block_position", 0),
        },
    }

    if payload["navigation"]["is_last"]:
        payload["completion"] = {
            "path_completed": progress["completed_path"],
            "message": clamp_text(translation.completion_message, 2000),
            "next_step": clamp_text(translation.next_step, 2000),
            "next_path": next_other_path(db, path.id, language),
        }
    return payload


def next_other_path(db: Session, path_id: int, language: str) -> dict[str, Any] | None:
    """One more published path to continue with, so a finished path never dead-ends."""
    for candidate, translation in visible_paths(db, language):
        if candidate.id == path_id:
            continue
        return {
            "slug": candidate.slug,
            "title": clamp_text(getattr(translation, "title", ""), 240),
            "lesson_count": len(visible_lessons(db, candidate.id, language)[0]),
        }
    return None


# ---------------------------------------------------------------------------
# Progress writes
# ---------------------------------------------------------------------------

def _merge_lesson_progress(target: LearnLessonProgress, source: LearnLessonProgress) -> None:
    """Fold an anonymous row into the signed-in row for the same lesson."""
    target.responses = {**(source.responses or {}), **(target.responses or {})}
    done = list(dict.fromkeys([*(target.completed_blocks or []), *(source.completed_blocks or [])]))
    target.completed_blocks = done
    target.last_block_position = max(target.last_block_position or 0, source.last_block_position or 0)
    if source.status == "completed" and target.status != "completed":
        target.status = "completed"
        target.completed_at = source.completed_at


def lesson_progress_row(
    db: Session, owner: dict[str, Any], lesson: LearnLesson, *, create: bool
) -> LearnLessonProgress | None:
    """Find - and, if needed, create or adopt - this learner's row for a lesson.

    When someone signs in after learning anonymously, their local rows are
    adopted by the account on the first write instead of being lost or
    duplicated.
    """
    user = owner["user"]
    client_id = owner["client_id"]
    row = None
    anonymous = None

    if user is not None:
        row = db.execute(
            select(LearnLessonProgress).where(
                LearnLessonProgress.user_id == user.id,
                LearnLessonProgress.lesson_id == lesson.id,
            )
        ).scalar_one_or_none()
    if client_id:
        anonymous = db.execute(
            select(LearnLessonProgress).where(
                LearnLessonProgress.client_id == client_id,
                LearnLessonProgress.lesson_id == lesson.id,
                LearnLessonProgress.user_id.is_(None),
            )
        ).scalar_one_or_none()

    if row is not None and anonymous is not None:
        _merge_lesson_progress(row, anonymous)
        db.delete(anonymous)
    elif row is None and anonymous is not None:
        if user is not None:
            anonymous.user_id = user.id
        row = anonymous
    elif row is None and create:
        row = LearnLessonProgress(
            user_id=user.id if user is not None else None,
            client_id=None if user is not None else client_id,
            path_id=lesson.path_id,
            lesson_id=lesson.id,
        )
        db.add(row)

    return row


def recompute_path_progress(
    db: Session, owner: dict[str, Any], path: LearnPath, language: str
) -> dict[str, Any]:
    """Re-derive a path's current lesson and completion from its lessons.

    Path progress is always derived, never hand-maintained, so it cannot drift
    away from what the learner actually completed.
    """
    lessons, lesson_translations = visible_lessons(db, path.id, language)
    rows = public_lesson_rows(lessons, lesson_translations)
    lesson_ids = [row["id"] for row in rows]
    progress_rows = lesson_progress_map(db, owner, lesson_ids)
    completed = {
        lesson_id for lesson_id, row in progress_rows.items() if row.status == "completed"
    }
    current = next((row for row in rows if row["id"] not in completed), None)

    user = owner["user"]
    client_id = owner["client_id"]
    row = path_progress_row(db, owner, path.id)
    if row is None and (completed or progress_rows) and (user is not None or client_id):
        row = LearnPathProgress(
            user_id=user.id if user is not None else None,
            client_id=None if user is not None else client_id,
            path_id=path.id,
        )
        db.add(row)

    if row is not None:
        # Anonymous duplicates for this device are dropped once the learner is
        # signed in: the account row is the one that follows them around.
        if user is not None and client_id:
            duplicates = db.execute(
                select(LearnPathProgress).where(
                    LearnPathProgress.path_id == path.id,
                    LearnPathProgress.client_id == client_id,
                    LearnPathProgress.id != row.id,
                )
            ).scalars().all()
            for duplicate in duplicates:
                db.delete(duplicate)
        row.current_lesson_id = current["id"] if current else None
        row.last_activity_at = datetime.utcnow()
        complete = bool(rows) and len(completed) == len(rows)
        row.completed_at = (row.completed_at or datetime.utcnow()) if complete else None

    return build_progress(
        lessons=rows,
        completed_ids=completed,
        started=row is not None or bool(progress_rows),
        current_lesson_id=row.current_lesson_id if row is not None else None,
        completed_at=row.completed_at if row is not None else None,
    )


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

def missing_translation(kind: str, language: str) -> HTTPException:
    """A 404 the frontend can explain instead of showing a blank page."""
    return HTTPException(
        status_code=404,
        detail={
            "code": "translation_missing",
            "message": (
                f"This {kind} is not available in that language yet. "
                "It may exist in the other language."
            ),
            "language": language,
        },
    )


def requested_language(request: Request) -> str:
    """Read the language from ?language= (docs) or the short ?lang= the UI uses."""
    params = request.query_params
    return clean_language(params.get("lang") or params.get("language"))


@router.get("/home")
def learn_home(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Everything the Learn landing page shows, including per-path progress."""
    language = clean_language(language)
    owner = learner(request, db)

    categories = db.execute(
        select(LearnCategory)
        .join(LearnCategoryTranslation, LearnCategoryTranslation.category_id == LearnCategory.id)
        .where(
            LearnCategory.status == "published",
            LearnCategory.deleted_at.is_(None),
            LearnCategoryTranslation.language == language,
            LearnCategoryTranslation.name != "",
        )
        .order_by(LearnCategory.display_order.asc(), LearnCategory.id.asc())
    ).scalars().unique().all()

    summaries = [
        path_summary(db, path, translation, language, owner)
        for path, translation in visible_paths(db, language)
    ]

    category_payloads = []
    for category in categories:
        payload = category_payload(category, language)
        if payload is None:
            continue
        # Only categories that actually hold a visible path are offered.
        linked = [item for item in summaries if (item["category"] or {}).get("id") == category.id]
        if not linked:
            continue
        payload["path_count"] = len(linked)
        category_payloads.append(payload)

    return {
        "language": language,
        "categories": category_payloads,
        "paths": summaries,
        "featured": [item for item in summaries if item["featured"]],
        "stats": {
            "paths": len(summaries),
            "lessons": sum(item["lesson_count"] for item in summaries),
        },
        # True when nothing is published in this language but the other
        # language has content, so the page can offer an honest way forward.
        "fallback_available": not summaries and other_language_available(db, language),
    }


@router.get("/paths")
def learn_paths(
    request: Request,
    language: str = Depends(requested_language),
    category: str | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Published paths, optionally filtered by category or a search term."""
    language = clean_language(language)
    owner = learner(request, db)
    term = clamp_text(q, 120).lower()

    summaries = []
    for path, translation in visible_paths(db, language):
        item = path_summary(db, path, translation, language, owner)
        if category and (item["category"] or {}).get("slug") != category:
            continue
        if term and term not in " ".join(
            [
                item["title"].lower(),
                item["description"].lower(),
                (item["category"] or {}).get("name", "").lower(),
                " ".join(lesson["title"].lower() for lesson in item["progress"]["lessons"]),
            ]
        ):
            continue
        summaries.append(item)

    return {
        "language": language,
        "items": summaries,
        "total": len(summaries),
        "fallback_available": not summaries and other_language_available(db, language),
    }


@router.get("/paths/{slug}")
def learn_path(
    slug: str,
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """One published path with its ordered, visible lessons."""
    language = clean_language(language)
    path = db.execute(
        select(LearnPath).where(
            LearnPath.slug == slug,
            LearnPath.status == "published",
            LearnPath.deleted_at.is_(None),
        )
    ).scalar_one_or_none()

    if path is None:
        raise HTTPException(status_code=404, detail="Path not found")

    translation = translation_map(list(path.translations)).get(language)
    if translation is None or not clamp_text(translation.title, 240):
        raise missing_translation("path", language)

    summary = path_summary(db, path, translation, language, learner(request, db))
    return {
        "path": summary,
        "progress": summary["progress"],
        "lesson_list": summary["progress"]["lessons"],
    }


@router.get("/paths/{path_slug}/lessons/{lesson_slug}")
def learn_lesson(
    path_slug: str,
    lesson_slug: str,
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """One published lesson, ready to render, with navigation and progress."""
    language = clean_language(language)
    path = db.execute(
        select(LearnPath).where(
            LearnPath.slug == path_slug,
            LearnPath.status == "published",
            LearnPath.deleted_at.is_(None),
        )
    ).scalar_one_or_none()
    if path is None:
        raise HTTPException(status_code=404, detail="Path not found")

    path_translation = translation_map(list(path.translations)).get(language)
    if path_translation is None or not clamp_text(path_translation.title, 240):
        raise missing_translation("path", language)

    lesson = db.execute(
        select(LearnLesson).where(
            LearnLesson.path_id == path.id,
            LearnLesson.slug == lesson_slug,
            LearnLesson.status == "published",
            LearnLesson.deleted_at.is_(None),
        )
    ).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "lesson_unavailable",
                "message": "This lesson is not published right now.",
            },
        )

    translation = translation_map(list(lesson.translations)).get(language)
    if translation is None or not clamp_text(translation.title, 240):
        raise missing_translation("lesson", language)

    return lesson_detail(db, path, lesson, translation, language, learner(request, db))


@router.get("/lessons/{lesson_id}")
def learn_lesson_by_id(
    lesson_id: int,
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """One published lesson addressed by id, for links that do not carry the slug.

    Same payload as the slug route, so the lesson runner does not care how the
    learner arrived: a shared id, a progress list, or a path page all work.
    """
    language = clean_language(language)
    lesson = db.get(LearnLesson, lesson_id)
    if lesson is None or lesson.deleted_at is not None or lesson.status != "published":
        raise HTTPException(
            status_code=404,
            detail={
                "code": "lesson_unavailable",
                "message": "This lesson is not published right now.",
            },
        )

    path = db.get(LearnPath, lesson.path_id)
    if path is None or path.deleted_at is not None or path.status != "published":
        raise HTTPException(
            status_code=404,
            detail={
                "code": "lesson_unavailable",
                "message": "This lesson's path is not published right now.",
            },
        )

    translation = translation_map(list(lesson.translations)).get(language)
    if translation is None or not clamp_text(translation.title, 240):
        raise missing_translation("lesson", language)

    return lesson_detail(db, path, lesson, translation, language, learner(request, db))


@router.post("/lessons/{lesson_id}/progress")
def save_lesson_progress_by_id(
    lesson_id: int,
    request: Request,
    payload: dict = Body(...),
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Save progress against a lesson id directly - the route the runner uses."""
    data = dict(payload)
    data["lesson_id"] = lesson_id
    if "completed" not in data and "status" in data:
        data["completed"] = str(data.get("status")).strip().lower() == "completed"
    if "responses" not in data and isinstance(data.get("answers"), dict):
        data["responses"] = data["answers"]
    result = save_progress(request=request, payload=data, language=language, db=db)
    return {
        **result,
        "lesson_id": lesson_id,
        "status": result["lesson_progress"]["status"],
        "completed": result["lesson_progress"]["completed"],
    }


@router.post("/progress/merge")
def merge_anonymous_progress(
    request: Request,
    client_token: str = Query(..., description="The X-Learn-Client id kept in local storage"),
    db: Session = Depends(get_db),
):
    """Merge anonymous progress from client_token into the signed-in user.

    The Learn UI keeps a random client id in local storage. When someone signs
    in part-way through a path, this moves the rows written under that id onto
    the account - lesson by lesson - instead of leaving them behind, so a
    learner never loses their place by creating an account.
    """
    owner = learner(request, db)
    user = owner["user"]
    if user is None:
        raise HTTPException(status_code=401, detail="Must be signed in to merge progress")

    client_id = (client_token or "").strip()
    if not CLIENT_ID_PATTERN.match(client_id):
        raise HTTPException(status_code=400, detail="That is not a valid Learn client id")

    merged_count = 0

    lesson_rows = db.execute(
        select(LearnLessonProgress).where(
            LearnLessonProgress.client_id == client_id,
            LearnLessonProgress.user_id.is_(None),
        )
    ).scalars().all()
    for record in lesson_rows:
        user_record = db.execute(
            select(LearnLessonProgress).where(
                LearnLessonProgress.user_id == user.id,
                LearnLessonProgress.lesson_id == record.lesson_id,
            )
        ).scalar_one_or_none()

        if user_record is not None:
            _merge_lesson_progress(user_record, record)
            db.delete(record)
        else:
            record.client_id = None
            record.user_id = user.id
        merged_count += 1

    path_rows = db.execute(
        select(LearnPathProgress).where(
            LearnPathProgress.client_id == client_id,
            LearnPathProgress.user_id.is_(None),
        )
    ).scalars().all()
    for record in path_rows:
        user_record = db.execute(
            select(LearnPathProgress).where(
                LearnPathProgress.user_id == user.id,
                LearnPathProgress.path_id == record.path_id,
            )
        ).scalar_one_or_none()

        if user_record is None:
            record.client_id = None
            record.user_id = user.id
        else:
            if record.completed_at and (
                user_record.completed_at is None or record.completed_at > user_record.completed_at
            ):
                user_record.completed_at = record.completed_at
            if record.last_activity_at and (
                user_record.last_activity_at is None
                or record.last_activity_at > user_record.last_activity_at
            ):
                user_record.last_activity_at = record.last_activity_at
            if user_record.current_lesson_id is None:
                user_record.current_lesson_id = record.current_lesson_id
            db.delete(record)
        merged_count += 1

    # Analytics rows move too, so the admin overview still counts this learner.
    db.execute(
        update(LearnEvent)
        .where(LearnEvent.client_id == client_id, LearnEvent.user_id.is_(None))
        .values(user_id=user.id)
    )

    db.commit()
    return {"merged": merged_count}


@router.get("/progress/my")
def get_my_progress(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Everything this learner has done, for "continue where you left off".

    Answers for signed-out visitors too (from their ``X-Learn-Client`` id),
    because keeping your place should never require an account.
    """
    language = clean_language(language)
    owner = learner(request, db)
    empty: dict[str, Any] = {
        "completed_lesson_ids": [],
        "in_progress_lesson_ids": [],
        "paths": [],
        "totals": {"completed_lessons": 0, "in_progress_lessons": 0},
    }

    condition = _learner_filter(LearnLessonProgress, owner)
    if condition is None:
        return empty

    records = db.execute(select(LearnLessonProgress).where(condition)).scalars().all()
    completed = [record.lesson_id for record in records if record.status == "completed"]
    in_progress = [record.lesson_id for record in records if record.status != "completed"]
    completed_ids = set(completed)

    # One entry per path the learner touched, in the same progress shape the
    # path pages use, so the UI renders it the same way everywhere.
    rows: list[dict[str, Any]] = []
    for path_id in sorted({record.path_id for record in records}):
        path = db.get(LearnPath, path_id)
        if path is None or path.deleted_at is not None:
            continue
        lessons, lesson_translations = visible_lessons(db, path_id, language)
        translation = translation_map(list(path.translations)).get(language)
        path_row = path_progress_row(db, owner, path_id)
        rows.append({
            "path_id": path_id,
            "slug": path.slug,
            "title": clamp_text(getattr(translation, "title", ""), 240) or path.slug,
            "progress": build_progress(
                lessons=public_lesson_rows(lessons, lesson_translations),
                completed_ids={
                    record.lesson_id for record in records
                    if record.path_id == path_id and record.lesson_id in completed_ids
                },
                started=True,
                current_lesson_id=path_row.current_lesson_id if path_row else None,
                completed_at=path_row.completed_at if path_row else None,
            ),
        })
    rows.sort(key=lambda item: (-item["progress"]["percent"], item["title"].lower()))

    return {
        "completed_lesson_ids": completed,
        "in_progress_lesson_ids": in_progress,
        "paths": rows,
        "totals": {
            "completed_lessons": len(completed),
            "in_progress_lessons": len(in_progress),
            "paths_started": len(rows),
        },
    }


@router.post("/progress")
def save_progress(
    request: Request,
    payload: dict = Body(...),
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Record what a learner did: reading position, reflection, practice, done.

    Only the keys present in the body are changed, so the page can save a
    reflection without having to restate the whole progress record.
    """
    language = clean_language(language)
    lesson_id = clean_id(payload.get("lesson_id"))
    if not lesson_id:
        raise HTTPException(status_code=400, detail="lesson_id is required")

    lesson = db.get(LearnLesson, lesson_id)
    if lesson is None or lesson.deleted_at is not None or lesson.status != "published":
        raise HTTPException(status_code=404, detail="Lesson not found")

    path = db.get(LearnPath, lesson.path_id)
    if path is None or path.deleted_at is not None or path.status != "published":
        raise HTTPException(status_code=404, detail="Lesson not found")

    owner = learner(request, db)
    if owner["user"] is None and not owner["client_id"]:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "learner_unknown",
                "message": "Send an X-Learn-Client header or sign in to save progress.",
            },
        )

    row = lesson_progress_row(db, owner, lesson, create=True)
    if row is None:  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Progress could not be saved")

    if "responses" in payload and isinstance(payload["responses"], dict):
        merged = dict(row.responses or {})
        for key, value in list(payload["responses"].items())[:60]:
            block_key = str(clean_id(key) or "")[:20]
            if not block_key:
                continue
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                merged[block_key] = clean_int(value, 0, 0, 20)
            elif isinstance(value, str):
                text = clamp_text(value, 2000)
                if text:
                    merged[block_key] = text
                else:
                    merged.pop(block_key, None)
        row.responses = merged

    if "completed_blocks" in payload and isinstance(payload["completed_blocks"], list):
        row.completed_blocks = [
            block_id for block_id in (clean_id(item) for item in payload["completed_blocks"][:120])
            if block_id
        ]

    if "last_block_position" in payload:
        row.last_block_position = clean_int(payload.get("last_block_position"), 0, 0, 500)

    if "completed" in payload:
        completed = clean_bool(payload.get("completed"))
        row.status = "completed" if completed else "in_progress"
        row.completed_at = datetime.utcnow() if completed else None

    if row.id is None:
        db.flush()

    if row.status == "completed":
        record_event(
            db,
            event_type="lesson_complete",
            owner=owner,
            language=language,
            path_id=path.id,
            lesson_id=lesson.id,
        )

    db.commit()
    db.refresh(row)
    progress = recompute_path_progress(db, owner, path, language)
    db.commit()

    return {
        "lesson_progress": {
            "lesson_id": lesson.id,
            "status": row.status,
            "completed": row.status == "completed",
            "completed_at": iso(row.completed_at),
            "responses": row.responses or {},
            "completed_blocks": row.completed_blocks or [],
            "last_block_position": row.last_block_position,
        },
        "progress": progress,
    }


def record_event(
    db: Session,
    *,
    event_type: str,
    owner: dict[str, Any],
    language: str,
    path_id: int | None = None,
    lesson_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Store a view/completion event. Analytics must never break a lesson."""
    if event_type not in EVENT_TYPES:
        return
    user = owner.get("user")
    db.add(LearnEvent(
        event_type=event_type,
        path_id=path_id,
        lesson_id=lesson_id,
        language=clean_language(language),
        user_id=user.id if user is not None else None,
        client_id=owner.get("client_id"),
        event_metadata=metadata or {},
    ))


@router.post("/events", status_code=202)
def learn_event(
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Record a view event for the Learn overview.

    Best-effort by design: an unknown id is dropped rather than reported, so a
    tracking call can never interrupt someone reading a lesson.
    """
    event_type = clamp_text(payload.get("event_type"), 30).lower()
    if event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown Learn event type")

    path_id = clean_id(payload.get("path_id"))
    lesson_id = clean_id(payload.get("lesson_id"))
    if lesson_id and db.get(LearnLesson, lesson_id) is None:
        lesson_id = None
    if path_id and db.get(LearnPath, path_id) is None:
        path_id = None

    owner = learner(request, db)
    raw_metadata = payload.get("metadata")
    metadata: dict[str, Any] = {}
    if isinstance(raw_metadata, dict):
        for key, value in list(raw_metadata.items())[:10]:
            metadata[clamp_text(key, 40)] = clamp_text(value, 200)

    record_event(
        db,
        event_type=event_type,
        owner=owner,
        language=payload.get("language"),
        path_id=path_id,
        lesson_id=lesson_id,
        metadata=metadata,
    )
    db.commit()
    return {"recorded": True}


@router.get("/search")
def learn_search(
    request: Request,
    q: str = Query(""),
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Search published Learn content from the existing Learn pages.

    The site's other search endpoints are per-section, so Learn exposes the
    same idea here rather than standing up a second search product.
    """
    language = clean_language(language)
    term = clamp_text(q, 120).lower()
    if not term:
        return {"query": "", "paths": [], "lessons": [], "categories": []}

    paths = []
    lessons = []
    for path, translation in visible_paths(db, language):
        if term in translation.title.lower() or term in (translation.description or "").lower():
            paths.append({
                "slug": path.slug,
                "title": clamp_text(translation.title, 240),
                "description": clamp_text(translation.description, 400),
            })
        path_lessons, path_translations = visible_lessons(db, path.id, language)
        for lesson in path_lessons:
            row = path_translations.get(lesson.id)
            if term in (row.title or "").lower() or term in (row.summary or "").lower():
                lessons.append({
                    "path_slug": path.slug,
                    "path_title": clamp_text(translation.title, 240),
                    "slug": lesson.slug,
                    "title": clamp_text(row.title, 240),
                    "summary": clamp_text(row.summary, 400),
                })

    categories = [
        payload for payload in (
            category_payload(category, language)
            for category in db.execute(
                select(LearnCategory).where(
                    LearnCategory.status == "published", LearnCategory.deleted_at.is_(None)
                )
            ).scalars().all()
        )
        if payload and term in f"{payload['name']} {payload['description']}".lower()
    ]

    return {
        "query": term,
        "paths": paths[:20],
        "lessons": lessons[:40],
        "categories": categories[:10],
    }

