import Login from "./pages/Login";
import Register from "./pages/Register";

import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

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

  const isAdmin = pathname.startsWith("/admin");

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

      {/* Public footer */}
      {!isAdmin && <Footer />}
    </>
  );
}