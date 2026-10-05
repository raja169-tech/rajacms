"""
routers/employee.py — Employee routes (subset of admin).

Employees can: view all clients/transactions (read-only) and generate reports. Only Admins can approve/reject.
Employees CANNOT: create/edit/delete clients, change fee %, manage bank accounts.

All shared business logic reuses the same service functions as admin.
Permission enforced via require_role(["admin", "employee"]).
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional

from auth.dependencies import require_role
from database import get_supabase
from services.report_service import fetch_approved_transactions, generate_pdf, generate_excel, _parse_range

router = APIRouter(prefix="/api/employee", tags=["employee"])
StaffUser = Depends(require_role(["admin", "employee"]))


class ApproveRequest(BaseModel):
    admin_notes: Optional[str] = None


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard/summary")
async def dashboard_summary(current_user: dict = StaffUser):
    """
    Summary stats for employees: pending count, monthly volume (gross only), and chart data.
    NOTE: Fee revenue and net revenue are intentionally omitted — admin-only data.
    """
    db = get_supabase()
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    pending = db.table("transactions").select("id", count="exact").eq("status", "pending").execute()
    monthly = db.table("transactions").select(
        "type, gross_amount"
    ).eq("status", "approved").gte("created_at", month_start).execute()

    monthly_pay_in_gross = sum(float(t["gross_amount"]) for t in (monthly.data or []) if t["type"] == "pay_in")
    monthly_pay_out = sum(float(t["gross_amount"]) for t in (monthly.data or []) if t["type"] == "pay_out")
    total_clients = db.table("users").select("id", count="exact").eq("role", "client").execute()

    from datetime import timedelta
    seven_days_ago = now - timedelta(days=7)
    recent = db.table("transactions").select("type, gross_amount, created_at").eq("status", "approved").gte("created_at", seven_days_ago.isoformat()).execute()

    chart_data = {"dates": [], "pay_in": [], "pay_out": []}
    daily_totals = {}
    for i in range(6, -1, -1):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_totals[d] = {"pay_in": 0, "pay_out": 0}
        chart_data["dates"].append(d)

    for t in (recent.data or []):
        d = t["created_at"][:10]
        if d in daily_totals:
            daily_totals[d][t["type"]] += float(t["gross_amount"])

    for d in chart_data["dates"]:
        chart_data["pay_in"].append(daily_totals[d]["pay_in"])
        chart_data["pay_out"].append(daily_totals[d]["pay_out"])

    return {
        "pending_transactions": pending.count or 0,
        "total_clients": total_clients.count or 0,
        "this_month": {
            "pay_in_gross": monthly_pay_in_gross,
            "pay_out": monthly_pay_out,
            # fees_collected and net_volume are intentionally excluded for employees
        },
        "chart_data": chart_data
    }


# ─── Transaction Queue ────────────────────────────────────────────────────────

@router.get("/transactions")
async def list_transactions(
    transaction_status: Optional[str] = Query(None, alias="status"),
    client_id: Optional[str] = Query(None),
    txn_type: Optional[str] = Query(None, alias="type"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = StaffUser,
):
    db = get_supabase()
    query = db.table("transactions").select(
        "*, users!client_id(display_name, client_code)",
        count="exact"
    )
    if transaction_status == "pending":
        # Employees only see truly pending items — not ones they already marked
        query = query.eq("status", "pending")
    elif transaction_status:
        query = query.eq("status", transaction_status)
    else:

    if client_id:
        query = query.eq("client_id", client_id)
    if txn_type:
        query = query.eq("type", txn_type)

    offset = (page - 1) * per_page
    result = query.order("created_at", desc=True).range(offset, offset + per_page - 1).execute()
    # Strip fee and net fields for employees so revenue stays strictly admin-only
    txns = []
    for t in (result.data or []):
        t.pop("fee_amount", None)
        t.pop("fee_percentage", None)
        t.pop("net_amount", None)
        txns.append(t)
    return {"transactions": txns, "total": result.count or 0, "page": page}



@router.get("/transactions/{txn_id}/proof-url")
async def get_proof_url(txn_id: str, current_user: dict = StaffUser):
    from services.storage_service import get_signed_url
    db = get_supabase()
    txn = db.table("transactions").select("proof_url").eq("id", txn_id).maybe_single().execute()
    if not txn.data or not txn.data.get("proof_url"):
        raise HTTPException(status_code=404, detail="No proof image for this transaction")
    signed_url = get_signed_url(txn.data["proof_url"])
    return {"signed_url": signed_url}


# ─── Clients (read-only for employee) ────────────────────────────────────────

@router.get("/clients")
async def list_clients(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = StaffUser,
):
    db = get_supabase()
    query = db.table("users").select(
        "id, display_name, client_code, is_active, created_at",
        count="exact"
    ).eq("role", "client")
    if search:
        query = query.or_(f"display_name.ilike.%{search}%,client_code.ilike.%{search}%")
    offset = (page - 1) * per_page
    result = query.order("created_at", desc=True).range(offset, offset + per_page - 1).execute()
    return {"clients": result.data or [], "total": result.count or 0, "page": page}


# ─── Reports ──────────────────────────────────────────────────────────────────

@router.get("/reports/export")
async def export_report(
    format: str = Query("pdf", regex="^(pdf|excel)$"),
    range: str = Query("30d"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    current_user: dict = StaffUser,
):
    if range == "custom" and date_from and date_to:
        start = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
    else:
        start, end = _parse_range(range)

    transactions = fetch_approved_transactions(start, end, client_id=client_id)
    db = get_supabase()
    actor = db.table("users").select("display_name").eq("id", current_user["sub"]).maybe_single().execute()
    generated_by = actor.data["display_name"] if actor.data else "Employee"

    if format == "pdf":
        pdf_bytes = generate_pdf(transactions, start, end, generated_by, show_fees=False)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="cms-report-{range}.pdf"'},
        )
    else:
        excel_bytes = generate_excel(transactions, start, end, generated_by, show_fees=False)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="cms-report-{range}.xlsx"'},
        )


