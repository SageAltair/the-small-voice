import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Maximize2,
  Search,
} from "lucide-react";

/**
 * A document viewer with the chrome a reader actually needs.
 *
 * PDFs are rendered by the browser's own viewer inside an iframe, with the
 * page and zoom pushed through the URL fragment. That is deliberate: it is
 * the only way to get real text selection, find-in-page and printing without
 * shipping a PDF engine to every reader, and it degrades to "open the file"
 * rather than to a blank frame where it is not available.
 *
 * Search is genuinely useful rather than decorative - the text is extracted
 * server-side, so it works on books as well as documents and never requires
 * loading the whole file into the page.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import {
  getDocumentPages,
  getResourceUrl,
  searchDocument,
} from "../services/api";

export default function DocumentViewer({
  resource,
  file,
  compact = false,
}) {
  const { t } = useLanguage();
  const frameRef = useRef(null);

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(resource?.page_count || 0);
  const [zoom, setZoom] = useState(100);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);

  const source = file || {
    external: Boolean(resource?.external_url) && !resource?.url,
    url: resource?.media_url || resource?.url,
    kind: /\.pdf($|\?)/i.test(resource?.media_url || resource?.url || "")
      ? "pdf"
      : "document",
  };

  const isPdf = source?.kind === "pdf" && !source.external;

  /* The page count comes from the API rather than being guessed from the file
     extension, because a PDF the server could not open still needs a viewer.
     A fetch in an effect is the right shape here: the count is genuinely
     external state the component cannot know until it arrives. */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isPdf || !resource?.id) return;
      try {
        const result = await getDocumentPages(resource.id);
        if (!cancelled && result?.page_count) setPages(result.page_count);
      } catch {
        // A page count is a nicety; the viewer works without it.
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isPdf, resource?.id]);

  async function runSearch(event) {
    event.preventDefault();
    const term = query.trim();

    if (!term || !resource?.id) {
      setHits([]);
      return;
    }

    try {
      const result = await searchDocument(resource.id, term, resource?.language);
      setHits(result?.matches || []);
      if (result?.matches?.length) {
        // Jump straight to the first hit: making the reader find their own
        // search result is exactly the friction this control removes.
        setPage(result.matches[0].page);
      }
    } catch {
      setHits([]);
    }
  }

  function openFullscreen() {
    const element = frameRef.current;
    if (!element) return;
    if (element.requestFullscreen) element.requestFullscreen().catch(() => {});
  }
if (!source?.url) {
    return (
      <div className="res-viewer">
        <div className="res-state" style={{ border: 0 }}>
          <p>{t.resources.documentCannotPreview}</p>
          <p>{t.resources.documentCannotPreviewHint}</p>
        </div>
      </div>
    );
  }

  if (source.external) {
    // An external document has nothing of ours to render, so it is offered
    // plainly rather than being put in an empty frame.
    return (
      <div className="res-viewer">
        <div className="res-state" style={{ border: 0 }}>
          <p>{t.resources.documentCannotPreview}</p>
          <a
            className="res-btn res-btn--primary"
            href={getResourceUrl(source.url)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} aria-hidden="true" />
            {t.resources.openDocument}
          </a>
        </div>
      </div>
    );
  }

  const url = getResourceUrl(source.url);

  return (
    <div className="res-viewer">
      <div className="res-doc">
        {!compact && (
          <div className="res-doc-toolbar">
            <form className="res-doc-search" onSubmit={runSearch} role="search">
              <Search size={15} aria-hidden="true" />
              <label className="visually-hidden" htmlFor="doc-search">
                {t.resources.documentSearch}
              </label>
              <input
                id="doc-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.resources.documentSearchPlaceholder}
              />
            </form>

            {pages > 0 && (
              <span className="res-doc-page-label">
                {fill(t.resources.documentPage, { current: page, total: pages })}
              </span>
            )}
          </div>
        )}

        {isPdf ? (
          <>
            {!compact && (
              <div className="res-doc-toolbar">
                <button
                  type="button"
                  className="res-btn"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft size={15} aria-hidden="true" />
                  {t.resources.previous}
                </button>

                <button
                  type="button"
                  className="res-btn"
                  onClick={() =>
                    setPage((value) => Math.min(pages || value + 1, value + 1))
                  }
                  disabled={pages > 0 && page >= pages}
                >
                  {t.resources.next}
                  <ChevronRight size={15} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  className="res-icon-btn"
                  onClick={() => setZoom((value) => Math.max(50, value - 25))}
                  aria-label={t.resources.zoomOut}
                >
                  <span aria-hidden="true">−</span>
                </button>

                <button
                  type="button"
                  className="res-btn res-btn--ghost"
                  onClick={() => setZoom(100)}
                >
                  {zoom}%
                </button>

                <button
                  type="button"
                  className="res-icon-btn"
                  onClick={() => setZoom((value) => Math.min(300, value + 25))}
                  aria-label={t.resources.zoomIn}
                >
                  <span aria-hidden="true">+</span>
                </button>

                <button
                  type="button"
                  className="res-icon-btn"
                  onClick={openFullscreen}
                  aria-label={t.resources.fullscreen}
                >
                  <Maximize2 size={15} aria-hidden="true" />
                </button>
              </div>
            )}

            <div className="res-doc-frame">
              <iframe
                ref={frameRef}
                src={`${url}#page=${page}&zoom=${zoom}&view=FitH`}
                title={resource?.title || t.resources.openDocument}
              />
            </div>

            {!compact && query.trim() && (
              <div>
                <p className="res-doc-page-label">
                  {hits.length
                    ? fill(t.resources.documentSearchResults, { count: hits.length })
                    : t.resources.documentSearchNoResults}
                </p>

                {hits.length > 0 && (
                  <ul className="res-doc-hits">
                    {hits.map((hit) => (
                      <li key={hit.page}>
                        <button type="button" onClick={() => setPage(hit.page)}>
                          <strong>
                            {fill(t.resources.documentPage, {
                              current: hit.page,
                              total: pages || hit.page,
                            })}
                          </strong>
                          <small>{hit.snippet}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : (
          /*
           * Anything the browser cannot display gets an honest fallback: a
           * clear explanation and a way to open or download it, rather than
           * an empty frame that looks broken.
           */
          <div className="res-state" style={{ border: 0 }}>
            <p>{t.resources.documentCannotPreview}</p>
            <p>{t.resources.documentCannotPreviewHint}</p>
            <div
              className="res-detail-actions"
              style={{ justifyContent: "center" }}
            >
              <a
                className="res-btn res-btn--primary"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} aria-hidden="true" />
                {t.resources.openDocument}
              </a>
              <a className="res-btn" href={url} download>
                <Download size={15} aria-hidden="true" />
                {t.resources.download}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
