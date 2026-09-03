# Feature — AI Maritime Copilot

**Route:** `/copilot` → `frontend/src/pages/CopilotPage.jsx`  
**Engine:** `src/api/copilot_engine.py` (`MaritimeCopilotEngine`)  
**API:** `GET /api/v1/copilot/overview` (alias `/briefing`), `POST /api/v1/copilot/chat`

This is an **explanation layer**. It does not train models or book ships.

---

## Overview / briefing

`generate_executive_briefing()` (and overview endpoint) gathers live-ish state:

- FinBERT/lexicon sentiment  
- Chokepoint scores  
- Commodity / bunker / FX (World Bank tracker + fallbacks)  
- AIS waits at Paradip / Haldia / Vizag  
- Vessel count, route count, spot snapshot  

Returns markdown briefing, key insights, suggested follow-up questions.

---

## Chat

`POST /copilot/chat` body: `{ "message": "...", "context": optional }`.

1. If `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set: Gemini 1.5 Flash (`generateContent`), temperature 0.3, 750 tokens, 8 s timeout. Prompt injects the live state as RAG context.  
2. On missing key, HTTP error, or timeout: **keyword router** `_generate_grounded_response`.

| Query contains | Template |
| --- | --- |
| forecast, shap, why, freight, rising | Rate drivers (bunker, coal, FX, Red Sea, Paradip wait) |
| red sea, suez, malacca, houthi, cape | Chokepoint diversion narrative |
| vessel, draft, haldia, dhamra, capesize… | Port constraint playbook |
| spot, forward, contract, when, charter | 60% term / 40% spot heuristic (not identical to Module C thresholds) |
| else | Generic live-state summary |

Frontend `askCopilot(message, context)` in `client.js`.

---

## Demo questions that hit each branch

- Why are Newcastle to Paradip rates rising?  
- Recommend a vessel for 75,000 MT coal to Dhamra.  
- Should we book spot or forward?  
- What is the Red Sea disruption impact?

---

## Limits

- Gemini answers can drift; the rule templates are deterministic.  
- Copilot timing advice (60/40) is **not** the same code path as `MarketTimingEngine`.  
- State defaults (e.g. Red Sea 0.75) apply if geo/AIS calls fail.
