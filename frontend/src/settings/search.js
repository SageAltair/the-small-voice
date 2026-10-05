import { SEARCH_ROWS, SETTINGS_SECTIONS, copyAt } from "./sections";

/**
 * Matching rows for the settings search box.
 *
 * Every word in the query has to appear somewhere in the row, so "dark font"
 * finds nothing rather than something arbitrary, and the result set is ordered
 * the way the page is - sections in the order they appear in the sidebar, rows
 * in the order they appear inside each section - so reading the results feels
 * like reading the page.
 *
 * A row matches on its own label, on the name of the section it lives in, and on
 * the words someone would actually type for it. Searching "notifications" is
 * therefore expected to return the whole Notifications section rather than the
 * one row that happens to use the word.
 *
 * No index is built and no string is cached: the haystack is rebuilt from the
 * active language on each call, which is what makes a Kiswahili search work
 * without a second set of keywords. At a few dozen rows this stays instant, and
 * it stays correct when a label is reworded.
 */
export function searchSettings(copy, query) {
  const needle = query.trim().toLowerCase();

  if (!needle) return [];

  const words = needle.split(/\s+/).filter(Boolean);
  const sectionLabels = SETTINGS_SECTIONS.map((section) => ({
    id: section.id,
    label: copyAt(copy, section.labelKey) || "",
  }));

  const matches = SEARCH_ROWS.filter((row) => {
    const section = sectionLabels.find((entry) => entry.id === row.section);
    const haystack =
      `${copyAt(copy, row.labelKey) || ""} ${row.extra || ""} ${section?.label || ""}`.toLowerCase();

    return words.every((word) => haystack.includes(word));
  });

  return SETTINGS_SECTIONS.map((section) => ({
    section,
    rows: matches.filter((row) => row.section === section.id),
  })).filter((group) => group.rows.length > 0);
}