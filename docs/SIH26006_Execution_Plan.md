# SIH26006 — Intelligent Freight Forecasting Model
## Execution Plan: Basic → Advanced

---

## 1. Break Down the Problem First

Before building anything, split the PS into 4 distinct sub-problems. Teams that lose marks usually try to solve everything as one monolithic "AI model" — judges want to see modular thinking.

| Sub-problem | What it really is |
|---|---|
| **A. Freight rate forecasting** | Time-series prediction (Handysize/Supramax/Panamax/Capesize rates on relevant routes) |
| **B. Vessel type recommendation** | Constraint-satisfaction / rule-based optimization (draft, LOA, beam, cargo qty vs port limits) |
| **C. Market timing / idle scenario** | Decision-support logic on top of (A) — "buy now vs wait" signal + repositioning suggestions |
| **D. Risk & congestion alerts** | Classification/anomaly detection on congestion + macro indicators |

Build these as **separate modules that feed one dashboard**, not one giant model.

---

## 2. Phase-Wise Plan

### 🟢 Phase 1 — Foundation (Week 1): Data Layer
**Goal:** Get *any* real or realistic data flowing.

- Identify data sources (see Section 3).
- Build a static reference dataset for East Coast ports: Paradip, Vizag, Gangavaram, Gopalpur, Dhamra, Sagar-Sandheads, Haldia — max draft, LOA, beam, berths, cargo handling rate (tonnes/day).
- Same for load ports: key Australian (Newcastle, Gladstone, Hay Point), US (Norfolk/Baltimore), Mozambique (Beira, Nacala), Indonesian (Kalimantan/Samarinda) terminals.
- Collect/simulate historical freight indices (Baltic Dry Index components — BCI, BPI, BSI, BHSI — proxy for Cape/Panamax/Supramax/Handysize).
- Clean, structure into a relational schema: `routes`, `ports`, `vessels`, `freight_rates(date, route, vessel_type, rate)`.

**Deliverable:** SQLite/PostgreSQL DB or clean CSVs + a data dictionary slide.

---

### 🟡 Phase 2 — Basic Forecasting Model (Week 1–2)
**Goal:** A working baseline — this is your MVP safety net.

- Start simple, don't jump to deep learning immediately:
  1. **Moving Average / Exponential Smoothing** as naive baseline.
  2. **ARIMA / SARIMA** for each vessel-type route series (captures seasonality — e.g., monsoon, Chinese New Year demand dips).
  3. **Prophet (Meta)** — quick to implement, handles seasonality + holidays well, good for a hackathon timeline.
- Evaluate with MAPE / RMSE, plot forecast vs actual.

**Deliverable:** A notebook that forecasts freight rate 15/30/60 days ahead for one route, with error metrics.

---

### 🟠 Phase 3 — Intermediate: Multi-Factor ML Model (Week 2–3)
**Goal:** Move from pure time-series to feature-rich regression.

- Engineer features: bunker fuel price, port congestion index, coal/iron-ore commodity prices, USD-INR rate, seasonal dummy variables, vessel supply-demand ratio (available tonnage vs cargo bookings).
- Models to try (and compare):
  - **XGBoost / LightGBM regression** — usually best accuracy-to-effort ratio for hackathons.
  - **Random Forest** as interpretable baseline.
- Add the **Vessel Type Optimizer**: rule-based/constraint layer —
  ```
  IF cargo_qty fits Capesize AND both ports support Capesize draft/LOA
     → recommend Capesize (lowest $/tonne)
  ELSE evaluate next smaller class
  ```
  This can be a simple decision tree or hard-coded constraint checker — judges love a live example: enter 150,000t coal from Australia → Paradip, and get "Panamax recommended (Capesize draft exceeds Paradip limit)".

**Deliverable:** Multi-feature model beating your Phase 2 baseline + working vessel recommender logic.

---

### 🔴 Phase 4 — Advanced Layer (Week 3–4, "wow factor")
**Goal:** Differentiate from other teams.

- **Deep learning upgrade:** LSTM or Temporal Fusion Transformer (TFT) for freight rate forecasting — TFT is especially good because it explains *which features* drove a forecast (great for judges).
- **Market entry timing signal:** Combine forecast trend + volatility (rolling std dev) → output a simple "Enter Now / Wait 2 weeks / Wait 4 weeks" signal with confidence score.
- **Idle scenario / repositioning module:** Given a vessel's current position and low-demand forecast, suggest 2–3 alternate routes/cargoes using a simple scoring function (distance + expected rate - opportunity cost).
- **Risk/anomaly detection:** Isolation Forest or simple threshold rules on congestion + volatility spikes → early warning banner.
- **Explainability:** SHAP values on the XGBoost/TFT model so the dashboard can say *why* a forecast moved (e.g., "Bunker fuel +8% and Newcastle congestion +2 days drove this rate increase").

**Deliverable:** Explainable, multi-signal forecasting engine — this is what separates top 10 from the rest.

---

### 🔵 Phase 5 — Dashboard / UX (Week 3–4, parallel track)
**Goal:** Make it usable by a non-technical logistics manager — the PS explicitly asks for this.

- Inputs: cargo type, quantity, origin port, destination port, contract duration.
- Outputs:
  - Forecast chart (rate over time + confidence band)
  - Recommended vessel type + reasoning
  - Entry-timing recommendation
  - Risk/congestion alerts
  - Cost comparison: current spot vs recommended short/mid-term contract
- Tech: React/Next.js or Streamlit (Streamlit is much faster to build for hackathons and still looks credible) + Plotly/Recharts for charts.
- Keep it clean — one map, one forecast chart, one recommendation card. Don't overcrowd.

---

### ⚫ Phase 6 — Integration, Testing, Pitch Prep (Final days)
- Wire all modules into the dashboard end-to-end demo (one real scenario: e.g., "100,000t Australian coal to Vizag, Q1 2027").
- Prepare a **PPT** for the SIH round covering: problem understanding, approach, tech stack, architecture diagram, feasibility, impact (cost savings %, reduced idle time %), and a live/video demo.
- Prepare a fallback: pre-recorded demo video in case live demo fails.
- Rehearse Q&A: judges will likely ask "how do you get real-time freight/port data" and "how is this different from existing freight index services (Baltic Exchange, Clarksons)" — have answers ready.

---

## 3. Concrete Data Sources & APIs (verified, usable now)

### 3.1 Government of India — `data.gov.in` (your Ports link falls under this)
The page you linked is a static visualization, but the **actual dataset behind it is queryable via the official OGD API**:
- Register for a free API key at `data.gov.in` → My Account. Every dataset has a `resource_id`.
- Query pattern:
  ```
  https://api.data.gov.in/resource/{resource_id}?api-key=YOUR_KEY&format=json&limit=100
  ```
- Search data.gov.in for these (each returns a resource_id you plug into the URL above):
  - Port traffic & capacity utilization (Major Ports — Kolkata, Haldia, Paradip, Vizag)
  - Cargo throughput by commodity (coal, iron ore) at major ports
  - Ministry of Shipping / Ministry of Ports, Shipping & Waterways datasets
- **Python wrapper to save time:** `pip install datagovindia` — lets you search datasets and pull them as clean DataFrames instead of hand-building URLs (`from datagovindia import DataGovIndia`).
- This directly gives you **real Indian government port utilization/traffic data** — genuinely strengthens your PS relevance and is a strong point to show judges ("we used official GoI data, not just synthetic data").

### 3.2 AIS / Vessel Position & Port Congestion Data
| Source | What it gives | Notes |
|---|---|---|
| **AISstream.io** | Free real-time AIS data via WebSocket (vessel position, MMSI, port calls) | Free tier, sign up for API key — best free option for a hackathon |
| **AISHub** | Free AIS feed in JSON/XML/CSV | Requires you to contribute your own AIS receiver data OR partner access — check current terms |
| MarineTraffic / VesselFinder APIs | Richer port-call, ETA, congestion analytics | Paid, but has limited free/trial tiers — fine for demo-scale pulls, mention as "production upgrade path" in your pitch |

Use AIS data to build a **port congestion proxy**: count vessels waiting/anchored near a port over time.

### 3.3 Commodity & Freight-Adjacent Price Data
| Source | What it gives | Access |
|---|---|---|
| **World Bank Commodity Markets ("Pink Sheet")** | Monthly Australian & South African thermal coal prices, iron ore, crude oil — free, downloadable CSV/PDF, no key needed | Free |
| **EIA Open Data API (eia.gov)** | US energy/coal prices, free API key | Free |
| **Commodities-API.com** | Coal, iron ore, precious metals as a live JSON API | Free tier (~50 calls) — good for a live demo call, not for bulk historical pulls |
| **exchangerate-api.com / open.er-api.com** | Free USD-INR and other FX rates, no key needed for basic tier | Free |

### 3.4 Freight Rate Index (the hardest one — be upfront about this)
- **Baltic Exchange (BDI, BCI, BPI, BSI, BHSI)** is the real industry benchmark but is a **paid/subscription data feed** — there's no free official API. This is normal; even real shipping companies pay for this.
- **What to do instead for your hackathon demo:**
  1. Use publicly reported BDI values from shipping news sites (Trading Economics has a free-tier API with BDI historical data — `tradingeconomics.com/api`) for a real but limited series.
  2. Build a **synthetic freight-rate generator** calibrated to real seasonal/volatility patterns (from public news-reported BDI ranges) for the vessel-type-specific series you need. **State this openly in your PPT** — "real freight index used where available (Trading Economics BDI), synthetic data calibrated to real volatility patterns used for route/vessel-type granularity Baltic Exchange doesn't expose publicly." Judges respect this transparency far more than an unverifiable "we used real data" claim.

### 3.5 Weather / Sea State (adds a nice risk-module feature)
- **Open-Meteo Marine API** — completely free, no API key required, gives wave height/swell/wind by coordinates. Good for the "risk mitigation" part of the PS (rough seas → delay risk).

---

## 4. Recommended Tech Stack (updated)

| Layer | Tool | Why |
|---|---|---|
| **Data ingestion** | Python `requests`, `datagovindia` (pip), AISstream WebSocket client | Direct, scriptable pulls from the sources above |
| **Storage** | PostgreSQL (or SQLite for hackathon speed) + optionally TimescaleDB extension | Freight rates and AIS pings are naturally time-series |
| **Data processing** | pandas, `apscheduler` (for periodic API polling) | Keep an ETL script that refreshes data on a schedule |
| **Baseline forecasting** | statsmodels (ARIMA/SARIMA), Prophet | Fast to implement, explainable |
| **ML forecasting** | XGBoost / LightGBM + scikit-learn | Best accuracy-per-effort for tabular + time features |
| **Advanced (optional)** | PyTorch + `pytorch-forecasting` (has built-in Temporal Fusion Transformer) | If team has bandwidth — big differentiator |
| **Explainability** | SHAP | Ties directly to your "why" narrative for judges |
| **Backend/API** | FastAPI (auto-generates docs — useful for judges to poke at) | Lightweight, async-friendly for polling external APIs |
| **Frontend/Dashboard** | Streamlit (fastest to build) or React + Tailwind + Recharts (more polished) | Streamlit is the pragmatic hackathon choice |
| **Maps/geo (for port congestion, routes)** | Folium / deck.gl (if Streamlit) or Leaflet/Mapbox (if React) | Visualizing AIS + port congestion is a strong visual for judges |
| **Deployment (optional but impressive)** | Docker + Render/Railway free tier | Gives you a live link instead of "runs on my laptop" |
| **Version control/collab** | GitHub + GitHub Projects (kanban) for task tracking across the team | Also lets you show a clean commit history if asked |

**On "public APIs repos":** general lists like `public-apis/public-apis` on GitHub are useful for discovery, but for this PS the sources above (data.gov.in, AISstream, World Bank Pink Sheet, Open-Meteo, Trading Economics) are the ones actually relevant to shipping/freight — you don't need to search the whole repo, these cover every data category the PS asks for (port infra, congestion, commodity price, freight proxy, weather risk).

---

## 5. Team Role Split (assuming 6 members, standard SIH team size)

| Role | Responsibility |
|---|---|
| 2x Data/ML engineers | Phases 1–3 (data pipeline, baseline + intermediate models) |
| 1x DL/Advanced modeling | Phase 4 (LSTM/TFT, SHAP, risk detection) |
| 1x Backend | API layer connecting models to dashboard |
| 1x Frontend/UX | Dashboard build |
| 1x PM/Presentation lead | Data source research, PPT, pitch narrative, coordinates timeline |

---

## 6. What to Prioritize If Time Runs Short

If you're short on time before submission, prioritize in this order:
1. Working baseline forecast (Phase 2) — non-negotiable, this is the core ask.
2. Vessel type recommender (rule-based is fine) — high PS-relevance, low effort.
3. Dashboard showing both — judges need to *see* it work.
4. Advanced DL model — nice-to-have; a well-explained XGBoost model with good accuracy beats a half-working LSTM.
5. Risk/idle-scenario module — good talking point even if only partially implemented.

---

## 7. Key Differentiators to Mention in Pitch

- Multi-port, multi-origin constraint-aware recommendation (most teams will only do freight forecasting, not the port-infrastructure matching — this is the PS's actual novelty).
- Explainability (SHAP) — builds trust for a real chartering decision-maker.
- Shift-from-spot-to-contract framing: explicitly tie your output back to the PS's stated objective — "moving from single spot contracts to short/medium-term multiple voyage contracts."
- Quantify impact: even estimated %, e.g., "reduces average freight cost exposure by X% and idle time by Y days" based on backtesting on historical data.
