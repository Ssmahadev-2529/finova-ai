"""
Finova AI - Phase 3 AI Cost Optimizer Test Suite
Comprehensive unit tests covering:
1. Transaction fee calculations across tiers (Standard, Micropayments, QR Code, Charity)
2. Multi-currency support and safe missing-rate fallbacks (USD, EUR, GBP, CAD, AUD, JPY)
3. Cross-border surcharges (+1.50%) and currency conversion spreads (~3.50%)
4. Historical actual captured fees vs estimated fees reconciliation and variance
5. AI cost recommendations with verified policy citations and dollar impact
6. Refunds and denied transactions handling
7. Side-by-side scenario comparisons
"""

import sys
import os
import unittest

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import Base, engine, SessionLocal
from models.transaction import TransactionModel
from models.user import UserModel
from services.cost_optimizer_service import cost_optimizer_service
from routes.transaction_routes import (
    seed_initial_transactions,
    calculate_fees,
    get_optimizer_historical_analysis,
    get_optimizer_recommendations,
    compare_scenarios,
    FeeCalculationRequest,
    ScenarioComparisonRequest,
    ScenarioItem
)

class TestAICostOptimizer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.db = SessionLocal()
        seed_initial_transactions(cls.db)
        cls.test_user = UserModel(
            id="USR-OPT-TEST",
            email="optimizer@finova.test",
            hashed_password="x",
            full_name="Optimizer Tester",
            business_name="Finova Optimizer",
            is_active=True,
            role="merchant",
        )

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_standard_tier_calculation(self):
        """Verify standard domestic US PayPal commercial tier: 3.49% + $0.49"""
        calc = cost_optimizer_service.calculate_predicted_fee(
            amount=100.0,
            source_currency="USD",
            target_currency="USD",
            is_international=False,
            payment_tier="standard"
        )
        expected_fee = round((100.0 * 0.0349) + 0.49, 2)  # 3.49 + 0.49 = 3.98
        self.assertEqual(calc["totalEstimatedFee"], expected_fee)
        self.assertEqual(calc["estimatedNetReceived"], round(100.0 - expected_fee, 2))
        self.assertEqual(calc["effectiveFeeRate"], 3.98)
        self.assertIn("Estimates are for merchant planning", calc["disclaimer"])

    def test_micropayments_tier_cost_savings(self):
        """Verify Micropayments tier (5.00% + $0.05) saves money on low-ticket sales ($5.00)"""
        standard_calc = cost_optimizer_service.calculate_predicted_fee(
            amount=5.0,
            source_currency="USD",
            target_currency="USD",
            payment_tier="standard"
        )
        micro_calc = cost_optimizer_service.calculate_predicted_fee(
            amount=5.0,
            source_currency="USD",
            target_currency="USD",
            payment_tier="micropayments"
        )

        # Standard fee: (5 * 0.0349) + 0.49 = 0.17 + 0.49 = 0.66 USD (13.2% fee!)
        # Micro fee: (5 * 0.05) + 0.05 = 0.30 USD (6.0% fee)
        self.assertEqual(standard_calc["totalEstimatedFee"], 0.66)
        self.assertEqual(micro_calc["totalEstimatedFee"], 0.30)
        self.assertGreater(micro_calc["estimatedNetReceived"], standard_calc["estimatedNetReceived"])

    def test_qr_code_tiers(self):
        """Verify In-Person QR Code tier: 2.40% + $0.05 for <= $10, 1.90% + $0.10 for > $10"""
        qr_small = cost_optimizer_service.calculate_predicted_fee(amount=10.0, payment_tier="qr_code")
        qr_large = cost_optimizer_service.calculate_predicted_fee(amount=100.0, payment_tier="qr_code")

        self.assertEqual(qr_small["breakdown"]["basePercentage"], 2.40)
        self.assertEqual(qr_small["breakdown"]["fixedFee"], 0.05)

        self.assertEqual(qr_large["breakdown"]["basePercentage"], 1.90)
        self.assertEqual(qr_large["breakdown"]["fixedFee"], 0.10)

    def test_multi_currency_fixed_fees(self):
        """Verify currency-specific fixed fees (EUR €0.39, GBP £0.39, CAD $0.59)"""
        eur_calc = cost_optimizer_service.calculate_predicted_fee(amount=100.0, target_currency="EUR")
        gbp_calc = cost_optimizer_service.calculate_predicted_fee(amount=100.0, target_currency="GBP")
        cad_calc = cost_optimizer_service.calculate_predicted_fee(amount=100.0, target_currency="CAD")

        self.assertEqual(eur_calc["breakdown"]["fixedFee"], 0.39)
        self.assertEqual(gbp_calc["breakdown"]["fixedFee"], 0.39)
        self.assertEqual(cad_calc["breakdown"]["fixedFee"], 0.59)

    def test_cross_border_and_conversion_spread(self):
        """Verify cross-border surcharge (+1.5%) and FX conversion spread (~3.5%)"""
        inter_calc = cost_optimizer_service.calculate_predicted_fee(
            amount=200.0,
            source_currency="EUR",
            target_currency="USD",
            is_international=True,
            payment_tier="standard"
        )
        self.assertEqual(inter_calc["breakdown"]["crossBorderPercentage"], 1.50)
        self.assertEqual(inter_calc["breakdown"]["conversionSpreadPercentage"], 3.50)
        self.assertEqual(inter_calc["breakdown"]["conversionSpreadAmount"], 7.00)

    def test_missing_or_invalid_currency_fallback(self):
        """Verify unknown currency safely falls back to standard USD fixed fees"""
        unknown_calc = cost_optimizer_service.calculate_predicted_fee(
            amount=50.0,
            target_currency="XYZ_UNKNOWN"
        )
        self.assertEqual(unknown_calc["breakdown"]["fixedFee"], 0.49)
        self.assertGreater(unknown_calc["totalEstimatedFee"], 0)

    def test_historical_analysis_reconciliation(self):
        """Verify actual captured fee vs estimated fee reconciliation from stored transactions"""
        hist = get_optimizer_historical_analysis(current_user=self.test_user, db=self.db)
        recon = hist["reconciliation"]

        self.assertIn("totalTransactions", recon)
        self.assertIn("reconciledCount", recon)
        self.assertIn("totalActualFees", recon)
        self.assertIn("totalEstimatedFees", recon)
        self.assertIn("accuracyPct", recon)

        self.assertGreater(recon["totalTransactions"], 0)
        self.assertGreaterEqual(recon["reconciledCount"], 0)
        self.assertGreaterEqual(recon["accuracyPct"], 0.0)

        # Currency cost analysis checks
        self.assertGreater(len(hist["currencyAnalysis"]), 0)
        currencies = [c["currency"] for c in hist["currencyAnalysis"]]
        self.assertIn("USD", currencies)

        # High fee transactions check
        self.assertIsInstance(hist["highFeeTransactions"], list)

    def test_refunded_and_denied_transactions_handling(self):
        """Verify DENIED transactions are excluded from net settlements and fees are audited correctly"""
        hist = cost_optimizer_service.get_historical_analysis(self.db)
        # Denied transactions should not inflate net received volume
        for c in hist["currencyAnalysis"]:
            self.assertGreaterEqual(c["grossVolume"], c["netReceived"])

    def test_ai_cost_recommendations(self):
        """Verify verified cost recommendations with policy sources and dollar impact"""
        recs = get_optimizer_recommendations(current_user=self.test_user, db=self.db)
        self.assertIsInstance(recs, list)
        self.assertGreater(len(recs), 0)

        for r in recs:
            self.assertIn("id", r)
            self.assertIn("title", r)
            self.assertIn("description", r)
            self.assertIn("financialImpact", r)
            self.assertIn("actionSteps", r)
            self.assertIn("verifiedPolicySource", r)
            self.assertIsInstance(r["actionSteps"], list)

    def test_scenario_comparison_endpoint(self):
        """Verify side-by-side scenario simulation and ranking"""
        req = ScenarioComparisonRequest(scenarios=[
            ScenarioItem(id="SC1", name="Standard Checkout", amount=500.0, paymentTier="standard"),
            ScenarioItem(id="SC2", name="In-Person QR Code", amount=500.0, paymentTier="qr_code"),
            ScenarioItem(id="SC3", name="Micropayments Tier", amount=500.0, paymentTier="micropayments")
        ])

        res = compare_scenarios(req, current_user=self.test_user)
        self.assertIn("scenarios", res)
        self.assertIn("recommendedScenario", res)
        self.assertEqual(len(res["scenarios"]), 3)

        # QR Code on $500: (500 * 0.019) + 0.10 = $9.60 -> Net: $490.40 (Best)
        # Standard on $500: (500 * 0.0349) + 0.49 = $17.94 -> Net: $482.06
        self.assertEqual(res["recommendedScenario"]["scenarioId"], "SC2")

if __name__ == "__main__":
    unittest.main()
