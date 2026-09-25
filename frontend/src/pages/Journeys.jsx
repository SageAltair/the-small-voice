import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Compass, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";

const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "journey", label: "Journeys" },
  { value: "next_step", label: "Next Steps" },
  { value: "course", label: "Courses" },
  { value: "learning_path", label: "Learning" },
  { value: "article", label: "Articles" },
];

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1200&q=80",
  "https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=1200&q=80",
  "https://images.unsplash.com/photo-1473177104440-ffee2f376098?w=1200&q=80",
];

const TYPE_LABELS = {
  journey: "Journey",
  next_step: "Next Step",
  course: "Course",
  learning_path: "Learning",
  article: "Article",
  interactive: "Interactive",
};

/** Public listing of everything published from the visual builder. */
export default function Journeys() {
  const { language } = useLanguage();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await api.listPublicExperiences({ experience_type: filter, language }));
    } catch (err) {
      setError(err.message || "Could not load journeys.");
      setItems([]);
    }
  }, [filter, language]);

  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => (items || []).filter((item) => item.status === "published"), [items]);

  return (
    <div className="journeys-page">
      <div className="container">
        <header className="page-hero">
          <p className="eyebrow">Explore</p>
          <h1>Journeys</h1>
          <p className="page-hero-intro">
            Step-by-step experiences to help you grow, from understanding God to following Jesus in everyday life.
          </p>
        </header>

        <div className="stories-filters">
          <label className="category-label" htmlFor="journey-type">Filter by type</label>
          <select
            id="journey-type"
            className="category-select"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {TYPE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {error ? <div className="cms-alert" style={{ marginBottom: 20 }}>{error}</div> : null}

        {!items ? (
          <p style={{ color: "var(--text-muted)" }}>Loading journeys…</p>
        ) : list.length === 0 ? (
          <div className="cms-empty" style={{ padding: "56px 16px", textAlign: "center" }}>
            <Compass size={36} style={{ color: "#cbd5e1", marginBottom: 8 }} />
            <p style={{ color: "var(--text-muted)" }}>Nothing published here yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid">
            {list.map((item, index) => (
              <article className="card" key={item.id}>
                <Link to={`/journeys/${item.slug}`} className="card-link">
                  <img
                    className="card-image"
                    src={item.cover_url || item.image_url || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]}
                    alt=""
                  />
                  <div className="card-body">
                    <span className="card-category">{TYPE_LABELS[item.experience_type] || item.experience_type}</span>
                    <h3 className="card-title">{item.title}</h3>
                    {item.description ? <p className="card-description">{item.description}</p> : null}
                    <span className="card-meta">
                      {item.step_count ?? item.steps?.length ?? 0} steps
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
