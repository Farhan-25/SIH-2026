"""
Feature Engineering Pipeline for Freight Forecasting Models.
Constructs lag features, rolling moving averages, rolling volatility,
monsoon seasonality indicators, and fuel-to-freight ratios.
"""

from typing import List, Tuple
import pandas as pd
import numpy as np


class FreightFeatureEngineer:
    """Extracts exogenous, autoregressive, and seasonal features from time-series."""

    def __init__(self, target_col: str = "freight_rate_usd_per_mt"):
        self.target_col = target_col

    def create_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Takes raw multi-route dataset and builds machine learning features per (route_id, vessel_class).
        """
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values(by=["route_id", "vessel_class", "date"]).reset_index(drop=True)

        # Normalize synthesizer / legacy column names
        aliases = {
            "vlsfo_bunker_price": ["vlsfo_bunker_price", "bunker_price_vlsfo_usd", "vlsfo_bunker_singapore_usd_per_t"],
            "coal_benchmark_price": ["coal_benchmark_price", "coal_price_newcastle_usd", "coal_newcastle_usd_per_t"],
            "iron_ore_price": ["iron_ore_price", "iron_ore_price_usd", "iron_ore_62pct_usd_per_t"],
            "coking_coal_price": ["coking_coal_price", "coking_coal_usd_per_t", "coal_price_newcastle_usd"],
            "sailing_days_one_way": ["sailing_days_one_way", "total_voyage_days"],
        }
        for canonical, candidates in aliases.items():
            if canonical in df.columns:
                continue
            for c in candidates:
                if c in df.columns:
                    df[canonical] = df[c]
                    break
            if canonical not in df.columns:
                df[canonical] = 0.0

        if "congestion_index" not in df.columns:
            if "port_turnaround_days" in df.columns:
                df["congestion_index"] = (df["port_turnaround_days"] * 12.0).clip(10, 100)
            else:
                df["congestion_index"] = 25.0

        if "monsoon_flag" not in df.columns:
            df["monsoon_flag"] = df["date"].dt.month.isin([6, 7, 8, 9]).astype(float)

        feature_dfs = []
        for (route, vclass), group in df.groupby(["route_id", "vessel_class"]):
            group = group.copy().sort_values("date")

            # Lags for target freight rate
            for lag in [1, 2, 4, 8, 12]:
                group[f"target_lag_{lag}"] = group[self.target_col].shift(lag)

            # Rolling statistics (4-week and 12-week moving avg & volatility)
            group["target_rolling_mean_4w"] = group[self.target_col].shift(1).rolling(window=4, min_periods=1).mean()
            group["target_rolling_std_4w"] = group[self.target_col].shift(1).rolling(window=4, min_periods=1).std().fillna(0)
            group["target_rolling_mean_12w"] = group[self.target_col].shift(1).rolling(window=12, min_periods=1).mean()

            # Bunker fuel lags and rolling ratio
            group["bunker_lag_1"] = group["vlsfo_bunker_price"].shift(1)
            group["bunker_rolling_4w"] = group["vlsfo_bunker_price"].shift(1).rolling(window=4, min_periods=1).mean()
            group["fuel_to_freight_ratio"] = group["vlsfo_bunker_price"] / (group[self.target_col] * group["distance_nm"] / 1000.0 + 1e-5)

            # Commodity prices lags
            group["coal_lag_1"] = group["coal_benchmark_price"].shift(1)
            group["iron_ore_lag_1"] = group["iron_ore_price"].shift(1)
            group["coking_coal_lag_1"] = group["coking_coal_price"].shift(1)

            # Calendar & Seasonal cyclical features
            group["month_sin"] = np.sin(2 * np.pi * group["date"].dt.month / 12.0)
            group["month_cos"] = np.cos(2 * np.pi * group["date"].dt.month / 12.0)
            group["quarter_sin"] = np.sin(2 * np.pi * group["date"].dt.quarter / 4.0)
            group["quarter_cos"] = np.cos(2 * np.pi * group["date"].dt.quarter / 4.0)

            feature_dfs.append(group)

        result_df = pd.concat(feature_dfs, ignore_index=True)
        # Fill remaining initial lag NaNs with backward fill or forward fill
        result_df = result_df.bfill().ffill()
        return result_df

    def get_feature_columns(self) -> List[str]:
        """Returns the list of training feature column names."""
        return [
            "target_lag_1", "target_lag_2", "target_lag_4", "target_lag_8", "target_lag_12",
            "target_rolling_mean_4w", "target_rolling_std_4w", "target_rolling_mean_12w",
            "bunker_lag_1", "bunker_rolling_4w", "fuel_to_freight_ratio",
            "coal_lag_1", "iron_ore_lag_1", "coking_coal_lag_1",
            "usd_inr_fx", "congestion_index", "monsoon_flag",
            "month_sin", "month_cos", "quarter_sin", "quarter_cos",
            "distance_nm", "sailing_days_one_way"
        ]
