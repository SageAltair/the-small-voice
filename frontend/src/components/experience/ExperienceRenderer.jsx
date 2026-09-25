import { useMemo } from "react";
import { resolveEmbed, EMBED_IFRAME, isSafeMediaUrl } from "../../experience/embedUtils";
import { getImageUrl } from "../../services/api";
import { pageHeight } from "../../experience/designModel";

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

const px = (value) => (Number.isFinite(value) ? `${value}px` : undefined);

/** Turn an element's style bag into inline CSS. */
export function styleToCss(style = {}, extra = {}) {
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
  const unitKeys = ["fontSize", "lineHeight", "letterSpacing", "borderRadius", "padding"];

  Object.entries(style || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;

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


/** One element's visual body. Split out so each type stays readable. */
function ElementBody({ element, mode, onAction, onRequestMedia }) {
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
      return <Tag className="exr-text" data-editable="true" style={styleToCss(style)}>{content.text || ""}</Tag>;
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
      if (editable) return <span className="exr-link" style={styleToCss(style)}>{label}</span>;
      return (
        <a
          className="exr-link"
          href={isSafeMediaUrl(content.href) ? content.href : "#"}
          target="_blank"
          rel="noreferrer noopener"
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
      return (
        <label className="exr-checkbox" style={styleToCss(style)} onClick={stop}>
          <input type="checkbox" checked={Boolean(content.checked)} readOnly={editable} tabIndex={editable ? -1 : 0} />
          <span>{content.text || "Option"}</span>
        </label>
      );


    case "question":
      return (
        <div className="exr-question" style={styleToCss(style)}>
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
        <blockquote className="exr-quote" style={styleToCss(style)}>
          <p>{content.text || "Quote"}</p>
          {content.author ? <cite>{content.author}</cite> : null}
        </blockquote>
      );

    case "scripture":
      return (
        <figure className="exr-scripture" style={styleToCss(style)}>
          <p>{content.text || "Scripture"}</p>
          {content.reference ? <figcaption>{content.reference}</figcaption> : null}
        </figure>
      );

    case "divider":
      return <div className="exr-divider" style={styleToCss(style)} />;

    case "shape":
      return <div className="exr-shape" style={styleToCss(style)} />;

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

export default function ExperienceRenderer({
  page,
  mode = "view",
  selectedIds = [],
  onSelect,
  onAction,
  onRequestMedia,
  renderChrome,
  className = "",
  style: wrapperStyle,
  ...rest
}) {
  const settings = page?.pageSettings || {};
  const height = useMemo(() => (page ? pageHeight(page) : 0), [page]);
  const selection = new Set(selectedIds);
  const elements = (page?.elements || []).filter((element) => element.isVisible !== false);

  return (
    <div
      className={`exr-page exr-page--${mode} ${className}`}
      style={{
        width: px(settings.width),
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
          <ElementBody element={element} mode={mode} onAction={onAction} onRequestMedia={onRequestMedia} />
          {mode === "edit" && renderChrome ? renderChrome(element) : null}
        </div>
      ))}
    </div>
  );
}
