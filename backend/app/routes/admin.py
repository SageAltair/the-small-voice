from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.resource import Resource
from datetime import datetime

from app.models.story import Story
from app.models.tag import Tag
from app.models.user import User
from app.schemas.resource import ResourceCreate, ResourceResponse
from app.schemas.tag import TagCreate, TagResponse


router = APIRouter(prefix="/admin", tags=["Admin"])
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_RESOURCE_SIZE = 25 * 1024 * 1024
MAX_CAROUSEL_IMAGES = 8


def require_admin(user: User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.post("/upload-image")
def upload_image(image: UploadFile = File(...), _: User = Depends(require_admin)):
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    UPLOAD_DIR.mkdir(exist_ok=True)
    filename = f"{uuid4().hex}{Path(image.filename or 'image').suffix.lower()}"
    (UPLOAD_DIR / filename).write_bytes(image.file.read())
    return {"image_url": f"/uploads/{filename}"}


@router.post("/upload-resource")
def upload_resource(resource: UploadFile = File(...), _: User = Depends(require_admin)):
    """Store an administrator-uploaded resource for public viewing/download."""
    original_name = Path(resource.filename or "resource")
    extension = original_name.suffix.lower()
    if not extension:
        raise HTTPException(status_code=400, detail="Please upload a file with an extension")

    content = resource.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_RESOURCE_SIZE:
        raise HTTPException(status_code=400, detail="Files must be 25 MB or smaller")

    UPLOAD_DIR.mkdir(exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    (UPLOAD_DIR / filename).write_bytes(content)
    return {
        "resource_url": f"/uploads/{filename}",
        "filename": original_name.name,
    }


def save_carousel_images(images: list[UploadFile]) -> list[str]:
    if len(images) > MAX_CAROUSEL_IMAGES:
        raise HTTPException(status_code=400, detail="A resource can have up to 8 carousel images")

    urls = []
    UPLOAD_DIR.mkdir(exist_ok=True)
    for image in images:
        if image.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail="Carousel files must be JPG, PNG, WebP, or GIF images")
        content = image.file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Carousel images cannot be empty")
        if len(content) > MAX_RESOURCE_SIZE:
            raise HTTPException(status_code=400, detail="Carousel images must be 25 MB or smaller")
        filename = f"{uuid4().hex}{Path(image.filename or 'image').suffix.lower()}"
        (UPLOAD_DIR / filename).write_bytes(content)
        urls.append(f"/uploads/{filename}")
    return urls


@router.post("/resources/upload", response_model=ResourceResponse)
def create_uploaded_resource(
    title: str = Form(...),
    description: str = Form(...),
    resource_type: str = Form(...),
    published: bool = Form(True),
    resource: UploadFile = File(...),
    carousel_images: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Save an uploaded file and its public resource record as one operation."""
    original_name = Path(resource.filename or "resource")
    extension = original_name.suffix.lower()
    if not extension:
        raise HTTPException(status_code=400, detail="Please upload a file with an extension")

    content = resource.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_RESOURCE_SIZE:
        raise HTTPException(status_code=400, detail="Files must be 25 MB or smaller")

    UPLOAD_DIR.mkdir(exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(content)

    try:
        item = Resource(
            title=title,
            description=description,
            resource_type=resource_type,
            url=f"/uploads/{filename}",
            downloadable=True,
            published=published,
            carousel_urls=save_carousel_images(carousel_images),
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise


@router.post("/resources/{resource_id}/carousel", response_model=ResourceResponse)
def add_resource_carousel_images(
    resource_id: int,
    carousel_images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    resource = db.get(Resource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    existing_images = list(resource.carousel_urls or [])
    if len(existing_images) + len(carousel_images) > MAX_CAROUSEL_IMAGES:
        raise HTTPException(status_code=400, detail="A resource can have up to 8 carousel images")
    resource.carousel_urls = [*existing_images, *save_carousel_images(carousel_images)]
    db.commit()
    db.refresh(resource)
    return resource


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {
        "stories": db.execute(select(Story).order_by(Story.created_at.desc())).scalars().all(),
        "resources": db.execute(select(Resource).order_by(Resource.created_at.desc())).scalars().all(),
        "tags": db.execute(select(Tag).order_by(Tag.name)).scalars().all(),
        "users": [
            {"id": user.id, "username": user.username, "email": user.email,
             "role": user.role, "is_active": user.is_active}
            for user in db.execute(select(User).order_by(User.created_at.desc())).scalars()
        ],
    }


@router.post("/resources", response_model=ResourceResponse)
def create_resource(data: ResourceCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    resource = Resource(**data.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


@router.post("/tags", response_model=TagResponse)
def create_tag(data: TagCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    tag = Tag(**data.model_dump())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{item_type}/{item_id}")
def delete_item(item_type: str, item_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    models = {"stories": Story, "resources": Resource, "tags": Tag, "users": User}
    model = models.get(item_type)
    item = db.get(model, item_id) if model else None
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": "Item deleted"}


@router.put("/{item_type}/{item_id}")
def update_item(item_type: str, item_id: int, changes: dict = Body(...), db: Session = Depends(get_db), _: User = Depends(require_admin)):
    models = {"stories": Story, "resources": Resource, "tags": Tag, "users": User}
    item = db.get(models.get(item_type), item_id) if item_type in models else None
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    changes.pop("id", None)
    if item_type == "users":
        changes.pop("hashed_password", None)
    if item_type == "stories" and changes.get("published") is True and not item.published:
        item.published_at = datetime.utcnow()
    # Saving a contributor's resource or topic in the admin workspace is its
    # approval action. The public endpoints continue to hide unapproved items.
    if item_type == "resources":
        changes["published"] = True
    if item_type == "tags":
        changes["approved"] = True
    for field, value in changes.items():
        if hasattr(item, field):
            setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return {"message": "Item updated"}
