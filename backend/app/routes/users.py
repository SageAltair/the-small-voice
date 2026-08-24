from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    Token,
    UserCreate,
    UserResponse,
)


router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    user_data: UserCreate,
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
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


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
            User.username == form_data.username,
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

    token = create_access_token(
        {
            "sub": str(user.id),
        }
    )

    return {
        "access_token": token,
        "token_type": "bearer",
    }


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