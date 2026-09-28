"""Shared Learn content rules: block catalogue, validation and serializers.

Both the public Learn router and the admin router import from here, so the
published lesson and the admin preview can never disagree about what a lesson
contains. Nothing in this module talks to the network or the request; it only
turns untrusted payloads into storable shapes and ORM rows into JSON.
"""

from datetime import datetime
from typing import Any

from app.models.learn import (  # noqa: F401  (re-exported for routers)
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

LANGUAGES = ("en", "sw")
DEFAULT_LANGUAGE = "en"

SECTIONS = ("understand", "see", "reflect", "practice", "next_step")
SECTION_LABELS = {
    "understand": "Understand",
    "see": "See",
    "reflect": "Reflect",
    "practice": "Practice",
    "next_step": "Next step",
}

PATH_LEVELS = ("beginner", "growing", "deeper")
PATH_STATUSES = ("draft", "published", "unpublished")
LESSON_STATUSES = ("draft", "published")
CATEGORY_STATUSES = ("draft", "published")

EVENT_TYPES = (
    "path_view",
    "lesson_view",
    "lesson_complete",
    "path_complete",
    "practice_done",
)

MAX_TEXT = 4000
MAX_LONG = 12000
MAX_SHORT = 240
MAX_BLOCKS = 120
MAX_RESPONSE_TEXT = 2000

# ---------------------------------------------------------------------------
# Block catalogue
#
# ``fields`` - authored (translated) text, stored in
#              LearnLessonBlockTranslation.data
# ``config`` - language-neutral values (media URLs, referenced record ids, a
#              callout tone, the index of a correct quiz answer) stored on the
#              block itself, so shared media is referenced rather than copied
# ``needs``  - at least one must be present for the block to say something
# ---------------------------------------------------------------------------
BLOCK_TYPES: dict[str, dict[str, Any]] = {
    "text": {
        "label": "Text", "group": "Teach", "section": "understand",
        "fields": ("text",), "config": (), "needs": ("text",),
    },
    "heading": {
        "label": "Heading", "group": "Teach", "section": "understand",
        "fields": ("text",), "config": (), "needs": ("text",),
    },
    "scripture": {
        "label": "Scripture", "group": "Teach", "section": "see",
        "fields": ("reference", "text", "version"), "config": (),
        "needs": ("reference", "text"),
    },
    "quote": {
        "label": "Quote", "group": "Teach", "section": "see",
        "fields": ("text", "attribution"), "config": (), "needs": ("text",),
    },
    "image": {
        "label": "Image", "group": "Media", "section": "see",
        "fields": ("alt", "caption"), "config": ("url",), "needs": ("url",),
    },
    "video": {
        "label": "Video", "group": "Media", "section": "see",
        "fields": ("caption",), "config": ("url",), "needs": ("url",),
    },
    "audio": {
        "label": "Audio", "group": "Media", "section": "see",
        "fields": ("caption",), "config": ("url",), "needs": ("url",),
    },
    "story": {
        "label": "Story or testimony", "group": "Media", "section": "see",
        "fields": ("title", "note"), "config": ("story_id", "url"),
        "needs": ("story_id", "title", "note"),
    },
    "reflection": {
        "label": "Reflection question", "group": "Respond", "section": "reflect",
        "fields": ("prompt", "placeholder"), "config": (), "needs": ("prompt",),
    },
    "discussion": {
        "label": "Discussion question", "group": "Respond", "section": "reflect",
        "fields": ("prompt", "notes"), "config": (), "needs": ("prompt",),
    },
    "quiz": {
        "label": "Quiz question", "group": "Respond", "section": "reflect",
        "fields": ("question", "options", "explanation"), "config": ("correct_index",),
        "needs": ("question", "options"),
    },
    "practice": {
        "label": "Practical activity", "group": "Do", "section": "practice",
        "fields": ("title", "instructions"), "config": (), "needs": ("instructions", "title"),
    },
    "prayer": {
        "label": "Prayer", "group": "Do", "section": "practice",
        "fields": ("text",), "config": (), "needs": ("text",),
    },
    "callout": {
        "label": "Callout", "group": "Do", "section": "understand",
        "fields": ("title", "text"), "config": ("tone",), "needs": ("text", "title"),
    },
    "next_step": {
        "label": "Next step", "group": "Do", "section": "next_step",
        "fields": ("title", "text"), "config": (), "needs": ("text", "title"),
    },
    "resource": {
        "label": "Related resource", "group": "Media", "section": "see",
        "fields": ("title", "description"), "config": ("resource_id", "url", "resource_type"),
        "needs": ("resource_id", "url", "title"),
    },
    "divider": {
        "label": "Divider", "group": "Structure", "section": "understand",
        "fields": (), "config": (), "needs": (),
    },
}

CALLOUT_TONES = ("info", "encouragement", "warning")
RESOURCE_TYPES = ("reel", "video", "audio", "book", "carousel", "quote", "image", "infographic", "document")


# ---------------------------------------------------------------------------
# Coercion helpers - every value coming from the admin UI is untrusted
# ---------------------------------------------------------------------------

def now() -> datetime:
    return datetime.utcnow()


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def clean_language(value: Any, fallback: str = DEFAULT_LANGUAGE) -> str:
    language = str(value or "").strip().lower()
    return language if language in LANGUAGES else fallback


def clamp_text(value: Any, limit: int = MAX_TEXT) -> str:
    """Coerce any client value into a trimmed, length-bounded string."""
    if value is None:
        return ""
    if not isinstance(value, str):
        if isinstance(value, (int, float, bool)):
            value = str(value)
        else:
            return ""
    return value.strip()[:limit]


def clean_id(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def clean_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(value, (int, float)):
        return bool(value)
    return fallback


def clean_int(value: Any, fallback: int = 0, minimum: int = 0, maximum: int = 100000) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, parsed))


def clean_media_url(value: Any) -> str:
    """Keep only same-origin uploads or absolute https URLs.

    Lesson media is either a file the admin uploaded (served from
    ``/uploads/...``) or an external HTTPS link. Anything else - ``javascript:``,
    ``data:``, plain http - is dropped instead of stored, so the public page can
    never be handed an unsafe src.
    """
    url = clamp_text(value, 500)
    if not url:
        return ""
    if url.startswith("/uploads/") or url.startswith("https://"):
        return url
    return ""


def clean_slug(value: Any) -> str:
    raw = clamp_text(value, 200).lower()
    cleaned = "".join(char if (char.isalnum() or char in "- ") else "" for char in raw)
    return "-".join(cleaned.replace("_", " ").split())[:180]


def normalize_block_type(value: Any) -> str:
    block_type = clamp_text(value, 30).lower()
    return block_type if block_type in BLOCK_TYPES else "text"


def normalize_section(value: Any, block_type: str) -> str:
    section = clamp_text(value, 20).lower()
    if section in SECTIONS:
        return section
    return BLOCK_TYPES[block_type]["section"]


def normalize_block_config(block_type: str, raw: Any) -> dict[str, Any]:
    """Validate the language-neutral half of a block."""
    source = raw if isinstance(raw, dict) else {}
    allowed = BLOCK_TYPES[block_type]["config"]
    config: dict[str, Any] = {}

    for key in allowed:
        if key in ("story_id", "resource_id"):
            value = clean_id(source.get(key))
            if value:
                config[key] = value
        elif key == "url":
            value = clean_media_url(source.get(key))
            if value:
                config[key] = value
        elif key == "tone":
            tone = clamp_text(source.get(key), 20).lower()
            config[key] = tone if tone in CALLOUT_TONES else "info"
        elif key == "correct_index":
            config[key] = clean_int(source.get(key), fallback=0, minimum=0, maximum=20)
        elif key == "resource_type":
            resource_type = clamp_text(source.get(key), 30).lower()
            config[key] = resource_type if resource_type in RESOURCE_TYPES else "document"

    if block_type == "callout" and "tone" not in config:
        config["tone"] = "info"
    return config


def normalize_block_data(block_type: str, raw: Any, *, limit: int = MAX_TEXT) -> dict[str, Any]:
    """Validate the authored (translated) half of a block."""
    source = raw if isinstance(raw, dict) else {}
    data: dict[str, Any] = {}

    for key in BLOCK_TYPES[block_type]["fields"]:
        value = source.get(key)
        if key == "options":
            options = []
            if isinstance(value, list):
                for option in value[:8]:
                    text = clamp_text(option, MAX_SHORT)
                    if text:
                        options.append(text)
            data[key] = options
        else:
            text = clamp_text(value, limit)
            if text:
                data[key] = text
    return data


def block_says_something(block_type: str, data: dict[str, Any], config: dict[str, Any]) -> bool:
    """True when a block would still show something in one language.

    A shared image, a referenced Story or a divider is meaningful even with no
    authored text; an empty text or reflection block is not.
    """
    if block_type == "divider":
        return True
    for key in BLOCK_TYPES[block_type]["needs"]:
        if key in ("story_id", "resource_id"):
            if config.get(key):
                return True
        elif key == "url":
            if config.get("url"):
                return True
        elif data.get(key):
            return True
    return False


LANGUAGE_NAMES = {"en": "English", "sw": "Swahili"}
OTHER_LANGUAGE = {"en": "sw", "sw": "en"}


def language_name(language: str) -> str:
    return LANGUAGE_NAMES.get(language, language)


def block_content_for_language(block: dict[str, Any], language: str) -> dict[str, Any]:
    return (block.get("translations") or {}).get(language) or {}


def lesson_validation(
    *,
    language: str,
    translations: dict[str, dict[str, Any]],
    blocks: list[dict[str, Any]],
    estimated_minutes: int,
    path_id: int | None,
    published: bool,
) -> dict[str, Any]:
    """Errors block publishing; warnings only advise the author.

    The distinction matters: "no Swahili version yet" must never stop an
    English lesson from being published, while a lesson with no content at all
    must never become public.
    """
    language = clean_language(language)
    translation = translations.get(language) or {}
    other = OTHER_LANGUAGE[language]
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    if not clamp_text(translation.get("title"), MAX_SHORT):
        errors.append({
            "code": "title_missing",
            "field": "title",
            "message": f"Add a {language_name(language)} title before publishing this lesson.",
        })

    if not path_id:
        errors.append({
            "code": "path_missing",
            "field": "path_id",
            "message": "Choose the learning path this lesson belongs to.",
        })

    if not blocks:
        errors.append({
            "code": "no_blocks",
            "field": "blocks",
            "message": "Add at least one content block so the lesson teaches something.",
        })
    else:
        content_blocks = [block for block in blocks if block["block_type"] != "divider"]
        if not content_blocks:
            errors.append({
                "code": "no_blocks",
                "field": "blocks",
                "message": "A lesson needs more than a divider. Add some content.",
            })

        visible = [
            block for block in content_blocks
            if block_says_something(
                block["block_type"],
                block_content_for_language(block, language),
                block.get("config") or {},
            )
        ]
        if content_blocks and not visible:
            errors.append({
                "code": "no_content_in_language",
                "field": "blocks",
                "message": (
                    f"None of the blocks have {language_name(language)} content yet, so the "
                    "lesson would look empty to learners."
                ),
            })

        empty = [
            index + 1 for index, block in enumerate(blocks)
            if block["block_type"] != "divider"
            and not block_says_something(
                block["block_type"],
                block_content_for_language(block, language),
                block.get("config") or {},
            )
        ]
        if empty:
            warnings.append({
                "code": "block_empty",
                "field": "blocks",
                "message": f"Blocks {empty} have no {language_name(language)} content yet.",
            })

        missing_other = [
            index + 1 for index, block in enumerate(blocks)
            if block["block_type"] != "divider"
            and not block_says_something(
                block["block_type"],
                block_content_for_language(block, other),
                block.get("config") or {},
            )
        ]
        if missing_other:
            warnings.append({
                "code": "translation_incomplete",
                "field": f"translations.{other}",
                "message": (
                    f"Blocks {missing_other} have no {language_name(other)} version, so the "
                    f"{language_name(other)} lesson will be shorter."
                ),
            })

    if not clamp_text(translation.get("objective_before")) and not clamp_text(translation.get("objective_after")):
        warnings.append({
            "code": "objective_missing",
            "field": "objective",
            "message": "Describe what the learner should understand before and after this lesson.",
        })

    if not clamp_text(translation.get("next_step")):
        warnings.append({
            "code": "next_step_missing",
            "field": "next_step",
            "message": "Every published lesson should send the learner away with one practical next step.",
        })

    if not estimated_minutes:
        warnings.append({
            "code": "time_missing",
            "field": "estimated_minutes",
            "message": "Add an estimated time so learners know what this lesson asks of them.",
        })
    elif estimated_minutes > 25:
        warnings.append({
            "code": "time_long",
            "field": "estimated_minutes",
            "message": "Learn works best in short lessons. Consider splitting anything over 25 minutes.",
        })

    if not (translations.get(other) or {}).get("title"):
        warnings.append({
            "code": "translation_missing",
            "field": f"translations.{other}",
            "message": f"No {language_name(other)} version of this lesson yet.",
        })

    return {
        "ready": not errors,
        "published": published,
        "errors": errors,
        "warnings": warnings,
    }


def path_validation(
    *,
    language: str,
    translations: dict[str, dict[str, Any]],
    lessons: list[dict[str, Any]],
    has_cover: bool,
    estimated_minutes: int,
) -> dict[str, Any]:
    """Errors block publishing a path; warnings only advise the author."""
    language = clean_language(language)
    translation = translations.get(language) or {}
    other = OTHER_LANGUAGE[language]
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    if not clamp_text(translation.get("title"), MAX_SHORT):
        errors.append({
            "code": "title_missing",
            "field": "title",
            "message": f"Add a {language_name(language)} title before publishing this path.",
        })

    if not lessons:
        errors.append({
            "code": "no_lessons",
            "field": "lessons",
            "message": "Add at least one lesson before publishing this path.",
        })
    else:
        untitled = [
            lesson["position"] + 1 for lesson in lessons
            if not clamp_text(
                ((lesson.get("translations") or {}).get(language) or {}).get("title"), MAX_SHORT
            )
        ]
        if untitled:
            errors.append({
                "code": "lesson_title_missing",
                "field": "lessons",
                "message": (
                    f"Lessons {untitled} have no {language_name(language)} title. "
                    "Give every lesson a title before the path goes live."
                ),
            })

        if not any(lesson.get("status") == "published" for lesson in lessons):
            warnings.append({
                "code": "no_published_lessons",
                "field": "lessons",
                "message": "No lesson in this path is published yet, so learners will see an empty path.",
            })

        drafts = [lesson["position"] + 1 for lesson in lessons if lesson.get("status") != "published"]
        if drafts:
            warnings.append({
                "code": "lessons_unpublished",
                "field": "lessons",
                "message": f"Lessons {drafts} are still drafts, so they stay hidden on the public path.",
            })

        missing_other = [
            lesson["position"] + 1 for lesson in lessons
            if not clamp_text(
                ((lesson.get("translations") or {}).get(other) or {}).get("title"), MAX_SHORT
            )
        ]
        if missing_other:
            warnings.append({
                "code": "translation_incomplete",
                "field": f"translations.{other}",
                "message": (
                    f"Lessons {missing_other} have no {language_name(other)} title, so the "
                    f"{language_name(other)} path will be shorter."
                ),
            })

        if len(lessons) > 8:
            warnings.append({
                "code": "path_long",
                "field": "lessons",
                "message": "A path of more than eight lessons is hard to finish. Consider splitting it.",
            })

    if not has_cover:
        warnings.append({
            "code": "cover_missing",
            "field": "cover_url",
            "message": "Add a cover image so the path looks complete in the Learn list.",
        })

    if not estimated_minutes:
        warnings.append({
            "code": "time_missing",
            "field": "estimated_minutes",
            "message": "Set an estimated total time, or leave it to be summed from the lessons.",
        })

    if not (translations.get(other) or {}).get("title"):
        warnings.append({
            "code": "translation_missing",
            "field": f"translations.{other}",
            "message": f"No {language_name(other)} version of this path yet.",
        })

    return {
        "ready": not errors,
        "errors": errors,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def translation_map(rows: list[Any]) -> dict[str, Any]:
    """Index translation rows by language for admin editing."""
    return {row.language: row for row in rows if row.language in LANGUAGES}


def serialize_path_translation(row: LearnPathTranslation | None) -> dict[str, Any]:
    return {
        "title": clamp_text(getattr(row, "title", ""), MAX_SHORT),
        "description": clamp_text(getattr(row, "description", ""), MAX_LONG),
    }


def serialize_lesson_translation(row: LearnLessonTranslation | None) -> dict[str, Any]:
    return {
        "title": clamp_text(getattr(row, "title", ""), MAX_SHORT),
        "summary": clamp_text(getattr(row, "summary", ""), MAX_TEXT),
        "objective_before": clamp_text(getattr(row, "objective_before", ""), MAX_TEXT),
        "objective_after": clamp_text(getattr(row, "objective_after", ""), MAX_TEXT),
        "objective_action": clamp_text(getattr(row, "objective_action", ""), MAX_TEXT),
        "next_step": clamp_text(getattr(row, "next_step", ""), MAX_TEXT),
        "completion_message": clamp_text(getattr(row, "completion_message", ""), MAX_TEXT),
    }


def serialize_all_path_translations(path: LearnPath) -> dict[str, dict[str, Any]]:
    rows = translation_map(list(path.translations))
    return {language: serialize_path_translation(rows.get(language)) for language in LANGUAGES}


def serialize_all_lesson_translations(lesson: LearnLesson) -> dict[str, dict[str, Any]]:
    rows = translation_map(list(lesson.translations))
    return {language: serialize_lesson_translation(rows.get(language)) for language in LANGUAGES}


def serialize_block_admin(block: LearnLessonBlock) -> dict[str, Any]:
    """One block as the lesson builder needs it: every language side by side."""
    block_type = normalize_block_type(block.block_type)
    rows = translation_map(list(block.translations))
    translations = {
        language: normalize_block_data(block_type, getattr(rows.get(language), "data", {}))
        for language in LANGUAGES
    }
    config = normalize_block_config(block_type, block.config or {})
    return {
        "id": block.id,
        "block_type": block_type,
        "label": BLOCK_TYPES[block_type]["label"],
        "section": normalize_section(block.section, block_type),
        "position": block.position,
        "required": bool(block.required),
        "config": config,
        "translations": translations,
        "empty_in": [
            language for language in LANGUAGES
            if not block_says_something(block_type, translations[language], config)
        ],
    }


def serialize_block_public(block: LearnLessonBlock, language: str) -> dict[str, Any]:
    block_type = normalize_block_type(block.block_type)
    rows = translation_map(list(block.translations))
    data = normalize_block_data(block_type, getattr(rows.get(language), "data", {}))
    config = normalize_block_config(block_type, block.config or {})
    section = normalize_section(block.section, block_type)
    return {
        "id": block.id,
        "block_type": block_type,
        "section": section,
        "section_label": SECTION_LABELS[section],
        "position": block.position,
        "required": bool(block.required),
        "config": config,
        "data": data,
        "missing_translation": not rows.get(language),
    }


def published_blocks(lesson: LearnLesson, language: str) -> list[dict[str, Any]]:
    """Blocks a visitor should see: real content in *this* language only.

    A block with no translation in the selected language is left out rather
    than shown empty or in the other language, which is what keeps an English
    and a Swahili lesson from ever mixing.
    """
    blocks = []
    for block in lesson.blocks:
        payload = serialize_block_public(block, language)
        if block_says_something(payload["block_type"], payload["data"], payload["config"]):
            blocks.append(payload)
    return blocks


def serialize_admin_lesson_row(lesson: LearnLesson) -> dict[str, Any]:
    translations = serialize_all_lesson_translations(lesson)
    return {
        "id": lesson.id,
        "slug": lesson.slug,
        "path_id": lesson.path_id,
        "position": lesson.position,
        "status": lesson.status,
        "language": lesson.language,
        "estimated_minutes": lesson.estimated_minutes,
        "thumbnail_url": lesson.thumbnail_url,
        "block_count": len(lesson.blocks),
        "title": translations[lesson.language]["title"] or translations["en"]["title"],
        "translations": translations,
        "updated_at": iso(lesson.updated_at),
        "published_at": iso(lesson.published_at),
    }


def serialize_admin_lesson(lesson: LearnLesson) -> dict[str, Any]:
    translations = serialize_all_lesson_translations(lesson)
    blocks = [serialize_block_admin(block) for block in lesson.blocks]
    validation = lesson_validation(
        language=lesson.language,
        translations=translations,
        blocks=blocks,
        estimated_minutes=lesson.estimated_minutes,
        path_id=lesson.path_id,
        published=lesson.status == "published",
    )
    return {
        "lesson": {
            "id": lesson.id,
            "slug": lesson.slug,
            "path_id": lesson.path_id,
            "position": lesson.position,
            "status": lesson.status,
            "language": lesson.language,
            "estimated_minutes": lesson.estimated_minutes,
            "thumbnail_url": lesson.thumbnail_url,
            "created_at": iso(lesson.created_at),
            "updated_at": iso(lesson.updated_at),
            "published_at": iso(lesson.published_at),
        },
        "translations": translations,
        "blocks": blocks,
        "validation": validation,
    }


def _lesson_titles(lesson: LearnLesson, fallback_language: str) -> dict[str, Any]:
    translations = serialize_all_lesson_translations(lesson)
    return {
        "id": lesson.id,
        "slug": lesson.slug,
        "position": lesson.position,
        "status": lesson.status,
        "estimated_minutes": lesson.estimated_minutes,
        "thumbnail_url": lesson.thumbnail_url,
        "block_count": len(lesson.blocks),
        "translations": translations,
        "title": translations[fallback_language]["title"] or translations["en"]["title"],
    }


def serialize_admin_path_row(path: LearnPath) -> dict[str, Any]:
    translations = serialize_all_path_translations(path)
    lessons = sorted(path.lessons, key=lambda item: item.position)
    return {
        "id": path.id,
        "slug": path.slug,
        "title": translations[path.language]["title"] or translations["en"]["title"],
        "status": path.status,
        "language": path.language,
        "level": path.level,
        "featured": path.featured,
        "display_order": path.display_order,
        "category_id": path.category_id,
        "cover_url": path.cover_url,
        "estimated_minutes": path.estimated_minutes,
        "lesson_count": len(lessons),
        "published_lesson_count": len([item for item in lessons if item.status == "published"]),
        "translations": translations,
        "updated_at": iso(path.updated_at),
        "published_at": iso(path.published_at),
    }


def serialize_admin_path(path: LearnPath) -> dict[str, Any]:
    translations = serialize_all_path_translations(path)
    lessons = sorted(path.lessons, key=lambda item: item.position)
    lesson_rows = [_lesson_titles(lesson, path.language) for lesson in lessons]
    validation = path_validation(
        language=path.language,
        translations=translations,
        lessons=lesson_rows,
        has_cover=bool(path.cover_url),
        estimated_minutes=path.estimated_minutes,
    )
    return {
        "path": {
            "id": path.id,
            "slug": path.slug,
            "category_id": path.category_id,
            "cover_url": path.cover_url,
            "level": path.level,
            "estimated_minutes": path.estimated_minutes,
            "language": path.language,
            "status": path.status,
            "featured": path.featured,
            "display_order": path.display_order,
            "created_at": iso(path.created_at),
            "updated_at": iso(path.updated_at),
            "published_at": iso(path.published_at),
        },
        "translations": translations,
        "lessons": lesson_rows,
        "validation": validation,
    }


def serialize_admin_category(category: LearnCategory, path_count: int = 0) -> dict[str, Any]:
    rows = translation_map(list(category.translations))
    translations = {
        language: {
            "name": clamp_text(getattr(rows.get(language), "name", ""), MAX_SHORT),
            "description": clamp_text(getattr(rows.get(language), "description", ""), MAX_TEXT),
        }
        for language in LANGUAGES
    }
    return {
        "id": category.id,
        "slug": category.slug,
        "icon": category.icon,
        "display_order": category.display_order,
        "status": category.status,
        "path_count": path_count,
        "translations": translations,
        "updated_at": iso(category.updated_at),
    }


def build_progress(
    *,
    lessons: list[dict[str, Any]],
    completed_ids: set[int],
    started: bool,
    current_lesson_id: int | None = None,
    completed_at: datetime | None = None,
) -> dict[str, Any]:
    """Turn completed lesson ids into the progress the UI shows.

    ``lessons`` must be the ordered list of lessons a learner can actually see
    (published, in the selected language), so progress can never reach 100%
    because of a hidden draft.
    """
    rows = []
    for lesson in lessons:
        rows.append({
            "id": lesson["id"],
            "slug": lesson["slug"],
            "title": lesson["title"],
            "position": lesson["position"],
            "estimated_minutes": lesson.get("estimated_minutes", 0),
            "completed": lesson["id"] in completed_ids,
        })

    total = len(rows)
    completed_count = len([row for row in rows if row["completed"]])
    current = next((row for row in rows if row["id"] == current_lesson_id), None)
    if current is None:
        current = next((row for row in rows if not row["completed"]), None)
    for row in rows:
        row["current"] = bool(current and row["id"] == current["id"])

    return {
        "total": total,
        "completed": completed_count,
        "percent": round(completed_count / total * 100) if total else 0,
        "started": started or completed_count > 0,
        "completed_path": bool(total) and completed_count == total,
        "completed_at": iso(completed_at),
        "current_lesson": current,
        "next_lesson": next((row for row in rows if not row["completed"]), None),
        "lessons": rows,
    }


__all__ = [
    "BLOCK_TYPES",
    "CATEGORY_STATUSES",
    "DEFAULT_LANGUAGE",
    "EVENT_TYPES",
    "LANGUAGES",
    "LESSON_STATUSES",
    "PATH_LEVELS",
    "PATH_STATUSES",
    "SECTIONS",
    "SECTION_LABELS",
    "block_says_something",
    "build_progress",
    "clamp_text",
    "clean_bool",
    "clean_id",
    "clean_int",
    "clean_language",
    "clean_media_url",
    "clean_slug",
    "iso",
    "lesson_validation",
    "now",
    "normalize_block_config",
    "normalize_block_data",
    "normalize_block_type",
    "normalize_section",
    "path_validation",
    "published_blocks",
    "serialize_admin_category",
    "serialize_admin_lesson",
    "serialize_admin_lesson_row",
    "serialize_admin_path",
    "serialize_admin_path_row",
    "serialize_all_lesson_translations",
    "serialize_all_path_translations",
    "serialize_block_admin",
    "serialize_block_public",
    "serialize_lesson_translation",
    "serialize_path_translation",
    "translation_map",
]



