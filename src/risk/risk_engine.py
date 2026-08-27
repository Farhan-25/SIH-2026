"""
Risk & Disruption Early Warning Engine (Module D).
Combines real-time / modeled AIS port congestion, marine weather from Open-Meteo,
and freight market volatility into a unified risk dashboard.

Data Sources:
  - GFW (Global Fishing Watch) — live vessel positions & derived congestion
  - AIS (AISStream) — port congestion benchmarks & live anchorage counts
  - Open-Meteo Marine API — wave height, swell, sea condition risk
"""

from typing import Dict, Any, List
from src.data.openmeteo_client import OpenMeteoMarineClient
from src.data.gfw_client import GFWClient
from src.data.aisstream_client import AISPortCongestionTracker


class RiskAndDisruptionEngine:
    """Computes integrated operational and market risk alerts for trade corridors."""

    def __init__(self):
        self.weather_client = OpenMeteoMarineClient()
        self.gfw_client = GFWClient()
        self.ais_tracker = AISPortCongestionTracker()

    def get_blended_port_congestion(self, port_id: str, port_name: str = "") -> Dict[str, Any]:
        """
        Blends GFW live congestion with AIS benchmark data for a more robust estimate.
        GFW provides real-time vessel-derived congestion, AIS provides calibrated benchmarks.
        Weighted: 60% GFW live + 40% AIS benchmark.
        """
        gfw_cong = self.gfw_client.get_port_congestion(port_name or port_id)
        ais_cong = self.ais_tracker.get_port_congestion_estimate(port_id)

        # Blend congestion indices
        gfw_idx = gfw_cong.get("congestion_index", 0)
        ais_idx = ais_cong.get("congestion_index", 0)
        blended_index = round(0.6 * gfw_idx + 0.4 * ais_idx, 1)

        # Blend vessel counts
        gfw_anchored = gfw_cong.get("anchored_vessels_count", 0)
        ais_anchored = ais_cong.get("anchored_vessels_count", 0)
        blended_anchored = max(gfw_anchored, ais_anchored)  # Use the higher estimate

        # Blend wait days
        gfw_wait = gfw_cong.get("estimated_waiting_days", 0)
        ais_wait = ais_cong.get("estimated_waiting_days", 0)
        blended_wait = round(0.5 * gfw_wait + 0.5 * ais_wait, 1) if gfw_wait > 0 else ais_wait

        # Categorize
        if blended_index < 35:
            status = "Low Congestion"
        elif blended_index < 65:
            status = "Moderate Congestion"
        else:
            status = "High Congestion / Demurrage Risk"

        return {
            "port_id": port_id,
            "anchored_vessels_count": blended_anchored,
            "estimated_waiting_days": blended_wait,
            "congestion_index": blended_index,
            "congestion_status": status,
            "data_sources": {
                "gfw_live": {"congestion_index": gfw_idx, "anchored": gfw_anchored, "wait_days": gfw_wait},
                "ais_benchmark": {"congestion_index": ais_idx, "anchored": ais_anchored, "wait_days": ais_wait},
            }
        }

    def evaluate_corridor_risk(
        self,
        origin_port_id: str,
        dest_port_id: str,
        dest_lat: float,
        dest_lon: float,
        origin_port_name: str = "",
        dest_port_name: str = "",
        historical_freight_volatility_pct: float = 8.5
    ) -> Dict[str, Any]:
        """
        Computes composite risk metrics across port congestion, marine weather, and market volatility.
        Uses blended GFW + AIS data for port congestion.
        """
        # 1. Port Congestion (blended GFW + AIS)
        origin_cong = self.get_blended_port_congestion(origin_port_id, origin_port_name)
        dest_cong = self.get_blended_port_congestion(dest_port_id, dest_port_name)

        # 2. Real-time Marine Weather from Open-Meteo
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
                "message": f"Severe sea state near destination (wave height {weather['wave_height_m']}m). Voyage delays likely."
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
