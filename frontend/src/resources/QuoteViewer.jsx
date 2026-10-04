/**
 * A quote, treated as a quote.
 *
 * Not an article and not a card: the words are the entire content, so they are
 * set large, centred, and given the room to be read rather than skimmed. A
 * background image is used as a quiet wash behind them, never as a
 * competitor - the scrim exists so the text stays legible whatever image an
 * editor chose.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import { getImageUrl } from "../services/api";

export default function QuoteViewer({ resource }) {
  const { t } = useLanguage();

  const text = resource?.quote_text || resource?.description || resource?.title;
  const author =
    resource?.attribution ||
    (resource?.type === "quote" ? resource?.author : null);

  // The resource's own cover doubles as the background wash; an editor can
  // leave it blank and the quote simply sits on the surface.
  const backdrop = getImageUrl(resource?.cover_url || null);

  if (!text) {
    return (
      <div className="res-viewer">
        <div className="res-state" style={{ border: 0 }}>
          <p>{t.resources.emptyBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="res-viewer">
      <figure className="res-quote">
        {backdrop && (
          <div className="res-quote-backdrop" aria-hidden="true">
            <img src={backdrop} alt="" loading="lazy" />
          </div>
        )}

        <div className="res-quote-inner">
          <blockquote className="res-quote-text">
            <span className="res-quote-mark" aria-hidden="true">
              “
            </span>
            {text}
          </blockquote>

          {author && (
            <figcaption className="res-quote-byline">
              {fill(t.resources.quoteByline, { author })}
            </figcaption>
          )}
        </div>
      </figure>

      {resource?.description &&
        resource.description !== text && (
          <div className="res-viewer-caption">
            <p>{resource.description}</p>
          </div>
        )}
    </div>
  );
}