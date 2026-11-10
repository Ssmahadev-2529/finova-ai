"""
Finova AI — Shared Domain, Financial Precision, Date & Security Utilities
Centralizes monetary Decimal math, PayPal fee schedules, country normalization,
transaction datetime parsing, PAN/secret redaction, and CSV formula sanitization.
"""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Optional


ZERO_DECIMAL_CURRENCIES = {"JPY", "KRW", "VND", "CLP"}

USD_EXCHANGE_RATES: dict[str, Decimal] = {
    "USD": Decimal("1.0000"),
    "EUR": Decimal("1.0800"),
    "GBP": Decimal("1.2800"),
    "CAD": Decimal("0.7400"),
    "AUD": Decimal("0.6600"),
    "JPY": Decimal("0.0067"),
    "SGD": Decimal("0.7450"),
    "CHF": Decimal("1.1300"),
    "INR": Decimal("0.0120"),
}

DOMESTIC_US_IDENTIFIERS = {
    "US",
    "USA",
    "U.S.",
    "U.S.A.",
    "UNITED STATES",
    "UNITED STATES OF AMERICA",
}

PAYPAL_FIXED_FEE_BY_CURRENCY: dict[str, Decimal] = {
    "USD": Decimal("0.49"),
    "EUR": Decimal("0.39"),
    "GBP": Decimal("0.39"),
    "CAD": Decimal("0.59"),
    "AUD": Decimal("0.59"),
    "JPY": Decimal("40"),
    "SGD": Decimal("0.50"),
    "CHF": Decimal("0.55"),
}


def to_decimal(value: Any, default: str = "0") -> Decimal:
    """Safely converts numeric/string values to Decimal without IEEE-754 float drift."""
    if value is None:
        return Decimal(default)
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(default)


def currency_quantum(currency: str = "USD") -> Decimal:
    """Returns minor-unit quantum (1 for zero-decimal currencies like JPY, 0.01 otherwise)."""
    code = (currency or "USD").strip().upper()
    return Decimal("1") if code in ZERO_DECIMAL_CURRENCIES else Decimal("0.01")


def quantize_currency(value: Any, currency: str = "USD") -> Decimal:
    """Rounds monetary amount using ROUND_HALF_UP for the target ISO-4217 currency."""
    return to_decimal(value).quantize(currency_quantum(currency), rounding=ROUND_HALF_UP)


def normalize_country(raw_country: Optional[str]) -> str:
    """Normalizes country string cleanly while preserving readable merchant display."""
    cleaned = (raw_country or "United States").strip()
    return cleaned if cleaned else "United States"


def is_domestic_us(raw_country: Optional[str]) -> bool:
    """Returns True for both 'US' ISO-2 PayPal payer codes and 'United States' strings."""
    if raw_country is None:
        return True
    cleaned = raw_country.strip().upper()
    if not cleaned:
        return True
    return cleaned in DOMESTIC_US_IDENTIFIERS


def is_cross_border(raw_country: Optional[str], merchant_country: str = "US") -> bool:
    """Determines whether a transaction originates cross-border relative to US merchant baseline."""
    if (merchant_country or "US").strip().upper() in DOMESTIC_US_IDENTIFIERS:
        return not is_domestic_us(raw_country)
    cleaned = (raw_country or "").strip().upper()
    return bool(cleaned and cleaned != merchant_country.strip().upper())


def convert_to_usd(amount: Any, currency: str = "USD") -> Decimal:
    """Converts a monetary amount into USD equivalent using Decimal rates."""
    amt_dec = to_decimal(amount)
    code = (currency or "USD").strip().upper()
    rate = USD_EXCHANGE_RATES.get(code, Decimal("1.0000"))
    return (amt_dec * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def convert_between_currencies(amount: Any, from_currency: str = "USD", to_currency: str = "USD") -> Decimal:
    """Converts a monetary amount across supported currencies via Decimal USD rates."""
    from_code = (from_currency or "USD").strip().upper()
    to_code = (to_currency or "USD").strip().upper()
    amt_dec = to_decimal(amount)
    if from_code == to_code:
        return quantize_currency(amt_dec, to_code)
    usd_dec = convert_to_usd(amt_dec, from_code)
    if to_code == "USD":
        return usd_dec
    rate_to = USD_EXCHANGE_RATES.get(to_code, Decimal("1.0000"))
    if rate_to <= Decimal("0"):
        return quantize_currency(usd_dec, to_code)
    return quantize_currency(usd_dec / rate_to, to_code)


def calculate_paypal_estimated_fee(
    amount: Any,
    currency: str = "USD",
    country: Optional[str] = "United States",
    tier: str = "standard",
) -> Decimal:
    """
    Computes estimated PayPal commercial processing fee using Decimal precision.
    Supports standard (3.49%), micropayments (5.00% + $0.05/equiv), qr (1.90% + $0.10/equiv),
    nonprofit (1.99% + $0.49/equiv), zero-decimal currencies (JPY), and +1.50% cross-border fee.
    """
    amt_dec = max(Decimal("0"), to_decimal(amount))
    curr = (currency or "USD").strip().upper()
    is_zero_dec = curr in ZERO_DECIMAL_CURRENCIES
    intl_surcharge = Decimal("0.015") if is_cross_border(country) else Decimal("0")

    if tier == "micropayments":
        rate = Decimal("0.05") + intl_surcharge
        fixed = Decimal("5") if is_zero_dec else Decimal("0.05")
    elif tier == "qr":
        rate = Decimal("0.019") + intl_surcharge
        fixed = Decimal("10") if is_zero_dec else Decimal("0.10")
    elif tier == "nonprofit":
        rate = Decimal("0.0199") + intl_surcharge
        fixed = PAYPAL_FIXED_FEE_BY_CURRENCY.get(curr, Decimal("49") if is_zero_dec else Decimal("0.49"))
    else:
        rate = Decimal("0.0349") + intl_surcharge
        fixed = PAYPAL_FIXED_FEE_BY_CURRENCY.get(curr, Decimal("49") if is_zero_dec else Decimal("0.49"))

    if amt_dec <= Decimal("0"):
        return Decimal("0") if is_zero_dec else Decimal("0.00")

    return ((amt_dec * rate) + fixed).quantize(currency_quantum(curr), rounding=ROUND_HALF_UP)


def parse_transaction_datetime(date_str: Optional[str], fallback: Optional[datetime] = None) -> datetime:
    """Unified parser for transaction date strings across analytics, forecasting, and ML."""
    if isinstance(date_str, datetime):
        return date_str
    raw = (date_str or "").strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    if raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            pass
    return fallback or datetime.utcnow()


def luhn_check(card_number: str) -> bool:
    """Returns True if numeric string passes Luhn PAN checksum."""
    digits = [int(d) for d in card_number if d.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False
    checksum = 0
    reverse = digits[::-1]
    for idx, d in enumerate(reverse):
        if idx % 2 == 1:
            doubled = d * 2
            checksum += doubled - 9 if doubled > 9 else doubled
        else:
            checksum += d
    return checksum % 10 == 0


_CARD_PATTERN = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
_GROUPED_16_CARD_PATTERN = re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b")
_SECRET_PATTERN = re.compile(
    r"(bearer\s+[A-Za-z0-9\-._~+/]+=*|AIza[0-9A-Za-z\-_]{20,}|sk_[A-Za-z0-9]{16,})",
    re.IGNORECASE,
)


def redact_sensitive_text(text: Optional[str]) -> str:
    """Masks Luhn-valid payment card PANs, 16-digit card blocks, and bearer/API secret tokens."""
    if not text or not isinstance(text, str):
        return ""

    def _mask_pan(match: re.Match) -> str:
        raw = match.group(0)
        digits = "".join(ch for ch in raw if ch.isdigit())
        if luhn_check(digits):
            return f"[REDACTED_PAN_****{digits[-4:]}]"
        return raw

    masked = _CARD_PATTERN.sub(_mask_pan, text)
    masked = _GROUPED_16_CARD_PATTERN.sub("[REDACTED_CARD_NUMBER]", masked)
    return _SECRET_PATTERN.sub("[REDACTED_SECRET]", masked)


def parse_strict_filter_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parses explicit YYYY-MM-DD or ISO date filter parameters cleanly, raising ValueError if malformed."""
    if not date_str or not isinstance(date_str, str) or not date_str.strip():
        return None
    raw = date_str.strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError as exc:
        raise ValueError(f"Invalid date filter '{date_str}'. Expected YYYY-MM-DD or ISO-8601 format.") from exc


def sanitize_csv_cell(value: Any) -> str:
    """Prevents spreadsheet formula injection when exporting user-supplied text to CSV."""
    text_val = "" if value is None else str(value)
    if not text_val:
        return ""
    stripped = text_val.lstrip(" ")
    if text_val[0] in ("\t", "\r", "\n") or (stripped and stripped[0] in ("=", "+", "-", "@", "\t", "\r", "\n")):
        return f"'{text_val}"
    return text_val

