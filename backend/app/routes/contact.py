from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from app.config import CONTACT_EMAIL
from app.emailer import send_email


router = APIRouter()


class ContactForm(BaseModel):
    name: str
    email: EmailStr
    subject: str
    message: str


class FeedbackForm(BaseModel):
    name: str
    email: EmailStr
    message: str


@router.post("/contact")
def submit_contact(form: ContactForm):
    subject = f"Contact form: {form.subject}"
    text_body = (
        f"Name: {form.name}\n"
        f"Email: {form.email}\n\n"
        f"{form.message}"
    )
    html_body = f"""
    <div style="max-width:520px;margin:0 auto;padding:28px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;font-family:'Poppins',Arial,sans-serif;color:#172033;">
      <p style="margin:0 0 8px;font-size:20px;font-weight:600;font-family:Georgia,serif;">The Small Voice</p>
      <p style="margin:0 0 22px;color:#64748b;font-size:13px;">Stories · Learning · Growth</p>
      <h1 style="margin:0 0 10px;font-size:22px;line-height:1.2;">New contact message</h1>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Someone submitted a message through the contact form.
      </p>
      <p style="margin:0 0 6px;color:#64748b;font-size:13px;"><strong>Name:</strong> {escape_html(form.name)}</p>
      <p style="margin:0 0 6px;color:#64748b;font-size:13px;"><strong>Email:</strong> {escape_html(form.email)}</p>
      <p style="margin:0 0 6px;color:#64748b;font-size:13px;"><strong>Subject:</strong> {escape_html(form.subject)}</p>
      <p style="margin:0 0 0;color:#64748b;font-size:13px;"><strong>Message:</strong><br/>{escape_html(form.message).replace(chr(10), "<br/>")}</p>
    </div>
    """
    delivered = send_email(
        CONTACT_EMAIL,
        subject,
        html_body,
        text_body,
        reply_to=form.email,
    )
    if not delivered:
        raise HTTPException(status_code=503, detail="E-mail service is not configured.")
    return {"status": "sent"}


@router.post("/feedback")
def submit_feedback(form: FeedbackForm):
    subject = "New feedback from The Small Voice"
    text_body = (
        f"Name: {form.name}\n"
        f"Email: {form.email}\n\n"
        f"{form.message}"
    )
    html_body = f"""
    <div style="max-width:520px;margin:0 auto;padding:28px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;font-family:'Poppins',Arial,sans-serif;color:#172033;">
      <p style="margin:0 0 8px;font-size:20px;font-weight:600;font-family:Georgia,serif;">The Small Voice</p>
      <p style="margin:0 0 22px;color:#64748b;font-size:13px;">Stories · Learning · Growth</p>
      <h1 style="margin:0 0 10px;font-size:22px;line-height:1.2;">New feedback received</h1>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Someone submitted feedback through the website.
      </p>
      <p style="margin:0 0 6px;color:#64748b;font-size:13px;"><strong>Name:</strong> {escape_html(form.name)}</p>
      <p style="margin:0 0 6px;color:#64748b;font-size:13px;"><strong>Email:</strong> {escape_html(form.email)}</p>
      <p style="margin:0 0 0;color:#64748b;font-size:13px;"><strong>Feedback:</strong><br/>{escape_html(form.message).replace(chr(10), "<br/>")}</p>
    </div>
    """
    delivered = send_email(
        CONTACT_EMAIL,
        subject,
        html_body,
        text_body,
        reply_to=form.email,
    )
    if not delivered:
        raise HTTPException(status_code=503, detail="E-mail service is not configured.")
    return {"status": "sent"}


def escape_html(value: str) -> str:
    from html import escape as _escape
    return _escape(value)
