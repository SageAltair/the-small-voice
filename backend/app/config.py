import os
from pathlib import Path

from dotenv import load_dotenv


# Load the backend/.env file no matter which directory the server is started
# from. Variables already present in the environment still take precedence.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


DATABASE_URL = os.getenv("DATABASE_URL")

SECRET_KEY = os.getenv("SECRET_KEY")

ALGORITHM = os.getenv(
    "ALGORITHM",
    "HS256",
)

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv(
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        "60",
    )
)

EMAIL_VERIFICATION_EXPIRE_HOURS = int(
    os.getenv(
        "EMAIL_VERIFICATION_EXPIRE_HOURS",
        "24",
    )
)

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "change-admin-password")

# Inbox that receives Contact-Us and feedback submissions from the website.
# Falls back to the administrator address so a deployment without extra
# configuration still delivers mail somewhere sensible.
CONTACT_EMAIL = os.getenv("CONTACT_EMAIL", ADMIN_EMAIL)

# Browser URL the single-page app is served from. Used as the landing target
# after email verification and Google sign-in callbacks.
FRONTEND_BASE_URL = os.getenv(
    "FRONTEND_BASE_URL",
    "http://localhost:5173",
).rstrip("/")

# Comma-separated browser origins allowed to call this API. Keep the local
# Vite origins as sensible defaults and set this to the deployed frontend URL.
FRONTEND_ORIGINS = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,https://the-small-voice-frontend.onrender.com",
)

# ---------------------------------------------------------------------------
# Google OAuth ("Continue with Google" sign-in)
#
# Create credentials at https://console.cloud.google.com/apis/credentials
# (OAuth client ID, type "Web application") and add the authorised redirect
# URI(s):
#   http://127.0.0.1:8000/users/google/callback        (local dev)
#   https://the-small-voice.onrender.com/users/google/callback  (production)
# ---------------------------------------------------------------------------
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

# ---------------------------------------------------------------------------
# Verification e-mail (SMTP)
#
# The default account for this site is thesmallvoice3@gmail.com. Gmail now
# requires an "App Password" for SMTP (Google Account → Security → 2-Step
# Verification → App passwords); set SMTP_PASSWORD to that 16-character
# password. When SMTP_PASSWORD is empty the server logs the verification
# link to the console instead of sending e-mail (handy for local testing).
# ---------------------------------------------------------------------------
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "thesmallvoice3@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes", "on"}
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "The Small Voice")

# Address used in the From header and SMTP envelope. Defaults to the SMTP
# login (Gmail requires them to match). Set it explicitly when the provider's
# login is not a real mailbox, e.g. SendGrid (username "apikey") or Brevo.
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)

if not SMTP_PASSWORD:
    # Make the misconfiguration obvious at startup instead of when the first
    # visitor submits the contact form or tries to verify their account.
    import logging

    logging.getLogger("app.config").warning(
        "SMTP_PASSWORD is not set - outgoing e-mail (account verification, "
        "contact form, feedback) is disabled until it is configured in .env."
    )


if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not configured"
    )


if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not configured"
    )
