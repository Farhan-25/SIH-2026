# FreightIQ — ML models and how they work

This document describes every statistical and machine-learning component in the repo: what problem it solves, how it is trained, how a prediction is produced, and how it is served. It does **not** change `README.md`.

Product-level context lives in [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md).

---

## Map of models

Freight forecasting is the only place where supervised ML is trained on labelled USD/MT rates. Other “intelligence” modules are either **rule engines** or **NLP classifiers**. They are listed so it is clear what is *not* a freight regressor.

| Component | Type | File | Output |
| --- | --- | --- | --- |
| Feature engineer | Deterministic transforms | `src/models/feature_engineering.py` | Tabular feature matrix |
| Naive / SMA / EMA | Statistical baselines | `src/models/baseline_forecasting.py` | Benchmark forecasts |
| ElasticNet | Linear regularized regression | `src/models/ml_forecasting.py` | Point USD/MT |
| XGBoost | Gradient-boosted trees | same | Point USD/MT + SHAP |
| LightGBM | Gradient-boosted trees | same | Point USD/MT |
| Inverse-MAPE ensemble | Weighted average of the three | same | **Primary API forecast** |
| Quantile GBRT (10% / 90%) | Quantile regression trees | same | 80% confidence cone |
| BiLSTM + attention | PyTorch neural net | `src/models/deep_learning_forecaster.py` | Alternate path + neural quantiles |
| FinBERT (or lexicon fallback) | NLP classifier | `src/risk/nlp_engine.py` | Sentiment score |
| Event / chokepoint tags | Keyword rules | same | Event type, severity |
| Market timing | Threshold rules on the forecast | `src/optimization/market_timing.py` | Spot / wait / COA |
| Vessel optimizer | Constraint solver | `src/optimization/vessel_optimizer.py` | Feasible class + landed cost |

**Served forecast:** `POST /api/v1/forecast` always returns the **tree ensemble** path. If `models/freight_deep_lstm.pt` loaded, it also returns `deep_predictions_usd_per_mt` as a comparison series. The UI chart is driven by the ensemble unless the page overlays the deep series.

---

## 1. What is being predicted

**Target:** `freight_rate_usd_per_mt` — voyage freight in US dollars per metric tonne, one series per `(route_id, vessel_class)` (for example Newcastle→Paradip, Panamax).

**Horizon:** 1 to 24 weeks ahead. Training is one-step (predict next week’s rate from current features). Multi-week paths are built by **recursive rollout**: each predicted rate is fed back as `target_lag_1` for the next week.

**Train / test split:** chronological, last **15%** of rows held out (`test_size=0.15`). Rows are ordered after grouping by route and class, so this is a time holdout, not a random shuffle.

**Data:** `train_models.py` calls `build_unified_freight_dataset()` then both trainers. Checkpoints:

- `models/freight_xgb_model.joblib` — XGB, LGB, ElasticNet, quantile models, weights, metrics
- `models/freight_deep_lstm.pt` — PyTorch weights, `StandardScaler` for X, feature names, history

The API loads those files at startup if they exist.

---

## 2. Feature engineering

**Class:** `FreightFeatureEngineer`  
**Code:** `src/models/feature_engineering.py`

Work is done **per route and vessel class** so lags never leak across corridors.

### Autoregressive (the rate itself)

| Feature | Meaning |
| --- | --- |
| `target_lag_1`, `_2`, `_4`, `_8`, `_12` | Freight 1, 2, 4, 8, 12 weeks ago |
| `target_rolling_mean_4w` / `_12w` | Trailing means (shifted by 1 so they do not include “today”) |
| `target_rolling_std_4w` | 4-week volatility of the rate |

### Cost and commodity drivers

| Feature | Meaning |
| --- | --- |
| `bunker_lag_1`, `bunker_rolling_4w` | VLSFO bunker price (Singapore-style proxy) |
| `fuel_to_freight_ratio` | Bunker / (rate × distance/1000) — how fuel-heavy the economics look |
| `coal_lag_1`, `iron_ore_lag_1`, `coking_coal_lag_1` | Commodity benchmarks, lagged 1 week |
| `usd_inr_fx` | Exchange rate (column expected on the unified CSV) |
| `congestion_index` | Port pressure; if missing, derived from turnaround days × 12, clipped 10–100 |

### Seasonality and route physics

| Feature | Meaning |
| --- | --- |
| `monsoon_flag` | 1 if month is June–September |
| `month_sin` / `month_cos` | Annual cycle (avoids a dummy “December = 12” jump) |
| `quarter_sin` / `quarter_cos` | Quarterly cycle |
| `distance_nm` | Great-circle / route distance |
| `sailing_days_one_way` | Typical laden days |

Leading NaNs from lags are filled with `bfill` then `ffill`. Column aliases map synthesizer names (`bunker_price_vlsfo_usd`, etc.) onto the canonical names above.

**Important at forecast time:** only **rate lags** are rolled forward with the model’s own predictions. Bunker, FX, commodities, congestion, and calendar features stay at the last observed values for the whole horizon. That is a standard recursive-forecast simplification, not a full joint scenario of future oil prices.

---

## 3. Evaluation metrics

**Code:** `compute_evaluation_metrics()` in `src/models/baseline_forecasting.py`

Used for every trained model:

| Metric | Formula (as implemented) |
| --- | --- |
| MAE | mean \|error\| in USD/MT |
| RMSE | sqrt(mean squared error) |
| MAPE | mean \|error / actual\| × 100 |
| MDA | % of weeks where the *sign of the change* matches (directional accuracy) |
| R² | 1 − SS_res / SS_tot |

MAPE is also used to **set ensemble weights** (see below).

---

## 4. Baseline models (not served as the main forecast)

**Class:** `BaselineForecaster`  
**Code:** `src/models/baseline_forecasting.py`

These exist so the tree/neural models can be compared to “dumb” methods:

| Method | How it works | Forward forecast |
| --- | --- | --- |
| `naive` | Ŷ_t = Y_{t−1} | Repeat last observed rate for H weeks |
| `sma` | Rolling mean over `window` (default 4) | Repeat last window mean |
| `ema` | Exponential smoothing, `alpha=0.3` | Repeat last EMA value |

They do not use exogenous features. They are the Phase-2 safety net from the execution plan.

---

## 5. ElasticNet (linear member of the ensemble)

**Library:** `sklearn.linear_model.ElasticNet`  
**Hyperparameters:** `alpha=0.1`, `l1_ratio=0.5`, `random_state=42`

ElasticNet minimizes squared error plus a mix of L1 (lasso) and L2 (ridge) penalties. `l1_ratio=0.5` is an even mix: some coefficients can go to zero (feature selection), the rest are shrunk.

**Role:** a **regularized linear baseline** inside the ensemble. It captures roughly linear effects (e.g. bunker up → freight up) and keeps the blend from relying only on trees. Default ensemble share is small (~10%) unless its holdout MAPE is competitive.

---

## 6. XGBoost

**Library:** `xgboost.XGBRegressor`  
**Hyperparameters:**

- `n_estimators=180` trees  
- `learning_rate=0.04` (slow boosting; each tree corrects a little residual)  
- `max_depth=5`  
- `subsample=0.85`, `colsample_bytree=0.85` (row and column sampling to reduce overfitting)  
- `random_state=42`, `n_jobs=-1`

**How it works:** gradient boosting on regression trees. Tree 1 fits the mean-ish residual of the rate; each later tree fits the remaining error. Prediction is the sum of all trees.

**Why it is used:** freight vs bunker/congestion/seasonality is nonlinear (monsoon × congestion, fuel-to-freight ratio, etc.). Trees split on those interactions without you writing them by hand.

**Also used for SHAP** (`shap.TreeExplainer` on the XGBoost model only). Top 6 features by mean |SHAP| on the latest observation are returned as `top_driving_factors` (normalized to share of total |SHAP|). If SHAP fails, XGBoost `feature_importances_` is used; if that fails, a hardcoded demo driver list is returned.

---

## 7. LightGBM

**Library:** `lightgbm.LGBMRegressor`  
**Hyperparameters:** `n_estimators=180`, `learning_rate=0.04`, `max_depth=6`, `num_leaves=31`, same subsample/colsample as XGB, `verbose=-1`.

**How it differs from XGBoost:** LightGBM grows **leaf-wise** (expands the leaf with the largest loss reduction) instead of level-wise. It is usually faster and can fit slightly different interaction patterns on the same features.

**Role:** second tree expert. If it beats XGBoost on holdout MAPE, it gets a larger ensemble weight automatically.

---

## 8. Inverse-MAPE ensemble (primary production model)

After the three point models are trained, each is scored on the **holdout** set. Weight for model *m*:

```text
w_m = (1 / max(MAPE_m, 0.01))  /  Σ_j (1 / max(MAPE_j, 0.01))
```

Lower MAPE → higher weight. Floor of 0.01 avoids division by zero. Weights are stored in `model_weights` (defaults before training: XGB 0.45, LGB 0.45, ElasticNet 0.10).

**Point prediction:**

```text
ŷ = w_xgb · ŷ_xgb + w_lgb · ŷ_lgb + w_ela · ŷ_ela
```

`FreightMLForecaster(model_type="ensemble")` is what `train_models.py` trains. You can force a single member with `model_type="xgboost"` or `"lightgbm"`.

The API response still includes **per-model traces** (`xgb_predictions_usd_per_mt`, `lgb_predictions_usd_per_mt`, `elastic_predictions_usd_per_mt`) so the Forecast page can show disagreement among experts.

---

## 9. Quantile cones (80% interval)

**Library:** `sklearn.ensemble.GradientBoostingRegressor` with `loss="quantile"`

| Head | `alpha` | Interprets as |
| --- | --- | --- |
| `model_lower` | 0.10 | ~10th percentile (lower rim) |
| `model_upper` | 0.90 | ~90th percentile (upper rim) |

The band between 10% and 90% is an **80% central interval**. (The API field is named `lower_bound_80pct` / `upper_bound_80pct` for that reason, not because alpha is 0.80.)

Each quantile model is a separate GBRT (`n_estimators=120`, `max_depth=4`). Pinball / quantile loss penalizes under- and over-prediction **asymmetrically**, so the 90% model learns to sit above most outcomes.

At inference, bounds are clamped so they cannot cross the point forecast by less than ~6% (`pred × 0.94` / `pred × 1.06`). That is a safety rail if a quantile head misfires.

---

## 10. Recursive multi-week forecast (trees)

**Method:** `FreightMLForecaster.predict_future(route_df, horizon_weeks)`

1. Build features on the historical route slice; take the **last row**.
2. For week 1 … H:
   - Predict XGB, LGB, ElasticNet and the two quantile heads.
   - Blend with stored weights.
   - Append date = last date + H weeks.
   - Shift lags: `lag_12 ← lag_8 ← lag_4 ← lag_2 ← lag_1 ← ŷ`.
3. Compute SHAP drivers on the **original** last observed row (not on synthetic future rows).

Error compounds with horizon: week 12 depends on eleven previous predictions. That is why cones widen in practice even though exogenous inputs are frozen.

---

## 11. Deep model: BiLSTM + multi-head attention

**Class:** `FreightTransformerLSTM` inside `DeepLearningFreightForecaster`  
**Code:** `src/models/deep_learning_forecaster.py`  
**Training script:** 30 epochs, batch 64, `lr=0.003` (`train_models.py`)

### Architecture (forward pass)

1. **Embedding:** Linear(`n_features` → 64) → LayerNorm → GELU → Dropout 0.15  
2. **BiLSTM:** 2 layers, hidden 32 per direction (so 64 after concat), dropout 0.1 between layers  
3. **Multi-head self-attention:** 4 heads on the LSTM output, residual + LayerNorm  
4. **MLP:** 64 → GELU → 32 → GELU  
5. **Two heads:**
   - `point_head`: 32 → 1 (USD/MT)
   - `quantile_head`: 32 → 2 (q10, q90)

Despite the `TimeSeriesDataset(seq_len=4)` helper, **`forward` unsqueezes a flat feature vector to sequence length 1**. So at present the LSTM/attention sees **one timestep of the 23 engineered features**, not a 4-week window of raw rates. Sequential structure is still partly present **inside the features** (lags 1–12). Treat the name “BiLSTM” as a hybrid tabular-NN, not a classic long-sequence TFT.

### Training loop

- **X** is `StandardScaler`-normalized; **y** is left in USD/MT (the y-scaler is constructed but not applied in the train loop).
- Optimizer: **AdamW**, `weight_decay=1e-4`
- LR schedule: **cosine annealing** from 0.003 down to `1e-5`
- Loss: `MSE(point, y) + 0.3 × Pinball(q10,q90 ; y)`
- Gradient clip: max norm 1.5
- Best **validation MSE** state dict is restored at the end
- Device: CUDA if available, else CPU

Pinball loss for quantile *q*:

```text
max( (q − 1) · (y − ŷ_q),  q · (y − ŷ_q) )
```

Recursive forecast is the same lag-shifting pattern as the trees, after scaling X with the saved `scaler_X`.

The deep model is **optional**. If the `.pt` file is missing or load fails, the API still serves the ensemble.

---

## 12. Training pipeline (one command)

```bash
python train_models.py
```

Order:

1. Build unified timeseries (OGD / FRED / synthesizer), 2018-01-01 → 2026-08-25 in the script  
2. Train tree ensemble + quantiles → `models/freight_xgb_model.joblib`  
3. Train deep net 30 epochs → `models/freight_deep_lstm.pt`  
4. Print MAE / RMSE / MAPE / R² table  
5. Smoke-test 12-week Newcastle→Paradip Panamax path for both families and print top SHAP drivers  

---

## 13. How the API uses the models

On startup (`src/api/main.py`):

- `FreightMLForecaster().load_model("models/freight_xgb_model.joblib")` if the file exists  
- `DeepLearningFreightForecaster().load_checkpoint("models/freight_deep_lstm.pt")` if the file exists  

`POST /api/v1/forecast`:

1. Filter `data/processed/unified_freight_timeseries.csv` by route then vessel class (with fallbacks).  
2. `ml_forecaster.predict_future(...)` → main path, cones, SHAP, weights.  
3. If deep model is loaded, `deep_forecaster.predict_future(...)`.  
4. Market timing is run on the **ensemble** path, not the deep path.  
5. Response includes both traces plus `benchmarks` (including `deep_learning` metrics when present).

`POST /api/v1/shap-explain` reuses the same forecast object’s `top_driving_factors`.

`POST /api/v1/scenario-analyze` chains vessel optimizer → this forecast → timing → risk.

---

## 14. NLP models (not freight regressors)

**File:** `src/risk/nlp_engine.py`  
**Class:** `MaritimeNLPEngine`

### Sentiment

1. Try Hugging Face **`ProsusAI/finbert`** (`AutoModelForSequenceClassification` + sentiment pipeline, CPU `device=-1`).  
2. Map label to score: positive → `+P`, negative → `−P`, neutral → `0` (`P` = model confidence).  
3. If transformers/weights are unavailable, a **maritime lexicon** counts negative vs positive keywords (`attack`, `congestion`, … vs `recovery`, `resumed`, …) and emits the same JSON shape with `"engine": "domain_lexicon"`.

### Events and entities (rules, not a trained NER)

- Event taxonomy (SECURITY_ATTACK, VESSEL_DIVERSION, PORT_CONGESTION, …) by keyword hit counts and a default severity.  
- Chokepoints (Red Sea, Suez, Malacca, Panama, Cape) by regex.  
- Vessel class / cargo / port strings by substring match.

These features feed geopolitical risk and `/forecast/features`; they are **not** concatenated into the XGBoost feature list inside `get_feature_columns()` today.

---

## 15. What is not a trained ML model

| Module | Mechanism |
| --- | --- |
| Vessel optimizer | Hard checks on draft, LOA, beam; cost arithmetic |
| Market timing | If short-term forecast rise > 6% and mid-term > 8% → COA; if drop > 5% with trough in 4 weeks → wait; else spot |
| Corridor risk | Weighted sum of AIS congestion, Open-Meteo sea state, volatility |
| Copilot | Gemini if API key set, else templated domain answers |

Judges often ask “is the whole product one neural net?” — **No.** The neural net is an optional second freight path. The production rate is a **weighted tree+linear ensemble** with quantile cones and SHAP.

---

## 16. Honest limitations (useful in Q&A)

- Route × class granularity uses a **calibrated synthesizer** where Baltic indices are not free.  
- Recursive horizons freeze bunker/FX/commodity futures.  
- The deep net’s LSTM currently sees **sequence length 1** of engineered features.  
- SHAP explains **XGBoost**, not the full ensemble blend.  
- Chronological split is on the concatenated panel; leakage across routes is avoided in feature creation, but a global 85/15 cut is not a per-route walk-forward CV.  
- No automated weekly retrain job yet (`python train_models.py` is manual).

---

## 17. Files to read in order

1. `src/models/feature_engineering.py`  
2. `src/models/baseline_forecasting.py`  
3. `src/models/ml_forecasting.py`  
4. `src/models/deep_learning_forecaster.py`  
5. `train_models.py`  
6. Forecast handler in `src/api/main.py` (`get_freight_forecast`)  
7. `src/risk/nlp_engine.py` (sentiment only)
