import json

"""Test suite for Practice: grading, scheduling, sessions, admin, security.

The suite is written against the same in-memory SQLite + dependency-override
setup used for Learn, and it exercises Practice the way a learner does: start a
session, answer, get told why, finish, apply, and come back later.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.security import create_access_token, hash_password
from app.database import Base, get_db
from app.practice_content import (
    DEFAULT_SETTINGS,
    answer_key_is_valid,
    grade_answer,
    mastery_stage,
    next_review_date,
    priority_score,
    session_size,
    updated_mastery,
)
from app.main import app
from app.models.practice import (
    ConceptMastery,
    PracticeAttempt,
    PracticeConcept,
    PracticeConceptTranslation,
    PracticeProgress,
    PracticeQuestion,
    PracticeQuestionTranslation,
    PracticeSession,
    PracticeSettings,
)
from app.models.user import User

CLIENT_ID = "practiceclient1234567890"


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
        username="practiceadmin",
        email="practiceadmin@example.com",
        hashed_password=hash_password("adminpass123"),
        role="admin",
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def learner_user(db_session) -> User:
    user = User(
        username="practicelearner",
        email="practicelearner@example.com",
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
    return {"Authorization": f"Bearer {create_access_token({'sub': str(admin_user.id)})}"}


@pytest.fixture(scope="function")
def learner_headers(learner_user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(learner_user.id)})}"}


@pytest.fixture(scope="function")
def anonymous_headers() -> dict[str, str]:
    """Practice must work signed out - the device id is enough."""
    return {"X-Learn-Client": CLIENT_ID}


@pytest.fixture(scope="function")
def db(db_session):
    """The same session the API uses, for arranging content in a test."""
    return db_session


def seed_concept(db_session, name="Prayer", swahili="Sala", prep="Prayer is talking with God."):
    concept = PracticeConcept(slug="prayer", difficulty="beginner", status="published")
    concept.translations.append(
        PracticeConceptTranslation(
            language="en",
            name=name,
            description="Talking with God.",
            prep=prep,
        )
    )
    concept.translations.append(
        PracticeConceptTranslation(language="sw", name=swahili, description="Kuzungumza na Mungu.")
    )
    db_session.add(concept)
    db_session.commit()
    db_session.refresh(concept)
    return concept


def seed_question(
    db_session,
    concept,
    *,
    question_type="multiple_choice",
    config=None,
    prompt="What is prayer?",
    swahili="Sala ni nini?",
    options=None,
    explanation="Prayer is relationship, not performance.",
    takeaway="Make it a conversation, not a recital.",
    status="published",
):
    question = PracticeQuestion(
        concept_id=concept.id,
        question_type=question_type,
        difficulty="beginner",
        level=1,
        status=status,
        config=config if config is not None else {"correct_index": 1},
    )
    question.translations.append(
        PracticeQuestionTranslation(
            language="en",
            prompt=prompt,
            options=options if options is not None else ["A performance", "Talking with God"],
            explanation=explanation,
            takeaway=takeaway,
            accepted=[],
        )
    )
    question.translations.append(
        PracticeQuestionTranslation(
            language="sw",
            prompt=swahili,
            options=options if options is not None else ["Utambuzi", "Kuzungumza na Mungu"],
            explanation="Sala ni uhusiano, si kuonyesha.",
            takeaway=takeaway,
            accepted=[],
        )
    )
    db_session.add(question)
    db_session.commit()
    db_session.refresh(question)
    return question
# ---------------------------------------------------------------------------
# Unit tests - the grading and scheduling rules on their own
# ---------------------------------------------------------------------------

def test_grade_answer_covers_every_question_type():
    options = ["Speak", "Perform", "Pretend"]

    assert grade_answer("multiple_choice", {"correct_index": 0}, {"index": 0}) is True
    assert grade_answer("multiple_choice", {"correct_index": 0}, {"index": 1}) is False
    assert grade_answer("true_false", {"correct": True}, {"value": True}) is True
    assert grade_answer("true_false", {"correct": True}, {"value": False}) is False
    assert grade_answer(
        "multiple_select", {"correct_indexes": [0, 2]}, {"indexes": [2, 0]}
    ) is True
    assert grade_answer(
        "multiple_select", {"correct_indexes": [0, 2]}, {"indexes": [0]}
    ) is False
    # Fill-in-the-blank ignores punctuation and casing - learners are not
    # being tested on their keyboard.
    assert grade_answer("fill_blank", {}, {"text": "Prayer."}, accepted=["prayer"]) is True
    assert grade_answer("fill_blank", {}, {"text": ""}, accepted=["prayer"]) is False
    assert grade_answer(
        "ordering", {"correct_order": [0, 1, 2]}, {"order": [0, 1, 2]}
    ) is True
    assert grade_answer(
        "ordering", {"correct_order": [0, 1, 2]}, {"order": [2, 1, 0]}
    ) is False
    assert grade_answer(
        "matching",
        {"correct_pairs": [{"left": 0, "right": 1}, {"left": 1, "right": 0}]},
        {"pairs": {"0": 1, "1": 0}},
    ) is True
    # A reflection is never marked wrong.
    assert grade_answer("reflection", {}, {"text": "I will pray tomorrow."}) is None


def test_answer_key_validation_refuses_ungradeable_questions():
    assert answer_key_is_valid("multiple_choice", {"correct_index": 1}, options_of(3)) is True
    assert answer_key_is_valid("multiple_choice", {"correct_index": 9}, options_of(3)) is False
    assert answer_key_is_valid("true_false", {}, []) is False
    assert answer_key_is_valid("ordering", {"correct_order": [0, 1]}, options_of(3)) is False
    assert answer_key_is_valid("matching", {"correct_pairs": []}, options_of(2)) is False
    # A reflection has no key and is still valid.
    assert answer_key_is_valid("reflection", {}, []) is True


def options_of(count):
    return [f"option {index}" for index in range(count)]


def test_mastery_stage_uses_configurable_thresholds():
    assert mastery_stage(0) == "new"
    assert mastery_stage(45) == "developing"
    assert mastery_stage(95) == "mastered"

    tightened = {"new": [0, 10], "learning": [11, 30], "developing": [31, 50], "strong": [51, 70], "mastered": [71, 100]}
    assert mastery_stage(45, tightened) == "developing"
    assert mastery_stage(75, tightened) == "mastered"


def test_mastery_moves_gently_and_never_below_zero():
    start = 40
    assert updated_mastery(start, correct=True, weight=0) > start
    # A heavier question is worth more when answered well.
    assert updated_mastery(start, correct=True, weight=2) > updated_mastery(
        start, correct=True, weight=0
    )
    # A miss costs little - the no-shame rule, in arithmetic.
    after_miss = updated_mastery(start, correct=False)
    assert start - 5 == after_miss
    assert updated_mastery(2, correct=False) == 0


def test_spaced_repetition_shortens_after_a_miss_and_stays_not_permanent():
    from datetime import timedelta

    from app.learn_content import now

    after_miss = next_review_date(streak=5, correct=False)
    after_hit = next_review_date(streak=3, correct=True)
    assert after_miss < after_hit
    # Even "mastered" comes back - at the longest interval, not never.
    longest = next_review_date(streak=99, correct=True)
    assert longest > after_hit
    assert (longest - now()).days == DEFAULT_SETTINGS["review_intervals"][-1]


def test_priority_prefers_overdue_and_repeated_misses():
    class Row:
        def __init__(self, **kwargs):
            self.next_review = kwargs.get("next_review")
            self.attempt_count = kwargs.get("attempt_count", 0)
            self.correct_count = kwargs.get("correct_count", 0)
            self.incorrect_count = kwargs.get("incorrect_count", 0)
            self.confidence = kwargs.get("confidence", 0.0)
            self.last_attempted = kwargs.get("last_attempted")

    from app.learn_content import now

    reference = now()
    unseen = priority_score(None, None, at=reference)
    missed_twice = priority_score(
        Row(attempt_count=2, correct_count=0, incorrect_count=2, next_review=reference), None, at=reference
    )
    assert missed_twice > unseen

    fresh_hit = priority_score(
        Row(attempt_count=1, correct_count=1, last_attempted=reference), None, at=reference
    )
    assert unseen > fresh_hit


def test_session_sizes_follow_mode_and_time():
    assert session_size("quick") == 3
    assert session_size("normal") == 6
    assert session_size("deep") == 12
    assert session_size("timed", 1) == 2
    assert session_size("timed", 15) == 20
    # An unknown length falls back rather than breaking.
    assert session_size("timed", 7) > 0
# ---------------------------------------------------------------------------
# The learner flow, end to end
# ---------------------------------------------------------------------------

def test_dashboard_starts_empty_and_shows_content_once_it_exists(client, db, anonymous_headers):
    db = db
    empty = client.get("/practice/home?lang=en", headers=anonymous_headers)
    assert empty.status_code == 200
    body = empty.json()
    assert body["concepts"] == []
    assert body["continue"]["reason"] == "empty"
    assert body["has_content"] is False

    concept = seed_concept(db)
    seed_question(db, concept)
    filled = client.get("/practice/home?lang=en", headers=anonymous_headers).json()
    assert filled["has_content"] is True
    assert filled["concepts"][0]["name"] == "Prayer"
    # With something available, the dashboard says what to do and why.
    assert filled["continue"]["reason"] == "new_concept"
    assert filled["continue"]["question_count"] > 0
    assert filled["continue"]["estimated_minutes"] > 0


def test_session_flow_grades_teaches_and_completes(client, db, anonymous_headers):
    db = db
    concept = seed_concept(db)
    question = seed_question(db, concept)

    start = client.post(
        "/practice/sessions?lang=en",
        json={"mode": "normal", "count": 1},
        headers=anonymous_headers,
    )
    assert start.status_code == 200
    session = start.json()
    assert session["total"] == 1
    # The answer key must never travel to the browser before answering.
    payload = session["questions"][0]
    assert "config" not in payload
    assert "explanation" not in payload
    assert payload["prompt"] == "What is prayer?"
    assert payload["concept"]["name"] == "Prayer"
    # A concept never seen before comes with a preparation note.
    assert session["prep"] and session["prep"][0]["name"] == "Prayer"

    answered = client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 1}, "confidence": 3},
        headers=anonymous_headers,
    )
    assert answered.status_code == 200
    result = answered.json()
    assert result["feedback"]["correct"] is True
    assert result["feedback"]["explanation"] == "Prayer is relationship, not performance."
    assert result["feedback"]["takeaway"] == "Make it a conversation, not a recital."
    assert result["xp"] > 0
    assert result["mastery"]["mastery"] > 0
    assert result["mastery"]["stage"] in ("new", "learning", "developing", "strong", "mastered")

    finished = client.post(
        f"/practice/sessions/{session['id']}/complete?lang=en",
        json={},
        headers=anonymous_headers,
    )
    assert finished.status_code == 200
    summary = finished.json()
    assert summary["session"]["answered"] == 1
    assert summary["session"]["correct"] == 1
    assert summary["session"]["xp_earned"] > 0
    assert summary["reviewed"][0]["name"] == "Prayer"
    assert summary["progress"]["questions_answered"] == 1
    assert summary["progress"]["streak"] == 1


def test_a_wrong_answer_is_taught_not_shamed(client, db, anonymous_headers):
    db = db
    concept = seed_concept(db)
    question = seed_question(db, concept)

    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()
    answered = client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 0}},
        headers=anonymous_headers,
    ).json()

    feedback = answered["feedback"]
    assert feedback["correct"] is False
    # The wording is "not quite", and the correct answer is still revealed so
    # a miss teaches rather than merely marking.
    assert feedback["verdict"] == "feedback_not_quite"
    assert feedback["correct_answer"]["index"] == 1
    assert feedback["explanation"]
    # Effort still earns something: stopping must not be the better deal.
    assert answered["xp"] > 0


def test_reflection_is_never_marked_wrong(client, db, anonymous_headers):
    db = db
    concept = seed_concept(db)
    question = seed_question(
        db,
        concept,
        question_type="reflection",
        config={},
        prompt="What will you practise today?",
        options=[],
    )

    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()
    answered = client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"text": "I will pray for ten minutes."}},
        headers=anonymous_headers,
    ).json()

    assert answered["feedback"]["correct"] is None
    assert answered["feedback"]["verdict"] == "feedback_reflection"
    assert answered["mastery"]["mastery"] == 0  # engagement, not mastery


def test_languages_never_mix(client, db, anonymous_headers):
    db = db
    concept = seed_concept(db)
    seed_question(db, concept)
    # A question with only an English translation must be invisible in Swahili.
    english_only = PracticeQuestion(
        concept_id=concept.id,
        question_type="multiple_choice",
        status="published",
        config={"correct_index": 0},
    )
    english_only.translations.append(
        PracticeQuestionTranslation(
            language="en",
            prompt="English only question",
            options=["one", "two"],
            explanation="",
        )
    )
    db.add(english_only)
    db.commit()

    swahili_session = client.post(
        "/practice/sessions?lang=sw", json={"count": 10}, headers=anonymous_headers
    ).json()
    prompts = [item["prompt"] for item in swahili_session["questions"]]
    assert "English only question" not in prompts
    assert swahili_session["questions"]
    assert all(item["prompt"] == "Sala ni nini?" for item in swahili_session["questions"])

    english_session = client.post(
        "/practice/sessions?lang=en", json={"count": 10}, headers=anonymous_headers
    ).json()
    assert "English only question" in [item["prompt"] for item in english_session["questions"]]
# ---------------------------------------------------------------------------
# Security: a client must never be able to award itself credit
# ---------------------------------------------------------------------------

def test_a_forged_correctness_flag_is_ignored(client, anonymous_headers, db):
    concept = seed_concept(db)
    question = seed_question(db, concept)
    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()

    answered = client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={
            "question_id": question.id,
            "answer": {"index": 0},           # the wrong option
            "correct": True,                  # a lie
            "xp": 100000,                     # a wish
        },
        headers=anonymous_headers,
    ).json()
    assert answered["feedback"]["correct"] is False
    assert answered["xp"] <= 2
    stored = db.query(PracticeAttempt).one()
    assert stored.correct is False
    assert stored.xp_awarded <= 2


def test_answers_are_graded_once_however_many_times_they_are_sent(client, anonymous_headers, db):
    concept = seed_concept(db)
    question = seed_question(db, concept)
    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()

    first = client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 1}},
        headers=anonymous_headers,
    ).json()
    second = client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 1}},
        headers=anonymous_headers,
    ).json()

    # A replayed request returns the same feedback and pays nothing extra -
    # this is what stops XP farming by refreshing.
    assert second["repeated"] is True
    assert second["xp"] == first["xp"]
    assert db.query(PracticeAttempt).count() == 1
    assert db.query(PracticeProgress).one().questions_answered == 1


def test_a_question_from_another_session_is_refused(client, anonymous_headers, db):
    concept = seed_concept(db)
    mine = seed_question(db, concept)
    theirs = seed_question(db, concept, prompt="A different question")
    first = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()
    second = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()

    refused = client.post(
        f"/practice/sessions/{first['id']}/answers?lang=en",
        json={"question_id": theirs.id, "answer": {"index": 0}},
        headers=anonymous_headers,
    )
    assert refused.status_code == 400
    assert refused.json()["detail"]["code"] == "question_not_in_session"


def test_one_learner_cannot_read_or_continue_another_session(client, learner_headers, admin_headers, db):
    concept = seed_concept(db)
    question = seed_question(db, concept)
    started = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=learner_headers
    ).json()

    # A different account, even signed in, sees nothing.
    other = client.post(
        "/practice/sessions?lang=en",
        json={"count": 1, "resume_session_id": started["id"]},
        headers={"Authorization": "Bearer " + admin_headers["Authorization"].split()[-1],
                 "X-Learn-Client": "someoneelse1234567890"},
    ).json()
    assert other["id"] != started["id"]

    stolen = client.get(f"/practice/sessions/{started['id']}?lang=en", headers=admin_headers)
    assert stolen.status_code == 404


def test_practice_requires_a_learner_identity(client):
    response = client.post("/practice/sessions?lang=en", json={"count": 1})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "learner_unknown"
# ---------------------------------------------------------------------------
# Spaced repetition in practice, review queue, and application moments
# ---------------------------------------------------------------------------

def days_until(value):
    from datetime import datetime

    return (value - datetime.utcnow()).days


def test_a_miss_comes_back_soon_and_the_dashboard_says_so(client, db, anonymous_headers):
    concept = seed_concept(db)
    question = seed_question(db, concept)
    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()
    client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 0}},
        headers=anonymous_headers,
    )

    mastery = db.query(ConceptMastery).one()
    assert mastery.next_review is not None
    # A miss schedules tomorrow, not next month.
    assert days_until(mastery.next_review) <= 1

    queue = client.get("/practice/review?lang=en", headers=anonymous_headers).json()
    assert queue["count"] >= 1
    assert queue["items"][0]["name"] == "Prayer"
    assert queue["items"][0]["reason"] in ("overdue", "weak")

    home = client.get("/practice/home?lang=en", headers=anonymous_headers).json()
    assert home["needs_review"][0]["name"] == "Prayer"
    assert home["continue"]["reason"] == "needs_review"


def test_the_same_question_is_not_dragged_around_forever(client, db, anonymous_headers):
    concept = seed_concept(db)
    question = seed_question(db, concept)

    # Answer it correctly three times, one session at a time.
    for _ in range(3):
        session = client.post(
            "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
        ).json()
        client.post(
            f"/practice/sessions/{session['id']}/answers?lang=en",
            json={"question_id": question.id, "answer": {"index": 1}, "confidence": 3},
            headers=anonymous_headers,
        )

    mastery = db.query(ConceptMastery).one()
    assert mastery.correct_count == 3
    assert mastery.streak == 3
    assert mastery.mastery >= 18  # climbing, not stuck
    # The gap widens with the streak: spaced, not repetitive.
    assert days_until(mastery.next_review) >= 2


def test_an_in_progress_session_resumes_after_a_dropped_connection(client, db, anonymous_headers):
    concept = seed_concept(db)
    question = seed_question(db, concept)
    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()
    client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 1}},
        headers=anonymous_headers,
    )

    resumed = client.get(
        f"/practice/sessions/{session['id']}?lang=en", headers=anonymous_headers
    ).json()
    assert resumed["id"] == session["id"]
    assert resumed["answered"] == 1
    assert resumed["questions"][0]["answered"] is True
    assert resumed["status"] == "in_progress"


def test_completing_a_session_offers_a_practical_challenge(client, db, anonymous_headers):
    from app.models.practice import ApplicationChallenge, ApplicationChallengeTranslation

    concept = seed_concept(db)
    challenge = ApplicationChallenge(
        slug="pray-five-minutes",
        concept_id=concept.id,
        status="published",
    )
    challenge.translations.append(
        ApplicationChallengeTranslation(
            language="en",
            title="Five minutes of prayer",
            prompt="Take five minutes to talk to God without asking for anything.",
        )
    )
    challenge.translations.append(
        ApplicationChallengeTranslation(
            language="sw",
            title="Dakika tano za sala",
            prompt="Chukua dakika tano kuzungumza na Mungu bila kuomba chochote.",
        )
    )
    db.add(challenge)
    question = seed_question(db, concept)
    db.commit()

    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()
    client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 1}},
        headers=anonymous_headers,
    )
    summary = client.post(
        f"/practice/sessions/{session['id']}/complete?lang=en",
        json={},
        headers=anonymous_headers,
    ).json()

    assert summary["challenge"] is not None
    assert summary["challenge"]["title"] == "Five minutes of prayer"
    assert summary["challenge"]["state"] == "learned"
    assert summary["achievements"], "a first session earns the first milestone"

    # Application is tracked apart from correctness.
    applied = client.put(
        f"/practice/applications/{summary['challenge']['id']}?lang=en",
        json={"action": "applied"},
        headers=anonymous_headers,
    ).json()
    assert applied["state"] == "applied"
    home = client.get("/practice/home?lang=en", headers=anonymous_headers).json()
    assert home["progress"]["applications_done"] == 1
    assert home["application"]["state"] == "applied"


def test_a_commitment_is_saved_in_the_learners_own_words(client, anonymous_headers):
    saved = client.post(
        "/practice/commitments?lang=en",
        json={
            "text": "I will read Scripture for ten minutes.",
            "when_text": "before breakfast",
            "where_text": "at the kitchen table",
        },
        headers=anonymous_headers,
    )
    assert saved.status_code == 200
    stored = saved.json()
    assert stored["text"] == "I will read Scripture for ten minutes."
    assert stored["when_text"] == "before breakfast"

    listed = client.get("/practice/commitments?lang=en", headers=anonymous_headers).json()
    assert listed["commitments"][0]["text"].startswith("I will read Scripture")


def test_reminders_are_opt_in_and_switchable_off(client, anonymous_headers):
    off_by_default = client.get("/practice/settings?lang=en", headers=anonymous_headers).json()
    assert off_by_default["reminder"]["enabled"] is False

    on = client.put(
        "/practice/settings?lang=en",
        json={"reminder": {"enabled": True, "frequency": "weekdays", "time": "07:30"}},
        headers=anonymous_headers,
    ).json()
    assert on["reminder"]["enabled"] is True
    assert on["reminder"]["frequency"] == "weekdays"
    assert on["reminder"]["time"] == "07:30"

    off = client.put(
        "/practice/settings?lang=en",
        json={"reminder": {"enabled": False}},
        headers=anonymous_headers,
    ).json()
    assert off["reminder"]["enabled"] is False


def test_anonymous_progress_moves_into_the_account_on_sign_in(client, db, anonymous_headers, learner_user):
    concept = seed_concept(db)
    question = seed_question(db, concept)
    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()
    client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 1}},
        headers=anonymous_headers,
    )
    client.post(
        f"/practice/sessions/{session['id']}/complete?lang=en",
        json={},
        headers=anonymous_headers,
    )

    merged = client.post(
        f"/practice/progress/merge?client_token={CLIENT_ID}",
        headers={"Authorization": f"Bearer {create_access_token({'sub': str(learner_user.id)})}"},
    )
    assert merged.status_code == 200
    assert merged.json()["merged"] >= 2

    # The account now carries the practice done before signing in.
    progress = db.query(PracticeProgress).filter(PracticeProgress.user_id == learner_user.id).one()
    assert progress.questions_answered == 1
    assert progress.sessions_completed == 1
    mastery = db.query(ConceptMastery).filter(ConceptMastery.user_id == learner_user.id).one()
    assert mastery.correct_count == 1
# ---------------------------------------------------------------------------
# Admin: authoring, validation, publishing, version safety
# ---------------------------------------------------------------------------

def test_admin_endpoints_are_closed_to_non_admins(client, learner_headers, db):
    seed_concept(db)
    assert client.get("/admin/practice/overview", headers=learner_headers).status_code == 403
    assert client.get("/admin/practice/questions", headers=learner_headers).status_code == 403
    assert client.get("/admin/practice/concepts", headers=learner_headers).status_code == 403


def test_a_question_is_written_in_both_languages_then_published(client, admin_headers, db):
    concept = client.post(
        "/admin/practice/concepts",
        json={
            "concept": {"difficulty": "beginner"},
            "translations": {
                "en": {"name": "Prayer", "prep": "Prayer is talking with God."},
                "sw": {"name": "Sala", "prep": "Sala ni kuzungumza na Mungu."},
            },
        },
        headers=admin_headers,
    ).json()
    assert concept["concept"]["status"] == "draft"
    assert concept["translations"]["en"]["name"] == "Prayer"
    assert concept["translations"]["sw"]["prep"]

    draft = client.post(
        "/admin/practice/questions",
        json={
            "question": {
                "concept_id": concept["concept"]["id"],
                "question_type": "multiple_choice",
                "difficulty": "beginner",
                "level": 1,
                "config": {"correct_index": 1},
            },
            "translations": {
                "en": {
                    "prompt": "What is prayer?",
                    "options": ["A performance", "Talking with God"],
                    "explanation": "Prayer is relationship.",
                    "takeaway": "Make it a conversation.",
                },
                "sw": {
                    "prompt": "Sala ni nini?",
                    "options": ["Utambuzi", "Kuzungumza na Mungu"],
                    "explanation": "Sala ni uhusiano.",
                },
            },
        },
        headers=admin_headers,
    ).json()
    question_id = draft["question"]["id"]
    # Saving keeps it hidden - publishing is a deliberate act.
    assert draft["question"]["status"] == "draft"
    assert draft["validation"]["ready"] is True

    published = client.post(
        f"/admin/practice/questions/{question_id}/publish", headers=admin_headers
    ).json()
    assert published["question"]["status"] == "published"

    listed = client.get("/admin/practice/questions", headers=admin_headers).json()
    assert listed["items"][0]["prompt"] == "What is prayer?"

    unpublished = client.post(
        f"/admin/practice/questions/{question_id}/unpublish", headers=admin_headers
    ).json()
    assert unpublished["question"]["status"] == "draft"


def test_publishing_is_refused_until_the_content_is_ready(client, admin_headers, db):
    concept = seed_concept(db)
    question = PracticeQuestion(
        concept_id=concept.id,
        question_type="multiple_choice",
        status="draft",
        config={},  # no correct answer yet
    )
    question.translations.append(
        PracticeQuestionTranslation(
            language="en", prompt="What is prayer?", options=["only one"]
        )
    )
    db.add(question)
    db.commit()
    db.refresh(question)

    refused = client.post(
        f"/admin/practice/questions/{question.id}/publish", headers=admin_headers
    )
    assert refused.status_code == 422
    codes = {error["code"] for error in refused.json()["detail"]["errors"]}
    assert "answer_key_missing" in codes
    assert "options_missing" in codes
    # The refusal leaves it a draft - nothing slipped through.
    assert db.get(PracticeQuestion, question.id).status == "draft"


def test_validation_warns_about_what_helps_the_learner(client, admin_headers, db):
    concept = seed_concept(db)
    question = seed_question(
        db,
        concept,
        status="draft",
        explanation="",
        takeaway="",
        swahili="",
        options=["Same", "Same"],
    )
    report = client.get(
        f"/admin/practice/questions/{question.id}", headers=admin_headers
    ).json()["validation"]
    codes = {warning["code"] for warning in report["warnings"]}
    assert "explanation_missing" in codes      # a quiz that teaches nothing
    assert "takeaway_missing" in codes
    assert "duplicate_options" in codes
    assert "translation_missing" in codes      # the Swahili prompt is absent


def test_editing_a_published_question_keeps_learner_history(client, admin_headers, anonymous_headers, db):
    concept = seed_concept(db)
    question = seed_question(db, concept)
    version_before = question.version

    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()
    client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 1}},
        headers=anonymous_headers,
    )

    edited = client.put(
        f"/admin/practice/questions/{question.id}",
        json={
            "question": {
                "concept_id": concept.id,
                "question_type": "multiple_choice",
                "config": {"correct_index": 0},
            },
            "translations": {
                "en": {"prompt": "What is prayer, really?", "options": ["Talking with God", "A performance"]},
                "sw": {"prompt": "Sala ni nini kweli?", "options": ["Kuzungumza na Mungu", "Utambuzi"]},
            },
        },
        headers=admin_headers,
    )
    assert edited.status_code == 200, edited.text

    # A meaningful change to live content bumps the version...
    assert edited.json()["question"]["version"] > version_before
    # ...and the historical attempt still points at the same question, with
    # the answer the learner actually gave.
    attempt = db.query(PracticeAttempt).one()
    assert attempt.question_id == question.id
    assert attempt.answer["index"] == 1
    # The attempt remembers the version that was live when it was answered.
    assert attempt.question_version == version_before


def test_deleting_content_never_erases_history(client, admin_headers, anonymous_headers, db):
    concept = seed_concept(db)
    question = seed_question(db, concept)
    session = client.post(
        "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
    ).json()
    client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 1}},
        headers=anonymous_headers,
    )

    client.delete(f"/admin/practice/questions/{question.id}", headers=admin_headers)
    assert db.query(PracticeAttempt).count() == 1
    assert db.query(ConceptMastery).count() == 1

    # A deleted question simply stops appearing in new sessions.
    fresh = client.post(
        "/practice/sessions?lang=en", json={"count": 5}, headers=anonymous_headers
    ).json()
    assert fresh["questions"] == []


def test_an_automatic_set_is_filled_by_the_scheduler(client, admin_headers, db):
    concept = client.post(
        "/admin/practice/concepts",
        json={"translations": {"en": {"name": "Prayer"}}},
        headers=admin_headers,
    ).json()["concept"]
    for index in range(3):
        created = client.post(
            "/admin/practice/questions",
            json={
                "question": {
                    "concept_id": concept["id"],
                    "question_type": "multiple_choice",
                    "config": {"correct_index": 0},
                },
                "translations": {
                    "en": {"prompt": f"Question {index}", "options": ["yes", "no"]},
                    "sw": {"prompt": "Swahili", "options": ["ndiyo", "hapana"]},
                },
            },
            headers=admin_headers,
        ).json()
        client.post(
            f"/admin/practice/questions/{created['question']['id']}/publish",
            headers=admin_headers,
        )

    published_set = client.post(
        "/admin/practice/sets",
        json={
            "practice_set": {
                "mode": "automatic",
                "estimated_minutes": 3,
                "concept_ids": [concept["id"]],
            },
            "translations": {"en": {"title": "Starting With God"}},
        },
        headers=admin_headers,
    ).json()
    # An automatic set needs a title and at least one concept, nothing more.
    assert published_set["validation"]["ready"] is True
    client.post(
        f"/admin/practice/sets/{published_set['practice_set']['id']}/publish",
        headers=admin_headers,
    )

    public_sets = client.get("/practice/sets?lang=en").json()
    assert public_sets["sets"][0]["title"] == "Starting With God"
    assert public_sets["sets"][0]["mode"] == "automatic"


def test_admin_settings_drive_the_engine_without_a_deploy(client, admin_headers, anonymous_headers, db):
    settings_response = client.put(
        "/admin/practice/settings",
        json={
            "xp_values": {"correct": 25, "session": 50},
            "review_intervals": [2, 4, 9, 20],
            "mastery_thresholds": {
                "new": [0, 30], "learning": [31, 50], "developing": [51, 70],
                "strong": [71, 90], "mastered": [91, 100],
            },
            "session_sizes": {"quick": 2, "normal": 4, "deep": 10, "minutes": {"1": 1}},
        },
        headers=admin_headers,
    )
    assert settings_response.status_code == 200, settings_response.text
    updated = settings_response.json()
    assert updated["settings"]["xp_values"]["correct"] == 25
    assert updated["settings"]["review_intervals"][2] == 9

    concept = seed_concept(db)
    question = seed_question(db, concept)
    session = client.post(
        "/practice/sessions?lang=en", json={"mode": "normal"}, headers=anonymous_headers
    ).json()
    # The configured session length is honoured, not a hard-coded one.
    assert session["total"] <= 4

    answered = client.post(
        f"/practice/sessions/{session['id']}/answers?lang=en",
        json={"question_id": question.id, "answer": {"index": 1}},
        headers=anonymous_headers,
    ).json()
    assert answered["xp"] == 25  # the admin's XP value, not the default


def test_admin_analytics_reports_useful_numbers(client, admin_headers, anonymous_headers, db):
    concept = seed_concept(db)
    first = seed_question(db, concept, prompt="Easy one")
    second = seed_question(db, concept, prompt="Hard one")

    for question, answer_index in ((first, 1), (second, 0), (second, 0)):
        session = client.post(
            "/practice/sessions?lang=en", json={"count": 1}, headers=anonymous_headers
        ).json()
        client.post(
            f"/practice/sessions/{session['id']}/answers?lang=en",
            json={"question_id": question.id, "answer": {"index": answer_index}},
            headers=anonymous_headers,
        )

    report = client.get("/admin/practice/analytics", headers=admin_headers).json()
    assert report["totals"]["attempts"] == 3
    assert report["totals"]["accuracy"] == 33
    # The most-missed question is genuinely the most missed.
    assert report["most_missed"][0]["question_id"] == second.id
    assert report["question_types"]

    overview = client.get("/admin/practice/overview", headers=admin_headers).json()
    assert overview["totals"]["questions"] == 2
    assert overview["learners"]["attempts"] == 3
    assert overview["hardest_concepts"][0]["name"] == "Prayer"
    assert overview["completion_rate"] >= 0

