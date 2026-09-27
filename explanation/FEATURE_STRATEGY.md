# Feature — Market timing and strategy

**Route:** `/strategy` → `frontend/src/pages/StrategyPage.jsx`  
**API:** `POST /api/v1/market-timing`  
**Engine:** `src/optimization/market_timing.py` (`MarketTimingEngine`)

Rule-based decision support on top of the **ensemble forecast**. It does not train weights.

---

## What it answers

Given current spot and a forward path: book **spot now**, **lock a term COA**, or **wait N weeks**. Also idle / repositioning notes if the market is expected to collapse.

---

## Inputs

| Field | Role |
| --- | --- |
| `current_spot_rate` | Today’s USD/MT |
| `vessel_class` | Used by the API to pull a 12-week forecast from the timeseries |
| `target_volume_mt` | Scales estimated savings |

The API builds `forecast_rates` / cones via `ml_forecaster.predict_future` on that class. If no CSV, it synthesizes a mild upward path: `spot × (1 + 0.008 × week)`.

---

## Decision rules

Let

- `avg_4w` = mean of first 4 forecast points  
- `avg_12w` = mean of first 12 (or all if shorter)  
- `trough_week` = index of the minimum forecast (1-based)  
- `Δ4` = (avg_4w − spot) / spot × 100  
- `Δ12` = (avg_12w − spot) / spot × 100  
- Term rate = `avg_12w × 0.95` (5% COA discount)

| Condition | Action | Savings estimate |
| --- | --- | --- |
| `Δ4 > 6%` **and** `Δ12 > 8%` | `ENTER_NOW_TERM_CONTRACT` | `(avg_12w − term_rate) × volume` |
| `Δ4 < −5%` **and** trough within 4 weeks | `WAIT_N_WEEKS` | `(spot − trough_rate) × volume` |
| else | `ENTER_NOW_SPOT` | 0 |
| empty forecast | `ENTER_NOW_SPOT`, 50% confidence | — |

Confidence is capped (~92% / ~88% / 80%) from the size of the move.

Empty-forecast short-circuit returns `action` (not `recommended_action`); the normal path always uses `recommended_action`.

---

## Idle / repositioning

If `avg_12w < 0.90 × spot`:

- Idle risk **High**
- Suggest coastal cabotage (e.g. Paradip → Ennore/Tuticorin) or ballast toward SE Asia / Indonesia

Otherwise: **Low** idle risk, keep the dedicated shuttle.

---

## UI

Strategy page shows the pulse signal card, forward curve (from `/forecast` and/or `/market-timing`), and a spot vs term comparison. Currency follows the header toggle.

---

## Link to the SIH objective

### 1. Spot → Multi-Voyage Contract Migration

**Problem Statement:** *"Development of model to facilitate moving from multiple single spot contracts being entered into currently to short term / medium term multiple voyage contracts."*

`MarketTimingEngine.evaluate_strategy()` returns a `spot_to_contract_consolidation_pct` field. Formula:
`consolidation_pct = (TERM_CONTRACT decisions / total decisions) × 100`

This uses a session-rolling history of `recommended_action` strings (up to 20 entries) to track and visually surface on the **Strategy & Timing** page whether the procurement cadence is shifting toward term/COA structures as intended.

### 2. Idle Time Minimisation

**Problem Statement:** *"Propose strategies for minimising vessel idle time by forecasting periods of low demand and suggesting alternative employment opportunities or optimised positioning to reduce deadheading."*

The `_get_idle_scenario_repositioning()` method derives actual 12-route master alternate employment and returns:
- `idle_risk_level`: "Low" / "Medium" / "High" graded from the forward curve.
- `idle_days_estimate`: Numeric estimated idle/ballast days.
- `savings_vs_ballast_usd`: Headline $ saved vs straight ballast return.
- `alternate_employment`: List of real alternate routes with per-option savings.

This guidance is rendered on the **Strategy & Timing** page as the **"Idle Risk & Alternate Employment"** card.

This is the explicit “move from many spots to short/medium multi-voyage contracts” module: a COA is recommended only when the model sees a **sustained bullish** path, not on every wiggle.
