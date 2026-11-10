import base64
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import logging
import time
from typing import Dict, Any, Optional, Union
from urllib.parse import urlparse
import httpx
from config import settings

logger = logging.getLogger("finova.paypal")

ZERO_DECIMAL_CURRENCIES = {"JPY"}
TRUSTED_PAYPAL_CERT_HOSTS = {
    "api.sandbox.paypal.com",
    "api.paypal.com",
    "api-m.sandbox.paypal.com",
    "api-m.paypal.com",
}


class PayPalAmbiguousError(Exception):
    """Raised when a PayPal network timeout, redirect, or 5xx makes payment state uncertain."""


class PayPalAPIError(Exception):
    """Raised when PayPal returns a definitive 4xx API rejection."""

    def __init__(self, status_code: int, message: str, error_name: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.error_name = error_name


def to_decimal(value: Union[Decimal, int, float, str]) -> Decimal:
    """Converts numeric input to an exact Decimal via string representation."""
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Invalid monetary amount: {value}") from exc


def format_paypal_amount(amount: Union[Decimal, int, float, str], currency: str) -> str:
    """Formats order amounts per PayPal decimal precision rules (integers for JPY, 2 decimals otherwise)."""
    dec = to_decimal(amount)
    if not dec.is_finite() or dec <= Decimal("0"):
        raise ValueError("Amount must be a positive finite decimal.")
    curr = (currency or "USD").strip().upper()
    if curr in ZERO_DECIMAL_CURRENCIES:
        integral = dec.to_integral_value(rounding=ROUND_HALF_UP)
        if dec != integral:
            raise ValueError(f"Currency {curr} does not support fractional amounts.")
        return str(int(integral))
    return f"{dec.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):.2f}"


def is_valid_paypal_cert_url(cert_url: Optional[str]) -> bool:
    """Strictly validates PayPal webhook cert_url (HTTPS + exact trusted PayPal hostname allowlist)."""
    if not cert_url or not isinstance(cert_url, str):
        return False
    if any(ch in cert_url for ch in ("\r", "\n", "\t", " ")):
        return False
    cleaned = cert_url.strip()
    if not cleaned:
        return False
    try:
        parsed = urlparse(cleaned)
    except ValueError:
        return False

    if (parsed.scheme or "").lower() != "https":
        return False
    if parsed.username or parsed.password:
        return False
    hostname = (parsed.hostname or "").lower()
    if hostname not in TRUSTED_PAYPAL_CERT_HOSTS:
        return False
    if parsed.port not in (None, 443):
        return False
    return True


def is_webhook_id_configured(webhook_id: Optional[str] = None) -> bool:
    """Returns True only if PAYPAL_WEBHOOK_ID is set to a non-placeholder value."""
    val = (settings.PAYPAL_WEBHOOK_ID if webhook_id is None else webhook_id) or ""
    cleaned = val.strip()
    if not cleaned:
        return False
    lowered = cleaned.lower()
    if "placeholder" in lowered or "your_paypal" in lowered or "change_this" in lowered:
        return False
    return True


class PayPalService:
    def __init__(self):
        self.base_url = settings.PAYPAL_BASE_URL.rstrip('/')
        self.client_id = settings.PAYPAL_CLIENT_ID
        self.client_secret = settings.PAYPAL_CLIENT_SECRET

        # Token cache: (token_str, expires_at_timestamp)
        self._cached_token: Optional[str] = None
        self._token_expires_at: float = 0

    def is_configured(self) -> bool:
        """Check if real client credentials have been configured."""
        return (
            bool(self.client_id)
            and bool(self.client_secret)
            and "placeholder" not in self.client_id.lower()
            and "your_paypal" not in self.client_id.lower()
        )

    @staticmethod
    def _reject_redirect(response: httpx.Response, operation: str) -> None:
        if 300 <= response.status_code < 400:
            raise PayPalAmbiguousError(
                f"PayPal {operation} received unexpected HTTP redirect [{response.status_code}]."
            )

    @staticmethod
    def _parse_paypal_error(response: httpx.Response) -> tuple[str, str]:
        error_name = ""
        detail_msg = response.text
        try:
            err_json = response.json()
            error_name = str(err_json.get("name") or "")
            details = err_json.get("details") or []
            if details and isinstance(details, list) and isinstance(details[0], dict):
                issue = details[0].get("issue") or ""
                if issue:
                    error_name = issue
            detail_msg = str(err_json.get("message") or response.text)
        except Exception:
            pass
        return error_name, detail_msg

    async def get_access_token(self) -> str:
        """
        Retrieves an OAuth 2.0 access token from PayPal Sandbox with in-memory caching.
        """
        # Return cached token if valid (buffer 60 seconds)
        if self._cached_token and time.time() < (self._token_expires_at - 60):
            return self._cached_token

        if not self.is_configured():
            raise ValueError(
                "PayPal Sandbox credentials are not configured. "
                "Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in backend/.env"
            )

        auth_header = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode("utf-8")
        ).decode("utf-8")

        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
                response = await client.post(
                    f"{self.base_url}/v1/oauth2/token",
                    headers={
                        "Authorization": f"Basic {auth_header}",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    data={"grant_type": "client_credentials"},
                )
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            raise PayPalAmbiguousError(f"PayPal OAuth transport error: {type(exc).__name__}") from exc

        self._reject_redirect(response, "OAuth")
        if response.status_code >= 500:
            raise PayPalAmbiguousError(f"PayPal OAuth server error [{response.status_code}]")
        if response.status_code != 200:
            error_name, msg = self._parse_paypal_error(response)
            raise PayPalAPIError(response.status_code, f"PayPal OAuth error [{response.status_code}]: {msg}", error_name)

        data = response.json()
        self._cached_token = data["access_token"]
        expires_in = data.get("expires_in", 3600)
        self._token_expires_at = time.time() + expires_in
        return self._cached_token

    async def create_order(
        self,
        amount: Union[Decimal, float, int, str],
        currency: str = "USD",
        reference_id: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Creates a payment order using PayPal Orders API v2 with exact decimal formatting and PayPal-Request-Id.
        """
        token = await self.get_access_token()
        curr = (currency or "USD").strip().upper()
        formatted_value = format_paypal_amount(amount, curr)

        payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "reference_id": reference_id or f"FINOVA-{int(time.time())}",
                    "description": "Finova AI Intelligence Checkout",
                    "amount": {
                        "currency_code": curr,
                        "value": formatted_value,
                    },
                }
            ],
            "application_context": {
                "brand_name": "Finova AI Platform",
                "landing_page": "NO_PREFERENCE",
                "user_action": "PAY_NOW",
                "return_url": f"{settings.FRONTEND_ORIGIN}/?payment=success",
                "cancel_url": f"{settings.FRONTEND_ORIGIN}/?payment=cancelled",
            },
        }

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        if request_id:
            headers["PayPal-Request-Id"] = request_id

        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
                response = await client.post(
                    f"{self.base_url}/v2/checkout/orders",
                    headers=headers,
                    json=payload,
                )
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            raise PayPalAmbiguousError(f"PayPal Create Order transport error: {type(exc).__name__}") from exc

        self._reject_redirect(response, "create_order")
        if response.status_code >= 500:
            raise PayPalAmbiguousError(f"PayPal Create Order server error [{response.status_code}]")
        if response.status_code not in (200, 201):
            error_name, msg = self._parse_paypal_error(response)
            raise PayPalAPIError(response.status_code, f"PayPal Create Order error [{response.status_code}]: {msg}", error_name)

        return response.json()

    async def get_order(self, order_id: str) -> Dict[str, Any]:
        """
        Retrieves authoritative order state from PayPal Orders API v2 for safe reconciliation.
        """
        token = await self.get_access_token()
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
                response = await client.get(
                    f"{self.base_url}/v2/checkout/orders/{order_id}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            raise PayPalAmbiguousError(f"PayPal Get Order transport error: {type(exc).__name__}") from exc

        self._reject_redirect(response, "get_order")
        if response.status_code >= 500:
            raise PayPalAmbiguousError(f"PayPal Get Order server error [{response.status_code}]")
        if response.status_code != 200:
            error_name, msg = self._parse_paypal_error(response)
            raise PayPalAPIError(response.status_code, f"PayPal Get Order error [{response.status_code}]: {msg}", error_name)

        return response.json()

    async def capture_order(self, order_id: str, request_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Captures authorized payment for an approved order via PayPal Orders API v2
        using PayPal-Request-Id idempotency. Distinguishes ambiguous timeouts/5xx from 4xx rejections.
        """
        token = await self.get_access_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            "PayPal-Request-Id": (request_id or f"capture-{order_id}").strip(),
        }

        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
                response = await client.post(
                    f"{self.base_url}/v2/checkout/orders/{order_id}/capture",
                    headers=headers,
                    json={},
                )
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            raise PayPalAmbiguousError(f"PayPal Capture transport error: {type(exc).__name__}") from exc

        self._reject_redirect(response, "capture_order")
        if response.status_code >= 500:
            raise PayPalAmbiguousError(f"PayPal Capture server error [{response.status_code}]")
        if response.status_code not in (200, 201):
            error_name, msg = self._parse_paypal_error(response)
            raise PayPalAPIError(response.status_code, f"PayPal Capture error [{response.status_code}]: {msg}", error_name)

        return response.json()

    def parse_capture_response(self, capture_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extracts gross, actual fee, net amount (as exact Decimals), buyer details,
        and capture ID from PayPal payload. Preserves $0.00 fees explicitly.
        """
        order_id = capture_data.get("id", "")
        status = capture_data.get("status", "COMPLETED")

        payer = capture_data.get("payer", {})
        name_obj = payer.get("name", {})
        given_name = name_obj.get("given_name", "")
        surname = name_obj.get("surname", "")
        customer_name = f"{given_name} {surname}".strip() or "PayPal Sandbox Buyer"
        customer_email = payer.get("email_address", "buyer@sandbox.paypal.com")
        country = payer.get("address", {}).get("country_code", "United States")

        # Parse purchase unit captures
        purchase_units = capture_data.get("purchase_units", [])
        captures = []
        if purchase_units:
            payments = purchase_units[0].get("payments", {})
            captures = payments.get("captures", [])

        gross_amount = Decimal("0.00")
        currency = "USD"
        actual_fee: Optional[Decimal] = None
        net_amount: Optional[Decimal] = None
        capture_id = None

        if captures:
            cap = captures[0]
            capture_id = cap.get("id")
            if cap.get("status"):
                status = cap.get("status")
            seller_breakdown = cap.get("seller_receivable_breakdown", {})

            gross_obj = seller_breakdown.get("gross_amount") or cap.get("amount") or {}
            gross_val = gross_obj.get("value")
            if gross_val is not None:
                gross_amount = to_decimal(gross_val)
                currency = gross_obj.get("currency_code", "USD")

            fee_val = (seller_breakdown.get("paypal_fee") or {}).get("value")
            if fee_val is not None:
                actual_fee = to_decimal(fee_val)

            net_val = (seller_breakdown.get("net_amount") or {}).get("value")
            if net_val is not None:
                net_amount = to_decimal(net_val)
            elif actual_fee is not None:
                net_amount = gross_amount - actual_fee

        return {
            "order_id": order_id,
            "capture_id": capture_id,
            "status": status,
            "customer_name": customer_name,
            "customer_email": customer_email,
            "amount": gross_amount,
            "currency": currency,
            "actual_fee": actual_fee,
            "net_amount": net_amount,
            "country": country,
            "payment_method": "PayPal Wallet"
        }

    async def verify_webhook_signature(
        self,
        transmission_id: str,
        transmission_time: str,
        cert_url: str,
        auth_algo: str,
        transmission_sig: str,
        webhook_event: Dict[str, Any]
    ) -> bool:
        """
        Verifies incoming PayPal webhook payload using PayPal's verification endpoint.
        Enforces strict HTTPS + exact PayPal hostname validation on cert_url and rejects redirects.
        """
        if not is_valid_paypal_cert_url(cert_url):
            return False

        if not is_webhook_id_configured():
            return False

        if not all([transmission_id, transmission_time, auth_algo, transmission_sig]):
            return False

        try:
            token = await self.get_access_token()
        except Exception as exc:
            logger.error("Failed to fetch PayPal token for webhook verification: %s", type(exc).__name__)
            return False

        payload = {
            "transmission_id": transmission_id,
            "transmission_time": transmission_time,
            "cert_url": cert_url.strip(),
            "auth_algo": auth_algo,
            "transmission_sig": transmission_sig,
            "webhook_id": settings.PAYPAL_WEBHOOK_ID,
            "webhook_event": webhook_event,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
                response = await client.post(
                    f"{self.base_url}/v1/notifications/verify-webhook-signature",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            logger.error("PayPal webhook verification transport error: %s", type(exc).__name__)
            return False

        if 300 <= response.status_code < 400:
            logger.warning("PayPal webhook verification rejected redirect [%s]", response.status_code)
            return False

        if response.status_code == 200:
            data = response.json()
            return data.get("verification_status") == "SUCCESS"
        return False

paypal_service = PayPalService()
