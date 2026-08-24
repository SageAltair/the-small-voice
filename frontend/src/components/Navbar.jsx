import { useEffect, useState } from "react";

import { Link, NavLink } from "react-router-dom";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";


export default function Navbar() {
  const { language, setLanguage, t } = useLanguage();
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme) return savedTheme;

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <header className="navbar">
      <div className="container navbar-content">
        <Link
          to="/"
          className="logo"
        >
          {t.siteName}
        </Link>

        <button type="button" className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="main-navigation" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>

        <nav id="main-navigation" className={`main-nav ${menuOpen ? "open" : ""}`} aria-label="Main navigation">
          <NavLink to="/stories" onClick={() => setMenuOpen(false)}>
            {t.stories}
          </NavLink>

          <NavLink to="/resources" onClick={() => setMenuOpen(false)}>
            {t.resources}
          </NavLink>

          <NavLink to="/about" onClick={() => setMenuOpen(false)}>
            {t.about}
          </NavLink>

          <NavLink to="/contact" onClick={() => setMenuOpen(false)}>
            {t.contact}
          </NavLink>

          <NavLink to="/give" onClick={() => setMenuOpen(false)}>
            {t.give}
          </NavLink>

        </nav>

        <label className="language-switcher">
          <span className="sr-only">{t.language}</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t.language}>
            <option value="en">{t.english}</option>
            <option value="sw">{t.swahili}</option>
          </select>
        </label>

        <button type="button" className="theme-toggle"
          onClick={() => setTheme((currentTheme) =>
            currentTheme === "light" ? "dark" : "light")}
          aria-label={t.switchToMode.replace("{mode}", theme === "light" ? t.dark : t.light)}
          title={t.toggleTheme}
        >
          {theme === "light" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
