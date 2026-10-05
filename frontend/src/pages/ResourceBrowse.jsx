import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Browse and search.
 *
 * One page serves the whole library, a single type, and a search result -
 * they differ only in which filters are set, and the URL is the single source
 * of truth for all of them. That means a filtered view can be linked to,
 * bookmarked and shared, and the back button behaves the way a reader
 * expects - none of which is true if the filters live only in component state.
 *
 * Filtering, sorting and pagination all happen server-side, so the page stays
 * quick whether the library holds ten resources or ten thousand.
 *
 * The chrome is deliberately the same furniture Stories uses - the same page
 * header, the same category select, the same search form, the same card grid
 * and the same pagination. Resources is a shelf in the same publication as
 * Stories, not a separate product, and reusing those pieces is what keeps it
 * reading that way instead of drifting into its own look.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import { usePreferences } from "../settings/PreferencesContext";
import {
  getResourceTypes,
  listResources,
} from "../services/api";
import ResourceCard from "../resources/ResourceCard";
import { RESOURCE_TYPES } from "../resources/resourceTypes";
import {
  ResourceEmpty,
  ResourceError,
  ResourceLoading,
} from "../resources/ResourceStates";
import SearchBar from "../components/SearchBar";
import "../resources/resources.css";

/** Six a page, matching Stories, so both shelves scan at the same pace. */
const PAGE_SIZE = 6;

/* The nine content-type preferences the settings page offers do not name
   themselves the way the API does: a reader who unticks "Images" means the
   photographs and the infographics alike, and "Video" covers reels too. This is
   the one place that mapping exists, so a new resource type has exactly one
   question to answer. */
const TYPE_PREFERENCE = {
  reel: "video",
  video: "video",
  audio: "audio",
  book: "practical",
  carousel: "images",
  image: "images",
  infographic: "images",
  quote: "articles",
  document: "practical",
};

const SORTS = [
  ["recommended", "sortRecommended"],
  ["newest", "sortNewest"],
  ["popular", "sortPopular"],
  ["title", "sortTitle"],
  ["oldest", "sortOldest"],
];

export default function ResourceBrowse() {
  const { t, language } = useLanguage();
  const { preferences } = usePreferences();
  const [params, setParams] = useSearchParams();

  // The URL owns the whole query state; nothing here is only in React state.
  const type = params.get("type") || "";
  const query = params.get("q") || "";
  const sort = params.get("sort") || "recommended";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [counts, setCounts] = useState({});
  const [result, setResult] = useState({ key: "", data: null, error: "" });

  /* Loading is derived by comparing the request that was asked for with the
     request that came back, rather than by flipping a flag inside the effect.
     That way changing a filter never briefly shows the previous filter's
     results next to a spinner. */
  const requestKey = `${language}|${type}|${query}|${sort}|${page}`;

  useEffect(() => {
    let cancelled = false;

    listResources({ language, type, q: query, sort, page, pageSize: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        setResult({ key: requestKey, data, error: "" });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, data: null, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [language, type, query, sort, page, requestKey]);

  const loading = result.key !== requestKey;
  const error = result.error;

  /* The type counts come from a small dedicated endpoint rather than from the
     listing, so the type filter can say how much sits behind each option
     without waiting for every result. */
  useEffect(() => {
    let cancelled = false;

    getResourceTypes(language)
      .then((data) => {
        if (cancelled) return;
        setCounts(
          Object.fromEntries(
            (data.types || []).map((entry) => [entry.type, entry.total]),
          ),
        );
      })
      .catch(() => {
        // The filter still works without counts; it just has no numbers.
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  /* One writer for the URL. Every filter writes through here so they combine
     rather than compete, and every view stays a shareable link. */
  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);

      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });

      // Any filter change starts again at page one; staying on page four of a
      // new filter is almost never what the reader meant.
      if (!("page" in changes)) next.delete("page");

      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const items = result.data?.items || [];
  const total = result.data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(type || query || sort !== "recommended");

  function goToPage(nextPage) {
    update({ page: nextPage <= 1 ? "" : String(nextPage) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearFilters() {
    update({ type: "", q: "", sort: "" });
  }

  const heading = type
    ? t.resources.types?.[type] || type
    : t.resources.browseAll;

  return (
    <main className="container page">
      <header className="page-header">
        <p className="eyebrow">{t.resources.eyebrow}</p>
        <h1>{heading}</h1>
        <p>{type ? t.resources.typeDescriptions?.[type] : t.resources.intro}</p>
      </header>

      {/* One row of plain controls, exactly as Stories does it. Both are native
          selects in the site's own style, so there is no toolbar of boxed
          buttons competing with the content. */}
      <div className="stories-filters">
        <label htmlFor="resource-type" className="category-label">
          {t.resources.filterByType}
        </label>
        <select
          id="resource-type"
          className="category-select"
          value={type}
          onChange={(event) => update({ type: event.target.value })}
          aria-label={t.resources.filterByType}
        >
          <option value="">{t.resources.allTypes}</option>
          {/* Settings > Content > Content you like narrows this filter to the
              kinds of material the reader has asked for. A type that is already
              active in the URL always stays on the list, so following a shared
              link can never land the reader on an empty page. */}
          {RESOURCE_TYPES.filter(
            (item) =>
              preferences.content.types[TYPE_PREFERENCE[item]] !== false &&
              (!counts[item] || counts[item] > 0),
          ).map(
            (item) => (
              <option key={item} value={item}>
                {t.resources.types?.[item] || item}
                {counts[item] ? ` (${counts[item]})` : ""}
              </option>
            ),
          )}
        </select>

        <label htmlFor="resource-sort" className="category-label">
          {t.resources.sortBy}
        </label>
        <select
          id="resource-sort"
          className="category-select"
          value={sort}
          onChange={(event) => update({ sort: event.target.value })}
          aria-label={t.resources.sortBy}
        >
          {SORTS.map(([value, key]) => (
            <option key={value} value={value}>
              {t.resources[key]}
            </option>
          ))}
        </select>
      </div>

      <SearchBar
        onSearch={(value) => update({ q: String(value || "").trim() })}
        searchLabel={t.resources.searchLabel}
        placeholder={t.resources.searchPlaceholder}
      />

      {loading && <ResourceLoading count={PAGE_SIZE} />}

      {!loading && error && (
        <ResourceError
          message={error}
          onRetry={() => update({ page: String(page) })}
        />
      )}

      {!loading && !error && items.length === 0 && (
        <ResourceEmpty
          title={query ? t.resources.noResults : undefined}
          message={query ? t.resources.noResultsHint : undefined}
          action={
            hasFilters ? (
              <button
                type="button"
                className="button secondary"
                onClick={clearFilters}
              >
                {t.resources.clearSearch}
              </button>
            ) : null
          }
        />
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <p className="res-pagination-info" role="status">
            {fill(t.resources.showing, {
              from: (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, total),
              total,
            })}
          </p>

          {/* The same three-up grid Stories uses, so the two shelves line up
              column for column. */}
          <div className="grid" style={{ marginTop: 18 }}>
            {items.map((item) => (
              <ResourceCard key={item.id} resource={item} />
            ))}
          </div>

          {pages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="button secondary"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                {t.resources.previous}
              </button>
              <span className="pagination-info">
                Page {page} of {pages}
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={page >= pages}
                onClick={() => goToPage(page + 1)}
              >
                {t.resources.next}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
