from sqlalchemy import Column, ForeignKey, Table

from app.database import Base


resource_tags = Table(
    "resource_tags",
    Base.metadata,

    Column(
        "resource_id",
        ForeignKey("resources.id", ondelete="CASCADE"),
        primary_key=True,
    ),

    Column(
        "tag_id",
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
