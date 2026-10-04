import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Copy,
  EyeOff,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

/**
 * The Resources studio.
 *
 * One workspace for the whole library: a dashboard of what needs attention, a
 * searchable list of everything including drafts and trash, and an editor
 * whose fields follow the resource's type.
 *
 * Deleting is always a soft delete with a confirmation, and restoring brings
 * something back as a draft rather than straight to published - putting
 * something back on the public site should always be a separate, deliberate
 * act.
 */

import BrandMark from "../components/BrandMark";
import { useLanguage } from "../i18n/LanguageContext";
import { fill } from "../i18n/resourceCopy";
import ResourceDashboard from "../resources/admin/ResourceDashboard";
import ResourceEditor from "../resources/admin/ResourceEditor";
import { RESOURCE_TYPES, resourceMeta } from "../resources/resourceTypes";
import { formatDate } from "../resources/resourceUtils";
import {
  bulkAdminResources,
  deleteAdminResource,
  duplicateAdminResource,
  getResourceOverview,
  listAdminResources,
  publishAdminResource,
  purgeAdminResource,
  restoreAdminResource,
  scheduleAdminResource,
  unpublishAdminResource,
} from "../services/api";
import "../learn-admin.css";
import "../resources/resources.css";
import "../resources/resources-admin.css";

const STATUSES = ["", "draft", "published", "scheduled", "archived"];
const SORTS = [
  ["updated", "sortUpdated"],
  ["created", "sortNewest"],
  ["title", "sortTitle"],
  ["status", "sortStatus"],
  ["popular", "sortPopular"],
];

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the viewer's own timezone. */
function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Close an overlay with Escape.
 *
 * A dialog nobody can dismiss with the keyboard is a keyboard trap, so both the
 * confirmations and the preview honour it. `busy` is respected so a dialog
 * cannot be closed out from under a request that is still running.
 */
function useEscape(onClose, busy) {
  useEffect(() => {
    if (!onClose) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, busy]);
}

export default function AdminResources() {
  const { t, language } = useLanguage();
  const copy = t.resources.admin;

  const [tab, setTab] = useState("dashboard");
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState({ key: "", data: null, error: "" });
  const [notice, setNotice] = useState("");

  const [filters, setFilters] = useState({
    q: "",
    type: "",
    status: "",
    trashed: false,
    sort: "updated",
    page: 1,
  });
  const [selected, setSelected] = useState(new Set());

  // `editing` is either null (the list), "new", or a resource id.
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  // { kind: "publish" | "trash" | ..., resource?, title, body, count? }
  const [confirming, setConfirming] = useState(null);
  const [scheduling, setScheduling] = useState(null);

  const refreshOverview = useCallback(async () => {
    try {
      setOverview(await getResourceOverview());
    } catch {
      // The dashboard is informational; failing to load it should not block
      // the list, which is the part an administrator came to use.
    }
  }, []);

  /*
   * Loading is derived from whether the response matches the filters that were
   * asked for, rather than flipped inside the fetch. Changing a filter then
   * never shows the previous page's rows next to a spinner.
   */
  const filterKey = JSON.stringify(filters);

  const refreshList = useCallback(async () => {
    const key = filterKey;

    try {
      const data = await listAdminResources({
        q: filters.q || undefined,
        type: filters.type || undefined,
        status: filters.status || undefined,
        trashed: filters.trashed || undefined,
        sort: filters.sort,
        page: filters.page,
        pageSize: 25,
      });
      setState({ key, data, error: "" });
    } catch (err) {
      setState({ key, data: null, error: err.message });
    }
  }, [filters, filterKey]);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const listing = state.data;
  const loading = state.key !== filterKey;
  const error = state.error;

  /* Notices clear themselves: an administrator should not have to dismiss a
     confirmation they have already read. */
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const HANDLERS = {
    publish: publishAdminResource,
    unpublish: unpublishAdminResource,
    duplicate: duplicateAdminResource,
    delete: deleteAdminResource,
    restore: restoreAdminResource,
    purge: purgeAdminResource,
  };

  const NOTICES = {
    publish: copy.published,
    unpublish: copy.unpublished,
    duplicate: copy.duplicated,
    delete: copy.trashed,
    restore: copy.restored,
    purge: copy.deleted,
  };

  // Every action that changes what visitors can see asks first. An
  // administrator should never have to remember which of these six buttons is
  // the irreversible one.
  const CONFIRMATIONS = {
    publish: copy.confirmPublishTitle,
    unpublish: copy.confirmUnpublishTitle,
    duplicate: copy.confirmDuplicateTitle,
    delete: copy.confirmTrashTitle,
    restore: copy.confirmRestoreTitle,
    purge: copy.confirmDeleteTitle,
  };

  const BODIES = {
    publish: copy.confirmPublishBody,
    unpublish: copy.confirmUnpublishBody,
    duplicate: copy.confirmDuplicateBody,
    delete: copy.confirmTrashBody,
    restore: copy.confirmRestoreBody,
    purge: copy.confirmDeleteBody,
  };

  function request(action, resource) {
    setConfirming({
      action,
      resource,
      title: CONFIRMATIONS[action],
      body: BODIES[action],
    });
  }

  async function act(action, resource) {
    setBusy(true);
    try {
      await HANDLERS[action]?.(resource.id);
      setNotice(NOTICES[action] || copy.actionDone);
      await Promise.all([refreshOverview(), refreshList()]);
    } catch (err) {
      setState((current) => ({ ...current, error: err.message }));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  async function runBulk(action) {
    const count = selected.size;
    if (count === 0) return;

    if (action === "delete") {
      setConfirming({
        bulk: action,
        count,
        title: fill(copy.confirmBulkTitle, { count }),
        body: copy.confirmBulkBody,
      });
      return;
    }

    setBusy(true);
    try {
      await bulkAdminResources([...selected], action);
      setNotice(fill(copy.bulkDone, { count }));
      setSelected(new Set());
      await Promise.all([refreshOverview(), refreshList()]);
    } catch (err) {
      setState((current) => ({ ...current, error: err.message }));
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(when) {
    if (!scheduling) return;

    setBusy(true);
    try {
      // An empty field means "just publish it now", which is what the copy
      // promise to the administrator - so it is sent as no date at all rather
      // than as a date in the past.
      await scheduleAdminResource(scheduling.id, when || null);
      setNotice(when ? fill(copy.scheduleDone, { when: formatDate(when, language) }) : copy.published);
      setScheduling(null);
      await Promise.all([refreshOverview(), refreshList()]);
    } catch (err) {
      setState((current) => ({ ...current, error: err.message }));
    } finally {
      setBusy(false);
    }
  }

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* --- the editor takes over the whole page, like the other studios ----- */
  if (editing) {
    return (
      <main className="learn-admin--page res-admin">
        <header className="res-admin-topbar">
          <button
            type="button"
            className="res-btn"
            onClick={() => setEditing(null)}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {copy.backToLibrary}
          </button>
        </header>

        <ResourceEditor
          key={editing === "new" ? "new" : editing}
          resourceId={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setNotice(editing === "new" ? copy.created : copy.saved);
            refreshOverview();
            refreshList();
            // A brand-new resource now has an id, so switch from create mode
            // to editing it rather than leaving the editor in a stale state.
            if (editing === "new" && saved?.id) setEditing(saved.id);
          }}
        />
      </main>
    );
  }

  const items = listing?.items || [];
  const pages = listing?.pages || 1;
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  return (
    <main className="learn-admin--page res-admin">
      <header className="res-admin-topbar">
        <a className="cms-brand" href="/">
          <BrandMark />
          <span>The Small Voice</span>
        </a>

        <div className="res-admin-topbar-actions">
          <Link to="/admin" className="res-btn res-btn--ghost">
            Back to workspace
          </Link>
          <button
            type="button"
            className="res-btn res-btn--ghost"
            onClick={() => {
              localStorage.removeItem("access_token");
              window.location.assign("/");
            }}
          >
            <LogOut size={15} aria-hidden="true" />
            {copy.signOut}
          </button>
        </div>
      </header>

      <div className="res-admin-tabs">
        {[
          ["dashboard", copy.tabDashboard],
          ["library", copy.tabLibrary],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <p className="res-admin-notice" role="status">
          <CheckCircle2 size={15} aria-hidden="true" />
          {notice}
        </p>
      )}

      {error && (
        <p className="res-error" role="alert">
          {error}
        </p>
      )}

      {tab === "dashboard" && (
        <>
          <ResourceDashboard
            overview={overview}
            loading={loading}
            onEdit={(item) => setEditing(item.id)}
            onNew={() => setEditing("new")}
          />

          <div className="res-admin-newbar">
            <button
              type="button"
              className="res-btn res-btn--primary"
              onClick={() => setEditing("new")}
            >
              <Plus size={15} aria-hidden="true" />
              {copy.tabNew}
            </button>
          </div>
        </>
      )}

      {tab === "library" && (
        <>
          <div className="res-admin-toolbar">
            <label className="res-search">
              <Search size={15} aria-hidden="true" />
              <span className="visually-hidden">{copy.search}</span>
              <input
                type="search"
                value={filters.q}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    q: event.target.value,
                    page: 1,
                  }))
                }
                placeholder={copy.searchPlaceholder}
              />
            </label>

            <select
              className="res-select"
              aria-label={copy.allTypes}
              value={filters.type}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  type: event.target.value,
                  page: 1,
                }))
              }
            >
              <option value="">{copy.allTypes}</option>
              {RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t.resources.singularTypes?.[type] || type}
                </option>
              ))}
            </select>

            <select
              className="res-select"
              aria-label={copy.allStatuses}
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                  page: 1,
                }))
              }
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status ? copy.status?.[status] : copy.allStatuses}
                </option>
              ))}
            </select>

            <select
              className="res-select"
              aria-label={t.resources.sortBy}
              value={filters.sort}
              onChange={(event) =>
                setFilters((current) => ({ ...current, sort: event.target.value }))
              }
            >
              {SORTS.map(([value, key]) => (
                <option key={value} value={value}>
                  {copy[key]}
                </option>
              ))}
            </select>

            <label className="res-check">
              <input
                type="checkbox"
                checked={filters.trashed}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    trashed: event.target.checked,
                    page: 1,
                  }))
                }
              />
              {copy.trash}
            </label>

            <button
              type="button"
              className="res-icon-btn"
              onClick={() => {
                refreshList();
                refreshOverview();
              }}
              aria-label={copy.refresh}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </div>

          {/* Bulk actions appear only when something is selected, so the row
              never changes height under the pointer. */}
          {selected.size > 0 && (
            <div className="res-admin-bulk">
              <span>{fill(copy.selected, { count: selected.size })}</span>
              <button
                type="button"
                className="res-btn"
                disabled={busy}
                onClick={() => runBulk("publish")}
              >
                {copy.bulkPublish}
              </button>
              <button
                type="button"
                className="res-btn"
                disabled={busy}
                onClick={() => runBulk("unpublish")}
              >
                {copy.bulkUnpublish}
              </button>
              <button
                type="button"
                className="res-btn"
                disabled={busy}
                onClick={() => runBulk("feature")}
              >
                {copy.bulkFeature}
              </button>
              <button
                type="button"
                className="res-btn"
                disabled={busy}
                onClick={() => runBulk(filters.trashed ? "restore" : "delete")}
              >
                {filters.trashed ? copy.bulkRestore : copy.bulkTrash}
              </button>
              <button
                type="button"
                className="res-btn res-btn--ghost"
                onClick={() => setSelected(new Set())}
              >
                {copy.clearSelection}
              </button>
            </div>
          )}

          <div className="res-admin-list">
            {items.length > 0 && (
              <label className="res-check res-admin-selectall">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(
                      allSelected
                        ? new Set()
                        : new Set([...selected, ...items.map((item) => item.id)]),
                    )
                  }
                />
                {copy.selectAll}
              </label>
            )}

            {items.map((item) => (
              <ResourceRow
                key={item.id}
                item={item}
                copy={copy}
                typeLabel={t.resources.singularTypes?.[item.type] || item.type}
                language={language}
                busy={busy}
                trashed={filters.trashed}
                selected={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
                onEdit={() => setEditing(item.id)}
                onAct={(action) => request(action, item)}
                onSchedule={() => setScheduling(item)}
              />
            ))}

            {!items.length && !loading && (
              <p className="res-admin-hint">
                {filters.trashed ? copy.emptyTrash : copy.emptyLibrary}
              </p>
            )}
          </div>

          {pages > 1 && (
            <div className="res-pagination">
              <button
                type="button"
                className="res-btn"
                disabled={filters.page <= 1}
                onClick={() =>
                  setFilters((current) => ({ ...current, page: current.page - 1 }))
                }
              >
                {t.resources.previous}
              </button>
              <span className="res-pagination-info">
                {filters.page} / {pages}
              </span>
              <button
                type="button"
                className="res-btn"
                disabled={filters.page >= pages}
                onClick={() =>
                  setFilters((current) => ({ ...current, page: current.page + 1 }))
                }
              >
                {t.resources.next}
              </button>
            </div>
          )}

          <div className="res-admin-newbar">
            <button
              type="button"
              className="res-btn res-btn--primary"
              onClick={() => setEditing("new")}
            >
              <Plus size={15} aria-hidden="true" />
              {copy.tabNew}
            </button>
          </div>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          copy={copy}
          title={confirming.title}
          body={confirming.body}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            if (confirming.bulk) {
              const action = confirming.bulk;
              setConfirming(null);
              runBulk(action);
            } else {
              act(confirming.action, confirming.resource);
            }
          }}
        />
      )}

      {scheduling && (
        <ScheduleDialog
          copy={copy}
          resource={scheduling}
          busy={busy}
          onCancel={() => setScheduling(null)}
          onConfirm={saveSchedule}
        />
      )}
    </main>
  );
}

/**
 * One row of the library table, with the actions that apply to its state.
 *
 * The buttons a row offers depend on where that resource is: a trashed one can
 * only be restored or destroyed, while a live one can be scheduled, duplicated
 * and edited. Offering the wrong action is worse than offering fewer.
 */
function ResourceRow({
  item,
  copy,
  typeLabel,
  language,
  busy,
  trashed,
  selected,
  onToggle,
  onEdit,
  onAct,
  onSchedule,
}) {
  const Icon = resourceMeta(item.type).icon;

  return (
    <article className="res-admin-row">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={fill(copy.selectResource, { title: item.title })}
      />

      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />

      <div className="res-admin-row-title">
        <strong>{item.title}</strong>
        <small>
          {typeLabel}
          {item.author ? ` · ${item.author}` : ""}
        </small>
      </div>

      <span className={`res-status res-status--${item.status}`}>
        {copy.status?.[item.status] || copy.unknownStatus}
      </span>

      <small className="res-admin-row-date">
        {item.status === "scheduled" && item.scheduled_for
          ? fill(copy.statusPublishAt, {
              when: formatDate(item.scheduled_for, language),
            })
          : item.updated_at
            ? formatDate(item.updated_at, language)
            : ""}
      </small>

      <div className="res-admin-row-actions">
        {trashed ? (
          <>
            <button
              type="button"
              className="res-icon-btn"
              disabled={busy}
              onClick={() => onAct("restore")}
              aria-label={`${copy.restore} — ${item.title}`}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="res-icon-btn"
              disabled={busy}
              onClick={() => onAct("purge")}
              aria-label={`${copy.deleteForever} — ${item.title}`}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="res-icon-btn"
              disabled={busy}
              onClick={onEdit}
              aria-label={`${copy.edit} — ${item.title}`}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>

            {item.status === "published" ? (
              <button
                type="button"
                className="res-icon-btn"
                disabled={busy}
                onClick={() => onAct("unpublish")}
                aria-label={`${copy.unpublish} — ${item.title}`}
              >
                <EyeOff size={14} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="res-icon-btn"
                disabled={busy}
                onClick={() => onAct("publish")}
                aria-label={`${copy.publish} — ${item.title}`}
              >
                <CheckCircle2 size={14} aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              className="res-icon-btn"
              disabled={busy}
              onClick={onSchedule}
              aria-label={`${copy.schedule} — ${item.title}`}
            >
              <CalendarClock size={14} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="res-icon-btn"
              disabled={busy}
              onClick={() => onAct("duplicate")}
              aria-label={`${copy.duplicate} — ${item.title}`}
            >
              <Copy size={14} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="res-icon-btn"
              disabled={busy}
              onClick={() => onAct("delete")}
              aria-label={`${copy.moveToTrash} — ${item.title}`}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </article>
  );
}
/**
 * A confirmation the administrator can read in their own language.
 *
 * A dialog rather than window.confirm, for two reasons: it can be styled with
 * the rest of the studio and translated, and it keeps focus so the Escape key
 * and Tab still behave the way a keyboard user expects.
 */
function ConfirmDialog({ copy, title, body, busy, onCancel, onConfirm }) {
  useEscape(onCancel, busy);

  return (
    <div className="res-modal" role="presentation" onClick={onCancel}>
      <div
        className="res-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="res-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="res-confirm-title">{title}</h2>
        <p>{body}</p>

        <div className="res-editor-actions">
          <button
            type="button"
            className="res-btn"
            onClick={onCancel}
            disabled={busy}
          >
            {copy.cancelAction}
          </button>
          <button
            type="button"
            className="res-btn res-btn--primary"
            onClick={onConfirm}
            disabled={busy}
          >
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Scheduling.
 *
 * An empty field publishes immediately rather than scheduling for the epoch -
 * the administrator is offered "when", and answering "now" should do exactly
 * what it says.
 */
function ScheduleDialog({ copy, resource, busy, onCancel, onConfirm }) {
  const [when, setWhen] = useState(toLocalInput(resource.scheduled_for));

  useEscape(onCancel, busy);

  return (
    <div className="res-modal" role="presentation" onClick={onCancel}>
      <div
        className="res-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="res-schedule-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="res-schedule-title">
          <CalendarClock size={16} aria-hidden="true" />
          {copy.scheduleTitle}
        </h2>
        <p className="res-admin-hint">{copy.scheduleHint}</p>
        <p className="res-admin-hint">
          <strong>{resource.title}</strong>
        </p>

        <label className="res-field">
          <span className="res-field-label">{copy.scheduleAt}</span>
          <input
            className="res-input"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        </label>

        <div className="res-editor-actions">
          <button
            type="button"
            className="res-btn"
            onClick={onCancel}
            disabled={busy}
          >
            {copy.cancelAction}
          </button>
          <button
            type="button"
            className="res-btn res-btn--primary"
            onClick={() => onConfirm(when)}
            disabled={busy}
          >
            {copy.schedule}
          </button>
        </div>
      </div>
    </div>
  );
}
