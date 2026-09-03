# Feature — Command Center (dashboard)

**Route:** `/dashboard` → `frontend/src/pages/DashboardPage.jsx`  
**API:** `GET /api/v1/dashboard`  
Also consumes news, copilot overview, and map intelligence on the same page.

---

## KPI cards

Built in `get_dashboard_data()`:

| KPI | Source |
| --- | --- |
| Average freight USD/MT | Mean of latest week in unified timeseries; trend vs ~4 weeks earlier |
| Brent crude | FRED `DCOILBRENTEU` |
| USD/INR | FRED `DEXINUS` |
| Avg East Coast wait (days) | OGD turnaround CSV (Paradip, Vizag, Haldia); fallback random 3.2–4.5 if file missing |
| Coal / iron ore | FRED `PCOALAUUSDM` / `PIORECRUSDM` |

FRED fetch is parallel (thread pool), cached 300 s.

---

## Alerts

Appended in order:

1. Bay of Bengal sea state at Paradip coords (Open-Meteo): ≥4.5 m critical cyclone-style; ≥2.0 m monsoon warning; else calm.  
2. Freight 4-week move: &lt; −3% opportunity; &gt; +5% rising / lock forward.  
3. Port wait &gt; 4 days → consider Dhamra/Gangavaram.  
4. Brent &gt; $85 → bunker surcharge warning.  
5. Always: “data pipeline healthy” with dataset date.

Header notification dropdown is **static demo copy** (Singapore congestion, Cape weather, forecast updated) — not the same array as these API alerts.

---

## Other dashboard blocks

- **Recent forecasts:** six named corridors from the latest week (rate, vessel, congestion).  
- **System status:** ensemble MAPE, deep model loaded or not, FRED series count, AIS connected / not configured / reconnecting.  
- **News source links:** Baltic, Lloyd’s List, TradeWinds, etc. (URLs only; not scraped).  
- Page also pulls copilot briefing, geopolitical sentiment, and map vessels depending on current `DashboardPage.jsx` layout.

---

## Access

Requires login + completed onboarding (see [FEATURE_AUTH_ONBOARDING.md](FEATURE_AUTH_ONBOARDING.md)). Landing `/` is public.
