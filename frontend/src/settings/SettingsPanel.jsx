/**
 * The settings panel: everything inside the popup except its frame.
 *
 * Fourteen sections, one rail, one search box. Everything on this page is a real
 * preference stored on the device - see preferences.js for what each one actually
 * changes, and the "who consumes what" list at the bottom of that file for the
 * parts of the site that read them.
 *
 * Two rules govern the copy here. Never show a control that does nothing: where
 * the site genuinely cannot do something yet, the row says so instead of
 * pretending. And never let a destructive action be one stray tap away -
 * clearing local data and resetting settings both ask first, and say exactly
 * what survives.
 *
 * The frame - the scrim, the title, the close button and the keyboard handling -
 * belongs to SettingsModal. This file is the content, which is what lets it be
 * rendered on its own in a test.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

import { useLanguage } from "../i18n/LanguageContext";
import { getCurrentUser, isLoggedIn, logout } from "../services/api";
import { APP_VERSION } from "../version";

import ConfirmDialog from "./ConfirmDialog";
import SettingsSearch from "./SettingsSearch";
import { searchSettings } from "./search";
import {
  SettingAction,
  SettingChoice,
  SettingChecklist,
  SettingFact,
  SettingGroup,
  SettingRow,
  SettingSwitch,
  SettingUnavailable,
} from "./SettingControls";
import { CONTENT_TYPE_KEYS, GROWTH_REMINDER_KEYS } from "./preferences";
import { DEFAULT_SECTION, SETTINGS_SECTIONS, copyAt, sectionById } from "./sections";
import { usePreferences } from "./PreferencesContext";
import "../settings.css";

export default function SettingsPanel({ section: routeSection }) {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const copy = t.settings;

  const {
    preferences,
    setPreference,
    togglePreference,
    resetPreferences,
    clearLocalData,
  } = usePreferences();

  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState("");
  const [focusTarget, setFocusTarget] = useState(null);
  const searchRef = useRef(null);
  const navRef = useRef(null);

  // An unknown slug falls back rather than 404-ing: the sidebar and search both
  // link here, and a stale bookmark should still land on a usable page.
  const section = sectionById(routeSection) ? routeSection : DEFAULT_SECTION;
  const active = sectionById(section);

  const results = useMemo(() => searchSettings(copy, query), [copy, query]);
  const matchCount = useMemo(
    () => results.reduce((total, group) => total + group.rows.length, 0),
    [results],
  );

  /* The account is only ever fetched when there is a token to fetch it with. The
     starting state is decided once, before the first render, so the effect below
     does nothing but wait for the answer. A failure is reported as signed out
     rather than as an error banner, because for someone who is not signed in,
     that is simply the truth. */
  const [account, setAccount] = useState(() =>
    isLoggedIn() ? { state: "loading", user: null } : { state: "signedOut", user: null },
  );

  useEffect(() => {
    if (!isLoggedIn()) return undefined;

    let stale = false;

    getCurrentUser()
      .then((user) => {
        if (!stale) setAccount({ state: "signedIn", user });
      })
      .catch(() => {
        if (!stale) setAccount({ state: "signedOut", user: null });
      });

    return () => {
      stale = true;
    };
  }, []);

  /* Moving focus is the difference between "the page changed" and "I am
     somewhere else now". The heading is the target for ordinary navigation, and
     the exact row for a search result.

     The target is a fresh object per request rather than an id that is cleared
     afterwards, so asking for the same row twice works and the effect never
     has to write state back to itself. */
  const handledFocus = useRef(null);

  useEffect(() => {
    if (!focusTarget || handledFocus.current === focusTarget) return;

    const target = document.getElementById(focusTarget.id);
    if (!target) return;

    handledFocus.current = focusTarget;
    target.focus();
    target.scrollIntoView({ block: "center" });
  }, [focusTarget]);

  const selectSection = useCallback(
    (id) => {
      setQuery("");
      navigate(`/settings/${id}`);
      setFocusTarget({ id: "settings-section-heading" });
    },
    [navigate],
  );

  const pickResult = useCallback(
    (row) => {
      setQuery("");
      navigate(`/settings/${row.section}`);
      setFocusTarget({ id: row.id });
    },
    [navigate],
  );

  const confirmDialog = useCallback(() => {
    if (dialog === "clear") clearLocalData();
    if (dialog === "reset") resetPreferences();

    setDialog(null);
    setNotice(copy.savedOnDevice);
  }, [clearLocalData, copy.savedOnDevice, dialog, resetPreferences]);

  const signOut = useCallback(() => {
    logout();
    setAccount({ state: "signedOut", user: null });
  }, []);

  /* The search box sticks to the top of the scrolling body and the section rail
     sticks directly below it. CSS cannot measure one element to position
     another, so the search block's height is measured here and written back as a
     custom property. It has to be measured rather than guessed: the hint wraps to
     a second line in Kiswahili, the text size preference changes it again, and a
     rail that overlaps the search box is the kind of bug nobody finds until a
     reader does. */
  useEffect(() => {
    const search = searchRef.current;
    const nav = navRef.current;
    if (!search || !nav || typeof ResizeObserver === "undefined") return undefined;

    const measure = () =>
      nav.style.setProperty("--settings-search-height", `${search.offsetHeight}px`);

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(search);

    return () => observer.disconnect();
  }, [language, preferences.accessibility.textSize]);

  /* One object passed to every section. A dozen components each taking six
     props is a dozen places for a prop to be renamed by accident. */
  const ctx = {
    copy,
    prefs: preferences,
    set: setPreference,
    toggle: togglePreference,
    language,
    setLanguage,
    account,
    openDialog: setDialog,
    signOut,
    /* `t.settings` is already the active language's copy, so `copy.faq` is the
       right-language list outright rather than something to index into. */
    faq: copy.faq,
    version: APP_VERSION,
  };

  const SECTION_CONTENT = {
    appearance: <AppearanceSection {...ctx} />,
    language: <LanguageSection {...ctx} />,
    accessibility: <AccessibilitySection {...ctx} />,
    notifications: <NotificationsSection {...ctx} />,
    content: <ContentSection {...ctx} />,
    learning: <LearningSection {...ctx} />,
    reading: <ReadingSection {...ctx} />,
    growth: <GrowthSection {...ctx} />,
    privacy: <PrivacySection {...ctx} />,
    account: <AccountSection {...ctx} />,
    security: <SecuritySection {...ctx} />,
    data: <DataSection {...ctx} />,
    help: <HelpSection {...ctx} />,
    about: <AboutSection {...ctx} />,
  };

  return (
    <>
      <div className="settings-body">
        <div className="settings-search-slot" ref={searchRef}>
          <SettingsSearch
            copy={copy}
            query={query}
            matchCount={matchCount}
            onQueryChange={setQuery}
            onPick={pickResult}
          />
        </div>

        <div className="settings-layout">
          <nav className="settings-nav" aria-label={copy.navLabel} ref={navRef}>
            <ul>
              {SETTINGS_SECTIONS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <NavLink
                      to={`/settings/${item.id}`}
                      className={`settings-nav-link${item.id === section ? " is-active" : ""}`}
                      onClick={() => selectSection(item.id)}
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span>{copyAt(copy, item.labelKey)}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="settings-content">
            {/* While a search is open the content area becomes the result list,
                so there is exactly one thing on screen to read at a time. */}
            {query.trim() ? null : (
              <>
                <h3
                  id="settings-section-heading"
                  className="settings-section-heading"
                  tabIndex={-1}
                >
                  {copyAt(copy, active.labelKey)}
                </h3>
                <p className="settings-section-intro">
                  {copyAt(copy, active.introKey)}
                </p>

                {notice ? (
                  <p className="setting-notice" role="status">
                    {notice}
                  </p>
                ) : null}

                {SECTION_CONTENT[section]}
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "clear"}
        title={copy.dialogs.clearLocalTitle}
        body={copy.dialogs.clearLocalBody}
        keeps={copy.dialogs.clearLocalKeeps}
        confirmLabel={copy.dialogs.clearLocalConfirm}
        cancelLabel={copy.actions.cancel}
        onConfirm={confirmDialog}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog === "reset"}
        title={copy.dialogs.resetTitle}
        body={copy.dialogs.resetBody}
        keeps={copy.dialogs.resetKeeps}
        confirmLabel={copy.dialogs.resetConfirm}
        cancelLabel={copy.actions.cancel}
        onConfirm={confirmDialog}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
/* ------------------------------- appearance ------------------------------- */

function AppearanceSection({ copy, prefs, set }) {
  return (
    <SettingGroup note={copy.notes.preferencesNote}>
      <SettingRow
        id="appearance.theme"
        label={copy.fields.theme}
        hint={copy.hints.theme}
        stacked
      >
        <SettingChoice
          name="appearance-theme"
          value={prefs.appearance.theme}
          onChange={(value) => set("appearance.theme", value)}
          columns={3}
          options={[
            { value: "light", label: copy.options.light },
            { value: "dark", label: copy.options.dark },
            { value: "system", label: copy.options.system },
          ]}
        />
      </SettingRow>

      <SettingRow
        id="appearance.density"
        label={copy.fields.density}
        hint={copy.hints.density}
        stacked
      >
        <SettingChoice
          name="appearance-density"
          value={prefs.appearance.density}
          onChange={(value) => set("appearance.density", value)}
          options={[
            { value: "comfortable", label: copy.options.comfortable },
            { value: "compact", label: copy.options.compact },
          ]}
        />
      </SettingRow>

      <SettingRow
        id="appearance.motion"
        label={copy.fields.motion}
        hint={copy.hints.motion}
        stacked
      >
        <SettingChoice
          name="appearance-motion"
          value={prefs.appearance.motion}
          onChange={(value) => set("appearance.motion", value)}
          options={[
            { value: "full", label: copy.options.fullAnimations },
            { value: "reduced", label: copy.options.reducedAnimations },
          ]}
        />
      </SettingRow>
    </SettingGroup>
  );
}

/* --------------------------------- language ------------------------------- */

function LanguageSection({ copy, language, setLanguage }) {
  return (
    <SettingGroup>
      <SettingRow
        id="language.site"
        label={copy.fields.siteLanguage}
        hint={copy.hints.siteLanguage}
        stacked
      >
        <SettingChoice
          name="site-language"
          value={language}
          onChange={setLanguage}
          columns={2}
          options={[
            { value: "en", label: copy.options.english },
            { value: "sw", label: copy.options.swahili },
          ]}
        />
      </SettingRow>
    </SettingGroup>
  );
}

/* ------------------------------ accessibility ----------------------------- */

function AccessibilitySection({ copy, prefs, set, toggle }) {
  const reduced = prefs.appearance.motion === "reduced";

  return (
    <>
      <SettingGroup>
        <SettingRow
          id="accessibility.textSize"
          label={copy.fields.textSize}
          hint={copy.hints.textSize}
          stacked
        >
          <SettingChoice
            name="accessibility-text-size"
            value={prefs.accessibility.textSize}
            onChange={(value) => set("accessibility.textSize", value)}
            columns={3}
            options={[
              { value: "default", label: copy.options.default },
              { value: "large", label: copy.options.large },
              { value: "xlarge", label: copy.options.extraLarge },
            ]}
          />
        </SettingRow>

        <SettingRow
          id="accessibility.contrast"
          label={copy.fields.contrast}
          hint={copy.hints.contrast}
        >
          <SettingSwitch
            checked={prefs.accessibility.contrast === "high"}
            onChange={(value) =>
              set("accessibility.contrast", value ? "high" : "standard")
            }
            onLabel={copy.states.on}
            offLabel={copy.states.off}
          />
        </SettingRow>

        {/* One preference, two honest homes. Appearance presents it as a choice
            between two animations; Accessibility presents it as the thing a
            reader actually needs. Both write the same value, so they can never
            disagree with each other. */}
        <SettingRow
          id="accessibility.motion"
          label={copy.fields.reduceMotion}
          hint={copy.hints.reduceMotion}
        >
          <SettingSwitch
            checked={reduced}
            onChange={() => toggle("appearance.motion")}
            onLabel={copy.states.on}
            offLabel={copy.states.off}
          />
        </SettingRow>

        <SettingRow
          id="accessibility.focus"
          label={copy.fields.focus}
          hint={copy.hints.focus}
        >
          <SettingSwitch
            checked={prefs.accessibility.focus === "enhanced"}
            onChange={(value) =>
              set("accessibility.focus", value ? "enhanced" : "standard")
            }
            onLabel={copy.states.on}
            offLabel={copy.states.off}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup
        id="accessibility.screenReader"
        title={copy.groups.screenReader}
        note={copy.notes.screenReader}
      >
        <p className="setting-hint">{copy.notes.keyboard}</p>
      </SettingGroup>
    </>
  );
}


/* ------------------------------- notifications ---------------------------- */

function NotificationsSection({ copy, prefs, set, toggle }) {
  const categories = [
    ["notifications.learning", "notifyLearning"],
    ["notifications.journey", "notifyJourney"],
    ["notifications.resources", "notifyResources"],
    ["notifications.stories", "notifyStories"],
    ["notifications.community", "notifyCommunity"],
  ];

  return (
    <>
      <SettingGroup note={copy.notes.notificationsDelivery}>
        {categories.map(([path, key]) => (
          <SettingRow
            key={path}
            id={path}
            label={copy.fields[key]}
            hint={copy.hints[key]}
          >
            <SettingSwitch
              checked={prefs.notifications[key]}
              onChange={() => toggle(path)}
              onLabel={copy.states.on}
              offLabel={copy.states.off}
            />
          </SettingRow>
        ))}

        {/* The one row with no switch to press. Security and account messages
            are not a preference, so the control says so rather than offering a
            toggle that would do nothing. */}
        <SettingRow
          id="notifications.system"
          label={copy.fields.notifySystem}
          hint={copy.hints.notifySystem}
        >
          <SettingSwitch
            checked
            disabled
            lockedLabel={copy.states.locked}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          id="notifications.frequency"
          label={copy.fields.frequency}
          hint={copy.hints.frequency}
          stacked
        >
          <SettingChoice
            name="notifications-frequency"
            value={prefs.notifications.frequency}
            onChange={(value) => set("notifications.frequency", value)}
            columns={4}
            options={[
              { value: "off", label: copy.options.off },
              { value: "occasionally", label: copy.options.occasionally },
              { value: "daily", label: copy.options.daily },
              { value: "weekly", label: copy.options.weekly },
            ]}
          />
        </SettingRow>

        <p className="setting-note">
          <Link className="text-link" to="/practice/settings">
            {copy.notes.practiceRemindersLink} <span aria-hidden="true">→</span>
          </Link>
        </p>
      </SettingGroup>
    </>
  );
}

/* --------------------------------- content -------------------------------- */

function ContentSection({ copy, prefs, set, toggle }) {
  return (
    <>
      <SettingGroup note={copy.notes.contentLanguage}>
        <SettingRow
          id="content.language"
          label={copy.fields.contentLanguage}
          hint={copy.hints.contentLanguage}
          stacked
        >
          <SettingChoice
            name="content-language"
            value={prefs.content.language}
            onChange={(value) => set("content.language", value)}
            columns={3}
            options={[
              { value: "en", label: copy.options.english },
              { value: "sw", label: copy.options.swahili },
              { value: "both", label: copy.options.both },
            ]}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup id="content.types" title={copy.fields.contentTypes} note={copy.notes.contentTypes}>
        <SettingRow
          id="content.types"
          stacked
          label={copy.fields.contentTypes}
          hint={copy.hints.contentTypes}
        >
          <SettingChecklist
            name="content-type"
            items={CONTENT_TYPE_KEYS.map((key) => ({
              value: key,
              label: copy.contentTypeLabels[key],
              checked: prefs.content.types[key],
            }))}
            onToggle={(key) => toggle(`content.types.${key}`)}
          />
        </SettingRow>
      </SettingGroup>
    </>
  );
}


/* --------------------------------- learning -------------------------------- */

function LearningSection({ copy, prefs, set, toggle }) {
  const switches = [
    ["learning.autoplayAudio", "autoplayAudio"],
    ["learning.autoplayVideo", "autoplayVideo"],
    ["learning.rememberPosition", "rememberPosition"],
    ["learning.showCompleted", "showCompleted"],
    ["learning.showProgress", "showProgress"],
  ];

  return (
    <>
      <SettingGroup>
        {switches.map(([path, key]) => (
          <SettingRow
            key={path}
            id={path}
            label={copy.fields[key]}
            hint={copy.hints[key]}
          >
            <SettingSwitch
              checked={prefs.learning[key]}
              onChange={() => toggle(path)}
              onLabel={copy.states.on}
              offLabel={copy.states.off}
            />
          </SettingRow>
        ))}

        <SettingRow
          id="learning.dailyReminder"
          label={copy.fields.dailyReminder}
          hint={copy.hints.dailyReminder}
        >
          <SettingSwitch
            checked={prefs.learning.dailyReminder}
            onChange={() => toggle("learning.dailyReminder")}
            onLabel={copy.states.on}
            offLabel={copy.states.off}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          id="learning.pace"
          label={copy.fields.pace}
          hint={copy.hints.pace}
          stacked
        >
          <SettingChoice
            name="learning-pace"
            value={prefs.learning.pace}
            onChange={(value) => set("learning.pace", value)}
            columns={3}
            options={[
              { value: "gentle", label: copy.options.gentle },
              { value: "normal", label: copy.options.normal },
              { value: "focused", label: copy.options.focused },
            ]}
          />
        </SettingRow>
      </SettingGroup>
    </>
  );
}

/* --------------------------------- reading -------------------------------- */

function ReadingSection({ copy, prefs, set }) {
  return (
    <SettingGroup>
      <SettingRow
        id="reading.fontSize"
        label={copy.fields.readingFontSize}
        hint={copy.hints.readingFontSize}
        stacked
      >
        <SettingChoice
          name="reading-font-size"
          value={prefs.reading.fontSize}
          onChange={(value) => set("reading.fontSize", value)}
          columns={4}
          options={[
            { value: "small", label: copy.options.small },
            { value: "default", label: copy.options.default },
            { value: "large", label: copy.options.large },
            { value: "xlarge", label: copy.options.extraLarge },
          ]}
        />
      </SettingRow>

      <SettingRow
        id="reading.lineSpacing"
        label={copy.fields.lineSpacing}
        hint={copy.hints.lineSpacing}
        stacked
      >
        <SettingChoice
          name="reading-line-spacing"
          value={prefs.reading.lineSpacing}
          onChange={(value) => set("reading.lineSpacing", value)}
          columns={3}
          options={[
            { value: "compact", label: copy.options.compactSpacing },
            { value: "comfortable", label: copy.options.comfortableSpacing },
            { value: "spacious", label: copy.options.spacious },
          ]}
        />
      </SettingRow>

      <SettingRow
        id="reading.width"
        label={copy.fields.readingWidth}
        hint={copy.hints.readingWidth}
        stacked
      >
        <SettingChoice
          name="reading-width"
          value={prefs.reading.width}
          onChange={(value) => set("reading.width", value)}
          columns={3}
          options={[
            { value: "narrow", label: copy.options.narrow },
            { value: "default", label: copy.options.defaultWidth },
            { value: "wide", label: copy.options.wide },
          ]}
        />
      </SettingRow>

      <SettingRow
        id="reading.scripture"
        label={copy.fields.scripture}
        hint={copy.hints.scripture}
        stacked
      >
        <SettingChoice
          name="reading-scripture"
          value={prefs.reading.scripture}
          onChange={(value) => set("reading.scripture", value)}
          columns={2}
          options={[
            { value: "inline", label: copy.options.inline },
            { value: "block", label: copy.options.separateBlock },
          ]}
        />
      </SettingRow>
    </SettingGroup>
  );
}


/* ---------------------------------- growth -------------------------------- */

/* The stage is a starting point, never a label: the copy on the row says so, and
   the first option is "not sure yet" so that nobody is pushed to describe
   themselves before they have any reason to. */
function GrowthSection({ copy, prefs, set, toggle }) {
  return (
    <>
      <SettingGroup note={copy.notes.growthStage}>
        <SettingRow
          id="growth.stage"
          label={copy.fields.stage}
          hint={copy.hints.stage}
          stacked
        >
          <SettingChoice
            name="growth-stage"
            value={prefs.growth.stage}
            onChange={(value) => set("growth.stage", value)}
            columns={3}
            options={[
              { value: "unclear", label: copy.options.notSureYet },
              { value: "exploring", label: copy.options.exploring },
              { value: "beginning", label: copy.options.beginning },
              { value: "growing", label: copy.options.growing },
              { value: "habits", label: copy.options.habits },
              { value: "serving", label: copy.options.serving },
              { value: "sharing", label: copy.options.sharing },
            ]}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup
        id="growth.reminders"
        title={copy.groups.growthReminders}
        note={copy.hints.growthReminders}
      >
        <SettingRow
          id="growth.reminders"
          stacked
          label={copy.fields.growthReminders}
          hint={copy.hints.growthReminders}
        >
          <SettingChecklist
            name="growth-reminder"
            items={GROWTH_REMINDER_KEYS.map((key) => ({
              value: key,
              label: copy.growthReminderLabels[key],
              checked: prefs.growth.reminders[key],
            }))}
            onToggle={(key) => toggle(`growth.reminders.${key}`)}
          />
        </SettingRow>
      </SettingGroup>
    </>
  );
}

/* --------------------------------- privacy -------------------------------- */

function PrivacySection({ copy, prefs, set, toggle }) {
  return (
    <>
      <SettingGroup note={copy.notes.profileVisibility}>
        <SettingRow
          id="privacy.profileVisibility"
          label={copy.fields.profileVisibility}
          hint={copy.hints.profileVisibility}
          stacked
        >
          <SettingChoice
            name="privacy-profile"
            value={prefs.privacy.profileVisibility}
            onChange={(value) => set("privacy.profileVisibility", value)}
            columns={3}
            options={[
              { value: "public", label: copy.options.public },
              { value: "limited", label: copy.options.limited },
              { value: "private", label: copy.options.private },
            ]}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup note={copy.notes.analytics}>
        <SettingRow
          id="privacy.activityVisible"
          label={copy.fields.activityVisible}
          hint={copy.notes.activityVisible}
        >
          <SettingSwitch
            checked={prefs.privacy.activityVisible}
            onChange={() => toggle("privacy.activityVisible")}
            onLabel={copy.options.allow}
            offLabel={copy.options.doNotAllow}
          />
        </SettingRow>

        {/* This row is deliberately candid. The site ships no analytics, and
            saying so is more useful than a switch that implies otherwise. The
            note underneath spells out the difference between optional
            measurement and the server logs nobody can switch off. */}
        <SettingRow
          id="privacy.analytics"
          label={copy.fields.analytics}
          hint={copy.hints.analytics}
        >
          <SettingSwitch
            checked={prefs.privacy.analytics}
            onChange={() => toggle("privacy.analytics")}
            onLabel={copy.options.allow}
            offLabel={copy.options.doNotAllow}
          />
        </SettingRow>

        <SettingRow
          id="privacy.personalization"
          label={copy.fields.personalization}
          hint={copy.notes.personalization}
        >
          <SettingSwitch
            checked={prefs.privacy.personalization}
            onChange={() => toggle("privacy.personalization")}
            onLabel={copy.options.allow}
            offLabel={copy.options.doNotAllow}
          />
        </SettingRow>

        <p className="setting-note">
          <Link className="text-link" to="/privacy-policy">
            {copy.actions.viewPrivacy} <span aria-hidden="true">→</span>
          </Link>
        </p>
      </SettingGroup>
    </>
  );
}


/* --------------------------------- account -------------------------------- */

function formatDate(value, language) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-GB", {
    dateStyle: "long",
  }).format(date);
}

function AccountSection({ copy, language, account, signOut }) {
  if (account.state === "loading") {
    return <p className="setting-hint">{copy.loading}</p>;
  }

  if (account.state !== "signedIn") {
    return (
      <SettingGroup>
        <p className="setting-hint">{copy.states.signInRequiredBody}</p>
        <p className="setting-actions">
          <Link className="button" to="/login">
            {copy.actions.signIn}
          </Link>
          <Link className="button secondary" to="/register">
            {copy.actions.register}
          </Link>
        </p>
      </SettingGroup>
    );
  }

  const user = account.user;

  return (
    <>
      <SettingGroup id="account.information" title={copy.groups.accountInformation}>
        <dl className="setting-facts">
          <SettingFact label={copy.facts.name} value={user.username} />
          <SettingFact label={copy.facts.email} value={user.email} />
          <SettingFact
            label={copy.facts.role}
            value={copy.roles[user.role] || user.role}
          />
          <SettingFact
            label={copy.facts.joined}
            value={formatDate(user.created_at, language) || copy.facts.unavailable}
          />
          <SettingFact
            label={copy.facts.verification}
            value={user.is_verified ? copy.facts.verified : copy.facts.notVerified}
          />
        </dl>
      </SettingGroup>

      <SettingGroup note={copy.notes.accountEdit}>
        <SettingUnavailable
          id="account.security"
          label={copy.fields.changeProfile}
          action={copy.states.comingSoon}
        />
      </SettingGroup>

      <SettingGroup>
        <SettingAction id="account.signOut" label={copy.fields.signOut}>
          <button type="button" className="button secondary" onClick={signOut}>
            {copy.actions.signOut}
          </button>
        </SettingAction>
      </SettingGroup>
    </>
  );
}


/* -------------------------------- security -------------------------------- */

function SecuritySection({ copy, account, signOut }) {
  const user = account.state === "signedIn" ? account.user : null;

  return (
    <>
      <SettingGroup note={copy.notes.securityInfo}>
        <SettingUnavailable
          id="security.password"
          label={copy.fields.changePassword}
          hint={copy.states.comingSoonBody}
          action={copy.states.comingSoon}
        />

        <SettingUnavailable
          id="security.sessions"
          label={copy.fields.sessions}
          hint={copy.states.comingSoonBody}
          action={copy.states.comingSoon}
        />

        <SettingAction id="security.signOut" label={copy.fields.signOut}>
          <button
            type="button"
            className="button secondary"
            onClick={signOut}
            disabled={!user}
          >
            {copy.actions.signOut}
          </button>
        </SettingAction>
      </SettingGroup>

      {/* Only what the API actually returns. The User model does not expose a
          sign-in method or a last-seen time, so those rows say so rather than
          inventing a plausible value. */}
      <SettingGroup id="security.info" title={copy.groups.accountSecurity}>
        <dl className="setting-facts">
          <SettingFact
            label={copy.facts.authentication}
            value={copy.facts.unavailable}
          />
          <SettingFact
            label={copy.facts.lastActivity}
            value={copy.facts.unavailable}
          />
          <SettingFact
            label={copy.facts.verification}
            value={
              user
                ? user.is_verified
                  ? copy.facts.verified
                  : copy.facts.notVerified
                : copy.states.signInRequired
            }
          />
        </dl>
      </SettingGroup>
    </>
  );
}

/* ---------------------------------- data ---------------------------------- */

function DataSection({ copy, openDialog }) {
  return (
    <>
      <SettingGroup>
        <SettingUnavailable
          id="data.download"
          label={copy.fields.downloadData}
          hint={copy.notes.downloadData}
          action={copy.states.comingSoon}
        />

        <SettingUnavailable
          id="data.delete"
          label={copy.fields.deleteAccount}
          hint={copy.notes.deleteAccount}
          action={copy.states.comingSoon}
        >
          <p className="setting-note">
            <Link className="text-link" to="/contact">
              {copy.actions.contactUs} <span aria-hidden="true">→</span>
            </Link>
          </p>
        </SettingUnavailable>
      </SettingGroup>

      {/* The two destructive actions, kept away from everything above and both
          behind a confirmation that states what survives. "Clear this device"
          and "delete my account" are never the same button. */}
      <SettingGroup>
        <SettingAction
          id="data.clearLocal"
          label={copy.fields.clearLocal}
          hint={copy.notes.dataKeeps}
        >
          <button
            type="button"
            className="button danger-quiet"
            onClick={() => openDialog("clear")}
          >
            {copy.actions.clearLocal}
          </button>
        </SettingAction>

        <SettingAction
          id="data.reset"
          label={copy.fields.resetSettings}
          hint={copy.notes.preferencesNote}
        >
          <button
            type="button"
            className="button danger-quiet"
            onClick={() => openDialog("reset")}
          >
            {copy.actions.reset}
          </button>
        </SettingAction>
      </SettingGroup>
    </>
  );
}


/* ----------------------------------- help --------------------------------- */

function HelpSection({ copy, faq }) {
  return (
    <>
      <SettingGroup note={copy.notes.helpIntro}>
        {/* Real answers rather than a link to a help centre that does not exist.
            A disclosure is keyboard operable and announced as one for free. */}
        <div id="help.faq" tabIndex={-1}>
          <h3 className="setting-group-title">{copy.fields.faq}</h3>
          <div className="setting-faq">
            {faq.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </SettingGroup>

      <SettingGroup>
        <SettingAction id="help.center" label={copy.fields.helpCenter}>
          <Link className="button secondary" to="/about">
            {copy.actions.viewAbout}
          </Link>
        </SettingAction>

        <SettingAction id="help.contact" label={copy.fields.contactSupport}>
          <Link className="button secondary" to="/contact">
            {copy.actions.contactUs}
          </Link>
        </SettingAction>

        <SettingAction id="help.report" label={copy.fields.reportProblem}>
          <Link className="button secondary" to="/contact">
            {copy.actions.contactUs}
          </Link>
        </SettingAction>

        <SettingAction id="help.feedback" label={copy.fields.sendFeedback}>
          <Link className="button secondary" to="/contact">
            {copy.actions.contactUs}
          </Link>
        </SettingAction>
      </SettingGroup>
    </>
  );
}

/* ---------------------------------- about --------------------------------- */

function AboutSection({ copy, version }) {
  return (
    <>
      <SettingGroup>
        <div id="about.intro" tabIndex={-1}>
          <h3 className="setting-group-title">{copy.fields.aboutSite}</h3>
          <p className="setting-prose">{copy.notes.aboutBody}</p>
          <p className="setting-note">
            <Link className="text-link" to="/about">
              {copy.actions.learnMore} <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </SettingGroup>

      <SettingGroup>
        <div id="about.version" tabIndex={-1}>
          <dl className="setting-facts">
            <SettingFact
              label={copy.fields.version}
              value={
                <span>
                  {version}
                  <span className="setting-note"> {copy.notes.versionBody}</span>
                </span>
              }
            />
          </dl>
        </div>

        <div id="about.legal" tabIndex={-1}>
          <h3 className="setting-group-title">{copy.groups.legal}</h3>
          <p className="setting-prose">{copy.notes.licenses}</p>
          <p className="setting-actions">
            <Link className="button secondary" to="/terms-of-use">
              {copy.actions.viewTerms}
            </Link>
            <Link className="button secondary" to="/privacy-policy">
              {copy.actions.viewPrivacy}
            </Link>
          </p>
        </div>
      </SettingGroup>
    </>
  );
}
