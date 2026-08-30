"""
Federal Reserve Economic Data (FRED) API Client for SIH26006.
Fetches real-time and historical series for:
- DEXINUS: U.S. Dollars to Indian Rupee Spot Exchange Rate
- DCOILBRENTEU: Crude Oil Prices: Brent - Europe ($/Barrel)
- DCOILWTICO: Crude Oil Prices: WTI ($/Barrel)
- PCOALAUUSDM: Coal, Australia (Newcastle Benchmark) ($/MT)
- PIORECRUSDM: Iron Ore 62% Fe (CFR China) ($/MT)
- WPU057303: Marine Bunker Fuel PPI
"""

import os
import time
import requests
import pandas as pd
import concurrent.futures
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()


class FREDClient:
    """Client for pulling macroeconomic and FX time-series from St. Louis FRED."""

    BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

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

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("FRED_API_KEY")
        if not self.api_key:
            raise ValueError("FRED_API_KEY is not set in environment or constructor.")
        self._series_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = 300  # 5 minutes cache

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
        cache_key = f"{series_id}_{observation_start}_{observation_end}"
        now = time.time()
        if cache_key in self._series_cache:
            entry = self._series_cache[cache_key]
            if (now - entry["timestamp"]) < self._cache_ttl:
                return entry["df"].copy()

        params = {
            "series_id": series_id,
            "api_key": self.api_key,
            "file_type": "json"
        }
        if observation_start:
            params["observation_start"] = observation_start
        if observation_end:
            params["observation_end"] = observation_end

        try:
            response = requests.get(self.BASE_URL, params=params, timeout=5)
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            print(f"FRED API Error for {series_id}: {e}")
            return pd.DataFrame()

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
            self._series_cache[cache_key] = {"timestamp": now, "df": df}
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

    def fetch_all_maritime_macro_series(
        self,
        start_date: str = "2018-01-01"
    ) -> pd.DataFrame:
        """
        Concurrently fetches and merges all key maritime, commodity, fuel, and FX series
        into a single unified weekly/monthly DataFrame using a thread pool.
        """
        dfs = []

        def _fetch_single(feature_name: str, s_id: str):
            try:
                df = self.fetch_series(s_id, observation_start=start_date)
                if not df.empty:
                    df = df.rename(columns={s_id.lower(): feature_name})
                    df["date"] = pd.to_datetime(df["date"])
                    return df
            except Exception as e:
                print(f"Warning: Failed to fetch {s_id} ({feature_name}): {e}")
            return None

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            futures = [executor.submit(_fetch_single, fname, sid) for fname, sid in self.SERIES_CATALOG.items()]
            for future in concurrent.futures.as_completed(futures):
                res_df = future.result()
                if res_df is not None and not res_df.empty:
                    dfs.append(res_df)

        if not dfs:
            return pd.DataFrame()

        # Merge on date with outer join, then forward/backward fill
        unified = dfs[0]
        for next_df in dfs[1:]:
            unified = pd.merge(unified, next_df, on="date", how="outer")

        unified = unified.sort_values("date").ffill().bfill()
        return unified

    def get_latest_market_snapshot(self) -> Dict[str, Any]:
        """Concurrently fetches the latest values across all key maritime and energy indicators."""
        snapshot = {}

        def _fetch_snapshot_item(feature_name: str, s_id: str):
            try:
                df = self.fetch_series(s_id)
                if not df.empty:
                    latest = df.iloc[-1]
                    return feature_name, {
                        "date": latest["date"].strftime("%Y-%m-%d"),
                        "value": float(latest[s_id.lower()])
                    }
            except Exception:
                pass
            return feature_name, None

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            futures = [executor.submit(_fetch_snapshot_item, fname, sid) for fname, sid in self.SERIES_CATALOG.items()]
            for future in concurrent.futures.as_completed(futures):
                fname, data = future.result()
                if data:
                    snapshot[fname] = data

        return snapshot


if __name__ == "__main__":
    client = FREDClient()
    snapshot = client.get_latest_market_snapshot()
    print("\n=== FRED LIVE MARITIME & COMMODITY SNAPSHOT ===")
    for k, v in snapshot.items():
        print(f"  • {k:<30}: {v['value']} (as of {v['date']})")
