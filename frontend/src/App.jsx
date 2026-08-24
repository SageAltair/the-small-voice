import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Stories from "./pages/Stories";
import StoryDetail from "./pages/StoryDetail";
import Resources from "./pages/Resources";
import TagStories from "./pages/TagStories";
import NotFound from "./pages/NotFound";
import Admin from "./pages/AdminConsole";
import AdminStories from "./pages/AdminStories";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Give from "./pages/Give";
import Footer from "./components/Footer";
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
      <Navbar />

      <Routes>
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

        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/give" element={<Give />} />

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

        <Route
          path="/tags/:slug"
          element={<TagStories />}
        />

        <Route
          path="*"
          element={<NotFound />}
        />
      </Routes>
      {!isAdmin && <Footer />}
      </>
  );
}
