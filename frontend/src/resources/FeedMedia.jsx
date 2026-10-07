/**
 * Inline media for the borderless resources feed.
 *
 * Unlike the detail-page viewers (full readers with transcripts and rails),
 * these are compact players that preserve each file's own ratio and let the
 * visitor play without opening another page. Reels play 9:16 vertical,
 * videos use native controls at their natural ratio, audio is a Spotify-like
 * row with artwork, and carousels swipe with icon arrows and dots.
 */
import { useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext";
import { getImageUrl, getResourceUrl } from "../services/api";
import { useAudio } from "./AudioPlayer";
import { formatDuration, galleryImages } from "./resourceUtils";
import { nearestNamedRatio } from "./resourceMediaRules";

/** Prefer server-measured dimensions; fall back to the browser once loaded. */
function useNaturalRatio(serverWidth, serverHeight) {
  const measuredRatio =
    Number.isFinite(serverWidth) && Number.isFinite(serverHeight) && serverWidth > 0 && serverHeight > 0
      ? serverWidth / serverHeight
      : null;
  const [measured, setMeasured] = useState(null);
  const natural = measured ?? measuredRatio;
  return [natural, setMeasured];
}

/* ------------------------------- reel ---------------------------------- */

/**
 * A TikTok-style vertical clip: tap the video to play/pause, mute toggle,
 * progress bar, fullscreen. Preserves the uploaded ratio (9:16 primary) and
 * never crops to force a fixed box.
 */
export function FeedReel({ resource }) {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(resource?.duration || 0);
  const [natural, setNatural] = useNaturalRatio(resource?.media_width, resource?.media_height);

  const src = getResourceUrl(resource?.media_url || resource?.url);
  const poster = getImageUrl(resource?.cover_url || null);
  if (!src) return null;

  const named = nearestNamedRatio(resource?.media_width, resource?.media_height);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => setPlaying(false));
    else video.pause();
  }

  function toggleMute(event) {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function openFullscreen(event) {
    event.stopPropagation();
    const frame = frameRef.current;
    if (!frame) return;
    if (frame.requestFullscreen) frame.requestFullscreen().catch(() => {});
    else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
  }

  return (
    <div
      ref={frameRef}
      className="feed-reel"
      style={natural ? { aspectRatio: String(natural) } : undefined}
      data-ratio={named || undefined}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        playsInline
        loop
        preload="metadata"
        muted={muted}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setProgress(e.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          if (!natural && e.currentTarget.videoWidth && e.currentTarget.videoHeight) {
            setNatural(e.currentTarget.videoWidth / e.currentTarget.videoHeight);
          }
        }}
        aria-label={resource?.title}
      />
      {!playing && (
        <button type="button" className="feed-reel-bigplay" onClick={toggle} aria-label={t.resources.play}>
          <Play size={26} fill="currentColor" aria-hidden="true" />
        </button>
      )}
      <div className="feed-reel-controls">
        <button type="button" className="res-icon-btn" onClick={toggleMute} aria-label={muted ? t.resources.unmute : t.resources.mute}>
          {muted ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
        </button>
        <button type="button" className="res-icon-btn" onClick={openFullscreen} aria-label={t.resources.fullscreen}>
          <Maximize2 size={15} aria-hidden="true" />
        </button>
      </div>
      {duration > 0 && (
        <div className="res-reel-progress" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(progress)} aria-label={resource?.title}>
          <i style={{ width: `${(progress / duration) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------- video --------------------------------- */

/** YouTube-like landscape player: native controls at the file's own ratio. */
export function FeedVideo({ resource }) {
  const { t } = useLanguage();
  const [natural, setNatural] = useNaturalRatio(resource?.media_width, resource?.media_height);
  const src = getResourceUrl(resource?.media_url || resource?.url);
  const poster = getImageUrl(resource?.cover_url || null);
  if (!src) return null;

  return (
    <div className="feed-video" style={natural ? { aspectRatio: String(natural) } : undefined}>
      <video
        src={src}
        poster={poster || undefined}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          if (!natural && e.currentTarget.videoWidth && e.currentTarget.videoHeight) {
            setNatural(e.currentTarget.videoWidth / e.currentTarget.videoHeight);
          }
        }}
        aria-label={resource?.title || t.resources.singularTypes?.video}
      />
    </div>
  );
}

/* ------------------------------- audio --------------------------------- */

/** Spotify-like row: artwork, title, author, play, scrub, duration, volume. */
export function FeedAudio({ resource }) {
  const { t } = useLanguage();
  const audio = useAudio();
  const rangeRef = useRef(null);
  const [volume, setVolume] = useState(1);

  const src = getResourceUrl(resource?.media_url || resource?.url);
  const cover = getImageUrl(resource?.cover_url || null);
  if (!src) return null;

  const isCurrent = audio?.track?.id === resource?.id;
  const playing = isCurrent && audio?.playing;
  const progress = isCurrent ? audio?.progress || 0 : 0;
  const duration = (isCurrent ? audio?.duration : 0) || resource?.duration || 0;

  function toggle() {
    if (!audio) return;
    if (isCurrent) audio.toggle();
    else audio.load(resource);
  }

  function seek(seconds) {
    if (!audio) return;
    if (!isCurrent) audio.load(resource, { autoplay: false });
    audio.seek(seconds);
  }

  function changeVolume(value) {
    const next = Math.max(0, Math.min(1, Number(value)));
    setVolume(next);
    audio?.setVolume?.(next);
  }

  return (
    <div className="feed-audio" data-playing={playing || undefined}>
      <div className="feed-audio-cover">
        {cover ? <img src={cover} alt="" loading="lazy" /> : <span aria-hidden="true">♪</span>}
      </div>
      <div className="feed-audio-main">
        <div className="feed-audio-titles">
          <strong>{resource?.title}</strong>
          {resource?.author && <span>{resource.author}</span>}
        </div>
        <div className="feed-audio-row">
          <button
            type="button"
            className="res-icon-btn res-icon-btn--primary"
            onClick={toggle}
            aria-label={playing ? t.resources.pause : t.resources.play}
          >
            {playing ? <Pause size={15} fill="currentColor" aria-hidden="true" /> : <Play size={15} fill="currentColor" aria-hidden="true" />}
          </button>
          <input
            ref={rangeRef}
            className="res-seek feed-audio-seek"
            type="range"
            min="0"
            max={Math.max(1, Math.round(duration))}
            value={Math.round(progress)}
            onChange={(e) => seek(e.target.value)}
            aria-label={t.resources.play}
          />
          <span className="feed-audio-time">
            {formatDuration(progress)} / {formatDuration(duration)}
          </span>
        </div>
        <label className="feed-audio-volume">
          <Volume2 size={13} aria-hidden="true" />
          <input
            type="range" min="0" max="1" step="0.05" value={volume}
            onChange={(e) => changeVolume(e.target.value)}
            aria-label={t.resources.unmute}
          />
        </label>
      </div>
    </div>
  );
}

/* ------------------------------ carousel -------------------------------- */

/** Instagram-like swipe: touch gestures, icon arrows, pagination dots. */
export function FeedCarousel({ resource }) {
  const { t } = useLanguage();
  const trackRef = useRef(null);
  const touchX = useRef(null);
  const [index, setIndex] = useState(0);
  const [natural, setNatural] = useNaturalRatio(resource?.media_width, resource?.media_height);

  const slides = (resource?.slides || []).filter((s) => s.image_url);
  const images = slides.length
    ? slides.map((s) => ({ url: s.image_url, alt: s.alt_text || s.caption || s.text || resource?.title }))
    : galleryImages(resource);
  const total = images.length;
  if (!total) return null;

  const go = (next) => setIndex(total ? (next + total) % total : 0);

  function onTouchStart(e) {
    touchX.current = e.touches?.[0]?.clientX ?? null;
  }
  function onTouchEnd(e) {
    if (touchX.current == null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? touchX.current;
    const delta = endX - touchX.current;
    touchX.current = null;
    if (Math.abs(delta) < 40) return;
    go(index + (delta < 0 ? 1 : -1));
  }

  return (
    <div className="feed-carousel" style={natural ? { aspectRatio: String(natural) } : undefined}>
      <div
        className="feed-carousel-track"
        ref={trackRef}
        style={{ transform: `translateX(-${index * 100}%)` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {images.map((item, i) => (
          <img
            key={i}
            src={getImageUrl(item.url)}
            alt={item.alt || ""}
            loading={i === 0 ? "eager" : "lazy"}
            draggable={false}
            onLoad={(e) => {
              if (!natural && e.currentTarget.naturalWidth && e.currentTarget.naturalHeight) {
                setNatural(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
              }
            }}
            aria-hidden={i !== index}
          />
        ))}
      </div>
      {total > 1 && (
        <>
          <button type="button" className="feed-carousel-arrow feed-carousel-arrow--prev" onClick={() => go(index - 1)} aria-label={t.resources.previousSlide}>‹</button>
          <button type="button" className="feed-carousel-arrow feed-carousel-arrow--next" onClick={() => go(index + 1)} aria-label={t.resources.nextSlide}>›</button>
          <div className="feed-carousel-dots" role="tablist">
            {images.map((_, i) => (
              <button key={i} type="button" role="tab" aria-current={i === index} aria-label={`${i + 1} / ${total}`} onClick={() => go(i)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------- image ---------------------------------- */

/** A still image at its own ratio — never cropped to fit a fixed box. */
export function FeedImage({ resource }) {
  const [natural, setNatural] = useNaturalRatio(resource?.media_width, resource?.media_height);
  const url = getImageUrl(resource?.cover_url || resource?.media_url || resource?.url);
  if (!url) return null;
  return (
    <div className="feed-image" style={natural ? { aspectRatio: String(natural) } : undefined}>
      <img
        src={url}
        alt={resource?.alt_text || resource?.caption || resource?.title || ""}
        loading="lazy"
        onLoad={(e) => {
          if (!natural && e.currentTarget.naturalWidth && e.currentTarget.naturalHeight) {
            setNatural(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
          }
        }}
      />
    </div>
  );
}

/** Picks the inline player for a feed resource. Null for text-only types. */
export default function FeedMedia({ resource }) {
  const type = resource?.type || "document";
  if (type === "reel") return <FeedReel resource={resource} />;
  if (type === "video") return <FeedVideo resource={resource} />;
  if (type === "audio") return <FeedAudio resource={resource} />;
  if (type === "carousel") return <FeedCarousel resource={resource} />;
  if (type === "image" || type === "infographic") return <FeedImage resource={resource} />;
  return null;
}

