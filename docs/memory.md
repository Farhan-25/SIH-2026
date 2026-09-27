# Project Memory & Persistent State Log: SIH26006

> **Purpose**: This document tracks the active project status, architectural decisions, data schema specifications, completed milestones, and context state across all sessions.

---

## 📌 Project Identity
- **Problem Statement ID**: SIH26006
- **Title**: Intelligent Freight Forecasting Model for Optimized Vessel Chartering and Bulk Cargo Procurement (Overseas $\rightarrow$ East Coast India)
- **Primary Domain**: Maritime Logistics, Dry Bulk Shipping, Time-Series & Multi-Factor ML, Constraint Optimization.
- **Target Discharge Ports**: Paradip, Vizag (Visakhapatnam), Gangavaram, Gopalpur, Dhamra, Sagar-Sandheads, Haldia.
- **Key Origin Regions**: Australia, USA, Mozambique, Russia, Indonesia.
- **Core Cargo Commodities**: Thermal Coal, Coking Coal, Iron Ore, Bauxite.

---

## 🗺️ System Architecture Decisions

1. **Modular 4-Engine Design**:
   - `Module A`: Freight Rate Time-Series & Multi-Factor Regression (ElasticNet + LightGBM + XGBoost Inverse-MAPE Ensemble, Quantile Uncertainty Cones, plus PyTorch BiLSTM + Multi-Head Attention).
   - `Module B`: Physical Constraint & Landed Cost Vessel Recommender (Draft, LOA, Beam, Berths, Lighterage, Deadfreight, Demurrage).
   - `Module C`: Market Timing & Contract Strategy (Spot vs Multi-Voyage Contract Migration KPI, Idle Risk Minimization with real 12-route alternate employment economics).
   - `Module D`: Disruption & Port Congestion Risk Monitor (Live AIS anchorage queues via AISStream/Open Waters, Marine Weather API, plus NLP FinBERT Geopolitical & Chokepoint Risk Engine).

2. **Tech Stack (v2.0)**:
   - **Backend**: Python 3.10+, FastAPI, SQLite / DuckDB, `pyproject.toml` packaging.
   - **ML & Analytics**: `pandas`, `scikit-learn`, `xgboost`, `lightgbm`, `statsmodels`, `torch` (BiLSTM + Attention), `shap`, `transformers` (FinBERT / lexicon fallback).
   - **Data APIs**: `datagovindia` (Ministry of Shipping/Ports), World Bank Pink Sheet, Open-Meteo Marine API, AISstream WebSocket, Open Waters REST, TwelveData, FRED.
   - **Frontend / Dashboard**: **React + Vite** with Plotly.js, MapLibre GL (Carto Dark Matter/Positron/Voyager basemaps), Framer Motion, dark glassmorphism design system.
   - **No `__pycache__`**: Enforced via `.gitignore` + `PYTHONDONTWRITEBYTECODE=1`.

---

## 📂 Active File Registry

| File | Purpose | Status |
| :--- | :--- | :--- |
| [README.md](file:///d:/SIH-2026/README.md) | Comprehensive SIH-winner project documentation & TODO roadmap | ✅ Updated |
| [setup.md](file:///d:/SIH-2026/setup.md) | Easy 1-command and manual setup & execution guide | ✅ Created |
| [sync_and_run.py](file:///d:/SIH-2026/sync_and_run.py) | Automated Git fetch/sync, dependency verifier, and runner | ✅ Created |
| [pyproject.toml](file:///d:/SIH-2026/pyproject.toml) | Python packaging config — makes `import src.*` work natively | ✅ Created |
| [ps.md](file:///d:/SIH-2026/ps.md) | Official SIH26006 Problem Statement & Objective | ✅ Created |
| [requirement.md](file:///d:/SIH-2026/requirement.md) | System, Functional, Non-Functional, Data Requirements | ✅ Created |
| [task.md](file:///d:/SIH-2026/task.md) | Master Progress & Execution Tasklist (v2.0) | ✅ Updated |
| [memory.md](file:///d:/SIH-2026/memory.md) | Persistent Project Context & State Tracker | ✅ Active |
| [.gitignore](file:///d:/SIH-2026/.gitignore) | Git ignore rules (Python + Node + React) | ✅ Updated |
| [.env](file:///d:/SIH-2026/.env) | Environment configuration with API keys | ✅ Created |
| [requirements.txt](file:///d:/SIH-2026/requirements.txt) | Python dependencies | ✅ Updated |
| **Data Layer** | | |
| [data/reference/ports_master.json](file:///d:/SIH-2026/data/reference/ports_master.json) | 7 Indian East Coast + 11 Global Load Ports catalog | ✅ |
| [data/reference/vessels_master.json](file:///d:/SIH-2026/data/reference/vessels_master.json) | Dry bulk vessel classes specs & fuel equations | ✅ |
| [data/reference/routes_master.json](file:///d:/SIH-2026/data/reference/routes_master.json) | 12 key bulk trade lanes with waypoints | ✅ |
| [data/processed/metrics.json](file:///d:/SIH-2026/data/processed/metrics.json) | Live ML evaluation metrics (MAPE, RMSE, R²) | ✅ Dynamic |
| [data/processed/model_card.json](file:///d:/SIH-2026/data/processed/model_card.json) | Model card & validation metadata | ✅ Dynamic |
| **Backend Modules** | | |
| [src/api/main.py](file:///d:/SIH-2026/src/api/main.py) | FastAPI v2.0 — live ML metadata, SHAP, risk, market-timing, map intelligence | ✅ Upgraded |
| [src/api/copilot.py](file:///d:/SIH-2026/src/api/copilot.py) | AI Procurement Copilot API (LLM/rule fallback) | ✅ Active |
| [src/data/db_manager.py](file:///d:/SIH-2026/src/data/db_manager.py) | Relational SQLite query interface | ✅ |
| [src/data/aisstream_client.py](file:///d:/SIH-2026/src/data/aisstream_client.py) | WebSocket + Open Waters live AIS fleet & congestion tracker | ✅ Active |
| [src/data/news_client.py](file:///d:/SIH-2026/src/data/news_client.py) | Maritime news ingestion pipeline | ✅ Active |
| [src/models/ml_forecasting.py](file:///d:/SIH-2026/src/models/ml_forecasting.py) | XGBoost + LightGBM + ElasticNet Ensemble | ✅ |
| [src/models/deep_learning_forecaster.py](file:///d:/SIH-2026/src/models/deep_learning_forecaster.py) | PyTorch BiLSTM + Multi-Head Attention | ✅ |
| [src/optimization/vessel_optimizer.py](file:///d:/SIH-2026/src/optimization/vessel_optimizer.py) | Physical constraint solver & landed cost engine | ✅ |
| [src/optimization/market_timing.py](file:///d:/SIH-2026/src/optimization/market_timing.py) | Spot vs Multi-Voyage Contract + Idle Minimization engine | ✅ PS Aligned |
| [src/risk/risk_engine.py](file:///d:/SIH-2026/src/risk/risk_engine.py) | Corridor risk engine (AIS + Weather + Volatility) | ✅ |
| [src/risk/nlp_engine.py](file:///d:/SIH-2026/src/risk/nlp_engine.py) | FinBERT maritime sentiment & event classification | ✅ Active |
| [src/risk/geopolitical_risk.py](file:///d:/SIH-2026/src/risk/geopolitical_risk.py) | 5-chokepoint index, shock alerts, anomaly detection | ✅ Active |
| [train_models.py](file:///d:/SIH-2026/train_models.py) | Pipeline to train and evaluate ML & Deep models | ✅ |
| **React Frontend (v2.0)** | | |
| [frontend/vite.config.js](file:///d:/SIH-2026/frontend/vite.config.js) | Vite config with proxy to FastAPI | ✅ |
| [frontend/src/index.css](file:///d:/SIH-2026/frontend/src/index.css) | Dark glassmorphism design system | ✅ |
| [frontend/src/App.jsx](file:///d:/SIH-2026/frontend/src/App.jsx) | Main app with sidebar, header, page routing | ✅ |
| [frontend/src/api/client.js](file:///d:/SIH-2026/frontend/src/api/client.js) | Axios API client for FastAPI endpoints | ✅ |
| [frontend/src/pages/DashboardPage.jsx](file:///d:/SIH-2026/frontend/src/pages/DashboardPage.jsx) | Dynamic live KPIs, live ML metrics, alerts, system status | ✅ Live-Wired |
| [frontend/src/pages/ForecastPage.jsx](file:///d:/SIH-2026/frontend/src/pages/ForecastPage.jsx) | Plotly chart, SHAP drivers, model metrics | ✅ |
| [frontend/src/pages/VesselPage.jsx](file:///d:/SIH-2026/frontend/src/pages/VesselPage.jsx) | Feasibility matrix, cost breakdown chart | ✅ |
| [frontend/src/pages/RouteMapPage.jsx](file:///d:/SIH-2026/frontend/src/pages/RouteMapPage.jsx) | MapLibre dark map, trade lanes, time scrubber, fleet panel | ✅ Upgraded |
| [frontend/src/pages/RiskPage.jsx](file:///d:/SIH-2026/frontend/src/pages/RiskPage.jsx) | Composite risk gauge, chokepoint monitor, news sentiment | ✅ |
| [frontend/src/pages/StrategyPage.jsx](file:///d:/SIH-2026/frontend/src/pages/StrategyPage.jsx) | Spot-to-Contract migration KPI, Idle risk & repositioning | ✅ PS Aligned |
| [frontend/src/components/MapLibreMap.jsx](file:///d:/SIH-2026/frontend/src/components/MapLibreMap.jsx) | MapLibre GL map component with Carto styles | ✅ |
| [frontend/src/components/VesselSidePanel.jsx](file:///d:/SIH-2026/frontend/src/components/VesselSidePanel.jsx) | Interactive vessel AIS inspector drawer | ✅ |
| [frontend/src/lib/maplibre.js](file:///d:/SIH-2026/frontend/src/lib/maplibre.js) | MapLibre helper routines & popup formatting | ✅ |
| **Documentation & Explanation** | | |
| [explanation/README.md](file:///d:/SIH-2026/explanation/README.md) | Guide to explanation folder architecture | ✅ |
| [explanation/PROJECT_DOCUMENTATION.md](file:///d:/SIH-2026/explanation/PROJECT_DOCUMENTATION.md) | Deep project documentation & PS alignment | ✅ |
| [explanation/ML_MODELS.md](file:///d:/SIH-2026/explanation/ML_MODELS.md) | ML algorithms, deep neural nets, and feature math | ✅ |
| [explanation/FEATURE_STRATEGY.md](file:///d:/SIH-2026/explanation/FEATURE_STRATEGY.md) | Strategy, Spot-to-Contract KPI, Idle repositioning | ✅ |
| [explanation/FEATURE_DASHBOARD.md](file:///d:/SIH-2026/explanation/FEATURE_DASHBOARD.md) | Live Dashboard wiring and KPI mechanics | ✅ |
| [explanation/FEATURE_MAP.md](file:///d:/SIH-2026/explanation/FEATURE_MAP.md) | MapLibre routes, live AIS fleet, time scrubber | ✅ |
| [explanation/FEATURE_RISK.md](file:///d:/SIH-2026/explanation/FEATURE_RISK.md) | Corridor operations & NLP geopolitical risk | ✅ |
| [docs/SIH26006_Codebase_Analysis.md](file:///d:/SIH-2026/docs/SIH26006_Codebase_Analysis.md) | Architectural and module-by-module breakdown | ✅ |
| **Testing** | | |
| [tests/test_system.py](file:///d:/SIH-2026/tests/test_system.py) | Automated pytest suite (including Russia trade lanes & constraints) | ✅ |

---

## 🔗 Remote Repository
- **Remote Origin**: `https://github.com/Farhan-25/SIH-2026.git`
- **Default Branch**: `main`
- **Push Policy**: *Manual only / Standby (No automated pushes without explicit user confirmation)*

---

## 🧭 Current Phase & Next Actions

- **Current Phase**: **Production-Grade UI, MapLibre Fleet Tracking, Live ML Metadata & Complete PS Alignment**
- **Frontend**: React + Vite running at `http://localhost:3000` | Backend: FastAPI at `http://localhost:8000`
- **Next Immediate Steps**:
  1. Multi-Parcel Fleet Scheduler (Genetic Optimizer / NSGA-II Pareto frontier).
  2. PDF procurement briefing export verification.
  3. Docker Compose one-command deployment package.
  4. Git commit & push when explicitly requested by user.

---

## 📝 Session Changelog

| Timestamp (ISO) | Action Summary | Updated Files |
| :--- | :--- | :--- |
| 2026-08-25T12:47 | Analyzed execution plan, created `ps.md`, `requirement.md`, `task.md`, and initialized `memory.md`. | `ps.md`, `requirement.md`, `task.md`, `memory.md` |
| 2026-08-25T12:49 | Initialized Git repository, connected remote `https://github.com/Farhan-25/SIH-2026.git`, created `.gitignore`. | `.gitignore`, `memory.md` |
| 2026-08-25T13:25 | Phase 1: Data ingestion pipelines, master datasets, API clients. | All data + client files |
| 2026-08-25T13:30 | Phase 2–5: ML Forecaster, Vessel Optimizer, Risk Engine, FastAPI, Streamlit (original v1). | All backend modules |
| 2026-08-25T13:45 | **v2.0 MAJOR UPGRADE**: Deleted Streamlit, created `pyproject.toml` + `__init__.py` packaging, scaffolded React + Vite frontend, built 6 premium dark-theme pages, enhanced FastAPI with 3 new endpoints, verified full stack running. | `pyproject.toml`, `App.jsx`, `client.js`, 6 page components, `main.py`, `memory.md` |
| 2026-08-25T20:15 | **Deep Learning & Dynamic APIs**: Added PyTorch BiLSTM+Attention model. Updated Dashboard, Risk, and Strategy pages to use real live APIs fetching FRED and OGD data. | `main.py`, `deep_learning_forecaster.py`, `train_models.py`, `DashboardPage.jsx`, `RiskPage.jsx`, `StrategyPage.jsx`, `client.js`, `README.md`, `memory.md` |
| 2026-08-26T20:50 | **UI Polish & Branding Removal**: Fixed empty KPI trend UI and crash vulnerabilities in alert components on `DashboardPage.jsx`. Removed "SIH26006" hackathon branding across `LandingPage.jsx`, `index.css`, and `index.html`. | `LandingPage.jsx`, `DashboardPage.jsx`, `index.html`, `index.css`, `memory.md` |
| 2026-09-18T14:30 | **MapLibre GL & AIS Fleet Tracking**: Replaced Leaflet with MapLibre GL for route and fleet intelligence. Added Carto basemaps, live/modeled vessel styling, interactive vessel drawer panel, and 0–72h time scrubber with auto-play. | `RouteMapPage.jsx`, `MapLibreMap.jsx`, `maplibre.js`, `VesselSidePanel.jsx`, `FEATURE_MAP.md` |
| 2026-09-19T11:20 | **NLP Geopolitical Risk Engine**: Built FinBERT/lexicon sentiment analyzer, 5 maritime chokepoint monitor, news collector client, and shock alert pipeline. | `nlp_engine.py`, `geopolitical_risk.py`, `news_client.py`, `FEATURE_RISK.md`, `ML_MODELS.md` |
| 2026-09-20T15:45 | **Problem Statement Alignment (Module C)**: Integrated Spot-to-Contract Migration KPI (`spot_to_contract_consolidation_pct`), Idle Risk Minimization with real 12-route alternate employment economics (`idle_risk_level`, `savings_vs_ballast_usd`). Added Russian trade lane test coverage. | `market_timing.py`, `test_system.py`, `StrategyPage.jsx`, `FEATURE_STRATEGY.md` |
| 2026-09-20T16:15 | **Dashboard Live Wiring & Doc Synchronization**: Wired Dashboard KPIs directly to live ML metadata (`metrics.json`, `model_card.json`). Comprehensive documentation refresh across `/docs` and `/explanation` directories. | `main.py`, `DashboardPage.jsx`, `FEATURE_DASHBOARD.md`, `PROJECT_DOCUMENTATION.md`, `SIH26006_Codebase_Analysis.md`, `memory.md`, `task.md` |
