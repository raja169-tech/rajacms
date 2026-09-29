# Raja CMS PWA

An internal Progressive Web Application for managing client cash ledgers, consisting of a Python FastAPI backend and a vanilla HTML/JS frontend.

## Architecture

* **Backend**: Python 3.9+, FastAPI, Pydantic, Supabase (PostgreSQL) via REST API.
* **Frontend**: Vanilla JS (ES6 Modules), Custom CSS Design System, HTML5.
* **Database**: Supabase PostgreSQL with Row Level Security (RLS).
* **Authentication**: JWT-based with Refresh Tokens, RBAC (Admin, Employee, Client).

## Setup & Running Locally

### Backend Setup
1. `cd backend`
2. Create virtual environment: `python -m venv venv`
3. Activate virtual env: `source venv/bin/activate` (Mac/Linux) or `venv\Scripts\activate` (Windows)
4. Install dependencies: `pip install -r requirements.txt`
5. Copy `.env.example` to `.env` and fill in Supabase keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and a secure `JWT_SECRET_KEY`.
6. Apply `migrations/001_initial_schema.sql` to your Supabase project (SQL Editor).
7. Run the dev server: `uvicorn main:app --reload --port 8000`

### Frontend Setup
1. The frontend relies on the backend serving it, or it can be served using any static web server (e.g., `npx serve frontend -p 3000`).
2. Make sure `BASE_URL` in `frontend/js/core/api.js` is updated if the backend runs on a different origin.

## Testing
1. `cd backend`
2. Run `pytest tests/`

## Deployment
* **Backend**: Can be deployed to any ASGI-compatible platform (Render, Railway, Heroku, AWS).
* **Frontend**: Can be hosted on Vercel, Netlify, or served directly by the backend.
* **Storage**: Ensure Supabase Storage bucket `proofs` is created and public.
