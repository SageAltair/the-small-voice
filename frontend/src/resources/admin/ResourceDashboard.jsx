import { FileText } from "lucide-react";

/**
 * The Resources dashboard.
 *
 * The numbers an administrator acts on before touching anything: what is live,
 * what is waiting, what each type holds, and what changed most recently. All
 * of it comes from one aggregate endpoint rather than by loading the whole
 * library, so the dashboard stays quick no matter how large the library gets.
 *
 * Counts for a type with nothing in it are still drawn: "0 reels" is
 * information, and leaving it out would imply the type is unsupported.
 */

import { useLanguage } from "../../i18n/LanguageContext";
import { fill } from "../../i18n/resourceCopy";
import { resourceMeta } from "../resourceTypes";
import { formatDate } from "../resourceUtils";

function Stat({ value, label, tone }) {
  return (
    <article className={`res-stat${tone ? ` res-stat--${tone}` : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

/** A short "something needs a look" list, shared by both panels below. */
function MiniList({ items, copy, onEdit, formatSubtitle }) {
  return (
    <ul className="res-admin-mini">
      {items.map((item) => (
        <li key={item.id}>
          <span className={`res-status res-status--${item.status}`}>
            {copy.status?.[item.status] || copy.unknownStatus}
          </span>
          <div>
            <strong>{item.title}</strong>
            <small>{formatSubtitle(item)}</small>
          </div>
          <button
            type="button"
            className="res-icon-btn"
            onClick={() => onEdit(item)}
            aria-label={fill(copy.editResource, { title: item.title })}
          >
            <FileText size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ResourceDashboard({ onEdit, onNew, loading, overview }) {
  const { t, language } = useLanguage();
  const copy = t.resources.admin;

  if (loading && !overview) {
    return (
      <div className="res-admin-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="res-stat" key={index} aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (!overview) return null;

  const totals = overview.totals || {};

  return (
    <div className="res-admin-dashboard">
      <div className="res-admin-grid">
        <Stat value={totals.total ?? 0} label={copy.statTotal} />
        <Stat value={totals.published ?? 0} label={copy.statPublished} tone="live" />
        <Stat value={totals.draft ?? 0} label={copy.statDraft} tone="draft" />
        <Stat
          value={totals.scheduled ?? 0}
          label={copy.statScheduled}
          tone="scheduled"
        />
        <Stat value={totals.featured ?? 0} label={copy.statFeatured} tone="featured" />
        <Stat value={totals.trashed ?? 0} label={copy.statTrashed} tone="trash" />
      </div>

      <section className="res-admin-panel">
        <h3>{copy.byType}</h3>
        <div className="res-admin-typerow">
          {(overview.by_type || []).map((entry) => {
            const Icon = resourceMeta(entry.type).icon;
            return (
              <div className="res-admin-typechip" key={entry.type}>
                <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                <span>{t.resources.types?.[entry.type] || entry.type}</span>
                <b>
                  {entry.published}/{entry.total}
                </b>
              </div>
            );
          })}
        </div>
      </section>

      {overview.attention?.length > 0 && (
        <section className="res-admin-panel">
          <h3>{copy.needsAttention}</h3>
          <MiniList
            items={overview.attention}
            copy={copy}
            onEdit={onEdit}
            formatSubtitle={(item) =>
              t.resources.singularTypes?.[item.type] || item.type
            }
          />
        </section>
      )}

      <section className="res-admin-panel">
        <h3>{copy.recentlyUpdated}</h3>
        {overview.updated?.length ? (
          <MiniList
            items={overview.updated}
            copy={copy}
            onEdit={onEdit}
            formatSubtitle={(item) =>
              item.updated_at ? formatDate(item.updated_at, language) : ""
            }
          />
        ) : (
          <div className="res-admin-panel-foot">
            <p className="res-admin-hint">{copy.nothingYet}</p>
            <button
              type="button"
              className="res-btn res-btn--primary"
              onClick={onNew}
            >
              {copy.tabNew}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}