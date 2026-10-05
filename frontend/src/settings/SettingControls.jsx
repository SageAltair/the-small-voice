/**
 * The four shapes a setting can take.
 *
 * Every one of them is a real form control wrapped in a label, not a styled
 * <div> pretending to be a switch. That is the whole reason these are shared
 * components: a toggle that has to be re-implemented per section is a toggle
 * that eventually forgets its label, its state announcement or its keyboard
 * behaviour.
 *
 * They all follow the site's own furniture - the same border, radius, accent and
 * uppercase button voice as `.button` and the resource filters - so a settings
 * row reads as part of the site rather than as a control panel bolted onto it.
 */

/** A labelled row: the control on the right, the explanation underneath. */
export function SettingRow({ id, label, hint, children, stacked = false }) {
  return (
    <div
      id={id}
      className={`setting-row${stacked ? " setting-row--stacked" : ""}`}
      /* Focusable so that arriving from a search result moves the reading
         position to the row itself, not just somewhere near it. */
      tabIndex={-1}
    >
      <div className="setting-row-text">
        <span className="setting-label">{label}</span>
        {hint ? <span className="setting-hint">{hint}</span> : null}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

/**
 * On / off, as a checkbox styled as a switch.
 *
 * A checkbox rather than a button with aria-pressed: the label is the row text,
 * the state is `checked`, and every screen reader announces it without being
 * told to.
 */
export function SettingSwitch({
  checked,
  onChange,
  disabled = false,
  lockedLabel,
  onLabel = "On",
  offLabel = "Off",
}) {
  return (
    <label className={`setting-switch${disabled ? " is-disabled" : ""}`}>
      <input
        type="checkbox"
        className="visually-hidden"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="setting-switch-track" aria-hidden="true">
        <span className="setting-switch-thumb" />
      </span>
      <span className="setting-switch-state">
        {disabled && lockedLabel ? lockedLabel : checked ? onLabel : offLabel}
      </span>
    </label>
  );
}

/**
 * One choice out of several, as a radio group.
 *
 * Real radios, so arrow keys move between options and the group is announced
 * with its own label - which a row of buttons never is.
 */
export function SettingChoice({ name, value, options, onChange, columns }) {
  return (
    <div
      className="setting-choice"
      role="radiogroup"
      style={columns ? { "--setting-choice-columns": columns } : undefined}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={`setting-choice-option${option.value === value ? " is-active" : ""}`}
        >
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Several independent on / off items, as checkboxes in a wrapping row.
 *
 * Used for content types and gentle reminders, where turning one off never
 * turns the others off with it.
 */
export function SettingChecklist({ name, items, onToggle }) {
  return (
    <div className="setting-checklist">
      {items.map((item) => (
        <label
          key={item.value}
          className={`setting-checklist-item${item.checked ? " is-active" : ""}`}
        >
          <input
            type="checkbox"
            className="visually-hidden"
            name={`${name}-${item.value}`}
            checked={Boolean(item.checked)}
            onChange={() => onToggle(item.value)}
          />
          <span className="setting-checklist-box" aria-hidden="true" />
          <span>{item.label}</span>
        </label>
      ))}
    </div>
  );
}

/** A bordered block that holds one group of related settings. */
export function SettingGroup({ title, children, note, id }) {
  return (
    <section className="setting-group" aria-labelledby={id ? `${id}-title` : undefined}>
      {/* h4, not h3: inside the settings popup the dialog's own title is the h2
          and the section name is the h3, so a group is one level below that. */}
      {title ? (
        <h4 id={id ? `${id}-title` : undefined} className="setting-group-title">
          {title}
        </h4>
      ) : null}
      {children}
      {note ? <p className="setting-note">{note}</p> : null}
    </section>
  );
}

/**
 * A row whose control is a link or a button rather than a setting - the rows in
 * Help and About, and the sign-out row.
 */
export function SettingAction({ id, label, hint, children }) {
  return (
    <div id={id} className="setting-row" tabIndex={-1}>
      <div className="setting-row-text">
        <span className="setting-label">{label}</span>
        {hint ? <span className="setting-hint">{hint}</span> : null}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

/**
 * A row for something the site cannot do yet.
 *
 * It says so rather than showing a button that goes nowhere, because a greyed
 * out control with an honest sentence is more useful than a cheerful fake.
 */
export function SettingUnavailable({ id, label, hint, action, children }) {
  return (
    <div id={id} className="setting-row setting-row--unavailable" tabIndex={-1}>
      <div className="setting-row-text">
        <span className="setting-label">
          {label} <span className="setting-badge">{action}</span>
        </span>
        {hint ? <span className="setting-hint">{hint}</span> : null}
        {children}
      </div>
    </div>
  );
}

/** A read-only fact about the account, as a definition row. */
export function SettingFact({ label, value }) {
  return (
    <div className="setting-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}