import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * One carousel is one Resource with an ordered set of slides - not a stack of
 * separate resources.
 *
 * The track is a flex row of full-width slides whose position is derived from
 * the current index, so the transition reads as turning a page. Every way of
 * navigating - arrows, dots, keyboard, swipe - ends on the same index, because
 * all of them call the same `go`.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import { getImageUrl } from "../services/api";

export default function CarouselViewer({ resource }) {
  const { t } = useLanguage();
  const trackRef = useRef(null);

  const slides = (resource?.slides || []).filter((slide) => slide.image_url);
  const [index, setIndex] = useState(0);

  const total = slides.length;
  const slide = slides[index];

  const go = useCallback(
    (next) => {
      setIndex(total ? (next + total) % total : 0);
    },
    [total],
  );

  function onKeyDown(event) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      go(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      go(total - 1);
    }
  }

  if (!total) {
    return (
      <div className="res-viewer">
        <div className="res-state" style={{ border: 0 }}>
          <p>{t.resources.emptyBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="res-viewer res-viewer--media">
      <div
        className="res-carousel-frame"
        tabIndex={0}
        onKeyDown={onKeyDown}
        role="group"
        aria-roledescription="carousel"
        aria-label={resource?.title}
      >
        <div
          className="res-carousel-track"
          ref={trackRef}
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((item, itemIndex) => (
            <img
              key={item.id ?? itemIndex}
              src={getImageUrl(item.image_url)}
              alt={item.alt_text || ""}
              loading={itemIndex === 0 ? "eager" : "lazy"}
              aria-hidden={itemIndex !== index}
            />
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              className="res-carousel-arrow res-carousel-arrow--prev"
              onClick={() => go(index - 1)}
              aria-label={t.resources.previousSlide}
            >
              <ChevronLeft size={19} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="res-carousel-arrow res-carousel-arrow--next"
              onClick={() => go(index + 1)}
              aria-label={t.resources.nextSlide}
            >
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          </>
        )}

        {(slide?.text || slide?.caption) && (
          <div className="res-carousel-caption">
            {slide.text && <p>{slide.text}</p>}
            {slide.caption && <small>{slide.caption}</small>}
          </div>
        )}
      </div>

      {total > 1 && (
        <>
          <div className="res-carousel-dots" role="tablist">
            {slides.map((item, itemIndex) => (
              <button
                key={item.id ?? itemIndex}
                type="button"
                role="tab"
                aria-current={itemIndex === index}
                aria-label={fill(t.resources.slideCounter, {
                  current: itemIndex + 1,
                  total,
                })}
                onClick={() => go(itemIndex)}
              />
            ))}
          </div>

          <p className="res-carousel-hint">
            {fill(t.resources.slideCounter, { current: index + 1, total })}
          </p>
        </>
      )}
    </div>
  );
}