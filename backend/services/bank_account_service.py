"""
services/bank_account_service.py — Bank account (collection account) management.

Handles:
- Creating/updating collection bank accounts
- Computing cumulative usage and remaining capacity
- Per-account enable/disable toggle
- Bulk "Disable All" action (single DB call, single audit log entry)
- Listing eligible accounts for client Pay-In selection
"""
from decimal import Decimal
from fastapi import HTTPException, status
from database import get_supabase
from services.audit_service import log_action


async def get_account_capacity(account_id: str) -> dict:
    """
    Compute capacity metrics for a single bank account.

    Cumulative usage = SUM(gross_amount) of:
      - approved pay_in transactions (already counted)
      - pending pay_in transactions (reserved to prevent overshoot)

    Returns: { limit_amount, used_amount, remaining_capacity }
    limit_amount = None means unlimited.
    """
    db = get_supabase()
    account = db.table("company_bank_accounts").select("*").eq("id", account_id).maybe_single().execute()
    if not account.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bank account not found")

    acc = account.data

    # Sum approved + pending + employee_approved pay_in usage against this account
    usage_result = db.table("transactions").select("gross_amount").eq(
        "bank_account_id", account_id
    ).eq("type", "pay_in").in_("status", ["approved", "pending", "employee_approved"]).execute()

    used = Decimal("0.00")
    for row in (usage_result.data or []):
        used += Decimal(str(row["gross_amount"]))

    limit = Decimal(str(acc["limit_amount"])) if acc["limit_amount"] is not None else None
    remaining = (limit - used) if limit is not None else None

    return {
        **acc,
        "used_amount": float(used),
        "remaining_capacity": float(remaining) if remaining is not None else None,
    }


async def get_eligible_accounts_for_client() -> list[dict]:
    """
    Return accounts that a client may select on the Pay-In form:
    - is_active = True
    - remaining_capacity > 0 (or limit_amount is null/unlimited)
    Each account includes its remaining_capacity for display.
    """
    db = get_supabase()
    accounts = db.table("company_bank_accounts").select("*").eq("is_active", True).execute()
    eligible = []
    for acc in (accounts.data or []):
        capacity = await get_account_capacity(acc["id"])
        remaining = capacity["remaining_capacity"]
        if remaining is None or remaining > 0:
            eligible.append(capacity)
    return eligible


async def create_bank_account(
    label: str,
    upi_id: str | None,
    account_number: str | None,
    ifsc: str | None,
    limit_amount: float | None,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    db = get_supabase()
    result = db.table("company_bank_accounts").insert({
        "label": label,
        "upi_id": upi_id,
        "account_number": account_number,
        "ifsc": ifsc,
        "limit_amount": str(limit_amount) if limit_amount is not None else None,
        "is_active": True,
        "created_by": actor_id,
    }).execute()

    created = result.data[0]
    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="create_bank_account",
        target_table="company_bank_accounts",
        target_id=created["id"],
        meta={"label": label, "limit_amount": limit_amount},
        ip_address=ip_address,
    )
    return created


async def update_bank_account(
    account_id: str,
    updates: dict,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """Update editable fields: label, upi_id, account_number, ifsc, limit_amount."""
    db = get_supabase()
    safe_fields = {"label", "upi_id", "account_number", "ifsc", "limit_amount"}
    filtered = {k: v for k, v in updates.items() if k in safe_fields}

    existing = db.table("company_bank_accounts").select("*").eq("id", account_id).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bank account not found")

    result = db.table("company_bank_accounts").update(filtered).eq("id", account_id).execute()
    updated = result.data[0]

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="update_bank_account",
        target_table="company_bank_accounts",
        target_id=account_id,
        meta={"before": existing.data, "changes": filtered},
        ip_address=ip_address,
    )
    return updated


async def toggle_bank_account(
    account_id: str,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """Flip is_active for a single bank account."""
    db = get_supabase()
    existing = db.table("company_bank_accounts").select("id, label, is_active").eq("id", account_id).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bank account not found")

    new_state = not existing.data["is_active"]
    result = db.table("company_bank_accounts").update({"is_active": new_state}).eq("id", account_id).execute()

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="toggle_bank_account",
        target_table="company_bank_accounts",
        target_id=account_id,
        meta={"label": existing.data["label"], "is_active": new_state},
        ip_address=ip_address,
    )
    return result.data[0]


async def disable_all_accounts(
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> int:
    """
    Bulk-disable every bank account in a single DB UPDATE.
    Writes ONE audit_log entry with the total count affected.
    Returns the number of accounts disabled.
    """
    db = get_supabase()
    # Only disable currently active ones (idempotent)
    result = db.table("company_bank_accounts").update({"is_active": False}).eq("is_active", True).execute()
    count = len(result.data or [])

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="disable_all_accounts",
        target_table="company_bank_accounts",
        meta={"accounts_disabled": count},
        ip_address=ip_address,
    )
    return count


async def delete_bank_account(
    account_id: str,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """
    Hard delete a bank account.
    Fails with 400 Bad Request if any transactions are associated with this account.
    """
    db = get_supabase()
    existing = db.table("company_bank_accounts").select("id, label").eq("id", account_id).maybe_single().execute()
    if not existing or getattr(existing, "data", None) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bank account not found")

    # Check for associated transactions
    txns = db.table("transactions").select("id", count="exact").eq("bank_account_id", account_id).limit(1).execute()
    if txns.count and txns.count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Cannot delete bank account because it is linked to existing transactions. Please disable it instead."
        )

    # Safe to delete
    db.table("company_bank_accounts").delete().eq("id", account_id).execute()

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="delete_bank_account",
        target_table="company_bank_accounts",
        target_id=account_id,
        meta={"deleted_label": existing.data.get("label")},
        ip_address=ip_address,
    )
    return {"message": "Bank account deleted successfully"}
