from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

# The nine resource types the platform understands.  Everything that accepts a
# type validates against this list, so an invalid type can never reach the
# database or a viewer - the single place the vocabulary is defined.
RESOURCE_TYPES = [
    "reel",
    "video",
    "audio",
    "book",
    "carousel",
    "quote",
    "image",
    "infographic",
    "document",
]

RESOURCE_TYPE_SET = set(RESOURCE_TYPES)

STATUSES = {"draft", "published", "scheduled", "archived"}
VISIBILITIES = {"public", "unlisted", "private"}
LANGUAGES = {"en", "sw"}


# Legacy names used by the original admin form and older rows.  They are
# mapped onto the current vocabulary on write (see ``_validate_type``) and on
# read, so historical content keeps rendering with the right viewer instead of
# silently degrading to a generic document.
TYPE_ALIASES = {
    "photos": "image",
    "photo": "image",
    "gallery": "image",
    "images": "image",
    "videos": "video",
    "movie": "video",
    "clip": "video",
    "film": "video",
    "music": "audio",
    "podcast": "audio",
    "books": "book",
    "pdf": "document",
    "documents": "document",
    "infographics": "infographic",
    "quotes": "quote",
    "carousels": "carousel",
    "reels": "reel",
}


def _validate_type(value: str | None) -> str:
    """Normalise and check a Resource type.

    Legacy names (``photo``, ``videos``, ``pdf``...) are mapped onto the new
    vocabulary rather than rejected, so existing content keeps working through
    the rebuild. Anything genuinely unrecognised is refused.
    """
    if value is None or not str(value).strip():
        return "document"

    normalised = str(value).strip().lower()
    normalised = TYPE_ALIASES.get(normalised, normalised)

    if normalised not in RESOURCE_TYPE_SET:
        raise ValueError(
            f"'{value}' is not a resource type. Use one of: "
            f"{', '.join(RESOURCE_TYPES)}."
        )

    return normalised


def _validate_choice(value: str | None, allowed: set[str], field: str) -> str:
    if value is None:
        return ""
    normalised = str(value).strip().lower()
    if normalised not in allowed:
        raise ValueError(
            f"'{value}' is not a valid {field}. Use one of: "
            f"{', '.join(sorted(allowed))}."
        )
    return normalised


def _validate_language(value: str | None) -> str:
    if not value:
        return "en"
    normalised = str(value).strip().lower()
    if normalised not in LANGUAGES:
        raise ValueError(f"'{value}' is not a supported language. Use 'en' or 'sw'.")
    return normalised


# ---------------------------------------------------------------------------
# Type-specific sub-resources
# ---------------------------------------------------------------------------

class ResourceTranslationIn(BaseModel):
    """Bilingual text payload for one language of a Resource."""

    language: str = "en"
    title: str | None = None
    slug: str | None = None
    description: str | None = None
    excerpt: str | None = None
    quote_text: str | None = None
    attribution: str | None = None
    caption: str | None = None
    transcript: str | None = None
    accessibility_desc: str | None = None


class CarouselSlideIn(BaseModel):
    """One ordered slide of a Carousel Resource."""

    sort_order: int = 0
    image_url: str | None = None
    image_url_en: str | None = None
    image_url_sw: str | None = None
    text_en: str | None = None
    text_sw: str | None = None
    caption_en: str | None = None
    caption_sw: str | None = None
    alt_text: str | None = None


class ResourceRelationshipIn(BaseModel):
    """A link from a Resource to related content (story/learning/resource)."""

    related_type: str
    related_id: int
    relationship_type: str = "related"
    sort_order: int = 0


class ReorderItem(BaseModel):
    id: int
    display_order: int


class UploadResult(BaseModel):
    """What an upload hands back so the editor can describe the file.

    Declared explicitly rather than left to FastAPI's inference: with a
    ``Response`` parameter in the signature and no model, the payload gets
    filtered down to ``null`` and the editor receives nothing useful.
    """

    url: str
    name: str
    kind: str | None = None
    previewable: bool = False
    mime_type: str | None = None
    file_size: int | None = None
    duration: int | None = None
    page_count: int | None = None
    width: int | None = None
    height: int | None = None
    cover_url: str | None = None


class ResourceMediaIn(BaseModel):
    """A media file attached to a Resource, with its probed metadata."""

    url: str
    media_type: str
    language: str = "en"
    mime_type: str | None = None
    file_size: int | None = None
    duration: int | None = None
    width: int | None = None
    height: int | None = None
    is_shared: bool = True
    sort_order: int = 0

    @field_validator("language")
    @classmethod
    def check_language(cls, value: str) -> str:
        return _validate_language(value)


class BookChapterIn(BaseModel):
    """One ordered chapter of a Book Resource.

    A chapter carries reading text (``body_*``) and/or a file.  The reader shows
    the text when it exists and the document pane when it does not, so a book
    of scanned pages and a book written in the editor use the same reader.
    """

    sort_order: int = 0
    title_en: str = ""
    title_sw: str | None = None
    file_url_en: str | None = None
    file_url_sw: str | None = None
    body_en: str | None = None
    body_sw: str | None = None
    page_count: int | None = None
    file_size: int | None = None


# ---------------------------------------------------------------------------
# Resource create / update
# ---------------------------------------------------------------------------

class ResourceUpsert(BaseModel):
    """Everything the admin editor can save for one Resource.

    This is a whole-document payload on purpose: metadata, both translations,
    slides, chapters, media and related links all move together, so a save is
    atomic and the editor never has to guess what stuck.
    """

    title: str
    type: str = "document"
    description: str = ""
    language: str = "en"
    author: str | None = None
    topic: str | None = None
    tags: list[str] = Field(default_factory=list)
    slug: str | None = None
    status: str = "draft"
    visibility: str = "public"
    featured: bool = False
    recommended: bool = False
    is_new: bool = False
    homepage_visible: bool = True
    download_enabled: bool = False
    share_enabled: bool = True
    save_enabled: bool = True
    display_order: int = 0
    scheduled_for: datetime | None = None
    published_at: datetime | None = None

    # Type-specific, accessibility and asset metadata
    cover_url: str | None = None
    url: str | None = None
    external_url: str | None = None
    alt_text: str | None = None
    caption: str | None = None
    excerpt: str | None = None
    quote_text: str | None = None
    attribution: str | None = None
    transcript: str | None = None
    accessibility_desc: str | None = None
    duration: int | None = None
    page_count: int | None = None
    file_size: int | None = None
    mime_type: str | None = None

    # Child collections
    translations: list[ResourceTranslationIn] = Field(default_factory=list)
    slides: list[CarouselSlideIn] = Field(default_factory=list)
    chapters: list[BookChapterIn] = Field(default_factory=list)
    media: list[ResourceMediaIn] = Field(default_factory=list)
    relationships: list[ResourceRelationshipIn] = Field(default_factory=list)

    @field_validator("type")
    @classmethod
    def check_type(cls, value: str) -> str:
        return _validate_type(value)

    @field_validator("status")
    @classmethod
    def check_status(cls, value: str) -> str:
        return _validate_choice(value or "draft", STATUSES, "status") or "draft"

    @field_validator("visibility")
    @classmethod
    def check_visibility(cls, value: str) -> str:
        return (
            _validate_choice(value or "public", VISIBILITIES, "visibility")
            or "public"
        )

    @field_validator("language")
    @classmethod
    def check_language(cls, value: str) -> str:
        return _validate_language(value)

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise ValueError("A resource needs a title.")
        return cleaned


class ResourceCreate(ResourceUpsert):
    """The legacy author-submission shape.

    Kept so ``POST /resources/`` and ``PUT /resources/manage/{id}`` keep the
    contract the existing author flow already uses; every richer field is
    simply optional.

    The oldest callers (the console's flat "Add resource" form and the author
    submission form) still speak the previous dialect - ``resource_type``,
    ``downloadable`` and ``published``.  They are declared here rather than
    left to pydantic's extra-ignore, so the handlers can translate them into
    the current fields instead of silently dropping the author's choices.
    """

    resource_type: str | None = None
    downloadable: bool | None = None
    published: bool | None = None


class ReorderItem(BaseModel):
    id: int
    display_order: int


class BulkAction(BaseModel):
    """A batch of ids sharing one admin action."""

    ids: list[int] = Field(default_factory=list)
    action: str

    @field_validator("action")
    @classmethod
    def check_action(cls, value: str) -> str:
        allowed = {
            "publish", "unpublish", "archive", "feature", "unfeature",
            "recommend", "hide", "show", "delete", "restore",
        }
        normalised = (value or "").strip().lower()
        if normalised not in allowed:
            raise ValueError(f"'{value}' is not a supported bulk action.")
        return normalised


class ResourceResponse(BaseModel):
    """The public shape of a Resource.

    Every viewer is driven by this, so it carries the resolved (language-
    specific) text as well as the raw fields: the client should never have to
    merge translations itself.
    """

    id: int
    type: str = "document"
    resource_type: str = "document"
    slug: str | None = None
    title: str
    description: str = ""
    excerpt: str | None = None
    language: str = "en"
    author: str | None = None
    topic: str | None = None
    tags: list[str] = Field(default_factory=list)
    tag_slugs: list[str] = Field(default_factory=list)

    cover_url: str | None = None
    url: str | None = None
    external_url: str | None = None
    media_url: str | None = None
    """The resolved playable/primary file for the requested language."""

    media: list[dict] = Field(default_factory=list)
    slides: list[dict] = Field(default_factory=list)
    chapters: list[dict] = Field(default_factory=list)

    # Type-specific text
    quote_text: str | None = None
    attribution: str | None = None
    caption: str | None = None
    alt_text: str | None = None
    accessibility_desc: str | None = None
    transcript: str | None = None

    # File facts
    duration: int | None = None
    page_count: int | None = None
    file_size: int | None = None
    mime_type: str | None = None
    carousel_urls: list[str] = Field(default_factory=list)

    # Publishing and permissions
    status: str = "draft"
    published: bool = False
    published_at: datetime | None = None
    scheduled_for: datetime | None = None
    featured: bool = False
    recommended: bool = False
    is_new: bool = False
    homepage_visible: bool = True
    visibility: str = "public"
    download_enabled: bool = False
    downloadable: bool = False
    share_enabled: bool = True
    save_enabled: bool = True
    view_count: int = 0
    display_order: int = 0

    created_at: datetime
    updated_at: datetime | None = None
    owner_id: int | None = None

    related: list[dict] = Field(default_factory=list)
    """Related resources plus linked Stories and Lessons, already resolved."""

    model_config = ConfigDict(
        from_attributes=True,
    )
