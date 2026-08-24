from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    slug: str
    approved: bool = True
    owner_id: int | None = None


class TagResponse(BaseModel):
    id: int
    name: str
    slug: str

    model_config = ConfigDict(
        from_attributes=True,
    )
