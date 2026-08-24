import { useEffect, useState } from "react";

import { Link } from "react-router-dom";
import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";

import { getTags } from "../services/api";
import NewsletterSignup from "./NewsletterSignup";
import { useLanguage } from "../i18n/LanguageContext";


export default function Footer() {
  const { t } = useLanguage();
  const [tags, setTags] = useState([]);

  useEffect(() => {
    getTags().then(setTags).catch(() => setTags([]));
  }, []);

  return (
    <footer className="site-footer">
      <div className="container footer-spotlight">
        <div className="footer-spotlight-copy">
          <p className="eyebrow">{t.stayClose}</p>
          <h2>{t.footerHeading}</h2>
          <p>{t.footerDescription}</p>
        </div>
        <div className="footer-subscribe-card"><NewsletterSignup /></div>
      </div>

      <div className="container footer-grid">
        <div className="footer-brand">
          <Link className="footer-wordmark" to="/"><span>The</span> Small Voice</Link>
          <p>{t.footerAbout}</p>
        </div>
        <div>
          <h3>{t.explore}</h3>
          <Link to="/stories">{t.stories}</Link>
          <Link to="/resources">{t.resources}</Link>
          <Link to="/about">{t.about}</Link>
          <Link to="/contact">{t.contact}</Link>
          <Link to="/give">{t.give}</Link>
        </div>
        <div>
          <h3>{t.topics}</h3>
          {tags.slice(0, 5).map((tag) => <Link key={tag.id} to={`/tags/${tag.slug}`}>{tag.name}</Link>)}
          {!tags.length && <span className="footer-muted">{t.topicsSoon}</span>}
        </div>
        <div>
          <h3>{t.followAlong}</h3>
          <div className="footer-socials"><a className="social-link social-instagram" href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram"><FaInstagram aria-hidden="true" /></a><a className="social-link social-facebook" href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="Facebook" title="Facebook"><FaFacebook aria-hidden="true" /></a><a className="social-link social-youtube" href="https://youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube" title="YouTube"><FaYoutube aria-hidden="true" /></a></div>
        </div>
      </div>
      <div className="container footer-bottom"><span>© 2026 {t.siteName}</span><span>{t.footerTagline}</span></div>
    </footer>
  );
}
