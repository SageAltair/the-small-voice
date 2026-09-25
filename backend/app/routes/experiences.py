"""Experience Builder API.

One source of truth for journeys, courses, learning paths, next steps and
interactive experiences. The editor document is stored in structured tables
rather than arbitrary HTML:

    Experience -> Step -> Element -> ElementAction
    Experience -> Connection (step-to-step / element-to-step navigation)
    Experience -> ExperienceVersion (version history)
    Experience -> UserProgress (learner progress)
"""

from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.experience import (
    Connection,
    Element,
    ElementAction,
    Experience,
    ExperienceTranslation,
    ExperienceVersion,
    Step,
    Template,
    UserProgress,
)
from app.models.user import User
from app.routes.users import get_current_user


router = APIRouter(prefix="/experiences", tags=["experiences"])

EXPERIENCE_TYPES = {"journey", "course", "learning_path", "next_step", "article", "interactive"}
EXPERIENCE_STATUSES = {"draft", "published", "unpublished"}
STEP_STATUSES = {"draft", "ready", "locked"}

# Guard rails for the freeform canvas. A page is allowed to be very large
# (endless/portrait formats) but not unbounded, so a single design can never
# grow into a multi-gigabyte JSON payload.
MIN_PAGE_DIMENSION = 200
MAX_PAGE_DIMENSION = 12000
MIN_ELEMENT_SIZE = 8
MAX_ELEMENT_SIZE = 20000


def normalize_page_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Coerce client page settings into a safe, storable shape.

    Anything the editor sends is untrusted: a stray value here would be written
    straight into the published document and later multiplied by the browser
    zoom, so every numeric field is clamped and every enum is validated.
    """

    def clamp(value, default, minimum, maximum):
        try:
            number = int(round(float(value)))
        except (TypeError, ValueError):
            return default
        return max(minimum, min(maximum, number))

    settings = raw or {}
    layout_mode = settings.get("layoutMode") or settings.get("layout_mode") or "fixed"
    if layout_mode not in {"fixed", "endless"}:
        layout_mode = "fixed"

    orientation = settings.get("orientation") or "portrait"
    if orientation not in {"portrait", "landscape", "square"}:
        orientation = "portrait"

    width = clamp(settings.get("width"), 1080, MIN_PAGE_DIMENSION, MAX_PAGE_DIMENSION)
    height = clamp(settings.get("height"), 1920, MIN_PAGE_DIMENSION, MAX_PAGE_DIMENSION)

    if orientation == "landscape" and height > width:
        width, height = height, width
    elif orientation == "portrait" and width > height:
        width, height = height, width

    return {
        "preset": str(settings.get("preset") or "custom")[:40],
        "width": width,
        "height": height,
        "orientation": orientation,
        "unit": "px",
        "layoutMode": layout_mode,
        "background": str(settings.get("background") or "#ffffff")[:64],
    }



def require_auth(user: User = Depends(get_current_user)) -> User:
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


# =====================================================================
# Serializers
# =====================================================================

def serialize_action(action: ElementAction) -> dict[str, Any]:
    return {
        "id": action.id,
        "element_id": action.element_id,
        "trigger": action.trigger,
        "action_type": action.action_type,
        "config": action.config or {},
        "condition": action.condition or {},
        "sort_order": action.sort_order,
    }

def serialize_element(element: Element) -> dict[str, Any]:
    return {
        "id": element.id,
        "element_uuid": element.element_uuid,
        "step_id": element.step_id,
        "element_type": element.element_type,
        "position": {"x": element.position_x, "y": element.position_y},
        "size": {"width": element.width, "height": element.height},
        "content": element.content or {},
        "style": element.style or {},
        "responsive": element.responsive or {},
        "is_visible": element.is_visible,
        "visibility_condition": element.visibility_condition or {},
        "is_locked": element.is_locked,
        "is_interactive": element.is_interactive,
        "accessibility": element.accessibility or {},
        "sort_order": element.sort_order,
        "z_index": element.z_index,
        "rotation": element.rotation,
        "parent_container_id": element.parent_container_id,
        "actions": [serialize_action(a) for a in element.actions],
    }


def serialize_connection(connection: Connection) -> dict[str, Any]:
    return {
        "id": connection.id,
        "source_step_id": connection.source_step_id,
        "source_element_id": connection.source_element_id,
        "target_step_id": connection.target_step_id,
        "target_element_id": connection.target_element_id,
        "label": connection.label,
        "sort_order": connection.sort_order,
        "created_at": iso(connection.created_at),
    }


def serialize_step(step: Step, include_elements: bool = True) -> dict[str, Any]:
    data = {
        "id": step.id,
        "experience_id": step.experience_id,
        "step_type": step.step_type,
        "title": step.title,
        "subtitle": step.subtitle,
        "sort_order": step.sort_order,
        "requires_previous": step.requires_previous,
        "prerequisites": step.prerequisites or [],
        "editor_label": step.editor_label,
        "step_status": step.step_status,
        "page_settings": step.page_settings or {},
        "created_at": iso(step.created_at),
        "updated_at": iso(step.updated_at),
    }
    if include_elements:
        data["elements"] = [serialize_element(e) for e in step.elements]
    return data


def serialize_experience(experience: Experience, db: Session, include_steps: bool = True) -> dict[str, Any]:
    data = {
        "id": experience.id,
        "title": experience.title,
        "slug": experience.slug,
        "description": experience.description,
        "experience_type": experience.experience_type,
        "status": experience.status,
        "language": experience.language,
        "theme": experience.theme or {},
        "assets": experience.assets or [],
        "version": experience.version,
        "display_order": experience.display_order,
        "created_at": iso(experience.created_at),
        "updated_at": iso(experience.updated_at),
        "published_at": iso(experience.published_at),
        "scheduled_for": iso(experience.scheduled_for),
        "owner_id": experience.owner_id,
    }
    if include_steps:
        data["steps"] = [serialize_step(s, include_elements=True) for s in experience.steps]
        data["connections"] = [serialize_connection(c) for c in experience.connections]
    return data


# =====================================================================
# Helper functions
# =====================================================================

def get_experience_or_404(db: Session, experience_id: int) -> Experience:
    experience = db.get(Experience, experience_id)
    if not experience:
        raise HTTPException(status_code=404, detail="Experience not found")
    return experience


def build_element(db: Session, step_id: int, data: dict[str, Any], index: int) -> Element:
    """Create an Element (and its actions) from a design-document payload.

    Accepts both the editor's flat shape (``x``/``y``) and the API's nested
    shape (``position``/``size``) so older saved designs keep loading.
    """
    position = data.get("position") or {}
    size = data.get("size") or {}
    actions = data.get("actions") or []

    def coordinate(value, fallback):
        try:
            return int(round(float(value)))
        except (TypeError, ValueError):
            return fallback

    def extent(value, fallback):
        try:
            return max(MIN_ELEMENT_SIZE, min(MAX_ELEMENT_SIZE, int(round(float(value)))))
        except (TypeError, ValueError):
            return fallback

    element = Element(
        step_id=step_id,
        element_type=data.get("type") or data.get("element_type") or "text",
        position_x=coordinate(data.get("x", position.get("x", 0)), 0),
        position_y=coordinate(data.get("y", position.get("y", 0)), 0),
        width=extent(data.get("width", size.get("width", 320)), 320),
        height=extent(data.get("height", size.get("height", 100)), 100),
        content=data.get("content") or {},
        style=data.get("style") or {},
        responsive=data.get("responsive") or {},
        is_visible=data.get("isVisible", data.get("is_visible", True)),
        visibility_condition=data.get("visibilityCondition") or data.get("visibility_condition") or {},
        is_locked=data.get("isLocked", data.get("is_locked", False)),
        is_interactive=data.get("isInteractive", data.get("is_interactive", False)),
        accessibility=data.get("accessibility") or {},
        sort_order=int(data.get("sortOrder", data.get("sort_order", index)) or index),
        z_index=int(data.get("zIndex", data.get("z_index", index)) or 0),
        rotation=float(data.get("rotation") or 0),
        parent_container_id=data.get("parentContainerId", data.get("parent_container_id")),
    )
    if data.get("element_uuid"):
        element.element_uuid = str(data["element_uuid"])

    db.add(element)
    db.flush()  # ElementAction requires the element ID.

    for order, action_data in enumerate(actions):
        db.add(ElementAction(
            element_id=element.id,
            trigger=action_data.get("trigger", "click"),
            action_type=action_data.get("action", action_data.get("action_type", "navigate")),
            config=action_data.get("config") or {},
            condition=action_data.get("condition") or {},
            sort_order=int(action_data.get("sortOrder", action_data.get("sort_order", order)) or order),
        ))

    return element


def unique_slug(db: Session, title: str, exclude_id: int | None = None) -> str:
    """Generate a unique slug for an experience."""
    base = title.lower().strip()
    base = "".join(c if c.isalnum() or c == " " else "" for c in base)
    base = "-".join(base.split())
    if not base:
        base = "experience"
    slug = base
    counter = 1
    while True:
        query = select(Experience).where(Experience.slug == f"{slug}-{counter:08d}")
        if exclude_id:
            query = query.where(Experience.id != exclude_id)
        existing = db.execute(query).scalar_one_or_none()
        if not existing:
            return f"{slug}-{counter:08d}"
        counter += 1


def create_version_snapshot(experience: Experience, db: Session, user_id: int | None, description: str):
    """Create a version snapshot for an experience."""
    version = ExperienceVersion(
        experience_id=experience.id,
        version_number=experience.version,
        data={
            "title": experience.title,
            "description": experience.description,
            "experience_type": experience.experience_type,
            "status": experience.status,
            "steps": [
                {
                    "step_type": s.step_type,
                    "title": s.title,
                    "subtitle": s.subtitle,
                    "sort_order": s.sort_order,
                    "elements": [
                        {
                            "element_type": e.element_type,
                            "position": {"x": e.position_x, "y": e.position_y},
                            "size": {"width": e.width, "height": e.height},
                            "content": e.content,
                            "style": e.style,
                            "is_visible": e.is_visible,
                            "is_locked": e.is_locked,
                            "is_interactive": e.is_interactive,
                            "sort_order": e.sort_order,
                            "parent_container_id": e.parent_container_id,
                            "actions": [
                                {
                                    "trigger": a.trigger,
                                    "action_type": a.action_type,
                                    "config": a.config,
                                    "condition": a.condition,
                                    "sort_order": a.sort_order,
                                }
                                for a in e.actions
                            ],
                        }
                        for e in s.elements
                    ],
                }
                for s in experience.steps
            ],
            "connections": [
                {
                    "source_step_id": c.source_step_id,
                    "source_element_id": c.source_element_id,
                    "target_step_id": c.target_step_id,
                    "target_element_id": c.target_element_id,
                    "label": c.label,
                    "sort_order": c.sort_order,
                }
                for c in experience.connections
            ],
        },
        change_description=description,
        created_by=user_id,
    )
    db.add(version)
    db.commit()
    return version


# =====================================================================
# Experience endpoints
# =====================================================================

@router.get("/")
def list_experiences(
    experience_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
        user: User = Depends(require_auth),
):
    """List experiences accessible to the current user."""
    query = select(Experience).where(Experience.deleted_at.is_(None))

    if experience_type and experience_type in EXPERIENCE_TYPES:
        query = query.where(Experience.experience_type == experience_type)

    if status and status in EXPERIENCE_STATUSES:
        query = query.where(Experience.status == status)

    query = query.order_by(Experience.display_order.asc(), Experience.created_at.desc())
    query = query.offset(offset).limit(limit)

    experiences = db.execute(query).scalars().all()
    return {
        "items": [serialize_experience(e, db, include_steps=False) for e in experiences],
        "total": db.execute(select(func.count()).select_from(query.subquery())).scalar(),
    }


@router.get("/public")
def list_public_experiences(
    experience_type: str | None = None,
    language: str = "en",
        db: Session = Depends(get_db),
):
    """List published experiences for public viewing."""
    query = select(Experience).where(
        Experience.status == "published",
        Experience.deleted_at.is_(None),
    )

    if experience_type and experience_type in EXPERIENCE_TYPES:
        query = query.where(Experience.experience_type == experience_type)

    query = query.order_by(Experience.display_order.asc(), Experience.created_at.desc()).limit(50)

    experiences = db.execute(query).scalars().all()
    return [serialize_experience(e, db, include_steps=True) for e in experiences]


@router.get("/public/{slug}")
def get_public_experience(slug: str, language: str = "en", db: Session = Depends(get_db)):
    """Get a published experience by slug for public viewing."""
    experience = db.execute(
        select(Experience).where(
            Experience.slug == slug,
            Experience.status == "published",
            Experience.deleted_at.is_(None),
            Experience.language == language,
        )
    ).scalar_one_or_none()

    if not experience:
        raise HTTPException(status_code=404, detail="Experience not found")

    return serialize_experience(experience, db, include_steps=True)


@router.get("/{experience_id}")
def get_experience(
    experience_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_auth),
):
    """Get an experience by ID."""
    experience = get_experience_or_404(db, experience_id)
    return serialize_experience(experience, db, include_steps=True)


@router.post("/", status_code=201)
def create_experience(
    title: str = Body(...),
    experience_type: str = Body("interactive"),
    description: str | None = Body(None),
    language: str = Body("en"),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Create a new experience."""
    if experience_type not in EXPERIENCE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid experience type: {experience_type}")

    experience = Experience(
        title=title[:250],
        description=description,
        experience_type=experience_type,
        language=language,
        theme={},
        status="draft",
        owner_id=user.id,
    )
    experience.generate_slug()

    db.add(experience)
    db.commit()
    db.refresh(experience)

    return serialize_experience(experience, db, include_steps=True)


@router.put("/{experience_id}")
def update_experience(
    experience_id: int,
    title: str | None = Body(None),
    description: str | None = Body(None),
    experience_type: str | None = Body(None),
    language: str | None = Body(None),
    theme: dict | None = Body(None),
    assets: list | None = Body(None),
    display_order: int | None = Body(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Update an experience."""
    experience = get_experience_or_404(db, experience_id)

    if title is not None:
        experience.title = title[:250]
    if description is not None:
        experience.description = description
    if experience_type is not None:
        if experience_type not in EXPERIENCE_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid experience type: {experience_type}")
        experience.experience_type = experience_type
    if language is not None:
        experience.language = language
    if theme is not None:
        experience.theme = theme
    if assets is not None:
        experience.assets = assets
    if display_order is not None:
        experience.display_order = display_order

    db.commit()
    db.refresh(experience)

    return serialize_experience(experience, db, include_steps=True)


@router.delete("/{experience_id}")
def delete_experience(
    experience_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Soft delete an experience."""
    experience = get_experience_or_404(db, experience_id)
    experience.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Experience deleted"}


# =====================================================================
# Publishing endpoints
# =====================================================================

@router.post("/{experience_id}/publish")
def publish_experience(
    experience_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Publish an experience."""
    experience = get_experience_or_404(db, experience_id)
    create_version_snapshot(experience, db, user.id, "Published")
    experience.status = "published"
    experience.published_at = datetime.utcnow()
    db.commit()
    db.refresh(experience)
    return serialize_experience(experience, db, include_steps=False)


@router.post("/{experience_id}/unpublish")
def unpublish_experience(
    experience_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Unpublish an experience."""
    experience = get_experience_or_404(db, experience_id)
    create_version_snapshot(experience, db, user.id, "Unpublished")
    experience.status = "unpublished"
    db.commit()
    db.refresh(experience)
    return serialize_experience(experience, db, include_steps=False)


# =====================================================================
# Step endpoints
# =====================================================================

@router.get("/{experience_id}/steps")
def list_steps(experience_id: int, db: Session = Depends(get_db), user: User = Depends(require_auth)):
    """List all steps for an experience."""
    experience = get_experience_or_404(db, experience_id)
    return [serialize_step(s, include_elements=True) for s in experience.steps]


@router.post("/{experience_id}/steps", status_code=201)
def create_step(
    experience_id: int,
    step_type: str = Body("lesson"),
    title: str | None = Body(None),
    subtitle: str | None = Body(None),
    requires_previous: bool = Body(False),
    page_settings: dict | None = Body(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Create a new step for an experience."""
    experience = get_experience_or_404(db, experience_id)

    if step_type not in {"lesson", "assessment", "transition", "final"}:
        raise HTTPException(status_code=400, detail=f"Invalid step type: {step_type}")

    max_order = db.execute(
        select(func.max(Step.sort_order)).where(Step.experience_id == experience_id)
    ).scalar() or 0

    step = Step(
        experience_id=experience_id,
        step_type=step_type,
        title=title or f"Step {max_order + 1}",
        subtitle=subtitle,
        sort_order=max_order + 1,
        requires_previous=requires_previous,
        step_status="draft",
        page_settings=page_settings or {},
    )

    db.add(step)
    db.commit()
    db.refresh(step)

    return serialize_step(step, include_elements=True)


@router.put("/steps/{step_id}")
def update_step(
    step_id: int,
    title: str | None = Body(None),
    subtitle: str | None = Body(None),
    step_type: str | None = Body(None),
    requires_previous: bool | None = Body(None),
    step_status: str | None = Body(None),
    page_settings: dict | None = Body(None),
    sort_order: int | None = Body(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Update a step."""
    step = db.get(Step, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    if title is not None:
        step.title = title[:250]
    if subtitle is not None:
        step.subtitle = subtitle
    if step_type is not None:
        if step_type not in {"lesson", "assessment", "transition", "final"}:
            raise HTTPException(status_code=400, detail=f"Invalid step type: {step_type}")
        step.step_type = step_type
    if requires_previous is not None:
        step.requires_previous = requires_previous
    if step_status is not None:
        if step_status not in STEP_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid step status: {step_status}")
        step.step_status = step_status
    if page_settings is not None:
        step.page_settings = page_settings
    if sort_order is not None:
        step.sort_order = sort_order

    db.commit()
    db.refresh(step)

    return serialize_step(step, include_elements=True)


@router.delete("/steps/{step_id}")
def delete_step(step_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Delete a step."""
    step = db.get(Step, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    db.delete(step)
    db.commit()
    return {"message": "Step deleted"}


# =====================================================================
# Element endpoints
# =====================================================================

@router.get("/steps/{step_id}/elements")
def list_elements(step_id: int, db: Session = Depends(get_db), user: User = Depends(require_auth)):
    """List all elements for a step."""
    step = db.get(Step, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    return [serialize_element(e) for e in step.elements]


@router.put("/steps/{step_id}/elements")
def batch_update_elements(
    step_id: int,
    elements: list[dict] = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Batch update elements for a step. Replaces all elements."""
    step = db.get(Step, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    # Remove existing elements through the ORM so their actions are deleted too.
    for existing_element in step.elements:
        db.delete(existing_element)
    db.flush()

    for index, element_data in enumerate(elements):
        build_element(db, step_id, element_data, index)

    db.commit()

    # Reload step with elements
    step = db.get(Step, step_id)
    return [serialize_element(e) for e in step.elements]


@router.post("/steps/{step_id}/elements", status_code=201)
def create_element(
    step_id: int,
    element_type: str = Body("text"),
    content: dict | None = Body(None),
    position: dict | None = Body(None),
    size: dict | None = Body(None),
    is_interactive: bool = Body(False),
    sort_order: int | None = Body(None),
    parent_container_id: int | None = Body(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Create a new element for a step."""
    step = db.get(Step, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    max_order = db.execute(
        select(func.max(Element.sort_order)).where(Element.step_id == step_id)
    ).scalar() or 0

    element = Element(
        step_id=step_id,
        element_type=element_type,
        position_x=position.get("x", 0) if position else 0,
        position_y=position.get("y", 0) if position else 0,
        width=size.get("width", 320) if size else 320,
        height=size.get("height", 100) if size else 100,
        content=content or {},
        style={},
        responsive={},
        is_visible=True,
        is_interactive=is_interactive,
        sort_order=sort_order or max_order + 1,
        parent_container_id=parent_container_id,
    )

    db.add(element)
    db.commit()
    db.refresh(element)

    return serialize_element(element)


# =====================================================================
# Connection endpoints
# =====================================================================

@router.get("/{experience_id}/connections")
def list_connections(experience_id: int, db: Session = Depends(get_db), user: User = Depends(require_auth)):
    """List all connections for an experience."""
    experience = get_experience_or_404(db, experience_id)
    return [serialize_connection(c) for c in experience.connections]


@router.post("/{experience_id}/connections", status_code=201)
def create_connection(
    experience_id: int,
    source_step_id: int = Body(...),
    target_step_id: int = Body(...),
    source_element_id: int | None = Body(None),
    target_element_id: int | None = Body(None),
    label: str | None = Body(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Create a connection between two steps."""
    experience = get_experience_or_404(db, experience_id)

    source_step = db.get(Step, source_step_id)
    target_step = db.get(Step, target_step_id)

    if not source_step or source_step.experience_id != experience_id:
        raise HTTPException(status_code=400, detail="Invalid source step")
    if not target_step or target_step.experience_id != experience_id:
        raise HTTPException(status_code=400, detail="Invalid target step")

    max_order = db.execute(
        select(func.max(Connection.sort_order)).where(Connection.experience_id == experience_id)
    ).scalar() or 0



# =====================================================================
# Whole-document save
# =====================================================================

@router.put("/{experience_id}/document")
def save_document(
    experience_id: int,
    pages: list[dict] = Body(...),
    connections: list[dict] = Body(None),
    assets: list | None = Body(None),
    title: str | None = Body(None),
    description: str | None = Body(None),
    theme: dict | None = Body(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Persist the entire editor document in one transaction.

    The freeform canvas keeps page dimensions, element geometry, rotation and
    z-order in local state. Saving the whole document in a single request means
    an autosave either applies completely or not at all - there is no window in
    which a refresh would show a half-saved design.
    """
    experience = get_experience_or_404(db, experience_id)

    if title is not None:
        experience.title = str(title)[:250]
    if description is not None:
        experience.description = description
    if theme is not None:
        experience.theme = theme
    if assets is not None:
        experience.assets = assets

    try:
        kept_step_ids: list[int] = []

        for order, page in enumerate(pages):
            step_id = page.get("id")
            step = db.get(Step, step_id) if step_id else None

            if step and step.experience_id != experience.id:
                step = None

            if step is None:
                step = Step(experience_id=experience.id)
                db.add(step)

            step.title = str(page.get("title") or page.get("name") or f"Page {order + 1}")[:250]
            step.editor_label = str(page.get("title") or page.get("name") or f"Page {order + 1}")[:100]
            step.step_type = page.get("stepType") or page.get("step_type") or "lesson"
            step.sort_order = order
            step.page_settings = normalize_page_settings(page.get("pageSettings") or page.get("page_settings") or {})

            # Replace the element set wholesale so removals persist too.
            for existing in list(step.elements):
                db.delete(existing)
            db.flush()

            for index, element_data in enumerate(page.get("elements") or []):
                build_element(db, step.id, element_data, index)

            kept_step_ids.append(step.id)

        for existing_step in list(experience.steps):
            if existing_step.id not in kept_step_ids:
                db.delete(existing_step)
        db.flush()

        if connections is not None:
            for existing in list(experience.connections):
                db.delete(existing)
            db.flush()

            for order, link in enumerate(connections):
                db.add(Connection(
                    experience_id=experience.id,
                    source_step_id=link.get("sourceStepId"),
                    source_element_id=link.get("sourceElementId"),
                    target_step_id=link.get("targetStepId"),
                    target_element_id=link.get("targetElementId"),
                    label=link.get("label"),
                    sort_order=order,
                ))

        db.commit()
    except Exception as exc:  # pragma: no cover - defensive
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not save design: {exc}") from exc

    db.expire_all()
    experience = get_experience_or_404(db, experience_id)
    return serialize_experience(experience, db, include_steps=True)


# =====================================================================
# Media assets
# =====================================================================

@router.post("/assets", status_code=201)
def upload_asset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Store an image uploaded from the builder and return its public URL.

    The design document only stores the resulting ``url`` plus a light
    description, so raw image bytes never live inside the saved JSON.
    """
    allowed = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
    }
    content_type = (file.content_type or "").lower()
    if content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use PNG, JPG, WEBP, GIF or SVG.",
        )

    upload_dir = Path(__file__).resolve().parents[2] / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    extension = allowed[content_type]
    asset_id = uuid4().hex
    filename = f"builder-{asset_id}{extension}"
    destination = upload_dir / filename

    try:
        payload = file.file.read()
    finally:
        file.file.close()

    if len(payload) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image is larger than 12 MB.")

    destination.write_bytes(payload)

    return {
        "assetId": asset_id,
        "url": f"/uploads/{filename}",
        "name": file.filename or filename,
        "mime": content_type,
        "size": len(payload),
    }

    connection = Connection(
        experience_id=experience_id,
        source_step_id=source_step_id,
        source_element_id=source_element_id,
        target_step_id=target_step_id,
        target_element_id=target_element_id,
        label=label,
        sort_order=max_order + 1,
    )

    db.add(connection)
    db.commit()
    db.refresh(connection)

    return serialize_connection(connection)


@router.delete("/connections/{connection_id}")
def delete_connection(connection_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Delete a connection."""
    connection = db.get(Connection, connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    db.delete(connection)
    db.commit()
    return {"message": "Connection deleted"}