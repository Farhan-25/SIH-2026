"""
AISStream.io WebSocket Client & Dynamic Port Congestion Monitor.
Streams live vessel positions in target bounding boxes and computes dynamic anchorage queue metrics.
"""

import os
import json
import asyncio
import logging
import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import requests
import websockets
from dotenv import load_dotenv
from src.data.db_manager import FreightDBManager

load_dotenv()
logger = logging.getLogger(__name__)

AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream"
OPENWATERS_VESSELS_URL = "https://ais.openwaters.io/v1/vessels"
# Snapshot cap — denser India coverage without going worldwide
MAX_TRACKED_VESSELS = 700
# Live AIS for ROI ports — set AISSTREAM_LIVE_TRACKING=0 to disable
AIS_LIVE_TRACKING_ENABLED = os.getenv("AISSTREAM_LIVE_TRACKING", "1").strip().lower() not in ("0", "false", "no", "off")
OPENWATERS_POLL_SECONDS = int(os.getenv("OPENWATERS_POLL_SECONDS", "45") or 45)

# Broad India maritime interest zone — keep AIS subscription lean (few large tiles)
INDIA_REGION_BOXES = [
    # Entire Bay of Bengal + East Coast (main map area)
    [[8.0, 78.0], [23.5, 95.0]],
    # South India / Palk Bay / west tip approaches
    [[5.5, 74.0], [14.0, 82.5]],
]


def _ship_type_label(ais_type: int) -> str:
    if 70 <= ais_type <= 79:
        return "Cargo / Live AIS"
    if 80 <= ais_type <= 89:
        return "Tanker / Live AIS"
    if ais_type == 30:
        return "Fishing"
    if ais_type in (36, 37):
        return "Pleasure"
    return "Merchant / Live AIS"


def _is_freight_relevant(ais_type: int) -> bool:
    # Keep cargo/tanker/unknown/other; drop pleasure craft noise
    if ais_type in (36, 37):
        return False
    return True


def _box_contains(box, lat: float, lon: float) -> bool:
    (lat_min, lon_min), (lat_max, lon_max) = box[0], box[1]
    lo_lat, hi_lat = min(lat_min, lat_max), max(lat_min, lat_max)
    lo_lon, hi_lon = min(lon_min, lon_max), max(lon_min, lon_max)
    return lo_lat <= lat <= hi_lat and lo_lon <= lon <= hi_lon


def is_near_india(lat: float, lon: float) -> bool:
    return any(_box_contains(box, lat, lon) for box in INDIA_REGION_BOXES)


class AISPortCongestionTracker:
    """Monitors live vessel counts and anchorage congestion in port bounding boxes."""

    def __init__(self, api_key: Optional[str] = None, db_manager: Optional[FreightDBManager] = None):
        self.api_key = api_key or os.getenv("AISSTREAM_API_KEY", "")
        self.db = db_manager or FreightDBManager()
        self.connected = False
        self.last_error: Optional[str] = None
        self.last_message_at: Optional[float] = None

    def get_port_bounding_box(self, lat: float, lon: float, radius_deg: float = 0.3) -> List[List[float]]:
        """Creates bounding box [[lat_min, lon_min], [lat_max, lon_max]] around port coordinates."""
        return [
            [lat - radius_deg, lon - radius_deg],
            [lat + radius_deg, lon + radius_deg]
        ]

    def build_corridor_bounding_boxes(self, radius_deg: float = 1.2) -> List[List[List[float]]]:
        """Few large India tiles — many small boxes starve AISStream delivery."""
        return [list(b) for b in INDIA_REGION_BOXES]

    def build_load_port_bounding_boxes(self, radius_deg: float = 0.5) -> List[List[List[float]]]:
        """Optional smaller boxes around foreign load ports (not used for primary map feed)."""
        ports_master = self.db.load_ports_master()
        routes_master = self.db.load_routes_master()
        routes_list = routes_master.get("trade_routes", []) if isinstance(routes_master, dict) else (routes_master or [])
        wanted = {r.get("origin_port") for r in routes_list if r.get("origin_port")}
        boxes = []
        for port_id, port in (ports_master.get("global_load_ports") or {}).items():
            if wanted and port_id not in wanted:
                continue
            coords = port.get("coordinates") or {}
            lat, lon = coords.get("lat"), coords.get("lon")
            if lat is None or lon is None:
                continue
            boxes.append(self.get_port_bounding_box(float(lat), float(lon), radius_deg))
        return boxes

    def point_in_interest_region(self, lat: float, lon: float, boxes: Optional[List] = None) -> bool:
        """True if lat/lon falls inside any ROI bounding box."""
        boxes = boxes or self.build_corridor_bounding_boxes()
        return any(_box_contains(box, lat, lon) for box in boxes)

    async def sample_live_vessels(self, bounding_box: List[List[float]], duration_seconds: int = 5) -> List[Dict[str, Any]]:
        """Connect to AISStream WebSocket for N seconds and capture active vessels within bounding box."""
        if not self.api_key:
            return []

        subscription_message = {
            "APIKey": self.api_key,
            "BoundingBoxes": [bounding_box],
            "FilterMessageTypes": ["PositionReport", "ShipStaticData"]
        }

        vessels_seen = []
        try:
            async with websockets.connect(AISSTREAM_WS_URL, open_timeout=5, max_queue=64) as ws:
                await ws.send(json.dumps(subscription_message))
                end_time = asyncio.get_event_loop().time() + duration_seconds

                while asyncio.get_event_loop().time() < end_time:
                    try:
                        message = await asyncio.wait_for(ws.recv(), timeout=2.0)
                        data = json.loads(message)
                        vessels_seen.append(data)
                    except asyncio.TimeoutError:
                        continue
        except Exception as e:
            logger.info(f"AISStream live connection notice: {e}")

        return vessels_seen

    def fetch_openwaters_vessels(self, boxes: Optional[List[List[List[float]]]] = None) -> List[Dict[str, Any]]:
        """
        Pull latest India-ROI positions from Open Waters (AISHub + open feeds).
        No API key required — complements sparse AISStream coverage.
        """
        boxes = boxes or self.build_corridor_bounding_boxes()
        by_mmsi: Dict[str, Dict[str, Any]] = {}
        now_iso = datetime.now(timezone.utc).isoformat()

        for box in boxes:
            (lat_a, lon_a), (lat_b, lon_b) = box[0], box[1]
            bbox = ",".join(
                str(round(x, 4))
                for x in (min(lat_a, lat_b), min(lon_a, lon_b), max(lat_a, lat_b), max(lon_a, lon_b))
            )
            try:
                resp = requests.get(
                    OPENWATERS_VESSELS_URL,
                    params={"bbox": bbox},
                    timeout=20,
                )
                if resp.status_code != 200:
                    logger.warning("Open Waters HTTP %s for bbox=%s", resp.status_code, bbox)
                    continue
                features = (resp.json() or {}).get("features") or []
            except Exception as e:
                logger.warning("Open Waters fetch failed (%s): %s", bbox, e)
                continue

            for feat in features:
                props = feat.get("properties") or {}
                geom = feat.get("geometry") or {}
                coords = geom.get("coordinates") or []
                if len(coords) < 2:
                    continue
                lon, lat = float(coords[0]), float(coords[1])
                mmsi = str(props.get("mmsi") or "").strip()
                if not mmsi:
                    continue
                try:
                    ais_type = int(props.get("type") or 0)
                except (TypeError, ValueError):
                    ais_type = 0
                if not _is_freight_relevant(ais_type):
                    continue
                sog = float(props.get("sog") or 0)
                if sog > 25:
                    continue
                heading = props.get("heading")
                if heading in (None, 511):
                    heading = props.get("cog") or 0
                name = (props.get("name") or "").strip() or f"MV LIVE {mmsi}"
                by_mmsi[mmsi] = {
                    "id": f"live_{mmsi}",
                    "name": name,
                    "class": _ship_type_label(ais_type),
                    "mmsi": mmsi,
                    "lat": lat,
                    "lon": lon,
                    "speed": sog,
                    "heading": float(heading or 0),
                    "origin": "Unknown (Live)",
                    "dest": "Unknown (Live)",
                    "cargo": "Unknown",
                    "status": "Underway" if sog > 0.5 else "At Anchor",
                    "progress_pct": 50,
                    "wait_time_hours": 0.0,
                    "near_india": is_near_india(lat, lon),
                    "source": f"openwaters:{(props.get('source') or 'ais')}",
                    "last_update": now_iso,
                }

        return list(by_mmsi.values())

    async def _poll_openwaters_loop(self, bounding_boxes=None):
        """Periodic REST snapshot from Open Waters → upsert into vessels_live_tracking."""
        boxes = bounding_boxes or self.build_corridor_bounding_boxes()
        while True:
            try:
                ships = await asyncio.to_thread(self.fetch_openwaters_vessels, boxes)
                if ships:
                    self.db.save_live_vessels(ships, replace=False, max_keep=MAX_TRACKED_VESSELS)
                    self.db.prune_stale_live_vessels(max_age_minutes=90)
                    self.last_message_at = time.time()
                    # Open Waters alone is enough to mark the tracker healthy
                    self.connected = True
                    if self.last_error and "openwaters" in (self.last_error or "").lower():
                        self.last_error = None
                    logger.info("Open Waters upserted %s India-ROI ships", len(ships))
            except Exception as e:
                logger.error("Open Waters poll error: %s", e)
                if not self.api_key:
                    self.connected = False
                    self.last_error = f"openwaters: {str(e)[:120]}"
            await asyncio.sleep(max(20, OPENWATERS_POLL_SECONDS))

    async def _run_aisstream_loop(self, bounding_boxes=None):
        """AISStream WebSocket stream → upsert (sparse over BoB, still useful)."""
        if not self.api_key:
            logger.info("No AISSTREAM_API_KEY — relying on Open Waters for live AIS.")
            return

        boxes = bounding_boxes or self.build_corridor_bounding_boxes()
        subscription_message = {
            "APIKey": self.api_key,
            "BoundingBoxes": boxes,
            "FilterMessageTypes": ["PositionReport"],
        }
        vessel_buffer: Dict[str, Dict[str, Any]] = {}
        last_save = time.time()

        while True:
            try:
                async with websockets.connect(
                    AISSTREAM_WS_URL,
                    open_timeout=10,
                    ping_interval=20,
                    ping_timeout=60,
                    max_queue=256,
                ) as ws:
                    await ws.send(json.dumps(subscription_message))
                    self.connected = True
                    self.last_error = None
                    logger.info(
                        "AISStream WebSocket connected (%s corridor boxes, max %s vessels).",
                        len(boxes),
                        MAX_TRACKED_VESSELS,
                    )

                    while True:
                        try:
                            message = await asyncio.wait_for(ws.recv(), timeout=30.0)
                            data = json.loads(message)
                            self.last_message_at = time.time()

                            if data.get("MessageType") == "SubscriptionConfirmation":
                                continue

                            msg_type = data.get("MessageType")
                            meta = data.get("MetaData") or {}
                            report = (data.get("Message") or {}).get("PositionReport") or {}
                            if msg_type != "PositionReport" and not report:
                                continue

                            mmsi = str(report.get("UserID") or meta.get("MMSI") or meta.get("mmsi") or "")
                            if not mmsi:
                                continue
                            lat = float(report.get("Latitude") or meta.get("latitude") or 0)
                            lon = float(report.get("Longitude") or meta.get("longitude") or 0)
                            sog = float(report.get("Sog") or 0)
                            if not lat and not lon:
                                continue
                            if sog > 25:
                                continue

                            ship_name = (meta.get("ShipName") or meta.get("shipName") or "").strip() or f"MV LIVE {mmsi}"

                            vessel_buffer[mmsi] = {
                                "id": f"live_{mmsi}",
                                "name": ship_name,
                                "class": "Cargo / Live AIS",
                                "mmsi": mmsi,
                                "lat": lat,
                                "lon": lon,
                                "speed": sog,
                                "heading": report.get("TrueHeading", 0) if report.get("TrueHeading") != 511 else report.get("Cog", 0),
                                "origin": "Unknown (Live)",
                                "dest": "Unknown (Live)",
                                "cargo": "Unknown",
                                "status": "Underway" if sog > 0.5 else "At Anchor",
                                "progress_pct": 50,
                                "wait_time_hours": 0.0,
                                "near_india": is_near_india(lat, lon),
                                "source": "aisstream",
                                "last_update": datetime.now(timezone.utc).isoformat(),
                            }

                            if len(vessel_buffer) > MAX_TRACKED_VESSELS:
                                ranked = sorted(
                                    vessel_buffer.items(),
                                    key=lambda kv: (0 if kv[1].get("near_india") else 1, kv[0]),
                                )
                                vessel_buffer = dict(ranked[:MAX_TRACKED_VESSELS])

                            if time.time() - last_save > 8.0 and vessel_buffer:
                                ships = list(vessel_buffer.values())
                                self.db.save_live_vessels(ships, replace=False, max_keep=MAX_TRACKED_VESSELS)
                                self.db.prune_stale_live_vessels(max_age_minutes=90)
                                last_save = time.time()
                                logger.info("AISStream upserted %s ships (buffer=%s)", len(ships), len(vessel_buffer))

                        except asyncio.TimeoutError:
                            continue

            except Exception as e:
                # Don't flip connected=False if Open Waters is still healthy
                self.last_error = f"aisstream: {str(e)[:140]}"
                logger.error("AISStream disconnected (%s). Reconnecting in 5s...", e)
                await asyncio.sleep(5)

    async def start_background_vessel_tracker(self, bounding_boxes=None):
        """Run AISStream + Open Waters together and merge into vessels_live_tracking."""
        if not AIS_LIVE_TRACKING_ENABLED:
            logger.info(
                "AIS live vessel tracking disabled (set AISSTREAM_LIVE_TRACKING=1 to enable). "
                "Map uses curated fleet instead."
            )
            self.connected = False
            self.last_error = "disabled"
            return

        boxes = bounding_boxes or self.build_corridor_bounding_boxes()
        logger.info(
            "Starting multi-source AIS tracker (AISStream=%s, Open Waters poll=%ss).",
            "yes" if self.api_key else "no",
            OPENWATERS_POLL_SECONDS,
        )
        await asyncio.gather(
            self._poll_openwaters_loop(boxes),
            self._run_aisstream_loop(boxes),
        )

    def get_port_congestion_estimate(self, port_id: str, historical_avg_waiting: float = 2.5) -> Dict[str, Any]:
        """
        Port congestion from live AIS near the port (same fleet the map shows).
        Cache TTL 3 minutes — never invent ship counts from the index formula.
        """
        from src.data.gfw_client import GFWClient, vessels_near_port

        cached = self.db.get_port_congestion(port_id)
        if cached and cached.get("updated_at"):
            try:
                updated = datetime.fromisoformat(cached["updated_at"])
                if updated.tzinfo is None:
                    updated = updated.replace(tzinfo=timezone.utc)
                age_s = (datetime.now(timezone.utc) - updated).total_seconds()
                if age_s < 180:
                    return {
                        "port_id": port_id,
                        "anchored_vessels_count": cached["anchored_vessels"],
                        "estimated_waiting_days": cached["avg_wait_days"],
                        "congestion_index": cached["congestion_index"],
                        "congestion_status": cached["congestion_status"],
                    }
            except (TypeError, ValueError):
                pass

        ports_master = self.db.load_ports_master()
        indian_ports = ports_master.get("indian_east_coast_ports", {})
        global_ports = ports_master.get("global_load_ports", {})
        port_info = indian_ports.get(port_id) or global_ports.get(port_id, {})
        port_name = port_info.get("port_name", port_id)
        coords = port_info.get("coordinates") or {}
        plat, plon = float(coords.get("lat") or 0), float(coords.get("lon") or 0)

        # Same fleet the map uses (live AIS + thin corridor fallback)
        gfw = GFWClient(db_manager=self.db)
        vessels = gfw.get_live_cargo_vessels(limit=700)
        anchored, underway = vessels_near_port(vessels, plat, plon) if plat or plon else ([], [])
        n_a, n_u = len(anchored), len(underway)

        base_queue_days = float(port_info.get("average_queue_waiting_days") or historical_avg_waiting)
        lighterage_required = bool(port_info.get("lighterage_required", False))
        draft = float(port_info.get("max_permissible_draft_m") or 15.0)

        traffic_factor = min(50.0, (n_a * 8.0) + (n_u * 3.0))
        draft_penalty = 15.0 if draft < 10.0 else 0.0
        lighterage_penalty = 20.0 if lighterage_required else 0.0
        computed_index = min(100.0, max(10.0, 12.0 + traffic_factor + draft_penalty + lighterage_penalty))
        computed_wait_days = round(base_queue_days * (0.6 + 0.1 * n_a), 1) if n_a else round(base_queue_days * 0.5, 1)

        if computed_index < 35:
            status = "Low Congestion (Fast Turnaround)"
        elif computed_index < 65:
            status = "Moderate Congestion (Normal Waiting)"
        else:
            status = "High Congestion / Demurrage Risk"

        self.db.save_port_congestion(
            port_id=port_id,
            port_name=port_name,
            anchored=n_a,
            wait_days=computed_wait_days,
            congestion_index=round(computed_index, 1),
            status=status,
        )

        return {
            "port_id": port_id,
            "anchored_vessels_count": n_a,
            "estimated_waiting_days": computed_wait_days,
            "congestion_index": round(computed_index, 1),
            "congestion_status": status,
        }
