"""
services/audit_service.py — Append-only audit log writer.

Every admin/employee action (approve, reject, create client, etc.)
must call log_action(). The audit_log table has no UPDATE or DELETE
grants at the DB level — this service only ever inserts.
"""
from database import get_supabase


async def log_action(
    actor_id: str | None,
    actor_role: str | None,
    action: str,
    target_table: str | None = None,
    target_id: str | None = None,
    meta: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """
    Append one row to audit_log.

    Args:
        actor_id     — UUID of the user performing the action
        actor_role   — 'admin' | 'employee' | 'client'
        action       — machine-readable verb, e.g. 'approve_transaction', 'create_client'
        target_table — DB table the action targets, e.g. 'transactions'
        target_id    — UUID of the affected record
        meta         — JSONB dict with before/after state or extra context
        ip_address   — request IP for non-repudiation
    """
    db = get_supabase()
    db.table("audit_log").insert({
        "actor_id": actor_id,
        "actor_role": actor_role,
        "action": action,
        "target_table": target_table,
        "target_id": target_id,
        "meta": meta,
        "ip_address": ip_address,
    }).execute()
