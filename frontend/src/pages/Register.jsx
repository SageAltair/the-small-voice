import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    <main className="auth-page">
      <section className="auth-card">

        <div className="auth-brand">
          <div className="auth-mark">TSV</div>
          <span>The Small Voice</span>
        </div>

        <p className="eyebrow">JOIN THE COMMUNITY</p>

        <h1>Create your account</h1>

        <p className="auth-description">
          Create your account and become part of
          The Small Voice community.
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
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={change}
              autoComplete="email"
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
              autoComplete="new-password"
              minLength={6}
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
            {busy ? "Creating account..." : "Create account"}
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