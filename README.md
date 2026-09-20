# The Small Voice

A full-stack content platform that helps people move from stories to learning, growth, community, and mission.

## Technology Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend   | React 19 + Vite + React Router v7   |
| Backend    | FastAPI + SQLAlchemy 2.0            |
| Database   | PostgreSQL (psycopg3)               |
| Auth       | JWT + Google OAuth + email verify   |
| Styling    | CSS (vanilla, no Tailwind)          |
| Deployment | Render (frontend static + backend)  |

## Repository Structure

`	ext
the-small-voice/
├── frontend/              React SPA (Vite)
│   ├── public/           Static assets served as-is
│   ├── src/
│   │   ├── components/   Reusable UI components
│   │   ├── pages/        Route Page components
│   │   ├── services/     API client (api.js)
│   │   ├── i18n/         Language context
│   │   ├── hooks/        Custom React hooks
│   │   ├── assets/       Project images/icons
│   │   ├── App.jsx       Root component + routing
│   │   └── main.jsx      Entry point
│   ├── index.html        HTML shell
│   ├── package.json
│   ├── vite.config.js
│   └── eslint.config.js
│
├── backend/              FastAPI application
│   ├── app/
│   │   ├── main.py       Application factory + route registration
│   │   ├── config.py     Environment configuration
│   │   ├── database.py   SQLAlchemy setup + migrations
│   │   ├── media.py      Upload cover-image helpers
│   │   ├── emailer.py    SMTP email sending
│   │   ├── auth/         Authentication (Google OAuth, JWT)
│   │   ├── models/       SQLAlchemy database models
│   │   ├── routes/       API route handlers
│   │   └── schemas/      Pydantic request/response schemas
│   ├── tests/            Backend tests
│   ├── uploads/          User-uploaded files (gitignored in production)
│   ├── requirements.txt
│   ├── runtime.txt       Python version pin
│   └── .env              Environment variables (DO NOT commit)
│
├── .env.example          Safe environment template (copy to .env)
├── .gitignore           Git ignore rules (root-level)
├── render.yaml          Render deployment configuration
└── README.md            This file
`

## Architecture

`
Browser
  ↓
React SPA (frontend/)  —  routes, components, state
  ↓ HTTP/JSON (VITE_API_URL or same-origin)
FastAPI (backend/app/main.py)  —  serves frontend + API
  ↓
Route handlers (backend/app/routes/)
  ↓
Pydantic schemas (backend/app/schemas/)
  ↓
SQLAlchemy models (backend/app/models/)
  ↓
PostgreSQL
`

### Frontend to Backend Connection

- The backend serves the built frontend from backend/app/main.py at / and /{path}.
- During development, the Vite dev server runs on port 5173 and the API client connects to the backend on port 8000.
- In production (Render), the frontend is a static site built by npm run build; the backend serves it and handles all API routes.

### API Structure

| Route prefix      | Responsibility                        |
|-------------------|---------------------------------------|
| /users/*          | Registration, login, verification     |
| /stories/*        | Story CRUD, likes, comments, tags     |
| /resources/*      | Resource listing, search, download    |
| /tags/*           | Tag listing                           |
| /admin/*          | Admin CRUD for stories, resources     |
| /newsletter/*     | Newsletter subscriptions              |
| /contact          | Contact form submissions              |
| /health           | Health check                          |

### Authentication

1. JWT tokens — issued on login/register, stored in localStorage as access_token.
2. Google OAuth — optional Continue with Google flow; callback at /users/google/callback.
3. Email verification — new accounts must verify via email before signing in.
4. Role-based access — admin role can manage all content; authors can manage their own.

## Environment Setup

`ash
# 1. Copy the environment template
cp .env.example .env

# 2. Edit .env with your values (especially DATABASE_URL, SECRET_KEY, SMTP_*)

# 3. Install backend dependencies
cd backend
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt

# 4. Install frontend dependencies
cd ../frontend
npm install
`

## Running Locally

### Backend

`ash
cd backend
.venv/Scripts/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
`

The backend serves the built frontend at http://localhost:8000. If the frontend has not been built yet, you will see a JSON message instead of the app.

### Frontend (development)

`ash
cd frontend
npm run dev
`

Vite serves on http://localhost:5173. The src/services/api.js module detects the host and connects to the backend on port 8000 automatically.

### Both together

The typical local workflow is:

1. Start the backend on port 8000.
2. Start the frontend dev server on port 5173.
3. Open http://localhost:5173 in the browser.

## Building for Production

`ash
cd frontend
npm run build
`

The output goes to frontend/dist/. The backend serves these static files when available.

## Deployment (Render)

The repository includes render.yaml, a Render Blueprint that defines:

- A static web service for the frontend (frontend/, built with npm install && npm run build).
- Environment variable VITE_API_URL injected from the backend service URL.

See render.yaml for the exact configuration.

## Database

The application uses PostgreSQL. On first startup, backend/app/database.py:

1. Creates all tables via Base.metadata.create_all(bind=engine).
2. Runs migrate_legacy_schema() to add missing columns to existing tables.
3. Runs migrate_resource_schema() to bring the resources table up to date.
4. Creates the default admin user if one does not exist.

`	ext
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/the_small_voice
`

## Key Models

| Model                | Purpose                                    |
|----------------------|--------------------------------------------|
| User                 | Accounts, roles, Google OAuth linkage      |
| Story                | Articles with title, content, category     |
| Resource             | Learning materials with file uploads       |
| Tag                  | Topic labels for stories                   |
| Comment              | Unauthenticated comments on stories        |
| NewsletterSubscription | Email newsletter signups                |
| resource_tag         | Many-to-many link between resources and tags |

## Troubleshooting

### Backend will not start

- Check that DATABASE_URL in .env points to a running PostgreSQL instance.
- Check backend/server.log for stack traces.
- Run alembic upgrade head if you have Alembic migrations set up.

### Frontend can not reach the API

- During development, the Vite dev server proxies to port 8000 automatically.
- In production, VITE_API_URL must be set to the deployed backend URL.
- Check browser dev tools > Network tab for failing requests.

### CORS errors

- FRONTEND_ORIGINS in .env must include the origin making the request.
- The default includes localhost:5173, 127.0.0.1:5173, and the Render frontend URL.

### Admin can not sign in

- The default credentials are admin / change-admin-password (or whatever you set in .env).
- The admin account is created and synchronized on every backend startup.
- Check that ADMIN_EMAIL and ADMIN_PASSWORD in .env are correct.

## Tests

`ash
cd backend
.venv/Scripts/activate
pytest
`

## License

This project is part of The Small Voice ministry platform.
