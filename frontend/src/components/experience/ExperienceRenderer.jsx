import { useEffect, useMemo, useRef, useState } from "react";
import * as ICONS from "lucide-react";
import { resolveEmbed, EMBED_IFRAME } from "../../experience/embedUtils";
import { getImageUrl } from "../../services/api";
import { pageHeight, layoutPage, PAGE_BOTTOM_PADDING } from "../../experience/designModel";

const px = (value) => (Number.isFinite(value) ? `${value}px` : undefined);

/** Turn an element's style bag into inline CSS. */
function styleToCss(style = {}, extra = {}) {
  const css = {};
  const passthrough = {
    fontWeight: "fontWeight",
    fontStyle: "fontStyle",
    textAlign: "textAlign",
    textTransform: "textTransform",
    textDecoration: "textDecoration",
    objectFit: "objectFit",
    objectPosition: "objectPosition",
    boxShadow: "boxShadow",
    border: "border",
  };
  // These style values are lengths and need a px unit. `lineHeight` is
  // deliberately absent: it is a unitless ratio, and turning 1.1 into "1.1px"
  // collapses the line box and made every text measurement wrong.
  const unitKeys = ["fontSize", "letterSpacing", "borderRadius", "padding"];
  // Margin belongs to the element frame (it is spacing *around* the box, and
  // the frame is the box), so it must not also be applied to the content
  // inside - that would double the offset.
  const marginKeys = new Set(["margin", "marginTop", "marginRight", "marginBottom", "marginLeft"]);

  Object.entries(style || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    if (marginKeys.has(key)) return;

    // Border width/colour/style are edited separately in the properties panel
    // but rendered as a single CSS `border` shorthand.
    if (key === "borderWidth" || key === "borderColor" || key === "borderStyle") {
      const width = Number(style.borderWidth) || 0;
      if (width > 0) {
        css.border = `${px(width)} ${style.borderStyle || "solid"} ${style.borderColor || "#24251f"}`;
      }
      return;
    }

    if (passthrough[key]) {
      css[passthrough[key]] = value;
      return;
    }
    if (unitKeys.includes(key)) {
      css[key] = typeof value === "number" ? px(value) : value;
      return;
    }
    css[key] = value;
  });

  return { ...css, ...extra };
}

/** Margin values ride on the element frame, not on the content inside it. */
function frameMargin(style = {}) {
  const css = {};
  ["marginTop", "marginRight", "marginBottom", "marginLeft"].forEach((key) => {
    const value = style[key];
    if (value === null || value === undefined || value === "" || Number(value) === 0) return;
    css[key] = typeof value === "number" ? px(value) : value;
  });
  return css;
}

/** Accept https links, site-relative paths and anchors - matching the validator. */
function linkHref(raw) {
  const value = String(raw || "").trim();
  if (!value) return "#";
  if (/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value)) return value;
  // A bare domain like example.com/page still counts as a link.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|\?|#)/i.test(value)) return `https://${value}`;
  return "#";
}

function Placeholder({ label, tone = "muted" }) {
  return <div className={`exr-placeholder exr-placeholder--${tone}`}>{label}</div>;
}

function MediaSlot({ label, tone, onOpen }) {
  return (
    <button type="button" className="exr-hit" onClick={onOpen} aria-label={label}>
      <Placeholder label={label} tone={tone} />
    </button>
  );
}

/**
 * Checkbox behaviour lives in its own component so the tick state is a real,
 * unconditional hook. On the canvas the tick is written straight into the
 * element (so it survives save/reopen); on a published page a local copy
 * flips so a reader can tick it without anyone listening for actions.
 */
function CheckboxElement({ element, mode, onToggle, onAction }) {
  const { content = {}, style = {} } = element;
  const stored = Boolean(content.checked);
  const editable = mode === "edit";
  // On the canvas the document value is the truth. On a published page the
  // reader's own tick is kept locally, and `null` means "not touched yet", so
  // the authored value still shows through until someone flips it.
  const [localTick, setLocalTick] = useState(null);
  const ticked = localTick ?? stored;

  return (
    <div className="exr-checkbox">
      {/* Pointer/click are stopped so ticking the box never starts a canvas
          drag or steals the gesture from the input itself. */}
      <input
        type="checkbox"
        checked={editable ? stored : ticked}
        onChange={(event) => {
          const next = event.target.checked;
          if (editable) {
            onToggle?.(element, next);
            return;
          }
          setLocalTick(next);
          onAction?.(element, { checked: next });
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      />
      <span className="exr-autofit" style={styleToCss(style)}>{content.text || ""}</span>
    </div>
  );
}


/** One element's visual body. Split out so each type stays readable. */
function ElementBody({ element, mode, onAction, onRequestMedia, onToggle }) {
  const { type, content = {}, style = {} } = element;
  const editable = mode === "edit";
  const openMedia = (event) => {
    event.stopPropagation();
    onRequestMedia?.(element);
  };
  const stop = (event) => event.stopPropagation();

  switch (type) {
    case "heading":
    case "text": {
      const Tag = type === "heading" ? "h2" : "p";
      return <Tag className="exr-text exr-autofit" data-editable="true" style={styleToCss(style)}>{content.text || ""}</Tag>;
    }

    case "image":
      if (!content.url) return <MediaSlot label="Add an image" tone="accent" onOpen={openMedia} />;
      return (
        <img
          className="exr-media"
          src={getImageUrl(content.url)}
          alt={content.alt || ""}
          style={styleToCss(style)}
          draggable={false}
        />
      );

    case "video":
      if (!content.url) return <MediaSlot label="Add a video" tone="accent" onOpen={openMedia} />;
      return (
        <video
          className="exr-media"
          src={getImageUrl(content.url)}
          poster={content.poster ? getImageUrl(content.poster) : undefined}
          controls
          preload="metadata"
          style={styleToCss(style)}
        />
      );

    case "audio":
      if (!content.url) return <MediaSlot label="Add audio" tone="accent" onOpen={openMedia} />;
      return <audio className="exr-audio" src={getImageUrl(content.url)} controls preload="metadata" />;

    case "embed": {
      const embed = resolveEmbed(content.url);
      if (!content.url || !embed.ok) {
        return (
          <MediaSlot
            label={content.url ? embed.reason : "Add an embed"}
            tone={content.url ? "error" : "accent"}
            onOpen={openMedia}
          />
        );
      }
      return (
        <iframe
          className="exr-embed"
          title={content.title || embed.label || "Embedded content"}
          src={embed.src}
          sandbox={EMBED_IFRAME.sandbox}
          referrerPolicy={EMBED_IFRAME.referrerPolicy}
          loading={EMBED_IFRAME.loading}
          allow={EMBED_IFRAME.allow}
          allowFullScreen={EMBED_IFRAME.allowFullScreen}
          style={styleToCss(style)}
        />
      );
    }

    case "button":
      return (
        <button
          type="button"
          className="exr-button"
          style={styleToCss(style)}
          onClick={(event) => {
            event.stopPropagation();
            if (!editable) onAction?.(element);
          }}
        >
          {content.text || "Button"}
        </button>
      );

    case "link": {
      const label = content.text || "Link";
      const href = linkHref(content.href);
      if (editable) return <span className="exr-link exr-autofit" style={styleToCss(style)}>{label}</span>;
      // The properties panel accepts https:// links, /path links and #anchors,
      // so the anchor honours all three. `newTab` decides the target.
      const opensNew = content.newTab !== false && /^https?:\/\//i.test(href);
      return (
        <a
          className="exr-link exr-autofit"
          href={href}
          target={opensNew ? "_blank" : undefined}
          rel={opensNew ? "noreferrer noopener" : undefined}
          style={styleToCss(style)}
          onClick={stop}
        >
          {label}
        </a>
      );
    }

    case "input":
      return (
        <input
          className="exr-field"
          type="text"
          placeholder={content.placeholder || ""}
          aria-label={content.label || content.placeholder || "Answer"}
          readOnly={editable}
          tabIndex={editable ? -1 : 0}
          style={styleToCss(style)}
          onClick={stop}
        />
      );

    case "textarea":
      return (
        <textarea
          className="exr-field"
          placeholder={content.placeholder || ""}
          aria-label={content.label || content.placeholder || "Response"}
          readOnly={editable}
          tabIndex={editable ? -1 : 0}
          style={styleToCss(style)}
          onClick={stop}
        />
      );

    case "checkbox":
      return <CheckboxElement element={element} mode={mode} onToggle={onToggle} onAction={onAction} />;


    case "question":
      return (
        <div className="exr-question exr-autofit" style={styleToCss(style)}>
          <p className="exr-question-text">{content.text || "Question"}</p>
          <div className="exr-options">
            {(content.options || []).map((option, index) => (
              <button
                key={`${option}-${index}`}
                type="button"
                className="exr-option"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!editable) onAction?.(element, { option });
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      );

    case "quote":
      return (
        <blockquote className="exr-quote exr-autofit" style={styleToCss(style)}>
          <p>{content.text || "Quote"}</p>
          {content.author ? <cite>{content.author}</cite> : null}
        </blockquote>
      );

    case "scripture":
      return (
        <figure className="exr-scripture exr-autofit" style={styleToCss(style)}>
          <p>{content.text || "Scripture"}</p>
          {content.reference ? <figcaption>{content.reference}</figcaption> : null}
        </figure>
      );

    case "divider":
      return <div className="exr-divider" style={styleToCss(style)} />;

    case "shape": {
      const shape = ["rectangle", "rounded", "circle", "ellipse", "triangle", "star", "line", "arrow"].includes(content.shape)
        ? content.shape
        : "rectangle";
      // Every shape fills its element frame (clip-path draws the non-box
      // outlines), so resizing the element resizes the shape and the fill
      // colour in the properties panel is what paints it.
      return <div className={`exr-shape exr-shape--${shape}`} style={styleToCss(style)} role="presentation" />;
    }

    case "icon": {
      const Icon = ICONS[content.icon] || ICONS.Star;
      if (!Icon) return <Placeholder label="Icon" />;
      const size = Math.max(8, Math.min(element.width || 96, element.height || 96));
      return (
        <span className="exr-icon" style={{ color: style?.color || "currentColor" }}>
          <Icon
            size={size}
            strokeWidth={Number(content.stroke) || 2}
            fill={content.filled ? "currentColor" : "none"}
          />
        </span>
      );
    }

    case "table": {
      const columns = content.columns || [];
      const rows = content.rows || [];
      const align = style?.textAlign || "left";
      const cellStyle = { textAlign: align, borderColor: style?.borderColor, padding: style?.padding };
      // A cell that is a bare URL renders as a real link so tables can carry
      // references without an extra link element.
      const renderCell = (cell) => {
        const text = cell === null || cell === undefined ? "" : String(cell);
        if (/^https?:\/\/\S+$/i.test(text.trim())) {
          return <a href={text.trim()} target="_blank" rel="noreferrer noopener">{text}</a>;
        }
        return text;
      };
      // Optional per-column widths (px). When any is set the table uses a
      // fixed layout so the authored widths are what actually render.
      const colWidths = content.colWidths || [];
      const hasWidths = colWidths.some((width) => Number(width) > 0);
      const headBackground = content.headerBackground || style?.background || "#f4f6f4";
      return (
        <div className="exr-table-wrap exr-autofit">
          <table
            className="exr-table"
            style={{
              fontSize: style?.fontSize || 16,
              color: style?.color,
              background: style?.background,
              tableLayout: hasWidths ? "fixed" : undefined,
            }}
          >
            {hasWidths && columns.length ? (
              <colgroup>
                {columns.map((_, index) => (
                  <col key={`w-${index}`} style={colWidths[index] ? { width: `${Number(colWidths[index])}px` } : undefined} />
                ))}
              </colgroup>
            ) : null}
            {content.headerRow !== false && columns.length ? (
              <thead>
                <tr>
                  {columns.map((cell, index) => (
                    <th key={`h-${index}`} style={{ ...cellStyle, background: headBackground }}>{renderCell(cell)}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`r-${rowIndex}`}>
                  {(columns.length ? columns.map((_, index) => (row || [])[index] ?? "") : (row || [])).map((cell, cellIndex) => (
                    <td key={`c-${cellIndex}`} style={cellStyle}>{renderCell(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "progress": {
      const value = Math.max(0, Math.min(100, Number(content.value) || 0));
      return (
        <div
          className="exr-progress"
          style={styleToCss(style)}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${value}%` }} />
        </div>
      );
    }

    default:
      return <Placeholder label={type} />;
  }
}


/* ------------------------------------------------------------------ */
/* Page renderer                                                       */
/* ------------------------------------------------------------------ */

/**
 * Renders a page's elements at their exact stored coordinates.
 *
 * This is the only layout implementation in the product. The editing canvas,
 * the preview and the published page all mount this same component, so what an
 * admin arranges is what a visitor sees - there is no second, automatic layout
 * engine that could disagree with the canvas.
 *
 * `mode`: "edit" adds selection chrome, "view" is the final presentation.
 */
export default function ExperienceRenderer({
  page,
  mode = "view",
  selectedIds = [],
  onSelect,
  onAction,
  onRequestMedia,
  onToggle,
  onTextResize,
  viewportWidth,
  renderChrome,
  className = "",
  style: wrapperStyle,
  ...rest
}) {
  const settings = page?.pageSettings || {};
  // `viewportWidth` lets preview and the published page render the same design
  // at a phone/tablet/desktop width. The editor passes nothing, so the canvas
  // always shows the design at its true authored size.
  const drawWidth = viewportWidth || settings.width;
  // Automatic layout is a property of the page, not of the viewport: the editor
  // canvas has to show it too, otherwise the toggle only appears to work in
  // preview and what gets published is a surprise.
  const autoFlow = settings.layoutMode === "auto";
  const height = useMemo(() => {
    if (!page) return 0;
    const fixed = pageHeight(page);
    if (drawWidth === settings.width && !autoFlow) return fixed;
    const flowed = layoutPage(page, drawWidth);
    const lowest = flowed.reduce((max, element) => Math.max(max, element.y + element.height), 0);
    return Math.max(Math.ceil(lowest) + PAGE_BOTTOM_PADDING, fixed);
  }, [page, drawWidth, settings.width, autoFlow]);
  const selection = new Set(selectedIds);
  const elements = useMemo(() => {
    if (!page) return [];
    // In custom mode inside the editor we draw the authored geometry, so the
    // frame you drag is the frame that gets saved. Automatic mode, and every
    // preview or published view, draws the flowed arrangement instead.
    if (!autoFlow && (!viewportWidth || drawWidth === settings.width)) {
      return page.elements.filter((element) => element.isVisible !== false);
    }
    return layoutPage(page, drawWidth);
  }, [page, viewportWidth, drawWidth, settings.width, autoFlow]);
  const pageRef = useRef(null);
  const fittedRef = useRef("");

  // Text boxes are sized by their content, not by a stale default height.
  // After paint we measure each wrapping element and grow the frame to match,
  // which is what keeps long copy from being cut off on the canvas, in
  // preview, and on the published page. The edit pass reports the corrected
  // heights back so the new geometry is what gets saved.
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;

    const growth = new Map();
    root.querySelectorAll(".exr-element").forEach((node) => {
      const target = node.querySelector(".exr-autofit");
      if (!target) return;
      // `scrollHeight`/`offsetHeight` are layout pixels and ignore the canvas
      // zoom transform, so the two are directly comparable. Using
      // getBoundingClientRect here would mix scaled and unscaled units.
      const needed = Math.ceil(target.scrollHeight);
      const current = node.offsetHeight;
      if (needed > current + 1) growth.set(node.dataset.elementId, needed);
    });

    if (!growth.size) return;
    const signature = Array.from(growth.entries()).map(([id, value]) => `${id}:${value}`).join("|");
    if (signature === fittedRef.current) return;
    fittedRef.current = signature;
    onTextResize?.(growth);
  }, [elements, page, onTextResize]);


  return (
    <div
      ref={pageRef}
      className={`exr-page exr-page--${mode} ${className}`}
      style={{
        width: px(drawWidth),
        height: px(height),
        background: settings.background || undefined,
        ...wrapperStyle,
      }}
      data-page-id={page?.id ?? ""}
      {...rest}
    >
      {elements.map((element) => (
        <div
          key={element.id}
          className={`exr-element ${selection.has(element.id) ? "is-selected" : ""} ${element.isLocked ? "is-locked" : ""}`}
          style={{
            left: px(element.x),
            top: px(element.y),
            width: px(element.width),
            height: px(element.height),
            zIndex: element.zIndex,
            transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
            opacity: element.style?.opacity,
            // Margin is authored spacing around the element; it rides on the
            // frame so the selection outline and every downstream layout see
            // the same box the reader sees.
            ...frameMargin(element.style),
          }}
          data-element-id={element.id}
          data-element-type={element.type}
          onPointerDown={
            mode === "edit"
              ? (event) => {
                  event.stopPropagation();
                  onSelect?.(element, event);
                }
              : undefined
          }
        >
          <ElementBody element={element} mode={mode} onAction={onAction} onRequestMedia={onRequestMedia} onToggle={onToggle} />
          {mode === "edit" && renderChrome ? renderChrome(element) : null}
        </div>
      ))}
    </div>
  );
}
