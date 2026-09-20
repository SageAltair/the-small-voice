# Architecture

## Overview

The Small Voice is a full-stack web application built on React + FastAPI + PostgreSQL.
The frontend is a single-page application; the backend serves both the static frontend
files and a JSON API.

## Stack

- **Frontend:** React 19, Vite, React Router v7, lucide-react, react-icons, gsap
- **Backend:** FastAPI 0.116, SQLAlchemy 2.0, Pydantic v2, psycopg3
- **Database:** PostgreSQL
- **Auth:** JWT (python-jose), Google OAuth, email verification via SMTP
- **File handling:** PyMuPDF for PDF thumbnails, local disk storage
- **Deployment:** Render (static frontend + backend web service)

## Directory Map

### frontend/

The React SPA. Vite handles development and production builds.

- src/App.jsx — root component, sets up BrowserRouter, LanguageProvider, and route definitions
- src/main.jsx — React DOM render entry point
- src/components/ — reusable UI: Navbar, Footer, StoryCard, ResourceCard, AudioCard, VideoCard, SearchBar, TagList, Loading, ErrorMessage, BrandMark, NewsletterSignup, SubmissionReview, RichTextEditor, ResourceCarousel, ResourceList, GoogleSignIn
- src/pages/ — page-level components matched to routes: Home, Stories, StoryDetail, Resources, TagStories, About, Contact, Give, Login, Register, GoogleAuthCallback, AuthorDashboard, Admin, AdminStories, PrivacyPolicy, TermsOfUse, NotFound
- src/services/api.js — API client; auto-detects API base URL from the current location
- src/i18n/LanguageContext.jsx — language state provider
- src/hooks/useReveal.js — scroll reveal hook (gsap-based)
- src/index.css — global styles, theme variables, component styles

### backend/app/

The FastAPI application.

- main.py — creates the FastAPI app, mounts static files, registers middleware and routers, serves the frontend
- config.py — loads environment variables from .env, validates required settings
- database.py — SQLAlchemy engine, session factory, table creation, legacy migration, admin user seeding
- media.py — build_resource_cover(): generates cover images for uploaded resources (PDF first page → PNG, images pass through)
- emailer.py — sends SMTP emails (verification, contact form)
- uth/ — Google OAuth flow (google.py) and JWT utilities (security.py)
- models/ — SQLAlchemy models: User, Story, Resource, Tag, Comment, NewsletterSubscription, resource_tag (association table)
- 
outes/ — API routers: users, stories, resources, tags, admin, newsletter, contact
- schemas/ — Pydantic models for request validation and response serialization

## Request Flow

1. Browser requests a page → FastAPI serves frontend/index.html (SPA fallback)
2. React loads,React Router matches the URL to a page component
3. Page components call functions from api.js
4. api.js makes fetch() requests to the same origin (or VITE_API_URL in production)
5. FastAPI route handlers validate input with Pydantic schemas
6. Handlers query/update the database via SQLAlchemy
7. Responses are serialized with Pydantic and returned as JSON

## Authentication Flow

- Login/register submits credentials to /users/token
- Backend returns a JWT access token
- api.js stores the token in localStorage as 'access_token'
- Subsequent requests include Authorization: Bearer <token> header
- Google OAuth: user clicks 'Sign in with Google' → redirected to Google → callback at /users/google/callback → token issued → redirect to dashboard

## Database Schema

Tables created by SQLAlchemy Base.metadata.create_all():

- users (id, username, email, hashed_password, full_name, role, is_active, is_verified, google_id, created_at, updated_at)
- stories (id, title, content, excerpt, category, language, owner_id, published, featured, published_at, created_at, updated_at, deleted_at)
- resources (id, title, description, url, resource_type, language, owner_id, status, featured, homepage_visible, display_order, published_at, scheduled_for, download_enabled, share_enabled, save_enabled, created_at, updated_at, deleted_at)
- tags (id, name, slug, created_at)
- story_tags (story_id, tag_id) — association table
- resource_tags (resource_id, tag_id) — association table
- comments (id, story_id, author, content, created_at)
- newsletter_subscriptions (id, email, subscribed_at)

## Environment Variables

See .env.example for the complete list. The most critical are:

- DATABASE_URL — PostgreSQL connection string
- SECRET_KEY — JWT signing key
- FRONTEND_ORIGINS — allowed CORS origins
- SMTP_* — email sending configuration
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — optional Google OAuth

## Deployment

Render blueprint (render.yaml):

- Frontend: static site from frontend/dist, built with npm install && npm run build
- Backend: Python web service, started with uvicorn
- VITE_API_URL is injected from the backend service URL

## Development Notes

- The backend serves the frontend build at / and /{path} for SPA routing
- During development, use the Vite dev server (port 5173) and the backend runs on port 8000
- api.js detects the host and connects to port 8000 automatically in development
- Uploaded files are stored in backend/uploads/ and served at /uploads/
- The admin user is created/synchronized on every backend startup
- Logs go to backend/server.log and should be checked for errors
