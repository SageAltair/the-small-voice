import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * An image viewer, and an infographic viewer with a different first move.
 *
 * They share a zoomable stage because the mechanics are the same, but the
 * intent is not. A photograph is something you look at, so it fills the frame
 * and centres. An infographic is something you read, so it starts fitted at a
 * readable size rather than cropped, and zooming is a deliberate act the
 * reader chooses - because an infographic shrunk into a thumbnail is exactly
 * the thing that makes infographics useless.
 *
 * Zoom is a transform rather than a width, so panning stays smooth without
 * the browser re-laying out a large image on every pointer move.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import { getImageUrl } from "../services/api";
import { galleryImages } from "./resourceUtils";

const STEPS = [1, 1.5, 2, 3, 4];

export default function ImageViewer({ resource, infographic = false }) {
  const { t } = useLanguage();
  const stageRef = useRef(null);

  const images = galleryImages(resource);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [dragging, setDragging] = useState(false);

  const current = images[index];
  const zoom = STEPS[step];

  function zoomIn() {
    setStep((value) => Math.min(STEPS.length - 1, value + 1));
  }

  function zoomOut() {
    setStep((value) => Math.max(0, value - 1));
  }

  /* While zoomed, a drag pans the image. The offset lives on the element via
     a CSS variable rather than in React state, because it changes on every
     pointer move and re-rendering for each one is what makes this janky. */
  function onPointerDown(event) {
    if (zoom === 1) return;
    const stage = stageRef.current;
    if (!stage) return;

    stage.setPointerCapture(event.pointerId);
    setDragging(true);

    let lastX = event.clientX;
    let lastY = event.clientY;

    function move(moveEvent) {
      stage.scrollLeft -= moveEvent.clientX - lastX;
      stage.scrollTop -= moveEvent.clientY - lastY;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
    }

    function up() {
      setDragging(false);
      stage.releasePointerCapture?.(event.pointerId);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
    }

    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
  }

  if (!current) {
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
        ref={stageRef}
        className={`res-image-stage${infographic ? " res-image-stage--tall res-image-stage--fit" : ""}`}
        onPointerDown={onPointerDown}
      >
        <img
          src={getImageUrl(current.url)}
          alt={current.alt || resource?.title || ""}
          style={{ "--res-zoom": zoom }}
          className={zoom > 1 ? `is-zoomed${dragging ? " is-dragging" : ""}` : ""}
          onClick={() => (zoom > 1 ? null : zoomIn())}
          loading="eager"
        />
      </div>

      <div className="res-image-controls">
        {images.length > 1 && (
          <span className="res-image-counter">
            {fill(t.resources.imageCounter, {
              current: index + 1,
              total: images.length,
            })}
          </span>
        )}

        <button
          type="button"
          className="res-icon-btn"
          onClick={zoomOut}
          disabled={step === 0}
          aria-label={t.resources.zoomOut}
        >
          <Minus size={15} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="res-btn res-btn--ghost"
          onClick={() => setStep(0)}
          aria-label={t.resources.resetZoom}
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          className="res-icon-btn"
          onClick={zoomIn}
          disabled={step === STEPS.length - 1}
          aria-label={t.resources.zoomIn}
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      </div>

      {images.length > 1 && (
        <div className="res-image-thumbs">
          {images.map((item, itemIndex) => (
            <button
              key={itemIndex}
              type="button"
              onClick={() => setIndex(itemIndex)}
              aria-current={itemIndex === index}
              aria-label={fill(t.resources.imageCounter, {
                current: itemIndex + 1,
                total: images.length,
              })}
            >
              <img src={getImageUrl(item.url)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {current.caption && (
        <div className="res-viewer-caption">
          <p>{current.caption}</p>
        </div>
      )}
    </div>
  );
}