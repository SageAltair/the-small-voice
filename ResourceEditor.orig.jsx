import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Link2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

/**
 * The resource editor.
 *
 * One form for all nine types. The common fields are always shown; the fields
 * below them are chosen by the type, so a video editor asks for a duration and
 * an upload while a quote editor asks for words and an attribution.
 *
 * The whole document is one object saved in one request: metadata, both
 * translations, slides, chapters and related links. That makes a save atomic,
 * so an editor never has to wonder which of the things they clicked landed.
 *
 * A brand-new resource has no id yet, so saving it is a create rather than an
 * update. The editor hands the new id back to its parent, which swaps it from
 * "new" mode to editing that resource - otherwise the next Save would try to
 * update a null id and fail.
 */

import { useLanguage } from "../../i18n/LanguageContext";
import { fill } from "../../i18n/resourceCopy";
import {
  createAdminResource,
  getAdminResource,
  saveAdminResource,
  searchLinkable,
} from "../../services/api";
import { RESOURCE_TYPES, resourceMeta } from "../resourceTypes";
import ResourceFileField from "./ResourceFileField";
import ResourcePreview from "./ResourcePreview";

const LANGUAGES = ["en", "sw"];
const LINK_KINDS = ["story", "learning", "resource"];

/** The fields a brand-new resource starts with. */
function emptyDraft(type = "video") {
  return {
    title: "",
    type,
    description: "",
    excerpt: "",
    language: "en",
    author: "",
    topic: "",
    tags: [],
    slug: "",
    status: "draft",
    visibility: "public",
    featured: false,
    recommended: false,
    is_new: false,
    homepage_visible: true,
    download_enabled: false,
    share_enabled: true,
    save_enabled: true,
    display_order: 0,
    url: "",
    external_url: "",
    cover_url: "",
    alt_text: "",
    caption: "",
    quote_text: "",
    attribution: "",
    transcript: "",
    accessibility_desc: "",
    duration: null,
    page_count: null,
    translations: [],
    slides: [],
    chapters: [],
    relationships: [],
  };
}

/** A blank slide / chapter, shaped like what the API expects back. */
const emptySlide = (sortOrder) => ({
  sort_order: sortOrder,
  image_url: "",
  text_en: "",
  text_sw: "",
  caption_en: "",
  caption_sw: "",
  alt_text: "",
});

const emptyChapter = (sortOrder) => ({
  sort_order: sortOrder,
  title_en: "",
  title_sw: "",
  file_url_en: "",
  body_en: "",
  body_sw: "",
  page_count: null,
});

/** Move an entry within an ordered list, renumbering as it goes. */
function moved(list, index, offset) {
  const target = index + offset;
  if (target < 0 || target >= list.length) return list;

  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, position) => ({ ...item, sort_order: position }));
}

/**
 * Turn the admin GET payload into the draft the form edits.
 *
 * The public serializer resolves slides, chapters and links into their
 * *displayed* shape - one language, `text` instead of `text_en`/`text_sw`, and
 * links as `{kind, id, title}`. Feeding that straight back into the form would
 * overwrite the Swahili text with the English on the next save, so the
 * editable document is rebuilt from the raw rows the admin endpoint returns
 * alongside the display fields.
 */
function toDraft(data) {
  return {
    ...emptyDraft(data.type),
    ...data,

    // The raw rows carry both languages; the resolved ones do not.
    slides: data.raw_slides ?? data.slides ?? [],
    chapters: data.raw_chapters ?? data.chapters ?? [],

    // Links come back keyed for display and are stored keyed for writing.
    relationships: (data.related || []).map((item) => ({
      related_type: item.kind,
      related_id: item.id,
      relationship_type: "related",
      sort_order: 0,
      related_title: item.title,
    })),
  };
}

/** A labelled input bound to one field of one ordered entry. */
function EntryField({ label, value, multiline = false, onChange }) {
  const Tag = multiline ? "textarea" : "input";

  return (
    <label className="res-field">
      <span className="res-field-label">{label}</span>
      <Tag
        className="res-input"
        rows={multiline ? 2 : undefined}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** Reorder and remove controls, shared by slides and chapters. */
function EntryActions({ up, down, remove, first, last, labels }) {
  return (
    <div className="res-reorder">
      <button
        type="button"
        className="res-icon-btn"
        onClick={up}
        disabled={first}
        aria-label={labels.up}
      >
        <ArrowUp size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="res-icon-btn"
        onClick={down}
        disabled={last}
        aria-label={labels.down}
      >
        <ArrowDown size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="res-icon-btn"
        onClick={remove}
        aria-label={labels.remove}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ResourceEditor({ resourceId, onSaved, onCancel }) {
  const { t, language } = useLanguage();
  const copy = t.resources.admin;

  /*
   * The loaded resource is stored against the id it was loaded for, so "is it
   * loaded?" is a comparison rather than a flag that has to be set and unset in
   * step with the request. That removes the whole class of bug where a slow
   * response for the previous resource leaves the form showing stale fields.
   */
  const [loaded, setLoaded] = useState({ id: null, draft: null });
  const [facts, setFacts] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState([]);
  const [previewing, setPreviewing] = useState(false);

  const loading = Boolean(resourceId) && loaded.id !== resourceId;
  const draft = loaded.draft ?? emptyDraft();

  const type = draft.type || "document";
  const Icon = resourceMeta(type).icon;

  useEffect(() => {
    if (!resourceId) return undefined;

    let cancelled = false;

    getAdminResource(resourceId)
      .then((data) => {
        if (cancelled) return;
        setLoaded({ id: resourceId, draft: toDraft(data) });
        setValidation(data.validation || []);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        // The id is recorded either way, so a failed load does not leave the
        // form spinning forever - the error is what the administrator reads.
        setLoaded({ id: resourceId, draft: emptyDraft() });
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  const change = (field, value) =>
    setLoaded((current) => ({
      ...current,
      draft: { ...(current.draft ?? emptyDraft()), [field]: value },
    }));

  /* Translations are edited as rows rather than as duplicated English fields,
     because that is what they are: the same content in two languages, with
     either side free to fall back to the other. */
  function setTranslation(code, field, value) {
    setLoaded((current) => {
      const base = current.draft ?? emptyDraft();
      const exists = base.translations.some((item) => item.language === code);

      const translations = exists
        ? base.translations.map((item) =>
            item.language === code ? { ...item, [field]: value } : item,
          )
        : [...base.translations, { language: code, [field]: value }];

      return { ...current, draft: { ...base, translations } };
    });
  }

  const translationValue = (code, field) =>
    draft.translations.find((item) => item.language === code)?.[field] || "";

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      // A resource with no id yet is a create, not an update. This is the only
      // place that distinction is made.
      const saved = resourceId
        ? await saveAdminResource(resourceId, draft)
        : await createAdminResource(draft);

      setValidation(saved.validation || []);
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="res-admin-hint">â€¦</p>;
  }

  return (
    <form className="res-editor" onSubmit={save}>
      <header className="res-editor-head">
        <h2>
          <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
          {resourceId ? copy.editorEdit : copy.editorNew}
        </h2>
        <button type="button" className="res-btn res-btn--ghost" onClick={onCancel}>
          <X size={15} aria-hidden="true" />
          {copy.close}
        </button>
      </header>

      {/* --- type ------------------------------------------------------- */}
      <section className="res-editor-section">
        <h3>{copy.sectionType}</h3>
        <div className="res-type-picker">
          {RESOURCE_TYPES.map((item) => {
            const TypeIcon = resourceMeta(item).icon;
            return (
              <button
                key={item}
                type="button"
                className={`res-type-option${type === item ? " active" : ""}`}
                onClick={() => change("type", item)}
                aria-pressed={type === item}
              >
                <TypeIcon size={15} strokeWidth={1.6} aria-hidden="true" />
                {t.resources.singularTypes?.[item] || item}
              </button>
            );
          })}
        </div>
      </section>{/* --- common metadata -------------------------------------------- */}
      <section className="res-editor-section">
        <h3>
          <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
          {copy.sectionDetails}
        </h3>

        <div className="res-editor-fields">
          <label className="res-field res-field--wide">
            <span className="res-field-label">{copy.fieldTitle}</span>
            <input
              className="res-input"
              value={draft.title}
              onChange={(event) => change("title", event.target.value)}
              required
            />
          </label>

          <label className="res-field res-field--wide">
            <span className="res-field-label">{copy.fieldDescription}</span>
            <textarea
              className="res-input"
              rows={3}
              value={draft.description || ""}
              onChange={(event) => change("description", event.target.value)}
            />
          </label>

          <label className="res-field res-field--wide">
            <span className="res-field-label">
              {copy.fieldExcerpt} <small>{copy.fieldExcerptHint}</small>
            </span>
            <input
              className="res-input"
              value={draft.excerpt || ""}
              onChange={(event) => change("excerpt", event.target.value)}
            />
          </label>

          <label className="res-field">
            <span className="res-field-label">{copy.fieldAuthor}</span>
            <input
              className="res-input"
              value={draft.author || ""}
              onChange={(event) => change("author", event.target.value)}
            />
          </label>

          <label className="res-field">
            <span className="res-field-label">{copy.fieldTopic}</span>
            <input
              className="res-input"
              value={draft.topic || ""}
              onChange={(event) => change("topic", event.target.value)}
            />
          </label>

          <label className="res-field res-field--wide">
            <span className="res-field-label">
              {copy.fieldTags} <small>{copy.fieldTagsHint}</small>
            </span>
            <input
              className="res-input"
              value={(draft.tags || []).join(", ")}
              onChange={(event) =>
                change(
                  "tags",
                  event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>

          <label className="res-field">
            <span className="res-field-label">
              {copy.fieldSlug} <small>{copy.fieldSlugHint}</small>
            </span>
            <input
              className="res-input"
              value={draft.slug || ""}
              onChange={(event) => change("slug", event.target.value)}
            />
          </label>

          <label className="res-field">
            <span className="res-field-label">{copy.fieldLanguage}</span>
            <select
              className="res-input"
              value={draft.language}
              onChange={(event) => change("language", event.target.value)}
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {copy.languageName[code]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* --- translations ----------------------------------------------- */}
      <section className="res-editor-section">
        <h3>{copy.sectionTranslations}</h3>
        <p className="res-admin-hint">{copy.translationHint}</p>

        {LANGUAGES.filter((code) => code !== draft.language).map((code) => (
          <div className="res-editor-fields" key={code}>
            <label className="res-field res-field--wide">
              <span className="res-field-label">
                {copy.fieldTitle} ({copy.languageName[code]})
              </span>
              <input
                className="res-input"
                value={translationValue(code, "title")}
                onChange={(event) =>
                  setTranslation(code, "title", event.target.value)
                }
              />
            </label>

            <label className="res-field res-field--wide">
              <span className="res-field-label">{copy.fieldDescription}</span>
              <textarea
                className="res-input"
                rows={2}
                value={translationValue(code, "description")}
                onChange={(event) =>
                  setTranslation(code, "description", event.target.value)
                }
              />
            </label>
          </div>
        ))}
      </section>{/* --- type-specific files ----------------------------------------- */}
      <section className="res-editor-section">
        <h3>
          {fill(copy.sectionFiles, {
            type: t.resources.singularTypes?.[type] || type,
          })}
        </h3>

        {(type === "reel" || type === "video" || type === "audio") && (
          <>
            <ResourceFileField
              label={copy.mediaFile}
              value={draft.url}
              facts={facts}
              onChange={(url) => change("url", url)}
              onFacts={(result) => {
                setFacts(result);
                if (result?.duration) change("duration", result.duration);
              }}
              accept={type === "audio" ? "audio/*" : "video/*"}
            />

            <label className="res-field">
              <span className="res-field-label">
                {copy.fieldDuration} <small>{copy.fieldDurationHint}</small>
              </span>
              <input
                className="res-input"
                type="number"
                min="0"
                value={draft.duration ?? ""}
                onChange={(event) =>
                  change("duration", Number(event.target.value) || null)
                }
              />
            </label>

            {type !== "audio" && (
              <label className="res-field res-field--wide">
                <span className="res-field-label">
                  {copy.fieldExternalUrl} <small>{copy.fieldExternalUrlHint}</small>
                </span>
                <input
                  className="res-input"
                  value={draft.external_url || ""}
                  onChange={(event) => change("external_url", event.target.value)}
                />
              </label>
            )}

            <label className="res-field res-field--wide">
              <span className="res-field-label">{copy.fieldTranscript}</span>
              <textarea
                className="res-input"
                rows={4}
                value={draft.transcript || ""}
                onChange={(event) => change("transcript", event.target.value)}
              />
            </label>
          </>
        )}

        {(type === "image" || type === "infographic") && (
          <>
            <ResourceFileField
              label={type === "infographic" ? copy.infographicFile : copy.imageFile}
              accept={type === "infographic" ? "image/*,.pdf" : "image/*"}
              value={draft.url}
              facts={facts}
              onChange={(url) => change("url", url)}
              onFacts={(result) => {
                setFacts(result);
                if (result?.page_count) change("page_count", result.page_count);
                if (result?.cover_url) change("cover_url", result.cover_url);
              }}
            />

            <label className="res-field res-field--wide">
              <span className="res-field-label">
                {copy.fieldAltText} <small>{copy.fieldAltTextHint}</small>
              </span>
              <input
                className="res-input"
                value={draft.alt_text || ""}
                onChange={(event) => change("alt_text", event.target.value)}
              />
            </label>

            <label className="res-field res-field--wide">
              <span className="res-field-label">{copy.fieldCaption}</span>
              <input
                className="res-input"
                value={draft.caption || ""}
                onChange={(event) => change("caption", event.target.value)}
              />
            </label>
          </>
        )}
{type === "quote" && (
          <>
            <label className="res-field res-field--wide">
              <span className="res-field-label">{copy.fieldQuoteText}</span>
              <textarea
                className="res-input"
                rows={4}
                value={draft.quote_text || ""}
                onChange={(event) => change("quote_text", event.target.value)}
              />
            </label>

            <label className="res-field">
              <span className="res-field-label">{copy.fieldAttribution}</span>
              <input
                className="res-input"
                value={draft.attribution || ""}
                onChange={(event) => change("attribution", event.target.value)}
              />
            </label>
          </>
        )}

        {(type === "book" || type === "document") && (
          <ResourceFileField
            label={type === "book" ? copy.bookFile : copy.documentFile}
            accept={type === "book" ? ".pdf,.epub,.docx,.txt" : undefined}
            value={draft.url}
            facts={facts}
            onChange={(url) => change("url", url)}
            onFacts={(result) => {
              setFacts(result);
              if (result?.page_count) change("page_count", result.page_count);
              if (result?.cover_url) change("cover_url", result.cover_url);
            }}
          />
        )}

        {(type === "book" || type === "document") && (
          <label className="res-field">
            <span className="res-field-label">
              {copy.fieldPages} <small>{copy.fieldPagesHint}</small>
            </span>
            <input
              className="res-input"
              type="number"
              min="0"
              value={draft.page_count ?? ""}
              onChange={(event) =>
                change("page_count", Number(event.target.value) || null)
              }
            />
          </label>
        )}

        {/* Every type can carry a cover for its card, whether or not it has a
            file of its own. */}
        <ResourceFileField
          label={
            type === "quote"
              ? copy.backgroundImage
              : type === "audio" || type === "book"
                ? copy.coverImage
                : copy.thumbnail
          }
          accept="image/*"
          value={draft.cover_url}
          onChange={(url) => change("cover_url", url)}
          hint={type === "quote" ? copy.backgroundImageHint : undefined}
        />
      </section>

      {type === "carousel" && (
        <SlideEditor
          copy={copy}
          slides={draft.slides}
          onChange={(slides) => change("slides", slides)}
        />
      )}

      {type === "book" && (
        <ChapterEditor
          copy={copy}
          chapters={draft.chapters}
          onChange={(chapters) => change("chapters", chapters)}
        />
      )}

      <RelationshipEditor
        copy={copy}
        language={language}
        excludeId={resourceId}
        links={draft.relationships}
        onChange={(relationships) => change("relationships", relationships)}
      />{/* --- publishing and curation -------------------------------------- */}
      <section className="res-editor-section">
        <h3>{copy.sectionPublishing}</h3>

        <div className="res-editor-fields">
          <label className="res-field">
            <span className="res-field-label">{copy.fieldVisibility}</span>
            <select
              className="res-input"
              value={draft.visibility || "public"}
              onChange={(event) => change("visibility", event.target.value)}
            >
              <option value="public">{copy.visibilityPublic}</option>
              <option value="unlisted">{copy.visibilityUnlisted}</option>
              <option value="private">{copy.visibilityPrivate}</option>
            </select>
          </label>

          <label className="res-field">
            <span className="res-field-label">
              {copy.fieldDownload} <small>{copy.downloadOffHint}</small>
            </span>
            <select
              className="res-input"
              value={draft.download_enabled ? "yes" : "no"}
              onChange={(event) =>
                change("download_enabled", event.target.value === "yes")
              }
            >
              <option value="no">{copy.no}</option>
              <option value="yes">{copy.yes}</option>
            </select>
          </label>

          <label className="res-field">
            <span className="res-field-label">{copy.fieldDisplayOrder}</span>
            <input
              className="res-input"
              type="number"
              value={draft.display_order ?? 0}
              onChange={(event) =>
                change("display_order", Number(event.target.value) || 0)
              }
            />
          </label>
        </div>

        <label className="res-check">
          <input
            type="checkbox"
            checked={draft.share_enabled !== false}
            onChange={(event) => change("share_enabled", event.target.checked)}
          />
          {copy.checkShare}
        </label>

        <label className="res-check">
          <input
            type="checkbox"
            checked={draft.save_enabled !== false}
            onChange={(event) => change("save_enabled", event.target.checked)}
          />
          {copy.checkSave}
        </label>

        <label className="res-check">
          <input
            type="checkbox"
            checked={draft.homepage_visible !== false}
            onChange={(event) =>
              change("homepage_visible", event.target.checked)
            }
          />
          {copy.checkHomepage}
        </label>
      </section>

      <section className="res-editor-section">
        <h3>{copy.sectionCuration}</h3>
        <p className="res-admin-hint">{copy.curationHint}</p>

        <label className="res-check">
          <input
            type="checkbox"
            checked={Boolean(draft.featured)}
            onChange={(event) => change("featured", event.target.checked)}
          />
          {copy.checkFeatured}
        </label>

        <label className="res-check">
          <input
            type="checkbox"
            checked={Boolean(draft.recommended)}
            onChange={(event) => change("recommended", event.target.checked)}
          />
          {copy.checkRecommended}
        </label>

        <label className="res-check">
          <input
            type="checkbox"
            checked={Boolean(draft.is_new)}
            onChange={(event) => change("is_new", event.target.checked)}
          />
          {copy.checkNew}
        </label>
      </section>{/* --- footer ------------------------------------------------------ */}
      <footer className="res-editor-footer">
        {validation.length > 0 && (
          <div className="res-validation" role="status">
            <strong>{copy.beforePublishing}</strong>
            <ul>
              {validation.map((item) => (
                <li key={item.field}>{item.message}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p className="res-error" role="alert">
            {error}
          </p>
        )}

        <div className="res-editor-actions">
          {resourceId && (
            <button
              type="button"
              className="res-btn res-btn--ghost"
              onClick={() => setPreviewing((value) => !value)}
              aria-expanded={previewing}
            >
              {copy.preview}
            </button>
          )}

          <button type="button" className="res-btn" onClick={onCancel}>
            {copy.cancel}
          </button>

          <button
            type="submit"
            className="res-btn res-btn--primary"
            disabled={saving}
          >
            <Save size={15} aria-hidden="true" />
            {saving ? copy.saving : copy.save}
          </button>
        </div>
      </footer>

      {previewing && (
        <ResourcePreview
          copy={copy}
          resource={{ ...draft, id: resourceId }}
          onClose={() => setPreviewing(false)}
        />
      )}
    </form>
  );
}

/**
 * The ordered slides of a carousel.
 *
 * Each slide carries an image plus bilingual text and a caption, and the order
 * is explicit - a carousel whose slides reshuffle when someone re-saves is one
 * nobody trusts.
 */
function SlideEditor({ copy, slides, onChange }) {
  const patch = (index, change) =>
    onChange(slides.map((item, i) => (i === index ? { ...item, ...change } : item)));

  return (
    <section className="res-editor-section">
      <h3>{copy.sectionSlides}</h3>

      {!slides.length && <p className="res-admin-hint">{copy.slideEmpty}</p>}

      {slides.map((slide, index) => (
        <article className="res-subcard" key={`slide-${index}`}>
          <header className="res-subcard-head">
            <strong>{fill(copy.slideNumber, { number: index + 1 })}</strong>
            <EntryActions
              first={index === 0}
              last={index === slides.length - 1}
              labels={{
                up: copy.slideMoveUp,
                down: copy.slideMoveDown,
                remove: copy.slideRemove,
              }}
              up={() => onChange(moved(slides, index, -1))}
              down={() => onChange(moved(slides, index, 1))}
              remove={() => onChange(slides.filter((_, i) => i !== index))}
            />
          </header>

          <ResourceFileField
            label={copy.slideImage}
            accept="image/*"
            value={slide.image_url}
            onChange={(url) => patch(index, { image_url: url })}
          />

          <div className="res-editor-fields">
            <EntryField
              multiline
              label={`${copy.slideText} (EN)`}
              value={slide.text_en}
              onChange={(value) => patch(index, { text_en: value })}
            />
            <EntryField
              multiline
              label={`${copy.slideText} (SW)`}
              value={slide.text_sw}
              onChange={(value) => patch(index, { text_sw: value })}
            />
            <EntryField
              label={`${copy.slideCaption} (EN)`}
              value={slide.caption_en}
              onChange={(value) => patch(index, { caption_en: value })}
            />
            <EntryField
              label={`${copy.slideCaption} (SW)`}
              value={slide.caption_sw}
              onChange={(value) => patch(index, { caption_sw: value })}
            />
            <EntryField
              label={`${copy.slideAlt} â€” ${copy.slideAltHint}`}
              value={slide.alt_text}
              onChange={(value) => patch(index, { alt_text: value })}
            />
          </div>
        </article>
      ))}

      <button
        type="button"
        className="res-btn"
        onClick={() => onChange([...slides, emptySlide(slides.length)])}
      >
        <Plus size={15} aria-hidden="true" />
        {copy.slideAdd}
      </button>
    </section>
  );
}

/**
 * The ordered chapters of a book.
 *
 * A chapter may carry reading text, a file, or both. The reader prefers text
 * because it is accessible; a chapter with only a file falls back to the
 * document pane, which is why the file field stays available.
 */
function ChapterEditor({ copy, chapters, onChange }) {
  const patch = (index, change) =>
    onChange(
      chapters.map((item, i) => (i === index ? { ...item, ...change } : item)),
    );

  return (
    <section className="res-editor-section">
      <h3>{copy.sectionChapters}</h3>

      {!chapters.length && <p className="res-admin-hint">{copy.chapterEmpty}</p>}

      {chapters.map((chapter, index) => (
        <article className="res-subcard" key={`chapter-${index}`}>
          <header className="res-subcard-head">
            <strong>{fill(copy.chapterNumber, { number: index + 1 })}</strong>
            <EntryActions
              first={index === 0}
              last={index === chapters.length - 1}
              labels={{
                up: copy.chapterMoveUp,
                down: copy.chapterMoveDown,
                remove: copy.chapterRemove,
              }}
              up={() => onChange(moved(chapters, index, -1))}
              down={() => onChange(moved(chapters, index, 1))}
              remove={() => onChange(chapters.filter((_, i) => i !== index))}
            />
          </header>

          <ResourceFileField
            label={copy.chapterFile}
            accept=".pdf,.epub,.docx,.txt"
            value={chapter.file_url_en}
            onChange={(url) => patch(index, { file_url_en: url })}
          />

          <div className="res-editor-fields">
            <EntryField
              label={`${copy.chapterTitle} (EN)`}
              value={chapter.title_en}
              onChange={(value) => patch(index, { title_en: value })}
            />
            <EntryField
              label={`${copy.chapterTitle} (SW)`}
              value={chapter.title_sw}
              onChange={(value) => patch(index, { title_sw: value })}
            />
            <EntryField
              multiline
              label={`${copy.chapterBody} (EN)`}
              value={chapter.body_en}
              onChange={(value) => patch(index, { body_en: value })}
            />
            <EntryField
              multiline
              label={`${copy.chapterBody} (SW)`}
              value={chapter.body_sw}
              onChange={(value) => patch(index, { body_sw: value })}
            />
            <label className="res-field">
              <span className="res-field-label">{copy.chapterPages}</span>
              <input
                className="res-input"
                type="number"
                min="0"
                value={chapter.page_count ?? ""}
                onChange={(event) =>
                  patch(index, { page_count: Number(event.target.value) || null })
                }
              />
            </label>
          </div>
        </article>
      ))}

      <button
        type="button"
        className="res-btn"
        onClick={() => onChange([...chapters, emptyChapter(chapters.length)])}
      >
        <Plus size={15} aria-hidden="true" />
        {copy.chapterAdd}
      </button>
    </section>
  );
}

/**
 * Related content drawn from the rest of the platform.
 *
 * Stories, learning lessons and other resources are searched with one control
 * rather than three, because the question an editor is really asking is "what
 * should this sit next to?" - not "which table is it in?".
 */
function RelationshipEditor({ copy, language, excludeId, links, onChange }) {
  const [kind, setKind] = useState("story");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState({ key: "", items: null });

  const term = query.trim();

  /* Results are stored against the search they belong to, so results from the
     previous term are never shown next to the new one while the new search is
     still in flight. `null` therefore means "we are looking", not "we found
     nothing" - which is the distinction the empty state depends on. */
  const searchKey = `${kind}|${term}|${language}|${excludeId ?? ""}`;
  const results = found.key === searchKey ? found.items : null;
  const searching = term.length >= 2 && results === null;

  /* Searching only once the term is long enough to be worth a round trip; the
     endpoint would happily search for one letter and return the whole library. */
  useEffect(() => {
    if (term.length < 2) return undefined;

    let cancelled = false;

    const timer = window.setTimeout(() => {
      searchLinkable(kind, term, { lang: language, excludeId })
        .then((data) => {
          if (!cancelled) setFound({ key: searchKey, items: data.items || [] });
        })
        .catch(() => {
          if (!cancelled) setFound({ key: searchKey, items: [] });
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchKey, kind, term, language, excludeId]);

  const isLinked = (item) =>
    links.some(
      (link) => link.related_type === item.type && link.related_id === item.id,
    );

  function link(item) {
    onChange([
      ...links,
      {
        related_type: item.type,
        related_id: item.id,
        relationship_type: "related",
        sort_order: links.length,
      },
    ]);
    setQuery("");
  }

  return (
    <section className="res-editor-section">
      <h3>
        <Link2 size={15} strokeWidth={1.6} aria-hidden="true" />
        {copy.sectionLinks}
      </h3>
      <p className="res-admin-hint">{copy.linkSearchHint}</p>

      {links.length > 0 ? (
        <ul className="res-tag-list">
          {links.map((item) => (
            <li key={`${item.related_type}-${item.related_id}`}>
              <span className="res-tag">
                <b>{copy.linkKind[item.related_type] || item.related_type}</b>
                {item.related_title || `#${item.related_id}`}
              </span>
              <button
                type="button"
                className="res-icon-btn"
                onClick={() =>
                  onChange(
                    links.filter(
                      (entry) =>
                        !(
                          entry.related_type === item.related_type &&
                          entry.related_id === item.related_id
                        ),
                    ),
                  )
                }
                aria-label={copy.linkRemove}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="res-admin-hint">{copy.linkNone}</p>
      )}

      <div className="res-editor-fields">
        <label className="res-field">
          <span className="res-field-label">{copy.linkAdd}</span>
          <select
            className="res-input"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
            }}
          >
            {LINK_KINDS.map((item) => (
              <option key={item} value={item}>
                {copy.linkKind[item]}
              </option>
            ))}
          </select>
        </label>

        <label className="res-field res-field--wide">
          <span className="res-field-label">{copy.linkSearch}</span>
          <span className="res-input-affix">
            <Search size={14} aria-hidden="true" />
            <input
              className="res-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.linkSearchPlaceholder}
            />
          </span>
        </label>
      </div>

      {results !== null && (
        <ul className="res-admin-mini" aria-live="polite">
          {results.map((item) => (
            <li key={`${item.type}-${item.id}`}>
              <div>
                <strong>{item.title}</strong>
                <small>{copy.linkKind[item.type] || item.type}</small>
              </div>
              <button
                type="button"
                className="res-icon-btn"
                onClick={() => link(item)}
                disabled={isLinked(item)}
                aria-label={`${copy.linkAdd} â€” ${item.title}`}
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </li>
          ))}

          {!results.length && !searching && (
            <li>
              <p className="res-admin-hint">{copy.linkSearchNone}</p>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
