"""
Background Fleet & Weather Worker for SIH26006.
================================================
Periodically refreshes:
  1. Live AIS Fleet: Syncs active bulk carrier fleet from Open Waters & Digitraffic APIs.
  2. Bunker & Commodity Spot Rates: Refreshes Singapore VLSFO/MGO, Brent, USD/INR, Coal & Iron Ore.
  3. Marine Weather / Sea State: Pre-warms cache for key Indian destination ports & strategic chokepoints.

Can run:
  - Inside FastAPI application via startup background task
  - Standalone via `python -m src.data.background_worker`
"""

import argparse
import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

from src.data.db_manager import FreightDBManager
from src.data.fleet_sync import sync_fleet_from_apis
from src.data.openmeteo_client import OpenMeteoMarineClient
from src.data.worldbank_pinksheet import CommodityPriceTracker

logger = logging.getLogger("freightiq.worker")

# Key maritime hubs for sea state pre-warming
STRATEGIC_WEATHER_POINTS = [
    {"name": "Visakhapatnam Port", "lat": 17.68, "lon": 83.21},
    {"name": "Paradip Port", "lat": 20.31, "lon": 86.61},
    {"name": "Haldia Port", "lat": 22.06, "lon": 88.06},
    {"name": "Chennai Port", "lat": 13.08, "lon": 80.27},
    {"name": "Krishnapatnam Port", "lat": 14.25, "lon": 80.12},
    {"name": "Strait of Malacca", "lat": 2.50, "lon": 101.50},
    {"name": "Bab el-Mandeb", "lat": 12.60, "lon": 43.30},
    {"name": "Strait of Hormuz", "lat": 26.56, "lon": 56.25},
]


class BackgroundFleetAndMarketWorker:
    """Lightweight background scheduler for live fleet sync, bunker fuel rates, and marine weather."""

    def __init__(
        self,
        db_manager: FreightDBManager | None = None,
        commodity_tracker: CommodityPriceTracker | None = None,
        weather_client: OpenMeteoMarineClient | None = None,
        interval_minutes: int = 15,
    ):
        self.db = db_manager or FreightDBManager()
        self.commodity_tracker = commodity_tracker or CommodityPriceTracker(self.db)
        self.weather_client = weather_client or OpenMeteoMarineClient()
        self.interval_seconds = max(60, int(interval_minutes * 60))
        self._running = False
        self._task: asyncio.Task | None = None
        self._is_refreshing = False

        self.last_run_at: str | None = None
        self.next_run_at: str | None = None
        self.last_status: str = "idle"
        self.run_count: int = 0
        self.last_error: str | None = None
        self.last_summary: dict[str, Any] = {}

    async def run_cycle(self) -> dict[str, Any]:
        """Executes one complete refresh cycle across fleet, bunker, and weather."""
        if self._is_refreshing:
            logger.info("Worker refresh cycle already in progress, skipping concurrent run.")
            return {"status": "in_progress", "run_count": self.run_count}

        self._is_refreshing = True
        cycle_start = time.time()
        logger.info("🔄 Starting background sync cycle (fleet, bunker prices, sea state)...")

        summary: dict[str, Any] = {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "fleet": {},
            "bunker_and_commodities": {},
            "weather": {},
        }

        # 1. Sync Active Fleet from AIS APIs
        try:
            fleet_res = await asyncio.to_thread(sync_fleet_from_apis, self.db)
            summary["fleet"] = {
                "upserted": fleet_res.get("upserted", 0),
                "openwaters_fetched": fleet_res.get("openwaters_fetched", 0),
                "digitraffic_fetched": fleet_res.get("digitraffic_fetched", 0),
            }
            logger.info("✅ Fleet sync: %s vessels updated", fleet_res.get("upserted", 0))
        except Exception as e:
            logger.warning("⚠️ Fleet sync step error: %s", e)
            summary["fleet"] = {"error": str(e)}

        # 2. Refresh Bunker Fuel & Commodity Spot Rates
        try:
            market_snap = await asyncio.to_thread(
                self.commodity_tracker.get_detailed_commodity_snapshot,
                force_refresh=True,
            )
            summary_snap = market_snap.get("summary", {})
            benchmarks = market_snap.get("benchmarks", {})

            summary["bunker_and_commodities"] = {
                "singapore_vlsfo_usd": summary_snap.get("vlsfo_singapore_usd")
                or benchmarks.get("vlsfo_bunker_fuel_singapore_usd_per_mt", {}).get("price"),
                "singapore_mgo_usd": benchmarks.get("mgo_bunker_fuel_singapore_usd_per_mt", {}).get("price"),
                "brent_crude_usd": summary_snap.get("brent_crude_usd"),
                "usd_inr": summary_snap.get("usd_inr"),
                "newcastle_coal_usd": summary_snap.get("newcastle_coal_usd"),
            }
            logger.info(
                "✅ Market sync: VLSFO $%s/MT, Brent $%s/bbl, USD/INR %s",
                summary["bunker_and_commodities"].get("singapore_vlsfo_usd"),
                summary["bunker_and_commodities"].get("brent_crude_usd"),
                summary["bunker_and_commodities"].get("usd_inr"),
            )
        except Exception as e:
            logger.warning("⚠️ Bunker/commodity sync step error: %s", e)
            summary["bunker_and_commodities"] = {"error": str(e)}

        # 3. Pre-warm Marine Weather / Sea State
        weather_warmed = 0
        for pt in STRATEGIC_WEATHER_POINTS:
            try:
                await asyncio.to_thread(self.weather_client.get_sea_state, pt["lat"], pt["lon"])
                weather_warmed += 1
            except Exception as e:
                logger.debug("Weather pre-fetch for %s failed: %s", pt["name"], e)

        summary["weather"] = {
            "hubs_refreshed": weather_warmed,
            "total_hubs": len(STRATEGIC_WEATHER_POINTS),
        }
        logger.info("✅ Sea state cache pre-warmed for %s maritime hubs", weather_warmed)

        elapsed = round(time.time() - cycle_start, 2)
        summary["duration_seconds"] = elapsed
        summary["completed_at"] = datetime.now(timezone.utc).isoformat()

        self.last_run_at = summary["completed_at"]
        self.next_run_at = datetime.fromtimestamp(time.time() + self.interval_seconds, timezone.utc).isoformat()
        self.run_count += 1
        self.last_status = "healthy"
        self.last_summary = summary
        self._is_refreshing = False

        logger.info("✨ Background sync cycle #%s complete in %ss", self.run_count, elapsed)
        return summary

    async def _loop(self):
        """Worker continuous loop with sleep interval."""
        logger.info(
            "🚀 Background Fleet & Market Worker active (Interval: %s minutes)",
            round(self.interval_seconds / 60, 1),
        )
        self._running = True

        # First cycle runs shortly after startup (after 5s delay to let server boot)
        await asyncio.sleep(5)

        while self._running:
            try:
                await self.run_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.last_error = str(e)
                self.last_status = "error"
                logger.error("Unexpected error in background worker cycle: %s", e, exc_info=True)

            try:
                await asyncio.sleep(self.interval_seconds)
            except asyncio.CancelledError:
                break

        logger.info("Background Fleet & Market Worker loop terminated.")

    def start(self) -> asyncio.Task:
        """Starts the worker loop as an asyncio Task."""
        if self._task is not None and not self._task.done():
            return self._task
        self._running = True
        self._task = asyncio.create_task(self._loop())
        return self._task

    async def stop(self):
        """Gracefully halts the background loop."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Background worker stopped.")

    def get_status(self) -> dict[str, Any]:
        """Returns worker health and last execution telemetry."""
        return {
            "running": self._running and (self._task is not None and not self._task.done()),
            "status": self.last_status,
            "interval_minutes": round(self.interval_seconds / 60, 1),
            "run_count": self.run_count,
            "last_run_at": self.last_run_at,
            "next_run_at": self.next_run_at,
            "last_error": self.last_error,
            "last_summary": self.last_summary,
        }


# Global singleton instance
_WORKER_INSTANCE: BackgroundFleetAndMarketWorker | None = None


def get_background_worker(interval_minutes: int | None = None) -> BackgroundFleetAndMarketWorker:
    """Returns or initializes the global BackgroundFleetAndMarketWorker singleton."""
    global _WORKER_INSTANCE
    if _WORKER_INSTANCE is None:
        env_interval = int(os.environ.get("BACKGROUND_WORKER_INTERVAL_MINUTES", "15"))
        interval = interval_minutes if interval_minutes is not None else env_interval
        _WORKER_INSTANCE = BackgroundFleetAndMarketWorker(interval_minutes=interval)
    return _WORKER_INSTANCE


async def _run_cli():
    parser = argparse.ArgumentParser(description="FreightIQ Background Fleet & Market Worker")
    parser.add_argument("--interval", type=int, default=15, help="Sync interval in minutes (default: 15)")
    parser.add_argument("--run-once", action="store_true", help="Execute a single refresh cycle and exit")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    worker = BackgroundFleetAndMarketWorker(interval_minutes=args.interval)
    if args.run_once:
        print("Executing single sync cycle...")
        summary = await worker.run_cycle()
        print(f"Cycle finished. Upserted: {summary.get('fleet', {}).get('upserted')} vessels.")
    else:
        print(f"Starting continuous worker every {args.interval} minutes. Press Ctrl+C to stop.")
        try:
            await worker._loop()
        except KeyboardInterrupt:
            print("\nStopping worker...")
            await worker.stop()


if __name__ == "__main__":
    asyncio.run(_run_cli())
