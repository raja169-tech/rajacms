"""
routers/admin.py — Admin-only API endpoints.

All routes require role='admin'.
Enforced via require_role(["admin"]) FastAPI dependency.
"""
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional
import io

from auth.dependencies import require_role
from database import get_supabase
from services.audit_service import log_action
from services.client_service import create_client, update_client, deactivate_client, delete_client
from services.employee_service import create_employee, update_employee, delete_employee
from services.bank_account_service import (
    create_bank_account, update_bank_account, toggle_bank_account,
    disable_all_accounts, get_eligible_accounts_for_client, get_account_capacity,
    delete_bank_account,
)
from services.transaction_service import approve_pay_in, approve_pay_out, reject_transaction
from services.report_service import (
    fetch_approved_transactions, generate_pdf, generate_excel, _parse_range
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
AdminUser = Depends(require_role(["admin"]))


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CreateClientRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)
    fee_percentage: float = Field(..., ge=0.0, le=100.0)
    account_limit: Optional[float] = Field(None, gt=0)


class UpdateClientRequest(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    fee_percentage: Optional[float] = Field(None, ge=0.0, le=100.0)
    account_limit: Optional[float] = None   # None = unlimited
    is_active: Optional[bool] = None


class CreateBankAccountRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    upi_id: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None
    limit_amount: Optional[float] = Field(None, gt=0)


class UpdateBankAccountRequest(BaseModel):
    label: Optional[str] = None
    upi_id: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None
    limit_amount: Optional[float] = None


class ApproveRequest(BaseModel):
    admin_notes: Optional[str] = None


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class CreateEmployeeRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)
    gender: str = Field(..., pattern="^(male|female|other)$")
    phone: str = Field(..., min_length=7, max_length=20)


class UpdateEmployeeRequest(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    gender: Optional[str] = Field(None, pattern="^(male|female|other)$")
    phone: Optional[str] = Field(None, min_length=7, max_length=20)
    is_active: Optional[bool] = None


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard/summary")
async def dashboard_summary(current_user: dict = AdminUser):
    """Summary stats: pending count, monthly volume, fee revenue."""
    db = get_supabase()
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    pending = db.table("transactions").select("id", count="exact").eq("status", "pending").execute()
    monthly = db.table("transactions").select(
        "type, gross_amount, fee_amount"
    ).eq("status", "approved").gte("created_at", month_start).execute()

    monthly_pay_in_gross = sum(
        float(t["gross_amount"]) for t in (monthly.data or []) if t["type"] == "pay_in"
    )
    monthly_fees = sum(
        float(t["fee_amount"]) for t in (monthly.data or []) if t["type"] == "pay_in"
    )
    monthly_pay_out = sum(
        float(t["gross_amount"]) for t in (monthly.data or []) if t["type"] == "pay_out"
    )
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
            "fees_collected": monthly_fees,
            "pay_out": monthly_pay_out,
            "net_volume": monthly_pay_in_gross - monthly_pay_out,
        },
        "chart_data": chart_data
    }


# ─── Clients ──────────────────────────────────────────────────────────────────

@router.get("/clients")
async def list_clients(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = AdminUser,
):
    db = get_supabase()
    query = db.table("users").select(
        "id, role, display_name, client_code, login_identifier, fee_percentage, account_limit, is_active, created_at",
        count="exact"
    ).eq("role", "client")

    if search:
        query = query.or_(f"display_name.ilike.%{search}%,client_code.ilike.%{search}%")

    offset = (page - 1) * per_page
    result = query.order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

    return {
        "clients": result.data or [],
        "total": result.count or 0,
        "page": page,
        "per_page": per_page,
    }


@router.post("/clients", status_code=status.HTTP_201_CREATED)
async def create_client_endpoint(
    body: CreateClientRequest,
    request: Request,
    current_user: dict = AdminUser,
):
    return await create_client(
        display_name=body.display_name,
        password=body.password,
        fee_percentage=body.fee_percentage,
        account_limit=body.account_limit,
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


@router.patch("/clients/{client_id}")
async def update_client_endpoint(
    client_id: str,
    body: UpdateClientRequest,
    request: Request,
    current_user: dict = AdminUser,
):
    return await update_client(
        client_id=client_id,
        updates=body.model_dump(exclude_none=True),
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_client_endpoint(
    client_id: str,
    request: Request,
    current_user: dict = AdminUser,
):
    await deactivate_client(
        client_id=client_id,
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


@router.delete("/clients/{client_id}/delete")
async def delete_client_endpoint(
    client_id: str,
    request: Request,
    current_user: dict = AdminUser,
):
    return await delete_client(
        client_id=client_id,
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


# ─── Employees ────────────────────────────────────────────────────────────────

@router.get("/employees")
async def list_employees(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = AdminUser,
):
    db = get_supabase()
    query = db.table("users").select(
        "id, role, display_name, login_identifier, gender, phone, is_active, created_at",
        count="exact"
    ).eq("role", "employee")

    if search:
        query = query.or_(f"display_name.ilike.%{search}%,login_identifier.ilike.%{search}%")

    offset = (page - 1) * per_page
    result = query.order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

    return {
        "employees": result.data or [],
        "total": result.count or 0,
        "page": page,
        "per_page": per_page,
    }


@router.post("/employees", status_code=status.HTTP_201_CREATED)
async def create_employee_endpoint(
    body: CreateEmployeeRequest,
    request: Request,
    current_user: dict = AdminUser,
):
    return await create_employee(
        display_name=body.display_name,
        password=body.password,
        gender=body.gender,
        phone=body.phone,
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


@router.patch("/employees/{employee_id}")
async def update_employee_endpoint(
    employee_id: str,
    body: UpdateEmployeeRequest,
    request: Request,
    current_user: dict = AdminUser,
):
    return await update_employee(
        employee_id=employee_id,
        updates=body.model_dump(exclude_none=True),
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


@router.delete("/employees/{employee_id}")
async def delete_employee_endpoint(
    employee_id: str,
    request: Request,
    current_user: dict = AdminUser,
):
    return await delete_employee(
        employee_id=employee_id,
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


# ─── Bank Accounts ────────────────────────────────────────────────────────────

@router.get("/bank-accounts")
async def list_bank_accounts(current_user: dict = AdminUser):
    db = get_supabase()
    accounts = db.table("company_bank_accounts").select("*").order("created_at", desc=False).execute()
    result = []
    for acc in (accounts.data or []):
        capacity = await get_account_capacity(acc["id"])
        result.append(capacity)
    return result


@router.post("/bank-accounts", status_code=status.HTTP_201_CREATED)
async def create_bank_account_endpoint(
    body: CreateBankAccountRequest,
    request: Request,
    current_user: dict = AdminUser,
):
    return await create_bank_account(
        label=body.label,
        upi_id=body.upi_id,
        account_number=body.account_number,
        ifsc=body.ifsc,
        limit_amount=body.limit_amount,
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


@router.patch("/bank-accounts/{account_id}")
async def update_bank_account_endpoint(
    account_id: str,
    body: UpdateBankAccountRequest,
    request: Request,
    current_user: dict = AdminUser,
):
    return await update_bank_account(
        account_id=account_id,
        updates=body.model_dump(exclude_none=True),
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


@router.post("/bank-accounts/{account_id}/toggle")
async def toggle_bank_account_endpoint(
    account_id: str,
    request: Request,
    current_user: dict = AdminUser,
):
    return await toggle_bank_account(
        account_id=account_id,
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


@router.delete("/bank-accounts/{account_id}/delete")
async def delete_bank_account_endpoint(
    account_id: str,
    request: Request,
    current_user: dict = AdminUser,
):
    return await delete_bank_account(
        account_id=account_id,
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


@router.post("/bank-accounts/disable-all")
async def disable_all_endpoint(
    request: Request,
    current_user: dict = AdminUser,
):
    count = await disable_all_accounts(
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )
    return {"detail": f"{count} bank account(s) disabled.", "count": count}


# ─── Transaction Queue ────────────────────────────────────────────────────────

@router.get("/transactions")
async def list_transactions(
    transaction_status: Optional[str] = Query(None, alias="status"),
    client_id: Optional[str] = Query(None),
    txn_type: Optional[str] = Query(None, alias="type"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = AdminUser,
):
    db = get_supabase()
    query = db.table("transactions").select(
        "*, users!client_id(display_name, client_code)",
        count="exact"
    )
    if transaction_status:
        query = query.eq("status", transaction_status)
    if client_id:
        query = query.eq("client_id", client_id)
    if txn_type:
        query = query.eq("type", txn_type)

    offset = (page - 1) * per_page
    result = query.order("created_at", desc=True).range(offset, offset + per_page - 1).execute()
    return {"transactions": result.data or [], "total": result.count or 0, "page": page}


@router.post("/transactions/{txn_id}/approve")
async def approve_transaction(
    txn_id: str,
    body: ApproveRequest,
    request: Request,
    current_user: dict = AdminUser,
):
    """Approve a pending Pay-In or Pay-Out. Detects type automatically."""
    db = get_supabase()
    txn = db.table("transactions").select("type").eq("id", txn_id).maybe_single().execute()
    if not txn.data:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if txn.data["type"] == "pay_in":
        return await approve_pay_in(
            txn_id=txn_id,
            actor_id=current_user["sub"],
            actor_role=current_user["role"],
            admin_notes=body.admin_notes,
            ip_address=request.client.host if request.client else None,
        )
    else:
        return await approve_pay_out(
            txn_id=txn_id,
            actor_id=current_user["sub"],
            actor_role=current_user["role"],
            admin_notes=body.admin_notes,
            ip_address=request.client.host if request.client else None,
        )


@router.post("/transactions/{txn_id}/reject")
async def reject_transaction_endpoint(
    txn_id: str,
    body: RejectRequest,
    request: Request,
    current_user: dict = AdminUser,
):
    return await reject_transaction(
        txn_id=txn_id,
        reason=body.reason,
        actor_id=current_user["sub"],
        actor_role=current_user["role"],
        ip_address=request.client.host if request.client else None,
    )


# ─── Proof Image (signed URL) ─────────────────────────────────────────────────

@router.get("/transactions/{txn_id}/proof-url")
async def get_proof_url(txn_id: str, current_user: dict = AdminUser):
    from services.storage_service import get_signed_url
    db = get_supabase()
    txn = db.table("transactions").select("proof_url").eq("id", txn_id).maybe_single().execute()
    if not txn.data or not txn.data.get("proof_url"):
        raise HTTPException(status_code=404, detail="No proof image for this transaction")
    signed_url = get_signed_url(txn.data["proof_url"])
    return {"signed_url": signed_url}


# ─── Reports ──────────────────────────────────────────────────────────────────

@router.get("/reports/export")
async def export_report(
    format: str = Query("pdf", regex="^(pdf|excel)$"),
    range: str = Query("30d"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    current_user: dict = AdminUser,
):
    if range == "custom" and date_from and date_to:
        start = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
    else:
        start, end = _parse_range(range)

    transactions = fetch_approved_transactions(start, end, client_id=client_id)

    db = get_supabase()
    actor = db.table("users").select("display_name").eq("id", current_user["sub"]).maybe_single().execute()
    generated_by = actor.data["display_name"] if actor.data else "Admin"

    if format == "pdf":
        pdf_bytes = generate_pdf(transactions, start, end, generated_by)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="cms-report-{range}.pdf"'},
        )
    else:
        excel_bytes = generate_excel(transactions, start, end, generated_by)
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="cms-report-{range}.xlsx"'},
        )
