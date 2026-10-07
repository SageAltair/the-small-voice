import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Clock, Compass, Search } from "lucide-react";
import { getLearnHome } from "../services/learnApi";
import { getImageUrl } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import LearnContinue, { LearnProgressBar } from "../components/LearnContinue";
import "../learn.css";

const LEVEL_LABELS = {
  beginner: "Beginner",
  growing: "Growing",
  deeper: "Going deeper",
};

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=1200&q=80",
  "https://images.unsplash.com/photo-1473177104440-ffee2f376098?w=1200&q=80",
  "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1200&q=80",
];

/** Public Learn landing page: hero, topics, and every published path. */
export default function Learn() {
  const { language } = useLanguage();
  const [home, setHome] = useState(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let stale = false;
    getLearnHome(language)
      .then((result) => {
        if (stale) return;
        setHome(result);
        setError("");
      })
      .catch((err) => {
        if (stale) return;
        setError(err.message || "Could not load the learning content.");
        setHome(null);
      });
    return () => {
      stale = true;
    };
  }, [language]);

  const paths = useMemo(() => {
    const term = query.trim().toLowerCase();

    return (home?.paths || [])
      .filter((item) => {
        if (category && item.category?.slug !== category) return false;
        if (!term) return true;

        const haystack = [
          item.title,
          item.description,
          item.category?.name,
          ...(item.progress?.lessons || []).map((lesson) => lesson.title),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(term);
      })
      .slice()
      .sort((a, b) => Number(b.featured) - Number(a.featured));
  }, [home, category, query]);

  return (
    <div className="learn-page">
      <header className="learn-hero">
        <div className="container">
          <p className="eyebrow">Learn</p>
          <h1>Small steps for the journey.</h1>
          <p className="learn-hero-intro">
            Guided learning paths that take you from the story to the questions behind it, then on
            to practice, prayer, and a next step you can actually take.
          </p>

          {home ? (
            <div className="learn-stats">
              <div className="learn-stat">
                <strong>{home.stats?.paths ?? 0}</strong>
                <span>Paths</span>
              </div>
              <div className="learn-stat">
                <strong>{home.stats?.lessons ?? 0}</strong>
                <span>Lessons</span>
              </div>
              <div className="learn-stat">
                <strong>{home.categories?.length ?? 0}</strong>
                <span>Topics</span>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div className="container">
        <LearnContinue
          title="Continue learning"
          intro="Your place is kept as you go, with or without an account."
        />

        <div className="learn-toolbar">
          <div className="learn-chips" role="group" aria-label="Filter by topic">
            <button
              type="button"
              className={`learn-chip ${category === "" ? "active" : ""}`}
              onClick={() => setCategory("")}
            >
              All topics
            </button>
            {(home?.categories || []).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`learn-chip ${category === item.slug ? "active" : ""}`}
                onClick={() => setCategory((current) => (current === item.slug ? "" : item.slug))}
              >
                {item.name}
              </button>
            ))}
          </div>

          <label className="learn-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search paths and lessons"
              aria-label="Search learning content"
            />
          </label>
        </div>

        {error ? <div className="cms-alert">{error}</div> : null}

        {home?.fallback_available ? (
          <p className="learn-fallback">
            New learning content is being written in this language. Switch the site language to
            see what is available now.
          </p>
        ) : null}

        {!home && !error ? (
          <p style={{ color: "var(--text-muted)" }}>Loading learning paths…</p>
        ) : paths.length === 0 ? (
          <div className="cms-empty" style={{ padding: "56px 16px", textAlign: "center" }}>
            <Compass size={36} style={{ color: "#cbd5e1", marginBottom: 8 }} />
            <p style={{ color: "var(--text-muted)" }}>
              Nothing here matches that yet. Try another topic or search term.
            </p>
          </div>
        ) : (
          <div className="grid learn-grid">
            {paths.map((item, index) => (
              <article className="card learn-card" key={item.id}>
                <Link to={`/learn/paths/${item.slug}`} className="card-link">
                  <img
                    className="card-image learn-card-image"
                    src={
                      getImageUrl(item.cover_url) ||
                      FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]
                    }
                    alt=""
                  />
                  <div className="card-content learn-card-body">
                    <span className="card-category">
                      {item.category?.name || "Learning path"}
                    </span>
                    <h3 className="card-title">
                      {item.title}
                      {item.level ? (
                        <span className="learn-level">
                          {LEVEL_LABELS[item.level] || item.level}
                        </span>
                      ) : null}
                    </h3>
                    {item.description ? (
                      <p className="card-description">{item.description}</p>
                    ) : null}

                    <LearnProgressBar progress={item.progress} />

                    <span className="card-meta">
                      <span>
                        <BookOpen size={13} aria-hidden="true" /> {item.lesson_count} lessons
                      </span>
                      <span>
                        <Clock size={13} aria-hidden="true" /> {item.estimated_minutes} min
                      </span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
