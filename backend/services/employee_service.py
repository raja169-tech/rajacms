"""
services/employee_service.py — Employee account management.

Handles:
- Generating unique employee username (EMP + 4-digit number, e.g. EMP0023)
- Creating employee accounts (bcrypt hash, audit log)
- Updating employee details
- Toggling employee active status
"""
import random
import bcrypt
from fastapi import HTTPException, status
from database import get_supabase
from services.audit_service import log_action


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


_MAX_COLLISION_RETRIES = 20


def generate_employee_username() -> str:
    """
    Generate a unique employee username like EMP0042.
    Retries up to _MAX_COLLISION_RETRIES times on collision.
    """
    db = get_supabase()
    for _ in range(_MAX_COLLISION_RETRIES):
        number = str(random.randint(1000, 9999))
        username = f"EMP{number}"
        exists = (
            db.table("users")
            .select("id")
            .eq("login_identifier", username)
            .limit(1)
            .execute()
        )
        if not exists.data:
            return username
    raise RuntimeError(
        "Failed to generate a unique employee username after retries."
    )


async def create_employee(
    display_name: str,
    password: str,
    gender: str,
    phone: str,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """
    Create a new employee account.

    - Generates unique EMP#### username automatically
    - Hashes password with bcrypt (cost=12)
    - Sets force_password_change=True so employee must change password on first login
    - Writes to audit_log
    Returns the created user record (without password_hash).
    """
    db = get_supabase()
    username = generate_employee_username()
    password_hash = hash_password(password)

    result = db.table("users").insert({
        "role": "employee",
        "display_name": display_name,
        "login_identifier": username,
        "password_hash": password_hash,
        "gender": gender,
        "phone": phone,
        "is_active": True,
        "force_password_change": True,
        "created_by": actor_id,
    }).execute()

    created = result.data[0]
    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="create_employee",
        target_table="users",
        target_id=created["id"],
        meta={
            "username": username,
            "display_name": display_name,
            "gender": gender,
            "phone": phone,
        },
        ip_address=ip_address,
    )
    created.pop("password_hash", None)
    return created


async def update_employee(
    employee_id: str,
    updates: dict,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """
    Update editable employee fields.
    Allowed: display_name, gender, phone, is_active.
    """
    db = get_supabase()
    existing = (
        db.table("users")
        .select("*")
        .eq("id", employee_id)
        .eq("role", "employee")
        .maybe_single()
        .execute()
    )
    if not existing or getattr(existing, "data", None) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found"
        )

    safe_fields = {"display_name", "gender", "phone", "is_active"}
    filtered = {k: v for k, v in updates.items() if k in safe_fields}

    result = db.table("users").update(filtered).eq("id", employee_id).execute()
    updated = result.data[0]

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="update_employee",
        target_table="users",
        target_id=employee_id,
        meta={"changes": filtered},
        ip_address=ip_address,
    )
    updated.pop("password_hash", None)
    return updated


async def delete_employee(
    employee_id: str,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """
    Hard delete an employee account.
    """
    db = get_supabase()
    existing = (
        db.table("users")
        .select("id, login_identifier")
        .eq("id", employee_id)
        .eq("role", "employee")
        .maybe_single()
        .execute()
    )
    if not existing or getattr(existing, "data", None) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found"
        )

    # Clean up foreign key constraints first
    db.table("refresh_tokens").delete().eq("user_id", employee_id).execute()
    db.table("audit_log").delete().eq("actor_id", employee_id).execute()
    db.table("audit_log").delete().eq("target_id", employee_id).execute()

    # Delete the record
    db.table("users").delete().eq("id", employee_id).execute()

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="delete_employee",
        target_table="users",
        target_id=employee_id,
        meta={"deleted_username": existing.data.get("login_identifier")},
        ip_address=ip_address,
    )
    return {"message": "Employee deleted successfully"}
