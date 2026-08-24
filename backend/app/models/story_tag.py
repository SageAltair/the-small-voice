from sqlalchemy import Column, ForeignKey, Table

from app.database import Base


story_tags = Table(
    "story_tags",
    Base.metadata,

    Column(
        "story_id",
        ForeignKey("stories.id"),
        primary_key=True,
    ),

    Column(
        "tag_id",
        ForeignKey("tags.id"),
        primary_key=True,
    ),
)