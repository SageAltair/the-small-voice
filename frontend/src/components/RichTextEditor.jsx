import { useEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, ImagePlus, Italic, Link, List, ListOrdered, Maximize2, Minus, Quote, Redo2, Strikethrough, Underline, Undo2, Video } from "lucide-react";

import { uploadAdminImage } from "../services/api";

const fonts = ["Newsreader", "Poppins", "Georgia", "Arial", "DM Mono"];
const fontSizes = [{ value: "2", label: "Small" }, { value: "3", label: "Normal" }, { value: "4", label: "Medium" }, { value: "5", label: "Large" }, { value: "6", label: "Extra large" }];

function ToolbarButton({ label, children, onClick }) {
  return <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClick} title={label} aria-label={label}>{children}</button>;
}

export default function RichTextEditor({ value, onChange }) {
  const editor = useRef(null);
  const selection = useRef(null);
  const [expanded, setExpanded] = useState(false);

  // Do not replace the editable DOM while the author is typing. Replacing it on
  // every input moves the caret to the beginning, which makes text appear backward.
  useEffect(() => {
    if (editor.current && editor.current.innerHTML !== value && document.activeElement !== editor.current) {
      editor.current.innerHTML = value || "";
    }
  }, [value]);

  function saveSelection() {
    const range = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0) : null;
    if (range && editor.current?.contains(range.commonAncestorContainer)) selection.current = range.cloneRange();
  }

  function restoreSelection() {
    editor.current?.focus();
    if (!selection.current) return;
    const current = window.getSelection();
    current.removeAllRanges();
    current.addRange(selection.current);
  }

  function sync() { onChange(editor.current?.innerHTML || ""); saveSelection(); }
  function command(name, argument = null) { restoreSelection(); document.execCommand(name, false, argument); sync(); }

  function changeFontSize(size) {
    command("fontSize", size);
    editor.current?.querySelectorAll(`font[size="${size}"]`).forEach((font) => {
      const span = document.createElement("span");
      span.style.fontSize = ({ 2: "0.875rem", 3: "1rem", 4: "1.25rem", 5: "1.5rem", 6: "2rem" })[size];
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
    sync();
  }

  async function insertPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { const imageUrl = await uploadAdminImage(file); command("insertHTML", `<img src="${imageUrl}" alt="" />`); } finally { event.target.value = ""; }
  }

  function insertLink() {
    const url = window.prompt("Paste the link URL");
    if (!url) return;
    const href = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    command("createLink", href);
  }

  function insertVideo() {
    const url = window.prompt("Paste a YouTube or Vimeo video URL");
    if (!url) return;
    let embedUrl = "";
    try {
      const parsed = new URL(url);
      const youtubeId = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
      if (youtubeId) embedUrl = `https://www.youtube-nocookie.com/embed/${youtubeId}`;
      if (parsed.hostname.includes("vimeo.com")) embedUrl = `https://player.vimeo.com/video/${parsed.pathname.split("/").filter(Boolean).pop()}`;
    } catch { /* Invalid URL is handled below. */ }
    if (!embedUrl) { window.alert("Please use a valid YouTube or Vimeo video link."); return; }
    command("insertHTML", `<span class="embedded-video"><iframe src="${embedUrl}" title="Embedded video" loading="lazy" allowfullscreen></iframe></span><p><br></p>`);
  }

  return <div className={`rich-editor${expanded ? " editor-expanded" : ""}`}>
    <div className="editor-toolbar" role="toolbar" aria-label="Story formatting" onMouseDown={saveSelection}>
      <ToolbarButton label="Bold" onClick={() => command("bold")}><Bold size={15} /></ToolbarButton>
      <ToolbarButton label="Italic" onClick={() => command("italic")}><Italic size={15} /></ToolbarButton>
      <ToolbarButton label="Underline" onClick={() => command("underline")}><Underline size={15} /></ToolbarButton>
      <ToolbarButton label="Strikethrough" onClick={() => command("strikeThrough")}><Strikethrough size={15} /></ToolbarButton>
      <span className="editor-divider" />
      {["H1", "H2", "H3"].map((heading) => <ToolbarButton key={heading} label={`Heading ${heading.slice(1)}`} onClick={() => command("formatBlock", heading)}><span className="editor-heading-button">{heading}</span></ToolbarButton>)}
      <span className="editor-divider" />
      <label className="editor-color" title="Text colour">A<input type="color" aria-label="Text colour" onChange={(event) => command("foreColor", event.target.value)} /></label>
      <select aria-label="Font family" defaultValue={fonts[0]} onMouseDown={saveSelection} onChange={(event) => command("fontName", event.target.value)}>{fonts.map((font) => <option key={font}>{font}</option>)}</select>
      <select aria-label="Font size" defaultValue="3" onMouseDown={saveSelection} onChange={(event) => changeFontSize(event.target.value)}>{fontSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}</select>
      <ToolbarButton label="Bulleted list" onClick={() => command("insertUnorderedList")}><List size={15} /></ToolbarButton>
      <ToolbarButton label="Numbered list" onClick={() => command("insertOrderedList")}><ListOrdered size={15} /></ToolbarButton>
      <ToolbarButton label="Add link" onClick={insertLink}><Link size={15} /></ToolbarButton>
      <ToolbarButton label="Quote" onClick={() => command("formatBlock", "blockquote")}><Quote size={15} /></ToolbarButton>
      <span className="editor-divider" />
      <ToolbarButton label="Align left" onClick={() => command("justifyLeft")}><AlignLeft size={15} /></ToolbarButton>
      <ToolbarButton label="Align centre" onClick={() => command("justifyCenter")}><AlignCenter size={15} /></ToolbarButton>
      <ToolbarButton label="Align right" onClick={() => command("justifyRight")}><AlignRight size={15} /></ToolbarButton>
      <ToolbarButton label="Insert divider" onClick={() => command("insertHTML", "<hr /><p><br></p>")}><Minus size={15} /></ToolbarButton>
      <label className="editor-upload" title="Insert photo"><ImagePlus size={15} /><span>Photo</span><input type="file" accept="image/*" onChange={insertPhoto} /></label>
      <ToolbarButton label="Insert video" onClick={insertVideo}><Video size={15} /></ToolbarButton>
      <span className="editor-divider" />
      <ToolbarButton label="Undo" onClick={() => command("undo")}><Undo2 size={15} /></ToolbarButton>
      <ToolbarButton label="Redo" onClick={() => command("redo")}><Redo2 size={15} /></ToolbarButton>
      <ToolbarButton label={expanded ? "Exit distraction-free mode" : "Distraction-free mode"} onClick={() => setExpanded((current) => !current)}><Maximize2 size={15} /></ToolbarButton>
    </div>
    <div ref={editor} className="editor-surface" contentEditable suppressContentEditableWarning onInput={sync} onKeyUp={saveSelection} onMouseUp={saveSelection} onFocus={saveSelection} />
  </div>;
}
