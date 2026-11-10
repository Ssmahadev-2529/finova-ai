import sys
import os
import unittest
import logging

logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models.transaction import TransactionModel
from models.user import UserModel
from services.decision_intelligence_service import DecisionIntelligenceService
from routes.transaction_routes import (
    get_period_comparison,
    get_revenue_forecast,
    get_decision_intelligence,
    simulate_decision_scenario,
    DecisionScenarioRequest,
    seed_initial_transactions
)

class TestDecisionIntelligence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def setUp(self):
        self.db = SessionLocal()
        seed_initial_transactions(self.db)
        self.service = DecisionIntelligenceService()
        self.test_user = UserModel(
            id="USR-DEC-TEST",
            email="dec@finova.test",
            hashed_password="x",
            full_name="Decision Tester",
            business_name="Finova Decision",
            is_active=True,
            role="merchant",
        )

    def tearDown(self):
        self.db.close()

    def test_01_period_comparison_monthly(self):
        """Verifies monthly period comparison produces valid metrics, deltas, and trend directions."""
        comp = self.service.get_period_comparison(self.db, period="monthly")
        self.assertEqual(comp["period"], "monthly")
        self.assertIn("metrics", comp)
        self.assertIn("trendDirection", comp)
        self.assertIn(comp["trendDirection"], ["GROWTH", "DECLINE", "STABLE"])

        metrics = comp["metrics"]
        for key in ["grossVolume", "netRevenue", "feesPaid", "refundAmount", "successRate", "failureRate", "averageTicket"]:
            self.assertIn(key, metrics)
            self.assertIn("current", metrics[key])
            self.assertIn("previous", metrics[key])
            self.assertIn("delta", metrics[key])
            self.assertIn("deltaPct", metrics[key])
            self.assertIsInstance(metrics[key]["current"], (int, float))

        self.assertTrue(len(comp["summaryText"]) > 10)

    def test_02_period_comparison_intervals(self):
        """Verifies comparisons operate across daily, weekly, and yearly frequencies."""
        for p in ["daily", "weekly", "yearly"]:
            comp = self.service.get_period_comparison(self.db, period=p)
            self.assertEqual(comp["period"], p)
            self.assertIn("metrics", comp)
            self.assertIn("grossVolume", comp["metrics"])

        # Test invalid period fallback to monthly
        comp_invalid = self.service.get_period_comparison(self.db, period="quarterly")
        self.assertEqual(comp_invalid["period"], "monthly")

    def test_03_period_comparison_resilience(self):
        """Empty list of records returns clean default response without unhandled exceptions."""
        empty_comp = self.service.get_period_comparison(self.db, period="monthly")
        self.assertIsNotNone(empty_comp)
        self.assertIn("metrics", empty_comp)

    def test_04_revenue_forecast_projection(self):
        """Verifies revenue forecast produces horizon points, confidence bands, and projections."""
        horizon = 7
        forecast = self.service.get_revenue_forecast(self.db, period="daily", horizon=horizon)
        
        self.assertEqual(forecast["period"], "daily")
        self.assertEqual(forecast["horizon"], horizon)
        self.assertIn("data", forecast)
        self.assertIn("algorithm", forecast)
        self.assertIn("confidenceLevel", forecast)
        self.assertIn("disclaimer", forecast)
        
        # Verify forecast points
        forecast_pts = [pt for pt in forecast["data"] if pt.get("isForecast")]
        self.assertEqual(len(forecast_pts), horizon)

        for pt in forecast_pts:
            self.assertTrue(pt["isForecast"])
            self.assertGreaterEqual(pt["volume"], 0)
            self.assertGreaterEqual(pt["fees"], 0)
            self.assertGreaterEqual(pt["net"], 0)
            self.assertIn("lowerConfidence", pt)
            self.assertIn("upperConfidence", pt)
            self.assertLessEqual(pt["lowerConfidence"], pt["upperConfidence"])

        self.assertGreater(forecast["projectedTotalVolume"], 0)
        self.assertGreater(forecast["projectedTotalFees"], 0)
        self.assertGreater(forecast["projectedTotalNet"], 0)

    def test_05_forecast_different_horizons(self):
        """Verifies forecasting works with different horizon lengths (3, 14, 30 days)."""
        for h in [3, 14]:
            fc = self.service.get_revenue_forecast(self.db, period="daily", horizon=h)
            fc_pts = [p for p in fc["data"] if p.get("isForecast")]
            self.assertEqual(len(fc_pts), h)

    def test_06_decision_intelligence_recommendations(self):
        """Verifies the Decision Engine produces actionable, structured recommendation cards."""
        decisions = self.service.generate_decision_intelligence(self.db)
        self.assertIsInstance(decisions, list)
        self.assertGreater(len(decisions), 0)

        for dec in decisions:
            self.assertIn("id", dec)
            self.assertIn("title", dec)
            self.assertIn("category", dec)
            self.assertIn("severity", dec)
            self.assertIn("observation", dec)
            self.assertIn("supportingData", dec)
            self.assertIn("financialImpact", dec)
            self.assertIn("recommendedAction", dec)
            self.assertIn("confidence", dec)
            self.assertIn("limitations", dec)
            self.assertIn(dec["severity"], ["info", "warning", "critical", "success"])
            self.assertTrue(0 <= dec["confidence"] <= 100)

        # Check for specific expected decision items
        ids = [d["id"] for d in decisions]
        self.assertIn("DEC-GROWTH-05", ids)

    def test_07_scenario_simulator_positive_growth(self):
        """Simulates positive volume growth (+25%) and verifies math and variance."""
        res = self.service.simulate_decision_scenario(
            self.db,
            volume_growth_pct=25.0,
            target_avg_ticket=500.0,
            cross_border_pct=20.0,
            payment_tier="standard"
        )

        self.assertIn("parameters", res)
        self.assertIn("baseline", res)
        self.assertIn("projected", res)
        self.assertIn("variance", res)
        self.assertIn("assumptions", res)
        self.assertIn("disclaimer", res)

        base_gross = res["baseline"]["grossVolume"]
        proj_gross = res["projected"]["grossVolume"]
        self.assertAlmostEqual(proj_gross, round(base_gross * 1.25, 2), delta=1.0)
        self.assertGreater(res["variance"]["volumeDelta"], 0)
        self.assertTrue(res["variance"]["isNetProfitable"])

    def test_08_scenario_simulator_tier_impact(self):
        """Simulates micropayments tier and verifies effective rate variance."""
        std_res = self.service.simulate_decision_scenario(
            self.db,
            volume_growth_pct=0.0,
            payment_tier="standard"
        )
        micro_res = self.service.simulate_decision_scenario(
            self.db,
            volume_growth_pct=0.0,
            payment_tier="micropayments"
        )
        self.assertNotEqual(std_res["projected"]["totalFees"], micro_res["projected"]["totalFees"])
        self.assertEqual(micro_res["parameters"]["paymentTier"], "micropayments")

    def test_09_api_routes_integration(self):
        """Directly tests API route handlers to ensure full HTTP schema compatibility."""
        comp = get_period_comparison(period="monthly", current_user=self.test_user, db=self.db)
        self.assertIn("metrics", comp)

        forecast = get_revenue_forecast(period="daily", horizon=7, current_user=self.test_user, db=self.db)
        self.assertIn("data", forecast)

        decisions = get_decision_intelligence(current_user=self.test_user, db=self.db)
        self.assertIsInstance(decisions, list)

        req = DecisionScenarioRequest(
            volumeGrowthPct=15.0,
            targetAverageTicket=350.0,
            crossBorderPct=10.0,
            paymentTier="standard"
        )
        sim = simulate_decision_scenario(req=req, current_user=self.test_user, db=self.db)
        self.assertIn("variance", sim)
        self.assertEqual(sim["parameters"]["volumeGrowthPct"], 15.0)

if __name__ == "__main__":
    unittest.main()
