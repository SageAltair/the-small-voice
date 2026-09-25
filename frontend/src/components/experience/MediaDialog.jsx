import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Image as ImageIcon, Link2, Loader2, Upload } from "lucide-react";
import { api } from "../../services/api";
import { resolveEmbed } from "../../experience/embedUtils";
import { validateImageFile, readFileAsDataUrl, formatBytes } from "../../experience/mediaUtils";

/**
 * "Add Media" dialog: upload from the computer, use a URL, or pick something
 * already in the experience's asset list. Insert and Cancel are the only exit
 * points, so an admin never has to hand-edit the document.
 */
export default function MediaDialog({ mode = "image", assets = [], onInsert, onClose }) {
  const [tab, setTab] = useState("upload");
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileInput = useRef(null);
  const isEmbed = mode === "embed";
  const title = isEmbed ? "Add embed" : mode === "video" ? "Add video" : mode === "audio" ? "Add audio" : "Add media";

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleFile(file) {
    setError("");
    if (!file) return;
    setBusy(true);
    try {
      if (!isEmbed) {
        const check = validateImageFile(file);
        if (!check.ok) throw new Error(check.reason);
        // Immediate local preview so the admin sees the right image right away.
        setPreview(await readFileAsDataUrl(file));
      }
      const uploaded = await api.uploadAsset(file);
      onInsert({ url: uploaded.url, alt, assetId: uploaded.assetId, name: uploaded.name });
    } catch (err) {
      setError(err.message || "Upload failed. Please try again.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  function insertUrl() {
    setError("");
    const value = url.trim();
    if (!value) {
      setError("Enter a link first.");
      return;
    }
    if (isEmbed) {
      const embed = resolveEmbed(value);
      if (!embed.ok) {
        setError(embed.reason);
        return;
      }
      onInsert({ url: embed.originalUrl, provider: embed.provider || "iframe", src: embed.src });
      return;
    }
    if (!/^https:\/\//i.test(value)) {
      setError("Only HTTPS links are allowed.");
      return;
    }
    onInsert({ url: value, alt });
  }


  return (
    <div className="eb-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      <div className="eb-modal__card" onMouseDown={(event) => event.stopPropagation()}>
        <header className="eb-modal__head">
          <h2>{title}</h2>
          <button type="button" className="eb-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="eb-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "upload"} className={`eb-tab ${tab === "upload" ? "is-active" : ""}`} onClick={() => setTab("upload")}>
            <Upload size={14} /> Upload
          </button>
          <button type="button" role="tab" aria-selected={tab === "url"} className={`eb-tab ${tab === "url" ? "is-active" : ""}`} onClick={() => setTab("url")}>
            <Link2 size={14} /> {isEmbed ? "Paste link" : "Use URL"}
          </button>
          {!isEmbed && (
            <button type="button" role="tab" aria-selected={tab === "library"} className={`eb-tab ${tab === "library" ? "is-active" : ""}`} onClick={() => setTab("library")} disabled={!assets.length}>
              <ImageIcon size={14} /> Library
            </button>
          )}
        </div>

        <div className="eb-modal__body">
          {tab === "upload" && (
            <div className="eb-drop">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                onChange={(event) => handleFile(event.target.files?.[0])}
                hidden
              />
              <button type="button" className="eb-drop__target" onClick={() => fileInput.current?.click()} disabled={busy}>
                {busy ? <Loader2 size={20} className="eb-spin" /> : <Upload size={20} />}
                <span>{busy ? "Uploading…" : "Choose a file from your computer"}</span>
                <small>PNG, JPG, WEBP, GIF or SVG · up to 12 MB</small>
              </button>
              {preview ? <img className="eb-drop__preview" src={preview} alt="Selected preview" /> : null}
            </div>
          )}

          {tab === "url" && (
            <div className="eb-fieldset">
              <label className="eb-label" htmlFor="media-url">{isEmbed ? "Embed URL" : "Image URL"}</label>
              <input
                id="media-url"
                className="eb-input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={isEmbed ? "https://www.youtube.com/watch?v=…" : "https://example.com/image.jpg"}
                autoFocus
              />
              {!isEmbed && (
                <>
                  <label className="eb-label" htmlFor="media-alt">Alt text</label>
                  <input
                    id="media-alt"
                    className="eb-input"
                    value={alt}
                    onChange={(event) => setAlt(event.target.value)}
                    placeholder="Describe the image for screen readers"
                  />
                </>
              )}
              {isEmbed ? <p className="eb-hint">YouTube, Vimeo, Google Forms, Spotify and HTTPS web pages are supported.</p> : null}
            </div>
          )}

          {tab === "library" && !isEmbed && (
            <div className="eb-library">
              {assets.map((asset) => (
                <button
                  key={asset.assetId || asset.url}
                  type="button"
                  className="eb-library__item"
                  onClick={() => onInsert({ url: asset.url, alt, assetId: asset.assetId, name: asset.name })}
                >
                  <img src={asset.url} alt="" />
                  <span>{asset.name || asset.url.split("/").pop()}</span>
                </button>
              ))}
            </div>
          )}

          {error ? (
            <p className="eb-alert eb-alert--error" role="alert"><AlertCircle size={14} /> {error}</p>
          ) : null}
        </div>

        <footer className="eb-modal__foot">
          <button type="button" className="eb-btn eb-btn--ghost" onClick={onClose}>Cancel</button>
          {tab !== "upload" && (
            <button type="button" className="eb-btn eb-btn--primary" onClick={insertUrl}>
              <Check size={14} /> Insert
            </button>
          )}
        </footer>

        {assets.length ? (
          <p className="eb-modal__note">
            {assets.length} asset{assets.length === 1 ? "" : "s"} · {formatBytes(assets.reduce((sum, asset) => sum + (asset.size || 0), 0))} on the server
          </p>
        ) : null}
      </div>
    </div>
  );
}
