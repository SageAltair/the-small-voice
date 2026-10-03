"""Admin Practice API: concepts, questions, sets, challenges, settings.

Everything here requires the existing admin role, and the documents follow the
shape Learn already established: the builder sends the whole question back in
one request and the server writes it in a single transaction, so a save either
lands completely or not at all.

Two rules matter as much here as in the public API:

- Publishing is never implicit. Saving keeps something a draft; publishing runs
  the validation report first and refuses with every actionable message at once.
- Editing published content is safe. Ids are stable, question versions are
  bumped on meaningful change, and nothing that would rewrite learner history
  is ever deleted - archives are soft deletes.
"""

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import Integer, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.learn_content import (
    LANGUAGES,
    clamp_text,
    clean_bool,
    clean_id,
    clean_int,
    clean_language,
    clean_slug,
    iso,
    now,
    translation_map,
)
from app.models.learn import LearnLesson, LearnPath
from app.models.practice import (
    Achievement,
    AchievementTranslation,
    ApplicationChallenge,
    ApplicationChallengeTranslation,
    ConceptMastery,
    PracticeApplication,
    PracticeAttempt,
    PracticeCommitment,
    PracticeConcept,
    PracticeConceptTranslation,
    PracticeEvent,
    PracticeProgress,
    PracticeQuestion,
    PracticeQuestionTranslation,
    PracticeSession,
    PracticeSet,
    PracticeSetQuestion,
    PracticeSetTranslation,
    PracticeSettings,
    QuestionMastery,
)
from app.models.user import User
from app.practice_content import (
    CONCEPT_STATUSES,
    DEFAULT_SETTINGS,
    DIFFICULTIES,
    MAX_ACCEPTED,
    MAX_EXPLANATION,
    MAX_OPTIONS,
    MAX_PROMPT,
    MAX_TAKEAWAY,
    QUESTION_TYPES,
    SET_MODES,
    SET_STATUSES,
    clean_difficulty,
    clean_level,
    clean_question_type,
    language_name,
    normalize_accepted,
    normalize_answer_key,
    normalize_answer_options,
    normalize_option_list,
    question_validation,
    set_validation,
)
from app.routes.experiences import require_admin
from app.routes.practice import (
    ensure_achievement_definitions,
    progress_for,
    settings_for,
)


router = APIRouter(prefix="/admin/practice", tags=["Practice (admin)"])


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def validation_failed(validation: dict[str, Any], action: str) -> HTTPException:
    """A content-validation error carrying every actionable message.

    422 rather than 400: the request was well formed, the content it describes
    is not ready, and the studio shows ``errors`` field by field.
    """
    errors = validation.get("errors") or []
    message = " ".join(error["message"] for error in errors[:3]) or (
        f"This content cannot {action} yet."
    )
    return HTTPException(
        status_code=422,
        detail={
            "code": "validation_failed",
            "message": message,
            "errors": errors,
            "warnings": validation.get("warnings") or [],
        },
    )


def unique_slug(db: Session, model, value: Any, *, exclude_id: int | None = None) -> str:
    base = clean_slug(value) or "practice"
    candidate = base
    suffix = 2
    while True:
        existing = db.execute(
            select(model.id).where(model.slug == candidate)
        ).scalars().first()
        if existing is None or existing == exclude_id:
            return candidate
        candidate = f"{base[:170]}-{suffix}"
        suffix += 1


def get_concept_or_404(db: Session, concept_id: int) -> PracticeConcept:
    concept = db.get(PracticeConcept, concept_id)
    if concept is None or concept.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return concept


def get_question_or_404(db: Session, question_id: int) -> PracticeQuestion:
    question = db.get(PracticeQuestion, question_id)
    if question is None or question.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


def get_set_or_404(db: Session, set_id: int) -> PracticeSet:
    practice_set = db.get(PracticeSet, set_id)
    if practice_set is None or practice_set.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Practice set not found")
    return practice_set


def get_challenge_or_404(db: Session, challenge_id: int) -> ApplicationChallenge:
    challenge = db.get(ApplicationChallenge, challenge_id)
    if challenge is None or challenge.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return challenge


def question_row(db: Session, question: PracticeQuestion) -> dict[str, Any]:
    """One row for the question bank list."""
    translations = question_translations(question)
    attempts = db.execute(
        select(
            func.count(PracticeAttempt.id),
            func.sum(func.cast(PracticeAttempt.correct, Integer)),
        ).where(PracticeAttempt.question_id == question.id)
    ).first()
    total = clean_int(attempts[0], 0, 0, 10_000_000)
    correct = clean_int(attempts[1], 0, 0, 10_000_000)
    return {
        "id": question.id,
        "concept_id": question.concept_id,
        "concept_name": concept_name(db, question.concept_id),
        "question_type": question.question_type,
        "difficulty": question.difficulty,
        "level": question.level,
        "status": question.status,
        "version": question.version,
        "weight": question.weight,
        "display_order": question.display_order,
        "scripture_reference": question.scripture_reference,
        "scripture_translation": question.scripture_translation,
        "learn_lesson_id": question.learn_lesson_id,
        "story_id": question.story_id,
        "resource_id": question.resource_id,
        "tags": list(question.tags or []),
        "prompt": translations["en"]["prompt"] or translations["sw"]["prompt"],
        "attempts": total,
        "accuracy": round(correct / total * 100) if total else None,
        "updated_at": iso(question.updated_at),
    }


def concept_translations(concept: PracticeConcept) -> dict[str, dict[str, Any]]:
    rows = translation_map(list(concept.translations))
    return {
        language: {
            "name": clamp_text(getattr(rows.get(language), "name", ""), 200),
            "description": clamp_text(getattr(rows.get(language), "description", None), 2000),
            "prep": clamp_text(getattr(rows.get(language), "prep", None), 2000),
        }
        for language in LANGUAGES
    }


def question_translations(question: PracticeQuestion) -> dict[str, dict[str, Any]]:
    rows = translation_map(list(question.translations))
    return {
        language: {
            "prompt": clamp_text(getattr(rows.get(language), "prompt", ""), MAX_PROMPT),
            "options": list(getattr(rows.get(language), "options", None) or []),
            "explanation": clamp_text(getattr(rows.get(language), "explanation", None), MAX_EXPLANATION),
            "takeaway": clamp_text(getattr(rows.get(language), "takeaway", None), MAX_TAKEAWAY),
            "accepted": list(getattr(rows.get(language), "accepted", None) or []),
            "application_prompt": clamp_text(
                getattr(rows.get(language), "application_prompt", None), MAX_TAKEAWAY
            ),
            "media_url": getattr(rows.get(language), "media_url", None),
            "media_alt": getattr(rows.get(language), "media_alt", None),
        }
        for language in LANGUAGES
    }


def set_translations(practice_set: PracticeSet) -> dict[str, dict[str, Any]]:
    rows = translation_map(list(practice_set.translations))
    return {
        language: {
            "title": clamp_text(getattr(rows.get(language), "title", ""), 200),
            "description": clamp_text(getattr(rows.get(language), "description", None), 2000),
        }
        for language in LANGUAGES
    }


def challenge_translations(challenge: ApplicationChallenge) -> dict[str, dict[str, Any]]:
    rows = translation_map(list(challenge.translations))
    return {
        language: {
            "title": clamp_text(getattr(rows.get(language), "title", ""), 200),
            "prompt": clamp_text(getattr(rows.get(language), "prompt", None), MAX_TAKEAWAY),
        }
        for language in LANGUAGES
    }


def concept_question_count(db: Session, concept_id: int) -> int:
    return db.execute(
        select(func.count())
        .select_from(PracticeQuestion)
        .where(
            PracticeQuestion.concept_id == concept_id,
            PracticeQuestion.deleted_at.is_(None),
        )
    ).scalar_one()


def question_validation_for(db: Session, question: PracticeQuestion) -> dict[str, Any]:
    """The readiness report the server itself acts on."""
    lesson_exists = True
    if question.learn_lesson_id:
        lesson = db.get(LearnLesson, question.learn_lesson_id)
        lesson_exists = lesson is not None and lesson.deleted_at is None
    return question_validation(
        question_type=question.question_type,
        config=question.config or {},
        translations=question_translations(question),
        published=question.status == "published",
        learn_lesson_exists=lesson_exists,
    )


def set_validation_for(db: Session, practice_set: PracticeSet) -> dict[str, Any]:
    question_ids = [
        row.question_id
        for row in db.execute(
            select(PracticeSetQuestion.question_id).where(
                PracticeSetQuestion.set_id == practice_set.id
            )
        ).scalars().all()
    ]
    return set_validation(
        translations=set_translations(practice_set),
        mode=practice_set.mode,
        question_ids=question_ids,
        concept_ids=list(practice_set.concept_ids or []),
        published=practice_set.status == "published",
    )


# ---------------------------------------------------------------------------
# Overview + reference data
# ---------------------------------------------------------------------------

def _count(db: Session, model, *conditions) -> int:
    return db.execute(select(func.count()).select_from(model).where(*conditions)).scalar_one()


def concept_name(db: Session, concept_id: int | None, language: str = "en") -> str:
    if not concept_id:
        return ""
    concept = db.get(PracticeConcept, concept_id)
    if concept is None:
        return ""
    return clamp_text(
        getattr(translation_map(list(concept.translations)).get(language), "name", ""), 200
    ) or concept.slug


@router.get("/overview")
def practice_overview(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """A compact, useful picture: what exists, what is live, what is used."""
    ensure_achievement_definitions(db)
    db.commit()

    live_questions = (PracticeQuestion.deleted_at.is_(None),)
    live_concepts = (PracticeConcept.deleted_at.is_(None),)
    live_sets = (PracticeSet.deleted_at.is_(None),)

    totals = {
        "questions": _count(db, PracticeQuestion, *live_questions),
        "published_questions": _count(
            db, PracticeQuestion, *live_questions, PracticeQuestion.status == "published"
        ),
        "draft_questions": _count(
            db, PracticeQuestion, *live_questions, PracticeQuestion.status != "published"
        ),
        "concepts": _count(db, PracticeConcept, *live_concepts),
        "published_concepts": _count(
            db, PracticeConcept, *live_concepts, PracticeConcept.status == "published"
        ),
        "sets": _count(db, PracticeSet, *live_sets),
        "published_sets": _count(
            db, PracticeSet, *live_sets, PracticeSet.status == "published"
        ),
        "challenges": _count(
            db, ApplicationChallenge, ApplicationChallenge.deleted_at.is_(None)
        ),
        "question_types": len(QUESTION_TYPES),
    }

    language_totals = {}
    for language in LANGUAGES:
        language_totals[language] = {
            "concepts": _count(
                db,
                PracticeConceptTranslation,
                PracticeConceptTranslation.language == language,
                PracticeConceptTranslation.name != "",
            ),
            "questions": _count(
                db,
                PracticeQuestionTranslation,
                PracticeQuestionTranslation.language == language,
                PracticeQuestionTranslation.prompt != "",
            ),
        }

    sessions = _count(db, PracticeSession)
    completed = _count(db, PracticeSession, PracticeSession.status == "completed")

    return {
        "totals": totals,
        "languages": language_totals,
        "learners": {
            "progress_rows": _count(db, PracticeProgress),
            "sessions": sessions,
            "completed_sessions": completed,
            "attempts": _count(db, PracticeAttempt),
            "applications": _count(
                db, PracticeApplication, PracticeApplication.skipped.is_(False)
            ),
        },
        "completion_rate": round(completed / sessions * 100, 2) if sessions else 0.0,
        "hardest_concepts": _hardest_concepts(db),
        "attention": _attention(db),
        "settings": settings_for(db),
    }


def _hardest_concepts(db: Session) -> list[dict[str, Any]]:
    """The concepts learners keep missing - genuinely useful, not decorative."""
    # ``correct`` is a boolean and PostgreSQL has no sum(boolean); SQLite has one,
    # so the cast is what keeps this endpoint working on the real database while
    # the test suite (which runs on SQLite) would otherwise pass either way.
    correct_total = func.sum(func.cast(PracticeAttempt.correct, Integer))
    rows = db.execute(
        select(
            PracticeConcept.id,
            correct_total,
            func.count(PracticeAttempt.id),
        )
        .join(PracticeAttempt, PracticeAttempt.concept_id == PracticeConcept.id)
        .where(PracticeConcept.deleted_at.is_(None))
        .group_by(PracticeConcept.id)
        .order_by((func.count(PracticeAttempt.id) - correct_total).desc())
        .limit(5)
    ).all()
    results = []
    for concept_id, correct, attempts in rows:
        total = clean_int(attempts, 0, 0, 10_000_000)
        if not total:
            continue
        results.append({
            "concept_id": concept_id,
            "name": concept_name(db, concept_id),
            "attempts": total,
            "accuracy": round(clean_int(correct, 0, 0, 10_000_000) / total * 100),
        })
    return results


def _attention(db: Session) -> list[dict[str, Any]]:
    """Draft content, so nothing quietly stays invisible."""
    items: list[dict[str, Any]] = []
    for question in db.execute(
        select(PracticeQuestion)
        .where(PracticeQuestion.deleted_at.is_(None), PracticeQuestion.status != "published")
        .order_by(PracticeQuestion.updated_at.desc())
        .limit(5)
    ).scalars().all():
        prompt = clamp_text(
            getattr(
                translation_map(list(question.translations)).get("en"), "prompt", ""
            ),
            120,
        )
        items.append({
            "kind": "question",
            "id": question.id,
            "title": prompt or f"Question {question.id}",
            "message": "Draft questions stay hidden from learners until they are published.",
        })
    for concept in db.execute(
        select(PracticeConcept)
        .where(PracticeConcept.deleted_at.is_(None), PracticeConcept.status != "published")
        .order_by(PracticeConcept.updated_at.desc())
        .limit(5)
    ).scalars().all():
        items.append({
            "kind": "concept",
            "id": concept.id,
            "title": concept_name(db, concept.id),
            "message": "A concept that is not published keeps its questions out of sessions.",
        })
    return items


@router.get("/catalog")
def practice_catalog(user: User = Depends(require_admin)):
    """The builder's reference data: types, languages, difficulties, modes."""
    return {
        "question_types": [
            {
                "id": key,
                "label": definition["label"],
                "group": definition["group"],
                "graded": definition["graded"],
                "fields": list(definition["fields"]),
                "needs": list(definition["needs"]),
                "min_options": definition.get("min_options", 0),
            }
            for key, definition in QUESTION_TYPES.items()
        ],
        "languages": list(LANGUAGES),
        "difficulties": list(DIFFICULTIES),
        "set_modes": list(SET_MODES),
        "levels": [
            {"value": 1, "label": "Recognition"},
            {"value": 2, "label": "Recall"},
            {"value": 3, "label": "Understanding"},
            {"value": 4, "label": "Application"},
            {"value": 5, "label": "Reflection"},
        ],
        "defaults": DEFAULT_SETTINGS,
    }


# ---------------------------------------------------------------------------
# Concepts
# ---------------------------------------------------------------------------

def apply_concept_payload(
    db: Session,
    concept: PracticeConcept,
    payload: dict[str, Any],
) -> None:
    """Write a concept document: fields plus both language versions."""
    translations = payload.get("translations") if isinstance(payload.get("translations"), dict) else {}
    name_en = clamp_text((translations.get("en") or {}).get("name"), 200)
    concept.slug = unique_slug(
        db, PracticeConcept, payload.get("slug") or name_en, exclude_id=concept.id
    )
    concept.category = clamp_text(payload.get("category"), 80)
    concept.difficulty = clean_difficulty(payload.get("difficulty"))
    concept.learn_lesson_id = clean_id(payload.get("learn_lesson_id"))
    concept.learn_path_id = clean_id(payload.get("learn_path_id"))
    concept.display_order = clean_int(payload.get("display_order"), 0, 0, 999)
    status = clamp_text(payload.get("status"), 20).lower()
    if status in CONCEPT_STATUSES:
        concept.status = status

    rows = {row.language: row for row in concept.translations}
    for language in LANGUAGES:
        source = translations.get(language)
        if not isinstance(source, dict):
            continue
        name = clamp_text(source.get("name"), 200)
        description = clamp_text(source.get("description"), 2000)
        prep = clamp_text(source.get("prep"), 2000)
        row = rows.get(language)
        if not name and not description and not prep:
            if row is not None:
                db.delete(row)
            continue
        if row is None:
            row = PracticeConceptTranslation(language=language)
            concept.translations.append(row)
        row.name = name
        row.description = description or None
        row.prep = prep or None


def concept_document(db: Session, concept: PracticeConcept) -> dict[str, Any]:
    return {
        "concept": {
            "id": concept.id,
            "slug": concept.slug,
            "category": concept.category or None,
            "difficulty": concept.difficulty,
            "learn_lesson_id": concept.learn_lesson_id,
            "learn_path_id": concept.learn_path_id,
            "display_order": concept.display_order,
            "status": concept.status,
            "question_count": concept_question_count(db, concept.id),
            "created_at": iso(concept.created_at),
            "updated_at": iso(concept.updated_at),
        },
        "translations": concept_translations(concept),
    }


@router.get("/concepts")
def list_admin_concepts(
    status: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Every concept with both language names and how many questions it holds."""
    query = select(PracticeConcept).where(PracticeConcept.deleted_at.is_(None))
    if status:
        query = query.where(PracticeConcept.status == status)
    concepts = db.execute(query.order_by(PracticeConcept.display_order.asc())).scalars().all()

    term = (q or "").strip().lower()
    items = []
    for concept in concepts:
        translations = concept_translations(concept)
        if term and term not in " ".join(
            [
                concept.slug,
                concept.category or "",
                translations["en"]["name"],
                translations["sw"]["name"],
            ]
        ).lower():
            continue
        items.append({
            "id": concept.id,
            "slug": concept.slug,
            "status": concept.status,
            "difficulty": concept.difficulty,
            "category": concept.category or None,
            "name": translations["en"]["name"] or translations["sw"]["name"],
            "swahili_name": translations["sw"]["name"],
            "question_count": concept_question_count(db, concept.id),
            "updated_at": iso(concept.updated_at),
        })
    return {"items": items}


@router.post("/concepts", status_code=201)
def create_concept(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Create a draft concept. Nothing is public until it is published."""
    concept = PracticeConcept()
    # Applied before the insert: the slug is part of the row's identity, so a
    # flush first would write a null slug the database rightly refuses.
    apply_concept_payload(db, concept, payload)
    db.add(concept)
    db.commit()
    db.refresh(concept)
    return concept_document(db, concept)


@router.get("/concepts/{concept_id}")
def get_admin_concept(
    concept_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    return concept_document(db, get_concept_or_404(db, concept_id))


@router.put("/concepts/{concept_id}")
def save_concept(
    concept_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Save a concept in one transaction; publishing happens only on request."""
    concept = get_concept_or_404(db, concept_id)
    apply_concept_payload(db, concept, payload)
    db.commit()
    db.refresh(concept)
    return concept_document(db, concept)


@router.post("/concepts/{concept_id}/publish")
def publish_concept(
    concept_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Publish a concept, but only once it is named in at least one language."""
    concept = get_concept_or_404(db, concept_id)
    source = payload if isinstance(payload, dict) else {}
    if source:
        apply_concept_payload(db, concept, source)
    name = clamp_text(
        getattr(translation_map(list(concept.translations)).get("en"), "name", ""), 200
    )
    if not name:
        raise validation_failed(
            {
                "errors": [{
                    "code": "name_missing",
                    "field": "translations.en.name",
                    "message": "Give this concept a name before publishing.",
                }],
                "warnings": [],
            },
            "be published",
        )
    concept.status = "published"
    db.commit()
    db.refresh(concept)
    return concept_document(db, concept)


@router.post("/concepts/{concept_id}/unpublish")
def unpublish_concept(
    concept_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Hide a concept from learners without deleting any history."""
    concept = get_concept_or_404(db, concept_id)
    concept.status = "draft"
    db.commit()
    db.refresh(concept)
    return concept_document(db, concept)


@router.delete("/concepts/{concept_id}")
def delete_concept(
    concept_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Soft delete: learner attempts and mastery rows are preserved."""
    concept = get_concept_or_404(db, concept_id)
    concept.deleted_at = now()
    concept.status = "draft"
    db.commit()
    return {"deleted": True, "id": concept_id}


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------

def apply_question_payload(
    db: Session,
    question: PracticeQuestion,
    payload: dict[str, Any],
) -> None:
    """Write a question document in one pass.

    The answer key is validated against the stored options, and a published
    question that meaningfully changes gets a new ``version`` so historical
    attempts stay attached to the content the learner actually saw.
    """
    source = payload.get("question") if isinstance(payload.get("question"), dict) else payload
    translations = (
        payload.get("translations") if isinstance(payload.get("translations"), dict) else {}
    )

    previous_type = question.question_type
    previous_key = dict(question.config or {})
    previous_prompts = {
        row.language: row.prompt for row in question.translations
    }

    question.concept_id = clean_id(source.get("concept_id")) or question.concept_id
    if not question.concept_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "concept_required", "message": "Every question belongs to a concept."},
        )
    concept = db.get(PracticeConcept, question.concept_id)
    if concept is None or concept.deleted_at is not None:
        raise HTTPException(status_code=400, detail="That concept is not available.")

    question_type = clean_question_type(source.get("question_type"))
    question.question_type = question_type
    question.difficulty = clean_difficulty(source.get("difficulty"))
    question.level = clean_level(source.get("level"))
    question.weight = clean_int(source.get("weight"), 0, 0, 2)
    question.display_order = clean_int(source.get("display_order"), 0, 0, 9999)
    question.learn_lesson_id = clean_id(source.get("learn_lesson_id"))
    question.story_id = clean_id(source.get("story_id"))
    question.resource_id = clean_id(source.get("resource_id"))
    question.scripture_reference = clamp_text(source.get("scripture_reference"), 120) or None
    question.scripture_translation = clamp_text(source.get("scripture_translation"), 60) or None
    status = clamp_text(source.get("status"), 20).lower()
    if status in ("draft", "published", "unpublished"):
        question.status = "draft" if status == "unpublished" else status
    tags = source.get("tags")
    if isinstance(tags, list):
        cleaned_tags = []
        for tag in tags[:12]:
            text = clamp_text(tag, 40)
            if text and text not in cleaned_tags:
                cleaned_tags.append(text)
        question.tags = cleaned_tags

    rows = {row.language: row for row in question.translations}
    options_by_language: dict[str, list[Any]] = {}
    for language in LANGUAGES:
        entry = translations.get(language)
        if not isinstance(entry, dict):
            continue
        prompt = clamp_text(entry.get("prompt"), MAX_PROMPT)
        options = normalize_answer_options(entry.get("options"), question_type)
        explanation = clamp_text(entry.get("explanation"), MAX_EXPLANATION)
        takeaway = clamp_text(entry.get("takeaway"), MAX_TAKEAWAY)
        accepted = normalize_accepted(entry.get("accepted"))
        application_prompt = clamp_text(entry.get("application_prompt"), MAX_TAKEAWAY)
        media_url = clamp_text(entry.get("media_url"), 500) or None
        media_alt = clamp_text(entry.get("media_alt"), 300) or None
        options_by_language[language] = options

        row = rows.get(language)
        if row is None:
            if not prompt and not options and not explanation:
                continue
            row = PracticeQuestionTranslation(language=language)
            question.translations.append(row)
        row.prompt = prompt
        row.options = options
        row.explanation = explanation or None
        row.takeaway = takeaway or None
        row.accepted = accepted
        row.application_prompt = application_prompt or None
        row.media_url = media_url
        row.media_alt = media_alt or None

    key_source = source.get("config")
    if not isinstance(key_source, dict):
        key_source = source
    key_options = options_by_language.get("en") or []
    if not key_options:
        for value in options_by_language.values():
            if value:
                key_options = value
                break
    question.config = normalize_answer_key(question_type, key_source)

    # Version safety: a meaningful change to a published question bumps the
    # version, so historical attempts stay attached to what was answered.
    if question.status == "published":
        new_prompts = {row.language: row.prompt for row in question.translations}
        if (
            previous_type != question_type
            or previous_key != question.config
            or previous_prompts != new_prompts
        ):
            question.version = clean_int(question.version, 1, 1, 100000) + 1


def question_document(db: Session, question: PracticeQuestion) -> dict[str, Any]:
    """The full editable document: metadata, both languages, the answer key."""
    return {
        "question": {
            "id": question.id,
            "concept_id": question.concept_id,
            "concept_name": concept_name(db, question.concept_id),
            "question_type": question.question_type,
            "difficulty": question.difficulty,
            "level": question.level,
            "status": question.status,
            "version": question.version,
            "weight": question.weight,
            "display_order": question.display_order,
            "learn_lesson_id": question.learn_lesson_id,
            "story_id": question.story_id,
            "resource_id": question.resource_id,
            "scripture_reference": question.scripture_reference,
            "scripture_translation": question.scripture_translation,
            "tags": list(question.tags or []),
            "config": question.config or {},
            "created_at": iso(question.created_at),
            "updated_at": iso(question.updated_at),
        },
        "translations": question_translations(question),
        "validation": question_validation_for(db, question),
    }


@router.get("/questions")
def list_admin_questions(
    concept_id: int | None = None,
    status: str | None = None,
    question_type: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """The question bank: filter by concept, status, type or free text."""
    query = select(PracticeQuestion).where(PracticeQuestion.deleted_at.is_(None))
    if concept_id:
        query = query.where(PracticeQuestion.concept_id == concept_id)
    if status:
        query = query.where(PracticeQuestion.status == status)
    if question_type:
        query = query.where(PracticeQuestion.question_type == question_type)
    questions = db.execute(
        query.order_by(PracticeQuestion.display_order.asc(), PracticeQuestion.id.asc()).limit(500)
    ).scalars().all()

    term = (q or "").strip().lower()
    items = []
    for question in questions:
        row = question_row(db, question)
        if term and term not in (row["prompt"] or "").lower():
            continue
        items.append(row)
    return {"items": items}


@router.post("/questions", status_code=201)
def create_question(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Create a draft question. It stays invisible until it is published."""
    source = payload.get("question") if isinstance(payload.get("question"), dict) else payload
    question = PracticeQuestion(
        concept_id=clean_id(source.get("concept_id")) or 0,
        question_type="multiple_choice",
    )
    db.add(question)
    db.flush()  # needs an id so the translations can point at it
    apply_question_payload(db, question, payload)
    db.commit()
    db.refresh(question)
    return question_document(db, question)


@router.get("/questions/{question_id}")
def get_admin_question(
    question_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    return question_document(db, get_question_or_404(db, question_id))


@router.put("/questions/{question_id}")
def save_question(
    question_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Save the whole question in one transaction; publish separately."""
    question = get_question_or_404(db, question_id)
    apply_question_payload(db, question, payload)
    db.commit()
    db.refresh(question)
    return question_document(db, question)


@router.post("/questions/{question_id}/publish")
def publish_question(
    question_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Publish, but only if the server's own validation agrees."""
    question = get_question_or_404(db, question_id)
    if payload:
        apply_question_payload(db, question, payload)
    db.flush()
    validation = question_validation_for(db, question)
    if not validation["ready"]:
        db.rollback()
        raise validation_failed(validation, "be published")
    question.status = "published"
    question.published_at = question.published_at or now()
    db.commit()
    db.refresh(question)
    return question_document(db, question)


@router.post("/questions/{question_id}/unpublish")
def unpublish_question(
    question_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Take a question out of circulation without losing learner history."""
    question = get_question_or_404(db, question_id)
    question.status = "draft"
    db.commit()
    db.refresh(question)
    return question_document(db, question)


@router.post("/questions/{question_id}/duplicate", status_code=201)
def duplicate_question(
    question_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Clone a question (and both languages) as a new draft."""
    original = get_question_or_404(db, question_id)
    clone = PracticeQuestion(
        concept_id=original.concept_id,
        question_type=original.question_type,
        difficulty=original.difficulty,
        level=original.level,
        weight=original.weight,
        display_order=original.display_order,
        learn_lesson_id=original.learn_lesson_id,
        story_id=original.story_id,
        resource_id=original.resource_id,
        scripture_reference=original.scripture_reference,
        scripture_translation=original.scripture_translation,
        config=dict(original.config or {}),
        tags=list(original.tags or []),
        status="draft",
    )
    db.add(clone)
    db.flush()
    for row in original.translations:
        db.add(
            PracticeQuestionTranslation(
                question_id=clone.id,
                language=row.language,
                prompt=row.prompt,
                options=list(row.options or []),
                explanation=row.explanation,
                takeaway=row.takeaway,
                accepted=list(row.accepted or []),
                application_prompt=row.application_prompt,
                media_url=row.media_url,
                media_alt=row.media_alt,
            )
        )
    db.commit()
    db.refresh(clone)
    return question_document(db, clone)


@router.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Soft delete: attempts already recorded are never rewritten."""
    question = get_question_or_404(db, question_id)
    question.deleted_at = now()
    question.status = "draft"
    db.commit()
    return {"deleted": True, "id": question_id}

    apply_question_payload(db, question, payload)
    db.commit()
    db.refresh(question)
    return question_document(db, question)

    question.config = normalize_answer_key(question_type, key_source)

    # Version safety: a meaningful change to a published question bumps the
    # version, so historical attempts remain attributed to what was answered.
    if question.status == "published":
        new_prompts = {
            row.language: row.prompt for row in question.translations
        }
        if (
            previous_type != question_type
            or previous_key != question.config
            or previous_prompts != new_prompts
        ):
            question.version = clean_int(question.version, 1, 1, 100000) + 1

# ---------------------------------------------------------------------------
# Practice sets
# ---------------------------------------------------------------------------

def apply_set_payload(db: Session, practice_set: PracticeSet, payload: dict[str, Any]) -> None:
    """Write a set document: fields, rules and both language versions."""
    # The builder sends `{"practice_set": {...}, "translations": {...}}`; a
    # flat body is accepted too so the endpoint is pleasant to call by hand.
    source = payload.get("practice_set") if isinstance(payload.get("practice_set"), dict) else payload
    translations = payload.get("translations") if isinstance(payload.get("translations"), dict) else {}
    title_en = clamp_text((translations.get("en") or {}).get("title"), 200)
    practice_set.slug = unique_slug(
        db, PracticeSet, payload.get("slug") or source.get("slug") or title_en, exclude_id=practice_set.id
    )
    mode = clamp_text(source.get("mode"), 20).lower()
    practice_set.mode = mode if mode in SET_MODES else "manual"
    practice_set.difficulty = clean_difficulty(source.get("difficulty"))
    practice_set.estimated_minutes = clean_int(source.get("estimated_minutes"), 5, 1, 180)
    practice_set.display_order = clean_int(source.get("display_order"), 0, 0, 999)
    status = clamp_text(source.get("status"), 20).lower()
    if status in SET_STATUSES:
        practice_set.status = status

    rules = source.get("rules") if isinstance(source.get("rules"), dict) else {}
    practice_set.rules = {
        "count": clean_int(rules.get("count"), 0, 0, 100),
        "weak_concepts": clean_int(rules.get("weak_concepts"), 0, 0, 20),
        "new_concepts": clean_int(rules.get("new_concepts"), 0, 0, 20),
        "review": clean_int(rules.get("review"), 0, 0, 20),
    }
    concept_ids = source.get("concept_ids")
    if isinstance(concept_ids, list):
        cleaned = []
        for item in concept_ids[:40]:
            concept_id = clean_id(item)
            if concept_id and concept_id not in cleaned:
                cleaned.append(concept_id)
        practice_set.concept_ids = cleaned

    rows = {row.language: row for row in practice_set.translations}
    for language in LANGUAGES:
        source = translations.get(language)
        if not isinstance(source, dict):
            continue
        title = clamp_text(source.get("title"), 200)
        description = clamp_text(source.get("description"), 2000)
        row = rows.get(language)
        if not title and not description:
            if row is not None:
                db.delete(row)
            continue
        if row is None:
            row = PracticeSetTranslation(language=language)
            practice_set.translations.append(row)
        row.title = title
        row.description = description or None


def replace_set_questions(
    db: Session,
    practice_set: PracticeSet,
    question_ids: Any,
) -> None:
    """Replace manual membership in one shot - ordering included."""
    if not isinstance(question_ids, list):
        return
    for row in db.execute(
        select(PracticeSetQuestion).where(PracticeSetQuestion.set_id == practice_set.id)
    ).scalars().all():
        db.delete(row)
    db.flush()

    position = 0
    seen: set[int] = set()
    for item in question_ids[:100]:
        question_id = clean_id(item)
        if not question_id or question_id in seen:
            continue
        question = db.get(PracticeQuestion, question_id)
        if question is None or question.deleted_at is not None:
            continue
        seen.add(question_id)
        db.add(
            PracticeSetQuestion(
                set_id=practice_set.id,
                question_id=question_id,
                position=position,
            )
        )
        position += 1


def set_document(db: Session, practice_set: PracticeSet) -> dict[str, Any]:
    membership = db.execute(
        select(PracticeSetQuestion.question_id, PracticeSetQuestion.position)
        .where(PracticeSetQuestion.set_id == practice_set.id)
        .order_by(PracticeSetQuestion.position.asc())
    ).all()
    return {
        "practice_set": {
            "id": practice_set.id,
            "slug": practice_set.slug,
            "mode": practice_set.mode,
            "rules": practice_set.rules or {},
            "difficulty": practice_set.difficulty,
            "estimated_minutes": practice_set.estimated_minutes,
            "concept_ids": list(practice_set.concept_ids or []),
            "display_order": practice_set.display_order,
            "status": practice_set.status,
            "question_ids": [row[0] for row in membership],
            "created_at": iso(practice_set.created_at),
            "updated_at": iso(practice_set.updated_at),
        },
        "translations": set_translations(practice_set),
        "validation": set_validation_for(db, practice_set),
    }


@router.get("/sets")
def list_admin_sets(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Every practice set with its mode, size and readiness."""
    query = select(PracticeSet).where(PracticeSet.deleted_at.is_(None))
    if status:
        query = query.where(PracticeSet.status == status)
    practice_sets = db.execute(
        query.order_by(PracticeSet.display_order.asc(), PracticeSet.id.asc())
    ).scalars().all()

    items = []
    for practice_set in practice_sets:
        translations = set_translations(practice_set)
        count = db.execute(
            select(func.count())
            .select_from(PracticeSetQuestion)
            .where(PracticeSetQuestion.set_id == practice_set.id)
        ).scalar_one()
        items.append({
            "id": practice_set.id,
            "slug": practice_set.slug,
            "status": practice_set.status,
            "mode": practice_set.mode,
            "difficulty": practice_set.difficulty,
            "title": translations["en"]["title"] or translations["sw"]["title"],
            "swahili_title": translations["sw"]["title"],
            "question_count": count,
            "concept_count": len(practice_set.concept_ids or []),
            "estimated_minutes": practice_set.estimated_minutes,
            "updated_at": iso(practice_set.updated_at),
        })
    return {"items": items}


@router.post("/sets", status_code=201)
def create_set(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Create a draft set."""
    practice_set = PracticeSet()
    # The slug is assigned before the insert, for the same reason as concepts.
    apply_set_payload(db, practice_set, payload)
    db.add(practice_set)
    db.commit()
    db.refresh(practice_set)
    return set_document(db, practice_set)


@router.get("/sets/{set_id}")
def get_admin_set(
    set_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    return set_document(db, get_set_or_404(db, set_id))


@router.put("/sets/{set_id}")
def save_set(
    set_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Save a set and, when sent, its ordered question membership."""
    practice_set = get_set_or_404(db, set_id)
    apply_set_payload(db, practice_set, payload)
    replace_set_questions(db, practice_set, payload.get("questions"))
    db.commit()
    db.refresh(practice_set)
    return set_document(db, practice_set)


@router.post("/sets/{set_id}/publish")
def publish_set(
    set_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Publish a set only when the server's validation is satisfied."""
    practice_set = get_set_or_404(db, set_id)
    source = payload if isinstance(payload, dict) else {}
    if source:
        apply_set_payload(db, practice_set, source)
        replace_set_questions(db, practice_set, source.get("questions"))
    db.flush()
    validation = set_validation_for(db, practice_set)
    if not validation["ready"]:
        db.rollback()
        raise validation_failed(validation, "be published")
    practice_set.status = "published"
    practice_set.published_at = practice_set.published_at or now()
    db.commit()
    db.refresh(practice_set)
    return set_document(db, practice_set)


@router.post("/sets/{set_id}/unpublish")
def unpublish_set(
    set_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Hide a set from learners; nothing a learner has done is touched."""
    practice_set = get_set_or_404(db, set_id)
    practice_set.status = "draft"
    db.commit()
    db.refresh(practice_set)
    return set_document(db, practice_set)


@router.delete("/sets/{set_id}")
def delete_set(
    set_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    practice_set = get_set_or_404(db, set_id)
    practice_set.deleted_at = now()
    practice_set.status = "draft"
    db.commit()
    return {"deleted": True, "id": set_id}


# ---------------------------------------------------------------------------
# Application challenges
# ---------------------------------------------------------------------------

def apply_challenge_payload(
    db: Session,
    challenge: ApplicationChallenge,
    payload: dict[str, Any],
) -> None:
    # Accepts both `{"challenge": {...}, "translations": {...}}` and a flat body.
    source = payload.get("challenge") if isinstance(payload.get("challenge"), dict) else payload
    translations = payload.get("translations") if isinstance(payload.get("translations"), dict) else {}
    title_en = clamp_text((translations.get("en") or {}).get("title"), 200)
    challenge.slug = unique_slug(
        db, ApplicationChallenge, payload.get("slug") or source.get("slug") or title_en, exclude_id=challenge.id
    )
    challenge.concept_id = clean_id(source.get("concept_id"))
    challenge.difficulty = clean_difficulty(source.get("difficulty"))
    challenge.display_order = clean_int(source.get("display_order"), 0, 0, 999)
    status = clamp_text(source.get("status"), 20).lower()
    if status in ("draft", "published", "unpublished"):
        challenge.status = "draft" if status == "unpublished" else status

    rows = {row.language: row for row in challenge.translations}
    for language in LANGUAGES:
        source = translations.get(language)
        if not isinstance(source, dict):
            continue
        title = clamp_text(source.get("title"), 200)
        prompt = clamp_text(source.get("prompt"), MAX_TAKEAWAY)
        row = rows.get(language)
        if not title and not prompt:
            if row is not None:
                db.delete(row)
            continue
        if row is None:
            row = ApplicationChallengeTranslation(language=language)
            challenge.translations.append(row)
        row.title = title
        row.prompt = prompt or None


def challenge_document(db: Session, challenge: ApplicationChallenge) -> dict[str, Any]:
    done = db.execute(
        select(func.count())
        .select_from(PracticeApplication)
        .where(
            PracticeApplication.challenge_id == challenge.id,
            PracticeApplication.skipped.is_(False),
        )
    ).scalar_one()
    return {
        "challenge": {
            "id": challenge.id,
            "slug": challenge.slug,
            "concept_id": challenge.concept_id,
            "concept_name": concept_name(db, challenge.concept_id),
            "difficulty": challenge.difficulty,
            "display_order": challenge.display_order,
            "status": challenge.status,
            "applied": clean_int(done, 0, 0, 1_000_000),
            "created_at": iso(challenge.created_at),
            "updated_at": iso(challenge.updated_at),
        },
        "translations": challenge_translations(challenge),
    }


@router.get("/challenges")
def list_admin_challenges(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    items = []
    for challenge in db.execute(
        select(ApplicationChallenge)
        .where(ApplicationChallenge.deleted_at.is_(None))
        .order_by(ApplicationChallenge.display_order.asc(), ApplicationChallenge.id.asc())
    ).scalars().all():
        translations = challenge_translations(challenge)
        items.append({
            "id": challenge.id,
            "slug": challenge.slug,
            "status": challenge.status,
            "concept_name": concept_name(db, challenge.concept_id),
            "title": translations["en"]["title"] or translations["sw"]["title"],
            "swahili_title": translations["sw"]["title"],
            "updated_at": iso(challenge.updated_at),
        })
    return {"items": items}


@router.post("/challenges", status_code=201)
def create_challenge(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    challenge = ApplicationChallenge()
    apply_challenge_payload(db, challenge, payload)
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return challenge_document(db, challenge)


@router.post("/challenges/{challenge_id}/publish")
def publish_challenge(
    challenge_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """A challenge needs a title in at least one language before it is offered."""
    challenge = get_challenge_or_404(db, challenge_id)
    if payload:
        apply_challenge_payload(db, challenge, payload)
    name = clamp_text(
        getattr(translation_map(list(challenge.translations)).get("en"), "title", ""), 200
    )
    if not name:
        raise validation_failed(
            {
                "errors": [{
                    "code": "title_missing",
                    "field": "translations.en.title",
                    "message": "Give this challenge a title before publishing.",
                }],
                "warnings": [],
            },
            "be published",
        )
    challenge.status = "published"
    challenge.published_at = challenge.published_at or now()
    db.commit()
    db.refresh(challenge)
    return challenge_document(db, challenge)


@router.post("/challenges/{challenge_id}/unpublish")
def unpublish_challenge(
    challenge_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    challenge = get_challenge_or_404(db, challenge_id)
    challenge.status = "draft"
    db.commit()
    db.refresh(challenge)
    return challenge_document(db, challenge)


@router.delete("/challenges/{challenge_id}")
def delete_challenge(
    challenge_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    challenge = get_challenge_or_404(db, challenge_id)
    challenge.deleted_at = now()
    challenge.status = "draft"
    db.commit()
    return {"deleted": True, "id": challenge_id}


@router.put("/challenges/{challenge_id}")
def save_challenge(
    challenge_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    challenge = get_challenge_or_404(db, challenge_id)
    apply_challenge_payload(db, challenge, payload)
    db.commit()
    db.refresh(challenge)
    return challenge_document(db, challenge)
# ---------------------------------------------------------------------------
# Settings
#
# Everything here is meant to be changed without touching code (section 31):
# XP values, mastery thresholds, review intervals, session lengths, streak
# behaviour, which question types are offered, and reminder defaults.
# ---------------------------------------------------------------------------

@router.get("/settings")
def get_practice_settings(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """The live configuration plus the shipped defaults it is merged onto."""
    row = db.get(PracticeSettings, "singleton")
    return {
        "settings": settings_for(db),
        "defaults": DEFAULT_SETTINGS,
        "updated_at": iso(row.updated_at) if row is not None else None,
    }


@router.put("/settings")
def update_practice_settings(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Save configuration. Out-of-range values are clamped, never rejected."""
    source = payload if isinstance(payload, dict) else {}
    row = db.get(PracticeSettings, "singleton")
    if row is None:
        row = PracticeSettings(id="singleton")
        db.add(row)
        db.flush()

    thresholds = source.get("mastery_thresholds")
    if isinstance(thresholds, dict):
        cleaned = {}
        for stage in ("new", "learning", "developing", "strong", "mastered"):
            band = thresholds.get(stage)
            if isinstance(band, (list, tuple)) and len(band) == 2:
                cleaned[stage] = [
                    clean_int(band[0], 0, 0, 100),
                    clean_int(band[1], 100, 0, 100),
                ]
        if cleaned:
            row.mastery_thresholds = cleaned

    xp_values = source.get("xp_values")
    if isinstance(xp_values, dict):
        cleaned = {}
        for key in ("correct", "reflection", "session", "review", "application", "achievement"):
            if key in xp_values:
                cleaned[key] = clean_int(xp_values.get(key), 0, 0, 1000)
        if cleaned:
            row.xp_values = cleaned

    intervals = source.get("review_intervals")
    if isinstance(intervals, list) and intervals:
        row.review_intervals = [clean_int(item, 1, 1, 365) for item in intervals[:12]]

    sizes = source.get("session_sizes")
    if isinstance(sizes, dict):
        cleaned: dict[str, Any] = {}
        for key in ("quick", "normal", "deep"):
            if key in sizes:
                cleaned[key] = clean_int(sizes.get(key), 3, 1, 100)
        minutes = sizes.get("minutes")
        if isinstance(minutes, dict):
            table: dict[str, int] = {}
            for key, value in minutes.items():
                number = clean_int(key, 0, 1, 120)
                if number:
                    table[str(number)] = clean_int(value, 3, 1, 100)
            if table:
                cleaned["minutes"] = table
        if cleaned:
            row.session_sizes = cleaned

    if "streak_settings" in source and isinstance(source["streak_settings"], dict):
        row.streak_settings = {
            "enabled": clean_bool(source["streak_settings"].get("enabled"), True),
            "grace_days": clean_int(source["streak_settings"].get("grace_days"), 0, 0, 7),
        }

    if "question_limit" in source:
        row.question_limit = clean_int(source.get("question_limit"), 40, 1, 500)

    enabled = source.get("enabled_types")
    if isinstance(enabled, list):
        row.enabled_types = [
            item for item in enabled if clamp_text(item, 30) in QUESTION_TYPES
        ]

    if "reminder_defaults" in source and isinstance(source["reminder_defaults"], dict):
        row.reminder_defaults = {
            "frequency": clamp_text(source["reminder_defaults"].get("frequency"), 20) or "daily",
            "time": clamp_text(source["reminder_defaults"].get("time"), 8) or "08:00",
        }

    db.commit()
    db.refresh(row)
    return {"settings": settings_for(db), "updated_at": iso(row.updated_at)}

# ---------------------------------------------------------------------------
# Analytics
#
# Deliberately small: enough to answer "what is taught, what is missed, where
# do people stop" - and nothing that profiles individuals (section 45).
# ---------------------------------------------------------------------------

@router.get("/analytics")
def practice_analytics(
    concept_id: int | None = None,
    language: str | None = None,
    question_type: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Question accuracy, hardest concepts, drop-off, and language usage."""
    attempt_query = select(PracticeAttempt).where(PracticeAttempt.question_id.isnot(None))
    if concept_id:
        attempt_query = attempt_query.where(PracticeAttempt.concept_id == concept_id)
    if question_type:
        attempt_query = attempt_query.where(PracticeAttempt.question_type == question_type)
    attempts = db.execute(attempt_query).scalars().all()

    graded = [row for row in attempts if row.correct is not None]
    correct_count = len([row for row in graded if row.correct is True])

    per_question: dict[int, dict[str, Any]] = {}
    for row in attempts:
        entry = per_question.setdefault(
            row.question_id,
            {"attempts": 0, "correct": 0, "graded": 0, "type": row.question_type},
        )
        entry["attempts"] += 1
        if row.correct is True:
            entry["correct"] += 1
        if row.correct is not None:
            entry["graded"] += 1

    def accuracy(entry: dict[str, Any]) -> int | None:
        return round(entry["correct"] / entry["graded"] * 100) if entry["graded"] else None

    ranked = sorted(
        (
            {
                "question_id": question_id,
                "accuracy": accuracy(entry),
                "attempts": entry["attempts"],
                "question_type": entry["type"],
                "prompt": clamp_text(
                    getattr(
                        translation_map(
                            list(
                                db.get(PracticeQuestion, question_id).translations
                            )
                            if db.get(PracticeQuestion, question_id) is not None
                            else []
                        ).get("en"),
                        "prompt",
                        "",
                    ),
                    120,
                ),
            }
            for question_id, entry in per_question.items()
        ),
        key=lambda item: (item["accuracy"] is None, item["accuracy"] or 0, -item["attempts"]),
    )

    sessions = db.execute(select(PracticeSession)).scalars().all()
    completed = [row for row in sessions if row.status == "completed"]
    # Drop-off: how many questions a session got through before it stopped.
    started_positions = [clean_int(row.position, 0, 0, 1000) for row in sessions]
    average_position = (
        round(sum(started_positions) / len(started_positions), 1) if started_positions else 0
    )

    language_usage = dict(
        db.execute(
            select(PracticeEvent.language, func.count()).group_by(PracticeEvent.language)
        ).all()
    )
    events = dict(
        db.execute(
            select(PracticeEvent.event_type, func.count()).group_by(PracticeEvent.event_type)
        ).all()
    )

    mastery_rows = db.execute(
        select(ConceptMastery.concept_id, ConceptMastery.mastery)
        .where(ConceptMastery.mastery > 0)
    ).all()
    strongest = sorted(mastery_rows, key=lambda row: row[1], reverse=True)[:5]

    return {
        "totals": {
            "attempts": len(attempts),
            "graded": len(graded),
            "correct": correct_count,
            "accuracy": round(correct_count / len(graded) * 100) if graded else None,
            "reflections": len([row for row in attempts if row.correct is None]),
            "sessions": len(sessions),
            "completed_sessions": len(completed),
            "completion_rate": round(len(completed) / len(sessions) * 100) if sessions else None,
            "average_position": average_position,
            "concepts_with_progress": len({row[0] for row in mastery_rows}),
            "applications": _count(db, PracticeApplication, PracticeApplication.skipped.is_(False)),
            "applications_done": _count(db, PracticeApplication, PracticeApplication.state == "applied"),
        },
        "most_missed": [row for row in ranked if row["accuracy"] is not None][:8],
        "most_practiced": sorted(
            ranked, key=lambda item: -item["attempts"]
        )[:8],
        "strongest_concepts": [
            {"concept_id": concept_id, "mastery": clean_int(mastery, 0, 0, 100),
             "name": concept_name(db, concept_id)}
            for concept_id, mastery in strongest
        ],
        "question_types": [
            {"type": key, "attempts": len([row for row in attempts if row.question_type == key])}
            for key in QUESTION_TYPES
        ],
        "events": events,
        "language_usage": [
            {"language": code, "events": total} for code, total in language_usage.items()
        ],
    }