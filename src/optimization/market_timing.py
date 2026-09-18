"""
Market Entry Timing & Spot vs Term Contract Strategy Engine (Module C).
Evaluates forward freight trajectories, volatility cones, and suggests optimal chartering windows
(Spot vs 3-Month COA vs 6-Month COA) along with idle vessel repositioning guidance.

SIH26006 PS alignment:
- "Propose strategies for minimizing vessel idle time by forecasting periods of low demand
  and suggesting alternative employment opportunities or optimised positioning."
  → _get_idle_scenario_repositioning() now derives real alternate routes from the 12-route
    master, estimates idle-days avoided, and quantifies $ savings vs straight ballast return.

- "Development of model to facilitate moving from multiple single spot contracts being entered
  into currently to short term / medium term multiple voyage contracts."
  → spot_to_contract_consolidation_pct field tracks, across a rolling history of past
    recommendations, what % of cargo volume decisions shifted from spot to term/COA fixtures.
"""

import json
import logging
import os
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Typical daily operating cost for a Panamax (ballast leg at sea) — industry reference
_PANAMAX_DAILY_COST_USD = 12_000.0

# Loaded once at import time; used by _get_idle_scenario_repositioning
_ROUTES_MASTER: list[dict[str, Any]] = []


def _load_routes_master() -> list[dict[str, Any]]:
    """Loads trade routes from JSON on first call; safe to call repeatedly."""
    global _ROUTES_MASTER
    if _ROUTES_MASTER:
        return _ROUTES_MASTER
    candidates = [
        "data/reference/routes_master.json",
        os.path.join(os.path.dirname(__file__), "../../data/reference/routes_master.json"),
    ]
    for path in candidates:
        try:
            with open(os.path.normpath(path), "r", encoding="utf-8") as f:
                _ROUTES_MASTER = json.load(f).get("trade_routes", [])
            return _ROUTES_MASTER
        except (FileNotFoundError, json.JSONDecodeError):
            continue
    logger.warning("routes_master.json not found — idle scenario will use generic fallbacks.")
    return []


def _origin_region(route_id: str) -> str:
    """Extracts origin region tag from a route_id string, e.g. 'AU_NEW_TO_IN_PRT' → 'AU'."""
    return route_id.split("_")[0].upper() if route_id else ""


def _alternate_routes_for_origin(
    region: str,
    current_route_id: str,
    all_routes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Returns up to 3 alternate routes the vessel could pick up after discharge,
    excluding the route it just completed.  Priority:
      1. Short-haul from same region (quick turn).
      2. Triangulation to a different origin region.
    """
    same_region = []
    triangle = []
    for r in all_routes:
        rid = r.get("route_id", "")
        if rid == current_route_id:
            continue
        r_region = _origin_region(rid)
        if r_region == region:
            same_region.append(r)
        else:
            triangle.append(r)

    # Prefer shorter distances first
    same_region.sort(key=lambda r: r.get("distance_nautical_miles", 9999))
    triangle.sort(key=lambda r: r.get("distance_nautical_miles", 9999))

    return (same_region[:2] + triangle[:1]) or triangle[:3]


class MarketTimingEngine:
    """Evaluates market trajectory to deliver actionable procurement decisions.

    PS Module C — covers:
      • Spot vs Term/COA entry timing with forward curve analysis.
      • Spot-to-voyage-contract consolidation KPI tracking.
      • Idle vessel repositioning with quantified alternate-employment savings.
    """

    def evaluate_strategy(
        self,
        current_spot_rate: float,
        forecast_rates: list[float],
        target_volume_mt: float,
        route_id: str = "",
        recommendation_history: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        Determines whether procurement should enter spot market now, lock in a multi-voyage
        term contract, or wait for an upcoming market dip.

        Args:
            current_spot_rate:      Live spot freight rate ($/MT).
            forecast_rates:         Ordered weekly forward-rate predictions ($/MT).
            target_volume_mt:       Cargo parcel size (MT) for savings computation.
            route_id:               Trade corridor identifier (e.g. 'RU_TAM_TO_IN_VTZ').
                                    Used to derive context-aware idle repositioning options.
            recommendation_history: Optional list of past recommended_action strings for
                                    computing the spot-to-contract consolidation KPI.

        Returns:
            Dict with strategy signal, cost savings, idle guidance, and consolidation KPI.
        """
        if not forecast_rates:
            return {"action": "ENTER_NOW_SPOT", "confidence_pct": 50.0}

        if current_spot_rate <= 0:
            current_spot_rate = float(forecast_rates[0]) if forecast_rates else 20.0

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
            unit = "WEEK" if min_index == 1 else "WEEKS"
            unit_display = "Week" if min_index == 1 else "Weeks"
            action = f"WAIT_{min_index}_{unit}"
            headline = f"Market Softening: Defer Booking by {min_index} {unit_display}"
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

        # ── Spot-to-Contract Consolidation KPI ─────────────────────────────────
        # PS Objective: "moving from multiple single spot contracts to short/medium term
        # multiple voyage contracts."  Track what % of past decisions were term/COA.
        consolidation_pct = self._compute_consolidation_pct(
            current_action=action,
            history=recommendation_history or [],
        )

        # ── Idle Scenario Guidance ──────────────────────────────────────────────
        idle_guidance = self._get_idle_scenario_repositioning(
            current_rate=current_spot_rate,
            future_rate=float(avg_mid_term),
            route_id=route_id,
            target_volume_mt=target_volume_mt,
            forecast_rates=forecast_rates,
        )

        conf_val = float(round(confidence, 1))
        return {
            "action": action,
            "recommended_action": action,
            "headline": headline,
            "detailed_strategy": strategy_recommendation,
            "strategy_recommendation": strategy_recommendation,
            "confidence_pct": conf_val,
            "confidence_score_pct": conf_val,
            "current_spot_usd_per_mt": float(round(current_spot_rate, 2)),
            "projected_4w_avg_usd_per_mt": float(round(avg_short_term, 2)),
            "projected_12w_avg_usd_per_mt": float(round(avg_mid_term, 2)),
            "term_contract_estimated_rate_usd_per_mt": float(round(contract_rate_est, 2)),
            "estimated_cost_savings_usd": float(round(estimated_cost_savings_usd, 0)),
            # PS KPI: spot-to-multi-voyage-contract consolidation
            "spot_to_contract_consolidation_pct": consolidation_pct,
            # PS idle-time mitigation guidance
            "idle_scenario_guidance": idle_guidance,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Spot-to-Contract Consolidation KPI
    # ──────────────────────────────────────────────────────────────────────────

    def _compute_consolidation_pct(
        self,
        current_action: str,
        history: list[str],
    ) -> float | None:
        """
        Computes the % of cargo decisions (including current) that were routed to
        term/COA contracts vs remaining on single spot fixtures.

        PS language: "moving from multiple single spot contracts to short term /
        medium term multiple voyage contracts."

        Returns None when no history exists (first call in a session).
        Returns a float 0.0–100.0 otherwise.
        """
        all_actions = list(history) + [current_action]
        if len(all_actions) <= 1:
            # Single call — not enough history for a meaningful rolling KPI
            return None

        term_count = sum(
            1 for a in all_actions
            if "TERM_CONTRACT" in str(a).upper() or "COA" in str(a).upper()
        )
        return round((term_count / len(all_actions)) * 100.0, 1)

    # ──────────────────────────────────────────────────────────────────────────
    # Idle Scenario Repositioning (PS: minimising vessel idle time)
    # ──────────────────────────────────────────────────────────────────────────

    def _get_idle_scenario_repositioning(
        self,
        current_rate: float,
        future_rate: float,
        route_id: str = "",
        target_volume_mt: float = 75_000.0,
        forecast_rates: list[float] | None = None,
    ) -> dict[str, Any]:
        """
        Provides idle vessel mitigation suggestions with real alternate routes and
        quantified $ savings vs straight ballast return.

        PS: "Propose strategies for minimising vessel idle time by forecasting periods
        of low demand and suggesting alternative employment opportunities or optimised
        positioning to reduce deadheading."

        Risk classification:
          High   — future market drops >10% below current (severe demand lull expected)
          Medium — future market drops 5–10% below current
          Low    — market stable or improving

        Savings calculation:
          idle_days_avoided = ballast_days(alternate) vs full ballast return to origin
          savings_usd       = idle_days_avoided × _PANAMAX_DAILY_COST_USD
        """
        all_routes = _load_routes_master()
        region = _origin_region(route_id)

        # Determine idle risk level from forward curve
        rate_delta_pct = ((future_rate - current_rate) / max(current_rate, 1.0)) * 100.0
        if rate_delta_pct < -10.0:
            idle_risk = "High"
            idle_days_estimate = self._estimate_idle_days(route_id, all_routes, high=True)
        elif rate_delta_pct < -5.0:
            idle_risk = "Medium"
            idle_days_estimate = self._estimate_idle_days(route_id, all_routes, high=False)
        else:
            idle_risk = "Low"
            idle_days_estimate = max(1.0, self._estimate_idle_days(route_id, all_routes, high=False) * 0.4)

        # Derive alternate employment options from routes master
        alternates_raw = _alternate_routes_for_origin(region, route_id, all_routes)
        alternate_employment: list[dict[str, Any]] = []

        for alt in alternates_raw:
            ballast_days = float(alt.get("typical_sailing_days_ballast", 7.0))
            # Idle days avoided = difference between ballast return and picking up this cargo
            idle_days_avoided = max(0.5, idle_days_estimate - ballast_days * 0.3)
            savings = round(idle_days_avoided * _PANAMAX_DAILY_COST_USD, 0)

            origin_name = alt.get("origin_name", alt.get("origin_port", ""))
            dest_name = alt.get("destination_name", alt.get("destination_port", ""))
            cargo = alt.get("primary_cargo", "Bulk cargo")
            dist = alt.get("distance_nautical_miles", 0)

            alternate_employment.append({
                "route_id": alt.get("route_id", ""),
                "description": (
                    f"{origin_name} → {dest_name}: {cargo} "
                    f"({dist:,} NM, ~{ballast_days:.1f} ballast days)"
                ),
                "cargo": cargo,
                "distance_nm": dist,
                "estimated_idle_days_avoided": round(idle_days_avoided, 1),
                "estimated_savings_usd": int(savings),
                "typical_vessel_classes": alt.get("typical_vessel_classes", []),
            })

        # Fallback when routes master is unavailable
        if not alternate_employment:
            alternate_employment = [
                {
                    "route_id": "ID_KLT_TO_IN_PRT",
                    "description": "South Kalimantan → Paradip: Thermal Coal (2,180 NM, ~6.8 ballast days)",
                    "cargo": "Thermal Coal",
                    "distance_nm": 2180,
                    "estimated_idle_days_avoided": round(idle_days_estimate * 0.6, 1),
                    "estimated_savings_usd": int(idle_days_estimate * 0.6 * _PANAMAX_DAILY_COST_USD),
                    "typical_vessel_classes": ["Supramax", "Ultramax", "Panamax"],
                }
            ]

        # Total savings vs straight ballast return
        savings_vs_ballast = int(idle_days_estimate * _PANAMAX_DAILY_COST_USD)

        # Suggested action label
        if idle_risk == "High":
            suggested_action = "Triangulate / Backhaul — Avoid Deadhead Ballast Return"
        elif idle_risk == "Medium":
            suggested_action = "Scout Short-Haul Fixture or Coastal Repositioning"
        else:
            suggested_action = "Standard Direct Ballast Return (Market Healthy)"

        return {
            "idle_risk_level": idle_risk,                        # Low / Medium / High
            "idle_days_estimate": round(idle_days_estimate, 1),  # Numeric days figure
            "savings_vs_ballast_usd": savings_vs_ballast,        # $ saved vs full ballast
            "suggested_action": suggested_action,
            "alternate_employment": alternate_employment,
            # Legacy flat keys retained for backwards compatibility
            "rate_outlook_pct_change": round(rate_delta_pct, 1),
        }

    def _estimate_idle_days(
        self,
        route_id: str,
        all_routes: list[dict[str, Any]],
        high: bool = False,
    ) -> float:
        """
        Estimates idle/ballast days for the given route from the master data.
        Falls back to a sensible default if route is not found.
        """
        for r in all_routes:
            if r.get("route_id") == route_id:
                ballast = float(r.get("typical_sailing_days_ballast", 10.0))
                port_wait = 2.5 if high else 1.5  # Added port queue days during demand lulls
                return ballast + port_wait
        # Default: mid-haul route assumption
        return 12.0 if high else 8.0
