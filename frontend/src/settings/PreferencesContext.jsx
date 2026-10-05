import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  applyPreferences,
  clearLocalPreferences,
  defaultPreferences,
  readStoredPreferences,
  readSystemReducedMotion,
  readSystemTheme,
  resolveTheme,
  writeStoredPreferences,
} from "./preferences";

/**
 * One provider for every preference on the site.
 *
 * It sits above the router for the same reason the audio player does: a theme
 * or text-size change has to reach pages that are about to mount, and a
 * provider that unmounts with the route would repaint them one at a time.
 *
 * The two operating-system queries are the only subscriptions here. They matter
 * because "System" theme and "reduced animations" both mean something outside
 * the app: a laptop that flips to dark at sunset should repaint the site without
 * being asked, and a visitor who has asked their operating system for less
 * motion should get that whether or not they found this Settings page.
 */
const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(readStoredPreferences);
  const [systemTheme, setSystemTheme] = useState(readSystemTheme);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    readSystemReducedMotion,
  );

  useEffect(() => {
    const themeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    if (!themeQuery || !motionQuery) return undefined;

    const onThemeChange = (event) => setSystemTheme(event.matches ? "dark" : "light");
    const onMotionChange = (event) => setSystemReducedMotion(event.matches);

    themeQuery.addEventListener("change", onThemeChange);
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      themeQuery.removeEventListener("change", onThemeChange);
      motionQuery.removeEventListener("change", onMotionChange);
    };
  }, []);

  /* One write, one place. Whatever changes a preference, the result is saved
     and applied in the same tick, so the two can never drift apart. */
  useEffect(() => {
    writeStoredPreferences(preferences);
    applyPreferences(preferences, { systemTheme, systemReducedMotion });
  }, [preferences, systemTheme, systemReducedMotion]);

  /**
 * Read a dotted path, reporting whether it exists at all. The existence check
 * is what stops a typo in a caller from quietly creating a new preference
 * nobody ever reads.
 */
function readPath(node, keys) {
  let value = node;

  for (const key of keys) {
    if (!value || typeof value !== "object" || !(key in value)) {
      return { exists: false, value: undefined };
    }
    value = value[key];
  }

  return { exists: true, value };
}

function writePath(node, keys, value) {
  const [key, ...rest] = keys;

  if (rest.length === 0) return { ...node, [key]: value };

  return {
    ...node,
    [key]: writePath(node[key], rest, value),
  };
}

/**
 * `setPreference("content.types.audio", false)` - a dotted path of any depth and
 * one value. Written by hand rather than as a reducer because every caller is a
 * form control, and every form control wants the same two things: a path, a
 * value, and no ceremony. Setting a value that is already set returns the same
 * object, so React skips the re-render and nothing is written to storage.
 */
const setPreference = useCallback((path, value) => {
  const keys = path.split(".");

  setPreferences((current) => {
    const found = readPath(current, keys);

    if (!found.exists || found.value === value) return current;

    return writePath(current, keys, value);
  });
  // readPath and writePath are module-level, so their identity never changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const togglePreference = useCallback((path) => {
  const keys = path.split(".");

  setPreferences((current) => {
    const found = readPath(current, keys);

    if (!found.exists || typeof found.value !== "boolean") return current;

    return writePath(current, keys, !found.value);
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  const resetPreferences = useCallback(() => {
    setPreferences(defaultPreferences());
  }, []);

  /* Clearing local data and resetting settings look similar and are not the
     same: one wipes what is on this device, the other puts the defaults back
     without touching the browser at all. Both are offered separately in Data. */
  const clearLocalData = useCallback(() => {
    clearLocalPreferences();
    setPreferences(defaultPreferences());
  }, []);

  const value = useMemo(
    () => ({
      preferences,
      setPreference,
      togglePreference,
      resetPreferences,
      clearLocalData,
      systemTheme,
      systemReducedMotion,
      /* The theme that is actually on screen right now, which is not always the
         one that was chosen: "system" resolves to whatever the operating system
         says at this moment. Exposed here so a component can render the right
         icon without reading the document, which would be one render behind. */
      resolvedTheme: resolveTheme(preferences.appearance.theme, systemTheme),
      reducedMotion:
        preferences.appearance.motion === "reduced" || systemReducedMotion,
    }),
    [
      preferences,
      setPreference,
      togglePreference,
      resetPreferences,
      clearLocalData,
      systemTheme,
      systemReducedMotion,
    ],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

// This hook is intentionally exported alongside its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences() {
  const context = useContext(PreferencesContext);

  /* Outside the provider - a test rendering one component, say - the defaults
     are a working answer, not a crash. */
  return context || { preferences: defaultPreferences() };
}