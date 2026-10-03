"""Public Practice API.

Practice is active recall: the learner is asked to retrieve, gets told *why*,
and is then pushed towards doing something with it. Nothing here requires an
account - like Learn, progress is keyed by the anonymous ``X-Learn-Client`` id
the whole site already keeps, and those rows are folded into the account on
sign-in (see ``/practice/progress/merge``).

Three rules shape every endpoint in this module:

1. The browser never learns the answer. ``public_question`` ships the prompt
   and options only; correctness is derived here, after the learner answers.
2. Grading happens once. An attempt is unique per (session, question), so a
   replayed or forged request can never farm XP or double-count mastery.
3. A failure is never destructive. A dropped connection loses nothing: the
   session row keeps its position and the answers already graded stay graded.
"""

import random
import re
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from jose import JWTError, jwt
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import ALGORITHM, SECRET_KEY
from app.database import get_db
from app.learn_content import (
    clamp_text,
    clean_id,
    clean_int,
    clean_language,
    clean_slug,
    iso,
    now,
    translation_map,
)
from app.models.learn import LearnLesson
from app.models.practice import (
    Achievement,
    AchievementTranslation,
    ApplicationChallenge,
    ApplicationChallengeTranslation,
    ConceptMastery,
    PracticeAchievement,
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
    PracticeSetTranslation,
    PracticeSettings,
    QuestionMastery,
)
from app.models.user import User
from app.practice_content import (
    APPLICATION_STATES,
    DEFAULT_ACHIEVEMENTS,
    DEFAULT_SETTINGS,
    MAX_TAKEAWAY,
    QUESTION_TYPES,
    achievement_metric_value,
    blended_confidence,
    concept_row,
    correct_answer_summary,
    estimated_minutes,
    feedback_payload,
    grade_answer,
    interleave_by_concept,
    iso as practice_iso,
    mastery_stage,
    next_review_date,
    priority_score,
    progress_row,
    public_question,
    session_size,
    updated_mastery,
    SW_ACHIEVEMENT_DESCRIPTIONS,
    SW_ACHIEVEMENT_TITLES,
)
from app.routes.learn import CLIENT_ID_PATTERN, optional_user


router = APIRouter(prefix="/practice", tags=["Practice"])


# ---------------------------------------------------------------------------
# Learner identity
#
# Exactly as Learn does it: a signed-in visitor is keyed by user id, everyone
# else by the device id kept in local storage. Both are accepted on every
# route so Practice never has to ask anyone to register.
# ---------------------------------------------------------------------------

def practice_client_id(request: Request) -> str | None:
    raw = request.headers.get("X-Learn-Client", "")
    return raw if CLIENT_ID_PATTERN.match(raw or "") else None


def learner(request: Request, db: Session) -> dict[str, Any]:
    return {"user": optional_user(request, db), "client_id": practice_client_id(request)}


def require_learner(owner: dict[str, Any]) -> None:
    if owner["user"] is None and not owner["client_id"]:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "learner_unknown",
                "message": "Practice needs either a signed-in account or this device's id.",
            },
        )


def owner_columns(owner: dict[str, Any]) -> dict[str, Any]:
    """The (user_id, client_id) pair to stamp on new rows."""
    return {
        "user_id": owner["user"].id if owner["user"] is not None else None,
        "client_id": owner["client_id"] if owner["user"] is None else None,
    }


def owner_filter(model, owner: dict[str, Any]):
    """Match this learner's rows - including anonymous rows on the same device."""
    user = owner["user"]
    clauses = []
    if user is not None:
        clauses.append(model.user_id == user.id)
    if owner["client_id"]:
        clauses.append(model.client_id == owner["client_id"])
    if not clauses:
        return None
    return or_(*clauses)


def single_owner_row(db: Session, model, owner: dict[str, Any], *, create: bool = False):
    """Fetch (or create) the one row per learner for a progress-style table.

    The created row is added to the session here, so callers can just mutate
    and flush it - a row built but never added would silently vanish on
    commit, which is exactly the sort of lost progress this feature cannot
    afford.
    """
    condition = owner_filter(model, owner)
    if condition is not None:
        row = db.execute(select(model).where(condition)).scalars().first()
        if row is not None:
            return row
    if not create:
        return None
    row = model(**owner_columns(owner))
    db.add(row)
    return row


def settings_for(db: Session) -> dict[str, Any]:
    """Admin-configurable knobs, falling back to the shipped defaults.

    Reading is deliberately forgiving: a half-filled settings row still yields
    a usable configuration rather than an error on the learner's dashboard.
    """
    row = db.get(PracticeSettings, "singleton")
    merged = {key: value for key, value in DEFAULT_SETTINGS.items()}
    if row is not None:
        for key, value in (
            ("mastery_thresholds", row.mastery_thresholds),
            ("xp_values", row.xp_values),
            ("review_intervals", row.review_intervals),
            ("session_sizes", row.session_sizes),
            ("streak_settings", row.streak_settings),
            ("reminder_defaults", row.reminder_defaults),
        ):
            if isinstance(value, dict) and value:
                base = dict(merged.get(key) or {})
                base.update(value)
                merged[key] = base
            elif isinstance(value, list) and value:
                merged[key] = value
        merged["question_limit"] = clean_int(row.question_limit, 40, 1, 500)
        enabled = row.enabled_types
        if isinstance(enabled, list) and enabled:
            merged["enabled_types"] = [
                item for item in enabled if item in QUESTION_TYPES
            ]
    return merged


# ---------------------------------------------------------------------------
# Mastery updates
# ---------------------------------------------------------------------------

def touch_concept_mastery(
    db: Session,
    owner: dict[str, Any],
    concept_id: int,
    *,
    correct: bool | None,
    weight: int,
    confidence: int | None,
    config: dict[str, Any],
) -> dict[str, Any]:
    """Apply one graded answer to the learner's grasp of a concept.

    The update is additive and gentle: a wrong answer costs a few points and
    pulls the next review closer, rather than wiping out real progress. This
    is the no-shame rule expressed in arithmetic.
    """
    row = db.execute(
        select(ConceptMastery)
        .where(ConceptMastery.concept_id == concept_id)
        .where(owner_filter(ConceptMastery, owner))
    ).scalars().first()
    if row is None:
        row = ConceptMastery(concept_id=concept_id, **owner_columns(owner))
        db.add(row)

    attempts = clean_int(row.attempt_count, 0, 0, 10_000_000) + 1
    row.attempt_count = attempts
    if correct is True:
        row.correct_count = clean_int(row.correct_count, 0, 0, 10_000_000) + 1
        row.streak = clean_int(row.streak, 0, 0, 1000) + 1
        row.last_correct = now()
    elif correct is False:
        row.incorrect_count = clean_int(row.incorrect_count, 0, 0, 10_000_000) + 1
        row.streak = 0
    else:
        # A reflection counts as engagement but never as mastery.
        row.streak = max(0, clean_int(row.streak, 0, 0, 1000))

    row.mastery = updated_mastery(row.mastery, correct=correct, weight=weight)
    row.confidence = blended_confidence(row.confidence, confidence, attempts)
    row.last_attempted = now()
    row.next_review = next_review_date(row.streak, correct, config.get("review_intervals"))
    db.flush()
    return {
        "concept_id": concept_id,
        "mastery": row.mastery,
        "stage": mastery_stage(row.mastery, config.get("mastery_thresholds")),
        "next_review": iso(row.next_review),
    }


def touch_question_mastery(
    db: Session,
    owner: dict[str, Any],
    question: PracticeQuestion,
    *,
    correct: bool | None,
    confidence: int | None,
    config: dict[str, Any],
) -> None:
    """Per-question scheduling, so one stubborn item can return sooner."""
    row = db.execute(
        select(QuestionMastery)
        .where(QuestionMastery.question_id == question.id)
        .where(owner_filter(QuestionMastery, owner))
    ).scalars().first()
    if row is None:
        row = QuestionMastery(
            question_id=question.id,
            concept_id=question.concept_id,
            **owner_columns(owner),
        )
        db.add(row)

    attempts = clean_int(row.attempt_count, 0, 0, 10_000_000) + 1
    row.attempt_count = attempts
    if correct is True:
        row.correct_count = clean_int(row.correct_count, 0, 0, 10_000_000) + 1
    elif correct is False:
        row.incorrect_count = clean_int(row.incorrect_count, 0, 0, 10_000_000) + 1
    row.confidence = blended_confidence(row.confidence, confidence, attempts)
    row.last_attempted = now()

    intervals = config.get("review_intervals") or []
    rung = clean_int(row.correct_count, 0, 0, 100)
    days = clean_int(
        intervals[rung] if isinstance(intervals, list) and 0 <= rung < len(intervals) else 1,
        1,
        1,
        365,
    )
    if correct is False:
        days = 1
    row.next_review = now() + timedelta(days=days)
    db.flush()


def xp_award(config: dict[str, Any], kind: str, *, bonus: bool = False) -> int:
    """XP is always computed here - the client never proposes a value."""
    values = config.get("xp_values") or {}
    amount = clean_int(values.get(kind), 0, 0, 1000)
    if bonus and kind == "correct":
        amount += clean_int(values.get("review"), 0, 0, 1000)
    return amount

# ---------------------------------------------------------------------------
# The question pool
# ---------------------------------------------------------------------------

def published_questions(
    db: Session,
    language: str,
    *,
    concept_ids: list[int] | None = None,
    limit: int = 400,
) -> list[tuple[PracticeQuestion, PracticeQuestionTranslation]]:
    """Published questions that actually exist in the requested language.

    The language filter is a join, not a fallback: a question with no
    Swahili translation is *absent* from a Swahili session rather than
    silently shown in English. That is what keeps the two languages from
    ever bleeding into each other.
    """
    query = (
        select(PracticeQuestion, PracticeQuestionTranslation)
        .join(
            PracticeQuestionTranslation,
            PracticeQuestionTranslation.question_id == PracticeQuestion.id,
        )
        .join(PracticeConcept, PracticeConcept.id == PracticeQuestion.concept_id)
        .where(
            PracticeQuestion.status == "published",
            PracticeQuestion.deleted_at.is_(None),
            PracticeConcept.status == "published",
            PracticeConcept.deleted_at.is_(None),
            PracticeQuestionTranslation.language == language,
            PracticeQuestionTranslation.prompt != "",
        )
        .order_by(
            PracticeConcept.display_order.asc(),
            PracticeQuestion.display_order.asc(),
            PracticeQuestion.id.asc(),
        )
        .limit(limit)
    )
    if concept_ids:
        query = query.where(PracticeQuestion.concept_id.in_(concept_ids))
    return [(row[0], row[1]) for row in db.execute(query).all()]


def concept_names(db: Session, language: str, concept_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not concept_ids:
        return {}
    rows = db.execute(
        select(PracticeConcept, PracticeConceptTranslation)
        .join(
            PracticeConceptTranslation,
            PracticeConceptTranslation.concept_id == PracticeConcept.id,
        )
        .where(
            PracticeConcept.id.in_(concept_ids),
            PracticeConceptTranslation.language == language,
        )
    ).all()
    return {
        concept.id: {
            "id": concept.id,
            "name": clamp_text(translation.name, 200),
            "prep": clamp_text(translation.prep, 2000) or None,
        }
        for concept, translation in rows
    }


def mastery_maps(
    db: Session,
    owner: dict[str, Any],
    question_ids: list[int],
    concept_ids: list[int],
) -> tuple[dict[int, Any], dict[int, Any]]:
    """This learner's per-question and per-concept records for a pool."""
    question_rows: dict[int, Any] = {}
    concept_records: dict[int, Any] = {}

    question_condition = owner_filter(QuestionMastery, owner)
    if question_condition is not None and question_ids:
        question_rows = {
            row.question_id: row
            for row in db.execute(
                select(QuestionMastery).where(
                    QuestionMastery.question_id.in_(question_ids),
                    question_condition,
                )
            ).scalars().all()
        }

    concept_condition = owner_filter(ConceptMastery, owner)
    if concept_condition is not None and concept_ids:
        concept_records = {
            row.concept_id: row
            for row in db.execute(
                select(ConceptMastery).where(
                    ConceptMastery.concept_id.in_(concept_ids),
                    concept_condition,
                )
            ).scalars().all()
        }

    return question_rows, concept_records


def choose_questions(
    db: Session,
    owner: dict[str, Any],
    language: str,
    *,
    count: int,
    concept_ids: list[int] | None = None,
    exclude_ids: list[int] | None = None,
) -> list[tuple[PracticeQuestion, PracticeQuestionTranslation]]:
    """Rank the pool by usefulness, then interleave so topics stay mixed."""
    pool = published_questions(db, language, concept_ids=concept_ids)
    if exclude_ids:
        excluded = set(exclude_ids)
        pool = [item for item in pool if item[0].id not in excluded]
    if not pool:
        return []

    question_ids = [question.id for question, _ in pool]
    concept_id_list = list({question.concept_id for question, _ in pool})
    question_rows, concept_records = mastery_maps(db, owner, question_ids, concept_id_list)

    reference = now()
    ranked = [
        (
            question,
            priority_score(
                question_rows.get(question.id),
                concept_records.get(question.concept_id),
                at=reference,
            ),
        )
        for question, _ in pool
    ]
    ranked.sort(key=lambda item: (-item[1], item[0].concept_id, item[0].id))

    chosen = interleave_by_concept(ranked, count)
    chosen_ids = {question.id for question in chosen}
    # Return pool order so the stored (admin-approved) sequence is preserved.
    return [
        (question, translation)
        for question, translation in pool
        if question.id in chosen_ids
    ]


def practice_set_question_ids(
    db: Session,
    practice_set: PracticeSet,
    language: str,
    owner: dict[str, Any],
    count: int,
) -> list[int]:
    """Resolve a set to question ids, honouring manual/automatic/hybrid.

    Manual uses the admin's own ordering. Automatic and hybrid delegate to the
    same scheduler the public "continue" flow uses, so a set and a free
    session never feel like different systems.
    """
    from app.models.practice import PracticeSetQuestion

    if practice_set.mode == "manual":
        rows = db.execute(
            select(PracticeSetQuestion.question_id, PracticeSetQuestion.position)
            .join(PracticeQuestion, PracticeQuestion.id == PracticeSetQuestion.question_id)
            .join(
                PracticeQuestionTranslation,
                PracticeQuestionTranslation.question_id == PracticeQuestion.id,
            )
            .where(
                PracticeSetQuestion.set_id == practice_set.id,
                PracticeQuestion.status == "published",
                PracticeQuestion.deleted_at.is_(None),
                PracticeQuestionTranslation.language == language,
                PracticeQuestionTranslation.prompt != "",
            )
            .order_by(PracticeSetQuestion.position.asc())
        ).all()
        return [row[0] for row in rows][:count]

    rules = practice_set.rules if isinstance(practice_set.rules, dict) else {}
    concept_ids = [
        clean_id(item) for item in (practice_set.concept_ids or []) if clean_id(item)
    ]
    selected: list[tuple[PracticeQuestion, PracticeQuestionTranslation]] = []
    seen: set[int] = set()

    # Hybrid: the admin's explicit asks first (weak concepts, new concepts),
    # then the scheduler tops the set up so the promised count is honoured.
    if practice_set.mode == "hybrid":
        weak_target = clean_int(rules.get("weak_concepts"), 0, 0, 20)
        new_target = clean_int(rules.get("new_concepts"), 0, 0, 20)

        if weak_target:
            weak_ids = [
                row.concept_id
                for row in db.execute(
                    select(ConceptMastery.concept_id)
                    .where(owner_filter(ConceptMastery, owner))
                    .where(ConceptMastery.mastery <= 60)
                    .order_by(ConceptMastery.mastery.asc())
                ).scalars().all()
            ]
            for concept_id in [cid for cid in weak_ids if not concept_ids or cid in concept_ids][
                :weak_target
            ]:
                for question, translation in choose_questions(
                    db, owner, language, count=2, concept_ids=[concept_id]
                ):
                    if question.id not in seen:
                        seen.add(question.id)
                        selected.append((question, translation))

        if new_target:
            for concept_id in (concept_ids or [])[:new_target]:
                for question, translation in choose_questions(
                    db, owner, language, count=2, concept_ids=[concept_id]
                ):
                    if question.id not in seen:
                        seen.add(question.id)
                        selected.append((question, translation))

    for question, translation in choose_questions(
        db, owner, language, count=count, concept_ids=concept_ids or None
    ):
        if question.id not in seen:
            seen.add(question.id)
            selected.append((question, translation))
        if len(seen) >= count:
            break

    return [question.id for question, _ in selected][:count]

    concept_condition = owner_filter(ConceptMastery, owner)
    if concept_condition is not None and concept_ids:
        concept_records = {
            row.concept_id: row
            for row in db.execute(
                select(ConceptMastery).where(
                    ConceptMastery.concept_id.in_(concept_ids),
                    concept_condition,
                )
            ).scalars().all()
        }

    return question_rows, concept_records


# ---------------------------------------------------------------------------
# Progress, streaks, XP and achievements
# ---------------------------------------------------------------------------

def progress_for(db: Session, owner: dict[str, Any], *, create: bool = False):
    return single_owner_row(db, PracticeProgress, owner, create=create)


def update_streak(progress: Any) -> int:
    """Count consecutive practice days - without ever scolding a lapse.

    A missed day simply starts a new count. The UI is responsible for the
    warm "welcome back" wording; this only keeps the arithmetic honest.
    """
    today = date.today()
    last = progress.last_practice_date
    if last is None:
        progress.streak = 1
    elif last == today:
        progress.streak = max(1, clean_int(progress.streak, 1, 0, 100000))
    elif (today - last).days == 1:
        progress.streak = clean_int(progress.streak, 0, 0, 100000) + 1
    else:
        progress.streak = 1
    progress.best_streak = max(
        clean_int(progress.best_streak, 0, 0, 100000),
        clean_int(progress.streak, 0, 0, 100000),
    )
    progress.last_practice_date = today
    return progress.streak


def add_xp(progress: Any, amount: int) -> int:
    progress.xp = clean_int(progress.xp, 0, 0, 10_000_000) + max(0, clean_int(amount, 0, 0, 10000))
    return progress.xp


def record_event(
    db: Session,
    *,
    event_type: str,
    owner: dict[str, Any],
    language: str,
    session_id: int | None = None,
    concept_id: int | None = None,
    question_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Analytics must never break a practice session."""
    db.add(
        PracticeEvent(
            event_type=clamp_text(event_type, 30) or "session_start",
            session_id=session_id,
            concept_id=concept_id,
            question_id=question_id,
            language=language,
            user_id=owner["user"].id if owner["user"] is not None else None,
            client_id=owner["client_id"] if owner["user"] is None else None,
            event_metadata=metadata or {},
        )
    )


def ensure_achievement_definitions(db: Session) -> None:
    """Seed the milestone catalogue once, in both languages.

    Definitions are rows rather than constants so their wording is
    translatable content and the threshold is admin-tunable.
    """
    existing = {
        row.key
        for row in db.execute(select(Achievement)).scalars().all()
    }
    for order, (key, title_en, description_en, requirement, reward) in enumerate(DEFAULT_ACHIEVEMENTS):
        if key in existing:
            continue
        row = Achievement(
            key=key,
            requirement=requirement,
            xp_reward=reward,
            display_order=order,
            active=True,
        )
        row.translations.append(
            AchievementTranslation(language="en", title=title_en, description=description_en)
        )
        row.translations.append(
            AchievementTranslation(
                language="sw",
                title=SW_ACHIEVEMENT_TITLES.get(key, title_en),
                description=SW_ACHIEVEMENT_DESCRIPTIONS.get(key, description_en),
            )
        )
        db.add(row)
    db.flush()


def earned_achievement_keys(db: Session, owner: dict[str, Any]) -> set[int]:
    condition = owner_filter(PracticeAchievement, owner)
    if condition is None:
        return set()
    # Selecting a column returns plain ids, not rows.
    return set(
        db.execute(
            select(PracticeAchievement.achievement_id).where(condition)
        ).scalars().all()
    )


def award_achievements(
    db: Session,
    owner: dict[str, Any],
    progress: Any,
    language: str,
) -> list[dict[str, Any]]:
    """Check the catalogue against the learner's totals; return new unlocks."""
    # Seeded here rather than only on the achievements screen, so a learner's
    # very first session can still earn their first milestone.
    ensure_achievement_definitions(db)
    unlocked = earned_achievement_keys(db, owner)
    new_rows: list[dict[str, Any]] = []

    rows = db.execute(select(Achievement).where(Achievement.active.is_(True))).scalars().all()
    for achievement in rows:
        if achievement.id in unlocked:
            continue
        requirement = achievement.requirement if isinstance(achievement.requirement, dict) else {}
        metric = clamp_text(requirement.get("metric"), 30) or "questions"
        threshold = clean_int(requirement.get("threshold"), 1, 1, 10_000_000)
        if achievement_metric_value(progress, metric) < threshold:
            continue

        db.add(PracticeAchievement(achievement_id=achievement.id, **owner_columns(owner)))
        reward = clean_int(achievement.xp_reward, 0, 0, 10000)
        if reward:
            add_xp(progress, reward)
        translation = translation_map(list(achievement.translations)).get(language)
        new_rows.append({
            "key": achievement.key,
            "title": clamp_text(getattr(translation, "title", ""), 200) or achievement.key,
            "description": clamp_text(getattr(translation, "description", None), 600) or None,
            "xp": reward,
        })

    if new_rows:
        db.flush()
    return new_rows

def reminder_row(progress: Any, config: dict[str, Any]) -> dict[str, Any]:
    """The learner's own reminder preference (section 23).

    Opt-in, always visible, always switchable off - the copy never implies the
    learner is falling behind.
    """
    defaults = config.get("reminder_defaults") or {}
    return {
        "enabled": bool(getattr(progress, "reminder_enabled", False)) if progress is not None else False,
        "frequency": clamp_text(getattr(progress, "reminder_frequency", ""), 20) or clamp_text(defaults.get("frequency"), 20) or "daily",
        "time": clamp_text(getattr(progress, "reminder_time", ""), 8) or clamp_text(defaults.get("time"), 8) or "08:00",
        "options": ["daily", "weekdays", "weekly", "off"],
    }


def session_payload(
    db: Session,
    session_row: PracticeSession,
    language: str,
) -> dict[str, Any]:
    """Everything the session screen needs - and nothing it shouldn't have."""
    attempts = {
        row.question_id
        for row in db.execute(
            select(PracticeAttempt).where(PracticeAttempt.session_id == session_row.id)
        ).scalars().all()
    }
    question_ids = [clean_id(item) for item in (session_row.question_ids or [])]
    question_ids = [item for item in question_ids if item]
    question_rows = (
        db.execute(
            select(PracticeQuestion, PracticeQuestionTranslation)
            .join(
                PracticeQuestionTranslation,
                PracticeQuestionTranslation.question_id == PracticeQuestion.id,
            )
            .where(
                PracticeQuestion.id.in_(question_ids),
                PracticeQuestionTranslation.language == language,
            )
        ).all()
    ) if question_ids else []
    by_id = {question.id: (question, translation) for question, translation in question_rows}
    names = concept_names(db, language, [question.concept_id for question, _ in question_rows])

    questions: list[dict[str, Any]] = []
    for question_id in question_ids:
        pair = by_id.get(question_id)
        if pair is None:
            # Content was unpublished mid-session; skip it rather than
            # breaking the learner's run.
            continue
        question, translation = pair
        payload = public_question(
            question,
            translation,
            concept=names.get(question.concept_id),
        )
        payload["answered"] = question_id in attempts
        questions.append(payload)

    return {
        "id": session_row.id,
        "mode": session_row.mode,
        "language": session_row.language,
        "status": session_row.status,
        "position": clean_int(session_row.position, 0, 0, 1000),
        "total": len(question_ids),
        "answered": clean_int(session_row.answered_count, 0, 0, 1000),
        "correct": clean_int(session_row.correct_count, 0, 0, 1000),
        "xp_earned": clean_int(session_row.xp_earned, 0, 0, 1000000),
        "estimated_minutes": estimated_minutes(len(question_ids)),
        "started_at": iso(session_row.started_at),
        "questions": questions,
    }


def prep_cards(
    db: Session,
    session_row: PracticeSession,
    language: str,
    owner: dict[str, Any],
) -> list[dict[str, Any]]:
    """A one-screen "remember this" for concepts the learner has not met.

    Cognitive load matters: a first encounter with a topic should begin with a
    sentence of orientation, not an exam.
    """
    question_ids = [clean_id(item) for item in (session_row.question_ids or [])]
    question_ids = [item for item in question_ids if item]
    if not question_ids:
        return []

    concept_ids = [
        row
        for row in db.execute(
            select(PracticeQuestion.concept_id)
            .where(PracticeQuestion.id.in_(question_ids))
            .distinct()
        ).scalars().all()
    ]
    if not concept_ids:
        return []

    seen: set[int] = set()
    condition = owner_filter(ConceptMastery, owner)
    if condition is not None:
        # Selecting a column returns plain values, so iterate them directly.
        seen = {
            row
            for row in db.execute(
                select(ConceptMastery.concept_id).where(
                    ConceptMastery.concept_id.in_(concept_ids),
                    condition,
                )
            ).scalars().all()
        }

    unseen = [cid for cid in concept_ids if cid not in seen]
    if not unseen:
        return []
    names = concept_names(db, language, unseen)
    return [
        {
            "concept_id": concept_id,
            "name": names.get(concept_id, {}).get("name", ""),
            "remember": names.get(concept_id, {}).get("prep"),
        }
        for concept_id in unseen
        if names.get(concept_id, {}).get("prep")
    ]


def application_row(db: Session, application: Any, language: str) -> dict[str, Any] | None:
    """One learner + one challenge, in the requested language."""
    if application is None:
        return None
    challenge = db.get(ApplicationChallenge, application.challenge_id)
    if challenge is None or challenge.deleted_at is not None:
        return None
    translation = translation_map(list(challenge.translations)).get(language)
    if translation is None:
        translation = translation_map(list(challenge.translations)).get("en")
    return {
        "id": application.id,
        "challenge_id": application.challenge_id,
        "state": application.state,
        "title": clamp_text(getattr(translation, "title", ""), 200),
        "prompt": clamp_text(getattr(translation, "prompt", None), MAX_TAKEAWAY) or None,
        "commitment_text": clamp_text(application.commitment_text, 2000) or None,
        "commitment_when": clamp_text(application.commitment_when, 200) or None,
        "commitment_where": clamp_text(application.commitment_where, 200) or None,
        "skipped": bool(application.skipped),
        "updated_at": iso(application.updated_at),
    }


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


def attempt_response(
    db: Session,
    session_row: PracticeSession,
    attempt: PracticeAttempt,
    language: str,
    config: dict[str, Any],
    *,
    mastery: dict[str, Any] | None = None,
    repeated: bool = False,
) -> dict[str, Any]:
    """The teaching moment: verdict, reason, takeaway, and where to go deeper."""
    question, translation = question_with_translation(db, attempt.question_id, language)
    if question is None or translation is None:
        return {
            "feedback": {
                "correct": attempt.correct,
                "verdict": "feedback_not_quite" if attempt.correct is False else "feedback_correct",
                "correct_answer": None,
                "explanation": None,
                "takeaway": None,
            },
            "mastery": mastery or {"concept_id": None, "mastery": None, "stage": "new"},
            "xp": 0,
            "repeated": repeated,
            "lesson": None,
            "session": {
                "id": session_row.id,
                "answered": clean_int(session_row.answered_count, 0, 0, 1000),
                "correct": clean_int(session_row.correct_count, 0, 0, 1000),
                "total": len([i for i in (session_row.question_ids or []) if clean_id(i)]),
                "position": clean_int(session_row.position, 0, 0, 1000),
                "xp_earned": clean_int(session_row.xp_earned, 0, 0, 1_000_000),
                "status": session_row.status,
            },
        }

    lesson = db.get(LearnLesson, question.learn_lesson_id) if question.learn_lesson_id else None
    lesson_link = None
    if lesson is not None and lesson.status == "published" and lesson.deleted_at is None:
        lesson_link = {"id": lesson.id, "slug": lesson.slug}

    return {
        "feedback": feedback_payload(
            question,
            translation,
            correct=attempt.correct,
            correct_answer=(
                correct_answer_summary(question, translation)
                if QUESTION_TYPES.get(question.question_type, {}).get("graded")
                else None
            ),
            language=language,
        ),
        "mastery": mastery or {"concept_id": question.concept_id, "mastery": None, "stage": "new"},
        "xp": clean_int(attempt.xp_awarded, 0, 0, 10000),
        "repeated": repeated,
        "lesson": lesson_link,
        "confidence_recorded": attempt.confidence,
        "session": {
            "id": session_row.id,
            "answered": clean_int(session_row.answered_count, 0, 0, 1000),
            "correct": clean_int(session_row.correct_count, 0, 0, 1000),
            "total": len([i for i in (session_row.question_ids or []) if clean_id(i)]),
            "position": clean_int(session_row.position, 0, 0, 1000),
            "xp_earned": clean_int(session_row.xp_earned, 0, 0, 1_000_000),
            "status": session_row.status,
        },
    }


def requested_language(request: Request) -> str:
    params = request.query_params
    return clean_language(params.get("lang") or params.get("language"))


def missing_translation(language: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={
            "code": "translation_missing",
            "message": "This content is not available in that language yet.",
            "language": language,
        },
    )


def new_session(
    db: Session,
    owner: dict[str, Any],
    language: str,
    *,
    mode: str,
    count: int,
    concept_ids: list[int] | None = None,
    set_id: int | None = None,
) -> PracticeSession:
    """Free a session, or a set-driven one, into a frozen question list."""
    if set_id:
        practice_set = db.get(PracticeSet, set_id)
        if practice_set is None or practice_set.deleted_at is not None:
            raise HTTPException(status_code=404, detail="That practice set is not available.")
        if practice_set.status != "published":
            raise HTTPException(
                status_code=404, detail="That practice set is not available yet."
            )
        question_ids = practice_set_question_ids(db, practice_set, language, owner, count)
        mode = "set"
    else:
        question_ids = [
            question.id
            for question, _ in choose_questions(
                db, owner, language, count=count, concept_ids=concept_ids or None
            )
        ]

    session_row = PracticeSession(
        language=language,
        mode=mode,
        set_id=set_id,
        question_ids=question_ids,
        **owner_columns(owner),
    )
    db.add(session_row)
    record_event(db, event_type="session_start", owner=owner, language=language)
    db.flush()
    return session_row


@router.post("/sessions")
def start_session(
    request: Request,
    payload: dict = Body(default={}),
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Start a session: work out the size, pick the questions, hand them over.

    A concept the learner has never met comes back with a short preparation
    note, so the first question is never an ambush.
    """
    language = clean_language(language)
    owner = learner(request, db)
    require_learner(owner)
    config = settings_for(db)
    source = payload if isinstance(payload, dict) else {}

    mode = clamp_text(source.get("mode"), 20) or "normal"
    minutes = clean_int(source.get("minutes"), 0, 0, 120) or None
    limit = clean_int(config.get("question_limit"), 40, 1, 500)
    count = clean_int(source.get("count"), 0, 0, limit)
    if not count:
        count = session_size(mode, minutes, config.get("session_sizes"))
    count = clean_int(count, 1, 1, limit)

    concept_ids = [
        clean_id(item) for item in (source.get("concept_ids") or []) if clean_id(item)
    ]
    single_concept = clean_id(source.get("concept_id"))
    if single_concept:
        concept_ids.append(single_concept)
    if mode == "topic" and not concept_ids:
        raise HTTPException(
            status_code=400,
            detail={"code": "concept_required", "message": "Choose a topic to practise."},
        )

    set_id = clean_id(source.get("set_id"))

    # Resuming is just starting again with the same frozen list.
    resume_id = clean_id(source.get("resume_session_id"))
    if resume_id and not set_id and not concept_ids:
        condition = owner_filter(PracticeSession, owner)
        mine = (
            db.execute(
                select(PracticeSession).where(
                    PracticeSession.id == resume_id,
                    condition,
                    PracticeSession.status == "in_progress",
                )
            ).scalars().first()
            if condition is not None
            else None
        )
        if mine is not None:
            result = session_payload(db, mine, language)
            result["prep"] = []
            return result

    session_row = new_session(
        db,
        owner,
        language,
        mode=mode,
        count=count,
        concept_ids=concept_ids or None,
        set_id=set_id,
    )
    cards = prep_cards(db, session_row, language, owner)
    db.commit()
    db.refresh(session_row)

    result = session_payload(db, session_row, language)
    result["prep"] = cards
    return result
    params = request.query_params
    return clean_language(params.get("lang") or params.get("language"))


def concept_mastery_payload(
    db: Session,
    owner: dict[str, Any],
    language: str,
    config: dict[str, Any],
    *,
    needs_review_first: bool = False,
) -> list[dict[str, Any]]:
    """Published concepts with this learner's mastery, strongest first.

    Ordering puts what needs attention at the top, because the dashboard's
    job is to answer "what should I do next?" rather than to be a catalogue.
    """
    rows = db.execute(
        select(PracticeConcept, PracticeConceptTranslation)
        .join(
            PracticeConceptTranslation,
            PracticeConceptTranslation.concept_id == PracticeConcept.id,
        )
        .where(
            PracticeConcept.status == "published",
            PracticeConcept.deleted_at.is_(None),
            PracticeConceptTranslation.language == language,
            PracticeConceptTranslation.name != "",
        )
        .order_by(PracticeConcept.display_order.asc(), PracticeConcept.id.asc())
    ).all()
    if not rows:
        return []

    concept_ids = [concept.id for concept, _ in rows]
    _question_rows, mastery_records = mastery_maps(db, owner, [], concept_ids)

    payloads = [
        concept_row(
            concept,
            translation,
            mastery_records.get(concept.id),
            config.get("mastery_thresholds"),
        )
        for concept, translation in rows
    ]
    for payload in payloads:
        payload["practised"] = payload["attempt_count"] > 0

    if needs_review_first:
        reference = now()
        due = [
            item
            for item in payloads
            if item["practised"] and item["mastery"] < 100
            and (not item["next_review"] or item["next_review"] <= reference.isoformat())
        ]
        due.sort(key=lambda item: item["mastery"])
        return due + [item for item in payloads if item not in due]
    return payloads


def session_owned_by(db: Session, session_id: int, owner: dict[str, Any]) -> PracticeSession:
    condition = owner_filter(PracticeSession, owner)
    row = (
        db.execute(
            select(PracticeSession).where(
                PracticeSession.id == session_id,
                condition,
            )
        ).scalars().first()
        if condition is not None
        else None
    )
    if row is None:
        # Never confirm someone else's session exists.
        raise HTTPException(status_code=404, detail="That practice session was not found.")
    return row


@router.get("/sessions/{session_id}")
def resume_session(
    session_id: int,
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Hand the session back exactly as it was - the offline-recovery path.

    If the connection dropped mid-session, the learner returns to their
    position with the answers already graded still counted.
    """
    language = clean_language(language)
    owner = learner(request, db)
    require_learner(owner)
    session_row = session_owned_by(db, session_id, owner)
    result = session_payload(db, session_row, language)
    result["prep"] = []
    return result


def question_with_translation(
    db: Session,
    question_id: int,
    language: str,
) -> tuple[PracticeQuestion | None, PracticeQuestionTranslation | None]:
    row = db.execute(
        select(PracticeQuestion, PracticeQuestionTranslation)
        .join(
            PracticeQuestionTranslation,
            PracticeQuestionTranslation.question_id == PracticeQuestion.id,
        )
        .where(
            PracticeQuestion.id == question_id,
            PracticeQuestionTranslation.language == language,
        )
    ).first()
    if row is None:
        return None, None
    return row[0], row[1]


def _safe_answer(answer: dict[str, Any]) -> dict[str, Any]:
    """Store only a small, bounded copy of what was submitted."""
    stored: dict[str, Any] = {}
    if "index" in answer:
        stored["index"] = clean_int(answer.get("index"), -1, -1, 100)
    if "value" in answer:
        stored["value"] = bool(answer.get("value"))
    if isinstance(answer.get("indexes"), list):
        stored["indexes"] = [
            clean_int(item, -1, -1, 100)
            for item in answer["indexes"]
            if isinstance(item, (int, float)) and not isinstance(item, bool)
        ][:20]
    if isinstance(answer.get("order"), list):
        stored["order"] = [clean_int(item, -1, -1, 100) for item in answer["order"]][:20]
    if isinstance(answer.get("pairs"), dict):
        stored["pairs"] = {
            str(clean_int(key, -1, -1, 100)): clean_int(value, -1, -1, 100)
            for key, value in list(answer["pairs"].items())[:20]
        }
    if "text" in answer:
        stored["text"] = clamp_text(answer.get("text"), 2000)
    return stored


@router.get("/home")
def practice_home(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """The Practice dashboard: what to do next, what needs review, how far along."""
    language = clean_language(language)
    owner = learner(request, db)
    config = settings_for(db)
    ensure_achievement_definitions(db)
    db.commit()

    progress = progress_for(db, owner)
    concepts = concept_mastery_payload(
        db, owner, language, config, needs_review_first=True
    )
    practised = [item for item in concepts if item["practised"]]
    needs_review = [item for item in practised if item["mastery"] < 61]
    strong = [item for item in practised if item["mastery"] >= 61]

    # "Continue" is decided for the learner: the most urgent concept wins,
    # and the reason is returned as a code the UI phrases in its own words.
    focus = None
    if needs_review:
        focus = needs_review[0]
        reason = "needs_review"
    elif practised:
        focus = practised[0]
        reason = "reinforce"
    elif concepts:
        focus = concepts[0]
        reason = "new_concept"
    else:
        reason = "empty"

    count = session_size("normal", None, config.get("session_sizes"))
    resume = db.execute(
        select(PracticeSession)
        .where(owner_filter(PracticeSession, owner))
        .where(PracticeSession.status == "in_progress")
        .order_by(PracticeSession.last_activity_at.desc())
    ).scalars().first()

    application = db.execute(
        select(PracticeApplication)
        .where(owner_filter(PracticeApplication, owner))
        .where(PracticeApplication.skipped.is_(False))
        .order_by(PracticeApplication.updated_at.desc())
    ).scalars().first()

    return {
        "language": language,
        "progress": progress_row(progress),
        "concepts": concepts,
        "needs_review": needs_review[:5],
        "strong": strong[:5],
        "stats": {
            "concepts": len(concepts),
            "practised": len(practised),
            "needs_review": len(needs_review),
            "strong": len(strong),
            "questions_available": db.execute(
                select(func.count())
                .select_from(PracticeQuestion)
                .where(
                    PracticeQuestion.status == "published",
                    PracticeQuestion.deleted_at.is_(None),
                )
            ).scalar_one(),
        },
        "continue": {
            "reason": reason,
            "concept": focus,
            "question_count": count,
            "estimated_minutes": estimated_minutes(count),
            "resume_session_id": resume.id if resume is not None else None,
            "resume_position": clean_int(resume.position, 0, 0, 1000) if resume is not None else 0,
        },
        "application": application_row(db, application, language) if application is not None else None,
        "reminder": reminder_row(progress, config),
        "has_content": bool(concepts),
    }


@router.post("/sessions/{session_id}/answers")
def submit_answer(
    session_id: int,
    request: Request,
    payload: dict = Body(...),
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Grade one answer server-side and return the teaching that follows.

    The request carries only the learner's choice, their confidence and how
    long they took. Correctness, XP and mastery are decided here from stored
    content, so a modified request cannot manufacture any of them.
    """
    language = clean_language(language)
    owner = learner(request, db)
    require_learner(owner)
    config = settings_for(db)
    source = payload if isinstance(payload, dict) else {}

    session_row = session_owned_by(db, session_id, owner)
    if session_row.status == "completed":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "session_completed",
                "message": "This practice session is already finished.",
            },
        )

    question_id = clean_id(source.get("question_id"))
    session_question_ids = [
        clean_id(item) for item in (session_row.question_ids or []) if clean_id(item)
    ]
    if not question_id or question_id not in session_question_ids:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "question_not_in_session",
                "message": "That question is not part of this session.",
            },
        )

    # Idempotency: re-submitting after a dropped response returns the same
    # feedback instead of grading (and paying for) the answer twice.
    existing = db.execute(
        select(PracticeAttempt).where(
            PracticeAttempt.session_id == session_row.id,
            PracticeAttempt.question_id == question_id,
        )
    ).scalars().first()
    if existing is not None:
        return attempt_response(
            db, session_row, existing, language, config, repeated=True
        )

    question, translation = question_with_translation(db, question_id, language)
    if question is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "question_unavailable",
                "message": "That question is no longer available.",
            },
        )

    answer = source.get("answer")
    answer = answer if isinstance(answer, dict) else {}
    confidence_raw = clean_int(source.get("confidence"), 0, 0, 3)
    confidence = confidence_raw if confidence_raw in (1, 2, 3) else None

    correct = grade_answer(
        question.question_type,
        question.config or {},
        answer,
        accepted=list(translation.accepted or []),
    )

    progress = progress_for(db, owner, create=True)
    is_review = clean_int(source.get("is_review"), 0, 0, 1) == 1
    if correct is True:
        award = xp_award(config, "correct", bonus=is_review)
    elif correct is None:
        award = xp_award(config, "reflection")
    else:
        # A miss still earns a little: showing up matters, and we do not want
        # a learner to stop because stopping pays better.
        award = min(2, xp_award(config, "correct"))

    attempt = PracticeAttempt(
        session_id=session_row.id,
        question_id=question.id,
        concept_id=question.concept_id,
        question_version=clean_int(question.version, 1, 1, 100000),
        question_type=question.question_type,
        answer=_safe_answer(answer),
        correct=correct,
        confidence=confidence,
        xp_awarded=award,
        time_spent_ms=clean_int(source.get("time_spent_ms"), 0, 0, 3_600_000),
    )
    db.add(attempt)

    mastery = touch_concept_mastery(
        db,
        owner,
        question.concept_id,
        correct=correct,
        weight=question.weight,
        confidence=confidence,
        config=config,
    )
    touch_question_mastery(
        db,
        owner,
        question,
        correct=correct,
        confidence=confidence,
        config=config,
    )

    session_row.answered_count = clean_int(session_row.answered_count, 0, 0, 1000) + 1
    if correct is True:
        session_row.correct_count = clean_int(session_row.correct_count, 0, 0, 1000) + 1
    session_row.xp_earned = clean_int(session_row.xp_earned, 0, 0, 1_000_000) + award
    session_row.position = clean_int(session_row.answered_count, 0, 0, 1000)
    session_row.last_activity_at = now()
    add_xp(progress, award)
    progress.questions_answered = clean_int(progress.questions_answered, 0, 0, 10_000_000) + 1

    if question.question_type == "reflection":
        record_event(
            db,
            event_type="reflection",
            owner=owner,
            language=language,
            session_id=session_row.id,
            concept_id=question.concept_id,
            question_id=question.id,
        )

    db.flush()
    # Commit before answering: a lost answer must never be possible just
    # because the request handler finished.
    db.commit()
    return attempt_response(db, session_row, attempt, language, config, mastery=mastery)


def pick_challenge(
    db: Session,
    concept_id: int | None,
) -> ApplicationChallenge | None:
    """A published challenge for the topic just practised, or any topic."""
    query = select(ApplicationChallenge).where(
        ApplicationChallenge.status == "published",
        ApplicationChallenge.deleted_at.is_(None),
    )
    if concept_id:
        row = db.execute(
            query.where(ApplicationChallenge.concept_id == concept_id)
            .order_by(ApplicationChallenge.display_order.asc())
        ).scalars().first()
        if row is not None:
            return row
    return db.execute(
        query.order_by(ApplicationChallenge.display_order.asc(), ApplicationChallenge.id.asc())
    ).scalars().first()


@router.post("/sessions/{session_id}/complete")
def complete_session(
    session_id: int,
    request: Request,
    payload: dict = Body(default={}),
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Close the loop: what was strengthened, what to revisit, what to do.

    The summary is deliberately short (section 22). The challenge at the end
    is the bridge from knowing something to doing something.
    """
    language = clean_language(language)
    owner = learner(request, db)
    require_learner(owner)
    config = settings_for(db)

    session_row = session_owned_by(db, session_id, owner)
    if session_row.status == "completed":
        return summary_payload(db, session_row, language, config, owner, repeated=True)

    attempts = db.execute(
        select(PracticeAttempt).where(PracticeAttempt.session_id == session_row.id)
    ).scalars().all()

    session_row.status = "completed"
    session_row.completed_at = now()
    session_row.last_activity_at = now()

    progress = progress_for(db, owner, create=True)
    session_bonus = xp_award(config, "session") if attempts else 0
    add_xp(progress, session_bonus)
    session_row.xp_earned = clean_int(session_row.xp_earned, 0, 0, 1_000_000) + session_bonus
    progress.sessions_completed = clean_int(progress.sessions_completed, 0, 0, 10_000_000) + 1
    update_streak(progress)

    record_event(
        db,
        event_type="session_complete",
        owner=owner,
        language=language,
        session_id=session_row.id,
    )

    # An "Apply" moment: one concrete step away from the screen.
    challenge = pick_challenge(db, attempts[0].concept_id if attempts else None)
    if challenge is not None:
        existing = db.execute(
            select(PracticeApplication)
            .where(
                PracticeApplication.challenge_id == challenge.id,
                owner_filter(PracticeApplication, owner),
            )
        ).scalars().first()
        if existing is None:
            db.add(
                PracticeApplication(
                    challenge_id=challenge.id,
                    session_id=session_row.id,
                    language=language,
                    state="learned",
                    **owner_columns(owner),
                )
            )

    db.flush()
    new_achievements = award_achievements(db, owner, progress, language)
    db.commit()
    db.refresh(session_row)
    return summary_payload(
        db, session_row, language, config, owner, achievements=new_achievements
    )


def summary_payload(
    db: Session,
    session_row: PracticeSession,
    language: str,
    config: dict[str, Any],
    owner: dict[str, Any],
    *,
    achievements: list[dict[str, Any]] | None = None,
    repeated: bool = False,
) -> dict[str, Any]:
    """The short after-session review, plus the one action to take next."""
    attempts = db.execute(
        select(PracticeAttempt).where(PracticeAttempt.session_id == session_row.id)
    ).scalars().all()
    concept_ids = sorted({attempt.concept_id for attempt in attempts if attempt.concept_id})
    names = concept_names(db, language, concept_ids)
    _questions, concept_records = mastery_maps(db, owner, [], concept_ids)

    reviewed = []
    for concept_id in concept_ids:
        record = concept_records.get(concept_id)
        score = clean_int(getattr(record, "mastery", 0), 0, 0, 100) if record else 0
        reviewed.append({
            "concept_id": concept_id,
            "name": names.get(concept_id, {}).get("name", ""),
            "mastery": score,
            "stage": mastery_stage(score, config.get("mastery_thresholds")),
            "next_review": iso(getattr(record, "next_review", None)) if record else None,
        })

    application = db.execute(
        select(PracticeApplication)
        .where(PracticeApplication.session_id == session_row.id)
    ).scalars().first()

    return {
        "session": {
            "id": session_row.id,
            "total": len([i for i in (session_row.question_ids or []) if clean_id(i)]),
            "answered": clean_int(session_row.answered_count, 0, 0, 1000),
            "correct": clean_int(session_row.correct_count, 0, 0, 1000),
            "xp_earned": clean_int(session_row.xp_earned, 0, 0, 1_000_000),
            "status": session_row.status,
        },
        "reviewed": reviewed,
        "next_review": reviewed[0] if reviewed else None,
        "challenge": application_row(db, application, language) if application else None,
        "progress": progress_row(progress_for(db, owner)),
        "achievements": achievements or [],
        "repeated": repeated,
    }


@router.get("/review")
def review_queue(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """What is due, and why - explained in plain language, not jargon."""
    language = clean_language(language)
    owner = learner(request, db)
    config = settings_for(db)

    concepts = concept_mastery_payload(db, owner, language, config)
    cutoff = now().isoformat()
    due = [
        item for item in concepts
        if item["practised"] and item["next_review"] and item["next_review"] <= cutoff
    ]
    weak = [item for item in concepts if item["practised"] and item["mastery"] < 61]

    ordered: list[dict[str, Any]] = []
    seen: set[int] = set()
    for item, reason in (
        [(row, "overdue") for row in due] + [(row, "weak") for row in weak]
    ):
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        ordered.append({**item, "reason": reason})

    return {
        "language": language,
        "items": ordered[:5],
        "count": len(ordered),
        "has_content": bool(concepts),
    }


@router.get("/concepts")
def list_concepts(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Every published topic, with this learner's standing in it."""
    language = clean_language(language)
    owner = learner(request, db)
    config = settings_for(db)
    return {
        "language": language,
        "concepts": concept_mastery_payload(db, owner, language, config, needs_review_first=True),
    }


@router.get("/sets")
def list_sets(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Published practice sets (manual, automatic or hybrid)."""
    language = clean_language(language)
    rows = db.execute(
        select(PracticeSet, PracticeSetTranslation)
        .join(
            PracticeSetTranslation,
            PracticeSetTranslation.set_id == PracticeSet.id,
        )
        .where(
            PracticeSet.status == "published",
            PracticeSet.deleted_at.is_(None),
            PracticeSetTranslation.language == language,
            PracticeSetTranslation.title != "",
        )
        .order_by(PracticeSet.display_order.asc(), PracticeSet.id.asc())
    ).all()
    return {
        "language": language,
        "sets": [
            {
                "id": practice_set.id,
                "slug": practice_set.slug,
                "title": clamp_text(translation.title, 200),
                "description": clamp_text(translation.description, 2000) or None,
                "mode": practice_set.mode,
                "difficulty": practice_set.difficulty,
                "estimated_minutes": clean_int(practice_set.estimated_minutes, 5, 1, 180),
            }
            for practice_set, translation in rows
        ],
    }


@router.get("/applications")
def list_applications(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """The learner's own challenges, with the state they have reached."""
    language = clean_language(language)
    owner = learner(request, db)
    condition = owner_filter(PracticeApplication, owner)
    if condition is None:
        return {"language": language, "applications": []}
    rows = db.execute(
        select(PracticeApplication)
        .where(condition)
        .order_by(PracticeApplication.updated_at.desc())
        .limit(30)
    ).scalars().all()
    return {
        "language": language,
        "applications": [
            row
            for row in (application_row(db, item, language) for item in rows)
            if row is not None
        ],
    }


@router.put("/applications/{application_id}")
def update_application(
    application_id: int,
    request: Request,
    payload: dict = Body(...),
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Move an application along: accepted, done, repeated, or skipped.

    This is tracked entirely separately from academic correctness - doing
    something in real life counts here and nowhere else.
    """
    language = clean_language(language)
    owner = learner(request, db)
    require_learner(owner)
    config = settings_for(db)
    source = payload if isinstance(payload, dict) else {}

    condition = owner_filter(PracticeApplication, owner)
    row = (
        db.execute(
            select(PracticeApplication).where(
                PracticeApplication.id == application_id,
                condition,
            )
        ).scalars().first()
        if condition is not None
        else None
    )
    if row is None:
        raise HTTPException(status_code=404, detail="That challenge was not found.")

    action = clamp_text(source.get("action"), 20) or "practiced"
    if action == "skip":
        row.skipped = True
    elif action == "remind":
        row.reminded_at = now()
    elif action in APPLICATION_STATES:
        row.state = action
        row.skipped = False
        if action == "applied":
            row.applied_at = now()
            progress = progress_for(db, owner, create=True)
            progress.applications_done = (
                clean_int(progress.applications_done, 0, 0, 10_000_000) + 1
            )
            add_xp(progress, xp_award(config, "application"))
            db.flush()
            award_achievements(db, owner, progress, language)

    if "commitment_text" in source:
        row.commitment_text = clamp_text(source.get("commitment_text"), 2000) or None
    if "commitment_when" in source:
        row.commitment_when = clamp_text(source.get("commitment_when"), 200) or None
    if "commitment_where" in source:
        row.commitment_where = clamp_text(source.get("commitment_where"), 200) or None
    db.commit()
    db.refresh(row)
    return application_row(db, row, language)



@router.post("/commitments")
def save_commitment(
    request: Request,
    payload: dict = Body(...),
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Record an implementation intention: what, when, where.

    One commitment per day keeps this light. The learner's own words are kept
    so a returning learner reads their plan back rather than a generic prompt.
    """
    language = clean_language(language)
    owner = learner(request, db)
    require_learner(owner)
    source = payload if isinstance(payload, dict) else {}

    text = clamp_text(source.get("text"), 2000)
    if not text:
        raise HTTPException(
            status_code=400,
            detail={"code": "commitment_empty", "message": "Write what you will do."},
        )

    application_id = clean_id(source.get("application_id"))
    today = date.today().isoformat()
    condition = owner_filter(PracticeCommitment, owner)
    row = (
        db.execute(
            select(PracticeCommitment).where(
                PracticeCommitment.slug_date == today,
                condition,
            )
        ).scalars().first()
        if condition is not None
        else None
    )
    if row is None:
        row = PracticeCommitment(slug_date=today, **owner_columns(owner))
        db.add(row)

    row.text = text
    row.when_text = clamp_text(source.get("when_text"), 200) or None
    row.where_text = clamp_text(source.get("where_text"), 200) or None
    row.application_id = application_id
    if "completed" in source:
        row.completed = bool(source.get("completed"))

    if application_id and owner_filter(PracticeApplication, owner) is not None:
        mine = db.execute(
            select(PracticeApplication).where(
                PracticeApplication.id == application_id,
                owner_filter(PracticeApplication, owner),
            )
        ).scalars().first()
        if mine is not None and mine.state == "learned":
            mine.state = "practiced"

    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "text": row.text,
        "when_text": row.when_text,
        "where_text": row.where_text,
        "completed": bool(row.completed),
        "date": row.slug_date,
    }


@router.get("/commitments")
def list_commitments(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Recent commitments, newest first - the learner's own to-do list."""
    condition = owner_filter(PracticeCommitment, learner(request, db))
    if condition is None:
        return {"commitments": []}
    rows = db.execute(
        select(PracticeCommitment)
        .where(condition)
        .order_by(PracticeCommitment.slug_date.desc(), PracticeCommitment.id.desc())
        .limit(14)
    ).scalars().all()
    return {
        "commitments": [
            {
                "id": row.id,
                "text": clamp_text(row.text, 2000),
                "when_text": clamp_text(row.when_text, 200) or None,
                "where_text": clamp_text(row.where_text, 200) or None,
                "completed": bool(row.completed),
                "date": row.slug_date,
            }
            for row in rows
        ],
    }


@router.get("/achievements")
def list_achievements(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Milestones earned so far - secondary to learning, never a gate."""
    language = clean_language(language)
    owner = learner(request, db)
    ensure_achievement_definitions(db)
    db.commit()

    rows = db.execute(
        select(Achievement).where(Achievement.active.is_(True))
        .order_by(Achievement.display_order.asc())
    ).scalars().all()
    earned = earned_achievement_keys(db, owner)

    items = []
    for achievement in rows:
        translation = translation_map(list(achievement.translations)).get(language)
        if translation is None:
            continue
        items.append({
            "key": achievement.key,
            "title": clamp_text(translation.title, 200),
            "description": clamp_text(translation.description, 600) or None,
            "earned": achievement.id in earned,
        })
    return {"language": language, "achievements": items}

@router.get("/settings")
def get_learner_settings(
    request: Request,
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """The learner's own Practice preferences."""
    owner = learner(request, db)
    config = settings_for(db)
    return {
        "reminder": reminder_row(progress_for(db, owner), config),
        "session_sizes": (config.get("session_sizes") or {}).get("minutes", {}),
        "question_types": list(config.get("enabled_types") or []),
    }


@router.put("/settings")
def update_learner_settings(
    request: Request,
    payload: dict = Body(...),
    language: str = Depends(requested_language),
    db: Session = Depends(get_db),
):
    """Save reminder preferences. Opt-in, and turning them off is always easy."""
    owner = learner(request, db)
    require_learner(owner)
    config = settings_for(db)
    source = payload if isinstance(payload, dict) else {}

    progress = progress_for(db, owner, create=True)
    reminder = source.get("reminder") if isinstance(source.get("reminder"), dict) else source

    if "enabled" in reminder:
        progress.reminder_enabled = bool(reminder.get("enabled"))
    if progress.reminder_enabled:
        frequency = clamp_text(reminder.get("frequency"), 20)
        if frequency in ("daily", "weekdays", "weekly", "off"):
            progress.reminder_frequency = frequency
        time_value = clamp_text(reminder.get("time"), 8)
        if re.match(r"^\d{2}:\d{2}$", time_value):
            progress.reminder_time = time_value

    db.commit()
    db.refresh(progress)
    return {"reminder": reminder_row(progress, config)}


@router.post("/progress/merge")
def merge_anonymous_progress(
    request: Request,
    client_token: str = Query(..., description="The X-Learn-Client id kept in local storage"),
    db: Session = Depends(get_db),
):
    """Fold this device's Practice history into the account being signed in.

    Same promise as ``/learn/progress/merge``: creating an account part-way
    through must never throw away what someone has already practised.
    Counters add up and the better mastery score is kept, so merging can only
    help - and a signed-in learner's newer rows always win.
    """
    owner = learner(request, db)
    user = owner["user"]
    if user is None:
        raise HTTPException(status_code=401, detail="Must be signed in to merge progress")

    client_id = (client_token or "").strip()
    if not CLIENT_ID_PATTERN.match(client_id):
        raise HTTPException(status_code=400, detail="That is not a valid client id")

    merged = 0
    for model, key in (
        (PracticeSession, "id"),
        (ConceptMastery, "concept_id"),
        (QuestionMastery, "question_id"),
        (PracticeProgress, "id"),
        (PracticeApplication, "challenge_id"),
        (PracticeAchievement, "achievement_id"),
        (PracticeCommitment, "id"),
    ):
        if owner_filter(model, owner) is None:
            continue
        rows = db.execute(
            select(model).where(model.client_id == client_id, model.user_id.is_(None))
        ).scalars().all()
        for record in rows:
            existing = db.execute(
                select(model).where(
                    model.user_id == user.id,
                    getattr(model, key) == getattr(record, key),
                )
            ).scalars().first()
            if existing is None:
                record.client_id = None
                record.user_id = user.id
            else:
                combine_rows(existing, record, model)
                db.delete(record)
            merged += 1

    db.commit()
    return {"merged": merged}


def combine_rows(target: Any, source: Any, model: Any) -> None:
    """Fold one anonymous row into the signed-in one without losing progress."""
    for column in (
        "attempt_count",
        "correct_count",
        "incorrect_count",
        "questions_answered",
        "sessions_completed",
        "applications_done",
        "xp",
    ):
        if hasattr(model, column):
            setattr(
                target,
                column,
                clean_int(getattr(target, column, 0), 0, 0, 10_000_000)
                + clean_int(getattr(source, column, 0), 0, 0, 10_000_000),
            )
    if hasattr(model, "mastery"):
        setattr(
            target,
            "mastery",
            max(
                clean_int(getattr(target, "mastery", 0), 0, 0, 100),
                clean_int(getattr(source, "mastery", 0), 0, 0, 100),
            ),
        )
    for column in ("last_attempted", "last_correct", "next_review", "last_practice_date"):
        if hasattr(model, column):
            mine = getattr(target, column, None)
            theirs = getattr(source, column, None)
            if theirs is not None and (mine is None or theirs < mine):
                setattr(target, column, theirs)
    for column in ("streak", "best_streak"):
        if hasattr(model, column):
            setattr(
                target,
                column,
                max(
                    clean_int(getattr(target, column, 0), 0, 0, 100000),
                    clean_int(getattr(source, column, 0), 0, 0, 100000),
                ),
            )
    if hasattr(model, "reminder_enabled"):
        target.reminder_enabled = bool(target.reminder_enabled or source.reminder_enabled)
    if hasattr(model, "state") and getattr(source, "state", None) == "repeated":
        target.state = "repeated"

