import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import ExperienceRenderer from "../components/experience/ExperienceRenderer";
import { buildDocument, pageHeight } from "../experience/designModel";

/**
 * Public view of a published experience.
 *
 * It mounts the same `ExperienceRenderer` the builder canvas uses, from the
 * same saved document - there is no second rendering path, so the published
 * page is guaranteed to match what the admin arranged.
 */
export default function PublicExperience() {
  const { slug } = useParams();
  const { language } = useLanguage();
  const [data, setData] = useState(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api.getPublicExperience(slug));
      setIndex(0);
    } catch (err) {
      setError(err.message || "This experience is not available.");
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="container" style={{ padding: "80px 0", textAlign: "center" }}>
        <AlertCircle size={28} style={{ color: "#b91c1c", marginBottom: 10 }} />
        <p style={{ color: "var(--text-muted)" }}>{error}</p>
        <Link to="/journeys" className="text-link" style={{ marginTop: 16 }}>
          <ArrowLeft size={15} /> Back to journeys
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container" style={{ padding: "80px 0", textAlign: "center", color: "var(--text-muted)" }}>
        <Loader2 size={20} className="eb-spin" style={{ margin: "0 auto" }} /> Loading…
      </div>
    );
  }

  // Reuse the editor's document model so both sides interpret the data the
  // same way, including the migration of older saved designs.
  const document = buildDocument(data);
  const page = document.pages[index];

  if (!page) {
    return (
      <div className="container" style={{ padding: "80px 0", textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>This experience has no content yet.</p>
      </div>
    );
  }

  const go = (delta) => setIndex((current) => Math.min(Math.max(current + delta, 0), document.pages.length - 1));
  const scale = Math.min(1, (typeof window === "undefined" ? 1200 : window.innerWidth - 48) / page.pageSettings.width);

  return (
    <div className="experience-public">
      <div className="container experience-public__head">
        <div>
          <p className="eyebrow">{data.experience_type?.replace("_", " ")}</p>
          <h1>{data.title}</h1>
          {data.description ? <p className="experience-public__intro">{data.description}</p> : null}
        </div>
      </div>

      <div className="experience-public__stage" style={{ padding: "32px 24px" }}>
        <div style={{ width: page.pageSettings.width * scale, margin: "0 auto" }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: page.pageSettings.width }}>
            <ExperienceRenderer page={page} mode="view" />
          </div>
          <div style={{ height: Math.max(0, pageHeight(page) * scale - pageHeight(page)) }} />
        </div>
      </div>

      {document.pages.length > 1 ? (
        <nav className="experience-public__nav container" aria-label="Steps">
          <button type="button" className="button" onClick={() => go(-1)} disabled={index === 0}>
            <ArrowLeft size={15} /> Previous
          </button>
          <span className="experience-public__count">
            Step {index + 1} of {document.pages.length}
            <span className="experience-public__title"> · {page.title}</span>
          </span>
          <button type="button" className="button" onClick={() => go(1)} disabled={index === document.pages.length - 1}>
            Next <ArrowRight size={15} />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
