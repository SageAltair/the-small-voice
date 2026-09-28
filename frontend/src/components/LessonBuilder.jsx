import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Copy, Eye, ImagePlus,
  ListChecks, Pencil, Plus, RefreshCw, Save, Trash2, Undo2, X,
} from "lucide-react";
import ValidationReport from "./LearnValidation";
import { getImageUrl, toMediaPath, uploadAdminImage } from "../services/api";
import {
  archiveAdminLesson, getAdminLesson, publishAdminLesson, saveAdminLesson,
} from "../services/learnApi";

// ================================
// LESSON BUILDER
// ================================
//
// One lesson, edited as the single document the API reads and writes. Blocks
// are ordered items: each has a type, a section, language-neutral config (media
// URLs, a referenced Story, the index of a correct quiz answer) and authored
// text per language. The server is still the judge - GET /admin/learn/block-types
// drives the palette so the two can never drift, and the fallback copy below
// only keeps the editor usable if that request is unavailable.
//
// Nothing publishes by itself: Save keeps the current status, Publish asks the
// server for permission and shows the error list when it says no.

const FALLBACK_CATALOG = {
  sections: [
    { id: "understand", label: "Understand" },
    { id: "see", label: "See" },
    { id: "reflect", label: "Reflect" },
    { id: "practice", label: "Practice" },
    { id: "next_step", label: "Next step" },
  ],
  block_types: [
    { id: "text", label: "Text", group: "Teach", section: "understand", fields: ["text"], config: [], needs: ["text"] },
    { id: "heading", label: "Heading", group: "Teach", section: "understand", fields: ["text"], config: [], needs: ["text"] },
    { id: "scripture", label: "Scripture", group: "Teach", section: "see", fields: ["reference", "text", "version"], config: [], needs: ["reference", "text"] },
    { id: "quote", label: "Quote", group: "Teach", section: "see", fields: ["text", "attribution"], config: [], needs: ["text"] },
    { id: "image", label: "Image", group: "Media", section: "see", fields: ["alt", "caption"], config: ["url"], needs: ["url"] },
    { id: "video", label: "Video", group: "Media", section: "see", fields: ["caption"], config: ["url"], needs: ["url"] },
    { id: "audio", label: "Audio", group: "Media", section: "see", fields: ["caption"], config: ["url"], needs: ["url"] },
    { id: "story", label: "Story or testimony", group: "Media", section: "see", fields: ["title", "note"], config: ["story_id", "url"], needs: ["story_id", "title", "note"] },
    { id: "reflection", label: "Reflection question", group: "Respond", section: "reflect", fields: ["prompt", "placeholder"], config: [], needs: ["prompt"] },
    { id: "discussion", label: "Discussion question", group: "Respond", section: "reflect", fields: ["prompt", "notes"], config: [], needs: ["prompt"] },
    { id: "quiz", label: "Quiz question", group: "Respond", section: "reflect", fields: ["question", "options", "explanation"], config: ["correct_index"], needs: ["question", "options"] },
    { id: "practice", label: "Practical activity", group: "Do", section: "practice", fields: ["title", "instructions"], config: [], needs: ["instructions", "title"] },
    { id: "prayer", label: "Prayer", group: "Do", section: "practice", fields: ["text"], config: [], needs: ["text"] },
    { id: "callout", label: "Callout", group: "Do", section: "understand", fields: ["title", "text"], config: ["tone"], needs: ["text", "title"] },
    { id: "next_step", label: "Next step", group: "Do", section: "next_step", fields: ["title", "text"], config: [], needs: ["text", "title"] },
    { id: "resource", label: "Related resource", group: "Media", section: "see", fields: ["title", "description"], config: ["resource_id", "url", "resource_type"], needs: ["resource_id", "url", "title"] },
    { id: "divider", label: "Divider", group: "Structure", section: "understand", fields: [], config: [], needs: [] },
  ],
  languages: ["en", "sw"],
};

const LANGUAGE_LABELS = { en: "English", sw: "Swahili" };
const CALLOUT_TONES = ["info", "encouragement", "warning"];
const RESOURCE_TYPES = ["reel", "video", "audio", "book", "carousel", "quote", "image", "infographic", "document"];

const FIELD_LABELS = {
  text: "Text", reference: "Reference", version: "Bible version", attribution: "Attribution",
  alt: "Alt text", caption: "Caption", title: "Title", note: "Note", prompt: "Question",
  placeholder: "Answer hint", notes: "Notes", question: "Question", options: "Answers",
  explanation: "Explanation", instructions: "Instructions", description: "Description",
};

const FIELD_HINTS = {
  alt: "Describes the picture for screen readers.",
  placeholder: "Shown inside the learner's answer box.",
  options: "One answer per line, then pick the correct one below.",
  note: "A short line of context under the title.",
  version: "For example NIV, ESV, or Neno.",
};

/** Multi-line authored fields; everything else stays a single line. */
const LONG_FIELDS = new Set([
  "text", "note", "notes", "prompt", "explanation", "instructions", "description", "caption",
]);

const CONFIG_LABELS = {
  url: "Media link", story_id: "Story id", resource_id: "Resource id",
  tone: "Tone", correct_index: "Correct answer", resource_type: "Resource type",
};

const LESSON_FIELDS = [
  { key: "title", label: "Lesson title", long: false, hint: "What the learner sees in the path list." },
  { key: "summary", label: "Summary", long: true, hint: "One or two lines under the title." },
  { key: "objective_before", label: "Before this lesson", long: true, hint: "Where the learner is starting from." },
  { key: "objective_after", label: "After this lesson", long: true, hint: "What they should understand or be able to do." },
  { key: "objective_action", label: "One action", long: false, hint: "The single thing they will do with it." },
  { key: "next_step", label: "Next step", long: true, hint: "How they carry this into the week." },
  { key: "completion_message", label: "When they finish", long: true, hint: "A short encouragement at the end." },
];

const messageOf = (err) => err?.message || "Something went wrong.";

const optionsToText = (options) => (Array.isArray(options) ? options.join("\n") : "");
const textToOptions = (text) =>
  String(text || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 8);

function emptyBlock(definition) {
  const data = {};
  for (const field of definition.fields || []) data[field] = "";
  const config = {};
  for (const key of definition.config || []) {
    if (key === "tone") config.tone = "info";
    if (key === "correct_index") config.correct_index = 0;
    if (key === "resource_type") config.resource_type = "document";
  }
  return {
    id: null,
    block_type: definition.id,
    section: definition.section,
    config,
    translations: { en: { ...data }, sw: { ...data } },
  };
}

/**
 * The admin API sends block text flat per language and quiz answers as a list.
 * The editor keeps answers as the raw text the author types - one per line - so
 * pressing Enter to start a second answer is not swallowed by a round trip
 * through the array; textToOptions() converts it back when saving.
 */
function toDraftBlock(block) {
  const translations = {};
  for (const language of Object.keys(LANGUAGE_LABELS)) {
    const data = block.translations?.[language] || {};
    translations[language] = { ...data, options: optionsToText(data.options) };
  }
  return {
    id: block.id,
    block_type: block.block_type,
    section: block.section,
    config: { ...(block.config || {}) },
    translations,
  };
}

/**
 * A local copy of the server's "does this block show anything" rule, so an
 * empty block is flagged while the author types instead of after a round trip.
 */
function saysSomethingIn(block, definition, language) {
  if (block.block_type === "divider") return true;
  const data = block.translations?.[language] || {};
  for (const key of definition?.needs || []) {
    if (key === "story_id" || key === "resource_id") {
      if (block.config?.[key]) return true;
    } else if (key === "url") {
      if (block.config?.url) return true;
    } else if (String(data[key] || "").trim()) {
      return true;
    }
  }
  return false;
}

/** True when the block has something to show in either language. */
function saysSomething(block, definition) {
  return Object.keys(LANGUAGE_LABELS).some((language) => saysSomethingIn(block, definition, language));
}


export default function LessonBuilder({ lessonId, catalog, onNotice = () => {}, onBack = () => {} }) {
  const [draft, setDraft] = useState(null);
  const [validation, setValidation] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [languageChoice, setLanguageChoice] = useState(null);
  const [openBlock, setOpenBlock] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const blockTypes = useMemo(
    () => (catalog?.block_types?.length ? catalog.block_types : FALLBACK_CATALOG.block_types),
    [catalog]
  );
  const definitions = useMemo(
    () => Object.fromEntries(blockTypes.map((definition) => [definition.id, definition])),
    [blockTypes]
  );
  const sectionLabels = useMemo(
    () => Object.fromEntries(
      (catalog?.sections?.length ? catalog.sections : FALLBACK_CATALOG.sections)
        .map((section) => [section.id, section.label])
    ),
    [catalog]
  );
  const groups = useMemo(
    () => blockTypes.reduce((all, definition) => {
      if (!all.includes(definition.group)) all.push(definition.group);
      return all;
    }, []),
    [blockTypes]
  );

  // The editor opens on the lesson's own language but either side can be
  // selected; the other language stays visible and editable at any time.
  const language = languageChoice || draft?.language || "en";

  const applyDocument = useCallback((payload) => {
    setDraft({
      slug: payload.lesson.slug || "",
      estimated_minutes: payload.lesson.estimated_minutes ?? 0,
      status: payload.lesson.status || "draft",
      language: payload.lesson.language || "en",
      translations: {
        en: { ...(payload.translations?.en || {}) },
        sw: { ...(payload.translations?.sw || {}) },
      },
      blocks: (payload.blocks || []).map(toDraftBlock),
    });
    setValidation(payload.validation || null);
    setDirty(false);
  }, []);

  useEffect(() => {
    let stale = false;
    getAdminLesson(lessonId)
      .then((payload) => {
        if (stale) return;
        applyDocument(payload);
        setError("");
      })
      .catch((err) => {
        if (stale) return;
        setError(messageOf(err));
      });
    return () => {
      stale = true;
    };
  }, [lessonId, applyDocument]);

  async function reload() {
    try {
      applyDocument(await getAdminLesson(lessonId));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  }

  /**
   * Every write goes through here, so the one failure mode that matters - a 422
   * carrying the full validation report - is handled once and shown in place.
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

  /** The exact document the API expects, including both translations. */
  function payloadFor(extra = {}) {
    const dataFor = (block, lang) => {
      const definition = definitions[block.block_type];
      const source = block.translations?.[lang] || {};
      const data = {};
      for (const field of definition?.fields || []) {
        const value = source[field];
        if (field === "options") {
          data.options = textToOptions(value);
        } else if (value) {
          data[field] = value;
        }
      }
      return data;
    };

    return {
      lesson: {
        slug: draft.slug,
        estimated_minutes: Number(draft.estimated_minutes) || 0,
        ...extra,
      },
      translations: {
        en: { ...draft.translations.en },
        sw: { ...draft.translations.sw },
      },
      blocks: (draft.blocks || []).map((block, index) => ({
        id: block.id,
        block_type: block.block_type,
        section: block.section,
        config: block.config,
        position: index,
        translations: { en: { data: dataFor(block, "en") }, sw: { data: dataFor(block, "sw") } },
      })),
    };
  }

  function save() {
    return run(async () => {
      applyDocument(await saveAdminLesson(lessonId, payloadFor()));
    }, "Lesson saved.");
  }

  function publish() {
    return run(async () => {
      // Save first: the server judges what is stored, not what is on screen.
      applyDocument(await saveAdminLesson(lessonId, payloadFor()));
      applyDocument(await publishAdminLesson(lessonId));
    }, "Lesson published - learners can see it now.");
  }

  async function unpublish() {
    if (!window.confirm("Move this lesson back to draft? Learners stop seeing it and nothing is lost.")) return;
    if (await run(() => archiveAdminLesson(lessonId), "Lesson moved back to draft.")) await reload();
  }

  // ---- draft editing ----------------------------------------------------
  const changeLesson = (field, value) => {
    setDirty(true);
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const changeTranslation = (lang, field, value) => {
    setDirty(true);
    setDraft((current) => ({
      ...current,
      translations: {
        ...current.translations,
        [lang]: { ...(current.translations?.[lang] || {}), [field]: value },
      },
    }));
  };

  function changeBlocks(updater) {
    setDirty(true);
    setDraft((current) => ({ ...current, blocks: updater(current.blocks || []) }));
  }

  function addBlock(definition) {
    const blocks = [...(draft.blocks || []), emptyBlock(definition)];
    changeBlocks(() => blocks);
    setOpenBlock(blocks.length - 1);
    setPaletteOpen(false);
  }

  function updateBlock(index, patch) {
    changeBlocks((blocks) => blocks.map((block, position) => (position === index ? { ...block, ...patch } : block)));
  }

  function updateBlockText(index, field, value) {
    const block = draft.blocks[index];
    updateBlock(index, {
      translations: {
        ...block.translations,
        [language]: { ...(block.translations?.[language] || {}), [field]: value },
      },
    });
  }

  function updateBlockConfig(index, key, value) {
    const block = draft.blocks[index];
    updateBlock(index, { config: { ...block.config, [key]: value } });
  }

  function moveBlock(index, delta) {
    const target = index + delta;
    const blocks = [...(draft.blocks || [])];
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    changeBlocks(() => blocks);
    setOpenBlock((current) => (current === index ? target : current));
  }

  function duplicateBlock(index) {
    const blocks = [...(draft.blocks || [])];
    const copy = { ...blocks[index], id: null, config: { ...blocks[index].config } };
    blocks.splice(index + 1, 0, copy);
    changeBlocks(() => blocks);
    setOpenBlock(index + 1);
  }

  function removeBlock(index) {
    const block = draft.blocks[index];
    if (block.id && !window.confirm("Remove this block from the lesson?")) return;
    changeBlocks((blocks) => blocks.filter((_, position) => position !== index));
    setOpenBlock(null);
  }

  async function uploadBlockImage(index, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      // Learn stores /uploads/... paths; the API refuses anything else.
      updateBlockConfig(index, "url", toMediaPath(await uploadAdminImage(file)));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  const missingInLanguage = (lang) =>
    (draft.blocks || []).filter((block) => !saysSomethingIn(block, definitions[block.block_type], lang));

  if (!draft) {
    return (
      <section className="learn-editor learn-builder">
        <header className="learn-editor-head">
          <button className="icon-button" type="button" title="Back to the path" onClick={onBack}>
            <ArrowLeft size={16} />
          </button>
          <div className="learn-editor-title">
            <p className="eyebrow">Lesson</p>
            <h2>{error ? "This lesson could not be opened" : "Loading the lesson…"}</h2>
          </div>
        </header>
        {error && <div className="cms-alert">{error}</div>}
      </section>
    );
  }

  return (
    <section className="learn-editor learn-builder">
      <header className="learn-editor-head">
        <button className="icon-button" type="button" title="Back to the path" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
        <div className="learn-editor-title">
          <p className="eyebrow">Lesson</p>
          <h2>{draft.translations?.[language]?.title || draft.translations?.en?.title || draft.slug || "Untitled lesson"}</h2>
          <p className="learn-editor-meta">
            <span className={`cms-status ${draft.status === "published" ? "published" : "draft"}`}>
              {draft.status === "published" ? "Published" : "Draft"}
            </span>
            <span>/{draft.slug}</span>
            <span>{(draft.blocks || []).length} block{(draft.blocks || []).length === 1 ? "" : "s"}</span>
            {dirty && <span className="learn-dirty">Unsaved changes</span>}
          </p>
        </div>
        <div className="learn-editor-actions">
          {draft.status === "published" && (
            <a className="icon-button" title="View on site" target="_blank" rel="noreferrer" href={`/learn/lesson/${lessonId}`}>
              <Eye size={16} />
            </a>
          )}
          <button className="icon-button" type="button" title="Reload from the server" disabled={busy} onClick={reload}>
            <RefreshCw size={15} />
          </button>
          <button className="button secondary" type="button" disabled={busy} onClick={save}>
            <Save size={15} /> Save
          </button>
          {draft.status === "published" ? (
            <button className="button secondary" type="button" disabled={busy} onClick={unpublish}>
              <Undo2 size={15} /> Unpublish
            </button>
          ) : (
            <button className="button" type="button" disabled={busy} onClick={publish}>
              <CheckCircle2 size={15} /> Publish
            </button>
          )}
        </div>
      </header>

      {error && <div className="cms-alert">{error}</div>}
      <ValidationReport validation={validation} />

      <div className="learn-grid">
        <div className="learn-panel">
          <h3>Lesson details</h3>
          <div className="cms-fields">
            <label>URL slug (inside its path)
              <input value={draft.slug || ""} onChange={(event) => changeLesson("slug", event.target.value)} />
            </label>
            <label>Estimated minutes
              <input
                type="number"
                min="0"
                max="600"
                value={draft.estimated_minutes ?? 0}
                onChange={(event) => changeLesson("estimated_minutes", event.target.value)}
              />
              <small className="field-hint">Short lessons work best — aim for under 25 minutes.</small>
            </label>
          </div>
        </div>

        <div className="learn-panel">
          <h3>Both language versions</h3>
          <p className="learn-panel-hint">
            A lesson can go live in one language. Whatever you leave blank stays out of the other
            language's version instead of quietly showing English instead.
          </p>
          <div className="learn-lang-grid">
            {Object.entries(LANGUAGE_LABELS).map(([lang, label]) => (
              <div className="learn-lang" key={lang}>
                <span className="learn-lang-label">{label}</span>
                {LESSON_FIELDS.map((field) => (
                  <label key={field.key}>{field.label}
                    {field.long ? (
                      <textarea
                        rows={field.key === "summary" ? 3 : 2}
                        value={draft.translations?.[lang]?.[field.key] || ""}
                        onChange={(event) => changeTranslation(lang, field.key, event.target.value)}
                      />
                    ) : (
                      <input
                        value={draft.translations?.[lang]?.[field.key] || ""}
                        onChange={(event) => changeTranslation(lang, field.key, event.target.value)}
                      />
                    )}
                    <small className="field-hint">{field.hint}</small>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="learn-panel learn-blocks-panel">
        <h3>
          <ListChecks size={16} /> Lesson blocks
          <span>{(draft.blocks || []).length}</span>
        </h3>
        <p className="learn-panel-hint">
          Learners meet these blocks in this order. Content is written per language, so the language
          you pick below is the one you are typing into.
        </p>

        <div className="learn-tabs learn-lang-tabs">
          {Object.entries(LANGUAGE_LABELS).map(([lang, label]) => {
            const missing = missingInLanguage(lang).length;
            return (
              <button key={lang} type="button" className={language === lang ? "active" : ""} onClick={() => setLanguageChoice(lang)}>
                {label}
                {missing > 0 && <b>{missing} empty</b>}
              </button>
            );
          })}
        </div>

        {!(draft.blocks || []).length && (
          <p className="learn-panel-hint">
            No content yet — add the first block below. A lesson needs at least one block before it can publish.
          </p>
        )}
        {(draft.blocks || []).length > 0
          && !(draft.blocks || []).some((block) => saysSomething(block, definitions[block.block_type])) && (
            <p className="learn-issue warning">
              <AlertTriangle size={14} /> Every block is still empty, so learners would find nothing to read.
            </p>
          )}

        <ol className="learn-block-list">
          {(draft.blocks || []).map((block, index) => {
            const definition = definitions[block.block_type];
            const open = openBlock === index;
            return (
              <li className={`learn-block ${open ? "open" : ""}`} key={block.id ?? `new-${index}`}>
                <div className="learn-block-head">
                  <b className="learn-block-index">{index + 1}</b>
                  <div className="learn-block-title">
                    <strong>{definition?.label || block.block_type}</strong>
                    <small>
                      {sectionLabels[block.section] || block.section}
                      {block.id ? "" : " · not saved yet"}
                    </small>
                  </div>
                  {!saysSomethingIn(block, definition, language) && (
                    <span className="learn-block-empty">No {LANGUAGE_LABELS[language]} text</span>
                  )}
                  <div className="cms-row-actions">
                    <button className="icon-button" type="button" title="Move up" disabled={index === 0} onClick={() => moveBlock(index, -1)}><ArrowUp size={15} /></button>
                    <button className="icon-button" type="button" title="Move down" disabled={index === (draft.blocks || []).length - 1} onClick={() => moveBlock(index, 1)}><ArrowDown size={15} /></button>
                    <button className="icon-button" type="button" title={open ? "Close this block" : "Edit this block"} onClick={() => setOpenBlock(open ? null : index)}>
                      {open ? <X size={15} /> : <Pencil size={15} />}
                    </button>
                    <button className="icon-button" type="button" title="Duplicate below" onClick={() => duplicateBlock(index)}><Copy size={15} /></button>
                    <button className="icon-button danger" type="button" title="Remove block" onClick={() => removeBlock(index)}><Trash2 size={15} /></button>
                  </div>
                </div>

                {open && (
                  <div className="learn-block-body">
                    {block.block_type !== "divider" && (
                      <label className="learn-block-section">Section on the page
                        <select value={block.section} onChange={(event) => updateBlock(index, { section: event.target.value })}>
                          {Object.entries(sectionLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                      </label>
                    )}

                    {(definition?.fields || []).length > 0 && (
                      <div className="learn-block-fields">
                        <span className="learn-lang-label">{LANGUAGE_LABELS[language]}</span>
                        {(definition.fields || []).map((field) => (
                          <label key={field} className={LONG_FIELDS.has(field) ? "wide" : ""}>
                            {FIELD_LABELS[field] || field}
                            {LONG_FIELDS.has(field) ? (
                              <textarea
                                rows={4}
                                value={block.translations?.[language]?.[field] || ""}
                                onChange={(event) => updateBlockText(index, field, event.target.value)}
                              />
                            ) : (
                              <input
                                value={block.translations?.[language]?.[field] || ""}
                                onChange={(event) => updateBlockText(index, field, event.target.value)}
                              />
                            )}
                            {FIELD_HINTS[field] && <small className="field-hint">{FIELD_HINTS[field]}</small>}
                          </label>
                        ))}
                      </div>
                    )}

                    {(definition?.config || []).length > 0 && (
                      <div className="learn-block-config">
                        <span className="learn-lang-label">Shared by both languages</span>
                        {(definition.config || []).map((key) => {
                          const value = block.config?.[key];
                          if (key === "tone") {
                            return (
                              <label key={key}>{CONFIG_LABELS[key]}
                                <select value={value || "info"} onChange={(event) => updateBlockConfig(index, key, event.target.value)}>
                                  {CALLOUT_TONES.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
                                </select>
                              </label>
                            );
                          }
                          if (key === "resource_type") {
                            return (
                              <label key={key}>{CONFIG_LABELS[key]}
                                <select value={value || "document"} onChange={(event) => updateBlockConfig(index, key, event.target.value)}>
                                  {RESOURCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                                </select>
                              </label>
                            );
                          }
                          if (key === "correct_index") {
                            const answers = textToOptions(block.translations?.[language]?.options);
                            return (
                              <label key={key}>{CONFIG_LABELS[key]}
                                {answers.length ? (
                                  <select value={Number(value) || 0} onChange={(event) => updateBlockConfig(index, key, Number(event.target.value))}>
                                    {answers.map((answer, answerIndex) => (
                                      <option key={`${answer}-${answerIndex}`} value={answerIndex}>{answerIndex + 1}. {answer}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input type="number" min="0" max="20" value={Number(value) || 0} onChange={(event) => updateBlockConfig(index, key, Number(event.target.value))} />
                                )}
                                <small className="field-hint">Pick which answer above is correct.</small>
                              </label>
                            );
                          }
                          if (key === "story_id" || key === "resource_id") {
                            return (
                              <label key={key}>{CONFIG_LABELS[key]}
                                <input
                                  type="number"
                                  min="1"
                                  value={value ?? ""}
                                  onChange={(event) => updateBlockConfig(index, key, event.target.value ? Number(event.target.value) : null)}
                                />
                                <small className="field-hint">Points at the record already on the site instead of copying it.</small>
                              </label>
                            );
                          }
                          return (
                            <label key={key} className="wide">{CONFIG_LABELS[key] || key}
                              <input
                                value={value || ""}
                                onChange={(event) => updateBlockConfig(index, key, event.target.value)}
                                placeholder={block.block_type === "video" ? "https://www.youtube.com/watch?v=..." : "https://..."}
                              />
                            </label>
                          );
                        })}

                        {block.block_type === "image" && (
                          <div className="cms-media-row">
                            <label className="cms-upload">
                              <ImagePlus size={18} />
                              <span>{block.config?.url ? "Replace image" : "Upload image"}</span>
                              <input type="file" accept="image/*" onChange={(event) => uploadBlockImage(index, event)} />
                            </label>
                            {block.config?.url && (
                              <img src={getImageUrl(block.config.url) || block.config.url} alt="Block picture preview" />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}

              </li>
            );
          })}
        </ol>

        {paletteOpen ? (
          <div className="learn-block-palette">
            <div className="learn-block-palette-head">
              <strong>Add a block</strong>
              <button className="icon-button" type="button" title="Close" onClick={() => setPaletteOpen(false)}><X size={15} /></button>
            </div>
            {groups.map((group) => (
              <div className="learn-block-group" key={group}>
                <span>{group}</span>
                <div>
                  {blockTypes.filter((definition) => definition.group === group).map((definition) => (
                    <button key={definition.id} type="button" className="learn-block-chip" onClick={() => addBlock(definition)}>
                      {definition.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <button className="button secondary learn-add-block" type="button" onClick={() => setPaletteOpen(true)}>
            <Plus size={15} /> Add a block
          </button>
        )}

      </div>
    </section>
  );
}

