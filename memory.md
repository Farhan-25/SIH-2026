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
   - `Module A`: Freight Rate Time-Series & Multi-Factor Regression (ARIMA → Prophet → XGBoost/LightGBM → TFT).
   - `Module B`: Physical Constraint & Landed Cost Vessel Recommender (Draft, LOA, Beam, Berths, Lighterage).
   - `Module C`: Market Timing & Contract Strategy (Spot vs Short/Medium-Term Multiple Voyage Contracts, Idle minimization).
   - `Module D`: Disruption & Port Congestion Risk Monitor (AIS anchorage counts, Marine Weather API).

2. **Tech Stack (v2.0)**:
   - **Backend**: Python 3.10+, FastAPI, SQLite / DuckDB, `pyproject.toml` packaging.
   - **ML & Analytics**: `pandas`, `scikit-learn`, `xgboost`, `lightgbm`, `statsmodels`, `shap`.
   - **Data APIs**: `datagovindia` (Ministry of Shipping/Ports), World Bank Pink Sheet, Open-Meteo Marine API, AISstream, TwelveData.
   - **Frontend / Dashboard**: **React + Vite** (replaced Streamlit) with Plotly.js, Leaflet, Framer Motion, dark glassmorphism theme.
   - **No `__pycache__`**: Enforced via `.gitignore` + `PYTHONDONTWRITEBYTECODE=1`.

---

## 📂 Active File Registry

| File | Purpose | Status |
| :--- | :--- | :--- |
| [README.md](file:///d:/SIH-2026/README.md) | Comprehensive SIH-winner project documentation & TODO roadmap | ✅ Created |
| [setup.md](file:///d:/SIH-2026/setup.md) | Easy 1-command and manual setup & execution guide | ✅ Created |
| [sync_and_run.py](file:///d:/SIH-2026/sync_and_run.py) | Automated Git fetch/sync, dependency verifier, and runner | ✅ Created |
| [pyproject.toml](file:///d:/SIH-2026/pyproject.toml) | Python packaging config — makes `import src.*` work natively | ✅ Created |
| [ps.md](file:///d:/SIH-2026/ps.md) | Official SIH26006 Problem Statement & Objective | ✅ Created |
| [requirement.md](file:///d:/SIH-2026/requirement.md) | System, Functional, Non-Functional, Data Requirements | ✅ Created |
| [task.md](file:///d:/SIH-2026/task.md) | Master Progress & Execution Tasklist (v2.0) | ✅ Updated |
| [memory.md](file:///d:/SIH-2026/memory.md) | Persistent Project Context & State Tracker | ✅ Active |
| [.gitignore](file:///d:/SIH-2026/.gitignore) | Git ignore rules (Python + Node + React) | ✅ Updated |
| [.env](file:///d:/SIH-2026/.env) | Environment configuration with API keys | ✅ Created |
| [requirements.txt](file:///d:/SIH-2026/requirements.txt) | Python dependencies (Streamlit removed, reportlab added) | ✅ Updated |
| **Data Layer** | | |
| [data/reference/ports_master.json](file:///d:/SIH-2026/data/reference/ports_master.json) | 7 Indian East Coast + 11 Global Load Ports catalog | ✅ |
| [data/reference/vessels_master.json](file:///d:/SIH-2026/data/reference/vessels_master.json) | Dry bulk vessel classes specs & fuel equations | ✅ |
| [data/reference/routes_master.json](file:///d:/SIH-2026/data/reference/routes_master.json) | 12 key bulk trade lanes | ✅ |
| **Backend Modules** | | |
| [src/api/main.py](file:///d:/SIH-2026/src/api/main.py) | FastAPI v2.0 — enhanced with SHAP, risk, market-timing endpoints | ✅ Upgraded |
| [src/data/db_manager.py](file:///d:/SIH-2026/src/data/db_manager.py) | Relational SQLite query interface | ✅ |
| [src/models/ml_forecasting.py](file:///d:/SIH-2026/src/models/ml_forecasting.py) | XGBoost + LightGBM + ElasticNet Ensemble | ✅ |
| [src/models/deep_learning_forecaster.py](file:///d:/SIH-2026/src/models/deep_learning_forecaster.py) | PyTorch BiLSTM + Multi-Head Attention | ✅ New |
| [src/optimization/vessel_optimizer.py](file:///d:/SIH-2026/src/optimization/vessel_optimizer.py) | Physical constraint solver & landed cost engine | ✅ |
| [src/optimization/market_timing.py](file:///d:/SIH-2026/src/optimization/market_timing.py) | Spot vs Contract strategy engine | ✅ |
| [src/risk/risk_engine.py](file:///d:/SIH-2026/src/risk/risk_engine.py) | Corridor risk engine (AIS + Weather + Volatility) | ✅ |
| [train_models.py](file:///d:/SIH-2026/train_models.py) | Pipeline to train and evaluate ML & Deep models | ✅ New |
| **React Frontend (v2.0)** | | |
| [frontend/vite.config.js](file:///d:/SIH-2026/frontend/vite.config.js) | Vite config with proxy to FastAPI | ✅ |
| [frontend/src/index.css](file:///d:/SIH-2026/frontend/src/index.css) | Dark glassmorphism design system | ✅ |
| [frontend/src/App.jsx](file:///d:/SIH-2026/frontend/src/App.jsx) | Main app with sidebar, header, page routing | ✅ |
| [frontend/src/api/client.js](file:///d:/SIH-2026/frontend/src/api/client.js) | Axios API client for FastAPI (Dashboard added) | ✅ Updated |
| [frontend/src/pages/DashboardPage.jsx](file:///d:/SIH-2026/frontend/src/pages/DashboardPage.jsx) | Dynamic live KPIs, alerts, real system status | ✅ Updated |
| [frontend/src/pages/ForecastPage.jsx](file:///d:/SIH-2026/frontend/src/pages/ForecastPage.jsx) | Plotly chart, SHAP drivers, model metrics | ✅ |
| [frontend/src/pages/VesselPage.jsx](file:///d:/SIH-2026/frontend/src/pages/VesselPage.jsx) | Feasibility matrix, cost breakdown chart | ✅ |
| [frontend/src/pages/RouteMapPage.jsx](file:///d:/SIH-2026/frontend/src/pages/RouteMapPage.jsx) | Leaflet map, trade lanes, congestion overlay | ✅ |
| [frontend/src/pages/RiskPage.jsx](file:///d:/SIH-2026/frontend/src/pages/RiskPage.jsx) | Risk gauge, trend chart, live API wired | ✅ Updated |
| [frontend/src/pages/StrategyPage.jsx](file:///d:/SIH-2026/frontend/src/pages/StrategyPage.jsx) | Signal card, live API wired | ✅ Updated |
| **Testing** | | |
| [tests/test_system.py](file:///d:/SIH-2026/tests/test_system.py) | Automated pytest suite | ✅ |

---

## 🔗 Remote Repository
- **Remote Origin**: `https://github.com/Farhan-25/SIH-2026.git`
- **Default Branch**: `main`
- **Push Policy**: *Manual only / Standby (No automated pushes without explicit user confirmation)*

---

## 🧭 Current Phase & Next Actions

- **Current Phase**: **Live Data Integration & Deep Learning Complete**
- **Frontend**: React + Vite running at `http://localhost:3000` | Backend: FastAPI at `http://localhost:8000`
- **Next Immediate Steps**:
  1. Multi-Parcel Fleet Scheduler (Genetic Optimizer).
  2. PDF/Excel report export.
  3. Docker + CI/CD pipeline.
  4. Git commit & push when requested.

---

## 📝 Session Changelog

| Timestamp (ISO) | Action Summary | Updated Files |
| :--- | :--- | :--- |
| 2026-08-25T12:47 | Analyzed execution plan, created `ps.md`, `requirement.md`, `task.md`, and initialized `memory.md`. | `ps.md`, `requirement.md`, `task.md`, `memory.md` |
| 2026-08-25T12:49 | Initialized Git repository, connected remote `https://github.com/Farhan-25/SIH-2026.git`, created `.gitignore`. | `.gitignore`, `memory.md` |
| 2026-08-25T13:25 | Phase 1: Data ingestion pipelines, master datasets, API clients. | All data + client files |
| 2026-08-25T13:30 | Phase 2–5: ML Forecaster, Vessel Optimizer, Risk Engine, FastAPI, Streamlit (original v1). | All backend modules |
| 2026-08-25T13:45 | **v2.0 MAJOR UPGRADE**: Deleted Streamlit, created `pyproject.toml` + `__init__.py` packaging, scaffolded React + Vite frontend, built 6 premium dark-theme pages (Dashboard, Forecast, Vessels, Route Map, Risk, Strategy), enhanced FastAPI with 3 new endpoints, verified full stack running. | `pyproject.toml`, `__init__.py` (×7), `vite.config.js`, `index.css`, `App.jsx`, `client.js`, 6 page components, `main.py` (API), `requirements.txt`, `.gitignore`, `task.md`, `memory.md` |
| 2026-08-25T20:15 | **Deep Learning & Dynamic APIs**: Added PyTorch BiLSTM+Attention model. Updated Dashboard, Risk, and Strategy pages to use real live APIs fetching FRED and OGD data. | `main.py`, `deep_learning_forecaster.py`, `train_models.py`, `DashboardPage.jsx`, `RiskPage.jsx`, `StrategyPage.jsx`, `client.js`, `README.md`, `memory.md` |
