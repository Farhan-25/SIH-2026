# Feature — Route map and live fleet

**Route:** `/routes` → `frontend/src/pages/RouteMapPage.jsx`  
**Helpers:** `frontend/src/lib/maplibre.js`, `frontend/src/components/VesselSidePanel.jsx`  
**API:** `GET /api/v1/map-intelligence` (cached ~120 s)

---

## What the user sees

- Carto basemaps via MapLibre (no Mapbox token): Dark Matter, Positron, Voyager  
- Indian discharge + global load ports with congestion badges  
- Trade-lane polylines from `routes_master.json` `waypoints`  
- Live / cached vessel markers (MMSI, class, speed, dest) — amber/cyan for live AIS, purple for modeled  
- Per-route composite risk from Module D  
- Marine weather at East Coast ports  
- FRED snapshots (oil, FX, coal, iron ore)  
- **Filter sidebar**: multi-select port and route filters — `visibleRoutes` and `visibleVessels` are memoized derived views, not separate fetches  
- **Time scrubber**: 0–72 h offset slider with auto-play (steps +6 h every 1.2 s)  
- **Vessel side panel**: opens on vessel click, shows full detail and route assignment

---

## Payload (`map-intelligence`)

| Key | Source |
| --- | --- |
| `vessels` | `GFWClient.get_live_cargo_vessels(limit=700)` — reads from `vessels_live_tracking` SQLite table, NOT Global Fishing Watch API |
| `ports.indian` | Master JSON + AIS congestion blend |
| `ports.global` | Master JSON + AIS estimate |
| `marine_weather` | Open-Meteo per Indian port (thread pool) |
| `market_indicators` | Shared FRED cache (5 min) |
| `route_risks` | `evaluate_corridor_risk` per trade route + waypoints |
| `api_status` | `gfw` / `ais` / `weather` / `fred` connected vs error |

AIS status: `connected` if the WebSocket is up; `offline` if no API key; else reconnecting with last error. Open Waters REST polls cargo snapshots every 45 s as a secondary fill. Congestion badges still render from SQLite while the socket is down.

---

## Vessel popups

`vesselPopupHTML` (in `maplibre.js`) generates compact HTML for MapLibre popups shared across the Command Centre and Route Map. Shows name, source (Live AIS vs modeled), status, class, speed, dest, MMSI. Amber/cyan vs purple distinguishes live vs modeled.

---

## Filter sidebar logic

`selectedRoutes` and `selectedPorts` are multi-select state arrays. `visibleRoutes` and `visibleVessels` are `useMemo` derived values — no extra API calls triggered by filtering. Vessel–port matching uses first-word tokenization of destination fields from `ALL_DESTINATION_PORTS`.

---

## Command Center overlap

Dashboard map widgets reuse the same `/map-intelligence` endpoint and `vesselPopupHTML` helper so fleet state is consistent with the Route Map.

---

## Limits

- UI **polls** every 90 s; it does not subscribe to the AIS WebSocket directly (server handles that).  
- `CORRIDOR_MATCH_DEG` (default 2.4° ≈ 150 nm) controls live AIS → route assignment tolerance.  
- `CORRIDOR_FALLBACK_THRESHOLD` (default 2) triggers named fleet fill when a lane has too few live ships.  
- Worldwide coverage is intentionally **India-heavy ROI**, not global AIS.
