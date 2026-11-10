"""
Finova AI - Enterprise Security & Authentication Service
Implements:
1. Password hashing with Bcrypt (cost factor 12) with constant-time verification.
2. Cryptographically signed JWT session tokens (HMAC-SHA256) with expiration & jti invalidation.
3. Secure Password Reset with cryptographically random tokens and expiration windows.
4. Token revocation / blacklist on user logout.
5. Tamper-evident Security Audit Logging with automated sensitive data redaction.
6. User-level data isolation and role-based permissions.
"""

from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
import hashlib
import ipaddress
import re
import secrets
import uuid
import json
import logging
import bcrypt
from jose import jwt, JWTError
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from config import settings
from database import get_db, SessionLocal
from models.user import UserModel, AuditLogModel, RevokedTokenModel

logger = logging.getLogger("finova.security")

JWT_ISSUER = "finova-auth-service"

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=False
)

class AuthService:
    def __init__(self):
        self.secret_key = settings.JWT_SECRET_KEY
        self.algorithm = settings.JWT_ALGORITHM
        self.access_token_expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
        self.reset_token_expire_minutes = settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES

    # --- PASSWORD MANAGEMENT (BCRYPT) ---

    def hash_password(self, password: str) -> str:
        """Hashes password using bcrypt with random salt."""
        if not password or len(password) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        pw_bytes = password.encode("utf-8")
        salt = bcrypt.gensalt(rounds=12)
        hashed = bcrypt.hashpw(pw_bytes, salt)
        return hashed.decode("utf-8")

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verifies password against bcrypt hash in constant time."""
        try:
            return bcrypt.checkpw(
                plain_password.encode("utf-8"),
                hashed_password.encode("utf-8")
            )
        except Exception:
            return False

    def validate_password_strength(self, password: str) -> Tuple[bool, str]:
        """Enforces robust merchant credential standards."""
        if len(password) < 8:
            return False, "Password must contain at least 8 characters."
        if not re.search(r"[A-Z]", password):
            return False, "Password must contain at least one uppercase letter."
        if not re.search(r"[a-z]", password):
            return False, "Password must contain at least one lowercase letter."
        if not re.search(r"[0-9]", password):
            return False, "Password must contain at least one digit."
        return True, "Password meets security standards."

    # --- JWT TOKEN MANAGEMENT ---

    def create_access_token(self, data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Generates a cryptographically signed JWT with unique jti, issuer, and token version."""
        to_encode = data.copy()
        now = datetime.utcnow()
        expire = now + (expires_delta or timedelta(minutes=self.access_token_expire_minutes))

        jti = str(uuid.uuid4())
        to_encode.setdefault("tv", 0)
        to_encode.update({
            "exp": expire,
            "iat": now,
            "jti": jti,
            "iss": JWT_ISSUER,
        })

        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)

    def decode_access_token(self, token: str, db: Optional[Session] = None) -> Dict[str, Any]:
        """Decodes, verifies signature, issuer, and persistent revocation status of a JWT."""
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                issuer=JWT_ISSUER,
                options={
                    "verify_exp": True,
                    "require_exp": True,
                    "require_iss": True,
                    "require_sub": True,
                },
            )
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication credentials.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        jti = payload.get("jti")
        if jti and self.is_token_revoked(jti, db=db):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked upon logout.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload

    def is_token_revoked(self, jti: str, db: Optional[Session] = None) -> bool:
        """Checks whether a JWT JTI has been persistently revoked in the database."""
        own_session = db is None
        session = SessionLocal() if own_session else db
        try:
            now = datetime.utcnow()
            revoked = (
                session.query(RevokedTokenModel)
                .filter(
                    RevokedTokenModel.jti == jti,
                    RevokedTokenModel.expires_at >= now,
                )
                .first()
            )
            return revoked is not None
        finally:
            if own_session:
                session.close()

    def revoke_token(self, token: str, db: Optional[Session] = None) -> bool:
        """Persists token JTI revocation in the database for server-side logout across workers/restarts."""
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                issuer=JWT_ISSUER,
                options={"verify_exp": False, "require_iss": True},
            )
        except JWTError:
            return False

        jti = payload.get("jti")
        if not jti:
            return False

        exp = payload.get("exp")
        expires_at = (
            datetime.utcfromtimestamp(float(exp))
            if exp is not None
            else (datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes))
        )
        user_id = payload.get("sub")

        own_session = db is None
        session = SessionLocal() if own_session else db
        try:
            self.cleanup_expired_revoked_tokens(session, commit=False)
            existing = session.query(RevokedTokenModel).filter(RevokedTokenModel.jti == jti).first()
            if not existing:
                session.add(
                    RevokedTokenModel(
                        jti=jti,
                        user_id=user_id,
                        expires_at=expires_at,
                    )
                )
            session.commit()
            return True
        except Exception as exc:
            session.rollback()
            logger.error("Failed to persist token revocation: %s", type(exc).__name__)
            return False
        finally:
            if own_session:
                session.close()

    def cleanup_expired_revoked_tokens(self, db: Session, commit: bool = True) -> int:
        """Safely removes expired revocation records from revoked_tokens."""
        now = datetime.utcnow()
        deleted = (
            db.query(RevokedTokenModel)
            .filter(RevokedTokenModel.expires_at < now)
            .delete(synchronize_session=False)
        )
        if commit:
            db.commit()
        return int(deleted or 0)

    # --- USER AUTHENTICATION & REGISTRATION ---

    def register_user(
        self,
        db: Session,
        email: str,
        password: str,
        full_name: str,
        business_name: str
    ) -> UserModel:
        """Registers a new merchant with hashed password."""
        email_clean = email.strip().lower()
        
        # Email format validation
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_clean):
            raise HTTPException(status_code=400, detail="Invalid email address format.")

        # Password strength validation
        valid, msg = self.validate_password_strength(password)
        if not valid:
            raise HTTPException(status_code=400, detail=msg)

        # Uniqueness check
        existing = db.query(UserModel).filter(UserModel.email == email_clean).first()
        if existing:
            raise HTTPException(status_code=409, detail="A user with this email address already exists.")

        hashed_pw = self.hash_password(password)
        user = UserModel(
            id=f"USR-{uuid.uuid4().hex[:8].upper()}",
            email=email_clean,
            hashed_password=hashed_pw,
            full_name=full_name.strip(),
            business_name=business_name.strip(),
            is_active=True,
            role="merchant"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def authenticate_user(
        self,
        db: Session,
        email: str,
        password: str
    ) -> Optional[UserModel]:
        """Authenticates merchant by email and password."""
        email_clean = email.strip().lower()
        user = db.query(UserModel).filter(UserModel.email == email_clean).first()
        if not user or not user.is_active:
            return None
        if not self.verify_password(password, user.hashed_password):
            return None
        return user

    # --- SECURE PASSWORD RESET ---

    @staticmethod
    def hash_reset_token(raw_token: str) -> str:
        """Hashes a raw password-reset token with SHA-256 prior to database storage or lookup."""
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    def create_password_reset_token(self, db: Session, email: str) -> Optional[str]:
        """Generates a single-use password-reset token and stores only its SHA-256 hash."""
        email_clean = email.strip().lower()
        user = db.query(UserModel).filter(UserModel.email == email_clean).first()
        if not user or not user.is_active:
            # Silent return to avoid account enumeration
            return None

        raw_token = secrets.token_urlsafe(32)
        user.reset_token = self.hash_reset_token(raw_token)
        user.reset_token_expires_at = datetime.utcnow() + timedelta(minutes=self.reset_token_expire_minutes)
        db.commit()
        return raw_token

    def clear_password_reset_token(self, db: Session, email: str) -> None:
        """Clears an un-delivered reset token so failed email sends leave no stale tokens."""
        email_clean = email.strip().lower()
        user = db.query(UserModel).filter(UserModel.email == email_clean).first()
        if user:
            user.reset_token = None
            user.reset_token_expires_at = None
            db.commit()

    def reset_password(self, db: Session, reset_token: str, new_password: str) -> bool:
        """Validates hashed reset token, updates password, consumes token, and invalidates active sessions."""
        if not reset_token or not new_password:
            raise HTTPException(status_code=400, detail="Reset token and new password are required.")

        valid, msg = self.validate_password_strength(new_password)
        if not valid:
            raise HTTPException(status_code=400, detail=msg)

        token_hash = self.hash_reset_token(reset_token)
        user = db.query(UserModel).filter(UserModel.reset_token == token_hash).first()
        if not user or not user.reset_token or not secrets.compare_digest(user.reset_token, token_hash):
            raise HTTPException(status_code=400, detail="Invalid or expired password reset token.")

        if not user.is_active:
            raise HTTPException(status_code=400, detail="Account is inactive.")

        if not user.reset_token_expires_at or user.reset_token_expires_at < datetime.utcnow():
            user.reset_token = None
            user.reset_token_expires_at = None
            db.commit()
            raise HTTPException(status_code=400, detail="Password reset token has expired.")

        # Atomically update password, consume reset token, and increment token_version to revoke all prior JWTs
        new_hash = self.hash_password(new_password)
        updated_rows = (
            db.query(UserModel)
            .filter(
                UserModel.id == user.id,
                UserModel.reset_token == token_hash,
            )
            .update(
                {
                    UserModel.hashed_password: new_hash,
                    UserModel.reset_token: None,
                    UserModel.reset_token_expires_at: None,
                    UserModel.token_version: UserModel.token_version + 1,
                    UserModel.updated_at: datetime.utcnow(),
                },
                synchronize_session=False,
            )
        )
        if updated_rows != 1:
            db.rollback()
            raise HTTPException(status_code=400, detail="Invalid or expired password reset token.")

        db.commit()
        db.expire(user)
        return True

    # --- AUDIT LOGGING & SENSITIVE DATA REDACTION ---

    def sanitize_log_data(self, data: Any) -> Any:
        """Deep-redacts sensitive keywords from log dictionary."""
        if isinstance(data, dict):
            sanitized = {}
            for k, v in data.items():
                lower_k = str(k).lower()
                if any(sec in lower_k for sec in ("pass", "secret", "token", "auth", "cvv", "card", "key")):
                    sanitized[k] = "[REDACTED]"
                else:
                    sanitized[k] = self.sanitize_log_data(v)
            return sanitized
        elif isinstance(data, list):
            return [self.sanitize_log_data(item) for item in data]
        elif isinstance(data, str):
            # Redact full 16-digit credit card patterns
            redacted_str = re.sub(r"\b(?:\d{4}[ -]?){3}\d{4}\b", "[CARD_REDACTED]", data)
            return redacted_str
        return data

    def record_audit(
        self,
        db: Session,
        action: str,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        status: str = "SUCCESS",
        details: Optional[Dict[str, Any]] = None
    ) -> AuditLogModel:
        """Records security event to audit ledger."""
        sanitized_details = self.sanitize_log_data(details or {})
        audit = AuditLogModel(
            id=f"AUD-{uuid.uuid4().hex[:8].upper()}",
            user_id=user_id,
            action=action,
            ip_address=ip_address,
            user_agent=user_agent[:250] if user_agent else None,
            status=status,
            details_json=json.dumps(sanitized_details)
        )
        try:
            db.add(audit)
            db.commit()
            db.refresh(audit)
            return audit
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to record audit log: {e}")
            return audit

auth_service = AuthService()

# --- FASTAPI DEPENDENCIES ---

def _resolve_authenticated_user(token: str, db: Session) -> UserModel:
    """Validates JWT signature, issuer, revocation status, active user state, and token version."""
    payload = auth_service.decode_access_token(token, db=db)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload: missing subject identifier.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user account is inactive or not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_version = payload.get("tv")
    if (
        token_version is None
        or isinstance(token_version, bool)
        or not isinstance(token_version, int)
        or token_version != user.token_version
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been invalidated. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> UserModel:
    """Enforces JWT authentication on protected routes."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _resolve_authenticated_user(token, db)


def get_optional_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[UserModel]:
    """Returns active, non-revoked UserModel if a valid JWT is present; otherwise None."""
    if not token:
        return None
    try:
        return _resolve_authenticated_user(token, db)
    except HTTPException:
        return None


def require_authenticated_user(current_user: Any) -> UserModel:
    """Fails closed unless an active authenticated UserModel was resolved."""
    if not isinstance(current_user, UserModel) or not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to access this resource.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


def require_admin_user(current_user: Any) -> UserModel:
    """Enforces administrator role on privileged operations."""
    user = require_authenticated_user(current_user)
    if (user.role or "").lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: administrator privileges required.",
        )
    return user


def resolve_scoped_user_id(
    current_user: Any,
    requested_user_id: Optional[str] = None,
) -> Optional[str]:
    """
    Resolves tenant isolation scope strictly from authenticated identity.
    Non-admin merchants receive 403 if requesting another user's ID; admins may view all (None) or filter by user_id.
    """
    user = require_authenticated_user(current_user)
    clean_requested = requested_user_id.strip() if isinstance(requested_user_id, str) and requested_user_id.strip() else None

    if (user.role or "").lower() == "admin":
        return clean_requested

    if clean_requested and clean_requested != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: merchants cannot access another merchant's resources.",
        )
    return user.id


SEED_DEMO_TRANSACTION_IDS = (
    "TXN-984210",
    "TXN-984209",
    "TXN-984208",
    "TXN-984207",
    "TXN-984206",
    "TXN-984205",
    "TXN-984204",
    "TXN-984203",
    "TXN-984200",
    "TXN-984199",
)


def scope_transaction_query(query, txn_model, scoped_user_id: Optional[str]):
    """
    Applies tenant isolation to TransactionModel queries.
    In production, strictly isolates to owned rows only.
    In non-production dev/test, preserves access to the explicit seeded demo ID allowlist.
    """
    if scoped_user_id is None:
        return query
    if settings.is_production:
        return query.filter(txn_model.user_id == scoped_user_id)
    return query.filter(
        (txn_model.user_id == scoped_user_id)
        | (txn_model.user_id.is_(None) & txn_model.id.in_(SEED_DEMO_TRANSACTION_IDS))
    )


def scope_scam_audit_query(query, scam_model, scoped_user_id: Optional[str]):
    """Applies strict per-tenant isolation to ScamAuditModel queries (no shared unowned scans)."""
    if scoped_user_id is None:
        return query
    return query.filter(scam_model.user_id == scoped_user_id)


def _parse_trusted_proxy_networks(raw_proxies: Optional[str]) -> list:
    """Parses comma-separated trusted proxy IP addresses or CIDRs cleanly."""
    if not raw_proxies or not isinstance(raw_proxies, str):
        return []
    networks = []
    for entry in raw_proxies.split(","):
        cleaned = entry.strip()
        if not cleaned or cleaned == "*":
            continue
        try:
            networks.append(ipaddress.ip_network(cleaned, strict=False))
        except ValueError:
            logger.warning("Ignoring invalid trusted proxy network entry.")
    return networks


def _is_ip_in_networks(ip_obj: Any, networks: list) -> bool:
    return any(ip_obj in net for net in networks)


def extract_client_ip(
    request: Any,
    trust_proxy: Optional[bool] = None,
    trusted_proxies: Optional[str] = None,
) -> str:
    """
    Extracts client IP safely.
    - Honors X-Forwarded-For ONLY when TRUST_PROXY_HEADERS is enabled AND the immediate socket peer
      belongs to an explicitly configured TRUSTED_PROXY_IPS CIDR/address.
    - Scans X-Forwarded-For from right to left across trusted proxy hops and returns the first
      valid non-proxy client IP, ignoring empty, malformed, or attacker-prepended entries.
    """
    has_real_peer = bool(hasattr(request, "client") and request.client and getattr(request.client, "host", None))
    raw_peer = str(request.client.host).strip() if has_real_peer else "127.0.0.1"
    safe_peer = raw_peer[:45] if raw_peer else "127.0.0.1"

    use_proxy = settings.TRUST_PROXY_HEADERS if trust_proxy is None else bool(trust_proxy)
    if not use_proxy or not has_real_peer or not hasattr(request, "headers"):
        return safe_peer

    raw_trusted = settings.TRUSTED_PROXY_IPS if trusted_proxies is None else trusted_proxies
    trusted_networks = _parse_trusted_proxy_networks(raw_trusted)
    if not trusted_networks:
        return safe_peer

    try:
        peer_ip = ipaddress.ip_address(raw_peer)
    except ValueError:
        return safe_peer

    if not _is_ip_in_networks(peer_ip, trusted_networks):
        return safe_peer

    xff = request.headers.get("x-forwarded-for")
    if isinstance(xff, str) and xff.strip():
        candidates = [part.strip() for part in xff.split(",") if part.strip()]
        for candidate in reversed(candidates):
            try:
                parsed = ipaddress.ip_address(candidate)
            except ValueError:
                # Reject malformed chain items and fail safely back to peer IP
                return safe_peer
            if not _is_ip_in_networks(parsed, trusted_networks):
                return str(parsed)[:45]

    return safe_peer


def get_client_meta(request: Any) -> Tuple[str, str]:
    """Returns normalized (client_ip, user_agent) for audit logging and telemetry."""
    ip = extract_client_ip(request)
    ua = request.headers.get("user-agent", "Unknown") if hasattr(request, "headers") else "Unknown"
    return ip, ua
