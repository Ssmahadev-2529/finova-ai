"""
Finova AI - AI Scam Shield Service
Advanced message intelligence, zero-touch URL risk analysis,
deterministic fraud vector scoring, and credential redaction.
"""

from typing import List, Dict, Any, Optional, Tuple
import re
from urllib.parse import urlparse, parse_qs
from datetime import datetime
import json
import uuid
from sqlalchemy.orm import Session
from models.transaction import ScamAuditModel
from services.auth_service import scope_scam_audit_query

# Whitelist of verified legitimate PayPal domains and affiliates
VERIFIED_PAYPAL_DOMAINS = {
    "paypal.com",
    "www.paypal.com",
    "paypal.me",
    "paypal-communication.com",
    "paypal-corp.com",
    "venmo.com",
    "www.venmo.com",
    "braintreepayments.com",
    "developer.paypal.com",
    "sandbox.paypal.com"
}

# Known public URL shorteners often abused in SMS/WhatsApp phishing
URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
    "is.gd", "buff.ly", "adf.ly", "bit.do", "cutt.ly"
}

# High-risk / disposable Top-Level Domains frequently associated with phishing kits
HIGH_RISK_TLDS = {
    "xyz", "cc", "top", "biz", "tk", "ml", "ga", "cf", "gq",
    "click", "buzz", "club", "rest", "support", "link", "live", "vip"
}

class ScamShieldService:
    def __init__(self):
        pass

    def redact_credentials(self, text: str) -> str:
        """
        Sanitizes submitted text by redacting sensitive data (passwords, card PANs, CVVs, OTPs)
        so credentials are never stored in audit logs.
        """
        # Redact 13-19 digit card numbers
        redacted = re.sub(r"\b(?:\d[ -]*?){13,19}\b", "[REDACTED_CARD_PAN]", text)
        # Redact 3 or 4 digit CVV/CVC when preceded by label
        redacted = re.sub(r"(?i)\b(cvv2?|cvc2?|cid|security code)\s*[:=]\s*\d{3,4}\b", r"\1: [REDACTED_CVV]", redacted)
        # Redact 6-digit OTP codes when preceded by label
        redacted = re.sub(r"(?i)\b(otp|one-time code|verification code|pin)\s*[:=]\s*\d{4,8}\b", r"\1: [REDACTED_OTP]", redacted)
        # Redact password values
        redacted = re.sub(r"(?i)\b(password|passwd|pwd)\s*[:=]\s*\S+", r"\1: [REDACTED_PASSWORD]", redacted)
        return redacted

    def extract_urls(self, text: str) -> List[str]:
        """Extracts candidate URLs from raw text using regex"""
        pattern = r"https?://[^\s<>\"']+|www\.[^\s<>\"']+"
        return re.findall(pattern, text, re.IGNORECASE)

    def analyze_url_safely(self, raw_url: str) -> Dict[str, Any]:
        """
        Zero-touch syntactic URL inspection:
        Evaluates hostname, domain composition, punycode, shorteners, and parameter redirects
        WITHOUT sending any HTTP requests or visiting the URL.
        """
        if not raw_url.startswith(("http://", "https://")):
            raw_url = "https://" + raw_url

        try:
            parsed = urlparse(raw_url)
            hostname = (parsed.hostname or "").lower()
            protocol = parsed.scheme.lower()
            port = parsed.port
            path = parsed.path.lower()
            query = parsed.query

            # Check if domain is official verified PayPal domain
            is_legit_paypal = hostname in VERIFIED_PAYPAL_DOMAINS or any(
                hostname.endswith("." + d) for d in VERIFIED_PAYPAL_DOMAINS
            )

            # TLD extraction
            parts = hostname.split(".")
            tld = parts[-1] if len(parts) > 1 else ""

            # Check for typosquatting / deception
            suspicious_keywords = []
            targets = ["paypal", "paypa1", "pay-pal", "paypai", "secure", "verify", "account", "login", "auth", "recover", "update"]
            for kw in targets:
                if kw in hostname and not is_legit_paypal:
                    suspicious_keywords.append(kw)

            is_shortener = hostname in URL_SHORTENERS
            has_punycode = hostname.startswith("xn--") or ".xn--" in hostname
            is_ip_address = bool(re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", hostname))
            is_high_risk_tld = tld in HIGH_RISK_TLDS

            # Static redirect parameter detection
            query_params = parse_qs(query)
            redirect_param = None
            for p in ["redirect", "redirect_url", "url", "target", "next", "destination"]:
                if p in query_params:
                    redirect_param = query_params[p][0]
                    break

            threat_signals = []
            if not is_legit_paypal and ("paypal" in hostname or "paypa1" in hostname or "pay-pal" in hostname):
                threat_signals.append("Domain impersonates PayPal brand using deceptive subdomains or character replacement")
            if is_ip_address:
                threat_signals.append("Raw IP address used as hostname instead of a registered domain")
            if has_punycode:
                threat_signals.append("Internationalized domain name (IDN/Punycode) detected — potential homograph attack")
            if is_shortener:
                threat_signals.append("URL shortener obscures true destination domain")
            if is_high_risk_tld:
                threat_signals.append(f"High-risk top-level domain (.{tld}) commonly associated with short-lived phishing kits")
            if protocol == "http":
                threat_signals.append("Insecure HTTP protocol used for purported financial transaction")
            if redirect_param:
                threat_signals.append(f"Deceptive open redirect parameter detected pointing to: {redirect_param[:40]}")

            return {
                "rawUrl": raw_url,
                "domain": hostname,
                "protocol": protocol,
                "port": port,
                "topLevelDomain": tld,
                "isVerifiedPayPalDomain": is_legit_paypal,
                "isShortener": is_shortener,
                "isIpAddress": is_ip_address,
                "hasPunycode": has_punycode,
                "isHighRiskTld": is_high_risk_tld,
                "suspiciousKeywordsFound": suspicious_keywords,
                "detectedRedirectParam": redirect_param,
                "threatSignals": threat_signals
            }
        except Exception:
            return {
                "rawUrl": raw_url,
                "domain": "unparseable_url",
                "protocol": "unknown",
                "isVerifiedPayPalDomain": False,
                "threatSignals": ["Malformed or obfuscated URL syntactic structure"]
            }

    def analyze_message_content(
        self,
        text: str,
        target_type: str = "email",
        channel: str = "email"
    ) -> Dict[str, Any]:
        """
        Hybrid multi-layer scam detection combining:
        1. Psychological urgency & coercion heuristics
        2. Credential harvesting & OTP solicitation
        3. Fake invoice / payment receipt claims
        4. Off-platform refund demands (overpayment triangulation)
        5. Zero-touch static URL risk intelligence
        6. Sender header and domain verification
        """
        lower = text.lower()
        indicators = []
        score = 10
        threat_categories = []

        # 1. PSYCHOLOGICAL COERCION & ARTIFICIAL URGENCY
        urgency_keywords = [
            "urgent", "suspended", "restricted", "permanently confiscated",
            "within 24 hours", "frozen", "account on hold", "immediate action required",
            "legal action", "arrest warrant", "final notice", "terminated"
        ]
        matched_urgency = [k for k in urgency_keywords if k in lower]
        if matched_urgency:
            score += 35
            threat_categories.append("Psychological Coercion")
            indicators.append({
                "category": "Psychological Coercion / Urgency",
                "description": f"Uses coercive countdown language ({', '.join(matched_urgency[:3])}) to induce panicked compliance before verification.",
                "severity": "high",
                "evidenceSnippet": matched_urgency[0]
            })

        # 1B. EXTORTION, LEGAL THREATS & INTIMIDATION
        extortion_keywords = [
            "law enforcement", "account seizure", "police", "arrest", "legal dept",
            "legal department", "court order", "wire $", "wire money", "wire funds"
        ]
        matched_extortion = [k for k in extortion_keywords if k in lower]
        if matched_extortion:
            score += 45
            threat_categories.append("Extortion & Threat Coercion")
            indicators.append({
                "category": "Extortion & Legal Threat Coercion",
                "description": f"Uses intimidation or fabricated legal/law enforcement consequences ({', '.join(matched_extortion[:2])}) to extort funds.",
                "severity": "critical",
                "evidenceSnippet": matched_extortion[0]
            })

        # 2. CREDENTIAL & SENSITIVE INFORMATION SOLICITATION
        credential_keywords = [
            "password", "one-time code", "otp", "pin", "cvv", "security code",
            "full card number", "social security", "ssn", "verify your credentials",
            "confirm your login", "bank login"
        ]
        matched_creds = [k for k in credential_keywords if k in lower]
        if matched_creds:
            score += 55
            threat_categories.append("Credential Harvesting")
            indicators.append({
                "category": "Credential & Sensitive Data Harvesting",
                "description": f"Solicits confidential credentials ({', '.join(matched_creds[:2])}). PayPal never requests passwords, OTPs, or CVV codes via email or chat.",
                "severity": "critical",
                "evidenceSnippet": matched_creds[0]
            })

        # 3. OFF-PLATFORM REFUND / OVERPAYMENT TRIANGULATION
        triangulation_keywords = [
            "overpaid", "accidentally sent", "western union", "zelle", "moneygram",
            "wire the excess", "refund the difference", "cashier's check", "crypto",
            "bitcoin", "refund via wire"
        ]
        matched_triangulation = [k for k in triangulation_keywords if k in lower]
        if matched_triangulation:
            score += 55
            threat_categories.append("Overpayment Triangulation Scam")
            indicators.append({
                "category": "Off-Platform Overpayment Triangulation",
                "description": "Requests an unrecoverable external wire transfer refund (Zelle/wire/crypto) before the initial fraudulent PayPal payment clears.",
                "severity": "critical",
                "evidenceSnippet": matched_triangulation[0]
            })

        # 4. FAKE INVOICE / CALL-CENTER TECH SUPPORT SCAM
        call_scam_keywords = [
            "toll free", "call our helpdesk", "call us immediately to cancel",
            "call 1-8", "call +1", "fraud department at", "call customer care"
        ]
        if any(k in lower for k in call_scam_keywords) and any(w in lower for w in ["invoice", "order placed", "geek squad", "norton", "bitcoin purchased", "paypal support"]):
            score += 35
            threat_categories.append("Fake Invoice Call-Back Scam")
            indicators.append({
                "category": "Deceptive Invoice / Call-Center Scam",
                "description": "Fictitious high-dollar charge notice providing a fraudulent call-center number to compromise caller devices.",
                "severity": "high",
                "evidenceSnippet": "Fake invoice demanding phone callback"
            })

        # 5. ZERO-TOUCH URL EXTRACTION & STATIC RISKS
        urls = self.extract_urls(text)
        safe_url_details = []
        has_deceptive_url = False

        for u in urls[:5]:
            url_res = self.analyze_url_safely(u)
            safe_url_details.append(url_res)

            if url_res["isShortener"]:
                score += 25
                threat_categories.append("Obfuscated Link")
                indicators.append({
                    "category": "Obfuscated / Shortened Hyperlink",
                    "description": f"Uses URL shortener ({url_res['domain']}) to conceal destination target domain.",
                    "severity": "medium",
                    "evidenceSnippet": u
                })

            if url_res["threatSignals"]:
                has_deceptive_url = True
                score += 45
                threat_categories.append("Deceptive Domain Impersonation")
                for sig in url_res["threatSignals"]:
                    indicators.append({
                        "category": "Malicious / Spoofed Domain Indicator",
                        "description": sig,
                        "severity": "critical",
                        "evidenceSnippet": url_res["domain"]
                    })

        # 6. LEGITIMATE SIGNAL DAMPENING (False-Positive Protection)
        # If message originates from verified PayPal domain with standard transactional footer,
        # and has NO deceptive URLs, credentials, or off-platform demands:
        is_legit_service_email = "service@paypal.com" in lower or "member@paypal.com" in lower or "intl@paypal.com" in lower
        has_no_scam_triggers = not matched_creds and not matched_triangulation and not has_deceptive_url
        
        if is_legit_service_email and has_no_scam_triggers:
            # Genuine monthly statement or sandbox capture notice
            score = max(5, score - 35)

        # 7. NORMAL FINANCIAL MESSAGE HEURISTIC
        if not matched_urgency and not matched_creds and not matched_triangulation and not has_deceptive_url:
            score = min(20, score)

        # 8. FINALIZE RISK SCORE AND CATEGORY
        final_score = min(99, max(5, score))

        if final_score >= 80:
            risk_level = "CRITICAL"
        elif final_score >= 60:
            risk_level = "HIGH"
        elif final_score >= 30:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        # Safe Merchant Recommendations
        safe_actions = []
        if final_score >= 60:
            safe_actions.append("Do NOT click hyperlinks, open attachments, or call phone numbers listed in this message.")
            safe_actions.append("Never wire funds via external channels (Zelle, wire, crypto) for orders placed through PayPal.")
            safe_actions.append("Access your official PayPal merchant portal manually by typing 'https://www.paypal.com' directly in your browser.")
            safe_actions.append("Forward unedited email headers to spoof@paypal.com for official PayPal security investigation and takedown.")
        elif final_score >= 30:
            safe_actions.append("Cross-reference the transaction ID or buyer details directly against your PayPal Sandbox activity ledger.")
            safe_actions.append("Verify DKIM, SPF, and DMARC alignment in the original email header to rule out domain spoofing.")
        else:
            safe_actions.append("Message conforms to expected commercial PayPal communication standards.")
            safe_actions.append("Standard operational vigilance applies. Always ensure online tracking is attached to captured orders.")

        threat_summary = ", ".join(list(set(threat_categories))) if threat_categories else "Normal Commercial Communication"

        # Model confidence based on signal density
        confidence = 97 if len(indicators) >= 2 or final_score <= 15 else 92

        return {
            "riskScore": final_score,
            "riskLevel": risk_level,
            "confidence": confidence,
            "threatCategory": threat_summary,
            "channel": channel,
            "indicators": indicators,
            "safeActions": safe_actions,
            "extractedUrlsCount": len(urls),
            "safeInspectionDetails": safe_url_details[0] if safe_url_details else None,
            "allSafeUrls": safe_url_details,
            "disclaimer": "Finova Scam Shield provides heuristic and AI threat analysis. Risk scores reflect security indicators and should not be treated as absolute legal proof of fraud."
        }

    def record_scam_audit(
        self,
        db: Session,
        text: str,
        target_type: str,
        analysis: Dict[str, Any],
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Saves sanitized inspection record to scam_audit_logs"""
        # Redact credentials before storing snippet
        sanitized_text = self.redact_credentials(text)
        snippet = sanitized_text[:120] + ("..." if len(sanitized_text) > 120 else "")

        audit_id = f"SCAN-{uuid.uuid4().hex[:6].upper()}"
        log_entry = ScamAuditModel(
            id=audit_id,
            user_id=user_id,
            target_type=target_type,
            input_snippet=snippet,
            risk_score=analysis["riskScore"],
            risk_level=analysis["riskLevel"],
            confidence=analysis["confidence"],
            indicators_json=json.dumps(analysis["indicators"]),
            safe_actions_json=json.dumps(analysis["safeActions"]),
            safe_inspection_json=json.dumps(analysis["safeInspectionDetails"]) if analysis["safeInspectionDetails"] else None
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)

        res = log_entry.to_dict()
        res["threatCategory"] = analysis.get("threatCategory", "Unknown Threat")
        res["disclaimer"] = analysis.get("disclaimer")
        return res

    def get_audit_history(
        self,
        db: Session,
        limit: int = 15,
        scoped_user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Retrieves recent scam inspection records from database scoped to tenant."""
        query = scope_scam_audit_query(db.query(ScamAuditModel), ScamAuditModel, scoped_user_id)
        records = query.order_by(ScamAuditModel.created_at.desc()).limit(limit).all()
        return [r.to_dict() for r in records]

    def get_threat_distribution(
        self,
        db: Session,
        scoped_user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Calculates risk level distribution and top detected threat vectors scoped to tenant."""
        query = scope_scam_audit_query(db.query(ScamAuditModel), ScamAuditModel, scoped_user_id)
        records = query.all()
        if not records:
            return {
                "totalScans": 0,
                "distribution": {
                    "CRITICAL": {"count": 0, "percentage": 0.0},
                    "HIGH": {"count": 0, "percentage": 0.0},
                    "MEDIUM": {"count": 0, "percentage": 0.0},
                    "LOW": {"count": 0, "percentage": 0.0}
                },
                "averageRiskScore": 0.0,
                "threatIndicatorsFound": 0
            }

        total = len(records)
        dist = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        total_score = 0
        total_indicators = 0

        for r in records:
            lvl = r.risk_level.upper() if r.risk_level else "LOW"
            if lvl in dist:
                dist[lvl] += 1
            total_score += r.risk_score
            try:
                inds = json.loads(r.indicators_json) if r.indicators_json else []
                total_indicators += len(inds)
            except Exception:
                pass

        formatted_dist = {}
        for k, v in dist.items():
            formatted_dist[k] = {
                "count": v,
                "percentage": round((v / total) * 100.0, 1) if total > 0 else 0.0
            }

        return {
            "totalScans": total,
            "distribution": formatted_dist,
            "averageRiskScore": round(total_score / total, 1) if total > 0 else 0.0,
            "threatIndicatorsFound": total_indicators
        }

scam_shield_service = ScamShieldService()
