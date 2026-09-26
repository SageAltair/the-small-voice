/**
 * Design model for the freeform visual canvas.
 *
 * This module is deliberately free of React and DOM access: it holds the
 * document shape, the page-format presets, the element catalogue and the pure
 * geometry helpers (bounds, alignment, distribution, z-order, snapping). Keeping
 * it side-effect free means every rule below is directly unit testable, which is
 * how the "elements must not move on their own" guarantee is enforced.
 */

export const MIN_SIZE = 8;
export const DEFAULT_GRID = 8;

/**
 * Per-type minimum sizes. A divider is a hairline, so the global 8px floor
 * made it impossible to draw a 2px rule - the resize handles refused to go
 * below 8 even though the stored value was legal.
 */
export const MIN_SIZE_BY_TYPE = { divider: 1 };
export const minSizeFor = (type) => MIN_SIZE_BY_TYPE[type] || MIN_SIZE;

let idCounter = 0;

/** Stable, collision-resistant id that stays readable in saved JSON. */
export function uid(prefix = "el") {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* Page formats                                                        */
/* ------------------------------------------------------------------ */

export const PAGE_PRESETS = [
  { id: "custom", label: "Custom", width: 1080, height: 1920, orientation: "portrait" },
  { id: "story", label: "Story", width: 1080, height: 1920, orientation: "portrait" },
  { id: "mobile", label: "Mobile", width: 390, height: 844, orientation: "portrait" },
  { id: "desktop", label: "Desktop", width: 1440, height: 900, orientation: "landscape" },
  { id: "tablet", label: "Tablet", width: 834, height: 1112, orientation: "portrait" },
  { id: "presentation", label: "Presentation", width: 1920, height: 1080, orientation: "landscape" },
  { id: "square", label: "Square", width: 1080, height: 1080, orientation: "square" },
  { id: "portrait", label: "Portrait", width: 1080, height: 1350, orientation: "portrait" },
  { id: "landscape", label: "Landscape", width: 1920, height: 1080, orientation: "landscape" },
  { id: "a4", label: "A4", width: 1240, height: 1754, orientation: "portrait" },
  { id: "a5", label: "A5", width: 874, height: 1240, orientation: "portrait" },
  { id: "social-post", label: "Social Post", width: 1200, height: 1200, orientation: "square" },
];

export const DEFAULT_PAGE_SETTINGS = {
  preset: "story",
  width: 1080,
  height: 1920,
  orientation: "portrait",
  unit: "px",
  layoutMode: "fixed",
  background: "#ffffff",
};

export function presetById(id) {
  return PAGE_PRESETS.find((preset) => preset.id === id) || null;
}

/** Clamp a page into the range the backend accepts, keeping the orientation honest. */
export function normalizePageSettings(raw) {
  const source = raw || {};
  const preset = presetById(source.preset);
  const fallback = DEFAULT_PAGE_SETTINGS;

  const toNumber = (value, defaultValue) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : defaultValue;
  };

  const width = Math.max(200, Math.min(12000, toNumber(source.width, preset ? preset.width : fallback.width)));
  const height = Math.max(200, Math.min(12000, toNumber(source.height, preset ? preset.height : fallback.height)));

  let orientation = source.orientation || (preset ? preset.orientation : fallback.orientation);
  if (!["portrait", "landscape", "square"].includes(orientation)) {
    orientation = fallback.orientation;
  }

  // "custom" keeps the authored positions; "auto" lets the builder stack them
  // with consistent spacing. Both are user-editable, so switching never
  // discards content.
  const layoutMode = ["auto", "custom"].includes(source.layoutMode)
    ? source.layoutMode
    : source.layoutMode === "endless" ? "auto" : "custom";
  const flowMode = source.layoutMode === "endless" || source.layoutMode === "auto" ? "endless" : "fixed";

  // Dimensions are preserved exactly as entered. Swapping them here would
  // silently rewrite a design whenever the numbers happened to disagree with
  // the orientation, which is exactly the "the editor moved my page" bug this
  // canvas is meant to avoid. Presets already ship correctly-shaped sizes.
  return {
    preset: source.preset || (preset ? preset.id : "custom"),
    width,
    height,
    orientation,
    unit: "px",
    layoutMode,
    flowMode,
    background: source.background || fallback.background,
  };
}


/* ------------------------------------------------------------------ */
/* Element catalogue                                                   */
/* ------------------------------------------------------------------ */

const TEXT_STYLE = { fontFamily: "Poppins", fontSize: 18, lineHeight: 1.6, color: "#24251f" };

/**
 * The insertable element types. `icon` is a lucide-react icon *name* (the
 * component maps it) so this file stays plain JavaScript.
 */
export const ELEMENT_TYPES = [
  {
    type: "heading", label: "Heading", icon: "Heading1", group: "Text",
    size: { width: 640, height: 96 },
    content: { text: "Your heading" },
    style: { fontFamily: "Newsreader", fontSize: 56, lineHeight: 1.1, fontWeight: 600, color: "#24251f", textAlign: "left" },
  },
  {
    type: "text", label: "Paragraph", icon: "Type", group: "Text",
    size: { width: 640, height: 140 },
    content: { text: "Write your text here. Double-click on the canvas to edit it directly." },
    style: { ...TEXT_STYLE, textAlign: "left" },
  },
  {
    type: "image", label: "Image", icon: "Image", group: "Media",
    size: { width: 640, height: 400 },
    content: { url: "", alt: "" },
    style: { objectFit: "cover", borderRadius: 12, opacity: 1 },
  },
  {
    type: "video", label: "Video", icon: "Video", group: "Media",
    size: { width: 640, height: 360 },
    content: { url: "", poster: "", caption: "" },
    style: { objectFit: "contain", borderRadius: 12 },
  },
  {
    type: "audio", label: "Audio", icon: "Music", group: "Media",
    size: { width: 480, height: 72 },
    content: { url: "", caption: "" },
    style: {},
  },
  {
    type: "embed", label: "Embed", icon: "Code", group: "Media",
    size: { width: 640, height: 360 },
    content: { url: "", provider: "" },
    style: { borderRadius: 12 },
  },
  {
    type: "button", label: "Button", icon: "MousePointerClick", group: "Interactive", interactive: true,
    size: { width: 220, height: 56 },
    content: { text: "Continue" },
    style: { background: "#24534a", color: "#ffffff", borderRadius: 8, fontSize: 16, fontWeight: 500, padding: 14 },
    actions: [{ trigger: "click", action: "navigate", config: { destination: "next" } }],
  },
  {
    type: "link", label: "Link", icon: "Link2", group: "Interactive", interactive: true,
    size: { width: 240, height: 32 },
    content: { text: "Read more", href: "", newTab: true },
    style: { fontSize: 16, color: "#24534a", textDecoration: "underline" },
  },
  {
    type: "input", label: "Input", icon: "TextCursorInput", group: "Interactive", interactive: true,
    size: { width: 420, height: 52 },
    content: { placeholder: "Type your answer", label: "" },
    style: { fontSize: 16, borderRadius: 8, border: "1px solid #d9d8cf", padding: 12, background: "#ffffff", color: "#24251f" },
  },
  {
    type: "textarea", label: "Text area", icon: "AlignLeft", group: "Interactive", interactive: true,
    size: { width: 480, height: 160 },
    content: { placeholder: "Share your reflection", label: "" },
    style: { fontSize: 16, borderRadius: 8, border: "1px solid #d9d8cf", padding: 12, background: "#ffffff", color: "#24251f" },
  },
  {
    type: "checkbox", label: "Checkbox", icon: "CheckSquare", group: "Interactive", interactive: true,
    size: { width: 360, height: 40 },
    content: { text: "I have completed this lesson", checked: false },
    style: { fontSize: 16, color: "#24251f" },
  },
  {
    type: "question", label: "Question", icon: "HelpCircle", group: "Interactive", interactive: true,
    size: { width: 640, height: 220 },
    content: { text: "What would you like to explore?", options: ["Know God", "Understand Jesus", "Learn to Pray"] },
    style: { fontSize: 26, fontFamily: "Newsreader", color: "#24251f" },
  },
  {
    type: "quote", label: "Quote", icon: "Quote", group: "Content",
    size: { width: 560, height: 200 },
    content: { text: "The small voice is always speaking.", author: "" },
    style: { fontFamily: "Newsreader", fontSize: 32, lineHeight: 1.35, fontStyle: "italic", color: "#24534a" },
  },
  {
    type: "scripture", label: "Bible verse", icon: "BookOpen", group: "Content",
    size: { width: 600, height: 220 },
    content: { text: "Call to me and I will answer you.", reference: "Jeremiah 33:3" },
    style: { fontFamily: "Newsreader", fontSize: 28, lineHeight: 1.4, color: "#24251f" },
  },
  {
    type: "divider", label: "Divider", icon: "Minus", group: "Layout",
    size: { width: 400, height: 2 },
    content: {},
    style: { background: "#d9d8cf" },
  },
  {
    type: "shape", label: "Shape", icon: "Square", group: "Layout",
    size: { width: 200, height: 200 },
    content: { shape: "rectangle" },
    style: { background: "#dce9e1", borderRadius: 16 },
  },
  {
    type: "icon", label: "Icon", icon: "Sparkles", group: "Layout",
    size: { width: 96, height: 96 },
    content: { icon: "Star", stroke: 2, filled: false },
    style: { color: "#24534a" },
  },
  {
    type: "table", label: "Table", icon: "Table2", group: "Content",
    size: { width: 640, height: 240 },
    content: {
      columns: ["Term", "Meaning"],
      rows: [["New birth", "Beginning with God"], ["Growth", "Learning to walk"]],
      headerRow: true,
    },
    style: { fontSize: 16, background: "#ffffff", color: "#24251f", borderColor: "#d9d8cf", padding: 12 },
  },
  {
    type: "progress", label: "Progress", icon: "BarChart3", group: "Content",
    size: { width: 400, height: 16 },
    content: { value: 40 },
    style: { background: "#dce9e1", color: "#24534a", borderRadius: 999 },
  },
];

export const ELEMENT_GROUPS = ["Text", "Media", "Interactive", "Content", "Layout"];

export function elementDefinition(type) {
  return ELEMENT_TYPES.find((entry) => entry.type === type) || ELEMENT_TYPES[1];
}


/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

const toFinite = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Read an element from either the editor's flat shape or the API's nested
 * ``position``/``size`` shape. Older designs are stored in the nested shape,
 * so accepting both is what makes the migration lossless.
 */
export function normalizeElement(raw, index = 0) {
  const definition = elementDefinition(raw?.type || raw?.element_type);
  const position = raw?.position || {};
  const size = raw?.size || {};
  const type = raw?.type || raw?.element_type || definition.type;

  return {
    id: raw?.element_uuid || raw?.id || uid(),
    type,
    x: Math.round(toFinite(raw?.x ?? position.x, 0)),
    y: Math.round(toFinite(raw?.y ?? position.y, 0)),
    width: Math.max(minSizeFor(type), Math.round(toFinite(raw?.width ?? size.width, definition.size.width))),
    height: Math.max(minSizeFor(type), Math.round(toFinite(raw?.height ?? size.height, definition.size.height))),
    rotation: toFinite(raw?.rotation, 0),
    zIndex: Math.round(toFinite(raw?.zIndex ?? raw?.z_index, index)),
    content: { ...definition.content, ...(raw?.content || {}) },
    style: { ...definition.style, ...(raw?.style || {}) },
    isVisible: raw?.isVisible ?? raw?.is_visible ?? true,
    isLocked: raw?.isLocked ?? raw?.is_locked ?? false,
    isInteractive: raw?.isInteractive ?? raw?.is_interactive ?? definition.interactive ?? false,
    sectionId: raw?.sectionId || "",
    accessibility: { ...(raw?.accessibility || {}) },
    actions: (raw?.actions || []).map((action) => ({
      trigger: action.trigger || "click",
      action: action.action || action.action_type || "navigate",
      config: action.config || {},
      condition: action.condition || {},
    })),
  };
}

/** Build a brand new element at an explicit position. Nothing else moves. */
export function createElement(type, { x = 0, y = 0, zIndex = 0, overrides = {} } = {}) {
  const definition = elementDefinition(type);
  return normalizeElement({
    element_uuid: uid(),
    type: definition.type,
    x,
    y,
    width: definition.size.width,
    height: definition.size.height,
    zIndex,
    content: { ...definition.content },
    style: { ...definition.style },
    actions: (definition.actions || []).map((action) => ({ ...action, config: { ...(action.config || {}) } })),
    ...overrides,
  }, zIndex);
}

/* ------------------------------------------------------------------ */
/* Pages & document                                                    */
/* ------------------------------------------------------------------ */

export function createPage({ title, pageSettings, elements = [] } = {}) {
  return {
    id: null,
    title: title || "Page 1",
    pageSettings: normalizePageSettings(pageSettings),
    elements,
  };
}

/**
 * Height actually needed to draw a page. A fixed page is exactly its declared
 * height; an endless page grows with the lowest element so long lessons are
 * never clipped, with a small margin for oversize rotation.
 */
export function pageHeight(page) {
  const settings = page?.pageSettings || DEFAULT_PAGE_SETTINGS;
  if ((settings.flowMode || settings.layoutMode) !== "endless") return settings.height;

  const lowest = (page.elements || []).reduce((max, element) => {
    if (element.isVisible === false) return max;
    return Math.max(max, element.y + element.height);
  }, 0);

  return Math.max(settings.height, Math.ceil(lowest) + PAGE_BOTTOM_PADDING);
}


/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/**
 * Page padding. The canvas had none, so elements could sit flush against (or
 * half off) the page edge and the last element had no breathing room. This is
 * the safe area the renderer insets by, and what the bottom spacing is measured
 * against.
 */
export const PAGE_SIDE_PADDING = 64;
export const PAGE_TOP_PADDING = 64;
export const PAGE_BOTTOM_PADDING = 96;

/** Device frames used by the responsive preview and the published page. */
export const DEVICE_FRAMES = [
  { id: "phone", label: "Phone", width: 390, height: 844 },
  { id: "tablet", label: "Tablet", width: 834, height: 1112 },
  { id: "desktop", label: "Desktop", width: 1440, height: 900 },
];

export const LAYOUT_MODES = [
  { id: "custom", label: "Custom", hint: "You place and size every element." },
  { id: "auto", label: "Automatic", hint: "The builder arranges elements; you can still edit them." },
];

/** Clamp an element inside the page's safe area. */
export function clampToSafeArea(element, page) {
  const settings = page?.pageSettings || DEFAULT_PAGE_SETTINGS;
  const minW = minSizeFor(element.type);
  const maxW = Math.max(minW, settings.width - PAGE_SIDE_PADDING * 2);
  const width = Math.min(Math.max(element.width, minW), maxW);
  const height = Math.max(element.height, minSizeFor(element.type));

  return {
    ...element,
    width: Math.round(width),
    height: Math.round(height),
    x: Math.round(Math.min(Math.max(element.x, PAGE_SIDE_PADDING), settings.width - PAGE_SIDE_PADDING - width)),
    y: Math.round(Math.max(PAGE_TOP_PADDING, element.y)),
  };
}

/**
 * Reflow a page for a narrower viewport.
 *
 * The design is authored once at its own width. On a smaller screen we scale
 * every coordinate by the ratio instead of re-running a layout engine, so the
 * arrangement is identical everywhere and nothing can overflow the page.
 */
export function reflowElements(elements, pageWidth, targetWidth) {
  if (!elements?.length || !pageWidth) return elements || [];
  const ratio = targetWidth / pageWidth;
  if (Math.abs(ratio - 1) < 0.001) return elements;

  return elements.map((element) => {
    const scaled = {
      ...element,
      x: Math.round(element.x * ratio),
      width: Math.round(Math.max(minSizeFor(element.type), element.width * ratio)),
      height: Math.round(Math.max(minSizeFor(element.type), element.height * ratio)),
    };
    // Font size scales with the box so text keeps its proportions and still
    // wraps instead of overflowing a now-smaller frame.
    const size = Number(element.style?.fontSize);
    if (Number.isFinite(size) && size > 0) {
      scaled.style = { ...element.style, fontSize: Math.max(10, Math.round(size * ratio)) };
    }
    return scaled;
  });
}

/** Width an element should occupy at a given viewport, honouring its % basis. */
function responsiveWidth(element, targetWidth) {
  const basis = Number(element.responsive?.width);
  if (Number.isFinite(basis) && basis > 0) {
    return Math.round((basis / 100) * targetWidth);
  }
  return Math.min(element.width, targetWidth - PAGE_SIDE_PADDING * 2);
}

/**
 * Build the element list to draw at a given viewport width.
 *
 * In automatic mode the flow is re-stacked with consistent spacing; in custom
 * mode the authored positions are kept and simply scaled. Either way the result
 * is clamped inside the safe area, so nothing spills off the page.
 */
export function layoutPage(page, targetWidth) {
  const settings = page?.pageSettings || DEFAULT_PAGE_SETTINGS;
  const visible = (page?.elements || []).filter((element) => element.isVisible !== false);
  const width = targetWidth || settings.width;

  if (settings.layoutMode === "auto") {
    let cursorY = PAGE_TOP_PADDING;
    return visible
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      .map((element) => {
        const boxWidth = Math.max(
          minSizeFor(element.type),
          Math.min(responsiveWidth(element, width), width - PAGE_SIDE_PADDING * 2),
        );
        const gap = element.type === "divider" ? 24 : 28;
        const next = {
          ...element,
          x: Math.round((width - boxWidth) / 2),
          y: Math.round(cursorY),
          width: Math.round(boxWidth),
        };
        cursorY += element.height + gap;
        return next;
      });
  }

  return reflowElements(visible, settings.width, width)
    .map((element) => {
      const boxWidth = Math.max(
        minSizeFor(element.type),
        Math.min(responsiveWidth(element, width), width - PAGE_SIDE_PADDING * 2),
      );
      return clampToSafeArea(
        { ...element, width: Math.round(boxWidth), x: Math.round(element.x * (width / settings.width)) },
        { ...page, pageSettings: { ...settings, width } },
      );
    });
}

/**
 * Move an element to a new place in the automatic stack.
 *
 * In automatic mode the flow owns the coordinates, so dragging there means
 * "put this one here in the list". `flow` is the laid-out element list the
 * canvas is drawing, so the rank is decided from the positions the user
 * actually sees; the result rewrites z-index, which is the order `layoutPage`
 * stacks in. Nothing is dropped and hidden elements keep their rank.
 */
export function reorderStack(elements, flow, movedId, targetY) {
  const list = elements || [];
  if (!movedId || !Number.isFinite(targetY)) return list;

  const order = (flow || []).map((element) => element.id).filter((id) => id !== movedId);
  if (!order.length) return list;

  const boxes = new Map((flow || []).map((element) => [element.id, element]));
  let insertAt = order.length;
  for (let index = 0; index < order.length; index += 1) {
    const box = boxes.get(order[index]);
    if (!box) continue;
    if (targetY < box.y + box.height / 2) {
      insertAt = index;
      break;
    }
  }
  order.splice(insertAt, 0, movedId);

  const rank = new Map(order.map((id, position) => [id, position]));
  return list.map((element) => (rank.has(element.id) ? { ...element, zIndex: rank.get(element.id) } : element));
}

export function normalizePage(raw, index = 0) {
  const settings = normalizePageSettings(raw?.pageSettings || raw?.page_settings);
  const elements = [...(raw?.elements || [])]
    .sort((a, b) => toFinite(a.zIndex ?? a.z_index, 0) - toFinite(b.zIndex ?? b.z_index, 0))
    .map((element, position) => normalizeElement(element, position));

  return {
    id: raw?.id ?? null,
    title: raw?.title || raw?.editor_label || `Page ${index + 1}`,
    pageSettings: settings,
    elements,
  };
}

/** API experience -> editor document. */
export function buildDocument(experience) {
  const steps = experience?.steps || [];
  const pages = steps.length
    ? steps.map((step, index) => normalizePage(step, index))
    : [createPage({ title: "Page 1" })];

  return {
    title: experience?.title || "Untitled",
    description: experience?.description || "",
    experienceType: experience?.experience_type || "journey",
    language: experience?.language || "en",
    status: experience?.status || "draft",
    slug: experience?.slug || "",
    version: experience?.version || 1,
    assets: experience?.assets || [],
    theme: experience?.theme || {},
    pages,
    connections: experience?.connections || [],
  };
}

/** Editor document -> API save payload. */
export function toPayload(document) {
  return {
    title: document.title,
    description: document.description,
    theme: document.theme,
    assets: document.assets,
    pages: document.pages.map((page, index) => ({
      id: page.id,
      title: page.title,
      stepType: "lesson",
      sortOrder: index,
      pageSettings: page.pageSettings,
      elements: page.elements.map((element, order) => ({
        element_uuid: element.id,
        type: element.type,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        zIndex: element.zIndex,
        sortOrder: order,
        content: element.content,
        style: element.style,
        isVisible: element.isVisible,
        isLocked: element.isLocked,
        isInteractive: element.isInteractive,
        sectionId: element.sectionId,
        accessibility: element.accessibility,
        actions: element.actions,
      })),
    })),
    connections: document.connections.map((link) => ({
      sourceStepId: link.sourceStepId,
      targetStepId: link.targetStepId,
      sourceElementId: link.sourceElementId ?? null,
      targetElementId: link.targetElementId ?? null,
      label: link.label || "",
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Geometry helpers (pure - no arrangement decisions)                   */
/* ------------------------------------------------------------------ */

export function boundsOf(element) {
  return {
    left: element.x,
    top: element.y,
    right: element.x + element.width,
    bottom: element.y + element.height,
    centerX: element.x + element.width / 2,
    centerY: element.y + element.height / 2,
  };
}

export function selectionBounds(elements) {
  if (!elements.length) return null;
  const boxes = elements.map(boundsOf);
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

const ALIGNMENT = {
  left: (box, frame) => frame.left - box.left,
  centerX: (box, frame) => frame.centerX - box.centerX,
  right: (box, frame) => frame.right - box.right,
  top: (box, frame) => frame.top - box.top,
  centerY: (box, frame) => frame.centerY - box.centerY,
  bottom: (box, frame) => frame.bottom - box.bottom,
};

/**
 * Move the given elements by an alignment offset. The caller decides when to
 * run this; the model never applies alignment on its own.
 */
export function alignElements(elements, mode, page) {
  const settings = page?.pageSettings || DEFAULT_PAGE_SETTINGS;
  const fullHeight = pageHeight(page);
  const frame = {
    left: 0,
    top: 0,
    right: settings.width,
    bottom: fullHeight,
    centerX: settings.width / 2,
    centerY: fullHeight / 2,
  };

  const shift = ALIGNMENT[mode];
  if (!shift) return elements;

  const horizontal = mode === "left" || mode === "right" || mode === "centerX";

  return elements.map((element) => {
    const delta = shift(boundsOf(element), frame);
    return horizontal
      ? { ...element, x: Math.round(element.x + delta) }
      : { ...element, y: Math.round(element.y + delta) };
  });
}

export function distributeElements(elements, axis) {
  if (elements.length < 3) return elements;
  const horizontal = axis === "horizontal";
  const key = horizontal ? "x" : "y";
  const extent = horizontal ? "width" : "height";

  const sorted = [...elements].sort((a, b) => a[key] - b[key]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[key] + last[extent] - first[key];
  const totalSize = sorted.reduce((sum, element) => sum + element[extent], 0);
  const gap = (span - totalSize) / (sorted.length - 1);

  const positions = new Map();
  let cursor = first[key];
  sorted.forEach((element) => {
    positions.set(element.id, Math.round(cursor));
    cursor += element[extent] + gap;
  });

  return elements.map((element) => ({ ...element, [key]: positions.get(element.id) ?? element[key] }));
}

/* ------------------------------------------------------------------ */
/* Z-order                                                             */
/* ------------------------------------------------------------------ */

/** Highest z-index in use, so newly inserted elements land on top. */
export function topZ(elements) {
  return elements.reduce((max, element) => Math.max(max, element.zIndex || 0), 0);
}

export function reorderZ(elements, ids, direction) {
  const target = new Set(ids);
  const ordered = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  const positions = ordered.map((element) => ordered.indexOf(element)).filter((index) => target.has(ordered[index].id));

  if (!positions.length) return elements;

  if (direction === "front" || direction === "back") {
    const moving = positions.map((index) => ordered[index]);
    const staying = ordered.filter((element) => !target.has(element.id));
    const next = direction === "front" ? [...staying, ...moving] : [...moving, ...staying];
    return assignZ(elements, next);
  }

  const step = direction === "forward" ? 1 : -1;
  const next = [...ordered];

  // Walk the selection in the direction of travel, swapping one slot at a time
  // so a multi-selection keeps its internal order.
  const indexes = step === 1 ? [...positions].sort((a, b) => a - b) : [...positions].sort((a, b) => b - a);
  indexes.forEach((index) => {
    const neighbour = index + step;
    if (neighbour < 0 || neighbour >= next.length) return;
    if (target.has(next[neighbour].id)) return;
    const swap = next[index];
    next[index] = next[neighbour];
    next[neighbour] = swap;
  });

  return assignZ(elements, next);
}

/** Write a freshly ordered list back onto the original elements. */
function assignZ(elements, ordered) {
  const zById = new Map(ordered.map((element, index) => [element.id, index]));
  return elements.map((element) => ({ ...element, zIndex: zById.get(element.id) ?? element.zIndex }));
}



/* ------------------------------------------------------------------ */
/* Snapping                                                            */
/* ------------------------------------------------------------------ */

export const SNAP_THRESHOLD = 6;

const nearest = (value, candidates, threshold) => {
  let best = null;
  let bestDistance = threshold;
  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate - value);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
};

/**
 * Snap a moving box to the grid, to the page edges/centre, and to the
 * edges/centres of the other elements.
 *
 * This is strictly advisory. The caller passes the live box and gets a
 * corrected box back; with every option disabled the element lands exactly
 * where the pointer released it, which is the whole point of the canvas.
 */
export function snapPosition({
  box,
  others = [],
  page,
  grid = DEFAULT_GRID,
  snapToGrid = true,
  snapToElements = true,
  threshold = SNAP_THRESHOLD,
}) {
  const settings = page?.pageSettings || DEFAULT_PAGE_SETTINGS;
  const fullHeight = pageHeight(page);
  const xTargets = [];
  const yTargets = [];

  if (snapToGrid && grid > 0) {
    for (let value = 0; value <= settings.width; value += grid) xTargets.push(value);
    for (let value = 0; value <= fullHeight; value += grid) yTargets.push(value);
  }

  if (snapToElements) {
    xTargets.push(0, settings.width / 2, settings.width);
    yTargets.push(0, fullHeight / 2);
    others.forEach((element) => {
      const box2 = boundsOf(element);
      xTargets.push(box2.left, box2.centerX, box2.right);
      yTargets.push(box2.top, box2.centerY, box2.bottom);
    });
  }

  const next = { ...box };
  const guides = [];

  // A single threshold budget is shared so a corner drag cannot snap on both
  // axes and drift further than the user expects.
  const snappedX = nearest(box.left, xTargets, threshold);
  if (snappedX !== null) {
    next.left = snappedX;
    guides.push({ axis: "x", value: snappedX, from: 0, to: fullHeight });
  }

  const snappedY = nearest(box.top, yTargets, threshold);
  if (snappedY !== null) {
    next.top = snappedY;
    guides.push({ axis: "y", value: snappedY, from: 0, to: settings.width });
  }

  return { box: next, guides };
}
