"""
Finova AI - Pluggable Out-of-Band Email Delivery Service
Provides a standard-library SMTP transport for password-reset links without
exposing reset tokens in HTTP responses, database logs, or console output.
"""

from abc import ABC, abstractmethod
from contextlib import contextmanager
from email.message import EmailMessage
import logging
import smtplib
import ssl
from typing import List, Dict, Any, Iterator

from config import settings

logger = logging.getLogger("finova.email")


class EmailDeliveryError(Exception):
    """Raised when email delivery is unconfigured or fails during transport."""


class EmailDeliveryProvider(ABC):
    """Pluggable interface for sending transactional security emails."""

    @abstractmethod
    def is_configured(self) -> bool:
        """Returns True when the email transport is ready to deliver messages."""

    @abstractmethod
    def verify_connection(self) -> None:
        """Verifies transport reachability and credentials before user lookup. Raises EmailDeliveryError on failure."""

    @abstractmethod
    def send_password_reset_email(
        self,
        to_email: str,
        reset_link: str,
        expires_minutes: int
    ) -> None:
        """Sends a password-reset email to the target user out-of-band."""


def _sanitize_header_value(value: str) -> str:
    """Prevents CRLF email header injection."""
    if "\r" in value or "\n" in value:
        raise EmailDeliveryError("Invalid header characters detected in email address.")
    return value.strip()


class SMTPEmailDeliveryProvider(EmailDeliveryProvider):
    """Standard-library SMTP email delivery provider using smtplib and EmailMessage."""

    def __init__(self, app_settings=settings):
        self._settings = app_settings

    def is_configured(self) -> bool:
        host = (self._settings.SMTP_HOST or "").strip()
        from_addr = (self._settings.SMTP_FROM_EMAIL or "").strip()
        return bool(host and from_addr and self._settings.SMTP_PORT > 0)

    @contextmanager
    def _open_connection(self) -> Iterator[smtplib.SMTP]:
        """Opens and authenticates an SMTP/TLS/SSL connection."""
        host = (self._settings.SMTP_HOST or "").strip()
        port = int(self._settings.SMTP_PORT)
        timeout = int(self._settings.SMTP_TIMEOUT_SECONDS)
        username = (self._settings.SMTP_USERNAME or "").strip()
        password = self._settings.SMTP_PASSWORD or ""

        context = ssl.create_default_context()
        if self._settings.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(host, port, timeout=timeout, context=context) as server:
                if username and password:
                    server.login(username, password)
                yield server
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as server:
                server.ehlo()
                if self._settings.SMTP_USE_TLS:
                    server.starttls(context=context)
                    server.ehlo()
                if username and password:
                    server.login(username, password)
                yield server

    def verify_connection(self) -> None:
        if not self.is_configured():
            raise EmailDeliveryError("SMTP password-reset delivery is not configured.")
        try:
            with self._open_connection() as server:
                server.noop()
        except (smtplib.SMTPException, OSError) as exc:
            logger.error("SMTP connection verification failed: %s", type(exc).__name__)
            raise EmailDeliveryError("SMTP transport unavailable.") from exc

    def send_password_reset_email(
        self,
        to_email: str,
        reset_link: str,
        expires_minutes: int
    ) -> None:
        if not self.is_configured():
            raise EmailDeliveryError("SMTP password-reset delivery is not configured.")

        safe_to = _sanitize_header_value(to_email)
        safe_from = _sanitize_header_value(self._settings.SMTP_FROM_EMAIL or "")

        msg = EmailMessage()
        msg["Subject"] = "Finova AI — Password Reset Request"
        msg["From"] = safe_from
        msg["To"] = safe_to
        msg.set_content(
            "Hello,\n\n"
            "A password reset was requested for your Finova AI merchant account.\n"
            f"Use the secure link below within {expires_minutes} minutes to reset your password:\n\n"
            f"{reset_link}\n\n"
            "If you did not request this change, you can safely ignore this message.\n"
        )

        try:
            with self._open_connection() as server:
                server.send_message(msg)
        except (smtplib.SMTPException, OSError) as exc:
            # Never log raw reset links or tokens
            logger.error("Failed to send password-reset email via SMTP: %s", type(exc).__name__)
            raise EmailDeliveryError("SMTP email delivery failed.") from exc


class MockEmailDeliveryProvider(EmailDeliveryProvider):
    """In-memory test double capturing outbound reset emails for automated verification."""

    def __init__(self, configured: bool = True, should_fail: bool = False, fail_on_send_only: bool = False):
        self.configured = configured
        self.should_fail = should_fail
        self.fail_on_send_only = fail_on_send_only
        self.sent_messages: List[Dict[str, Any]] = []

    def is_configured(self) -> bool:
        return self.configured

    def verify_connection(self) -> None:
        if not self.configured or self.should_fail:
            raise EmailDeliveryError("Mock transport unavailable.")

    def send_password_reset_email(
        self,
        to_email: str,
        reset_link: str,
        expires_minutes: int
    ) -> None:
        if not self.configured or self.should_fail or self.fail_on_send_only:
            raise EmailDeliveryError("Mock delivery failure.")
        self.sent_messages.append({
            "to_email": to_email,
            "reset_link": reset_link,
            "expires_minutes": expires_minutes,
        })


_active_email_provider: EmailDeliveryProvider = SMTPEmailDeliveryProvider()


def get_email_delivery_provider() -> EmailDeliveryProvider:
    """FastAPI dependency returning the configured EmailDeliveryProvider."""
    return _active_email_provider


def set_email_delivery_provider(provider: EmailDeliveryProvider) -> None:
    """Swaps the active EmailDeliveryProvider (intended for testing/runtime configuration)."""
    global _active_email_provider
    _active_email_provider = provider
