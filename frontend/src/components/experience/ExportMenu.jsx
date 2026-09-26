import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, FileDown, Image as ImageIcon, FileText } from "lucide-react";
import { pageHeight } from "../../experience/designModel";
import ExperienceRenderer from "./ExperienceRenderer";

/**
 * Export the current page.
 *
 * The page is rendered off-screen with the same renderer the canvas and the
 * published site use, so the export matches the design rather than an
 * approximation. Raster formats (PNG/JPG) and PDF are produced by drawing that
 * render onto a canvas; the browser's own print engine produces the PDF when
 * available, which keeps text selectable and selectable fonts intact.
 */

const RASTER = [
  { id: "png", label: "PNG", mime: "image/png", icon: ImageIcon },
  { id: "jpeg", label: "JPG", mime: "image/jpeg", icon: ImageIcon },
];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Render one page off-screen at full size and return its DOM node. */
function renderOffscreen(page) {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${page.pageSettings.width}px;`;
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);

  // The same renderer the canvas, preview and public page use, so an export is
  // the design itself rather than a separate approximation of it.
  const root = createRoot(host);
  root.render(<ExperienceRenderer page={page} mode="view" />);
  return { host, root };
}

/** Wait for images inside a rendered node so nothing exports half-blank. */
async function settleImages(host) {
  const images = Array.from(host.querySelectorAll("img"));
  await Promise.all(images.map((image) => (
    image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })
  )));
  // Fonts and late layout settle in the frame after the last image lands.
  await new Promise((resolve) => setTimeout(resolve, 250));
  return host;
}

/**
 * The app's own rules.
 *
 * Both export paths move the markup out of this document - into an SVG image or
 * a print window - and neither of them can follow a <link> stylesheet with us.
 * Without this the export is unstyled HTML: right words, wrong design.
 */
function collectCss() {
  const rules = [];
  for (const sheet of Array.from(document.styleSheets || [])) {
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      continue; // a cross-origin sheet exposes no rules to read
    }
    if (!list) continue;
    for (const rule of Array.from(list)) {
      try {
        rules.push(rule.cssText);
      } catch { /* a rule this browser cannot serialise is skipped */ }
    }
  }
  return rules.join("\n");
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("An image could not be read."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Replace every remote image with an equivalent data URL.
 *
 * An SVG loaded as an image may not fetch anything, so a photo that still
 * points at the media server simply would not appear in a PNG or JPG.
 */
async function inlineImages(host) {
  const images = Array.from(host.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    const src = image.getAttribute("src");
    if (!src || src.startsWith("data:")) return;
    try {
      const response = await fetch(src, { mode: "cors", cache: "force-cache" });
      if (!response.ok) return;
      image.setAttribute("src", await blobToDataUrl(await response.blob()));
    } catch { /* media the browser will not hand back is left out rather than failing the export */ }
  }));
}

/** Elements a still image cannot show, replaced by what the reader can infer. */
function replaceUnsavable(node) {
  node.querySelectorAll("iframe, canvas, audio, video").forEach((element) => {
    const label = element.tagName === "IFRAME" ? "Embedded content"
      : element.tagName === "AUDIO" ? "Audio" : "Video";
    const box = document.createElement("div");
    box.className = "exr-export-placeholder";
    box.textContent = label;
    element.replaceWith(box);
  });
  node.querySelectorAll("a[href]").forEach((link) => link.removeAttribute("href"));
}

/**
 * Wrap the rendered page in an SVG document the browser can decode as an image.
 *
 * The markup has to be serialised as XHTML rather than copied out as HTML:
 * innerHTML writes `<br>` and `<img>`, and an SVG image is parsed as XML, which
 * rejects an unclosed tag outright - the export would fail with nothing but a
 * generic "could not be drawn".
 */
function snapshotMarkup(host, width, height, css) {
  const clone = host.cloneNode(true);
  clone.removeAttribute("style");
  clone.removeAttribute("aria-hidden");
  replaceUnsavable(clone);

  const style = document.createElement("style");
  style.textContent = css;
  clone.insertBefore(style, clone.firstChild);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<foreignObject width="100%" height="100%">`
    + new XMLSerializer().serializeToString(clone)
    + "</foreignObject></svg>";
}

/** Raster formats: draw the render onto a canvas and hand back the bytes. */
async function rasterise(page, mime, quality) {
  const { host, root } = renderOffscreen(page);
  try {
    await settleImages(host);
    await inlineImages(host);

    const width = page.pageSettings.width;
    const height = Math.max(pageHeight(page), 1);
    // The markup has to travel inside a real SVG document: a browser will not
    // decode a bare <div> as an image, and the stylesheet that positions every
    // element cannot come with us, so both are packed into the foreignObject.
    const markup = snapshotMarkup(host, width, height, collectCss());

    const image = new Image();
    image.decoding = "sync";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The page could not be drawn. Please try a PDF export."));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    // Both formats are flattened: JPEG has no alpha at all, and a transparent
    // PNG of a page that always has a background colour is just a surprise.
    context.fillStyle = mime === "image/jpeg" ? "#ffffff" : (page.pageSettings.background || "#ffffff");
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
    if (!blob) throw new Error("The image could not be created.");
    return blob;
  } finally {
    root.unmount();
    host.remove();
  }
}

/** PDF: prefer the browser's print pipeline so text stays real text. */
async function exportPdf(page) {
  const { host, root } = renderOffscreen(page);
  try {
    await settleImages(host);
    const width = page.pageSettings.width;
    const height = Math.max(pageHeight(page), 1);

    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      throw new Error("Your browser blocked the export window. Allow pop-ups for this site and try again.");
    }
    // The app's own rules have to be written into this window too: it is a
    // different document, and without them the printout is unstyled markup.
    printWindow.document.write(
      `<!doctype html><html><head><title>${(page.title || "Design").replace(/[<>&]/g, "")}</title>`
      + `<style>${collectCss()}</style>`
      + "<style>"
      + `@page{size:${width}px ${height}px;margin:0}`
      + `html,body{margin:0;padding:0;width:${width}px;background:${page.pageSettings.background || "#fff"}}`
      + ".exr-export-placeholder{display:grid;place-items:center;width:100%;height:100%;background:#eef1f0;color:#5b6b66;font:12px system-ui}"
      + `.frame{width:${width}px;height:${height}px;overflow:hidden}`
      + "</style></head>"
      + `<body onload="setTimeout(function(){window.print()},350)"><div class="frame">${host.innerHTML}</div>`
      + "</body></html>",
    );
    printWindow.document.close();
    return { opened: true };
  } finally {
    // The print window owns a copy of the markup now, so tear the source down.
    setTimeout(() => {
      root.unmount();
      host.remove();
    }, 1000);
  }
}

export default function ExportMenu({ page, disabled }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const name = (page?.title || "design").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "design";

  async function run(id) {
    setError("");
    setBusy(id);
    try {
      if (id === "pdf") {
        await exportPdf(page);
      } else {
        const format = RASTER.find((item) => item.id === id);
        const blob = await rasterise(page, format.mime, id === "jpeg" ? 0.92 : undefined);
        downloadBlob(blob, `${name}.${id === "jpeg" ? "jpg" : "png"}`);
      }
      setOpen(false);
    } catch (err) {
      setError(err.message || "Export failed. Please try again.");
    } finally {
      setBusy("");
    }
  }

  if (!page) return null;

  return (
    <div className="eb-export">
      <button
        type="button"
        className="eb-btn eb-btn--soft"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Download size={14} /> Export
      </button>
      {open ? (
        <>
          <span className="eb-export__scrim" onClick={() => setOpen(false)} />
          <div className="eb-export__menu" role="menu">
            <span className="eb-export__title">Export this page</span>
            {RASTER.map((format) => (
              <button
                key={format.id}
                type="button"
                role="menuitem"
                className="eb-export__item"
                disabled={Boolean(busy)}
                onClick={() => run(format.id)}
              >
                <format.icon size={14} /> {format.label}
                {busy === format.id ? " — working…" : ""}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className="eb-export__item"
              disabled={Boolean(busy)}
              onClick={() => run("pdf")}
            >
              <FileDown size={14} /> PDF
              {busy === "pdf" ? " — working…" : ""}
            </button>
            <button
              type="button"
              role="menuitem"
              className="eb-export__item"
              disabled={Boolean(busy)}
              onClick={() => {
                const blob = new Blob([JSON.stringify(page, null, 2)], { type: "application/json" });
                downloadBlob(blob, `${name}.json`);
                setOpen(false);
              }}
            >
              <FileText size={14} /> Design file (JSON)
            </button>
            {error ? <p className="eb-export__error">{error}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
