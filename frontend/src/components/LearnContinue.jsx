import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { getMyLearnProgress } from "../services/learnApi";
import { useLanguage } from "../i18n/LanguageContext";
import { usePreferences } from "../settings/PreferencesContext";
import "../learn.css";

/**
 * The completion bar every Learn surface shares (path page, continue lists).
 *
 * Someone who would rather see only what is ahead can switch it off in
 * Settings > Learning > Show learning progress. That is a display preference,
 * not a change to the progress itself: the counts still exist on the server and
 * still drive what "Resume" points at.
 */
export function LearnProgressBar({ progress }) {
  const { preferences } = usePreferences();

  if (!progress || !preferences.learning.showProgress) return null;

  const percent = progress.percent ?? 0;

  return (
    <div className="learn-progress">
      <div
        className="learn-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="learn-progress-bar" style={{ width: `${percent}%` }} />
      </div>
      <div className="learn-progress-meta">
        <span>{progress.completed ?? 0} of {progress.total ?? 0} lessons</span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}

/**
 * "Continue learning" panel backed by GET /learn/progress/my.
 *
 * Works signed-in and signed-out (the anonymous client id carries the same
 * progress), so the learner always lands back where they left off.
 */
export default function LearnContinue({ title = "Continue learning", intro, limit = 3 }) {
  const { language } = useLanguage();
  const [data, setData] = useState(null);

  useEffect(() => {
    let stale = false;
    getMyLearnProgress(language)
      .then((result) => {
        if (!stale) setData(result);
      })
      .catch(() => {
        if (!stale) setData(null);
      });
    return () => {
      stale = true;
    };
  }, [language]);

  const paths = (data?.paths || []).slice(0, limit);

  return (
    <section className="learn-continue" aria-labelledby="learn-continue-title">
      <h2 id="learn-continue-title">{title}</h2>
      {intro ? <p>{intro}</p> : null}

      {data === null ? null : paths.length === 0 ? (
        <p className="learn-continue-empty">
          Nothing in progress yet. <Link to="/learn">Browse the learning paths</Link> to start a
          lesson - your place is kept as you go.
        </p>
      ) : (
        <div className="learn-continue-list">
          {paths.map((entry) => {
            const current = entry.progress?.current_lesson;
            const href = current
              ? `/learn/lesson/${current.id}`
              : `/learn/paths/${entry.slug}`;

            return (
              <article className="learn-continue-item" key={entry.path_id}>
                <h3>{entry.title}</h3>
                <Link className="button" to={href}>
                  {entry.progress?.started ? "Resume" : "Start"}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <LearnProgressBar progress={entry.progress} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
