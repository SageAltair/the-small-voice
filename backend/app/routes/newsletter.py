from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.newsletter import NewsletterSubscription
from app.schemas.newsletter import (
    NewsletterSubscriptionCreate,
    NewsletterSubscriptionResponse,
)


router = APIRouter(prefix="/newsletter", tags=["Newsletter"])


@router.post(
    "/subscribe",
    response_model=NewsletterSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
def subscribe(
    subscription_data: NewsletterSubscriptionCreate,
    db: Session = Depends(get_db),
):
    existing = db.execute(
        select(NewsletterSubscription).where(
            NewsletterSubscription.email == subscription_data.email,
        )
    ).scalar_one_or_none()

    if existing:
        return {"message": "You are already subscribed."}

    db.add(NewsletterSubscription(email=subscription_data.email))
    db.commit()
    return {"message": "You are subscribed to The Small Voice."}
