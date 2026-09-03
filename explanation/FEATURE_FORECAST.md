# Feature — Freight forecast (UI and API)

How a user gets a USD/MT outlook. Model internals are in [ML_MODELS.md](ML_MODELS.md).

**Route:** `/forecast` → `frontend/src/pages/ForecastPage.jsx`  
**API:** `POST /api/v1/forecast`  
**Also:** `POST /api/v1/shap-explain`

---

## What the user can do

1. Pick a **trade corridor** (filtered by onboarding profile when routes are selected).
2. Pick a **vessel class** allowed on that corridor.
3. Pick a **horizon**: 4, 8, 12, 16, or 24 weeks.
4. Pick a **model mode**: overlay all models, ensemble only, BiLSTM, XGBoost, or LightGBM.
5. Run forecast; see history (last ~36 weeks), forward path, 80% cone, SHAP drivers, MAPE/weights, and a timing snippet from Module C.

Money on the chart uses `PreferencesContext` (USD or INR display conversion).

---

## Request and response

Body:

```json
{ "route_id": "AU_NEW_TO_IN_PRT", "vessel_class": "Panamax", "horizon_weeks": 12 }
```

`route_id` is normalized (`au_par` → `AU_NEW_TO_IN_PRT`, etc.) in `src/api/main.py`.

The handler:

1. Loads cached `data/processed/unified_freight_timeseries.csv`.
2. Filters by route + class, then route, then class, then the whole panel.
3. Calls `FreightMLForecaster.predict_future` (always the served path).
4. Optionally `DeepLearningFreightForecaster.predict_future`.
5. Runs `MarketTimingEngine.evaluate_strategy` on the ensemble path.
6. Returns historical dates/rates, ensemble + per-model + deep traces, cones, SHAP, weights, benchmarks, timing.

If the CSV is missing → HTTP 503.

---

## UI model modes

| Mode | Series shown |
| --- | --- |
| `compare` | Ensemble + XGB + LGB + deep overlay |
| `ensemble` | Inverse-MAPE blend only |
| `deep_learning` | PyTorch path (`deep_predictions_usd_per_mt`) |
| `xgboost` / `lightgbm` | That member’s recursive path |

Driver names are mapped in `FEATURE_NAME_MAP` (e.g. `target_lag_1` → “Prior Week Freight Rate”). If SHAP is empty, `DEFAULT_DRIVERS` fill the panel.

---

## SHAP endpoint

`POST /api/v1/shap-explain` uses XGBoost `feature_importances_` (top 8), not a fresh TreeExplainer pass. The Forecast page normally uses `top_driving_factors` from `/forecast`.

---

## What this is not

It does not execute a fixture. Cones are quantile models, not a guaranteed band. Exogenous inputs (bunker, FX) stay frozen during the recursive horizon — see [ML_MODELS.md](ML_MODELS.md).
