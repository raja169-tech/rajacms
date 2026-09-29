"""
auth/jwt.py — JWT access token and opaque refresh token management.

Access token:  JWT, 15-min expiry, signed with JWT_SECRET (HS256)
Refresh token: cryptographically random 64-byte hex string, SHA-256 hashed before DB storage
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from config import get_settings

settings = get_settings()


# ─── Access Token ──────────────────────────────────────────────────────────────

def create_access_token(
    user_id: str,
    role: str,
    display_name: str,
    force_password_change: bool = False,
) -> str:
    """
    Create a signed JWT access token.

    Payload:
        sub             — user UUID (string)
        role            — 'admin' | 'employee' | 'client'
        display_name    — for UI display without an extra API call
        force_pw_change — client must change password before accessing app
        iat             — issued at
        exp             — expiry (15 min from now)
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "role": role,
        "display_name": display_name,
        "force_pw_change": force_password_change,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """
    Decode and verify a JWT access token.
    Raises jose.JWTError on invalid/expired tokens.
    """
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


# ─── Refresh Token ─────────────────────────────────────────────────────────────

def create_refresh_token() -> tuple[str, str]:
    """
    Generate a new opaque refresh token.

    Returns:
        raw_token  — 128-char hex string to send to the client
        token_hash — SHA-256 hash to store in the database
    """
    raw_token = secrets.token_hex(64)          # 64 bytes → 128 hex chars
    token_hash = _hash_token(raw_token)
    return raw_token, token_hash


def hash_refresh_token(raw_token: str) -> str:
    """Hash an incoming refresh token for database lookup."""
    return _hash_token(raw_token)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
