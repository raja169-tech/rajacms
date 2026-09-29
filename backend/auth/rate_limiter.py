"""
auth/rate_limiter.py — In-memory sliding-window rate limiter for login attempts.

Limits: 5 attempts per 15 minutes per (login_identifier + IP).
After the limit is hit the next attempt returns 429 Too Many Requests.

Note: This in-memory store resets on server restart and does NOT share state
across multiple Uvicorn worker processes. For multi-worker production deployments,
replace the store with a Redis-backed implementation (e.g., slowapi with Redis).
"""
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request, status

# Sliding window parameters
MAX_ATTEMPTS = 5
WINDOW_SECONDS = 15 * 60   # 15 minutes

# Store: key → deque of timestamps
_attempts: dict[str, deque] = defaultdict(deque)


def _window_key(login_identifier: str, request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{login_identifier}:{ip}"


def check_rate_limit(login_identifier: str, request: Request) -> None:
    """
    Record a login attempt and raise 429 if the rate limit is exceeded.
    Call this BEFORE validating credentials (so failed and successful attempts both count).
    """
    key = _window_key(login_identifier, request)
    now = time.monotonic()
    window = _attempts[key]

    # Drop timestamps outside the current window
    while window and window[0] < now - WINDOW_SECONDS:
        window.popleft()

    if len(window) >= MAX_ATTEMPTS:
        oldest = window[0]
        retry_after = int(WINDOW_SECONDS - (now - oldest)) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {retry_after // 60} minute(s).",
            headers={"Retry-After": str(retry_after)},
        )

    window.append(now)


def clear_rate_limit(login_identifier: str, request: Request) -> None:
    """
    Clear the attempt counter on a successful login.
    Prevents a legitimate user from being locked out after a previous failure streak.
    """
    key = _window_key(login_identifier, request)
    _attempts.pop(key, None)
