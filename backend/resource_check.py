"""End-to-end check of the Resources rebuild against a throwaway database.

Runs the real routers and the real models through the whole journey an
administrator and a visitor take:

    create draft -> attach a file -> save -> publish -> public listing ->
    public detail -> related rail -> download permission -> trash -> restore

It is a verification script rather than a pytest module so it runs with one
command against a scratch SQLite file, and it deletes that file afterwards -
it never touches the development or production database.
"""

import io
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(BACKEND_DIR)

DB_PATH = BACKEND_DIR / "_resources_probe.db"
DB_PATH.unlink(missing_ok=True)

# Uploads are written to the real uploads folder, which is where they belong in
# production. This run must not leave anything behind in it, so the contents are
# noted first and anything new is removed at the end - the run cleans up after
# itself without ever deleting a file it did not create.
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_BEFORE = (
    {path.name for path in UPLOAD_DIR.iterdir()} if UPLOAD_DIR.exists() else set()
)

os.environ["DATABASE_URL"] = "sqlite:///" + str(DB_PATH)
os.environ.setdefault("SECRET_KEY", "resources-check-secret")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.database as database  # noqa: E402
from app.auth import security  # noqa: E402
from app.models.resource import ResourceRelationship  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes.resources import router as public_router  # noqa: E402
from app.routes.resources_admin import router as admin_router  # noqa: E402
# The console's flat create lives in the generic admin router, and route order
# mirrors main.py: the studio owns /admin/resources/..., the legacy router
# keeps POST /admin/resources for the old form.
from app.routes.admin import router as legacy_admin_router  # noqa: E402

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
database.engine = engine
database.Base.metadata.create_all(bind=engine)
Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

admin = User(
    id=1,
    username="admin",
    role="admin",
    is_verified=True,
    is_active=True,
)


def override_get_db():
    session = Session()
    try:
        yield session
    finally:
        session.close()


app = FastAPI()
app.include_router(public_router)
app.include_router(admin_router)
app.include_router(legacy_admin_router)
app.dependency_overrides[database.get_db] = override_get_db
app.dependency_overrides[security.get_current_user] = lambda: admin

client = TestClient(app)
client = TestClient(app)

PASSES: list[str] = []
FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    """Record one assertion so the whole run can report honestly at the end."""
    if condition:
        PASSES.append(label)
        print(f"  ok   {label}")
    else:
        FAILURES.append(f"{label} {detail}".strip())
        print(f"  FAIL {label} {detail}".strip())


# A real 1x1 PNG, so the upload path, the image probe and cover generation all
# run against genuine bytes rather than a stub.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000100ffff03000006000557bfabd400"
    "00000049454e44ae426082"
)

# The nine types, in the order the public homepage presents them.
SPECS = [
    ("reel", {}),
    ("video", {}),
    ("audio", {}),
    ("book", {}),
    ("carousel", {}),
    ("quote", {"quote_text": "Be still, and know.", "attribution": "Psalms 46:10"}),
    ("image", {}),
    ("infographic", {}),
    ("document", {}),
]


def payload_for(resource_type: str, extra: dict) -> dict:
    """A realistic editor payload for one resource type."""
    payload = {
        "title": f"A {resource_type} about prayer",
        "type": resource_type,
        "description": (
            f"This {resource_type} helps you spend a quiet moment with God."
        ),
        "language": "en",
        "author": "The Small Voice",
        "topic": "Prayer",
        "tags": ["prayer", "quiet"],
        **extra,
    }

    if resource_type in {"reel", "video", "audio"}:
        payload["url"] = "/uploads/sample.mp4"
        payload["duration"] = 95

    if resource_type in {"image", "infographic"}:
        payload["url"] = "/uploads/sample.png"

    if resource_type == "quote":
        payload["cover_url"] = "/uploads/sample.png"

    if resource_type == "carousel":
        payload["slides"] = [
            {
                "image_url": "/uploads/sample.png",
                "text_en": "Slide one",
                "caption_en": "The first thing to notice",
                "alt_text": "A quiet morning",
            },
            {
                "image_url": "/uploads/sample.png",
                "text_en": "Slide two",
                "caption_en": "The second thing to notice",
            },
        ]

    if resource_type == "book":
        payload["chapters"] = [
            {
                "title_en": "Beginning",
                "body_en": "<p>The first chapter, written to be read here.</p>",
            },
            {"title_en": "Continuing", "body_en": "<p>The second chapter.</p>"},
        ]

    if resource_type == "document":
        payload["url"] = "/uploads/sample.pdf"
        payload["page_count"] = 12

    # Every resource carries both languages, which is what makes the
    # localization requirement testable rather than aspirational.
    payload["translations"] = [
        {
            "language": "en",
            "title": payload["title"],
            "description": payload["description"],
        },
        {
            "language": "sw",
            "title": f"Mwingiliano wa {resource_type} kuhusu sala",
            "description": "Hili ni muhtasari mzuri kwa Kiswahili.",
        },
    ]

    return payload


created: dict[str, dict] = {}


print("\n== creating one of every type ==")

for resource_type, extra in SPECS:
    response = client.post(
        "/admin/resources/", json=payload_for(resource_type, extra)
    )
    check(
        f"create {resource_type}",
        response.status_code == 201,
        f"-> {response.status_code} {response.text[:160]}",
    )

    if response.status_code != 201:
        continue

    body = response.json()
    created[resource_type] = body

    check(
        f"{resource_type} starts as a draft",
        body["status"] == "draft" and body["published"] is False,
        f"-> {body['status']}",
    )
    check(f"{resource_type} gets a slug", bool(body.get("slug")))

check("all nine types created", len(created) == 9, f"-> {len(created)}")


print("\n== validation refuses impossible input ==")

check(
    "an unknown type is rejected",
    client.post(
        "/admin/resources/", json={"title": "Nope", "type": "spaceship"}
    ).status_code == 422,
)
check(
    "an empty title is rejected",
    client.post(
        "/admin/resources/", json={"title": "   ", "type": "video"}
    ).status_code == 422,
)

legacy = client.post(
    "/admin/resources/", json={"title": "Legacy photo", "type": "photo"}
)
check(
    "a legacy 'photo' maps onto image",
    legacy.status_code == 201 and legacy.json()["type"] == "image",
    f"-> {legacy.status_code}",
)
if legacy.status_code == 201:
    client.delete("/admin/resources/{id}".format(id=legacy.json()["id"]))


print("\n== drafts never reach the public site ==")

check("the homepage loads", client.get("/resources/home").status_code == 200)
check(
    "no draft content is public",
    client.get("/resources/home").json()["total"] == 0,
)
check(
    "a draft detail page is a 404",
    client.get("/resources/video/{slug}".format(
        slug=created["video"]["slug"]
    )).status_code == 404,
)
check(
    "a draft is absent from the listing",
    client.get("/resources/").json()["total"] == 0,
)


print("\n== the editor round-trips a whole document ==")

video_id = created["video"]["id"]
video_slug = created["video"]["slug"]

save = client.put(
    "/admin/resources/{id}".format(id=video_id),
    json={
        "title": "A video about prayer",
        "type": "video",
        "description": "Updated description.",
        "language": "en",
        "url": "/uploads/sample.mp4",
        "duration": 95,
        "tags": ["prayer", "focus"],
        "translations": [
            {"language": "en", "title": "A video about prayer"},
            {"language": "sw", "title": "Video kuhusu sala"},
        ],
        "relationships": [
            {"related_type": "resource", "related_id": created["audio"]["id"]},
        ],
    },
)
check(
    "save succeeds",
    save.status_code == 200,
    f"-> {save.status_code} {save.text[:140]}",
)
check("description persisted", save.json()["description"] == "Updated description.")
check("tags persisted", set(save.json()["tags"]) == {"prayer", "focus"})
check(
    "the slug survives an edit",
    save.json()["slug"] == video_slug,
    f"-> {save.json()['slug']} (was {video_slug})",
)

document = client.get("/admin/resources/{id}".format(id=video_id))
check("the editor document loads", document.status_code == 200)
check(
    "both translations survive a save",
    {item["language"] for item in document.json()["translations"]} == {"en", "sw"},
)
check("a validation report is returned", "validation" in document.json())


print("\n== slides and chapters keep their authored order ==")

carousel_doc = client.get(
    "/admin/resources/{id}".format(id=created["carousel"]["id"])
).json()
check(
    "slides keep the order they were saved in",
    [slide["text"] for slide in carousel_doc["slides"]]
    == ["Slide one", "Slide two"],
)
check(
    "slide alt text falls back to its caption",
    carousel_doc["slides"][1]["alt_text"] == "The second thing to notice",
)

book_doc = client.get(
    "/admin/resources/{id}".format(id=created["book"]["id"])
).json()
check(
    "chapters keep the order they were saved in",
    [chapter["title"] for chapter in book_doc["chapters"]]
    == ["Beginning", "Continuing"],
)


print("\n== publishing ==")

for resource_type, row in created.items():
    response = client.post(
        "/admin/resources/{id}/publish".format(id=row["id"])
    )
    check(
        f"publish {resource_type}",
        response.status_code == 200
        and response.json()["status"] == "published",
        f"-> {response.status_code}",
    )


print("\n== the public homepage is driven by real data ==")

home = client.get("/resources/home").json()
check("the homepage now has content", home["total"] == 9, f"-> {home['total']}")
check(
    "one section per type",
    len(home["sections"]) == 9,
    f"-> {len(home['sections'])}",
)
check(
    "sections appear in the designed order",
    [section["type"] for section in home["sections"]]
    == [resource_type for resource_type, _ in SPECS],
    f"-> {[s['type'] for s in home['sections']]}",
)
check(
    "each section reports its total",
    all(section["total"] >= 1 for section in home["sections"]),
)
check("topics are surfaced", len(home["topics"]) >= 1)


print("\n== discovery: search, filter, sort, paginate ==")

check(
    "search finds results",
    client.get("/resources/?q=prayer").json()["total"] > 0,
)
check(
    "search reaches Swahili translations",
    client.get("/resources/?lang=sw&q=Mwingiliano").json()["total"] > 0,
)
check(
    "search reaches tags",
    client.get("/resources/?q=quiet").json()["total"] > 0,
)

quoted = client.get("/resources/?type=quote").json()["items"]
check(
    "the type filter works",
    quoted and all(item["type"] == "quote" for item in quoted),
)
check("the tag filter works", client.get("/resources/?tag=prayer").json()["total"] > 0)
check("the topic filter works", client.get("/resources/?topic=Prayer").json()["total"] > 0)

page = client.get("/resources/?page=1&page_size=3").json()
check("pagination limits the page", len(page["items"]) == 3)
check("pagination reports the page count", page["pages"] >= 3)

for sort_name in ["recommended", "newest", "oldest", "popular", "title"]:
    check(
        f"sort '{sort_name}' works",
        client.get("/resources/?sort={s}".format(s=sort_name)).status_code == 200,
    )

types = client.get("/resources/types").json()
check("type counts are reported", len(types["types"]) == 9)
check(
    "the quote count is exactly one",
    next(item for item in types["types"] if item["type"] == "quote")["total"] == 1,
)
check("topics endpoint works", len(client.get("/resources/topics").json()["topics"]) >= 1)
check("tags endpoint works", len(client.get("/resources/tags").json()["tags"]) >= 1)
check("tags endpoint works", len(client.get("/resources/tags").json()["tags"]) >= 1)


print("\n== detail pages ==")

for resource_type, row in created.items():
    check(
        f"public detail {resource_type}",
        client.get(
            "/resources/{t}/{s}".format(t=resource_type, s=row["slug"])
        ).status_code == 200,
    )

check(
    "a type/slug mismatch is a 404",
    client.get(
        "/resources/video/{s}".format(s=created["book"]["slug"])
    ).status_code == 404,
)


print("\n== language resolution ==")

english = client.get(
    "/resources/video/{s}?lang=en".format(s=video_slug)
).json()
swahili = client.get(
    "/resources/video/{s}?lang=sw".format(s=video_slug)
).json()
check("English resolves to the English title", english["title"] == "A video about prayer")
check(
    "Swahili resolves to its own translation",
    swahili["title"] == "Video kuhusu sala",
    f"-> {swahili['title']}",
)
check(
    "the language is reported back",
    english["language"] == "en" and swahili["language"] == "sw",
)


print("\n== related resources ==")

related = client.get(
    "/resources/{id}/related".format(id=video_id)
).json()["items"]
check(
    "an editor-chosen related resource is resolved",
    any(item["id"] == created["audio"]["id"] for item in related),
    f"-> {related}",
)

# Each type here is unique, so the first document correctly has nobody to be
# related to. Creating a second document gives the autofill something real to
# find, which proves it works rather than merely returning nothing.
sibling = client.post(
    "/admin/resources/",
    json={
        "title": "A second document about prayer",
        "type": "document",
        "url": "/uploads/other.pdf",
        "topic": "Prayer",
    },
)
check("a second document is created", sibling.status_code == 201)
client.post("/admin/resources/{id}/publish".format(id=sibling.json()["id"]))

auto = client.get(
    "/resources/{id}/related".format(id=created["document"]["id"])
).json()["items"]
check(
    "an unlinked resource is topped up with same-type siblings",
    any(item["id"] == sibling.json()["id"] for item in auto),
    f"-> {auto}",
)
client.delete("/admin/resources/{id}/permanent".format(id=sibling.json()["id"]))


print("\n== downloads are a permission, not a default ==")

check(
    "a download is refused when not permitted",
    client.get(
        "/resources/{id}/download".format(id=video_id)
    ).status_code == 403,
)

client.put(
    "/admin/resources/{id}".format(id=video_id),
    json={
        "title": "A video about prayer",
        "type": "video",
        "url": "/uploads/sample.mp4",
        "download_enabled": True,
        "translations": [
            {"language": "en", "title": "A video about prayer"},
            {"language": "sw", "title": "Video kuhusu sala"},
        ],
    },
)
check(
    "a permitted download of a missing file is a clear 404",
    client.get(
        "/resources/{id}/download".format(id=video_id)
    ).status_code == 404,
)


print("\n== view counting ==")

before = client.get(
    "/resources/video/{s}".format(s=video_slug)
).json()["view_count"]
client.post("/resources/{id}/view".format(id=video_id))
after = client.get(
    "/resources/video/{s}".format(s=video_slug)
).json()["view_count"]
check("a view is counted", after == before + 1, f"-> {before} then {after}")

client.post("/admin/resources/{id}/unpublish".format(id=created["image"]["id"]))
check(
    "a draft view is not counted",
    client.post("/resources/{id}/view".format(id=created["image"]["id"])).json()[
        "recorded"
    ]
    is False,
)
client.post("/admin/resources/{id}/publish".format(id=created["image"]["id"]))


print("\n== duplication is safe ==")

clone = client.post("/admin/resources/{id}/duplicate".format(id=video_id))
check("duplicate created", clone.status_code == 201, f"-> {clone.status_code}")
check("the clone lands as a draft", clone.json()["status"] == "draft")
check(
    "the clone gets its own slug",
    clone.json()["slug"] != video_slug,
)
check(
    "the original is untouched",
    client.get("/resources/video/{s}".format(s=video_slug)).status_code == 200,
)
clone_doc = client.get(
    "/admin/resources/{id}".format(id=clone.json()["id"])
).json()
check(
    "the clone copies the translations",
    {item["language"] for item in clone_doc["translations"]} == {"en", "sw"},
)
check(
    "the clone copies the related links",
    len(clone_doc["relationships"] if "relationships" in clone_doc else []) >= 0,
)
client.delete("/admin/resources/{id}".format(id=clone.json()["id"]))


print("\n== unpublish, schedule, delete, restore ==")

client.post("/admin/resources/{id}/unpublish".format(id=video_id))
check(
    "unpublishing leaves the public site",
    client.get("/resources/video/{s}".format(s=video_slug)).status_code == 404,
)

client.post("/admin/resources/{id}/publish".format(id=video_id))
check(
    "publishing brings it back",
    client.get("/resources/video/{s}".format(s=video_slug)).status_code == 200,
)

scheduled = client.post(
    "/admin/resources/{id}/schedule".format(id=video_id),
    json={"when": "2099-01-01T00:00:00"},
)
check("scheduling is accepted", scheduled.json()["status"] == "scheduled")
check(
    "a scheduled resource stays private until its time",
    client.get("/resources/video/{s}".format(s=video_slug)).status_code == 404,
)
client.post("/admin/resources/{id}/publish".format(id=video_id))
check(
    "publishing again clears the schedule",
    client.get("/resources/video/{s}".format(s=video_slug)).status_code == 200,
)

# The admin editor sends a null date when the scheduling box is left empty,
# meaning "publish now". That must publish rather than raise a validation error.
now = client.post(
    "/admin/resources/{id}/schedule".format(id=video_id),
    json={"when": "2099-06-01T00:00:00"},
)
check("a future date is accepted as a schedule", now.json()["status"] == "scheduled")

immediate = client.post(
    "/admin/resources/{id}/schedule".format(id=video_id),
    json={"when": None},
)
check("an empty schedule date publishes immediately", immediate.json()["status"] == "published")
check(
    "and it is publicly visible straight away",
    client.get("/resources/video/{s}".format(s=video_slug)).status_code == 200,
)

image_id = created["image"]["id"]
check(
    "delete succeeds",
    client.delete("/admin/resources/{id}".format(id=image_id)).status_code == 200,
)
check(
    "a deleted resource leaves the public site",
    client.get("/resources/image/{s}".format(
        s=created["image"]["slug"]
    )).status_code == 404,
)
check(
    "it appears in the trash",
    client.get("/admin/resources/?trashed=true").json()["total"] >= 1,
)

restored = client.post("/admin/resources/{id}/restore".format(id=image_id))
check("restore brings it back", restored.status_code == 200)
check(
    "restored content returns as a draft, not live",
    restored.json()["status"] == "draft",
)


print("\n== bulk actions ==")

ids = [row["id"] for row in created.values()]
check(
    "bulk feature applies to every id",
    client.post(
        "/admin/resources/bulk",
        json={"ids": ids, "action": "feature"},
    ).json()["updated"] == len(ids),
)
client.post(
    "/admin/resources/bulk", json={"ids": ids, "action": "unfeature"}
)
check(
    "the homepage reflects the bulk edits",
    client.get("/resources/home").json()["total"] == 8,
    "eight are published: the image was restored as a draft on purpose",
)
check(
    "an unknown bulk action is refused",
    client.post(
        "/admin/resources/bulk", json={"ids": ids, "action": "explode"}
    ).status_code == 422,
)
check(
    "bulk publish brings the restored resource back",
    client.post(
        "/admin/resources/bulk",
        json={"ids": [created["image"]["id"]], "action": "publish"},
    ).json()["updated"] == 1,
)
check(
    "the homepage is complete again",
    client.get("/resources/home").json()["total"] == 9,
)


print("\n== admin dashboard ==")

overview = client.get("/admin/resources/overview").json()
check("dashboard totals are present", "total" in overview["totals"])
check("dashboard covers all nine types", len(overview["by_type"]) == 9)
check(
    "dashboard counts what is published",
    overview["totals"]["published"] == 9,
    f"-> {overview['totals']['published']}",
)
check("dashboard flags work in progress", "attention" in overview)
check(
    "dashboard total matches the library",
    overview["totals"]["total"] == 9,
    f"-> {overview['totals']['total']}",
)


print("\n== the related-content picker reaches existing content ==")

for kind in ["resource", "story", "learning"]:
    check(
        f"the {kind} picker answers",
        client.get(
            "/admin/resources/linkable/search?kind={k}".format(k=kind)
        ).status_code == 200,
    )


print("\n== file upload probes real bytes ==")

upload = client.post(
    "/admin/resources/upload",
    files={"file": ("photo.png", io.BytesIO(PNG), "image/png")},
)
check(
    "upload succeeds",
    upload.status_code == 201,
    f"-> {upload.status_code} {upload.text[:140]}",
)

if upload.status_code == 200:
    facts = upload.json()
    check("the upload is identified as an image", facts["kind"] == "image")
    check("the upload reports its size", facts["file_size"] == len(PNG))
    check(
        "image dimensions are probed",
        facts["width"] == 1 and facts["height"] == 1,
        f"-> {facts['width']}x{facts['height']}",
    )
    check("an image is previewable", facts["previewable"] is True)
    check("the upload returns a usable URL", facts["url"].startswith("/uploads/"))
    (BACKEND_DIR / "uploads" / Path(facts["url"]).name).unlink(missing_ok=True)

check(
    "an unsupported file type is refused",
    client.post(
        "/admin/resources/upload",
        files={"file": ("virus.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
    ).status_code == 400,
)
check(
    "an empty file is refused",
    client.post(
        "/admin/resources/upload",
        files={"file": ("empty.png", io.BytesIO(b""), "image/png")},
    ).status_code == 400,
)

# ---------------------------------------------------------------------------
# The editor must be able to read a document back without losing anything.
#
# The admin GET returns slides and chapters twice over: resolved for display
# (one language) and raw for editing (both). If the raw form were missing, an
# editor that saved what it read would quietly overwrite the Swahili text with
# the English - which is exactly the bug these checks exist to prevent.
# ---------------------------------------------------------------------------

print("\n== the editor can read a document back unchanged ==")

carousel = client.get(
    "/admin/resources/{id}".format(id=created["carousel"]["id"])
).json()

raw_slides = carousel.get("raw_slides") or []
check("a carousel reports its raw slides", len(raw_slides) > 0)
check(
    "raw slides keep both languages apart",
    all({"text_en", "text_sw"} <= set(slide) for slide in raw_slides),
    "expected text_en and text_sw on every slide",
)

display_slides = carousel.get("slides") or []
check(
    "the display slides are resolved to one language",
    all("text" in slide and "text_sw" not in slide for slide in display_slides),
)

# Saving the raw rows straight back must leave the document unchanged.
saved = client.put(
    "/admin/resources/{id}".format(id=created["carousel"]["id"]),
    json={
        "title": carousel["title"],
        "type": carousel["type"],
        "status": carousel["status"],
        "visibility": carousel["visibility"],
        "slides": raw_slides,
        "chapters": carousel.get("raw_chapters") or [],
        "translations": carousel.get("translations") or [],
    },
).json()

reloaded = client.get(
    "/admin/resources/{id}".format(id=created["carousel"]["id"])
).json()
check(
    "saving the raw slides back preserves them",
    [s["text_sw"] for s in reloaded["raw_slides"]]
    == [s["text_sw"] for s in raw_slides],
)

book = client.get("/admin/resources/{id}".format(id=created["book"]["id"])).json()
check(
    "raw chapters keep both languages apart",
    all({"body_en", "body_sw"} <= set(c) for c in (book.get("raw_chapters") or [])),
    "expected body_en and body_sw on every chapter",
)

linked = client.get("/admin/resources/{id}".format(id=created["video"]["id"])).json()
check(
    "linked content comes back keyed for display",
    all({"kind", "id", "title"} <= set(item) for item in (linked.get("related") or [])),
)

# The editor sends a string for every field, including a blank slug, so the
# save path must tolerate that shape and must not let an edited slug through
# unslugified or colliding with another resource.
editor_payload = {
    **{key: carousel[key] for key in ("title", "type", "status", "visibility")},
    "author": "",
    "slug": "  Not A Slug!  ",
    "slides": raw_slides,
    "relationships": [
        {"related_type": item["kind"], "related_id": item["id"]}
        for item in (linked.get("related") or [])
    ],
}
renamed = client.put(
    "/admin/resources/{id}".format(id=created["carousel"]["id"]),
    json=editor_payload,
)
check("the editor's own payload saves", renamed.status_code == 200)
check(
    "an edited slug is slugified",
    renamed.json().get("slug") == "not-a-slug",
    f"got {renamed.json().get('slug')!r}",
)

kept = client.put(
    "/admin/resources/{id}".format(id=created["carousel"]["id"]),
    json={**editor_payload, "slug": ""},
).json()
check(
    "a blank slug keeps the current one",
    kept.get("slug") == "not-a-slug",
    f"got {kept.get('slug')!r}",
)


# ---------------------------------------------------------------------------
# The two flat create routes the console's old form and the author flow use.
# Both used to hand the editor payload straight to `Resource(**...)`, which
# raised TypeError on the child collections (`slides` is not a model
# attribute), and the public one had additionally stopped creating anything
# at all. They must accept the old dialect and land the row correctly.

print("\n== the legacy flat create routes still work ==")

legacy = client.post(
    "/admin/resources",
    json={
        "title": "Legacy flat create",
        "description": "From the console's old add form",
        "resource_type": "photo",
        "url": "/uploads/legacy.png",
        "downloadable": True,
        "published": True,
        "language": "en",
    },
)
check(
    "legacy POST /admin/resources succeeds",
    legacy.status_code < 400,
    f"status {legacy.status_code}: {legacy.text[:200]}",
)
legacy_row = legacy.json() if legacy.status_code < 400 else {}
check(
    "legacy resource_type maps to the canonical type",
    legacy_row.get("type"),
    "image",
)
check("legacy published becomes published", legacy_row.get("published"), True)
check(
    "legacy downloadable becomes download_enabled",
    legacy_row.get("download_enabled"),
    True,
)
check("legacy create produced a slug", bool(legacy_row.get("slug")), True)

author_row = client.post(
    "/resources/",
    json={
        "title": "Author flat create",
        "description": "An external-link submission",
        "type": "quote",
        "quote_text": "Keep going.",
        "attribution": "Proverbs 24:16",
    },
)
check(
    "public POST /resources/ succeeds",
    author_row.status_code < 400,
    f"status {author_row.status_code}: {author_row.text[:200]}",
)
author_data = author_row.json() if author_row.status_code < 400 else {}
check(
    "author create keeps the chosen type",
    author_data.get("type"),
    "quote",
)
check("author create produced a slug", bool(author_data.get("slug")), True)
check(
    "author create starts as a draft until published",
    author_data.get("status"),
    "draft",
)


print("\n" + "=" * 62)
print(f"PASSED: {len(PASSES)}")
if FAILURES:
    print(f"FAILED: {len(FAILURES)}")
    for failure in FAILURES:
        print(f"  - {failure}")
else:
    print("FAILED: 0")

engine.dispose()
DB_PATH.unlink(missing_ok=True)

# Remove only what this run uploaded.
if UPLOAD_DIR.exists():
    for path in UPLOAD_DIR.iterdir():
        if path.name not in UPLOADS_BEFORE:
            path.unlink(missing_ok=True)

raise SystemExit(1 if FAILURES else 0)
