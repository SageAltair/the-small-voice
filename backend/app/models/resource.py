from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.resource_tag import resource_tags


class Resource(Base):
    """Core Resource entity.

    Translatable text lives in ``ResourceTranslation`` (one row per language).
    This lets a single Resource carry both English and Swahili content.
    """

    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    resource_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="document"
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    downloadable: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    published: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    language: Mapped[str] = mapped_column(
        String(10), default="en", nullable=False
    )
    cover_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    carousel_urls: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )

    type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="document",
        comment="reel|video|audio|book|carousel|quote|image|infographic|document",
    )
    slug: Mapped[str] = mapped_column(
        String(250), unique=True, index=True, nullable=True
    )
    author: Mapped[str | None] = mapped_column(String(100), nullable=True)
    topic: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        default="draft",
        nullable=False,
        comment="draft|published|scheduled|archived",
    )
    featured: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    homepage_visible: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    display_order: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    scheduled_for: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    download_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    share_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    save_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    owner_id: Mapped[int | None] = mapped_column(
        Integer, index=True, nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    translations = relationship(
        "ResourceTranslation",
        back_populates="resource",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    media = relationship(
        "ResourceMedia",
        back_populates="resource",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ResourceMedia.sort_order",
    )
    carousel_slides = relationship(
        "CarouselSlide",
        back_populates="resource",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="CarouselSlide.sort_order",
    )
    chapters = relationship(
        "BookChapter",
        back_populates="resource",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="BookChapter.sort_order",
    )
    tags = relationship(
        "Tag",
        secondary=resource_tags,
        back_populates="resources",
        lazy="selectin",
    )
    relationships = relationship(
        "ResourceRelationship",
        back_populates="resource",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ResourceTranslation(Base):
    """Bilingual text content for a single Resource.

    One row per language (``en`` / ``sw``).  A Resource may have none, one, or
    both translations - the API layer handles language fallback.
    """

    __tablename__ = "resource_translations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"),
        index=True,
    )

    language: Mapped[str] = mapped_column(
        String(10), default="en", nullable=False
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(250), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    attribution: Mapped[str | None] = mapped_column(String(200), nullable=True)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    accessibility_desc: Mapped[str | None] = mapped_column(Text, nullable=True)

    resource = relationship("Resource", back_populates="translations")


class ResourceMedia(Base):
    """A media file attached to a Resource.

    Each resource can have multiple media files.  ``language`` indicates
    which language the media serves, so one video Resource can carry separate
    English and Swahili video files while remaining a single Resource.
    """

    __tablename__ = "resource_media"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"),
        index=True,
    )

    language: Mapped[str] = mapped_column(
        String(10), default="en", nullable=False
    )

    url: Mapped[str] = mapped_column(String(500), nullable=False)

    media_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="video|audio|image|document|pdf",
    )

    mime_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="Seconds (video/audio)"
    )
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    is_shared: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="True when the same asset serves both languages",
    )

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    resource = relationship("Resource", back_populates="media")


class CarouselSlide(Base):
    """An ordered slide in a Carousel Resource.

    Slides preserve the relationship between language versions: slide 1 in
    English corresponds to slide 1 in Swahili, even when images are shared.
    """

    __tablename__ = "carousel_slides"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"),
        index=True,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    image_url_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    image_url_sw: Mapped[str | None] = mapped_column(String(500), nullable=True)

    text_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    text_sw: Mapped[str | None] = mapped_column(Text, nullable=True)
    caption_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    caption_sw: Mapped[str | None] = mapped_column(Text, nullable=True)

    resource = relationship("Resource", back_populates="carousel_slides")


class BookChapter(Base):
    """A chapter in a Book Resource, with language-specific files."""

    __tablename__ = "book_chapters"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"),
        index=True,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    title_en: Mapped[str] = mapped_column(String(200), nullable=False)
    title_sw: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )

    file_url_en: Mapped[str] = mapped_column(String(500), nullable=False)
    file_url_sw: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resource = relationship("Resource", back_populates="chapters")


class ResourceRelationship(Base):
    """A link from a Resource to related content of another type.

    Lets the admin attach Stories, Learning items, Journeys, or other
    Resources to a Resource so the public detail page can show a unified
    "related content" rail.
    """

    __tablename__ = "resource_relationships"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id", ondelete="CASCADE"),
        index=True,
    )

    related_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="story|learning|journey|resource",
    )

    related_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    relationship_type: Mapped[str] = mapped_column(
        String(50),
        default="related",
        nullable=False,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    resource = relationship("Resource", back_populates="relationships")

