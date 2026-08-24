import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

const content = {
  en: { label: "Contact", title: "Let's talk.", intro: "Have a story worth sharing, a question, or a desire to help build The Small Voice? We'd love to hear from you.", help: "How can we help?", send: "Send us a message", name: "Name", email: "Email", subject: "Subject", message: "Message", sendButton: "Send message", contribute: "Want to contribute?", contribution: "The Small Voice will grow through people who tell meaningful stories, share knowledge, create resources, and help others grow.", quote: "Your voice might be the small voice someone else needs to hear.", reasons: ["I want to share my story", "I want to become a contributor", "I want to collaborate", "I want to volunteer", "I have a question", "I want to partner with The Small Voice", "I have feedback", "Something else"] },
  sw: { label: "Wasiliana", title: "Tuzungumze.", intro: "Je, una hadithi ya kushiriki, swali, au hamu ya kusaidia kujenga The Small Voice? Tungependa kusikia kutoka kwako.", help: "Tunawezaje kukusaidia?", send: "Tutumie ujumbe", name: "Jina", email: "Barua pepe", subject: "Mada", message: "Ujumbe", sendButton: "Tuma ujumbe", contribute: "Unataka kuchangia?", contribution: "The Small Voice itakua kupitia watu wanaosimulia hadithi zenye maana, kushiriki maarifa, kuunda rasilimali, na kuwasaidia wengine kukua.", quote: "Sauti yako inaweza kuwa sauti ndogo ambayo mtu mwingine anahitaji kusikia.", reasons: ["Nataka kushiriki hadithi yangu", "Nataka kuwa mchangiaji", "Nataka kushirikiana", "Nataka kujitolea", "Nina swali", "Nataka kushirikiana na The Small Voice", "Nina maoni", "Kitu kingine"] },
};

export default function Contact() {
  const { language } = useLanguage();
  const copy = content[language];
  const [form, setForm] = useState({ reasonIndex: 0, name: "", email: "", subject: "", message: "" });

  function sendMessage(event) {
    event.preventDefault();
    const reason = copy.reasons[form.reasonIndex];
    const subject = form.subject || reason;
    const body = `${form.message}\n\n${copy.name}: ${form.name}\n${copy.email}: ${form.email}\n${copy.help}: ${reason}`;
    window.location.href = `mailto:hello@thesmallvoice.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return <main className="container page contact-page"><header className="mission-hero"><p className="eyebrow">{copy.label}</p><h1>{copy.title}</h1><p>{copy.intro}</p></header><section className="contact-layout"><div><p className="eyebrow">{copy.help}</p><div className="contact-reasons">{copy.reasons.map((reason, index) => <label key={reason}><input type="radio" name="reason" value={reason} checked={form.reasonIndex === index} onChange={() => setForm({ ...form, reasonIndex: index })} /><span>{reason}</span></label>)}</div><aside className="contributor-callout"><p className="eyebrow">{copy.contribute}</p><p>{copy.contribution}</p><strong>{copy.quote}</strong></aside></div><form className="contact-form" onSubmit={sendMessage}><p className="eyebrow">{copy.send}</p><label>{copy.name}<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>{copy.email}<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>{copy.subject}<input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label><label>{copy.message}<textarea required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label><button className="button" type="submit">{copy.sendButton}</button></form></section></main>;
}
