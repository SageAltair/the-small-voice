import { useRef, useState } from "react";
import { AlertCircle, FileUp, RotateCcw, Upload, X } from "lucide-react";

/**
 * A real file picker for the administrator's device.
 *
 * Not a URL box. The file is uploaded to the platform's own storage and comes
 * back with everything the editor needs to describe it - kind, size, duration,
 * page count, dimensions and a generated PDF cover - so nothing here has to
 * guess about a file the browser has already read.
 *
 * Progress is real because this uses XHR rather than fetch: fetch still cannot
 * report upload progress, and a bar that animates from 0 to 100 regardless is
 * worse than none at all when a large video takes a minute.
 */

import { useLanguage } from "../../i18n/LanguageContext";
import { fill } from "../../i18n/resourceCopy";
import { uploadResourceFile } from "../../services/api";
import {
  checkMediaForType,
  formatAspectLabel,
  formatDimensions,
  MEDIA_RULES,
} from "../resourceMediaRules";
import { formatFileSize } from "../resourceUtils";

const ACCEPT = [
  "image/*",
  "video/*",
  "audio/*",
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".rtf",
  ".epub",
].join(",");

const MAX_BYTES = 300 * 1024 * 1024;

export default function ResourceFileField({
  label,
  value,
  facts,
  onChange,
  onFacts,
  accept = ACCEPT,
  hint,
  resourceType = null,
  showRatio = false,
}) {
  const { t } = useLanguage();
  const copy = t.resources.admin;

  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const [ratioInfo, setRatioInfo] = useState(null);

  /** File family of a picked file, before the server classifies it. */
  function localKind(file) {
    const mime = String(file?.type || "");
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("image/")) return "image";
    if (mime === "application/pdf") return "pdf";
    return "document";
  }

  /** Measure pixels in the browser so validation happens before upload. */
  function probeLocalDimensions(file) {
    return new Promise((resolve) => {
      const kind = localKind(file);
      const url = URL.createObjectURL(file);
      const done = (width, height) => {
        URL.revokeObjectURL(url);
        resolve({ width, height });
      };
      if (kind === "image") {
        const image = new Image();
        image.onload = () => done(image.naturalWidth, image.naturalHeight);
        image.onerror = () => done(null, null);
        image.src = url;
        return;
      }
      if (kind === "video") {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () => done(video.videoWidth, video.videoHeight);
        video.onerror = () => done(null, null);
        video.src = url;
        return;
      }
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    });
  }

  /* Validate before uploading rather than after: a 400 response arrives only
     once the whole file has crossed the network, which for a large video is a
     long wait to be told the extension was wrong. */
  function validate(file) {
    if (!file.size) return copy.fileEmpty;
    if (file.size > MAX_BYTES) {
      return fill(copy.fileTooLarge, { size: formatFileSize(file.size) });
    }
    return "";
  }

  async function upload(file) {
    const problem = validate(file);
    if (problem) {
      setError(problem);
      return;
    }

    // Aspect-ratio compatibility is checked during upload, not after
    // publishing: measure locally, reject a mismatched type with the reason,
    // and show the detected "1080 × 1920 / Aspect ratio: 9:16" verdict.
    if (resourceType && MEDIA_RULES[resourceType] && !MEDIA_RULES[resourceType].textOnly) {
      const measured = await probeLocalDimensions(file);
      const verdict = checkMediaForType(resourceType, {
        kind: localKind(file),
        width: measured.width,
        height: measured.height,
        mimeType: file.type,
      });
      const dims = formatDimensions(measured.width, measured.height);
      const aspect = formatAspectLabel(measured.width, measured.height);
      setRatioInfo({
        ok: verdict.ok,
        text: [resourceType, dims, aspect].filter(Boolean).join(" · ") || resourceType,
        detected: verdict.detectedRatio,
      });
      if (!verdict.ok) {
        setError(verdict.reason);
        setPending(null);
        return;
      }
    }

    setError("");
    setPending(file);
    setProgress(0);

    try {
      const result = await uploadResourceFile(file, {
        onProgress: (value) => setProgress(value),
      });

      onChange(result.url);
      onFacts?.(result);
      setPending(null);
    } catch (err) {
      // The file is kept so Retry can try the identical upload again without
      // making the administrator find it on disk a second time.
      setError(err.message || copy.uploadFailed);
      setPending(file);
    } finally {
      setProgress(null);
    }
  }

  function clear() {
    onChange("");
    onFacts?.(null);
    setError("");
    setPending(null);
    setRatioInfo(null);

    /* Clearing the native input lets the same file be chosen again
       afterwards, which a browser will not do while the old value stands. */
    if (inputRef.current) inputRef.current.value = "";
  }

  const uploading = progress !== null;
  const preview = value && /\.(jpe?g|png|gif|webp|avif)$/i.test(value);

  const details = [
    facts?.kind,
    facts?.file_size ? formatFileSize(facts.file_size) : null,
    facts?.duration ? `${facts.duration}s` : null,
    facts?.page_count ? fill(copy.pagesShort, { count: facts.page_count }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="res-field">
      <span className="res-field-label">{label}</span>

      {value ? (
        <div className="res-file">
          {preview ? (
            <img src={value} alt="" />
          ) : (
            <span className="res-file-icon" aria-hidden="true">
              <FileUp size={18} />
            </span>
          )}

          <div className="res-file-info">
            <strong>{facts?.name || copy.uploadedFile}</strong>
            {details && <small>{details}</small>}
          </div>

          <button
            type="button"
            className="res-icon-btn"
            onClick={() => inputRef.current?.click()}
            aria-label={copy.replaceFile}
            disabled={uploading}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="res-icon-btn"
            onClick={clear}
            aria-label={copy.removeFile}
            disabled={uploading}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : (
        /* A button, not a bare label: the input lives outside this element, so
           a label here would be pointing at nothing and clicking would do
           nothing at all. */
        <button
          type="button"
          className="res-dropzone"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={20} aria-hidden="true" />
          <span>{hint || copy.chooseFile}</span>
          <small>{copy.sizeLimit}</small>
        </button>
      )}

      {/* One input drives every state, including Replace, so the control does
          not move under the pointer halfway through. */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
        }}
      />

      {value && (
        /* The URL is shown as well as offered, so an administrator can copy a
           file to another resource instead of re-uploading it. */
        <input
          className="res-input res-input--url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={fill(copy.fileUrl, { label })}
        />
      )}

      {uploading && (
        <div className="res-progress" aria-live="polite">
          <div className="res-progress-bar">
            <i style={{ width: `${progress}%` }} />
          </div>
          <small>{fill(copy.uploading, { name: pending?.name })} — {progress}%</small>
        </div>
      )}

      {error && (
        <p className="res-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
          {pending && (
            <button type="button" onClick={() => upload(pending)}>
              {copy.retry}
            </button>
          )}
        </p>
      )}

      {(showRatio || ratioInfo) && (ratioInfo || facts?.width) && (
        <p
          className={ratioInfo && !ratioInfo.ok ? "res-error" : "res-admin-hint"}
          aria-live="polite"
        >
          {ratioInfo?.text ||
            `${formatDimensions(facts?.width, facts?.height)} · ${formatAspectLabel(facts?.width, facts?.height)}`}
          {ratioInfo?.ok ? " ✓" : ""}
          {ratioInfo?.detected && !ratioInfo?.ok ? "" : ""}
        </p>
      )}
    </div>
  );
}
