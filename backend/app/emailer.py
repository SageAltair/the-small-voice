"""Transactional e-mail helpers.

The website's sending account is thesmallvoice3@gmail.com. Gmail requires an
"App Password" for SMTP (the normal Gmail password will not work). When no
SMTP password is configured the verification link is logged to the server
console so the flow can be tested locally without credentials.
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from html import escape

from app.config import (
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USER,
    SMTP_USE_TLS,
)

logger = logging.getLogger("app.emailer")


def send_email(to_email: str, subject: str, html_body: str, text_body: str = "") -> bool:
    """Send an HTML e-mail via SMTP. Returns True when delivered."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning(
            "SMTP is not configured (SMTP_USER/SMTP_PASSWORD). E-mail to %s was not sent. "
            "Preview printed below.",
            to_email,
        )
        logger.info("───── EMAIL PREVIEW ─────\nSubject: %s\nTo: %s\n\n%s\n─────────────────────────", subject, to_email, html_body)
        return False

    message = MIMEMultipart("alternative")
    message["From"] = formataddr((SMTP_FROM_NAME, SMTP_USER))
    message["To"] = to_email
    message["Subject"] = subject

    if text_body:
        message.attach(MIMEText(text_body, "plain"))
    message.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        server.ehlo()
        if SMTP_USE_TLS:
            server.starttls()
            server.ehlo()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, [to_email], message.as_string())

    return True


def send_verification_email(to_email: str, verification_url: str, username: str = "") -> None:
    """Send the account-activation e-mail with a verification link."""
    greeting = escape(username or to_email.split("@", 1)[0])
    verified_link = escape(verification_url, quote=True)

    subject = "Verify your e-mail — The Small Voice"
    html_body = f"""
    <div style="max-width:520px;margin:0 auto;padding:28px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;font-family:'Poppins',Arial,sans-serif;color:#172033;">
      <p style="margin:0 0 8px;font-size:20px;font-weight:600;font-family:Georgia,serif;">The Small Voice</p>
      <p style="margin:0 0 22px;color:#64748b;font-size:13px;">Stories · Learning · Growth</p>
      <h1 style="margin:0 0 10px;font-size:24px;line-height:1.2;">Welcome, {greeting}!</h1>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
        Thanks for creating an account. Please confirm your e-mail address by
        clicking the button below so we know it belongs to you.
      </p>
      <a href="{verified_link}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;">
        Verify my e-mail
      </a>
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
        If the button does not work, copy and paste this link into your browser:<br />
        <span style="color:#2563eb;word-break:break-all;">{verified_link}</span>
      </p>
      <p style="margin:18px 0 0;border-top:1px solid #e6ebf1;padding-top:14px;color:#94a3b8;font-size:11px;">
        This link expires within 24 hours. If you did not sign up on The Small
        Voice, you can safely ignore this e-mail.
      </p>
    </div>
    """

    text_body = (
        f"Welcome, {greeting}!\n\n"
        "Thanks for creating an account on The Small Voice. Please confirm your "
        f"e-mail address by opening this link:\n\n{verification_url}\n\n"
        "This link expires within 24 hours."
    )

    send_email(to_email, subject, html_body, text_body)