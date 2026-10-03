import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ListChecks } from "lucide-react";
import {
  getPracticeSettings,
  listPracticeCommitments,
  updatePracticeSettings,
} from "../services/practiceApi";
import { useLanguage } from "../i18n/LanguageContext";
import "../practice.css";

// ===========================================================================
// PRACTICE SETTINGS
//
// Reminders are opt-in, always visible and always switchable off. Nothing on
// this page implies the learner is falling behind, and saving is explicit so a
// stray tap cannot change a preference.
// ===========================================================================

const FREQUENCY_COPY = {
  daily: "reminderDaily",
  weekdays: "reminderWeekdays",
  weekly: "reminderWeekly",
  off: "reminderOff",
};

export default function PracticeSettings() {
  const { language, t } = useLanguage();
  const p = t.practice;

  const [settings, setSettings] = useState(null);
  const [reminder, setReminder] = useState(null);
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    let stale = false;
    Promise.all([getPracticeSettings(language), listPracticeCommitments(language)])
      .then(([config, commitments]) => {
        if (stale) return;
        setSettings(config);
        setReminder(config.reminder);
        setPlans(commitments.commitments || []);
        setError("");
      })
      .catch((err) => {
        if (stale) return;
        setError(err?.message || p.errorBody);
      });
    return () => {
      stale = true;
    };
  }, [language, p.errorBody]);

  useEffect(() => load(), [load]);

  async function save() {
    if (!reminder || busy) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const result = await updatePracticeSettings(
        {
          reminder: {
            enabled: Boolean(reminder.enabled),
            frequency: reminder.frequency,
            time: reminder.time,
          },
        },
        language,
      );
      setReminder(result.reminder);
      setSaved(true);
    } catch (err) {
      setError(err?.message || p.errorBody);
    } finally {
      setBusy(false);
    }
  }

  const minuteTable = Object.entries(settings?.session_sizes || {}).sort(
    ([a], [b]) => Number(a) - Number(b),
  );

  return (
    <div className="practice-page">
      <header className="practice-hero">
        <div className="container">
          <p className="practice-eyebrow">{p.nav}</p>
          <h1>{p.settings}</h1>
          <p className="practice-hero-intro">{p.progressSaved}</p>
        </div>
      </header>

      <div className="container">
        {error ? <div className="cms-alert">{error}</div> : null}

        {!settings && !error ? <p className="practice-inline-note">{p.loading}</p> : null}

        {reminder ? (
          <section className="practice-section">
            <h2>
              <Bell size={18} aria-hidden="true" /> {p.reminders}
            </h2>
            <p className="practice-section-note">{p.reminderBody}</p>

            <div className="practice-commitment">
              <label className="practice-commitment-label">
                <span>
                  <input
                    type="checkbox"
                    checked={Boolean(reminder.enabled)}
                    onChange={(event) =>
                      setReminder((row) => ({ ...row, enabled: event.target.checked }))
                    }
                  />{" "}
                  {p.reminders}
                </span>
              </label>

              <label className="practice-commitment-label">
                {p.reminderFrequency}
                <select
                  value={reminder.frequency || "daily"}
                  disabled={!reminder.enabled}
                  onChange={(event) =>
                    setReminder((row) => ({ ...row, frequency: event.target.value }))
                  }
                >
                  {(reminder.options || ["daily", "weekdays", "weekly", "off"]).map((option) => (
                    <option key={option} value={option}>
                      {FREQUENCY_COPY[option] ? p[FREQUENCY_COPY[option]] : option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="practice-commitment-label">
                {p.reminderTime}
                <input
                  type="time"
                  value={reminder.time || "08:00"}
                  disabled={!reminder.enabled}
                  onChange={(event) =>
                    setReminder((row) => ({ ...row, time: event.target.value }))
                  }
                />
              </label>

              <div className="practice-actions-row">
                <button type="button" className="button" onClick={save} disabled={busy}>
                  {busy ? p.working : p.save}
                </button>
                {saved ? <span className="practice-inline-note">{p.progressSaved}</span> : null}
              </div>
            </div>
          </section>
        ) : null}

        {minuteTable.length > 0 ? (
          <section className="practice-section">
            <h2>{p.sessionLength}</h2>
            <p className="practice-section-note">{p.iHaveTime}</p>
            <div className="practice-stats">
              {minuteTable.map(([minutes, count]) => (
                <div className="practice-stat" key={minutes}>
                  <strong>{count}</strong>
                  <span>
                    {p.questions} · {minutes} {p.minutes}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}


        {settings?.question_types?.length ? (
          <section className="practice-section">
            <h2>{p.questionTypes}</h2>
            <div className="practice-time-options">
              {settings.question_types.map((type) => (
                <span className="practice-time-option" key={type}>
                  {p.typeLabels[type] || type}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="practice-section">
          <h2>
            <ListChecks size={18} aria-hidden="true" /> {p.plans}
          </h2>
          {plans && plans.length === 0 ? (
            <p className="practice-section-note">{p.noPlans}</p>
          ) : (
            <ul className="practice-reviewed">
              {(plans || []).map((plan) => (
                <li key={plan.id}>
                  <span style={{ flex: 1 }}>
                    {plan.text}
                    {plan.when_text || plan.where_text ? (
                      <small className="practice-inline-note">
                        {" "}
                        {[plan.when_text, plan.where_text].filter(Boolean).join(" · ")}
                      </small>
                    ) : null}
                  </span>
                  <span className="practice-pill">{plan.date}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="practice-section">
          <Link className="btn-secondary" to="/practice">
            {p.backToPractice}
          </Link>
        </section>
      </div>
    </div>
  );
}

