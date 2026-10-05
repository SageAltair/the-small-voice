import { useMemo, useRef } from "react";
import { Search, X } from "lucide-react";

import { copyAt } from "./sections";
import { searchSettings } from "./search";

/**
 * Search across the settings page.
 *
 * Settings pages grow quietly: every new preference adds a row, and soon nobody
 * can remember whether "Reduce motion" lives under Appearance or Accessibility.
 * Searching is the answer, and it has to be fast - so the index is a plain
 * module-level array and the filtering is a string scan over a few dozen rows,
 * with no debounce because there is nothing to debounce. See search.js.
 *
 * While a search is open the results replace the section, so there is one list
 * on screen to read rather than a list of results floating beside settings
 * nobody asked about.
 */
export default function SettingsSearch({ copy, query, onQueryChange, onPick, matchCount }) {
  const inputRef = useRef(null);
  const hasQuery = query.trim().length > 0;

  const results = useMemo(() => searchSettings(copy, query), [copy, query]);

  return (
    <div className="settings-search">
      <label className="visually-hidden" htmlFor="settings-search">
        {copy.searchLabel}
      </label>

      <div className="settings-search-field">
        <Search size={16} aria-hidden="true" />
        <input
          id="settings-search"
          ref={inputRef}
          type="search"
          value={query}
          placeholder={copy.searchPlaceholder}
          aria-describedby="settings-search-hint"
          autoComplete="off"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && hasQuery) {
              event.preventDefault();
              onQueryChange("");
            }
          }}
        />
        {hasQuery ? (
          <button
            type="button"
            className="settings-search-clear"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
          >
            <X size={14} aria-hidden="true" />
            <span className="visually-hidden">{copy.searchClear}</span>
          </button>
        ) : null}
      </div>

      <p id="settings-search-hint" className="settings-search-hint">
        {hasQuery ? copy.searchCount.replace("{count}", String(matchCount)) : copy.searchHint}
      </p>

      {/* A live region rather than a visible jump: the count is useful when
          screen-reading a long list, and noise when looking at it. */}
      <p className="visually-hidden" role="status">
        {hasQuery
          ? copy.searchResultsFor.replace("{query}", query.trim())
          : ""}
      </p>

      {hasQuery && matchCount === 0 ? (
        <div className="settings-search-empty">
          <p>{copy.searchEmpty.replace("{query}", query.trim())}</p>
          <p className="setting-hint">{copy.searchEmptyHint}</p>
        </div>
      ) : null}

      {matchCount > 0 ? (
        <div className="settings-search-results">
          <h2 className="settings-search-results-title">{copy.searchResults}</h2>
          {results.map(({ section, rows }) => (
            <div className="settings-search-group" key={section.id}>
              <h3>{copyAt(copy, section.labelKey)}</h3>
              <ul>
                {rows.map((row) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => onPick(row)}>
                      {copyAt(copy, row.labelKey)}
                      <span className="visually-hidden">
                        {copy.jumpTo.replace(
                          "{label}",
                          copyAt(copy, section.labelKey),
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}