from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
    image_url: str
    image_url_en: str | None = None
    image_url_sw: str | None = None
    text_en: str | None = None
    text_sw: str | None = None
    caption_en: str | None = None
    caption_sw: str | None = None


class BookChapterIn(BaseModel):
    """One ordered chapter of a Book Resource."""

    sort_order: int = 0
    title_en: str
    title_sw: str | None = None
    file_url_en: str
    file_url_sw: str | None = None
    page_count: int | None = None
    file_size: int | None = None


class ResourceRelationshipIn(BaseModel):
    """A link from a Resource to related content (story/learning/journey/resource)."""

    related_type: str
    related_id: int
    relationship_type: str = "related"
    sort_order: int = 0


class ReorderItem(BaseModel):
    id: int
    display_order: int


# ---------------------------------------------------------------------------
# Resource create / update
# ---------------------------------------------------------------------------

class ResourceCreate(BaseModel):
    title: str
    description: str
    resource_type: str
    url: str
    downloadable: bool = False
    published: bool = False
    carousel_urls: list[str] = Field(default_factory=list)
    language: str = "en"
    slug: str | None = None
    author: str | None = None
    topic: str | None = None
    excerpt: str | None = None
    featured: bool = False
    homepage_visible: bool = True
    display_order: int = 0
    scheduled_for: datetime | None = None
    download_enabled: bool | None = None


class ResourceResponse(BaseModel):
    id: int
    title: str
    description: str
    resource_type: str
    url: str
    downloadable: bool
    published: bool
    carousel_urls: list[str] = Field(default_factory=list)
    language: str = "en"
    cover_url: str | None = None
    created_at: datetime
    owner_id: int | None = None
    # Publishing fields (additive; populated once the schema migration runs)
    type: str = "document"
    slug: str | None = None
    author: str | None = None
    topic: str | None = None
    excerpt: str | None = None
    status: str = "draft"
    featured: bool = False
    homepage_visible: bool = True
    display_order: int = 0
    published_at: datetime | None = None
    scheduled_for: datetime | None = None
    download_enabled: bool = False
    share_enabled: bool = True
    save_enabled: bool = True
    updated_at: datetime | None = None

    model_config = ConfigDict(
        from_attributes=True,
    )
