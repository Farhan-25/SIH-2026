"""
Live vessel positions for the FreightIQ map.

Despite the historical name, this module does NOT call Global Fishing Watch for
positions. Live AIS is ingested by AISStream + Open Waters into SQLite
(`vessels_live_tracking`). This client reads that table and builds map/API
payloads. Corridor positions are a last-resort demo fallback only.
"""

import os
import time
import math
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from dotenv import load_dotenv
from src.data.db_manager import FreightDBManager

load_dotenv()
logger = logging.getLogger(__name__)

# If fewer than this many live AIS fixes exist in India ROI, add corridor demos
CORRIDOR_FALLBACK_THRESHOLD = int(os.getenv("VESSEL_CORRIDOR_FALLBACK_THRESHOLD", "8") or 8)
# Port proximity for congestion badges (~20–25 nm)
PORT_RADIUS_DEG = float(os.getenv("VESSEL_PORT_RADIUS_DEG", "0.40") or 0.40)


def _dist_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return math.hypot(lat1 - lat2, lon1 - lon2)


def vessels_near_port(
    vessels: List[Dict[str, Any]],
    lat: float,
    lon: float,
    radius_deg: float = PORT_RADIUS_DEG,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Split vessels within radius into (anchored, underway)."""
    anchored, underway = [], []
    for v in vessels:
        try:
            vlat, vlon = float(v.get("lat") or 0), float(v.get("lon") or 0)
        except (TypeError, ValueError):
            continue
        if not vlat and not vlon:
            continue
        if _dist_deg(lat, lon, vlat, vlon) > radius_deg:
            continue
        status = (v.get("status") or "").lower()
        speed = float(v.get("speed") or 0)
        if "anchor" in status or speed <= 0.5:
            anchored.append(v)
        else:
            underway.append(v)
    return anchored, underway


class GFWClient:
    """
    Map/API fleet reader over SQLite live AIS (AISStream + Open Waters).
    Name kept for import compatibility across the codebase.
    """

    def __init__(self, db_manager: Optional[FreightDBManager] = None):
        self.cache_ttl = 30  # seconds — fleet should feel live
        self._vessels_cache = None
        self._last_fetch_time = 0.0
        self.db = db_manager or FreightDBManager()

    def _interpolate_corridor_position(self, waypoints: List[List[float]], progress_ratio: float) -> tuple:
        """Interpolates lon, lat, heading along route waypoints (0.0–1.0 progress)."""
        if not waypoints or len(waypoints) < 2:
            return 86.67, 20.26, 0.0

        n_segments = len(waypoints) - 1
        segment_float = max(0.0, min(1.0, progress_ratio)) * n_segments
        idx = int(segment_float)
        frac = segment_float - idx

        if idx >= n_segments:
            p1 = waypoints[-2]
            p2 = waypoints[-1]
            frac = 1.0
        else:
            p1 = waypoints[idx]
            p2 = waypoints[idx + 1]

        lon = p1[0] + (p2[0] - p1[0]) * frac
        lat = p1[1] + (p2[1] - p1[1]) * frac
        heading = (math.degrees(math.atan2(p2[0] - p1[0], p2[1] - p1[1])) + 360) % 360
        return round(lon, 4), round(lat, 4), round(heading, 1)

    def _generate_dynamic_fleet_positions(self) -> List[Dict[str, Any]]:
        """Modeled ships along trade routes — used only when live AIS is empty/thin."""
        routes_data = self.db.load_routes_master()
        routes_list = routes_data.get("trade_routes", []) if isinstance(routes_data, dict) else routes_data
        if not routes_list:
            return []

        vessels_data = self.db.load_vessels_master()
        active_fleet = vessels_data.get("active_fleet", [])
        vessel_specs = vessels_data.get("vessel_classes", {})
        now_sec = time.time()
        live_vessels = []

        for i, matched_route in enumerate(routes_list):
            vessel = active_fleet[i % len(active_fleet)] if active_fleet else {}
            v_name = vessel.get("vessel_name") or vessel.get("name") or f"MV Corridor {i + 1}"
            v_class = vessel.get("vessel_class") or vessel.get("class") or "Panamax"
            spec = vessel_specs.get(v_class, {})
            waypoints = matched_route.get("waypoints", [])
            sailing_days = float(matched_route.get("typical_sailing_days_laden", 18.0) or 18.0)
            route_id = matched_route.get("route_id", f"route_{i}")
            cycle_seconds = max(86400 * 2, sailing_days * 86400 * 0.1)
            progress_ratio = ((now_sec + i * 3600 * 14) % cycle_seconds) / cycle_seconds
            is_anchor = progress_ratio > 0.92

            if is_anchor:
                dest_point = waypoints[-1] if waypoints else [86.67, 20.26]
                lon, lat = dest_point[0], dest_point[1]
                heading, speed, status = 0.0, 0.0, "At Anchor"
                progress_pct, wait_time_hours = 100, round(12.0 + (i * 3.5) % 48, 1)
            else:
                lon, lat, heading = self._interpolate_corridor_position(waypoints, progress_ratio)
                speed = round(11.5 + (i % 5) * 0.6, 1)
                status, progress_pct, wait_time_hours = "Underway", int(progress_ratio * 100), 0.0

            live_vessels.append({
                "id": f"route_{route_id}",
                "route_id": route_id,
                "name": v_name,
                "class": v_class,
                "mmsi": f"538{i + 1000:06d}",
                "lat": lat,
                "lon": lon,
                "speed": speed,
                "heading": heading,
                "origin": matched_route.get("origin_name", "Origin"),
                "dest": matched_route.get("destination_name", "Destination"),
                "cargo": matched_route.get("primary_cargo", "Bulk Cargo"),
                "dwt": spec.get("typical_capacity_mt", 75000),
                "draft_m": spec.get("design_draft_laden_m", 14.2),
                "operator": vessel.get("operator", "Dry Bulk Corridor Fleet"),
                "status": status,
                "progress_pct": progress_pct,
                "eta_days": round(max(0.2, (1.0 - progress_ratio) * sailing_days), 1) if not is_anchor else 0.0,
                "wait_time_hours": wait_time_hours,
                "source": "modeled_corridor",
                "last_update": datetime.now(timezone.utc).isoformat(),
            })

        return live_vessels

    def get_live_cargo_vessels(self, limit: Optional[int] = 700) -> List[Dict[str, Any]]:
        """
        Fleet for maps/APIs:
          1. Live AIS in India ROI (AISStream + Open Waters → SQLite)
          2. If that set is empty/very thin, add modeled corridor ships in ROI
        No invented coastal seed fleets — badges and markers share the same list.
        """
        from src.data.aisstream_client import is_near_india

        current_time = time.time()
        lim = 700 if limit is None else max(1, int(limit))
        if self._vessels_cache and (current_time - self._last_fetch_time < self.cache_ttl):
            return self._vessels_cache[:lim]

        live_rows = self.db.get_live_vessels(limit=max(lim * 2, 1400))
        india_ships: List[Dict[str, Any]] = []
        seen = set()

        for v in live_rows:
            try:
                lat, lon = float(v.get("lat") or 0), float(v.get("lon") or 0)
            except (TypeError, ValueError):
                continue
            if not lat and not lon:
                continue
            if not is_near_india(lat, lon):
                continue
            vid = v.get("id") or v.get("mmsi")
            if not vid or vid in seen:
                continue
            seen.add(vid)
            vv = dict(v)
            vv["source"] = "ais_live"
            # Normalize status wording for UI filters
            if float(vv.get("speed") or 0) <= 0.5:
                vv["status"] = "At Anchor"
            elif (vv.get("status") or "") in ("En Route", "Underway", ""):
                vv["status"] = "Underway"
            india_ships.append(vv)

        live_count = len(india_ships)
        if live_count < CORRIDOR_FALLBACK_THRESHOLD:
            for v in self._generate_dynamic_fleet_positions():
                try:
                    lat, lon = float(v.get("lat") or 0), float(v.get("lon") or 0)
                except (TypeError, ValueError):
                    continue
                if not is_near_india(lat, lon):
                    continue
                vid = v.get("id")
                if not vid or vid in seen:
                    continue
                seen.add(vid)
                india_ships.append(v)

        # Prefer live AIS first
        india_ships.sort(key=lambda v: 0 if v.get("source") == "ais_live" else 1)
        self._vessels_cache = india_ships[:lim]
        self._last_fetch_time = current_time
        logger.debug(
            "Fleet ready: %s ships (%s live AIS, threshold=%s)",
            len(self._vessels_cache),
            live_count,
            CORRIDOR_FALLBACK_THRESHOLD,
        )
        return self._vessels_cache

    def get_port_congestion(self, port_name: str) -> Dict[str, Any]:
        """Congestion from vessels actually near the named Indian/load port."""
        ports_master = self.db.load_ports_master()
        indian = ports_master.get("indian_east_coast_ports") or {}
        global_ports = ports_master.get("global_load_ports") or {}

        port_info = None
        port_id = None
        needle = (port_name or "").lower().replace("_", " ")
        for pid, p in {**indian, **global_ports}.items():
            names = (pid.lower(), (p.get("port_name") or "").lower(), pid.split("_")[-1].lower())
            if any(n and (n in needle or needle in n) for n in names if n):
                port_info, port_id = p, pid
                break

        if not port_info:
            # Fallback: substring match on dest field (legacy)
            vessels = self.get_live_cargo_vessels()
            p_token = needle.split(" ")[0]
            anchored = [
                v for v in vessels
                if p_token in (v.get("dest") or v.get("destination") or "").lower()
                and v.get("status") == "At Anchor"
            ]
            n = len(anchored)
            wait = 0.5 if n == 0 else round(sum(float(v.get("wait_time_hours") or 0) for v in anchored) / max(1, n) / 24.0, 1)
            return {
                "anchored_vessels_count": n,
                "estimated_waiting_days": wait,
                "congestion_index": round(min(100.0, max(10.0, 15.0 + n * 8.0)), 1),
            }

        return self._congestion_for_port(port_id, port_info)

    def _congestion_for_port(self, port_id: str, port_info: Dict[str, Any]) -> Dict[str, Any]:
        coords = port_info.get("coordinates") or {}
        plat, plon = float(coords.get("lat") or 0), float(coords.get("lon") or 0)
        vessels = self.get_live_cargo_vessels()
        anchored, underway = vessels_near_port(vessels, plat, plon)
        n_a, n_u = len(anchored), len(underway)

        base_queue = float(port_info.get("average_queue_waiting_days") or 1.8)
        lighterage = bool(port_info.get("lighterage_required"))
        draft = float(port_info.get("max_permissible_draft_m") or 15.0)

        traffic = min(50.0, n_a * 8.0 + n_u * 3.0)
        draft_penalty = 15.0 if draft < 10.0 else 0.0
        lighterage_penalty = 20.0 if lighterage else 0.0
        index = min(100.0, max(10.0, 12.0 + traffic + draft_penalty + lighterage_penalty))
        # Wait days: port baseline scaled by live queue (no phantom ships)
        wait_days = round(base_queue * (0.6 + 0.1 * n_a), 1) if n_a else round(base_queue * 0.5, 1)

        return {
            "port_id": port_id,
            "anchored_vessels_count": n_a,
            "underway_nearby_count": n_u,
            "estimated_waiting_days": wait_days,
            "congestion_index": round(index, 1),
        }
