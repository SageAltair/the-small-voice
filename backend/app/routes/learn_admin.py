"""Admin Learn API: paths, lessons, the lesson builder and publishing.

Everything here requires the existing admin role. The admin document shapes
are deliberately explicit (``{path, translations, lessons}`` /
``{lesson, translations, blocks}``) so the builder can send a whole lesson back
in one request and the server can write it in a single transaction - a save
either lands completely or not at all, which is what stops content from
appearing saved and then vanishing after a refresh.
"""

import json
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.learn_content import (
    BLOCK_TYPES,
    CATEGORY_STATUSES,
    LANGUAGES,
    LESSON_STATUSES,
    MAX_BLOCKS,
    PATH_LEVELS,
    PATH_STATUSES,
    SECTIONS,
    SECTION_LABELS,
    clean_bool,
    clean_id,
    clean_int,
    clean_language,
    clean_media_url,
    clean_slug,
    clamp_text,
    iso,
    lesson_validation,
    normalize_block_config,
    normalize_block_data,
    normalize_block_type,
    normalize_section,
    now,
    path_validation,
    serialize_admin_category,
    serialize_admin_lesson,
    serialize_admin_lesson_row,
    serialize_admin_path,
    serialize_admin_path_row,
    serialize_all_lesson_translations,
    serialize_all_path_translations,
)
from app.models.learn import (
    LearnCategory,
    LearnCategoryTranslation,
    LearnEvent,
    LearnLesson,
    LearnLessonBlock,
    LearnLessonBlockTranslation,
    LearnLessonProgress,
    LearnLessonTranslation,
    LearnPath,
    LearnPathProgress,
    LearnPathTranslation,
)
from app.models.user import User
from app.routes.experiences import require_admin
from app.routes.learn import lesson_detail, visible_lessons

router = APIRouter(prefix="/admin/learn", tags=["Learn (admin)"])

MAX_DOCUMENT_BYTES = 512 * 1024


def _validate_document(payload: dict[str, Any]) -> None:
    """Reject a document that is obviously too large for one lesson or path."""
    try:
        size = len(json.dumps(payload, default=str).encode("utf-8"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="The document could not be read.")
    if size > MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status_code=413,
            detail="This document is too large to save. Split it into more lessons.",
        )


def validation_failed(validation: dict[str, Any], action: str) -> HTTPException:
    """A content-validation error that carries every actionable message.

    422 rather than 400: the request itself was well formed, the content it
    describes is not ready, and the admin UI shows ``errors`` field by field.
    """
    errors = validation.get("errors") or []
    message = " ".join(error["message"] for error in errors[:3]) or f"This content cannot {action} yet."
    return HTTPException(
        status_code=422,
        detail={
            "code": "validation_failed",
            "message": message,
            "errors": errors,
            "warnings": validation.get("warnings") or [],
        },
    )


def get_path_or_404(db: Session, path_id: int) -> LearnPath:
    path = db.get(LearnPath, path_id)
    if path is None or path.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Path not found")
    return path


def get_lesson_or_404(db: Session, lesson_id: int) -> LearnLesson:
    lesson = db.get(LearnLesson, lesson_id)
    if lesson is None or lesson.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


def unique_path_slug(db: Session, value: Any, *, exclude_id: int | None = None, fallback: str = "") -> str:
    base = clean_slug(value) or clean_slug(fallback) or "path"
    candidate = base
    suffix = 2
    while True:
        existing = db.execute(
            select(LearnPath.id).where(LearnPath.slug == candidate)
        ).scalar_one_or_none()
        if existing is None or existing == exclude_id:
            return candidate
        candidate = f"{base[:170]}-{suffix}"
        suffix += 1


def unique_lesson_slug(
    db: Session, path_id: int, value: Any, *, exclude_id: int | None = None, fallback: str = ""
) -> str:
    base = clean_slug(value) or clean_slug(fallback) or "lesson"
    candidate = base
    suffix = 2
    while True:
        existing = db.execute(
            select(LearnLesson.id).where(
                LearnLesson.path_id == path_id, LearnLesson.slug == candidate
            )
        ).scalar_one_or_none()
        if existing is None or existing == exclude_id:
            return candidate
        candidate = f"{base[:170]}-{suffix}"
        suffix += 1


def unique_category_slug(db: Session, value: Any, *, exclude_id: int | None = None) -> str:
    base = clean_slug(value) or "category"
    candidate = base
    suffix = 2
    while True:
        existing = db.execute(
            select(LearnCategory.id).where(LearnCategory.slug == candidate)
        ).scalar_one_or_none()
        if existing is None or existing == exclude_id:
            return candidate
        candidate = f"{base[:100]}-{suffix}"
        suffix += 1


def reindex_lessons(db: Session, path: LearnPath) -> None:
    """Guarantee unique, gap-free lesson positions inside a path."""
    lessons = db.execute(
        select(LearnLesson)
        .where(LearnLesson.path_id == path.id, LearnLesson.deleted_at.is_(None))
        .order_by(LearnLesson.position.asc(), LearnLesson.id.asc())
    ).scalars().all()
    for index, lesson in enumerate(lessons):
        lesson.position = index


# ---------------------------------------------------------------------------
# Reference data for the builder
# ---------------------------------------------------------------------------

@router.get("/block-types")
def list_block_types(user: User = Depends(require_admin)):
    """The block catalogue, so the builder and the server always agree."""
    return {
        "sections": [{"id": section, "label": SECTION_LABELS[section]} for section in SECTIONS],
        "block_types": [
            {
                "id": block_type,
                "label": definition["label"],
                "group": definition["group"],
                "section": definition["section"],
                "fields": list(definition["fields"]),
                "config": list(definition["config"]),
                "needs": list(definition["needs"]),
            }
            for block_type, definition in BLOCK_TYPES.items()
        ],
        "languages": list(LANGUAGES),
        "levels": list(PATH_LEVELS),
    }


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------

def _count(db: Session, model, *conditions) -> int:
    return db.execute(select(func.count()).select_from(model).where(*conditions)).scalar_one()


@router.get("/overview")
def learn_overview(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """A compact picture of Learn: what is published, what needs work, what is used."""
    live_paths = (LearnPath.deleted_at.is_(None),)
    live_lessons = (LearnLesson.deleted_at.is_(None),)

    totals = {
        "paths": _count(db, LearnPath, *live_paths),
        "published_paths": _count(db, LearnPath, *live_paths, LearnPath.status == "published"),
        "draft_paths": _count(db, LearnPath, *live_paths, LearnPath.status != "published"),
        "lessons": _count(db, LearnLesson, *live_lessons),
        "published_lessons": _count(
            db, LearnLesson, *live_lessons, LearnLesson.status == "published"
        ),
        "draft_lessons": _count(db, LearnLesson, *live_lessons, LearnLesson.status != "published"),
        "blocks": _count(db, LearnLessonBlock),
        "categories": _count(db, LearnCategory, LearnCategory.deleted_at.is_(None)),
        "categories_published": _count(
            db, LearnCategory, LearnCategory.deleted_at.is_(None), LearnCategory.status == "published"
        ),
    }

    language_totals = {}
    for language in LANGUAGES:
        language_totals[language] = {
            "paths": _count(
                db,
                LearnPathTranslation,
                LearnPathTranslation.language == language,
                LearnPathTranslation.title != "",
            ),
            "lessons": _count(
                db,
                LearnLessonTranslation,
                LearnLessonTranslation.language == language,
                LearnLessonTranslation.title != "",
            ),
            "preferred": _count(db, LearnPath, *live_paths, LearnPath.language == language),
        }

    events = dict(
        db.execute(select(LearnEvent.event_type, func.count()).group_by(LearnEvent.event_type)).all()
    )
    language_usage = dict(
        db.execute(select(LearnEvent.language, func.count()).group_by(LearnEvent.language)).all()
    )

    return {
        "totals": totals,
        "languages": language_totals,
        "analytics": {
            "path_views": events.get("path_view", 0),
            "lesson_views": events.get("lesson_view", 0),
            "lesson_completions": events.get("lesson_complete", 0),
            "path_completions": events.get("path_complete", 0),
            "practice_done": events.get("practice_done", 0),
            "language_usage": [
                {"language": language, "events": total} for language, total in language_usage.items()
            ],
            "top_lessons": _top_lessons(db),
        },
        "progress": {
            "learners": _count(db, LearnLessonProgress),
            "completed_lessons": _count(
                db, LearnLessonProgress, LearnLessonProgress.status == "completed"
            ),
            "path_records": _count(db, LearnPathProgress),
        },
        "attention": _attention(db),
        "recent": {
            "paths": [
                serialize_admin_path_row(path)
                for path in db.execute(
                    select(LearnPath).where(*live_paths)
                    .order_by(LearnPath.updated_at.desc()).limit(5)
                ).scalars().all()
            ],
            "lessons": [
                serialize_admin_lesson_row(lesson)
                for lesson in db.execute(
                    select(LearnLesson).where(*live_lessons)
                    .order_by(LearnLesson.updated_at.desc()).limit(5)
                ).scalars().all()
            ],
        },
    }


def _top_lessons(db: Session) -> list[dict[str, Any]]:
    """Most-viewed lessons, with how often they are actually finished."""
    rows = db.execute(
        select(LearnEvent.lesson_id, func.count())
        .where(LearnEvent.lesson_id.is_not(None), LearnEvent.event_type == "lesson_view")
        .group_by(LearnEvent.lesson_id)
        .order_by(func.count().desc())
        .limit(5)
    ).all()

    top = []
    for lesson_id, views in rows:
        lesson = db.get(LearnLesson, lesson_id)
        if lesson is None:
            continue
        translations = serialize_all_lesson_translations(lesson)
        path = db.get(LearnPath, lesson.path_id)
        path_title = ""
        if path is not None:
            path_title = serialize_all_path_translations(path)["en"]["title"] or path.slug
        top.append({
            "lesson_id": lesson.id,
            "path_id": lesson.path_id,
            "path_title": path_title,
            "title": translations["en"]["title"] or translations["sw"]["title"] or lesson.slug,
            "views": views,
            "completions": db.execute(
                select(func.count()).select_from(LearnEvent).where(
                    LearnEvent.lesson_id == lesson.id,
                    LearnEvent.event_type == "lesson_complete",
                )
            ).scalar_one(),
        })
    return top


def _attention(db: Session) -> list[dict[str, Any]]:
    """Draft content, so nothing quietly stays invisible."""
    items = []
    draft_paths = db.execute(
        select(LearnPath)
        .where(LearnPath.deleted_at.is_(None), LearnPath.status != "published")
        .order_by(LearnPath.updated_at.desc())
        .limit(5)
    ).scalars().all()
    for path in draft_paths:
        items.append({
            "kind": "path",
            "id": path.id,
            "title": serialize_admin_path_row(path)["title"] or path.slug,
            "status": path.status,
            "message": "Not visible to learners yet.",
        })

    draft_lessons = db.execute(
        select(LearnLesson)
        .where(LearnLesson.deleted_at.is_(None), LearnLesson.status != "published")
        .order_by(LearnLesson.updated_at.desc())
        .limit(5)
    ).scalars().all()
    for lesson in draft_lessons:
        items.append({
            "kind": "lesson",
            "id": lesson.id,
            "title": serialize_admin_lesson_row(lesson)["title"] or lesson.slug,
            "status": lesson.status,
            "message": "Draft lesson stays hidden until it is published.",
        })
    return items


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

def apply_category_payload(db: Session, category: LearnCategory, payload: dict[str, Any]) -> None:
    """Write a category document, including both language versions."""
    category.slug = unique_category_slug(
        db,
        payload.get("slug") or (payload.get("translations") or {}).get("en", {}).get("name"),
        exclude_id=category.id,
    )
    icon = clamp_text(payload.get("icon"), 40)
    category.icon = icon or None
    category.display_order = clean_int(payload.get("display_order"), 0, 0, 999)
    status = clamp_text(payload.get("status"), 20).lower()
    category.status = status if status in CATEGORY_STATUSES else "draft"

    translations = payload.get("translations")
    rows = {row.language: row for row in category.translations}
    if isinstance(translations, dict):
        for language in LANGUAGES:
            source = translations.get(language)
            if not isinstance(source, dict):
                continue
            name = clamp_text(source.get("name"), 240)
            description = clamp_text(source.get("description"), 2000)
            row = rows.get(language)
            if not name and not description:
                if row is not None:
                    db.delete(row)
                continue
            if row is None:
                row = LearnCategoryTranslation(language=language)
                category.translations.append(row)
            row.name = name
            row.description = description or None


@router.get("/categories")
def list_categories(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Every category with both language names and how many paths use it."""
    categories = db.execute(
        select(LearnCategory)
        .where(LearnCategory.deleted_at.is_(None))
        .order_by(LearnCategory.display_order.asc(), LearnCategory.id.asc())
    ).scalars().all()

    counts = dict(
        db.execute(
            select(LearnPath.category_id, func.count())
            .where(LearnPath.deleted_at.is_(None), LearnPath.category_id.is_not(None))
            .group_by(LearnPath.category_id)
        ).all()
    )
    return {
        "items": [
            serialize_admin_category(category, counts.get(category.id, 0)) for category in categories
        ]
    }


@router.post("/categories", status_code=201)
def create_category(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    _validate_document(payload)
    seed_name = (
        payload.get("slug")
        or (payload.get("translations") or {}).get("en", {}).get("name")
        or (payload.get("translations") or {}).get("sw", {}).get("name")
    )
    category = LearnCategory(slug=unique_category_slug(db, seed_name))
    db.add(category)
    db.flush()
    apply_category_payload(db, category, payload)
    db.flush()
    if not any(row.name for row in category.translations):
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="A category needs a name in at least one language.",
        )
    db.commit()
    db.refresh(category)
    return serialize_admin_category(category)


@router.put("/categories/{category_id}")
def update_category(
    category_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    _validate_document(payload)
    category = db.get(LearnCategory, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Category not found")
    apply_category_payload(db, category, payload)
    db.flush()
    if not any(row.name for row in category.translations):
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="A category needs a name in at least one language.",
        )
    db.commit()
    db.refresh(category)
    count = db.execute(
        select(func.count()).select_from(LearnPath).where(
            LearnPath.category_id == category.id, LearnPath.deleted_at.is_(None)
        )
    ).scalar_one()
    return serialize_admin_category(category, count)


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Delete a category only when no path depends on it.

    The foreign key would otherwise silently strip the category from every
    path, so the admin is told to reassign them first instead.
    """
    category = db.get(LearnCategory, category_id)
    if category is None or category.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Category not found")

    used = db.execute(
        select(func.count()).select_from(LearnPath).where(
            LearnPath.category_id == category.id, LearnPath.deleted_at.is_(None)
        )
    ).scalar_one()
    if used:
        raise HTTPException(
            status_code=409,
            detail=f"{used} path(s) still use this category. Reassign them first.",
        )

    db.delete(category)
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def path_validation_for(path: LearnPath) -> dict[str, Any]:
    payload = serialize_admin_path(path)
    return payload["validation"]


def apply_path_payload(db: Session, path: LearnPath, payload: dict[str, Any]) -> None:
    """Write a path document (fields + both translations) but do not commit."""
    source = payload.get("path") if isinstance(payload.get("path"), dict) else payload

    proposed_slug = source.get("slug")
    if proposed_slug:
        path.slug = unique_path_slug(db, proposed_slug, exclude_id=path.id)

    category_id = clean_id(source.get("category_id"))
    if category_id:
        category = db.get(LearnCategory, category_id)
        if category is None or category.deleted_at is not None:
            raise HTTPException(status_code=400, detail="That category no longer exists.")
        path.category_id = category.id
    else:
        path.category_id = None

    cover = clean_media_url(source.get("cover_url"))
    path.cover_url = cover or None
    level = clamp_text(source.get("level"), 20).lower()
    path.level = level if level in PATH_LEVELS else "beginner"
    path.estimated_minutes = clean_int(source.get("estimated_minutes"), 0, 0, 1200)
    path.language = clean_language(source.get("language"), path.language)
    path.featured = clean_bool(source.get("featured"), path.featured)
    path.display_order = clean_int(source.get("display_order"), path.display_order, 0, 999)

    translations = payload.get("translations")
    rows = {row.language: row for row in path.translations}
    if isinstance(translations, dict):
        for language in LANGUAGES:
            entry = translations.get(language)
            if not isinstance(entry, dict):
                continue
            title = clamp_text(entry.get("title"), 240)
            description = clamp_text(entry.get("description"), 4000)
            row = rows.get(language)
            if not title and not description:
                if row is not None:
                    db.delete(row)
                continue
            if row is None:
                row = LearnPathTranslation(path_id=path.id, language=language)
                db.add(row)
            row.title = title
            row.description = description or None

    lesson_order = payload.get("lesson_order")
    if isinstance(lesson_order, list):
        order = [clean_id(item) for item in lesson_order]
        lessons = db.execute(
            select(LearnLesson).where(
                LearnLesson.path_id == path.id, LearnLesson.deleted_at.is_(None)
            )
        ).scalars().all()
        by_id = {lesson.id: lesson for lesson in lessons}
        position = 0
        for lesson_id in order:
            lesson = by_id.pop(lesson_id, None)
            if lesson is None:
                continue
            lesson.position = position
            position += 1
        for lesson in sorted(by_id.values(), key=lambda item: item.position):
            lesson.position = position
            position += 1


@router.get("/paths")
def list_admin_paths(
    status: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin path list, including drafts and unpublished paths."""
    query = select(LearnPath).where(LearnPath.deleted_at.is_(None))
    if status in PATH_STATUSES:
        query = query.where(LearnPath.status == status)
    paths = db.execute(
        query.order_by(LearnPath.display_order.asc(), LearnPath.updated_at.desc())
    ).scalars().all()

    term = clamp_text(q, 120).lower()
    rows = [serialize_admin_path_row(path) for path in paths]
    if term:
        rows = [
            row for row in rows
            if term in " ".join([
                row["title"].lower(),
                row["slug"].lower(),
                row["translations"]["en"]["title"].lower(),
                row["translations"]["sw"]["title"].lower(),
            ])
        ]
    return {"items": rows, "total": len(rows)}


@router.post("/paths", status_code=201)
def create_path(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Create a draft path. Nothing is public until it is explicitly published."""
    _validate_document(payload)
    language = clean_language(payload.get("language"), "en")
    title = clamp_text(payload.get("title"), 240)
    path = LearnPath(
        slug="",
        language=language,
        status="draft",
        owner_id=user.id,
    )
    path.slug = unique_path_slug(db, payload.get("slug") or title, fallback=title)
    db.add(path)
    db.flush()

    if title:
        db.add(LearnPathTranslation(
            path_id=path.id, language=language, title=title,
            description=clamp_text(payload.get("description"), 4000) or None,
        ))
    db.commit()
    db.refresh(path)
    return serialize_admin_path(path)


@router.get("/paths/{path_id}")
def get_admin_path(path_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """The full editable document: both translations, lesson order, validation."""
    return serialize_admin_path(get_path_or_404(db, path_id))


@router.put("/paths/{path_id}")
def save_path(
    path_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Save a whole path in one transaction (fields, translations, lesson order)."""
    _validate_document(payload)
    path = get_path_or_404(db, path_id)
    apply_path_payload(db, path, payload)
    reindex_lessons(db, path)

    source = payload.get("path") if isinstance(payload.get("path"), dict) else payload
    requested_status = clamp_text(source.get("status"), 20).lower()
    if requested_status in PATH_STATUSES:
        if requested_status == "published":
            db.flush()
            validation = path_validation_for(path)
            if not validation["ready"]:
                db.rollback()
                raise validation_failed(validation, "be published")
            path.published_at = path.published_at or now()
        path.status = requested_status

    db.commit()
    db.refresh(path)
    return serialize_admin_path(path)


@router.post("/paths/{path_id}/publish")
def publish_path(path_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Publish a path, but only if all validation rules are satisfied."""
    path = get_path_or_404(db, path_id)
    validation = path_validation_for(path)
    if not validation["ready"]:
        raise validation_failed(validation, "be published")
    path.status = "published"
    path.published_at = path.published_at or now()
    db.commit()
    db.refresh(path)
    return serialize_admin_path(path)


@router.post("/paths/{path_id}/archive")
def archive_path(path_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Hide a path from learners without deleting any learner history."""
    path = get_path_or_404(db, path_id)
    path.status = "unpublished"
    db.commit()
    db.refresh(path)
    return serialize_admin_path(path)


@router.post("/paths/{path_id}/duplicate", status_code=201)
def duplicate_path(path_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Deep clone a path and all of its lessons and blocks as a draft copy."""
    source_path = get_path_or_404(db, path_id)

    new_path = LearnPath(
        slug=unique_path_slug(db, f"{source_path.slug}-copy"),
        category_id=source_path.category_id,
        cover_url=source_path.cover_url,
        level=source_path.level,
        estimated_minutes=source_path.estimated_minutes,
        language=source_path.language,
        status="draft",
        owner_id=user.id,
    )
    db.add(new_path)
    db.flush()

    for row in source_path.translations:
        db.add(LearnPathTranslation(
            path_id=new_path.id,
            language=row.language,
            title=f"{row.title} (Copy)" if row.title else "",
            description=row.description,
        ))

    source_lessons = db.execute(
        select(LearnLesson).where(
            LearnLesson.path_id == source_path.id, LearnLesson.deleted_at.is_(None)
        ).order_by(LearnLesson.position.asc(), LearnLesson.id.asc())
    ).scalars().all()

    for old_lesson in source_lessons:
        new_lesson = LearnLesson(
            path_id=new_path.id,
            slug=unique_lesson_slug(db, new_path.id, old_lesson.slug),
            position=old_lesson.position,
            estimated_minutes=old_lesson.estimated_minutes,
            status="draft",
        )
        db.add(new_lesson)
        db.flush()

        for row in old_lesson.translations:
            db.add(LearnLessonTranslation(
                lesson_id=new_lesson.id,
                language=row.language,
                title=row.title,
                summary=row.summary,
                objective_before=row.objective_before,
                objective_after=row.objective_after,
                objective_action=row.objective_action,
                next_step=row.next_step,
                completion_message=row.completion_message,
            ))

        for old_block in old_lesson.blocks:
            new_block = LearnLessonBlock(
                lesson_id=new_lesson.id,
                block_type=old_block.block_type,
                section=old_block.section,
                position=old_block.position,
                config=dict(old_block.config or {}),
            )
            db.add(new_block)
            db.flush()

            for row in old_block.translations:
                db.add(LearnLessonBlockTranslation(
                    block_id=new_block.id,
                    language=row.language,
                    data=dict(row.data or {}),
                ))

    db.commit()
    db.refresh(new_path)
    return serialize_admin_path(new_path)


@router.delete("/paths/{path_id}")
def delete_path(path_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Soft delete the path and all its lessons so learner history is preserved."""
    path = get_path_or_404(db, path_id)
    timestamp = now()
    path.deleted_at = timestamp
    for lesson in path.lessons:
        if lesson.deleted_at is None:
            lesson.deleted_at = timestamp
    db.commit()
    return {"deleted": True, "id": path.id}


# ---------------------------------------------------------------------------
# Lessons
# ---------------------------------------------------------------------------

def lesson_validation_for(lesson: LearnLesson) -> dict[str, Any]:
    payload = serialize_admin_lesson(lesson)
    return payload["validation"]


def apply_lesson_payload(
    db: Session, lesson: LearnLesson, payload: dict[str, Any], path: LearnPath
) -> None:
    """Write lesson fields, translations, and its entire block list."""
    source = payload.get("lesson") if isinstance(payload.get("lesson"), dict) else payload

    proposed_slug = source.get("slug")
    if proposed_slug:
        lesson.slug = unique_lesson_slug(db, path.id, proposed_slug, exclude_id=lesson.id)

    lesson.estimated_minutes = clean_int(source.get("estimated_minutes"), 0, 0, 600)
    if "position" in source and source.get("position") is not None:
        lesson.position = clean_int(source.get("position"), lesson.position, 0, 999)

    translations = payload.get("translations")
    rows = {row.language: row for row in lesson.translations}
    if isinstance(translations, dict):
        for language in LANGUAGES:
            entry = translations.get(language)
            if not isinstance(entry, dict):
                continue
            title = clamp_text(entry.get("title"), 240)
            # Older drafts of the builder sent "description"/"subtitle".
            summary = clamp_text(
                entry.get("summary") or entry.get("description") or entry.get("subtitle")
            )
            objective_before = clamp_text(entry.get("objective_before"))
            objective_after = clamp_text(entry.get("objective_after"))
            objective_action = clamp_text(entry.get("objective_action"))
            next_step = clamp_text(entry.get("next_step"))
            completion_message = clamp_text(entry.get("completion_message"))
            row = rows.get(language)
            if not any([
                title, summary, objective_before, objective_after,
                objective_action, next_step, completion_message,
            ]):
                if row is not None:
                    db.delete(row)
                continue
            if row is None:
                row = LearnLessonTranslation(lesson_id=lesson.id, language=language)
                db.add(row)
            row.title = title
            row.summary = summary or None
            row.objective_before = objective_before or None
            row.objective_after = objective_after or None
            row.objective_action = objective_action or None
            row.next_step = next_step or None
            row.completion_message = completion_message or None

    if "blocks" in payload and isinstance(payload.get("blocks"), list):
        _replace_lesson_blocks(db, lesson, payload.get("blocks") or [])


def _replace_lesson_blocks(
    db: Session, lesson: LearnLesson, blocks_data: list[dict[str, Any]]
) -> None:
    """Synchronize the lesson's blocks with the client's list."""
    existing_blocks = {block.id: block for block in lesson.blocks}
    kept_ids = set()

    for position, raw_block in enumerate(blocks_data):
        if not isinstance(raw_block, dict):
            continue

        raw_type = clamp_text(raw_block.get("block_type"), 60)
        block_type = normalize_block_type(raw_type)
        clean_config = normalize_block_config(block_type, raw_block.get("config"))
        section = normalize_section(raw_block.get("section"), block_type)

        block_id = clean_id(raw_block.get("id"))
        block = existing_blocks.get(block_id)
        if block is None:
            block = LearnLessonBlock(
                lesson_id=lesson.id,
                block_type=block_type,
                section=section,
                position=position,
                config=clean_config,
            )
            db.add(block)
            db.flush()
        else:
            block.block_type = block_type
            block.section = section
            block.position = position
            block.config = clean_config
        kept_ids.add(block.id)

        existing_translations = {row.language: row for row in block.translations}
        raw_translations = raw_block.get("translations") or {}
        for language in LANGUAGES:
            entry = raw_translations.get(language) or {}
            content = normalize_block_data(block_type, entry.get("data") or entry.get("content"))
            row = existing_translations.get(language)
            if row is None:
                row = LearnLessonBlockTranslation(
                    block_id=block.id, language=language, data=content
                )
                db.add(row)
            else:
                row.data = content

    for block_id, block in existing_blocks.items():
        if block_id not in kept_ids:
            db.delete(block)


@router.get("/paths/{path_id}/lessons")
def list_admin_lessons(
    path_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)
):
    path = get_path_or_404(db, path_id)
    lessons = db.execute(
        select(LearnLesson).where(
            LearnLesson.path_id == path.id, LearnLesson.deleted_at.is_(None)
        ).order_by(LearnLesson.position.asc(), LearnLesson.id.asc())
    ).scalars().all()
    return {"items": [serialize_admin_lesson_row(lesson) for lesson in lessons]}


@router.post("/paths/{path_id}/lessons", status_code=201)
def create_lesson(
    path_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Add a new draft lesson to the end of a path."""
    _validate_document(payload)
    path = get_path_or_404(db, path_id)
    title = clamp_text(payload.get("title"), 240)
    language = clean_language(payload.get("language"), path.language)

    last_position = db.execute(
        select(func.max(LearnLesson.position)).where(
            LearnLesson.path_id == path.id, LearnLesson.deleted_at.is_(None)
        )
    ).scalar_one_or_none()
    position = 0 if last_position is None else last_position + 1

    lesson = LearnLesson(
        path_id=path.id,
        slug="",
        position=position,
        estimated_minutes=clean_int(payload.get("estimated_minutes"), 0, 0, 600),
        status="draft",
    )
    lesson.slug = unique_lesson_slug(db, path.id, payload.get("slug") or title, fallback=title)
    db.add(lesson)
    db.flush()

    if title:
        db.add(LearnLessonTranslation(
            lesson_id=lesson.id,
            language=language,
            title=title,
            summary=(
                clamp_text(payload.get("summary") or payload.get("description")) or None
            ),
        ))

    db.commit()
    db.refresh(lesson)
    return serialize_admin_lesson(lesson)


@router.get("/lessons/{lesson_id}")
def get_admin_lesson(
    lesson_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)
):
    """Full lesson document: both translations, blocks in position order, validation."""
    return serialize_admin_lesson(get_lesson_or_404(db, lesson_id))


@router.put("/lessons/{lesson_id}")
def save_lesson(
    lesson_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Save an entire lesson (metadata, both translations, and full block list)."""
    _validate_document(payload)
    lesson = get_lesson_or_404(db, lesson_id)
    path = db.get(LearnPath, lesson.path_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Parent path no longer exists.")

    apply_lesson_payload(db, lesson, payload, path)

    source = payload.get("lesson") if isinstance(payload.get("lesson"), dict) else payload
    requested_status = clamp_text(source.get("status"), 20).lower()
    if requested_status in LESSON_STATUSES:
        if requested_status == "published":
            db.flush()
            validation = lesson_validation_for(lesson)
            if not validation["ready"]:
                db.rollback()
                raise validation_failed(validation, "be published")
            lesson.published_at = lesson.published_at or now()
        lesson.status = requested_status

    db.commit()
    db.refresh(lesson)
    return serialize_admin_lesson(lesson)


@router.post("/lessons/{lesson_id}/publish")
def publish_lesson(
    lesson_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)
):
    """Publish a lesson if both language translations and minimum block rules pass."""
    lesson = get_lesson_or_404(db, lesson_id)
    validation = lesson_validation_for(lesson)
    if not validation["ready"]:
        raise validation_failed(validation, "be published")
    lesson.status = "published"
    lesson.published_at = lesson.published_at or now()
    db.commit()
    db.refresh(lesson)
    return serialize_admin_lesson(lesson)


@router.post("/lessons/{lesson_id}/archive")
def archive_lesson(
    lesson_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)
):
    """Put a lesson back in the draft pile: learners stop seeing it, nothing is lost."""
    lesson = get_lesson_or_404(db, lesson_id)
    lesson.status = "draft"
    db.commit()
    db.refresh(lesson)
    return serialize_admin_lesson(lesson)


@router.post("/lessons/{lesson_id}/duplicate", status_code=201)
def duplicate_lesson(
    lesson_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)
):
    """Deep clone a lesson right after itself in the same path."""
    source = get_lesson_or_404(db, lesson_id)
    path = db.get(LearnPath, source.path_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Parent path no longer exists.")

    new_lesson = LearnLesson(
        path_id=source.path_id,
        slug=unique_lesson_slug(db, source.path_id, f"{source.slug}-copy"),
        position=source.position + 1,
        estimated_minutes=source.estimated_minutes,
        status="draft",
    )
    db.add(new_lesson)
    db.flush()

    for row in source.translations:
        db.add(LearnLessonTranslation(
            lesson_id=new_lesson.id,
            language=row.language,
            title=f"{row.title} (Copy)" if row.title else "",
            summary=row.summary,
            objective_before=row.objective_before,
            objective_after=row.objective_after,
            objective_action=row.objective_action,
            next_step=row.next_step,
            completion_message=row.completion_message,
        ))

    for old_block in source.blocks:
        new_block = LearnLessonBlock(
            lesson_id=new_lesson.id,
            block_type=old_block.block_type,
            section=old_block.section,
            position=old_block.position,
            config=dict(old_block.config or {}),
        )
        db.add(new_block)
        db.flush()

        for row in old_block.translations:
            db.add(LearnLessonBlockTranslation(
                block_id=new_block.id,
                language=row.language,
                data=dict(row.data or {}),
            ))

    reindex_lessons(db, path)
    db.commit()
    db.refresh(new_lesson)
    return serialize_admin_lesson(new_lesson)


@router.delete("/lessons/{lesson_id}")
def delete_lesson(
    lesson_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)
):
    lesson = get_lesson_or_404(db, lesson_id)
    path = db.get(LearnPath, lesson.path_id)
    lesson.deleted_at = now()
    if path is not None:
        reindex_lessons(db, path)
    db.commit()
    return {"deleted": True, "id": lesson.id}


# ---------------------------------------------------------------------------
# Fine-grained block endpoints
# ---------------------------------------------------------------------------

@router.put("/lessons/{lesson_id}/blocks")
def save_all_lesson_blocks(
    lesson_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Batch-replace the block tree of a lesson from the visual builder."""
    _validate_document(payload)
    lesson = get_lesson_or_404(db, lesson_id)
    blocks_data = payload.get("blocks")
    if not isinstance(blocks_data, list):
        raise HTTPException(status_code=400, detail="Payload must have a 'blocks' array.")

    _replace_lesson_blocks(db, lesson, blocks_data)
    db.commit()
    db.refresh(lesson)
    return serialize_admin_lesson(lesson)


@router.post("/lessons/{lesson_id}/blocks", status_code=201)
def add_lesson_block(
    lesson_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Add a single block to a lesson, optionally at a specific position."""
    _validate_document(payload)
    lesson = get_lesson_or_404(db, lesson_id)

    raw_type = clamp_text(payload.get("block_type"), 60)
    block_type = normalize_block_type(raw_type)
    clean_config = normalize_block_config(block_type, payload.get("config"))
    section = normalize_section(payload.get("section"), block_type)

    last_position = db.execute(
        select(func.max(LearnLessonBlock.position)).where(
            LearnLessonBlock.lesson_id == lesson.id
        )
    ).scalar_one_or_none()
    default_pos = 0 if last_position is None else last_position + 1
    position = clean_int(payload.get("position"), default_pos, 0, 999)

    block = LearnLessonBlock(
        lesson_id=lesson.id,
        block_type=block_type,
        section=section,
        position=position,
        config=clean_config,
    )
    db.add(block)
    db.flush()

    raw_translations = payload.get("translations")
    if isinstance(raw_translations, dict):
        for language in LANGUAGES:
            entry = raw_translations.get(language) or {}
            content = normalize_block_data(block_type, entry.get("data") or entry.get("content"))
            db.add(LearnLessonBlockTranslation(
                block_id=block.id, language=language, data=content
            ))

    db.commit()
    db.refresh(lesson)
    return serialize_admin_lesson(lesson)


@router.delete("/blocks/{block_id}")
def delete_block(
    block_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)
):
    block = db.get(LearnLessonBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    lesson = db.get(LearnLesson, block.lesson_id)
    db.delete(block)
    db.commit()
    if lesson is not None:
        db.refresh(lesson)
        return serialize_admin_lesson(lesson)
    return {"deleted": True, "id": block_id}
