from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.security import get_current_user
from app.database import get_db
from app.models.story import Story
from app.models.tag import Tag
from app.models.user import User
from app.schemas.story import StoryResponse
from app.schemas.tag import TagCreate, TagResponse


router = APIRouter(
    prefix="/tags",
    tags=["Tags"],
)


@router.post(
    "/",
    response_model=TagResponse,
)
def create_tag(
    tag_data: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing_tag = db.execute(
        select(Tag).where(
            Tag.slug == tag_data.slug,
        )
    ).scalar_one_or_none()

    if existing_tag:
        raise HTTPException(
            status_code=400,
            detail="Tag already exists",
        )

    tag = Tag(
        name=tag_data.name,
        slug=tag_data.slug,
        owner_id=current_user.id,
        approved=current_user.role == "admin",
    )

    db.add(tag)
    db.commit()
    db.refresh(tag)

    return tag


@router.get(
    "/",
    response_model=list[TagResponse],
)
def get_tags(
    db: Session = Depends(get_db),
):
    result = db.execute(
        select(Tag).where(Tag.approved.is_(True)).order_by(Tag.name),
    )

    return result.scalars().all()


@router.put("/{tag_id}", response_model=TagResponse)
def update_tag(tag_id: int, data: TagCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tag = db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if current_user.role != "admin" and tag.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot update this tag")
    tag.name, tag.slug = data.name, data.slug
    if current_user.role != "admin":
        tag.approved = False
    db.commit(); db.refresh(tag)
    return tag


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tag = db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if current_user.role != "admin" and tag.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot delete this tag")
    db.delete(tag); db.commit()
    return {"message": "Tag deleted"}


@router.get(
    "/{slug}/stories",
    response_model=list[StoryResponse],
)
def get_stories_by_tag(
    slug: str,
    db: Session = Depends(get_db),
):
    tag = db.execute(
        select(Tag).where(
            Tag.slug == slug,
        )
    ).scalar_one_or_none()

    if not tag:
        raise HTTPException(
            status_code=404,
            detail="Tag not found",
        )

    result = db.execute(
        select(Story)
        .join(Story.tags)
        .options(joinedload(Story.tags))
        .where(
            Tag.id == tag.id,
            Story.published.is_(True),
        )
        .order_by(
            Story.created_at.desc(),
        )
    )

    return result.unique().scalars().all()
