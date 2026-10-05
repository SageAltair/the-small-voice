import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

/* LanguageProvider reads the saved language out of localStorage on its very
   first render, so rendering it for real needs a localStorage. This three-line
   stand-in is enough, and keeps the test runnable from a clean install: jsdom
   is not one of this project's declared dependencies, so asking for a whole
   browser environment here would be a dependency the repository does not have. */
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

// The settings system is mostly copy and rules, and both fail quietly: a missing
// translation renders an empty string rather than an error, and a preference
// that is stored but never applied looks exactly like one that works. So these
// tests check the three things a unit test can actually prove - the copy is
// complete in both languages, the preference store cannot be corrupted, and
// every section renders without throwing.

import SettingsPanel from "../SettingsPanel.jsx";
import { LanguageProvider } from "../../i18n/LanguageContext.jsx";
import { PreferencesProvider } from "../PreferencesContext.jsx";
import {
  DEFAULT_PREFERENCES,
  MANAGED_LOCAL_KEYS,
  PRESERVED_LOCAL_KEYS,
  defaultPreferences,
  resolveTheme,
  sanitizePreferences,
} from "../preferences.js";
import { SETTINGS_SECTIONS, SEARCH_ROWS, copyAt } from "../sections.js";
import { searchSettings } from "../search.js";
import { settingsCopy } from "../../i18n/settingsCopy.js";

/* The site language lives in the same localStorage the real app uses, so setting
   it here is how a visitor chooses Kiswahili - which is exactly what makes this
   a test of the translated interface rather than of the English one.

   The panel is rendered on its own rather than through the route, because the
   route's job is to wrap it in a portal and a focus trap, and both of those
   need a real browser. The browser test covers the frame; this covers the
   content. */
const render = (language, section) => {
  store.set("language", language);

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/settings/${section}`]}>
      <LanguageProvider>
        <PreferencesProvider>
          <SettingsPanel section={section} />
        </PreferencesProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
};

/** Every leaf key in a copy object, as dotted paths. */
function keyPaths(node, prefix = "") {
  return Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? keyPaths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("settings copy", () => {
  const en = keyPaths(settingsCopy.en).sort();
  const sw = keyPaths(settingsCopy.sw).sort();

  it("has a Kiswahili string for every English one", () => {
    expect(sw.filter((key) => !en.includes(key))).toEqual([]);
  });

  it("has no Kiswahili strings that no English key claims", () => {
    expect(en.filter((key) => !sw.includes(key))).toEqual([]);
  });

  it("leaves no string empty", () => {
    [...en, ...sw].forEach((key) => {
      const value = copyAt(settingsCopy.en, key) ?? copyAt(settingsCopy.sw, key);
      expect(typeof value === "string" && value.trim().length > 0, key).toBe(true);
    });
  });

  it("names every section in both languages", () => {
    SETTINGS_SECTIONS.forEach(({ id, labelKey, introKey }) => {
      ["en", "sw"].forEach((language) => {
        expect(copyAt(settingsCopy[language], labelKey), `${language} ${id} label`).toBeTruthy();
        expect(copyAt(settingsCopy[language], introKey), `${language} ${id} intro`).toBeTruthy();
      });
    });
  });

  it("labels every searchable row", () => {
    SEARCH_ROWS.forEach((row) => {
      expect(copyAt(settingsCopy.en, row.labelKey), row.id).toBeTruthy();
      expect(copyAt(settingsCopy.sw, row.labelKey), row.id).toBeTruthy();
    });
  });
});
describe("the preference store", () => {
  it("replaces a value it does not recognise", () => {
    const clean = sanitizePreferences({ appearance: { theme: "neon" } });
    expect(clean.appearance.theme).toBe(DEFAULT_PREFERENCES.appearance.theme);
  });

  it("drops keys that are not in the schema", () => {
    expect(sanitizePreferences({ nonsense: true })).toEqual(defaultPreferences());
  });

  it("keeps a value the schema does recognise", () => {
    const clean = sanitizePreferences({ reading: { fontSize: "xlarge" } });
    expect(clean.reading.fontSize).toBe("xlarge");
  });

  it("falls back for a boolean stored as something else", () => {
    const clean = sanitizePreferences({ learning: { autoplayVideo: "yes" } });
    expect(clean.learning.autoplayVideo).toBe(false);
  });

  it("never lets critical notifications be switched off", () => {
    const clean = sanitizePreferences({ notifications: { system: false } });
    expect(clean.notifications.system).toBe(true);
  });

  it("resolves the system theme to whatever the device says", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("never clears the keys that hold a sign-in or learning progress", () => {
    MANAGED_LOCAL_KEYS.forEach((key) => {
      expect(PRESERVED_LOCAL_KEYS).not.toContain(key);
    });
    expect(PRESERVED_LOCAL_KEYS).toContain("access_token");
    expect(PRESERVED_LOCAL_KEYS).toContain("learn_client_id");
  });
});

describe("settings search", () => {
  const copy = settingsCopy.en;

  it("returns nothing for an empty query", () => {
    expect(searchSettings(copy, "   ")).toEqual([]);
  });

  it("finds the theme row when searching for dark", () => {
    const rows = searchSettings(copy, "dark").flatMap((group) => group.rows);
    expect(rows.map((row) => row.id)).toContain("appearance.theme");
  });

  it("finds the theme row from the Kiswahili word", () => {
    const rows = searchSettings(settingsCopy.sw, "giza").flatMap((group) => group.rows);
    expect(rows.map((row) => row.id)).toContain("appearance.theme");
  });

  it("finds font size in both reading and accessibility", () => {
    const rows = searchSettings(copy, "font").flatMap((group) => group.rows);
    expect(rows.map((row) => row.id)).toContain("reading.fontSize");
    expect(rows.map((row) => row.id)).toContain("accessibility.textSize");
  });

  it("finds the whole notifications section", () => {
    const groups = searchSettings(copy, "notifications");
    expect(groups[0].section.id).toBe("notifications");
  });

  it("requires every word to match", () => {
    expect(searchSettings(copy, "dark font")).toEqual([]);
  });

  it("groups results in the order the page lists its sections", () => {
    const groups = searchSettings(copy, "a");
    const order = SETTINGS_SECTIONS.map((section) => section.id);
    const found = groups.map((group) => order.indexOf(group.section.id));
    expect(found).toEqual([...found].sort((a, b) => a - b));
  });
});

describe("the settings page", () => {
  SETTINGS_SECTIONS.forEach(({ id, labelKey }) => {
    it(`renders the ${id} section`, () => {
      const html = render("en", id);
      expect(html).toContain(copyAt(settingsCopy.en, labelKey));
    });

    it(`renders the ${id} section in Kiswahili`, () => {
      const html = render("sw", id);
      expect(html).toContain(copyAt(settingsCopy.sw, labelKey));
    });
  });

  it("keeps the heading order the popup needs", () => {
    // The dialog owns the h2; the section is the h3; a group inside it is the
    // h4. Getting this wrong is invisible on screen and very visible to anyone
    // navigating by heading.
    const html = render("en", "content");

    expect(html).toContain("<h3 id=\"settings-section-heading\"");
    expect(html).toContain("<h4 id=\"content.types-title\"");
    expect(html).not.toContain("<h2 id=\"settings-section-heading\"");
  });

  it("labels the search field for assistive technology", () => {
    expect(render("en", "appearance")).toContain(settingsCopy.en.searchLabel);
  });

  it("never leaves a locked notification row switchable", () => {
    expect(render("en", "notifications")).toContain(settingsCopy.en.states.locked);
  });
});
