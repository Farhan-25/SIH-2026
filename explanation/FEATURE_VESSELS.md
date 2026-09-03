# Feature — Vessel and port constraint optimizer

**Route:** `/vessels` → `frontend/src/pages/VesselPage.jsx`  
**API:** `POST /api/v1/recommend-vessel`  
**Engine:** `src/optimization/vessel_optimizer.py` (`VesselConstraintOptimizer`)

This is a **constraint solver + cost ranker**, not a neural net.

---

## What the user can do

1. Choose origin (global load port) and Indian East Coast destination (filtered by onboarded ports).
2. Enter cargo parcel MT (default 75,000).
3. See recommended class, feasibility table (pass/fail + reasons), landed-cost stack, Plotly cost breakdown.

Ports load from `GET /api/v1/ports`; if that fails, hardcoded origin/destination lists are used.

---

## How a ship is judged

For each vessel in `live_fleet` (from GFW if the API succeeds) or `active_fleet` in `vessels_master.json`:

**Reject** if any of:

- Laden design draft > origin `max_permissible_draft_m`
- LOA > origin `max_loa_m`
- Destination: draft > normal berth **and** > tidal `max_draft_with_tides_m`
- LOA > dest max LOA
- Beam > dest max beam

**Warn** (still feasible) if:

- Port `lighterage_required` (Haldia-style): mandatory lighterage, **+$4.20/MT**
- Draft between normal and tidal limit: high-tide window
- Parcel &lt; 70% of class capacity: deadfreight **+$2.50/MT**

Port IDs accept aliases (`newcastle` → `AU_NEW`, `haldia` → `IN_HLD`, …). Destination lookup prefers Indian ports; origin prefers global load ports.

---

## Landed cost (USD/MT)

```text
landed = base_freight
       + port_charges
       + lighterage
       + deadfreight_penalty
       + demurrage_risk
```

| Term | How it is computed |
| --- | --- |
| `base_freight` | From `predicted_freight_rates[class]` if passed; else class defaults (Handysize 24.50 … Newcastlemax 11.90) |
| `port_charges` | `(port_dues × capacity × 0.6 + pilotage × 30000) / intake_mt` |
| `lighterage` | 4.20 if required, else 0 |
| `deadfreight` | 2.50 if under-utilized |
| `demurrage_risk` | `max(0, (discharge_days − 3) × 0.35)` where `discharge_days = intake / berthday_output` |

Intake = min(parcel, class capacity). Infeasible ships get `total_landed_cost_usd_per_mt: null`.

Feasible ships are **sorted by lowest landed cost**. First is `recommended_vessel_class` / `recommended_vessel_name`.

---

## API

```json
{ "origin_port_id": "newcastle", "dest_port_id": "paradip", "cargo_parcel_mt": 75000 }
```

`recommend-vessel` passes `gfw_client.get_live_cargo_vessels()` as `live_fleet`. Invalid ports → 400.

---

## Demo contrast

- **Haldia (8.0 m):** Capesize rejected on draft; Handy/Supra more likely; lighterage warning.
- **Gangavaram (19.5 m):** Capesize / Newcastlemax often cheapest per tonne on a 175 kt parcel.

Tests: `test_haldia_lighterage_constraint`, `test_gangavaram_deep_draft_capesize`.
