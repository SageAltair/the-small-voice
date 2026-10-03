import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { getPracticeReview, startPracticeSession } from "../services/practiceApi";
import { useLanguage } from "../i18n/LanguageContext";
import "../practice.css";

// ===========================================================================
// TODAY'S REVIEW
//
// Spaced repetition only works if the learner understands *why* something is
// back, so every item carries its reason in plain language rather than a due
// date or a number they would have to interpret.
// ===========================================================================

const REASON_COPY = {
  overdue: "reasonOverdue",
  weak: "reasonWeak",
  needs_review: "reasonNeedsReview",
  reinforce: "reasonReinforce",
  new_concept: "reasonNewConcept",
};

export default function PracticeReview() {
  const { language, t } = useLanguage();
  const p = t.practice;
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let stale = false;
    getPracticeReview(language)
      .then((result) => {
        if (stale) return;
        setData(result);
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

  const startReview = useCallback(
    async (conceptIds) => {
      if (busy) return;
      setBusy(conceptIds ? `concept-${conceptIds[0]}` : "all");
      setError("");
      try {
        const payload = { mode: "review" };
        if (conceptIds?.length) payload.concept_ids = conceptIds;
        const session = await startPracticeSession(payload, language);
        navigate(`/practice/session/${session.id}`);
      } catch (err) {
        setError(err?.message || p.errorBody);
        setBusy("");
      }
    },
    [busy, language, navigate, p.errorBody],
  );

  const items = data?.items || [];

  return (
    <div className="practice-page">
      <header className="practice-hero">
        <div className="container">
          <p className="practice-eyebrow">{p.nav}</p>
          <h1>{p.reviewQueue}</h1>
          <p className="practice-hero-intro">
            {items.length
              ? p.reviewQueueBody.replace("{count}", String(data?.count ?? 0))
              : p.nothingDue}
          </p>
        </div>
      </header>

      <div className="container">
        {error ? <div className="cms-alert">{error}</div> : null}

        {!data && !error ? <p className="practice-inline-note">{p.loading}</p> : null}

        {data && items.length === 0 ? (
          <section className="practice-section">
            <div className="practice-empty">
              <h2>
                <CheckCircle2 size={20} aria-hidden="true" /> {p.allCaughtUp}
              </h2>
              <p>{p.nothingDue}</p>
              <button type="button" className="button" onClick={() => startReview()}>
                {p.practiceEverything}
              </button>
            </div>
          </section>
        ) : null}

        {items.length > 0 ? (
          <section className="practice-section">
            <div className="practice-continue-actions">
              <button
                type="button"
                className="button"
                onClick={() => startReview()}
                disabled={Boolean(busy)}
              >
                {p.startReview} <RefreshCw size={14} aria-hidden="true" />
              </button>
              <Link className="btn-secondary" to="/practice">
                {p.backToPractice}
              </Link>
            </div>

            <div className="practice-grid" style={{ marginTop: 18 }}>
              {items.map((item) => (
                <article className="practice-card" key={item.id}>
                  <h3>{item.name}</h3>
                  <p>{REASON_COPY[item.reason] ? p[REASON_COPY[item.reason]] : p.reasonNeedsReview}</p>
                  <div className="practice-bar">
                    <div className="practice-bar-track">
                      <div className="practice-bar-fill" style={{ width: `${item.mastery}%` }} />
                    </div>
                    <p className="practice-bar-meta">
                      <span>{item.mastery}%</span>
                      {item.next_review ? (
                        <span>
                          <Clock size={12} aria-hidden="true" />{" "}
                          {new Date(item.next_review).toLocaleDateString()}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="practice-card-foot">
                    <button
                      type="button"
                      className="button"
                      onClick={() => startReview([item.id])}
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
      </div>
    </div>
  );
}
