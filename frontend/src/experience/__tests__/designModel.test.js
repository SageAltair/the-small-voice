import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SETTINGS, PAGE_PRESETS, alignElements, buildDocument, createElement,
  createPage, distributeElements, normalizeElement, normalizePageSettings, pageHeight,
  reorderZ, selectionBounds, snapPosition, toPayload, topZ,
} from "../designModel.js";

/**
 * These tests encode the guarantees the canvas is supposed to provide:
 * elements stay where they are put, page size is controllable, endless pages
 * grow, and z-order/alignment only change when explicitly asked.
 */

const box = (x, y, width = 100, height = 50, zIndex = 0, id = `e${x}-${y}`) => ({
  id, x, y, width, height, rotation: 0, zIndex, content: {}, style: {}, isVisible: true,
  isLocked: false, isInteractive: false, sectionId: "", accessibility: {}, actions: [],
});

describe("page settings", () => {
  it("defaults to a fixed 1080x1920 page", () => {
    const settings = normalizePageSettings({});
    expect(settings.width).toBe(DEFAULT_PAGE_SETTINGS.width);
    expect(settings.height).toBe(DEFAULT_PAGE_SETTINGS.height);
    expect(settings.layoutMode).toBe("fixed");
  });

  it("honours custom dimensions", () => {
    const settings = normalizePageSettings({ width: 1080, height: 1920 });
    expect(settings.width).toBe(1080);
    expect(settings.height).toBe(1920);
  });

  it("keeps a preset's own dimensions", () => {
    const preset = PAGE_PRESETS.find((entry) => entry.id === "desktop");
    const settings = normalizePageSettings({ preset: "desktop", width: preset.width, height: preset.height, orientation: preset.orientation });
    expect(settings.width).toBe(1440);
    expect(settings.height).toBe(900);
    expect(settings.width).toBeGreaterThan(settings.height);
  });

  it("never rewrites dimensions the user typed", () => {
    // A landscape-shaped page entered without an explicit orientation must be
    // stored exactly as typed, not silently rotated.
    const settings = normalizePageSettings({ width: 1000, height: 800 });
    expect(settings.width).toBe(1000);
    expect(settings.height).toBe(800);
  });

  it("clamps absurd values instead of storing them", () => {
    const settings = normalizePageSettings({ width: 999999, height: -20 });
    expect(settings.width).toBeLessThanOrEqual(12000);
    expect(settings.height).toBeGreaterThanOrEqual(200);
  });

  it("rejects an unknown layout mode", () => {
    expect(normalizePageSettings({ layoutMode: "banana" }).layoutMode).toBe("fixed");
  });
});

describe("free positioning", () => {
  it("creates an element at the requested coordinates", () => {
    const element = createElement("heading", { x: 120, y: 300 });
    expect(element.x).toBe(120);
    expect(element.y).toBe(300);
  });

  it("does not move sibling elements when a new one is added", () => {
    const a = box(10, 20, 100, 50, 0, "a");
    const b = box(200, 400, 100, 50, 1, "b");
    const added = createElement("button", { x: 50, y: 50, zIndex: topZ([a, b]) + 1 });

    const after = [...[a, b], added];
    const foundA = after.find((item) => item.id === "a");
    const foundB = after.find((item) => item.id === "b");

    expect(foundA.x).toBe(10);
    expect(foundA.y).toBe(20);
    expect(foundB.x).toBe(200);
    expect(foundB.y).toBe(400);
  });

  it("keeps an element exactly where it was dropped when snapping is off", () => {
    const page = createPage({});
    const boxIn = { left: 137, top: 213, width: 100, height: 50 };
    const result = snapPosition({ box: boxIn, page, snapToGrid: false, snapToElements: false });
    expect(result.box.left).toBe(137);
    expect(result.box.top).toBe(213);
  });

  it("snaps to the page centre when snapping is on", () => {
    const page = createPage({ pageSettings: { width: 1000, height: 1000 } });
    const result = snapPosition({
      box: { left: 497, top: 300, width: 100, height: 50 },
      others: [],
      page,
      snapToGrid: false,
      snapToElements: true,
    });
    expect(result.box.left).toBe(500);
  });
});

describe("page height", () => {
  it("is exactly the declared height for a fixed page", () => {
    const page = createPage({ pageSettings: { width: 1000, height: 800, layoutMode: "fixed" } });
    page.elements = [box(0, 0, 100, 50), box(0, 2000, 100, 50)];
    expect(pageHeight(page)).toBe(800);
  });

  it("grows for an endless page with no artificial cap", () => {
    const page = createPage({ pageSettings: { width: 1000, height: 800, layoutMode: "endless" } });
    page.elements = [box(0, 0, 100, 50), box(0, 5000, 100, 50)];
    expect(pageHeight(page)).toBeGreaterThanOrEqual(5050);
  });

  it("never shrinks an endless page below its declared height", () => {
    const page = createPage({ pageSettings: { width: 1000, height: 800, layoutMode: "endless" } });
    page.elements = [box(0, 0, 100, 50)];
    expect(pageHeight(page)).toBe(800);
  });

  it("ignores hidden elements when measuring", () => {
    const page = createPage({ pageSettings: { width: 1000, height: 800, layoutMode: "endless" } });
    page.elements = [box(0, 0, 100, 50), { ...box(0, 4000, 100, 50), isVisible: false }];
    expect(pageHeight(page)).toBe(800);
  });
});

describe("alignment, distribution and z-order", () => {
  const page = createPage({ pageSettings: { width: 1000, height: 1000 } });

  it("does not move anything until align is explicitly called", () => {
    const elements = [box(10, 10, 100, 50, 0, "a"), box(300, 400, 100, 50, 1, "b")];
    const untouched = elements.map((element) => ({ ...element }));
    expect(elements).toEqual(untouched);
  });

  it("aligns left to the page edge", () => {
    const elements = [box(400, 10, 100, 50, 0, "a")];
    const [aligned] = alignElements(elements, "left", page);
    expect(aligned.x).toBe(0);
  });

  it("aligns centre to the page centre", () => {
    const elements = [box(0, 10, 100, 50, 0, "a")];
    const [aligned] = alignElements(elements, "centerX", page);
    expect(aligned.x).toBe(450);
  });

  it("aligns right to the page edge", () => {
    const elements = [box(0, 10, 100, 50, 0, "a")];
    const [aligned] = alignElements(elements, "right", page);
    expect(aligned.x).toBe(900);
  });

  it("aligns top to the page top", () => {
    const elements = [box(10, 600, 100, 50, 0, "a")];
    const [aligned] = alignElements(elements, "top", page);
    expect(aligned.y).toBe(0);
  });

  it("ignores an unknown alignment mode", () => {
    const elements = [box(400, 10, 100, 50, 0, "a")];
    expect(alignElements(elements, "diagonal", page)).toBe(elements);
  });

  it("distributes three elements evenly between the outer two", () => {
    // Outer edges are 0 and 900; three 100px boxes leave two 300px gaps.
    const elements = [box(0, 0, 100, 50, 0, "a"), box(200, 0, 100, 50, 1, "b"), box(800, 0, 100, 50, 2, "c")];
    const result = distributeElements(elements, "horizontal");
    const positions = result.map((element) => element.x);
    expect(positions).toEqual([0, 400, 800]);
  });

  it("refuses to distribute fewer than three elements", () => {
    const elements = [box(0, 0, 100, 50, 0, "a"), box(200, 0, 100, 50, 1, "b")];
    expect(distributeElements(elements, "horizontal")).toBe(elements);
  });

  it("sends an element to the very back", () => {
    const elements = [box(0, 0, 100, 50, 0, "a"), box(0, 0, 100, 50, 1, "b"), box(0, 0, 100, 50, 2, "c")];
    const result = reorderZ(elements, ["b"], "back");
    const byId = Object.fromEntries(result.map((element) => [element.id, element.zIndex]));
    expect(byId.b).toBe(0);
    expect(byId.c).toBe(2);
  });

  it("brings an element to the very front", () => {
    const elements = [box(0, 0, 100, 50, 0, "a"), box(0, 0, 100, 50, 1, "b"), box(0, 0, 100, 50, 2, "c")];
    const result = reorderZ(elements, ["a"], "front");
    const byId = Object.fromEntries(result.map((element) => [element.id, element.zIndex]));
    // The stack is renumbered so zIndex stays a dense 0..n-1 ordering.
    expect(byId.a).toBe(2);
    expect(byId.b).toBe(0);
    expect(byId.c).toBe(1);
  });

  it("steps an element forward one slot", () => {
    const elements = [box(0, 0, 100, 50, 0, "a"), box(0, 0, 100, 50, 1, "b"), box(0, 0, 100, 50, 2, "c")];
    const result = reorderZ(elements, ["b"], "forward");
    const byId = Object.fromEntries(result.map((element) => [element.id, element.zIndex]));
    expect(byId.a).toBe(0);
    expect(byId.b).toBe(2);
    expect(byId.c).toBe(1);
  });
});

describe("selection bounds", () => {
  it("covers every selected element", () => {
    const bounds = selectionBounds([box(100, 100, 50, 50, 0, "a"), box(400, 300, 50, 50, 1, "b")]);
    expect(bounds.left).toBe(100);
    expect(bounds.top).toBe(100);
    expect(bounds.right).toBe(450);
    expect(bounds.bottom).toBe(350);
  });

  it("returns null for an empty selection", () => {
    expect(selectionBounds([])).toBeNull();
  });
});

describe("migration from the old nested element shape", () => {
  it("reads position/size when x/y/width are absent", () => {
    const element = normalizeElement({
      element_uuid: "legacy-1",
      element_type: "heading",
      position: { x: 40, y: 80 },
      size: { width: 300, height: 120 },
      content: { text: "Old design" },
    });
    expect(element.x).toBe(40);
    expect(element.y).toBe(80);
    expect(element.width).toBe(300);
    expect(element.height).toBe(120);
    expect(element.id).toBe("legacy-1");
  });

  it("round-trips a saved document through the API payload", () => {
    const source = {
      id: 7,
      title: "Round trip",
      experience_type: "journey",
      language: "en",
      status: "draft",
      version: 2,
      assets: [],
      steps: [
        {
          id: 11,
          title: "Page 1",
          page_settings: { width: 1080, height: 1920, layoutMode: "fixed", background: "#ffffff" },
          elements: [
            {
              element_uuid: "el-a",
              element_type: "heading",
              x: 100, y: 200, width: 640, height: 96, rotation: 12, z_index: 3,
              content: { text: "Hello" }, style: { fontSize: 48 },
              is_visible: true, is_locked: false, is_interactive: false,
              actions: [],
            },
          ],
        },
      ],
      connections: [],
    };

    const document = buildDocument(source);
    expect(document.pages[0].pageSettings.width).toBe(1080);
    expect(document.pages[0].elements[0].rotation).toBe(12);
    expect(document.pages[0].elements[0].zIndex).toBe(3);

    const payload = toPayload(document);
    expect(payload.pages).toHaveLength(1);
    expect(payload.pages[0].id).toBe(11);
    expect(payload.pages[0].elements[0].element_uuid).toBe("el-a");
    expect(payload.pages[0].elements[0].x).toBe(100);
    expect(payload.pages[0].elements[0].rotation).toBe(12);
  });

  it("always produces at least one page", () => {
    expect(buildDocument(null).pages).toHaveLength(1);
  });
});
