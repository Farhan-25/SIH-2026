# Explanation documents

These files sit beside the root `README.md`. The README is not replaced.

## Start here

| File | What it covers |
| --- | --- |
| [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) | Full product: problem, architecture, APIs, UI, setup |
| [ML_MODELS.md](ML_MODELS.md) | Features, ensembles, LSTM, SHAP, FinBERT, training |

## Features (how each product surface works)

| File | Sidebar / surface |
| --- | --- |
| [FEATURE_LANDING_SCENARIO.md](FEATURE_LANDING_SCENARIO.md) | Public landing + `scenario-analyze` (all four engines) |
| [FEATURE_AUTH_ONBOARDING.md](FEATURE_AUTH_ONBOARDING.md) | Signup, login, ports/routes/cargo profile, theme, USD/INR |
| [FEATURE_DASHBOARD.md](FEATURE_DASHBOARD.md) | Command Center KPIs, alerts, system status |
| [FEATURE_FORECAST.md](FEATURE_FORECAST.md) | Forecast page and `/forecast` (models → ML_MODELS.md) |
| [FEATURE_VESSELS.md](FEATURE_VESSELS.md) | Draft/LOA/beam checks and landed cost |
| [FEATURE_MAP.md](FEATURE_MAP.md) | MapLibre routes, AIS/GFW fleet, weather overlay |
| [FEATURE_RISK.md](FEATURE_RISK.md) | Corridor risk, AIS congestion, news, chokepoints |
| [FEATURE_STRATEGY.md](FEATURE_STRATEGY.md) | Spot vs wait vs COA + idle guidance |
| [FEATURE_COPILOT.md](FEATURE_COPILOT.md) | Briefing + Gemini / rule-based chat |
| [FEATURE_DATA_LAYER.md](FEATURE_DATA_LAYER.md) | SQLite, synthesizer, live clients, admin APIs |

## Suggested reading order

1. Root `README.md`  
2. `PROJECT_DOCUMENTATION.md`  
3. Feature files for the demo path: Landing → Auth → Dashboard → Forecast → Vessels → Map → Strategy → Risk → Copilot  
4. `ML_MODELS.md` before judge questions on XGBoost / LSTM  
5. `FEATURE_DATA_LAYER.md` for “where does the data come from?”
