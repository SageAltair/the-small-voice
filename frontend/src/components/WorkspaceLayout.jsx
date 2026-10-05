import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, LogOut } from "lucide-react";
import BrandMark from "./BrandMark";
import { WORKSPACE_SECTIONS, panelHref, sectionForPath } from "../workspace/sections";

/* ==========================================================================
   The workspace frame.

   Every /admin route - the console and the studios that own their own routes -
   renders inside this one shell. Before it existed each of those routes drew
   its own full-screen page with its own gutter, its own heading and (in the
   builder's case) the public site's palette, so leaving one felt like leaving
   the site. Sharing the frame is what makes them read as one workspace. The
   rail itself is declared in workspace/sections.js, beside the frame rather
   than inside any one page, for the same reason.
   ========================================================================== */

/** Badge counts are the console's business; studios that do not fetch them
    simply render no badge rather than a different-looking zero. */
export default function WorkspaceLayout({
  active,
  counts = {},
  flush = false,
  onNavigate,
  children,
}) {
  const { pathname } = useLocation();

  // Navigating from the mobile drawer has to close it. The links are real
  // anchors, so the page no longer reloads and the open class would survive
  // the click - which is how a drawer used to hang around over the new page.
  useEffect(() => {
    document.body.classList.remove("dashboard-menu-open");
  }, [pathname]);

  // A page that owns panels (the console) says which one is showing; a studio
  // on its own route is whatever the path says it is.
  const current = active || sectionForPath(pathname);

  return (
    <main className={`admin-shell${flush ? " admin-shell--flush" : ""}`}>
      <aside className="cms-sidebar">
        <Link className="cms-brand" to="/">
          <BrandMark />
          <span>The Small Voice</span>
        </Link>
        <span className="cms-nav-label">Workspace</span>
        <nav className="cms-nav">
          {WORKSPACE_SECTIONS.map(({ id, label, icon: Icon, href }) => {
            const count = counts[id];
            return (
              <Link
                key={id}
                className={current === id ? "active" : ""}
                to={href || panelHref(id)}
                onClick={onNavigate}
              >
                <Icon size={18} />
                <span>{label}</span>
                {count === null || count === undefined ? null : <b>{count}</b>}
              </Link>
            );
          })}
        </nav>
        <div className="cms-sidebar-footer">
          <a href="/" target="_blank" rel="noreferrer">
            View website <ChevronRight size={15} />
          </a>
          <button onClick={() => { localStorage.removeItem("access_token"); window.location.assign("/"); }}>
            <LogOut size={16} />Sign out
          </button>
        </div>
      </aside>
      <section className="cms-workspace">{children}</section>
    </main>
  );
}