/** Media helpers for the image / video / audio elements. */

export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export const OBJECT_FIT_OPTIONS = ["cover", "contain", "fill", "none"];

export const FONT_OPTIONS = [
  { value: "Poppins", label: "Poppins (body)" },
  { value: "Newsreader", label: "Newsreader (headings)" },
  { value: "DM Mono", label: "DM Mono (mono)" },
  { value: "Georgia, serif", label: "Georgia (serif)" },
  { value: "system-ui, sans-serif", label: "System (sans)" },
];

/**
 * Validate a file chosen through the media dialog.
 *
 * The type of element decides which formats are acceptable: the previous
 * version checked every upload against the image list, so a video or audio file
 * was always rejected no matter which element it was for.
 */
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
export const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/aac", "audio/flac"];

const ACCEPT_BY_MODE = {
  image: IMAGE_MIME_TYPES,
  video: [...VIDEO_MIME_TYPES, ...IMAGE_MIME_TYPES],
  audio: [...AUDIO_MIME_TYPES],
};

/** The `accept` attribute for a file input, per element type. */
export function acceptFor(mode) {
  return (ACCEPT_BY_MODE[mode] || IMAGE_MIME_TYPES).join(",");
}

export function validateMediaFile(file, mode = "image") {
  if (!file) return { ok: false, reason: "Choose a file first." };
  const allowed = ACCEPT_BY_MODE[mode] || IMAGE_MIME_TYPES;
  const type = (file.type || "").toLowerCase();
  // Some browsers report an empty type for less common extensions, so fall back
  // to the extension rather than refusing a legitimate file.
  const extension = (file.name || "").split(".").pop().toLowerCase();
  const byExtension = {
    image: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
    video: ["mp4", "webm", "ogv", "ogg", "mov"],
    audio: ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac"],
  }[mode] || [];
  const ok = type ? allowed.includes(type) : byExtension.includes(extension);

  if (!ok) {
    const reason = {
      image: "Unsupported image. Use PNG, JPG, WEBP, GIF or SVG.",
      video: "Unsupported video. Use MP4, WebM, OGG or MOV.",
      audio: "Unsupported audio. Use MP3, WAV, OGG, M4A, AAC or FLAC.",
    }[mode] || "Unsupported file type.";
    return { ok: false, reason };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: "That file is larger than 12 MB. Please compress it and try again." };
  }
  return { ok: true };
}

/** Backwards-compatible alias used by existing callers. */
export function validateImageFile(file) {
  return validateMediaFile(file, "image");
}

/** Read a File into a data URL (used for the immediate local preview). */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/** Load an image so its natural size can seed the element box. */
export function measureImage(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** Resize a box while preserving the aspect ratio it already has. */
export function resizeKeepingRatio(box, next, ratio) {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return next;
  return { width: Math.max(8, Math.round(next.width)), height: Math.max(8, Math.round(next.width / ratio)) };
}

export function ratioOf(element) {
  if (!element?.width || !element?.height) return null;
  return element.width / element.height;
}

/** Clamp a rotated element so it stays reachable on the page. */
export function clampToPage(element, pageWidth, pageHeight) {
  return {
    ...element,
    x: Math.round(Math.min(Math.max(element.x, -element.width + 40), pageWidth - 40)),
    y: Math.round(Math.min(Math.max(element.y, -element.height + 40), Math.max(pageHeight - 40, 0))),
  };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
