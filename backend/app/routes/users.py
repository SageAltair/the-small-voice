import secrets
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth.google import (
    build_google_authorize_url,
    create_oauth_state,
    exchange_google_code,
    fetch_google_userinfo,
    is_configured,
    verify_oauth_state,
)
from app.auth.security import (
    create_access_token,
    create_email_verification_token,
    decode_email_verification_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.config import FRONTEND_BASE_URL
from app.database import get_db
from app.emailer import send_verification_email
from app.models.tag import Tag
from app.models.user import User
from app.models.resource import Resource
from app.models.story import Story
from app.schemas.user import (
    RegisterResponse,
    ResendVerificationRequest,
    Token,
    UserCreate,
    UserResponse,
)


router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


def _verification_link(request: Request, user_id: int) -> str:
    token = create_email_verification_token(user_id)
    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/users/verify-email?token={quote(token)}"


def _google_redirect_uri(request: Request) -> str:
    return f"{str(request.base_url).rstrip('/')}/users/google/callback"


def _frontend_redirect(path: str) -> RedirectResponse:
    return RedirectResponse(url=f"{FRONTEND_BASE_URL}{path}")


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    user_data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    existing_username = db.execute(
        select(User).where(
            User.username == user_data.username,
        )
    ).scalar_one_or_none()

    if existing_username:
        raise HTTPException(
            status_code=400,
            detail="Username already exists",
        )

    existing_email = db.execute(
        select(User).where(
            User.email == user_data.email,
        )
    ).scalar_one_or_none()

    if existing_email:
        raise HTTPException(
            status_code=400,
            detail="Email already exists",
        )

    user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hash_password(
            user_data.password,
        ),
        role="author",
        is_verified=False,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    verification_url = _verification_link(request, user.id)
    send_verification_email(user.email, verification_url, user.username)

    return {
        "message": (
            "Registration successful! We sent a verification link to your "
            "e-mail. Please click the link to activate your account."
        ),
        "email": user.email,
    }


@router.post(
    "/resend-verification",
    status_code=status.HTTP_200_OK,
)
def resend_verification(
    data: ResendVerificationRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user = db.execute(
        select(User).where(User.email == data.email)
    ).scalar_one_or_none()

    if not user or user.is_verified or user.google_id:
        return {
            "message": "If that account exists and needs verification, a new link has been sent.",
        }

    verification_url = _verification_link(request, user.id)
    send_verification_email(user.email, verification_url, user.username)

    return {
        "message": "If that account exists and needs verification, a new link has been sent.",
    }


@router.get("/verify-email")
def verify_email(
    token: str,
    db: Session = Depends(get_db),
):
    try:
        user_id = decode_email_verification_token(token)
    except ValueError:
        return _frontend_redirect("/login?verified=error")

    user = db.get(User, user_id)

    if user is None:
        return _frontend_redirect("/login?verified=error")

    user.is_verified = True
    db.commit()

    return _frontend_redirect("/login?verified=1")


@router.post(
    "/login",
    response_model=Token,
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.execute(
        select(User).where(
            or_(
                User.username == form_data.username,
                User.email == form_data.username,
            ),
        )
    ).scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )

    if not verify_password(
        form_data.password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="User account is inactive",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Please check your inbox for the verification link.",
        )

    token = create_access_token(
        {
            "sub": str(user.id),
        }
    )

    return {
        "access_token": token,
        "token_type": "bearer",
    }


@router.get("/google/authorize")
def google_authorize(
    request: Request,
    return_url: str | None = None,
):
    if not is_configured():
        # Instead of returning a raw 501, send the user back to the page they
        # came from with a clear banner so they know Google sign-in isn't set
        # up yet (rather than being stuck on an error page).
        target_path = (
            return_url
            if return_url and return_url.startswith("/") and not return_url.startswith("//")
            else "/login"
        )
        return RedirectResponse(
            url=f"{FRONTEND_BASE_URL}{target_path}?google=unconfigured"
        )

    redirect_uri = _google_redirect_uri(request)
    state = create_oauth_state(return_url)
    authorize_url = build_google_authorize_url(redirect_uri, state)
    return RedirectResponse(url=authorize_url)


@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if error:
        return _frontend_redirect("/login?error=google")

    if not code or not state:
        return _frontend_redirect("/login?error=google")

    try:
        return_url = verify_oauth_state(state)
    except Exception:
        return _frontend_redirect("/login?error=google")

    redirect_uri = _google_redirect_uri(request)

    try:
        token_data = exchange_google_code(code, redirect_uri)
    except Exception:
        return _frontend_redirect("/login?error=google")

    access_token = token_data.get("access_token")

    if not access_token:
        return _frontend_redirect("/login?error=google")

    try:
        profile = fetch_google_userinfo(access_token)
    except Exception:
        return _frontend_redirect("/login?error=google")

    email = (profile.get("email") or "").lower()
    google_id = profile.get("sub")

    if not email or not google_id:
        return _frontend_redirect("/login?error=google")

    user = db.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()

    if user is None:
        base_username = (email.split("@", 1)[0] or "user")[:50]
        username = base_username

        if db.execute(
            select(User).where(User.username == username)
        ).scalar_one_or_none():
            username = f"{base_username}_{google_id[-6:]}"

        user = User(
            username=username,
            email=email,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            role="author",
            is_verified=True,
            google_id=google_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # A Google account verified the e-mail; upgrade the existing account.
        user.google_id = google_id
        user.is_verified = True
        user.is_active = True
        db.commit()

    token = create_access_token({"sub": str(user.id)})
    target_base = return_url if return_url.startswith(("http://", "https://")) else FRONTEND_BASE_URL

    return RedirectResponse(
        url=f"{target_base.rstrip('/')}/auth/google?token={token}"
    )


@router.get(
    "/me",
    response_model=UserResponse,
)
def get_me(
    current_user: User = Depends(
        get_current_user,
    ),
):
    return current_user


@router.get("/dashboard")
def dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return only the signed-in contributor's submissions."""
    return {
        "stories": db.execute(select(Story).where(Story.owner_id == current_user.id).order_by(Story.created_at.desc())).scalars().all(),
        "resources": db.execute(select(Resource).where(Resource.owner_id == current_user.id).order_by(Resource.created_at.desc())).scalars().all(),
        "tags": db.execute(select(Tag).where(Tag.owner_id == current_user.id).order_by(Tag.name)).scalars().all(),
    }
