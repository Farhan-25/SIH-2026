# FreightIQ Project Explanation Guide

This guide explains the SIH-2026 repository in a way you can study first and then explain clearly to teammates. The project is a decision-support platform for dry bulk freight procurement and vessel chartering to Indian East Coast ports.

## 1. One-Minute Summary

FreightIQ helps a procurement or chartering team answer four practical questions:

1. What will the freight rate be over the next few weeks?
2. Which vessel class is physically feasible for the selected origin, destination, and cargo parcel?
3. Should we book now, wait, or lock a term contract?
4. What operational risks can delay or increase the cost of the voyage?

The system combines a FastAPI backend, machine learning forecasting, vessel/port constraint optimization, risk monitoring, geopolitical/news sentiment, and a React dashboard.

## 2. Problem It Solves

Indian power, steel, and heavy industry buyers import bulk cargo such as thermal coal, coking coal, iron ore, and bauxite. Freight decisions are affected by:

- Spot freight rate volatility.
- Bunker fuel price changes.
- USD/INR and commodity price movement.
- Port restrictions like draft, LOA, beam, and lighterage.
- Congestion and demurrage risk.
- Weather disruptions in the Bay of Bengal.
- Geopolitical chokepoint disruptions such as Suez, Red Sea, or Malacca.

FreightIQ turns these factors into forecasts, vessel recommendations, risk alerts, and strategy suggestions.

## 3. Tech Stack

Backend:

- Python 3.10+
- FastAPI for REST APIs
- Pandas, NumPy, scikit-learn for data processing
- XGBoost, LightGBM, ElasticNet for forecasting ensemble
- SHAP for explainability
- PyTorch for the optional deep learning forecaster
- SQLite/reference JSON for local data

Frontend:

- React with Vite
- Axios for API calls
- React Router for pages
- Plotly for charts
- Leaflet, Mapbox, Deck.gl, Three.js for maps and visual route intelligence
- Framer Motion for UI transitions

## 4. Repository Structure

```text
SIH-2026/
  src/
    api/                 FastAPI server and AI copilot
    data/                API clients, data access, and dataset builders
    models/              ML, deep learning, baseline forecasting, features
    optimization/        Vessel selection and market timing engines
    risk/                Risk, NLP, geopolitical, and disruption logic
  data/
    reference/           Ports, routes, and vessel master JSON files
  frontend/
    src/                 React app, pages, components, API client
  tests/                 Pytest unit/integration tests
  train_models.py        Model training script
  sync_and_run.py        Helper script to sync, check, and run app
  README.md              Original project overview
```

## 5. Main Backend Entry Point

The main backend file is:

```text
src/api/main.py
```

It creates the FastAPI app, initializes all engines, and exposes endpoints under `/api/v1`.

Important global objects initialized there:

- `FreightDBManager`: loads ports, routes, vessels, and historical data.
- `FreightMLForecaster`: predicts freight rates.
- `DeepLearningFreightForecaster`: optional LSTM/attention model.
- `VesselConstraintOptimizer`: recommends feasible vessels.
- `MarketTimingEngine`: recommends spot/contract/wait strategy.
- `RiskAndDisruptionEngine`: computes corridor risk.
- `GeopoliticalRiskEngine`: processes maritime news and chokepoint risks.
- `MaritimeCopilotEngine`: provides AI-style explanations.

## 6. Main Frontend Entry Point

The frontend starts at:

```text
frontend/src/main.jsx
frontend/src/App.jsx
```

`App.jsx` defines the sidebar navigation and routes:

- `/` Product landing page
- `/dashboard` Command Center
- `/copilot` AI Maritime Intelligence Copilot
- `/forecast` Freight forecasting
- `/vessels` Vessel optimization
- `/routes` Route map
- `/risk` Risk monitor
- `/strategy` Market timing and strategy

The frontend API wrapper is:

```text
frontend/src/api/client.js
```

It uses Axios with base URL `/api/v1`, so frontend functions like `getForecast()` call backend routes like `/api/v1/forecast`.

## 7. Data Layer

Reference data lives in:

```text
data/reference/ports_master.json
data/reference/routes_master.json
data/reference/vessels_master.json
```

### Ports Data

`ports_master.json` stores Indian East Coast ports and global loading ports.

Indian destination examples:

- Paradip: coal/iron ore port with moderate draft restrictions.
- Vizag: deep draft outer harbour.
- Gangavaram: deep-water port that can handle Capesize/Newcastlemax.
- Dhamra: deep-draft private port.
- Gopalpur: suitable for smaller classes.
- Haldia: shallow riverine port with severe draft limits and lighterage requirements.
- Sagar/Sandheads: transshipment/lighterage location.

Each port contains constraints such as:

- Maximum permissible draft.
- Max LOA and beam.
- DWT capacity.
- Handling output per berth day.
- Lighterage requirement.
- Port dues and pilotage cost.

### Routes Data

`routes_master.json` defines trade corridors, for example:

- Newcastle to Paradip
- Hay Point to Vizag
- Gladstone to Gangavaram
- South Kalimantan to Paradip
- Samarinda to Haldia
- Nacala to Vizag
- Norfolk to Paradip
- Vostochny to Paradip

Each route has:

- Route ID.
- Origin and destination port IDs.
- Distance in nautical miles.
- Primary cargo.
- Typical vessel classes.
- Chokepoints.
- Sailing days.

### Vessel Data

`vessels_master.json` defines vessel classes:

- Handysize
- Supramax
- Ultramax
- Panamax
- Kamsarmax
- Capesize
- Newcastlemax

Each class has:

- Capacity.
- DWT range.
- LOA, beam, and laden draft.
- Fuel consumption.
- Whether it is geared.
- Typical use-case notes.

## 8. Core Modules

### Module A: Freight Forecasting

Files:

```text
src/models/ml_forecasting.py
src/models/feature_engineering.py
src/models/deep_learning_forecaster.py
src/models/baseline_forecasting.py
train_models.py
```

The forecasting system predicts future freight rates in USD per metric tonne.

Feature engineering creates:

- Freight rate lag features: 1, 2, 4, 8, and 12 weeks.
- Rolling averages and volatility.
- Bunker fuel lag and rolling average.
- Fuel-to-freight ratio.
- Coal, iron ore, and coking coal price lags.
- USD/INR FX.
- Congestion index.
- Monsoon flag.
- Month and quarter seasonality.
- Route distance and sailing days.

`FreightMLForecaster` trains three models:

- XGBoost
- LightGBM
- ElasticNet

It combines them using dynamic inverse-MAPE weighting. Better-performing models receive higher weight.

It also trains quantile regressors for uncertainty bands:

- Lower bound around the forecast
- Upper bound around the forecast

The output includes:

- Forecast dates.
- Predicted rates.
- Model-specific predictions.
- Confidence bounds.
- Top driving factors.
- Evaluation metrics.

### Module B: Vessel and Port Constraint Optimization

File:

```text
src/optimization/vessel_optimizer.py
```

This module checks every vessel against origin and destination port constraints.

It rejects a vessel if:

- Vessel draft exceeds the port draft limit.
- LOA exceeds the port limit.
- Beam exceeds the port limit.
- The vessel is too large for the destination.

It warns if:

- High tide berthing is needed.
- Lighterage is required.
- Cargo parcel under-utilizes the vessel capacity.

It calculates landed cost per MT using:

- Base freight rate.
- Port charges.
- Lighterage cost.
- Deadfreight penalty.
- Demurrage risk cost.

Then it sorts feasible vessels by lowest landed cost and recommends the best option.

Example teammate explanation:

> If we send a Capesize to Haldia, the system rejects it because Haldia has shallow draft and size constraints. But for Gangavaram or Dhamra, larger vessels can be feasible and cheaper per tonne.

### Module C: Market Timing and Strategy

File:

```text
src/optimization/market_timing.py
```

This module decides whether to:

- Enter spot market now.
- Lock a term contract.
- Wait a few weeks.

It compares:

- Current spot rate.
- Average forecast rate over 4 weeks.
- Average forecast rate over 12 weeks.
- Lowest future forecast point.
- Estimated term contract discount.

Decision logic:

- If future rates rise strongly, recommend `ENTER_NOW_TERM_CONTRACT`.
- If rates are expected to fall soon, recommend `WAIT_N_WEEKS`.
- Otherwise, recommend `ENTER_NOW_SPOT`.

It also estimates potential savings and provides idle vessel repositioning guidance.

### Module D: Risk and Disruption Monitoring

Files:

```text
src/risk/risk_engine.py
src/risk/geopolitical_risk.py
src/risk/nlp_engine.py
```

`RiskAndDisruptionEngine` calculates corridor risk using:

- Destination port congestion.
- Origin port congestion.
- Marine weather.
- Freight volatility.

It blends congestion from:

- GFW live vessel data.
- AIS benchmark estimates.

Composite risk formula:

```text
40% destination congestion
20% origin congestion
25% marine weather risk
15% market volatility risk
```

The output includes:

- Composite risk score.
- Risk level: Low, Medium, or High.
- Origin and destination congestion.
- Marine weather conditions.
- Active alerts.

Geopolitical/NLP modules add:

- Maritime news.
- Sentiment summary.
- Chokepoint risk.
- Geopolitical alerts.
- NLP features for forecasting.

## 9. AI Copilot

File:

```text
src/api/copilot_engine.py
```

The copilot is a conversational explanation layer. It answers questions about:

- Why freight rates are rising.
- Which factors drive the forecast.
- Whether a vessel is feasible.
- How chokepoint disruptions affect procurement.
- Whether to book spot or forward.

If `GEMINI_API_KEY` is available, it can call Gemini. Otherwise, it falls back to built-in rule-based domain responses.

Useful demo questions:

- Why are Newcastle to Paradip rates rising?
- Recommend a vessel for 75,000 MT coal to Dhamra.
- Should we book spot or forward?
- What is the Red Sea disruption impact?

## 10. Important API Endpoints

Backend base path:

```text
/api/v1
```

Key endpoints:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Checks backend and module status |
| `/ports` | GET | Returns port reference data |
| `/routes` | GET | Returns route reference data |
| `/forecast` | POST | Predicts future freight rates |
| `/recommend-vessel` | POST | Recommends feasible vessel and cost |
| `/risk-assess` | POST | Calculates corridor risk |
| `/market-timing` | POST | Suggests spot/contract/wait strategy |
| `/shap-explain` | POST | Returns model feature importance |
| `/scenario-analyze` | POST | Runs full combined decision pipeline |
| `/dashboard` | GET | Returns dashboard KPIs and alerts |
| `/map-intelligence` | GET | Returns vessels, ports, weather, routes, risks |
| `/news` | GET | Returns maritime news |
| `/sentiment` | GET | Returns market sentiment |
| `/chokepoint-risk` | GET | Returns chokepoint risk scores |
| `/geopolitical-alerts` | GET | Returns disruption alerts |
| `/forecast/features` | GET | Returns NLP/shock features for forecasting |
| `/copilot/overview` | GET | Returns executive copilot briefing |
| `/copilot/chat` | POST | Answers copilot questions |

## 11. Full Scenario Flow

The most important endpoint is:

```text
POST /api/v1/scenario-analyze
```

It combines the full platform logic:

1. Takes cargo type, quantity, origin, destination, and forecast horizon.
2. Runs vessel optimization.
3. Finds the recommended vessel class.
4. Runs freight forecasting for the route/class.
5. Runs market timing strategy.
6. Runs corridor risk assessment.
7. Returns a complete decision package.

This is the best flow to explain during a demo because it connects all modules.

## 12. Frontend Pages

### Product Landing Page

File:

```text
frontend/src/pages/LandingPage.jsx
```

Introduces the product and can run a sample scenario.

### Command Center

File:

```text
frontend/src/pages/DashboardPage.jsx
```

Shows KPIs, alerts, geopolitical risk, market news, map intelligence, and copilot overview.

### Forecast Page

File:

```text
frontend/src/pages/ForecastPage.jsx
```

Calls `/forecast` and visualizes freight predictions, historical rates, uncertainty bounds, model weights, and driving factors.

### Vessel Page

File:

```text
frontend/src/pages/VesselPage.jsx
```

Calls `/recommend-vessel` and shows feasible/rejected vessels with landed cost and constraint reasons.

### Route Map Page

File:

```text
frontend/src/pages/RouteMapPage.jsx
```

Calls `/map-intelligence` and visualizes ports, routes, vessels, congestion, weather, and risks.

### Risk Page

File:

```text
frontend/src/pages/RiskPage.jsx
```

Calls risk, news, sentiment, chokepoint, and geopolitical alert endpoints.

### Strategy Page

File:

```text
frontend/src/pages/StrategyPage.jsx
```

Calls `/market-timing` and `/forecast` to show timing recommendations and forward freight movement.

### Copilot Page

File:

```text
frontend/src/pages/CopilotPage.jsx
```

Calls `/copilot/overview` and `/copilot/chat` for natural-language explanations.

## 13. How Data Moves Through the App

```text
Reference JSON + live/fallback data
        |
        v
Data clients and DB manager
        |
        v
Forecasting / vessel optimization / risk / timing / copilot engines
        |
        v
FastAPI endpoints in src/api/main.py
        |
        v
Axios client in frontend/src/api/client.js
        |
        v
React pages and charts/maps
```

## 14. How to Run It

Automated runner:

```bash
python sync_and_run.py
```

Manual backend:

```bash
pip install -e .
python -B -m uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```

Manual frontend:

```bash
cd frontend
npm install
npm run dev
```

Tests:

```bash
pytest tests/ -v
```

## 15. How to Explain It to Teammates

Use this simple storyline:

1. FreightIQ is built for bulk cargo imports to Indian East Coast ports.
2. The user selects cargo, quantity, origin, destination, route, and vessel assumptions.
3. The forecasting model predicts future USD/MT freight rates.
4. The vessel optimizer checks real port constraints and rejects infeasible ships.
5. The market timing engine decides whether to book now, wait, or lock a contract.
6. The risk engine adds congestion, weather, volatility, and geopolitical disruption.
7. The frontend converts all this into dashboards, charts, maps, alerts, and copilot explanations.

## 16. Demo Script

You can say:

> Our project is FreightIQ, an intelligent freight forecasting and vessel chartering optimization platform. It is focused on bulk cargo imports like coal and iron ore to Indian East Coast ports. The system predicts future freight rates, checks whether vessel classes are compatible with port restrictions, recommends the lowest landed cost option, evaluates whether to book spot or forward contracts, and monitors risks like congestion, weather, and geopolitical disruptions.

Then show:

1. Dashboard for overall KPIs and alerts.
2. Forecast page for future freight rates and drivers.
3. Vessel page for feasibility and landed cost.
4. Route map for ports, vessels, routes, and congestion.
5. Strategy page for spot vs contract decision.
6. Copilot page for explanation in plain English.

## 17. Common Questions and Answers

### What is the main innovation?

It combines freight forecasting, port constraint optimization, risk monitoring, and procurement strategy into one decision pipeline instead of treating them separately.

### Why is port constraint checking important?

The cheapest vessel on paper may be impossible to use if the destination port cannot accept its draft, length, or beam. Haldia is a strong example because it has severe draft restrictions and lighterage requirements.

### Why use an ensemble model?

Different models capture different patterns. XGBoost and LightGBM handle non-linear relationships well, while ElasticNet adds a regularized baseline. The system weights them based on validation performance.

### What are confidence bounds?

They show forecast uncertainty. Instead of only saying the rate may be `$15/MT`, the model gives a likely range around that value.

### What is landed cost?

It is the practical cost per tonne after adding freight, port charges, lighterage, penalties, and demurrage risk.

### What happens if live APIs fail?

Several modules have fallback or demo values, so the app can still run for demonstrations.

## 18. Files to Study First

Read in this order:

1. `README.md`
2. `src/api/main.py`
3. `data/reference/ports_master.json`
4. `data/reference/routes_master.json`
5. `data/reference/vessels_master.json`
6. `src/models/feature_engineering.py`
7. `src/models/ml_forecasting.py`
8. `src/optimization/vessel_optimizer.py`
9. `src/optimization/market_timing.py`
10. `src/risk/risk_engine.py`
11. `frontend/src/api/client.js`
12. `frontend/src/App.jsx`

## 19. Short Pitch

FreightIQ is an AI-powered freight intelligence platform for Indian bulk cargo procurement. It forecasts freight rates, validates vessel feasibility against port constraints, computes landed cost, recommends booking strategy, and monitors corridor risks. The result is a single dashboard that helps chartering teams make faster, cheaper, and safer shipping decisions.
