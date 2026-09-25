# Experience Builder models for The Small Voice
# Supports journeys, courses, learning paths, next steps, and interactive experiences

from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Experience(Base):
    """A visual experience: journey, course, learning path, next step, or interactive flow."""

    __tablename__ = "experiences"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    slug: Mapped[str] = mapped_column(String(250), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    experience_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="interactive",
        comment="journey|course|learning_path|next_step|interactive",
    )
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False,
        comment="draft|published|unpublished",
    )
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    theme: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    assets: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    owner_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    steps = relationship("Step", back_populates="experience", cascade="all, delete-orphan", order_by="Step.sort_order.asc()")
    connections = relationship("Connection", back_populates="experience", cascade="all, delete-orphan", order_by="Connection.sort_order.asc()")
    translations = relationship("ExperienceTranslation", back_populates="experience", cascade="all, delete-orphan")

    def generate_slug(self):
        base = self.title.lower().strip()
        base = "".join(c if c.isalnum() or c == " " else "" for c in base)
        base = "-".join(base.split())
        if not base:
            base = "experience"
        self.slug = f"{base}-{uuid4().hex[:8]}"


class ExperienceTranslation(Base):
    """Language-specific translations for an Experience."""

    __tablename__ = "experience_translations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experiences.id", ondelete="CASCADE"), index=True)
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    experience = relationship("Experience", back_populates="translations")


class Step(Base):
    """A single screen/step within an Experience."""

    __tablename__ = "steps"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experiences.id", ondelete="CASCADE"), index=True)
    step_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="lesson",
        comment="lesson|assessment|transition|final",
    )
    title: Mapped[str] = mapped_column(String(250), nullable=True)
    subtitle: Mapped[str] = mapped_column(String(250), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    requires_previous: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    prerequisites: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    editor_label: Mapped[str] = mapped_column(String(100), nullable=True)
    step_status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False,
        comment="draft|ready|locked",
    )
    page_settings: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    experience = relationship("Experience", back_populates="steps")
    elements = relationship("Element", back_populates="step", cascade="all, delete-orphan", order_by="Element.sort_order.asc()")
    connections = relationship(
        "Connection",
        back_populates="source_step",
        foreign_keys="Connection.source_step_id",
        cascade="all, delete-orphan",
    )
    incoming_connections = relationship(
        "Connection",
        back_populates="target_step",
        foreign_keys="Connection.target_step_id",
        cascade="all, delete-orphan",
    )


class Element(Base):
    """A visual element on a step: heading, text, image, button, etc."""

    __tablename__ = "elements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    step_id: Mapped[int] = mapped_column(ForeignKey("steps.id", ondelete="CASCADE"), index=True)
    element_uuid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()))
    element_type: Mapped[str] = mapped_column(String(30), nullable=False)
    position_x: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    position_y: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    width: Mapped[int] = mapped_column(Integer, default=320, nullable=False)
    height: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    content: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    style: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    responsive: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    visibility_condition: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_interactive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    accessibility: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    z_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rotation: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    parent_container_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    # These two are NOT NULL in the live table (created by an earlier version
    # of this model), so the ORM must always supply them.
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    step = relationship("Step", back_populates="elements")
    actions = relationship("ElementAction", back_populates="element", cascade="all, delete-orphan", order_by="ElementAction.sort_order.asc()")


class ElementAction(Base):
    """An action triggered by an element: click, hover, etc."""

    __tablename__ = "element_actions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    element_id: Mapped[int] = mapped_column(ForeignKey("elements.id", ondelete="CASCADE"), index=True)
    trigger: Mapped[str] = mapped_column(String(30), nullable=False, default="click")
    action_type: Mapped[str] = mapped_column(String(30), nullable=False, default="navigate")
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    condition: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    element = relationship("Element", back_populates="actions")


class Connection(Base):
    """A connection from one step to another, possibly triggered by an element."""

    __tablename__ = "connections"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experiences.id", ondelete="CASCADE"), index=True)
    source_step_id: Mapped[int] = mapped_column(ForeignKey("steps.id", ondelete="CASCADE"), index=True)
    source_element_id: Mapped[int | None] = mapped_column(ForeignKey("elements.id", ondelete="SET NULL"), index=True, nullable=True)
    target_step_id: Mapped[int] = mapped_column(ForeignKey("steps.id", ondelete="CASCADE"), index=True)
    target_element_id: Mapped[int | None] = mapped_column(ForeignKey("elements.id", ondelete="SET NULL"), index=True, nullable=True)
    label: Mapped[str] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source_step = relationship("Step", back_populates="connections", foreign_keys=[source_step_id])
    source_element = relationship("Element", foreign_keys=[source_element_id], lazy="select")
    target_step = relationship("Step", back_populates="incoming_connections", foreign_keys=[target_step_id])
    target_element = relationship("Element", foreign_keys=[target_element_id], lazy="select")
    experience = relationship("Experience", back_populates="connections")




class Template(Base):
    """A reusable template for quickly creating experiences or steps."""

    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(250), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    template_type: Mapped[str] = mapped_column(String(20), nullable=False)
    usage: Mapped[str] = mapped_column(String(50), nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ExperienceVersion(Base):
    """Stores version history for an Experience (for undo/restore)."""

    __tablename__ = "experience_versions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experiences.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    change_description: Mapped[str] = mapped_column(String(500), nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class UserProgress(Base):
    """Tracks a user's progress through an Experience."""

    __tablename__ = "user_progress"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experiences.id", ondelete="CASCADE"), index=True)
    current_step_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completed_steps: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    step_data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", lazy="select")
    experience = relationship("Experience", lazy="select")

__all__ = [
    "Experience",
    "ExperienceTranslation",
    "Step",
    "Element",
    "ElementAction",
    "Connection",
    "Template",
    "ExperienceVersion",
    "UserProgress",
]
