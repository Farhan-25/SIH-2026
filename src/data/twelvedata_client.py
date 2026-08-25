"""
TwelveData API Client.
Fetches real-time and historical FX rates (USD/INR, USD/AUD) and energy/macro data.
"""

import os
import logging
from typing import Dict, Any, Optional
import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

TWELVEDATA_BASE_URL = "https://api.twelvedata.com"


class TwelveDataClient:
    """Client for fetching financial and FX time-series from TwelveData."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("TWELVEDATA_API_KEY", "")

    def get_exchange_rate(self, symbol: str = "USD/INR") -> Dict[str, Any]:
        """
        Fetch latest exchange rate for currency pair (e.g. 'USD/INR' or 'USD/AUD').
        """
        if not self.api_key:
            return self._fallback_fx(symbol)

        url = f"{TWELVEDATA_BASE_URL}/price"
        params = {
            "symbol": symbol,
            "apikey": self.api_key
        }

        try:
            response = requests.get(url, params=params, timeout=8)
            response.raise_for_status()
            data = response.json()

            if "price" in data:
                return {
                    "status": "success",
                    "symbol": symbol,
                    "price": float(data["price"]),
                    "source": "twelvedata"
                }
            else:
                logger.warning(f"TwelveData returned non-price response: {data}")
                return self._fallback_fx(symbol)
        except Exception as e:
            logger.warning(f"Failed to fetch {symbol} from TwelveData: {e}. Using fallback.")
            return self._fallback_fx(symbol)

    def get_brent_crude_proxy(self) -> Dict[str, Any]:
        """
        Fetch Brent crude / WTI oil proxy for bunker fuel calibration.
        """
        # Try fetching Brent symbol
        return self.get_exchange_rate(symbol="BRENT")

    def _fallback_fx(self, symbol: str) -> Dict[str, Any]:
        fallbacks = {
            "USD/INR": 83.50,
            "USD/AUD": 1.54,
            "BRENT": 82.40
        }
        return {
            "status": "fallback",
            "symbol": symbol,
            "price": fallbacks.get(symbol, 83.50),
            "source": "cached_benchmark"
        }
