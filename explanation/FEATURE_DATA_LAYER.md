# Feature — Data layer, commodities, and admin

Supporting features that feed every screen. Not a user-facing “module” in the sidebar, but they are product features.

---

## SQLite (`FreightDBManager`)

**File:** `src/data/db_manager.py`  
**DB:** `data/processed/freight_data.db`

Tables include ports, vessel classes, routes, live vessel tracking, congestion cache, news, chokepoints, risk weights. JSON masters in `data/reference/` are seeded on init. In-memory caches TTL ~10 minutes.

---

## Unified freight timeseries

**Builder:** `src/data/freight_rate_synthesizer.py`  
**Output:** `data/processed/unified_freight_timeseries.csv`  
**Rebuild API:** `POST /api/v1/admin/rebuild-dataset`

Combines OGD-style port stats and macro series with **calibrated synthetic** route×class rates where Baltic is unavailable. `train_models.py` rebuilds a long history then fits models.

API timeseries cache TTL 10 minutes (`get_cached_timeseries_df`).

---

## External clients

| Client | Feature it enables |
| --- | --- |
| `ogd_client.py` | Official Indian port throughput / turnaround (dashboard wait KPI) |
| `worldbank_pinksheet.py` | Coal, iron ore, energy; copilot + `/commodities` |
| `twelvedata_client.py` | FX / energy if key set |
| `fred_client.py` | Brent, USDINR, coal, iron, WTI for dashboard and map |
| `openmeteo_client.py` | Wave/swell; no key |
| `aisstream_client.py` | Live AIS + congestion |
| `gfw_client.py` | Cargo vessel list for map and vessel optimizer fleet |
| `news_client.py` | RSS/GDELT + fallback headlines |

`GET /api/v1/commodities` → `CommodityPriceTracker.get_detailed_commodity_snapshot()`.

---

## Admin CRUD (API only; no first-class UI)

Under `/api/v1/admin/`:

- ports, routes, vessels, fleet (POST/DELETE)  
- chokepoints GET/POST/DELETE  
- risk-weights GET/POST  
- rebuild-dataset  

These mutate SQLite so a demo can add a chokepoint or retune NLP risk weights without editing JSON by hand.

---

## Health

`GET /api/v1/health` — `status: online` and flags for forecasting, vessel optimizer, market timing, risk engine.

---

## Honesty

Live keys are optional. Missing AIS/FRED/news → cache, fallbacks, or demo headlines. State that clearly in pitches; see [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) “Honesty about data”.
