import { useLanguage } from "../i18n/LanguageContext";

const content = {
  en: {
    label: "Terms of Use",
    title: "Terms of Use",
    intro: "These terms govern your use of The Small Voice website and services.",
    lastUpdated: "Last updated: September 2026",
  },
  sw: {
    label: "Masharti ya Matumizi",
    title: "Masharti ya Matumizi",
    intro: "Masharti haya yanavyoongoza matumizi yako ya tovuti na huduma za The Small Voice.",
    lastUpdated: "Imesahilishwa: Septemba 2026",
  },
};

export default function TermsOfUse() {
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
        <p>By using The Small Voice, you agree to use the site for personal, non-commercial reflection and growth. Content on the site is protected by copyright and may not be reproduced without permission. You may share stories and resources through normal social sharing features.</p>
        <p>If you contribute a story, resource, or feedback, you confirm that you have the rights to share it and that it respects the dignity of the people it describes. We reserve the right to review, edit, or decline contributions to keep the space honest and safe for everyone.</p>
      </section>
    </main>
  );
}