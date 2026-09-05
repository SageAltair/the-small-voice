import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, LockKeyhole, Mail, RefreshCw, UserRound } from "lucide-react";

import GoogleSignIn from "../components/GoogleSignIn";
import { register, resendVerification } from "../services/api";

export default function Register() {
  const [searchParams] = useSearchParams();
  const googleUnconfigured = searchParams.get("google") === "unconfigured";

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // "Check your inbox" state shown after a successful registration.
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  function change(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setBusy(true);

    try {
      const result = await register(
        form.username,
        form.email,
        form.password
      );

      setRegisteredEmail(result.email || form.email);
      setRegistered(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setResendMessage("");
    setResending(true);

    try {
      const result = await resendVerification(registeredEmail);
      setResendMessage(result.message);
    } catch (err) {
      setResendMessage(err.message);
    } finally {
      setResending(false);
    }
  }

  if (registered) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="verify-title">
          <Link className="auth-brand" to="/">
            <span className="auth-mark"><BookOpen size={20} /></span>
            <span>The Small Voice</span>
          </Link>

          <p className="eyebrow">ALMOST THERE</p>
          <h1 id="verify-title">Check your inbox.</h1>
          <p className="auth-description">
            We sent a verification link to{" "}
            <strong>{registeredEmail}</strong>. Click the link to activate
            your account, then sign in.
          </p>

          <div className="auth-success">
            <strong><CheckCircle2 size={15} /> Just one more step</strong>
            <span>
              The link expires within 24 hours. No e-mail? Check your spam
              folder, or resend it below.
            </span>
          </div>

          {resendMessage && (
            <p className={`form-error ${resendMessage.includes("has been sent") ? "form-success" : ""}`}>
              {resendMessage}
            </p>
          )}

          <div className="auth-resend">
            <button
              className="button"
              type="button"
              disabled={resending}
              onClick={handleResend}
            >
              {resending ? "Sending…" : <>Resend verification e-mail <RefreshCw size={15} /></>}
            </button>
          </div>

          <p className="auth-switch">
            Already verified?{" "}
            <Link to="/login">
              Sign in
            </Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="register-title">
        <Link className="auth-brand" to="/">
          <span className="auth-mark"><BookOpen size={20} /></span>
          <span>The Small Voice</span>
        </Link>

        <p className="eyebrow">JOIN THE COMMUNITY</p>

        {googleUnconfigured && (
          <p className="auth-banner error">
            Google sign-in isn&apos;t set up on this server yet. You can still
            create an account with an e-mail address below.
          </p>
        )}

        <h1 id="register-title">Create your account.</h1>

        <p className="auth-description">
          Create your account and become part of
          The Small Voice community.
        </p>

        <div className="auth-google-wrap">
          <GoogleSignIn label="Continue with Google" />
          <div className="auth-divider">or sign up with e-mail</div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>

          <label>
            Username
            <span className="auth-input"><UserRound size={17} /><input name="username" value={form.username} onChange={change} autoComplete="username" placeholder="Choose a username" required /></span>
          </label>

          <label>
            Email
            <span className="auth-input"><Mail size={17} /><input name="email" type="email" value={form.email} onChange={change} autoComplete="email" placeholder="you@example.com" required /></span>
          </label>

          <label>
            Password
            <span className="auth-input"><LockKeyhole size={17} /><input name="password" type="password" value={form.password} onChange={change} autoComplete="new-password" placeholder="At least 6 characters" minLength={6} required /></span>
          </label>

          {error && (
            <p className="form-error">
              {error}
            </p>
          )}

          <button
            className="button"
            type="submit"
            disabled={busy}
          >
            {busy ? "Creating account..." : <>Create account <ArrowRight size={16} /></>}
          </button>

          <p className="auth-note">
            We&apos;ll e-mail you a link to verify your address before you can sign in.
          </p>

        </form>

        <p className="auth-switch">
          Already have an account?{" "}
          <Link to="/login">
            Sign in
          </Link>
        </p>

      </section>
    </main>
  );
}