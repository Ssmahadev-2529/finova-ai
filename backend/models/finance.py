"""
Finova AI — Financial Management & AI Telemetry Database Models
Additive tables for user categories, spending/operating budgets, and AI RAG usage tracking.
"""

from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Numeric, String, Boolean, UniqueConstraint
from database import Base


class CategoryModel(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
        Index("idx_categories_user_name", "user_id", "name"),
    )

    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(64), nullable=False)
    kind = Column(String(16), nullable=False, default="expense")  # income | expense | both
    color = Column(String(16), nullable=False, default="#0070BA")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "name": self.name,
            "kind": self.kind,
            "color": self.color,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class BudgetModel(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "category", name="uq_budgets_user_category"),
        Index("idx_budgets_user_category", "user_id", "category"),
    )

    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(64), nullable=False)
    limit_amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(8), nullable=False, default="USD")
    period = Column(String(16), nullable=False, default="monthly")  # weekly | monthly | quarterly
    alert_threshold_pct = Column(Integer, nullable=False, default=80)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "category": self.category,
            "limitAmount": float(self.limit_amount or 0),
            "currency": self.currency,
            "period": self.period,
            "alertThresholdPct": self.alert_threshold_pct,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class AIUsageLogModel(Base):
    __tablename__ = "ai_usage_logs"
    __table_args__ = (
        Index("idx_ai_usage_user_created", "user_id", "created_at"),
    )

    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    intent = Column(String(64), nullable=False, default="GENERAL")
    provider = Column(String(32), nullable=False, default="deterministic")
    model_name = Column(String(64), nullable=False, default="ground-truth-rag")
    latency_ms = Column(Integer, nullable=False, default=0)
    prompt_chars = Column(Integer, nullable=False, default=0)
    response_chars = Column(Integer, nullable=False, default=0)
    context_chunks = Column(Integer, nullable=False, default=0)
    used_fallback = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "intent": self.intent,
            "provider": self.provider,
            "modelName": self.model_name,
            "latencyMs": self.latency_ms,
            "promptChars": self.prompt_chars,
            "responseChars": self.response_chars,
            "contextChunks": self.context_chunks,
            "usedFallback": self.used_fallback,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

