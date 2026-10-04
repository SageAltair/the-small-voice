import { Pause, Play, X } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext";
import { formatDuration } from "./resourceUtils";
import { useAudio } from "./AudioPlayer";

/**
 * The persistent player bar.
 *
 * It only exists once something is loaded, and it sits above the page rather
 * than over it, so nothing is ever permanently hidden behind it. The seek bar
 * is a real range input: keyboard operable, announced with a value, and
 * behaving natively on touch.
 */
export function AudioMiniPlayer() {
  const { t } = useLanguage();
  const audio = useAudio();

  if (!audio?.track) return null;

  const { track, playing, progress, duration, toggle, seek, stop } = audio;
  const total = duration || track.duration || 0;
  const percent = total ? Math.min(100, (progress / total) * 100) : 0;

  return (
    <aside className="res-miniplayer" aria-label={t.resources.miniPlayer}>
      <div className="res-miniplayer-info">
        <span className="res-miniplayer-title">{track.title}</span>
        <span className="res-miniplayer-sub">
          {t.resources.nowPlaying} · {formatDuration(progress)} /{" "}
          {formatDuration(total)}
        </span>
        <div className="res-miniplayer-progress" aria-hidden="true">
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>

      <input
        className="res-seek"
        type="range"
        min="0"
        max={Math.max(1, Math.round(total))}
        value={Math.round(progress)}
        onChange={(event) => seek(event.target.value)}
        aria-label={t.resources.play}
      />

      <div className="res-miniplayer-actions">
        <button
          type="button"
          className="res-icon-btn res-icon-btn--primary"
          onClick={() => toggle()}
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
          onClick={stop}
          aria-label={t.resources.closePlayer}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export default AudioMiniPlayer;