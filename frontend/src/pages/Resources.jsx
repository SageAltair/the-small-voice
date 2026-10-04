import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * The Resources homepage.
 *
 * Two modes in one page, chosen by whether anything is filtered:
 *
 * - Nothing filtered: a curated shelf. One section per resource type holding
 *   the handful of items an editor has chosen, with a text link to the full
 *   listing. A type with nothing published is absent entirely, so the page
 *   never opens with an empty heading.
 * - Anything filtered: a single flat grid of results, which is what a reader
 *   who typed something or picked a type actually wants - not nine sections
 *   each with one unrelated item in it.
 *
 * That is the same behaviour Stories has for its category filter, and the same
 * furniture too: one category select and one search box, no toolbar. Sections,
 * their order and their contents all come from the API, so what an
 * administrator publishes is what a visitor sees - nothing here is hard-coded.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import {
  getResourceHome,
  getResourceTypes,
  listResources,
} from "../services/api";
import ResourceCard from "../resources/ResourceCard";
import { RESOURCE_TYPES, resourceMeta } from "../resources/resourceTypes";
import {
  ResourceEmpty,
  ResourceError,
  ResourceLoading,
} from "../resources/ResourceStates";
import SearchBar from "../components/SearchBar";
import "../resources/resources.css";

const PAGE_SIZE = 6;

function Section({ section }) {
  const { t } = useLanguage();
  const meta = resourceMeta(section.type);
  const Icon = meta.icon;

  return (
    <section className="res-section" aria-labelledby={`res-${section.type}`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
            {t.resources.singularTypes?.[section.type] || section.type}
          </p>
          <h2 id={`res-${section.type}`}>
            {t.resources.types?.[section.type] || section.type}
          </h2>
          <p>{t.resources.typeDescriptions?.[section.type]}</p>
        </div>

        {/* A text link, not a button in a box. A row of boxed buttons is what
            made this page read as a toolbar rather than a shelf. */}
        <Link
          to={`/resources/${section.type}`}
          className="text-link"
          aria-label={`${t.resources.viewAll} ${t.resources.types?.[section.type]}`}
        >
          {t.resources.viewAll}
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="grid">
        {section.items.map((item) => (
          <ResourceCard key={item.id} resource={item} compact />
        ))}
      </div>
    </section>
  );
}

export default function Resources() {
  const { t, language } = useLanguage();
  const [params, setParams] = useSearchParams();

  // The URL owns the filters, exactly as it does on Stories and on the browse
  // page, so a filtered shelf can be linked to and the back button works.
  const type = params.get("type") || "";
  const query = params.get("q") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const filtered = Boolean(type || query);

  const [attempt, setAttempt] = useState(0);
  const [counts, setCounts] = useState({});

  /* Loading is derived by comparing the request that was asked for with the one
     that came back, rather than by flipping a flag inside the effect. That way
     changing a filter never briefly shows the previous filter's results next to
     a spinner, and a language switch cannot flash stale content. */
  const homeKey = `${language}:${attempt}`;
  const listKey = `${language}|${type}|${query}|${page}`;

  const [home, setHome] = useState({ key: "", data: null, error: "" });
  const [list, setList] = useState({ key: "", data: null, error: "" });

  useEffect(() => {
    let cancelled = false;

    getResourceHome(language)
      .then((data) => {
        if (!cancelled) setHome({ key: homeKey, data, error: "" });
      })
      .catch((err) => {
        if (!cancelled) setHome({ key: homeKey, data: null, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [language, attempt, homeKey]);

  // The full listing is only fetched once a filter is actually in play.
  useEffect(() => {
    if (!filtered) return undefined;

    let cancelled = false;

    listResources({ language, type, q: query, page, pageSize: PAGE_SIZE })
      .then((data) => {
        if (!cancelled) setList({ key: listKey, data, error: "" });
      })
      .catch((err) => {
        if (!cancelled) setList({ key: listKey, data: null, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [filtered, language, type, query, page, listKey]);

  /* The type counts let the category select say how much sits behind each
     option, the same way the Stories category select lists its options. */
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

  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);

      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });

      // Any filter change starts again at page one.
      if (!("page" in changes)) next.delete("page");

      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const shelf = home.data;
  const homeLoading = home.key !== homeKey;
  const homeError = home.error;

  const results = list.data;
  const listLoading = filtered && list.key !== listKey;
  const listError = list.error;

  const items = results?.items || [];
  const total = results?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function goToPage(nextPage) {
    update({ page: nextPage <= 1 ? "" : String(nextPage) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const hasShelf = shelf?.sections?.length > 0;

  return (
    <main className="container page">
      <header className="page-header">
        <p className="eyebrow">{t.resources.eyebrow}</p>
        <h1>{t.resources.title}</h1>
        <p>{t.resources.intro}</p>
      </header>

      {/* The same two controls Stories opens with - one category select and one
          search box. No chip row and no toolbar. */}
      <div className="stories-filters">
        <label htmlFor="home-resource-type" className="category-label">
          {t.resources.filterByType}
        </label>
        <select
          id="home-resource-type"
          className="category-select"
          value={type}
          onChange={(event) => update({ type: event.target.value })}
          aria-label={t.resources.filterByType}
        >
          <option value="">{t.resources.allTypes}</option>
          {RESOURCE_TYPES.filter((item) => !counts[item] || counts[item] > 0).map(
            (item) => (
              <option key={item} value={item}>
                {t.resources.types?.[item] || item}
                {counts[item] ? ` (${counts[item]})` : ""}
              </option>
            ),
          )}
        </select>
      </div>

      <SearchBar
        onSearch={(value) => update({ q: String(value || "").trim() })}
        searchLabel={t.resources.searchLabel}
        placeholder={t.resources.searchPlaceholder}
      />

      {/* ---- filtered: one grid of results, exactly as Stories shows ------- */}
      {filtered && (
        <>
          <p className="res-pagination-info" role="status">
            {query && (
              <>
                {t.resources.resultsFor} “{query}” ·{" "}
              </>
            )}
            {fill(t.resources.showing, {
              from: total ? (page - 1) * PAGE_SIZE + 1 : 0,
              to: Math.min(page * PAGE_SIZE, total),
              total,
            })}
          </p>

          {listLoading && <ResourceLoading count={PAGE_SIZE} />}

          {!listLoading && listError && (
            <ResourceError
              message={listError}
              onRetry={() => update({ page: String(page) })}
            />
          )}

          {!listLoading && !listError && items.length === 0 && (
            <ResourceEmpty
              title={t.resources.noResults}
              message={t.resources.noResultsHint}
              action={
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => update({ type: "", q: "" })}
                >
                  {t.resources.clearSearch}
                </button>
              }
            />
          )}

          {!listLoading && !listError && items.length > 0 && (
            <>
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
        </>
      )}

      {/* ---- unfiltered: the curated shelf -------------------------------- */}
      {!filtered && homeLoading && <ResourceLoading count={PAGE_SIZE} />}

      {!filtered && !homeLoading && homeError && (
        <ResourceError message={homeError} onRetry={() => setAttempt((v) => v + 1)}>
          <Link to="/resources/browse" className="button secondary">
            {t.resources.browseAll}
          </Link>
        </ResourceError>
      )}

      {!filtered && !homeLoading && !homeError && !hasShelf && (
        <ResourceEmpty>
          <Link to="/resources/browse" className="button secondary">
            {t.resources.browseAll}
          </Link>
        </ResourceEmpty>
      )}

      {!filtered && !homeLoading && !homeError && hasShelf && (
          <>
            {shelf.sections.map((section) => (
              <Section key={section.type} section={section} />
            ))}

            {/* Editor-promoted content across every type, so a short reel or a
                newly added document is never buried under its own section. */}
            {shelf.promoted?.length > 0 && (
              <section className="res-section" aria-labelledby="res-promoted">
                <div className="section-heading">
                  <h2 id="res-promoted">{t.resources.featured}</h2>
                  <Link
                    to="/resources/browse?sort=recommended"
                    className="text-link"
                  >
                    {t.resources.viewAll}
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>

                <div className="grid">
                  {shelf.promoted.slice(0, 3).map((item) => (
                    <ResourceCard key={item.id} resource={item} />
                  ))}
                </div>
              </section>
            )}

            {/* One way through to the whole library, as a line of text at the
                end of the page rather than a button parked under the hero. */}
            <p className="res-section-footer">
              <Link to="/resources/browse" className="text-link">
                {t.resources.browseAll}
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </p>
          </>
        )}
    </main>
  );
}
