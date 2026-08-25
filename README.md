# 🚢 SIH26006: Intelligent Freight Forecasting & Vessel Chartering Optimization Platform

<div align="center">

![SIH 2026](https://img.shields.io/badge/SIH-2026-blue?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![XGBoost](https://img.shields.io/badge/XGBoost-1572B6?style=for-the-badge)
![Status](https://img.shields.io/badge/Build-Passing-brightgreen?style=for-the-badge)

**An AI-driven decision-support ecosystem for dry bulk cargo procurement and optimized vessel chartering to India's East Coast Ports.**

[Quick Start](#-quick-start) • [System Architecture](#-system-architecture) • [Core Engines](#-core-engines) • [Web Platform](#-web-platform) • [Project TODOs](#-project-todos--active-roadmap)

</div>

---

## 📌 Problem Overview & Impact

India's thermal power plants, steel mills, and heavy industrial hubs on the East Coast import millions of metric tonnes of **Thermal Coal, Coking Coal, Iron Ore, and Bauxite** annually from major overseas origins (Australia, USA, Mozambique, Russia, and Indonesia).

Currently, charterers and procurement managers rely on **daily reactive spot-market quotes**, leading to:
- ❌ **Sub-optimal entry timing** during global freight rate spikes.
- ❌ **Demurrage and lighterage penalties** due to uncoordinated vessel-port draft and LOA constraints (e.g. at Haldia, Paradip, and Vizag).
- ❌ **Lack of forward risk visibility** regarding Bay of Bengal cyclonic sea states and port anchorage queues.

### 💡 Our Solution
**FreightIQ (SIH26006)** is a 4-engine predictive intelligence and constraint optimization system that combines multi-factor machine learning, maritime operational constraints, real-time AIS vessel tracking, and forward rate simulation into an intuitive executive platform.

---

## 🗺️ System Architecture

```mermaid
flowchart TD
    subgraph Data_Layer ["📡 Live & Historical Data Ingestion"]
        D1[data.gov.in OGD Port Output]
        D2[AISStream.io Live Anchorage Queues]
        D3[Open-Meteo Marine Weather API]
        D4[TwelveData & World Bank Commodity Feeds]
        D5[Master Port & Vessel Databases]
    end

    subgraph Core_Engines ["⚙️ Core Intelligence Engines"]
        M1["Module A: Multi-Factor ML Forecaster<br/>(XGBoost / Quantile Cones / SHAP)"]
        M2["Module B: Vessel & Port Constraint Solver<br/>(Draft, LOA, Beam, Lighterage, Landed Cost)"]
        M3["Module C: Market Timing & Strategy<br/>(Spot vs COA vs Defer Evaluator)"]
        M4["Module D: Corridor Risk & Disruption Monitor<br/>(Anchorage Queue + Cyclone Season Risk)"]
    end

    subgraph Serving_Layer ["🚀 Serving & UI Layer"]
        API["FastAPI REST Backend (:8000)"]
        UI["React + Vite Decision Dashboard (:3000)"]
    end

    Data_Layer --> Core_Engines
    Core_Engines --> API
    API --> UI
```

---

## ⚙️ Core Engines

### 1. 📈 Module A: Freight Rate ML Forecaster
- **Multi-horizon recursive predictions** (4, 8, 12, 16, 24 weeks forward) in USD/MT.
- **80% & 90% Quantile Confidence Cones** to capture freight market volatility.
- **SHAP Feature Attribution** explaining key cost drivers (bunker fuel, BDI index, FX rates, port queues).

### 2. 🚢 Module B: Vessel & Port Constraint Solver
- Solves physical berth compatibility for **Handysize, Supramax, Ultramax, Panamax, Kamsarmax, and Capesize** vessels.
- Evaluates **maximum permissible draft, LOA, beam, and tidal windows** across 7 Indian East Coast ports (Paradip, Vizag, Gangavaram, Gopalpur, Dhamra, Sagar, Haldia).
- Computes **Total Landed Logistics Cost** ($\text{Freight} + \text{Port Dues} + \text{Mandatory Lighterage at Sagar} + \text{Demurrage Risk}$).

### 3. 🎯 Module C: Market Timing & Contract Strategy
- Evaluates instantaneous spot rates against forward multi-voyage contracts (COA).
- Outputs actionable procurement signals: `ENTER_NOW_SPOT`, `ENTER_NOW_TERM_CONTRACT`, or `WAIT_N_WEEKS`.
- Evaluates idle time and triangular repositioning guidance to minimize ballast legs.

### 4. ⚠️ Module D: Corridor Risk & Disruption Monitor
- Real-time **AIS anchorage density** and turnaround wait estimates.
- **Marine sea state & wave height monitoring** in the Bay of Bengal and Malacca Strait.
- Composite risk index (0–100) with automatic operational alerts.

---

## 🖥️ Web Platform

The interactive UI is built with **React + Vite** and features a modern dark glassmorphism design:

| Module Page | Description |
| :--- | :--- |
| **Command Center** | Live KPI summary cards, active risk alerts, recent scenarios table, system status bar. |
| **Forecast Analytics** | Interactive Plotly.js time-series charts with confidence cones, horizon toggles, and SHAP drivers. |
| **Vessel Optimization** | Physical compatibility checker, landed cost rankings, and stacked cost component breakdowns. |
| **Route Intelligence** | Leaflet dark maritime map with animated trade routes and port congestion heatmap markers. |
| **Risk Monitor** | Radial composite risk gauge, 30-day volatility trends, and marine disruption alerts. |
| **Strategy & Timing** | Visual timing signal indicators, forward freight curves, and contract cost comparison matrices. |

---

## ⚡ Quick Start

### 1-Command Automated Runner:
```bash
# Clone the repository
git clone https://github.com/Farhan-25/SIH-2026.git
cd SIH-2026

# Automatically sync Git, check dependencies, and launch both Backend & Frontend:
python sync_and_run.py
```

### Manual Setup:
```bash
# 1. Install Python dependencies in editable mode
pip install -e .

# 2. Start FastAPI Backend (Port 8000)
python -B -m uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload

# 3. Start React Frontend (Port 3000)
cd frontend
npm install
npm run dev
```

For full setup documentation, environment key configuration, and troubleshooting, see [**`setup.md`**](file:///d:/SIH-2026/setup.md).

---

## 📋 Project TODOs & Active Roadmap

Below is the active task list for scaling this prototype to a national hackathon-winning production platform:

### 🧠 1. Machine Learning & Model Training Pipeline
- [ ] **Train Deep Time-Series Models**: Implement Temporal Fusion Transformer (TFT) and LSTM deep learning models alongside XGBoost for multi-horizon attention.
- [ ] **Dynamic Ensemble Engine**: Build an automated model selector that dynamically weights XGBoost, LSTM, and Prophet based on rolling backtest MAPE.
- [ ] **Automated Model Retraining Job**: Add scheduled pipeline to re-fit models weekly as new OGD port and commodity data arrives.
- [ ] **SHAP Interactive Visualizer**: Expose raw SHAP force plot JSON directly to the frontend for interactive node drill-downs.

### 🎨 2. UI/UX & Design Polish
- [ ] **Generic / Executive View**: Add a simplified high-level view for senior procurement executives with 1-click summary insights.
- [ ] **Light / Dark Theme Toggle**: Implement accessible light mode palette alongside current dark glassmorphism theme.
- [ ] **Multi-Language Localization**: Add Hindi/English language toggle for national procurement accessibility.
- [ ] **Scenario Export**: 1-click **Download PDF / Excel** procurement briefing for management review.

### 🚢 3. Advanced Optimization & Fleet Management
- [ ] **Multi-Parcel Fleet Scheduler**: Implement Genetic Algorithm (NSGA-II) for scheduling multiple cargo parcels across multi-port discharge itineraries.
- [ ] **Carbon Emission (EEXI / CII) Calculator**: Estimate voyage fuel burn and carbon intensity rating per vessel class.
- [ ] **Port Tariff Engine**: Dynamic tariff computation based on vessel Gross Tonnage (GT) and cargo handling productivity.

### 📰 4. NLP Market Sentiment & Macro Shocks
- [ ] **Maritime News Sentiment Tracker**: Scrape and analyze global shipping headlines (Baltic Exchange, TradeWinds, Platts) with FinBERT to compute market sentiment scores.
- [ ] **Geopolitical & Chokepoint Alerts**: Event-driven flags for Red Sea / Suez / Malacca transit disruptions.

### 🐳 5. DevOps & Presentation Deliverables
- [ ] **Docker Compose Setup**: Multi-container `docker-compose.yml` (FastAPI + Nginx React Frontend).
- [ ] **GitHub Actions CI/CD**: Automated linting and pytest pipeline on every push.
- [ ] **SIH Final Pitch Deck**: Slide deck highlighting ROI, landed cost savings (5–12%), and national logistics impact.

---

## 🧪 Testing & Validation

Run the automated test suite:
```bash
pytest tests/ -v
```

All core unit tests verify master dataset integrity, draft/lighterage constraints (Haldia & Gangavaram), ML inference, and API endpoints.

---

## 📄 License & Team
Developed for **Smart India Hackathon 2026 (SIH26006)**.  
Repository: [Farhan-25/SIH-2026](https://github.com/Farhan-25/SIH-2026)
