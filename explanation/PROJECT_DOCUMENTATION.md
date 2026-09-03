# FreightIQ — Complete Project Documentation (SIH26006)

This file is a full description of the current codebase: features, architecture, data, APIs, and UI. It does **not** replace `README.md`. It lives in `explanation/` with the ML model guide.

**Intelligent freight forecasting and vessel chartering optimization for dry bulk cargo to India’s East Coast ports.**

Problem statement ID: **SIH26006**  
Official title: *Development of an Intelligent Freight Forecasting Model for Optimized Vessel Chartering and Bulk Cargo Procurement from overseas to East Coast of India*

FreightIQ is a decision-support platform for procurement and chartering teams that import thermal coal, coking coal, iron ore, bauxite, and related dry bulk cargoes. It answers four operational questions in one pipeline:

1. What will the freight rate be over the next few weeks (USD/MT), with uncertainty bands?
2. Which vessel class can physically call the chosen origin and destination ports, and at what landed cost?
3. Should we book spot now, wait, or lock a short/medium-term contract of affreightment (COA)?
4. What congestion, weather, volatility, and geopolitical risks can delay the voyage or raise cost?

This is **decision support**, not an autonomous chartering system. It does not execute fixtures or guarantee future rates.

---

## Table of contents

- [Problem and impact](#problem-and-impact)
- [What the system does](#what-the-system-does)
- [Who it is for](#who-it-is-for)
- [Tech stack](#tech-stack)
- [System architecture](#system-architecture)
- [Repository layout](#repository-layout)
- [Reference data (ports, vessels, routes)](#reference-data-ports-vessels-routes)
- [Data sources and clients](#data-sources-and-clients)
- [Core engines](#core-engines)
- [Web platform](#web-platform)
- [REST API](#rest-api)
- [End-to-end scenario flow](#end-to-end-scenario-flow)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Model training](#model-training)
- [Testing](#testing)
- [Design and UX](#design-and-ux)
- [Honesty about data](#honesty-about-data)
- [Related documents](#related-documents)
- [Roadmap](#roadmap)
- [How to explain this to judges or teammates](#how-to-explain-this-to-judges-or-teammates)

---

## Problem and impact

Indian thermal power plants, steel mills, and heavy industry on the East Coast import millions of tonnes of bulk cargo from Australia, Indonesia, Mozambique, the United States, and Russia.

Today, many charterers still rely on **daily spot-market quotes**. That leads to:

- Poor entry timing when global freight spikes
- Demurrage and lighterage penalties when vessel size does not match port draft, LOA, or beam (especially Haldia vs Gangavaram/Dhamra)
- Little forward visibility of Bay of Bengal weather, anchorage queues, or chokepoint disruptions (Red Sea, Suez, Malacca)

The SIH objective is to move procurement **from many one-off spot fixtures toward short- and medium-term multi-voyage contracts**, using forecasts plus port-constraint-aware vessel choice.

---

## What the system does

FreightIQ is a **four-engine** backend plus a React decision dashboard:

| Module | Name | Role |
| --- | --- | --- |
| A | Freight rate ML forecaster | Multi-horizon USD/MT forecasts, quantile cones, SHAP drivers |
| B | Vessel & port constraint solver | Draft/LOA/beam/lighterage feasibility and landed cost ranking |
| C | Market timing & strategy | Spot vs COA vs wait; idle/repositioning guidance |
| D | Corridor risk & news intelligence | AIS congestion, marine weather, volatility, FinBERT-style NLP, chokepoints |

Around those engines:

- **SQLite** (`data/processed/freight_data.db`) for ports, routes, vessels, live AIS cache, news, congestion
- **FastAPI** at port **8000** (`src/api/main.py`)
- **React + Vite** UI at port **5173** (proxies `/api` to the backend)
- **Maritime copilot** (Gemini if `GEMINI_API_KEY` is set, otherwise rule-based answers)
- **Signup / login / onboarding** in the browser (localStorage demo accounts and per-user port/route/cargo profile)
- **Light/dark theme** and **USD/INR** display conversion

---

## Who it is for

- Freight analysts who need rate outlooks and drivers
- Chartering managers who need vessel feasibility and timing signals
- Procurement managers who care about landed cost and disruption risk
- Demo reviewers / SIH judges who need a single dashboard and a full-scenario API

---

## Tech stack

**Backend (Python 3.10+)**

- FastAPI, Uvicorn, Pydantic
- pandas, NumPy, SciPy, scikit-learn, statsmodels
- XGBoost, LightGBM, SHAP
- PyTorch (BiLSTM + multi-head attention forecaster)
- Hugging Face Transformers (news/NLP path)
- SQLite via `FreightDBManager`
- requests / websockets for live feeds
- reportlab (report generation dependency; PDF export UI is still on the roadmap)

**Frontend**

- React 19, Vite 8, React Router 7
- Axios (`frontend/src/api/client.js`, base URL `/api/v1`)
- Plotly for charts
- MapLibre, Mapbox, Deck.gl, Leaflet, Three.js / React Three Fiber for maps and 3D route views
- Framer Motion for page transitions
- Oxlint for frontend linting

**Packaging**

- `pyproject.toml` — install with `pip install -e .` so `import src.*` works
- `requirements.txt` — same Python dependencies for pip-only installs

---

## System architecture

```text
Reference JSON (ports / vessels / routes)
OGD port stats, World Bank commodities, FRED / TwelveData FX & energy
AISStream + Open Waters / GFW vessel positions
Open-Meteo marine weather
Public RSS / GDELT maritime news
        |
        v
Data clients + FreightDBManager (SQLite)
        |
        v
Forecasting | Vessel optimizer | Market timing | Risk + geopolitics | Copilot
        |
        v
FastAPI  /api/v1/*   (Swagger at /docs)
        |
        v
Vite proxy  /api  →  :8000
        |
        v
React pages (Command Center, Forecast, Vessels, Map, Risk, Strategy, Copilot)
```

On API startup the backend:

1. Initializes all engines
2. Loads tree models from `models/freight_xgb_model.joblib` if present
3. Loads the deep model from `models/freight_deep_lstm.pt` if present
4. Prunes AIS live-vessel history and clears stale congestion cache
5. Starts a background AIS tracker for Indian East Coast regions of interest

---

## Repository layout

```text
SIH-2026/
  src/
    api/                 FastAPI app, copilot
    data/                API clients, SQLite manager, freight synthesizer
    models/              Features, baselines, XGBoost ensemble, LSTM
    optimization/        Vessel constraints, market timing
    risk/                Corridor risk, NLP, geopolitical scores
  data/
    reference/           ports_master.json, vessels_master.json, routes_master.json
    raw/                 OGD and other ingested CSVs
    processed/           freight_data.db, unified_freight_timeseries.csv
  models/                Trained joblib / PyTorch checkpoints (after training)
  frontend/
    src/pages/           Landing, login, onboarding, dashboard, engines
    src/context/         Auth, user profile, USD/INR + theme
    src/api/client.js    Axios wrappers
    src/lib/maplibre.js  Map helpers
  tests/                 pytest suite
  explanation/           Full project docs + ML model guide (this folder)
  train_models.py        Train ensemble + LSTM and write checkpoints
  sync_and_run.py        Git sync, deps, launch backend + frontend
  README.md              Project overview (not replaced by these guides)
```

Supporting spec files (not required to run the app): `ps.md`, `requirement.md`, `setup.md`, `task.md`, `memory.md`, `PROJECT_EXPLANATION.md`, `SIH26006_Execution_Plan.md`, `news_sentiment.md`, `DESIGN.md`, `AGENTS.md`.

---

## Reference data (ports, vessels, routes)

Master catalogs live in `data/reference/` and are seeded into SQLite.

### Indian East Coast discharge ports

| ID | Port | Typical draft (m) | Notes |
| --- | --- | --- | --- |
| IN_PRT | Paradip | 14.5 (tidal ~16.0) | Coal/iron ore; Kamsarmax / baby-Cape possible |
| IN_VTZ | Visakhapatnam (Vizag) | 18.1 | Outer harbour Capesize; inner harbour Panamax |
| IN_GNV | Gangavaram | 19.5 | Deep-water; Capesize / Newcastlemax |
| IN_DHM | Dhamra | 18.0 | Deep-draft private port |
| IN_GPL | Gopalpur | 14.5 | Smaller classes |
| IN_HLD | Haldia | 8.0 | Riverine; severe draft; lighterage |
| IN_SGR | Sagar-Sandheads | 15.0 | Transshipment / lighterage for Haldia |

Each port record includes max draft (with tides), max LOA and beam, DWT cap, handling rate, lighterage flag, tidal restriction, port dues / berth hire / pilotage, cargo list, and coordinates.

### Global load ports

Australia: Newcastle (`AU_NEW`), Hay Point (`AU_HAY`), Gladstone (`AU_GLA`)  
Indonesia: South Kalimantan (`ID_KLT`), Samarinda (`ID_SMR`)  
Mozambique: Nacala (`MZ_NAC`), Beira (`MZ_BEI`)  
USA: Norfolk (`US_NOR`), Baltimore (`US_BAL`)  
Russia: Taman (`RU_TAM`), Vostochny (`RU_VOS`)

### Vessel classes

Handysize, Supramax, Ultramax, Panamax, Kamsarmax, Capesize, Newcastlemax.

Each class has DWT range, typical cargo capacity, LOA, beam, laden draft, geared vs gearless, speeds, fuel burn (sea/port), daily opex, and a Baltic index proxy (BHSI / BSI / BPI / BCI).

### Trade routes (12 corridors)

Examples: Newcastle→Paradip, Hay Point→Vizag, Gladstone→Gangavaram, Kalimantan→Paradip/Dhamra, Samarinda→Haldia, Nacala→Vizag, Beira→Gopalpur, Norfolk→Paradip, Baltimore→Gangavaram, Taman→Vizag, Vostochny→Paradip.

Each route has distance (nm), cargo, typical classes, chokepoints, sailing days, and waypoint polylines for the map.

Cargo types used in onboarding and scenarios: Thermal Coal, Coking Coal, Iron Ore, Bauxite, Limestone, Manganese Ore, Alumina, Fertilizer, PCI Coal.

---

## Data sources and clients

| Client | File | Purpose |
| --- | --- | --- |
| DB manager | `src/data/db_manager.py` | SQLite schema, seed, caches (TTL ~10 min) |
| Freight synthesizer | `src/data/freight_rate_synthesizer.py` | Unified timeseries (real series where available + calibrated synthetic route/class rates) |
| OGD / data.gov.in | `src/data/ogd_client.py` | Indian port throughput / turnaround |
| World Bank Pink Sheet | `src/data/worldbank_pinksheet.py` | Coal, iron ore, energy commodity prices |
| TwelveData | `src/data/twelvedata_client.py` | FX and energy |
| FRED | `src/data/fred_client.py` | Macro / FX / energy fallbacks |
| AISStream | `src/data/aisstream_client.py` | Live AIS, port congestion estimates, background tracker |
| GFW | `src/data/gfw_client.py` | Vessel positions / congestion helper |
| Open-Meteo | `src/data/openmeteo_client.py` | Wave height, swell, sea-state risk (no API key) |
| News | `src/data/news_client.py` | RSS/GDELT ingest, relevance filter, fallback headlines |

Live APIs are optional. Modules use cached SQLite rows and demo/fallback values so the product can run offline for a demo.

---

## Core engines

### Module A — Freight forecasting

**Files:** `src/models/feature_engineering.py`, `ml_forecasting.py`, `deep_learning_forecaster.py`, `baseline_forecasting.py`, `train_models.py`

How each model is trained and scored is documented in [ML_MODELS.md](ML_MODELS.md).

**Features (per route + vessel class):** freight lags (1, 2, 4, 8, 12 weeks), rolling means and volatility, bunker lags and fuel-to-freight ratio, coal / iron ore / coking coal lags, USD/INR, congestion index, monsoon flag, month/quarter seasonality, distance and sailing days. NLP shock features can be pulled via `/forecast/features`.

**Tree ensemble (`FreightMLForecaster`):** XGBoost + LightGBM + ElasticNet, combined with inverse-MAPE weights. Quantile models produce ~80% confidence cones.

**Deep model:** PyTorch bidirectional LSTM with multi-head attention (`models/freight_deep_lstm.pt`).

**Baselines:** moving average / exponential smoothing (Phase 2 safety net).

**Output:** forecast dates, USD/MT point path, per-model predictions, lower/upper bounds, top drivers, evaluation metrics (MAE, RMSE, MAPE, R²). Horizons: 1–24 weeks (typical UI: 4 / 8 / 12 / 16 / 24).

### Module B — Vessel and port constraints

**File:** `src/optimization/vessel_optimizer.py`

For each vessel class against origin and destination:

- **Reject** if draft, LOA, or beam exceeds port limits, or the ship is too large for the destination
- **Warn** on tidal berthing, lighterage (e.g. Haldia via Sagar), or parcel under-utilization (deadfreight)
- **Landed cost per MT** ≈ freight + port charges + lighterage + deadfreight + demurrage-risk add-on

Feasible ships are ranked by lowest landed cost. Example: Capesize to Haldia is rejected (8 m draft); Capesize to Gangavaram is often recommended for a 175 kt parcel.

Port IDs accept aliases (`newcastle` → `AU_NEW`, `paradip` → `IN_PRT`, etc.).

### Module C — Market timing

**File:** `src/optimization/market_timing.py`

Compares current spot vs 4-week and 12-week forecast averages and the trough week. Term contracts assume ~5% volume discount vs mid-term average.

| Signal | When |
| --- | --- |
| `ENTER_NOW_TERM_CONTRACT` | Strong near-term and quarterly rise (bullish; lock COA) |
| `WAIT_N_WEEKS` | Near-term drop with trough within ~4 weeks |
| `ENTER_NOW_SPOT` | Default / mixed path |

Also returns estimated savings on the parcel and idle / triangular repositioning notes.

### Module D — Risk, NLP, geopolitics

**Files:** `src/risk/risk_engine.py`, `nlp_engine.py`, `geopolitical_risk.py`

Corridor composite score (0–100):

- 40% destination congestion (live AIS anchorage / wait)
- 20% origin congestion
- 25% marine weather (Open-Meteo sea-state)
- 15% freight volatility

Levels: Low (&lt;35), Medium (35–59), High (≥60).

News pipeline: collect → filter maritime keywords → sentiment / event / chokepoint tags → risk index. Monitored chokepoints include Red Sea / Bab el-Mandeb, Suez, Malacca. Alerts fire on high risk, news surges, and shock combinations. Spec: `news_sentiment.md`.

---

## Web platform

Vite `server.port` is **5173**. Older docs that mention port 3000 are outdated.

### Access flow

1. **`/` Landing** — product story; public, no login
2. Any other route without a session → **Login / signup**
3. First login without a saved profile → **Onboarding** (ports → routes → cargoes)
4. Authenticated + onboarded → app shell with sidebar

Auth is **demo-grade**: accounts and passwords live in `localStorage` (`freightiq_users`, `freightiq_session`). The API also has `POST /api/v1/auth/login` for `demo@freightiq.com` / `password123`; the UI login path does not depend on that for normal signup.

### Pages

| Route | Page | What it shows |
| --- | --- | --- |
| `/` | Landing | Product intro |
| `/dashboard` | Command Center | KPIs, alerts, news, map intelligence, copilot briefing |
| `/copilot` | AI Copilot | Overview + chat (`/copilot/overview`, `/copilot/chat`) |
| `/forecast` | Forecast | Plotly history + cones, SHAP drivers, model weights |
| `/vessels` | Vessel optimization | Feasibility matrix, landed cost, cost stack |
| `/routes` | Route map | Ports, waypoints, congestion, weather, vessels |
| `/risk` | Risk monitor | Composite risk, sentiment, chokepoints, alerts |
| `/strategy` | Strategy | Timing signal, forward curve, spot vs contract |

Heavy pages (map / Three / Plotly) are **lazy-loaded**. Sidebar groups Overview / Analytics / Operations. Header: theme, currency, notifications, settings (reconfigure profile, logout).

### Frontend contexts

- `AuthContext` — signup, login, logout
- `UserProfileContext` — per-email ports, routes, cargoes
- `PreferencesContext` — dark/light (`data-theme`), USD vs INR at a fixed 83.5 FX for display only

API client attaches `Authorization: Bearer` from `freightiq_token` if present. Axios timeout is 30s.

---

## REST API

Base: `http://localhost:8000/api/v1`  
Interactive docs: `http://localhost:8000/docs`

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Demo JWT for hardcoded demo user |
| GET | `/health` | Module status |
| GET | `/ports` | Port master |
| GET | `/routes` | Route master |
| POST | `/forecast` | Rate forecast (`route_id`, `vessel_class`, `horizon_weeks`) |
| POST | `/recommend-vessel` | Feasibility + landed cost |
| POST | `/risk-assess` | Corridor risk |
| POST | `/market-timing` | Spot / wait / COA |
| POST | `/shap-explain` | Feature importance |
| POST | `/scenario-analyze` | Full pipeline (see below) |
| GET | `/dashboard` | Aggregated KPIs and alerts |
| GET | `/map-intelligence` | Vessels, ports, weather, routes, risks |
| GET | `/commodities` | Commodity / bunker snapshot |
| GET | `/news` | Maritime news |
| GET | `/sentiment` | Market sentiment |
| GET | `/chokepoint-risk` | Chokepoint scores |
| GET | `/geopolitical-alerts` | Disruption alerts |
| GET | `/forecast/features` | NLP features for models |
| GET | `/copilot/overview` | Executive briefing |
| GET | `/copilot/briefing` | Alias of overview |
| POST | `/copilot/chat` | Copilot Q&A |
| GET | `/api/vessels` | Vessel listing (legacy path outside `/api/v1`) |
| POST/DELETE | `/admin/ports`, `/admin/routes`, `/admin/vessels`, `/admin/fleet` | Admin CRUD |
| POST | `/admin/rebuild-dataset` | Rebuild unified dataset |
| GET/POST/DELETE | `/admin/chokepoints` | Chokepoint catalog |
| GET/POST | `/admin/risk-weights` | Risk weight configuration |

In production builds the FastAPI app can serve the static frontend and fall through unmatched paths to `index.html`.

CORS is currently `allow_origins=["*"]` for local development.

---

## End-to-end scenario flow

The demo-critical endpoint is:

```http
POST /api/v1/scenario-analyze
```

Body example:

```json
{
  "cargo_type": "Thermal Coal",
  "cargo_parcel_mt": 75000,
  "origin_port_id": "newcastle",
  "dest_port_id": "paradip",
  "horizon_weeks": 12
}
```

Pipeline:

1. Optimize vessel for origin, destination, parcel
2. Forecast freight for the recommended class and route
3. Evaluate market timing
4. Assess corridor risk
5. Return one decision package (vessel, cost, forecast, strategy, risk)

---

## Quick start

### Prerequisites

- Python 3.10+ (tested through 3.12+)
- Node.js 18+ and npm
- Git (optional; `sync_and_run.py` skips sync if there is no remotes/git)

### One-command runner

```bash
git clone https://github.com/Farhan-25/SIH-2026.git
cd SIH-2026
python sync_and_run.py
```

| Flag | Effect |
| --- | --- |
| *(none)* | Git fetch/pull if behind, verify deps, start both servers |
| `--no-sync` | Skip git |
| `--sync-only` | Sync and install only |
| `--backend` | FastAPI only |
| `--frontend` | Vite only |
| `--clean` | Delete `__pycache__` / `.pyc` and exit |

### Manual

```bash
pip install -e .
python -B -m uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload

cd frontend
npm install
npm run dev
```

| Service | URL |
| --- | --- |
| UI | http://127.0.0.1:5173 |
| API | http://127.0.0.1:8000 |
| Swagger | http://127.0.0.1:8000/docs |
| Health | http://127.0.0.1:8000/api/v1/health |

The Vite config proxies `/api` to `http://127.0.0.1:8000`.

---

## Environment variables

Create a `.env` in the project root. The app starts without keys; live feeds degrade to cache/fallbacks.

Typical keys (do not commit secrets):

```env
AISSTREAM_API_KEY=
TWELVEDATA_API_KEY=
GEMINI_API_KEY=
GOOGLE_API_KEY=
```

Open-Meteo and World Bank Pink Sheet do not need keys. Copilot uses Gemini only when `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set.

---

## Model training

```bash
python train_models.py
```

This builds/refreshes the unified freight dataset, trains the tree ensemble + quantile cones, trains the LSTM (~30 epochs), prints MAE/RMSE/MAPE/R², and writes:

- `models/freight_xgb_model.joblib`
- `models/freight_deep_lstm.pt`

The API loads these files at startup if they exist. Details: [ML_MODELS.md](ML_MODELS.md).

---

## Testing

```bash
pytest tests/ -v
```

`tests/test_system.py` checks:

- Master JSON/SQLite integrity
- Haldia lighterage / Capesize rejection
- Gangavaram Capesize/Newcastlemax acceptance
- ML inference + quantile bound order
- Bullish timing → `ENTER_NOW_TERM_CONTRACT`
- FastAPI health and `scenario-analyze`

---

## Design and UX

- CSS variables in `frontend/src/index.css` and `themes.css` (dark default, light via `data-theme`)
- Collapsible sidebar, glass-style cards, Framer Motion page fade
- Map: MapLibre / 3D-capable route intelligence (`RouteMapPage.jsx`, `VesselSidePanel.jsx`)
- `DESIGN.md` is an Apple-inspired token study used as a visual reference, not a second product spec
- PWA service worker stub: `frontend/public/sw.js`

---

## Honesty about data

Baltic Exchange vessel-class route rates are not a free public API. The project:

- Uses **official Indian port statistics** (OGD) where available
- Uses **free commodity, FX, weather, and AIS** feeds where keys exist
- Uses a **calibrated synthetic freight generator** for route × vessel-class granularity that Baltic does not expose publicly

State this clearly in pitches. Judges typically prefer that over claiming unpublished Baltic feeds.

---

## Related documents

| File | Contents |
| --- | --- |
| `README.md` | Original project overview |
| [README.md](README.md) (this folder) | Index of all explanation docs |
| [ML_MODELS.md](ML_MODELS.md) | How every ML / statistical model works |
| `FEATURE_*.md` | One guide per product feature (forecast, vessels, map, risk, …) |
| `ps.md` | Official problem statement |
| `requirement.md` | Functional / NFR / data requirements |
| `setup.md` | Setup notes (frontend port in that file may still say 3000; use **5173**) |
| `PROJECT_EXPLANATION.md` | Teammate walkthrough |
| `SIH26006_Execution_Plan.md` | Phased build plan |
| `task.md` | Checklist (some Phase 6 items are stale vs code) |
| `memory.md` | Session log |
| `news_sentiment.md` | NLP / chokepoint PRD |
| `AGENTS.md` | Coding guidelines for agents |

---

## Roadmap

**Implemented (high level):** four engines, ensemble + LSTM, SHAP, AIS congestion, weather, news/sentiment/chokepoints, copilot, React dashboard, auth/onboarding, theme/currency, map intelligence, admin reference endpoints, pytest.

**Not done or partial:**

- Scheduled weekly retraining
- Interactive SHAP force plots in the UI
- Multi-parcel genetic fleet scheduler (NSGA-II)
- EEXI/CII carbon calculator
- PDF/Excel procurement briefing from the UI
- Docker Compose and GitHub Actions CI
- Production-grade auth (passwords currently stored in localStorage)
- True WebSocket push of AIS into the map (tracker runs on the backend; UI polls map-intelligence)

---

## How to explain this to judges or teammates

> FreightIQ is an AI-assisted freight intelligence platform for bulk imports to Indian East Coast ports. It forecasts USD/MT rates with uncertainty and drivers, rejects vessels that cannot berth given draft/LOA/beam, ranks landed cost including lighterage, recommends spot vs wait vs COA, and overlays congestion, weather, and geopolitical news risk. Everything is wired through one FastAPI scenario endpoint and a React command center.

**Demo order:** Landing → signup/onboarding → Command Center → Forecast → Vessels (try Haldia vs Gangavaram) → Route map → Strategy → Risk → Copilot (“Should we book spot or forward for Newcastle–Paradip?”).

**Study order:** `README.md` → this file → [ML_MODELS.md](ML_MODELS.md) → `src/api/main.py` → reference JSON → `ml_forecasting.py` → `vessel_optimizer.py` → `market_timing.py` → `risk_engine.py` → `frontend/src/App.jsx` → `frontend/src/api/client.js`.

---

Developed for **Smart India Hackathon 2026 (SIH26006)**.  
Repository: [Farhan-25/SIH-2026](https://github.com/Farhan-25/SIH-2026)
