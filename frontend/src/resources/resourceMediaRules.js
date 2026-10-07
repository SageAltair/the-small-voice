/**
 * Media suitability rules for each resource type.
 *
 * One module answers "can this file be shown as this type?" for the admin
 * uploader, the editor's type picker, and the tests. The public feed reads the
 * same shapes to preserve ratios — so a rule added here reaches both sides.
 */

export const NAMED_RATIOS = {
  "1:1": { value: 1, label: "1:1" },
  "4:5": { value: 4 / 5, label: "4:5" },
  "3:4": { value: 3 / 4, label: "3:4" },
  "2:3": { value: 2 / 3, label: "2:3" },
  "9:16": { value: 9 / 16, label: "9:16" },
  "3:2": { value: 3 / 2, label: "3:2" },
  "4:3": { value: 4 / 3, label: "4:3" },
  "16:9": { value: 16 / 9, label: "16:9" },
  "21:9": { value: 21 / 9, label: "21:9" },
};

/** How close two ratios must be to count as the same (about 3%). */
export const RATIO_TOLERANCE = 0.03;

/** The named ratio closest to a measured width/height, or null when unknown. */
export function nearestNamedRatio(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const measured = width / height;
  let best = null;
  let bestDistance = Infinity;

  for (const [label, rule] of Object.entries(NAMED_RATIOS)) {
    const distance = Math.abs(measured - rule.value);
    if (distance < bestDistance) {
      best = label;
      bestDistance = distance;
    }
  }

  return best;
}

/** "1080 × 1920", or an em dash when either side is unknown. */
export function formatDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "—";
  return `${width} × ${height}`;
}

/** "Aspect ratio: 9:16" for admins, or an em dash when it cannot be measured. */
export function formatAspectLabel(width, height) {
  const label = nearestNamedRatio(width, height);
  return label ? `Aspect ratio: ${label}` : "Aspect ratio: —";
}

/**
 * Can this file be this type?
 *
 * The reason is written for an administrator, not a log: it names the type,
 * the measured ratio and the ratios the type accepts. Unknown dimensions are
 * not a failure — the browser may not be able to read a codec the server can —
 * so the server re-checks after upload and the publish checklist reports it.
 */
export function checkMediaForType(type, media = {}) {
  const rule = MEDIA_RULES[type];
  if (!rule) {
    return {
      ok: false,
      detectedRatio: null,
      reason: `Unknown resource type "${type}".`,
    };
  }

  const kind = media.kind || null;
  const mime = String(media.mimeType || "").trim().toLowerCase();
  const expectedKinds = rule.kinds || [];

  const kindMatches =
    expectedKinds.length === 0 ||
    (kind && expectedKinds.includes(kind)) ||
    (mime && expectedKinds.some((candidate) => mime.startsWith(`${candidate}/`)));

  if (!kindMatches) {
    const found = kind || mime || "an unknown file type";
    return {
      ok: false,
      detectedRatio: null,
      reason: `${type} needs ${expectedKinds.join(" or ")} media, but this is ${found}.`,
    };
  }

  const { width, height } = media;
  const detectedRatio =
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? nearestNamedRatio(width, height)
      : null;

  if (rule.anyRatio || !rule.ratios || rule.ratios.length === 0) {
    return { ok: true, detectedRatio, reason: "" };
  }

  if (!detectedRatio) {
    return { ok: true, detectedRatio: null, reason: "" };
  }

  const measured = width / height;
  const matches = rule.ratios.some((label) => {
    const allowed = NAMED_RATIOS[label]?.value;
    return allowed && Math.abs(measured - allowed) <= RATIO_TOLERANCE * allowed;
  });

  if (matches) return { ok: true, detectedRatio, reason: "" };

  return {
    ok: false,
    detectedRatio,
    reason:
      `${type} accepts ${rule.ratios.join(", ")} — this file is ` +
      `${formatDimensions(width, height)} (${detectedRatio}). ${rule.explain}`,
  };
}

export const MEDIA_RULES = {
  reel: {
    kinds: ["video"],
    ratios: ["9:16", "4:5", "3:4", "1:1"],
    primaryRatio: "9:16",
    orientation: "portrait",
    explain:
      "Reels are vertical short-form video. 9:16 fills the frame; 4:5, 3:4 and 1:1 are also supported.",
  },
  video: {
    kinds: ["video"],
    ratios: ["16:9", "4:3", "3:2", "1:1", "4:5", "3:4", "9:16"],
    primaryRatio: "16:9",
    orientation: "any",
    explain:
      "Videos play in a landscape player. 16:9 is the standard; other ratios are preserved, not cropped.",
  },
  audio: {
    kinds: ["audio"],
    ratios: [],
    anyRatio: true,
    orientation: "any",
    explain: "Audio needs a sound file, not a picture — any duration works.",
  },
  image: {
    kinds: ["image"],
    ratios: [],
    anyRatio: true,
    orientation: "any",
    explain:
      "Images keep their uploaded ratio — square, portrait, landscape or panoramic.",
  },
  infographic: {
    kinds: ["image"],
    ratios: [],
    anyRatio: true,
    orientation: "any",
    explain:
      "Infographics keep their uploaded ratio so small text stays readable.",
  },
  carousel: {
    kinds: ["image"],
    ratios: [],
    anyRatio: true,
    orientation: "any",
    explain: "Carousel slides keep each slide's own ratio.",
  },
  book: {
    kinds: ["pdf", "document"],
    ratios: [],
    anyRatio: true,
    orientation: "any",
    explain: "Books need a readable document (PDF or text).",
  },
  document: {
    kinds: ["pdf", "document", "image"],
    ratios: [],
    anyRatio: true,
    orientation: "any",
    explain: "Documents accept PDFs, office files, text or images.",
  },
  quote: {
    kinds: [],
    ratios: [],
    anyRatio: true,
    orientation: "any",
    textOnly: true,
    explain: "Quotes are words, not files — no upload is needed.",
  },
};
