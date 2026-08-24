from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine, ensure_admin_user, migrate_legacy_schema

from app.models.resource import Resource
from app.models.story import Story
from app.models.story_tag import story_tags
from app.models.tag import Tag
from app.models.user import User
from app.models.newsletter import NewsletterSubscription

from app.routes.resources import router as resources_router
from app.routes.stories import router as stories_router
from app.routes.tags import router as tags_router
from app.routes.users import router as users_router
from app.routes.admin import router as admin_router
from app.routes.newsletter import router as newsletter_router
from app.config import FRONTEND_ORIGINS


Base.metadata.create_all(
    bind=engine,
)

migrate_legacy_schema()
ensure_admin_user()

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
FRONTEND_DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"
FRONTEND_INDEX_FILE = FRONTEND_DIST_DIR / "index.html"


app = FastAPI(
    title="The Small Voice API",
    description=(
        "A platform helping people move "
        "from stories to learning, growth, "
        "community, and mission."
    ),
    version="0.6.0",
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in FRONTEND_ORIGINS.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(admin_router)
app.include_router(newsletter_router)
app.include_router(stories_router)
app.include_router(tags_router)
app.include_router(resources_router)


@app.get("/", include_in_schema=False)
def root():
    if FRONTEND_INDEX_FILE.is_file():
        return FileResponse(FRONTEND_INDEX_FILE)
    return {
        "message": "Welcome to The Small Voice API",
        "version": "0.6.0",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
    }


@app.get("/{frontend_path:path}", include_in_schema=False)
def serve_frontend(frontend_path: str):
    """Serve the React single-page app, including client-side dashboard routes."""
    requested_file = (FRONTEND_DIST_DIR / frontend_path).resolve()
    if FRONTEND_DIST_DIR.exists() and requested_file.is_relative_to(FRONTEND_DIST_DIR.resolve()) and requested_file.is_file():
        return FileResponse(requested_file)
    if FRONTEND_INDEX_FILE.is_file():
        return FileResponse(FRONTEND_INDEX_FILE)
    return {"detail": "Frontend build not found. Run npm run build in the frontend directory."}
