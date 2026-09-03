# Feature — Landing page and full scenario pipeline

**Landing:** `/` → `frontend/src/pages/LandingPage.jsx` (public)  
**Pipeline API:** `POST /api/v1/scenario-analyze`

This is the **one-call demo** that stitches Modules A–D. The landing “sandbox” is the same API.

---

## Landing UX

- Full-page looping video background (play/pause).  
- Product story and CTAs into login / dashboard.  
- **Interactive sandbox:** cargo type, volume, origin, destination → `analyzeScenario({ ..., horizon_weeks: 8 })`.  
- Tabs for engines A–D on the returned package (forecast, vessel, timing, risk).  
- USD/INR formatting from preferences even before login.  
- CTA: authenticated + onboarded users go to Command Center; others to login.

Sandbox errors are swallowed; the page can show empty/synthetic UI if the backend is down.

---

## Scenario pipeline (`run_full_scenario_analysis`)

Body:

```json
{
  "cargo_type": "Thermal Coal",
  "cargo_parcel_mt": 75000,
  "origin_port_id": "newcastle",
  "dest_port_id": "paradip",
  "horizon_weeks": 12
}
```

| Step | Engine | On failure |
| --- | --- | --- |
| 1 | `optimize_vessel_choice` + live GFW fleet | Hard-coded Panamax / $16.42/MT stub |
| 2 | Match timeseries by origin & dest aliases in `route_id`, else class, else all rows; `predict_future` | **503** if no forecast |
| 3 | `evaluate_strategy` on that path and parcel volume | — |
| 4 | `evaluate_corridor_risk` using dest coordinates from port master | Default Paradip lat/lon |

Response:

```text
scenario_summary          cargo, ports, recommended vessel, landed $/MT
vessel_optimization       full feasibility list
freight_forecast          ensemble path + cones + SHAP
market_timing_strategy    ENTER_NOW_* / WAIT_*
risk_and_congestion       composite score + alerts
```

Use this in a live demo: change dest from **Paradip** to **Haldia** and show Capesize rejection + lighterage; then Gangavaram for Cape economics.
