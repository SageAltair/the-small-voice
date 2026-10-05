import { useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";

import { useLanguage } from "../i18n/LanguageContext";
import { useModalLayer } from "./useModalLayer";

/**
 * The settings popup.
 *
 * Settings is somewhere a reader drops into and drops out of, not somewhere
 * they live - the whole thing is an overlay on whatever they were reading, so
 * the gear never costs them their place.
 *
 * Three ways out, all deliberate: Escape, the scrim, and the close button. And
 * one way to be sure nothing is lost: the panel has a URL. `/settings` opens it
 * and `/settings/appearance` opens it on one section, so the back button closes
 * it, a section can be linked to, and a bookmark still lands on real settings
 * rather than a dead overlay.
 *
 * It renders through a portal onto document.body so the page behind it can be
 * marked inert - see useModalLayer.
 */
export default function SettingsModal({ children }) {
  const { t } = useLanguage();
  const copy = t.settings;
  const navigate = useNavigate();
  const location = useLocation();

  /* Closing should return the reader to where they were. When the panel was
     opened by a click there is history to go back to; when it was loaded
     straight from a link there is not, and going home is the honest answer. */
  const close = useCallback(() => {
    navigate(location.state?.from ?? -1);
  }, [location.state, navigate]);

  const panelRef = useModalLayer(true, { onEscape: close, label: copy.title });

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="settings-scrim"
      onMouseDown={(event) => {
        // Only a press that both starts and ends on the scrim closes it, so a
        // drag that ends outside the panel does not throw away a half-read
        // setting.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        ref={panelRef}
      >
        <header className="settings-modal-head">
          <div className="settings-modal-title">
            <p className="eyebrow">{copy.navLabel}</p>
            <h2 id="settings-modal-title">{copy.title}</h2>
          </div>

          <button
            type="button"
            className="settings-modal-close"
            onClick={close}
          >
            <X size={16} aria-hidden="true" />
            {copy.actions.close}
          </button>
        </header>

        {children}
      </div>
    </div>,
    document.body,
  );
}