"""
Finova AI - Phase 4 AI Scam Shield Test Suite
Comprehensive unit tests covering:
1. Genuine PayPal notification handling (False-positive protection -> Low Risk)
2. Phishing email detection with deceptive domain impersonation (Critical Risk)
3. Overpayment triangulation scam detection (High/Critical Risk)
4. Credential harvesting (password, OTP, PIN solicitation)
5. Zero-touch static URL risk analysis (shorteners, punycode, raw IPs, high-risk TLDs)
6. Sensitive credential redaction (passwords, card PANs, OTPs never stored in plain text)
7. Audit ledger persistence and threat distribution analytics
"""

import sys
import os
import unittest

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import Base, engine, SessionLocal
from models.transaction import ScamAuditModel
from models.user import UserModel
from services.scam_shield_service import scam_shield_service
from routes.transaction_routes import (
    analyze_scam,
    get_scam_history,
    get_scam_threat_distribution,
    ScamAnalyzeRequest
)

class TestAIScamShield(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.db = SessionLocal()
        cls.test_user = UserModel(
            id="USR-SCAM-TEST",
            email="scam@finova.test",
            hashed_password="x",
            full_name="Scam Tester",
            business_name="Finova Scam Shield",
            is_active=True,
            role="merchant",
        )

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_genuine_paypal_notification_low_risk(self):
        """Verify genuine PayPal transactional email is classified as LOW risk"""
        legit_text = (
            "From: service@paypal.com\n"
            "Subject: You received a payment of $120.00 USD from John Doe\n\n"
            "Hello Merchant, you've received a payment of $120.00 USD. "
            "Transaction ID: 4T839201928374. View details at https://www.paypal.com/activity."
        )

        analysis = scam_shield_service.analyze_message_content(legit_text, target_type="email")
        self.assertLessEqual(analysis["riskScore"], 29)
        self.assertEqual(analysis["riskLevel"], "LOW")
        self.assertIn("conforms to expected", analysis["safeActions"][0].lower())

    def test_phishing_account_suspension_critical_risk(self):
        """Verify spoofed domain + urgency threat is classified as CRITICAL risk"""
        phish_text = (
            "From: service@security-paypal-resolution-center.com\n"
            "Subject: [URGENT] Account suspended within 24 hours!\n"
            "Your PayPal balance will be permanently confiscated unless you verify your identity:\n"
            "https://paypal.com-account-recovery-portal.net/secure/auth?token=92840182"
        )

        analysis = scam_shield_service.analyze_message_content(phish_text, target_type="email")
        self.assertGreaterEqual(analysis["riskScore"], 80)
        self.assertEqual(analysis["riskLevel"], "CRITICAL")
        self.assertTrue(any("coercion" in ind["category"].lower() for ind in analysis["indicators"]))
        self.assertTrue(any("domain" in ind["category"].lower() for ind in analysis["indicators"]))

    def test_overpayment_triangulation_scam(self):
        """Verify off-platform wire demand is classified as HIGH or CRITICAL risk"""
        triangulation_text = (
            "Hello, I accidentally overpaid you by $700 for the item. "
            "Please immediately wire the $700 difference to my Western Union or Zelle account "
            "or I will dispute the transaction."
        )

        analysis = scam_shield_service.analyze_message_content(triangulation_text, target_type="message")
        self.assertGreaterEqual(analysis["riskScore"], 60)
        self.assertIn(analysis["riskLevel"], ["HIGH", "CRITICAL"])
        self.assertTrue(any("triangulation" in ind["category"].lower() for ind in analysis["indicators"]))

    def test_credential_and_otp_harvesting(self):
        """Verify solicitation of passwords and OTP codes triggers Critical indicators"""
        otp_text = (
            "PayPal Security Notice: Suspicious sign-in detected. "
            "Reply immediately with your password and your 6-digit one-time code (OTP) to unlock account."
        )

        analysis = scam_shield_service.analyze_message_content(otp_text, target_type="sms")
        self.assertGreaterEqual(analysis["riskScore"], 60)
        self.assertTrue(any("credential" in ind["category"].lower() for ind in analysis["indicators"]))

    def test_zero_touch_url_inspection(self):
        """Verify URL syntactic inspection detects shorteners, punycode, IPs, and high-risk TLDs safely"""
        # 1. URL shortener
        shortener_res = scam_shield_service.analyze_url_safely("http://bit.ly/paypal-verify-99")
        self.assertTrue(shortener_res["isShortener"])
        self.assertEqual(shortener_res["domain"], "bit.ly")

        # 2. Raw IP address
        ip_res = scam_shield_service.analyze_url_safely("http://192.168.1.100/paypal/login")
        self.assertTrue(ip_res["isIpAddress"])

        # 3. High-risk TLD
        tld_res = scam_shield_service.analyze_url_safely("https://paypal-security-update.xyz/login")
        self.assertTrue(tld_res["isHighRiskTld"])

        # 4. Verified PayPal domain
        paypal_res = scam_shield_service.analyze_url_safely("https://www.paypal.com/myaccount/money")
        self.assertTrue(paypal_res["isVerifiedPayPalDomain"])
        self.assertEqual(len(paypal_res["threatSignals"]), 0)

    def test_sensitive_credential_redaction(self):
        """Verify sensitive credentials (card PAN, CVV, OTP, password) are redacted before storage"""
        raw_msg = (
            "Client card is 4111 2222 3333 4444 with CVV: 891 and OTP: 492019. "
            "User password: SuperSecret123!"
        )
        redacted = scam_shield_service.redact_credentials(raw_msg)

        self.assertNotIn("4111 2222 3333 4444", redacted)
        self.assertIn("[REDACTED_CARD_PAN]", redacted)
        self.assertNotIn("891", redacted)
        self.assertIn("[REDACTED_CVV]", redacted)
        self.assertNotIn("492019", redacted)
        self.assertIn("[REDACTED_OTP]", redacted)
        self.assertNotIn("SuperSecret123!", redacted)
        self.assertIn("[REDACTED_PASSWORD]", redacted)

    def test_audit_ledger_and_distribution(self):
        """Verify audit record persistence and threat distribution calculations"""
        req = ScamAnalyzeRequest(
            text="URGENT: Your PayPal account is frozen. Click http://paypal-fake-login.cc/auth",
            targetType="email",
            channel="email"
        )
        res = analyze_scam(req, current_user=self.test_user, db=self.db)
        try:
            self.assertIn("id", res)
            self.assertIn("riskScore", res)
            self.assertGreaterEqual(res["riskScore"], 60)

            # Retrieve history scoped to authenticated user
            history = get_scam_history(current_user=self.test_user, db=self.db)
            self.assertGreater(len(history), 0)
            self.assertIn("id", history[0])

            # Retrieve threat distribution scoped to authenticated user
            dist = get_scam_threat_distribution(current_user=self.test_user, db=self.db)
            self.assertIn("totalScans", dist)
            self.assertIn("distribution", dist)
            self.assertGreater(dist["totalScans"], 0)
            self.assertIn("CRITICAL", dist["distribution"])
        finally:
            self.db.query(ScamAuditModel).filter(ScamAuditModel.id == res["id"]).delete()
            self.db.commit()

if __name__ == "__main__":
    unittest.main()
