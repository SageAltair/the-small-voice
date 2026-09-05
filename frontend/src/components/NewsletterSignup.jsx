import { useCallback, useEffect, useRef, useState } from "react";

import { useLanguage } from "../i18n/LanguageContext";

// -----------------------------------------------------------------------------
// Mailchimp Embedded Form - classic embed adapted for React (button + overlay).
//
// The full Mailchimp form is hidden by default. A small "Subscribe" button is
// shown instead; clicking it opens the form in an overlay pinned near the top
// of the screen. Submissions go straight to Mailchimp through the same JSONP
// endpoint (`/subscribe/post-json?c=...`) that the official mc-validate.js
// script uses, so no external jQuery or mc-validate scripts need to be loaded.
// After a successful subscribe the overlay closes by itself. Every render gets
// unique element IDs, so the trigger can appear on the Home page AND in the
// Footer at the same time without clashing.
// -----------------------------------------------------------------------------

const MAILCHIMP_FORM_ACTION =
  "https://onrender.us12.list-manage.com/subscribe/post?u=f88514332fdc4024ddef0e054&id=653b753a32&f_id=00e77fe1f0";

// Official classic Mailchimp embed stylesheet (loaded into <head>, as
// Mailchimp recommends).
const MAILCHIMP_CLASSIC_CSS =
  "//cdn-images.mailchimp.com/embedcode/classic-061523.css";

// Small overrides so the embed follows the site's design tokens (light + dark).
const MAILCHIMP_THEME_CSS = `
  #mc_embed_signup {
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    font: 14px Poppins, Helvetica, Arial, sans-serif;
    color: var(--text);
  }
  #mc_embed_signup h2 { margin: 0 0 12px; font: 40px "Newsreader", Georgia, serif; color: var(--text); }
  #mc_embed_signup .asterisk { color: var(--accent); font-size: 1.05rem; }
  #mc_embed_signup .indicates-required { color: var(--text-muted); font-style: italic; }
  #mc_embed_signup .mc-field-group label { color: var(--text); }
  #mc_embed_signup input[type="text"],
  #mc_embed_signup input[type="email"] {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--canvas);
    color: var(--text);
    font: inherit;
  }
  #mc_embed_signup input:focus { border-color: var(--accent); outline: none; }
  #mc_embed_signup .button {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--canvas);
    font-size: .72rem;
    letter-spacing: .05em;
    text-transform: uppercase;
    transition: background-color 160ms ease, transform 160ms ease;
  }
  #mc_embed_signup .button:hover { background: var(--accent-strong); transform: translateY(-2px); }
  #mc_embed_signup .button:disabled { cursor: wait; opacity: .6; transform: none; }
  #mc_embed_signup .response { margin: 12px 0 0; font-size: .82rem; line-height: 1.5; }
  #mc_embed_signup .mce-error-response { color: #e5534b; }
  #mc_embed_signup .mce-success-response { color: var(--accent-strong); }
  :root[data-theme="dark"] #mc_embed_signup .mce-error-response { color: #ff9d92; }
`;

// Overlay + trigger styles for the button-revealed subscribe form.
const NEWSLETTER_MODAL_CSS = `
  .newsletter-trigger { width: 100%; }
  .newsletter-modal {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 28px 16px;
    overflow-y: auto;
    background: rgb(0 0 0 / 45%);
    -webkit-backdrop-filter: blur(3px);
    backdrop-filter: blur(3px);
    animation: newsletter-fade-in 180ms ease;
  }
  .newsletter-modal-panel {
    position: relative;
    width: 100%;
    max-width: 460px;
    margin-top: 8vh;
    padding: 30px 28px 22px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 24px 60px rgb(0 0 0 / 22%);
    animation: newsletter-slide-down 220ms ease;
  }
  .newsletter-modal-panel #mc_embed_signup {
    border: 0;
    background: transparent;
    box-shadow: none;
  }
  .newsletter-modal-close {
    position: absolute;
    top: 8px;
    right: 8px;
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }
  .newsletter-modal-close:hover { background: var(--surface-muted); color: var(--text); }
  @keyframes newsletter-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes newsletter-slide-down { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }
  @media (max-width: 520px) {
    .newsletter-modal { padding: 14px; }
    .newsletter-modal-panel { margin-top: 0; }
  }
`;

// Incremented per instance so the form can be rendered more than once on a page.
let mailchimpInstanceCount = 0;

function submitToMailchimp(form) {
  const payload = new URLSearchParams(new FormData(form));
  const endpoint = MAILCHIMP_FORM_ACTION.replace(
    "/subscribe/post?",
    "/subscribe/post-json?"
  );

  return new Promise((resolve, reject) => {
    const callbackName = `mcSubscriber${Date.now()}${Math.floor(Math.random() * 1000000)}`;
    const script = document.createElement("script");
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Could not reach the newsletter service. Please try again."));
    }, 15000);

    window[callbackName] = (response) => {
      cleanup();
      resolve(response);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach the newsletter service. Please try again."));
    };

    script.src = `${endpoint}&${payload.toString()}&c=${callbackName}`;
    document.body.appendChild(script);
  });
}

export default function NewsletterSignup() {
  const { t } = useLanguage();
  const formRef = useRef(null);
  const [suffix] = useState(() => `mailchimp-${++mailchimpInstanceCount}`);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (document.getElementById("mailchimp-classic-css")) return;
    const link = document.createElement("link");
    link.id = "mailchimp-classic-css";
    link.href = MAILCHIMP_CLASSIC_CSS;
    link.rel = "stylesheet";
    link.type = "text/css";
    document.head.appendChild(link);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setFeedback(null);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, handleClose]);

  function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !formRef.current) return;

    const email = String(
      formRef.current.elements.namedItem("EMAIL")?.value ?? ""
    ).trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFeedback({
        kind: "error",
        text: "Please enter a valid email address.",
      });
      return;
    }

    setFeedback(null);
    setSubmitting(true);

    submitToMailchimp(formRef.current)
      .then((result) => {
        if (result?.result === "success") {
          setFeedback({
            kind: "success",
            text: result?.msg || "Thanks for subscribing!",
          });
          formRef.current?.reset();
          window.setTimeout(() => handleClose(), 1600);
        } else {
          setFeedback({
            kind: "error",
            text: result?.msg || "Oops! Could not subscribe you right now.",
          });
        }
      })
      .catch((error) => setFeedback({ kind: "error", text: error.message }))
      .finally(() => setSubmitting(false));
  }

  return (
    <>
      <button
        type="button"
        className="button newsletter-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {t.subscribe}
      </button>

      {open && (
        <div
          className="newsletter-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) handleClose();
          }}
        >
          <div
            className="newsletter-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${suffix}-heading`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="newsletter-modal-close"
              onClick={handleClose}
              aria-label="Close"
            >
              &times;
            </button>

            <div id="mc_embed_shell">
              <style dangerouslySetInnerHTML={{ __html: MAILCHIMP_THEME_CSS + NEWSLETTER_MODAL_CSS }} />

              <div id="mc_embed_signup">
        <form
          action={MAILCHIMP_FORM_ACTION}
          method="post"
          id={`${suffix}-subscribe-form`}
          name="mc-embedded-subscribe-form"
          className="validate"
          target="_blank"
          noValidate
          onSubmit={handleSubmit}
          ref={formRef}
        >
          <div id={`${suffix}-scroll`} className="mc_embed_signup_scroll">
            <h2 id={`${suffix}-heading`}>Subscribe</h2>
            <div className="indicates-required"><span className="asterisk">*</span> indicates required</div>

            <div className="mc-field-group">
              <label htmlFor={`${suffix}-EMAIL`}>Email Address <span className="asterisk">*</span></label>
              <input type="email" name="EMAIL" className="required email" id={`${suffix}-EMAIL`} required />
            </div>

            <div className="mc-field-group">
              <label htmlFor={`${suffix}-FNAME`}>First Name </label>
              <input type="text" name="FNAME" className=" text" id={`${suffix}-FNAME`} />
            </div>

            <div className="mc-field-group">
              <label htmlFor={`${suffix}-LNAME`}>Last Name </label>
              <input type="text" name="LNAME" className=" text" id={`${suffix}-LNAME`} />
            </div>

            <div className="mc-field-group">
              <label htmlFor={`${suffix}-PHONE`}>Phone Number </label>
              <input type="text" name="PHONE" className="REQ_CSS" id={`${suffix}-PHONE`} />
            </div>

            <div id={`${suffix}-responses`} className="clear foot">
              {feedback?.kind === "error" && (
                <div className="response mce-error-response" id={`${suffix}-error-response`} role="alert">{feedback.text}</div>
              )}
              {feedback?.kind === "success" && (
                <div className="response mce-success-response" id={`${suffix}-success-response`} role="status">{feedback.text}</div>
              )}
            </div>

            <div aria-hidden="true" style={{ position: "absolute", left: "-5000px" }}>
              {/* real people should not fill this in and expect good things - do not remove this or risk form bot signups */}
              <input type="text" name="b_f88514332fdc4024ddef0e054_653b753a32" tabIndex={-1} />
            </div>

            <div className="optionalParent">
              <div className="clear foot">
                <input type="submit" name="subscribe" id={`${suffix}-subscribe`} className="button" value="Subscribe" disabled={submitting} />
              </div>
            </div>
          </div>
          </form>
        </div>
      </div>
    </div>
  </div>
      )}
    </>
  );
}