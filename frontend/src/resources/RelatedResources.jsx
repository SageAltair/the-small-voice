import { ArrowRight, BookOpen, Compass } from "lucide-react";

/**
 * The "Related resources" rail.
 *
 * Editor-chosen links come first; the server tops the rail up with same-type
 * resources sharing a topic or tag so it is never a lonely row of two. It can
 * include Stories and Learning lessons as well as Resources, which is what
 * lets one piece of content point at the guide that goes with it.
 */

import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/LanguageContext";
import { getImageUrl } from "../services/api";

const KIND_LABELS = {
  resource: null,
  story: "stories",
  learning: "learn",
};

export default function RelatedResources({ items = [] }) {
  const { t } = useLanguage();

  if (!items.length) return null;

  return (
    <section className="res-section" aria-labelledby="res-related-heading">
      <div className="res-section-head">
        <h2 id="res-related-heading">{t.resources.relatedTitle}</h2>
      </div>

      <div className="res-related">
        {items.map((item) => (
          <Link
            key={`${item.kind}-${item.id}`}
            to={item.href}
            className={`res-related-item${
              item.cover_url ? "" : " res-related-item--text"
            }`}
          >
            {item.cover_url ? (
              <img src={getImageUrl(item.cover_url)} alt="" loading="lazy" />
            ) : (
              <span aria-hidden="true">
                {item.kind === "learning" ? (
                  <BookOpen size={20} strokeWidth={1.4} />
                ) : (
                  <Compass size={20} strokeWidth={1.4} />
                )}
              </span>
            )}

            <strong>{item.title}</strong>

            {/* The kind is named in text, not only implied by an icon. */}
            <small>{t[KIND_LABELS[item.kind]] || t.resources.types?.[item.type]}</small>

            {item.description && <small>{item.description}</small>}

            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}