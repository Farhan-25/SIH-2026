# Feature — Risk, news, and chokepoints

Two layers share the Risk page (`/risk` → `frontend/src/pages/RiskPage.jsx`):

1. **Corridor operations** — AIS queues + weather + freight volatility  
2. **Geopolitical / NLP** — news sentiment, chokepoint index, shock alerts  

NLP model details: [ML_MODELS.md](ML_MODELS.md) §14.

---

## A. Corridor risk (Module D)

**Engine:** `src/risk/risk_engine.py`  
**API:** `POST /api/v1/risk-assess`

```json
{
  "origin_port_id": "newcastle",
  "dest_port_id": "paradip",
  "dest_lat": 20.2649,
  "dest_lon": 86.6286
}
```

### Congestion

`get_blended_port_congestion` reads **AISStream / Open Waters counts** from SQLite (`AISPortCongestionTracker.get_port_congestion_estimate`). Status:

- index &lt; 35 → Low  
- &lt; 65 → Moderate  
- else → High / demurrage risk  

### Composite score (0–100)

```text
0.40 × dest congestion_index
+ 0.20 × origin congestion_index
+ 0.25 × (sea_condition_risk_score × 100)
+ 0.15 × min(1, volatility_pct / 20) × 100
```

Default volatility if not passed: **8.5%**. Weather: Open-Meteo at dest lat/lon (`wave_height_m`, swell, alert text).

Level: Low &lt; 35, Medium 35–59, High ≥ 60.

Alerts: dest congestion ≥ 60 (WARNING), weather risk ≥ 0.5 (CRITICAL), market risk ≥ 0.6 (INFO), else SUCCESS “normal operations”.

---

## B. News and geopolitics

**Engine:** `src/risk/geopolitical_risk.py`  
**Ingest:** `src/data/news_client.py`  
**NLP:** `src/risk/nlp_engine.py`

Caches ~10 minutes.

| API | Returns |
| --- | --- |
| `GET /news?limit=` | Processed articles (sentiment, event, chokepoint) |
| `GET /sentiment` | Average score, pos/neu/neg mix, 14-day timeline |
| `GET /chokepoint-risk` | Per-strait risk 0–1 and LOW–CRITICAL |
| `GET /geopolitical-alerts` | Shock / elevated alerts |
| `GET /forecast/features` | NLP scalars for experiments (not yet in XGB columns) |

### Chokepoint index (0–1)

For articles matching chokepoint terms:

- Volume anomaly (z vs baseline articles/day)  
- Event severity (0.7 max + 0.3 mean from taxonomy)  
- Negative sentiment  
- Recency (newer → higher)  

Weights default **0.35 / 0.25 / 0.20 / 0.20**, overridable via SQLite `admin/risk-weights` or env `RISK_WEIGHT_*`.

Levels: LOW &lt; 0.25, MODERATE, HIGH ≥ 0.50, CRITICAL ≥ 0.75.

**Shock alert** if score ≥ 0.75 **or** (z ≥ 2 and severity ≥ 0.75). WARNING if score ≥ 0.50.

Sentiment label: Negative if avg &lt; −0.15, Positive if &gt; 0.15, else Neutral.

---

## Live AIS (feeds congestion and the map)

**File:** `src/data/aisstream_client.py`

- WebSocket `wss://stream.aisstream.io/v0/stream` when `AISSTREAM_API_KEY` is set  
- Polls Open Waters as a second source  
- Bounding boxes: Bay of Bengal / East Coast + south India  
- Caps ~700 live rows; startup prunes SQLite  
- `AISSTREAM_LIVE_TRACKING=0` disables the live loop  

Without a key, congestion falls back to cache / estimates so the demo still loads.

---

## UI

Risk page: composite gauge, weather/congestion/volatility KPIs, news feed, chokepoint cards, geopolitical alerts. Profile-selected ports can focus the view.
