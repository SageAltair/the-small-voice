/**
 * The one place every preference is described.
 *
 * Two rules shaped this file.
 *
 * First: the Settings page is not allowed to invent a control that does nothing.
 * Every key in the schema below is either applied to the document by
 * `applyPreferences` (so it changes the running site) or read by a named consumer
 * listed at the bottom of this file. Anything that cannot reach a consumer yet -
 * notification delivery, personalised recommendations - is still stored here so
 * it survives a refresh and is ready when the system that serves it exists.
 *
 * Second: nothing read from localStorage is trusted. A half-written or
 * hand-edited value is coerced back to the shipped default by `sanitize`, so a
 * bad shape can never reach a `data-` attribute or a component prop.
 */

export const STORAGE_KEY = "tsv.preferences.v1";

/** Sentinel for a boolean flag in the schema below. */
const FLAG = "flag";

export const THEME_CHOICES = ["light", "dark", "system"];
export const DENSITY_CHOICES = ["comfortable", "compact"];
export const MOTION_CHOICES = ["full", "reduced"];
export const TEXT_SIZE_CHOICES = ["default", "large", "xlarge"];
export const FREQUENCY_CHOICES = ["off", "occasionally", "daily", "weekly"];
export const PACE_CHOICES = ["gentle", "normal", "focused"];
export const READING_SIZE_CHOICES = ["small", "default", "large", "xlarge"];
export const LINE_SPACING_CHOICES = ["compact", "comfortable", "spacious"];
export const READING_WIDTH_CHOICES = ["narrow", "default", "wide"];
export const SCRIPTURE_CHOICES = ["inline", "block"];
export const VISIBILITY_CHOICES = ["public", "limited", "private"];
export const CONTENT_LANGUAGE_CHOICES = ["en", "sw", "both"];
export const STAGE_CHOICES = [
  "unclear",
  "exploring",
  "beginning",
  "growing",
  "habits",
  "serving",
  "sharing",
];

export const CONTENT_TYPE_KEYS = [
  "stories",
  "bible",
  "learning",
  "audio",
  "video",
  "images",
  "articles",
  "practical",
  "discipleship",
];

export const GROWTH_REMINDER_KEYS = [
  "prayer",
  "bible",
  "learning",
  "practice",
  "journey",
];
// CHUNK2
export const DEFAULT_PREFERENCES = {
  appearance: {
    // "system" is the honest default: the visitor asked for nothing yet, so
    // their operating system's own choice is the least surprising one.
    theme: "system",
    density: "comfortable",
    motion: "full",
  },
  accessibility: {
    textSize: "default",
    contrast: "standard",
    focus: "standard",
  },
  notifications: {
    learning: true,
    journey: true,
    resources: true,
    stories: true,
    community: true,
    // Security, account and critical system messages can never be switched off.
    // The value is forced back to true by `sanitize` no matter what is stored.
    system: true,
    frequency: "weekly",
  },
  content: {
    language: "both",
    types: CONTENT_TYPE_KEYS.reduce((all, key) => ({ ...all, [key]: true }), {}),
  },
  learning: {
    autoplayAudio: false,
    autoplayVideo: false,
    rememberPosition: true,
    showCompleted: true,
    showProgress: true,
    dailyReminder: true,
    pace: "normal",
  },
  reading: {
    fontSize: "default",
    lineSpacing: "comfortable",
    width: "default",
    scripture: "inline",
  },
  privacy: {
    profileVisibility: "limited",
    activityVisible: true,
    analytics: true,
    personalization: true,
  },
  growth: {
    stage: "unclear",
    reminders: {
      prayer: false,
      bible: false,
      learning: false,
      practice: false,
      journey: false,
    },
  },
};
/**
 * The schema is the contract. Anything not listed here is dropped on read, and
 * anything that fails its own check is replaced by the matching default.
 */
const SCHEMA = {
  appearance: {
    theme: THEME_CHOICES,
    density: DENSITY_CHOICES,
    motion: MOTION_CHOICES,
  },
  accessibility: {
    textSize: TEXT_SIZE_CHOICES,
    contrast: ["standard", "high"],
    focus: ["standard", "enhanced"],
  },
  notifications: {
    learning: FLAG,
    journey: FLAG,
    resources: FLAG,
    stories: FLAG,
    community: FLAG,
    system: ["on"],
    frequency: FREQUENCY_CHOICES,
  },
  content: {
    language: CONTENT_LANGUAGE_CHOICES,
    types: CONTENT_TYPE_KEYS.reduce((all, key) => ({ ...all, [key]: FLAG }), {}),
  },
  learning: {
    autoplayAudio: FLAG,
    autoplayVideo: FLAG,
    rememberPosition: FLAG,
    showCompleted: FLAG,
    showProgress: FLAG,
    dailyReminder: FLAG,
    pace: PACE_CHOICES,
  },
  reading: {
    fontSize: READING_SIZE_CHOICES,
    lineSpacing: LINE_SPACING_CHOICES,
    width: READING_WIDTH_CHOICES,
    scripture: SCRIPTURE_CHOICES,
  },
  privacy: {
    profileVisibility: VISIBILITY_CHOICES,
    activityVisible: FLAG,
    analytics: FLAG,
    personalization: FLAG,
  },
  growth: {
    stage: STAGE_CHOICES,
    reminders: GROWTH_REMINDER_KEYS.reduce((all, key) => ({ ...all, [key]: FLAG }), {}),
  },
};

function readChoice(raw, allowed, fallback) {
  return allowed.includes(raw) ? raw : fallback;
}

/** Force any stored blob into a shape the UI and the DOM can rely on. */
export function sanitizePreferences(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = {};

  Object.entries(SCHEMA).forEach(([group, fields]) => {
    const storedGroup =
      source[group] && typeof source[group] === "object" ? source[group] : {};

    result[group] = Object.entries(fields).reduce((fieldsOut, [field, allowed]) => {
      const fallback = DEFAULT_PREFERENCES[group][field];

      if (allowed === FLAG) {
        fieldsOut[field] =
          typeof storedGroup[field] === "boolean" ? storedGroup[field] : fallback;
      } else if (Array.isArray(allowed)) {
        fieldsOut[field] = readChoice(storedGroup[field], allowed, fallback);
      } else {
        fieldsOut[field] = Object.entries(allowed).reduce((nestedOut, [nested, nestedAllowed]) => {
          const nestedFallback = fallback[nested];
          const storedNested =
            storedGroup[field] && typeof storedGroup[field] === "object"
              ? storedGroup[field]
              : {};

          nestedOut[nested] =
            nestedAllowed === FLAG
              ? typeof storedNested[nested] === "boolean"
                ? storedNested[nested]
                : nestedFallback
              : readChoice(storedNested[nested], nestedAllowed, nestedFallback);

          return nestedOut;
        }, {});
      }

      return fieldsOut;
    }, {});
  });

  // The one preference that is never the visitor's to change.
  result.notifications.system = true;

  return result;
}

export function defaultPreferences() {
  return sanitizePreferences(DEFAULT_PREFERENCES);
}
// CHUNK4
// CHUNK3
/** Read the stored preferences, falling back to the defaults on any problem. */
export function readStoredPreferences() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return sanitizePreferences(stored ? JSON.parse(stored) : null);
  } catch {
    // Private browsing, a disabled storage API or a corrupted value all land
    // here. The site simply runs on its defaults, which is a working site.
    return defaultPreferences();
  }
}

export function writeStoredPreferences(preferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // The preference still applies to this session; it just will not survive a
    // refresh, which is a smaller problem than failing the click.
  }
}

/* The `typeof window` guards are what let these settings render on a server:
   an outside-of-browser render has no window and no matchMedia, and asking it a
   question should answer "no" rather than throw. */
export function readSystemTheme() {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readSystemReducedMotion() {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** "system" follows the operating system; the other two are a stated choice. */
export function resolveTheme(themePreference, systemTheme) {
  return themePreference === "system" ? systemTheme : themePreference;
}

/**
 * Write the preferences onto <html> as data attributes, which is what the
 * stylesheet in preferences.css keys off. This is the whole application-wide
 * contract: no component reads another component's preference, they all read
 * the document.
 */
export function applyPreferences(preferences, { systemTheme, systemReducedMotion }) {
  const root = document.documentElement;
  const reducedMotion =
    preferences.appearance.motion === "reduced" || systemReducedMotion;

  root.dataset.theme = resolveTheme(preferences.appearance.theme, systemTheme);
  root.dataset.themePreference = preferences.appearance.theme;
  root.dataset.density = preferences.appearance.density;
  root.dataset.motion = reducedMotion ? "reduced" : "full";
  root.dataset.textSize = preferences.accessibility.textSize;
  root.dataset.contrast = preferences.accessibility.contrast;
  root.dataset.focus = preferences.accessibility.focus;
  root.dataset.readingFontSize = preferences.reading.fontSize;
  root.dataset.readingLineSpacing = preferences.reading.lineSpacing;
  root.dataset.readingWidth = preferences.reading.width;
  root.dataset.scriptureDisplay = preferences.reading.scripture;

  // Keeps native form controls and scrollbars in step with the chosen theme.
  root.style.colorScheme = root.dataset.theme;

  return { resolvedTheme: root.dataset.theme, reducedMotion };
}

/**
 * Keys that "Clear data on this device" must not touch.
 *
 * `access_token` keeps the visitor signed in; the two Learn keys are the
 * anonymous progress identifier that folds into the account on sign-in.
 * Throwing either away would quietly destroy learning progress, which is the one
 * thing this button promises not to do.
 */
export const PRESERVED_LOCAL_KEYS = [
  "access_token",
  "language",
  "learn_client_id",
  "learn_progress_merged",
];

/** Local storage keys this project owns and is therefore allowed to remove. */
export const MANAGED_LOCAL_KEYS = [STORAGE_KEY, "res-book-mode", "res-book-size"];

export function clearLocalPreferences() {
  try {
    MANAGED_LOCAL_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/* ---------------------------------------------------------------------------
   Who consumes what
   ---------------------------------------------------------------------------
   preferences.css ...................... density, text size, contrast, motion,
                                          focus rings, reading size / spacing /
                                          width, scripture display
   Navbar, App.jsx workspace toggle ..... appearance.theme
   AudioViewer .......................... learning.autoplayAudio
   VideoViewer .......................... learning.autoplayVideo
   LearnContinue ........................ learning.showProgress
   LearnPath ............................ learning.showCompleted
   Practice ............................. learning.pace
   ResourceBrowse ....................... content.types
   BookReader .......................... reading.fontSize (seeds the default size)

   Deliberately not consumed yet, because nothing on the site reads them:
   notifications.* ........ the practice reminder at /practice/settings is the
                            only delivery mechanism that exists today
   content.language ........ the API loads one language per request
   privacy.analytics ....... the site ships no analytics at all
   privacy.personalization .. the site ships no recommendation engine
   privacy.profileVisibility, privacy.activityVisible ..... no public profiles
   growth.stage, growth.reminders ........ used to tailor journeys and check-ins
--------------------------------------------------------------------------- */