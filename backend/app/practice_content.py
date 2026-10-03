"""Shared Practice content rules: catalogue, grading, scheduling, validation.

Both the public Practice router and the admin router import from here, so the
public session, the admin preview and the server-side grader can never
disagree about what a question means. Nothing in this module talks to the
network; it only turns untrusted payloads into storable shapes, grades answers
against the stored key (the client never sends a correctness claim), and turns
ORM rows into JSON.

Design notes
------------
- Grading is server-side only. ``grade_answer`` is the single source of truth.
- Spaced repetition is a Leitner-style ladder: consecutive correct answers
  climb ``review_intervals``; a miss drops back to the short rung. Mastery is
  never permanent - even "mastered" concepts return at the longest interval.
- The selection engine interleaves concepts (no bingeing one topic) and ranks
  overdue > repeatedly-incorrect > low-confidence > recently-learned > new.
"""

from datetime import date, datetime, timedelta
from typing import Any

from app.learn_content import (  # noqa: F401  (re-exported for routers)
    LANGUAGES,
    OTHER_LANGUAGE,
    clamp_text,
    clean_bool,
    clean_id,
    clean_int,
    clean_language,
    iso,
    now,
    translation_map,
)

# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------

QUESTION_TYPES: dict[str, dict[str, Any]] = {
    "multiple_choice": {
        "label": "Multiple choice",
        "group": "Recognise",
        "graded": True,
        "fields": ("prompt", "options", "explanation", "takeaway"),
        "needs": ("prompt", "options", "correct"),
        "min_options": 2,
    },
    "true_false": {
        "label": "True or false",
        "group": "Recognise",
        "graded": True,
        "fields": ("prompt", "explanation", "takeaway"),
        "needs": ("prompt", "correct"),
        "min_options": 0,
    },
    "multiple_select": {
        "label": "Select all that apply",
        "group": "Recall",
        "graded": True,
        "fields": ("prompt", "options", "explanation", "takeaway"),
        "needs": ("prompt", "options", "correct"),
        "min_options": 3,
    },
    "fill_blank": {
        "label": "Fill in the blank",
        "group": "Recall",
        "graded": True,
        "fields": ("prompt", "accepted", "explanation", "takeaway"),
        "needs": ("prompt", "accepted"),
        "min_options": 0,
    },
    "ordering": {
        "label": "Put in order",
        "group": "Understand",
        "graded": True,
        "fields": ("prompt", "options", "explanation", "takeaway"),
        "needs": ("prompt", "options"),
        "min_options": 3,
    },
    "matching": {
        "label": "Match pairs",
        "group": "Understand",
        "graded": True,
        "fields": ("prompt", "options", "explanation", "takeaway"),
        "needs": ("prompt", "options"),
        "min_options": 2,
    },
    "scenario": {
        "label": "Scenario",
        "group": "Apply",
        "graded": True,
        "fields": ("prompt", "options", "explanation", "takeaway", "application_prompt"),
        "needs": ("prompt", "options", "correct"),
        "min_options": 2,
    },
    "reflection": {
        "label": "Reflection",
        "group": "Reflect",
        "graded": False,
        "fields": ("prompt", "explanation", "takeaway", "application_prompt"),
        "needs": ("prompt",),
        "min_options": 0,
    },
}

DIFFICULTIES = ("beginner", "intermediate", "advanced")
SET_MODES = ("manual", "automatic", "hybrid")
SET_STATUSES = ("draft", "published")
CONCEPT_STATUSES = ("draft", "published")
QUESTION_STATUSES = ("draft", "published")
CONFIDENCE_LEVELS = (1, 2, 3)
APPLICATION_STATES = ("learned", "practiced", "applied", "repeated")

MAX_PROMPT = 1200
MAX_EXPLANATION = 2000
MAX_TAKEAWAY = 400
MAX_OPTIONS = 10
MAX_ACCEPTED = 8
MAX_SET_QUESTIONS = 100

DEFAULT_SETTINGS: dict[str, Any] = {
    "mastery_thresholds": {
        "new": [0, 20],
        "learning": [21, 40],
        "developing": [41, 60],
        "strong": [61, 80],
        "mastered": [81, 100],
    },
    "xp_values": {
        "correct": 10,
        "reflection": 5,
        "session": 20,
        "review": 5,
        "application": 25,
        "achievement": 15,
    },
    # Days between reviews per rung of the Leitner ladder (indexed by the
    # learner's consecutive-correct streak on the concept).
    "review_intervals": [1, 2, 4, 7, 14, 30],
    "session_sizes": {"quick": 3, "normal": 6, "deep": 12, "minutes": {1: 2, 3: 5, 5: 8, 10: 14, 15: 20}},
    "streak_settings": {"enabled": True, "grace_days": 0},
    "question_limit": 40,
    "enabled_types": list(QUESTION_TYPES.keys()),
    "reminder_defaults": {"frequency": "daily", "time": "08:00"},
}

# ---------------------------------------------------------------------------
# Coercion helpers - every value coming from a client is untrusted
# ---------------------------------------------------------------------------

def clean_question_type(value: Any) -> str:
    question_type = clamp_text(value, 30).lower()
    return question_type if question_type in QUESTION_TYPES else "multiple_choice"


def clean_difficulty(value: Any) -> str:
    difficulty = clamp_text(value, 20).lower()
    return difficulty if difficulty in DIFFICULTIES else "beginner"


def clean_level(value: Any) -> int:
    """The five-step progression: recognise -> recall -> apply -> reflect."""
    return clean_int(value, 1, 1, 5)


def normalize_option_list(raw: Any, *, limit: int = MAX_OPTIONS) -> list[str]:
    options: list[str] = []
    if isinstance(raw, list):
        for item in raw[:limit]:
            text = clamp_text(item, 300)
            if text and text not in options:
                options.append(text)
    return options


def normalize_answer_options(raw: Any, question_type: str) -> list[Any]:
    """Ordering/matching options are objects (``{id,text}`` / ``{left,right}``)."""
    if question_type in ("ordering", "matching"):
        items: list[Any] = []
        source = raw if isinstance(raw, list) else []
        for index, item in enumerate(source[:MAX_OPTIONS]):
            if question_type == "ordering":
                text = clamp_text(item.get("text") if isinstance(item, dict) else item, 300)
                if text:
                    items.append({"id": index, "text": text})
            else:
                pair = item if isinstance(item, dict) else {}
                left = clamp_text(pair.get("left"), 200)
                right = clamp_text(pair.get("right"), 200)
                if left and right:
                    items.append({"id": index, "left": left, "right": right})
        return items
    return normalize_option_list(raw)


def normalize_accepted(raw: Any) -> list[str]:
    accepted: list[str] = []
    if isinstance(raw, list):
        for item in raw[:MAX_ACCEPTED]:
            text = clamp_text(item, 120).strip()
            if text and text.lower() not in [a.lower() for a in accepted]:
                accepted.append(text)
    return accepted


def normalize_answer_key(question_type: str, raw: Any) -> dict[str, Any]:
    """Validate the language-neutral half: the correct answer itself."""
    source = raw if isinstance(raw, dict) else {}
    if question_type == "true_false":
        return {"correct": clean_bool(source.get("correct"))}
    if question_type == "multiple_select":
        indexes = source.get("correct_indexes") or source.get("correct_index") or []
        if isinstance(indexes, (int, float)) and not isinstance(indexes, bool):
            indexes = [indexes]
        cleaned = sorted({
            clean_int(item, -1, -1, MAX_OPTIONS - 1)
            for item in indexes if isinstance(item, (int, float)) and not isinstance(item, bool)
        })
        cleaned = [item for item in cleaned if item >= 0]
        return {"correct_indexes": cleaned}
    if question_type in ("multiple_choice", "scenario"):
        return {"correct_index": clean_int(source.get("correct_index"), -1, -1, MAX_OPTIONS - 1)}
    # Ordering stores the correct id sequence; matching stores index pairs.
    if question_type == "ordering":
        order = source.get("correct_order") or []
        cleaned = [clean_int(item, -1, -1, MAX_OPTIONS - 1) for item in order] if isinstance(order, list) else []
        return {"correct_order": [item for item in cleaned if item >= 0]}
    if question_type == "matching":
        pairs = source.get("correct_pairs") or []
        cleaned = []
        if isinstance(pairs, list):
            for pair in pairs[:MAX_OPTIONS]:
                if isinstance(pair, dict):
                    left = clean_int(pair.get("left"), -1, -1, MAX_OPTIONS - 1)
                    right = clean_int(pair.get("right"), -1, -1, MAX_OPTIONS - 1)
                    if left >= 0 and right >= 0:
                        cleaned.append({"left": left, "right": right})
                elif isinstance(pair, list) and len(pair) == 2:
                    left, right = clean_int(pair[0], -1), clean_int(pair[1], -1)
                    if 0 <= left < MAX_OPTIONS and 0 <= right < MAX_OPTIONS:
                        cleaned.append({"left": left, "right": right})
        return {"correct_pairs": cleaned}
    return {}

# ---------------------------------------------------------------------------
# Grading
#
# The client sends only what the learner chose. Correctness is decided here,
# from stored content, so a tampered request cannot claim a right answer, and
# the same function is used by the public route and the admin preview.
# ---------------------------------------------------------------------------

def _normalize_text(value: Any) -> str:
    """Compare words, not punctuation: "Prayer." matches "prayer"."""
    text = str(value or "").strip().lower()
    text = "".join(char for char in text if char.isalnum() or char.isspace())
    return " ".join(text.split())


def grade_answer(
    question_type: str,
    answer_key: dict[str, Any],
    answer: Any,
    *,
    accepted: list[str] | None = None,
) -> bool | None:
    """True/False for graded types; None for reflection (never marked wrong).

    ``answer`` is the raw payload the browser sent, shaped per type:
      multiple_choice / scenario -> {"index": 2}
      true_false                  -> {"value": true}
      multiple_select             -> {"indexes": [0, 2]}
      fill_blank                  -> {"text": "relationship"}
      ordering                    -> {"order": [2, 0, 1]}
      matching                    -> {"pairs": {"0": 1, "1": 0}}
      reflection                  -> {"text": "..."}
    """
    definition = QUESTION_TYPES.get(question_type, QUESTION_TYPES["multiple_choice"])
    if not definition["graded"]:
        return None

    payload = answer if isinstance(answer, dict) else {}

    if question_type == "true_false":
        if "value" not in payload:
            return False
        return clean_bool(payload.get("value")) is clean_bool(answer_key.get("correct"))

    if question_type in ("multiple_choice", "scenario"):
        return clean_int(payload.get("index"), -1, -1, 100) == clean_int(
            answer_key.get("correct_index"), -2, -1, 100
        )

    if question_type == "multiple_select":
        chosen = payload.get("indexes")
        if not isinstance(chosen, list):
            return False
        chosen_set = {
            clean_int(item, -1, -1, 100)
            for item in chosen
            if isinstance(item, (int, float)) and not isinstance(item, bool)
        }
        correct_set = {
            clean_int(item, -1, -1, 100) for item in (answer_key.get("correct_indexes") or [])
        }
        return bool(correct_set) and chosen_set == correct_set

    if question_type == "fill_blank":
        given = _normalize_text(payload.get("text"))
        if not given:
            return False
        return any(given == _normalize_text(item) for item in (accepted or []))

    if question_type == "ordering":
        order = payload.get("order")
        if not isinstance(order, list):
            return False
        expected = [clean_int(item, -1, -1, 100) for item in (answer_key.get("correct_order") or [])]
        given = [
            clean_int(item, -1, -1, 100)
            for item in order
            if isinstance(item, (int, float)) and not isinstance(item, bool)
        ]
        return bool(expected) and given == expected

    if question_type == "matching":
        pairs = payload.get("pairs")
        if not isinstance(pairs, dict):
            return False
        expected = {
            clean_int(pair.get("left"), -1, -1, 100): clean_int(pair.get("right"), -1, -1, 100)
            for pair in (answer_key.get("correct_pairs") or [])
            if isinstance(pair, dict)
        }
        if not expected:
            return False
        given = {
            clean_int(left, -1, -1, 100): clean_int(right, -1, -1, 100)
            for left, right in pairs.items()
        }
        return given == expected

    return False


def answer_key_is_valid(question_type: str, answer_key: dict[str, Any], options: list[Any]) -> bool:
    """True when the stored key can actually grade this question."""
    if not QUESTION_TYPES.get(question_type, {}).get("graded"):
        return True
    if question_type == "true_false":
        return "correct" in answer_key
    if question_type in ("multiple_choice", "scenario"):
        index = clean_int(answer_key.get("correct_index"), -1, -1, 100)
        return 0 <= index < len(options)
    if question_type == "multiple_select":
        indexes = answer_key.get("correct_indexes") or []
        return bool(indexes) and all(0 <= clean_int(item, -1) < len(options) for item in indexes)
    if question_type == "ordering":
        order = answer_key.get("correct_order") or []
        return bool(order) and sorted(order) == list(range(len(options)))
    if question_type == "matching":
        pairs = answer_key.get("correct_pairs") or []
        if not pairs:
            return False
        lefts = {clean_int(pair.get("left"), -1) for pair in pairs}
        rights = {clean_int(pair.get("right"), -1) for pair in pairs}
        return (
            lefts == set(range(len(options)))
            and rights == set(range(len(options)))
        )
    return True



# ---------------------------------------------------------------------------
# Mastery + spaced repetition
#
# A Leitner-style ladder: each correct answer climbs a rung, a miss drops
# back. "Mastered" is the top rung, never a permanent state - a mastered
# concept still comes back at the longest interval, so a forgotten idea is
# re-encountered rather than lost (section 2B).
# ---------------------------------------------------------------------------

def mastery_stage(mastery: int, thresholds: dict[str, Any] | None = None) -> str:
    """Which band a 0-100 score falls in, using admin-configurable cut points."""
    table = (thresholds or DEFAULT_SETTINGS["mastery_thresholds"])
    score = max(0, min(100, clean_int(mastery, 0, 0, 100)))
    # Ordered strongest-last so the first band that fits wins.
    for stage in ("new", "learning", "developing", "strong", "mastered"):
        band = table.get(stage) if isinstance(table, dict) else None
        if not isinstance(band, (list, tuple)) or len(band) != 2:
            continue
        low, high = clean_int(band[0], 0, 0, 100), clean_int(band[1], 100, 0, 100)
        if low <= score <= high:
            return stage
    return "new"


def updated_mastery(
    current: int,
    *,
    correct: bool | None,
    weight: int = 0,
) -> int:
    """Move the score toward the truth, gently.

    Wrong answers cost less than right answers gain, on purpose: the product
    must not punish a learner for struggling. ``weight`` (0-2, set by the
    admin on harder questions) scales how much a correct answer is worth.
    ``correct=None`` is a reflection: engagement is recorded, but being asked
    to think never counts as knowing.
    """
    if correct is None:
        return max(0, min(100, clean_int(current, 0, 0, 100)))
    bonus = 6 + 2 * clean_int(weight, 0, 0, 2)
    step = bonus if correct else -5
    return max(0, min(100, clean_int(current, 0, 0, 100) + step))


def next_review_date(
    streak: int,
    correct: bool | None,
    intervals: list[int] | None = None,
) -> datetime:
    """When this concept should come back (days from now)."""
    ladder = intervals or DEFAULT_SETTINGS["review_intervals"]
    clean = [clean_int(item, 1, 1, 365) for item in ladder] or [1]
    if correct is False:
        # A miss returns it soon, without punishing with a long gap.
        return now() + timedelta(days=clean[0])
    rung = max(0, min(len(clean) - 1, clean_int(streak, 0, 0, 99)))
    return now() + timedelta(days=clean[rung])


def blended_confidence(previous: float, confidence: int | None, attempts: int) -> float:
    """Rolling average of reported confidence (1-3), used as a scheduling nudge."""
    if confidence is None:
        return round(float(previous or 0.0), 2)
    count = max(1, clean_int(attempts, 1, 0, 10000))
    return round(((float(previous or 0.0)) * (count - 1) + confidence) / count, 2)


def session_size(
    mode: str,
    minutes: int | None = None,
    sizes: dict[str, Any] | None = None,
) -> int:
    """How many questions this session should hold (section 11/12)."""
    config = sizes or DEFAULT_SETTINGS["session_sizes"]
    table = config.get("minutes") if isinstance(config, dict) else None
    if mode == "timed" and table:
        requested = clean_int(minutes, 5, 1, 60)
        if requested in table:
            return clean_int(table.get(requested), 5, 1, MAX_SET_QUESTIONS)
    default = {"quick": 3, "normal": 6, "deep": 12}
    return clean_int(
        (config or {}).get(mode) if isinstance(config, dict) else default.get(mode, 6),
        default.get(mode, 6),
        1,
        MAX_SET_QUESTIONS,
    )


def estimated_minutes(count: int) -> int:
    """Rough, honest length shown before a session starts."""
    return max(1, (clean_int(count, 1, 1, 100) + 1) // 2)


# ---------------------------------------------------------------------------
# Selection engine
#
# Ranking order mirrors the smart review queue (section 19): overdue first,
# then repeatedly-incorrect, then low-confidence, then recently learned, then
# ordinary reinforcement. Interleaving keeps related concepts mixed rather
# than drilling one topic to exhaustion.
# ---------------------------------------------------------------------------

def priority_score(
    question_mastery: Any,
    concept_mastery: Any,
    *,
    at: datetime | None = None,
) -> int:
    """Higher means "more useful right now"."""
    reference = at or now()
    score = 0
    if question_mastery is None:
        # Never seen: worth introducing, but not at the expense of a due item.
        return 30

    next_review = getattr(question_mastery, "next_review", None)
    if next_review is not None and next_review <= reference:
        # Overdue - the highest priority of all.
        overdue_days = (reference - next_review).days
        score += 100 + min(40, overdue_days * 2)
    else:
        score += 20

    incorrect = clean_int(getattr(question_mastery, "incorrect_count", 0), 0, 0, 1000)
    attempts = clean_int(getattr(question_mastery, "attempt_count", 0), 0, 0, 1000)
    if incorrect:
        score += 30 + min(30, incorrect * 10)
    elif attempts and not clean_int(getattr(question_mastery, "correct_count", 0), 0, 0, 1000):
        score += 15

    confidence = float(getattr(question_mastery, "confidence", 0.0) or 0.0)
    if confidence and confidence < 2.0:
        score += 20

    last_attempted = getattr(question_mastery, "last_attempted", None)
    if last_attempted and (reference - last_attempted).days < 2:
        # Seen very recently - let it settle.
        score -= 25

    if concept_mastery is not None:
        mastery = clean_int(getattr(concept_mastery, "mastery", 0), 0, 0, 100)
        if mastery < 60:
            score += 20
        elif mastery >= 81:
            # Mastered, but still eligible: reinforcement, just never first.
            score -= 10

    return score


def interleave_by_concept(
    ranked: list[tuple[Any, int]],
    limit: int,
) -> list[Any]:
    """Take the highest-priority items while mixing concepts.

    One concept may lead briefly, but the tail is filled from the strongest
    items of the *other* concepts - this is what stops a session from being
    the same topic three times in a row.
    """
    chosen: list[Any] = []
    seen_concepts: list[int] = []
    remaining = list(ranked)

    while remaining and len(chosen) < limit:
        # Prefer the best item whose concept has not appeared most recently.
        pick = None
        for index, (question, _score) in enumerate(remaining):
            concept_id = question.concept_id
            if len(seen_concepts) < 2 or concept_id not in seen_concepts[-2:]:
                pick = index
                break
        if pick is None:
            pick = 0
        question, _score = remaining.pop(pick)
        chosen.append(question)
        seen_concepts.append(question.concept_id)

    return chosen


# ---------------------------------------------------------------------------
# Validation
#
# Errors block publishing; warnings advise. The rules are the ones the spec
# asks the admin to be warned about: no correct answer, several correct
# answers where only one is allowed, missing translation, missing explanation,
# over-long prompts, duplicate options, and dangling references.
# ---------------------------------------------------------------------------

def question_validation(
    *,
    question_type: str,
    config: dict[str, Any],
    translations: dict[str, dict[str, Any]],
    published: bool,
    learn_lesson_exists: bool = True,
) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    definition = QUESTION_TYPES.get(question_type, QUESTION_TYPES["multiple_choice"])
    primary = translations.get("en") or {}

    prompt = clamp_text(primary.get("prompt"), MAX_PROMPT)
    options = primary.get("options") or []
    accepted = primary.get("accepted") or []

    if not prompt:
        errors.append({
            "code": "prompt_missing",
            "field": "translations.en.prompt",
            "message": "Write the question itself before publishing.",
        })
    elif len(prompt) > 600:
        warnings.append({
            "code": "prompt_long",
            "field": "translations.en.prompt",
            "message": "This question is quite long. Short questions are easier to recall.",
        })

    if definition["graded"] and not answer_key_is_valid(question_type, config, options):
        errors.append({
            "code": "answer_key_missing",
            "field": "config",
            "message": f"This {definition['label'].lower()} has no valid correct answer yet.",
        })

    min_options = definition.get("min_options", 0)
    if min_options and len(options) < min_options:
        errors.append({
            "code": "options_missing",
            "field": "translations.en.options",
            "message": f"Add at least {min_options} options so the question can be answered.",
        })

    if question_type == "fill_blank" and not accepted:
        errors.append({
            "code": "accepted_missing",
            "field": "translations.en.accepted",
            "message": "List at least one answer that should be accepted.",
        })

    if question_type == "multiple_select":
        indexes = config.get("correct_indexes") or []
        if indexes and len(indexes) > len(options) - 1:
            warnings.append({
                "code": "almost_all_correct",
                "field": "config.correct_indexes",
                "message": "Almost every option is marked correct. Check that this is intended.",
            })

    if not clamp_text(primary.get("explanation")):
        warnings.append({
            "code": "explanation_missing",
            "field": "translations.en.explanation",
            "message": "Add a short explanation of why. It is what turns a quiz into learning.",
        })

    if not clamp_text(primary.get("takeaway")):
        warnings.append({
            "code": "takeaway_missing",
            "field": "translations.en.takeaway",
            "message": "A one-line practical takeaway helps the learner carry this into life.",
        })

    # Two identical options make a question unanswerable rather than hard.
    if question_type in ("multiple_choice", "multiple_select", "scenario"):
        texts = [str(item) for item in options]
        if len(texts) != len({text.strip().lower() for text in texts}):
            warnings.append({
                "code": "duplicate_options",
                "field": "translations.en.options",
                "message": "Two options are identical. Learners will not know which to pick.",
            })
    if question_type in ("ordering", "matching"):
        seen = [
            str(item.get("text") or item.get("left"))
            for item in options
            if isinstance(item, dict)
        ]
        if len(seen) != len(set(seen)):
            warnings.append({
                "code": "duplicate_options",
                "field": "translations.en.options",
                "message": "Two options look identical. Learners will not know which to pick.",
            })

    for language in LANGUAGES:
        if not clamp_text((translations.get(language) or {}).get("prompt")):
            warnings.append({
                "code": "translation_missing",
                "field": f"translations.{language}.prompt",
                "message": f"There is no {language} version yet; that language will skip this question.",
            })

    if not learn_lesson_exists:
        warnings.append({
            "code": "lesson_missing",
            "field": "learn_lesson_id",
            "message": "The linked lesson is no longer available. The 'learn more' link will not show.",
        })

    return {
        "ready": not errors,
        "published": published,
        "errors": errors,
        "warnings": warnings,
    }


def set_validation(
    *,
    translations: dict[str, dict[str, Any]],
    mode: str,
    question_ids: list[int],
    concept_ids: list[int],
    published: bool,
) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    primary = translations.get("en") or {}

    if not clamp_text(primary.get("title")):
        errors.append({
            "code": "title_missing",
            "field": "translations.en.title",
            "message": "Give this set a title before publishing.",
        })

    if mode == "manual" and not question_ids:
        errors.append({
            "code": "questions_missing",
            "field": "questions",
            "message": "A manual set needs at least one question.",
        })

    if mode == "automatic" and not concept_ids:
        errors.append({
            "code": "concepts_missing",
            "field": "concept_ids",
            "message": "An automatic set needs at least one concept to draw questions from.",
        })

    for language in LANGUAGES:
        if not clamp_text((translations.get(language) or {}).get("title")):
            warnings.append({
                "code": "translation_missing",
                "field": f"translations.{language}.title",
                "message": f"There is no {language} title yet.",
            })

    return {
        "ready": not errors,
        "published": published,
        "errors": errors,
        "warnings": warnings,
    }


def language_name(language: str) -> str:
    return {"en": "English", "sw": "Swahili"}.get(language, language)


# ---------------------------------------------------------------------------
# Achievements
#
# Milestones are defined as content so their wording is translatable, and the
# threshold lives in the row so an admin can retune it without a deploy.
# ---------------------------------------------------------------------------

DEFAULT_ACHIEVEMENTS = (
    ("first_practice", "First practice", "You finished your first practice session.", {"metric": "sessions", "threshold": 1}, 5),
    ("questions_10", "10 questions", "You have answered ten practice questions.", {"metric": "questions", "threshold": 10}, 10),
    ("questions_50", "50 questions", "Fifty questions practised. That is a habit forming.", {"metric": "questions", "threshold": 50}, 20),
    ("questions_100", "100 questions", "One hundred questions practised. Well done.", {"metric": "questions", "threshold": 100}, 30),
    ("first_application", "First application", "You practised something in real life.", {"metric": "applications", "threshold": 1}, 15),
    ("streak_7", "7 day practice", "You practised seven days in a row.", {"metric": "streak", "threshold": 7}, 25),
)


SW_ACHIEVEMENT_TITLES = {
    "first_practice": "Mazoizi ya kwanza",
    "questions_10": "Maswali 10",
    "questions_50": "Maswali 50",
    "questions_100": "Maswali 100",
    "first_application": "Uteuzi wa kwanza",
    "streak_7": "Mazoizi siku 7",
}

SW_ACHIEVEMENT_DESCRIPTIONS = {
    "first_practice": "Umekamilisha mazoizi yako ya kwanza ya kujizoeza.",
    "questions_10": "Umejibu maswali kumi ya kujizoeza.",
    "questions_50": "Maswali hamsini yamekuzoeza. Tabia inaanza kuwa njia.",
    "questions_100": "Maswali mia moja yamekuzoeza. Vizuri sana.",
    "first_application": "Umetumia kitu ulichojifunza katika maisha yako.",
    "streak_7": "Umefanya mazoizi siku saba mfululizo.",
}


def achievement_metric_value(progress: Any, metric: str) -> int:
    """Read one lifetime counter off the learner's progress row."""
    if progress is None:
        return 0
    fields = {
        "questions": "questions_answered",
        "sessions": "sessions_completed",
        "applications": "applications_done",
        "streak": "best_streak",
        "xp": "xp",
    }
    return clean_int(
        getattr(progress, fields.get(metric, "questions_answered"), 0),
        0,
        0,
        10_000_000,
    )


# ---------------------------------------------------------------------------
# Serializers
#
# ``public_question`` is what a session hands to the browser: it carries the
# prompt, the options and the concept - and deliberately never the answer key
# or the explanation. Feedback is only sent back after the learner commits to
# an answer, which is what stops a curious learner from opening devtools to
# read the answer key before trying.
# ---------------------------------------------------------------------------

def public_question(
    question: Any,
    translation: Any,
    *,
    concept: dict[str, Any] | None = None,
    order: list[Any] | None = None,
) -> dict[str, Any]:
    """A question as the learner sees it, with no correct answer attached."""
    options = list(getattr(translation, "options", None) or [])
    if getattr(question, "question_type", "") == "ordering" and order:
        # Shuffled client-side; send ids so the stored order is not a giveaway.
        options = [dict(option) for option in order]

    return {
        "id": question.id,
        "type": question.question_type,
        "level": question.level,
        "difficulty": question.difficulty,
        "concept_id": question.concept_id,
        "concept": concept or None,
        "prompt": clamp_text(getattr(translation, "prompt", ""), MAX_PROMPT),
        "options": options,
        "media_url": getattr(translation, "media_url", None),
        "media_alt": getattr(translation, "media_alt", None),
        "scripture": (
            {"reference": question.scripture_reference, "translation": question.scripture_translation}
            if question.scripture_reference
            else None
        ),
        "application_prompt": clamp_text(getattr(translation, "application_prompt", None), MAX_TAKEAWAY) or None,
        "graded": QUESTION_TYPES.get(question.question_type, {}).get("graded", True),
    }


def feedback_payload(
    question: Any,
    translation: Any,
    *,
    correct: bool | None,
    correct_answer: Any = None,
    language: str = "en",
) -> dict[str, Any]:
    """What appears after answering: the verdict, the why, and the takeaway.

    Wording here is the no-shame voice the spec asks for: "not quite" rather
    than "wrong", and a reason rather than a bare tick.
    """
    keys = {
        True: "feedback_correct",
        False: "feedback_not_quite",
        None: "feedback_reflection",
    }
    return {
        "correct": correct,
        "verdict": keys[correct],
        "correct_answer": correct_answer,
        "explanation": clamp_text(getattr(translation, "explanation", None), MAX_EXPLANATION) or None,
        "takeaway": clamp_text(getattr(translation, "takeaway", None), MAX_TAKEAWAY) or None,
        "scripture": (
            {"reference": question.scripture_reference, "translation": question.scripture_translation}
            if question.scripture_reference
            else None
        ),
        "language": language,
    }



def correct_answer_summary(question: Any, translation: Any) -> Any:
    """The answer to reveal after a graded attempt, in the learner's language."""
    question_type = question.question_type
    options = list(getattr(translation, "options", None) or [])
    config = question.config or {}

    if question_type in ("multiple_choice", "scenario"):
        index = clean_int(config.get("correct_index"), -1, -1, len(options))
        return {"index": index, "text": options[index] if 0 <= index < len(options) else None}
    if question_type == "true_false":
        return {"value": clean_bool(config.get("correct"))}
    if question_type == "multiple_select":
        indexes = [
            clean_int(item, -1, -1, len(options))
            for item in (config.get("correct_indexes") or [])
        ]
        indexes = [item for item in indexes if 0 <= item < len(options)]
        return {"indexes": indexes, "texts": [options[item] for item in indexes]}
    if question_type == "fill_blank":
        accepted = list(getattr(translation, "accepted", None) or [])
        return {"text": accepted[0] if accepted else None}
    if question_type == "ordering":
        order = [clean_int(item, -1, -1, len(options)) for item in (config.get("correct_order") or [])]
        return {
            "order": order,
            "texts": [
                options[item].get("text") if isinstance(options[item], dict) else options[item]
                for item in order
                if 0 <= item < len(options)
            ],
        }
    if question_type == "matching":
        rows = []
        for pair in (config.get("correct_pairs") or []):
            left = clean_int(pair.get("left"), -1, -1, len(options))
            right = clean_int(pair.get("right"), -1, -1, len(options))
            if 0 <= left < len(options) and 0 <= right < len(options):
                left_option = options[left]
                right_option = options[right]
                rows.append({
                    "left": left_option.get("left") if isinstance(left_option, dict) else left_option,
                    "right": right_option.get("right") if isinstance(right_option, dict) else right_option,
                })
        return {"pairs": rows}
    return None


def concept_row(
    concept: Any,
    translation: Any,
    mastery: Any = None,
    thresholds: dict | None = None,
) -> dict[str, Any]:
    score = clean_int(getattr(mastery, "mastery", 0), 0, 0, 100) if mastery is not None else 0
    return {
        "id": concept.id,
        "slug": concept.slug,
        "name": clamp_text(getattr(translation, "name", ""), 200),
        "description": clamp_text(getattr(translation, "description", None), 2000) or None,
        "category": concept.category or None,
        "difficulty": concept.difficulty,
        "status": concept.status,
        "mastery": score,
        "stage": mastery_stage(score, thresholds) if mastery is not None else "new",
        "attempt_count": (
            clean_int(getattr(mastery, "attempt_count", 0), 0, 0, 100000)
            if mastery is not None
            else 0
        ),
        "next_review": (
            iso(getattr(mastery, "next_review", None)) if mastery is not None else None
        ),
    }


def progress_row(progress: Any) -> dict[str, Any]:
    """The learner's own numbers, in the plain language the UI speaks."""
    if progress is None:
        return {
            "xp": 0,
            "streak": 0,
            "best_streak": 0,
            "questions_answered": 0,
            "sessions_completed": 0,
            "applications_done": 0,
            "last_practice_date": None,
            "practiced_today": False,
        }
    last_date = getattr(progress, "last_practice_date", None)
    return {
        "xp": clean_int(getattr(progress, "xp", 0), 0, 0, 10_000_000),
        "streak": clean_int(getattr(progress, "streak", 0), 0, 0, 100000),
        "best_streak": clean_int(getattr(progress, "best_streak", 0), 0, 0, 100000),
        "questions_answered": clean_int(getattr(progress, "questions_answered", 0), 0, 0, 10_000_000),
        "sessions_completed": clean_int(getattr(progress, "sessions_completed", 0), 0, 0, 10_000_000),
        "applications_done": clean_int(getattr(progress, "applications_done", 0), 0, 0, 10_000_000),
        "last_practice_date": last_date.isoformat() if isinstance(last_date, date) else None,
        "practiced_today": bool(last_date) and last_date == date.today(),
    }
