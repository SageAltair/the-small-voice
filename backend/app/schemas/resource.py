from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ResourceCreate(BaseModel):
    title: str
    description: str
    resource_type: str
    url: str
    downloadable: bool = False
    published: bool = False
    carousel_urls: list[str] = Field(default_factory=list)


class ResourceResponse(BaseModel):
    id: int
    title: str
    description: str
    resource_type: str
    url: str
    downloadable: bool
    published: bool
    carousel_urls: list[str] = Field(default_factory=list)
    created_at: datetime
    owner_id: int | None = None

    model_config = ConfigDict(
        from_attributes=True,
    )
