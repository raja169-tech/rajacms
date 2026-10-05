"""
services/transaction_service.py — Core financial business logic.

ALL money math uses Python's Decimal with ROUND_HALF_UP.
NEVER use float for financial calculations.

Responsibilities:
- Fee and net amount calculation (Pay-In only; Pay-Out has no fee)
- Client balance derivation (total, withdrawable, on-hold, next_unlock_at)
- Account limit enforcement (per-client cap)
- Bank account capacity enforcement (including pending reservations)
- 24-hour maturity hold enforcement
- Pay-In submission and approval
- Pay-Out submission and approval
- Stale pending notification check (> 12 hours)
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from fastapi import HTTPException, status
from database import get_supabase
from services.audit_service import log_action


# ─── Money Math ───────────────────────────────────────────────────────────────

TWO_PLACES = Decimal("0.01")


def calculate_pay_in_amounts(gross_amount: Decimal, fee_percentage: Decimal) -> dict:
    """
    Calculate fee and net amounts for a Pay-In.

    Formula:
        fee_amount = round(gross * fee_pct / 100, 2)   [ROUND_HALF_UP]
        net_amount = gross - fee_amount

    Example: gross=2,00,000 @ 2% → fee=4,000 → net=1,96,000

    Returns: { gross_amount, fee_percentage, fee_amount, net_amount }
    """
    fee_amount = (gross_amount * fee_percentage / Decimal("100")).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )
    net_amount = gross_amount - fee_amount
    return {
        "gross_amount": gross_amount,
        "fee_percentage": fee_percentage,
        "fee_amount": fee_amount,
        "net_amount": net_amount,
    }


# ─── Balance Calculation ──────────────────────────────────────────────────────

async def get_client_balance(client_id: str) -> dict:
    """
    Compute a client's balance metrics entirely from the immutable transaction log.
    Never relies on a cached/stored balance column.

    Returns:
        total_balance     — SUM(net_amount pay_in approved) - SUM(gross_amount pay_out approved)
        withdrawable_now  — matured pay_ins - approved pay_outs - pending pay_outs
        on_hold_amount    — total_balance - withdrawable_now
        next_unlock_at    — ISO timestamp of the earliest still-locked approved pay_in (or None)
        has_stale_pending — True if any Pay-In has been pending > 12 hours
    """
    db = get_supabase()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    txns = db.table("transactions").select(
        "type, status, gross_amount, net_amount, matures_at, created_at"
    ).eq("client_id", client_id).execute()

    rows = txns.data or []

    total_balance = Decimal("0.00")
    withdrawable = Decimal("0.00")
    next_unlock_at = None
    has_stale_pending = False

    for row in rows:
        t = row["type"]
        s = row["status"]
        gross = Decimal(str(row["gross_amount"]))
        net = Decimal(str(row["net_amount"]))
        matures_at = row.get("matures_at")
        created_at_str = row.get("created_at", "")

        if t == "pay_in" and s == "approved":
            total_balance += net
            if matures_at and matures_at <= now_iso:
                withdrawable += net
            elif matures_at:
                # Still locked — track earliest unlock
                if next_unlock_at is None or matures_at < next_unlock_at:
                    next_unlock_at = matures_at

        elif t == "pay_out" and s == "approved":
            total_balance -= gross
            withdrawable -= gross

        elif t == "pay_out" and s in ("pending", "employee_approved"):
            # Reserve pending/employee_approved pay_outs against withdrawable
            withdrawable -= gross

        # Stale pending check (pay_in pending or employee_approved > 12 hours)
        if t == "pay_in" and s in ("pending", "employee_approved") and created_at_str:
            created_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            age_hours = (now - created_dt).total_seconds() / 3600
            if age_hours > 12:
                has_stale_pending = True

    # Clamp withdrawable to 0 in edge cases (shouldn't happen, but guard)
    if withdrawable < Decimal("0.00"):
        withdrawable = Decimal("0.00")

    on_hold = total_balance - withdrawable

    return {
        "total_balance": float(total_balance),
        "withdrawable_now": float(withdrawable),
        "on_hold_amount": float(on_hold),
        "next_unlock_at": next_unlock_at,
        "has_stale_pending": has_stale_pending,
    }


# ─── Guard Functions ──────────────────────────────────────────────────────────

async def _check_account_limit(client_id: str, additional_net: Decimal) -> None:
    """Raise 422 if crediting additional_net would push total_balance above account_limit."""
    db = get_supabase()
    user = db.table("users").select("account_limit").eq("id", client_id).maybe_single().execute()
    limit = user.data.get("account_limit") if user.data else None
    if limit is None:
        return  # Unlimited

    balance_info = await get_client_balance(client_id)
    current_total = Decimal(str(balance_info["total_balance"]))
    limit_dec = Decimal(str(limit))

    if current_total + additional_net > limit_dec:
        headroom = limit_dec - current_total
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"This deposit would exceed the client's account limit. Available headroom: ₹{headroom:,.2f}",
            headers={"X-Error-Code": "ACCOUNT_LIMIT_EXCEEDED"},
        )


async def _check_bank_capacity(bank_account_id: str, gross_amount: Decimal) -> None:
    """Raise 422 if the chosen bank account doesn't have enough remaining capacity."""
    from services.bank_account_service import get_account_capacity
    capacity = await get_account_capacity(bank_account_id)

    if not capacity["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Selected bank account is currently disabled.",
            headers={"X-Error-Code": "BANK_ACCOUNT_INACTIVE"},
        )

    remaining = capacity["remaining_capacity"]
    if remaining is not None and gross_amount > Decimal(str(remaining)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Selected bank account only has ₹{remaining:,.2f} remaining capacity.",
            headers={"X-Error-Code": "BANK_CAPACITY_EXCEEDED"},
        )


async def _check_withdrawable(client_id: str, requested_amount: Decimal) -> None:
    """Raise 403 if requested withdrawal exceeds the client's withdrawable balance."""
    balance_info = await get_client_balance(client_id)
    withdrawable = Decimal(str(balance_info["withdrawable_now"]))
    if requested_amount > withdrawable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requested amount ₹{requested_amount:,.2f} exceeds withdrawable balance ₹{withdrawable:,.2f}.",
            headers={"X-Error-Code": "INSUFFICIENT_WITHDRAWABLE_BALANCE"},
        )


# ─── Pay-In ───────────────────────────────────────────────────────────────────

async def submit_pay_in(
    client_id: str,
    gross_amount: Decimal,
    bank_account_id: str,
    proof_path: str,
    idempotency_key: str,
    ip_address: str | None = None,
) -> dict:
    """
    Submit a Pay-In request. Does NOT credit the balance — that happens on approval.
    Validates: bank account is eligible, idempotency key is unique.
    """
    db = get_supabase()

    # Get client's fee percentage
    user = db.table("users").select("fee_percentage").eq("id", client_id).maybe_single().execute()
    if not user.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    fee_pct = Decimal(str(user.data["fee_percentage"]))
    amounts = calculate_pay_in_amounts(gross_amount, fee_pct)

    # Check bank account is active and has capacity (including pending reservations)
    await _check_bank_capacity(bank_account_id, gross_amount)

    result = db.table("transactions").insert({
        "client_id": client_id,
        "type": "pay_in",
        "gross_amount": str(amounts["gross_amount"]),
        "fee_percentage": str(amounts["fee_percentage"]),
        "fee_amount": str(amounts["fee_amount"]),
        "net_amount": str(amounts["net_amount"]),
        "status": "pending",
        "proof_url": proof_path,
        "bank_account_id": bank_account_id,
        "idempotency_key": idempotency_key,
    }).execute()

    txn = result.data[0]
    await log_action(
        actor_id=client_id,
        actor_role="client",
        action="submit_pay_in",
        target_table="transactions",
        target_id=txn["id"],
        meta={"gross_amount": float(gross_amount), "bank_account_id": bank_account_id},
        ip_address=ip_address,
    )
    return txn


async def approve_pay_in(
    txn_id: str,
    actor_id: str,
    actor_role: str,
    admin_notes: str | None = None,
    ip_address: str | None = None,
) -> dict:
    """
    Approve a pending Pay-In.

    Uses conditional update (WHERE status='pending') for concurrency safety.
    Re-validates account_limit and bank_capacity at approval time.
    Sets matures_at = next midnight IST after approval time.
    """
    db = get_supabase()

    # Fetch transaction to run guard checks
    txn_result = db.table("transactions").select("*").eq("id", txn_id).maybe_single().execute()
    txn = txn_result.data
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    valid_old_statuses = ["pending"]
    if actor_role == "admin":
        valid_old_statuses.append("employee_approved")

    if txn["status"] not in valid_old_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transaction has already been processed or requires admin approval.",
            headers={"X-Error-Code": "TXN_ALREADY_PROCESSED"},
        )

    net_amount = Decimal(str(txn["net_amount"]))
    gross_amount = Decimal(str(txn["gross_amount"]))

    # Re-validate guards at approval time (balances may have changed since submission)
    await _check_account_limit(txn["client_id"], net_amount)
    await _check_bank_capacity(txn["bank_account_id"], gross_amount)

    # Conditional update — only succeeds if status is still 'pending'
    # (Removed missing RPC call to avoid 500 error)

    new_status = "employee_approved" if actor_role == "employee" else "approved"
    now_iso = datetime.now(timezone.utc).isoformat()
    result = db.table("transactions").update({
        "status": new_status,
        "processed_by": actor_id,
        "processed_at": now_iso,
        "matures_at": None,
        "admin_notes": admin_notes,
    }).eq("id", txn_id).in_("status", valid_old_statuses).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transaction was processed by another admin simultaneously.",
            headers={"X-Error-Code": "TXN_ALREADY_PROCESSED"},
        )

    approved_txn = result.data[0]

    # Calculate matures_at = next midnight IST after approval time
    matures_at = None
    if new_status == "approved":
        from datetime import timedelta
        # IST = UTC+5:30
        IST = timezone(timedelta(hours=5, minutes=30))
        processed_at = datetime.fromisoformat(now_iso)
        processed_at_ist = processed_at.astimezone(IST)
        # Next midnight in IST = start of the next calendar day in IST
        next_midnight_ist = (processed_at_ist + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        # Store as UTC ISO string
        matures_at = next_midnight_ist.astimezone(timezone.utc).isoformat()
        db.table("transactions").update({"matures_at": matures_at}).eq("id", txn_id).execute()
        approved_txn["matures_at"] = matures_at

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="approve_pay_in",
        target_table="transactions",
        target_id=txn_id,
        meta={
            "gross_amount": float(gross_amount),
            "net_amount": float(net_amount),
            "matures_at": matures_at,
            "client_id": txn["client_id"],
        },
        ip_address=ip_address,
    )
    return approved_txn


async def reject_transaction(
    txn_id: str,
    reason: str,
    actor_id: str,
    actor_role: str,
    ip_address: str | None = None,
) -> dict:
    """Reject a pending Pay-In or Pay-Out with a mandatory reason."""
    db = get_supabase()
    
    txn_result = db.table("transactions").select("status").eq("id", txn_id).maybe_single().execute()
    txn = txn_result.data
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    valid_old_statuses = ["pending"]
    if actor_role == "admin":
        valid_old_statuses.append("employee_approved")

    if txn["status"] not in valid_old_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transaction has already been processed or requires admin action.",
            headers={"X-Error-Code": "TXN_ALREADY_PROCESSED"},
        )

    result = db.table("transactions").update({
        "status": "rejected",
        "processed_by": actor_id,
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "admin_notes": reason,
    }).eq("id", txn_id).in_("status", valid_old_statuses).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transaction was processed by another admin simultaneously.",
            headers={"X-Error-Code": "TXN_ALREADY_PROCESSED"},
        )

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="reject_transaction",
        target_table="transactions",
        target_id=txn_id,
        meta={"reason": reason},
        ip_address=ip_address,
    )
    return result.data[0]


# ─── Pay-Out ──────────────────────────────────────────────────────────────────

async def submit_pay_out(
    client_id: str,
    requested_amount: Decimal,
    ip_address: str | None = None,
) -> dict:
    """
    Submit a Pay-Out request.
    Validates: requested_amount <= withdrawable_now (matured, accounting for pending requests).
    No fee on Pay-Out — client receives the exact requested_amount.
    """
    await _check_withdrawable(client_id, requested_amount)
    db = get_supabase()

    result = db.table("transactions").insert({
        "client_id": client_id,
        "type": "pay_out",
        "gross_amount": str(requested_amount),
        "fee_percentage": "0.00",
        "fee_amount": "0.00",
        "net_amount": str(requested_amount),
        "status": "pending",
    }).execute()

    txn = result.data[0]
    await log_action(
        actor_id=client_id,
        actor_role="client",
        action="submit_pay_out",
        target_table="transactions",
        target_id=txn["id"],
        meta={"requested_amount": float(requested_amount)},
        ip_address=ip_address,
    )
    return txn


async def approve_pay_out(
    txn_id: str,
    actor_id: str,
    actor_role: str,
    admin_notes: str | None = None,
    ip_address: str | None = None,
) -> dict:
    """
    Approve a pending Pay-Out.
    Re-validates withdrawable balance at approval time (double-check at approval).
    """
    db = get_supabase()
    txn_result = db.table("transactions").select("*").eq("id", txn_id).eq("type", "pay_out").maybe_single().execute()
    txn = txn_result.data
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pay-Out transaction not found")
    valid_old_statuses = ["pending"]
    if actor_role == "admin":
        valid_old_statuses.append("employee_approved")

    if txn["status"] not in valid_old_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transaction has already been processed or requires admin approval.",
            headers={"X-Error-Code": "TXN_ALREADY_PROCESSED"},
        )

    # Re-validate withdrawable at approval moment
    await _check_withdrawable(txn["client_id"], Decimal(str(txn["gross_amount"])))

    new_status = "employee_approved" if actor_role == "employee" else "approved"

    now_iso = datetime.now(timezone.utc).isoformat()
    result = db.table("transactions").update({
        "status": new_status,
        "processed_by": actor_id,
        "processed_at": now_iso,
        "admin_notes": admin_notes,
    }).eq("id", txn_id).in_("status", valid_old_statuses).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transaction was processed simultaneously by another admin.",
            headers={"X-Error-Code": "TXN_ALREADY_PROCESSED"},
        )

    await log_action(
        actor_id=actor_id,
        actor_role=actor_role,
        action="approve_pay_out",
        target_table="transactions",
        target_id=txn_id,
        meta={"amount": float(txn["gross_amount"]), "client_id": txn["client_id"]},
        ip_address=ip_address,
    )
    return result.data[0]


