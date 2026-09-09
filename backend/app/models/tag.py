from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
    )

    slug: Mapped[str] = mapped_column(
        String(60),
        unique=True,
        index=True,
        nullable=False,
    )

    stories = relationship(
        "Story",
        secondary="story_tags",
        back_populates="tags",
    )

    owner_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    approved: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )
