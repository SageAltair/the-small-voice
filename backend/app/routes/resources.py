from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.resource import Resource
from app.models.user import User
from app.schemas.resource import (
    ResourceCreate,
    ResourceResponse,
)


router = APIRouter(
    prefix="/resources",
    tags=["Resources"],
)

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
MAX_RESOURCE_SIZE = 25 * 1024 * 1024


@router.post("/upload", response_model=ResourceResponse)
def create_uploaded_resource(
    title: str = Form(...),
    description: str = Form(...),
    resource_type: str = Form(...),
    resource: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a local resource file for administrator review."""
    if current_user.role not in {"author", "admin"}:
        raise HTTPException(status_code=403, detail="You cannot create resources")
    content = resource.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_RESOURCE_SIZE:
        raise HTTPException(status_code=400, detail="Files must be 25 MB or smaller")
    extension = Path(resource.filename or "resource").suffix.lower()
    if not extension:
        raise HTTPException(status_code=400, detail="Please upload a file with an extension")
    UPLOAD_DIR.mkdir(exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    (UPLOAD_DIR / filename).write_bytes(content)
    item = Resource(title=title, description=description, resource_type=resource_type, url=f"/uploads/{filename}", downloadable=True, published=False, owner_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post(
    "/",
    response_model=ResourceResponse,
)
def create_resource(
    resource_data: ResourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {
        "author",
        "admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="You cannot create resources",
        )

    resource = Resource(
        title=resource_data.title,
        description=resource_data.description,
        resource_type=resource_data.resource_type,
        url=resource_data.url,
        downloadable=resource_data.downloadable,
        published=resource_data.published if current_user.role == "admin" else False,
        owner_id=current_user.id,
    )

    db.add(resource)
    db.commit()
    db.refresh(resource)

    return resource


@router.get(
    "/",
    response_model=list[ResourceResponse],
)
def get_resources(
    db: Session = Depends(get_db),
):
    result = db.execute(
        select(Resource)
        .where(
            Resource.published.is_(True),
        )
        .order_by(
            Resource.created_at.desc(),
        )
    )

    return result.scalars().all()


@router.get(
    "/search",
    response_model=list[ResourceResponse],
)
def search_resources(
    q: str,
    db: Session = Depends(get_db),
):
    search_term = f"%{q}%"

    result = db.execute(
        select(Resource)
        .where(
            Resource.published.is_(True),
            or_(
                Resource.title.ilike(search_term),
                Resource.description.ilike(
                    search_term,
                ),
            ),
        )
        .order_by(
            Resource.created_at.desc(),
        )
    )

    return result.scalars().all()


@router.get(
    "/type/{resource_type}",
    response_model=list[ResourceResponse],
)
def get_resources_by_type(
    resource_type: str,
    db: Session = Depends(get_db),
):
    result = db.execute(
        select(Resource)
        .where(
            Resource.resource_type == resource_type,
            Resource.published.is_(True),
        )
        .order_by(
            Resource.created_at.desc(),
        )
    )

    return result.scalars().all()


@router.put("/manage/{resource_id}", response_model=ResourceResponse)
def update_resource(resource_id: int, data: ResourceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    resource = db.get(Resource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if current_user.role != "admin" and resource.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot update this resource")
    for field, value in data.model_dump().items():
        if field != "published" or current_user.role == "admin":
            setattr(resource, field, value)
    if current_user.role != "admin":
        resource.published = False
    db.commit(); db.refresh(resource)
    return resource


@router.delete("/manage/{resource_id}")
def delete_resource(resource_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    resource = db.get(Resource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    if current_user.role != "admin" and resource.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot delete this resource")
    db.delete(resource); db.commit()
    return {"message": "Resource deleted"}


@router.get("/{resource_id}/download")
def download_resource(
    resource_id: int,
    db: Session = Depends(get_db),
):
    """Download a file uploaded through the resource manager."""
    resource = db.get(Resource, resource_id)
    if not resource or not resource.published:
        raise HTTPException(status_code=404, detail="Resource not found")

    uploaded_path = urlparse(resource.url).path
    if not uploaded_path.startswith("/uploads/"):
        raise HTTPException(status_code=400, detail="This resource is not an uploaded file")

    file_path = UPLOAD_DIR / Path(uploaded_path).name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Uploaded file not found")

    filename = f"{Path(resource.title).name or 'resource'}{file_path.suffix}"
    return FileResponse(file_path, filename=filename, content_disposition_type="attachment")
