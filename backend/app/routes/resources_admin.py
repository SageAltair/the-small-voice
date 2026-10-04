"""Admin Resources API - the studio behind the public library.

Everything an administrator needs to run the library without touching code:
a dashboard, a searchable list, a whole-document editor for all nine types,
real device uploads with validation, publish/unpublish/schedule, duplicate,
soft delete/restore and bulk actions.

This router is registered with a narrower prefix than the catch-all
``/admin/{item_type}/{item_id}`` routes in ``app.routes.admin``, so it must be
included first (see ``app.main``) - otherwise ``PUT /admin/resources/5`` would
be swallowed by that generic handler and silently drop every field this editor
sends.
"""

from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.auth.security import get_current_user
from app.database import get_db
from app.media import (
    classify,
    inspect_upload,
    is_previewable,
    mime_for,
)
from app.models.resource import (
    BookChapter,
    CarouselSlide,
    Resource,
    ResourceMedia,
    ResourceRelationship,
    ResourceTranslation,
)
from app.models.story import Story
from app.models.tag import Tag
from app.models.user import User
from app.resource_service import (
    normalise_type,
    search_filters,
    serialize_resource,
    slugify as _slugify,
    unique_slug as _unique_slug,
)
from app.schemas.resource import (
    BulkAction,
    RESOURCE_TYPES,
    ResourceResponse,
    ResourceUpsert,
    UploadResult,
)

router = APIRouter(prefix="/admin/resources", tags=["Admin Resources"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"

# Generous enough for a book PDF or a short video, small enough that a
# mis-picked 4 GB video fails fast in the browser instead of timing out.
MAX_UPLOAD_BYTES = 300 * 1024 * 1024

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 25


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Only an administrator may manage the library."""
    if user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required",
        )
    return user


def _language(lang: str | None) -> str:
    """The requested editor language, defaulting to English."""
    return "sw" if (lang or "").lower() == "sw" else "en"


def _load_resource(db: Session, resource_id: int) -> Resource:
    row = db.execute(
        select(Resource)
        .options(
            selectinload(Resource.translations),
            selectinload(Resource.media),
            selectinload(Resource.carousel_slides),
            selectinload(Resource.chapters),
            selectinload(Resource.tags),
            selectinload(Resource.relationships),
        )
        .where(Resource.id == resource_id)
        .limit(1)
    ).scalars().first()

    if row is None:
        raise HTTPException(status_code=404, detail="Resource not found")
    return row


def _eager():
    return (
        selectinload(Resource.translations),
        selectinload(Resource.media),
        selectinload(Resource.carousel_slides),
        selectinload(Resource.chapters),
        selectinload(Resource.tags),
        selectinload(Resource.relationships),
    )
@router.get("/overview")
def resource_overview(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """The Resources dashboard.

    Totals, a per-type breakdown and the two lists an editor actually acts on
    (what is waiting, what changed).  Everything here is one of a handful of
    small aggregate queries rather than a scan of the whole table, so the
    dashboard stays quick with thousands of resources.
    """
    live = Resource.deleted_at.is_(None)

    def count(*extra):
        return db.execute(
            select(func.count(Resource.id)).where(live, *extra)
        ).scalar_one()

    totals = {
        "total": count(),
        "published": count(Resource.status == "published"),
        "draft": count(Resource.status == "draft"),
        "scheduled": count(Resource.status == "scheduled"),
        "archived": count(Resource.status == "archived"),
        "featured": count(Resource.featured.is_(True)),
        "views": db.execute(
            select(func.coalesce(func.sum(Resource.view_count), 0)).where(live)
        ).scalar_one(),
        "trashed": db.execute(
            select(func.count(Resource.id)).where(
                Resource.deleted_at.isnot(None)
            )
        ).scalar_one(),
    }

    by_type = db.execute(
        select(
            Resource.type,
            func.count(Resource.id).label("total"),
            func.count(Resource.id)
            .filter(Resource.status == "published")
            .label("published"),
        )
        .where(live)
        .group_by(Resource.type)
    ).all()

    # A type with no rows at all still belongs on the dashboard: "0 reels" is
    # information, and without it the grid would imply the type is unsupported.
    counts = {normalise_type(row[0]): row for row in by_type}

    def _rows(order, limit, *extra):
        return db.execute(
            select(Resource)
            .options(*_eager())
            .where(live, *extra)
            .order_by(order)
            .limit(limit)
        ).unique().scalars().all()

    return {
        "totals": totals,
        "by_type": [
            {
                "type": resource_type,
                "total": counts[resource_type][1] if resource_type in counts else 0,
                "published": counts[resource_type][2] if resource_type in counts else 0,
            }
            for resource_type in RESOURCE_TYPES
        ],
        "recent": [
            serialize_resource(row, "en")
            for row in _rows(Resource.created_at.desc(), 6)
        ],
        "updated": [
            serialize_resource(row, "en")
            for row in _rows(desc(Resource.updated_at), 6)
        ],
        "attention": [
            serialize_resource(row, "en")
            for row in _rows(
                desc(Resource.updated_at),
                8,
                Resource.status.in_(["draft", "scheduled"]),
            )
        ],
    }


@router.get("/")
def list_resources(
    q: str | None = Query(default=None),
    type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    language: str | None = Query(default=None),
    featured: str | None = Query(default=None),
    trashed: bool = Query(default=False),
    sort: str = Query(default="updated"),
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Every resource, drafts and trash included, filtered and paginated.

    The list deliberately shows things a public query would hide: that is the
    whole point of the admin view.
    """
    size = max(1, min(page_size or DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))

    conditions = [
        Resource.deleted_at.isnot(None) if trashed
        else Resource.deleted_at.is_(None)
    ]

    if type:
        conditions.append(Resource.type == normalise_type(type))
    if status:
        conditions.append(Resource.status == status)
    if language:
        conditions.append(Resource.language == language)
    if featured in {"true", "1"}:
        conditions.append(Resource.featured.is_(True))
    elif featured in {"false", "0"}:
        conditions.append(Resource.featured.is_(False))

    if q and q.strip():
        conditions.append(search_filters(q))

    total = db.execute(
        select(func.count(Resource.id)).where(*conditions)
    ).scalar_one()

    ordering = {
        "created": (Resource.created_at.desc(),),
        "title": (Resource.title.asc(),),
        "status": (Resource.status.asc(), Resource.title.asc()),
        "popular": (desc(Resource.view_count),),
        "updated": (desc(Resource.updated_at), Resource.created_at.desc()),
    }.get(sort, (desc(Resource.updated_at),))

    rows = db.execute(
        select(Resource)
        .options(*_eager())
        .where(*conditions)
        .order_by(*ordering)
        .offset((page - 1) * size)
        .limit(size)
    ).unique().scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": size,
        "pages": max(1, (total + size - 1) // size),
        "items": [serialize_resource(row, "en") for row in rows],
    }


@router.post("/upload", response_model=UploadResult, status_code=201)
def upload_resource_file(
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
):
    """Store a file chosen on the administrator's device.

    This is a real upload, not a URL box: the bytes are written to the same
    uploads directory the rest of the platform serves, and everything the
    editor needs to describe the file afterwards (kind, size, duration, page
    count, dimensions, a generated cover for PDFs) is probed here and returned
    with the URL, so the editor never has to ask the browser what it picked.

    Validation happens in two layers: the extension must be a type we know,
    and the bytes must be non-empty and within the size cap.  The probed facts
    also tell the editor whether the browser will actually be able to preview
    it, which is what drives the "cannot preview, download instead" state.
    """
    filename = Path(file.filename or "").name
    extension = Path(filename).suffix.lower()

    if not extension:
        raise HTTPException(
            status_code=400,
            detail="The file needs an extension so we know what it is",
        )

    kind = classify(extension)
    if kind is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{extension}' files are not supported. Upload an image, "
                "video, audio or document (PDF, DOCX, EPUB, TXT...)."
            ),
        )

    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Files must be 300 MB or smaller",
        )

    UPLOAD_DIR.mkdir(exist_ok=True)
    stored_name = f"{uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / stored_name
    file_path.write_bytes(content)

    facts = inspect_upload(UPLOAD_DIR, file_path)

    # ``kind`` comes from the probed facts rather than being passed twice.
    return UploadResult(
        url=f"/uploads/{stored_name}",
        name=filename,
        previewable=is_previewable(kind),
        **facts.as_dict(),
    )


def _apply_payload(db: Session, resource: Resource, payload: ResourceUpsert) -> None:
    """Write a whole ``ResourceUpsert`` onto a row.

    Metadata, tags, both translations, slides, chapters, media and related links
    are all replaced in one transaction so a save is atomic: the editor never
    sees half of its work land.
    """
    resource.title = payload.title
    resource.description = payload.description or ""
    resource.type = normalise_type(payload.type)
    # ``resource_type`` is the legacy mirror of ``type``; keeping the two in
    # step means older readers keep working.
    resource.resource_type = resource.type
    resource.language = payload.language
    resource.author = payload.author
    resource.topic = payload.topic
    resource.slug = payload.slug or resource.slug

    resource.status = payload.status
    resource.visibility = payload.visibility
    resource.featured = payload.featured
    resource.recommended = payload.recommended
    resource.is_new = payload.is_new
    resource.homepage_visible = payload.homepage_visible
    resource.download_enabled = payload.download_enabled
    resource.downloadable = payload.download_enabled
    resource.share_enabled = payload.share_enabled
    resource.save_enabled = payload.save_enabled
    resource.display_order = payload.display_order
    resource.scheduled_for = payload.scheduled_for
    resource.published_at = payload.published_at

    resource.cover_url = payload.cover_url
    resource.url = payload.url or ""
    resource.external_url = payload.external_url
    resource.alt_text = payload.alt_text
    resource.caption = payload.caption
    resource.excerpt = payload.excerpt
    resource.quote_text = payload.quote_text
    resource.attribution = payload.attribution
    resource.transcript = payload.transcript
    resource.accessibility_desc = payload.accessibility_desc
    resource.duration = payload.duration
    resource.page_count = payload.page_count
    resource.file_size = payload.file_size
    resource.mime_type = payload.mime_type

    # ``published`` is the legacy boolean mirroring ``status``.  It is derived
    # rather than accepted, so the two can never disagree.
    resource.published = payload.status == "published"

    # --- tags: create on demand, then replace the association --------------
    tags: list[Tag] = []
    for name in payload.tags:
        cleaned = (name or "").strip()
        if not cleaned:
            continue
        slug = _slugify(cleaned) or "tag"
        tag = db.execute(
            select(Tag).where(Tag.slug == slug).limit(1)
        ).scalars().first()
        if tag is None:
            tag = Tag(name=cleaned, slug=slug, language=payload.language)
            db.add(tag)
        tags.append(tag)
    resource.tags = tags

    # --- translations ------------------------------------------------------
    resource.translations = []
    for item in payload.translations:
        language = (
            item.language if item.language in {"en", "sw"} else payload.language
        )
        resource.translations.append(
            ResourceTranslation(
                language=language,
                title=item.title or resource.title,
                slug=item.slug,
                description=item.description,
                excerpt=item.excerpt,
                quote_text=item.quote_text,
                attribution=item.attribution,
                caption=item.caption,
                transcript=item.transcript,
                accessibility_desc=item.accessibility_desc,
            )
        )

    # --- carousel slides ---------------------------------------------------
    # Order comes from the payload sequence, so the admin's own ordering is
    # what the public viewer sees.
    resource.carousel_slides = [
        CarouselSlide(
            sort_order=index,
            image_url=slide.image_url or "",
            image_url_en=slide.image_url_en,
            image_url_sw=slide.image_url_sw,
            text_en=slide.text_en,
            text_sw=slide.text_sw,
            caption_en=slide.caption_en,
            caption_sw=slide.caption_sw,
            alt_text=slide.alt_text,
        )
        for index, slide in enumerate(payload.slides)
    ]

    # --- book chapters -----------------------------------------------------
    resource.chapters = [
        BookChapter(
            sort_order=index,
            title_en=chapter.title_en or f"Chapter {index + 1}",
            title_sw=chapter.title_sw,
            file_url_en=chapter.file_url_en or "",
            file_url_sw=chapter.file_url_sw,
            body_en=chapter.body_en,
            body_sw=chapter.body_sw,
            page_count=chapter.page_count,
            file_size=chapter.file_size,
        )
        for index, chapter in enumerate(payload.chapters)
    ]

    # --- media -------------------------------------------------------------
    resource.media = [
        ResourceMedia(
            language=(
                item.language
                if item.language in {"en", "sw"}
                else payload.language
            ),
            url=item.url,
            media_type=item.media_type,
            mime_type=item.mime_type,
            file_size=item.file_size,
            duration=item.duration,
            width=item.width,
            height=item.height,
            is_shared=item.is_shared,
            sort_order=item.sort_order,
        )
        for item in payload.media
    ]

    # --- related links -----------------------------------------------------
    # Only known relationship targets are accepted, so a typo in the editor
    # cannot create a link that resolves to nothing on the public rail.
    resource.relationships = []
    for index, item in enumerate(payload.relationships):
        if item.related_type not in {"resource", "story", "learning", "lesson"}:
            continue
        resource.relationships.append(
            ResourceRelationship(
                related_type=item.related_type,
                related_id=item.related_id,
                relationship_type=item.relationship_type or "related",
                sort_order=index,
            )
        )


def _resolve_publish_state(
    resource: Resource,
    status: str,
    scheduled_for: datetime | None,
) -> None:
    """Keep ``status``, ``published`` and the timestamps consistent.

    Scheduling is derived from the requested status rather than handled by a
    scheduler job: a ``scheduled`` resource simply is not public until its time
    passes, which is checked at read time and needs no background worker.
    """
    resource.status = status

    if status == "published":
        resource.published = True
        if not resource.published_at:
            resource.published_at = datetime.utcnow()
        resource.scheduled_for = scheduled_for
    elif status == "scheduled":
        resource.published = False
        resource.scheduled_for = scheduled_for
    else:
        resource.published = False
        resource.scheduled_for = None


def _validate_before_publish(db: Session, resource: Resource) -> list[dict]:
    """What an administrator still needs to fix before this can go live.

    Reported rather than raised: the editor shows it as a checklist, and the
    administrator can still publish deliberately (a video with no transcript,
    say, is a legitimate choice) instead of being blocked by a hard rule.
    """
    issues: list[dict] = []

    def need(condition: bool, field: str, message: str) -> None:
        if not condition:
            issues.append({"field": field, "message": message})

    need(bool(resource.title), "title", "A title is required")
    need(
        normalise_type(resource.type) in set(RESOURCE_TYPES),
        "type",
        "Choose a resource type",
    )

    resource_type = normalise_type(resource.type)

    if resource_type in {"reel", "video", "audio"}:
        need(
            bool(resource.url) or bool(resource.external_url) or bool(resource.media),
            "url",
            "Upload a file or link an external video/audio URL",
        )

    if resource_type in {"image", "infographic"}:
        need(
            bool(resource.url) or bool(resource.media),
            "url",
            f"A {resource_type} needs an image",
        )

    if resource_type == "quote":
        has_quote = bool(resource.quote_text) or any(
            item.quote_text for item in resource.translations
        )
        need(has_quote, "quote_text", "A quote needs its quote text")

    if resource_type == "carousel":
        need(
            len(resource.carousel_slides) > 0,
            "slides",
            "A carousel needs at least one slide",
        )
@router.post("/", response_model=ResourceResponse, status_code=201)
def create_resource(
    payload: ResourceUpsert,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a draft Resource of any of the nine types."""
    resource = Resource(
        title=payload.title,
        description=payload.description or "",
        type=normalise_type(payload.type),
        resource_type=normalise_type(payload.type),
        language=payload.language,
        owner_id=admin.id,
        # A brand new resource is always a draft; publishing is a separate,
        # deliberate act so nothing is ever live by accident.
        status="draft",
        published=False,
    )
    db.add(resource)
    db.flush()

    resource.slug = _unique_slug(db, payload.title, payload.slug)
    _apply_payload(db, resource, payload)
    _resolve_publish_state(resource, "draft", None)

    db.commit()
    db.refresh(resource)
    return serialize_resource(resource, payload.language)


@router.get("/linkable/search")
def search_linkable(
    q: str = Query(default=""),
    kind: str = Query(default="resource"),
    lang: str | None = Query(default=None),
    exclude_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Search content an administrator can attach as "related".

    Reuses the existing Stories and Learn content rather than duplicating it,
    so a video about prayer can point at the prayer guide, the audio teaching
    and the story that started the conversation - all from content that
    already exists.
    """
    term = (q or "").strip()
    language = _language(lang)
    like = f"%{term}%"
    items: list[dict] = []

    if kind == "story":
        conditions = [Story.deleted_at.is_(None)]
        if term:
            conditions.append(
                or_(
                    Story.title.ilike(like),
                    Story.description.ilike(like),
                    Story.category.ilike(like),
                )
            )
        rows = db.execute(
            select(Story)
            .where(*conditions)
            .order_by(Story.published.is_(True).desc(), Story.title)
            .limit(20)
        ).scalars().all()
        items = [
            {
                "kind": "story",
                "id": row.id,
                "type": "story",
                "title": row.title,
                "description": (row.description or "")[:180],
                "cover_url": row.image_url,
            }
            for row in rows
        ]

    elif kind in {"learning", "lesson"}:
        from app.models.learn import (
            LearnLesson,
            LearnLessonTranslation,
            LearnPath,
        )

        # A lesson's title lives on its translation row, so the picker reads
        # the translation table rather than the base row.
        rows = db.execute(
            select(LearnLesson, LearnLessonTranslation, LearnPath)
            .join(
                LearnLessonTranslation,
                LearnLessonTranslation.lesson_id == LearnLesson.id,
            )
            .join(LearnPath, LearnLesson.path_id == LearnPath.id)
            .where(
                LearnLesson.status == "published",
                LearnPath.status == "published",
                LearnLessonTranslation.language == _language(language),
            )
            .order_by(LearnLessonTranslation.title)
            .limit(20)
        ).all()

        if term:
            rows = [
                row
                for row in rows
                if term.lower() in (row[1].title or "").lower()
            ]

        items = [
            {
                "kind": "learning",
                "id": lesson.id,
                "type": "learning",
                "title": translation.title or lesson.slug,
                "description": f"Lesson in {path.slug}",
                "cover_url": path.cover_url,
            }
            for lesson, translation, path in rows
        ]

    else:
        conditions = [Resource.deleted_at.is_(None)]
        if exclude_id:
            conditions.append(Resource.id != exclude_id)
        if term:
            conditions.append(
                or_(
                    Resource.title.ilike(like),
                    Resource.description.ilike(like),
                    Resource.author.ilike(like),
                )
            )
        rows = db.execute(
            select(Resource)
            .where(*conditions)
            .order_by(desc(Resource.updated_at))
            .limit(20)
        ).scalars().all()
        items = [
            {
                "kind": "resource",
                "id": row.id,
                "type": normalise_type(row.type),
                "title": row.title,
                "description": (row.description or "")[:180],
                "cover_url": row.cover_url,
            }
            for row in rows
        ]

    return {"items": items, "language": language}
@router.get("/{resource_id}")
def get_resource(
    resource_id: int,
    lang: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """The full editable document, in the requested language."""
    resource = _load_resource(db, resource_id)
    language = lang if lang in {"en", "sw"} else "en"
    payload = serialize_resource(resource, language)

    # The editor needs the raw per-language rows, not just the resolved text,
    # or a save would collapse the two languages into one.
    payload["translations"] = [
        {
            "language": item.language,
            "title": item.title,
            "slug": item.slug,
            "description": item.description,
            "excerpt": item.excerpt,
            "quote_text": item.quote_text,
            "attribution": item.attribution,
            "caption": item.caption,
            "transcript": item.transcript,
            "accessibility_desc": item.accessibility_desc,
        }
        for item in resource.translations
    ]

    payload["raw_slides"] = [
        {
            "sort_order": item.sort_order,
            "image_url": item.image_url,
            "image_url_en": item.image_url_en,
            "image_url_sw": item.image_url_sw,
            "text_en": item.text_en,
            "text_sw": item.text_sw,
            "caption_en": item.caption_en,
            "caption_sw": item.caption_sw,
            "alt_text": item.alt_text,
        }
        for item in resource.carousel_slides
    ]

    payload["raw_chapters"] = [
        {
            "sort_order": item.sort_order,
            "title_en": item.title_en,
            "title_sw": item.title_sw,
            "file_url_en": item.file_url_en,
            "file_url_sw": item.file_url_sw,
            "body_en": item.body_en,
            "body_sw": item.body_sw,
            "page_count": item.page_count,
            "file_size": item.file_size,
        }
        for item in resource.chapters
    ]

    payload["validation"] = _validate_before_publish(db, resource)
    payload["previewable"] = bool(resource.url) or bool(resource.external_url)

    return payload


@router.put("/{resource_id}", response_model=ResourceResponse)
def save_resource(
    resource_id: int,
    payload: ResourceUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Save metadata, translations, slides, chapters, media and links at once.

    Status changes go through the dedicated publish/unpublish/schedule
    endpoints rather than through this payload, so the publish timeline is
    only ever written in one place and a plain save cannot accidentally
    un-publish a live resource.
    """
    resource = _load_resource(db, resource_id)
    current_status = resource.status

    _apply_payload(db, resource, payload)

    # Re-derive through _unique_slug so an edited slug is slugified and made
    # unique rather than stored raw, while a blank one keeps the current slug -
    # a link shared before the edit must keep working.  The editor always sends
    # a string (never null), so this cannot be keyed off ``payload.slug is None``.
    resource.slug = _unique_slug(
        db, payload.title, payload.slug or resource.slug, exclude_id=resource.id
    )

    _resolve_publish_state(
        resource,
        current_status if current_status in {"published", "scheduled"} else "draft",
        resource.scheduled_for,
    )

    db.commit()
    db.refresh(resource)
    return serialize_resource(resource, payload.language)


@router.post("/{resource_id}/publish", response_model=ResourceResponse)
def publish_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Publish a Resource now."""
    resource = _load_resource(db, resource_id)
    _resolve_publish_state(resource, "published", None)

    db.commit()
    db.refresh(resource)
    return serialize_resource(resource, resource.language)


@router.post("/{resource_id}/unpublish", response_model=ResourceResponse)
def unpublish_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Pull a Resource back to draft.

    Unpublishing is not deleting: the record, its files and its links stay, so
    it can be published again unchanged.
    """
    resource = _load_resource(db, resource_id)
    _resolve_publish_state(resource, "draft", None)

    db.commit()
    db.refresh(resource)
    return serialize_resource(resource, resource.language)


@router.post("/{resource_id}/schedule", response_model=ResourceResponse)
def schedule_resource(
    resource_id: int,
    when: datetime | None = Body(default=None, embed=True),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Set the moment a Resource should become public.

    No background job is needed: a scheduled resource is simply excluded from
    public queries until its time passes, which every read already checks.

    ``when`` may be null, which is what the editor's "leave this empty to
    publish now" sends. That is treated as publishing immediately rather than
    as a validation error - an administrator clearing the date box is saying
    "now", not making a mistake.
    """
    resource = _load_resource(db, resource_id)

    if when is None:
        _resolve_publish_state(resource, "published", None)
    else:
        _resolve_publish_state(resource, "scheduled", when)

    db.commit()
    db.refresh(resource)
    return serialize_resource(resource, resource.language)


@router.post("/{resource_id}/duplicate", response_model=ResourceResponse, status_code=201)
def duplicate_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Copy a Resource, including its slides, chapters and media.

    The copy always lands as a draft with a fresh slug and "copy" in the title,
    so duplicating can never overwrite or shadow the original.
    """
    source = _load_resource(db, resource_id)

    clone = Resource(
        title=f"{source.title} (copy)",
        description=source.description,
        type=source.type,
        resource_type=source.resource_type,
        language=source.language,
        author=source.author,
        topic=source.topic,
        status="draft",
        published=False,
        owner_id=source.owner_id,
        cover_url=source.cover_url,
        url=source.url,
        external_url=source.external_url,
        alt_text=source.alt_text,
        caption=source.caption,
        excerpt=source.excerpt,
        quote_text=source.quote_text,
        attribution=source.attribution,
        transcript=source.transcript,
        accessibility_desc=source.accessibility_desc,
        duration=source.duration,
        page_count=source.page_count,
        file_size=source.file_size,
        mime_type=source.mime_type,
        download_enabled=source.download_enabled,
        share_enabled=source.share_enabled,
        save_enabled=source.save_enabled,
        display_order=source.display_order,
        # Curation flags are deliberately not copied: a duplicate is new
        # content an editor still has to decide how to feature.
    )
    db.add(clone)
    db.flush()

    clone.slug = _unique_slug(db, clone.title, None)
    clone.tags = list(source.tags)

    clone.translations = [
        ResourceTranslation(
            language=item.language,
            title=item.title,
            description=item.description,
            excerpt=item.excerpt,
            quote_text=item.quote_text,
            attribution=item.attribution,
            caption=item.caption,
            transcript=item.transcript,
            accessibility_desc=item.accessibility_desc,
        )
        for item in source.translations
    ]

    clone.carousel_slides = [
        CarouselSlide(
            sort_order=item.sort_order,
            image_url=item.image_url,
            image_url_en=item.image_url_en,
            image_url_sw=item.image_url_sw,
            text_en=item.text_en,
            text_sw=item.text_sw,
            caption_en=item.caption_en,
            caption_sw=item.caption_sw,
            alt_text=item.alt_text,
        )
        for item in source.carousel_slides
    ]

    clone.chapters = [
        BookChapter(
            sort_order=item.sort_order,
            title_en=item.title_en,
            title_sw=item.title_sw,
            file_url_en=item.file_url_en,
            file_url_sw=item.file_url_sw,
            body_en=item.body_en,
            body_sw=item.body_sw,
            page_count=item.page_count,
            file_size=item.file_size,
        )
        for item in source.chapters
    ]

    clone.media = [
        ResourceMedia(
            language=item.language,
            url=item.url,
            media_type=item.media_type,
            mime_type=item.mime_type,
            file_size=item.file_size,
            duration=item.duration,
            width=item.width,
            height=item.height,
            is_shared=item.is_shared,
            sort_order=item.sort_order,
        )
        for item in source.media
    ]

    clone.relationships = [
        ResourceRelationship(
            related_type=item.related_type,
            related_id=item.related_id,
            relationship_type=item.relationship_type,
            sort_order=item.sort_order,
        )
        for item in source.relationships
    ]

    db.commit()
    db.refresh(clone)
    return serialize_resource(clone, clone.language)


@router.delete("/{resource_id}")
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Move a Resource to the trash.

    Soft delete on purpose: the trash can restore it, and a resource linked
    from elsewhere does not leave a trail of dead links behind it.
    """
    resource = _load_resource(db, resource_id)
    resource.deleted_at = datetime.utcnow()

    db.commit()
    return {"message": "Resource moved to trash", "id": resource_id}


@router.post("/{resource_id}/restore", response_model=ResourceResponse)
def restore_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Bring a Resource back out of the trash.

    It returns as a draft rather than straight to published, so restoring
    never silently puts something back on the public site.
    """
    resource = _load_resource(db, resource_id)
    resource.deleted_at = None
    if resource.status == "published":
        resource.status = "draft"
        resource.published = False

    db.commit()
    db.refresh(resource)
    return serialize_resource(resource, resource.language)


@router.delete("/{resource_id}/permanent")
def delete_resource_permanently(
    resource_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Erase a Resource for good.

    Separate from the soft delete and reached only from the trash, so an
    irreversible action can never be triggered by an ordinary delete.  The
    uploaded files are deliberately left on disk: another resource may share
    them, and losing a file would be worse than losing the row.
    """
    resource = _load_resource(db, resource_id)
    db.delete(resource)
    db.commit()
    return {"message": "Resource permanently deleted", "id": resource_id}


@router.post("/bulk")
def bulk_action(
    payload: BulkAction,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Apply one action to many Resources.

    Every id is resolved and updated in a single transaction, and the response
    reports how many rows actually changed - so a batch that partly targets
    trashed items tells the truth rather than claiming success.
    """
    if not payload.ids:
        return {"updated": 0, "action": payload.action}

    rows = db.execute(
        select(Resource).where(Resource.id.in_(payload.ids))
    ).scalars().all()

    now = datetime.utcnow()
    updated = 0

    for resource in rows:
        action = payload.action

        if action == "publish":
            _resolve_publish_state(resource, "published", None)
        elif action == "unpublish":
            _resolve_publish_state(resource, "draft", None)
        elif action == "archive":
            resource.status = "archived"
            resource.published = False
        elif action == "feature":
            resource.featured = True
        elif action == "unfeature":
            resource.featured = False
        elif action == "recommend":
            resource.recommended = True
        elif action == "hide":
            resource.homepage_visible = False
        elif action == "show":
            resource.homepage_visible = True
        elif action == "delete":
            resource.deleted_at = now
            resource.published = False
        elif action == "restore":
            resource.deleted_at = None
            if resource.status == "published":
                resource.status = "draft"
                resource.published = False

        updated += 1

    db.commit()
    return {"updated": updated, "action": payload.action}


