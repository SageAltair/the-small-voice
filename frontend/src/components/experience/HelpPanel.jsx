import { useState } from "react";
import { Search, X } from "lucide-react";
import { ELEMENT_TYPES, LAYOUT_MODES, PAGE_PRESETS } from "../../experience/designModel";

/**
 * In-builder user manual.
 *
 * The content is generated from the live element catalogue and page presets, so
 * a newly added element is documented automatically instead of drifting out of
 * sync with the actual builder.
 */

const SHORTCUTS = [
  ["Ctrl / ⌘ + Z", "Undo the last change"],
  ["Ctrl / ⌘ + Shift + Z", "Redo what you just undid"],
  ["Ctrl / ⌘ + Y", "Redo (alternative)"],
  ["Ctrl / ⌘ + S", "Save the design now"],
  ["Ctrl / ⌘ + D", "Duplicate the selected element"],
  ["Ctrl / ⌘ + A", "Select every element on the page"],
  ["Delete / Backspace", "Delete the selection"],
  ["Arrow keys", "Nudge the selection by 1px (Shift = 10px)"],
  ["Escape", "Deselect everything"],
  ["Ctrl + scroll", "Zoom the canvas"],
  ["Space + drag", "Pan the canvas"],
  ["Double-click text", "Edit the text directly on the canvas"],
];

const FEATURES = [
  {
    title: "Adding elements",
    body: "Click any element in the left panel to drop it in the centre of the page, or drag it onto a specific spot. The element appears at exactly that point and nothing else moves.",
  },
  {
    title: "Moving and resizing",
    body: "Press and drag an element to move it. With it selected, drag any of the eight handles to resize. Hold Shift while resizing an image to keep its proportions. Arrow keys nudge by 1px.",
  },
  {
    title: "Layers",
    body: "Use Bring forward / Send backward in the selection toolbar, or Send to back / Bring to front, to control what overlaps what.",
  },
  {
    title: "Custom vs Automatic layout",
    body: "Custom keeps exactly where you place things. Automatic re-flows elements with consistent spacing as you add them — you can still drag and edit afterwards, and switching back never deletes content.",
  },
  {
    title: "Pages and sizes",
    body: "Add pages from the Pages panel and pick a preset (Story, Mobile, Desktop, A4, Social post…) or set a custom width and height. Choose Fixed or Endless: endless grows to fit long lessons.",
  },
  {
    title: "Preview and devices",
    body: "Preview renders the saved design exactly as a visitor sees it. Switch between Phone, Tablet and Desktop to check the design reflows and nothing is clipped before you publish.",
  },
  {
    title: "Saving",
    body: "Changes save automatically a moment after you stop editing. The indicator in the top bar shows Saving…, Saved, or Unsaved changes. Ctrl+S saves immediately. Nothing is lost if you refresh.",
  },
  {
    title: "Publishing and export",
    body: "Publish to make the design live on the public site. Export saves a PNG, JPG or PDF copy of the current page for sharing or printing.",
  },
  {
    title: "Grids, guides and snapping",
    body: "Grid and Snap are optional aids and can be switched off. They never change your design — they only help you place things. Guides appear as you drag near an edge or centre.",
  },
  {
    title: "Alignment",
    body: "Select one or more elements and use Align or Distribute. Alignment only happens when you ask for it, never automatically.",
  },
];

const TROUBLESHOOTING = [
  ["An element is cut off", "Text boxes grow to fit their words. If something still looks tight, drag the bottom-right handle down a little, or check the font size in the properties panel."],
  ["I can't see an element", "It may be behind another one. Use Send to back, or press Escape and re-select it from the Pages panel."],
  ["My changes disappeared", "Look at the top-bar indicator. If it says Unsaved changes press Ctrl+S. If it shows an error, click Retry — the editor will not claim to be saved until the server confirms."],
  ["A video or embed shows nothing", "Check the URL in the properties panel. Embeds must be HTTPS and from a supported provider. Use Replace to re-enter it."],
  ["An image won't upload", "Supported formats are PNG, JPG, WEBP, GIF and SVG up to 12 MB. You can also paste a direct HTTPS link instead."],
];

function Match({ text, term }) {
  if (!term) return text;
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}

export default function HelpPanel({ onClose }) {
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState("elements");

  const needle = term.trim();
  const hit = (haystack) => !needle || haystack.toLowerCase().includes(needle.toLowerCase());

  const elements = ELEMENT_TYPES.filter((item) => hit(`${item.label} ${item.type} ${item.group}`));
  const features = FEATURES.filter((item) => hit(`${item.title} ${item.body}`));
  const shortcuts = SHORTCUTS.filter(([keys, what]) => hit(`${keys} ${what}`));
  const fixes = TROUBLESHOOTING.filter(([question, answer]) => hit(`${question} ${answer}`));

  const TABS = [
    ["elements", `Elements (${elements.length})`],
    ["features", `Features (${features.length})`],
    ["shortcuts", `Shortcuts (${shortcuts.length})`],
    ["fixes", `Troubleshooting (${fixes.length})`],
    ["reference", "Reference"],
  ];

  return (
    <div className="eb-modal" role="dialog" aria-modal="true" aria-label="Builder help" onMouseDown={onClose}>
      <div className="eb-modal__card eb-modal__card--wide" onMouseDown={(event) => event.stopPropagation()}>
        <header className="eb-modal__head">
          <h2>Builder help</h2>
          <button type="button" className="eb-icon-btn" onClick={onClose} aria-label="Close help">
            <X size={16} />
          </button>
        </header>

        <div className="eb-help__search">
          <Search size={15} />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search an element or feature — try “video” or “undo”…"
            aria-label="Search help"
          />
        </div>

        <div className="eb-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`eb-tab ${tab === id ? "is-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="eb-modal__body eb-help__body">
          {tab === "elements" && (elements.length ? (
            <dl className="eb-help__list">
              {elements.map((item) => (
                <div key={item.type} className="eb-help__entry">
                  <dt><Match text={item.label} term={needle} /> <small>{item.group}</small></dt>
                  <dd>
                    <p>{describe(item)}</p>
                    <p><strong>Add it:</strong> drag from the left panel, or click to drop it in the centre.</p>
                    <p><strong>Settings:</strong> {settingsFor(item)}</p>
                    <p><strong>Edit it:</strong> select it and use the right-hand panel. Double-click text to type straight on the canvas.</p>
                  </dd>
                </div>
              ))}
            </dl>
          ) : <p className="eb-hint">No element matches “{needle}”.</p>)}

          {tab === "features" && (features.length ? (
            <dl className="eb-help__list">
              {features.map((item) => (
                <div key={item.title} className="eb-help__entry">
                  <dt><Match text={item.title} term={needle} /></dt>
                  <dd><p>{item.body}</p></dd>
                </div>
              ))}
            </dl>
          ) : <p className="eb-hint">No feature matches “{needle}”.</p>)}

          {tab === "shortcuts" && (shortcuts.length ? (
            <table className="eb-help__table">
              <tbody>
                {shortcuts.map(([keys, what]) => (
                  <tr key={keys}>
                    <th><kbd>{keys}</kbd></th>
                    <td><Match text={what} term={needle} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="eb-hint">No shortcut matches “{needle}”.</p>)}

          {tab === "fixes" && (fixes.length ? (
            <dl className="eb-help__list">
              {fixes.map(([question, answer]) => (
                <div key={question} className="eb-help__entry">
                  <dt><Match text={question} term={needle} /></dt>
                  <dd><p>{answer}</p></dd>
                </div>
              ))}
            </dl>
          ) : <p className="eb-hint">Nothing matches “{needle}”.</p>)}

          {tab === "reference" && (
            <div className="eb-help__list">
              <div className="eb-help__entry">
                <dt>Page formats</dt>
                <dd><p>{PAGE_PRESETS.map((preset) => `${preset.label} (${preset.width}×${preset.height})`).join(" · ")}</p></dd>
              </div>
              <div className="eb-help__entry">
                <dt>Layout modes</dt>
                <dd>{LAYOUT_MODES.map((mode) => <p key={mode.id}><strong>{mode.label}:</strong> {mode.hint}</p>)}</dd>
              </div>
              <div className="eb-help__entry">
                <dt>How saving works</dt>
                <dd>
                  <p>Every change is written to the server. “Saved” only appears once the server has confirmed, so the indicator always means the design is genuinely stored. Refreshing or reopening restores the exact design, and publishing copies it to the public site.</p>
                </dd>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function describe(item) {
  switch (item.type) {
    case "heading": return "A large title. Use it once per section to create a clear hierarchy.";
    case "text": return "A paragraph of body copy. The box grows automatically as you type.";
    case "image": return "Shows a picture. Upload a file, paste an HTTPS link, or pick one from the library. Always add alt text for screen readers.";
    case "video": return "Plays a video file or link, with an optional poster image.";
    case "audio": return "Plays an audio file, useful for a short reading or passage to listen to.";
    case "embed": return "Embeds a YouTube or Vimeo video, a Google Form, or another HTTPS page in a sandboxed frame.";
    case "button": return "A call to action. It can navigate to the next page, go to a URL, or scroll to a section.";
    case "link": return "Text that opens somewhere else. Add the address in the properties panel and choose whether it opens in a new tab.";
    case "input": return "A single-line answer box for a question or form.";
    case "textarea": return "A multi-line box for a longer written reflection.";
    case "checkbox": return "A tick box a learner can select, for example “I have completed this lesson”.";
    case "question": return "A question with answer choices. Each choice can lead somewhere different.";
    case "quote": return "A quotation with an optional attribution.";
    case "scripture": return "A Bible verse with its reference shown beneath it.";
    case "divider": return "A horizontal rule. Resize it freely down to 1px, and set its colour and thickness.";
    case "shape": return "A decorative shape — rectangle, rounded, circle, ellipse, triangle, star, line or arrow.";
    case "icon": return "A small symbol from the icon library, sized and coloured to match your design.";
    case "table": return "A grid of rows and columns for comparing terms. It scrolls sideways on a phone.";
    case "progress": return "A progress bar, e.g. to show how far through a journey someone is.";
    default: return "A design element you can place, resize and style.";
  }
}

function settingsFor(item) {
  const common = "position, size, rotation, opacity, colour and alignment";
  switch (item.type) {
    case "heading":
    case "text": return `${common}, plus font family, size, weight, line height, colour and alignment`;
    case "image": return `${common}, plus object fit (cover/contain/fill), corner radius and alt text`;
    case "video": return `${common}, plus poster image, object fit and corner radius`;
    case "audio": return common;
    case "embed": return `${common}, plus the provider URL`;
    case "button": return `${common}, plus corner radius, padding, font and the action it triggers`;
    case "link": return `${common}, plus the destination address and whether it opens in a new tab`;
    case "shape": return `${common}, plus the shape, fill, border thickness, corner radius and shadow`;
    case "divider": return "length, thickness (down to 1px), colour and corner radius";
    case "icon": return `${common}, plus which icon, stroke weight and whether it is filled`;
    case "table": return "add or remove rows and columns, edit cells, header styling, border colour, background and text alignment";
    default: return common;
  }
}
