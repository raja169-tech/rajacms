"""
main.py — FastAPI application entry point.

Run dev server:
    uvicorn main:app --reload --port 8000

Then open: http://localhost:8000
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from config import get_settings
from routers import auth, admin, employee, client

settings = get_settings()

app = FastAPI(
    title="Raja CMS API",
    description="Internal PWA backend for managing client cash ledgers.",
    version="1.0.0",
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url="/api/redoc" if not settings.is_production else None,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Safe: same-origin in production; dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Disable Browser Caching in Development ──────────────────────────────────
@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.method == "GET":
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# ─── API Routers ──────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(employee.router)
app.include_router(client.router)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}


# ─── Global Exception Handlers ────────────────────────────────────────────────
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi import status as http_status


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = exc.errors()
    detail = "; ".join(
        f"{'.'.join(str(loc) for loc in e['loc'])}: {e['msg']}" for e in errors
    )
    return JSONResponse(
        status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": detail, "code": "VALIDATION_ERROR"},
    )


# ─── Serve Frontend Static Files ──────────────────────────────────────────────
# Must come LAST so API routes take priority
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
FRONTEND_DIR = os.path.abspath(FRONTEND_DIR)

if os.path.exists(FRONTEND_DIR):
    # Serve specific sub-paths explicitly so SPA routing works
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

    @app.get("/")
    @app.get("/index.html")
    async def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/login.html")
    async def serve_login():
        return FileResponse(os.path.join(FRONTEND_DIR, "login.html"))

    @app.get("/admin/{path:path}")
    async def serve_admin(path: str):
        f = os.path.join(FRONTEND_DIR, "admin", path)
        if os.path.isfile(f):
            return FileResponse(f)
        return FileResponse(os.path.join(FRONTEND_DIR, "admin", "index.html"))

    @app.get("/employee/{path:path}")
    async def serve_employee(path: str):
        f = os.path.join(FRONTEND_DIR, "employee", path)
        if os.path.isfile(f):
            return FileResponse(f)
        return FileResponse(os.path.join(FRONTEND_DIR, "employee", "index.html"))

    @app.get("/client/{path:path}")
    async def serve_client(path: str):
        f = os.path.join(FRONTEND_DIR, "client", path)
        if os.path.isfile(f):
            return FileResponse(f)
        return FileResponse(os.path.join(FRONTEND_DIR, "client", "index.html"))

    @app.get("/manifest.json")
    async def serve_manifest():
        return FileResponse(os.path.join(FRONTEND_DIR, "manifest.json"))

    @app.get("/sw.js")
    async def serve_sw():
        return FileResponse(os.path.join(FRONTEND_DIR, "sw.js"))
