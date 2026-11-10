from fastapi import APIRouter, Depends, HTTPException, Request, Header, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Dict, Any

from database import get_db
from config import settings
from models.user import UserModel, AuditLogModel
from services.auth_service import (
    auth_service,
    get_current_user,
    get_optional_current_user,
    get_client_meta
)
from services.email_service import (
    EmailDeliveryProvider,
    EmailDeliveryError,
    get_email_delivery_provider
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication & Security"])

# --- Request / Response Models ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    fullName: str = Field(..., min_length=2, max_length=128)
    businessName: str = Field(..., min_length=2, max_length=128)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    resetToken: str = Field(..., min_length=10)
    newPassword: str = Field(..., min_length=8)

class AuthResponse(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    user: Dict[str, Any]


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    req: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Registers a new merchant account with bcrypt password hashing (12 rounds)
    and returns a signed JWT access token.
    """
    ip, ua = get_client_meta(request)
    try:
        user = auth_service.register_user(
            db=db,
            email=req.email,
            password=req.password,
            full_name=req.fullName,
            business_name=req.businessName
        )
        token = auth_service.create_access_token(
            data={"sub": user.id, "email": user.email, "role": user.role, "tv": user.token_version}
        )
        
        auth_service.record_audit(
            db=db,
            action="USER_REGISTER",
            user_id=user.id,
            ip_address=ip,
            user_agent=ua,
            status="SUCCESS",
            details={"email": user.email, "business": user.business_name}
        )
        
        return {
            "accessToken": token,
            "tokenType": "bearer",
            "user": user.to_dict()
        }
    except HTTPException as he:
        auth_service.record_audit(
            db=db,
            action="USER_REGISTER_FAILED",
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"email": req.email, "error": he.detail}
        )
        raise he

@router.post("/login", response_model=AuthResponse)
def login(
    req: LoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Authenticates merchant credentials using constant-time bcrypt verification
    and returns a signed JWT token.
    """
    ip, ua = get_client_meta(request)
    user = auth_service.authenticate_user(db=db, email=req.email, password=req.password)
    
    if not user:
        auth_service.record_audit(
            db=db,
            action="USER_LOGIN_FAILED",
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"email": req.email, "reason": "Invalid credentials"}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = auth_service.create_access_token(
        data={"sub": user.id, "email": user.email, "role": user.role, "tv": user.token_version}
    )
    
    auth_service.record_audit(
        db=db,
        action="USER_LOGIN_SUCCESS",
        user_id=user.id,
        ip_address=ip,
        user_agent=ua,
        status="SUCCESS",
        details={"email": user.email}
    )

    return {
        "accessToken": token,
        "tokenType": "bearer",
        "user": user.to_dict()
    }

@router.post("/logout")
def logout(
    request: Request,
    authorization: Optional[str] = Header(None),
    current_user: Optional[UserModel] = Depends(get_optional_current_user),
    db: Session = Depends(get_db)
):
    """
    Revokes the current JWT session on the server-side blacklist.
    """
    ip, ua = get_client_meta(request)
    token_str = None
    if authorization and authorization.lower().startswith("bearer "):
        token_str = authorization[7:].strip() or None
    
    if token_str:
        auth_service.revoke_token(token_str, db=db)

    auth_service.record_audit(
        db=db,
        action="USER_LOGOUT",
        user_id=current_user.id if current_user else None,
        ip_address=ip,
        user_agent=ua,
        status="SUCCESS"
    )

    return {"status": "SUCCESS", "message": "Successfully logged out. Session token has been revoked."}

@router.get("/me")
def get_profile(current_user: UserModel = Depends(get_current_user)):
    """
    Returns the authenticated merchant's profile.
    """
    return current_user.to_dict()

@router.post("/forgot-password")
def forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    email_provider: EmailDeliveryProvider = Depends(get_email_delivery_provider)
):
    """
    Issues a time-limited, single-use password reset token and delivers the reset link
    out-of-band via the configured email transport. Never exposes reset tokens over HTTP.
    """
    ip, ua = get_client_meta(request)
    provider = email_provider if isinstance(email_provider, EmailDeliveryProvider) else get_email_delivery_provider()

    if not provider.is_configured():
        auth_service.record_audit(
            db=db,
            action="PASSWORD_RESET_UNAVAILABLE",
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"reason": "Email delivery transport is not configured."}
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset email delivery is currently unavailable. Please configure SMTP settings or contact support."
        )

    # Verify SMTP readiness BEFORE looking up user existence so transport failures
    # return identical 503 responses for both registered and unregistered emails.
    try:
        provider.verify_connection()
    except EmailDeliveryError:
        auth_service.record_audit(
            db=db,
            action="PASSWORD_RESET_DELIVERY_FAILED",
            ip_address=ip,
            user_agent=ua,
            status="FAILURE",
            details={"reason": "Email transport unavailable during preflight check."}
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send password reset email at this time. Please try again later."
        )

    raw_token = auth_service.create_password_reset_token(db=db, email=req.email)

    if raw_token:
        # Transfer reset token via URL fragment (#reset_token=) so it is never sent in HTTP requests,
        # server access logs, analytics URLs, or Referer headers.
        reset_link = f"{settings.FRONTEND_ORIGIN.rstrip('/')}/#reset_token={raw_token}"
        try:
            provider.send_password_reset_email(
                to_email=req.email.strip().lower(),
                reset_link=reset_link,
                expires_minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
            )
        except EmailDeliveryError:
            auth_service.clear_password_reset_token(db=db, email=req.email)
            auth_service.record_audit(
                db=db,
                action="PASSWORD_RESET_DELIVERY_FAILED",
                ip_address=ip,
                user_agent=ua,
                status="FAILURE",
                details={"reason": "SMTP send failure"}
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to send password reset email at this time. Please try again later."
            )

    auth_service.record_audit(
        db=db,
        action="PASSWORD_RESET_REQUESTED",
        ip_address=ip,
        user_agent=ua,
        status="SUCCESS",
        details={"email": req.email}
    )

    # Identical public response regardless of account existence to prevent account enumeration
    return {
        "status": "SUCCESS",
        "message": "If this email is registered, a password reset link has been sent to the registered email address."
    }

@router.post("/reset-password")
def reset_password(
    req: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Resets user password given a valid unexpired reset token.
    """
    ip, ua = get_client_meta(request)
    success = auth_service.reset_password(db=db, reset_token=req.resetToken, new_password=req.newPassword)
    
    auth_service.record_audit(
        db=db,
        action="PASSWORD_RESET_COMPLETED",
        ip_address=ip,
        user_agent=ua,
        status="SUCCESS" if success else "FAILURE"
    )
    
    return {"status": "SUCCESS", "message": "Password has been successfully updated. You may now log in."}

@router.get("/audit-logs")
def get_audit_logs(
    limit: int = 50,
    user_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves security audit logs with strict authentication, tenant isolation, and clamped pagination.
    Regular merchants access only their own audit entries; administrators may inspect all entries.
    """
    if not isinstance(current_user, UserModel) or not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to access security audit logs.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    clamped_limit = max(1, min(200, int(limit))) if isinstance(limit, int) else 50
    clean_user_id = user_id.strip() if isinstance(user_id, str) and user_id.strip() else None

    query = db.query(AuditLogModel)
    if (current_user.role or "").lower() == "admin":
        if clean_user_id:
            query = query.filter(AuditLogModel.user_id == clean_user_id)
    else:
        if clean_user_id and clean_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: merchants can view only their own security audit logs."
            )
        query = query.filter(AuditLogModel.user_id == current_user.id)

    logs = query.order_by(AuditLogModel.created_at.desc()).limit(clamped_limit).all()
    return [log.to_dict() for log in logs]
