"""
Database Manager for SIH26006 Freight Analytics.
Provides relational querying and persistence interfaces for ports, vessels, routes, historical rates,
live tracking telemetry, market indicators, news sentiment articles, and OGD turnaround times.
"""

import os
import json
import sqlite3
import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import pandas as pd


class FreightDBManager:
    """Manages relational SQLite storage and querying for ports, vessels, routes, and historical rates."""

    # Class-level singleton caches shared across all instances
    _cache_ports: Optional[Dict[str, Any]] = None
    _cache_routes: Optional[Dict[str, Any]] = None
    _cache_vessels: Optional[Dict[str, Any]] = None
    _cache_chokepoints: Optional[Dict[str, Dict[str, Any]]] = None
    _cache_risk_weights: Optional[Dict[str, float]] = None
    _cache_ts: Dict[str, float] = {}
    _CACHE_TTL = 600  # 10 minutes

    def __init__(self, db_path: str = "data/processed/freight_data.db"):
        self.db_path = db_path
        self._init_db()
        self._seed_reference_data()

    def get_connection(self) -> sqlite3.Connection:
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        """Initializes relational database schema for all reference masters, live telemetry, and caches."""
        conn = self.get_connection()
        cursor = conn.cursor()

        # 1. Ports Master Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ports_master (
                port_id TEXT PRIMARY KEY,
                port_name TEXT NOT NULL,
                state TEXT,
                country TEXT NOT NULL,
                region TEXT,
                lat REAL,
                lon REAL,
                max_permissible_draft_m REAL,
                max_draft_with_tides_m REAL,
                max_loa_m REAL,
                max_beam_m REAL,
                max_dwt_capacity INTEGER,
                typical_vessel_classes_json TEXT,
                average_output_per_ship_berthday_mt REAL,
                handling_capacity_mtpa REAL,
                primary_bulk_cargoes_json TEXT,
                lighterage_required BOOLEAN,
                lighterage_location TEXT,
                night_navigation BOOLEAN,
                tidal_restriction_level TEXT,
                port_dues_usd_per_gt REAL,
                berth_hire_usd_per_gt_day REAL,
                pilotage_usd_per_gt REAL,
                notes TEXT,
                average_queue_waiting_days REAL,
                loading_rate_tph REAL,
                is_indian_port BOOLEAN,
                updated_at TEXT
            )
        """)

        # 2. Vessel Classes Master Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vessel_classes (
                class_name TEXT PRIMARY KEY,
                typical_capacity_mt INTEGER,
                min_capacity_mt INTEGER,
                max_capacity_mt INTEGER,
                laden_speed_knots REAL,
                ballast_speed_knots REAL,
                vlsfo_consumption_sea_mt_day REAL,
                vlsfo_consumption_port_mt_day REAL,
                design_draft_laden_m REAL,
                typical_loa_m REAL,
                typical_beam_m REAL,
                geared BOOLEAN,
                updated_at TEXT
            )
        """)

        # 3. Active Fleet Master Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS active_fleet (
                vessel_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                vessel_class TEXT NOT NULL,
                operator TEXT,
                imo_number TEXT,
                flag TEXT,
                built_year INTEGER,
                current_status TEXT,
                updated_at TEXT
            )
        """)

        # 4. Trade Routes Master Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS routes_master (
                route_id TEXT PRIMARY KEY,
                origin_port TEXT NOT NULL,
                destination_port TEXT NOT NULL,
                origin_name TEXT,
                destination_name TEXT,
                distance_nautical_miles REAL,
                primary_cargo TEXT,
                typical_vessel_classes_json TEXT,
                chokepoints_json TEXT,
                typical_sailing_days_laden REAL,
                typical_sailing_days_ballast REAL,
                waypoints_json TEXT,
                updated_at TEXT
            )
        """)

        # 5. Live Vessel Tracking Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vessels_live_tracking (
                vessel_id TEXT PRIMARY KEY,
                name TEXT,
                vessel_class TEXT,
                mmsi TEXT,
                lat REAL,
                lon REAL,
                speed REAL,
                heading REAL,
                origin TEXT,
                destination TEXT,
                cargo TEXT,
                status TEXT,
                progress_pct INTEGER,
                wait_time_hours REAL,
                updated_at TEXT
            )
        """)

        # 6. Market Indicators & Commodity Cache Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS market_indicators_cache (
                symbol TEXT PRIMARY KEY,
                price REAL,
                source TEXT,
                label TEXT,
                updated_at TEXT
            )
        """)

        # 7. Port Congestion Cache Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS port_congestion_cache (
                port_id TEXT PRIMARY KEY,
                port_name TEXT,
                anchored_vessels INTEGER,
                avg_wait_days REAL,
                congestion_index REAL,
                congestion_status TEXT,
                updated_at TEXT
            )
        """)

        # 8. News Articles & Sentiment Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS news_articles (
                article_id TEXT PRIMARY KEY,
                title TEXT,
                source TEXT,
                description TEXT,
                published_at TEXT,
                sentiment TEXT,
                sentiment_score REAL,
                primary_chokepoint TEXT,
                processed_at TEXT
            )
        """)

        # 9. OGD Port Turnaround Times Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ogd_port_turnaround_times (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                year TEXT,
                port_id TEXT,
                port_name TEXT,
                avg_turnaround_days REAL,
                updated_at TEXT
            )
        """)

        # 10. Monitored Maritime Chokepoints Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chokepoints_master (
                chokepoint_key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                terms_json TEXT NOT NULL,
                baseline_volume_per_day REAL DEFAULT 10.0,
                is_active BOOLEAN DEFAULT 1,
                updated_at TEXT
            )
        """)

        # 11. Configurable Risk Scoring Weights Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS risk_scoring_weights (
                component_key TEXT PRIMARY KEY,
                weight REAL NOT NULL,
                label TEXT,
                updated_at TEXT
            )
        """)

        conn.commit()
        conn.close()

    def _seed_reference_data(self):
        """Automatically seeds relational master tables from reference JSON files if empty."""
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Check ports_master
        cursor.execute("SELECT count(*) FROM ports_master")
        if cursor.fetchone()[0] == 0:
            ports_json_path = "data/reference/ports_master.json"
            if os.path.exists(ports_json_path):
                with open(ports_json_path, "r") as f:
                    p_data = json.load(f)
                
                # Indian East Coast Ports
                for pid, p in p_data.get("indian_east_coast_ports", {}).items():
                    coords = p.get("coordinates", {})
                    cursor.execute("""
                        INSERT OR REPLACE INTO ports_master VALUES (
                            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                        )
                    """, (
                        p.get("port_id", pid), p.get("port_name", pid), p.get("state", ""),
                        p.get("country", "India"), "East Coast India",
                        coords.get("lat", 0.0), coords.get("lon", 0.0),
                        p.get("max_permissible_draft_m", 14.5), p.get("max_draft_with_tides_m", 15.0),
                        p.get("max_loa_m", 250.0), p.get("max_beam_m", 40.0), p.get("max_dwt_capacity", 100000),
                        json.dumps(p.get("typical_vessel_classes_accommodated", [])),
                        p.get("average_output_per_ship_berthday_mt", 25000), p.get("handling_capacity_mtpa", 50.0),
                        json.dumps(p.get("primary_bulk_cargoes", [])), p.get("lighterage_required", False),
                        p.get("lighterage_location"), p.get("night_navigation", True),
                        p.get("tidal_restriction_level", "Low"), p.get("port_dues_usd_per_gt", 0.45),
                        p.get("berth_hire_usd_per_gt_day", 0.007), p.get("pilotage_usd_per_gt", 0.85),
                        p.get("notes", ""), 2.0, 0.0, True, now_iso
                    ))

                # Global Load Ports
                for pid, p in p_data.get("global_load_ports", {}).items():
                    coords = p.get("coordinates", {})
                    cursor.execute("""
                        INSERT OR REPLACE INTO ports_master VALUES (
                            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                        )
                    """, (
                        p.get("port_id", pid), p.get("port_name", pid), "",
                        p.get("country", ""), p.get("region", ""),
                        coords.get("lat", 0.0), coords.get("lon", 0.0),
                        p.get("max_permissible_draft_m", 18.0), p.get("max_permissible_draft_m", 18.0),
                        p.get("max_loa_m", 300.0), p.get("max_beam_m", 50.0), 200000,
                        json.dumps(p.get("typical_vessel_classes_loaded", [])),
                        0.0, 0.0,
                        json.dumps(p.get("primary_bulk_cargoes", [])), False,
                        None, True, "None", 0.30, 0.005, 0.60,
                        "", p.get("average_queue_waiting_days", 3.0), p.get("loading_rate_tph", 5000), False, now_iso
                    ))

        # Check vessel_classes
        cursor.execute("SELECT count(*) FROM vessel_classes")
        vessels_json_path = "data/reference/vessels_master.json"
        if os.path.exists(vessels_json_path):
            with open(vessels_json_path, "r") as f:
                v_data = json.load(f)

            if cursor.fetchone()[0] == 0:
                for cname, v in v_data.get("vessel_classes", {}).items():
                    cursor.execute("""
                        INSERT OR REPLACE INTO vessel_classes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        cname, v.get("typical_capacity_mt", 75000), v.get("min_capacity_mt", 65000),
                        v.get("max_capacity_mt", 85000), v.get("laden_speed_knots", 12.5),
                        v.get("ballast_speed_knots", 13.5), v.get("vlsfo_consumption_sea_mt_day", 28.0),
                        v.get("vlsfo_consumption_port_mt_day", 3.5), v.get("design_draft_laden_m", 14.2),
                        v.get("typical_loa_m", 225.0), v.get("typical_beam_m", 32.2),
                        v.get("geared", False), now_iso
                    ))

            # Check active_fleet independently
            cursor.execute("SELECT count(*) FROM active_fleet")
            if cursor.fetchone()[0] == 0:
                for i, fl in enumerate(v_data.get("active_fleet", [])):
                    vid = fl.get("vessel_id") or f"vessel_{i+1:03d}"
                    v_name = fl.get("vessel_name") or fl.get("name", f"MV BULK CARRIER {i+1}")
                    v_cls = fl.get("vessel_class") or fl.get("class", "Panamax")
                    cursor.execute("""
                        INSERT OR REPLACE INTO active_fleet VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        vid, v_name,
                        v_cls, fl.get("operator", "Fleet Operator"),
                        fl.get("imo", f"984{i:04d}"), fl.get("flag", "PAN"),
                        fl.get("year_built", fl.get("built_year", 2018)), "Active", now_iso
                    ))

        # Check routes_master
        cursor.execute("SELECT count(*) FROM routes_master")
        if cursor.fetchone()[0] == 0:
            routes_json_path = "data/reference/routes_master.json"
            if os.path.exists(routes_json_path):
                with open(routes_json_path, "r") as f:
                    r_data = json.load(f)
                
                for r in r_data.get("trade_routes", []):
                    cursor.execute("""
                        INSERT OR REPLACE INTO routes_master VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        r.get("route_id"), r.get("origin_port"), r.get("destination_port"),
                        r.get("origin_name"), r.get("destination_name"),
                        r.get("distance_nautical_miles"), r.get("primary_cargo"),
                        json.dumps(r.get("typical_vessel_classes", [])),
                        json.dumps(r.get("chokepoints", [])),
                        r.get("typical_sailing_days_laden"),
                        r.get("typical_sailing_days_ballast"),
                        json.dumps(r.get("waypoints", [])),
                        now_iso
                    ))

        # Check chokepoints_master
        cursor.execute("SELECT count(*) FROM chokepoints_master")
        if cursor.fetchone()[0] == 0:
            default_chokepoints = [
                ("red_sea", "Red Sea / Bab el-Mandeb", ["red sea", "bab el-mandeb", "bab-el-mandeb", "yemen", "houthi", "gulf of aden", "southern red sea"], 12.0),
                ("suez_canal", "Suez Canal", ["suez", "suez canal", "ever given", "sczone", "port said"], 8.0),
                ("malacca_strait", "Strait of Malacca", ["malacca", "strait of malacca", "singapore strait", "phillip channel", "malacca straits"], 15.0),
                ("panama_canal", "Panama Canal", ["panama canal", "gatun lake", "panama transit", "draft restriction panama"], 6.0),
                ("strait_of_hormuz", "Strait of Hormuz", ["hormuz", "strait of hormuz", "persian gulf", "gulf of oman"], 10.0),
                ("taiwan_strait", "Taiwan Strait", ["taiwan strait", "formosa strait", "taiwan shipping"], 9.0),
                ("bosphorus_strait", "Bosphorus Strait", ["bosphorus", "dardanelles", "turkish straits", "black sea transit"], 7.0),
                ("cape_of_good_hope", "Cape of Good Hope", ["cape of good hope", "south africa route", "cape route diversion"], 14.0)
            ]
            for key, name, terms, base_vol in default_chokepoints:
                cursor.execute("""
                    INSERT OR REPLACE INTO chokepoints_master (chokepoint_key, name, terms_json, baseline_volume_per_day, is_active, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (key, name, json.dumps(terms), base_vol, 1, now_iso))

        # Check risk_scoring_weights
        cursor.execute("SELECT count(*) FROM risk_scoring_weights")
        if cursor.fetchone()[0] == 0:
            default_weights = [
                ("event_severity", 0.35, "Event Severity Score"),
                ("volume_anomaly", 0.25, "News Volume Anomaly (Z-Score)"),
                ("negative_sentiment", 0.20, "Negative Sentiment Probability"),
                ("recency", 0.20, "Article Recency Weight")
            ]
            for c_key, w, lbl in default_weights:
                cursor.execute("""
                    INSERT OR REPLACE INTO risk_scoring_weights (component_key, weight, label, updated_at)
                    VALUES (?, ?, ?, ?)
                """, (c_key, w, lbl, now_iso))

        conn.commit()
        conn.close()

    # ── Relational Master Data Loaders ──
    def _invalidate_cache(self, key: str):
        """Invalidates a specific in-memory cache."""
        cache_map = {
            "ports": "_cache_ports",
            "routes": "_cache_routes",
            "vessels": "_cache_vessels",
            "chokepoints": "_cache_chokepoints",
            "risk_weights": "_cache_risk_weights",
        }
        attr = cache_map.get(key)
        if attr:
            setattr(FreightDBManager, attr, None)
            FreightDBManager._cache_ts.pop(key, None)

    def _is_cache_valid(self, key: str) -> bool:
        ts = FreightDBManager._cache_ts.get(key, 0)
        return (time.time() - ts) < FreightDBManager._CACHE_TTL

    def load_ports_master(self, path: Optional[str] = None) -> Dict[str, Any]:
        """Loads ports dynamically from relational SQLite table with in-memory caching."""
        if FreightDBManager._cache_ports is not None and self._is_cache_valid("ports"):
            return FreightDBManager._cache_ports

        conn = self.get_connection()
        df = pd.read_sql_query("SELECT * FROM ports_master", conn)
        conn.close()

        indian_ports = {}
        global_ports = {}

        for _, row in df.iterrows():
            coords = {"lat": row["lat"], "lon": row["lon"]}
            p_dict = {
                "port_id": row["port_id"],
                "port_name": row["port_name"],
                "coordinates": coords,
                "max_permissible_draft_m": row["max_permissible_draft_m"],
                "max_draft_with_tides_m": row["max_draft_with_tides_m"],
                "max_loa_m": row["max_loa_m"],
                "max_beam_m": row["max_beam_m"],
                "max_dwt_capacity": row["max_dwt_capacity"],
                "primary_bulk_cargoes": json.loads(row["primary_bulk_cargoes_json"] or "[]"),
                "notes": row["notes"]
            }

            if row["is_indian_port"]:
                p_dict.update({
                    "state": row["state"],
                    "country": row["country"],
                    "typical_vessel_classes_accommodated": json.loads(row["typical_vessel_classes_json"] or "[]"),
                    "average_output_per_ship_berthday_mt": row["average_output_per_ship_berthday_mt"],
                    "handling_capacity_mtpa": row["handling_capacity_mtpa"],
                    "lighterage_required": bool(row["lighterage_required"]),
                    "lighterage_location": row["lighterage_location"],
                    "night_navigation": bool(row["night_navigation"]),
                    "tidal_restriction_level": row["tidal_restriction_level"],
                    "port_dues_usd_per_gt": row["port_dues_usd_per_gt"],
                    "berth_hire_usd_per_gt_day": row["berth_hire_usd_per_gt_day"],
                    "pilotage_usd_per_gt": row["pilotage_usd_per_gt"],
                })
                indian_ports[row["port_id"]] = p_dict
            else:
                p_dict.update({
                    "country": row["country"],
                    "region": row["region"],
                    "typical_vessel_classes_loaded": json.loads(row["typical_vessel_classes_json"] or "[]"),
                    "loading_rate_tph": row["loading_rate_tph"],
                    "average_queue_waiting_days": row["average_queue_waiting_days"],
                })
                global_ports[row["port_id"]] = p_dict

        result = {
            "indian_east_coast_ports": indian_ports,
            "global_load_ports": global_ports
        }
        FreightDBManager._cache_ports = result
        FreightDBManager._cache_ts["ports"] = time.time()
        return result

    def load_vessels_master(self, path: Optional[str] = None) -> Dict[str, Any]:
        """Loads vessel classes and active fleet dynamically from relational SQLite tables with caching."""
        if FreightDBManager._cache_vessels is not None and self._is_cache_valid("vessels"):
            return FreightDBManager._cache_vessels

        conn = self.get_connection()
        classes_df = pd.read_sql_query("SELECT * FROM vessel_classes", conn)
        fleet_df = pd.read_sql_query("SELECT * FROM active_fleet", conn)
        conn.close()

        vessel_classes = {}
        for _, row in classes_df.iterrows():
            vessel_classes[row["class_name"]] = {
                "typical_capacity_mt": row["typical_capacity_mt"],
                "min_capacity_mt": row["min_capacity_mt"],
                "max_capacity_mt": row["max_capacity_mt"],
                "laden_speed_knots": row["laden_speed_knots"],
                "ballast_speed_knots": row["ballast_speed_knots"],
                "vlsfo_consumption_sea_mt_day": row["vlsfo_consumption_sea_mt_day"],
                "vlsfo_consumption_port_mt_day": row["vlsfo_consumption_port_mt_day"],
                "design_draft_laden_m": row["design_draft_laden_m"],
                "typical_loa_m": row["typical_loa_m"],
                "typical_beam_m": row["typical_beam_m"],
                "geared": bool(row["geared"])
            }

        active_fleet = []
        for _, row in fleet_df.iterrows():
            active_fleet.append({
                "vessel_id": row["vessel_id"],
                "name": row["name"],
                "class": row["vessel_class"],
                "operator": row["operator"],
                "imo": row["imo_number"],
                "flag": row["flag"],
                "built_year": row["built_year"],
                "status": row["current_status"]
            })

        result = {
            "vessel_classes": vessel_classes,
            "active_fleet": active_fleet
        }
        FreightDBManager._cache_vessels = result
        FreightDBManager._cache_ts["vessels"] = time.time()
        return result

    def load_routes_master(self, path: Optional[str] = None) -> Dict[str, Any]:
        """Loads trade routes dynamically from relational SQLite table with caching."""
        if FreightDBManager._cache_routes is not None and self._is_cache_valid("routes"):
            return FreightDBManager._cache_routes

        conn = self.get_connection()
        df = pd.read_sql_query("SELECT * FROM routes_master", conn)
        conn.close()

        routes = []
        for _, row in df.iterrows():
            routes.append({
                "route_id": row["route_id"],
                "origin_port": row["origin_port"],
                "destination_port": row["destination_port"],
                "origin_name": row["origin_name"],
                "destination_name": row["destination_name"],
                "distance_nautical_miles": row["distance_nautical_miles"],
                "primary_cargo": row["primary_cargo"],
                "typical_vessel_classes": json.loads(row["typical_vessel_classes_json"] or "[]"),
                "chokepoints": json.loads(row["chokepoints_json"] or "[]"),
                "typical_sailing_days_laden": row["typical_sailing_days_laden"],
                "typical_sailing_days_ballast": row["typical_sailing_days_ballast"],
                "waypoints": json.loads(row["waypoints_json"] or "[]")
            })

        result = {"trade_routes": routes}
        FreightDBManager._cache_routes = result
        FreightDBManager._cache_ts["routes"] = time.time()
        return result

    # ── Admin CRUD Endpoints Support ──
    def save_port(self, p: Dict[str, Any]):
        """Upserts a port record into ports_master."""
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        coords = p.get("coordinates", {})
        cursor.execute("""
            INSERT INTO ports_master VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT(port_id) DO UPDATE SET
                port_name=excluded.port_name,
                state=excluded.state,
                country=excluded.country,
                region=excluded.region,
                lat=excluded.lat,
                lon=excluded.lon,
                max_permissible_draft_m=excluded.max_permissible_draft_m,
                max_draft_with_tides_m=excluded.max_draft_with_tides_m,
                max_loa_m=excluded.max_loa_m,
                max_beam_m=excluded.max_beam_m,
                max_dwt_capacity=excluded.max_dwt_capacity,
                typical_vessel_classes_json=excluded.typical_vessel_classes_json,
                average_output_per_ship_berthday_mt=excluded.average_output_per_ship_berthday_mt,
                handling_capacity_mtpa=excluded.handling_capacity_mtpa,
                primary_bulk_cargoes_json=excluded.primary_bulk_cargoes_json,
                lighterage_required=excluded.lighterage_required,
                lighterage_location=excluded.lighterage_location,
                night_navigation=excluded.night_navigation,
                tidal_restriction_level=excluded.tidal_restriction_level,
                port_dues_usd_per_gt=excluded.port_dues_usd_per_gt,
                berth_hire_usd_per_gt_day=excluded.berth_hire_usd_per_gt_day,
                pilotage_usd_per_gt=excluded.pilotage_usd_per_gt,
                notes=excluded.notes,
                average_queue_waiting_days=excluded.average_queue_waiting_days,
                loading_rate_tph=excluded.loading_rate_tph,
                is_indian_port=excluded.is_indian_port,
                updated_at=excluded.updated_at
        """, (
            p.get("port_id"), p.get("port_name"), p.get("state", ""),
            p.get("country", "India"), p.get("region", ""),
            coords.get("lat") or p.get("lat", 0.0), coords.get("lon") or p.get("lon", 0.0),
            p.get("max_permissible_draft_m", 14.5), p.get("max_draft_with_tides_m", 15.0),
            p.get("max_loa_m", 250.0), p.get("max_beam_m", 40.0), p.get("max_dwt_capacity", 100000),
            json.dumps(p.get("typical_vessel_classes", p.get("typical_vessel_classes_accommodated", []))),
            p.get("average_output_per_ship_berthday_mt", 25000), p.get("handling_capacity_mtpa", 50.0),
            json.dumps(p.get("primary_bulk_cargoes", [])), p.get("lighterage_required", False),
            p.get("lighterage_location"), p.get("night_navigation", True),
            p.get("tidal_restriction_level", "Low"), p.get("port_dues_usd_per_gt", 0.45),
            p.get("berth_hire_usd_per_gt_day", 0.007), p.get("pilotage_usd_per_gt", 0.85),
            p.get("notes", ""), p.get("average_queue_waiting_days", 2.0),
            p.get("loading_rate_tph", 0.0), p.get("is_indian_port", True), now_iso
        ))
        conn.commit()
        conn.close()
        self._invalidate_cache("ports")

    def delete_port(self, port_id: str) -> bool:
        """Deletes a port from ports_master."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM ports_master WHERE port_id = ?", (port_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        self._invalidate_cache("ports")
        return deleted

    def save_route(self, r: Dict[str, Any]):
        """Upserts a trade route into routes_master."""
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            INSERT INTO routes_master VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(route_id) DO UPDATE SET
                origin_port=excluded.origin_port,
                destination_port=excluded.destination_port,
                origin_name=excluded.origin_name,
                destination_name=excluded.destination_name,
                distance_nautical_miles=excluded.distance_nautical_miles,
                primary_cargo=excluded.primary_cargo,
                typical_vessel_classes_json=excluded.typical_vessel_classes_json,
                chokepoints_json=excluded.chokepoints_json,
                typical_sailing_days_laden=excluded.typical_sailing_days_laden,
                typical_sailing_days_ballast=excluded.typical_sailing_days_ballast,
                waypoints_json=excluded.waypoints_json,
                updated_at=excluded.updated_at
        """, (
            r.get("route_id"), r.get("origin_port"), r.get("destination_port"),
            r.get("origin_name"), r.get("destination_name"),
            r.get("distance_nautical_miles", 5000), r.get("primary_cargo", "Thermal Coal"),
            json.dumps(r.get("typical_vessel_classes", [])),
            json.dumps(r.get("chokepoints", [])),
            r.get("typical_sailing_days_laden", 15.0),
            r.get("typical_sailing_days_ballast", 13.0),
            json.dumps(r.get("waypoints", [])),
            now_iso
        ))
        conn.commit()
        conn.close()
        self._invalidate_cache("routes")

    def delete_route(self, route_id: str) -> bool:
        """Deletes a trade route from routes_master."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM routes_master WHERE route_id = ?", (route_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        self._invalidate_cache("routes")
        return deleted

    def save_vessel_class(self, v: Dict[str, Any]):
        """Upserts a vessel class into vessel_classes."""
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            INSERT INTO vessel_classes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(class_name) DO UPDATE SET
                typical_capacity_mt=excluded.typical_capacity_mt,
                min_capacity_mt=excluded.min_capacity_mt,
                max_capacity_mt=excluded.max_capacity_mt,
                laden_speed_knots=excluded.laden_speed_knots,
                ballast_speed_knots=excluded.ballast_speed_knots,
                vlsfo_consumption_sea_mt_day=excluded.vlsfo_consumption_sea_mt_day,
                vlsfo_consumption_port_mt_day=excluded.vlsfo_consumption_port_mt_day,
                design_draft_laden_m=excluded.design_draft_laden_m,
                typical_loa_m=excluded.typical_loa_m,
                typical_beam_m=excluded.typical_beam_m,
                geared=excluded.geared,
                updated_at=excluded.updated_at
        """, (
            v.get("class_name"), v.get("typical_capacity_mt", 75000),
            v.get("min_capacity_mt", 65000), v.get("max_capacity_mt", 85000),
            v.get("laden_speed_knots", 12.5), v.get("ballast_speed_knots", 13.5),
            v.get("vlsfo_consumption_sea_mt_day", 28.0), v.get("vlsfo_consumption_port_mt_day", 3.5),
            v.get("design_draft_laden_m", 14.2), v.get("typical_loa_m", 225.0),
            v.get("typical_beam_m", 32.2), v.get("geared", False), now_iso
        ))
        conn.commit()
        conn.close()
        self._invalidate_cache("vessels")

    def save_fleet_vessel(self, f: Dict[str, Any]):
        """Upserts an active fleet ship into active_fleet."""
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            INSERT INTO active_fleet VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(vessel_id) DO UPDATE SET
                name=excluded.name,
                vessel_class=excluded.vessel_class,
                operator=excluded.operator,
                imo_number=excluded.imo_number,
                flag=excluded.flag,
                built_year=excluded.built_year,
                current_status=excluded.current_status,
                updated_at=excluded.updated_at
        """, (
            f.get("vessel_id"), f.get("name"), f.get("vessel_class", f.get("class", "Panamax")),
            f.get("operator", "Fleet Operator"), f.get("imo_number", f.get("imo", "9840001")),
            f.get("flag", "PAN"), f.get("built_year", 2018), f.get("current_status", "Active"), now_iso
        ))
        conn.commit()
        conn.close()
        self._invalidate_cache("vessels")

    def delete_fleet_vessel(self, vessel_id: str) -> bool:
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM active_fleet WHERE vessel_id = ?", (vessel_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        self._invalidate_cache("vessels")
        return deleted

    # ── Chokepoints Master CRUD ──
    def load_chokepoints_master(self, active_only: bool = True) -> Dict[str, Dict[str, Any]]:
        """Loads chokepoints configuration dynamically from relational SQLite table with caching."""
        if active_only and FreightDBManager._cache_chokepoints is not None and self._is_cache_valid("chokepoints"):
            return FreightDBManager._cache_chokepoints

        conn = self.get_connection()
        query = "SELECT * FROM chokepoints_master"
        if active_only:
            query += " WHERE is_active = 1"
        df = pd.read_sql_query(query, conn)
        conn.close()

        chokepoints = {}
        for _, row in df.iterrows():
            chokepoints[row["chokepoint_key"]] = {
                "name": row["name"],
                "terms": json.loads(row["terms_json"] or "[]"),
                "baseline_volume_per_day": float(row["baseline_volume_per_day"]),
                "is_active": bool(row["is_active"]),
                "updated_at": row["updated_at"]
            }
        if active_only:
            FreightDBManager._cache_chokepoints = chokepoints
            FreightDBManager._cache_ts["chokepoints"] = time.time()
        return chokepoints

    def save_chokepoint(self, chk: Dict[str, Any]):
        """Upserts a maritime chokepoint into chokepoints_master."""
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        terms = chk.get("terms", [])
        cursor.execute("""
            INSERT INTO chokepoints_master (chokepoint_key, name, terms_json, baseline_volume_per_day, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(chokepoint_key) DO UPDATE SET
                name=excluded.name,
                terms_json=excluded.terms_json,
                baseline_volume_per_day=excluded.baseline_volume_per_day,
                is_active=excluded.is_active,
                updated_at=excluded.updated_at
        """, (
            chk.get("chokepoint_key") or chk.get("key"),
            chk.get("name"),
            json.dumps(terms) if isinstance(terms, list) else terms,
            float(chk.get("baseline_volume_per_day", 10.0)),
            1 if chk.get("is_active", True) else 0,
            now_iso
        ))
        conn.commit()
        conn.close()
        self._invalidate_cache("chokepoints")

    def delete_chokepoint(self, chokepoint_key: str) -> bool:
        """Deletes a chokepoint from chokepoints_master."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM chokepoints_master WHERE chokepoint_key = ?", (chokepoint_key,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        self._invalidate_cache("chokepoints")
        return deleted

    # ── Risk Scoring Weights Config ──
    def get_risk_scoring_weights(self) -> Dict[str, float]:
        """Retrieves configured risk scoring component weights, normalized to 1.0, with caching."""
        if FreightDBManager._cache_risk_weights is not None and self._is_cache_valid("risk_weights"):
            return FreightDBManager._cache_risk_weights

        conn = self.get_connection()
        try:
            df = pd.read_sql_query("SELECT component_key, weight FROM risk_scoring_weights", conn)
            conn.close()
            weights = dict(zip(df["component_key"], df["weight"]))
            if not weights:
                return {
                    "event_severity": 0.35,
                    "volume_anomaly": 0.25,
                    "negative_sentiment": 0.20,
                    "recency": 0.20
                }
            tot = sum(weights.values())
            if tot > 0:
                result = {k: round(v / tot, 3) for k, v in weights.items()}
            else:
                result = weights
            FreightDBManager._cache_risk_weights = result
            FreightDBManager._cache_ts["risk_weights"] = time.time()
            return result
        except Exception:
            conn.close()
            return {
                "event_severity": 0.35,
                "volume_anomaly": 0.25,
                "negative_sentiment": 0.20,
                "recency": 0.20
            }

    def save_risk_scoring_weights(self, weights: Dict[str, float]):
        """Upserts configurable risk scoring weights into SQLite."""
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        labels = {
            "event_severity": "Event Severity Score",
            "volume_anomaly": "News Volume Anomaly (Z-Score)",
            "negative_sentiment": "Negative Sentiment Probability",
            "recency": "Article Recency Weight"
        }
        for k, w in weights.items():
            cursor.execute("""
                INSERT INTO risk_scoring_weights (component_key, weight, label, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(component_key) DO UPDATE SET
                    weight=excluded.weight,
                    updated_at=excluded.updated_at
            """, (k, float(w), labels.get(k, k.replace("_", " ").title()), now_iso))
        conn.commit()
        conn.close()
        self._invalidate_cache("risk_weights")

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

    # ── Live Vessel Tracking CRUD ──
    def save_live_vessels(self, vessels: List[Dict[str, Any]]):
        """Upserts live tracked vessels into SQLite."""
        if not vessels:
            return
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()

        for v in vessels:
            cursor.execute("""
                INSERT INTO vessels_live_tracking (
                    vessel_id, name, vessel_class, mmsi, lat, lon, speed, heading,
                    origin, destination, cargo, status, progress_pct, wait_time_hours, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(vessel_id) DO UPDATE SET
                    name=excluded.name,
                    vessel_class=excluded.vessel_class,
                    mmsi=excluded.mmsi,
                    lat=excluded.lat,
                    lon=excluded.lon,
                    speed=excluded.speed,
                    heading=excluded.heading,
                    origin=excluded.origin,
                    destination=excluded.destination,
                    cargo=excluded.cargo,
                    status=excluded.status,
                    progress_pct=excluded.progress_pct,
                    wait_time_hours=excluded.wait_time_hours,
                    updated_at=excluded.updated_at
            """, (
                v.get("id") or v.get("vessel_id"),
                v.get("name"),
                v.get("class") or v.get("vessel_class"),
                v.get("mmsi"),
                v.get("lat"),
                v.get("lon"),
                v.get("speed", 0.0),
                v.get("heading", 0),
                v.get("origin"),
                v.get("dest") or v.get("destination"),
                v.get("cargo"),
                v.get("status"),
                v.get("progress_pct", 50),
                v.get("wait_time_hours", 0.0),
                now_iso
            ))

        conn.commit()
        conn.close()

    def get_live_vessels(self) -> List[Dict[str, Any]]:
        """Retrieves currently tracked live vessels from SQLite."""
        conn = self.get_connection()
        try:
            df = pd.read_sql_query("SELECT * FROM vessels_live_tracking ORDER BY name ASC", conn)
            conn.close()
            res = []
            for _, row in df.iterrows():
                res.append({
                    "id": row["vessel_id"],
                    "name": row["name"],
                    "class": row["vessel_class"],
                    "mmsi": row["mmsi"],
                    "lat": row["lat"],
                    "lon": row["lon"],
                    "speed": row["speed"],
                    "heading": row["heading"],
                    "origin": row["origin"],
                    "dest": row["destination"],
                    "cargo": row["cargo"],
                    "status": row["status"],
                    "progress_pct": row["progress_pct"],
                    "wait_time_hours": row["wait_time_hours"],
                    "updated_at": row["updated_at"]
                })
            return res
        except Exception:
            conn.close()
            return []

    # ── Market Indicators Cache ──
    def save_market_indicator(self, symbol: str, price: float, source: str, label: str = ""):
        """Upserts a real-time market indicator into cache."""
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            INSERT INTO market_indicators_cache (symbol, price, source, label, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(symbol) DO UPDATE SET
                price=excluded.price,
                source=excluded.source,
                label=excluded.label,
                updated_at=excluded.updated_at
        """, (symbol, price, source, label, now_iso))
        conn.commit()
        conn.close()

    def get_market_indicators(self) -> Dict[str, Dict[str, Any]]:
        """Retrieves cached market indicators."""
        conn = self.get_connection()
        try:
            df = pd.read_sql_query("SELECT * FROM market_indicators_cache", conn)
            conn.close()
            res = {}
            for _, row in df.iterrows():
                res[row["symbol"]] = {
                    "price": row["price"],
                    "source": row["source"],
                    "label": row["label"],
                    "updated_at": row["updated_at"]
                }
            return res
        except Exception:
            conn.close()
            return {}

    # ── Port Congestion Cache ──
    def save_port_congestion(self, port_id: str, port_name: str, anchored: int, wait_days: float, congestion_index: float, status: str):
        conn = self.get_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            INSERT INTO port_congestion_cache (port_id, port_name, anchored_vessels, avg_wait_days, congestion_index, congestion_status, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(port_id) DO UPDATE SET
                port_name=excluded.port_name,
                anchored_vessels=excluded.anchored_vessels,
                avg_wait_days=excluded.avg_wait_days,
                congestion_index=excluded.congestion_index,
                congestion_status=excluded.congestion_status,
                updated_at=excluded.updated_at
        """, (port_id, port_name, anchored, wait_days, congestion_index, status, now_iso))
        conn.commit()
        conn.close()

    def get_port_congestion(self, port_id: str) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM port_congestion_cache WHERE port_id = ?", (port_id,))
            row = cursor.fetchone()
            conn.close()
            if row:
                return {
                    "port_id": row[0],
                    "port_name": row[1],
                    "anchored_vessels": row[2],
                    "avg_wait_days": row[3],
                    "congestion_index": row[4],
                    "congestion_status": row[5],
                    "updated_at": row[6]
                }
            return None
        except Exception:
            conn.close()
            return None
