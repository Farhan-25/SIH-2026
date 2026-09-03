# Feature — Route map and live fleet

**Route:** `/routes` → `frontend/src/pages/RouteMapPage.jsx`  
**Helpers:** `frontend/src/lib/maplibre.js`, `frontend/src/components/VesselSidePanel.jsx`  
**API:** `GET /api/v1/map-intelligence` (cached ~120 s)

---

## What the user sees

- Carto basemaps via MapLibre (no Mapbox token): Dark Matter, Positron, Voyager  
- Indian discharge + global load ports with congestion  
- Trade-lane polylines from `routes_master.json` `waypoints`  
- Live / cached vessel markers (MMSI, class, speed, dest)  
- Per-route composite risk from Module D  
- Marine weather at East Coast ports  
- FRED snapshots (oil, FX, coal, iron ore)  
- Side panel when a vessel is selected  

Theme-aware map style follows light/dark preference where wired.

---

## Payload (`map-intelligence`)

| Key | Source |
| --- | --- |
| `vessels` | `GFWClient.get_live_cargo_vessels(limit=700)` |
| `ports.indian` | Master JSON + AIS congestion blend |
| `ports.global` | Master JSON + AIS estimate |
| `marine_weather` | Open-Meteo per Indian port (thread pool) |
| `market_indicators` | Shared FRED cache (5 min) |
| `route_risks` | `evaluate_corridor_risk` per trade route + waypoints |
| `api_status` | `gfw` / `ais` / `weather` / `fred` connected vs error |

AIS status: `connected` if the websocket is up; `offline` if no API key; else reconnecting with last error. Congestion can still render from SQLite while the socket is down.

---

## Vessel popups

`vesselPopupHTML` shows name, source (Live AIS vs modeled), status, class, speed, dest, MMSI. Amber/cyan vs purple distinguishes modeled vs live.

---

## Command Center overlap

Dashboard map widgets reuse the same intelligence endpoint and popup helper so fleet state matches the Route Map.

---

## Limits

- UI **polls**; it does not subscribe to the AIS websocket directly.  
- 3D ship models / predictive particles in `task.md` Phase 8 are not the current MapLibre implementation.  
- Worldwide coverage is intentionally **India-heavy ROI**, not global AIS.
