from decimal import Decimal, ROUND_HALF_UP
from fastapi import APIRouter, Depends, HTTPException, Request, Header, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import json
import uuid

from database import get_db
from config import settings
from services.paypal_service import (
    paypal_service,
    PayPalAmbiguousError,
    PayPalAPIError,
    ZERO_DECIMAL_CURRENCIES,
    is_webhook_id_configured,
    to_decimal,
)
from services.anomaly_service import anomaly_service
from services.shared_utils import calculate_paypal_estimated_fee, is_cross_border
from services.auth_service import (
    auth_service,
    get_current_user,
    get_client_meta,
    require_authenticated_user,
    scope_transaction_query,
)
from models.transaction import TransactionModel, PayPalOrderModel
from models.user import UserModel, WebhookEventModel

router = APIRouter(prefix="/api/v1/paypal", tags=["PayPal Sandbox"])

SUPPORTED_CURRENCIES = {"USD", "EUR", "GBP", "CAD", "AUD", "JPY"}
CAPTURE_CLAIM_TIMEOUT_SECONDS = 120


class CreateOrderRequest(BaseModel):
    amount: Decimal = Field(..., gt=Decimal("0"), le=Decimal("1000000.00"), description="Gross order amount")
    currency: str = Field(default="USD", max_length=3)
    referenceId: Optional[str] = None

    @field_validator("amount", mode="before")
    @classmethod
    def coerce_amount_decimal(cls, v: Any) -> Decimal:
        dec = to_decimal(v)
        if not dec.is_finite():
            raise ValueError("Order amount must be a finite number.")
        return dec

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        clean_curr = v.upper().strip()
        if clean_curr not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Unsupported currency: {v}. Supported currencies are: {', '.join(sorted(SUPPORTED_CURRENCIES))}")
        return clean_curr

    @model_validator(mode="after")
    def validate_currency_precision(self) -> "CreateOrderRequest":
        if self.currency in ZERO_DECIMAL_CURRENCIES:
            if self.amount < Decimal("1") or self.amount != self.amount.to_integral_value():
                raise ValueError(f"{self.currency} requires an integer whole-unit amount >= 1.")
        else:
            if self.amount != self.amount.quantize(Decimal("0.01")):
                raise ValueError(f"{self.currency} supports at most 2 decimal places.")
        return self


def _require_authenticated_user(current_user: Any) -> UserModel:
    """Guards endpoints even when called directly in Python tests without FastAPI DI."""
    return require_authenticated_user(current_user)


def _order_has_settled_capture(order_snapshot: Dict[str, Any]) -> bool:
    """Checks whether a PayPal order snapshot already holds a COMPLETED or PENDING capture."""
    purchase_units = order_snapshot.get("purchase_units") or []
    if purchase_units:
        captures = (purchase_units[0].get("payments") or {}).get("captures") or []
        if any(cap.get("status") in ("COMPLETED", "PENDING") for cap in captures):
            return True
    return order_snapshot.get("status") == "COMPLETED"


@router.get("/config")
def get_paypal_config():
    """
    Returns public PayPal configuration for frontend SDK mounting.
    Never exposes Client Secret or placeholder IDs when unconfigured.
    """
    configured = paypal_service.is_configured()
    return {
        "clientId": settings.PAYPAL_CLIENT_ID if configured else "",
        "mode": settings.PAYPAL_MODE,
        "currency": "USD",
        "isConfigured": configured,
    }


class RefundCaptureRequest(BaseModel):
    transactionId: str = Field(..., min_length=3, max_length=64)
    reason: Optional[str] = Field(default="Merchant-initiated sandbox refund", max_length=255)


@router.get("/orders/{order_id}")
async def sync_paypal_order_status(
    order_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Reconciles an owned PayPal order with PayPal Orders API v2 without trusting frontend status.
    """
    user = _require_authenticated_user(current_user)
    clean_order_id = order_id.strip()
    if not clean_order_id:
        raise HTTPException(status_code=400, detail="Valid order_id is required.")

    order_rec = db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == clean_order_id).first()
    if not order_rec:
        raise HTTPException(status_code=404, detail="PayPal order not found.")
    if (user.role or "").lower() != "admin" and order_rec.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this PayPal order.")

    if not paypal_service.is_configured():
        return {
            "orderId": order_rec.order_id,
            "status": order_rec.status,
            "amount": float(order_rec.amount),
            "currency": order_rec.currency,
            "source": "local_db",
        }

    try:
        snapshot = await paypal_service.get_order(clean_order_id)
    except PayPalAmbiguousError:
        raise HTTPException(status_code=503, detail="PayPal status synchronization temporarily unavailable.")
    except PayPalAPIError as exc:
        raise HTTPException(status_code=exc.status_code if exc.status_code in (400, 404) else 400, detail="Failed to retrieve PayPal order.")

    remote_status = snapshot.get("status") or order_rec.status
    existing_txn = db.query(TransactionModel).filter(TransactionModel.paypal_order_id == clean_order_id).first()

    # Never break active CAPTURING lock or erase CAPTURE_UNKNOWN without persisting the ledger transaction
    if order_rec.status == "CAPTURING":
        return {
            "orderId": clean_order_id,
            "status": order_rec.status,
            "amount": float(order_rec.amount),
            "currency": order_rec.currency,
            "source": "local_lock_preserved",
        }

    if remote_status == "COMPLETED" and not existing_txn and _order_has_settled_capture(snapshot):
        parsed = paypal_service.parse_capture_response(snapshot)
        amount_dec = parsed["amount"] if parsed["amount"] > Decimal("0") else to_decimal(order_rec.amount)
        curr = (parsed.get("currency") or order_rec.currency or "USD").upper()
        quant = Decimal("1") if curr in ZERO_DECIMAL_CURRENCIES else Decimal("0.01")
        is_inter = is_cross_border(parsed["country"])
        est_dec = calculate_paypal_estimated_fee(amount_dec, curr, parsed["country"])
        act_dec = parsed.get("actual_fee") if parsed.get("actual_fee") is not None else est_dec
        net_dec = parsed.get("net_amount") if parsed.get("net_amount") is not None else (amount_dec - act_dec).quantize(quant, rounding=ROUND_HALF_UP)
        is_anom, r_score, r_lvl, a_reason = anomaly_service.analyze_transaction(
            amount=float(amount_dec), is_international=is_inter, email=parsed["customer_email"]
        )
        try:
            db.add(
                TransactionModel(
                    id=f"TXN-{uuid.uuid4().hex[:8].upper()}",
                    user_id=order_rec.user_id,
                    paypal_order_id=clean_order_id,
                    paypal_capture_id=parsed.get("capture_id"),
                    customer_name=parsed["customer_name"],
                    customer_email=parsed["customer_email"],
                    amount=float(amount_dec),
                    currency=curr,
                    status="COMPLETED",
                    date=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
                    estimated_fee=float(est_dec),
                    actual_fee=float(act_dec),
                    net_amount=float(net_dec),
                    payment_method=parsed["payment_method"],
                    country=parsed["country"],
                    risk_score=r_score,
                    risk_level=r_lvl,
                    is_anomaly=is_anom,
                    anomaly_reason=a_reason,
                    data_source="sandbox",
                    raw_paypal_payload=json.dumps(snapshot),
                )
            )
            order_rec.status = "COMPLETED"
            order_rec.updated_at = datetime.utcnow()
            db.commit()
        except IntegrityError:
            db.rollback()
        return {
            "orderId": clean_order_id,
            "status": "COMPLETED",
            "amount": float(order_rec.amount),
            "currency": order_rec.currency,
            "source": "paypal_api",
        }

    if order_rec.status == "CAPTURE_UNKNOWN" and not existing_txn:
        return {
            "orderId": clean_order_id,
            "status": order_rec.status,
            "amount": float(order_rec.amount),
            "currency": order_rec.currency,
            "source": "local_reconcile_required",
        }

    if order_rec.status in ("CREATED", "APPROVED", "FAILED") or (
        existing_txn and order_rec.status not in ("REFUNDED", "REFUNDING", "REFUND_UNKNOWN", "DISPUTED")
    ):
        order_rec.status = remote_status
        order_rec.updated_at = datetime.utcnow()
        db.commit()
    return {
        "orderId": clean_order_id,
        "status": order_rec.status,
        "amount": float(order_rec.amount),
        "currency": order_rec.currency,
        "source": "paypal_api",
    }


@router.post("/refund")
async def refund_captured_payment(
    req: RefundCaptureRequest,
    request: Request,
    paypal_request_id: Optional[str] = Header(None, alias="PayPal-Request-Id"),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Refunds a settled PayPal Sandbox transaction owned by the authenticated merchant.
    Acquires atomic REFUNDING claim before contacting PayPal and reconciles REFUND_UNKNOWN safely.
    """
    user = _require_authenticated_user(current_user)
    ip, ua = get_client_meta(request)
    txn_id_clean = req.transactionId.strip()

    txn = scope_transaction_query(db.query(TransactionModel), TransactionModel, None if (user.role or "").lower() == "admin" else user.id).filter(
        TransactionModel.id == txn_id_clean
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found in your ledger.")
    if txn.status == "REFUNDED":
        return {"status": "ALREADY_REFUNDED", "transaction": txn.to_dict()}
    if not txn.paypal_capture_id or txn.status not in ("COMPLETED", "REFUNDING", "REFUND_UNKNOWN"):
        raise HTTPException(status_code=400, detail="Only completed transactions with a PayPal capture ID can be refunded.")
    if not paypal_service.is_configured():
        raise HTTPException(status_code=400, detail="PayPal Sandbox credentials not configured.")

    now = datetime.utcnow()
    stale_before = now - timedelta(seconds=CAPTURE_CLAIM_TIMEOUT_SECONDS)
    prior_status = txn.status

    claimed = (
        db.query(TransactionModel)
        .filter(
            TransactionModel.id == txn_id_clean,
            TransactionModel.status == "COMPLETED",
        )
        .update({TransactionModel.status: "REFUNDING", TransactionModel.updated_at: now}, synchronize_session=False)
    )
    db.commit()

    needs_reconcile = False
    if claimed != 1:
        recovered = (
            db.query(TransactionModel)
            .filter(
                TransactionModel.id == txn_id_clean,
                (
                    (TransactionModel.status == "REFUND_UNKNOWN")
                    | ((TransactionModel.status == "REFUNDING") & (TransactionModel.updated_at < stale_before))
                ),
            )
            .update({TransactionModel.status: "REFUNDING", TransactionModel.updated_at: now}, synchronize_session=False)
        )
        db.commit()
        if recovered == 1:
            needs_reconcile = True
        else:
            db.expire_all()
            latest = db.query(TransactionModel).filter(TransactionModel.id == txn_id_clean).first()
            if latest and latest.status == "REFUNDED":
                return {"status": "ALREADY_REFUNDED", "transaction": latest.to_dict()}
            raise HTTPException(status_code=409, detail="Refund is already in progress. Please retry shortly.")

    def _set_refund_status(new_status: str, zero_net: bool = False) -> None:
        updates = {TransactionModel.status: new_status, TransactionModel.updated_at: datetime.utcnow()}
        if zero_net:
            updates[TransactionModel.net_amount] = 0.0
        db.query(TransactionModel).filter(TransactionModel.id == txn_id_clean).update(updates, synchronize_session=False)
        if zero_net and txn.paypal_order_id:
            db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == txn.paypal_order_id).update(
                {PayPalOrderModel.status: "REFUNDED", PayPalOrderModel.updated_at: datetime.utcnow()},
                synchronize_session=False,
            )
        db.commit()

    # Reconcile ambiguous/stale refund state with PayPal before re-issuing a refund request
    if needs_reconcile and txn.paypal_order_id:
        try:
            snapshot = await paypal_service.get_order(txn.paypal_order_id)
            pus = snapshot.get("purchase_units") or []
            captures = ((pus[0].get("payments") or {}).get("captures") or []) if pus else []
            cap_statuses = {c.get("status") for c in captures if isinstance(c, dict)}
            if "REFUNDED" in cap_statuses:
                _set_refund_status("REFUNDED", zero_net=True)
                db.refresh(txn)
                return {"status": "ALREADY_REFUNDED", "transaction": txn.to_dict()}
        except PayPalAmbiguousError:
            _set_refund_status("REFUND_UNKNOWN")
            raise HTTPException(status_code=504, detail="Unable to confirm prior refund state; please retry shortly.")
        except PayPalAPIError:
            pass

    req_id = paypal_request_id.strip() if isinstance(paypal_request_id, str) and paypal_request_id.strip() else f"refund-{txn.paypal_capture_id}"
    try:
        refund_resp = await paypal_service.refund_capture(
            capture_id=txn.paypal_capture_id,
            amount=txn.amount,
            currency=txn.currency,
            note_to_payer=req.reason,
            request_id=req_id,
        )
    except PayPalAmbiguousError:
        _set_refund_status("REFUND_UNKNOWN")
        auth_service.record_audit(
            db=db,
            action="PAYPAL_REFUND_AMBIGUOUS",
            user_id=user.id,
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"txnId": txn.id, "priorStatus": prior_status},
        )
        raise HTTPException(status_code=504, detail="PayPal refund request timed out; status marked unknown for reconciliation.")
    except PayPalAPIError as exc:
        if "CAPTURE_FULLY_REFUNDED" in ((exc.error_name or "") + str(exc)) and txn.paypal_order_id:
            try:
                snapshot = await paypal_service.get_order(txn.paypal_order_id)
                pus = snapshot.get("purchase_units") or []
                captures = ((pus[0].get("payments") or {}).get("captures") or []) if pus else []
                if any(isinstance(c, dict) and c.get("status") == "REFUNDED" for c in captures):
                    _set_refund_status("REFUNDED", zero_net=True)
                    db.refresh(txn)
                    return {"status": "ALREADY_REFUNDED", "transaction": txn.to_dict()}
            except Exception:
                pass
        restore_status = "COMPLETED" if prior_status in ("COMPLETED", "REFUNDING") else prior_status
        _set_refund_status(restore_status)
        raise HTTPException(status_code=400, detail="PayPal rejected the refund request.")

    _set_refund_status("REFUNDED", zero_net=True)
    db.refresh(txn)

    auth_service.record_audit(
        db=db,
        action="PAYPAL_CAPTURE_REFUNDED",
        user_id=user.id,
        ip_address=ip,
        user_agent=ua,
        status="SUCCESS",
        details={"txnId": txn.id, "captureId": txn.paypal_capture_id, "refundId": refund_resp.get("id")},
    )
    return {"status": "SUCCESS", "transaction": txn.to_dict(), "refund": refund_resp}


@router.post("/create-order")
async def create_paypal_order(
    req: CreateOrderRequest,
    request: Request,
    paypal_request_id: Optional[str] = Header(None, alias="PayPal-Request-Id"),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Creates a PayPal Sandbox order bound to the authenticated merchant and persists
    authoritative ownership in paypal_orders before returning.
    """
    user = _require_authenticated_user(current_user)
    ip, ua = get_client_meta(request)
    clean_req_id = paypal_request_id.strip() if isinstance(paypal_request_id, str) and paypal_request_id.strip() else None
    effective_request_id = clean_req_id or req.referenceId or str(uuid.uuid4())

    try:
        if not paypal_service.is_configured():
            raise HTTPException(
                status_code=400,
                detail="PayPal Sandbox credentials not configured in backend/.env. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET."
            )

        # External HTTP call performed with NO open DB write lock
        order_data = await paypal_service.create_order(
            amount=req.amount,
            currency=req.currency,
            reference_id=req.referenceId,
            request_id=effective_request_id,
        )
        order_id = (order_data.get("id") or "").strip()
        if not order_id:
            raise HTTPException(status_code=502, detail="PayPal returned an order without an identifier.")

        existing_order = db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == order_id).first()
        is_admin = (user.role or "").lower() == "admin"
        if existing_order:
            if existing_order.user_id != user.id and not is_admin:
                raise HTTPException(status_code=403, detail="Access forbidden: order belongs to another merchant.")
        else:
            order_row = PayPalOrderModel(
                order_id=order_id,
                user_id=user.id,
                amount=req.amount,
                currency=req.currency,
                status="CREATED",
            )
            db.add(order_row)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                raced = db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == order_id).first()
                if raced and raced.user_id != user.id and not is_admin:
                    raise HTTPException(status_code=403, detail="Access forbidden: order belongs to another merchant.")

        auth_service.record_audit(
            db=db,
            action="PAYPAL_ORDER_CREATED",
            user_id=user.id,
            ip_address=ip,
            user_agent=ua,
            status="SUCCESS",
            details={"orderId": order_id, "amount": str(req.amount), "currency": req.currency}
        )

        return {
            "orderId": order_id,
            "status": order_data.get("status"),
            "raw": order_data
        }
    except HTTPException:
        raise
    except (PayPalAmbiguousError, PayPalAPIError) as exc:
        auth_service.record_audit(
            db=db,
            action="PAYPAL_ORDER_CREATE_FAILED",
            user_id=user.id,
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"error": type(exc).__name__}
        )
        status_code = 504 if isinstance(exc, PayPalAmbiguousError) else 502
        raise HTTPException(status_code=status_code, detail="Failed to initialize PayPal order with Sandbox API.")
    except Exception as e:
        db.rollback()
        auth_service.record_audit(
            db=db,
            action="PAYPAL_ORDER_CREATE_FAILED",
            user_id=user.id,
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"error": type(e).__name__}
        )
        raise HTTPException(status_code=500, detail="Failed to initialize PayPal order with Sandbox API.")


@router.post("/capture-order/{order_id}")
async def capture_paypal_order(
    order_id: str,
    request: Request,
    paypal_request_id: Optional[str] = Header(None, alias="PayPal-Request-Id"),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Captures an approved PayPal order with strict authentication, order ownership enforcement,
    atomic CAPTURING locking committed prior to external HTTP calls, timeout reconciliation
    before retry, PayPal-Request-Id idempotency, and exact Decimal fee preservation ($0.00-safe).
    """
    user = _require_authenticated_user(current_user)
    ip, ua = get_client_meta(request)
    clean_order_id = order_id.strip()
    clean_req_id = paypal_request_id.strip() if isinstance(paypal_request_id, str) and paypal_request_id.strip() else None
    capture_request_id = clean_req_id or f"capture-{clean_order_id}"

    # 1. Verify authoritative order ownership BEFORE any capture or external call
    is_admin = (user.role or "").lower() == "admin"
    order_rec = db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == clean_order_id).first()
    if not order_rec:
        raise HTTPException(status_code=404, detail="PayPal order not found or missing ownership record.")
    if not order_rec.user_id:
        raise HTTPException(status_code=403, detail="Order ownership is missing or ambiguous.")
    if order_rec.user_id != user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Access forbidden: you do not own this PayPal order.")
    owner_user_id = order_rec.user_id

    # 2. Check existing captured transaction idempotently
    existing_txn = db.query(TransactionModel).filter(TransactionModel.paypal_order_id == clean_order_id).first()
    if existing_txn:
        if not existing_txn.user_id or (existing_txn.user_id != user.id and not is_admin):
            raise HTTPException(status_code=403, detail="Access forbidden: transaction ownership mismatch.")
        if existing_txn.status in ("COMPLETED", "PENDING"):
            return {
                "message": "Order was already captured (idempotent result)",
                "transaction": existing_txn.to_dict()
            }

    # 3. Acquire atomic CAPTURING lock and commit BEFORE any external PayPal HTTP call
    now = datetime.utcnow()
    stale_before = now - timedelta(seconds=CAPTURE_CLAIM_TIMEOUT_SECONDS)
    needs_reconcile = False

    claimed = (
        db.query(PayPalOrderModel)
        .filter(
            PayPalOrderModel.order_id == clean_order_id,
            PayPalOrderModel.status.in_(["CREATED", "APPROVED", "FAILED"]),
        )
        .update(
            {PayPalOrderModel.status: "CAPTURING", PayPalOrderModel.updated_at: now},
            synchronize_session=False,
        )
    )
    db.commit()

    if claimed != 1:
        # Attempt recovery for CAPTURE_UNKNOWN or abandoned stale CAPTURING claim
        recovered = (
            db.query(PayPalOrderModel)
            .filter(
                PayPalOrderModel.order_id == clean_order_id,
                (
                    (PayPalOrderModel.status == "CAPTURE_UNKNOWN")
                    | (
                        (PayPalOrderModel.status == "CAPTURING")
                        & (PayPalOrderModel.updated_at < stale_before)
                    )
                ),
            )
            .update(
                {PayPalOrderModel.status: "CAPTURING", PayPalOrderModel.updated_at: now},
                synchronize_session=False,
            )
        )
        db.commit()

        if recovered == 1:
            needs_reconcile = True
        else:
            db.expire_all()
            refreshed_txn = db.query(TransactionModel).filter(TransactionModel.paypal_order_id == clean_order_id).first()
            if refreshed_txn and refreshed_txn.status in ("COMPLETED", "PENDING"):
                return {
                    "message": "Order was already captured (idempotent result)",
                    "transaction": refreshed_txn.to_dict()
                }
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Order capture is already in progress. Please retry shortly."
            )

    def _set_order_status(new_status: str) -> None:
        db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == clean_order_id).update(
            {PayPalOrderModel.status: new_status, PayPalOrderModel.updated_at: datetime.utcnow()},
            synchronize_session=False,
        )
        db.commit()

    # 4. External PayPal reconciliation & capture (NO DB transaction held open)
    capture_data: Optional[Dict[str, Any]] = None
    try:
        if needs_reconcile:
            order_snapshot = await paypal_service.get_order(clean_order_id)
            if _order_has_settled_capture(order_snapshot):
                capture_data = order_snapshot
            elif order_snapshot.get("status") == "VOIDED":
                _set_order_status("FAILED")
                raise HTTPException(status_code=400, detail="PayPal order is voided and cannot be captured.")

        if capture_data is None:
            try:
                capture_data = await paypal_service.capture_order(clean_order_id, request_id=capture_request_id)
            except PayPalAPIError as api_exc:
                # Reconcile if PayPal indicates order was already captured remotely
                if api_exc.status_code == 422 and "ORDER_ALREADY_CAPTURED" in (api_exc.error_name or str(api_exc)):
                    capture_data = await paypal_service.get_order(clean_order_id)
                else:
                    raise
    except HTTPException:
        raise
    except PayPalAmbiguousError as exc:
        # Network timeout / 5xx / redirect -> mark CAPTURE_UNKNOWN (NEVER FAILED) and require reconcile before retry
        _set_order_status("CAPTURE_UNKNOWN")
        auth_service.record_audit(
            db=db,
            action="PAYPAL_CAPTURE_AMBIGUOUS",
            user_id=user.id,
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"orderId": clean_order_id, "reason": type(exc).__name__}
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="PayPal capture outcome is uncertain due to network timeout or upstream error. Retry safely to reconcile."
        )
    except PayPalAPIError as exc:
        _set_order_status("FAILED")
        auth_service.record_audit(
            db=db,
            action="PAYPAL_CAPTURE_FAILED",
            user_id=user.id,
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"orderId": clean_order_id, "error": exc.error_name or str(exc)}
        )
        raise HTTPException(status_code=400, detail="PayPal rejected the order capture request.")
    except Exception as exc:
        _set_order_status("CAPTURE_UNKNOWN")
        auth_service.record_audit(
            db=db,
            action="PAYPAL_CAPTURE_FAILED",
            user_id=user.id,
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"orderId": clean_order_id, "error": type(exc).__name__}
        )
        raise HTTPException(status_code=500, detail="Failed to capture PayPal order.")

    # 5. Parse response and validate authoritative PayPal status
    parsed = paypal_service.parse_capture_response(capture_data)
    api_status = parsed.get("status", "COMPLETED")
    if api_status not in ("COMPLETED", "PENDING"):
        _set_order_status("FAILED")
        raise HTTPException(
            status_code=400,
            detail=f"PayPal order was not approved or captured successfully. API Status: {api_status}"
        )

    # 6. Exact Decimal monetary computations (preserving $0.00 actual fees explicitly)
    amount_dec = parsed["amount"]
    if amount_dec <= Decimal("0"):
        amount_dec = to_decimal(order_rec.amount)
    curr = (parsed.get("currency") or order_rec.currency or "USD").upper()
    quant = Decimal("1") if curr in ZERO_DECIMAL_CURRENCIES else Decimal("0.01")

    is_inter = is_cross_border(parsed["country"])
    estimated_fee_dec = calculate_paypal_estimated_fee(amount_dec, curr, parsed["country"])

    actual_fee_dec = parsed.get("actual_fee")
    if actual_fee_dec is None:
        actual_fee_dec = estimated_fee_dec

    net_amount_dec = parsed.get("net_amount")
    if net_amount_dec is None:
        net_amount_dec = (amount_dec - actual_fee_dec).quantize(quant, rounding=ROUND_HALF_UP)

    # 7. Anomaly check using tenant historical baseline
    hist_rows = (
        db.query(TransactionModel.amount)
        .filter(TransactionModel.user_id == owner_user_id)
        .order_by(TransactionModel.created_at.desc())
        .limit(50)
        .all()
    )
    historical_amounts = [float(r[0]) for r in hist_rows if r[0] is not None]
    is_anomaly, risk_score, risk_level, anomaly_reason = anomaly_service.analyze_transaction(
        amount=float(amount_dec),
        is_international=is_inter,
        email=parsed["customer_email"],
        historical_amounts=historical_amounts,
    )

    # 8. Persist captured transaction and settle PayPalOrderModel atomically
    txn_id = f"TXN-{uuid.uuid4().hex[:8].upper()}"
    new_txn = TransactionModel(
        id=txn_id,
        user_id=owner_user_id,
        paypal_order_id=parsed.get("order_id") or clean_order_id,
        paypal_capture_id=parsed.get("capture_id"),
        customer_name=parsed["customer_name"],
        customer_email=parsed["customer_email"],
        amount=float(amount_dec),
        currency=curr,
        status=api_status,
        date=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        estimated_fee=float(estimated_fee_dec),
        actual_fee=float(actual_fee_dec),
        net_amount=float(net_amount_dec),
        payment_method=parsed["payment_method"],
        country=parsed["country"],
        risk_score=risk_score,
        risk_level=risk_level,
        is_anomaly=is_anomaly,
        anomaly_reason=anomaly_reason,
        data_source="sandbox",
        raw_paypal_payload=json.dumps(capture_data)
    )

    try:
        db.add(new_txn)
        db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == clean_order_id).update(
            {PayPalOrderModel.status: api_status, PayPalOrderModel.updated_at: datetime.utcnow()},
            synchronize_session=False,
        )
        db.commit()
        db.refresh(new_txn)
    except IntegrityError:
        db.rollback()
        existing_after_race = db.query(TransactionModel).filter(TransactionModel.paypal_order_id == clean_order_id).first()
        if existing_after_race:
            return {
                "message": "Order was already captured (idempotent result)",
                "transaction": existing_after_race.to_dict()
            }
        raise HTTPException(status_code=500, detail="Failed to persist captured transaction.")

    auth_service.record_audit(
        db=db,
        action="PAYPAL_ORDER_CAPTURED",
        user_id=user.id,
        ip_address=ip,
        user_agent=ua,
        status="SUCCESS",
        details={
            "txnId": txn_id,
            "orderId": clean_order_id,
            "amount": str(amount_dec),
            "currency": curr,
            "fee": str(actual_fee_dec),
            "netAmount": str(net_amount_dec),
        }
    )

    return {
        "success": True,
        "transaction": new_txn.to_dict(),
        "raw": capture_data
    }


@router.post("/webhooks")
async def handle_paypal_webhook(
    request: Request,
    paypal_transmission_id: Optional[str] = Header(None, alias="paypal-transmission-id"),
    paypal_transmission_time: Optional[str] = Header(None, alias="paypal-transmission-time"),
    paypal_transmission_sig: Optional[str] = Header(None, alias="paypal-transmission-sig"),
    paypal_cert_url: Optional[str] = Header(None, alias="paypal-cert-url"),
    paypal_auth_algo: Optional[str] = Header(None, alias="paypal-auth-algo"),
    db: Session = Depends(get_db)
):
    """
    Receives and processes PayPal Sandbox Webhooks with mandatory PAYPAL_WEBHOOK_ID,
    mandatory signature headers, strict HTTPS PayPal cert URL validation, and atomic idempotency.
    """
    ip, ua = get_client_meta(request)

    # 1. Fail closed if PAYPAL_WEBHOOK_ID is unconfigured or placeholder
    if not is_webhook_id_configured():
        auth_service.record_audit(
            db=db,
            action="WEBHOOK_CONFIG_MISSING",
            ip_address=ip,
            user_agent=ua,
            status="BLOCKED",
            details={"reason": "PAYPAL_WEBHOOK_ID not configured"}
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PayPal webhook verification is not configured."
        )

    # 2. Require all 5 PayPal cryptographic transmission headers unconditionally
    hdr_id = paypal_transmission_id.strip() if isinstance(paypal_transmission_id, str) else ""
    hdr_time = paypal_transmission_time.strip() if isinstance(paypal_transmission_time, str) else ""
    hdr_sig = paypal_transmission_sig.strip() if isinstance(paypal_transmission_sig, str) else ""
    hdr_cert = paypal_cert_url.strip() if isinstance(paypal_cert_url, str) else ""
    hdr_algo = paypal_auth_algo.strip() if isinstance(paypal_auth_algo, str) else ""

    if not all([hdr_id, hdr_time, hdr_sig, hdr_cert, hdr_algo]):
        auth_service.record_audit(
            db=db,
            action="WEBHOOK_HEADERS_MISSING",
            ip_address=ip,
            user_agent=ua,
            status="BLOCKED",
            details={"reason": "Missing required PayPal webhook transmission headers"}
        )
        raise HTTPException(status_code=403, detail="Missing required PayPal webhook signature headers.")

    body_bytes = await request.body()
    try:
        event = json.loads(body_bytes.decode("utf-8"))
        if not isinstance(event, dict):
            raise ValueError("Webhook body must be a JSON object.")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON webhook payload.")

    event_id = str(event.get("id") or "").strip() or hdr_id
    if not event_id:
        raise HTTPException(status_code=400, detail="Missing PayPal webhook event identifier.")

    event_type = str(event.get("event_type") or "UNKNOWN")
    resource = event.get("resource") if isinstance(event.get("resource"), dict) else {}

    # 3. Verify signature with PayPal before checking/mutating business state
    is_valid = await paypal_service.verify_webhook_signature(
        transmission_id=hdr_id,
        transmission_time=hdr_time,
        cert_url=hdr_cert,
        auth_algo=hdr_algo,
        transmission_sig=hdr_sig,
        webhook_event=event,
    )
    if not is_valid:
        auth_service.record_audit(
            db=db,
            action="WEBHOOK_SIGNATURE_INVALID",
            ip_address=ip,
            user_agent=ua,
            status="BLOCKED",
            details={"eventId": event_id, "eventType": event_type}
        )
        raise HTTPException(status_code=403, detail="Webhook signature verification failed.")

    # 4. Idempotency check & atomic event recording
    existing_event = db.query(WebhookEventModel).filter(WebhookEventModel.id == event_id).first()
    if existing_event:
        return {
            "status": "ALREADY_PROCESSED",
            "message": f"Webhook event {event_id} was already executed idempotently.",
            "event_type": event_type
        }

    recorded_event = WebhookEventModel(
        id=event_id,
        event_type=event_type,
        resource_id=resource.get("id"),
        status="PROCESSED",
        payload_snippet=json.dumps(event)[:250]
    )
    db.add(recorded_event)

    if event_type == "PAYMENT.CAPTURE.COMPLETED":
        order_id = ((resource.get("supplementary_data") or {}).get("related_ids") or {}).get("order_id")
        capture_id = resource.get("id")
        order_rec = db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == order_id).first() if order_id else None
        if order_id:
            txn = db.query(TransactionModel).filter(TransactionModel.paypal_order_id == order_id).first()
            should_advance_order = True
            if txn:
                # Guard against out-of-order COMPLETED delivery overwriting terminal/refund/dispute states
                if txn.status in ("REFUNDED", "REFUNDING", "REFUND_UNKNOWN", "DISPUTED"):
                    should_advance_order = False
                else:
                    txn.status = "COMPLETED"
                    if capture_id:
                        txn.paypal_capture_id = capture_id
                    breakdown = resource.get("seller_receivable_breakdown") or {}
                    fee_raw = (breakdown.get("paypal_fee") or {}).get("value")
                    net_raw = (breakdown.get("net_amount") or {}).get("value")
                    if fee_raw is not None:
                        txn.actual_fee = float(to_decimal(fee_raw))
                    if net_raw is not None:
                        txn.net_amount = float(to_decimal(net_raw))
                    txn.updated_at = datetime.utcnow()
            elif order_rec is not None:
                amount_obj = resource.get("amount") or {}
                amt_dec = to_decimal(amount_obj.get("value", order_rec.amount))
                curr_code = (amount_obj.get("currency_code") or order_rec.currency or "USD").upper()
                breakdown = resource.get("seller_receivable_breakdown") or {}
                fee_raw = (breakdown.get("paypal_fee") or {}).get("value")
                net_raw = (breakdown.get("net_amount") or {}).get("value")
                est_dec = calculate_paypal_estimated_fee(amt_dec, curr_code, "United States")
                act_dec = to_decimal(fee_raw) if fee_raw is not None else est_dec
                net_dec = to_decimal(net_raw) if net_raw is not None else (amt_dec - act_dec)
                db.add(
                    TransactionModel(
                        id=f"TXN-{uuid.uuid4().hex[:8].upper()}",
                        user_id=order_rec.user_id,
                        paypal_order_id=order_id,
                        paypal_capture_id=capture_id,
                        customer_name="PayPal Sandbox Buyer",
                        customer_email="buyer@sandbox.paypal.com",
                        amount=float(amt_dec),
                        currency=curr_code,
                        status="COMPLETED",
                        date=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
                        estimated_fee=float(est_dec),
                        actual_fee=float(act_dec),
                        net_amount=float(net_dec),
                        payment_method="PayPal Wallet",
                        country="United States",
                        data_source="sandbox",
                        raw_paypal_payload=json.dumps(event),
                    )
                )
            if should_advance_order:
                db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == order_id).update(
                    {PayPalOrderModel.status: "COMPLETED", PayPalOrderModel.updated_at: datetime.utcnow()},
                    synchronize_session=False,
                )

    elif event_type in ("PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED"):
        new_status = "REFUNDED" if "REFUNDED" in event_type else "DENIED"
        capture_id = ((resource.get("supplementary_data") or {}).get("related_ids") or {}).get("capture_id")
        if not capture_id and "REFUNDED" in event_type:
            for link in resource.get("links") or []:
                if isinstance(link, dict) and link.get("rel") == "up":
                    href = str(link.get("href") or "")
                    if "/captures/" in href:
                        capture_id = href.rstrip("/").split("/captures/")[-1].split("?")[0]
                        break
        capture_id = capture_id or resource.get("id")
        if capture_id:
            txn = db.query(TransactionModel).filter(TransactionModel.paypal_capture_id == capture_id).first()
            if txn:
                txn.status = new_status
                txn.net_amount = 0.0
                txn.updated_at = datetime.utcnow()
                if txn.paypal_order_id:
                    db.query(PayPalOrderModel).filter(PayPalOrderModel.order_id == txn.paypal_order_id).update(
                        {PayPalOrderModel.status: new_status, PayPalOrderModel.updated_at: datetime.utcnow()},
                        synchronize_session=False,
                    )

    elif event_type == "CUSTOMER.DISPUTE.CREATED":
        disputed_txns = resource.get("disputed_transactions") or []
        for d_item in disputed_txns:
            cap_id = d_item.get("seller_transaction_id")
            if cap_id:
                txn = db.query(TransactionModel).filter(TransactionModel.paypal_capture_id == cap_id).first()
                if txn:
                    txn.status = "DISPUTED"
                    txn.is_anomaly = True
                    txn.risk_score = max(85, int(txn.risk_score or 0))
                    txn.risk_level = "CRITICAL"
                    txn.anomaly_reason = "PayPal buyer dispute opened via webhook notification"
                    txn.updated_at = datetime.utcnow()

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {
            "status": "ALREADY_PROCESSED",
            "message": f"Webhook event {event_id} was already executed idempotently.",
            "event_type": event_type
        }

    auth_service.record_audit(
        db=db,
        action="PAYPAL_WEBHOOK_PROCESSED",
        ip_address=ip,
        user_agent=ua,
        status="SUCCESS",
        details={"eventId": event_id, "eventType": event_type}
    )

    return {"status": "SUCCESS", "event_type": event_type, "eventId": event_id}
