import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Target } from "lucide-react";
import { listPracticeApplications, updatePracticeApplication } from "../services/practiceApi";
import { useLanguage } from "../i18n/LanguageContext";
import "../practice.css";

// ===========================================================================
// CHALLENGES
//
// The learner's own list of things to do away from the screen. Progress here is
// tracked completely separately from academic correctness: doing something in
// real life counts here, and nowhere else.
// ===========================================================================

const STATE_COPY = {
  learned: "illDoThis",
  practiced: "illDoThis",
  applied: "challengeDone",
  repeated: "didItAgain",
};

export default function PracticeApplications() {
  const { language, t } = useLanguage();
  const p = t.practice;

  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    let stale = false;
    listPracticeApplications(language)
      .then((result) => {
        if (stale) return;
        setItems(result.applications || []);
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

  async function move(application, action) {
    if (busy) return;
    setBusy(`${application.id}-${action}`);
    setError("");
    try {
      const updated = await updatePracticeApplication(application.id, { action }, language);
      setItems((rows) =>
        (rows || [])
          .map((row) => (row.id === updated.id ? updated : row))
          .filter((row) => !row.skipped),
      );
    } catch (err) {
      setError(err?.message || p.errorBody);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="practice-page">
      <header className="practice-hero">
        <div className="container">
          <p className="practice-eyebrow">{p.nav}</p>
          <h1>{p.challenges}</h1>
          <p className="practice-hero-intro">{p.challengeTitle}</p>
        </div>
      </header>

      <div className="container">
        {error ? <div className="cms-alert">{error}</div> : null}

        {!items && !error ? <p className="practice-inline-note">{p.loading}</p> : null}

        {items && items.length === 0 ? (
          <section className="practice-section">
            <div className="practice-empty">
              <h2>{p.challengeTitle}</h2>
              <p>{p.challengeBody}</p>
              <Link className="button" to="/practice">
                {p.startPractice}
              </Link>
            </div>
          </section>
        ) : null}

        {items && items.length > 0 ? (
          <section className="practice-section">
            <div className="practice-grid">
              {items.map((item) => (
                <article className="practice-challenge" key={item.id}>
                  <p className="practice-eyebrow">
                    <Target size={13} aria-hidden="true" />{" "}
                    {STATE_COPY[item.state] ? p[STATE_COPY[item.state]] : p.challengeBody}
                  </p>
                  <h3>{item.title}</h3>
                  {item.prompt ? <p>{item.prompt}</p> : null}
                  {item.commitment_text ? (
                    <p className="practice-inline-note">
                      {p.commitmentText}: {item.commitment_text}
                      {item.commitment_when
                        ? ` · ${p.commitmentWhen} ${item.commitment_when}`
                        : ""}
                      {item.commitment_where
                        ? ` · ${p.commitmentWhere} ${item.commitment_where}`
                        : ""}
                    </p>
                  ) : null}
                  <div className="practice-actions-row">
                    {item.state === "applied" || item.state === "repeated" ? (
                      <>
                        <span className="practice-inline-note">
                          <CheckCircle2 size={14} aria-hidden="true" /> {p.challengeDone}
                        </span>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => move(item, "repeated")}
                          disabled={Boolean(busy)}
                        >
                          {p.didItAgain}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="button"
                          onClick={() => move(item, "practiced")}
                          disabled={Boolean(busy)}
                        >
                          {p.illDoThis}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => move(item, "applied")}
                          disabled={Boolean(busy)}
                        >
                          {p.markApplied}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => move(item, "remind")}
                          disabled={Boolean(busy)}
                        >
                          {p.remindLater}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => move(item, "skip")}
                          disabled={Boolean(busy)}
                        >
                          {p.skip}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="practice-section">
          <Link className="btn-secondary" to="/practice">
            {p.backToPractice}
          </Link>
        </section>
      </div>
    </div>
  );
}

