/**
 * One resource as an independent media post — not a boxed card.
 *
 * The boundary exists structurally (an <article>) but is visually invisible:
 * no borders, no card backgrounds, no shadows, no rounded containers. Media
 * keeps its own boundary; the type eyebrow, title and description carry the
 * hierarchy; the like/comment/share/save row from the spec sits underneath;
 * a hairline separator groups one post from the next.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext";
import { getImageUrl } from "../services/api";
import { resourceMeta } from "./resourceTypes";
import { cardAlt, excerpt, formatMinutes, resourceHref } from "./resourceUtils";
import { fill } from "../i18n/resourceCopy";
import FeedMedia from "./FeedMedia";
import ResourceShare, { ResourceDownload } from "./ResourceShare";
import QuoteViewer from "./QuoteViewer";

function FeedActionRow({ resource }) {
  const { t } = useLanguage();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const count = Number(resource?.view_count) || 0;

  return (
    <div className="feed-actions" role="group" aria-label={resource?.title}>
      <button
        type="button"
        className="feed-action"
        data-active={liked || undefined}
        onClick={() => setLiked((v) => !v)}
        aria-pressed={liked}
        aria-label={t.resources.like || "Like"}
      >
        <Heart size={18} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
      </button>
      <Link
        className="feed-action"
        to={resourceHref(resource)}
        aria-label={t.resources.comments || "Comments"}
      >
        <MessageCircle size={18} aria-hidden="true" />
      </Link>
      <ResourceShare resource={resource} iconOnly />
      <ResourceDownload resource={resource} iconOnly />
      <span className="feed-action-spacer" />
      <button
        type="button"
        className="feed-action"
        data-active={saved || undefined}
        onClick={() => setSaved((v) => !v)}
        aria-pressed={saved}
        aria-label={t.resources.save || "Save"}
      >
        <Bookmark size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      </button>
      <button type="button" className="feed-action" aria-label={t.resources.more || "More options"}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {count > 0 && <span className="feed-action-count">{count}</span>}
    </div>
  );
}

export default function ResourceFeedItem({ resource }) {
  const { t } = useLanguage();
  const meta = resourceMeta(resource?.type);
  const Icon = meta.icon;
  const href = resourceHref(resource);
  const minutes = formatMinutes(resource?.duration);
  const label = t.resources.singularTypes?.[resource?.type] || resource?.type;
  const summary = excerpt(resource?.excerpt || resource?.description || resource?.quote_text, 220);
  const cover = getImageUrl(resource?.cover_url || null);
  const type = resource?.type || "document";
  const textOnly = type === "quote" || type === "book" || type === "document";

  return (
    <article className={`feed-item feed-item--${type}`}>
      <header className="feed-item-head">
        <span className="feed-item-eyebrow">
          <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
          {label}
          {minutes && <span className="feed-item-minutes"> · {fill(t.resources.minutes, { time: minutes })}</span>}
          {resource?.author && <span className="feed-item-author"> · {resource.author}</span>}
        </span>
        <Link to={href} className="feed-item-overflow" aria-label={t.resources.more || "More options"} tabIndex={-1}>
          <MoreHorizontal size={16} aria-hidden="true" />
        </Link>
      </header>

      <FeedMedia resource={resource} />

      {/* Text-only types have no inline player; quotes render their own words
          and books/documents show a cover or title block instead. */}
      {textOnly && type === "quote" && (
        <div className="feed-quote">
          <QuoteViewer resource={resource} />
        </div>
      )}
      {textOnly && type !== "quote" && cover && (
        <Link to={href} className="feed-doc-cover" aria-label={resource?.title}>
          <img src={cover} alt={cardAlt(resource)} loading="lazy" />
        </Link>
      )}

      <div className="feed-item-body">
        <h2 className="feed-item-title">
          <Link to={href}>{resource?.title}</Link>
        </h2>
        {summary && <p className="feed-item-description">{summary}</p>}
      </div>

      <FeedActionRow resource={resource} />
    </article>
  );
}

// Re-exported so browse pages share one import for the icon row.
export { Send };
