import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
        navigate("/");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">

        <div className="auth-brand">
          <div className="auth-mark">TSV</div>
          <span>The Small Voice</span>
        </div>

        <p className="eyebrow">WELCOME BACK</p>

        <h1>Sign in</h1>

        <p className="auth-description">
          Continue your journey from stories to
          learning, growth, community, and mission.
        </p>

        <form onSubmit={handleSubmit}>

          <label>
            Username
            <input
              name="username"
              value={form.username}
              onChange={change}
              autoComplete="username"
              required
            />
          </label>

          <label>
            Password
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={change}
              autoComplete="current-password"
              required
            />
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
            {busy ? "Signing in..." : "Sign in"}
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