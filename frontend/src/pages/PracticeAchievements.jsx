import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Sparkles } from "lucide-react";
import { listPracticeAchievements } from "../services/practiceApi";
import { useLanguage } from "../i18n/LanguageContext";
import "../practice.css";

// ===========================================================================
// MILESTONES
//
// Rewards are secondary and never a gate (section 30): nothing here is locked
// behind a paywall or a streak, and the unearned ones are shown as "not yet"
// rather than as a tally of what the learner is missing.
// ===========================================================================

export default function PracticeAchievements() {
  const { language, t } = useLanguage();
  const p = t.practice;

  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stale = false;
    listPracticeAchievements(language)
      .then((result) => {
        if (stale) return;
        setItems(result.achievements || []);
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

  const earned = useMemo(
    () => (items || []).filter((item) => item.earned).length,
    [items],
  );

  return (
    <div className="practice-page">
      <header className="practice-hero">
        <div className="container">
          <p className="practice-eyebrow">{p.nav}</p>
          <h1>{p.achievements}</h1>
          <p className="practice-hero-intro">
            {items
              ? p.milestonesOf
                  .replace("{earned}", String(earned))
                  .replace("{total}", String(items.length))
              : p.loading}
          </p>
        </div>
      </header>

      <div className="container">
        {error ? <div className="cms-alert">{error}</div> : null}

        {items && items.length === 0 ? (
          <section className="practice-section">
            <div className="practice-empty">
              <h2>{p.emptyTitle}</h2>
              <p>{p.emptyBody}</p>
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
                <article className="practice-card" key={item.key}>
                  <h3>
                    {item.earned ? (
                      <Award size={17} aria-hidden="true" />
                    ) : (
                      <Sparkles size={17} aria-hidden="true" />
                    )}{" "}
                    {item.title}
                  </h3>
                  {item.description ? <p>{item.description}</p> : null}
                  <div className="practice-card-foot">
                    <span className="practice-pill">
                      {item.earned ? p.earned : p.notYet}
                    </span>
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
