import {
  Accessibility,
  Bell,
  BookOpen,
  Compass,
  Database,
  Eye,
  Globe,
  GraduationCap,
  HelpCircle,
  Info,
  Layers,
  Palette,
  ShieldCheck,
  UserRound,
} from "lucide-react";

/**
 * The Settings page is a list of sections, and this is that list.
 *
 * It drives the sidebar, the section switching and the search index from one
 * declaration, so a section cannot exist in the navigation while missing from
 * search, or the other way round. Adding a section is one entry here plus its
 * copy.
 *
 * Order is deliberate: what someone is most likely to want (how it looks, what
 * language it is in, whether they can read it comfortably) comes first, and
 * anything destructive is kept near the bottom, away from the everyday controls.
 */
export const SETTINGS_SECTIONS = [
  { id: "appearance", icon: Palette, labelKey: "sections.appearance", introKey: "intros.appearance" },
  { id: "language", icon: Globe, labelKey: "sections.language", introKey: "intros.language" },
  { id: "accessibility", icon: Accessibility, labelKey: "sections.accessibility", introKey: "intros.accessibility" },
  { id: "notifications", icon: Bell, labelKey: "sections.notifications", introKey: "intros.notifications" },
  { id: "content", icon: Layers, labelKey: "sections.content", introKey: "intros.content" },
  { id: "learning", icon: GraduationCap, labelKey: "sections.learning", introKey: "intros.learning" },
  { id: "reading", icon: BookOpen, labelKey: "sections.reading", introKey: "intros.reading" },
  { id: "growth", icon: Compass, labelKey: "sections.growth", introKey: "intros.growth" },
  { id: "privacy", icon: Eye, labelKey: "sections.privacy", introKey: "intros.privacy" },
  { id: "account", icon: UserRound, labelKey: "sections.account", introKey: "intros.account" },
  { id: "security", icon: ShieldCheck, labelKey: "sections.security", introKey: "intros.security" },
  { id: "data", icon: Database, labelKey: "sections.data", introKey: "intros.data" },
  { id: "help", icon: HelpCircle, labelKey: "sections.help", introKey: "intros.help" },
  { id: "about", icon: Info, labelKey: "sections.about", introKey: "intros.about" },
];

export const DEFAULT_SECTION = "appearance";

export function sectionById(id) {
  return SETTINGS_SECTIONS.find((section) => section.id === id) || null;
}

/** Follow a dotted path such as "fields.theme" into a copy object. */
export function copyAt(copy, path) {
  return path.split(".").reduce((node, key) => (node ? node[key] : undefined), copy);
}

/**
 * Every row that search can land on.
 *
 * `id` is the DOM id of the row itself, which is what lets a search result open
 * the right section and then move focus onto the exact control rather than just
 * scrolling past it. `extra` holds the words someone would actually type that
 * are not in the label - "dark", "giza", "font" - so searching for a theme name
 * finds the theme row instead of nothing. Both English and Kiswahili words are
 * listed, because a visitor who reads the site in one language often searches
 * in the other.
 *
 * The label key follows the row id by convention - `appearance.theme` looks up
 * `fields.theme.label` - and is only stated when the name differs.
 */
const row = (id, labelKey, extra = "") => ({
  section: id.split(".")[0],
  id,
  labelKey: labelKey || `fields.${id.split(".").pop()}`,
  extra,
});

export const SEARCH_ROWS = [
  row("appearance.theme", null, "dark light system giza nyepali mfumo mandhari theme mode"),
  row("appearance.density", null, "compact space spacing mbana density"),
  row("appearance.motion", null, "animation movement harakati"),

  row("language.site", "fields.siteLanguage", "english swahili kiswahili kiingereza lugha language"),

  row("accessibility.textSize", null, "font size text ukubwa herufi"),
  row("accessibility.contrast", null, "contrast high kiwango"),
  row("accessibility.motion", "fields.reduceMotion", "motion animation harakati reduce"),
  row("accessibility.focus", null, "focus outline keyboard macho"),
  row("accessibility.screenReader", "groups.screenReader", "screen reader aria kiscreen"),

  row("notifications.learning", "fields.notifyLearning", "reminder lesson kumbukwa"),
  row("notifications.journey", "fields.notifyJourney", "growth journey ukuaji safari"),
  row("notifications.resources", "fields.notifyResources", "resource rasilimali new mpya"),
  row("notifications.stories", "fields.notifyStories", "story stories hadithi"),
  row("notifications.community", "fields.notifyCommunity", "community comments jumuiya maoni"),
  row("notifications.system", "fields.notifySystem", "security account system usalama mfumo"),
  row("notifications.frequency", null, "daily weekly off frequency mara kila"),

  row("content.language", "fields.contentLanguage", "language lugha english swahili"),
  row("content.types", "groups.contentTypes", "stories scripture audio video bible hadithi maandishi"),

  row("learning.autoplayAudio", null, "audio autoplay sauti"),
  row("learning.autoplayVideo", null, "video autoplay"),
  row("learning.rememberPosition", null, "resume position endelea mahali"),
  row("learning.showCompleted", null, "completed done imekamilika"),
  row("learning.showProgress", null, "progress bar maendeleo"),
  row("learning.dailyReminder", null, "daily reminder kila siku"),
  row("learning.pace", null, "gentle pace speed polepole mwendo"),

  row("reading.fontSize", "fields.readingFontSize", "font size text ukubwa herufi"),
  row("reading.lineSpacing", null, "line spacing leading neneo mstari"),
  row("reading.width", "fields.readingWidth", "width measure mapana urefu"),
  row("reading.scripture", null, "scripture bible block maandishi biblia"),

  row("growth.stage", null, "journey stage faith imani safari"),
  row("growth.reminders", "groups.growthReminders", "prayer bible practice sali biblia"),

  row("privacy.profileVisibility", null, "profile public private wasifu umma"),
  row("privacy.activityVisible", null, "activity progress shughuli"),
  row("privacy.analytics", null, "analytics tracking usage ufuatiliaji data"),
  row("privacy.personalization", null, "personalisation mapendekezo recommendations"),

  row("account.information", "groups.accountInformation", "email name profile barua pepe jina"),
  row("account.security", "fields.changeProfile", "password security nenosiri"),
  row("account.signOut", null, "logout sign out tokoma"),

  row("security.password", "fields.changePassword", "password nenosiri"),
  row("security.sessions", null, "session device kifaa sesheni"),
  row("security.info", "groups.accountSecurity", "verified role umuhuru"),

  row("data.download", "fields.downloadData", "download export pakua data"),
  row("data.clearLocal", null, "clear cache futa"),
  row("data.reset", "fields.resetSettings", "reset default anzisha restore"),
  row("data.delete", "fields.deleteAccount", "delete account futa akaunti"),

  row("help.center", "fields.helpCenter", "help msaada"),
  row("help.faq", null, "faq questions maswali"),
  row("help.contact", "fields.contactSupport", "contact support wasiliana"),
  row("help.report", "fields.reportProblem", "problem bug shida report"),
  row("help.feedback", "fields.sendFeedback", "feedback maoni mapendekezo"),

  row("about.intro", "fields.aboutSite", "about mission kuhusu dhamira"),
  row("about.version", null, "version toleo"),
  row("about.legal", "groups.legal", "terms privacy licence license sharti leseni"),
];