# Day 6 - Content Architecture & Discovery

## Objective

Expand The Small Voice from a basic blog API
into a structured content platform.

## Features

- Stories
- Tags
- Many-to-many story/tag relationships
- Learning resources
- Resource types
- Resource filtering
- Search
- Related stories
- Content discovery

## Content Flow

Story
↓
Tags
↓
Related Stories
↓
Learning
↓
Resources
↓
Practice
↓
Growth
↓
Community
↓
Mission

## Day 6 Challenges

- [ ] Create tags
- [ ] Prevent duplicate tags
- [ ] Connect stories to tags
- [ ] Retrieve stories by tag
- [ ] Search stories
- [ ] Filter resources
- [ ] Search resources
- [ ] Build related stories
- [ ] Exclude current story from recommendations
- [ ] Limit recommendations

## Key Concepts

- Database relationships
- Many-to-many relationships
- Foreign keys
- SQLAlchemy relationships
- Search
- Filtering
- Recommendation logic
- Information architecture

## Admin Access

The backend creates an administrator on first startup. Local defaults are
`admin` / `change-admin-password`. Set these variables in `.env` before
deployment:

```env
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
FRONTEND_ORIGINS=https://your-frontend-domain.example.com
```

`FRONTEND_ORIGINS` may contain multiple comma-separated domains. The configured
administrator password is synchronized at startup, so setting these variables
and redeploying also resets a previously created administrator account.

Open `/admin` in the frontend to sign in and manage stories, resources,
topics, and contributors.

## Accounts & E-mail Verification

New accounts must verify their e-mail before they can sign in. The site
sends verification e-mails from `thesmallvoice3@gmail.com`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=thesmallvoice3@gmail.com
# Gmail App Password (16 characters) — not the normal Gmail password.
# Google Account -> Security -> 2-Step Verification -> App passwords
SMTP_PASSWORD=replace-with-gmail-app-password
SMTP_FROM_NAME=The Small Voice
FRONTEND_BASE_URL=http://localhost:5173   # or https://your-frontend-domain.example.com
```

> When `SMTP_PASSWORD` is left empty the server logs the verification link to
> the console instead of sending e-mail, which is handy for local testing.
> The link closes at `/users/verify-email?token=...` and valid for 24 hours
> (`EMAIL_VERIFICATION_EXPIRE_HOURS`).

Existing accounts created before this feature are automatically treated as
verified on startup. New registrations start unverified and sign-in is blocked
until the link in the e-mail is clicked. A `/users/resend-verification`
endpoint lets users request a new link.

## Google Sign-In ("Continue with Google")

The register and login pages offer Google OAuth. Configure it in
`.env`/deployment:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Create credentials in the
[Google Cloud Console](https://console.cloud.google.com/apis/credentials)
as an OAuth client of type *Web application*, and register the callback as an
authorised redirect URI:

- Local: `http://127.0.0.1:8000/users/google/callback`
- Production: `https://<your-backend-domain>/users/google/callback`

Google users are created automatically with a verified e-mail and land on the
contributor dashboard after signing in.
