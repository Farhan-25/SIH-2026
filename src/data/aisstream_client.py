"""
AISStream.io WebSocket Client & Dynamic Port Congestion Monitor.
Streams live vessel positions in target bounding boxes and computes dynamic anchorage queue metrics.
"""

import os
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import websockets
from dotenv import load_dotenv
from src.data.db_manager import FreightDBManager

load_dotenv()
logger = logging.getLogger(__name__)

AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream"


class AISPortCongestionTracker:
    """Monitors live vessel counts and anchorage congestion in port bounding boxes."""

    def __init__(self, api_key: Optional[str] = None, db_manager: Optional[FreightDBManager] = None):
        self.api_key = api_key or os.getenv("AISSTREAM_API_KEY", "")
        self.db = db_manager or FreightDBManager()

    def get_port_bounding_box(self, lat: float, lon: float, radius_deg: float = 0.3) -> List[List[float]]:
        """Creates bounding box [[lat_min, lon_min], [lat_max, lon_max]] around port coordinates."""
        return [
            [lat - radius_deg, lon - radius_deg],
            [lat + radius_deg, lon + radius_deg]
        ]

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
            async with websockets.connect(AISSTREAM_WS_URL, open_timeout=5) as ws:
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
