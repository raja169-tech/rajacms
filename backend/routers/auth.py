"""
routers/auth.py — Authentication endpoints.

POST /api/auth/login   — validate credentials, issue tokens, write audit log
POST /api/auth/refresh — rotate refresh token, issue new access token
POST /api/auth/logout  — revoke refresh token
POST /api/auth/change-password — forced password change on first login
"""
import bcrypt
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, status, Depends
from pydantic import BaseModel, Field
from database import get_supabase
from auth.jwt import (
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
    refresh_token_expiry,
    decode_access_token,
)
from auth.rate_limiter import check_rate_limit, clear_rate_limit
from auth.dependencies import get_current_user
from services.audit_service import log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def hash_password(plain: str) -> str:
    """Hash a plain password with bcrypt."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(12)).decode()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    login_identifier: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    role: str
    display_name: str
    force_password_change: bool


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _issue_tokens(user: dict) -> dict:
    """Create a fresh access + refresh token pair for a user and store the refresh token."""
    db = get_supabase()
    access_token = create_access_token(
        user_id=user["id"],
        role=user["role"],
        display_name=user["display_name"],
        force_password_change=user.get("force_password_change", False),
    )
    raw_refresh, refresh_hash = create_refresh_token()
    db.table("refresh_tokens").insert({
        "user_id": user["id"],
        "token_hash": refresh_hash,
        "expires_at": refresh_token_expiry().isoformat(),
    }).execute()
    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "role": user["role"],
        "display_name": user["display_name"],
        "force_password_change": user.get("force_password_change", False),
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request):
    """
    Validate credentials and issue JWT access + refresh tokens.
    Rate limited to 5 attempts per 15 minutes per (identifier + IP).
    """
    check_rate_limit(body.login_identifier, request)
    db = get_supabase()

    result = db.table("users").select("*").eq(
        "login_identifier", body.login_identifier
    ).eq("is_active", True).maybe_single().execute()

    print("SUPABASE RESULT:", result)
    
    user = result.data if result else None

    # Always run bcrypt comparison to avoid timing-based user enumeration
    stored_hash = user["password_hash"] if user else "$2b$12$invalidhashfortimingxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    valid = verify_password(body.password, stored_hash)

    if not user or not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    clear_rate_limit(body.login_identifier, request)
    await log_action(
        actor_id=user["id"],
        actor_role=user["role"],
        action="login",
        ip_address=request.client.host if request.client else None,
    )
    return _issue_tokens(user)


@router.post("/refresh")
async def refresh_token(body: RefreshRequest):
    """
    Exchange a valid refresh token for a new access + refresh token pair.
    The old refresh token is revoked (single-use rotation).
    """
    db = get_supabase()
    token_hash = hash_refresh_token(body.refresh_token)
    now = datetime.now(timezone.utc).isoformat()

    result = db.table("refresh_tokens").select("*, users(*)").eq(
        "token_hash", token_hash
    ).eq("revoked", False).gt("expires_at", now).maybe_single().execute()

    record = result.data
    if not record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Revoke old token
    db.table("refresh_tokens").update({"revoked": True}).eq("id", record["id"]).execute()

    user = record["users"]
    return _issue_tokens(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest):
    """Revoke the refresh token (client should also discard the access token locally)."""
    db = get_supabase()
    token_hash = hash_refresh_token(body.refresh_token)
    db.table("refresh_tokens").update({"revoked": True}).eq("token_hash", token_hash).execute()


@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Forced password change — accessible even when force_pw_change=True.
    After change, clears the force_password_change flag and issues fresh tokens.
    """
    db = get_supabase()
    new_hash = hash_password(body.new_password)

    db.table("users").update({
        "password_hash": new_hash,
        "force_password_change": False,
    }).eq("id", current_user["sub"]).execute()

    # Revoke all existing refresh tokens for this user (force fresh login on other devices)
    db.table("refresh_tokens").update({"revoked": True}).eq(
        "user_id", current_user["sub"]
    ).execute()

    await log_action(
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        action="change_password",
        ip_address=request.client.host if request.client else None,
    )
    
    # Issue fresh tokens so the user doesn't have to log in again immediately
    user = db.table("users").select("*").eq("id", current_user["sub"]).maybe_single().execute().data
    return _issue_tokens(user)
