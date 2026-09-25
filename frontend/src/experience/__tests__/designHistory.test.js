import { describe, expect, it } from "vitest";
import { createHistory } from "../designHistory.js";

/**
 * Undo/redo must restore complete states and must collapse a whole drag into
 * a single entry - the failure mode this file exists to prevent is hundreds of
 * undo steps for one pointer gesture.
 */

const doc = (value) => ({ title: "T", description: "", assets: [], pages: [{ id: 1, title: "P1", pageSettings: {}, elements: [{ id: "a", x: value, y: 0, width: 10, height: 10, content: {}, style: {}, actions: [] }] }] });

describe("undo / redo", () => {
  it("starts with nothing to undo or redo", () => {
    const history = createHistory(doc(0));
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("undoes a single recorded edit", () => {
    const history = createHistory(doc(0));
    history.record(doc(100));
    expect(history.present.pages[0].elements[0].x).toBe(100);

    const undone = history.undo();
    expect(undone.pages[0].elements[0].x).toBe(0);
    expect(history.canRedo).toBe(true);
  });

  it("restores the undone state on redo", () => {
    const history = createHistory(doc(0));
    history.record(doc(100));
    history.undo();
    const redone = history.redo();
    expect(redone.pages[0].elements[0].x).toBe(100);
    expect(history.canRedo).toBe(false);
  });

  it("collapses a whole drag into exactly one undo entry", () => {
    const history = createHistory(doc(0));

    // This is exactly what the canvas does: pointerdown calls `begin` with the
    // pre-drag document, every pointer move calls `begin` again with the newer
    // one, and release calls `commit` once. Only the outermost begin may capture
    // a snapshot, so 200 moves must still be a single undo step.
    history.begin(doc(0));
    for (let step = 1; step <= 200; step += 1) {
      history.begin(doc(step));
    }
    history.commit(doc(200));

    expect(history.depth.past).toBe(1);
    expect(history.present.pages[0].elements[0].x).toBe(200);
    expect(history.undo().pages[0].elements[0].x).toBe(0);
  });

  it("keeps the pre-drag snapshot even when begin is called repeatedly", () => {
    const history = createHistory(doc(0));
    history.begin(doc(0));
    history.begin(doc(50));
    history.begin(doc(120));
    history.commit(doc(200));
    expect(history.undo().pages[0].elements[0].x).toBe(0);
  });

  it("restores size, rotation and z-index on undo", () => {
    const rich = (x) => ({
      title: "T",
      description: "",
      assets: [],
      pages: [{
        id: 1,
        title: "P1",
        pageSettings: { width: 1000, height: 1000, layoutMode: "fixed" },
        elements: [{
          id: "a", x, y: 40, width: 300, height: 200, rotation: 15, zIndex: 2,
          content: { text: "Hi" }, style: { fontSize: 40 }, actions: [],
        }],
      }],
    });

    const history = createHistory(rich(0));
    history.record(rich(250));
    const restored = history.undo();
    const element = restored.pages[0].elements[0];

    expect(element.x).toBe(0);
    expect(element.width).toBe(300);
    expect(element.rotation).toBe(15);
    expect(element.zIndex).toBe(2);
  });

  it("discards a transaction that changed nothing", () => {
    const history = createHistory(doc(0));
    history.begin(doc(0));
    history.commit(doc(0));
    expect(history.depth.past).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it("ignores a record that does not change the document", () => {
    const history = createHistory(doc(0));
    history.record(doc(0));
    expect(history.depth.past).toBe(0);
  });

  it("clears the redo stack once a new edit is made", () => {
    const history = createHistory(doc(0));
    history.record(doc(50));
    history.undo();
    expect(history.canRedo).toBe(true);

    history.record(doc(999));
    expect(history.canRedo).toBe(false);
  });

  it("keeps a deep undo stack intact", () => {
    const history = createHistory(doc(0));
    for (let step = 1; step <= 20; step += 1) history.record(doc(step * 10));
    expect(history.depth.past).toBe(20);

    for (let step = 0; step < 20; step += 1) history.undo();
    expect(history.present.pages[0].elements[0].x).toBe(0);
  });

  it("honours the history limit", () => {
    const history = createHistory(doc(0), { limit: 5 });
    for (let step = 1; step <= 12; step += 1) history.record(doc(step));
    expect(history.depth.past).toBe(5);
  });

  it("does not let later edits mutate a historical snapshot", () => {
    const history = createHistory(doc(0));
    history.record(doc(100));
    const beforeUndo = history.present;

    // Mutating the live document in place must not corrupt the stored past.
    history.record(doc(300));
    expect(beforeUndo.pages[0].elements[0].x).toBe(100);
    expect(history.undo().pages[0].elements[0].x).toBe(100);
  });

  it("reset clears both stacks", () => {
    const history = createHistory(doc(0));
    history.record(doc(50));
    history.reset(doc(10));
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.present.pages[0].elements[0].x).toBe(10);
  });

  it("is a no-op when undoing an empty stack", () => {
    const history = createHistory(doc(0));
    expect(history.undo().pages[0].elements[0].x).toBe(0);
  });
});
