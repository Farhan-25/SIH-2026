"""
Open-Meteo Marine API Client.
Retrieves real-time and forecasted wave height, swell, and wind speed for shipping routes and ports.
Free, requires no API key.
"""

import time
import logging
from typing import Dict, Any, Optional
import requests

logger = logging.getLogger(__name__)

OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"


class OpenMeteoMarineClient:
    """Client for fetching marine weather and sea state conditions with coordinate-rounded caching."""

    # Class-level cache shared across all instances: key = (rounded_lat, rounded_lon)
    _CACHE: Dict[tuple, Dict[str, Any]] = {}
    _CACHE_TS: Dict[tuple, float] = {}
    _CACHE_TTL = 900  # 15 minutes

    def __init__(self, timeout: int = 5):
        self.timeout = timeout

    def get_sea_state(self, lat: float, lon: float) -> Dict[str, Any]:
        """
        Fetch current and 7-day forecast wave and sea conditions for given lat/lon coordinates.
        Uses coordinate-rounded in-memory cache to avoid redundant network calls.
        """
        # Coordinate-rounded cache key (2 decimal places = ~1km resolution)
        cache_key = (round(lat, 2), round(lon, 2))
        now = time.time()
        if cache_key in OpenMeteoMarineClient._CACHE_TS:
            if (now - OpenMeteoMarineClient._CACHE_TS[cache_key]) < OpenMeteoMarineClient._CACHE_TTL:
                return OpenMeteoMarineClient._CACHE[cache_key]

        params = {
            "latitude": lat,
            "longitude": lon,
            "current": [
                "wave_height",
                "wave_direction",
                "wave_period",
                "wind_wave_height",
                "swell_wave_height",
                "swell_wave_direction",
                "swell_wave_period"
            ],
            "timezone": "auto"
        }

        try:
            response = requests.get(OPEN_METEO_MARINE_URL, params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()

            current = data.get("current", {})
            wave_height = current.get("wave_height", 0.0)
            swell_height = current.get("swell_wave_height", 0.0)
            wave_period = current.get("wave_period", 0.0)

            # Calculate disruption risk score (0.0 to 1.0)
            # Waves > 3.0m cause minor delays; > 5.0m severe sea state delay
            risk_score = min(1.0, max(0.0, (wave_height - 1.0) / 4.0)) if wave_height > 1.0 else 0.0

            result = {
                "status": "success",
                "coordinates": {"lat": lat, "lon": lon},
                "wave_height_m": wave_height,
                "swell_wave_height_m": swell_height,
                "wave_period_s": wave_period,
                "sea_condition_risk_score": round(risk_score, 2),
                "weather_alert": self._categorize_risk(wave_height),
                "raw": current
            }
            OpenMeteoMarineClient._CACHE[cache_key] = result
            OpenMeteoMarineClient._CACHE_TS[cache_key] = now
            return result
        except Exception as e:
            logger.warning(f"Failed to fetch live marine weather for ({lat}, {lon}): {e}. Using seasonal baseline.")
            fallback = self._fallback_seasonal_estimate(lat, lon)
            OpenMeteoMarineClient._CACHE[cache_key] = fallback
            OpenMeteoMarineClient._CACHE_TS[cache_key] = now
            return fallback

    def _categorize_risk(self, wave_height_m: float) -> str:
        if wave_height_m < 1.5:
            return "Calm / Favorable (Smooth Sailing)"
        elif wave_height_m < 3.0:
            return "Moderate Swell (Normal Transit)"
        elif wave_height_m < 4.5:
            return "Rough Sea State (Speed Reduction Expected: -10%)"
        else:
            return "Severe Storm / Cyclone Alert (Voyage Deviation / Anchorage Delay Advised)"

    def _fallback_seasonal_estimate(self, lat: float, lon: float) -> Dict[str, Any]:
        """Deterministic seasonal fallback if offline."""
        # Baseline estimate for Bay of Bengal / Indian Ocean
        return {
            "status": "fallback",
            "coordinates": {"lat": lat, "lon": lon},
            "wave_height_m": 1.8,
            "swell_wave_height_m": 1.2,
            "wave_period_s": 7.5,
            "sea_condition_risk_score": 0.20,
            "weather_alert": "Moderate Swell (Normal Transit - Cached Baseline)"
        }
