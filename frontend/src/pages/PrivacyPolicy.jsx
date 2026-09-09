import { useLanguage } from "../i18n/LanguageContext";

const content = {
  en: {
    label: "Privacy Policy",
    title: "Privacy Policy",
    intro: "How The Small Voice collects, uses, and protects your information.",
    lastUpdated: "Last updated: September 2026",
  },
  sw: {
    label: "Sera ya Faragha",
    title: "Sera ya Faragha",
    intro: "Jinsi The Small Voice inavyokusanyia, kutumia, na kuhifadhi taarifa zako.",
    lastUpdated: "Imesahilishwa: Septemba 2026",
  },
};

export default function PrivacyPolicy() {
  const { language } = useLanguage();
  const copy = content[language];
  return (
    <main className="container page">
      <header className="page-header">
        <p className="eyebrow">{copy.label}</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        <p className="footer-muted">{copy.lastUpdated}</p>
      </header>
      <section className="mission-prose">
        <p>We are committed to protecting your privacy. The Small Voice collects only the information you provide when you subscribe, contact us, or contribute. We use that information to deliver the content and community you asked for, and we never sell your data to third parties.</p>
        <p>You can unsubscribe from our communications at any time. If you have questions about how we handle your information, please contact us through the Contact page.</p>
      </section>
    </main>
  );
}