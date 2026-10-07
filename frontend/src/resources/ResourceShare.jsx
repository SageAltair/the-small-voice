
/**
 * Share and download controls.
 *
 * The share button uses the device's own share sheet when there is one - a
 * native sheet already offers Save, Mail and Messages, and reimplementing any
 * of that would be worse. Where there is none it copies the link instead,
 * and says so in text rather than only changing a colour.
 */

import { useState } from "react";
import { Check, Download, Send, Share2 } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext";
import { getResourceDownloadUrl } from "../services/api";

export default function ResourceShare({ resource, title, url, iconOnly = false }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const label = t.resources.share;

  const href =
    url ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/resources/${resource?.type || "document"}/${resource?.slug || resource?.id}`
      : "");

  async function share() {
    if (!href) return;

    // Prefer the native sheet: it offers Save, Mail and Messages without us
    // reimplementing any of them.
    if (navigator.share) {
      try {
        await navigator.share({ title: title || resource?.title, url: href });
        return;
      } catch (error) {
        // A user dismissing the sheet is not a failure; only try the fallback
        // when sharing genuinely did not happen.
        if (error?.name === "AbortError") return;
      }
    }

    await copy();
  }

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        // Clipboard API needs a secure context; this keeps the button working
        // on plain http during local development.
        const field = document.createElement("textarea");
        field.value = href;
        field.setAttribute("readonly", "");
        field.style.position = "absolute";
        field.style.left = "-9999px";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        document.body.removeChild(field);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Nothing to do: the button simply does not confirm, and the reader can
      // still copy the address bar.
    }
  }

  const text = copied ? t.resources.shareCopied : label;

  if (iconOnly) {
    return (
      <button
        type="button"
        className="feed-action"
        onClick={share}
        data-copied={copied || undefined}
        aria-label={text}
      >
        {copied ? (
          <Check size={18} aria-hidden="true" />
        ) : (
          <Send size={18} aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="res-share"
      onClick={share}
      data-copied={copied || undefined}
      aria-label={text}
    >
      {copied ? (
        <Check size={16} aria-hidden="true" />
      ) : (
        <Share2 size={16} aria-hidden="true" />
      )}
      {text}
    </button>
  );
}

/** A download button that only appears when downloads are permitted. */
export function ResourceDownload({ resource, className = "res-btn", iconOnly = false }) {
  const { t } = useLanguage();
  const href = getResourceDownloadUrl(resource);

  // The API refuses a download the resource did not permit, so the button is
  // not rendered at all rather than offering something that would 403.
  if (!href || !resource?.downloadable) return null;

  if (iconOnly) {
    return (
      <a className="feed-action" href={href} download aria-label={t.resources.download}>
        <Download size={18} aria-hidden="true" />
      </a>
    );
  }

  return (
    <a className={className} href={href} download>
      <Download size={16} aria-hidden="true" />
      {t.resources.download}
    </a>
  );
}
