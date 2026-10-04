import { X } from "lucide-react";

/**
 * Preview, using the public viewer itself.
 *
 * Not a second, approximate rendering. The one thing an administrator most
 * needs from a preview is the answer to "is this what a visitor will see?", and
 * that question can only be answered by the real viewer fed the real object.
 * A draft is never reachable through the public API, so this renders the
 * in-editor draft rather than fetching it - which also means it works before
 * anything has been saved.
 */

import ResourceViewer from "../ResourceViewer";

export default function ResourcePreview({ copy, resource, onClose }) {
  return (
    <div
      className="res-preview"
      role="dialog"
      aria-modal="true"
      aria-label={copy.previewTitle}
    >
      <div className="res-preview-bar">
        <strong>{copy.previewTitle}</strong>
        <p>{copy.previewNote}</p>
        <button
          type="button"
          className="res-icon-btn"
          onClick={onClose}
          aria-label={copy.close}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="res-preview-body">
        <ResourceViewer resource={resource} />
      </div>
    </div>
  );
}