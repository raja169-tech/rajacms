"""
auth/dependencies.py — FastAPI dependency injectors for authentication and RBAC.

Usage in route handlers:
    current_user = Depends(get_current_user)
    admin_user   = Depends(require_role(["admin"]))
    staff_user   = Depends(require_role(["admin", "employee"]))
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from auth.jwt import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """
    Validate the Bearer JWT in the Authorization header.
    Returns the decoded token payload (sub, role, display_name, force_pw_change).
    Raises 401 if token is missing, invalid, or expired.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def require_role(allowed_roles: list[str]):
    """
    Factory that returns a FastAPI dependency which:
    1. Validates the JWT (via get_current_user).
    2. Asserts the user's role is in allowed_roles.
    3. Asserts the user has completed their forced password change (if applicable).
    Raises 403 on insufficient permissions.
    """
    async def _checker(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access restricted to: {', '.join(allowed_roles)}",
            )
        # Block access until forced password change is done (except the change-password endpoint itself)
        if current_user.get("force_pw_change"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password change required before accessing this resource",
                headers={"X-Force-Password-Change": "true"},
            )
        return current_user

    return _checker
