from pydantic import BaseModel, EmailStr


class NewsletterSubscriptionCreate(BaseModel):
    email: EmailStr


class NewsletterSubscriptionResponse(BaseModel):
    message: str
