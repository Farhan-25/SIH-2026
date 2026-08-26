"""
Federal Reserve Economic Data (FRED) API Client for SIH26006.
Fetches real-time and historical series for:
- DEXINUS: U.S. Dollars to Indian Rupee Spot Exchange Rate
- DCOILBRENTEU: Crude Oil Prices: Brent - Europe ($/Barrel)
- DCOILWTICO: Crude Oil Prices: WTI ($/Barrel)
"""

import os
import requests
import pandas as pd
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()


class FREDClient:
    """Client for pulling macroeconomic and FX time-series from St. Louis FRED."""

    BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("FRED_API_KEY")
        if not self.api_key:
            raise ValueError("FRED_API_KEY is not set in environment or constructor.")

    def fetch_series(
        self,
        series_id: str = "DEXINUS",
        observation_start: Optional[str] = None,
        observation_end: Optional[str] = None
    ) -> pd.DataFrame:
        """
        Fetches time-series data for a given FRED series ID.
        Returns a cleaned DataFrame with columns: ['date', series_id.lower()].
        """
        params = {
            "series_id": series_id,
            "api_key": self.api_key,
            "file_type": "json"
        }
        if observation_start:
            params["observation_start"] = observation_start
        if observation_end:
            params["observation_end"] = observation_end

        response = requests.get(self.BASE_URL, params=params, timeout=15)
        response.raise_for_status()

        data = response.json()
        observations = data.get("observations", [])

        records = []
        for obs in observations:
            date_str = obs.get("date")
            val_str = obs.get("value")
            try:
                val = float(val_str)
                records.append({"date": date_str, series_id.lower(): val})
            except (ValueError, TypeError):
                # Handles missing/holiday observations (denoted as '.')
                continue

        df = pd.DataFrame(records)
        if not df.empty:
            df["date"] = pd.to_datetime(df["date"])
        return df

    def get_latest_usd_inr(self) -> Dict[str, Any]:
        """Fetches the latest available USD/INR spot exchange rate."""
        df = self.fetch_series(series_id="DEXINUS")
        if df.empty:
            return {"date": None, "rate": None}
        latest = df.iloc[-1]
        return {
            "date": latest["date"].strftime("%Y-%m-%d"),
            "usd_inr_rate": float(latest["dexinus"])
        }

    # --- Core Maritime & Commodity Indicators ---
    SERIES_CATALOG = {
        "coal_australia_usd_per_mt": "PCOALAUUSDM",
        "iron_ore_usd_per_mt": "PIORECRUSDM",
        "deep_sea_freight_ppi": "PCU483111483111",
        "marine_bunker_fuel_ppi": "WPU057303",
        "brent_crude_usd_per_bbl": "DCOILBRENTEU",
        "wti_crude_usd_per_bbl": "DCOILWTICO",
        "usd_inr_fx_rate": "DEXINUS",
        "usd_aud_fx_rate": "DEXUSAL",
        "usd_cny_fx_rate": "DEXCHUS",
        "global_industrial_production": "INDPRO"
    }

    def fetch_all_maritime_macro_series(
        self,
        start_date: str = "2018-01-01"
    ) -> pd.DataFrame:
        """
        Fetches and merges all key maritime, commodity, fuel, and FX series
        into a single unified weekly/monthly DataFrame.
        """
        dfs = []
        for feature_name, series_id in self.SERIES_CATALOG.items():
            try:
                df = self.fetch_series(series_id, observation_start=start_date)
                if not df.empty:
                    df = df.rename(columns={series_id.lower(): feature_name})
                    df["date"] = pd.to_datetime(df["date"])
                    dfs.append(df)
            except Exception as e:
                print(f"Warning: Failed to fetch {series_id} ({feature_name}): {e}")

        if not dfs:
            return pd.DataFrame()

        # Merge on date with outer join, then forward fill
        unified = dfs[0]
        for next_df in dfs[1:]:
            unified = pd.merge(unified, next_df, on="date", how="outer")

        unified = unified.sort_values("date").ffill().bfill()
        return unified

    def get_latest_market_snapshot(self) -> Dict[str, Any]:
        """Fetches the latest values across all key maritime and energy indicators."""
        snapshot = {}
        for feature_name, series_id in self.SERIES_CATALOG.items():
            try:
                df = self.fetch_series(series_id)
                if not df.empty:
                    latest = df.iloc[-1]
                    snapshot[feature_name] = {
                        "date": latest["date"].strftime("%Y-%m-%d"),
                        "value": float(latest[series_id.lower()])
                    }
            except Exception:
                continue
        return snapshot


if __name__ == "__main__":
    client = FREDClient()
    snapshot = client.get_latest_market_snapshot()
    print("\n=== FRED LIVE MARITIME & COMMODITY SNAPSHOT ===")
    for k, v in snapshot.items():
        print(f"  • {k:<30}: {v['value']} (as of {v['date']})")

