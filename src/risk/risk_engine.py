"""
Risk & Disruption Early Warning Engine (Module D).
Combines real-time / modeled AIS port congestion, marine weather from Open-Meteo,
and freight market volatility into a unified risk dashboard.
"""

from typing import Dict, Any, List
from src.data.openmeteo_client import OpenMeteoMarineClient
from src.data.aisstream_client import AISPortCongestionTracker


class RiskAndDisruptionEngine:
    """Computes integrated operational and market risk alerts for trade corridors."""

    def __init__(self):
        self.weather_client = OpenMeteoMarineClient()
        self.ais_tracker = AISPortCongestionTracker()

    def evaluate_corridor_risk(
        self,
        origin_port_id: str,
        dest_port_id: str,
        dest_lat: float,
        dest_lon: float,
        historical_freight_volatility_pct: float = 8.5
    ) -> Dict[str, Any]:
        """
        Computes composite risk metrics across port congestion, marine weather, and market volatility.
        """
        # 1. Port Congestion
        origin_cong = self.ais_tracker.get_port_congestion_estimate(origin_port_id)
        dest_cong = self.ais_tracker.get_port_congestion_estimate(dest_port_id)

        # 2. Real-time Marine Weather
        weather = self.weather_client.get_sea_state(dest_lat, dest_lon)
        weather_risk_val = weather.get("sea_condition_risk_score", 0.2)

        # 3. Market Volatility Risk (Scale 0 to 1)
        market_risk_val = min(1.0, historical_freight_volatility_pct / 20.0)

        # Composite Risk Index (0 - 100)
        composite_score = (
            0.40 * dest_cong["congestion_index"] +
            0.20 * origin_cong["congestion_index"] +
            0.25 * (weather_risk_val * 100.0) +
            0.15 * (market_risk_val * 100.0)
        )

        alerts = []
        if dest_cong["congestion_index"] >= 60:
            alerts.append({
                "severity": "WARNING",
                "category": "Port Congestion",
                "message": f"High berth queue at destination ({dest_cong['anchored_vessels_count']} vessels anchored, ~{dest_cong['estimated_waiting_days']} days waiting)."
            })
        if weather_risk_val >= 0.5:
            alerts.append({
                "severity": "CRITICAL",
                "category": "Marine Weather",
                "message": f"Severe sea state in Bay of Bengal (wave height {weather['wave_height_m']}m). Voyage delays likely."
            })
        if market_risk_val >= 0.6:
            alerts.append({
                "severity": "INFO",
                "category": "Market Volatility",
                "message": "High freight rate volatility observed over last 30 days. Recommend fixed term rates."
            })

        if not alerts:
            alerts.append({
                "severity": "SUCCESS",
                "category": "Normal Operations",
                "message": "Corridor operating within normal parameters. No major disruptions detected."
            })

        return {
            "composite_risk_score": round(composite_score, 1),
            "risk_level": "High" if composite_score >= 60 else ("Medium" if composite_score >= 35 else "Low"),
            "origin_port_congestion": origin_cong,
            "destination_port_congestion": dest_cong,
            "marine_weather_conditions": weather,
            "active_alerts": alerts
        }
