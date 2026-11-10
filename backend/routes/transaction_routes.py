from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

from database import get_db
from config import settings
from models.transaction import TransactionModel
from models.user import UserModel
from services.auth_service import (
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

router = APIRouter(prefix="/api/v1", tags=["Finova Intelligence Core"])

# Request / Response Schemas
class SimulateTransactionRequest(BaseModel):
    customerName: str
    customerEmail: str
    amount: float = Field(..., gt=0)
    currency: str = "USD"
    paymentMethod: str = "PayPal Wallet"
    country: str = "United States"

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
    additionalDisputes: int = 0
    additionalRefunds: int = 0
    additionalFailures: int = 0
    volumeSpikeMultiplier: float = 1.0

class ChatMessageHistoryItem(BaseModel):
    id: Optional[str] = None
    sender: str
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: Optional[List[ChatMessageHistoryItem]] = None

class DecisionScenarioRequest(BaseModel):
    volumeGrowthPct: float = 0.0
    targetAverageTicket: Optional[float] = None
    crossBorderPct: Optional[float] = None
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

@router.get("/transactions")
def get_transactions(
    status: Optional[str] = None,
    risk: Optional[str] = None,
    source: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns ledger transactions with filtering, data source tagging, and strict tenant isolation.
    Non-admin merchants cannot query another user's ID (403); admins may inspect all or filter by user_id.
    """
    def clean_param(p):
        return p.strip() if isinstance(p, str) and p.strip() else None

    clean_status = clean_param(status)
    clean_risk = clean_param(risk)
    clean_source = clean_param(source)
    clean_user_id = clean_param(user_id)

    scoped_user_id = resolve_scoped_user_id(current_user, clean_user_id)
    query = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id)

    if clean_status and clean_status != "ALL":
        query = query.filter(TransactionModel.status == clean_status)
    if clean_risk and clean_risk != "ALL":
        query = query.filter(TransactionModel.risk_level == clean_risk)
    if clean_source and clean_source != "ALL":
        query = query.filter(TransactionModel.data_source == clean_source)

    records = query.order_by(TransactionModel.created_at.desc()).all()
    return [r.to_dict() for r in records]

# --- TRANSACTION INTELLIGENCE & REVENUE ANALYTICS ENDPOINTS ---

@router.get("/analytics/summary")
def get_analytics_summary(
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Computes overall financial metrics, volume totals, actual vs estimated fees,
    net balance, and status/source breakdowns scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    return analytics_service.get_summary(db, scoped_user_id=scoped_user_id)

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
    is_inter = req.country != "United States"
    fee_pct = 0.0349 + (0.015 if is_inter else 0.0)
    estimated_fee = round((req.amount * fee_pct) + 0.49, 2)
    net_amount = round(req.amount - estimated_fee, 2)

    is_anomaly, risk_score, risk_level, anomaly_reason = anomaly_service.analyze_transaction(
        amount=req.amount,
        is_international=is_inter,
        email=req.customerEmail
    )

    txn_id = f"TXN-{uuid.uuid4().hex[:6].upper()}"
    new_txn = TransactionModel(
        id=txn_id,
        user_id=user.id,
        paypal_order_id=f"7W{uuid.uuid4().hex[:8].upper()}M",
        paypal_capture_id=f"CAP-{uuid.uuid4().hex[:8].upper()}",
        customer_name=req.customerName,
        customer_email=req.customerEmail,
        amount=req.amount,
        currency=req.currency,
        status="COMPLETED",
        date=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        estimated_fee=estimated_fee,
        actual_fee=estimated_fee,
        net_amount=net_amount,
        payment_method=req.paymentMethod,
        country=req.country,
        risk_score=risk_score,
        risk_level=risk_level,
        is_anomaly=is_anomaly,
        anomaly_reason=anomaly_reason,
        data_source="sandbox"
    )

    db.add(new_txn)
    db.commit()
    db.refresh(new_txn)
    return new_txn.to_dict()

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
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves recent threat scans from the audit ledger scoped to the authenticated tenant.
    """
    scoped_user_id = resolve_scoped_user_id(current_user, user_id)
    clamped_limit = max(1, min(100, int(limit))) if isinstance(limit, int) else 15
    return scam_shield_service.get_audit_history(db, limit=clamped_limit, scoped_user_id=scoped_user_id)

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
