"""Google OAuth 2.0 helpers for the "Continue with Google" sign-in flow.

Uses only the Python standard library plus python-jose (already a dependency).
"""

import json
from typing import Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from jose import JWTError, jwt

from app.config import ALGORITHM, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SECRET_KEY

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_SCOPES = "openid email profile"


class GoogleOAuthError(Exception):
    pass


def is_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def create_oauth_state(return_url: Optional[str] = None) -> str:
    """Return a short-lived signed state value to protect the callback (CSRF)."""
    return jwt.encode(
        {
            "type": "oauth_state",
            "return_url": return_url or "",
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def verify_oauth_state(state: str) -> str:
    """Validate the state value and return the encoded return_url."""
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise GoogleOAuthError("Invalid OAuth state")

    if payload.get("type") != "oauth_state":
        raise GoogleOAuthError("Invalid OAuth state")

    return str(payload.get("return_url") or "")


def build_google_authorize_url(redirect_uri: str, state: str) -> str:
    return GOOGLE_AUTH_URL + "?" + urlencode(
        {
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": GOOGLE_SCOPES,
            "access_type": "online",
            "prompt": "select_account",
            "state": state,
        }
    )


def exchange_google_code(code: str, redirect_uri: str) -> dict:
    """Swap the authorisation code for Google access/ID tokens."""
    body = urlencode(
        {
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
    ).encode("utf-8")

    request = Request(
        GOOGLE_TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise GoogleOAuthError(f"Could not exchange Google code: {exc}")


def fetch_google_userinfo(access_token: str) -> dict:
    """Fetch the signed-in Google user's profile (email, sub, name, picture)."""
    request = Request(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )

    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise GoogleOAuthError(f"Could not fetch Google profile: {exc}")