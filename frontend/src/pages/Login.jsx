import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, LockKeyhole, Mail, RefreshCw, UserRound } from "lucide-react";

import GoogleSignIn from "../components/GoogleSignIn";
import { login, resendVerification } from "../services/api";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const verified = searchParams.get("verified");
  const googleError = searchParams.get("error") === "google";
  const googleUnconfigured = searchParams.get("google") === "unconfigured";

  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Resend-verification control (shown when login is blocked on verification).
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
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
      const user = await login(
        form.username,
        form.password
      );

      if (user.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.message);

      const unverified = String(err.message || "").toLowerCase().includes("email not verified");
      setNeedsVerification(unverified);

      if (unverified) {
        // Pre-fill the resend box when the user already typed their e-mail.
        setResendEmail(form.username.includes("@") ? form.username : "");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResend(event) {
    event.preventDefault();
    setResendMessage("");

    if (!resendEmail.trim()) {
      setResendMessage("Enter the e-mail address you signed up with.");
      return;
    }

    setResending(true);

    try {
      const result = await resendVerification(resendEmail.trim());
      setResendMessage(result.message);
    } catch (err) {
      setResendMessage(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <Link className="auth-brand" to="/">
          <span className="auth-mark"><BookOpen size={20} /></span>
          <span>The Small Voice</span>
        </Link>

        {verified === "1" && (
          <p className="auth-banner">
            Your e-mail is verified — you can sign in now.
          </p>
        )}

        {verified === "error" && (
          <p className="auth-banner error">
            This verification link is invalid or has expired. Sign in to resend it.
          </p>
        )}

        {googleError && (
          <p className="auth-banner error">
            Google sign-in did not complete. Please try again.
          </p>
        )}

        {googleUnconfigured && (
          <p className="auth-banner error">
            Google sign-in isn&apos;t set up on this server yet. You can still
            create an account and sign in with an e-mail address.
          </p>
        )}

        <p className="eyebrow">WELCOME BACK</p>

        <h1 id="login-title">Welcome back.</h1>

        <p className="auth-description">
          Continue your journey from stories to
          learning, growth, community, and mission.
        </p>

        <div className="auth-google-wrap">
          <GoogleSignIn label="Continue with Google" />
          <div className="auth-divider">or sign in with e-mail</div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>

          <label>
            Username or e-mail
            <span className="auth-input"><UserRound size={17} /><input name="username" value={form.username} onChange={change} autoComplete="username" placeholder="Your username or e-mail" required /></span>
          </label>

          <label>
            Password
            <span className="auth-input"><LockKeyhole size={17} /><input name="password" type="password" value={form.password} onChange={change} autoComplete="current-password" placeholder="Your password" required /></span>
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
            {busy ? "Signing in..." : <>Sign in <ArrowRight size={16} /></>}
          </button>

        </form>

        {needsVerification && (
          <form className="auth-resend" onSubmit={handleResend}>
            <label>
              Resend verification e-mail
              <span className="auth-input"><Mail size={17} /><input name="resendEmail" type="email" value={resendEmail} onChange={(event) => setResendEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></span>
            </label>
            <button className="button" type="submit" disabled={resending}>
              {resending ? "Sending…" : <>Resend verification link <RefreshCw size={15} /></>}
            </button>
            {resendMessage && (
              <p className={`form-error ${resendMessage.includes("has been sent") ? "form-success" : ""}`}>
                {resendMessage}
              </p>
            )}
          </form>
        )}

        <p className="auth-switch">
          Don&apos;t have an account?{" "}
          <Link to="/register">
            Create one
          </Link>
        </p>

      </section>
    </main>
  );
}