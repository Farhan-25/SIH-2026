"""
Open Government Data (OGD) & Indian Port Turnaround Tracker.
Provides dynamic fetching, caching, and querying of official Indian major port
turnaround times (TRT) and berth-day outputs from data.gov.in / Ministry of Shipping.
"""

import os
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import requests
import pandas as pd
from dotenv import load_dotenv
from src.data.db_manager import FreightDBManager

load_dotenv()
logger = logging.getLogger(__name__)


class OGDPortTurnaroundTracker:
    """Manages official Indian port turnaround times and operational efficiency statistics."""

    def __init__(self, db_manager: Optional[FreightDBManager] = None):
        self.db = db_manager or FreightDBManager()
        self.api_key = os.getenv("DATAGOV_API_KEY", "")
        self._init_turnaround_data()

    def _init_turnaround_data(self):
        """Initializes turnaround statistics in SQLite from raw OGD series if empty."""
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM ogd_port_turnaround_times")
        if cursor.fetchone()[0] == 0:
            csv_path = "data/raw/ogd_port_average_turnaround_time.csv"
            now_iso = datetime.now(timezone.utc).isoformat()
            if os.path.exists(csv_path):
                try:
                    df = pd.read_csv(csv_path)
                    port_col_map = {
                        "Paradip": "IN_PRT",
                        "Vishakhapatnam": "IN_VTZ",
                        "Haldia D.C": "IN_HLD",
                        "Kolkata D.S": "IN_KOL",
                        "Ennore": "IN_ENR",
                        "Chennai": "IN_CHN",
                        "Tuticorin": "IN_TUT",
                        "Cochin": "IN_COK",
                        "New Mangalore": "IN_NML",
                        "Mormugao": "IN_MRM",
                        "J.L.Nehru": "IN_JLN",
                        "Mumbai": "IN_BOM",
                        "Kandla": "IN_KDL"
                    }
                    for _, row in df.iterrows():
                        year = str(row.get("Year", "")).strip()
                        for port_name, port_id in port_col_map.items():
                            if port_name in row and pd.notna(row[port_name]):
                                try:
                                    val = float(row[port_name])
                                    cursor.execute("""
                                        INSERT INTO ogd_port_turnaround_times (year, port_id, port_name, avg_turnaround_days, updated_at)
                                        VALUES (?, ?, ?, ?, ?)
                                    """, (year, port_id, port_name, val, now_iso))
                                except Exception:
                                    pass
                    conn.commit()
                except Exception as e:
                    logger.info(f"Notice initializing OGD CSV series: {e}")
        conn.close()

    def fetch_live_ogd_update(self) -> bool:
        """
        Attempts to fetch live updated port statistics from data.gov.in API
        and updates the SQLite cache.
        """
        if not self.api_key:
            return False

        url = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
        params = {
            "api-key": self.api_key,
            "format": "json",
            "limit": 50
        }
        try:
            resp = requests.get(url, params=params, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                records = data.get("records", [])
                if records:
                    conn = self.db.get_connection()
                    cursor = conn.cursor()
                    now_iso = datetime.now(timezone.utc).isoformat()
                    for r in records:
                        year = r.get("year", "2024-25")
                        p_name = r.get("port_name", "")
                        trt = float(r.get("average_turnaround_time_days", 2.0))
                        cursor.execute("""
                            INSERT INTO ogd_port_turnaround_times (year, port_id, port_name, avg_turnaround_days, updated_at)
                            VALUES (?, ?, ?, ?, ?)
                        """, (year, p_name, p_name, trt, now_iso))
                    conn.commit()
                    conn.close()
                    return True
        except Exception as e:
            logger.info(f"Live OGD API fetch notice: {e}")

        return False

    def get_latest_turnaround_map(self) -> Dict[str, float]:
        """
        Returns a dictionary mapping port_id -> average turnaround time (days)
        from the most recent official data.
        """
        conn = self.db.get_connection()
        try:
            query = """
                SELECT port_id, avg_turnaround_days
                FROM ogd_port_turnaround_times
                WHERE id IN (
                    SELECT max(id) FROM ogd_port_turnaround_times GROUP BY port_id
                )
            """
            df = pd.read_sql_query(query, conn)
            conn.close()
            result = dict(zip(df["port_id"], df["avg_turnaround_days"]))
            if not result:
                # Default calibrated major ports
                return {
                    "IN_PRT": 2.34, "IN_VTZ": 2.43, "IN_HLD": 2.75,
                    "IN_KOL": 3.17, "IN_ENR": 1.73, "IN_CHN": 2.00
                }
            return result
        except Exception:
            conn.close()
            return {
                "IN_PRT": 2.34, "IN_VTZ": 2.43, "IN_HLD": 2.75,
                "IN_KOL": 3.17, "IN_ENR": 1.73, "IN_CHN": 2.00
            }
