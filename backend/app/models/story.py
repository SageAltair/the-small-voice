from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.story_tag import story_tags


class Story(Base):
    __tablename__ = "stories"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    slug: Mapped[str] = mapped_column(
        String(250),
        unique=True,
        index=True,
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    author: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    type: Mapped[str] = mapped_column(
        String(50),
        default="story",
        nullable=False,
    )

    published: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    published_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    tags = relationship(
        "Tag",
        secondary=story_tags,
        back_populates="stories",
    )

    likes_count: Mapped[int] = mapped_column(default=0, nullable=False)
    comments = relationship(
        "Comment",
        back_populates="story",
        cascade="all, delete-orphan",
        order_by="Comment.created_at.asc()",
    )

    featured: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    owner_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
