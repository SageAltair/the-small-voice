from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    slug: str
    approved: bool = True
    owner_id: int | None = None
    language: str = "en"


class TagResponse(BaseModel):
    id: int
    name: str
    slug: str
    language: str = "en"

    model_config = ConfigDict(
        from_attributes=True,
    )
