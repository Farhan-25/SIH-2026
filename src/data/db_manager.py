"""
Database Manager for SIH26006 Freight Analytics.
Provides querying interfaces for ports, vessels, routes, and historical freight rates.
"""

import os
import json
import sqlite3
from typing import Dict, Any, List, Optional
import pandas as pd


class FreightDBManager:
    """Manages SQLite storage and querying for ports, vessels, routes, and historical rates."""

    def __init__(self, db_path: str = "data/processed/freight_data.db"):
        self.db_path = db_path

    def get_connection(self) -> sqlite3.Connection:
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        return sqlite3.connect(self.db_path)

    def load_ports_master(self, path: str = "data/reference/ports_master.json") -> Dict[str, Any]:
        with open(path, "r") as f:
            return json.load(f)

    def load_vessels_master(self, path: str = "data/reference/vessels_master.json") -> Dict[str, Any]:
        with open(path, "r") as f:
            return json.load(f)

    def load_routes_master(self, path: str = "data/reference/routes_master.json") -> Dict[str, Any]:
        with open(path, "r") as f:
            return json.load(f)

    def query_historical_rates(
        self,
        route_id: Optional[str] = None,
        vessel_class: Optional[str] = None,
        limit: int = 500
    ) -> List[Dict[str, Any]]:
        """Queries historical freight rates matching filters."""
        conn = self.get_connection()
        query = "SELECT * FROM freight_rates_historical WHERE 1=1"
        params = []

        if route_id:
            query += " AND route_id = ?"
            params.append(route_id)
        if vessel_class:
            query += " AND vessel_class = ?"
            params.append(vessel_class)

        query += " ORDER BY date ASC"
        if limit:
            query += f" LIMIT {limit}"

        try:
            df = pd.read_sql_query(query, conn, params=params)
            conn.close()
            return df.to_dict(orient="records")
        except Exception:
            conn.close()
            return []
