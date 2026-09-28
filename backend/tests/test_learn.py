"""Test suite for the Learn feature (models, validation, public & admin APIs)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.security import create_access_token, hash_password
from app.database import Base, get_db
from app.learn_content import (
    BLOCK_TYPES,
    LANGUAGES,
    lesson_validation,
    normalize_block_config,
    normalize_block_data,
    path_validation,
)
from app.main import app
from app.models.learn import (
    LearnCategory,
    LearnCategoryTranslation,
    LearnLesson,
    LearnLessonBlock,
    LearnLessonBlockTranslation,
    LearnLessonProgress,
    LearnLessonTranslation,
    LearnPath,
    LearnPathProgress,
    LearnPathTranslation,
)
from app.models.user import User


@pytest.fixture(scope="function")
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def admin_user(db_session) -> User:
    user = User(
        username="testadmin",
        email="testadmin@example.com",
        hashed_password=hash_password("adminpass123"),
        role="admin",
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def regular_user(db_session) -> User:
    user = User(
        username="learner1",
        email="learner1@example.com",
        hashed_password=hash_password("pass1234"),
        role="member",
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def admin_headers(admin_user) -> dict[str, str]:
    token = create_access_token({"sub": str(admin_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def learner_headers(regular_user) -> dict[str, str]:
    token = create_access_token({"sub": str(regular_user.id)})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

def test_block_types_catalog_has_all_expected_types():
    assert "text" in BLOCK_TYPES
    assert "scripture" in BLOCK_TYPES
    assert "quiz" in BLOCK_TYPES
    assert "practice" in BLOCK_TYPES
    assert "prayer" in BLOCK_TYPES
    assert "story" in BLOCK_TYPES
    assert "resource" in BLOCK_TYPES
    assert len(BLOCK_TYPES) >= 12


def test_normalize_block_data_cleans_fields():
    cleaned = normalize_block_data(
        "text",
        {"text": "  Faith Basics  ", "notes": "ignore me"},
    )
    assert cleaned["text"] == "Faith Basics"
    assert "notes" not in cleaned


def test_normalize_block_config_cleans_values():
    config = normalize_block_config(
        "quiz",
        {"correct_index": "2", "bogus": "val"},
    )
    assert config["correct_index"] == 2
    assert "bogus" not in config


def test_path_validation_rules():
    # Missing title entirely -> error
    result = path_validation(
        language="en",
        translations={"en": {"title": "", "description": ""}},
        lessons=[],
        has_cover=False,
        estimated_minutes=0,
    )
    assert not result["ready"]
    assert any(err["code"] == "title_missing" for err in result["errors"])
    assert any(err["code"] == "no_lessons" for err in result["errors"])

    # Complete path with lessons -> ready
    result_ready = path_validation(
        language="en",
        translations={"en": {"title": "Path 1", "description": "Desc"}},
        lessons=[{"position": 0, "status": "published", "translations": {"en": {"title": "Lesson 1"}}}],
        has_cover=True,
        estimated_minutes=15,
    )
    assert result_ready["ready"]
    assert len(result_ready["errors"]) == 0


# ---------------------------------------------------------------------------
# Public router tests
# ---------------------------------------------------------------------------

def test_public_learn_home_empty(client):
    res = client.get("/learn/home?lang=en")
    assert res.status_code == 200
    data = res.json()
    assert "paths" in data
    assert "categories" in data
    assert data["paths"] == []


def test_public_language_isolation(client, db_session, admin_user):
    category = LearnCategory(slug="foundations", status="published")
    db_session.add(category)
    db_session.flush()
    db_session.add(LearnCategoryTranslation(
        category_id=category.id, language="en", name="Foundations"
    ))
    db_session.add(LearnCategoryTranslation(
        category_id=category.id, language="sw", name="Misingi"
    ))

    path = LearnPath(
        slug="hearing-god",
        category_id=category.id,
        status="published",
        language="en",
        owner_id=admin_user.id,
    )
    db_session.add(path)
    db_session.flush()

    db_session.add(LearnPathTranslation(
        path_id=path.id, language="en", title="Hearing God", description="English desc"
    ))
    db_session.add(LearnPathTranslation(
        path_id=path.id, language="sw", title="Kusikia Mungu", description="Maelezo ya Kiswahili"
    ))
    db_session.commit()

    res_en = client.get("/learn/home?lang=en")
    assert res_en.status_code == 200
    en_path = res_en.json()["paths"][0]
    assert en_path["title"] == "Hearing God"
    assert en_path["category"]["name"] == "Foundations"

    res_sw = client.get("/learn/home?lang=sw")
    assert res_sw.status_code == 200
    sw_path = res_sw.json()["paths"][0]
    assert sw_path["title"] == "Kusikia Mungu"
    assert sw_path["category"]["name"] == "Misingi"


def test_lesson_full_runner_and_bilingual_blocks(client, db_session, admin_user):
    path = LearnPath(slug="prayer-walk", status="published", owner_id=admin_user.id)
    db_session.add(path)
    db_session.flush()
    db_session.add(LearnPathTranslation(path_id=path.id, language="en", title="Prayer Walk"))
    db_session.add(LearnPathTranslation(path_id=path.id, language="sw", title="Matembezi ya Maombi"))

    lesson = LearnLesson(path_id=path.id, slug="first-steps", position=0, status="published")
    db_session.add(lesson)
    db_session.flush()
    db_session.add(LearnLessonTranslation(lesson_id=lesson.id, language="en", title="First Steps"))
    db_session.add(LearnLessonTranslation(lesson_id=lesson.id, language="sw", title="Hatua za Kwanza"))

    block = LearnLessonBlock(lesson_id=lesson.id, block_type="text", position=0)
    db_session.add(block)
    db_session.flush()
    db_session.add(LearnLessonBlockTranslation(
        block_id=block.id, language="en", data={"text": "Listen closely"}
    ))
    db_session.add(LearnLessonBlockTranslation(
        block_id=block.id, language="sw", data={"text": "Sikiliza kwa makini"}
    ))
    db_session.commit()

    res_en = client.get(f"/learn/lessons/{lesson.id}?lang=en")
    assert res_en.status_code == 200
    data_en = res_en.json()
    assert data_en["lesson"]["title"] == "First Steps"
    assert data_en["lesson"]["blocks"][0]["data"]["text"] == "Listen closely"

    res_sw = client.get(f"/learn/lessons/{lesson.id}?lang=sw")
    assert res_sw.status_code == 200
    data_sw = res_sw.json()
    assert data_sw["lesson"]["title"] == "Hatua za Kwanza"
    assert data_sw["lesson"]["blocks"][0]["data"]["text"] == "Sikiliza kwa makini"


def test_progress_recording_for_anonymous_and_authenticated(
    client, db_session, admin_user, regular_user, learner_headers
):
    path = LearnPath(slug="discipleship", status="published", owner_id=admin_user.id)
    db_session.add(path)
    db_session.flush()
    lesson = LearnLesson(path_id=path.id, slug="intro", position=0, status="published")
    db_session.add(lesson)
    db_session.commit()

    client_token = "anon-device-12345"
    anon_headers = {"X-Learn-Client": client_token}
    res_anon = client.post(
        f"/learn/lessons/{lesson.id}/progress",
        json={"status": "completed", "answers": {"q1": 0}},
        headers=anon_headers,
    )
    assert res_anon.status_code == 200
    assert res_anon.json()["status"] == "completed"

    res_merge = client.post(
        "/learn/progress/merge",
        params={"client_token": client_token},
        headers=learner_headers,
    )
    assert res_merge.status_code == 200
    assert res_merge.json()["merged"] >= 1

    res_user_prog = client.get("/learn/progress/my", headers=learner_headers)
    assert res_user_prog.status_code == 200
    assert lesson.id in res_user_prog.json()["completed_lesson_ids"]


# ---------------------------------------------------------------------------
# Admin API: CRUD, publishing guardrails, overview
# ---------------------------------------------------------------------------

def test_admin_requires_authentication(client):
    res = client.get("/admin/learn/overview")
    assert res.status_code in (401, 403)


def test_admin_path_crud_and_publishing_guardrails(client, admin_headers):
    cat_res = client.post(
        "/admin/learn/categories",
        json={
            "slug": "bible",
            "translations": {
                "en": {"name": "Bible Study", "description": "Word of God"},
                "sw": {"name": "Kujifunza Biblia", "description": "Neno la Mungu"},
            },
        },
        headers=admin_headers,
    )
    assert cat_res.status_code == 201
    cat_id = cat_res.json()["id"]

    path_res = client.post(
        "/admin/learn/paths",
        json={"title": "Walking with Jesus", "slug": "walking-with-jesus", "language": "en"},
        headers=admin_headers,
    )
    assert path_res.status_code == 201
    path_doc = path_res.json()
    path_id = path_doc["path"]["id"]
    assert path_doc["path"]["status"] == "draft"

    # Try publishing path without required lessons -> MUST FAIL 422
    pub_res = client.post(f"/admin/learn/paths/{path_id}/publish", headers=admin_headers)
    assert pub_res.status_code == 422
    detail = pub_res.json()["detail"]
    assert detail["code"] == "validation_failed"
    assert {error["code"] for error in detail["errors"]} >= {"no_lessons"}

    # Create a lesson in this path
    lesson_res = client.post(
        f"/admin/learn/paths/{path_id}/lessons",
        json={"title": "Day 1", "language": "en"},
        headers=admin_headers,
    )
    assert lesson_res.status_code == 201
    lesson_id = lesson_res.json()["lesson"]["id"]

    # Save full bilingual lesson with valid blocks
    save_lesson_res = client.put(
        f"/admin/learn/lessons/{lesson_id}",
        json={
            "lesson": {"slug": "day-1", "estimated_minutes": 10},
            "translations": {
                "en": {"title": "Day 1: Call", "description": "Hear the call"},
                "sw": {"title": "Siku ya 1: Wito", "description": "Sikia wito"},
            },
            "blocks": [
                {
                    "block_type": "text",
                    "position": 0,
                    "config": {},
                    "translations": {
                        "en": {"data": {"text": "He calls you."}},
                        "sw": {"data": {"text": "Anakuita."}},
                    },
                },
                {
                    "block_type": "practice",
                    "position": 1,
                    "config": {},
                    "translations": {
                        "en": {"data": {"title": "Prayer", "instructions": "Pray for 5 minutes"}},
                        "sw": {"data": {"title": "Ombi", "instructions": "Omba kwa dakika 5"}},
                    },
                },
            ],
        },
        headers=admin_headers,
    )
    assert save_lesson_res.status_code == 200

    # Publish lesson
    pub_lesson = client.post(f"/admin/learn/lessons/{lesson_id}/publish", headers=admin_headers)
    assert pub_lesson.status_code == 200
    assert pub_lesson.json()["lesson"]["status"] == "published"

    # Fulfill the path's requirements (add category, Swahili translation)
    save_path_res = client.put(
        f"/admin/learn/paths/{path_id}",
        json={
            "path": {"category_id": cat_id, "cover_url": "https://example.com/cover.jpg"},
            "translations": {
                "en": {"title": "Walking with Jesus", "description": "Daily discipleship path"},
                "sw": {"title": "Kutembea na Yesu", "description": "Njia ya kila siku ya uanafunzi"},
            },
        },
        headers=admin_headers,
    )
    assert save_path_res.status_code == 200

    # Publishing path must succeed now!
    pub_path_ok = client.post(f"/admin/learn/paths/{path_id}/publish", headers=admin_headers)
    assert pub_path_ok.status_code == 200
    assert pub_path_ok.json()["path"]["status"] == "published"

    # Check overview analytics include this path and lesson
    overview_res = client.get("/admin/learn/overview", headers=admin_headers)
    assert overview_res.status_code == 200
    overview_data = overview_res.json()
    assert overview_data["totals"]["published_paths"] >= 1
    assert overview_data["totals"]["published_lessons"] >= 1


def test_admin_duplicate_path_and_lessons(client, admin_headers):
    path = client.post(
        "/admin/learn/paths",
        json={"title": "Original Path", "language": "en"},
        headers=admin_headers,
    ).json()["path"]

    lesson = client.post(
        f"/admin/learn/paths/{path['id']}/lessons",
        json={"title": "Original Lesson", "language": "en"},
        headers=admin_headers,
    ).json()["lesson"]

    clone_res = client.post(f"/admin/learn/paths/{path['id']}/duplicate", headers=admin_headers)
    assert clone_res.status_code == 201
    clone = clone_res.json()
    assert clone["path"]["id"] != path["id"]
    assert "copy" in clone["path"]["slug"]
    assert clone["path"]["status"] == "draft"
    assert len(clone["lessons"]) == 1
    assert clone["lessons"][0]["id"] != lesson["id"]
    assert clone["lessons"][0]["translations"]["en"]["title"] == "Original Lesson"


def test_admin_lesson_builder_document_round_trip(client, admin_headers):
    """The lesson builder's own document survives a save, a reorder, and publishing.

    The visual builder sends one document - metadata, both translations, and the
    whole ordered block list - and then renders what comes back, so this covers
    what an author leans on: the quiz's answers and correct index, an uploaded
    image path the API must keep, an unsafe link it must drop, and a reorder that
    moves rows instead of recreating them.
    """
    path = client.post(
        "/admin/learn/paths",
        json={"title": "Builder Path", "language": "en"},
        headers=admin_headers,
    ).json()["path"]
    lesson_id = client.post(
        f"/admin/learn/paths/{path['id']}/lessons",
        json={"title": "Builder Lesson", "language": "en"},
        headers=admin_headers,
    ).json()["lesson"]["id"]

    def text_block(text_en, text_sw):
        return {
            "id": None,
            "block_type": "text",
            "section": "understand",
            "config": {},
            "translations": {
                "en": {"data": {"text": text_en}},
                "sw": {"data": {"text": text_sw}},
            },
        }

    def image_block(url):
        return {
            "id": None,
            "block_type": "image",
            "section": "see",
            "config": {"url": url},
            "translations": {
                "en": {"data": {"alt": "A lamp", "caption": "A lamp for the path"}},
                "sw": {"data": {"alt": "Taa", "caption": "Taa kwa njia"}},
            },
        }

    quiz = {
        "id": None,
        "block_type": "quiz",
        "section": "reflect",
        "config": {"correct_index": 2},
        "translations": {
            "en": {
                "data": {
                    "question": "Who calls you by name?",
                    "options": ["Nobody", "An angel", "Jesus"],
                    "explanation": "He calls each of us by name.",
                }
            },
            "sw": {
                "data": {
                    "question": "Nani anakuita kwa jina?",
                    "options": ["Hakuna", "Malaika", "Yesu"],
                    "explanation": "Anaita kila mmoja wetu kwa jina.",
                }
            },
        },
    }
    callout = {
        "id": None,
        "block_type": "callout",
        "section": "understand",
        "config": {"tone": "warning"},
        "translations": {
            "en": {"data": {"title": "Slow down", "text": "Answer slowly."}},
            "sw": {"data": {"title": "Pole pole", "text": "Jibu kwa pole."}},
        },
    }
    divider = {
        "id": None,
        "block_type": "divider",
        "section": "understand",
        "config": {},
        "translations": {},
    }

    payload = {
        "lesson": {"slug": "called-by-name", "estimated_minutes": 8},
        "translations": {
            "en": {
                "title": "Called by name",
                "summary": "A short lesson on hearing Jesus call you.",
                "objective_before": "Feeling unnoticed.",
                "objective_after": "Knowing you are called by name.",
                "objective_action": "Say your own name out loud in prayer.",
                "next_step": "Read John 10 this week.",
                "completion_message": "Well done - keep listening.",
            },
            "sw": {
                "title": "Kuitwa kwa jina",
                "summary": "Somo fupi la kusikia Yesu akikuita.",
                "objective_before": "Kujisikia kupuuzwa.",
                "objective_after": "Kujua unaitwa kwa jina.",
                "objective_action": "Taja jina lako kwa maombi.",
                "next_step": "Soma Yohana 10 wiki hii.",
                "completion_message": "Hongera - endelea kusikiliza.",
            },
        },
        "blocks": [
            text_block("Listen closely.", "Sikiliza kwa makini."),
            image_block("/uploads/called-by-name.jpg"),
            image_block("javascript:alert(1)"),
            callout,
            quiz,
            divider,
        ],
    }

    saved = client.put(f"/admin/learn/lessons/{lesson_id}", json=payload, headers=admin_headers)
    assert saved.status_code == 200
    doc = saved.json()

    assert doc["lesson"]["slug"] == "called-by-name"
    assert doc["lesson"]["estimated_minutes"] == 8
    assert doc["lesson"]["status"] == "draft"  # saving never publishes on its own
    assert doc["validation"]["ready"] is True
    assert doc["translations"]["sw"]["objective_after"] == "Kujua unaitwa kwa jina."

    blocks = doc["blocks"]
    assert [block["block_type"] for block in blocks] == [
        "text", "image", "image", "callout", "quiz", "divider",
    ]
    assert all(block["id"] for block in blocks)  # every row came back with an id

    uploaded, unsafe = blocks[1], blocks[2]
    assert uploaded["config"]["url"] == "/uploads/called-by-name.jpg"
    assert uploaded["empty_in"] == []
    assert "url" not in unsafe["config"]  # javascript: never reaches a learner
    assert unsafe["empty_in"] == ["en", "sw"]
    assert "javascript:" not in str(doc)

    assert blocks[3]["config"]["tone"] == "warning"
    assert blocks[4]["config"]["correct_index"] == 2
    assert blocks[4]["translations"]["sw"]["options"] == ["Hakuna", "Malaika", "Yesu"]

    # The builder sends the list exactly as it is on screen: this is a reorder
    # plus a removal, and the rows that stay must keep their identity.
    def as_request(block):
        return {
            "id": block["id"],
            "block_type": block["block_type"],
            "section": block["section"],
            "config": block["config"],
            "position": 0,
            "translations": {
                language: {"data": block["translations"][language]}
                for language in ("en", "sw")
            },
        }

    reordered = [blocks[4], blocks[5], blocks[1], blocks[0]]  # quiz, divider, image, text
    moved = client.put(
        f"/admin/learn/lessons/{lesson_id}",
        json={**payload, "blocks": [as_request(block) for block in reordered]},
        headers=admin_headers,
    )
    assert moved.status_code == 200
    after = moved.json()
    assert [block["block_type"] for block in after["blocks"]] == ["quiz", "divider", "image", "text"]
    assert [block["id"] for block in after["blocks"]] == [block["id"] for block in reordered]
    assert after["blocks"][0]["translations"]["en"]["question"] == "Who calls you by name?"

    # Publishing stays the server's decision, and it passes now the lesson is real.
    published_lesson = client.post(
        f"/admin/learn/lessons/{lesson_id}/publish", headers=admin_headers
    )
    assert published_lesson.status_code == 200
    assert published_lesson.json()["lesson"]["status"] == "published"
    assert client.post(
        f"/admin/learn/paths/{path['id']}/publish", headers=admin_headers
    ).status_code == 200

    seen = client.get(f"/learn/lessons/{lesson_id}?lang=sw").json()["lesson"]
    assert seen["title"] == "Kuitwa kwa jina"
    # The empty image and the callout that was never translated are left out;
    # everything else arrives in the order the builder saved.
    assert [block["block_type"] for block in seen["blocks"]] == ["quiz", "divider", "image", "text"]
    assert seen["blocks"][2]["config"]["url"] == "/uploads/called-by-name.jpg"

    english = client.get(f"/learn/lessons/{lesson_id}?lang=en").json()["lesson"]
    assert english["title"] == "Called by name"
    assert english["blocks"][0]["data"]["options"] == ["Nobody", "An angel", "Jesus"]


