from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, ForeignKey
from datetime import datetime
import json
import uuid
from database import Base

class UserModel(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, index=True, default=lambda: f"USR-{uuid.uuid4().hex[:8].upper()}")
    email = Column(String(128), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    full_name = Column(String(128), nullable=False)
    business_name = Column(String(128), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    role = Column(String(32), default="merchant", nullable=False)
    token_version = Column(Integer, default=0, nullable=False)

    # Password Reset flow
    reset_token = Column(String(128), nullable=True, index=True)
    reset_token_expires_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self, include_sensitive: bool = False):
        data = {
            "id": self.id,
            "email": self.email,
            "fullName": self.full_name,
            "businessName": self.business_name,
            "isActive": self.is_active,
            "role": self.role,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }
        if include_sensitive:
            data["resetToken"] = self.reset_token
            data["resetTokenExpiresAt"] = self.reset_token_expires_at.isoformat() if self.reset_token_expires_at else None
        return data

class AuditLogModel(Base):
    __tablename__ = "security_audit_logs"

    id = Column(String(64), primary_key=True, index=True, default=lambda: f"AUD-{uuid.uuid4().hex[:8].upper()}")
    user_id = Column(String(64), nullable=True, index=True)
    action = Column(String(64), nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(256), nullable=True)
    status = Column(String(32), default="SUCCESS", nullable=False)
    details_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "action": self.action,
            "ipAddress": self.ip_address,
            "userAgent": self.user_agent,
            "status": self.status,
            "details": json.loads(self.details_json) if self.details_json else {},
            "timestamp": self.created_at.isoformat() if self.created_at else None
        }

class WebhookEventModel(Base):
    __tablename__ = "webhook_events"

    id = Column(String(128), primary_key=True, index=True)  # Transmission ID or PayPal event ID
    event_type = Column(String(64), nullable=False, index=True)
    resource_id = Column(String(128), nullable=True, index=True)
    status = Column(String(32), default="PROCESSED", nullable=False)
    payload_snippet = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "eventType": self.event_type,
            "resourceId": self.resource_id,
            "status": self.status,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }


class RevokedTokenModel(Base):
    __tablename__ = "revoked_tokens"

    jti = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), nullable=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
