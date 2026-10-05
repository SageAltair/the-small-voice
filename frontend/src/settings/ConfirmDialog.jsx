import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

import { useModalLayer } from "./useModalLayer";

/**
 * The confirmation used before anything a person would not want to do by
 * accident.
 *
 * It shares useModalLayer with the settings popup, which is the point: focus
 * trapping, Escape, the page behind going inert and focus coming back are the
 * same four behaviours every dialog has to get right, and they are far easier to
 * get right once, than twice.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  keeps,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) {
  const panelRef = useModalLayer(open, { onEscape: onCancel, label: title });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-body"
        ref={panelRef}
      >
        <h2 id="dialog-title">
          <AlertTriangle size={18} aria-hidden="true" />
          {title}
        </h2>

        <p id="dialog-body">{body}</p>

        {keeps ? (
          <p className="dialog-keeps">
            <strong>{keeps}</strong>
          </p>
        ) : null}

        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="button danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}