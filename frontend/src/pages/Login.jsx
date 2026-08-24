import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, LockKeyhole, UserRound } from "lucide-react";
import { login } from "../services/api";

export default function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <Link className="auth-brand" to="/">
          <span className="auth-mark"><BookOpen size={20} /></span>
          <span>The Small Voice</span>
        </Link>

        <p className="eyebrow">WELCOME BACK</p>

        <h1 id="login-title">Welcome back.</h1>

        <p className="auth-description">
          Continue your journey from stories to
          learning, growth, community, and mission.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>

          <label>
            Username
            <span className="auth-input"><UserRound size={17} /><input name="username" value={form.username} onChange={change} autoComplete="username" placeholder="Your username" required /></span>
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

        <p className="auth-switch">
          Don't have an account?{" "}
          <Link to="/register">
            Create one
          </Link>
        </p>

      </section>
    </main>
  );
}
