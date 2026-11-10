from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, Numeric
from datetime import datetime
import json
from database import Base


class PayPalOrderModel(Base):
    __tablename__ = "paypal_orders"

    order_id = Column(String(128), primary_key=True, index=True)
    user_id = Column(String(64), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(8), nullable=False)
    status = Column(String(32), default="CREATED", index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

class TransactionModel(Base):
    __tablename__ = "transactions"

    id = Column(String(64), primary_key=True, index=True)
    paypal_order_id = Column(String(128), unique=True, index=True, nullable=True)
    paypal_capture_id = Column(String(128), unique=True, index=True, nullable=True)
    user_id = Column(String(64), index=True, nullable=True)
    
    customer_name = Column(String(128), nullable=False)
    customer_email = Column(String(128), index=True, nullable=False)
    
    amount = Column(Float, nullable=False)
    currency = Column(String(8), default="USD", nullable=False)
    status = Column(String(32), default="COMPLETED", index=True, nullable=False)
    date = Column(String(32), nullable=False)
    
    # Financial breakdown
    estimated_fee = Column(Float, nullable=False)
    actual_fee = Column(Float, nullable=True)  # Captured directly from PayPal seller_receivable_breakdown
    net_amount = Column(Float, nullable=False)
    
    payment_method = Column(String(64), default="PayPal Wallet")
    country = Column(String(64), default="United States")
    
    # Finova AI intelligence layer
    risk_score = Column(Integer, default=10)
    risk_level = Column(String(16), default="LOW")
    is_anomaly = Column(Boolean, default=False)
    anomaly_reason = Column(Text, nullable=True)
    
    data_source = Column(String(16), default="sandbox")  # 'sandbox' or 'synthetic'
    raw_paypal_payload = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "paypalOrderId": self.paypal_order_id,
            "paypalCaptureId": self.paypal_capture_id,
            "customerName": self.customer_name,
            "customerEmail": self.customer_email,
            "amount": self.amount,
            "currency": self.currency,
            "status": self.status,
            "date": self.date,
            "estimatedFee": self.estimated_fee,
            "actualFee": self.actual_fee,
            "netAmount": self.net_amount,
            "paymentMethod": self.payment_method,
            "country": self.country,
            "riskScore": self.risk_score,
            "riskLevel": self.risk_level,
            "isAnomaly": self.is_anomaly,
            "anomalyReason": self.anomaly_reason,
            "dataSource": self.data_source,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }

class ScamAuditModel(Base):
    __tablename__ = "scam_audit_logs"

    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), index=True, nullable=True)
    target_type = Column(String(16), nullable=False)
    input_snippet = Column(Text, nullable=False)
    risk_score = Column(Integer, nullable=False)
    risk_level = Column(String(16), nullable=False)
    confidence = Column(Integer, default=95)
    indicators_json = Column(Text, nullable=False)
    safe_actions_json = Column(Text, nullable=False)
    safe_inspection_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "targetType": self.target_type,
            "inputSnippet": self.input_snippet,
            "riskScore": self.risk_score,
            "riskLevel": self.risk_level,
            "confidence": self.confidence,
            "indicators": json.loads(self.indicators_json) if self.indicators_json else [],
            "safeActions": json.loads(self.safe_actions_json) if self.safe_actions_json else [],
            "safeInspectionDetails": json.loads(self.safe_inspection_json) if self.safe_inspection_json else None,
            "timestamp": self.created_at.strftime("%I:%M %p"),
            "dataSource": "synthetic"
        }
