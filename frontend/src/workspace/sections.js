import {
  Blocks, BookOpen, Brain, CheckCircle2, GraduationCap, Library, Tags, Trash2, Users,
} from "lucide-react";

/* ==========================================================================
   The workspace rail, declared once.

   Every /admin route renders the same rail from this list, so an entry cannot
   be present on one screen and missing from another, and the active highlight
   means the same thing everywhere. It lives beside the frame rather than
   inside any one page for the same reason.
   ========================================================================== */

export const WORKSPACE_SECTIONS = [
  { id: "stories", label: "Stories", icon: BookOpen },
  { id: "approvals", label: "Approvals", icon: CheckCircle2 },
  // Resources, Practice and the Experience Builder each own a whole-document
  // studio with their own tabs, filters and preview, so they are routes rather
  // than panels of the console.
  { id: "resources", label: "Resources", icon: Library, href: "/admin/resources" },
  { id: "learn", label: "Learn", icon: GraduationCap },
  { id: "practice", label: "Practice", icon: Brain, href: "/admin/practice" },
  { id: "tags", label: "Topics", icon: Tags },
  { id: "users", label: "People", icon: Users },
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "experiences", label: "Experience Builder", icon: Blocks, href: "/admin/experience-builder" },
];

/** The console's own panels are addressed by ?section= so the rail can point
    at them with a real link from any workspace page, not just from /admin. */
export const panelHref = (id) => `/admin?section=${id}`;

/** The rail entry a given workspace path belongs to, for the highlight. */
export function sectionForPath(pathname) {
  const match = WORKSPACE_SECTIONS.find(
    (section) => section.href && pathname.startsWith(section.href),
  );
  return match ? match.id : null;
}