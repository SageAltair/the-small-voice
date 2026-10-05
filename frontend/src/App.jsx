import Login from "./pages/Login";
import Register from "./pages/Register";
import GoogleAuthCallback from "./pages/GoogleAuthCallback";
import AuthorDashboard from "./pages/AuthorDashboard";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";

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

// Preferences: the single source for theme, density, motion and every other
// saved choice. It sits above the router so a change reaches pages that have
// not mounted yet.
import { PreferencesProvider, usePreferences } from "./settings/PreferencesContext";

// Public pages
import Home from "./pages/Home";
import Stories from "./pages/Stories";
import StoryDetail from "./pages/StoryDetail";
import Resources from "./pages/Resources";
import ResourceBrowse from "./pages/ResourceBrowse";
import ResourceDetail from "./pages/ResourceDetail";
import Journeys from "./pages/Journeys";
import Learn from "./pages/Learn";
import LearnPath from "./pages/LearnPath";
import LessonRunner from "./pages/LessonRunner";
import Practice from "./pages/Practice";
import PracticeSession from "./pages/PracticeSession";
import PracticeReview from "./pages/PracticeReview";
import PracticeAchievements from "./pages/PracticeAchievements";
import PracticeApplications from "./pages/PracticeApplications";
import PracticeSettings from "./pages/PracticeSettings";
import PracticeAdmin from "./pages/PracticeAdmin";
import PublicExperience from "./pages/PublicExperience";
import TagStories from "./pages/TagStories";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Give from "./pages/Give";
import NotFound from "./pages/NotFound";
// Aliased: lucide-react already exports an icon called Settings, which the
// workspace chrome below still uses.
import SettingsPage from "./pages/Settings";

// // Authentication
// import Login from "./pages/Login";
// import Register from "./pages/Register";

// Admin
import Admin from "./pages/AdminConsole";
import AdminStories from "./pages/AdminStories";
import ExperienceBuilder from "./pages/ExperienceBuilder";

// Language
import { LanguageProvider } from "./i18n/LanguageContext";

// Resources
import { AudioProvider } from "./resources/AudioPlayer";
import AudioMiniPlayer from "./resources/AudioMiniPlayer";
import AdminResources from "./pages/AdminResources";


export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        {/*
          The audio player sits above the router so the <audio> element is
          never unmounted by navigation - that is what lets a teaching keep
          playing while the reader browses to a related resource.
        */}
        <AudioProvider>
          <PreferencesProvider>
            <AppLayout />
          </PreferencesProvider>
        </AudioProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}


function AppLayout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

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

          {/*
            Resources discovery and detail. `/resources/browse` is declared
            before `/resources/:type` so a shared "browse" link is not read as
            a resource type called "browse".
          */}
          <Route
            path="/resources/browse"
            element={<ResourceBrowse />}
          />

          <Route
            path="/resources/:type"
            element={<ResourceBrowse />}
          />

          <Route
            path="/resources/:type/:slug"
            element={<ResourceDetail />}
          />

          <Route
            path="/journeys"
            element={<Journeys />}
          />

          <Route
            path="/journeys/:slug"
            element={<PublicExperience />}
          />

          <Route
            path="/learn"
            element={<Learn />}
          />

          <Route
            path="/learn/paths/:pathSlug"
            element={<LearnPath />}
          />

          <Route
            path="/learn/lesson/:lessonId"
            element={<LessonRunner />}
          />

          {/* Practice: active recall, spaced repetition and real-life
              application. Signed out by default - progress is keyed to the
              browser and folds into the account on sign-in. */}

          <Route
            path="/practice"
            element={<Practice />}
          />

          <Route
            path="/practice/session/:sessionId"
            element={<PracticeSession />}
          />

          <Route
            path="/practice/review"
            element={<PracticeReview />}
          />

          <Route
            path="/practice/achievements"
            element={<PracticeAchievements />}
          />

          <Route
            path="/practice/challenges"
            element={<PracticeApplications />}
          />

          <Route
            path="/practice/settings"
            element={<PracticeSettings />}
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

          <Route
            path="/privacy-policy"
            element={<PrivacyPolicy />}
          />

          <Route
            path="/terms-of-use"
            element={<TermsOfUse />}
          />

          {/* Settings owns its own sections rather than one long page, so a
              section can be linked to, bookmarked and reached with the back
              button. /settings alone opens the first section. */}
          <Route
            path="/settings"
            element={<SettingsPage />}
          />

          <Route
            path="/settings/:section"
            element={<SettingsPage />}
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

          <Route
            path="/auth/google"
            element={<GoogleAuthCallback />}
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

          {/* The Resources studio is a full-page workspace like Practice, so
              it owns its own route rather than being a panel in the CMS. */}
          <Route
            path="/admin/resources"
            element={<AdminResources />}
          />

          {/* The Practice studio is a full-screen authoring tool, like the Experience
              Builder: it owns its own tabs, filters and preview. */}

          <Route
            path="/admin/practice"
            element={<PracticeAdmin />}
          />

          <Route
            path="/admin/experience-builder"
            element={<ExperienceBuilder />}
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

      {/* The mini-player follows the reader across the public site. */}
      {!isAdmin && <AudioMiniPlayer />}

      {/* Public footer */}
      {!isAdmin && <Footer />}
    </>
  );
}

/* The admin workspace keeps its own chrome - a full-page authoring tool rather
   than the public site - but its theme switch is the same preference everyone
   else uses, so switching themes inside the workspace and then leaving it does
   not snap back. */
function WorkspaceThemeToggle() {
  const { setPreference, resolvedTheme } = usePreferences();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      className="workspace-theme-toggle"
      onClick={() => setPreference("appearance.theme", isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title="Toggle light and dark mode"
    >
      {isDark ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}

function WorkspaceMobileControls() {
  const { preferences, setPreference, resolvedTheme } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(() => document.body.classList.contains("dashboard-menu-open"));

  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (!menuOpen) return undefined;

    function closeMenu() {
      document.body.classList.remove("dashboard-menu-open");
    }

    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [menuOpen]);

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
    {settingsOpen && <section className="workspace-mobile-settings"><span>Workspace settings</span><button onClick={() => setPreference("appearance.theme", isDark ? "light" : "dark")}>{isDark ? <Moon size={17} /> : <Sun size={17} />}{isDark ? "Night mode" : "Light mode"}</button><button className="sign-out" onClick={() => { localStorage.removeItem("access_token"); window.location.assign("/"); }}><LogOut size={17} />Sign out</button><p>Theme: {preferences.appearance.theme}</p></section>}
    {menuOpen && <button className="workspace-mobile-scrim" aria-label="Close workspace menu" onClick={closeMenu} />}
  </div>;
}
