"""
Market Entry Timing & Spot vs Term Contract Strategy Engine (Module C).
Evaluates forward freight trajectories, volatility cones, and suggests optimal chartering windows
(Spot vs 3-Month COA vs 6-Month COA) along with idle vessel repositioning guidance.
"""

from typing import Dict, Any, List
import numpy as np


class MarketTimingEngine:
    """Evaluates market trajectory to deliver actionable procurement decisions."""

    def evaluate_strategy(
        self,
        current_spot_rate: float,
        forecast_rates: List[float],
        forecast_lower: List[float],
        forecast_upper: List[float],
        target_volume_mt: float
    ) -> Dict[str, Any]:
        """
        Determines whether procurement should enter spot market now, lock in a multi-voyage term contract,
        or wait for an upcoming market dip.
        """
        if not forecast_rates:
            return {"action": "ENTER_NOW_SPOT", "confidence_pct": 50.0}

        avg_short_term = np.mean(forecast_rates[:4])  # Next 4 weeks
        avg_mid_term = np.mean(forecast_rates[:12])   # Next 12 weeks
        min_forecast = min(forecast_rates)
        min_index = forecast_rates.index(min_forecast) + 1

        pct_change_short = ((avg_short_term - current_spot_rate) / current_spot_rate) * 100.0
        pct_change_mid = ((avg_mid_term - current_spot_rate) / current_spot_rate) * 100.0

        # Term Contract Discount factor (shipowners typically offer 3-7% discount for forward volume commitment)
        term_discount_rate = 0.05
        contract_rate_est = avg_mid_term * (1.0 - term_discount_rate)

        # Decision Logic
        if pct_change_short > 6.0 and pct_change_mid > 8.0:
            action = "ENTER_NOW_TERM_CONTRACT"
            headline = "Bullish Freight Trend: Lock in Multi-Voyage Contract (COA) Now"
            strategy_recommendation = (
                f"Freight rates are projected to rise +{pct_change_mid:.1f}% over the next quarter. "
                f"Securing a 6-month Medium-Term Contract locks in ~${contract_rate_est:.2f}/MT, avoiding future spot rate surges."
            )
            estimated_cost_savings_usd = max(0.0, (avg_mid_term - contract_rate_est) * target_volume_mt)
            confidence = min(92.0, 75.0 + abs(pct_change_mid))

        elif pct_change_short < -5.0 and min_index <= 4:
            action = f"WAIT_{min_index}_WEEKS"
            headline = f"Market Softening: Defer Booking by {min_index} Week(s)"
            strategy_recommendation = (
                f"Rates are expected to bottom out around Week {min_index} at ~${min_forecast:.2f}/MT "
                f"(a drop of {abs(pct_change_short):.1f}% from current spot). Defer procurement to capture the trough."
            )
            estimated_cost_savings_usd = max(0.0, (current_spot_rate - min_forecast) * target_volume_mt)
            confidence = min(88.0, 70.0 + abs(pct_change_short))

        else:
            action = "ENTER_NOW_SPOT"
            headline = "Neutral / Stable Market: Execute Current Spot Charter"
            strategy_recommendation = (
                f"Freight market is range-bound (projected change within {pct_change_short:+.1f}%). "
                f"Execute immediate spot charter at current rate of ${current_spot_rate:.2f}/MT without commitment lock-in."
            )
            estimated_cost_savings_usd = 0.0
            confidence = 80.0

        return {
            "recommended_action": action,
            "headline": headline,
            "detailed_strategy": strategy_recommendation,
            "confidence_score_pct": round(confidence, 1),
            "current_spot_usd_per_mt": round(current_spot_rate, 2),
            "projected_4w_avg_usd_per_mt": round(avg_short_term, 2),
            "projected_12w_avg_usd_per_mt": round(avg_mid_term, 2),
            "term_contract_estimated_rate_usd_per_mt": round(contract_rate_est, 2),
            "estimated_cost_savings_usd": round(estimated_cost_savings_usd, 0),
            "idle_scenario_guidance": self._get_idle_scenario_repositioning(current_spot_rate, avg_mid_term)
        }

    def _get_idle_scenario_repositioning(self, current_rate: float, future_rate: float) -> Dict[str, Any]:
        """Provides idle vessel mitigation suggestions."""
        if future_rate < current_rate * 0.90:
            return {
                "idle_risk_level": "High (Demand Lull Expected)",
                "suggested_action": "Triangular Routing / Coastal Backhaul",
                "alternate_employment": [
                    "Engage in coastal cabotage movement (e.g. Paradip to Ennore/Tuticorin thermal coal)",
                    "Reposition ballast vessel toward Southeast Asia / Indonesia for short-haul fixtures."
                ]
            }
        return {
            "idle_risk_level": "Low (Strong Market Absorption)",
            "suggested_action": "Standard Direct Ballast Return",
            "alternate_employment": ["Maintain standard dedicated shuttle loop."]
        }
