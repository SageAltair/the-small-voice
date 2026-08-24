from pathlib import Path

from fastapi import FastAPI
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


Base.metadata.create_all(
    bind=engine,
)

migrate_legacy_schema()
ensure_admin_user()

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


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
    allow_origins=[
        "http://localhost:5173",
        "https://the-small-voice-frontend.onrender.com",
    ],
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


@app.get("/")
def root():
    return {
        "message": "Welcome to The Small Voice API",
        "version": "0.6.0",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
    }
