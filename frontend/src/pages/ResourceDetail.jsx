import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Clock } from "lucide-react";

/**
 * A resource detail page.
 *
 * One page serves all nine types; the viewer below the header is chosen by
 * the resource's type, so a book opens in a reader, a quote fills the screen
 * and a video gets a player. Everything around it - breadcrumbs, metadata,
 * share, related - is the same for every type, which is what keeps the nine
 * experiences feeling like one product rather than nine separate pages.
 *
 * The route is `/resources/:type/:slug`. The type is part of the URL because
 * it is a promise about what the reader is about to get; when it does not
 * match what is actually stored, the API answers 404 rather than quietly
 * serving something else.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import { getResource, recordResourceView } from "../services/api";
import RelatedResources from "../resources/RelatedResources";
import ResourceShare, { ResourceDownload } from "../resources/ResourceShare";
import ResourceViewer from "../resources/ResourceViewer";
import {
  ResourceError,
  ResourceLoading,
  ResourceNotFound,
} from "../resources/ResourceStates";
import { resourceMeta } from "../resources/resourceTypes";
import {
  formatDate,
  formatDuration,
  formatMinutes,
} from "../resources/resourceUtils";
import "../resources/resources.css";

/** The one detail panel, beside the viewer on a wide screen. */
function DetailPanel({ resource }) {
  const { t, language } = useLanguage();
  const meta = resourceMeta(resource.type);
  const Icon = meta.icon;

  const minutes = formatMinutes(resource.duration);
  const published = resource.published_at
    ? formatDate(resource.published_at, language)
    : "";

  return (
    <div className="res-detail-rail">
      <section className="res-panel">
        <h3>
          <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
          {t.resources.singularTypes?.[resource.type] || resource.type}
        </h3>

        <dl>
          {resource.author && (
            <>
              <dt>{t.resources.byAuthor.replace("{author}", "").trim()}</dt>
              <dd>{resource.author}</dd>
            </>
          )}

          {minutes && (
            <>
              <dt>{t.resources.minutes.replace("{time}", "").trim()}</dt>
              <dd>
                <Clock size={12} aria-hidden="true" /> {minutes}
              </dd>
            </>
          )}

          {resource.duration > 0 && (
            <>
              <dt>Length</dt>
              <dd>{formatDuration(resource.duration)}</dd>
            </>
          )}

          {resource.page_count > 0 && (
            <>
              <dt>{fill(t.resources.pages, { count: "" }).trim()}</dt>
              <dd>{resource.page_count}</dd>
            </>
          )}

          {published && (
            <>
              <dt>{t.resources.publishedOn.replace("{date}", "").trim()}</dt>
              <dd>{published}</dd>
            </>
          )}

          {resource.language && (
            <>
              <dt>{t.resources.languageLabel}</dt>
              <dd>{resource.language === "sw" ? t.swahili : t.english}</dd>
            </>
          )}
        </dl>
      </section>

      {(resource.topic || resource.tags?.length > 0) && (
        <section className="res-panel">
          {resource.topic && (
            <>
              <h3>{t.resources.topicsLabel}</h3>
              <div className="res-tag-list">
                <Link
                  className="res-tag"
                  to={`/resources/browse?topic=${encodeURIComponent(resource.topic)}`}
                >
                  {resource.topic}
                </Link>
              </div>
            </>
          )}

          {resource.tags?.length > 0 && (
            <>
              <h3 style={{ marginTop: resource.topic ? 16 : 0 }}>
                {t.resources.tagsLabel}
              </h3>
              <div className="res-tag-list">
                {resource.tags.map((tag) => (
                  <Link
                    key={tag}
                    className="res-tag"
                    to={`/resources/browse?tag=${encodeURIComponent(tag)}`}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default function ResourceDetail() {
  const { type, slug } = useParams();
  const { t, language } = useLanguage();

  const [siblings, setSiblings] = useState([]);
  const [result, setResult] = useState({
    key: "",
    resource: null,
    error: "",
    missing: false,
  });

  /* Loading is derived by comparing the request that was asked for with the
     one that came back, rather than by resetting state inside the effect. That
     way switching from one resource straight to another never flashes the
     first one's content while the second loads. */
  const requestKey = `${type}|${slug}|${language}`;

  useEffect(() => {
    let cancelled = false;

    getResource(type, slug, language)
      .then((data) => {
        if (cancelled) return;
        setResult({ key: requestKey, resource: data, error: "", missing: false });

        // The page title and description are what a shared link previews and
        // what a search engine indexes, so they are set as soon as the
        // resource is known rather than left to a generic default.
        document.title = `${data.title} · ${t.resources.eyebrow} · The Small Voice`;

        const meta = document.querySelector('meta[name="description"]');
        if (meta && data.description) {
          meta.setAttribute("content", data.description.slice(0, 160));
        }

        // Only a reel's feed wants its siblings, so this extra request is
        // made for that one type rather than for every detail page.
        if (data.type === "reel") {
          import("../services/api")
            .then(({ listResources }) =>
              listResources({ language, type: "reel", pageSize: 6 }),
            )
            .then((more) => {
              if (!cancelled) setSiblings(more.items || []);
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // A 404 is a real answer ("this is not published"), not a failure, so
        // it gets its own page rather than the retry-an-error treatment.
        setResult({
          key: requestKey,
          resource: null,
          error: err.status === 404 ? "" : err.message,
          missing: err.status === 404,
        });
      });

    return () => {
      cancelled = true;
      document.title = "The Small Voice";
    };
  }, [type, slug, language, t.resources.eyebrow, requestKey]);

  const loading = result.key !== requestKey;
  const resource = result.resource;
  const error = result.error;
  const missing = result.missing;

  // Views are counted once per open, and the result is deliberately ignored: a
  // visitor should never wait on, or even see, an analytics call.
  useEffect(() => {
    if (resource?.id) recordResourceView(resource.id);
  }, [resource?.id]);

  if (loading) {
    return (
      <div className="res-detail container">
        <div style={{ paddingTop: 48 }}>
          <ResourceLoading count={3} />
        </div>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="res-detail container">
        <ResourceNotFound>
          <Link to="/resources" className="res-btn res-btn--primary">
            {t.resources.backToResources}
          </Link>
        </ResourceNotFound>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="res-detail container">
        <ResourceError message={error}>
          <Link to="/resources" className="res-btn">
            {t.resources.backToResources}
          </Link>
        </ResourceError>
      </div>
    );
  }

  const hasRail = Boolean(
    resource.author ||
      resource.topic ||
      resource.tags?.length ||
      resource.page_count ||
      resource.published_at ||
      resource.language,
  );

  return (
    <div className="res-detail">
      <div className="container">
        <nav className="res-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/resources">{t.resources.eyebrow}</Link>
          <ChevronRight size={12} aria-hidden="true" />
          <Link to={`/resources/${resource.type}`}>
            {t.resources.types?.[resource.type] || resource.type}
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span aria-current="page">{resource.title}</span>
        </nav>

        <header className="res-detail-header">
          <h1>{resource.title}</h1>

          {(resource.excerpt || resource.description) && (
            <p>{resource.excerpt || resource.description}</p>
          )}

          <div className="res-detail-actions">
            <ResourceShare resource={resource} title={resource.title} />
            <ResourceDownload resource={resource} />
          </div>
        </header>

        <div
          className={`res-detail-layout${
            hasRail ? " res-detail-layout--with-rail" : ""
          }`}
        >
          <div>
            <ResourceViewer resource={resource} siblings={siblings} />

            {/* A quote already shows its words in full, so repeating the
                description underneath would be saying it twice. */}
            {resource.type !== "quote" && resource.description && (
              <div className="res-viewer-caption" style={{ padding: 24 }}>
                <p>{resource.description}</p>
              </div>
            )}

            <RelatedResources items={resource.related} />
          </div>

          {hasRail && <DetailPanel resource={resource} />}
        </div>
      </div>
    </div>
  );
}
