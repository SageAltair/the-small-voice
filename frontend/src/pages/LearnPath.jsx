import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, Play } from "lucide-react";
import { getLearnPath, recordLearnEvent } from "../services/learnApi";
import { getImageUrl } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import { usePreferences } from "../settings/PreferencesContext";
import { LearnProgressBar } from "../components/LearnContinue";
import "../learn.css";

const LEVEL_LABELS = {
  beginner: "Beginner",
  growing: "Growing",
  deeper: "Going deeper",
};

/** One published learning path with its ordered lesson list and progress. */
export default function LearnPath() {
  const { pathSlug } = useParams();
  const { language } = useLanguage();
  const { preferences } = usePreferences();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stale = false;
    getLearnPath(pathSlug, language)
      .then((result) => {
        if (stale) return;
        setData(result);
        setError("");
      })
      .catch((err) => {
        if (stale) return;
        setError(err.message || "Could not load this learning path.");
        setData(null);
      });
    return () => {
      stale = true;
    };
  }, [pathSlug, language]);

  const pathId = data?.path?.id;

  useEffect(() => {
    if (pathId) recordLearnEvent({ eventType: "path_view", pathId, language });
  }, [pathId, language]);

  if (error) {
    return (
      <div className="learn-lesson-shell">
        <div className="cms-alert">{error}</div>
        <p style={{ marginTop: 16 }}>
          <Link to="/learn">Back to all learning paths</Link>
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="learn-lesson-shell">
        <p style={{ color: "var(--text-muted)" }}>Loading path…</p>
      </div>
    );
  }

  const { path, lesson_list, progress } = data;
  const lessons = lesson_list || [];
  const current =
    progress?.current_lesson || lessons.find((lesson) => !lesson.completed) || lessons[0];
  const resumeHref = current ? `/learn/lesson/${current.id}` : null;

  /* Settings > Learning > Show lessons I have finished. Hiding a completed
     lesson is a view choice: the numbers are untouched, and turning the setting
     back on brings every one of them straight back. */
  const visibleLessons = preferences.learning.showCompleted
    ? lessons
    : lessons.filter((lesson) => !lesson.completed);

  return (
    <div className="learn-page">
      <div className="container">
        <header className="learn-path-hero">
          <div>
            <Link className="learn-path-back" to="/learn">
              <ArrowLeft size={14} aria-hidden="true" /> All learning paths
            </Link>

            <h1 style={{ margin: "14px 0 0", fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)" }}>
              {path.title}
              {path.level ? (
                <span className="learn-level">{LEVEL_LABELS[path.level] || path.level}</span>
              ) : null}
            </h1>

            {path.description ? <p className="learn-hero-intro">{path.description}</p> : null}

            <div className="learn-path-meta">
              <span>
                <BookOpen size={14} aria-hidden="true" /> {path.lesson_count} lessons
              </span>
              <span>
                <Clock size={14} aria-hidden="true" /> {path.estimated_minutes} min
              </span>
              {path.category ? <span>{path.category.name}</span> : null}
            </div>

            <div className="learn-path-actions">
              {resumeHref ? (
                <Link className="button" to={resumeHref}>
                  {progress?.started ? "Resume path" : "Start path"}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              ) : null}
              <div style={{ flex: "1 1 240px" }}>
                <LearnProgressBar progress={progress} />
              </div>
            </div>
          </div>

          {path.cover_url ? (
            <img
              className="learn-path-cover"
              src={getImageUrl(path.cover_url) || path.cover_url}
              alt=""
            />
          ) : null}
        </header>

        <section aria-label="Lessons">
          <div className="learn-lessons">
            {visibleLessons.map((lesson) => (
              <Link
                key={lesson.id}
                to={`/learn/lesson/${lesson.id}`}
                className={`learn-lesson-row ${lesson.completed ? "is-done" : ""} ${
                  current && current.id === lesson.id ? "is-current" : ""
                }`}
              >
                <span className="learn-lesson-number" aria-hidden="true">
                  {lesson.completed ? <CheckCircle2 size={16} /> : lessons.indexOf(lesson) + 1}
                </span>
                <h3 className="learn-lesson-title">{lesson.title}</h3>
                <span className="learn-lesson-meta">
                  {lesson.completed ? "Completed" : "Start"}
                  <Play size={12} aria-hidden="true" />
                </span>
                {lesson.summary ? <p className="learn-lesson-summary">{lesson.summary}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
