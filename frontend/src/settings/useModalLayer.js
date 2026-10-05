import { useEffect, useRef } from "react";

/**
 * What every overlay on this site has to do, in one place.
 *
 * There are two of them - the settings panel and the confirmation dialog - and
 * getting either half right on its own is how a popup ends up trapping the
 * keyboard or letting the page behind it scroll. So both use this:
 *
 *   1. Focus moves into the overlay when it opens and back to whatever opened it
 *      when it closes. A cancelled dialog that dumps you at the top of the page
 *      is the thing people remember.
 *   2. Tab cycles inside. There is no way out except forward, Escape, or the
 *      buttons inside.
 *   3. Escape asks the overlay to close.
 *   4. The page underneath stops scrolling and is marked `inert`, so a
 *      screen reader cannot wander into it and a click cannot land on it.
 *
 * The overlay must be rendered into document.body for (4) to work, which is what
 * `createPortal` is for in both callers.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Overlays stack: the reset confirmation opens on top of the settings popup.
 *
 * Two things follow from that, and both are handled by one list rather than by
 * each overlay acting as if it were alone:
 *
 *   - The page underneath is locked once, not once per overlay, so closing the
 *     confirmation does not hand the page back while the popup is still open.
 *   - Only the topmost overlay answers Escape. Otherwise Escape on a
 *     confirmation closes the popup underneath it and leaves the confirmation
 *     floating over nothing.
 */
const stack = [];
let savedOverflow = "";

function openLayer() {
  const id = Symbol("overlay");
  const root = document.getElementById("root");

  if (stack.length === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-hidden", "true");
  }

  stack.push(id);

  return () => {
    const at = stack.indexOf(id);
    if (at !== -1) stack.splice(at, 1);
    if (stack.length > 0) return;

    document.body.style.overflow = savedOverflow;
    root?.removeAttribute("inert");
    root?.removeAttribute("aria-hidden");
  };
}

/**
 * @param {boolean} active       whether the overlay is open
 * @param {object}  options
 * @param {Function} options.onEscape  called when Escape is pressed
 * @param {string}  options.label      accessible name, read out as the dialog title
 */
export function useModalLayer(active, { onEscape, label }) {
  const panelRef = useRef(null);
  const previousFocus = useRef(null);

  /* Escape is read through a ref so that the handler can be registered once.
     If this effect depended on the caller's onEscape, every re-render of the
     owner - and opening a different section is a re-render - would tear the
     focus trap down and rebuild it, stealing focus back from whatever the
     overlay had just put focus on. */
  const escapeRef = useRef(onEscape);

  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return undefined;

    const panel = panelRef.current;

    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    /* Inert rather than aria-hidden alone: inert also takes the page out of the
       tab order, which is what stops Tab escaping past the overlay on a browser
       that does not support it. aria-hidden is the belt to that pair of braces. */
    const releaseLayer = openLayer();
    const myId = stack[stack.length - 1];

    /* Focus the panel itself rather than a control inside it. On a confirmation
       this is deliberate: the first focusable thing is Cancel, and the second
       one destroys something, and a dialog that opens with the destructive
       button under the reader's thumb is a trap with better typography. */
    if (panel) {
      if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
      panel.focus({ preventScroll: true });
    }

    function handleKeyDown(event) {
      // Only the overlay on top answers the keyboard. A confirmation opened over
      // the settings popup takes Escape first, and the popup waits its turn.
      if (stack[stack.length - 1] !== myId) return;

      if (event.key === "Escape") {
        event.stopPropagation();
        escapeRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const scope = panelRef.current;
      if (!scope) return;

      const focusable = Array.from(scope.querySelectorAll(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || current === scope)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      releaseLayer();

      // Handing focus back is what makes closing feel like nothing happened.
      if (previousFocus.current?.isConnected) {
        previousFocus.current.focus({ preventScroll: true });
      }
    };
  }, [active, label]);

  return panelRef;
}