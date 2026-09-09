import { useEffect, useState } from "react";

import { Link } from "react-router-dom";
import { FaFacebook, FaInstagram, FaTiktok, FaWhatsapp, FaYoutube } from "react-icons/fa";

import { getTags } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import logoDark from "../assets/small-voice-dark-mode.svg";


export default function Footer() {
  const { t, language } = useLanguage();
  const [tags, setTags] = useState([]);

  useEffect(() => {
    getTags(language).then(setTags).catch(() => setTags([]));
  }, [language]);

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Link className="footer-wordmark" to="/"><img src={logoDark} alt="" aria-hidden="true" className="footer-logo" /><span>The</span> Small Voice</Link>
          <p>{t.footerAbout}</p>
          <div className="footer-socials footer-socials--brand">
            <a className="social-link social-instagram" href="https://www.instagram.com/the.smallvoice?stkn=OGV4MTkxemg4dWZ1" target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram"><FaInstagram aria-hidden="true" /></a>
            <a className="social-link social-facebook" href="https://www.facebook.com/share/1Ex9QLc6nz/" target="_blank" rel="noreferrer" aria-label="Facebook" title="Facebook"><FaFacebook aria-hidden="true" /></a>
            <a className="social-link social-x" href="https://x.com/theSmallVoice3" target="_blank" rel="noreferrer" aria-label="X" title="X"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg></a>
            <a className="social-link social-youtube" href="https://youtube.com/@thesmallvoice-3?si=GCimY6IBM8Z0zlbo" target="_blank" rel="noreferrer" aria-label="YouTube" title="YouTube"><FaYoutube aria-hidden="true" /></a>
            <a className="social-link social-tiktok" href="https://vm.tiktok.com/ZS9SMmRTbGHh7-YoSt2/" target="_blank" rel="noreferrer" aria-label="TikTok" title="TikTok"><FaTiktok aria-hidden="true" /></a>
            <a className="social-link social-whatsapp" href="https://whatsapp.com/channel/0029Vb97FmOJZg4EWfOsVq3n" target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp"><FaWhatsapp aria-hidden="true" /></a>
          </div>
        </div>
        <div>
          <h3>{t.explore}</h3>
          <nav className="footer-nav" aria-label="Explore">
            <Link to="/stories">{t.stories}</Link>
            <Link to="/resources">{t.resources}</Link>
            <Link to="/about">{t.about}</Link>
            <Link to="/contact">{t.contact}</Link>
            <Link to="/contact" className="footer-feedback-link">{t.feedback || "Feedback"}</Link>
            <Link to="/give">{t.give}</Link>
          </nav>
        </div>
        <div>
          <h3>{t.community}</h3>
          <nav className="footer-nav" aria-label="Community">
            <Link to="/contact">{t.joinCommunity || "Join the Community"}</Link>
            <Link to="/contact">{t.shareStory || "Share Your Story"}</Link>
            <Link to="/contact">{t.volunteer || "Volunteer"}</Link>
            <Link to="/contact">{t.partner || "Partner With Us"}</Link>
            <Link to="/give">{t.give}</Link>
            <Link to="/contact">{t.contactUs || "Contact Us"}</Link>
          </nav>
        </div>
        <div>
          <h3>{t.topics}</h3>
          <nav className="footer-nav" aria-label="Topics">
            {tags.slice(0, 5).map((tag) => <Link key={tag.id} to={`/tags/${tag.slug}`}>{tag.name}</Link>)}
            {!tags.length && <span className="footer-muted">{t.topicsSoon}</span>}
          </nav>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 {t.siteName}</span>
        <nav className="footer-legal" aria-label="Legal">
          <Link to="/privacy-policy">{t.privacyPolicy || "Privacy Policy"}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms-of-use">{t.termsOfUse || "Terms of Use"}</Link>
        </nav>
      </div>
    </footer>
  );
}