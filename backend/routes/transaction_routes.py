import csv
import io
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator
from typing import Any, Optional, List
from datetime import datetime, timedelta
import uuid

from database import get_db
from config import settings
from models.transaction import TransactionModel
from models.user import UserModel
from models.finance import CategoryModel, BudgetModel, AIUsageLogModel
from services.auth_service import (
    SEED_DEMO_TRANSACTION_IDS,
    get_current_user,
    require_authenticated_user,
    resolve_scoped_user_id,
    scope_transaction_query,
)
from services.anomaly_service import anomaly_service
from services.ai_agent_service import ai_agent_service
from services.analytics_service import analytics_service
from services.cost_optimizer_service import cost_optimizer_service
from services.scam_shield_service import scam_shield_service
from services.decision_intelligence_service import decision_intelligence_service
from services.shared_utils import (
    calculate_paypal_estimated_fee,
    convert_between_currencies,
    convert_to_usd,
    is_cross_border,
    parse_strict_filter_date,
    parse_transaction_datetime,
    quantize_currency,
    sanitize_csv_cell,
    to_decimal,
)

router = APIRouter(prefix="/api/v1", tags=["Finova Intelligence Core"])

def _strip_non_empty(value: Optional[str], field_label: str) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_label} cannot be blank.")
    return cleaned


# Request / Response Schemas
class SimulateTransactionRequest(BaseModel):
    customerName: str = Field(..., min_length=1, max_length=128)
    customerEmail: str = Field(..., min_length=3, max_length=128)
    amount: float = Field(..., gt=0, le=1000000.0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    paymentMethod: str = Field(default="PayPal Wallet", max_length=64)
    country: str = Field(default="United States", max_length=64)

    @field_validator("customerName", "customerEmail", "currency")
    @classmethod
    def _validate_non_blank(cls, v: str, info):
        return _strip_non_empty(v, info.field_name)


class ManualTransactionRequest(BaseModel):
    customerName: str = Field(..., min_length=1, max_length=128)
    customerEmail: str = Field(default="ledger@finova.local", max_length=128)
    amount: float = Field(..., gt=0, le=1000000.0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    status: str = Field(default="COMPLETED", max_length=32)
    paymentMethod: str = Field(default="PayPal Wallet", max_length=64)
    country: str = Field(default="United States", max_length=64)
    category: str = Field(default="Payment", min_length=1, max_length=64)
    txnType: str = Field(default="income", pattern="^(income|expense)$")
    date: Optional[str] = Field(default=None, max_length=32)
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("customerName", "customerEmail", "currency", "category")
    @classmethod
    def _validate_non_blank(cls, v: str, info):
        return _strip_non_empty(v, info.field_name)

    @field_validator("date")
    @classmethod
    def _validate_optional_date(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        parsed = parse_strict_filter_date(v)
        return parsed.strftime("%Y-%m-%d %H:%M") if parsed else None


class UpdateTransactionRequest(BaseModel):
    customerName: Optional[str] = Field(default=None, min_length=1, max_length=128)
    amount: Optional[float] = Field(default=None, gt=0, le=1000000.0)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    status: Optional[str] = Field(default=None, max_length=32)
    category: Optional[str] = Field(default=None, min_length=1, max_length=64)
    txnType: Optional[str] = Field(default=None, pattern="^(income|expense)$")
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("customerName", "currency", "category")
    @classmethod
    def _validate_optional_non_blank(cls, v: Optional[str], info):
        return _strip_non_empty(v, info.field_name)


class CategoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    kind: str = Field(default="expense", pattern="^(income|expense|both)$")
    color: str = Field(default="#0070BA", max_length=16)

    @field_validator("name", "color")
    @classmethod
    def _validate_non_blank(cls, v: str, info):
        return _strip_non_empty(v, info.field_name)


class CategoryUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    kind: Optional[str] = Field(default=None, pattern="^(income|expense|both)$")
    color: Optional[str] = Field(default=None, max_length=16)

    @field_validator("name", "color")
    @classmethod
    def _validate_optional_non_blank(cls, v: Optional[str], info):
        return _strip_non_empty(v, info.field_name)


class BudgetCreateRequest(BaseModel):
    category: str = Field(..., min_length=1, max_length=64)
    limitAmount: float = Field(..., gt=0, le=10000000.0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    period: str = Field(default="monthly", pattern="^(weekly|monthly|quarterly)$")
    alertThresholdPct: int = Field(default=80, ge=10, le=100)

    @field_validator("category", "currency")
    @classmethod
    def _validate_non_blank(cls, v: str, info):
        return _strip_non_empty(v, info.field_name)


class BudgetUpdateRequest(BaseModel):
    category: Optional[str] = Field(default=None, min_length=1, max_length=64)
    limitAmount: Optional[float] = Field(default=None, gt=0, le=10000000.0)
    period: Optional[str] = Field(default=None, pattern="^(weekly|monthly|quarterly)$")
    alertThresholdPct: Optional[int] = Field(default=None, ge=10, le=100)

    @field_validator("category")
    @classmethod
    def _validate_optional_non_blank(cls, v: Optional[str], info):
        return _strip_non_empty(v, info.field_name)

class FeeCalculationRequest(BaseModel):
    amount: float = Field(..., gt=0)
    sourceCurrency: str = "USD"
    targetCurrency: str = "USD"
    isInternational: bool = False
    paymentMethod: str = "standard"

class ScenarioItem(BaseModel):
    id: str
    name: str
    amount: float = Field(..., gt=0)
    sourceCurrency: str = "USD"
    targetCurrency: str = "USD"
    isInternational: bool = False
    paymentTier: str = "standard"

class ScenarioComparisonRequest(BaseModel):
    scenarios: List[ScenarioItem]

class ScamAnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    targetType: str = "email"
    channel: Optional[str] = "email"

class HealthSimulationRequest(BaseModel):
    additionalDisputes: int = Field(0, ge=0, le=1000)
    additionalRefunds: int = Field(0, ge=0, le=1000)
    additionalFailures: int = Field(0, ge=0, le=1000)
    volumeSpikeMultiplier: float = Field(1.0, ge=0.1, le=50.0)

class ChatMessageHistoryItem(BaseModel):
    id: Optional[str] = None
    sender: str = Field(..., min_length=1, max_length=16, pattern="^(user|assistant|ai|model|bot|USER|ASSISTANT)$")
    content: str = Field(..., min_length=1, max_length=4000)
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: Optional[List[ChatMessageHistoryItem]] = None

class DecisionScenarioRequest(BaseModel):
    volumeGrowthPct: float = Field(0.0, ge=-100.0, le=1000.0)
    targetAverageTicket: Optional[float] = Field(None, gt=0.0, le=1000000.0)
    crossBorderPct: Optional[float] = Field(None, ge=0.0, le=100.0)
    paymentTier: str = "standard"

# Seed initial baseline dataset in non-production environments only
def seed_initial_transactions(db: Session) -> bool:
    if settings.is_production:
        return False

    seed_items = [
        {
            "id": "TXN-984210",
            "paypal_order_id": "7W2984102948214M",
            "customer_name": "Marcus Vance",
            "customer_email": "m.vance@techcorp.io",
            "amount": 1250.00,
            "currency": "USD",
            "status": "COMPLETED",
            "date": "2026-11-04 14:24",
            "estimated_fee": 44.12,
            "actual_fee": 44.12,
            "net_amount": 1205.88,
            "payment_method": "Credit/Debit Card",
            "country": "United States",
            "risk_score": 12,
            "risk_level": "LOW",
            "is_anomaly": False,
            "data_source": "sandbox"
        },
        {
            "id": "TXN-984209",
            "paypal_order_id": "3K4981023910398A",
            "customer_name": "Elena Rostova",
            "customer_email": "elena.rostova@euronet.de",
            "amount": 840.50,
            "currency": "EUR",
            "status": "COMPLETED",
            "date": "2026-11-03 16:15",
            "estimated_fee": 37.82,
            "actual_fee": 37.82,
            "net_amount": 802.68,
            "payment_method": "PayPal Wallet",
            "country": "Germany",
            "risk_score": 18,
            "risk_level": "LOW",
            "is_anomaly": False,
            "data_source": "sandbox"
        },
        {
            "id": "TXN-984208",
            "paypal_order_id": "8P1092830192831B",
            "customer_name": "Anonymous Buyer",
            "customer_email": "temp_user_9921@sharklasers.com",
            "amount": 4890.00,
            "currency": "USD",
            "status": "PENDING",
            "date": "2026-11-02 14:02",
            "estimated_fee": 171.16,
            "actual_fee": None,
            "net_amount": 4718.84,
            "payment_method": "Credit/Debit Card",
            "country": "Nigeria",
            "risk_score": 84,
            "risk_level": "CRITICAL",
            "is_anomaly": True,
            "anomaly_reason": "Order value 7.8x above historical 30-day average from untrusted disposable domain",
            "data_source": "synthetic"
        },
        {
            "id": "TXN-984207",
            "paypal_order_id": "1L9028301923841C",
            "customer_name": "Aiden Brooks",
            "customer_email": "abrooks@studioapex.co",
            "amount": 195.00,
            "currency": "USD",
            "status": "COMPLETED",
            "date": "2026-11-02 11:45",
            "estimated_fee": 7.30,
            "actual_fee": 7.30,
            "net_amount": 187.70,
            "payment_method": "Venmo",
            "country": "United States",
            "risk_score": 8,
            "risk_level": "LOW",
            "is_anomaly": False,
            "data_source": "sandbox"
        },
        {
            "id": "TXN-984206",
            "paypal_order_id": "5F3928103948271K",
            "customer_name": "Claire Dupont",
            "customer_email": "c.dupont@paris-creatives.fr",
            "amount": 450.00,
            "currency": "EUR",
            "status": "COMPLETED",
            "date": "2026-11-01 10:30",
            "estimated_fee": 20.25,
            "actual_fee": 20.25,
            "net_amount": 429.75,
            "payment_method": "PayPal Wallet",
            "country": "France",
            "risk_score": 14,
            "risk_level": "LOW",
            "is_anomaly": False,
            "data_source": "sandbox"
        },
        {
            "id": "TXN-984205",
            "paypal_order_id": "9Z3847291038472E",
            "customer_name": "Unknown Billing Corp",
            "customer_email": "accounts-settle@quick-verify-paypal.cc",
            "amount": 3200.00,
            "currency": "USD",
            "status": "DENIED",
            "date": "2026-10-31 19:12",
            "estimated_fee": 112.18,
            "actual_fee": 0.0,
            "net_amount": 0.0,
            "payment_method": "Credit/Debit Card",
            "country": "Russia",
            "risk_score": 92,
            "risk_level": "CRITICAL",
            "is_anomaly": True,
            "anomaly_reason": "High-risk origin IP, flagged fraudulent BIN range, spoofed email domain",
            "data_source": "synthetic"
        },
        {
            "id": "TXN-984204",
            "paypal_order_id": "4D8291039281029R",
            "customer_name": "Liam Gallagher",
            "customer_email": "liam@soundstage.co.uk",
            "amount": 620.00,
            "currency": "GBP",
            "status": "COMPLETED",
            "date": "2026-10-30 15:40",
            "estimated_fee": 27.89,
            "actual_fee": 27.89,
            "net_amount": 592.11,
            "payment_method": "PayPal Wallet",
            "country": "United Kingdom",
            "risk_score": 15,
            "risk_level": "LOW",
            "is_anomaly": False,
            "data_source": "sandbox"
        },
        {
            "id": "TXN-984203",
            "paypal_order_id": "2A9102938475610T",
            "customer_name": "Sophia Martinez",
            "customer_email": "smartinez@apexdesign.com",
            "amount": 12.50,
            "currency": "USD",
            "status": "COMPLETED",
            "date": "2026-10-29 12:10",
            "estimated_fee": 0.93,
            "actual_fee": 0.93,
            "net_amount": 11.57,
            "payment_method": "PayPal Wallet",
            "country": "United States",
            "risk_score": 6,
            "risk_level": "LOW",
            "is_anomaly": False,
            "data_source": "sandbox"
        },
        {
            "id": "TXN-984200",
            "paypal_order_id": "6B3819283019283H",
            "customer_name": "Daniel Kim",
            "customer_email": "dkim@techwear-retail.com",
            "amount": 110.00,
            "currency": "USD",
            "status": "REFUNDED",
            "date": "2026-10-27 11:20",
            "estimated_fee": 4.33,
            "actual_fee": 4.33,
            "net_amount": 0.0,
            "payment_method": "Credit/Debit Card",
            "country": "United States",
            "risk_score": 22,
            "risk_level": "LOW",
            "is_anomaly": False,
            "data_source": "synthetic"
        },
        {
            "id": "TXN-984199",
            "paypal_order_id": "8M2918273645192L",
            "customer_name": "Crypto Payouts LLC",
            "customer_email": "instant-relay@crypto-p2p-clearing.xyz",
            "amount": 6500.00,
            "currency": "USD",
            "status": "DISPUTED",
            "date": "2026-10-25 09:14",
            "estimated_fee": 227.85,
            "actual_fee": 227.85,
            "net_amount": 0.0,
            "payment_method": "Credit/Debit Card",
            "country": "Cyprus",
            "risk_score": 88,
            "risk_level": "CRITICAL",
            "is_anomaly": True,
            "anomaly_reason": "Chargeback filed by issuing bank claiming unauthorized card access",
            "data_source": "synthetic"
        }
    ]

    for item in seed_items:
        existing = db.query(TransactionModel).filter(TransactionModel.id == item["id"]).first()
        if not existing:
            db.add(TransactionModel(**item))
    db.commit()
    return True

def _clean_param(p: Any) -> Optional[str]:
    return p.strip() if isinstance(p, str) and p.strip() else None


def _build_filtered_transaction_query(
    db: Session,
    scoped_user_id: Optional[str],
    status_filter: Optional[str] = None,
    risk_filter: Optional[str] = None,
    source_filter: Optional[str] = None,
    category_filter: Optional[str] = None,
    txn_type_filter: Optional[str] = None,
    search: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
):
    query = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id)

    clean_status = _clean_param(status_filter)
    clean_risk = _clean_param(risk_filter)
    clean_source = _clean_param(source_filter)
    clean_category = _clean_param(category_filter)
    clean_type = _clean_param(txn_type_filter)
    clean_search = _clean_param(search)

    if clean_status and clean_status.upper() != "ALL":
        query = query.filter(func.upper(TransactionModel.status) == clean_status.upper())
    if clean_risk and clean_risk.upper() != "ALL":
        query = query.filter(func.upper(TransactionModel.risk_level) == clean_risk.upper())
    if clean_source and clean_source.upper() != "ALL":
        query = query.filter(func.lower(TransactionModel.data_source) == clean_source.lower())
    if clean_category and clean_category.upper() != "ALL":
        query = query.filter(func.lower(TransactionModel.category) == clean_category.lower())
    if clean_type and clean_type.upper() != "ALL":
        query = query.filter(func.lower(TransactionModel.txn_type) == clean_type.lower())
    if clean_search:
        like_term = f"%{clean_search}%"
        query = query.filter(
            or_(
                TransactionModel.id.ilike(like_term),
                TransactionModel.customer_name.ilike(like_term),
                TransactionModel.customer_email.ilike(like_term),
                TransactionModel.paypal_order_id.ilike(like_term),
                TransactionModel.category.ilike(like_term),
            )
        )
    if min_amount is not None:
        query = query.filter(TransactionModel.amount >= float(min_amount))
    if max_amount is not None:
        query = query.filter(TransactionModel.amount <= float(max_amount))

    sort_col_map = {
        "created_at": TransactionModel.created_at,
        "amount": TransactionModel.amount,
        "date": TransactionModel.date,
        "risk_score": TransactionModel.risk_score,
    }
    sort_col = sort_col_map.get((sort_by or "created_at").lower(), TransactionModel.created_at)
    order_expr = sort_col.asc() if (sort_dir or "desc").lower() == "asc" else sort_col.desc()
    return query.order_by(order_expr)


def _apply_date_range(records: List[TransactionModel], date_from: Optional[str], date_to: Optional[str]) -> List[TransactionModel]:
    if not date_from and not date_to:
        return records
    try:
        start_dt = parse_strict_filter_date(date_from) if date_from else None
        end_dt = parse_strict_filter_date(date_to) if date_to else None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if end_dt and date_to and len(date_to.strip()) <= 10:
        end_dt = end_dt.replace(hour=23, minute=59, second=59)
    out = []
    for r in records:
        dt = parse_transaction_datetime(r.date, r.created_at)
        if start_dt and dt < start_dt:
            continue
        if end_dt and dt > end_dt:
            continue
        out.append(r)
    return out


@router.get("/transactions")
def get_transactions(
    status: Optional[str] = None,
    risk: Optional[str] = None,
    source: Optional[str] = None,
    user_id: Optional[str] = None,
    search: Optional[str] = None,
    category: Optional[str] = None,
    txn_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    limit: Optional[int] = None,
    offset: int = 0,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns ledger transactions with filtering, search, sorting, optional pagination,
    and strict tenant isolation. Preserves flat list contract for backwards compatibility.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, _clean_param(user_id))
    query = _build_filtered_transaction_query(
        db=db,
        scoped_user_id=scoped_user_id,
        status_filter=status,
        risk_filter=risk,
        source_filter=source,
        category_filter=category,
        txn_type_filter=txn_type,
        search=search,
        min_amount=min_amount,
        max_amount=max_amount,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    records = _apply_date_range(query.all(), date_from, date_to)
    safe_offset = max(0, int(offset)) if (isinstance(offset, int) and not isinstance(offset, bool)) else 0
    if limit is not None and isinstance(limit, int) and not isinstance(limit, bool):
        safe_limit = max(1, min(500, int(limit)))
        records = records[safe_offset : safe_offset + safe_limit]
    elif safe_offset > 0:
        records = records[safe_offset:]
    return [r.to_dict() for r in records]


@router.get("/transactions/paged")
def get_transactions_paged(
    status: Optional[str] = None,
    risk: Optional[str] = None,
    source: Optional[str] = None,
    user_id: Optional[str] = None,
    search: Optional[str] = None,
    category: Optional[str] = None,
    txn_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    limit: int = Query(default=25, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paginated transaction ledger response with total count and filter metadata."""
    scoped_user_id = resolve_scoped_user_id(current_user, _clean_param(user_id))
    query = _build_filtered_transaction_query(
        db=db,
        scoped_user_id=scoped_user_id,
        status_filter=status,
        risk_filter=risk,
        source_filter=source,
        category_filter=category,
        txn_type_filter=txn_type,
        search=search,
        min_amount=min_amount,
        max_amount=max_amount,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    all_records = _apply_date_range(query.all(), date_from, date_to)
    total = len(all_records)
    page_items = all_records[offset : offset + limit]
    return {
        "items": [r.to_dict() for r in page_items],
        "total": total,
        "limit": limit,
        "offset": offset,
        "hasMore": (offset + len(page_items)) < total,
    }


@router.get("/transactions/export")
def export_transactions_csv(
    status: Optional[str] = None,
    risk: Optional[str] = None,
    source: Optional[str] = None,
    category: Optional[str] = None,
    txn_type: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exports tenant-scoped transactions as CSV with formula-injection sanitization."""
    scoped_user_id = resolve_scoped_user_id(current_user, _clean_param(user_id))
    query = _build_filtered_transaction_query(
        db=db,
        scoped_user_id=scoped_user_id,
        status_filter=status,
        risk_filter=risk,
        source_filter=source,
        category_filter=category,
        txn_type_filter=txn_type,
        search=search,
    )
    records = _apply_date_range(query.all(), date_from, date_to)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "ID", "Date", "Customer Name", "Customer Email", "Type", "Category",
        "Amount", "Currency", "Estimated Fee", "Actual Fee", "Net Amount",
        "Status", "Payment Method", "Country", "Risk Level", "Risk Score", "Data Source", "Notes",
    ])
    for r in records:
        writer.writerow([
            sanitize_csv_cell(r.id),
            sanitize_csv_cell(r.date),
            sanitize_csv_cell(r.customer_name),
            sanitize_csv_cell(r.customer_email),
            sanitize_csv_cell(r.txn_type or "income"),
            sanitize_csv_cell(r.category or "Payment"),
            sanitize_csv_cell(r.amount),
            sanitize_csv_cell(r.currency),
            sanitize_csv_cell(r.estimated_fee),
            sanitize_csv_cell(r.actual_fee if r.actual_fee is not None else ""),
            sanitize_csv_cell(r.net_amount),
            sanitize_csv_cell(r.status),
            sanitize_csv_cell(r.payment_method),
            sanitize_csv_cell(r.country),
            sanitize_csv_cell(r.risk_level),
            sanitize_csv_cell(r.risk_score),
            sanitize_csv_cell(r.data_source),
            sanitize_csv_cell(r.notes or ""),
        ])

    csv_bytes = buf.getvalue()
    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="finova_transactions_export.csv"'},
    )


# --- TRANSACTION INTELLIGENCE & REVENUE ANALYTICS ENDPOINTS ---

@router.get("/analytics/summary")
def get_analytics_summary(
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Computes overall financial metrics, volume totals, actual vs estimated fees,
    income vs expenses, net cash flow, and status/category breakdowns scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    try:
        return analytics_service.get_summary(db, scoped_user_id=scoped_user_id, date_from=date_from, date_to=date_to)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.get("/analytics/trends")
def get_analytics_trends(
    period: str = Query("daily", description="Aggregation bucket: daily, weekly, or monthly"),
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns time-series revenue and fee trajectory aggregated by day, week, or month.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return analytics_service.get_trends(db, period=period, scoped_user_id=scoped_user_id)

@router.get("/analytics/patterns")
def get_analytics_patterns(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Analyzes transaction patterns: currency distribution, payment rails,
    ticket size brackets, geographic distribution, and statistical outliers.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return analytics_service.get_patterns_and_distribution(db, scoped_user_id=scoped_user_id)

@router.get("/analytics/insights")
def get_analytics_insights(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generates dynamic AI natural-language financial insights and cost optimization advice.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return analytics_service.generate_ai_insights(db, scoped_user_id=scoped_user_id)

@router.post("/transactions/simulate")
def simulate_transaction(
    req: SimulateTransactionRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Simulates a payment capture bound strictly to the authenticated user's identity.
    """
    user = require_authenticated_user(current_user)
    curr = (req.currency or "USD").strip().upper()
    is_inter = is_cross_border(req.country)
    amt_dec = quantize_currency(req.amount, curr)
    est_fee_dec = calculate_paypal_estimated_fee(amt_dec, curr, req.country)
    net_dec = quantize_currency(amt_dec - est_fee_dec, curr)

    hist_rows = (
        db.query(TransactionModel.amount)
        .filter(TransactionModel.user_id == user.id)
        .order_by(TransactionModel.created_at.desc())
        .limit(50)
        .all()
    )
    historical_amounts = [float(r[0]) for r in hist_rows if r[0] is not None]

    is_anomaly, risk_score, risk_level, anomaly_reason = anomaly_service.analyze_transaction(
        amount=float(amt_dec),
        is_international=is_inter,
        email=req.customerEmail,
        historical_amounts=historical_amounts,
    )

    txn_id = f"TXN-{uuid.uuid4().hex[:8].upper()}"
    new_txn = TransactionModel(
        id=txn_id,
        user_id=user.id,
        paypal_order_id=f"7W{uuid.uuid4().hex[:8].upper()}M",
        paypal_capture_id=f"CAP-{uuid.uuid4().hex[:8].upper()}",
        customer_name=req.customerName,
        customer_email=req.customerEmail,
        amount=float(amt_dec),
        currency=curr,
        status="COMPLETED",
        date=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        estimated_fee=float(est_fee_dec),
        actual_fee=float(est_fee_dec),
        net_amount=float(net_dec),
        payment_method=req.paymentMethod,
        country=req.country,
        risk_score=risk_score,
        risk_level=risk_level,
        is_anomaly=is_anomaly,
        anomaly_reason=anomaly_reason,
        data_source="sandbox",
        category="Sales",
        txn_type="income",
    )

    try:
        db.add(new_txn)
        db.commit()
        db.refresh(new_txn)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate transaction identifier; please retry.") from exc
    return new_txn.to_dict()


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
def create_manual_transaction(
    req: ManualTransactionRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creates a manual income or expense ledger entry owned by the authenticated user."""
    user = require_authenticated_user(current_user)
    curr = (req.currency or "USD").strip().upper()
    amt_dec = quantize_currency(req.amount, curr)
    valid_status = req.status.strip().upper()
    if valid_status not in {"COMPLETED", "PENDING", "DENIED", "REFUNDED", "DISPUTED"}:
        raise HTTPException(status_code=400, detail="Unsupported transaction status.")

    if req.txnType == "expense":
        est_fee_dec = Decimal("0.00")
        net_dec = Decimal("0.00") if valid_status in {"DENIED", "REFUNDED"} else amt_dec
    else:
        est_fee_dec = calculate_paypal_estimated_fee(amt_dec, curr, req.country)
        net_dec = Decimal("0.00") if valid_status in {"DENIED", "REFUNDED"} else quantize_currency(amt_dec - est_fee_dec, curr)

    hist_rows = (
        db.query(TransactionModel.amount)
        .filter(TransactionModel.user_id == user.id)
        .order_by(TransactionModel.created_at.desc())
        .limit(50)
        .all()
    )
    historical_amounts = [float(r[0]) for r in hist_rows if r[0] is not None]
    is_anomaly, risk_score, risk_level, anomaly_reason = anomaly_service.analyze_transaction(
        amount=float(amt_dec),
        is_international=is_cross_border(req.country),
        email=req.customerEmail,
        historical_amounts=historical_amounts,
    )

    clean_date = req.date.strip() if isinstance(req.date, str) and req.date.strip() else datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    new_txn = TransactionModel(
        id=f"TXN-{uuid.uuid4().hex[:8].upper()}",
        user_id=user.id,
        customer_name=req.customerName.strip(),
        customer_email=req.customerEmail.strip(),
        amount=float(amt_dec),
        currency=curr,
        status=valid_status,
        date=clean_date,
        estimated_fee=float(est_fee_dec),
        actual_fee=None,
        net_amount=float(net_dec),
        payment_method=req.paymentMethod.strip(),
        country=req.country.strip(),
        risk_score=risk_score,
        risk_level=risk_level,
        is_anomaly=is_anomaly,
        anomaly_reason=anomaly_reason,
        data_source="synthetic",
        category=req.category.strip(),
        txn_type=req.txnType,
        notes=req.notes.strip() if req.notes else None,
    )
    try:
        db.add(new_txn)
        db.commit()
        db.refresh(new_txn)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate transaction identifier; please retry.") from exc
    return new_txn.to_dict()


def _get_owned_transaction(db: Session, txn_id: str, current_user: UserModel) -> TransactionModel:
    user = require_authenticated_user(current_user)
    scoped_uid = None if (user.role or "").lower() == "admin" else user.id
    txn = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_uid).filter(
        TransactionModel.id == txn_id.strip()
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return txn


@router.get("/transactions/{txn_id}")
def get_transaction_by_id(
    txn_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetches a single transaction strictly scoped to the authenticated owner (or admin)."""
    return _get_owned_transaction(db, txn_id, current_user).to_dict()


@router.put("/transactions/{txn_id}")
@router.patch("/transactions/{txn_id}")
def update_transaction(
    txn_id: str,
    req: UpdateTransactionRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Updates an owned transaction's category, notes, or editable manual ledger fields."""
    user = require_authenticated_user(current_user)
    txn = _get_owned_transaction(db, txn_id, user)

    if txn.id in SEED_DEMO_TRANSACTION_IDS and (user.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Shared demo baseline transactions are read-only.")

    is_paypal_settled = bool((txn.paypal_capture_id or txn.paypal_order_id) and txn.data_source == "sandbox")
    if is_paypal_settled and (
        req.amount is not None
        or req.currency is not None
        or req.status is not None
        or req.txnType is not None
    ):
        raise HTTPException(
            status_code=400,
            detail="Authoritative PayPal settled amounts, currency, type, or status cannot be modified directly; use refund or sync.",
        )

    if req.customerName is not None:
        txn.customer_name = req.customerName.strip()
    if req.category is not None:
        txn.category = req.category.strip()
    if req.notes is not None:
        txn.notes = req.notes.strip()

    recompute = False
    if req.txnType is not None and req.txnType != (txn.txn_type or "income"):
        txn.txn_type = req.txnType
        recompute = True
    if req.currency is not None:
        txn.currency = req.currency.strip().upper()
        recompute = True
    if req.amount is not None:
        txn.amount = float(quantize_currency(req.amount, txn.currency))
        recompute = True
    if req.status is not None:
        st = req.status.strip().upper()
        if st not in {"COMPLETED", "PENDING", "DENIED", "REFUNDED", "DISPUTED"}:
            raise HTTPException(status_code=400, detail="Unsupported transaction status.")
        txn.status = st
        recompute = True

    if recompute:
        if not is_paypal_settled and (req.amount is not None or req.currency is not None or req.txnType is not None):
            txn.actual_fee = None
        amt_dec = to_decimal(txn.amount)
        if (txn.txn_type or "income") == "expense":
            txn.estimated_fee = 0.0
            txn.net_amount = 0.0 if txn.status in {"DENIED", "REFUNDED"} else float(amt_dec)
        else:
            est_dec = calculate_paypal_estimated_fee(amt_dec, txn.currency, txn.country)
            txn.estimated_fee = float(est_dec)
            fee_used = to_decimal(txn.actual_fee) if txn.actual_fee is not None else est_dec
            txn.net_amount = 0.0 if txn.status in {"DENIED", "REFUNDED"} else float(quantize_currency(amt_dec - fee_used, txn.currency))

    txn.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(txn)
    return txn.to_dict()


@router.delete("/transactions/{txn_id}")
def delete_transaction(
    txn_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes a manual/non-settled transaction strictly owned by the caller (or admin)."""
    user = require_authenticated_user(current_user)
    txn = _get_owned_transaction(db, txn_id, user)

    if txn.id in SEED_DEMO_TRANSACTION_IDS and (user.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Shared demo baseline transactions cannot be deleted.")
    if txn.data_source == "sandbox" and (txn.paypal_capture_id or txn.paypal_order_id):
        raise HTTPException(status_code=400, detail="PayPal sandbox ledger transactions cannot be deleted; issue a refund instead.")
    if txn.paypal_capture_id and txn.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Completed PayPal captures cannot be deleted; issue a refund instead.")

    db.delete(txn)
    db.commit()
    return {"status": "DELETED", "id": txn_id}

@router.get("/health/metrics")
def get_health_metrics(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Calculates live account health scores, behavior metrics, risk indicators,
    dynamic historical trends, and preventive recommendations scoped to the tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    records = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id).all()
    txns = [r.to_dict() for r in records]

    health = anomaly_service.calculate_account_health(txns)
    return health

@router.get("/health/timeline")
def get_health_timeline(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns chronological timeline of flagged anomalies scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    records = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id).all()
    txns = [r.to_dict() for r in records]
    return anomaly_service.detect_anomalies(txns)

@router.post("/health/simulate-pattern")
def simulate_health_pattern(
    req: HealthSimulationRequest,
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Simulates what-if pattern adjustments (e.g. dispute spikes, refund surges, card decline surges)
    scoped to the authenticated merchant's ledger.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    records = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id).all()
    txns = [r.to_dict() for r in records]

    current_health = anomaly_service.calculate_account_health(txns)
    simulated_health = anomaly_service.calculate_account_health(
        txns,
        simulation_deltas=req.model_dump() if hasattr(req, "model_dump") else req.dict()
    )

    score_delta = simulated_health["healthScore"] - current_health["healthScore"]

    return {
        "currentScore": current_health["healthScore"],
        "currentTier": current_health["healthTier"],
        "simulatedScore": simulated_health["healthScore"],
        "simulatedTier": simulated_health["healthTier"],
        "scoreDelta": score_delta,
        "isScoreDegraded": score_delta < 0,
        "simulatedBreakdown": simulated_health["scoreBreakdown"],
        "simulatedRiskIndicators": simulated_health["riskIndicators"],
        "earlyWarnings": simulated_health["earlyWarnings"],
        "safetyMarginText": simulated_health["safetyMarginText"],
        "maxDisputesTolerated": simulated_health["maxDisputesTolerated"]
    }

# --- AI COST OPTIMIZER ENDPOINTS ---

@router.post("/optimizer/calculate")
def calculate_fees(
    req: FeeCalculationRequest,
    current_user: UserModel = Depends(get_current_user)
):
    """
    Calculates exact PayPal processing fees across tiers, currencies, cross-border surcharges,
    and foreign exchange conversion spreads with transparent tier comparisons.
    """
    require_authenticated_user(current_user)
    return cost_optimizer_service.calculate_predicted_fee(
        amount=req.amount,
        source_currency=req.sourceCurrency,
        target_currency=req.targetCurrency,
        is_international=req.isInternational,
        payment_tier=req.paymentMethod
    )

@router.get("/optimizer/historical-analysis")
def get_optimizer_historical_analysis(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reconciles actual captured fees vs estimated fees from database transactions scoped to tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return cost_optimizer_service.get_historical_analysis(db, scoped_user_id=scoped_user_id)

@router.get("/optimizer/recommendations")
def get_optimizer_recommendations(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generates verified, evidence-based AI cost optimization recommendations scoped to tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return cost_optimizer_service.generate_cost_recommendations(db, scoped_user_id=scoped_user_id)

@router.post("/optimizer/compare-scenarios")
def compare_scenarios(
    req: ScenarioComparisonRequest,
    current_user: UserModel = Depends(get_current_user)
):
    """
    Simulates and ranks multiple merchant transaction scenarios side-by-side.
    """
    require_authenticated_user(current_user)
    results = []
    for sc in req.scenarios:
        calc = cost_optimizer_service.calculate_predicted_fee(
            amount=sc.amount,
            source_currency=sc.sourceCurrency,
            target_currency=sc.targetCurrency,
            is_international=sc.isInternational,
            payment_tier=sc.paymentTier
        )
        results.append({
            "scenarioId": sc.id,
            "scenarioName": sc.name,
            "amount": sc.amount,
            "sourceCurrency": sc.sourceCurrency,
            "targetCurrency": sc.targetCurrency,
            "paymentTier": sc.paymentTier,
            "totalFee": calc["totalEstimatedFee"],
            "netReceived": calc["estimatedNetReceived"],
            "effectiveFeeRate": calc["effectiveFeeRate"]
        })

    # Sort scenarios by highest net received
    results.sort(key=lambda x: x["netReceived"], reverse=True)
    best_net = results[0]["netReceived"] if results else 0.0

    for r in results:
        r["varianceVsBest"] = round(best_net - r["netReceived"], 2)

    return {
        "scenarios": results,
        "recommendedScenario": results[0] if results else None
    }

# --- AI SCAM SHIELD ENDPOINTS ---

@router.post("/scam-shield/analyze")
def analyze_scam(
    req: ScamAnalyzeRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Zero-touch message and URL threat analyzer bound strictly to the authenticated user's account.
    """
    user = require_authenticated_user(current_user)
    channel = req.channel or req.targetType or "email"
    analysis = scam_shield_service.analyze_message_content(
        text=req.text,
        target_type=req.targetType,
        channel=channel
    )
    # Persist sanitized audit log owned by the authenticated user
    return scam_shield_service.record_scam_audit(
        db=db,
        text=req.text,
        target_type=req.targetType,
        analysis=analysis,
        user_id=user.id
    )

@router.get("/scam-shield/history")
def get_scam_history(
    limit: int = 15,
    offset: int = 0,
    risk: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves recent threat scans from the audit ledger scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    clamped_limit = max(1, min(100, int(limit))) if (isinstance(limit, int) and not isinstance(limit, bool)) else 15
    safe_offset = max(0, int(offset)) if (isinstance(offset, int) and not isinstance(offset, bool)) else 0
    return scam_shield_service.get_audit_history(
        db, limit=clamped_limit, scoped_user_id=scoped_user_id, offset=safe_offset, risk_level=risk
    )

@router.get("/scam-shield/threat-distribution")
def get_scam_threat_distribution(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns threat score breakdown and risk level distributions scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return scam_shield_service.get_threat_distribution(db, scoped_user_id=scoped_user_id)

@router.post("/assistant/chat")
def chat_assistant(
    req: ChatRequest,
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Read-only AI Financial Support Agent answering merchant queries strictly scoped to authenticated tenant data.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    history_dicts = [h.dict() if hasattr(h, "dict") else h.model_dump() for h in req.history] if req.history else None
    return ai_agent_service.handle_financial_query(
        db=db,
        query=req.message,
        history=history_dicts,
        scoped_user_id=scoped_user_id
    )

# --- ADVANCED FINANCIAL ANALYTICS & DECISION INTELLIGENCE ---

@router.get("/analytics/comparison")
def get_period_comparison(
    period: str = Query("monthly", regex="^(daily|weekly|monthly|yearly)$"),
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Multi-period performance comparison scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return decision_intelligence_service.get_period_comparison(db, period=period, scoped_user_id=scoped_user_id)

@router.get("/analytics/forecast")
def get_revenue_forecast(
    period: str = Query("daily", regex="^(daily|weekly|monthly)$"),
    horizon: int = Query(7, ge=1, le=30),
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Predictive Financial Forecasting Engine scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return decision_intelligence_service.get_revenue_forecast(
        db,
        period=period,
        horizon=horizon,
        scoped_user_id=scoped_user_id
    )

@router.get("/analytics/decision-intelligence")
def get_decision_intelligence(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Actionable Decision Intelligence Engine scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return decision_intelligence_service.generate_decision_intelligence(db, scoped_user_id=scoped_user_id)

@router.post("/analytics/simulate-scenario")
def simulate_decision_scenario(
    req: DecisionScenarioRequest,
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Interactive Scenario Simulator scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return decision_intelligence_service.simulate_decision_scenario(
        db=db,
        volume_growth_pct=req.volumeGrowthPct,
        target_avg_ticket=req.targetAverageTicket,
        cross_border_pct=req.crossBorderPct,
        payment_tier=req.paymentTier,
        scoped_user_id=scoped_user_id
    )


# --- CATEGORIES, BUDGETS & AI USAGE TELEMETRY ---

@router.get("/categories")
def list_categories(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lists categories owned by the authenticated user."""
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    q = db.query(CategoryModel)
    if scoped_user_id is not None:
        q = q.filter(CategoryModel.user_id == scoped_user_id)
    return [c.to_dict() for c in q.order_by(CategoryModel.name.asc()).all()]


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(
    req: CategoryCreateRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creates a user-owned financial category."""
    user = require_authenticated_user(current_user)
    clean_name = req.name.strip()
    existing = (
        db.query(CategoryModel)
        .filter(CategoryModel.user_id == user.id, func.lower(CategoryModel.name) == clean_name.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists.")
    cat = CategoryModel(
        id=f"CAT-{uuid.uuid4().hex[:8].upper()}",
        user_id=user.id,
        name=clean_name,
        kind=req.kind,
        color=req.color.strip(),
    )
    try:
        db.add(cat)
        db.commit()
        db.refresh(cat)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Category already exists.") from exc
    return cat.to_dict()


@router.put("/categories/{cat_id}")
@router.patch("/categories/{cat_id}")
def update_category(
    cat_id: str,
    req: CategoryUpdateRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Updates an existing user-owned financial category."""
    user = require_authenticated_user(current_user)
    q = db.query(CategoryModel).filter(CategoryModel.id == cat_id.strip())
    if (user.role or "").lower() != "admin":
        q = q.filter(CategoryModel.user_id == user.id)
    cat = q.first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")

    if req.name is not None:
        clean_name = req.name.strip()
        dup = (
            db.query(CategoryModel)
            .filter(
                CategoryModel.user_id == cat.user_id,
                CategoryModel.id != cat.id,
                func.lower(CategoryModel.name) == clean_name.lower(),
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail="Category already exists.")
        cat.name = clean_name
    if req.kind is not None:
        cat.kind = req.kind
    if req.color is not None:
        cat.color = req.color.strip()

    try:
        db.commit()
        db.refresh(cat)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Category already exists.") from exc
    return cat.to_dict()


@router.delete("/categories/{cat_id}")
def delete_category(
    cat_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = require_authenticated_user(current_user)
    q = db.query(CategoryModel).filter(CategoryModel.id == cat_id.strip())
    if (user.role or "").lower() != "admin":
        q = q.filter(CategoryModel.user_id == user.id)
    cat = q.first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    db.delete(cat)
    db.commit()
    return {"status": "DELETED", "id": cat_id}


@router.get("/budgets")
def list_budgets(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lists configured budgets scoped to the authenticated user."""
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    q = db.query(BudgetModel)
    if scoped_user_id is not None:
        q = q.filter(BudgetModel.user_id == scoped_user_id)
    return [b.to_dict() for b in q.order_by(BudgetModel.created_at.desc()).all()]


@router.post("/budgets", status_code=status.HTTP_201_CREATED)
def create_budget(
    req: BudgetCreateRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creates a spending/processing budget for a category owned by the authenticated user."""
    user = require_authenticated_user(current_user)
    clean_cat = req.category.strip()
    curr = req.currency.strip().upper()
    limit_dec = quantize_currency(req.limitAmount, curr)
    existing = (
        db.query(BudgetModel)
        .filter(BudgetModel.user_id == user.id, func.lower(BudgetModel.category) == clean_cat.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"A budget for category '{clean_cat}' already exists.")

    budget = BudgetModel(
        id=f"BUD-{uuid.uuid4().hex[:8].upper()}",
        user_id=user.id,
        category=clean_cat,
        limit_amount=limit_dec,
        currency=curr,
        period=req.period,
        alert_threshold_pct=req.alertThresholdPct,
    )
    try:
        db.add(budget)
        db.commit()
        db.refresh(budget)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"A budget for category '{clean_cat}' already exists.") from exc
    return budget.to_dict()


@router.put("/budgets/{budget_id}")
@router.patch("/budgets/{budget_id}")
def update_budget(
    budget_id: str,
    req: BudgetUpdateRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = require_authenticated_user(current_user)
    q = db.query(BudgetModel).filter(BudgetModel.id == budget_id.strip())
    if (user.role or "").lower() != "admin":
        q = q.filter(BudgetModel.user_id == user.id)
    budget = q.first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found.")

    if req.category is not None:
        clean_cat = req.category.strip()
        dup = (
            db.query(BudgetModel)
            .filter(
                BudgetModel.user_id == budget.user_id,
                func.lower(BudgetModel.category) == clean_cat.lower(),
                BudgetModel.id != budget.id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"A budget for category '{clean_cat}' already exists.")
        budget.category = clean_cat
    if req.limitAmount is not None:
        budget.limit_amount = quantize_currency(req.limitAmount, budget.currency)
    if req.period is not None:
        budget.period = req.period
    if req.alertThresholdPct is not None:
        budget.alert_threshold_pct = req.alertThresholdPct
    budget.updated_at = datetime.utcnow()
    try:
        db.commit()
        db.refresh(budget)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Budget category conflicts with an existing budget.") from exc
    return budget.to_dict()


@router.delete("/budgets/{budget_id}")
def delete_budget(
    budget_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = require_authenticated_user(current_user)
    q = db.query(BudgetModel).filter(BudgetModel.id == budget_id.strip())
    if (user.role or "").lower() != "admin":
        q = q.filter(BudgetModel.user_id == user.id)
    budget = q.first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found.")
    db.delete(budget)
    db.commit()
    return {"status": "DELETED", "id": budget_id}


@router.get("/budgets/utilization")
def get_budget_utilization(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Compares each configured budget against actual ledger spending in that category
    over the budget's configured window ('weekly', 'monthly', 'quarterly'),
    normalized cleanly into each budget's currency without cross-tenant leakage.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    bq = db.query(BudgetModel)
    if scoped_user_id is not None:
        bq = bq.filter(BudgetModel.user_id == scoped_user_id)
    budgets = bq.order_by(BudgetModel.created_at.desc()).all()

    txns = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id).filter(
        TransactionModel.status != "DENIED"
    ).all()

    now_utc = datetime.utcnow()
    period_days = {"weekly": 7, "monthly": 30, "quarterly": 90}
    parsed_txns = [(t, parse_transaction_datetime(t.date, t.created_at)) for t in txns]

    items = []
    for b in budgets:
        b_curr = (b.currency or "USD").strip().upper()
        limit_dec = quantize_currency(b.limit_amount, b_curr)
        cat_key = b.category.strip().lower()
        cutoff = now_utc - timedelta(days=period_days.get((b.period or "monthly").lower(), 30))

        spent_dec = Decimal("0")
        for t, dt in parsed_txns:
            if dt < cutoff:
                continue
            # Always strictly isolate by owner when admin queries globally (scoped_user_id is None)
            if scoped_user_id is None and t.user_id != b.user_id:
                continue
            if (t.txn_type or "income").lower() == "expense" and (t.category or "General").strip().lower() == cat_key:
                spent_dec += convert_between_currencies(t.amount, t.currency, b_curr)
            if cat_key in {"fees", "payment fees", "processing fees"} and t.status in ("COMPLETED", "DISPUTED"):
                eff_fee = t.actual_fee if t.actual_fee is not None else (t.estimated_fee or 0.0)
                spent_dec += convert_between_currencies(eff_fee, t.currency, b_curr)

        spent_dec = quantize_currency(spent_dec, b_curr)
        remaining_dec = quantize_currency(max(Decimal("0"), limit_dec - spent_dec), b_curr)
        util_pct = float(((spent_dec / limit_dec) * Decimal("100")).quantize(Decimal("0.1"))) if limit_dec > Decimal("0") else 0.0
        state = "EXCEEDED" if util_pct >= 100.0 else ("WARNING" if util_pct >= float(b.alert_threshold_pct) else "ON_TRACK")
        items.append({
            **b.to_dict(),
            "spentAmount": float(spent_dec),
            "remainingAmount": float(remaining_dec),
            "utilizationPct": util_pct,
            "status": state,
        })

    return {"budgets": items, "totalBudgets": len(items)}


@router.get("/assistant/usage")
def get_ai_usage_summary(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns lifetime tenant-scoped AI Assistant & RAG usage telemetry."""
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    base_q = db.query(AIUsageLogModel)
    if scoped_user_id is not None:
        base_q = base_q.filter(AIUsageLogModel.user_id == scoped_user_id)

    total = int(base_q.count())
    gemini_count = int(base_q.filter(AIUsageLogModel.provider == "gemini").count())
    fallback_count = int(base_q.filter(AIUsageLogModel.used_fallback.is_(True)).count())

    avg_q = db.query(func.avg(AIUsageLogModel.latency_ms))
    if scoped_user_id is not None:
        avg_q = avg_q.filter(AIUsageLogModel.user_id == scoped_user_id)
    avg_raw = avg_q.scalar()
    avg_latency = round(float(avg_raw), 1) if avg_raw is not None else 0.0

    recent_logs = base_q.order_by(AIUsageLogModel.created_at.desc()).limit(10).all()
    return {
        "totalQueries": total,
        "geminiQueries": gemini_count,
        "deterministicQueries": max(0, total - gemini_count),
        "fallbackCount": fallback_count,
        "averageLatencyMs": avg_latency,
        "recentLogs": [l.to_dict() for l in recent_logs],
    }
