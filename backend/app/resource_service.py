"""Turning Resource rows into the payload the public site and admin read.

Everything that shows a Resource - a listing card, a detail viewer, the admin
editor, a search result - goes through :func:`serialize_resource`.  Keeping the
language fallback, the media resolution and the child collections in one place
is what stops the nine viewers from drifting apart.

The rules it encodes:

* A Resource is public only when it is published, not deleted, not private and
  not scheduled for the future.  Nothing else may widen that.
* Text falls back from the requested language to the resource's own language
  and then to whatever exists, so a half-translated resource still renders.
* A language-specific file wins over a shared one, which wins over the legacy
  single ``url`` column.
"""

from datetime import datetime

from sqlalchemy import and_, case, false, or_, select
from sqlalchemy.orm import Session

from app.models.learn import (
    LearnLesson,
    LearnLessonTranslation,
    LearnPath,
    LearnPathTranslation,
)
from app.models.resource import (
    BookChapter,
    CarouselSlide,
    Resource,
    ResourceMedia,
    ResourceRelationship,
    ResourceTranslation,
)
from app.models.resource_tag import resource_tags
from app.models.story import Story
from app.models.tag import Tag
from app.schemas.resource import RESOURCE_TYPE_SET, TYPE_ALIASES


def _pick(*values):
    """First value that is a non-empty string (or a truthy non-string)."""
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            if value.strip():
                return value
            continue
        if value:
            return value
    return None


def normalise_type(value: str | None) -> str:
    """The canonical resource type, mapping legacy names as it goes.

    A row can only hold one of the nine types, but the column is free text and
    older deployments wrote ``photo``/``pdf``/``videos`` into it.  Applying the
    same alias table the schema uses means historical content still opens in its
    own viewer instead of degrading into a generic document.
    """
    candidate = (value or "").strip().lower()
    candidate = TYPE_ALIASES.get(candidate, candidate)
    return candidate if candidate in RESOURCE_TYPE_SET else "document"


def slugify(value: str) -> str:
    """A URL-safe slug: lower-cased, non-alphanumerics collapsed to dashes."""
    cleaned = "".join(
        char if char.isalnum() else "-" for char in (value or "").lower()
    )
    return "-".join(part for part in cleaned.split("-") if part)


def unique_slug(
    db: Session,
    title: str,
    slug: str | None,
    exclude_id: int | None = None,
) -> str:
    """A slug that is unique across the table, suffixing when needed.

    ``exclude_id`` is the row being edited. Without it the resource's own slug
    counts as a collision, so every save would append ``-2`` and quietly break
    any link already pointing at it.

    Lives in the service rather than in one router because every create path -
    the studio, the console's legacy form, the author submission - needs the
    same answer, and a duplicate slug is a 500 on the unique index.
    """
    base = slugify(slug or title)[:200] or "resource"
    candidate = base
    suffix = 2

    while True:
        existing = db.execute(
            select(Resource.id).where(Resource.slug == candidate).limit(1)
        ).scalars().first()

        if existing is None or existing == exclude_id:
            return candidate

        candidate = f"{base}-{suffix}"
        suffix += 1


def flat_create_values(data) -> dict:
    """Constructor kwargs for one Resource row from a ``ResourceCreate``.

    Two jobs, both of which the flat legacy create routes used to get wrong:

    * Only real columns may reach the declarative constructor.  The payload
      carries the editor's child collections (``slides``, ``translations``,
      ``media``, ...), and the model names its relationships differently
      (``carousel_slides``, ...), so passing the raw ``model_dump()`` raises
      ``TypeError: ... invalid keyword argument`` and the request 500s.
    * The oldest callers send ``resource_type`` / ``downloadable`` /
      ``published`` instead of ``type`` / ``download_enabled`` / ``status``.
      Those are folded into the current fields - an explicit new field always
      wins - and the legacy mirror columns are kept in step so older readers
      (the console's counts, the approvals list) still see the right values.
    """
    payload = data.model_dump()
    legacy_type = payload.pop("resource_type", None)
    legacy_downloadable = payload.pop("downloadable", None)
    legacy_published = payload.pop("published", None)
    sent = data.model_fields_set

    columns = {column.name for column in Resource.__table__.columns}
    values = {key: value for key, value in payload.items() if key in columns}

    # Type: an explicit `type` wins; otherwise the legacy `resource_type`.
    canonical = normalise_type(values.get("type"))
    if legacy_type and "type" not in sent:
        canonical = normalise_type(legacy_type)
    values["type"] = canonical
    values["resource_type"] = canonical

    # Status and its boolean mirror agree with each other by construction.
    if legacy_published is not None and "status" not in sent:
        values["status"] = "published" if legacy_published else "draft"
    values["published"] = values.get("status") == "published"
    if values["published"] and not values.get("published_at"):
        values["published_at"] = datetime.utcnow()

    if legacy_downloadable is not None and "download_enabled" not in sent:
        values["download_enabled"] = bool(legacy_downloadable)
    values["downloadable"] = bool(values.get("download_enabled"))

    return values


def translation_for(
    resource: Resource,
    language: str,
) -> ResourceTranslation | None:
    """The best translation for ``language``, falling back sensibly.

    Preference order: an exact language match, then the resource's own
    language, then English.  Returning ``None`` is fine - the serializer falls
    back to the resource's own columns.
    """
    if not resource.translations:
        return None

    by_language = {
        (item.language or "en"): item for item in resource.translations
    }

    for candidate in (language, resource.language, "en"):
        if candidate and candidate in by_language:
            return by_language[candidate]

    return resource.translations[0] if resource.translations else None


def media_for(
    resource: Resource,
    language: str,
    media_type: str | None = None,
) -> ResourceMedia | None:
    """The media row that should play for ``language``.

    An exact-language file beats a shared one, and the lowest ``sort_order``
    wins within a tier, so the admin controls precedence by reordering.
    """
    candidates = [
        item
        for item in resource.media
        if media_type is None or item.media_type == media_type
    ]
    if not candidates:
        return None

    exact = sorted(
        (
            item
            for item in candidates
            if not item.is_shared and (item.language or "en") == language
        ),
        key=lambda item: item.sort_order,
    )
    if exact:
        return exact[0]

    shared = sorted(
        (item for item in candidates if item.is_shared),
        key=lambda item: item.sort_order,
    )
    if shared:
        return shared[0]

    return sorted(candidates, key=lambda item: item.sort_order)[0]


def _bilingual(en_value, sw_value, language: str):
    """Prefer the requested language, then fall back to the other one."""
    if language == "sw":
        return _pick(sw_value, en_value)
    return _pick(en_value, sw_value)


def _slide_image(slide: CarouselSlide, language: str) -> str | None:
    """The slide image for a language, then the shared fallback column."""
    return (
        _bilingual(slide.image_url_en, slide.image_url_sw, language)
        or _pick(slide.image_url)
    )


def serialize_slides(resource: Resource, language: str) -> list[dict]:
    """Ordered carousel slides with their text resolved for one language.

    ``alt_text`` falls back to the caption or the on-slide text so a slide is
    never announced as an unlabelled image; an editor can always override it.
    """
    return [
        {
            "id": slide.id,
            "sort_order": slide.sort_order,
            "image_url": _slide_image(slide, language),
            "text": _bilingual(slide.text_en, slide.text_sw, language),
            "caption": _bilingual(slide.caption_en, slide.caption_sw, language),
            "alt_text": (
                slide.alt_text
                or _bilingual(slide.caption_en, slide.caption_sw, language)
                or _bilingual(slide.text_en, slide.text_sw, language)
            ),
        }
        for slide in sorted(
            resource.carousel_slides,
            key=lambda item: item.sort_order,
        )
    ]


def serialize_chapters(resource: Resource, language: str) -> list[dict]:
    """Chapters with their text and file resolved for one language.

    A chapter may carry reading text, a file, or both.  The reader prefers the
    text because it is far more accessible, so both are resolved here.
    """
    chapters: list[dict] = []
    for chapter in sorted(resource.chapters, key=lambda item: item.sort_order):
        chapters.append({
            "id": chapter.id,
            "sort_order": chapter.sort_order,
            "title": _bilingual(
                chapter.title_en, chapter.title_sw, language
            ) or "",
            "file_url": (
                _bilingual(chapter.file_url_en, chapter.file_url_sw, language)
                or _pick(chapter.file_url_en, chapter.file_url_sw)
            ),
            "body": _bilingual(chapter.body_en, chapter.body_sw, language),
            "page_count": chapter.page_count,
            "file_size": chapter.file_size,
        })
    return chapters


def serialize_media(resource: Resource) -> list[dict]:
    return [
        {
            "id": item.id,
            "url": item.url,
            "media_type": item.media_type,
            "language": item.language,
            "mime_type": item.mime_type,
            "file_size": item.file_size,
            "duration": item.duration,
            "width": item.width,
            "height": item.height,
            "is_shared": item.is_shared,
            "sort_order": item.sort_order,
        }
        for item in sorted(resource.media, key=lambda entry: entry.sort_order)
    ]


def _resolved_text(translation, field: str, language: str):
    """A translated value for ``field``, then its sibling, then ``None``.

    ``ResourceTranslation`` has no ``*_en``/``*_sw`` pairs - each row already
    belongs to one language - so the sibling is the *other row*, which
    ``translation_for`` has already chosen the best of.  This helper exists to
    keep the call sites uniform with the slide/chapter helpers above.
    """
    if translation is None:
        return None
    return _pick(getattr(translation, field, None))


def serialize_resource(
    resource: Resource,
    language: str = "en",
    related: list[dict] | None = None,
) -> dict:
    """The public payload for one Resource, resolved for ``language``.

    This is the single contract every viewer renders from, so it deliberately
    resolves the media file, both translations and the child collections here
    rather than leaving that to nine different clients.
    """
    translation = translation_for(resource, language)
    resource_type = normalise_type(resource.type)

    title = _pick(_resolved_text(translation, "title", language), resource.title)
    description = _pick(
        _resolved_text(translation, "description", language),
        resource.description,
    )

    # Media: a per-language file, then a shared one, then the legacy single
    # URL column and finally an external link.
    primary_media = media_for(resource, language)
    media_url = _pick(
        primary_media.url if primary_media else None,
        resource.external_url,
        resource.url,
    )

    # An image, infographic or quote can stand in for its own cover, which
    # keeps its card from showing a generic tile.
    cover = _pick(
        resource.cover_url,
        media_url if resource_type in {"image", "infographic", "quote"} else None,
    )

    downloadable = bool(resource.download_enabled)

    return {
        "id": resource.id,
        "type": resource_type,
        "resource_type": resource_type,
        "slug": resource.slug,
        "title": title or "",
        "description": description or "",
        "excerpt": _pick(_resolved_text(translation, "excerpt", language), resource.excerpt),
        "language": language,
        "author": _pick(resource.author),
        "topic": resource.topic,
        "category": resource.topic,
        "tags": [tag.name for tag in resource.tags],
        "tag_slugs": [tag.slug for tag in resource.tags],

        "cover_url": cover,
        "url": resource.url,
        "external_url": resource.external_url,
        "media_url": media_url,
        "media": serialize_media(resource),
        "slides": serialize_slides(resource, language),
        "chapters": serialize_chapters(resource, language),

        "quote_text": _pick(
            _resolved_text(translation, "quote_text", language),
            resource.quote_text,
        ),
        "attribution": _pick(
            _resolved_text(translation, "attribution", language),
            resource.attribution,
        ),
        "caption": _pick(
            _resolved_text(translation, "caption", language),
            resource.caption,
        ),
        "alt_text": _pick(resource.alt_text),
        "accessibility_desc": _pick(
            _resolved_text(translation, "accessibility_desc", language),
            resource.accessibility_desc,
        ),
        "transcript": _resolved_text(translation, "transcript", language),

        "duration": _pick(
            primary_media.duration if primary_media else None,
            resource.duration,
        ),
        "page_count": resource.page_count,
        "file_size": _pick(
            primary_media.file_size if primary_media else None,
            resource.file_size,
        ),
        "mime_type": _pick(
            primary_media.mime_type if primary_media else None,
            resource.mime_type,
        ),
        "carousel_urls": list(resource.carousel_urls or []),

        "status": resource.status,
        "published": resource.published,
        "published_at": resource.published_at,
        "scheduled_for": resource.scheduled_for,
        "featured": resource.featured,
        "recommended": resource.recommended,
        "is_new": resource.is_new,
        "homepage_visible": resource.homepage_visible,
        "visibility": resource.visibility,
        "download_enabled": downloadable,
        "downloadable": downloadable,
        "share_enabled": resource.share_enabled,
        "save_enabled": resource.save_enabled,
        "view_count": resource.view_count or 0,
        "display_order": resource.display_order,

        "created_at": resource.created_at,
        "updated_at": resource.updated_at,
        "owner_id": resource.owner_id,
        "related": related or [],
    }


# ---------------------------------------------------------------------------
# Visibility
# ---------------------------------------------------------------------------

def is_publicly_visible(
    resource: Resource,
    now: datetime | None = None,
) -> bool:
    """Whether the public site may show this Resource right now.

    Deliberately narrow: published, not trashed, not private, and not sitting
    in the future waiting for its scheduled moment.  The admin routes check
    :func:`admin_visible` instead - this function is the public gate and is
    never widened.
    """
    if resource.deleted_at is not None:
        return False

    if (resource.status or "draft") != "published":
        return False

    if (resource.visibility or "public") == "private":
        return False

    if resource.scheduled_for and not resource.published_at:
        reference = now or datetime.utcnow()
        if resource.scheduled_for > reference:
            return False

    return True


def admin_visible(resource: Resource) -> bool:
    """Whether the admin workspace may see this Resource (trash included)."""
    return True


def published_filters(now: datetime | None = None):
    """The filter every public Resource listing starts from."""
    reference = now or datetime.utcnow()
    return (
        Resource.status == "published",
        Resource.deleted_at.is_(None),
        Resource.visibility != "private",
        or_(
            Resource.scheduled_for.is_(None),
            Resource.scheduled_for <= reference,
        ),
    )


# ---------------------------------------------------------------------------
# Related resources
# ---------------------------------------------------------------------------

def resource_href(payload: dict) -> str:
    """The public route for a serialized Resource."""
    slug = payload.get("slug") or payload.get("id")
    return f"/resources/{payload.get('type', 'document')}/{slug}"


def _lesson_title(lesson: LearnLesson, language: str) -> str:
    for translation in lesson.translations:
        if (translation.language or "en") == language and translation.title:
            return translation.title
    for translation in lesson.translations:
        if translation.title:
            return translation.title
    return lesson.slug


def _linked_item(
    related_type: str,
    related_id: int,
    resource_cache: dict[int, dict],
    story_cache: dict[int, dict],
    lesson_cache: dict[int, dict],
) -> dict | None:
    """Resolve one relationship row into a small display payload.

    Returns ``None`` for anything missing or not public, so a deleted story
    silently drops out of the rail instead of leaving a dead link.
    """
    if related_type == "resource":
        payload = resource_cache.get(related_id)
        if not payload:
            return None
        return {
            "kind": "resource",
            "id": related_id,
            "type": payload.get("type", "document"),
            "title": payload.get("title", ""),
            "description": payload.get("excerpt") or payload.get("description", ""),
            "cover_url": payload.get("cover_url"),
            "href": resource_href(payload),
            "duration": payload.get("duration"),
        }

    if related_type == "story":
        payload = story_cache.get(related_id)
        if not payload:
            return None
        return {
            "kind": "story",
            "id": related_id,
            "type": "story",
            "title": payload["title"],
            "description": payload.get("description", ""),
            "cover_url": payload.get("cover_url"),
            "href": f"/stories/{related_id}",
        }

    if related_type in {"learning", "lesson"}:
        payload = lesson_cache.get(related_id)
        if not payload:
            return None
        return {
            "kind": "learning",
            "id": related_id,
            "type": "learning",
            "title": payload["title"],
            "description": payload.get("description", ""),
            "cover_url": payload.get("cover_url"),
            "href": payload["href"],
        }

    return None
def resolve_related(
    db: Session,
    resource: Resource,
    language: str,
    limit: int = 8,
) -> list[dict]:
    """The public "Related resources" rail for one Resource.

    Editor-chosen links come first, in the order they chose.  When an editor
    linked fewer than ``limit`` items the rail is topped up with same-type
    resources sharing a topic or tag, so it is never a lonely row of two.
    """
    relationships = sorted(
        resource.relationships,
        key=lambda item: item.sort_order,
    )

    resource_ids: list[int] = []
    story_ids: list[int] = []
    lesson_ids: list[int] = []

    for item in relationships:
        if item.related_type == "resource":
            resource_ids.append(item.related_id)
        elif item.related_type == "story":
            story_ids.append(item.related_id)
        elif item.related_type in {"learning", "lesson"}:
            lesson_ids.append(item.related_id)

    # Every linked item is re-checked for public visibility here, so a link to
    # a draft or a trashed story cannot leak it through the Resources rail.
    resource_cache: dict[int, dict] = {}
    if resource_ids:
        rows = db.execute(
            select(Resource).where(
                Resource.id.in_(resource_ids),
                *published_filters(),
            )
        ).scalars().all()
        resource_cache = {
            row.id: serialize_resource(row, language) for row in rows
        }

    story_cache: dict[int, dict] = {}
    if story_ids:
        rows = db.execute(
            select(Story).where(
                Story.id.in_(story_ids),
                Story.published.is_(True),
                Story.deleted_at.is_(None),
            )
        ).scalars().all()
        story_cache = {
            row.id: {
                "title": row.title,
                "description": (row.description or "")[:220],
                "cover_url": row.image_url,
            }
            for row in rows
        }

    lesson_cache: dict[int, dict] = {}
    if lesson_ids:
        rows = db.execute(
            select(LearnLesson, LearnPath)
            .join(LearnPath, LearnLesson.path_id == LearnPath.id)
            .where(
                LearnLesson.id.in_(lesson_ids),
                LearnLesson.status == "published",
                LearnPath.status == "published",
            )
        ).all()
        for lesson, path in rows:
            lesson_cache[lesson.id] = {
                "title": _lesson_title(lesson, language),
                "description": (lesson.summary or "")[:220],
                "cover_url": path.cover_url,
                "href": f"/learn/paths/{path.slug}/lessons/{lesson.slug}",
            }

    resolved: list[dict] = []
    seen: set[tuple[str, int]] = set()

    for item in relationships:
        entry = _linked_item(
            item.related_type,
            item.related_id,
            resource_cache,
            story_cache,
            lesson_cache,
        )
        if not entry:
            continue
        key = (entry["kind"], entry["id"])
        if key in seen:
            continue
        seen.add(key)
        resolved.append(entry)

    if len(resolved) < limit:
        resolved.extend(
            _autofill_related(
                db,
                resource,
                language,
                exclude={
                    entry["id"]
                    for entry in resolved
                    if entry["kind"] == "resource"
                },
                limit=limit - len(resolved),
            )
        )

    return resolved[:limit]


def _autofill_related(
    db: Session,
    resource: Resource,
    language: str,
    exclude: set[int],
    limit: int,
) -> list[dict]:
    """Same-type resources sharing a topic or tag, newest first."""
    if limit <= 0:
        return []

    tag_slugs = [tag.slug for tag in resource.tags]
    resource_type = normalise_type(resource.type)

    conditions = [
        Resource.id != resource.id,
        Resource.type == resource_type,
        *published_filters(),
    ]
    if exclude:
        conditions.append(Resource.id.notin_(exclude))

    # Prefer something related; fall back to the newest of the same type so the
    # rail still has something to offer.
    affinity_parts = []
    if resource.topic:
        affinity_parts.append(Resource.topic == resource.topic)
    if tag_slugs:
        affinity_parts.append(Resource.id.in_(tag_ids_matching_any(tag_slugs)))

    affinity = or_(*affinity_parts) if affinity_parts else false()

    rows = db.execute(
        select(Resource)
        .where(and_(*conditions))
        .order_by(
            case((affinity, 0), else_=1),
            Resource.published_at.desc().nullslast(),
            Resource.created_at.desc(),
        )
        .limit(limit)
    ).scalars().all()

    entries: list[dict] = []
    for row in rows:
        payload = serialize_resource(row, language)
        entries.append({
            "kind": "resource",
            "id": row.id,
            "type": payload["type"],
            "title": payload["title"],
            "description": (payload["excerpt"] or payload["description"] or "")[:220],
            "cover_url": payload["cover_url"],
            "href": resource_href(payload),
            "duration": payload["duration"],
        })
    return entries

def _like(term: str) -> str:
    return f"%{term.strip()}%"


def matching_translation(term: str):
    """An ``EXISTS`` subquery matching a Resource's translated text.

    An ``EXISTS`` rather than a join on purpose: joining would return one row
    per matching translation, which duplicates resources in the listing and
    makes the pagination counts quietly wrong.
    """
    like = _like(term)
    return select(1).where(
        ResourceTranslation.resource_id == Resource.id,
        or_(
            ResourceTranslation.title.ilike(like),
            ResourceTranslation.description.ilike(like),
            ResourceTranslation.excerpt.ilike(like),
            ResourceTranslation.quote_text.ilike(like),
            ResourceTranslation.attribution.ilike(like),
        ),
    ).exists()


def matching_tag(term: str):
    """An ``EXISTS`` subquery matching a Resource's tag name or slug."""
    like = _like(term)
    return (
        select(1)
        .select_from(resource_tags)
        .join(Tag, Tag.id == resource_tags.c.tag_id)
        .where(
            resource_tags.c.resource_id == Resource.id,
            or_(Tag.name.ilike(like), Tag.slug.ilike(like)),
        )
        .exists()
    )


def search_filters(term: str):
    """Case-insensitive matching across the metadata search should cover.

    Title, description, excerpt, quote text, author, topic, alt text, tags and
    the per-language translation rows all count, because an editor searching
    for "prayer" expects to find a resource whether the word lives in its title
    or only inside its Swahili translation.
    """
    if not term or not term.strip():
        return Resource.id.isnot(None)

    like = _like(term)

    return or_(
        Resource.title.ilike(like),
        Resource.description.ilike(like),
        Resource.excerpt.ilike(like),
        Resource.quote_text.ilike(like),
        Resource.attribution.ilike(like),
        Resource.author.ilike(like),
        Resource.topic.ilike(like),
        Resource.slug.ilike(like),
        Resource.alt_text.ilike(like),
        matching_translation(term),
        matching_tag(term),
    )


def tag_ids_matching(term: str):
    """Ids of Resources carrying a tag whose name or slug matches ``term``."""
    return (
        select(resource_tags.c.resource_id)
        .select_from(resource_tags)
        .join(Tag, Tag.id == resource_tags.c.tag_id)
        .where(or_(Tag.name.ilike(_like(term)), Tag.slug.ilike(_like(term))))
    )


def tag_ids_matching_any(slugs: list[str]):
    """Ids of Resources carrying any of the given tag slugs."""
    return (
        select(resource_tags.c.resource_id)
        .select_from(resource_tags)
        .join(Tag, Tag.id == resource_tags.c.tag_id)
        .where(Tag.slug.in_(slugs))
    )
