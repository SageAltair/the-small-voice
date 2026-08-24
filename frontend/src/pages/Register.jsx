import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, LockKeyhole, Mail, UserRound } from "lucide-react";
import { register } from "../services/api";

export default function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      await register(
        form.username,
        form.email,
        form.password
      );

      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="register-title">
        <Link className="auth-brand" to="/">
          <span className="auth-mark"><BookOpen size={20} /></span>
          <span>The Small Voice</span>
        </Link>

        <p className="eyebrow">JOIN THE COMMUNITY</p>

        <h1 id="register-title">Create your account.</h1>

        <p className="auth-description">
          Create your account and become part of
          The Small Voice community.
        </p>

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
