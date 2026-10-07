import { Link } from "react-router-dom";
import { Download, Flame, Play, Sparkles } from "lucide-react";

/**
 * The one card, with nine faces.
 *
 * The type decides what the tile shows - a cover, a portrait book jacket, a
 * waveform, the quote's own words - and the aspect ratio that suits it. What
 * wraps it (title, meta, badges, hover, focus) is identical for every type,
 * which is what keeps the library reading as one collection rather than nine
 * separate grids that happen to share a page.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import { getImageUrl } from "../services/api";
import { resourceMeta } from "./resourceTypes";
import {
  cardAlt,
  cardImage,
  excerpt,
  formatDuration,
  formatMinutes,
  resourceHref,
} from "./resourceUtils";

/** The small type label in the corner of a tile. */
function TypeBadge({ resource, t }) {
  const meta = resourceMeta(resource.type);
  const Icon = meta.icon;
  const label = t.resources.singularTypes?.[resource.type] || resource.type;

  return (
    <span className="res-card-type">
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Featured / new / popular, each with an icon so colour is never the only cue. */
function CuratedBadges({ resource, t }) {
  const badges = [];

  if (resource.featured) {
    badges.push(
      <span className="res-badge res-badge--featured" key="featured">
        <Sparkles size={10} aria-hidden="true" />
        {t.resources.featured}
      </span>,
    );
  }

  if (resource.is_new) {
    badges.push(
      <span className="res-badge res-badge--new" key="new">
        {t.resources.isNew}
      </span>,
    );
  }

  if (resource.view_count > 0 && !resource.featured) {
    badges.push(
      <span className="res-badge res-badge--popular" key="popular">
        <Flame size={10} aria-hidden="true" />
        {t.resources.popular}
      </span>,
    );
  }

  if (!badges.length) return null;
  return <div className="res-card-badges">{badges}</div>;
}

/** A tile for a type that has no cover: the type's own icon, not a file glyph. */
function PlaceholderTile({ resource, t }) {
  const meta = resourceMeta(resource.type);
  const Icon = meta.icon;

  return (
    <div className="res-card-placeholder">
      <Icon size={26} strokeWidth={1.4} aria-hidden="true" />
      <span>{t.resources.singularTypes?.[resource.type] || resource.type}</span>
    </div>
  );
}

/**
 * A quote card shows the quote. A cover image instead would be the generic
 * card again, and the words are the whole point of the type.
 */
function QuoteTile({ resource }) {
  const text = resource.quote_text || resource.description;

  return (
    <div className="res-card-quote">
      <blockquote>
        <span aria-hidden="true">“</span>
        {excerpt(text, 150)}
      </blockquote>
      {resource.attribution && <cite>{resource.attribution}</cite>}
    </div>
  );
}

/**
 * An audio card has no cover to show, so it shows the shape of the sound. The
 * bars are decorative and hidden from assistive technology - the title and
 * duration already say everything a screen reader needs.
 */
function AudioTile() {
  return (
    <div className="res-card-audio">
      <div className="res-waveform" aria-hidden="true">
        {Array.from({ length: 28 }, (_, index) => (
          <i key={index} style={{ height: `${28 + ((index * 37) % 62)}%` }} />
        ))}
      </div>
    </div>
  );
}

export default function ResourceCard({ resource, compact = false }) {
  const { t } = useLanguage();

  if (!resource) return null;

  const meta = resourceMeta(resource.type);
  const type = resource.type || "document";
  const href = resourceHref(resource);
  const cover = getImageUrl(cardImage(resource));
  const title = resource.title || t.resources.singularTypes?.[type] || type;

  const isQuote = type === "quote";
  const isAudio = type === "audio";

  const minutes = formatMinutes(resource.duration);
  const Icon = meta.icon;
  const label = t.resources.singularTypes?.[type] || type;

  const summary =
    type === "book" && resource.page_count
      ? fill(t.resources.pages, { count: resource.page_count })
      : type === "carousel" && resource.slides?.length
        ? fill(t.resources.slides, { count: resource.slides.length })
        : excerpt(
            resource.excerpt || resource.description || resource.quote_text,
            compact ? 80 : 120,
          );

  return (
    /* The same `card` / `card-image` / `card-content` bones StoryCard uses, so
       a resource sits in the grid exactly where a story does. The only
       additions are inside the image, where the type has something to say. */
    <article className={`card res-card res-card--${type}`}>
      <div
        className={`res-card-media res-card-media--${meta.rail}`}
        /* `compact` is the homepage teaser: it sizes to a story card (see
           .home-reel-rail) instead of stretching to the reel's 9/16 ratio. */
        style={{ aspectRatio: isQuote || isAudio || compact ? undefined : meta.aspect }}
      >
        {isQuote && <QuoteTile resource={resource} />}

        {!isQuote && isAudio && <AudioTile />}

        {!isQuote && !isAudio && (cover ? (
          <img
            src={cover}
            alt={cardAlt(resource)}
            className="card-image res-card-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <PlaceholderTile resource={resource} t={t} />
        ))}

        <CuratedBadges resource={resource} t={t} />

        {resource.duration > 0 && (
          <span className="res-card-duration">
            {formatDuration(resource.duration)}
          </span>
        )}

        {(type === "video" || type === "reel") && (
          <div className="res-card-play">
            <span>
              <Play size={18} fill="currentColor" aria-hidden="true" />
            </span>
          </div>
        )}

        <TypeBadge resource={resource} t={t} />
      </div>

      <div className="card-content res-card-body">
        {/* The category eyebrow: the one place the type is named in words, so
            it carries the type's icon exactly as a story's category does. */}
        <p className="category">
          <Icon size={12} strokeWidth={1.8} aria-hidden="true" />
          {label}
        </p>

        <h2>
          <Link to={href}>{title}</Link>
        </h2>

        <p>{summary || t.resources.typeDescriptions?.[type] || ""}</p>

        <div className="res-card-meta">
          {minutes && <span>{fill(t.resources.minutes, { time: minutes })}</span>}
          {resource.author && (
            <span>{fill(t.resources.byAuthor, { author: resource.author })}</span>
          )}
          {resource.downloadable && (
            <span>
              <Download size={12} aria-hidden="true" />
              {t.resources.download}
            </span>
          )}
        </div>

        <Link to={href} className="text-link">
          {t.resources.readMore}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
