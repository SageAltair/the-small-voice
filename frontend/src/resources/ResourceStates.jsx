import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * The three states every Resources list can be in.
 *
 * They live together because they have to look like part of the same system:
 * a skeleton shaped like the card it replaces, an empty state that says what
 * to do next, and an error state that offers a way out rather than just
 * reporting that something broke.
 */

import { useLanguage } from "../i18n/LanguageContext";

/** Placeholder cards while a rail or grid loads. */
export function ResourceSkeleton({ count = 6 }) {
  return (
    <div className="res-skeleton-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="res-skeleton" key={index}>
          <div className="res-skeleton-media" />
          <div className="res-skeleton-line res-skeleton-line--mid" />
          <div className="res-skeleton-line res-skeleton-line--short" />
        </div>
      ))}
    </div>
  );
}

/** Announced to assistive technology while content loads. */
export function ResourceLoading({ message, count = 6 }) {
  const { t } = useLanguage();
  return (
    <>
      <p className="visually-hidden" role="status">
        {message || t.resources.loading}
      </p>
      <ResourceSkeleton count={count} />
    </>
  );
}

export function ResourceEmpty({
  title,
  message,
  action,
  children,
}) {
  const { t } = useLanguage();

  return (
    <div className="res-state">
      <h3>{title || t.resources.emptyTitle}</h3>
      <p>{message || t.resources.emptyBody}</p>
      {action}
      {children}
    </div>
  );
}

export function ResourceError({ message, onRetry, children }) {
  const { t } = useLanguage();

  return (
    <div className="res-state res-state--error" role="alert">
      <AlertTriangle size={26} aria-hidden="true" />
      <h3>{t.resources.errorTitle}</h3>
      <p>{message || t.resources.errorBody}</p>
      {onRetry && (
        <button type="button" className="res-btn" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" />
          {t.resources.retry}
        </button>
      )}
      {children}
    </div>
  );
}

/** The 404 shown when a resource is missing, unpublished or mistyped. */
export function ResourceNotFound({ children }) {
  const { t } = useLanguage();

  return (
    <div className="res-state">
      <h1>{t.resources.notFoundTitle}</h1>
      <p>{t.resources.notFoundBody}</p>
      {children}
    </div>
  );
}

export default ResourceSkeleton;