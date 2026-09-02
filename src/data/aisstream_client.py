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
import websockets
from dotenv import load_dotenv
from src.data.db_manager import FreightDBManager

load_dotenv()
logger = logging.getLogger(__name__)

AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream"
# Hard cap for UI / DB — AIS near busy ports still floods without this
MAX_TRACKED_VESSELS = 120


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

    def build_corridor_bounding_boxes(self, radius_deg: float = 0.45) -> List[List[List[float]]]:
        """Build tight AIS boxes around Indian discharge + global load ports only."""
        ports_master = self.db.load_ports_master()
        boxes: List[List[List[float]]] = []
        for section in ("indian_east_coast_ports", "global_load_ports"):
            for port in (ports_master.get(section) or {}).values():
                coords = port.get("coordinates") or {}
                lat, lon = coords.get("lat"), coords.get("lon")
                if lat is None or lon is None:
                    continue
                boxes.append(self.get_port_bounding_box(float(lat), float(lon), radius_deg))
        # Fallback: Bay of Bengal / East Coast India if ports file is empty
        return boxes or [[[5.0, 75.0], [25.0, 95.0]]]

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

    async def start_background_vessel_tracker(self, bounding_boxes=None):
        """Continuously streams live AIS data and updates the live_vessels table."""
        if not self.api_key:
            logger.warning("No AISSTREAM_API_KEY, background tracker disabled.")
            self.connected = False
            self.last_error = "missing_api_key"
            return

        if not bounding_boxes:
            # Full-world boxes overwhelm AISStream (esp. post Sept 2026 bandwidth limits)
            # and trip disconnects. Scope to freight-relevant port corridors only.
            bounding_boxes = self.build_corridor_bounding_boxes()

        subscription_message = {
            "APIKey": self.api_key,
            "BoundingBoxes": bounding_boxes,
            "FilterMessageTypes": ["PositionReport"]
        }

        # Keep a rolling buffer of latest vessels (hard-capped)
        vessel_buffer = {}
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
                        len(bounding_boxes),
                        MAX_TRACKED_VESSELS,
                    )

                    while True:
                        try:
                            message = await asyncio.wait_for(ws.recv(), timeout=30.0)
                            data = json.loads(message)
                            self.last_message_at = time.time()

                            if data.get("MessageType") == "SubscriptionConfirmation":
                                continue

                            if "Message" in data and "PositionReport" in data["Message"]:
                                report = data["Message"]["PositionReport"]
                                mmsi = str(report.get("UserID"))
                                sog = float(report.get("Sog", 0) or 0)

                                # Prefer ships that look like cargo traffic (moving or near-anchor)
                                # Skip ultra-fast outliers (likely passenger / erroneous)
                                if sog > 22:
                                    continue

                                vessel_buffer[mmsi] = {
                                    "id": f"live_{mmsi}",
                                    "name": f"MV LIVE {mmsi}",
                                    "class": "Cargo / Live AIS",
                                    "mmsi": mmsi,
                                    "lat": report.get("Latitude", 0),
                                    "lon": report.get("Longitude", 0),
                                    "speed": sog,
                                    "heading": report.get("TrueHeading", 0) if report.get("TrueHeading") != 511 else report.get("Cog", 0),
                                    "origin": "Unknown (Live)",
                                    "dest": "Unknown (Live)",
                                    "cargo": "Unknown",
                                    "status": "Underway" if sog > 0.5 else "At Anchor",
                                    "progress_pct": 50,
                                    "wait_time_hours": 0.0,
                                    "last_update": datetime.now(timezone.utc).isoformat()
                                }

                                # Evict oldest keys if buffer exceeds cap
                                if len(vessel_buffer) > MAX_TRACKED_VESSELS:
                                    overflow = len(vessel_buffer) - MAX_TRACKED_VESSELS
                                    for old_key in list(vessel_buffer.keys())[:overflow]:
                                        vessel_buffer.pop(old_key, None)

                            # Replace DB snapshot every 15s so table never accumulates history
                            if time.time() - last_save > 15.0 and vessel_buffer:
                                ships = list(vessel_buffer.values())[-MAX_TRACKED_VESSELS:]
                                self.db.save_live_vessels(
                                    ships,
                                    replace=True,
                                    max_keep=MAX_TRACKED_VESSELS,
                                )
                                last_save = time.time()

                        except asyncio.TimeoutError:
                            # Keep alive — no traffic for 30s is fine on regional boxes
                            continue

            except Exception as e:
                self.connected = False
                self.last_error = str(e)[:160]
                logger.error(f"AISStream disconnected ({e}). Reconnecting in 5s...")
                await asyncio.sleep(5)

    def get_port_congestion_estimate(self, port_id: str, historical_avg_waiting: float = 2.5) -> Dict[str, Any]:
        """
        Computes dynamic port congestion score (0-100), estimated anchored vessels, and waiting days
        based on active fleet proximity, port physical capacity, draft constraints, and lighterage requirements.
        """
        # 1. Check cached congestion
        cached = self.db.get_port_congestion(port_id)
        if cached:
            return {
                "port_id": port_id,
                "anchored_vessels_count": cached["anchored_vessels"],
                "estimated_waiting_days": cached["avg_wait_days"],
                "congestion_index": cached["congestion_index"],
                "congestion_status": cached["congestion_status"]
            }

        # 2. Dynamic computation using port master specs and live fleet state
        ports_master = self.db.load_ports_master()
        indian_ports = ports_master.get("indian_east_coast_ports", {})
        global_ports = ports_master.get("global_load_ports", {})
        port_info = indian_ports.get(port_id) or global_ports.get(port_id, {})
        port_name = port_info.get("port_name", port_id)

        # Query live vessels near or destined for this port
        live_vessels = self.db.get_live_vessels()
        p_sub = port_id.split("_")[-1].lower()

        anchored_count = 0
        en_route_count = 0
        total_wait_hours = 0.0

        for v in live_vessels:
            dest = (v.get("dest") or v.get("destination") or "").lower()
            orig = (v.get("origin") or "").lower()
            if p_sub in dest or p_sub in orig or port_name.lower().split(" ")[0] in dest:
                if v.get("status") == "At Anchor":
                    anchored_count += 1
                    total_wait_hours += float(v.get("wait_time_hours", 0.0))
                else:
                    en_route_count += 1

        # Baseline physical factors
        handling_capacity = port_info.get("handling_capacity_mtpa", 50.0)
        lighterage_required = port_info.get("lighterage_required", False)
        base_queue_days = port_info.get("average_queue_waiting_days", 1.8)

        # Dynamic congestion index calculation
        draft_penalty = 15.0 if port_info.get("max_permissible_draft_m", 15.0) < 10.0 else 0.0
        lighterage_penalty = 20.0 if lighterage_required else 0.0
        traffic_factor = min(40.0, (anchored_count * 8.0) + (en_route_count * 2.0))

        computed_index = min(100.0, max(10.0, 15.0 + traffic_factor + draft_penalty + lighterage_penalty))
        computed_wait_days = round(base_queue_days + (anchored_count * 0.15), 1)
        est_anchored = max(anchored_count, int(computed_index / 6.0))

        if computed_index < 35:
            status = "Low Congestion (Fast Turnaround)"
        elif computed_index < 65:
            status = "Moderate Congestion (Normal Waiting)"
        else:
            status = "High Congestion / Demurrage Risk"

        # Save to database cache
        self.db.save_port_congestion(
            port_id=port_id,
            port_name=port_name,
            anchored=est_anchored,
            wait_days=computed_wait_days,
            congestion_index=round(computed_index, 1),
            status=status
        )

        return {
            "port_id": port_id,
            "anchored_vessels_count": est_anchored,
            "estimated_waiting_days": computed_wait_days,
            "congestion_index": round(computed_index, 1),
            "congestion_status": status
        }
