import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * One audio player for the whole site.
 *
 * The problem this solves is the reason people stop using an audio library:
 * start a teaching, follow a link to a related resource, and come back to a
 * player that has forgotten where you were. Keeping the provider above the
 * router means the `<audio>` element is never unmounted, so playback simply
 * continues while the reader browses.
 *
 * A context rather than a component in each viewer: two `<audio>` elements
 * playing at once is the failure this avoids, and it also means the
 * mini-player and the full player always show the same thing.
 */

import { getResourceUrl } from "../services/api";

const AudioContext = createContext(null);

export function AudioProvider({ children }) {
  const audioRef = useRef(null);
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  /* One element for the lifetime of the session. Creating it in an effect
     rather than in JSX is what keeps it alive across route changes. */
  useEffect(() => {
    const element = new Audio();
    element.preload = "metadata";
    audioRef.current = element;

    const onTimeUpdate = () => setProgress(element.currentTime || 0);
    const onLoaded = () => setDuration(element.duration || 0);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    element.addEventListener("timeupdate", onTimeUpdate);
    element.addEventListener("loadedmetadata", onLoaded);
    element.addEventListener("durationchange", onLoaded);
    element.addEventListener("ended", onEnded);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);

    return () => {
      element.pause();
      element.removeEventListener("timeupdate", onTimeUpdate);
      element.removeEventListener("loadedmetadata", onLoaded);
      element.removeEventListener("durationchange", onLoaded);
      element.removeEventListener("ended", onEnded);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
    };
  }, []);

  const load = useCallback((resource, { autoplay = true } = {}) => {
    const element = audioRef.current;
    if (!element || !resource) return;

    const src = getResourceUrl(resource.media_url || resource.url);
    if (!src) return;

    const isSame = element.dataset.resourceId === String(resource.id);

    // Switching tracks always restarts; asking for the track already loaded is
    // how the mini-player pauses it instead of starting it over.
    if (!isSame) {
      element.dataset.resourceId = String(resource.id);
      element.src = src;
      setDuration(resource.duration || 0);
      setProgress(0);
      setTrack(resource);
    }

    if (autoplay) {
      element.play().catch(() => {
        // Browsers block autoplay until the visitor has interacted. Failing
        // quietly is right: the control is still there to press.
        setPlaying(false);
      });
    } else if (!isSame) {
      element.load();
    }
  }, []);

  const toggle = useCallback(
    (resource) => {
      const element = audioRef.current;
      if (!element) return;

      if (resource) load(resource);

      if (element.paused) {
        element.play().catch(() => setPlaying(false));
      } else {
        element.pause();
      }
    },
    [load],
  );

  const seek = useCallback((seconds) => {
    const element = audioRef.current;
    if (!element) return;
    element.currentTime = Number(seconds) || 0;
    setProgress(Number(seconds) || 0);
  }, []);

  const setSpeed = useCallback((rate) => {
    if (audioRef.current) audioRef.current.playbackRate = Number(rate) || 1;
  }, []);

  /* Feed volume slider. Additive: nothing existing reads volume. */
  const setVolume = useCallback((value) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, Number(value)));
      audioRef.current.muted = Number(value) <= 0;
    }
  }, []);

  const stop = useCallback(() => {
    const element = audioRef.current;
    if (!element) return;
    element.pause();
    element.removeAttribute("src");
    element.load();
    delete element.dataset.resourceId;
    setTrack(null);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  }, []);

  const value = useMemo(
    () => ({
      track,
      playing,
      progress,
      duration,
      load,
      toggle,
      seek,
      setSpeed,
      setVolume,
      stop,
    }),
    [track, playing, progress, duration, load, toggle, seek, setSpeed, setVolume, stop],
  );

  return (
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAudio() {
  return useContext(AudioContext);
}

export default AudioProvider;