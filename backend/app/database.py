from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATABASE_URL


engine = create_engine(
    DATABASE_URL,
)


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


def migrate_legacy_schema():
    inspector = inspect(engine)

    if not inspector.has_table("stories"):
        return

    columns = {
        column["name"]
        for column in inspector.get_columns("stories")
    }

    with engine.begin() as connection:
        if "slug" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE stories "
                    "ADD COLUMN slug VARCHAR(250)"
                )
            )

        if "likes_count" not in columns:
            connection.execute(text("ALTER TABLE stories ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0"))

        if "featured" not in columns:
            connection.execute(text("ALTER TABLE stories ADD COLUMN featured BOOLEAN NOT NULL DEFAULT FALSE"))
            connection.execute(text("UPDATE stories SET slug = 'story-' || id WHERE slug IS NULL"))
            connection.execute(text("ALTER TABLE stories ALTER COLUMN slug SET NOT NULL"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_stories_slug ON stories (slug)"))

        if "content" not in columns:
            connection.execute(text("ALTER TABLE stories ADD COLUMN content TEXT"))
            connection.execute(text("UPDATE stories SET content = description WHERE content IS NULL"))
            connection.execute(text("ALTER TABLE stories ALTER COLUMN content SET NOT NULL"))

        if "image_url" not in columns:
            connection.execute(text("ALTER TABLE stories ADD COLUMN image_url VARCHAR(500)"))

        if "published" not in columns:
            connection.execute(text("ALTER TABLE stories ADD COLUMN published BOOLEAN NOT NULL DEFAULT TRUE"))

        if "created_at" not in columns:
            connection.execute(text("ALTER TABLE stories ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"))

        if "published_at" not in columns:
            connection.execute(text("ALTER TABLE stories ADD COLUMN published_at TIMESTAMP"))
            connection.execute(text("UPDATE stories SET published_at = created_at WHERE published = TRUE"))

    resource_columns = set()
    if inspector.has_table("resources"):
        resource_columns = {
            column["name"]
            for column in inspector.get_columns("resources")
        }

    if "carousel_urls" not in resource_columns:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE resources ADD COLUMN carousel_urls JSON NOT NULL "
                    "DEFAULT '[]'"
                )
            )

    migrations = {
        "stories": {"owner_id": "INTEGER"},
        "resources": {"owner_id": "INTEGER"},
        "tags": {"owner_id": "INTEGER", "approved": "BOOLEAN NOT NULL DEFAULT TRUE"},
    }
    with engine.begin() as connection:
        for table, additions in migrations.items():
            if not inspector.has_table(table):
                continue
            columns = {column["name"] for column in inspector.get_columns(table)}
            for name, definition in additions.items():
                if name not in columns:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))

        # Existing content is trusted; link old stories to matching accounts.
        connection.execute(text(
            "UPDATE stories SET owner_id = users.id FROM users "
            "WHERE stories.owner_id IS NULL AND stories.author = users.username"
        ))


def ensure_admin_user():
    from app.auth.security import hash_password, verify_password
    from app.config import ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME
    from app.models.user import User

    with SessionLocal() as db:
        admin = db.execute(
            select(User).where(User.username == ADMIN_USERNAME)
        ).scalar_one_or_none()
        if not admin:
            db.add(User(
                username=ADMIN_USERNAME,
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                role="admin",
            ))
        else:
            admin.email = ADMIN_EMAIL
            admin.role = "admin"
            admin.is_active = True
            if not verify_password(ADMIN_PASSWORD, admin.hashed_password):
                admin.hashed_password = hash_password(ADMIN_PASSWORD)
        db.commit()


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
