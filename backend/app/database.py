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

    resources_exist = inspector.has_table("resources")

    resource_columns = set()
    if resources_exist:
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

        # ``get_columns`` results are cached on the inspector; drop them so the
        # migration loop below sees the schema as it is now.
        inspector.clear_cache()

    migrations = {
        "stories": {"owner_id": "INTEGER", "language": "VARCHAR(10) NOT NULL DEFAULT 'en'", "deleted_at": "TIMESTAMP"},
        "resources": {
            "owner_id": "INTEGER",
            "language": "VARCHAR(10) NOT NULL DEFAULT 'en'",
            "cover_url": "VARCHAR(500)",
            "deleted_at": "TIMESTAMP",
            # Rich resource model: one row can be a reel, video, audio file,
            # book, carousel, quote, image, infographic, or document.
            "type": "VARCHAR(30) NOT NULL DEFAULT 'document'",
            "slug": "VARCHAR(250)",
            "author": "VARCHAR(100)",
            "topic": "VARCHAR(100)",
            "status": "VARCHAR(20) NOT NULL DEFAULT 'draft'",
            "featured": "BOOLEAN NOT NULL DEFAULT FALSE",
            "homepage_visible": "BOOLEAN NOT NULL DEFAULT TRUE",
            "display_order": "INTEGER NOT NULL DEFAULT 0",
            "published_at": "TIMESTAMP",
            "scheduled_for": "TIMESTAMP",
            "download_enabled": "BOOLEAN NOT NULL DEFAULT FALSE",
            "share_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
            "save_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
            "updated_at": "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
        },
        "tags": {"owner_id": "INTEGER", "approved": "BOOLEAN NOT NULL DEFAULT TRUE", "language": "VARCHAR(10) NOT NULL DEFAULT 'en'", "deleted_at": "TIMESTAMP"},
        "users": {"deleted_at": "TIMESTAMP"},
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

        # ----------------------------
        # Resources: backfill the rich content model
        #
        # ``create_all`` cannot add columns to the legacy ``resources`` table,
        # so the new fields arrive above with safe defaults. Translate the old
        # ``resource_type`` values into the new ``type`` vocabulary and derive
        # status/download flags so existing content behaves as it did before.
        # ----------------------------
        if resources_exist:
            connection.execute(text(
                "UPDATE resources SET type = resource_type "
                "WHERE type = 'document' AND resource_type IN "
                "('reel', 'video', 'audio', 'book', 'carousel', 'quote', "
                "'infographic', 'document')"
            ))
            connection.execute(text(
                "UPDATE resources SET type = 'image' "
                "WHERE type = 'document' AND resource_type IN "
                "('photo', 'picture', 'gallery')"
            ))
            connection.execute(text(
                "UPDATE resources SET status = 'published', "
                "published_at = COALESCE(published_at, created_at) "
                "WHERE status = 'draft' AND published = TRUE"
            ))
            connection.execute(text(
                "UPDATE resources SET download_enabled = TRUE "
                "WHERE downloadable = TRUE"
            ))
            connection.execute(text(
                "UPDATE resources SET slug = 'resource-' || id "
                "WHERE slug IS NULL"
            ))
            connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_resources_slug "
                "ON resources (slug)"
            ))

    # ----------------------------
    # Users: email verification + Google sign-in columns
    # ----------------------------
    if inspector.has_table("users"):
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        with engine.begin() as connection:
            if "is_verified" not in user_columns:
                # New accounts are created with is_verified=False. Accounts that
                # existed before this feature are treated as already verified so
                # they keep working.
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE"
                ))
                connection.execute(text("UPDATE users SET is_verified = TRUE"))

            if "google_id" not in user_columns:
                connection.execute(text(
                    "ALTER TABLE users ADD COLUMN google_id VARCHAR(255)"
                ))
                connection.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id)"
                ))


def migrate_resource_schema():
    """Bring the existing ``resources`` table up to the publishing schema.

    ``create_all`` only creates missing tables - it never alters existing
    ones.  These columns were added to the Resource model after the table
    already existed in production, so each one is added here if absent.
    Every statement is idempotent and no existing data is modified or lost.
    """
    inspector = inspect(engine)

    if not inspector.has_table("resources"):
        return

    existing = {
        column["name"]
        for column in inspector.get_columns("resources")
    }

    additions = {
        "type": "VARCHAR(30) NOT NULL DEFAULT 'document'",
        "slug": "VARCHAR(250)",
        "author": "VARCHAR(100)",
        "topic": "VARCHAR(100)",
        "status": "VARCHAR(20) NOT NULL DEFAULT 'draft'",
        "featured": "BOOLEAN NOT NULL DEFAULT FALSE",
        "homepage_visible": "BOOLEAN NOT NULL DEFAULT TRUE",
        "display_order": "INTEGER NOT NULL DEFAULT 0",
        "published_at": "TIMESTAMP",
        "scheduled_for": "TIMESTAMP",
        "download_enabled": "BOOLEAN NOT NULL DEFAULT FALSE",
        "share_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
        "save_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
        "updated_at": "TIMESTAMP",
    }

    backfills = []
    if "status" not in existing and "published" in existing:
        backfills.append(
            "UPDATE resources SET status = "
            "CASE WHEN published THEN 'published' ELSE 'draft' END"
        )
    if "published_at" not in existing and "created_at" in existing:
        backfills.append(
            "UPDATE resources SET published_at = created_at "
            "WHERE published = TRUE"
        )
    if "type" not in existing and "resource_type" in existing:
        backfills.append("UPDATE resources SET type = resource_type")

    with engine.begin() as connection:
        for name, definition in additions.items():
            if name not in existing:
                connection.execute(
                    text(f"ALTER TABLE resources ADD COLUMN {name} {definition}")
                )
        for statement in backfills:
            connection.execute(text(statement))

        # The model declares slug as unique; mirror that for the live table.
        try:
            connection.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_resources_slug "
                "ON resources (slug)"
            ))
        except Exception:
            pass


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
                is_verified=True,
            ))
        else:
            admin.email = ADMIN_EMAIL
            admin.role = "admin"
            admin.is_active = True
            admin.is_verified = True
            if not verify_password(ADMIN_PASSWORD, admin.hashed_password):
                admin.hashed_password = hash_password(ADMIN_PASSWORD)
        db.commit()


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
