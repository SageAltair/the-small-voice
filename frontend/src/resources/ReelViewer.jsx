import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Pause, Play, Volume2, VolumeX } from "lucide-react";

/**
 * A vertical short-form feed.
 *
 * The snap container does the work: one reel fills the frame, the next is
 * always partly visible so the gesture is discoverable, and native scrolling
 * means a trackpad, a keyboard and a screen reader all work without any of it
 * being reimplemented here.
 *
 * Each reel owns its own `<video>` and only the one in view plays. Moving
 * between clips should feel like turning a page, and swapping `src` on a
 * single element makes that stutter.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { getImageUrl, getResourceUrl } from "../services/api";
import { excerpt, formatDuration } from "./resourceUtils";

/** One reel: its own media, its own controls, its own progress. */
function Reel({ resource, active, muted, onToggleMute }) {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(resource?.duration || 0);

  const src = getResourceUrl(resource?.media_url || resource?.url);
  const poster = getImageUrl(resource?.cover_url || null);

  /* Only the reel in view plays. Off-screen reels are paused rather than
     unloaded, so scrolling back is instant instead of a fresh buffer. The
     `playing` state here is derived from the element's own events, so the
     effect never has to write it - the media element is the source of truth. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (active) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }

  return (
    <article className="res-reel">
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        playsInline
        loop
        preload={active ? "auto" : "metadata"}
        muted={muted}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setProgress(event.currentTime)}
        onLoadedMetadata={(event) =>
          setDuration(event.currentTarget.duration || 0)
        }
        aria-label={resource?.title}
      >
        {resource?.title}
      </video>

      <div className="res-reel-overlay">
        <div className="res-reel-copy">
          <h2>
            <Link to={`/resources/reel/${resource?.slug || resource?.id}`}>
              {resource?.title}
            </Link>
          </h2>
          {(resource?.excerpt || resource?.description) && (
            <p>{excerpt(resource.excerpt || resource.description, 110)}</p>
          )}
          {resource?.duration > 0 && (
            <span className="res-card-sub">
              {formatDuration(resource.duration)}
            </span>
          )}
        </div>

        <div className="res-reel-controls">
          <button
            type="button"
            className="res-icon-btn"
            onClick={onToggleMute}
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
        </div>
      </div>

      {duration > 0 && (
        <div
          className="res-reel-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(progress)}
          aria-label={resource?.title}
        >
          <i style={{ width: `${(progress / duration) * 100}%` }} />
        </div>
      )}
    </article>
  );
}

export default function ReelViewer({ resource, siblings = [] }) {
  const { t } = useLanguage();
  const feedRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);

  // The reel being opened leads the feed, followed by whatever else is worth
  // watching - so a visitor is never dropped onto a dead end after one clip.
  const items = useCallback(() => {
    const seen = new Set();
    return [resource, ...siblings].filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [resource, siblings])();

  /* The scroll position decides which reel is active rather than an
     intersection observer: the snap container already guarantees exactly one
     reel per row, so the arithmetic is exact and needs nothing extra. */
  function onScroll() {
    const feed = feedRef.current;
    if (!feed) return;

    const index = Math.round(feed.scrollTop / Math.max(1, feed.clientHeight));
    setActiveIndex((current) =>
      index === current
        ? current
        : Math.min(items.length - 1, Math.max(0, index)),
    );
  }

  function goTo(index) {
    const feed = feedRef.current;
    if (!feed) return;
    feed.scrollTo({ top: index * feed.clientHeight, behavior: "smooth" });
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      goTo(Math.min(items.length - 1, activeIndex + 1));
    }
    if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      goTo(Math.max(0, activeIndex - 1));
    }
  }

  if (!items.length) return null;

  return (
    <div className="res-viewer res-viewer--media">
      <div
        ref={feedRef}
        className="res-reel-feed"
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="region"
        aria-label={t.resources.types?.reel}
      >
        {items.map((item, index) => (
          <Reel
            key={item.id}
            resource={item}
            active={index === activeIndex}
            muted={muted}
            onToggleMute={() => setMuted((value) => !value)}
          />
        ))}
      </div>

      {items.length > 1 && (
        <div className="res-reel-hint">
          <ChevronDown size={13} aria-hidden="true" />
          {t.resources.reelHint}
        </div>
      )}
    </div>
  );
}
