import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, RefreshCw, WifiOff } from "lucide-react";
import {
  completePracticeSession,
  getPracticeSession,
  savePracticeCommitment,
  submitPracticeAnswer,
  updatePracticeApplication,
} from "../services/practiceApi";
import { useLanguage } from "../i18n/LanguageContext";
import { hasAnswer, questionLabel } from "../practice/engine";
import PracticeQuestion from "../components/PracticeQuestion";
import PracticeFeedback from "../components/PracticeFeedback";
import PracticeProgress from "../components/PracticeProgress";
import PracticeSummary from "../components/PracticeSummary";
import "../practice.css";

// ===========================================================================
// THE SESSION RUNNER
//
// One question at a time, graded by the server. The page never decides whether
// an answer was right: it sends what the learner chose and renders the teaching
// that comes back. Progress is only advanced once the server has answered, so a
// dropped connection can never silently lose an answer.
// ===========================================================================

const CONFIDENCE = [
  { value: 1, key: "confidenceGuessing" },
  { value: 2, key: "confidenceSomewhat" },
  { value: 3, key: "confidenceVery" },
];

export default function PracticeSession() {
  const { sessionId } = useParams();
  const { language, t } = useLanguage();
  const p = t.practice;

  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" && navigator.onLine === false,
  );
  const [busy, setBusy] = useState(false);
  const [prepDone, setPrepDone] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Set when a question appears, not at render time: reading the clock during
  // render would make the component impure.
  const startedAt = useRef(null);

  // Open (or reopen) the session exactly where the learner left it. "Try again"
  // simply bumps reloadKey, so there is one load path rather than two.
  useEffect(() => {
    let stale = false;
    getPracticeSession(Number(sessionId), language)
      .then((loaded) => {
        if (loaded.status === "completed") {
          // Finished here or in another tab: the summary is the honest thing to
          // show, and completing an already-completed session is idempotent.
          return completePracticeSession(loaded.id, language).then((finished) => {
            if (!stale) setSummary(finished);
          });
        }
        if (stale) return undefined;
        setError("");
        setSession(loaded);
        const questions = loaded.questions || [];
        const firstOpen = questions.findIndex((item) => !item.answered);
        setIndex(firstOpen === -1 ? Math.max(questions.length - 1, 0) : firstOpen);
        setValue(null);
        setConfidence(null);
        setFeedback(null);
        setLesson(null);
        startedAt.current = Date.now();
        return undefined;
      })
      .catch((err) => {
        if (stale) return;
        setError(err?.message || p.errorBody);
      });
    return () => {
      stale = true;
    };
  }, [sessionId, language, reloadKey, p.errorBody]);

  // An offline learner keeps their place; the banner says so rather than
  // showing a dead screen.
  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const questions = useMemo(() => session?.questions || [], [session]);
  const current = questions[index];
  const answered = session?.answered ?? 0;
  const total = session?.total ?? questions.length;
  const isLast = index >= questions.length - 1;

  async function grade() {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await submitPracticeAnswer(
        session.id,
        {
          question_id: current.id,
          answer: value || {},
          confidence: confidence ?? undefined,
          time_spent_ms: Math.min(Date.now() - (startedAt.current ?? Date.now()), 3_600_000),
          is_review: session.mode === "review" ? 1 : 0,
        },
        language,
      );
      setFeedback(result.feedback);
      setLesson(result.lesson);
      setSession((row) => ({ ...row, ...result.session }));
    } catch (err) {
      // Nothing is lost: the learner's choice is still on screen and the same
      // answer can be sent again (the server grades each question once).
      setError(err?.message || p.offlineBody);
      if (typeof navigator !== "undefined" && navigator.onLine === false) setOffline(true);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError("");
    try {
      const result = await completePracticeSession(session.id, language);
      setSummary(result);
    } catch (err) {
      setError(err?.message || p.errorBody);
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    setFeedback(null);
    setLesson(null);
    setValue(null);
    setConfidence(null);
    startedAt.current = Date.now();
    if (isLast) {
      finish();
      return;
    }
    setIndex((row) => row + 1);
  }

  if (summary) {
    return (
      <div className="practice-page">
        <div className="practice-session">
          <PracticeSummary
            summary={summary}
            t={p}
            onUpdateApplication={(id, payload) =>
              updatePracticeApplication(id, payload, language)
            }
            onSaveCommitment={(payload) => savePracticeCommitment(payload, language)}
          />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="practice-page">
        <div className="practice-session">
          {error ? (
            <>
              <div className="cms-alert">{error}</div>
              <Link className="button" to="/practice">
                <ArrowLeft size={15} aria-hidden="true" /> {p.backToPractice}
              </Link>
            </>
          ) : (
            <p className="practice-inline-note">{p.loading}</p>
          )}
        </div>
      </div>
    );
  }

  // A concept the learner has never met gets one screen of orientation first:
  // a first encounter should not begin with an exam.
  if (session.prep?.length && !prepDone) {
    return (
      <div className="practice-page">
        <div className="practice-session">
          <section className="practice-prep">
            <p className="practice-eyebrow">{p.reviewTitle}</p>
            {session.prep.map((card) => (
              <div className="practice-prep-card" key={card.concept_id}>
                <h3>{card.name}</h3>
                <p className="practice-inline-note">{card.remember}</p>
              </div>
            ))}
            <div className="practice-continue-actions">
              <button type="button" className="button" onClick={() => setPrepDone(true)}>
                {p.ready} <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="practice-page">
        <div className="practice-session">
          <div className="practice-empty">
            <h2>{p.emptyTitle}</h2>
            <p>{p.emptyBody}</p>
            <Link className="button" to="/practice">
              {p.backToPractice}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const locked = Boolean(feedback);
  // Ordering and matching are excluded by hasAnswer on purpose: the arrangement
  // *is* the answer, so there is no separate answer to wait for.
  const canCheck =
    current.type === "ordering" ||
    current.type === "matching" ||
    hasAnswer(current.type, value);

  return (
    <div className="practice-page">
      <div className="practice-session">
        {offline ? (
          <div className="practice-offline" role="status">
            <span>
              <WifiOff size={15} aria-hidden="true" /> <strong>{p.offlineTitle}</strong>{" "}
              {p.offlineBody}
            </span>
            <button
              type="button"
              className="practice-mini-button"
              onClick={() => setReloadKey((row) => row + 1)}
            >
              <RefreshCw size={14} aria-hidden="true" /> {p.tryAgain}
            </button>
          </div>
        ) : null}

        <div className="practice-session-head">
          <div className="practice-session-meta">
            <span>{questionLabel(p, index + 1, total)}</span>
            <span>
              {answered} / {total}
            </span>
          </div>
          <PracticeProgress
            answered={answered}
            total={total}
            label={`${p.session} · ${answered}/${total}`}
          />
        </div>

        <PracticeQuestion
          question={current}
          value={value}
          onChange={setValue}
          locked={locked}
          feedback={feedback}
          t={p}
        />

        {error ? <div className="cms-alert">{error}</div> : null}

        {!locked && current.graded !== false ? (
          <fieldset className="practice-confidence">
            <legend>{p.confidenceQuestion}</legend>
            <div className="practice-confidence-options">
              {CONFIDENCE.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`practice-confidence-option ${
                    confidence === option.value ? "is-picked" : ""
                  }`}
                  aria-pressed={confidence === option.value}
                  onClick={() =>
                    setConfidence((row) => (row === option.value ? null : option.value))
                  }
                >
                  {p[option.key]}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {!locked ? (
          <div className="practice-actions-row" style={{ marginTop: 18 }}>
            <button
              type="button"
              className="button"
              onClick={grade}
              disabled={!canCheck || busy || offline}
            >
              {busy ? p.working : p.check} <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <PracticeFeedback
            feedback={feedback}
            t={p}
            lesson={lesson}
            onContinue={advance}
            continueLabel={isLast ? p.finish : p.continueButton}
          />
        )}
      </div>
    </div>
  );
}

