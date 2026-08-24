import Login from "./pages/Login";
import Register from "./pages/Register";
import AuthorDashboard from "./pages/AuthorDashboard";

import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { LogOut, Menu, Moon, Settings, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";

// Layout
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

// Public pages
import Home from "./pages/Home";
import Stories from "./pages/Stories";
import StoryDetail from "./pages/StoryDetail";
import Resources from "./pages/Resources";
import TagStories from "./pages/TagStories";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Give from "./pages/Give";
import NotFound from "./pages/NotFound";

// // Authentication
// import Login from "./pages/Login";
// import Register from "./pages/Register";

// Admin
import Admin from "./pages/AdminConsole";
import AdminStories from "./pages/AdminStories";

// Language
import { LanguageProvider } from "./i18n/LanguageContext";


export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AppLayout />
      </LanguageProvider>
    </BrowserRouter>
  );
}


function AppLayout() {
  const { pathname } = useLocation();

  const isAdmin = pathname.startsWith("/admin") || pathname.startsWith("/dashboard") || pathname.startsWith("/user/dashboard") || pathname === "/user-dashboard";

  return (
    <>
      {/* Public navigation */}
      {!isAdmin && <Navbar />}

      <main>
        <Routes>

          {/* =========================
              PUBLIC ROUTES
          ========================= */}

          <Route
            path="/"
            element={<Home />}
          />

          <Route
            path="/stories"
            element={<Stories />}
          />

          <Route
            path="/stories/:id"
            element={<StoryDetail />}
          />

          <Route
            path="/resources"
            element={<Resources />}
          />

          <Route
            path="/tags/:slug"
            element={<TagStories />}
          />

          <Route
            path="/about"
            element={<About />}
          />

          <Route
            path="/contact"
            element={<Contact />}
          />

          <Route
            path="/give"
            element={<Give />}
          />


          {/* =========================
              AUTHENTICATION ROUTES
          ========================= */}

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/register"
            element={<Register />}
          />

          <Route path="/dashboard" element={<AuthorDashboard />} />
          <Route path="/user/dashboard" element={<AuthorDashboard />} />
          <Route path="/user-dashboard" element={<Navigate to="/dashboard" replace />} />


          {/* =========================
              ADMIN ROUTES
          ========================= */}

          <Route
            path="/admin"
            element={<Admin />}
          />

          <Route
            path="/admin/dashboard"
            element={<Admin />}
          />

          <Route
            path="/admin/stories"
            element={<AdminStories />}
          />


          {/* =========================
              404
          ========================= */}

          <Route
            path="*"
            element={<NotFound />}
          />

        </Routes>
      </main>

      {isAdmin && <><WorkspaceThemeToggle /><WorkspaceMobileControls /></>}

      {/* Public footer */}
      {!isAdmin && <Footer />}
    </>
  );
}

function WorkspaceThemeToggle() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || document.documentElement.dataset.theme || "light");
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("theme", theme); }, [theme]);
  return <button className="workspace-theme-toggle" onClick={() => setTheme((current) => current === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title="Toggle light and dark mode">{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>;
}

function WorkspaceMobileControls() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || document.documentElement.dataset.theme || "light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(() => document.body.classList.contains("dashboard-menu-open"));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => () => document.body.classList.remove("dashboard-menu-open"), []);

  function toggleMenu() {
    const next = !menuOpen;
    document.body.classList.toggle("dashboard-menu-open", next);
    setMenuOpen(next);
    setSettingsOpen(false);
  }

  function closeMenu() {
    document.body.classList.remove("dashboard-menu-open");
    setMenuOpen(false);
  }

  return <div className="workspace-mobile-controls">
    <button className="workspace-mobile-button" onClick={toggleMenu} aria-label={menuOpen ? "Close workspace menu" : "Open workspace menu"}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
    <button className="workspace-mobile-button" onClick={() => { setSettingsOpen((open) => !open); closeMenu(); }} aria-label="Workspace settings"><Settings size={20} /></button>
    {settingsOpen && <section className="workspace-mobile-settings"><span>Workspace settings</span><button onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}{theme === "light" ? "Night mode" : "Light mode"}</button><button className="sign-out" onClick={() => { localStorage.removeItem("access_token"); window.location.assign("/"); }}><LogOut size={17} />Sign out</button></section>}
    {menuOpen && <button className="workspace-mobile-scrim" aria-label="Close workspace menu" onClick={closeMenu} />}
  </div>;
}
