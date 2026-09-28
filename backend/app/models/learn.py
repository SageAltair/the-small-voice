"""Learn models for The Small Voice.

Learn is a guided learning system rather than an article library: published
paths contain short, ordered lessons, and a lesson is a sequence of typed
content blocks (text, Scripture, reflection, practice, next step, ...) instead
of one long page.

Language handling follows the pattern already used by ``Resource`` and
``Experience``: the base row keeps language-neutral data (slug, ordering,
media URLs, references to existing Stories/Resources) while every piece of
authored prose lives in a ``*Translation`` row - one row per language. That
makes it impossible for an English and a Swahili sentence to share a column and
lets the admin see exactly which language version is still missing.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LearnCategory(Base):
    """A thematic grouping of paths ("Start with God", "Learn to Pray")."""

    __tablename__ = "learn_categories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    icon: Mapped[str | None] = mapped_column(String(40), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False,
        comment="draft|published",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    translations = relationship(
        "LearnCategoryTranslation",
        back_populates="category",
        cascade="all, delete-orphan",
    )
    paths = relationship("LearnPath", back_populates="category")


class LearnCategoryTranslation(Base):
    """Language-specific name/description for a category."""

    __tablename__ = "learn_category_translations"
    __table_args__ = (
        UniqueConstraint("category_id", "language", name="uq_learn_category_translation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("learn_categories.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    category = relationship("LearnCategory", back_populates="translations")


class LearnPath(Base):
    """An ordered learning path ("Start with God")."""

    __tablename__ = "learn_paths"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("learn_categories.id", ondelete="SET NULL"), index=True, nullable=True
    )
    cover_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    level: Mapped[str] = mapped_column(
        String(20), default="beginner", nullable=False,
        comment="beginner|growing|deeper",
    )
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Primary authoring language. A path must have a translation in this
    # language before it can be published, and admin lists fall back to it.
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", index=True, nullable=False,
        comment="draft|published|unpublished",
    )
    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    owner_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    category = relationship("LearnCategory", back_populates="paths")
    translations = relationship(
        "LearnPathTranslation",
        back_populates="path",
        cascade="all, delete-orphan",
    )
    lessons = relationship(
        "LearnLesson",
        back_populates="path",
        cascade="all, delete-orphan",
        order_by="LearnLesson.position.asc()",
    )

    def generate_slug(self) -> None:
        """Build a readable, unique public slug (never derived from position)."""
        base = "".join(
            char if char.isalnum() or char == " " else "" for char in self.slug.lower().strip()
        )
        base = "-".join(base.split())
        self.slug = f"{base[:180]}-{uuid4().hex[:6]}" if base else f"path-{uuid4().hex[:6]}"


class LearnPathTranslation(Base):
    """Language-specific title and description for a path."""

    __tablename__ = "learn_path_translations"
    __table_args__ = (
        UniqueConstraint("path_id", "language", name="uq_learn_path_translation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    path_id: Mapped[int] = mapped_column(
        ForeignKey("learn_paths.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    path = relationship("LearnPath", back_populates="translations")


class LearnLesson(Base):
    """A single short lesson inside a path."""

    __tablename__ = "learn_lessons"
    __table_args__ = (
        UniqueConstraint("path_id", "slug", name="uq_learn_lesson_slug"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    path_id: Mapped[int] = mapped_column(
        ForeignKey("learn_paths.id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, index=True, nullable=False)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", index=True, nullable=False,
        comment="draft|published",
    )
    owner_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    path = relationship("LearnPath", back_populates="lessons")
    translations = relationship(
        "LearnLessonTranslation",
        back_populates="lesson",
        cascade="all, delete-orphan",
    )
    blocks = relationship(
        "LearnLessonBlock",
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="LearnLessonBlock.position.asc()",
    )

    def generate_slug(self) -> None:
        base = "".join(
            char if char.isalnum() or char == " " else "" for char in self.slug.lower().strip()
        )
        base = "-".join(base.split())
        self.slug = base[:180] or f"lesson-{uuid4().hex[:6]}"


class LearnLessonTranslation(Base):
    """Language-specific lesson information, objective and next step.

    ``objective_before`` / ``objective_after`` / ``objective_action`` are the
    content-quality guard rails the admin is asked to fill in: what the learner
    understands now, what they should understand afterwards, and what they can
    actually practise. ``next_step`` is the practical action the lesson sends
    the learner away with - the defining characteristic of Learn.
    """

    __tablename__ = "learn_lesson_translations"
    __table_args__ = (
        UniqueConstraint("lesson_id", "language", name="uq_learn_lesson_translation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("learn_lessons.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    objective_before: Mapped[str | None] = mapped_column(Text, nullable=True)
    objective_after: Mapped[str | None] = mapped_column(Text, nullable=True)
    objective_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_step: Mapped[str | None] = mapped_column(Text, nullable=True)
    completion_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    lesson = relationship("LearnLesson", back_populates="translations")


class LearnLessonBlock(Base):
    """One typed content block in a lesson (see app.learn_content.BLOCK_TYPES).

    ``config`` stores language-neutral data only - media URLs, the ids of
    existing Stories/Resources, a callout tone, the index of a quiz answer - so
    media is referenced, never duplicated. Authored prose lives in
    ``LearnLessonBlockTranslation.data``, one row per language.
    """

    __tablename__ = "learn_lesson_blocks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("learn_lessons.id", ondelete="CASCADE"), index=True
    )
    block_type: Mapped[str] = mapped_column(String(30), nullable=False)
    section: Mapped[str] = mapped_column(
        String(20), default="understand", nullable=False,
        comment="understand|see|reflect|practice|next_step",
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    lesson = relationship("LearnLesson", back_populates="blocks")
    translations = relationship(
        "LearnLessonBlockTranslation",
        back_populates="block",
        cascade="all, delete-orphan",
    )


class LearnLessonBlockTranslation(Base):
    """Language-specific authored text for one block."""

    __tablename__ = "learn_block_translations"
    __table_args__ = (
        UniqueConstraint("block_id", "language", name="uq_learn_block_translation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    block_id: Mapped[int] = mapped_column(
        ForeignKey("learn_lesson_blocks.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    block = relationship("LearnLessonBlock", back_populates="translations")


class LearnLessonProgress(Base):
    """A learner's progress through one lesson.

    Exactly one of ``user_id`` / ``client_id`` identifies the learner:
    signed-in visitors are keyed by user id (so progress follows them across
    devices) while everyone else is keyed by the anonymous client id the Learn
    UI keeps in local storage. Learn never requires an account.
    """

    __tablename__ = "learn_lesson_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_learn_lesson_progress_user"),
        UniqueConstraint("client_id", "lesson_id", name="uq_learn_lesson_progress_client"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    path_id: Mapped[int] = mapped_column(
        ForeignKey("learn_paths.id", ondelete="CASCADE"), index=True
    )
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("learn_lessons.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default="in_progress", nullable=False,
        comment="in_progress|completed",
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_block_position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # {block_id: text} for reflections/discussions and {block_id: option_index}
    # for quizzes, so a returning learner finds their own words again.
    responses: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Ids of practice blocks the learner has actually carried out.
    completed_blocks: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class LearnPathProgress(Base):
    """Where a learner is inside a path: current lesson and completion."""

    __tablename__ = "learn_path_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "path_id", name="uq_learn_path_progress_user"),
        UniqueConstraint("client_id", "path_id", name="uq_learn_path_progress_client"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    path_id: Mapped[int] = mapped_column(
        ForeignKey("learn_paths.id", ondelete="CASCADE"), index=True
    )
    current_lesson_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class LearnEvent(Base):
    """Lightweight analytics for the Learn overview.

    Deliberately small: views, completions and language usage are enough to
    answer "which lessons are used, and where do people stop" without building
    a second analytics product.
    """

    __tablename__ = "learn_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    path_id: Mapped[int | None] = mapped_column(
        ForeignKey("learn_paths.id", ondelete="SET NULL"), index=True, nullable=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("learn_lessons.id", ondelete="SET NULL"), index=True, nullable=True
    )
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    event_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


__all__ = [
    "LearnCategory",
    "LearnCategoryTranslation",
    "LearnEvent",
    "LearnLesson",
    "LearnLessonBlock",
    "LearnLessonBlockTranslation",
    "LearnLessonProgress",
    "LearnLessonTranslation",
    "LearnPath",
    "LearnPathProgress",
    "LearnPathTranslation",
]
