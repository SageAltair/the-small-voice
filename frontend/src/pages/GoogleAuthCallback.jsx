import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen } from "lucide-react";

import { getCurrentUser, setAccessToken } from "../services/api";

/**
 * Landing page for the Google OAuth callback.
 *
 * The backend signs the user in, then redirects here with ?token=<JWT>.
 * This page stores the token and sends the user to their dashboard.
 */
export default function GoogleAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      navigate("/login?error=google", { replace: true });
      return;
    }

    setAccessToken(token);

    getCurrentUser()
      .then((user) => {
        navigate(user.role === "admin" ? "/admin" : "/dashboard", {
          replace: true,
        });
      })
      .catch(() => {
        localStorage.removeItem("access_token");
        navigate("/login?error=google", { replace: true });
      });
  }, [navigate, searchParams]);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="google-title">
        <Link className="auth-brand" to="/">
          <span className="auth-mark"><BookOpen size={20} /></span>
          <span>The Small Voice</span>
        </Link>

        <p className="eyebrow">Google sign-in</p>
        <h1 id="google-title">One moment…</h1>
        <p className="auth-description">
          Connecting your Google account to The Small Voice.
        </p>
      </section>
    </main>
  );
}