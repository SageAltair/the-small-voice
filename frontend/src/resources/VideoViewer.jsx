import { useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";

/**
 * Full-bleed video with the controls a reader expects.
 *
 * The native `controls` attribute is the backbone: it is keyboard operable,
 * screen-reader labelled, and already knows about Picture-in-Picture and
 * casting on devices that support them. The custom buttons beside it add the
 * one thing native controls cannot do in this layout - a mute toggle that is
 * obvious at a glance.
 *
 * The detail page gives this component a `key` of the resource id, so opening
 * a different clip remounts it cleanly instead of needing an effect to reset
 * the position by hand.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { getImageUrl, getResourceUrl } from "../services/api";
import { excerpt } from "./resourceUtils";

export default function VideoViewer({ resource }) {
  const { t } = useLanguage();
  const frameRef = useRef(null);
  const videoRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  // Duration comes from the file once it loads; until then the value the API
  // already told us is the best estimate available.
  const [duration, setDuration] = useState(resource?.duration || 0);

  const src = getResourceUrl(resource?.media_url || resource?.url);
  const poster = getImageUrl(resource?.cover_url || null);
  const isPortrait = resource?.type === "reel";

  function toggle() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => setFailed(true));
    } else {
      video.pause();
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function openFullscreen() {
    const frame = frameRef.current;
    if (!frame) return;

    if (frame.requestFullscreen) {
      frame.requestFullscreen().catch(() => {});
      return;
    }
    if (frame.webkitRequestFullscreen) {
      frame.webkitRequestFullscreen();
    }
  }

  if (!src) {
    return (
      <div className="res-viewer">
        <div className="res-state" style={{ border: 0 }}>
          <p>{t.resources.videoUnavailable}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="res-viewer res-viewer--media">
      <div
        ref={frameRef}
        className={`res-video-frame${isPortrait ? " res-video-frame--portrait" : ""}`}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster || undefined}
          controls
          playsInline
          preload="metadata"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setProgress(event.currentTime)}
          onLoadedMetadata={(event) =>
            setDuration(event.currentTime ? duration : event.currentTarget.duration)
          }
          onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
          onError={() => setFailed(true)}
          aria-label={resource?.title || t.resources.singularTypes?.video}
        >
          {resource?.title}
        </video>

        {/* The overlay buttons sit on the frame but do not intercept the
            native controls, which occupy the bottom strip. */}
        <div className="res-reel-overlay" style={{ pointerEvents: "none" }}>
          <div className="res-reel-controls" style={{ pointerEvents: "auto" }}>
            <button
              type="button"
              className="res-icon-btn"
              onClick={toggleMute}
              aria-label={muted ? t.resources.unmute : t.resources.mute}
            >
              {muted ? (
                <VolumeX size={15} aria-hidden="true" />
              ) : (
                <Volume2 size={15} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              className="res-icon-btn"
              onClick={toggle}
              aria-label={playing ? t.resources.pause : t.resources.play}
            >
              {playing ? (
                <Pause size={15} fill="currentColor" aria-hidden="true" />
              ) : (
                <Play size={15} fill="currentColor" aria-hidden="true" />
              )}
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
        </div>

        {duration > 0 && (
          <div
            className="res-reel-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(progress)}
            aria-label={t.resources.play}
          >
            <i style={{ width: `${(progress / duration) * 100}%` }} />
          </div>
        )}
      </div>

      {failed && (
        <p className="res-state res-state--error" role="alert">
          {t.resources.videoUnavailable} {t.resources.videoUnavailableHint}
        </p>
      )}

      {resource?.transcript && (
        <details className="res-viewer-caption res-transcript">
          <summary>{t.resources.transcript}</summary>
          <p>{resource.transcript}</p>
        </details>
      )}

      {(resource?.excerpt || resource?.description) && !resource?.transcript && (
        <div className="res-viewer-caption">
          <p>{excerpt(resource.excerpt || resource.description, 320)}</p>
        </div>
      )}
    </div>
  );
}