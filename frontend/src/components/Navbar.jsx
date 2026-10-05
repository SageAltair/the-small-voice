import { useEffect, useRef, useState } from "react";

import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDown, Menu, Settings, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import logoSymbol from "../assets/small-voice-symbol.svg";
import logoDark from "../assets/small-voice-dark-mode.svg";


export default function Navbar() {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const learnRef = useRef(null);
  const { pathname } = useLocation();

  /* The menu is open only while the route is the one it was opened on. Storing
     the route rather than a boolean is what closes it on navigation - including
     the browser's back button, which no click handler ever sees - without a
     setState inside an effect. */
  const [openedOn, setOpenedOn] = useState(null);
  const learnOpen = openedOn === pathname;

  const openLearn = () => setOpenedOn(pathname);
  const closeLearn = () => setOpenedOn(null);

  /* Learn, Resources, Journey and Practice all belong to one subject - going
     deeper - so they live behind a single dropdown rather than four items in
     the bar. What is left is Stories, Learn, About, Contact and Give. */
  const learnLinks = [
    { to: "/learn", label: t.learnLabel },
    { to: "/resources", label: t.resources.label },
    { to: "/journeys", label: t.journeysLabel },
    { to: "/practice", label: t.practice.nav },
  ];

  const learnActive = learnLinks.some(({ to }) => pathname.startsWith(to));

  /* The dropdown is hover-driven on a pointer and tap-driven on a phone, so
     every way of leaving it has to close it: a click elsewhere and the Escape
     key. Leaving by navigating is handled by the route comparison above. */
  useEffect(() => {
    function handleClickOutside(event) {
      if (learnRef.current && !learnRef.current.contains(event.target)) {
        closeLearn();
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") closeLearn();
    }
    if (learnOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [learnOpen]);

  function closeNav() {
    setMenuOpen(false);
    closeLearn();
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

          {/* One item, four destinations. The button rather than a bare link is
              what makes this a menu: it owns the open state and reports it to
              assistive technology through aria-expanded. */}
          <div
            className="dropdown"
            ref={learnRef}
            onMouseEnter={openLearn}
            onMouseLeave={closeLearn}
          >
            <button
              type="button"
              className={`dropdown-toggle ${learnActive ? "active" : ""}`}
              onClick={() => (learnOpen ? closeLearn() : openLearn())}
              aria-expanded={learnOpen}
              aria-haspopup="true"
              aria-controls="learn-menu"
            >
              {t.learnLabel}
              <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" className="dropdown-chevron" />
            </button>

            <div id="learn-menu" className={`dropdown-menu ${learnOpen ? "open" : ""}`}>
              {learnLinks.map(({ to, label }) => (
                <NavLink key={to} to={to} onClick={closeNav} className="dropdown-item">
                  {label}
                </NavLink>
              ))}
            </div>
          </div>

          <NavLink to="/about" onClick={closeNav}>
            {t.about}
          </NavLink>

          <NavLink to="/contact" onClick={closeNav}>
            {t.contact}
          </NavLink>

          <NavLink to="/give" onClick={closeNav}>
            {t.give}
          </NavLink>

        </nav>

        <div className="nav-settings">
          {/* The gear opens the settings popup. It is a link, not a button, so it
              still works with middle-click, "open in new tab" and the browser's
              own bookmark - and because it is a route, the panel closes itself
              when the reader navigates anywhere else.

              This used to be a dropdown holding a dark-mode toggle and a language
              picker. Now that both of those live in the popup, one click further,
              the dropdown was a second door to the same room - and two identical
              gears sitting in the corner. */}
          <Link
            to="/settings"
            className="settings-toggle"
            aria-label={t.settings.all}
            title={t.settings.all}
          >
            <Settings size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
