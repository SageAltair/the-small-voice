export { isResourceType, resourceMeta, RESOURCE_TYPES } from "./resourceTypes";
export { fill } from "../i18n/resourceCopy";

/**
 * Small helpers shared by every Resources screen.
 *
 * They exist so the nine viewers agree on the answers to questions that come
 * up in all of them: what is this resource called, where does it link to, how
 * long is it, and can it be downloaded.
 */

/** The public route for a resource, with a per-language link for SEO. */
export function resourceHref(resource) {
  const type = resource?.type || "document";
  const slug = resource?.slug || resource?.id;
  return `/resources/${type}/${slug}`;
}

/** The type label for the current language, falling back to the raw value. */
export function typeLabel(resource, t) {
  const type = resource?.type || "document";
  return t?.types?.[type] || type;
}

/** The singular type label, used on detail pages and badges. */
export function singularTypeLabel(resource, t) {
  const type = resource?.type || "document";
  return t?.singularTypes?.[type] || type;
}

/** `m:ss`, or `h:mm:ss` for anything long enough to need the hour. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return "";

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value) => String(value).padStart(2, "0");

  return hours
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}

/** A rough minute count, for "12 min" badges. */
export function formatMinutes(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return "";
  return String(Math.max(1, Math.round(total / 60)));
}

/** File sizes, in the units a reader expects to see. */
export function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!value || Number.isNaN(value)) return "";

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

/** A readable date, in the reader's locale. */
export function formatDate(value, language = "en") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    language === "sw" ? "sw-KE" : "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  ).format(date);
}

/** A short excerpt, cut on a word boundary rather than mid-word. */
export function excerpt(text, limit = 140) {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;

  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : limit).trimEnd()}…`;
}

/**
 * Whether this resource can be downloaded.
 *
 * The API enforces this too; reading the same flag here keeps the button from
 * offering something the server will refuse with a 403.
 */
export function canDownload(resource) {
  return Boolean(resource?.downloadable ?? resource?.download_enabled);
}

/** The download URL, or null when downloads are not permitted. */
export function downloadHref(resource) {
  if (!resource?.id || !canDownload(resource)) return null;
  return `/resources/${resource.id}/download`;
}

/** Whether this resource can be shared. */
export function canShare(resource) {
  return resource?.share_enabled !== false;
}

/**
 * The image a card should show.
 *
 * A type that *is* an image uses its own file; everything else falls back to
 * its cover. Returns null when there is nothing to show, which is the signal
 * to draw the type's placeholder instead of a broken image.
 */
export function cardImage(resource) {
  if (!resource) return null;
  const type = resource.type || "document";
  if (type === "image" || type === "infographic") {
    return resource.cover_url || resource.media_url || null;
  }
  return resource.cover_url || null;
}

/** The alt text for a card image, never empty when an image is shown. */
export function cardAlt(resource) {
  if (!resource) return "";
  return (
    resource.alt_text ||
    resource.accessibility_desc ||
    resource.caption ||
    resource.title ||
    ""
  );
}

/** The images a gallery-style viewer should page through. */
export function galleryImages(resource) {
  if (!resource) return [];

  const slides = Array.isArray(resource.slides) ? resource.slides : [];
  if (slides.length) {
    return slides
      .filter((slide) => slide.image_url)
      .map((slide) => ({
        url: slide.image_url,
        alt: slide.alt_text || slide.caption || slide.text || resource.title,
        caption: slide.caption || slide.text || "",
      }));
  }

  if (resource.carousel_urls?.length) {
    return resource.carousel_urls.map((url) => ({
      url,
      alt: resource.title,
      caption: "",
    }));
  }

  const single = resource.media_url || resource.cover_url || resource.url;
  return single ? [{ url: single, alt: cardAlt(resource), caption: "" }] : [];
}

/**
 * The file a document-style viewer should open.
 *
 * Returns null when the resource is an external link rather than an uploaded
 * file, so the viewer can offer "open on the source site" instead of an empty
 * frame.
 */
export function viewableFile(resource) {
  if (!resource) return null;
  if (resource.external_url && !resource.url) {
    return { external: true, url: resource.external_url, kind: "external" };
  }
  const url = resource.media_url || resource.url;
  if (!url) return null;

  return { external: false, url, kind: fileKind(resource) };
}

/** Best guess at what kind of file a resource points at. */
export function fileKind(resource) {
  if (!resource) return null;

  const type = resource.type || "document";
  if (type === "video" || type === "reel") return "video";
  if (type === "audio") return "audio";
  if (type === "image") return "image";
  if (type === "infographic") return "image";
  if (type === "book" || type === "document") return "document";

  const url = String(resource.media_url || resource.url || "").toLowerCase();
  if (url.endsWith(".pdf")) return "pdf";
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac|opus)$/.test(url)) return "audio";
  if (/\.(jpe?g|png|gif|webp|avif)$/.test(url)) return "image";

  return "document";
}

/** Whether the browser can display a file without downloading it. */
export function isPreviewable(file) {
  if (!file || file.external) return false;
  return ["video", "audio", "image", "pdf"].includes(file.kind);
}
