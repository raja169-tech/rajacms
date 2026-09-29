"""
services/client_service.py — Client account management.

Handles:
- Generating unique 6-digit client codes
- Creating client accounts (bcrypt hash, audit log)
- Updating client details (fee %, limits, active status)
- Soft-deleting clients (is_active=False)
"""
import random
import bcrypt
from fastapi import HTTPException, status
from database import get_supabase
from services.audit_service import log_action


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

_CODE_MIN = 100_000
_CODE_MAX = 999_999
_MAX_COLLISION_RETRIES = 20


def generate_client_code() -> str:
    """
    Generate a unique 6-digit numeric client code.
    Retries up to _MAX_COLLISION_RETRIES times on collision.
    Raises RuntimeError if all retries are exhausted (extremely unlikely).
    """
    db = get_supabase()
    for _ in range(_MAX_COLLISION_RETRIES):
        code = str(random.randint(_CODE_MIN, _CODE_MAX))
        exists = db.table("users").select("id").eq("client_code", code).limit(1).execute()
        if not exists.data:
            return code
    raise RuntimeError("Failed to generate a unique client code after retries. This is extremely unlikely — check DB.")


async def create_client(
    display_name: str,
    password: str,
    fee_percentage: float,
    account_limit: float | None,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """
    Create a new client account.

    - Generates unique 6-digit client_code
    - Hashes password with bcrypt (cost=12)
    - Sets force_password_change=True so client must change password on first login
    - Writes to audit_log
    Returns the created user record (without password_hash).
    """
    db = get_supabase()
    client_code = generate_client_code()
    password_hash = hash_password(password)

    result = db.table("users").insert({
        "role": "client",
        "display_name": display_name,
        "client_code": client_code,
        "login_identifier": client_code,
        "password_hash": password_hash,
        "fee_percentage": str(fee_percentage),
        "account_limit": str(account_limit) if account_limit is not None else None,
        "is_active": True,
        "force_password_change": True,
        "created_by": actor_id,
    }).execute()

    created = result.data[0]
    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="create_client",
        target_table="users",
        target_id=created["id"],
        meta={
            "client_code": client_code,
            "display_name": display_name,
            "fee_percentage": fee_percentage,
            "account_limit": account_limit,
        },
        ip_address=ip_address,
    )
    # Never return the password hash to callers
    created.pop("password_hash", None)
    return created


async def update_client(
    client_id: str,
    updates: dict,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """
    Update editable client fields.
    Allowed fields: display_name, fee_percentage, account_limit, is_active.
    Raises 404 if client not found.
    """
    db = get_supabase()
    existing = db.table("users").select("*").eq("id", client_id).eq("role", "client").maybe_single().execute()
    if not existing or getattr(existing, "data", None) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    # Only allow safe fields
    safe_fields = {"display_name", "fee_percentage", "account_limit", "is_active"}
    filtered = {k: v for k, v in updates.items() if k in safe_fields}

    result = db.table("users").update(filtered).eq("id", client_id).execute()
    updated = result.data[0]

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="update_client",
        target_table="users",
        target_id=client_id,
        meta={"before": existing.data, "changes": filtered},
        ip_address=ip_address,
    )
    updated.pop("password_hash", None)
    return updated


async def deactivate_client(
    client_id: str,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> None:
    """
    Soft-delete a client (is_active=False).
    Financial records are never hard-deleted.
    """
    db = get_supabase()
    existing = db.table("users").select("id, display_name").eq("id", client_id).eq("role", "client").maybe_single().execute()
    if not existing or getattr(existing, "data", None) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    db.table("users").update({"is_active": False}).eq("id", client_id).execute()
    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="deactivate_client",
        target_table="users",
        target_id=client_id,
        meta={"display_name": existing.data["display_name"]},
        ip_address=ip_address,
    )


async def delete_client(
    client_id: str,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """
    Hard delete a client account.
    Removes all associated refresh_tokens, audit_log entries, and transactions first.
    """
    db = get_supabase()
    existing = (
        db.table("users")
        .select("id, display_name, client_code, login_identifier")
        .eq("id", client_id)
        .eq("role", "client")
        .maybe_single()
        .execute()
    )
    if not existing or getattr(existing, "data", None) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Client not found"
        )

    # Clean up foreign key constraints first
    db.table("refresh_tokens").delete().eq("user_id", client_id).execute()
    db.table("audit_log").delete().eq("actor_id", client_id).execute()
    db.table("audit_log").delete().eq("target_id", client_id).execute()
    db.table("transactions").delete().eq("client_id", client_id).execute()

    # Delete the record
    db.table("users").delete().eq("id", client_id).execute()

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="delete_client",
        target_table="users",
        target_id=client_id,
        meta={
            "deleted_name": existing.data.get("display_name"),
            "deleted_code": existing.data.get("client_code"),
        },
        ip_address=ip_address,
    )
    return {"message": "Client deleted successfully"}

