"""
Live vessel positions for the FreightIQ map.

Despite the historical name, this module does NOT call Global Fishing Watch for
positions. Live AIS is ingested by AISStream + Open Waters into SQLite
(`vessels_live_tracking`). This client reads that table and builds map/API
payloads. Corridor positions are a last-resort demo fallback only.
"""

import logging
import math
import os
import time
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv

from src.data.db_manager import FreightDBManager

load_dotenv()
logger = logging.getLogger(__name__)

# If fewer than this many live AIS fixes exist in India ROI, add corridor demos
CORRIDOR_FALLBACK_THRESHOLD = int(os.getenv("VESSEL_CORRIDOR_FALLBACK_THRESHOLD", "8") or 8)
# Target map density for demos — live AIS first, then labeled modeled fill
DEMO_FLEET_TARGET = int(os.getenv("VESSEL_DEMO_FLEET_TARGET", "55") or 55)
# Port proximity for congestion badges (~20–25 nm)
PORT_RADIUS_DEG = float(os.getenv("VESSEL_PORT_RADIUS_DEG", "0.40") or 0.40)


def _dist_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return math.hypot(lat1 - lat2, lon1 - lon2)


def vessels_near_port(
    vessels: list[dict[str, Any]],
    lat: float,
    lon: float,
    radius_deg: float = PORT_RADIUS_DEG,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
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

    def __init__(self, db_manager: FreightDBManager | None = None):
        self.cache_ttl = 30  # seconds — fleet should feel live
        self._vessels_cache = None
        self._last_fetch_time = 0.0
        self.db = db_manager or FreightDBManager()

    def _interpolate_corridor_position(self, waypoints: list[list[float]], progress_ratio: float) -> tuple:
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

    def _generate_dynamic_fleet_positions(self) -> list[dict[str, Any]]:
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
                "source_label": "Modeled corridor",
                "last_update": datetime.now(timezone.utc).isoformat(),
            })

        return live_vessels

    def _generate_modeled_anchorage_fill(self) -> list[dict[str, Any]]:
        """
        Modest labeled anchorage/approach ships near Indian East Coast ports.
        Density tracks port queue hints — not a fake worldwide AIS dump.
        """
        ports_master = self.db.load_ports_master()
        indian = ports_master.get("indian_east_coast_ports") or {}
        vessels_data = self.db.load_vessels_master()
        active_fleet = vessels_data.get("active_fleet") or []
        vessel_specs = vessels_data.get("vessel_classes") or {}
        classes = ["Handysize", "Supramax", "Panamax", "Kamsarmax", "Capesize"]
        now_iso = datetime.now(timezone.utc).isoformat()
        now_sec = time.time()
        out: list[dict[str, Any]] = []

        for i, (port_id, port) in enumerate(indian.items()):
            coords = port.get("coordinates") or {}
            try:
                plat, plon = float(coords.get("lat")), float(coords.get("lon"))
            except (TypeError, ValueError):
                continue
            queue_days = float(port.get("average_queue_waiting_days") or 1.8)
            n_anchor = max(2, min(5, int(round(1.5 + queue_days))))
            cargoes = port.get("primary_bulk_cargoes") or ["Bulk Cargo"]
            port_name = port.get("port_name", port_id)

            for j in range(n_anchor):
                angle = (j / max(1, n_anchor)) * 2 * math.pi + i * 0.31
                r = 0.10 + (j % 3) * 0.04
                lat = plat + math.sin(angle) * r * 0.6
                lon = plon + math.cos(angle) * r + 0.06
                v_class = classes[(i + j) % len(classes)]
                vessel = active_fleet[(i + j) % len(active_fleet)] if active_fleet else {}
                spec = vessel_specs.get(v_class, {})
                out.append({
                    "id": f"modeled_anchor_{port_id}_{j}",
                    "name": vessel.get("vessel_name") or vessel.get("name") or f"MV {port_id[-3:]} Queue {j + 1}",
                    "class": v_class,
                    "mmsi": f"4198{10000 + i * 10 + j}",
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "speed": 0.0,
                    "heading": round((angle * 180 / math.pi) % 360, 1),
                    "origin": "Load Port",
                    "dest": port_name,
                    "cargo": cargoes[j % len(cargoes)],
                    "dwt": spec.get("typical_capacity_mt", 75000),
                    "draft_m": spec.get("design_draft_laden_m", 14.2),
                    "operator": vessel.get("operator", "Modeled East Coast Fleet"),
                    "status": "At Anchor",
                    "progress_pct": 100,
                    "eta_days": 0.0,
                    "wait_time_hours": round(8.0 + queue_days * 6 + j * 3, 1),
                    "source": "modeled_anchorage",
                    "source_label": "Modeled anchorage",
                    "last_update": now_iso,
                })

            for j in range(1 + (i % 2)):
                progress = ((now_sec / 5400) + i * 0.13 + j * 0.37) % 1.0
                start_lat, start_lon = plat - 1.1 - j * 0.2, plon + 1.6 + j * 0.25
                lat = start_lat + (plat - start_lat) * progress
                lon = start_lon + (plon - 0.12 - start_lon) * progress
                heading = (math.degrees(math.atan2(plon - lon, plat - lat)) + 360) % 360
                v_class = classes[(i + j + 2) % len(classes)]
                vessel = active_fleet[(i + j + 2) % len(active_fleet)] if active_fleet else {}
                spec = vessel_specs.get(v_class, {})
                out.append({
                    "id": f"modeled_approach_{port_id}_{j}",
                    "name": vessel.get("vessel_name") or vessel.get("name") or f"MV Approach {port_id[-3:]}-{j + 1}",
                    "class": v_class,
                    "mmsi": f"5389{10000 + i * 10 + j}",
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "speed": round(10.8 + j * 0.6, 1),
                    "heading": round(heading, 1),
                    "origin": "Bay of Bengal",
                    "dest": port_name,
                    "cargo": cargoes[j % len(cargoes)],
                    "dwt": spec.get("typical_capacity_mt", 75000),
                    "draft_m": spec.get("design_draft_laden_m", 14.2),
                    "operator": vessel.get("operator", "Modeled East Coast Fleet"),
                    "status": "Underway",
                    "progress_pct": int(progress * 100),
                    "eta_days": round(max(0.4, (1.0 - progress) * 3.5), 1),
                    "wait_time_hours": 0.0,
                    "source": "modeled_anchorage",
                    "source_label": "Modeled approach",
                    "last_update": now_iso,
                })

        return out

    def get_live_cargo_vessels(self, limit: int | None = 700) -> list[dict[str, Any]]:
        """
        Hybrid fleet for maps/APIs:
          1. Live AIS in India ROI (AISStream + Open Waters → SQLite) — primary
          2. Labeled modeled corridor + anchorage fill when live coverage is thin
        """
        from src.data.aisstream_client import is_near_india

        current_time = time.time()
        lim = 700 if limit is None else max(1, int(limit))
        if self._vessels_cache and (current_time - self._last_fetch_time < self.cache_ttl):
            return self._vessels_cache[:lim]

        live_rows = self.db.get_live_vessels(limit=max(lim * 2, 1400))
        india_ships: list[dict[str, Any]] = []
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
            vv["source_label"] = "Live AIS"
            if float(vv.get("speed") or 0) <= 0.5:
                vv["status"] = "At Anchor"
            elif (vv.get("status") or "") in ("En Route", "Underway", ""):
                vv["status"] = "Underway"
            india_ships.append(vv)

        live_count = len(india_ships)
        need_fill = live_count < max(CORRIDOR_FALLBACK_THRESHOLD, DEMO_FLEET_TARGET)

        def _absorb(candidates: list[dict[str, Any]]):
            for v in candidates:
                if len(india_ships) >= lim:
                    break
                try:
                    lat, lon = float(v.get("lat") or 0), float(v.get("lon") or 0)
                except (TypeError, ValueError):
                    continue
                if not is_near_india(lat, lon):
                    continue
                vid = v.get("id")
                if not vid or vid in seen:
                    continue
                too_close = False
                for live_v in india_ships:
                    if live_v.get("source") != "ais_live":
                        continue
                    if abs(float(live_v["lat"]) - lat) < 0.035 and abs(float(live_v["lon"]) - lon) < 0.035:
                        too_close = True
                        break
                if too_close:
                    continue
                seen.add(vid)
                if not v.get("source_label"):
                    src = v.get("source") or "modeled"
                    v["source_label"] = "Modeled" if str(src).startswith("modeled") else "Live AIS"
                india_ships.append(v)

        if need_fill:
            _absorb(self._generate_modeled_anchorage_fill())
            _absorb(self._generate_dynamic_fleet_positions())

        india_ships.sort(key=lambda v: 0 if v.get("source") == "ais_live" else 1)
        self._vessels_cache = india_ships[:lim]
        self._last_fetch_time = current_time
        modeled_n = sum(1 for v in self._vessels_cache if str(v.get("source") or "").startswith("modeled"))
        logger.info(
            "Fleet ready: %s ships (%s live AIS, %s modeled, target=%s)",
            len(self._vessels_cache),
            live_count,
            modeled_n,
            DEMO_FLEET_TARGET,
        )
        return self._vessels_cache
