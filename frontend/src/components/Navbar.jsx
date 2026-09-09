import { useEffect, useRef, useState } from "react";

import { Link, NavLink } from "react-router-dom";
import { Menu, Moon, Settings, Sun, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import logoSymbol from "../assets/small-voice-symbol.svg";
import logoDark from "../assets/small-voice-dark-mode.svg";


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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setSettingsOpen(false);
      }
    }
    if (settingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [settingsOpen]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  function closeNav() {
    setMenuOpen(false);
  }

  return (
    <header className="navbar">
      <div className="container navbar-content">
        <Link to="/" className="logo">
          <img src={logoSymbol} alt="" aria-hidden="true" className="logo-image logo-image--light" />
          <img src={logoDark} alt="" aria-hidden="true" className="logo-image logo-image--dark" />
          <span>{t.siteName}</span>
        </Link>

        <button type="button" className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="main-navigation" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>

        <nav id="main-navigation" className={`main-nav ${menuOpen ? "open" : ""}`} aria-label="Main navigation">
          <NavLink to="/stories" onClick={closeNav}>
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

         <div className="nav-settings" ref={settingsRef}>
            <button type="button" className="settings-toggle"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              aria-label={settingsOpen ? "Close settings" : "Open settings"}
              title="Settings"
            >
              <Settings size={16} aria-hidden="true" />
            </button>
            {settingsOpen && <div className="settings-dropdown">
              <div className="settings-dropdown-section">
                <span className="settings-dropdown-label">{t.toggleTheme}</span>
                <button type="button" className="settings-dropdown-item" onClick={() => setTheme((currentTheme) => currentTheme === "light" ? "dark" : "light")}>
                  {theme === "light" ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
                  {theme === "light" ? t.dark : t.light}
                </button>
              </div>
              <div className="settings-dropdown-section">
                <span className="settings-dropdown-label">{t.language}</span>
                <select value={language} onChange={(event) => { setLanguage(event.target.value); setSettingsOpen(false); }} aria-label={t.language} className="settings-dropdown-select">
                  <option value="en">{t.english}</option>
                  <option value="sw">{t.swahili}</option>
                </select>
              </div>
            </div>}
          </div>
      </div>
    </header>
  );
}
