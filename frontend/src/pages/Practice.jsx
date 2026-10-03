import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Clock,
  Flame,
  Layers,
  RefreshCw,
  Settings as SettingsIcon,
  Target,
  Zap,
} from "lucide-react";
import {
  getPracticeHome,
  startPracticeSession,
  updatePracticeApplication,
} from "../services/practiceApi";
import { useLanguage } from "../i18n/LanguageContext";
import { orderConceptsForDashboard, streakMessage } from "../practice/engine";
import "../practice.css";

// ===========================================================================
// PRACTICE HOME
//
// The dashboard answers one question - "what should I do next?" - so it leads
// with a single decided action and keeps the catalogue below it. Every reason
// the server gives back is phrased here in plain, unhurried words.
// ===========================================================================

const REASON_COPY = {
  needs_review: "reasonNeedsReview",
  reinforce: "reasonReinforce",
  new_concept: "reasonNewConcept",
  overdue: "reasonOverdue",
  weak: "reasonWeak",
};

const STAGE_COPY = {
  new: "stageNew",
  learning: "stageLearning",
  developing: "stageDeveloping",
  strong: "stageStrong",
  mastered: "stageMastered",
};

const MODES = ["quick", "normal", "deep"];
const MODE_COPY = { quick: "timeQuick", normal: "timeNormal", deep: "timeDeep" };

export default function Practice() {
  const { language, t } = useLanguage();
  const p = t.practice;
  const navigate = useNavigate();

  const [home, setHome] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("normal");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    let stale = false;
    getPracticeHome(language)
      .then((result) => {
        if (stale) return;
        setHome(result);
        setError("");
      })
      .catch((err) => {
        if (stale) return;
        setError(err?.message || p.errorBody);
      });
    return () => {
      stale = true;
    };
  }, [language, p.errorBody]);

  useEffect(() => load(), [load]);

  const concepts = useMemo(
    () => orderConceptsForDashboard(home?.concepts),
    [home],
  );

  /** Start (or resume) a session, then hand the page over to the runner. */
  async function start({ conceptId, mode: override, resumeSessionId } = {}) {
    if (busy) return;
    setBusy(conceptId ? `concept-${conceptId}` : "start");
    setError("");
    try {
      const payload = { mode: override || mode };
      if (resumeSessionId) payload.resume_session_id = resumeSessionId;
      if (conceptId) payload.concept_ids = [conceptId];
      const session = await startPracticeSession(payload, language);
      navigate(`/practice/session/${session.id}`);
    } catch (err) {
      setError(err?.message || p.errorBody);
      setBusy("");
    }
  }

  /** The weak concepts, weakest first - what "review weak areas" means. */
  function reviewWeak() {
    const weak = concepts.filter((item) => item.practised && item.mastery < 61).slice(0, 4);
    if (weak.length === 0) {
      start({ mode: "normal" });
      return;
    }
    setBusy("review");
    setError("");
    startPracticeSession(
      { mode: "normal", concept_ids: weak.map((item) => item.id) },
      language,
    )
      .then((session) => navigate(`/practice/session/${session.id}`))
      .catch((err) => {
        setError(err?.message || p.errorBody);
        setBusy("");
      });
  }

  async function moveApplication(action) {
    if (!home?.application || busy) return;
    setBusy("application");
    try {
      const updated = await updatePracticeApplication(home.application.id, { action }, language);
      setHome((current) => ({ ...current, application: updated }));
    } catch (err) {
      setError(err?.message || p.errorBody);
    } finally {
      setBusy("");
    }
  }

  const progress = home?.progress;
  const continueCard = home?.continue;
  const streak = streakMessage(p, progress);

  if (!home && !error) {
    return (
      <div className="practice-page">
        <div className="container">
          <p className="practice-inline-note">{p.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-page">
      <header className="practice-hero">
        <div className="container">
          <p className="practice-eyebrow">{p.nav}</p>
          <h1>{p.heroTitle}</h1>
          <p className="practice-hero-intro">{p.heroIntro}</p>
          <div className="practice-hero-meta">
            {progress ? (
              <>
                <span>
                  <Flame size={14} aria-hidden="true" />
                  {p.streakDays.replace("{count}", String(progress.streak))}
                </span>
                <span>
                  <Zap size={14} aria-hidden="true" />
                  {progress.xp} {p.xp}
                </span>
                <span>
                  {progress.questions_answered} {p.questionsAnswered}
                </span>
                {streak ? <span>{streak}</span> : null}
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="container">
        {error ? <div className="cms-alert">{error}</div> : null}

        {home && !home.has_content ? (
          <section className="practice-section">
            <div className="practice-empty">
              <h2>{p.noContentTitle}</h2>
              <p>{p.noContentBody}</p>
              <Link className="button" to="/learn">
                Learn <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </section>
        ) : null}

        {home?.has_content ? (
          <section className="practice-section">
            <div className="practice-continue">
              <div>
                <h2>
                  {continueCard?.resume_session_id ? p.continueTitle : p.todayTitle}
                </h2>
                <p className="practice-continue-body">{p.continueBody}</p>
              </div>

              {continueCard?.concept ? (
                <p className="practice-continue-reason">
                  <Target size={14} aria-hidden="true" />
                  <span>
                    {REASON_COPY[continueCard.reason]
                      ? p[REASON_COPY[continueCard.reason]]
                      : p.continueBody}
                    {continueCard.concept?.name ? ` — ${continueCard.concept.name}` : ""}
                  </span>
                </p>
              ) : null}

              <div className="practice-continue-stats">
                <span>
                  <strong>{continueCard?.question_count ?? 0}</strong>
                  {p.questions}
                </span>
                <span>
                  <strong>{continueCard?.estimated_minutes ?? 0}</strong>
                  {p.minutes}
                </span>
              </div>

              <div className="practice-time">
                <span className="practice-time-label">{p.iHaveTime}</span>
                <div className="practice-time-options">
                  {MODES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`practice-time-option ${mode === item ? "is-active" : ""}`}
                      aria-pressed={mode === item}
                      onClick={() => setMode(item)}
                    >
                      {p[MODE_COPY[item]]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="practice-continue-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    start(
                      continueCard?.resume_session_id
                        ? { resumeSessionId: continueCard.resume_session_id }
                        : { conceptId: continueCard?.concept?.id },
                    )
                  }
                  disabled={Boolean(busy)}
                >
                  {continueCard?.resume_session_id ? (
                    <RefreshCw size={15} aria-hidden="true" />
                  ) : null}
                  {continueCard?.resume_session_id ? p.resume : p.startPractice}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={reviewWeak}
                  disabled={Boolean(busy)}
                >
                  {p.reviewWeak}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => start()}
                  disabled={Boolean(busy)}
                >
                  {p.practiceEverything}
                </button>
              </div>
            </div>
          </section>
        ) : null}


        {/* progress */}
        {progress ? (
          <section className="practice-section">
            <h2>{p.yourProgress}</h2>
            <div className="practice-stats">
              <div className="practice-stat">
                <strong>{progress.streak}</strong>
                <span>{p.streak}</span>
              </div>
              <div className="practice-stat">
                <strong>{home.stats?.strong ?? 0}</strong>
                <span>{p.strongConcepts}</span>
              </div>
              <div className="practice-stat">
                <strong>{home.stats?.needs_review ?? 0}</strong>
                <span>{p.needsReviewCount}</span>
              </div>
              <div className="practice-stat">
                <strong>{progress.questions_answered}</strong>
                <span>{p.questionsAnswered}</span>
              </div>
            </div>
          </section>
        ) : null}

        {/* review queue */}
        {home?.needs_review?.length ? (
          <section className="practice-section">
            <h2>{p.reviewQueue}</h2>
            <p className="practice-section-note">
              {p.reviewQueueBody.replace("{count}", String(home.stats?.needs_review ?? 0))}
            </p>
            <div className="practice-grid">
              {home.needs_review.map((item) => (
                <article className="practice-card" key={item.id}>
                  <h3>{item.name}</h3>
                  <div className="practice-bar">
                    <div className="practice-bar-track">
                      <div className="practice-bar-fill" style={{ width: `${item.mastery}%` }} />
                    </div>
                  </div>
                  <div className="practice-card-foot">
                    <span className="practice-pill">
                      {p[STAGE_COPY[item.stage] || "stageNew"]}
                    </span>
                    <button
                      type="button"
                      className="button"
                      onClick={() => start({ conceptId: item.id })}
                      disabled={Boolean(busy)}
                    >
                      {p.practiceNow}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* topics */}
        {concepts.length > 0 ? (
          <section className="practice-section">
            <h2>
              <Layers size={18} aria-hidden="true" /> {p.byTopic}
            </h2>
            <p className="practice-section-note">
              {home.stats?.concepts ?? 0} {p.topics}
            </p>
            <div className="practice-grid">
              {concepts.map((item) => (
                <article className="practice-card" key={item.id}>
                  <h3>{item.name}</h3>
                  {item.description ? <p>{item.description}</p> : null}
                  <div className="practice-bar">
                    <div className="practice-bar-track">
                      <div className="practice-bar-fill" style={{ width: `${item.mastery}%` }} />
                    </div>
                    <p className="practice-bar-meta">
                      <span>{item.practised ? item.mastery : ""}</span>
                      <span>{item.attempt_count} {p.questions}</span>
                    </p>
                  </div>
                  <div className="practice-card-foot">
                    <span className="practice-pill">
                      {p[STAGE_COPY[item.stage] || "stageNew"]}
                    </span>
                    <button
                      type="button"
                      className="button"
                      onClick={() => start({ conceptId: item.id })}
                      disabled={Boolean(busy)}
                    >
                      {item.practised ? p.start : p.practiceNow}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <hr className="practice-rule" />

        {/* the one action away from the screen */}
        {home?.application && !home.application.skipped ? (
          <section className="practice-section">
            <h2>{p.challengeTitle}</h2>
            <div className="practice-challenge">
              <p className="practice-eyebrow">
                <Target size={13} aria-hidden="true" /> {p.challengeBody}
              </p>
              <h3>{home.application.title}</h3>
              {home.application.prompt ? <p>{home.application.prompt}</p> : null}
              {home.application.commitment_text ? (
                <p className="practice-inline-note">
                  {p.commitmentText}: {home.application.commitment_text}
                  {home.application.commitment_when
                    ? ` · ${p.commitmentWhen} ${home.application.commitment_when}`
                    : ""}
                  {home.application.commitment_where
                    ? ` · ${p.commitmentWhere} ${home.application.commitment_where}`
                    : ""}
                </p>
              ) : null}
              <div className="practice-actions-row">
                <button
                  type="button"
                  className="button"
                  onClick={() => moveApplication("practiced")}
                  disabled={Boolean(busy)}
                >
                  {p.illDoThis}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => moveApplication("applied")}
                  disabled={Boolean(busy)}
                >
                  {p.markApplied}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => moveApplication("skip")}
                  disabled={Boolean(busy)}
                >
                  {p.skip}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <hr className="practice-rule" />

        <section className="practice-section">
          <div className="practice-grid">
            <Link className="practice-card" to="/practice/review">
              <h3>
                <Clock size={17} aria-hidden="true" /> {p.reviewQueue}
              </h3>
              <p>{p.reviewQueueBody.replace("{count}", String(home?.stats?.needs_review ?? 0))}</p>
            </Link>
            <Link className="practice-card" to="/practice/achievements">
              <h3>
                <Award size={17} aria-hidden="true" /> {p.achievements}
              </h3>
              <p>{p.heroIntro}</p>
            </Link>
            <Link className="practice-card" to="/practice/challenges">
              <h3>
                <Target size={17} aria-hidden="true" /> {p.challenges}
              </h3>
              <p>{p.challengeTitle}</p>
            </Link>
            <Link className="practice-card" to="/practice/settings">
              <h3>
                <SettingsIcon size={17} aria-hidden="true" /> {p.settings}
              </h3>
              <p>{p.reminderBody}</p>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

