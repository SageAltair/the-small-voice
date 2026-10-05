import { useParams } from "react-router-dom";

import SettingsModal from "../settings/SettingsModal";
import SettingsPanel from "../settings/SettingsPanel";
import { DEFAULT_SECTION, sectionById } from "../settings/sections";

/**
 * The settings route.
 *
 * All it does is turn the URL's section into a section name and hand both to the
 * popup. Keeping it this thin is what makes the overlay reusable: the frame owns
 * the keyboard, the scrim and the close button, and the panel owns the content,
 * so either can be rendered on its own.
 */
export default function Settings() {
  const { section: routeSection } = useParams();

  // An unknown slug falls back rather than 404-ing: the rail and search both
  // link here, and a stale bookmark should still open something usable.
  const section = sectionById(routeSection) ? routeSection : DEFAULT_SECTION;

  return (
    <SettingsModal>
      <SettingsPanel section={section} />
    </SettingsModal>
  );
}