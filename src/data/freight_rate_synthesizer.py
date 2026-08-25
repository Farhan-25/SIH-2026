"""
Unified Freight Rate Dataset Generator & Database Builder.
Calibrates Baltic indices (BCI, BPI, BSI, BHSI) with route nautical miles, bunker fuel prices,
and port congestion into route-level $/tonne and $/day freight time-series.
"""

import os
import json
import sqlite3
import pandas as pd
import numpy as np
from src.data.worldbank_pinksheet import CommodityPriceTracker


def build_unified_freight_dataset(
    ports_path: str = "data/reference/ports_master.json",
    vessels_path: str = "data/reference/vessels_master.json",
    routes_path: str = "data/reference/routes_master.json",
    output_csv: str = "data/processed/unified_freight_timeseries.csv",
    output_db: str = "data/processed/freight_data.db",
    start_date: str = "2020-01-01",
    end_date: str = "2026-08-01"
) -> pd.DataFrame:
    """
    Constructs an end-to-end multi-route, multi-vessel-class dry bulk dataset.
    """
    os.makedirs(os.path.dirname(output_csv), exist_ok=True)

    with open(ports_path, "r") as f:
        ports_data = json.load(f)
    with open(vessels_path, "r") as f:
        vessels_data = json.load(f)["vessel_classes"]
    with open(routes_path, "r") as f:
        routes_data = json.load(f)["trade_routes"]

    tracker = CommodityPriceTracker()
    macro_df = tracker.generate_historical_commodity_series(start_date=start_date, end_date=end_date)

    date_series = macro_df["date"]
    n = len(date_series)
    np.random.seed(101)

    records = []

    for route in routes_data:
        route_id = route["route_id"]
        origin = route["origin_port"]
        dest = route["destination_port"]
        dist_nm = route["distance_nautical_miles"]
        cargo = route["primary_cargo"]
        allowed_vessels = route["typical_vessel_classes"]

        for vclass in allowed_vessels:
            if vclass not in vessels_data:
                continue

            v_spec = vessels_data[vclass]
            capacity = v_spec["typical_capacity_mt"]
            speed = v_spec["laden_speed_knots"]
            sea_fuel_tpd = v_spec["fuel_consumption_sea_vlsfo_tpd"]
            daily_opex = v_spec["daily_opex_usd"]
            proxy_index = v_spec["baltic_index_proxy"]

            # Sailing days one way
            sailing_days = dist_nm / (speed * 24.0)
            round_trip_days = sailing_days * 2.1  # Including ballast & canal/straits

            # Port turnaround days (loading + discharge + wait)
            port_days = 6.0

            total_voyage_days = round_trip_days + port_days

            for i, row in macro_df.iterrows():
                dt = row["date"]
                month = dt.month
                # Monsoon seasonality (June-Sept Bay of Bengal premium)
                monsoon_factor = 1.12 if month in [6, 7, 8, 9] else 1.0
                # Chinese New Year dip (Jan-Feb)
                cny_factor = 0.90 if month in [1, 2] else 1.0

                vlsfo = row["vlsfo_bunker_singapore_usd_per_t"]
                coal_price = row["coal_newcastle_usd_per_t"]

                # Base TCE (Time Charter Equivalent) market rate ($/day)
                index_base = {
                    "Capesize": 18000 + 12000 * (coal_price / 140.0) + np.random.normal(0, 1500),
                    "Panamax": 14000 + 8000 * (coal_price / 140.0) + np.random.normal(0, 1000),
                    "Kamsarmax": 15000 + 8500 * (coal_price / 140.0) + np.random.normal(0, 1100),
                    "Supramax": 12500 + 6500 * (coal_price / 140.0) + np.random.normal(0, 900),
                    "Ultramax": 13500 + 7000 * (coal_price / 140.0) + np.random.normal(0, 950),
                    "Handysize": 10500 + 4500 * (coal_price / 140.0) + np.random.normal(0, 700),
                    "Newcastlemax": 22000 + 14000 * (coal_price / 140.0) + np.random.normal(0, 1800)
                }.get(vclass, 14000)

                tce_per_day = max(6000.0, index_base * monsoon_factor * cny_factor)

                # Total Voyage Cost calculation:
                bunker_cost = (sea_fuel_tpd * sailing_days * 2.0) * vlsfo
                port_dues = 0.45 * (capacity * 0.6) + 25000  # Estimate
                charter_cost = total_voyage_days * tce_per_day

                total_voyage_cost = bunker_cost + port_dues + charter_cost
                freight_usd_per_tonne = total_voyage_cost / capacity

                # Port congestion index estimate
                congestion_idx = np.random.uniform(30.0, 75.0)

                records.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "route_id": route_id,
                    "origin_port": origin,
                    "destination_port": dest,
                    "vessel_class": vclass,
                    "cargo_type": cargo,
                    "distance_nm": dist_nm,
                    "sailing_days_one_way": round(sailing_days, 1),
                    "freight_rate_usd_per_mt": round(freight_usd_per_tonne, 2),
                    "tce_rate_usd_per_day": round(tce_per_day, 0),
                    "vlsfo_bunker_price": row["vlsfo_bunker_singapore_usd_per_t"],
                    "coal_benchmark_price": row["coal_newcastle_usd_per_t"],
                    "coking_coal_price": row["coal_coking_aus_usd_per_t"],
                    "iron_ore_price": row["iron_ore_62pct_usd_per_t"],
                    "usd_inr_fx": row["usd_inr_fx"],
                    "congestion_index": round(congestion_idx, 1),
                    "monsoon_flag": 1 if month in [6, 7, 8, 9] else 0,
                    "month": month,
                    "quarter": dt.quarter,
                    "year": dt.year
                })

    df = pd.DataFrame(records)
    df.to_csv(output_csv, index=False)

    # Save into SQLite Database
    conn = sqlite3.connect(output_db)
    df.to_sql("freight_rates_historical", conn, if_exists="replace", index=False)
    conn.close()

    return df


if __name__ == "__main__":
    df = build_unified_freight_dataset()
    print(f"Generated {len(df)} records across all routes and vessel types.")
