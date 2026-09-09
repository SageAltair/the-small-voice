import {
  useEffect,
  useState,
} from "react";

import { useLanguage } from "../i18n/LanguageContext";
import { getResources } from "../services/api";

import ResourceList from "../components/ResourceList";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";

const CATEGORIES = [
  { key: "all", label: "All resources" },
  { key: "book", label: "Documents" },
  { key: "photo", label: "Photos" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Audio" },
];

function getResourceCategory(resource) {
  const type = (resource.resource_type || "").toLowerCase();
  const ext = (resource.url || "").split(".").pop().toLowerCase();
  if (["pdf", "book", "document", "documents"].includes(type) || ext === "pdf") return "book";
  if (["photo", "image", "gallery", "photos"].includes(type) || ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff"].includes(ext)) return "photo";
  if (["video", "videos", "movie", "clip", "film"].includes(type) || ["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["audio", "music", "podcast", "mp3", "wav", "ogg", "aac", "flac"].includes(type) || ["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma"].includes(ext)) return "audio";
  return "other";
}

export default function Resources() {
  const { t, language } = useLanguage();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("all");
  const pageSize = 6;

  useEffect(() => {
    let cancelled = false;

    async function loadResources() {
      try {
        const data = await getResources(language);
        if (!cancelled) {
          setResources(data);
          setPage(1);
          setCategory("all");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadResources();

    return () => {
      cancelled = true;
    };
  }, [language]);

  const filtered = category === "all"
    ? resources
    : resources.filter((resource) => getResourceCategory(resource) === category);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedResources = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  function goToPage(nextPage) {
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="container page">
      <header className="page-header">
        <p className="eyebrow">
          {t.learnLabel}
        </p>

        <h1>
          {t.resources}
        </h1>

        <p>
          {t.learn}
        </p>
      </header>

      <div className="resource-filter" role="tablist" aria-label="Resource categories">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={category === item.key}
            className={`resource-filter-item${category === item.key ? " resource-filter-item--active" : ""}`}
            onClick={() => { setCategory(item.key); setPage(1); }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && (
        <Loading
          message={t.loadingResources}
        />
      )}

      {!loading && error && (
        <ErrorMessage
          message={error}
        />
      )}

      {!loading && !error && (
        <>
          <ResourceList
            resources={paginatedResources}
          />

          {totalPages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="button secondary"
                disabled={safePage <= 1}
                onClick={() => goToPage(safePage - 1)}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={safePage >= totalPages}
                onClick={() => goToPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
