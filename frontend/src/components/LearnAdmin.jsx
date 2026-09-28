import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Copy,
  Eye, Gauge, Layers, ListChecks, Pencil, Plus, RefreshCw, Save, Search,
  Tags, Trash2, Undo2, Upload, X,
} from "lucide-react";
import LessonBuilder from "./LessonBuilder";
import ValidationReport from "./LearnValidation";
import { getImageUrl, toMediaPath, uploadAdminImage } from "../services/api";
import {
  archiveAdminLearnPath, archiveAdminLesson, createAdminLesson, createLearnCategory,
  createLearnPath, deleteAdminLearnPath, deleteAdminLesson, deleteLearnCategory,
  duplicateAdminLearnPath, duplicateAdminLesson, getAdminLearnPath, getLearnAdminOverview,
  getLearnBlockTypes, listAdminLearnPaths, listLearnCategories, saveAdminLearnPath,
  updateLearnCategory,
} from "../services/learnApi";
import "../learn-admin.css";

// ================================
// LEARN CONTENT STUDIO
// ================================
//
// Paths and lessons are edited as whole documents (the same shape the API
// returns), so what the admin sees is what the server validated. Publishing is
// never implicit: saving keeps something a draft until Publish is pressed, and
// the server's validation report is shown field by field when it refuses.

const LEVELS = [
  { id: "beginner", label: "Beginner" },
  { id: "growing", label: "Growing" },
  { id: "deeper", label: "Deeper" },
];
const STATUSES = [
  { id: "", label: "All statuses" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Draft" },
  { id: "unpublished", label: "Archived" },
];
const STATUS_LABELS = { published: "Published", draft: "Draft", unpublished: "Archived" };
const LANGUAGE_LABELS = { en: "English", sw: "Swahili" };
const TABS = [
  { id: "paths", label: "Paths", icon: Layers },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "insights", label: "Insights", icon: Gauge },
];

const slugify = (text) =>
  String(text || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const messageOf = (err) => err?.message || "Something went wrong.";

const timeAgo = (value) => {
  if (!value) return "never";
  const stamp = new Date(value).getTime();
  if (Number.isNaN(stamp)) return "never";
  const days = Math.round((Date.now() - stamp) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(value).toLocaleDateString();
};

function emptyCategory() {
  return {
    slug: "",
    icon: "",
    display_order: 0,
    status: "draft",
    translations: {
      en: { name: "", description: "" },
      sw: { name: "", description: "" },
    },
  };
}

function StatusPill({ status }) {
  return (
    <span className={`cms-status ${status === "published" ? "published" : "draft"}`}>
      {STATUS_LABELS[status] || status || "Draft"}
    </span>
  );
}

export default function LearnAdmin({ onNotice = () => {}, onPathCount = () => {} }) {
  const [tab, setTab] = useState("paths");
  const [overview, setOverview] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [paths, setPaths] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [pathDraft, setPathDraft] = useState(null);
  const [lessonId, setLessonId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState(null);
  const [newPath, setNewPath] = useState(null);
  const [newLesson, setNewLesson] = useState({ title: "", estimated_minutes: 5 });
  const [categoryDraft, setCategoryDraft] = useState(null);
  const [dirty, setDirty] = useState(false);

  // ---- loading ----------------------------------------------------------
  const loadLists = useCallback(async () => {
    try {
      const [overviewData, pathData, categoryData] = await Promise.all([
        getLearnAdminOverview(),
        listAdminLearnPaths({ status: statusFilter || undefined, q: query.trim() || undefined }),
        listLearnCategories(),
      ]);
      setOverview(overviewData);
      setPaths(pathData.items || []);
      setCategories(categoryData.items || []);
      setError("");
      // Tell the hosting workspace how much is still unpublished, so its
      // sidebar badge can mean "needs attention" rather than "how many exist".
      onPathCount(overviewData?.totals?.draft_paths ?? 0);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [statusFilter, query, onPathCount]);

  useEffect(() => {
    getLearnBlockTypes()
      .then(setCatalog)
      .catch(() => setCatalog(null)); // the builder falls back to its own copy
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadLists, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadLists, query]);

  function fromDocument(doc) {
    return { ...doc.path, translations: doc.translations, lessons: doc.lessons };
  }

  const reloadPath = useCallback(async (pathId) => {
    const doc = await getAdminLearnPath(pathId);
    setPathDraft(fromDocument(doc));
    setValidation(doc.validation || null);
    setDirty(false);
    return doc;
  }, []);

  async function openPath(id) {
    setBusy(true);
    setError("");
    try {
      await reloadPath(id);
      setLessonId(null);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  // ---- draft editing ----------------------------------------------------
  function pathPayload(extra = {}) {
    return {
      path: {
        slug: pathDraft.slug,
        category_id: pathDraft.category_id ?? null,
        cover_url: pathDraft.cover_url || null,
        level: pathDraft.level,
        estimated_minutes: Number(pathDraft.estimated_minutes) || 0,
        language: pathDraft.language,
        featured: Boolean(pathDraft.featured),
        display_order: Number(pathDraft.display_order) || 0,
        ...extra,
      },
      translations: {
        en: {
          title: pathDraft.translations?.en?.title || "",
          description: pathDraft.translations?.en?.description || "",
        },
        sw: {
          title: pathDraft.translations?.sw?.title || "",
          description: pathDraft.translations?.sw?.description || "",
        },
      },
      lesson_order: (pathDraft.lessons || []).map((lesson) => lesson.id),
    };
  }

  const changePath = (field, value) => {
    setDirty(true);
    setPathDraft((current) => ({ ...current, [field]: value }));
  };

  const changeTranslation = (language, field, value) => {
    setDirty(true);
    setPathDraft((current) => ({
      ...current,
      translations: {
        ...current.translations,
        [language]: { ...(current.translations?.[language] || {}), [field]: value },
      },
    }));
  };

  /**
   * Every write goes through here so one failure mode - a 422 carrying the
   * full validation report - is handled once instead of in eight places.
   */
  async function run(action, successMessage) {
    setBusy(true);
    setError("");
    try {
      await action();
      if (successMessage) onNotice(successMessage);
      return true;
    } catch (err) {
      if (err?.detail && typeof err.detail === "object" && !Array.isArray(err.detail)) {
        setValidation({
          ready: false,
          errors: err.detail.errors || [],
          warnings: err.detail.warnings || [],
        });
      }
      setError(messageOf(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ---- path actions -----------------------------------------------------
  async function createPath(event) {
    event.preventDefault();
    const title = (newPath?.title || "").trim();
    if (!title) return;
    await run(async () => {
      const created = await createLearnPath({
        title,
        language: newPath.language,
        slug: newPath.slug ? slugify(newPath.slug) : undefined,
        description: newPath.description || undefined,
      });
      setNewPath(null);
      await loadLists();
      setPathDraft(fromDocument(created));
      setValidation(created.validation || null);
      setDirty(false);
    }, "Draft path created. Add lessons, then publish when it is ready.");
  }

  function savePath(status) {
    return run(async () => {
      const saved = await saveAdminLearnPath(pathDraft.id, pathPayload(status ? { status } : {}));
      setPathDraft(fromDocument(saved));
      setValidation(saved.validation || null);
      setDirty(false);
      await loadLists();
    }, status === "published" ? "Path published." : "Path saved.");
  }

  async function archivePath() {
    if (!window.confirm("Archive this path? Learners stop seeing it, and nothing is deleted.")) return;
    if (await run(() => archiveAdminLearnPath(pathDraft.id), "Path archived.")) await reloadPath(pathDraft.id);
  }

  async function duplicatePath() {
    if (await run(() => duplicateAdminLearnPath(pathDraft.id), "A draft copy was created.")) {
      setPathDraft(null);
      await loadLists();
    }
  }

  async function deletePath() {
    if (!window.confirm("Delete this path? Learners will stop seeing it.")) return;
    if (await run(() => deleteAdminLearnPath(pathDraft.id), "Path deleted.")) {
      setPathDraft(null);
      await loadLists();
    }
  }

  // ---- lesson actions (inside the path editor) --------------------------
  async function addLesson(event) {
    event.preventDefault();
    const title = newLesson.title.trim();
    if (!title) return;
    let created = null;
    await run(async () => {
      created = await createAdminLesson(pathDraft.id, {
        title,
        language: pathDraft.language,
        estimated_minutes: Number(newLesson.estimated_minutes) || 0,
      });
      await reloadPath(pathDraft.id);
    }, "Lesson added.");
    setNewLesson({ title: "", estimated_minutes: 5 });
    if (created?.lesson?.id) setLessonId(created.lesson.id);
  }

  function moveLesson(index, delta) {
    setDirty(true);
    setPathDraft((current) => {
      const lessons = [...(current.lessons || [])];
      const target = index + delta;
      if (target < 0 || target >= lessons.length) return current;
      [lessons[index], lessons[target]] = [lessons[target], lessons[index]];
      return { ...current, lessons };
    });
  }

  async function duplicateLessonRow(id) {
    if (await run(() => duplicateAdminLesson(id), "Lesson copied.")) await reloadPath(pathDraft.id);
  }

  async function archiveLessonRow(id) {
    if (await run(() => archiveAdminLesson(id), "Lesson moved back to draft.")) await reloadPath(pathDraft.id);
  }

  async function deleteLessonRow(id) {
    if (!window.confirm("Delete this lesson and all of its blocks?")) return;
    if (await run(() => deleteAdminLesson(id), "Lesson deleted.")) await reloadPath(pathDraft.id);
  }

  async function uploadCover(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      // Stored as a /uploads/... path: that is the only shape the API keeps,
      // and getImageUrl turns it back into a full address for the preview.
      const url = toMediaPath(await uploadAdminImage(file));
      setDirty(true);
      setPathDraft((current) => ({ ...current, cover_url: url }));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  // ---- category actions -------------------------------------------------
  function fromCategory(category) {
    return {
      ...emptyCategory(),
      ...category,
      translations: {
        en: {
          name: category.translations?.en?.name || "",
          description: category.translations?.en?.description || "",
        },
        sw: {
          name: category.translations?.sw?.name || "",
          description: category.translations?.sw?.description || "",
        },
      },
    };
  }


  async function saveCategory(event) {
    event.preventDefault();
    const payload = {
      slug: categoryDraft.slug || undefined,
      icon: categoryDraft.icon || null,
      display_order: Number(categoryDraft.display_order) || 0,
      status: categoryDraft.status,
      translations: {
        en: {
          name: categoryDraft.translations?.en?.name || "",
          description: categoryDraft.translations?.en?.description || "",
        },
        sw: {
          name: categoryDraft.translations?.sw?.name || "",
          description: categoryDraft.translations?.sw?.description || "",
        },
      },
    };
    await run(async () => {
      if (categoryDraft.id) await updateLearnCategory(categoryDraft.id, payload);
      else await createLearnCategory(payload);
      setCategoryDraft(null);
      const data = await listLearnCategories();
      setCategories(data.items || []);
      const overviewData = await getLearnAdminOverview();
      setOverview(overviewData);
    }, "Category saved.");
  }

  async function removeCategory(id) {
    if (!window.confirm("Delete this category? Paths keep working but lose their grouping.")) return;
    await run(async () => {
      await deleteLearnCategory(id);
      const data = await listLearnCategories();
      setCategories(data.items || []);
    }, "Category deleted.");
  }

  const totals = overview?.totals;
  const analytics = overview?.analytics;
  const attention = overview?.attention || [];

  // ---- rendering --------------------------------------------------------
  if (lessonId) {
    return (
      <LessonBuilder
        lessonId={lessonId}
        catalog={catalog}
        onNotice={onNotice}
        onBack={() => {
          setLessonId(null);
          if (pathDraft?.id) reloadPath(pathDraft.id).catch((err) => setError(messageOf(err)));
        }}
      />
    );
  }

  return (
    <div className="learn-admin">
      <div className="learn-tabs">
        {TABS.map(({ id, label, icon: TabIcon }) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <TabIcon size={15} /> {label}
          </button>
        ))}
        <button className="icon-button learn-refresh" type="button" title="Reload" onClick={loadLists}>
          <RefreshCw size={15} />
        </button>
      </div>

      {error && <div className="cms-alert">{error}</div>}

      {totals && (
        <section className="cms-overview learn-stats">
          <article>
            <span>Learning paths</span>
            <strong>{totals.published_paths}<small>/{totals.paths}</small></strong>
            <small>{totals.draft_paths} not published</small>
          </article>
          <article>
            <span>Lessons</span>
            <strong>{totals.published_lessons}<small>/{totals.lessons}</small></strong>
            <small>{totals.draft_lessons} drafts · {totals.blocks} blocks</small>
          </article>
          <article>
            <span>Swahili lessons</span>
            <strong>{overview?.languages?.sw?.lessons || 0}</strong>
            <small>{overview?.languages?.en?.lessons || 0} in English</small>
          </article>
        </section>
      )}

      {tab === "paths" && !pathDraft && (
        <>
          <div className="cms-list-toolbar learn-toolbar">
            <label className="cms-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paths and titles..." />
            </label>
            <select className="learn-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {STATUSES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <button className="button" type="button" onClick={() => setNewPath({ title: "", slug: "", description: "", language: "en" })}>
              <Plus size={16} /> New path
            </button>
          </div>

          {newPath && (
            <form className="learn-new-form" onSubmit={createPath}>
              <label>Title<input autoFocus value={newPath.title} onChange={(event) => setNewPath({ ...newPath, title: event.target.value })} placeholder="Praying with the Psalms" required /></label>
              <label>Language<select value={newPath.language} onChange={(event) => setNewPath({ ...newPath, language: event.target.value })}>{Object.entries(LANGUAGE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              <label className="wide">URL slug (optional)<input value={newPath.slug} onChange={(event) => setNewPath({ ...newPath, slug: slugify(event.target.value) })} placeholder="generated from the title if left blank" /></label>
              <label className="wide">Short description<textarea rows={2} value={newPath.description} onChange={(event) => setNewPath({ ...newPath, description: event.target.value })} /></label>
              <footer>
                <button className="button secondary" type="button" onClick={() => setNewPath(null)}><X size={15} /> Cancel</button>
                <button className="button" type="submit" disabled={busy}><CheckCircle2 size={15} /> Create draft</button>
              </footer>
            </form>
          )}

          <section className="cms-list">
            <div className="cms-list-header"><span>Path</span><span>Content</span><span>Actions</span></div>
            {paths.map((row) => (
              <article className="cms-row" key={row.id}>
                <div className="cms-row-title">
                  <StatusPill status={row.status} />
                  <strong>{row.title || row.slug || `Path ${row.id}`}</strong>
                  <small>
                    /{row.slug} · {(LEVELS.find((level) => level.id === row.level) || LEVELS[0]).label}
                    {row.featured ? " · featured" : ""}
                    {row.translations?.sw?.title ? "" : " · no Swahili title yet"}
                  </small>
                </div>
                <div className="cms-row-meta">
                  <span className="cms-pill">{row.published_lesson_count}/{row.lesson_count} lessons live</span>
                  <span>{row.estimated_minutes ? `${row.estimated_minutes} min` : "time summed from lessons"} · updated {timeAgo(row.updated_at)}</span>
                </div>
                <div className="cms-row-actions">
                  {row.status === "published" && (
                    <a className="icon-button" title="View on site" target="_blank" rel="noreferrer" href={`/learn/paths/${row.slug}`}><Eye size={16} /></a>
                  )}
                  <button className="icon-button" title="Edit path" onClick={() => openPath(row.id)}><Pencil size={16} /></button>
                </div>
              </article>
            ))}
            {!paths.length && (
              <div className="cms-empty"><Layers size={24} /><p>{query ? "No path matches that search." : "No learning paths yet — create the first one."}</p></div>
            )}
          </section>
        </>
      )}

      {tab === "paths" && pathDraft && (
        <section className="learn-editor">
          <header className="learn-editor-head">
            <button
              className="icon-button"
              type="button"
              title="Back to the path list"
              onClick={() => {
                if (!dirty || window.confirm("Leave this path and lose the unsaved changes?")) setPathDraft(null);
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <div className="learn-editor-title">
              <p className="eyebrow">Learning path</p>
              <h2>{pathDraft.translations?.en?.title || pathDraft.translations?.sw?.title || pathDraft.slug || "Untitled path"}</h2>
              <p className="learn-editor-meta">
                <StatusPill status={pathDraft.status} />
                <span>/{pathDraft.slug}</span>
                {dirty && <span className="learn-dirty">Unsaved changes</span>}
              </p>
            </div>
            <div className="learn-editor-actions">
              {pathDraft.status === "published" && (
                <a className="icon-button" title="View on site" target="_blank" rel="noreferrer" href={`/learn/paths/${pathDraft.slug}`}><Eye size={16} /></a>
              )}
              <button className="button secondary" type="button" disabled={busy} onClick={() => savePath()}><Save size={15} /> Save</button>
              {pathDraft.status === "published" ? (
                <button className="button secondary" type="button" disabled={busy} onClick={archivePath}>Unpublish</button>
              ) : (
                <button className="button" type="button" disabled={busy} onClick={() => savePath("published")}><CheckCircle2 size={15} /> Publish</button>
              )}
              <button className="icon-button" type="button" title="Duplicate as a draft" disabled={busy} onClick={duplicatePath}><Copy size={16} /></button>
              <button className="icon-button danger" type="button" title="Delete path" disabled={busy} onClick={deletePath}><Trash2 size={16} /></button>
            </div>
          </header>

          <ValidationReport validation={validation} />

          <div className="learn-grid">
            <div className="learn-panel">
              <h3>Details</h3>
              <div className="cms-fields">
                <label>URL slug<input value={pathDraft.slug || ""} onChange={(event) => changePath("slug", slugify(event.target.value))} /></label>
                <label>Level
                  <select value={pathDraft.level || "beginner"} onChange={(event) => changePath("level", event.target.value)}>
                    {LEVELS.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
                  </select>
                </label>
                <label>Preferred language
                  <select value={pathDraft.language || "en"} onChange={(event) => changePath("language", event.target.value)}>
                    {Object.entries(LANGUAGE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label>Category
                  <select value={pathDraft.category_id ?? ""} onChange={(event) => changePath("category_id", event.target.value ? Number(event.target.value) : null)}>
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.translations?.en?.name || category.translations?.sw?.name || category.slug}
                      </option>
                    ))}
                  </select>
                </label>
                <label>Total minutes
                  <input type="number" min="0" max="1200" value={pathDraft.estimated_minutes ?? 0} onChange={(event) => changePath("estimated_minutes", event.target.value)} />
                  <small className="field-hint">Leave 0 to sum the lessons.</small>
                </label>
                <label>Display order
                  <input type="number" min="0" max="999" value={pathDraft.display_order ?? 0} onChange={(event) => changePath("display_order", event.target.value)} />
                </label>
              </div>
              <label className="cms-checkbox">
                <input type="checkbox" checked={Boolean(pathDraft.featured)} onChange={(event) => changePath("featured", event.target.checked)} />
                Feature this path on the Learn page
              </label>
              <div className="cms-media-row">
                <label className="cms-upload">
                  <Upload size={18} />
                  <span>{pathDraft.cover_url ? "Replace cover image" : "Upload cover image"}</span>
                  <input type="file" accept="image/*" onChange={uploadCover} />
                </label>
                {pathDraft.cover_url && <img src={getImageUrl(pathDraft.cover_url) || pathDraft.cover_url} alt="Path cover preview" />}
                {pathDraft.cover_url && (
                  <button className="icon-button danger" type="button" title="Remove cover" onClick={() => changePath("cover_url", "")}><X size={15} /></button>
                )}
              </div>
            </div>

            <div className="learn-panel">
              <h3>Both language versions</h3>
              <p className="learn-panel-hint">
                A path can go live with only one language written; the other stays hidden from learners until you fill it in.
              </p>
              <div className="learn-lang-grid">
                {Object.entries(LANGUAGE_LABELS).map(([language, label]) => (
                  <div className="learn-lang" key={language}>
                    <span className="learn-lang-label">{label}</span>
                    <label>Title
                      <input
                        value={pathDraft.translations?.[language]?.title || ""}
                        onChange={(event) => changeTranslation(language, "title", event.target.value)}
                      />
                    </label>
                    <label>Description
                      <textarea
                        rows={5}
                        value={pathDraft.translations?.[language]?.description || ""}
                        onChange={(event) => changeTranslation(language, "description", event.target.value)}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="learn-panel learn-lessons-panel">
            <h3><ListChecks size={16} /> Lessons in this path <span>{(pathDraft.lessons || []).length}</span></h3>
            {dirty && <p className="learn-dirty">Order changes are kept once you save the path.</p>}
            <ol className="learn-lesson-list">
              {(pathDraft.lessons || []).map((lesson, index) => (
                <li key={lesson.id}>
                  <b>{index + 1}</b>
                  <div className="learn-lesson-info">
                    <strong>{lesson.translations?.[pathDraft.language]?.title || lesson.translations?.en?.title || "Untitled lesson"}</strong>
                    <small>/{lesson.slug} · {lesson.block_count ?? 0} blocks · {lesson.estimated_minutes || 0} min</small>
                  </div>
                  <StatusPill status={lesson.status} />
                  <div className="cms-row-actions">
                    <button className="icon-button" type="button" title="Move up" disabled={index === 0} onClick={() => moveLesson(index, -1)}><ArrowUp size={15} /></button>
                    <button className="icon-button" type="button" title="Move down" disabled={index === (pathDraft.lessons || []).length - 1} onClick={() => moveLesson(index, 1)}><ArrowDown size={15} /></button>
                    <button className="icon-button" type="button" title="Edit lesson content" onClick={() => setLessonId(lesson.id)}><Pencil size={15} /></button>
                    {lesson.status === "published" && (
                      <button className="icon-button" type="button" title="Move this lesson back to draft" onClick={() => archiveLessonRow(lesson.id)}><Undo2 size={15} /></button>
                    )}
                    <button className="icon-button" type="button" title="Copy lesson into this path" onClick={() => duplicateLessonRow(lesson.id)}><Copy size={15} /></button>
                    <button className="icon-button" type="button" title="Delete lesson" onClick={() => deleteLessonRow(lesson.id)}><Trash2 size={15} /></button>
                  </div>
                </li>
              ))}
              {!(pathDraft.lessons || []).length && <li className="learn-list-empty">No lessons yet — add the first one below.</li>}
            </ol>
            <form className="learn-add-lesson" onSubmit={addLesson}>
              <input
                value={newLesson.title}
                onChange={(event) => setNewLesson({ ...newLesson, title: event.target.value })}
                placeholder="New lesson title"
                aria-label="New lesson title"
              />
              <input
                type="number"
                min="0"
                max="600"
                value={newLesson.estimated_minutes}
                onChange={(event) => setNewLesson({ ...newLesson, estimated_minutes: event.target.value })}
                aria-label="Estimated minutes"
                title="Estimated minutes"
              />
              <button className="button secondary" type="submit" disabled={busy}><Plus size={15} /> Add lesson</button>
            </form>
          </div>
        </section>
      )}

      {tab === "categories" && (
        <section className="learn-editor">
          <header className="learn-editor-head">
            <div className="learn-editor-title">
              <p className="eyebrow">Learn library</p>
              <h2>Categories</h2>
              <p className="learn-editor-meta">
                <span>{totals ? `${totals.categories_published}/${totals.categories} published` : `${categories.length} categories`} · categories group paths on the Learn page</span>
              </p>
            </div>
            <div className="learn-editor-actions">
              {!categoryDraft && (
                <button className="button" type="button" onClick={() => setCategoryDraft(emptyCategory())}>
                  <Plus size={15} /> New category
                </button>
              )}
            </div>
          </header>

          {categoryDraft && (
            <form className="learn-new-form" onSubmit={saveCategory}>
              <h3>{categoryDraft.id ? `Editing ${categoryDraft.slug}` : "New category"}</h3>
              <div className="cms-fields">
                <label>URL slug<input value={categoryDraft.slug || ""} onChange={(event) => setCategoryDraft({ ...categoryDraft, slug: slugify(event.target.value) })} placeholder="prayer" /></label>
                <label>Icon name<input value={categoryDraft.icon || ""} onChange={(event) => setCategoryDraft({ ...categoryDraft, icon: event.target.value })} placeholder="sprout" /></label>
                <label>Display order<input type="number" min="0" max="999" value={categoryDraft.display_order ?? 0} onChange={(event) => setCategoryDraft({ ...categoryDraft, display_order: event.target.value })} /></label>
                <label>Status
                  <select value={categoryDraft.status || "draft"} onChange={(event) => setCategoryDraft({ ...categoryDraft, status: event.target.value })}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </label>
              </div>
              <div className="learn-lang-grid">
                {Object.entries(LANGUAGE_LABELS).map(([language, label]) => (
                  <div className="learn-lang" key={language}>
                    <span className="learn-lang-label">{label}</span>
                    <label>Name
                      <input
                        value={categoryDraft.translations?.[language]?.name || ""}
                        onChange={(event) => setCategoryDraft({
                          ...categoryDraft,
                          translations: {
                            ...categoryDraft.translations,
                            [language]: { ...categoryDraft.translations?.[language], name: event.target.value },
                          },
                        })}
                      />
                    </label>
                    <label>Description
                      <textarea
                        rows={3}
                        value={categoryDraft.translations?.[language]?.description || ""}
                        onChange={(event) => setCategoryDraft({
                          ...categoryDraft,
                          translations: {
                            ...categoryDraft.translations,
                            [language]: { ...categoryDraft.translations?.[language], description: event.target.value },
                          },
                        })}
                      />
                    </label>
                  </div>
                ))}
              </div>
              <footer>
                <button className="button secondary" type="button" onClick={() => setCategoryDraft(null)}><X size={15} /> Cancel</button>
                <button className="button" type="submit" disabled={busy}><CheckCircle2 size={15} /> Save category</button>
              </footer>
            </form>
          )}

          <section className="cms-list">
            <div className="cms-list-header"><span>Category</span><span>Usage</span><span>Actions</span></div>
            {categories.map((category) => (
              <article className="cms-row" key={category.id}>
                <div className="cms-row-title">
                  <StatusPill status={category.status} />
                  <strong>{category.translations?.en?.name || category.translations?.sw?.name || category.slug}</strong>
                  <small>/{category.slug}{category.icon ? ` · ${category.icon}` : ""} · order {category.display_order}</small>
                </div>
                <div className="cms-row-meta">
                  <span className="cms-pill">{category.path_count ?? 0} paths</span>
                  <span>{category.translations?.sw?.name ? "Both languages written" : "Swahili name still missing"}</span>
                </div>
                <div className="cms-row-actions">
                  <button className="icon-button" type="button" title="Edit category" onClick={() => setCategoryDraft(fromCategory(category))}><Pencil size={16} /></button>
                  <button className="icon-button danger" type="button" title="Delete category" onClick={() => removeCategory(category.id)}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
            {!categories.length && (
              <div className="cms-empty"><Tags size={24} /><p>No categories yet — add one to group your paths.</p></div>
            )}
          </section>
        </section>
      )}

      {tab === "insights" && (
        <div className="learn-grid learn-insights">
          <div className="learn-panel">
            <h3><Gauge size={16} /> How learners use it</h3>
            {analytics ? (
              <>
                <div className="learn-metric-grid">
                  <div><b>{analytics.path_views}</b><span>path opens</span></div>
                  <div><b>{analytics.lesson_views}</b><span>lesson opens</span></div>
                  <div><b>{analytics.lesson_completions}</b><span>lessons finished</span></div>
                  <div><b>{analytics.path_completions}</b><span>paths finished</span></div>
                  <div><b>{analytics.practice_done}</b><span>practice attempts</span></div>
                </div>
                <div className="learn-usage-languages">
                  {(analytics.language_usage || []).length ? (
                    analytics.language_usage.map((row) => (
                      <span className="cms-pill" key={row.language}>
                        {LANGUAGE_LABELS[row.language] || row.language}: {row.events} events
                      </span>
                    ))
                  ) : (
                    <p className="learn-panel-hint">No learner traffic recorded yet.</p>
                  )}
                </div>
              </>
            ) : <p className="learn-panel-hint">Loading…</p>}
            {overview?.progress && (
              <div className="learn-metric-grid">
                <div><b>{overview.progress.completed_lessons}</b><span>lessons marked complete</span></div>
                <div><b>{overview.progress.path_records}</b><span>path records</span></div>
                <div><b>{overview.progress.learners}</b><span>lesson records</span></div>
              </div>
            )}
          </div>

          <div className="learn-panel">
            <h3>Most viewed lessons</h3>
            {(analytics?.top_lessons || []).length ? (
              <ol className="learn-top-list">
                {analytics.top_lessons.map((row) => (
                  <li key={row.lesson_id}>
                    <div>
                      <strong>{row.title}</strong>
                      <small>{row.path_title}</small>
                    </div>
                    <span className="cms-pill">{row.views} views · {row.completions} done</span>
                  </li>
                ))}
              </ol>
            ) : <p className="learn-panel-hint">Nothing tracked yet — numbers appear once lessons get viewed.</p>}
          </div>

          <div className="learn-panel">
            <h3><AlertTriangle size={16} /> Needs attention</h3>
            {attention.length ? (
              <ul className="learn-attention-list">
                {attention.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <StatusPill status={item.status} />
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.kind === "path" ? "Learning path" : "Lesson"} · {item.message}</small>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      title="Open in the editor"
                      onClick={() => {
                        setTab("paths");
                        if (item.kind === "path") openPath(item.id);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="learn-ready"><CheckCircle2 size={15} /> Nothing is waiting in draft.</p>
            )}
          </div>

          <div className="learn-panel">
            <h3>Recently updated</h3>
            <ul className="learn-recent-list">
              {(overview?.recent?.paths || []).map((row) => (
                <li key={`path-${row.id}`}>
                  <StatusPill status={row.status} />
                  <strong>{row.title || row.slug}</strong>
                  <small>path · updated {timeAgo(row.updated_at)}</small>
                </li>
              ))}
              {(overview?.recent?.lessons || []).map((row) => (
                <li key={`lesson-${row.id}`}>
                  <StatusPill status={row.status} />
                  <strong>{row.title || row.slug}</strong>
                  <small>lesson · {row.block_count ?? 0} blocks · updated {timeAgo(row.updated_at)}</small>
                </li>
              ))}
              {!overview?.recent?.paths?.length && !overview?.recent?.lessons?.length && (
                <li className="learn-list-empty">Nothing to show yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
