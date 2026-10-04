"""Public Resources API.

Nine resource types, nine different things to watch, one set of rules about
what may be shown.  Every endpoint here is anonymous and read-only apart from
the view counter; the author submission endpoints at the bottom are the only
write paths, and they keep their existing contract.

Route order matters in this module: ``/home`` and ``/types`` are declared
before the ``/{type}/{slug}`` catch-all so a resource whose slug is literally
"home" cannot shadow the homepage.
"""

from datetime import datetime
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.auth.security import get_current_user
from app.database import get_db
from app.media import build_resource_cover, inspect_upload, pdf_search, pdf_page_count
from app.models.resource import Resource
from app.models.resource_tag import resource_tags
from app.models.tag import Tag
from app.models.user import User
from app.resource_service import (
    flat_create_values,
    is_publicly_visible,
    normalise_type,
    published_filters,
    resolve_related,
    search_filters,
    serialize_resource,
    unique_slug,
)
from app.schemas.resource import (
    RESOURCE_TYPES,
    ResourceCreate,
    ResourceResponse,
)


router = APIRouter(
    prefix="/resources",
    tags=["Resources"],
)

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
MAX_RESOURCE_SIZE = 300 * 1024 * 1024

# Listing pages are capped so one request cannot ask for the whole database.
MAX_PAGE_SIZE = 60
DEFAULT_PAGE_SIZE = 24


def _clamp_page_size(value: int | None) -> int:
    return max(1, min(value or DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))


def _language(lang: str | None) -> str:
    return "sw" if (lang or "").lower() == "sw" else "en"


def _uploaded_file_path(url: str | None) -> Path | None:
    """Resolve a ``/uploads/...`` URL to a real path inside UPLOAD_DIR.

    Returns ``None`` for external links and for any path that tries to escape
    the uploads directory.  Callers use ``None`` to mean "this is not our
    file", which keeps the download and search endpoints from ever touching a
    path outside the sandbox.
    """
    if not url:
        return None

    parsed = urlparse(url)
    path = parsed.path if parsed.scheme else url
    if not path.startswith("/uploads/"):
        return None

    name = Path(path).name
    if not name:
        return None

    candidate = (UPLOAD_DIR / name).resolve()
    if not candidate.is_relative_to(UPLOAD_DIR.resolve()):
        return None
    if not candidate.is_file():
        return None

    return candidate


def _load_public_resource(db: Session, resource_type: str, slug: str) -> Resource:
    """Fetch one published Resource by type and slug, or raise 404.

    A resource whose stored type disagrees with the URL is a genuine 404
    rather than a redirect: the type is part of the route, and quietly serving
    a book at ``/videos/...`` would hide a broken link instead of fixing it.
    """
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
        .where(
            Resource.slug == slug,
            Resource.deleted_at.is_(None),
        )
        .limit(1)
    ).scalars().first()

    if row is None or not is_publicly_visible(row):
        raise HTTPException(status_code=404, detail="Resource not found")

    if normalise_type(row.type) != normalise_type(resource_type):
        raise HTTPException(status_code=404, detail="Resource not found")

    return row


def _load_public_by_id(db: Session, resource_id: int) -> Resource:
    row = db.execute(
        select(Resource)
        .options(
            selectinload(Resource.translations),
            selectinload(Resource.media),
            selectinload(Resource.carousel_slides),
            selectinload(Resource.chapters),
            selectinload(Resource.tags),
        )
        .where(Resource.id == resource_id)
        .limit(1)
    ).scalars().first()

    if row is None or not is_publicly_visible(row):
        raise HTTPException(status_code=404, detail="Resource not found")

    return row
def _visible_base_query():
    """The eager-loading options every public Resource read needs."""
    return (
        selectinload(Resource.translations),
        selectinload(Resource.media),
        selectinload(Resource.carousel_slides),
        selectinload(Resource.chapters),
        selectinload(Resource.tags),
    )


def slugify(value: str) -> str:
    """URL-safe slug, matching the frontend's ``slugify``."""
    cleaned = "".join(
        char if char.isalnum() or char == " " else "-"
        for char in (value or "").lower()
    )
    return "-".join(cleaned.split()).strip("-")


# ---------------------------------------------------------------------------
# Curated homepage
# ---------------------------------------------------------------------------

# The order a visitor meets each resource type on the homepage. Sections with
# nothing published are dropped from the response, so this is a maximum.
HOMEPAGE_SECTIONS = [
    ("reel", 6),
    ("video", 6),
    ("audio", 6),
    ("book", 6),
    ("carousel", 6),
    ("quote", 6),
    ("image", 8),
    ("infographic", 6),
    ("document", 6),
]


@router.get("/home")
def resource_home(
    lang: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """The curated public Resources homepage.

    One section per resource type that actually has published content. A type
    with nothing published is simply absent, so the page never renders an empty
    heading - the client draws exactly the sections it is given.
    """
    language = _language(lang)
    sections: list[dict] = []

    for resource_type, limit in HOMEPAGE_SECTIONS:
        rows = db.execute(
            select(Resource)
            .options(*_visible_base_query())
            .where(Resource.type == resource_type, *published_filters())
            .order_by(
                Resource.featured.desc(),
                Resource.recommended.desc(),
                Resource.is_new.desc(),
                desc(func.coalesce(Resource.published_at, Resource.created_at)),
            )
            .limit(limit)
        ).scalars().all()

        if not rows:
            # Nothing published of this type: do not send an empty section.
            continue

        sections.append({
            "type": resource_type,
            "total": db.execute(
                select(func.count(Resource.id)).where(
                    Resource.type == resource_type,
                    *published_filters(),
                )
            ).scalar_one(),
            "items": [serialize_resource(row, language) for row in rows],
        })

    # "Continue exploring" tops the page up with whatever an editor promoted.
    promoted = db.execute(
        select(Resource)
        .options(*_visible_base_query())
        .where(
            or_(
                Resource.featured.is_(True),
                Resource.recommended.is_(True),
                Resource.is_new.is_(True),
            ),
            *published_filters(),
        )
        .order_by(
            Resource.featured.desc(),
            desc(func.coalesce(Resource.published_at, Resource.created_at)),
        )
        .limit(12)
    ).scalars().all()

    latest = db.execute(
        select(Resource)
        .options(*_visible_base_query())
        .where(*published_filters())
        .order_by(desc(func.coalesce(Resource.published_at, Resource.created_at)))
        .limit(12)
    ).scalars().all()

    topics = db.execute(
        select(Resource.topic, func.count(Resource.id).label("total"))
        .where(Resource.topic.isnot(None), *published_filters())
        .group_by(Resource.topic)
        .order_by(desc("total"), Resource.topic)
        .limit(24)
    ).all()

    return {
        "language": language,
        "sections": sections,
        "promoted": [serialize_resource(row, language) for row in promoted],
        "latest": [serialize_resource(row, language) for row in latest],
        "topics": [
            {"slug": slugify(topic), "name": topic, "total": total}
            for topic, total in topics
        ],
        "total": db.execute(
            select(func.count(Resource.id)).where(*published_filters())
        ).scalar_one(),
    }


@router.get("/types")
def resource_types(
    lang: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Published count per resource type, for the browse filters."""
    rows = db.execute(
        select(Resource.type, func.count(Resource.id).label("total"))
        .where(*published_filters())
        .group_by(Resource.type)
    ).all()

    counts = {normalise_type(row_type): total for row_type, total in rows}

    return {
        "language": _language(lang),
        "types": [
            {"type": resource_type, "total": counts.get(resource_type, 0)}
            for resource_type in RESOURCE_TYPES
        ],
    }


@router.get("/topics")
def resource_topics(
    lang: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Every topic with published resources, with its count."""
    rows = db.execute(
        select(Resource.topic, func.count(Resource.id).label("total"))
        .where(Resource.topic.isnot(None), *published_filters())
        .group_by(Resource.topic)
        .order_by(Resource.topic)
    ).all()

    return {
        "topics": [
            {"slug": slugify(topic), "name": topic, "total": total}
            for topic, total in rows
        ],
    }


@router.get("/tags")
def list_resource_tags(
    lang: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Tags actually in use on published resources.

    Named ``list_resource_tags`` rather than ``resource_tags`` so it does not
    shadow the association table imported under that name.
    """
    rows = db.execute(
        select(Tag.name, Tag.slug, func.count(Resource.id).label("total"))
        .join(Resource.tags)
        .where(*published_filters())
        .group_by(Tag.name, Tag.slug)
        .order_by(desc("total"), Tag.name)
        .limit(60)
    ).all()

    return {
        "tags": [
            {"name": name, "slug": slug, "total": total}
            for name, slug, total in rows
        ],
    }


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

# The sort options the browse page offers.  "recommended" is the editorial
# default: it leads with what an editor curated and falls back to recency.
SORT_OPTIONS = {
    "recommended": (
        Resource.featured.desc(),
        Resource.recommended.desc(),
        desc(func.coalesce(Resource.published_at, Resource.created_at)),
    ),
    "newest": (desc(func.coalesce(Resource.published_at, Resource.created_at)),),
    "oldest": (func.coalesce(Resource.published_at, Resource.created_at),),
    "popular": (desc(func.coalesce(Resource.view_count, 0)),),
    "title": (Resource.title.asc(),),
}


@router.get("/")
def get_resources(
    lang: str | None = Query(default=None),
    type: str | None = Query(default=None),
    q: str | None = Query(default=None),
    topic: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    sort: str = Query(default="recommended"),
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    """Published resources, filtered and paginated.

    One endpoint backs every listing on the site - the browse page, each type
    page, and search - because they differ only in which filters are set. It is
    paginated server-side so the homepage stays fast with thousands of rows,
    and every filter is optional so a plain ``/resources/`` still works.
    """
    language = _language(lang)
    size = _clamp_page_size(page_size)

    conditions = [*published_filters()]

    if type:
        conditions.append(Resource.type == normalise_type(type))

    if topic:
        conditions.append(Resource.topic == topic)

    if q and q.strip():
        conditions.append(search_filters(q))

    if tag:
        conditions.append(
            Resource.id.in_(
                select(resource_tags.c.resource_id)
                .select_from(resource_tags)
                .join(Tag, Tag.id == resource_tags.c.tag_id)
                .where(Tag.slug == tag)
            )
        )

    total = db.execute(
        select(func.count(Resource.id)).where(*conditions)
    ).scalar_one()

    ordering = SORT_OPTIONS.get(
        sort if sort in SORT_OPTIONS else "recommended",
        SORT_OPTIONS["recommended"],
    )

    rows = db.execute(
        select(Resource)
        .options(*_visible_base_query())
        .where(*conditions)
        .order_by(*ordering)
        .offset((page - 1) * size)
        .limit(size)
    ).unique().scalars().all()

    return {
        "language": language,
        "total": total,
        "page": page,
        "page_size": size,
        "pages": max(1, (total + size - 1) // size),
        "items": [serialize_resource(row, language) for row in rows],
    }


@router.get("/search")
def search_resources(
    q: str = Query(default=""),
    lang: str | None = Query(default=None),
    type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    """Search across title, description, author, tags, topic and language.

    A thin alias over the listing endpoint with ``q`` set, kept as its own
    route because "search" is a distinct thing to be able to link to.
    """
    return get_resources(
        lang=lang,
        type=type,
        q=q,
        page=page,
        page_size=page_size,
        db=db,
    )


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------
# Detail
#
# Order matters below: the id-scoped routes (``/5/related``, ``/5/pages``...)
# are declared BEFORE ``/{resource_type}/{slug}``.  FastAPI matches in
# declaration order, so with the reverse arrangement a request for
# ``/5/related`` would be read as type="5", slug="related" and 404 instead of
# returning the rail.
# ---------------------------------------------------------------------------

@router.get("/{resource_id}/related")
def get_related(
    resource_id: int,
    lang: str | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """The related-content rail on its own, for lazy-loading it."""
    row = _load_public_by_id(db, resource_id)
    language = _language(lang)
    return {"items": resolve_related(db, row, language, limit=limit)}


@router.post("/{resource_id}/view")
def record_view(resource_id: int, db: Session = Depends(get_db)):
    """Count one open of a published Resource.

    This is the only popularity signal the site keeps, so it is deliberately
    dumb: a single increment, no session tracking and no IP storage.  Drafts
    are ignored rather than 404ing, because the admin preview viewer calls this
    too and a preview should never be recorded as a public view.
    """
    row = db.execute(
        select(Resource).where(
            Resource.id == resource_id,
            Resource.deleted_at.is_(None),
            *published_filters(),
        )
    ).scalars().first()

    if row is None:
        return {"recorded": False}

    row.view_count = (row.view_count or 0) + 1
    db.commit()
    return {"recorded": True, "view_count": row.view_count}


@router.get("/{resource_id}/pages")
def document_pages(
    resource_id: int,
    db: Session = Depends(get_db),
):
    """Page count for a PDF resource, so the viewer can show "page 3 of 24"."""
    row = _load_public_by_id(db, resource_id)
    path = _uploaded_file_path(row.url)

    if path is None or path.suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=400,
            detail="This resource is not a PDF document",
        )

    page_count = row.page_count or pdf_page_count(path)
    return {"id": row.id, "page_count": page_count}


@router.get("/{resource_id}/search")
def search_document(
    resource_id: int,
    q: str = Query(default=""),
    lang: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Search inside a PDF, returning the pages that matched.

    Text extraction happens here rather than in the browser so it works for a
    PDF served as a download-only file too, and so the reader can list every
    hit without loading the whole document into memory.
    """
    row = _load_public_by_id(db, resource_id)
    path = _uploaded_file_path(row.url)

    if path is None or path.suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=400,
            detail="Search is only available for PDF documents",
        )

    matches = pdf_search(path, q)
    return {
        "id": row.id,
        "query": q,
        "total": len(matches),
        "matches": matches,
    }


@router.get("/{resource_id}/download")
def download_resource(
    resource_id: int,
    db: Session = Depends(get_db),
):
    """Download a Resource's file.

    Downloading is a permission, not a default: a resource with downloads
    turned off is served as a 403 even when it is published, so the same rule
    holds everywhere instead of only in the UI.
    """
    row = _load_public_by_id(db, resource_id)

    if not row.download_enabled:
        raise HTTPException(
            status_code=403,
            detail="Downloads are not available for this resource",
        )

    # An external link has no file of ours to hand over; send the visitor to
    # the source instead of failing with a confusing "not an uploaded file".
    if row.external_url and not row.url:
        return RedirectResponse(row.external_url, status_code=302)

    path = _uploaded_file_path(row.url)

    if path is None:
        raise HTTPException(
            status_code=404,
            detail="No downloadable file is attached to this resource",
        )

    filename = f"{Path(row.title).name or 'resource'}{path.suffix}"
    return FileResponse(
        path,
        filename=filename,
        content_disposition_type="attachment",
    )


@router.get("/{resource_type}/{slug}", response_model=ResourceResponse)
def get_resource(
    resource_type: str,
    slug: str,
    lang: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """One published Resource, with its related-content rail resolved.

    Declared last on purpose: this two-segment pattern is broad enough to
    swallow any id-scoped route registered after it.
    """
    row = _load_public_resource(db, resource_type, slug)
    language = _language(lang)
    return serialize_resource(
        row,
        language,
        related=resolve_related(db, row, language),
    )


# ---------------------------------------------------------------------------
# Author submissions
#
# These are the pre-existing contributor endpoints.  They keep their shape so
# the current author flow keeps working; the only difference is that a
# submission now lands as an explicit draft with its type recorded in the
# modern vocabulary, instead of a half-populated row an admin has to repair.
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=ResourceResponse)
def create_uploaded_resource(
    title: str = Form(...),
    description: str = Form(...),
    resource_type: str = Form(...),
    language: str = Form("en"),
    resource: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a local resource file for administrator review."""
    if current_user.role not in {"author", "admin"}:
        raise HTTPException(status_code=403, detail="You cannot create resources")

    content = resource.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_RESOURCE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Files must be 300 MB or smaller",
        )

    extension = Path(resource.filename or "resource").suffix.lower()
    if not extension:
        raise HTTPException(
            status_code=400,
            detail="Please upload a file with an extension",
        )

    UPLOAD_DIR.mkdir(exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(content)

    resolved_type = normalise_type(resource_type)
    facts = inspect_upload(UPLOAD_DIR, file_path)

    item = Resource(
        title=title,
        description=description,
        resource_type=resolved_type,
        type=resolved_type,
        language=language if language in {"en", "sw"} else "en",
        url=f"/uploads/{filename}",
        cover_url=facts.cover_url,
        downloadable=True,
        download_enabled=True,
        duration=facts.duration,
        page_count=facts.page_count,
        file_size=facts.file_size,
        mime_type=facts.mime_type,
        # A submission is never public; an admin publishes it deliberately.
        status="draft",
        published=False,
        owner_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/", response_model=ResourceResponse)
def create_resource(
    resource_data: ResourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a Resource from a JSON payload (an external-link submission)."""
    if current_user.role not in {"author", "admin"}:
        raise HTTPException(
            status_code=403,
            detail="You cannot create resources",
        )

    # Only an admin may publish straight away; an author's submission waits.
    status = resource_data.status
    if current_user.role != "admin":
        status = "draft"

    # The flat author payload reaches the same translation the legacy admin
    # create uses: columns only (the constructor rejects the editor's child
    # collections outright), with ``resource_type`` / ``published`` /
    # ``downloadable`` folded into the current fields.  Role wins over any
    # status an author asked for, exactly as the docstring above promises.
    values = flat_create_values(resource_data)
    values["status"] = status
    values["published"] = status == "published"
    if values["published"] and not values.get("published_at"):
        values["published_at"] = datetime.utcnow()
    values["owner_id"] = current_user.id

    resource = Resource(**values)
    db.add(resource)
    db.flush()
    resource.slug = unique_slug(db, resource.title, resource_data.slug)
    db.commit()
    db.refresh(resource)

    return resource

@router.put("/manage/{resource_id}", response_model=ResourceResponse)
def update_resource(
    resource_id: int,
    data: ResourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a Resource through the author flow.

    The admin workspace has its own, much fuller editor; this stays scoped to
    the fields an author is allowed to touch.
    """
    resource = db.get(Resource, resource_id)
    if not resource or resource.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Resource not found")
    if current_user.role != "admin" and resource.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot update this resource",
        )

    resource.title = data.title
    resource.description = data.description
    resource.resource_type = normalise_type(data.type)
    resource.type = normalise_type(data.type)
    resource.language = data.language
    if data.url is not None:
        resource.url = data.url
    resource.author = data.author
    resource.topic = data.topic
    resource.download_enabled = data.download_enabled
    resource.slug = data.slug

    if current_user.role == "admin":
        resource.status = data.status
        resource.published = data.status == "published"
        if data.status == "published" and not resource.published_at:
            resource.published_at = datetime.utcnow()
    else:
        # Editing a submission never publishes it.
        resource.status = "draft"
        resource.published = False

    db.commit()
    db.refresh(resource)
    return resource


@router.delete("/manage/{resource_id}")
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move a Resource to the trash.

    Soft delete on purpose: the trash section can restore it, and a resource
    linked from elsewhere does not leave a trail of dead links.
    """
    resource = db.get(Resource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if current_user.role != "admin" and resource.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot delete this resource",
        )
    resource.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Resource moved to trash"}
    resource = Resource(
        title=resource_data.title,
        description=resource_data.description,
        resource_type=normalise_type(resource_data.type),
        type=normalise_type(resource_data.type),
        url=resource_data.url or "",
        external_url=resource_data.external_url,
        language=resource_data.language,
        status=status,
        published=status == "published",
        published_at=datetime.utcnow() if status == "published" else None,
        slug=resource_data.slug,
        author=resource_data.author,
        topic=resource_data.topic,
        download_enabled=resource_data.download_enabled,
        owner_id=current_user.id,
    )

    db.add(resource)
    db.commit()
    db.refresh(resource)

    return resource
    if row.external_url and not row.url:
        raise HTTPException(
            status_code=302,
            detail=row.external_url,
        )

    path = _uploaded_file_path(row.url)

    if path is None:
        raise HTTPException(
            status_code=404,
            detail="No downloadable file is attached to this resource",
        )

    filename = f"{Path(row.title).name or 'resource'}{path.suffix}"
    return FileResponse(
        path,
        filename=filename,
        content_disposition_type="attachment",
    )
