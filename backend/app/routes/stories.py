from pathlib import Path
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.auth.security import get_current_user
from app.database import get_db
from app.models.story import Story
from app.models.comment import Comment
from app.models.tag import Tag
from app.models.user import User
from app.schemas.story import (
    CommentCreate,
    StoryCreate,
    StoryResponse,
    StoryTagRequest,
    StoryUpdate,
)


router = APIRouter(
    prefix="/stories",
    tags=["Stories"],
)

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def get_story_or_404(
    story_id: int,
    db: Session,
) -> Story:

    story = db.execute(
        select(Story)
        .options(
            joinedload(Story.tags),
        )
        .where(
            Story.id == story_id,
        )
    ).unique().scalar_one_or_none()

    if not story:
        raise HTTPException(
            status_code=404,
            detail="Story not found",
        )

    return story


@router.post(
    "/",
    response_model=StoryResponse,
)
def create_story(
    title: str = Form(...),
    slug: str = Form(...),
    content: str = Form(...),
    author: str = Form(...),
    category: str = Form(...),
    published: bool = Form(False),
    submit_for_review: bool = Form(False),
    image_url: str | None = Form(None),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {
        "author",
        "admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="You cannot create stories",
        )

    if current_user.role == "admin" and not submit_for_review:
        published = True
    else:
        # Authors submit work for review; they cannot publish directly or
        # impersonate another contributor.
        published = False
        author = current_user.username

    if image and image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG, WebP, and GIF images are supported",
        )

    image_url = image_url.strip() if image_url else None
    if image:
        UPLOAD_DIR.mkdir(exist_ok=True)
        extension = Path(image.filename or "image").suffix.lower()
        filename = f"{uuid4().hex}{extension}"
        (UPLOAD_DIR / filename).write_bytes(image.file.read())
        image_url = f"/uploads/{filename}"

    existing_story = db.execute(
        select(Story).where(
            Story.slug == slug,
        )
    ).scalar_one_or_none()

    if existing_story:
        raise HTTPException(
            status_code=400,
            detail="Story slug already exists",
        )

    story = Story(
        title=title,
        slug=slug,
        content=content,
        image_url=image_url,
        author=author,
        category=category,
        published=published,
        published_at=datetime.utcnow() if published else None,
        owner_id=current_user.id,
    )

    db.add(story)
    db.commit()
    db.refresh(story)

    return story


@router.get(
    "/",
    response_model=list[StoryResponse],
)
def get_stories(
    db: Session = Depends(get_db),
):
    result = db.execute(
        select(Story)
        .options(
            joinedload(Story.tags),
        )
        .where(
            Story.published.is_(True),
        )
        .order_by(
            Story.created_at.desc(),
        )
    )

    return result.unique().scalars().all()


@router.get(
    "/search",
    response_model=list[StoryResponse],
)
def search_stories(
    q: str,
    db: Session = Depends(get_db),
):
    search_term = f"%{q}%"

    result = db.execute(
        select(Story)
        .options(
            joinedload(Story.tags),
        )
        .where(
            Story.published.is_(True),
            or_(
                Story.title.ilike(search_term),
                Story.content.ilike(search_term),
            ),
        )
        .order_by(
            Story.created_at.desc(),
        )
    )

    return result.unique().scalars().all()


@router.post("/{story_id}/like", response_model=StoryResponse)
def like_story(story_id: int, db: Session = Depends(get_db)):
    story = get_story_or_404(story_id, db)
    story.likes_count += 1
    db.commit()
    return get_story_or_404(story_id, db)


@router.post("/{story_id}/comments", response_model=StoryResponse)
def comment_on_story(story_id: int, comment_data: CommentCreate, db: Session = Depends(get_db)):
    story = get_story_or_404(story_id, db)
    story.comments.append(Comment(**comment_data.model_dump()))
    db.commit()
    return get_story_or_404(story_id, db)


@router.get(
    "/{story_id}",
    response_model=StoryResponse,
)
def get_story(
    story_id: int,
    db: Session = Depends(get_db),
):
    story = get_story_or_404(story_id, db)

    if not story.published:
        raise HTTPException(status_code=404, detail="Story not found")

    return story


@router.put(
    "/{story_id}",
    response_model=StoryResponse,
)
def update_story(
    story_id: int,
    story_data: StoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    story = get_story_or_404(
        story_id,
        db,
    )

    if current_user.role != "admin" and story.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot update this story",
        )

    update_data = story_data.model_dump(
        exclude_unset=True,
    )

    if current_user.role != "admin":
        update_data.pop("author", None)
        update_data.pop("published", None)
        update_data.pop("featured", None)
        # Any author edit requires the administrator to approve it again.
        story.published = False
        story.published_at = None

    if update_data.get("published") is True and not story.published:
        story.published_at = datetime.utcnow()

    for field, value in update_data.items():
        setattr(
            story,
            field,
            value,
        )

    db.commit()
    db.refresh(story)

    return story


@router.delete(
    "/{story_id}",
)
def delete_story(
    story_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    story = get_story_or_404(
        story_id,
        db,
    )

    if current_user.role != "admin" and story.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot delete this story",
        )

    db.delete(story)
    db.commit()

    return {
        "message": "Story deleted successfully",
    }


@router.post(
    "/{story_id}/tags",
    response_model=StoryResponse,
)
def add_tags_to_story(
    story_id: int,
    tag_data: StoryTagRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    story = get_story_or_404(
        story_id,
        db,
    )

    if current_user.role != "admin" and story.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot modify this story",
        )

    tags = db.execute(
        select(Tag).where(
            Tag.id.in_(tag_data.tag_ids),
        )
    ).scalars().all()

    if len(tags) != len(set(tag_data.tag_ids)):
        raise HTTPException(
            status_code=404,
            detail="One or more tags were not found",
        )

    story.tags = tags

    db.commit()
    db.refresh(story)

    return get_story_or_404(
        story_id,
        db,
    )


@router.get(
    "/{story_id}/related",
    response_model=list[StoryResponse],
)
def get_related_stories(
    story_id: int,
    limit: int = Query(
        default=5,
        ge=1,
        le=20,
    ),
    db: Session = Depends(get_db),
):
    story = get_story_or_404(
        story_id,
        db,
    )

    tag_ids = [
        tag.id
        for tag in story.tags
    ]

    if not tag_ids:
        return []

    result = db.execute(
        select(Story)
        .options(
            joinedload(Story.tags),
        )
        .join(Story.tags)
        .where(
            Story.id != story_id,
            Story.published.is_(True),
            Tag.id.in_(tag_ids),
        )
        .distinct()
        .order_by(
            Story.created_at.desc(),
        )
        .limit(limit),
    )

    return result.unique().scalars().all()
