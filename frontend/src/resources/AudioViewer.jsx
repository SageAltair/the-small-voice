import { useEffect } from "react";
import { Music, Pause, Play, RotateCcw } from "lucide-react";

/**
 * A listening experience rather than an `<audio controls>` tag.
 *
 * Playback is routed through the site-wide player (see AudioPlayer), which is
 * what lets the music keep going when the reader follows a link. This viewer's
 * job is to show the same state in a fuller form: cover art, a real seek bar,
 * a speed control and elapsed time.
 *
 * The seek bar is a range input, so it is keyboard operable and announces its
 * position, instead of being a bar that only responds to a click.
 *
 * Opening a recording does not start it. The one exception is the Learning
 * setting "Play audio automatically", which is off by default - sound that
 * starts on its own is startling, and a setting nobody asked for should not
 * do it.
 */

import { useLanguage } from "../i18n/LanguageContext";
import { getImageUrl, getResourceUrl } from "../services/api";
import { usePreferences } from "../settings/PreferencesContext";
import { useAudio } from "./AudioPlayer";
import { formatDuration } from "./resourceUtils";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function AudioViewer({ resource }) {
  const { t } = useLanguage();
  const audio = useAudio();
  const { preferences } = usePreferences();

  const src = getResourceUrl(resource?.media_url || resource?.url);
  const cover = getImageUrl(resource?.cover_url || null);

  const isCurrent = audio?.track?.id === resource?.id;
  const playing = isCurrent && audio?.playing;
  const progress = isCurrent ? audio?.progress || 0 : 0;
  const duration =
    (isCurrent ? audio?.duration : 0) || resource?.duration || 0;

  /* Only fires while the track is not already loaded, so walking away from a
     recording and coming back to it does not start it all over again. */
  useEffect(() => {
    if (!preferences.learning.autoplayAudio || !src || isCurrent) return;
    audio?.load(resource);
  }, [audio, isCurrent, preferences.learning.autoplayAudio, resource, src]);

  function toggle() {
    if (!audio || !src) return;
    if (isCurrent) {
      audio.toggle();
    } else {
      audio.load(resource);
    }
  }

  function seek(seconds) {
    if (!audio) return;
    // Seeking before anything has loaded starts playback at that point
    // rather than silently doing nothing.
    if (!isCurrent) {
      audio.load(resource, { autoplay: false });
    }
    audio.seek(seconds);
  }

  function skip(delta) {
    seek(Math.max(0, Math.min(duration || 0, progress + delta)));
  }

  if (!src) {
    return (
      <div className="res-viewer">
        <div className="res-state" style={{ border: 0 }}>
          <p>{t.resources.audioUnavailable}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="res-viewer">
      <div className="res-audio">
        <div className="res-audio-cover">
          {cover ? (
            <img src={cover} alt="" loading="lazy" />
          ) : (
            // No cover is normal for a recording, so the placeholder is the
            // type's own mark rather than a broken image.
            <Music size={44} strokeWidth={1.2} aria-hidden="true" />
          )}
        </div>

        <div className="res-audio-main">
          <div>
            <h2 className="res-audio-title">{resource?.title}</h2>
            {resource?.author && (
              <p className="res-audio-byline">{resource.author}</p>
            )}
          </div>

          <div>
            <label className="visually-hidden" htmlFor="audio-seek">
              {t.resources.play}
            </label>
            <input
              id="audio-seek"
              className="res-seek"
              type="range"
              min="0"
              max={Math.max(1, Math.round(duration))}
              value={Math.round(progress)}
              onChange={(event) => seek(event.target.value)}
            />

            <div className="res-times">
              <span>{formatDuration(progress)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="res-audio-controls">
            <button
              type="button"
              className="res-icon-btn"
              onClick={() => skip(-15)}
              aria-label={t.resources.previous}
            >
              <RotateCcw size={15} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="res-icon-btn res-icon-btn--primary"
              onClick={toggle}
              aria-label={playing ? t.resources.pause : t.resources.play}
            >
              {playing ? (
                <Pause size={16} fill="currentColor" aria-hidden="true" />
              ) : (
                <Play size={16} fill="currentColor" aria-hidden="true" />
              )}
            </button>

            <label className="visually-hidden" htmlFor="audio-speed">
              {t.resources.speed}
            </label>
            <select
              id="audio-speed"
              className="res-speed"
              defaultValue="1"
              onChange={(event) => audio?.setSpeed(event.target.value)}
            >
              {SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed === 1 ? t.resources.normalSpeed : `${speed}×`}
                </option>
              ))}
            </select>

            {resource?.duration > 0 && (
              <span className="res-audio-byline" aria-hidden="true">
                {formatDuration(resource.duration)}
              </span>
            )}
          </div>
        </div>
      </div>

      {resource?.description && (
        <div className="res-viewer-caption">
          <p>{resource.description}</p>
        </div>
      )}

      {resource?.transcript && (
        <details className="res-viewer-caption res-transcript">
          <summary>{t.resources.transcript}</summary>
          <p>{resource.transcript}</p>
        </details>
      )}
    </div>
  );
}