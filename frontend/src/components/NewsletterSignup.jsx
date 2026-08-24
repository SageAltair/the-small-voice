import { useState } from "react";

import { subscribeToNewsletter } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";


export default function NewsletterSignup() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const result = await subscribeToNewsletter(email);
      setMessage(result.message);
      setEmail("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="newsletter-form" onSubmit={handleSubmit}>
      <div className="newsletter-fields">
        <input
          type="email"
          placeholder={t.emailAddress}
          aria-label={t.emailAddress}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? t.joining : t.subscribe}
        </button>
      </div>
      {message && <p className="newsletter-message">{message}</p>}
    </form>
  );
}
