import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { submitContact, submitFeedback } from "../services/api";

const content = {
  en: { label: "Contact", title: "Let's talk.", intro: "Have a story worth sharing, a question, or a desire to help build The Small Voice? We'd love to hear from you.", help: "How can we help?", send: "Send us a message", name: "Name", email: "Email", subject: "Subject", message: "Message", sendButton: "Send message", contribute: "Want to contribute?", contribution: "The Small Voice will grow through people who tell meaningful stories, share knowledge, create resources, and help others grow.", quote: "Your voice might be the small voice someone else needs to hear.", reasons: ["I want to share my story", "I want to become a contributor", "I want to collaborate", "I want to volunteer", "I have a question", "I want to partner with The Small Voice", "I have feedback", "Something else"], feedback: "Send feedback", feedbackTitle: "We value your feedback", feedbackIntro: "Help us improve by sharing your thoughts, suggestions, or experiences.", feedbackName: "Your name", feedbackEmail: "Your email", feedbackMessage: "Your feedback", feedbackSubmit: "Submit feedback" },
  sw: { label: "Wasiliana", title: "Tuzungumze.", intro: "Je, una hadithi ya kushiriki, swali, au hamu ya kusaidia kujenga The Small Voice? Tungependa kusikia kutoka kwako.", help: "Tunawezaje kukusaidia?", send: "Tutumie ujumbe", name: "Jina", email: "Barua pepe", subject: "Mada", message: "Ujumbe", sendButton: "Tuma ujumbe", contribute: "Unataka kuchangia?", contribution: "The Small Voice itakua kupitia watu wanaosimulia hadithi zenye maana, kushiriki maarifa, kuunda rasilimali, na kuwasaidia wengine kukua.", quote: "Sauti yako inaweza kuwa sauti ndogo ambayo mtu mwingine anahitaji kusikia.", reasons: ["Nataka kushiriki hadithi yangu", "Nataka kuwa mchangiaji", "Nataka kushirikiana", "Nataka kujitolea", "Nina swali", "Nataka kushirikiana na The Small Voice", "Nina maoni", "Kitu kingine"], feedback: "Tuma maoni", feedbackTitle: "Tunathamini maoni yako", feedbackIntro: "Tusaidie kuboresha kwa kushiriki mawazo, mapendekezo, au uzoefu wako.", feedbackName: "Jina lako", feedbackEmail: "Barua pepe yako", feedbackMessage: "Maoni yako", feedbackSubmit: "Wasilisha maoni" },
};

export default function Contact() {
  const { language } = useLanguage();
  const copy = content[language];
  const [form, setForm] = useState({ reasonIndex: 0, name: "", email: "", subject: "", message: "", sending: false, sent: false });
  const [feedback, setFeedback] = useState({ name: "", email: "", message: "", sending: false, sent: false });

  async function sendMessage(event) {
    event.preventDefault();
    setForm((prev) => ({ ...prev, sending: true, sent: false }));
    try {
      await submitContact({ name: form.name, email: form.email, subject: form.subject || copy.reasons[form.reasonIndex], message: form.message });
      setForm((prev) => ({ ...prev, sending: false, sent: true }));
    } catch (err) {
      setForm((prev) => ({ ...prev, sending: false }));
      alert(err.message || "Failed to send message. Please try again.");
    }
  }

  async function sendFeedback(event) {
    event.preventDefault();
    setFeedback((prev) => ({ ...prev, sending: true, sent: false }));
    try {
      await submitFeedback({ name: feedback.name, email: feedback.email, message: feedback.message });
      setFeedback((prev) => ({ ...prev, sending: false, sent: true }));
    } catch (err) {
      setFeedback((prev) => ({ ...prev, sending: false }));
      alert(err.message || "Failed to send feedback. Please try again.");
    }
  }

  return <main className="container page contact-page"><header className="mission-hero"><p className="eyebrow">{copy.label}</p><h1>{copy.title}</h1><p>{copy.intro}</p></header><section className="contact-layout"><div><p className="eyebrow">{copy.help}</p><div className="contact-reasons">{copy.reasons.map((reason, index) => <label key={reason}><input type="radio" name="reason" value={reason} checked={form.reasonIndex === index} onChange={() => setForm({ ...form, reasonIndex: index })} /><span>{reason}</span></label>)}</div><aside className="contributor-callout"><p className="eyebrow">{copy.contribute}</p><p>{copy.contribution}</p><strong>{copy.quote}</strong></aside></div><form className="contact-form" onSubmit={sendMessage}><p className="eyebrow">{copy.send}</p><label>{copy.name}<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>{copy.email}<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>{copy.subject}<input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label><label>{copy.message}<textarea required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label><button className="button" type="submit" disabled={form.sending}>{form.sending ? "Sending..." : form.sent ? "Sent!" : copy.sendButton}</button>{form.sent && <p className="form-success">Thank you for reaching out. We will get back to you soon.</p>}</form></section><section className="feedback-section"><div className="feedback-header"><p className="eyebrow">{copy.feedback}</p><h2>{copy.feedbackTitle}</h2><p>{copy.feedbackIntro}</p></div>{feedback.sent ? <div className="form-success">Thank you for your feedback!</div> : <form className="feedback-form" onSubmit={sendFeedback}><label>{copy.feedbackName}<input required value={feedback.name} onChange={(event) => setFeedback({ ...feedback, name: event.target.value })} /></label><label>{copy.feedbackEmail}<input required type="email" value={feedback.email} onChange={(event) => setFeedback({ ...feedback, email: event.target.value })} /></label><label>{copy.feedbackMessage}<textarea required value={feedback.message} onChange={(event) => setFeedback({ ...feedback, message: event.target.value })} /></label><button className="button" type="submit" disabled={feedback.sending}>{feedback.sending ? "Sending..." : copy.feedbackSubmit}</button></form>}</section></main>;
}
