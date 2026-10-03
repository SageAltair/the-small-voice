"""Practice models for The Small Voice.

Practice is the retrieval-and-application half of Learn: published concepts
hold many questions in several types, a session is one short round of those
questions, and every attempt feeds a mastery record that decides when the
concept comes back (spaced repetition) and how strongly it is held.

Language handling follows the exact pattern used by ``Learn`` and ``Resource``:
the base row keeps language-neutral data (type, difficulty, the index of a
correct answer, links to existing Learn/Story/Resource rows) while every piece
of authored prose - prompt, options, explanation, takeaway - lives in a
``*Translation`` row, one per language, so an English and a Swahili sentence can
never share a column and the admin can see exactly which language is missing.

Learner ownership mirrors Learn too: exactly one of ``user_id`` / ``client_id``
identifies the learner, so Practice works signed-out and the rows fold into the
account on sign-in instead of being lost.
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PracticeConcept(Base):
    """A reusable idea worth practising ("Prayer", "New Life").

    One concept is referenced by many questions and can appear in many sets,
    so mastery (and the review schedule) is tracked at concept level while the
    questions underneath provide the variation that stops answer-pattern
    memorisation.
    """

    __tablename__ = "practice_concepts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    difficulty: Mapped[str] = mapped_column(
        String(20), default="beginner", nullable=False,
        comment="beginner|intermediate|advanced",
    )
    # Concept -> the Learn content it reinforces. SET NULL keeps the concept
    # (and learner history) if a lesson is ever removed.
    learn_lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("learn_lessons.id", ondelete="SET NULL"), index=True, nullable=True
    )
    learn_path_id: Mapped[int | None] = mapped_column(
        ForeignKey("learn_paths.id", ondelete="SET NULL"), index=True, nullable=True
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False, comment="draft|published"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    translations = relationship(
        "PracticeConceptTranslation",
        back_populates="concept",
        cascade="all, delete-orphan",
    )
    questions = relationship("PracticeQuestion", back_populates="concept")


class PracticeConceptTranslation(Base):
    """Language-specific name and description for a concept."""

    __tablename__ = "practice_concept_translations"
    __table_args__ = (
        UniqueConstraint("concept_id", "language", name="uq_practice_concept_translation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    concept_id: Mapped[int] = mapped_column(
        ForeignKey("practice_concepts.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The short "remember this" shown on the preparation card before a learner
    # meets a concept for the first time (section 7 of the spec).
    prep: Mapped[str | None] = mapped_column(Text, nullable=True)

    concept = relationship("PracticeConcept", back_populates="translations")


class PracticeQuestion(Base):
    """One practice item belonging to a concept.

    ``question_type`` picks the renderer and grader (see
    ``app.practice_content.QUESTION_TYPES``); ``config`` carries the
    language-neutral answer key (e.g. correct index) while authored prose and
    language-specific accepted answers live in the translation row.

    ``version`` is bumped whenever a published question's content changes, and
    attempts keep the version they answered, so editing a question never
    rewrites learner history (section 42).
    """

    __tablename__ = "practice_questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    concept_id: Mapped[int] = mapped_column(
        ForeignKey("practice_concepts.id", ondelete="CASCADE"), index=True
    )
    question_type: Mapped[str] = mapped_column(String(30), nullable=False)
    difficulty: Mapped[str] = mapped_column(
        String(20), default="beginner", nullable=False,
        comment="beginner|intermediate|advanced",
    )
    # Recognition -> Recall -> Understanding -> Application -> Reflection.
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False, comment="draft|published"
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Language-neutral answer key: {"correct_index": 2}, {"correct": true}...
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Optional links back into the ecosystem (section 32).
    learn_lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("learn_lessons.id", ondelete="SET NULL"), index=True, nullable=True
    )
    story_id: Mapped[int | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), index=True, nullable=True
    )
    resource_id: Mapped[int | None] = mapped_column(
        ForeignKey("resources.id", ondelete="SET NULL"), index=True, nullable=True
    )
    # Scripture reference stored separately from question text so a Bible
    # translation can be chosen deliberately (section 47).
    scripture_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    scripture_translation: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # Scheduler hint: higher weight comes back sooner.
    weight: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    concept = relationship("PracticeConcept", back_populates="questions")
    translations = relationship(
        "PracticeQuestionTranslation",
        back_populates="question",
        cascade="all, delete-orphan",
    )


class PracticeQuestionTranslation(Base):
    """Language-specific authored text for one question."""

    __tablename__ = "practice_question_translations"
    __table_args__ = (
        UniqueConstraint("question_id", "language", name="uq_practice_question_translation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("practice_questions.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Option list for choice/matching/ordering types (JSON array of strings
    # or of {id,text} / {left,right} objects).
    options: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Short practical takeaway shown with the feedback (section 2C).
    takeaway: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Fill-in-the-blank accepted answers, language specific by nature.
    accepted: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # Optional "Apply" prompt that can become an application challenge.
    application_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    media_alt: Mapped[str | None] = mapped_column(String(300), nullable=True)

    question = relationship("PracticeQuestion", back_populates="translations")


class PracticeSet(Base):
    """A curated (or rule-driven) group of questions: "Starting With God".

    ``mode`` decides who picks the questions: ``manual`` uses the membership
    rows below, ``automatic`` lets the scheduler choose from the concept list,
    ``hybrid`` applies the admin's rules (counts per difficulty / weakness)
    and fills the rest automatically.
    """

    __tablename__ = "practice_sets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    mode: Mapped[str] = mapped_column(
        String(20), default="manual", nullable=False, comment="manual|automatic|hybrid"
    )
    # e.g. {"count": 5, "weak_concepts": 2, "new_concepts": 1, "review": 1}
    rules: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), default="beginner", nullable=False)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    concept_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False, comment="draft|published"
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    translations = relationship(
        "PracticeSetTranslation", back_populates="practice_set", cascade="all, delete-orphan"
    )
    membership = relationship(
        "PracticeSetQuestion", back_populates="practice_set", cascade="all, delete-orphan"
    )


class PracticeSetTranslation(Base):
    """Language-specific title and description for a set."""

    __tablename__ = "practice_set_translations"
    __table_args__ = (
        UniqueConstraint("set_id", "language", name="uq_practice_set_translation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    set_id: Mapped[int] = mapped_column(
        ForeignKey("practice_sets.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    practice_set = relationship("PracticeSet", back_populates="translations")


class PracticeSetQuestion(Base):
    """Manual membership of a question inside a set, with ordering."""

    __tablename__ = "practice_set_questions"
    __table_args__ = (
        UniqueConstraint("set_id", "question_id", name="uq_practice_set_question"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    set_id: Mapped[int] = mapped_column(
        ForeignKey("practice_sets.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("practice_questions.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    practice_set = relationship("PracticeSet", back_populates="membership")

class PracticeSession(Base):
    """One round of practice: which questions, when, and how it went.

    Sessions unit "today's practice" and the post-session summary; attempts
    hang off them so drop-off can be measured. Question ids are frozen at
    start, so editing content cannot reshuffle a session in progress.
    """

    __tablename__ = "practice_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    set_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_sets.id", ondelete="SET NULL"), index=True, nullable=True
    )
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    mode: Mapped[str] = mapped_column(
        String(20), default="normal", nullable=False,
        comment="quick|normal|deep|review|topic|everything|timed",
    )
    question_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    answered_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    xp_earned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="in_progress", nullable=False,
        comment="in_progress|completed|abandoned",
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    attempts = relationship(
        "PracticeAttempt", back_populates="session", cascade="all, delete-orphan"
    )


class PracticeAttempt(Base):
    """A single graded (or reflective) answer.

    ``question_version`` freezes the content the learner saw. Correctness is
    always derived server-side from the answer key; the client never claims it.
    """

    __tablename__ = "practice_attempts"
    __table_args__ = (
        UniqueConstraint("session_id", "question_id", name="uq_practice_attempt_per_session"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("practice_sessions.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("practice_questions.id", ondelete="CASCADE"), index=True
    )
    concept_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_concepts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    question_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    question_type: Mapped[str] = mapped_column(String(30), default="", nullable=False)
    # The learner's raw answer (index, list, text...) - never a correctness flag.
    answer: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    correct: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True, comment="null = reflection, not graded"
    )
    confidence: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="1 guessing|2 somewhat|3 very sure"
    )
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    time_spent_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    session = relationship("PracticeSession", back_populates="attempts")


class ConceptMastery(Base):
    """The learner's grasp of one concept, and when it should return.

    ``mastery`` is 0-100 (thresholds configurable from Admin, section 18);
    ``next_review`` is set by the spaced-repetition scheduler. A mastered
    concept still gets an eventual review - mastery is never presented as
    permanent.
    """

    __tablename__ = "practice_concept_mastery"
    __table_args__ = (
        UniqueConstraint("user_id", "concept_id", name="uq_practice_mastery_user_concept"),
        UniqueConstraint("client_id", "concept_id", name="uq_practice_mastery_client_concept"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    concept_id: Mapped[int] = mapped_column(
        ForeignKey("practice_concepts.id", ondelete="CASCADE"), index=True
    )
    mastery: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Rolling average of reported confidence (1-3), drives scheduling tweaks.
    confidence: Mapped[float] = mapped_column(default=0.0, nullable=False)
    last_attempted: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_correct: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_review: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    # Consecutive correct answers; feeds the "review level" ladder.
    streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class QuestionMastery(Base):
    """Per-question scheduling: cheap lookup for the review queue.

    Concept mastery answers "how strong is this topic"; this row answers
    "which exact questions are due", letting repeated misses and low
    confidence on one item pull it forward without punishing the whole topic.
    """

    __tablename__ = "practice_question_mastery"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_practice_qmastery_user_question"),
        UniqueConstraint("client_id", "question_id", name="uq_practice_qmastery_client_question"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("practice_questions.id", ondelete="CASCADE"), index=True
    )
    concept_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_concepts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    confidence: Mapped[float] = mapped_column(default=0.0, nullable=False)
    last_attempted: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_review: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ApplicationChallenge(Base):
    """A reusable real-life challenge ("pray 5 minutes without asking").

    Content lives in translations; publishing follows the draft -> publish
    workflow like everything else. Challenges are what bridge screen to life
    (section 10) and are tracked separately from academic correctness.
    """

    __tablename__ = "application_challenges"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    concept_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_concepts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    difficulty: Mapped[str] = mapped_column(String(20), default="beginner", nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft", nullable=False, comment="draft|published"
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    translations = relationship(
        "ApplicationChallengeTranslation",
        back_populates="challenge",
        cascade="all, delete-orphan",
    )


class ApplicationChallengeTranslation(Base):
    """Language-specific text for one challenge."""

    __tablename__ = "application_challenge_translations"
    __table_args__ = (
        UniqueConstraint("challenge_id", "language", name="uq_practice_challenge_translation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    challenge_id: Mapped[int] = mapped_column(
        ForeignKey("application_challenges.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    challenge = relationship("ApplicationChallenge", back_populates="translations")


class PracticeApplication(Base):
    """One learner's journey with one challenge.

    States: learned -> practiced -> applied -> repeated. The learner's own
    words for the implementation intention ("I will ..., when ..., where ...")
    are stored on the row so a returning learner reads their own commitment
    back, not a generic prompt.
    """

    __tablename__ = "practice_applications"
    __table_args__ = (
        UniqueConstraint("user_id", "challenge_id", name="uq_practice_application_user"),
        UniqueConstraint("client_id", "challenge_id", name="uq_practice_application_client"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    challenge_id: Mapped[int] = mapped_column(
        ForeignKey("application_challenges.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_sessions.id", ondelete="SET NULL"), index=True, nullable=True
    )
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    state: Mapped[str] = mapped_column(
        String(20), default="learned", nullable=False,
        comment="learned|practiced|applied|repeated",
    )
    commitment_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    commitment_when: Mapped[str | None] = mapped_column(String(200), nullable=True)
    commitment_where: Mapped[str | None] = mapped_column(String(200), nullable=True)
    skipped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PracticeCommitment(Base):
    """An implementation intention written by the learner (section 9).

    "I will ___ / When? ___ / Where? ___" - kept separate from the challenge
    itself so the same challenge can be committed to differently by different
    learners, and so a returning learner sees their own plan.
    """

    __tablename__ = "practice_commitments"
    __table_args__ = (
        UniqueConstraint("user_id", "slug_date", name="uq_practice_commitment_user_day"),
        UniqueConstraint("client_id", "slug_date", name="uq_practice_commitment_client_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    application_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_applications.id", ondelete="SET NULL"), index=True, nullable=True
    )
    # YYYY-MM-DD of the day the commitment was made; one per day keeps the
    # habit light instead of a growing pile of stale plans.
    slug_date: Mapped[str] = mapped_column(String(10), default="", nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    when_text: Mapped[str | None] = mapped_column(String(200), nullable=True)
    where_text: Mapped[str | None] = mapped_column(String(200), nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Achievement(Base):
    """A milestone definition ("First practice", "100 questions").

    Definitions are content (translatable), unlocks are rows on
    PracticeAchievement. Kept secondary to learning: nothing blocks on them.
    """

    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    # e.g. {"metric": "questions_answered", "threshold": 10}
    requirement: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    xp_reward: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    translations = relationship(
        "AchievementTranslation", back_populates="achievement", cascade="all, delete-orphan"
    )


class AchievementTranslation(Base):
    """Language-specific title and description for an achievement."""

    __tablename__ = "achievement_translations"
    __table_args__ = (
        UniqueConstraint("achievement_id", "language", name="uq_practice_achievement_translation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    achievement_id: Mapped[int] = mapped_column(
        ForeignKey("achievements.id", ondelete="CASCADE"), index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    achievement = relationship("Achievement", back_populates="translations")


class PracticeAchievement(Base):
    """An achievement one learner has unlocked."""

    __tablename__ = "practice_achievements"
    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_practice_achievement_user"),
        UniqueConstraint("client_id", "achievement_id", name="uq_practice_achievement_client"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    achievement_id: Mapped[int] = mapped_column(
        ForeignKey("achievements.id", ondelete="CASCADE"), index=True
    )
    earned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PracticeProgress(Base):
    """Aggregate gamification state for one learner (section 16).

    XP, streak and lifetime counters live here so the dashboard does not have
    to scan every attempt. ``streak`` counts consecutive days with at least
    one completed session; a broken streak is never shamed in the UI - the
    row simply keeps ``last_practice_date`` so the interface can greet a
    returner warmly instead.
    """

    __tablename__ = "practice_progress"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_practice_progress_user"),
        UniqueConstraint("client_id", name="uq_practice_progress_client"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    best_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_practice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    questions_answered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sessions_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    applications_done: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Optional, learner-controlled reminders (section 23). Stored preferences
    # only - the UI is honest that a reminder appears on the site, and the
    # learner can turn it off at any time.
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminder_frequency: Mapped[str] = mapped_column(
        String(20), default="daily", nullable=False, comment="daily|weekdays|weekly|off"
    )
    reminder_time: Mapped[str] = mapped_column(String(8), default="08:00", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PracticeSettings(Base):
    """Configurable knobs the admin edits without code changes (section 31).

    Stored as one row keyed ``singleton`` so thresholds, XP values, review
    intervals and session limits can change without a deploy. The public API
    only exposes what the learner UI genuinely needs (session sizes).
    """

    __tablename__ = "practice_settings"

    id: Mapped[str] = mapped_column(String(20), primary_key=True, default="singleton")
    # 0-20 new | 21-40 learning | 41-60 developing | 61-80 strong | 81-100 mastered
    mastery_thresholds: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    xp_values: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Days between reviews per streak ladder rung.
    review_intervals: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    session_sizes: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    streak_settings: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    question_limit: Mapped[int] = mapped_column(Integer, default=40, nullable=False)
    enabled_types: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    reminder_defaults: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PracticeEvent(Base):
    """Lightweight practice analytics for the admin insights tab.

    Same philosophy as ``LearnEvent``: enough to answer "what is practised,
    where do people stop" without building a second analytics product.
    """

    __tablename__ = "practice_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_type: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_sessions.id", ondelete="SET NULL"), index=True, nullable=True
    )
    concept_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_concepts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    question_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_questions.id", ondelete="SET NULL"), index=True, nullable=True
    )
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    event_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


__all__ = [
    "Achievement",
    "AchievementTranslation",
    "ApplicationChallenge",
    "ApplicationChallengeTranslation",
    "ConceptMastery",
    "PracticeAchievement",
    "PracticeApplication",
    "PracticeAttempt",
    "PracticeCommitment",
    "PracticeConcept",
    "PracticeConceptTranslation",
    "PracticeEvent",
    "PracticeProgress",
    "PracticeQuestion",
    "PracticeQuestionTranslation",
    "PracticeSession",
    "PracticeSet",
    "PracticeSetQuestion",
    "PracticeSetTranslation",
    "PracticeSettings",
    "QuestionMastery",
]

