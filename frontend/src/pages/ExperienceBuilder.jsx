import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Check, ChevronLeft, Copy, Eye,
  Grid3x3, Image as ImageIcon, Loader2, Lock, Maximize2, Plus,
  Redo2, RotateCw, Save, Send, Trash2, Undo2, Unlock, ZoomIn, ZoomOut,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import ExperienceRenderer from "../components/experience/ExperienceRenderer";
import MediaDialog from "../components/experience/MediaDialog";
import { createHistory } from "../experience/designHistory";
import {
  ELEMENT_GROUPS, ELEMENT_TYPES, PAGE_PRESETS, MIN_SIZE,
  alignElements, buildDocument, createElement, createPage, distributeElements,
  normalizePageSettings, pageHeight, reorderZ, snapPosition, toPayload, topZ,
} from "../experience/designModel";
import { OBJECT_FIT_OPTIONS, FONT_OPTIONS, ratioOf } from "../experience/mediaUtils";
import "../experience-builder.css";

const AUTOSAVE_DELAY = 1200;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const HISTORY_LIMIT = 80;

const RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const CONTENT_TYPES = [
  { value: "journey", label: "Journey" },
  { value: "next_step", label: "Next Step" },
  { value: "course", label: "Course" },
  { value: "learning_path", label: "Learning" },
  { value: "article", label: "Article" },
  { value: "interactive", label: "Interactive Experience" },
];

/** Design glyphs: text, not emoji, so the tool panel stays consistent. */
const ICONS = {
  Heading1: () => <span className="eb-glyph">H1</span>,
  Type: () => <span className="eb-glyph">¶</span>,
  Image: ImageIcon,
  Video: () => <span className="eb-glyph">▶</span>,
  Music: () => <span className="eb-glyph">♪</span>,
  Code: () => <span className="eb-glyph">ifr</span>,
  MousePointer2: () => <span className="eb-glyph">▸</span>,
  Link2: () => <span className="eb-glyph">↗</span>,
  TextCursorInput: () => <span className="eb-glyph">A|</span>,
  AlignLeft: () => <span className="eb-glyph">≡</span>,
  CheckSquare: () => <span className="eb-glyph">☑</span>,
  HelpCircle: () => <span className="eb-glyph">?</span>,
  Quote: () => <span className="eb-glyph">&rdquo;</span>,
  BookOpen: () => <span className="eb-glyph">▤</span>,
  Minus: () => <span className="eb-glyph">—</span>,
  Square: () => <span className="eb-glyph">▢</span>,
  BarChart3: () => <span className="eb-glyph">▬</span>,
};

const ALIGN_BUTTONS = [
  { mode: "left", label: "Align left" },
  { mode: "centerX", label: "Align centre" },
  { mode: "right", label: "Align right" },
  { mode: "top", label: "Align top" },
  { mode: "centerY", label: "Align middle" },
  { mode: "bottom", label: "Align bottom" },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


/* ------------------------------------------------------------------ */
/* Create dialog                                                       */
/* ------------------------------------------------------------------ */

function CreateModal({ busy, error, onCreate, onClose }) {
  const [type, setType] = useState("journey");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("en");

  return (
    <div className="eb-modal" role="dialog" aria-modal="true" aria-label="Create experience" onMouseDown={onClose}>
      <div className="eb-modal__card eb-modal__card--wide" onMouseDown={(event) => event.stopPropagation()}>
        <header className="eb-modal__head">
          <h2>What do you want to create?</h2>
          <button type="button" className="eb-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="eb-modal__body">
          <fieldset className="eb-types">
            <legend className="eb-label">Content type</legend>
            {CONTENT_TYPES.map((option) => (
              <label key={option.value} className={`eb-type ${type === option.value ? "is-active" : ""}`}>
                <input
                  type="radio"
                  name="content-type"
                  value={option.value}
                  checked={type === option.value}
                  onChange={() => setType(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>

          <label className="eb-label" htmlFor="create-title">Title</label>
          <input
            id="create-title"
            className="eb-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Knowing God"
            autoFocus
          />

          <label className="eb-label" htmlFor="create-language">Language</label>
          <select id="create-language" className="eb-input" value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
          </select>

          {error ? <p className="eb-alert eb-alert--error" role="alert"><AlertCircle size={14} /> {error}</p> : null}
        </div>

        <footer className="eb-modal__foot">
          <button type="button" className="eb-btn eb-btn--ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="eb-btn eb-btn--primary"
            disabled={busy || !title.trim()}
            onClick={() => onCreate({ title: title.trim(), experience_type: type, language })}
          >
            {busy ? <Loader2 size={14} className="eb-spin" /> : <Plus size={14} />}
            {busy ? "Creating…" : "Create and open builder"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Save status, tool library, page list                                */
/* ------------------------------------------------------------------ */

/** "Saved" is only ever shown after the server has confirmed the write. */
function SaveIndicator({ status, error, onRetry }) {
  if (status === "error") {
    return (
      <span className="eb-status eb-status--error" role="alert">
        <AlertCircle size={13} /> Unable to save
        <button type="button" className="eb-status__retry" onClick={onRetry}>Retry</button>
      </span>
    );
  }
  if (status === "saving" || status === "publishing") {
    return <span className="eb-status eb-status--saving"><Loader2 size={13} className="eb-spin" /> Saving…</span>;
  }
  if (status === "dirty") return <span className="eb-status eb-status--dirty">Unsaved changes</span>;
  if (status === "saved") return <span className="eb-status eb-status--saved"><Check size={13} /> Saved</span>;
  return <span className="eb-status eb-status--idle">Draft</span>;
}

function ToolLibrary({ onInsert }) {
  const grouped = ELEMENT_GROUPS
    .map((group) => ({ group, items: ELEMENT_TYPES.filter((entry) => entry.group === group) }))
    .filter((entry) => entry.items.length);

  return (
    <section className="eb-panel__section">
      <h3 className="eb-panel__title">Elements</h3>
      <p className="eb-hint">Click to place in the centre, or drag onto the page.</p>
      {grouped.map(({ group, items }) => (
        <div key={group} className="eb-toolgroup">
          <h4 className="eb-toolgroup__label">{group}</h4>
          <div className="eb-tools">
            {items.map((entry) => {
              const Glyph = ICONS[entry.icon] || ICONS.Square;
              return (
                <button
                  key={entry.type}
                  type="button"
                  className="eb-tool"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/x-eb-element", entry.type);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onInsert(entry.type)}
                  title={entry.label}
                >
                  <Glyph size={15} />
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}


function PagePanel({ doc, pageIndex, onSelect, onRename, onAdd, onRemove, onSettings }) {
  const [editing, setEditing] = useState(null);
  const current = doc.pages[pageIndex];

  return (
    <section className="eb-panel__section">
      <div className="eb-panel__head">
        <h3 className="eb-panel__title">Pages</h3>
        <button type="button" className="eb-icon-btn" onClick={onAdd} aria-label="Add page" title="Add page">
          <Plus size={15} />
        </button>
      </div>

      <ul className="eb-pages">
        {doc.pages.map((item, index) => (
          <li key={item.id || `new-${index}`}>
            <button
              type="button"
              className={`eb-page-item ${index === pageIndex ? "is-active" : ""}`}
              onClick={() => onSelect(index)}
              onDoubleClick={() => setEditing(index)}
            >
              <span className="eb-page-item__name">
                {editing === index ? (
                  <input
                    className="eb-page-item__input"
                    value={item.title}
                    autoFocus
                    onChange={(event) => onRename(index, event.target.value)}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  item.title
                )}
              </span>
              <span className="eb-page-item__meta">
                {item.elements.length} elements · {item.pageSettings.layoutMode === "endless" ? "endless" : "fixed"}
              </span>
              {doc.pages.length > 1 ? (
                <span
                  className="eb-page-item__remove"
                  role="button"
                  tabIndex={0}
                  aria-label={`Delete ${item.title}`}
                  onClick={(event) => { event.stopPropagation(); onRemove(index); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); onRemove(index); } }}
                >
                  <Trash2 size={12} />
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <PageSettings page={current} onSettings={onSettings} />
    </section>
  );
}

/** Page format, dimensions and layout mode. All values persist with the page. */
function PageSettings({ page, onSettings }) {
  if (!page) return null;
  const settings = page.pageSettings;

  const applyPreset = (id) => {
    const preset = PAGE_PRESETS.find((entry) => entry.id === id);
    if (!preset) {
      onSettings({ preset: "custom" });
      return;
    }
    onSettings({
      preset: preset.id,
      width: preset.width,
      height: preset.height,
      orientation: preset.orientation,
    });
  };

  return (
    <div className="eb-page-settings">
      <h4 className="eb-toolgroup__label">Page format</h4>

      <label className="eb-label" htmlFor="page-preset">Preset</label>
      <select id="page-preset" className="eb-input" value={settings.preset || "custom"} onChange={(event) => applyPreset(event.target.value)}>
        {PAGE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>{preset.label}</option>
        ))}
      </select>

      <div className="eb-row">
        <div>
          <label className="eb-label" htmlFor="page-width">Width</label>
          <input
            id="page-width"
            className="eb-input"
            type="number"
            min={200}
            max={12000}
            value={settings.width}
            onChange={(event) => onSettings({ width: event.target.value, preset: "custom" })}
          />
        </div>
        <div>
          <label className="eb-label" htmlFor="page-height">Height</label>
          <input
            id="page-height"
            className="eb-input"
            type="number"
            min={200}
            max={12000}
            value={settings.height}
            onChange={(event) => onSettings({ height: event.target.value, preset: "custom" })}
          />
        </div>
      </div>

      <label className="eb-label" htmlFor="page-orientation">Orientation</label>
      <select id="page-orientation" className="eb-input" value={settings.orientation} onChange={(event) => onSettings({ orientation: event.target.value, preset: "custom" })}>
        <option value="portrait">Portrait</option>
        <option value="landscape">Landscape</option>
        <option value="square">Square</option>
      </select>

      <label className="eb-label" htmlFor="page-layout">Layout mode</label>
      <select id="page-layout" className="eb-input" value={settings.layoutMode} onChange={(event) => onSettings({ layoutMode: event.target.value })}>
        <option value="fixed">Fixed page</option>
        <option value="endless">Endless / scrollable</option>
      </select>
      <p className="eb-hint">
        {settings.layoutMode === "endless"
          ? "The page grows as you add content further down."
          : "Content stays inside the declared page size."}
      </p>

      <label className="eb-label" htmlFor="page-background">Background</label>
      <div className="eb-row">
        <input
          id="page-background"
          className="eb-color"
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(settings.background) ? settings.background : "#ffffff"}
          onChange={(event) => onSettings({ background: event.target.value })}
        />
        <input
          className="eb-input"
          value={settings.background}
          onChange={(event) => onSettings({ background: event.target.value })}
          aria-label="Background colour value"
        />
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Selection chrome & preview                                          */
/* ------------------------------------------------------------------ */

function SelectionChrome({ element, selected, onDrag, onResize, onRotate, actions }) {
  if (!selected) return null;
  if (element.isLocked) {
    return (
      <div className="eb-selection is-locked">
        <span className="eb-selection__label"><Lock size={11} /> Locked</span>
      </div>
    );
  }

  return (
    <div className="eb-selection">
      <div className="eb-selection__outline" onPointerDown={onDrag} />
      <span className="eb-selection__label">{element.type}</span>
      <span className="eb-rotate" role="button" tabIndex={-1} aria-label="Rotate" onPointerDown={onRotate}>
        <RotateCw size={10} />
      </span>
      {RESIZE_HANDLES.map((handle) => (
        <span
          key={handle}
          className={`eb-handle eb-handle--${handle}`}
          role="button"
          tabIndex={-1}
          aria-label={`Resize ${handle}`}
          onPointerDown={(event) => onResize(event, handle)}
        />
      ))}
      {actions ? (
        <div
          className="eb-floatbar"
          role="toolbar"
          aria-label="Element actions"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" title="Bring to front" aria-label="Bring to front" onClick={actions.toFront}>
            <ArrowUpToLine size={13} />
          </button>
          <button type="button" title="Send to back" aria-label="Send to back" onClick={actions.toBack}>
            <ArrowDownToLine size={13} />
          </button>
          <span className="eb-floatbar__sep" />
          <button type="button" title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={actions.duplicate}>
            <Copy size={13} />
          </button>
          <button
            type="button"
            title={element.isLocked ? "Unlock" : "Lock"}
            aria-label={element.isLocked ? "Unlock" : "Lock"}
            onClick={actions.toggleLock}
          >
            {element.isLocked ? <Unlock size={13} /> : <Lock size={13} />}
          </button>
          <span className="eb-floatbar__sep" />
          <button type="button" title="Delete" aria-label="Delete" className="is-danger" onClick={actions.remove}>
            <Trash2 size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Preview uses the same renderer as the canvas and the public page. */
function PreviewStage({ doc, pageIndex, onPage }) {
  const viewportRef = useRef(null);
  const [zoom, setZoom] = useState(0.4);
  const page = doc.pages[pageIndex];

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !page) return;
    const rect = viewport.getBoundingClientRect();
    const next = Math.min((rect.width - 80) / page.pageSettings.width, (rect.height - 120) / pageHeight(page), 1);
    if (Number.isFinite(next) && next > 0) setZoom(clamp(next, MIN_ZOOM, 1));
  }, [page]);

  return (
    <div className="eb-preview">
      <div className="eb-preview__bar">
        <span className="eb-hint">Preview renders the saved design exactly as a visitor will see it.</span>
        {doc.pages.length > 1 ? (
          <div className="eb-preview__pages">
            {doc.pages.map((item, index) => (
              <button
                key={item.id || `p-${index}`}
                type="button"
                className={`eb-chip ${index === pageIndex ? "is-active" : ""}`}
                onClick={() => onPage(index)}
              >
                {index + 1}. {item.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="eb-preview__stage" ref={viewportRef}>
        <div style={{ transform: `scale(${zoom})` }}>
          <ExperienceRenderer page={page} mode="view" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form field helpers                                                  */
/* ------------------------------------------------------------------ */

function NumberField({ label, value, onChange, min, max, step = 1, suffix }) {
  return (
    <label className="eb-field">
      <span className="eb-label">{label}</span>
      <span className="eb-field__control">
        <input
          className="eb-input"
          type="number"
          value={Number.isFinite(value) ? Math.round(value * 10) / 10 : 0}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
        />
        {suffix ? <span className="eb-field__suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="eb-field">
      <span className="eb-label">{label}</span>
      <select className="eb-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : "#24251f";
  return (
    <label className="eb-field">
      <span className="eb-label">{label}</span>
      <span className="eb-field__control">
        <input className="eb-color" type="color" value={safe} onChange={(event) => onChange(event.target.value)} />
        <input className="eb-input" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} value`} />
      </span>
    </label>
  );
}


/** Content fields per element type. Every one writes straight to the element. */
function ContentFields({ element, onContent, onMedia }) {
  const content = element.content || {};
  const type = element.type;

  if (["heading", "text", "button", "link", "checkbox", "question"].includes(type)) {
    return (
      <label className="eb-field">
        <span className="eb-label">Text</span>
        <textarea
          className="eb-input eb-input--area"
          rows={type === "text" || type === "question" ? 4 : 2}
          value={content.text || ""}
          onChange={(event) => onContent({ text: event.target.value })}
          placeholder="Type your text…"
        />
      </label>
    );
  }

  if (type === "link") {
    return (
      <>
        <label className="eb-field">
          <span className="eb-label">Link (HTTPS)</span>
          <input className="eb-input" value={content.href || ""} onChange={(event) => onContent({ href: event.target.value })} placeholder="https://" />
        </label>
      </>
    );
  }

  if (type === "scripture") {
    return (
      <>
        <label className="eb-field">
          <span className="eb-label">Verse</span>
          <textarea className="eb-input eb-input--area" rows={3} value={content.text || ""} onChange={(event) => onContent({ text: event.target.value })} />
        </label>
        <label className="eb-field">
          <span className="eb-label">Reference</span>
          <input className="eb-input" value={content.reference || ""} onChange={(event) => onContent({ reference: event.target.value })} placeholder="John 3:16" />
        </label>
      </>
    );
  }

  if (type === "quote") {
    return (
      <>
        <label className="eb-field">
          <span className="eb-label">Quote</span>
          <textarea className="eb-input eb-input--area" rows={3} value={content.text || ""} onChange={(event) => onContent({ text: event.target.value })} />
        </label>
        <label className="eb-field">
          <span className="eb-label">Attribution</span>
          <input className="eb-input" value={content.author || ""} onChange={(event) => onContent({ author: event.target.value })} />
        </label>
      </>
    );
  }

  if (type === "question") {
    const options = content.options || [];
    return (
      <>
        <span className="eb-label">Choices (one per line)</span>
        <textarea
          className="eb-input eb-input--area"
          rows={4}
          value={options.join("\n")}
          onChange={(event) => onContent({ options: event.target.value.split("\n") })}
        />
      </>
    );
  }

  if (["image", "video", "audio", "embed"].includes(type)) {
    return (
      <>
        <div className="eb-media-row">
          <button type="button" className="eb-btn eb-btn--soft" onClick={() => onMedia(element)}>
            <ImageIcon size={13} /> {content.url ? "Replace" : type === "embed" ? "Configure" : "Choose file"}
          </button>
          {content.url ? (
            <button type="button" className="eb-btn eb-btn--ghost" onClick={() => onContent({ url: "", alt: "", poster: "" })}>
              Remove
            </button>
          ) : null}
        </div>
        {content.url ? <p className="eb-hint eb-hint--break">{content.url}</p> : null}
        {type === "image" ? (
          <label className="eb-field">
            <span className="eb-label">Alt text</span>
            <input className="eb-input" value={content.alt || ""} onChange={(event) => onContent({ alt: event.target.value })} />
          </label>
        ) : null}
        {type === "video" ? (
          <label className="eb-field">
            <span className="eb-label">Poster image URL</span>
            <input className="eb-input" value={content.poster || ""} onChange={(event) => onContent({ poster: event.target.value })} placeholder="https://" />
          </label>
        ) : null}
      </>
    );
  }

  if (type === "input" || type === "textarea") {
    return (
      <>
        <label className="eb-field">
          <span className="eb-label">Placeholder</span>
          <input className="eb-input" value={content.placeholder || ""} onChange={(event) => onContent({ placeholder: event.target.value })} />
        </label>
        <label className="eb-field">
          <span className="eb-label">Accessible label</span>
          <input className="eb-input" value={content.label || ""} onChange={(event) => onContent({ label: event.target.value })} />
        </label>
      </>
    );
  }

  if (type === "progress") {
    return <NumberField label="Progress (%)" value={Number(content.value) || 0} min={0} max={100} onChange={(value) => onContent({ value })} />;
  }

  return null;
}


/* ------------------------------------------------------------------ */
/* Properties panel                                                    */
/* ------------------------------------------------------------------ */

function PropertiesPanel({
  page, selected, onPatch, onContent, onStyle,
  onAlign, onDistribute, onZ, onDuplicate, onDelete, onToggle, onMedia,
}) {
  const ids = selected.map((element) => element.id);
  const element = selected[0];
  const many = selected.length > 1;

  if (!element) {
    return (
      <div className="eb-panel__section">
        <h3 className="eb-panel__title">Properties</h3>
        <p className="eb-hint">Select an element on the page to edit its content, typography, colour, size and position.</p>
        <div className="eb-page-settings">
          <h4 className="eb-toolgroup__label">Page</h4>
          <p className="eb-hint eb-hint--break">
            {page?.title} · {page?.pageSettings.width} × {page?.pageSettings.height} ·
            {page?.pageSettings.layoutMode === "endless" ? " endless" : " fixed"}
          </p>
          <p className="eb-hint">Change the format in the Pages panel on the left.</p>
        </div>
      </div>
    );
  }

  const content = element.content || {};
  const style = element.style || {};
  const isText = ["heading", "text", "quote", "scripture", "question", "button", "link"].includes(element.type);
  const isImageLike = ["image", "video", "embed"].includes(element.type);
  const isBoxed = ["shape", "divider", "progress", "button"].includes(element.type);

  return (
    <>
      <section className="eb-panel__section">
        <div className="eb-panel__head">
          <h3 className="eb-panel__title">{many ? `${selected.length} elements` : element.type}</h3>
          <span className="eb-hint">{element.id.slice(0, 10)}</span>
        </div>
        <div className="eb-toolbar">
          <button type="button" className="eb-icon-btn" onClick={() => onDuplicate(ids)} title="Duplicate (Ctrl+D)"><Copy size={14} /></button>
          <button type="button" className="eb-icon-btn" onClick={() => onZ("forward")} title="Bring forward"><ArrowUp size={14} /></button>
          <button type="button" className="eb-icon-btn" onClick={() => onZ("backward")} title="Send backward"><ArrowDown size={14} /></button>
          <button type="button" className="eb-icon-btn" onClick={() => onToggle("isLocked")} title={element.isLocked ? "Unlock" : "Lock"}>
            {element.isLocked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <button type="button" className="eb-icon-btn" onClick={() => onToggle("isVisible")} title={element.isVisible ? "Hide" : "Show"}><Eye size={14} /></button>
          <button type="button" className="eb-icon-btn eb-icon-btn--danger" onClick={() => onDelete(ids)} title="Delete"><Trash2 size={14} /></button>
        </div>
      </section>

      <section className="eb-panel__section">
        <h4 className="eb-toolgroup__label">Content</h4>
        <ContentFields element={element} onContent={(patch) => onContent(ids, patch)} onMedia={onMedia} />
        <label className="eb-field">
          <span className="eb-label">Section anchor</span>
          <input
            className="eb-input"
            value={element.sectionId || ""}
            onChange={(event) => onPatch(ids, { sectionId: event.target.value })}
            placeholder="optional id for scroll links"
          />
        </label>
      </section>

      {isText ? (
        <section className="eb-panel__section">
          <h4 className="eb-toolgroup__label">Typography</h4>
          <SelectField label="Font" value={style.fontFamily || "Poppins"} options={FONT_OPTIONS} onChange={(value) => onStyle(ids, { fontFamily: value })} />
          <NumberField label="Size" value={Number(style.fontSize) || 16} min={8} max={400} suffix="px" onChange={(value) => onStyle(ids, { fontSize: value })} />
          <NumberField label="Weight" value={Number(style.fontWeight) || 400} min={100} max={900} step={100} onChange={(value) => onStyle(ids, { fontWeight: value })} />
          <NumberField label="Line height" value={Number(style.lineHeight) || 1.4} min={0.6} max={4} step={0.1} onChange={(value) => onStyle(ids, { lineHeight: value })} />
          <NumberField label="Letter spacing" value={Number(style.letterSpacing) || 0} min={-10} max={40} suffix="px" onChange={(value) => onStyle(ids, { letterSpacing: value })} />
          <SelectField
            label="Align"
            value={style.textAlign || "left"}
            options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]}
            onChange={(value) => onStyle(ids, { textAlign: value })}
          />
          <ColorField label="Text colour" value={style.color || "#24251f"} onChange={(value) => onStyle(ids, { color: value })} />
        </section>
      ) : null}


      {isImageLike ? (
        <section className="eb-panel__section">
          <h4 className="eb-toolgroup__label">Appearance</h4>
          <SelectField
            label="Fit"
            value={style.objectFit || "cover"}
            options={OBJECT_FIT_OPTIONS.map((value) => ({ value, label: value }))}
            onChange={(value) => onStyle(ids, { objectFit: value })}
          />
          <NumberField label="Opacity" value={Number(style.opacity ?? 1)} min={0} max={1} step={0.05} onChange={(value) => onStyle(ids, { opacity: value })} />
          <NumberField label="Radius" value={Number(style.borderRadius) || 0} min={0} max={999} suffix="px" onChange={(value) => onStyle(ids, { borderRadius: value })} />
        </section>
      ) : null}

      {isBoxed ? (
        <section className="eb-panel__section">
          <h4 className="eb-toolgroup__label">Appearance</h4>
          <ColorField label="Background" value={style.background || "#24534a"} onChange={(value) => onStyle(ids, { background: value })} />
          <NumberField label="Padding" value={Number(style.padding) || 0} min={0} max={200} suffix="px" onChange={(value) => onStyle(ids, { padding: value })} />
          <NumberField label="Radius" value={Number(style.borderRadius) || 0} min={0} max={999} suffix="px" onChange={(value) => onStyle(ids, { borderRadius: value })} />
        </section>
      ) : null}

      <section className="eb-panel__section">
        <h4 className="eb-toolgroup__label">Position & size</h4>
        <div className="eb-row">
          <NumberField label="X" value={element.x} min={-4000} max={20000} suffix="px" onChange={(value) => onPatch([element.id], { x: value })} />
          <NumberField label="Y" value={element.y} min={-4000} max={20000} suffix="px" onChange={(value) => onPatch([element.id], { y: value })} />
        </div>
        <div className="eb-row">
          <NumberField label="Width" value={element.width} min={MIN_SIZE} max={20000} suffix="px" onChange={(value) => onPatch([element.id], { width: value })} />
          <NumberField label="Height" value={element.height} min={MIN_SIZE} max={20000} suffix="px" onChange={(value) => onPatch([element.id], { height: value })} />
        </div>
        <NumberField label="Rotation" value={element.rotation || 0} min={-360} max={360} suffix="°" onChange={(value) => onPatch([element.id], { rotation: value })} />
      </section>

      <section className="eb-panel__section">
        <h4 className="eb-toolgroup__label">Align</h4>
        <div className="eb-align-grid">
          {ALIGN_BUTTONS.map((entry) => (
            <button key={entry.mode} type="button" className="eb-chip" onClick={() => onAlign(entry.mode)} title={entry.label}>
              {entry.label}
            </button>
          ))}
        </div>
        <div className="eb-row">
          <button type="button" className="eb-chip" onClick={() => onDistribute("horizontal")} disabled={selected.length < 3}>Distribute H</button>
          <button type="button" className="eb-chip" onClick={() => onDistribute("vertical")} disabled={selected.length < 3}>Distribute V</button>
        </div>
      </section>

      <section className="eb-panel__section">
        <h4 className="eb-toolgroup__label">Accessibility</h4>
        <label className="eb-field">
          <span className="eb-label">Alt / accessible name</span>
          <input
            className="eb-input"
            value={element.accessibility?.label || content.alt || ""}
            onChange={(event) => onPatch(ids, { accessibility: { ...(element.accessibility || {}), label: event.target.value } })}
          />
        </label>
        <p className="eb-hint">Every interactive element is reachable with Tab and activated with Enter.</p>
      </section>
    </>
  );
}


/* ------------------------------------------------------------------ */
/* Main editor                                                         */
/* ------------------------------------------------------------------ */

export default function ExperienceBuilder() {
  const [params, setParams] = useSearchParams();
  const experienceId = params.get("id");

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [pageIndex, setPageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [tab, setTab] = useState("design");
  const [zoom, setZoom] = useState(0.4);
  const [autoZoom, setAutoZoom] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [guides, setGuides] = useState([]);
  const [status, setStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [mediaFor, setMediaFor] = useState(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const historyRef = useRef(null);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const saveTimer = useRef(null);
  const dirtyRef = useRef(false);
  const saveSeq = useRef(0);
  // Mirrors `doc` so synchronous edits (every pointer move of a drag) can be
  // chained without waiting for a re-render. React state alone is one render
  // behind, which made a drag compute against stale data and then snap back.
  const docRef = useRef(null);

  const applyDoc = useCallback((value) => {
    docRef.current = value;
    setDoc(value);
  }, []);

  const page = doc?.pages[pageIndex] || null;
  const selected = useMemo(
    () => (page ? page.elements.filter((element) => selectedIds.includes(element.id)) : []),
    [page, selectedIds],
  );

  /* ---------------- document mutation ---------------- */

  const syncHistory = useCallback(() => {
    const history = historyRef.current;
    if (history) setHistoryState({ canUndo: history.canUndo, canRedo: history.canRedo });
  }, []);

  /**
   * Apply a document change.
   *
   * `begin`/`commit` bracket an interactive gesture so a drag with 200 pointer
   * moves collapses into a single undo entry. `silent` marks a server-response
   * sync, which must not mark the document dirty or re-trigger a save.
   */
  const mutate = useCallback((updater, { transaction = null, silent = false } = {}) => {
    const history = historyRef.current;
    if (!history) return;

    // Base every edit on the LIVE document, not `history.present`. During a
    // drag the pointer fires many edits per render; `present` only catches up
    // on commit, so deriving from it made each move restart from the
    // pre-drag geometry and the element snapped back on release.
    const base = docRef.current || history.present;
    const next = typeof updater === "function" ? updater(base) : updater;

    if (transaction === "begin") {
      history.begin(base);
      applyDoc(next);
    } else if (transaction === "commit") {
      history.commit(next);
      applyDoc(history.present);
      syncHistory();
    } else if (transaction === "abort") {
      history.abort(next);
      applyDoc(history.present);
    } else {
      history.record(next);
      applyDoc(history.present);
      syncHistory();
    }

    if (silent) return;
    dirtyRef.current = true;
    setStatus("dirty");
  }, [applyDoc, syncHistory]);

  const updateCurrentPage = useCallback((updater, options) => {
    if (!page) return;
    mutate((current) => ({
      ...current,
      pages: current.pages.map((p, index) => (index === pageIndex ? updater(p) : p)),
    }), options);
  }, [mutate, page, pageIndex]);

  /* ---------------- persistence ---------------- */

  const persist = useCallback(async (document) => {
    if (!experienceId) return;
    const seq = ++saveSeq.current;
    setStatus("saving");
    setSaveError("");

    try {
      const saved = await api.saveDocument(experienceId, toPayload(document));
      // A slower, superseded request must not overwrite the newer result.
      if (seq !== saveSeq.current) return;
      dirtyRef.current = false;
      setStatus("saved");
      if (saved) {
        mutate((current) => ({
          ...current,
          status: saved.status ?? current.status,
          slug: saved.slug ?? current.slug,
          version: saved.version ?? current.version,
        }), { silent: true });
      }
    } catch (err) {
      if (seq !== saveSeq.current) return;
      setStatus("error");
      setSaveError(err.message || "Could not save your changes.");
    }
  }, [experienceId, mutate]);

  useEffect(() => {
    if (status !== "dirty") return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (historyRef.current) persist(historyRef.current.present);
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(saveTimer.current);
  }, [status, persist]);

  const manualSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (historyRef.current) persist(historyRef.current.present);
  }, [persist]);

  /* ---------------- load ---------------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setBootError("");

      if (!experienceId) {
        const initial = { ...buildDocument(null), pages: [createPage({ title: "Page 1" })] };
        historyRef.current = createHistory(initial, { limit: HISTORY_LIMIT });
        applyDoc(initial);
        setShowCreate(true);
        setLoading(false);
        syncHistory();
        return;
      }

      try {
        const data = await api.getExperience(experienceId);
        if (cancelled) return;
        const document = buildDocument(data);
        historyRef.current = createHistory(document, { limit: HISTORY_LIMIT });
        applyDoc(document);
        setPageIndex(0);
        setSelectedIds([]);
        dirtyRef.current = false;
        setStatus("saved");
        syncHistory();
      } catch (err) {
        if (!cancelled) setBootError(err.message || "Could not open this experience.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [experienceId, syncHistory]);


  /* ---------------- element operations ---------------- */

  /**
   * Grow text boxes to the height their content actually needs.
   *
   * The renderer measures the laid-out text and hands back a map of
   * id -> required height. Applying it keeps long copy fully visible on the
   * canvas, in preview and once published, and the corrected height is part of
   * the saved document.
   */
  const applyTextGrowth = useCallback((growth) => {
    updateCurrentPage((p) => ({
      ...p,
      elements: p.elements.map((element) => (
        growth.has(element.id) ? { ...element, height: growth.get(element.id) } : element
      )),
    }));
  }, [updateCurrentPage]);

  // Step used to offset consecutive elements that are added from the tool
  // panel (no drop point). Small enough to stay on screen, large enough that
  // each new element is visible instead of hiding under the last one.
  const SPAWN_STEP = 24;

  const addElement = useCallback((type, point) => {
    if (!page) return;
    const settings = page.pageSettings;
    const definition = ELEMENT_TYPES.find((entry) => entry.type === type) || ELEMENT_TYPES[0];

    // Drop coordinates come from the pointer. Nothing else on the page moves.
    let x = point?.x;
    let y = point?.y;

    if (x == null || y == null) {
      // No drop point: cascade from how many elements already sit near the
      // default spot, wrapping every few steps so the offset stays bounded.
      const baseX = Math.round((settings.width / 2 - definition.size.width / 2) / 4) * 4;
      const baseY = 80;
      const slots = page.elements.length % 6;
      x = Math.max(0, baseX + slots * SPAWN_STEP);
      y = Math.max(0, baseY + slots * SPAWN_STEP);
    }

    const element = createElement(type, {
      x: Math.max(0, Math.round(x / 4) * 4),
      y: Math.max(0, Math.round(y / 4) * 4),
      zIndex: topZ(page.elements) + 1,
    });

    updateCurrentPage((p) => ({ ...p, elements: [...p.elements, element] }));
    setSelectedIds([element.id]);
  }, [page, updateCurrentPage]);

  const patchElements = useCallback((ids, patch) => {
    if (!page || !ids.length) return;
    updateCurrentPage((p) => ({
      ...p,
      elements: p.elements.map((element) => (ids.includes(element.id) ? { ...element, ...patch } : element)),
    }));
  }, [page, updateCurrentPage]);

  const patchContent = useCallback((ids, contentPatch) => {
    if (!page || !ids.length) return;
    updateCurrentPage((p) => ({
      ...p,
      elements: p.elements.map((element) => (
        ids.includes(element.id) ? { ...element, content: { ...element.content, ...contentPatch } } : element
      )),
    }));
  }, [page, updateCurrentPage]);

  const patchStyle = useCallback((ids, stylePatch) => {
    if (!page || !ids.length) return;
    updateCurrentPage((p) => ({
      ...p,
      elements: p.elements.map((element) => (
        ids.includes(element.id) ? { ...element, style: { ...element.style, ...stylePatch } } : element
      )),
    }));
  }, [page, updateCurrentPage]);

  const removeElements = useCallback((ids) => {
    if (!page || !ids.length) return;
    updateCurrentPage((p) => ({ ...p, elements: p.elements.filter((element) => !ids.includes(element.id)) }));
    setSelectedIds([]);
  }, [page, updateCurrentPage]);

  const duplicateElements = useCallback((ids) => {
    if (!page || !ids.length) return;
    const baseZ = topZ(page.elements);
    const clones = page.elements
      .filter((element) => ids.includes(element.id))
      .map((element, index) => ({
        ...element,
        id: `${element.id}-copy-${Math.random().toString(36).slice(2, 7)}`,
        // Offset so the copy is visibly distinct from its original.
        x: element.x + 24,
        y: element.y + 24,
        zIndex: baseZ + 1 + index,
      }));

    updateCurrentPage((p) => ({ ...p, elements: [...p.elements, ...clones] }));
    setSelectedIds(clones.map((clone) => clone.id));
  }, [page, updateCurrentPage]);

  const alignSelection = useCallback((mode) => {
    if (!page || !selected.length) return;
    // A single element aligns to the page frame, a multi-selection to its own
    // bounding box. Either way the user asked for it explicitly.
    const byId = new Map(alignElements(selected, mode, page).map((element) => [element.id, element]));
    updateCurrentPage((p) => ({
      ...p,
      elements: p.elements.map((element) => byId.get(element.id) ?? element),
    }));
  }, [page, selected, updateCurrentPage]);

  const distributeSelection = useCallback((axis) => {
    if (!page || selected.length < 3) return;
    const byId = new Map(distributeElements(selected, axis).map((element) => [element.id, element]));
    updateCurrentPage((p) => ({
      ...p,
      elements: p.elements.map((element) => byId.get(element.id) ?? element),
    }));
  }, [page, selected, updateCurrentPage]);

  const changeZ = useCallback((direction) => {
    if (!page || !selectedIds.length) return;
    const byId = new Map(reorderZ(page.elements, selectedIds, direction).map((element) => [element.id, element.zIndex]));
    updateCurrentPage((p) => ({
      ...p,
      elements: p.elements.map((element) => (byId.has(element.id) ? { ...element, zIndex: byId.get(element.id) } : element)),
    }));
  }, [page, selectedIds, updateCurrentPage]);

  const toggleFlag = useCallback((flag) => {
    if (!page || !selectedIds.length) return;
    const next = !selected.every((element) => element[flag]);
    patchElements(selectedIds, { [flag]: next });
  }, [page, selected, selectedIds, patchElements]);


  /* ---------------- pointer interaction ---------------- */

  /** Convert a viewport event into page coordinates. */
  const toPagePoint = useCallback((event) => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left + viewport.scrollLeft - pan.x) / zoom,
      y: (event.clientY - rect.top + viewport.scrollTop - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const selectElement = useCallback((element, event) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      setSelectedIds((current) => (
        current.includes(element.id)
          ? current.filter((id) => id !== element.id)
          : [...current, element.id]
      ));
      return;
    }
    setSelectedIds([element.id]);
  }, []);

  const beginDrag = useCallback((event, element) => {
    if (element.isLocked || !page) return;
    event.preventDefault();
    event.stopPropagation();

    const ids = selectedIds.includes(element.id) ? selectedIds : [element.id];
    if (!selectedIds.includes(element.id)) setSelectedIds([element.id]);

    const origin = new Map(
      page.elements.filter((item) => ids.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]),
    );

    dragRef.current = { kind: "move", ids, start: toPagePoint(event), origin, moved: false };
    // Capture on the viewport (an ancestor) so every subsequent move still
    // reaches the move handler even when the cursor outruns the element.
    try { viewportRef.current?.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
    updateCurrentPage((p) => ({ ...p }), { transaction: "begin" });
  }, [page, selectedIds, toPagePoint, updateCurrentPage]);

  /**
   * Press anywhere on an element and drag it in the same gesture.
   *
   * Previously the canvas only started a drag from the selection outline,
   * which meant every move needed a separate click first to select. A modifier
   * click still toggles multi-selection instead of dragging.
   */
  const onElementPointerDown = useCallback((element, event) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey || element.isLocked) {
      selectElement(element, event);
      return;
    }
    beginDrag(event, element);
  }, [beginDrag, selectElement]);

  const beginResize = useCallback((event, element, handle) => {
    if (element.isLocked || !page) return;
    event.preventDefault();
    event.stopPropagation();

    const ids = selected.length > 1 ? selected.map((item) => item.id) : [element.id];
    const origin = new Map(
      page.elements.filter((item) => ids.includes(item.id)).map((item) => [item.id, { ...item }]),
    );

    dragRef.current = {
      kind: "resize",
      handle,
      ids,
      start: toPagePoint(event),
      origin,
      ratio: handle.length === 2 ? ratioOf(element) : null,
      moved: false,
    };

    try { viewportRef.current?.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
    updateCurrentPage((p) => ({ ...p }), { transaction: "begin" });
  }, [page, selected, toPagePoint, updateCurrentPage]);

  const beginRotate = useCallback((event, element) => {
    if (element.isLocked || !page) return;
    event.preventDefault();
    event.stopPropagation();

    const start = toPagePoint(event);
    const centre = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
    const initial = Math.atan2(start.y - centre.y, start.x - centre.x) * (180 / Math.PI);

    dragRef.current = {
      kind: "rotate",
      ids: [element.id],
      centre,
      initial,
      startRotation: element.rotation || 0,
      moved: false,
    };

    updateCurrentPage((p) => ({ ...p }), { transaction: "begin" });
  }, [page, toPagePoint, updateCurrentPage]);


  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || !page) return;

    const point = toPagePoint(event);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;

    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 1) return;
    drag.moved = true;

    if (drag.kind === "move") {
      const others = page.elements.filter((element) => !drag.ids.includes(element.id));
      const lead = drag.origin.get(drag.ids[0]);
      if (!lead) return;

      const bounds = { left: lead.x + dx, top: lead.y + dy, width: lead.width, height: lead.height };
      const snapped = snapEnabled
        ? snapPosition({ box: bounds, others, page, snapToGrid: true, snapToElements: true })
        : { box: bounds, guides: [] };

      setGuides(snapped.guides);
      // `offset` is the TOTAL translation for this frame (pointer delta plus
      // any snap correction). Adding the snap delta on top of `dx` applied the
      // movement twice, so every drag overshot by 2x.
      const offsetX = snapped.box.left - lead.x;
      const offsetY = snapped.box.top - lead.y;

      updateCurrentPage((p) => ({
        ...p,
        elements: p.elements.map((element) => {
          const origin = drag.origin.get(element.id);
          if (!origin) return element;
          return { ...element, x: Math.round(origin.x + offsetX), y: Math.round(origin.y + offsetY) };
        }),
      }), { transaction: "begin" });
      return;
    }

    if (drag.kind === "rotate") {
      const angle = Math.atan2(point.y - drag.centre.y, point.x - drag.centre.x) * (180 / Math.PI);
      let rotation = drag.startRotation + (angle - drag.initial);
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      patchElements([drag.ids[0]], { rotation: Math.round(rotation * 10) / 10 });
      return;
    }

    if (drag.kind !== "resize") return;

    const origin = drag.origin.get(drag.ids[0]);
    if (!origin) return;

    const handle = drag.handle;
    let { x, y } = origin;
    let width = origin.width;
    let height = origin.height;

    if (handle.includes("e")) width = origin.width + dx;
    if (handle.includes("s")) height = origin.height + dy;
    if (handle.includes("w")) { width = origin.width - dx; x = origin.x + dx; }
    if (handle.includes("n")) { height = origin.height - dy; y = origin.y + dy; }

    width = Math.max(MIN_SIZE, Math.round(width));
    height = Math.max(MIN_SIZE, Math.round(height));

    // Corner handles preserve the element's aspect ratio.
    if (drag.ratio) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        height = Math.max(MIN_SIZE, Math.round(width / drag.ratio));
      } else {
        width = Math.max(MIN_SIZE, Math.round(height * drag.ratio));
      }
      if (handle.includes("n")) y = origin.y + origin.height - height;
      if (handle.includes("w")) x = origin.x + origin.width - width;
    }

    const scaleX = width / origin.width;
    const scaleY = height / origin.height;
    const growX = handle.includes("e") || handle.includes("w");
    const growY = handle.includes("n") || handle.includes("s");

    updateCurrentPage((p) => ({
      ...p,
      elements: p.elements.map((element) => {
        if (element.id === origin.id) return { ...element, x: Math.round(x), y: Math.round(y), width, height };
        if (!drag.ids.includes(element.id)) return element;
        const own = drag.origin.get(element.id);
        if (!own) return element;
        // Extra members of a multi-selection scale with the primary box.
        return {
          ...element,
          x: Math.round(handle.includes("w") ? own.x : origin.x + (own.x - origin.x) * scaleX),
          y: Math.round(handle.includes("n") ? own.y : origin.y + (own.y - origin.y) * scaleY),
          width: Math.max(MIN_SIZE, Math.round(own.width * (growX ? scaleX : 1))),
          height: Math.max(MIN_SIZE, Math.round(own.height * (growY ? scaleY : 1))),
        };
      }),
    }), { transaction: "begin" });
  }, [page, toPagePoint, snapEnabled, updateCurrentPage, patchElements]);

  const endDrag = useCallback((event) => {
    const drag = dragRef.current;
    try {
      if (event?.pointerId != null) viewportRef.current?.releasePointerCapture?.(event.pointerId);
    } catch { /* already released */ }
    if (!drag) return;
    dragRef.current = null;
    setGuides([]);

    if (!drag.moved) {
      // A click that changed nothing must not create an undo entry.
      updateCurrentPage((p) => ({ ...p }), { transaction: "abort" });
      return;
    }
    updateCurrentPage((p) => ({ ...p }), { transaction: "commit" });
  }, [updateCurrentPage]);

  const onBackgroundPointerDown = useCallback((event) => {
    if (event.button === 1 || event.getModifierState?.("Space")) {
      panRef.current = { startX: event.clientX, startY: event.clientY, origin: pan };
      setAutoZoom(false);
      return;
    }
    if (event.target === event.currentTarget) setSelectedIds([]);
  }, [pan]);

  const onPointerMoveViewport = useCallback((event) => {
    const active = panRef.current;
    if (!active) {
      onPointerMove(event);
      return;
    }
    setPan({
      x: active.origin.x + (event.clientX - active.startX),
      y: active.origin.y + (event.clientY - active.startY),
    });
  }, [onPointerMove]);

  const endPan = useCallback((event) => {
    panRef.current = null;
    endDrag(event);
  }, [endDrag]);


  /* ---------------- undo / redo ---------------- */

  const doUndo = useCallback(() => {
    const history = historyRef.current;
    if (!history?.canUndo) return;
    applyDoc(history.undo());
    setSelectedIds([]);
    dirtyRef.current = true;
    setStatus("dirty");
    syncHistory();
  }, [syncHistory]);

  const doRedo = useCallback(() => {
    const history = historyRef.current;
    if (!history?.canRedo) return;
    applyDoc(history.redo());
    setSelectedIds([]);
    dirtyRef.current = true;
    setStatus("dirty");
    syncHistory();
  }, [syncHistory]);

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      const typing = target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (meta && key === "s") {
        event.preventDefault();
        manualSave();
        return;
      }

      // While typing only Escape and save apply - this is what stops Delete
      // from wiping a selected element in the middle of a word.
      if (typing) {
        if (event.key === "Escape") target.blur();
        return;
      }

      if (meta && key === "z") {
        event.preventDefault();
        if (event.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (meta && key === "y") {
        event.preventDefault();
        doRedo();
        return;
      }
      if (meta && key === "d") {
        event.preventDefault();
        duplicateElements(selectedIds);
        return;
      }
      if (meta && key === "a") {
        event.preventDefault();
        if (page) setSelectedIds(page.elements.map((element) => element.id));
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length) {
          event.preventDefault();
          removeElements(selectedIds);
        }
        return;
      }
      if (event.key === "Escape") {
        setSelectedIds([]);
        return;
      }

      const nudges = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const nudge = nudges[event.key];
      if (nudge && selectedIds.length && page) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        // One undo entry per keypress, computed from the current positions.
        const byId = new Map(selected.map((element) => [element.id, element]));
        updateCurrentPage((p) => ({
          ...p,
          elements: p.elements.map((element) => {
            const own = byId.get(element.id);
            return own ? { ...element, x: own.x + nudge[0] * step, y: own.y + nudge[1] * step } : element;
          }),
        }));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo, manualSave, duplicateElements, removeElements, updateCurrentPage, selected, selectedIds, page]);


  /* ---------------- pages, zoom, lifecycle ---------------- */

  const addPage = useCallback(() => {
    const index = pageIndex + 1;
    mutate((current) => ({
      ...current,
      pages: [
        ...current.pages.slice(0, index),
        createPage({ title: `Page ${index + 1}` }),
        ...current.pages.slice(index),
      ],
    }));
    setPageIndex(index);
    setSelectedIds([]);
  }, [pageIndex, mutate]);

  const removePage = useCallback((index) => {
    if (!doc || doc.pages.length <= 1) return;
    mutate((current) => ({ ...current, pages: current.pages.filter((_, position) => position !== index) }));
    setPageIndex((current) => Math.max(0, Math.min(current, doc.pages.length - 2)));
    setSelectedIds([]);
  }, [doc, mutate]);

  const renamePage = useCallback((index, title) => {
    mutate((current) => ({
      ...current,
      pages: current.pages.map((p, position) => (position === index ? { ...p, title } : p)),
    }));
  }, [mutate]);

  const setPageSettings = useCallback((patch) => {
    updateCurrentPage((p) => ({ ...p, pageSettings: normalizePageSettings({ ...p.pageSettings, ...patch }) }));
  }, [updateCurrentPage]);

  /** Fit the page to the viewport without changing the page's real size. */
  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !page) return;
    const rect = viewport.getBoundingClientRect();
    const next = Math.min((rect.width - 96) / page.pageSettings.width, (rect.height - 96) / pageHeight(page));
    setZoom(clamp(next, MIN_ZOOM, 1));
    setPan({ x: 0, y: 0 });
  }, [page]);

  useEffect(() => {
    if (!autoZoom) return;
    const viewport = viewportRef.current;
    if (!viewport || !page) return;
    const rect = viewport.getBoundingClientRect();
    const next = Math.min((rect.width - 96) / page.pageSettings.width, (rect.height - 96) / pageHeight(page), 1);
    if (Number.isFinite(next) && next > 0) setZoom(clamp(next, MIN_ZOOM, 1));
  }, [page, autoZoom]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirtyRef.current) return undefined;
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const handleCreate = useCallback(async (payload) => {
    setCreating(true);
    setCreateError("");
    try {
      const created = await api.createExperience(payload);
      const next = new URLSearchParams(params);
      next.set("id", String(created.id));
      setParams(next, { replace: true });
      setShowCreate(false);
    } catch (err) {
      setCreateError(err.message || "Could not create that experience.");
    } finally {
      setCreating(false);
    }
  }, [params, setParams]);

  const handlePublish = useCallback(async () => {
    if (!experienceId) return;
    if (historyRef.current) await persist(historyRef.current.present);
    setStatus("publishing");
    try {
      const published = await api.publishExperience(experienceId);
      mutate((current) => ({ ...current, status: published.status }), { silent: true });
      setStatus("saved");
    } catch (err) {
      setSaveError(err.message || "Could not publish.");
      setStatus("error");
    }
  }, [experienceId, mutate, persist]);

  const handleUnpublish = useCallback(async () => {
    if (!experienceId) return;
    try {
      const result = await api.unpublishExperience(experienceId);
      mutate((current) => ({ ...current, status: result.status }), { silent: true });
    } catch (err) {
      setSaveError(err.message || "Could not unpublish.");
    }
  }, [experienceId, mutate]);

  const handleMediaInsert = useCallback((result) => {
    const target = mediaFor;
    if (!target) return;

    if (result.assetId) {
      mutate((current) => {
        const known = current.assets.some((asset) => asset.assetId === result.assetId);
        return {
          ...current,
          assets: known ? current.assets : [...current.assets, {
            assetId: result.assetId,
            url: result.url,
            name: result.name,
          }],
        };
      }, { silent: true });
    }

    patchContent([target.id], result);
    setMediaFor(null);
  }, [mediaFor, mutate, patchContent]);


  /* ---------------- render ---------------- */

  if (loading) {
    return (
      <div className="eb-boot">
        <Loader2 size={20} className="eb-spin" /> Loading your design…
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="eb-boot eb-boot--error">
        <AlertCircle size={18} />
        <p>{bootError}</p>
        <button type="button" className="eb-btn eb-btn--primary" onClick={() => setBootError("")}>Dismiss</button>
      </div>
    );
  }

  if (!doc || !page) return null;

  const settings = page.pageSettings;
  const isPublished = doc.status === "published";

  return (
    <div className="eb-shell">
      <header className="eb-topbar">
        <div className="eb-topbar__left">
          <button type="button" className="eb-icon-btn" onClick={() => setParams(new URLSearchParams())} aria-label="Back to list">
            <ChevronLeft size={16} />
          </button>
          <input
            className="eb-title-input"
            value={doc.title}
            onChange={(event) => mutate((current) => ({ ...current, title: event.target.value }))}
            aria-label="Experience title"
          />
          <span className={`eb-badge eb-badge--${doc.status}`}>{doc.status}</span>
        </div>

        <div className="eb-topbar__center">
          <div className="eb-segmented" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "design"} className={`eb-seg ${tab === "design" ? "is-active" : ""}`} onClick={() => setTab("design")}>
              Design
            </button>
            <button type="button" role="tab" aria-selected={tab === "preview"} className={`eb-seg ${tab === "preview" ? "is-active" : ""}`} onClick={() => setTab("preview")}>
              <Eye size={13} /> Preview
            </button>
          </div>
        </div>

        <div className="eb-topbar__right">
          <div className="eb-history">
            <button type="button" className="eb-icon-btn" onClick={doUndo} disabled={!historyState.canUndo} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
              <Undo2 size={15} />
            </button>
            <button type="button" className="eb-icon-btn" onClick={doRedo} disabled={!historyState.canRedo} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)">
              <Redo2 size={15} />
            </button>
          </div>

          <div className="eb-zoom">
            <button type="button" className="eb-icon-btn" onClick={() => { setAutoZoom(false); setZoom((z) => clamp(z - 0.1, MIN_ZOOM, MAX_ZOOM)); }} aria-label="Zoom out">
              <ZoomOut size={15} />
            </button>
            <button type="button" className="eb-zoom__value" onClick={() => setZoom(1)} title="Reset to 100%">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="eb-icon-btn" onClick={() => { setAutoZoom(false); setZoom((z) => clamp(z + 0.1, MIN_ZOOM, MAX_ZOOM)); }} aria-label="Zoom in">
              <ZoomIn size={15} />
            </button>
            <button type="button" className="eb-icon-btn" onClick={fitToScreen} aria-label="Fit to screen" title="Fit to screen">
              <Maximize2 size={15} />
            </button>
          </div>

          <SaveIndicator status={status} error={saveError} onRetry={manualSave} />

          <button type="button" className="eb-btn eb-btn--ghost" onClick={manualSave} disabled={!experienceId}>
            <Save size={14} /> Save
          </button>
          {isPublished ? (
            <button type="button" className="eb-btn eb-btn--ghost" onClick={handleUnpublish}>Unpublish</button>
          ) : (
            <button type="button" className="eb-btn eb-btn--primary" onClick={handlePublish} disabled={!experienceId || status === "publishing"}>
              <Send size={14} /> Publish
            </button>
          )}
        </div>
      </header>

      <div className="eb-body">
        {tab === "preview" ? (
          <PreviewStage doc={doc} pageIndex={pageIndex} onPage={setPageIndex} />
        ) : (
          <div className="eb-workspace">
            <aside className="eb-panel eb-panel--left">
              <ToolLibrary onInsert={addElement} />
              <PagePanel
                doc={doc}
                pageIndex={pageIndex}
                onSelect={setPageIndex}
                onRename={renamePage}
                onAdd={addPage}
                onRemove={removePage}
                onSettings={setPageSettings}
              />
            </aside>

            <div
              className="eb-viewport"
              ref={viewportRef}
              onPointerDown={onBackgroundPointerDown}
              onPointerMove={onPointerMoveViewport}
              onPointerUp={endPan}
              onPointerLeave={endPan}
              onWheel={(event) => {
                if (!event.ctrlKey) return;
                event.preventDefault();
                setAutoZoom(false);
                setZoom((z) => clamp(z * (event.deltaY > 0 ? 0.94 : 1.06), MIN_ZOOM, MAX_ZOOM));
              }}
            >
              <div className="eb-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <div
                  className="eb-page-frame"
                  style={{ width: settings.width, height: pageHeight(page), background: settings.background }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const type = event.dataTransfer.getData("application/x-eb-element");
                    if (type) addElement(type, toPagePoint(event));
                  }}
                  onDragOver={(event) => {
                    if (Array.from(event.dataTransfer.types).includes("application/x-eb-element")) event.preventDefault();
                  }}
                >
                  <ExperienceRenderer
                    page={page}
                    mode="edit"
                    selectedIds={selectedIds}
                    onSelect={onElementPointerDown}
                    onRequestMedia={(element) => setMediaFor(element)}
                    onTextResize={applyTextGrowth}
                    renderChrome={(element) => (
                      <SelectionChrome
                        element={element}
                        selected={selectedIds.includes(element.id)}
                        onDrag={(event) => beginDrag(event, element)}
                        onResize={(event, handle) => beginResize(event, element, handle)}
                        onRotate={(event) => beginRotate(event, element)}
                        actions={{
                          toFront: () => changeZ("front"),
                          toBack: () => changeZ("back"),
                          duplicate: () => duplicateElements([element.id]),
                          toggleLock: () => patchElements([element.id], { isLocked: !element.isLocked }),
                          remove: () => removeElements([element.id]),
                        }}
                      />
                    )}
                  />
                  {showGrid ? (
                    <span className="eb-grid-overlay" aria-hidden="true" style={{ backgroundSize: `${8 * zoom}px ${8 * zoom}px` }} />
                  ) : null}
                  {guides.map((guide, index) => (
                    <span
                      key={`${guide.axis}-${guide.value}-${index}`}
                      className={`eb-guide eb-guide--${guide.axis}`}
                      style={guide.axis === "x" ? { left: guide.value } : { top: guide.value }}
                    />
                  ))}
                </div>
              </div>

              <div className="eb-viewport__tools">
                <button type="button" className={`eb-chip ${showGrid ? "is-active" : ""}`} onClick={() => setShowGrid((value) => !value)}>
                  <Grid3x3 size={13} /> Grid
                </button>
                <button type="button" className={`eb-chip ${snapEnabled ? "is-active" : ""}`} onClick={() => setSnapEnabled((value) => !value)}>
                  Snap
                </button>
                <span className="eb-chip eb-chip--muted">
                  {settings.width} × {pageHeight(page)}{settings.layoutMode === "endless" ? " · endless" : ""}
                </span>
              </div>
            </div>

            <aside className="eb-panel eb-panel--right">
              <PropertiesPanel
                page={page}
                selected={selected}
                onPatch={patchElements}
                onContent={patchContent}
                onStyle={patchStyle}
                onAlign={alignSelection}
                onDistribute={distributeSelection}
                onZ={changeZ}
                onDuplicate={duplicateElements}
                onDelete={removeElements}
                onToggle={toggleFlag}
                onMedia={(element) => setMediaFor(element)}
              />
            </aside>
          </div>
        )}
      </div>

      {mediaFor ? (
        <MediaDialog
          mode={mediaFor.type}
          assets={doc.assets}
          onInsert={handleMediaInsert}
          onClose={() => setMediaFor(null)}
        />
      ) : null}

      {showCreate ? (
        <CreateModal
          busy={creating}
          error={createError}
          onCreate={handleCreate}
          onClose={() => (experienceId ? setShowCreate(false) : setCreateError("Choose a type to begin."))}
        />
      ) : null}
    </div>
  );
}
