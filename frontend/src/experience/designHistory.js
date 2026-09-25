/**
 * Immutable design history.
 *
 * The canvas commits a snapshot when a *meaningful* edit finishes - not on
 * every pointer move. A drag therefore produces exactly one undo step, which is
 * why `begin` captures the "before" state and `commit` only records it if the
 * document actually differs.
 *
 * Snapshots are structured-cloned on the way in and out, so historical states
 * can never be mutated by later edits and redo always restores a real past
 * state rather than a live reference.
 */

const clone = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const fingerprint = (document) => {
  // Cheap, stable comparison key. Used to drop no-op commits (a click that
  // did not change anything should not fill the undo stack).
  try {
    return JSON.stringify({
      pages: document.pages.map((page) => [
        page.id,
        page.title,
        page.pageSettings,
        page.elements.map((element) => [
          element.id, element.x, element.y, element.width, element.height,
          element.rotation, element.zIndex, element.isVisible, element.isLocked,
          element.content, element.style, element.sectionId, element.actions,
        ]),
      ]),
      title: document.title,
      description: document.description,
      assets: document.assets,
    });
  } catch {
    // Circular data should never reach here, but a failing fingerprint must
    // not break editing - fall back to "always different".
    return null;
  }
};

export function createHistory(initialDocument, { limit = 80 } = {}) {
  let past = [];
  let present = initialDocument;
  let future = [];
  let pending = null;

  const notify = (listeners) => listeners?.();

  return {
    get present() {
      return present;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get depth() {
      return { past: past.length, future: future.length };
    },

    /** Replace the document without touching history (remote load, reset). */
    reset(document) {
      present = document;
      past = [];
      future = [];
      pending = null;
    },

    /**
     * Start an interaction. The snapshot taken here is what undo restores.
     * Nested begins reuse the outermost snapshot, so a drag that also nudges
     * a second element still yields a single undo step.
     */
    begin(document) {
      if (pending === null) {
        pending = { snapshot: clone(document), key: fingerprint(document) };
      }
      return pending;
    },

    /**
     * Finish an interaction. Pushes one snapshot if the document changed;
     * discards the transaction entirely when nothing moved.
     */
    commit(document, listeners) {
      if (pending === null) {
        this.record(document, listeners);
        return;
      }

      const before = pending;
      pending = null;

      const after = fingerprint(document);
      if (after !== null && after === before.key) {
        notify(listeners);
        return;
      }

      past.push(before.snapshot);
      if (past.length > limit) past.shift();
      future = [];
      present = document;
      notify(listeners);
    },

    /** Abort an interaction without recording anything. */
    abort(document, listeners) {
      pending = null;
      present = document;
      notify(listeners);
    },

    /** One-shot edit that needs no begin/commit pair. */
    record(document, listeners) {
      const key = fingerprint(document);
      if (key !== null && key === fingerprint(present)) {
        notify(listeners);
        return;
      }
      past.push(clone(present));
      if (past.length > limit) past.shift();
      future = [];
      present = document;
      notify(listeners);
    },

    undo() {
      if (!past.length) return present;
      future.push(clone(present));
      present = past.pop();
      pending = null;
      return present;
    },

    redo() {
      if (!future.length) return present;
      past.push(clone(present));
      present = future.pop();
      pending = null;
      return present;
    },

    /** True while a drag/resize transaction is open. */
    get isInteracting() {
      return pending !== null;
    },
  };
}
