import { useState } from "react";
import { Link } from "react-router-dom";
import { Award, CheckCircle2, Clock, Sparkles, Target } from "lucide-react";

// ===========================================================================
// THE CLOSING SCREEN
//
// Short by design (section 22): what was strengthened, when it comes back, and
// the one thing to do next. The challenge is the bridge from knowing something
// to doing something, so it is the piece with real buttons on it.
// ===========================================================================

const STAGE_LABELS = {
  new: "stageNew",
  learning: "stageLearning",
  developing: "stageDeveloping",
  strong: "stageStrong",
  mastered: "stageMastered",
};

export default function PracticeSummary({
  summary,
  t,
  onUpdateApplication,
  onSaveCommitment,
}) {
  const [savedCommitment, setSavedCommitment] = useState(false);
  const [commitment, setCommitment] = useState({ text: "", when_text: "", where_text: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // A late response (or a resumed session) may replace the summary underfoot.
  // Adjusting state during render - rather than in an effect - is React's own
  // pattern for "my prop changed, so my derived copy must change too".
  const [challenge, setChallenge] = useState(summary?.challenge || null);
  const [seenSummary, setSeenSummary] = useState(summary);
  if (summary !== seenSummary) {
    setSeenSummary(summary);
    setChallenge(summary?.challenge || null);
  }

  const session = summary?.session || {};
  const reviewed = summary?.reviewed || [];
  const achievements = summary?.achievements || [];

  async function move(action) {
    if (!challenge || busy) return;
    setBusy(action);
    setError("");
    try {
      const updated = await onUpdateApplication(challenge.id, { action });
      setChallenge(updated);
    } catch (err) {
      setError(err?.message || t.errorBody);
    } finally {
      setBusy("");
    }
  }

  async function savePlan() {
    if (!commitment.text.trim() || busy) return;
    setBusy("commitment");
    setError("");
    try {
      await onSaveCommitment({
        text: commitment.text,
        when_text: commitment.when_text,
        where_text: commitment.where_text,
        application_id: challenge?.id ?? null,
      });
      setSavedCommitment(true);
    } catch (err) {
      setError(err?.message || t.errorBody);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="practice-summary">
      <div>
        <p className="practice-eyebrow">{t.sessionComplete}</p>
        <h1>{t.doneToday}</h1>
      </div>

      <p className="practice-score">
        <strong>
          {session.correct ?? 0} / {session.answered ?? 0}
        </strong>
        <span className="practice-inline-note">
          {session.answered ?? 0} {t.questions}
          {session.xp_earned ? ` · +${session.xp_earned} ${t.xp}` : ""}
        </span>
      </p>

      {reviewed.length > 0 ? (
        <div>
          <h2>{t.youReviewed}</h2>
          <ul className="practice-reviewed">
            {reviewed.map((item) => (
              <li key={item.concept_id}>
                <CheckCircle2 size={15} aria-hidden="true" />
                <span style={{ flex: 1 }}>{item.name}</span>
                <span className="practice-pill">{t[STAGE_LABELS[item.stage] || "stageNew"]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary?.next_review?.next_review ? (
        <p className="practice-inline-note">
          <Clock size={13} aria-hidden="true" /> {t.nextReview}:{" "}
          {new Date(summary.next_review.next_review).toLocaleDateString()}
        </p>
      ) : null}

      {achievements.length > 0 ? (
        <div>
          <h2>
            <Award size={18} aria-hidden="true" /> {t.achievements}
          </h2>
          <ul className="practice-reviewed">
            {achievements.map((item) => (
              <li key={item.key}>
                <Sparkles size={15} aria-hidden="true" />
                <span style={{ flex: 1 }}>{item.title || item.key}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {challenge ? (
        <div className="practice-challenge">
          <p className="practice-eyebrow">
            <Target size={13} aria-hidden="true" /> {t.challengeBody}
          </p>
          <h3>{challenge.title}</h3>
          {challenge.prompt ? <p>{challenge.prompt}</p> : null}

          {challenge.state === "applied" || challenge.state === "repeated" ? (
            <>
              <p className="practice-inline-note">{t.challengeDone}</p>
              <div className="practice-actions-row">
                <button
                  type="button"
                  className="button"
                  onClick={() => move("repeated")}
                  disabled={busy === "repeated"}
                >
                  {t.didItAgain}
                </button>
              </div>
            </>
          ) : (
            <div className="practice-actions-row">
              <button
                type="button"
                className="button"
                onClick={() => move("practiced")}
                disabled={Boolean(busy)}
              >
                {t.illDoThis}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => move("applied")}
                disabled={Boolean(busy)}
              >
                {t.markApplied}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => move("remind")}
                disabled={Boolean(busy)}
              >
                {t.remindLater}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => move("skip")}
                disabled={Boolean(busy)}
              >
                {t.skip}
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div className="practice-prep">
        <h2>{t.commitmentTitle}</h2>
        {savedCommitment ? (
          <p className="practice-inline-note">{t.progressSaved}</p>
        ) : (
          <>
            <div className="practice-commitment-fields">
              <label className="practice-commitment-label">
                {t.commitmentText}
                <input
                  type="text"
                  value={commitment.text}
                  onChange={(event) =>
                    setCommitment((current) => ({ ...current, text: event.target.value }))
                  }
                  maxLength={400}
                />
              </label>
              <label className="practice-commitment-label">
                {t.commitmentWhen}
                <input
                  type="text"
                  value={commitment.when_text}
                  onChange={(event) =>
                    setCommitment((current) => ({ ...current, when_text: event.target.value }))
                  }
                  maxLength={120}
                />
              </label>
              <label className="practice-commitment-label">
                {t.commitmentWhere}
                <input
                  type="text"
                  value={commitment.where_text}
                  onChange={(event) =>
                    setCommitment((current) => ({ ...current, where_text: event.target.value }))
                  }
                  maxLength={120}
                />
              </label>
            </div>
            <div className="practice-actions-row">
              <button
                type="button"
                className="button"
                onClick={savePlan}
                disabled={!commitment.text.trim() || busy === "commitment"}
              >
                {busy === "commitment" ? t.working : t.saveCommitment}
              </button>
            </div>
          </>
        )}
      </div>

      {error ? <div className="cms-alert">{error}</div> : null}

      <div className="practice-actions-row">
        <Link className="button" to="/practice">
          {t.backToPractice}
        </Link>
        <Link className="btn-secondary" to="/practice/achievements">
          {t.achievements}
        </Link>
      </div>
    </section>
  );
}

