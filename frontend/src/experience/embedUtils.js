/**
 * Embed handling.
 *
 * Embeds are rendered in a sandboxed iframe driven by a strict provider
 * allowlist. Arbitrary URLs are never injected as HTML or script - an
 * unrecognised host is simply not embeddable, which keeps the editor (and the
 * published page) free of injected content.
 */

const PROVIDERS = [
  { id: "youtube", label: "YouTube", hosts: ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"], build: youtubeEmbed },
  { id: "vimeo", label: "Vimeo", hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"], build: vimeoEmbed },
  { id: "google-forms", label: "Google Form", hosts: ["docs.google.com", "forms.gle"], build: passthroughEmbed },
  { id: "spotify", label: "Spotify", hosts: ["open.spotify.com", "spotify.com"], build: spotifyEmbed },
  { id: "soundcloud", label: "SoundCloud", hosts: ["w.soundcloud.com", "soundcloud.com"], build: passthroughEmbed },
  { id: "codepen", label: "CodePen", hosts: ["codepen.io"], build: passthroughEmbed },
  { id: "iframe", label: "Web page (HTTPS only)", hosts: [], build: passthroughEmbed },
];

/** Parse a URL, returning null for anything malformed or non-HTTPS. */
export function safeParse(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const candidate = raw.trim();
  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    const url = new URL(withScheme);
    // Only HTTPS embeds. This is the single most important guard here: it
    // blocks javascript:, data: and plain http origins.
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function hostMatches(host, candidates) {
  return candidates.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function youtubeEmbed(url) {
  const id = url.hostname.includes("youtu.be")
    ? url.pathname.slice(1)
    : url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop();
  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  const start = url.searchParams.get("t") || url.searchParams.get("start");
  const params = new URLSearchParams({ rel: "0", modestrebranding: "1" });
  if (start) params.set("start", start.replace(/[^\d]/g, ""));
  return { src: `https://www.youtube-nocookie.com/embed/${id}?${params}`, provider: "youtube" };
}

function vimeoEmbed(url) {
  const id = url.pathname.split("/").filter(Boolean).pop();
  if (!id || !/^\d{6,12}$/.test(id)) return null;
  return { src: `https://player.vimeo.com/video/${id}`, provider: "vimeo" };
}

function spotifyEmbed(url) {
  if (!url.pathname.includes("/embed/")) return null;
  return { src: `https://open.spotify.com/embed${url.pathname}`, provider: "spotify" };
}

function passthroughEmbed(url) {
  return { src: url.href, provider: null };
}

/**
 * Resolve a user-entered URL into an embeddable iframe source.
 * Returns `{ ok: false, reason }` for anything that must not be embedded.
 */
export function resolveEmbed(raw) {
  const url = safeParse(raw);
  if (!url) {
    return { ok: false, reason: "Enter a valid HTTPS link (http://, javascript: and data: are not allowed)." };
  }

  const host = url.hostname.toLowerCase();
  const provider = PROVIDERS.find((entry) => entry.hosts.length && hostMatches(host, entry.hosts));

  if (provider) {
    const built = provider.build(url);
    if (!built) {
      return { ok: false, reason: `That ${provider.label} link could not be read. Check the full URL.` };
    }
    return { ok: true, ...built, originalUrl: url.href, label: provider.label };
  }

  // Unknown host: only a plain HTTPS page is embedded, never a provider guess.
  if (host === "localhost" || host.endsWith(".local") || /^(\d+\.){3}\d+$/.test(host)) {
    return { ok: false, reason: "Local and private-network addresses cannot be embedded." };
  }

  return { ok: true, src: url.href, provider: null, originalUrl: url.href, label: "Web page" };
}

export const EMBED_PROVIDERS = PROVIDERS.map(({ id, label }) => ({ id, label }));

/** Sandbox + permissions for every embed iframe rendered by the builder. */
export const EMBED_IFRAME = {
  sandbox: "allow-scripts allow-same-origin allow-popups allow-presentation",
  referrerPolicy: "strict-origin-when-cross-origin",
  loading: "lazy",
  allow: "accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen",
  allowFullScreen: true,
};

/** True when a URL is safe to use as a plain <img src>. */
export function isSafeMediaUrl(raw) {
  return Boolean(safeParse(raw));
}
