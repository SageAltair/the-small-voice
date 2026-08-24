from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.tag import TagResponse


class StoryCreate(BaseModel):
    title: str
    slug: str
    content: str
    image_url: str | None = None
    author: str
    category: str
    published: bool = False
    featured: bool = False


class StoryUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    content: str | None = None
    image_url: str | None = None
    author: str | None = None
    category: str | None = None
    published: bool | None = None
    featured: bool | None = None


class StoryResponse(BaseModel):
    id: int
    title: str
    slug: str
    content: str
    image_url: str | None = None
    author: str
    category: str
    published: bool
    featured: bool
    created_at: datetime
    published_at: datetime | None = None
    tags: list[TagResponse] = []
    likes_count: int = 0
    comments: list["CommentResponse"] = []

    model_config = ConfigDict(
        from_attributes=True,
    )


class StoryTagRequest(BaseModel):
    tag_ids: list[int]


class CommentCreate(BaseModel):
    author: str
    content: str


class CommentResponse(BaseModel):
    id: int
    author: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
