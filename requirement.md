# Requirements Specification: SIH26006

## 1. System Overview
The objective is to engineer an **Intelligent Freight Forecasting and Chartering Optimization System** for bulk cargo imports (primarily Thermal & Coking Coal, Iron Ore, Bauxite) originating from key international load ports (Australia, USA, Mozambique, Russia, Indonesia) and discharging at **East Coast of India Ports** (Paradip, Vizag, Gangavaram, Gopalpur, Dhamra, Sagar-Sandheads, Haldia).

---

## 2. Functional Requirements (FR)

### FR-1: Freight Rate Forecasting Engine (Module A)
- **FR-1.1 Multi-Horizon Forecasting**: Predict voyage & time-charter equivalent freight rates ($\$/\text{tonne}$ and $\$ / \text{day}$) for 15-day, 30-day, 60-day, and 90-day horizons.
- **FR-1.2 Vessel-Class Granularity**: Provide forecasts across standard dry bulk vessel categories:
  - Handysize (10,000 – 39,999 DWT)
  - Supramax / Ultramax (50,000 – 64,999 DWT)
  - Panamax / Kamsarmax (65,000 – 84,999 DWT)
  - Capesize / Newcastlemax (100,000 – 220,000+ DWT)
- **FR-1.3 Multi-Route Coverage**: Support key origin-destination pairs:
  - Australia (Hay Point, Gladstone, Newcastle) $\rightarrow$ East Coast India
  - Indonesia (Kalimantan, Samarinda, Muara Berau) $\rightarrow$ East Coast India
  - Mozambique (Beira, Nacala, Maputo) $\rightarrow$ East Coast India
  - USA (Norfolk/Hampton Roads, Baltimore, Mobile) $\rightarrow$ East Coast India
  - Russia (Taman, Ust-Luga, Vostochny) $\rightarrow$ East Coast India
- **FR-1.4 Confidence Intervals & Uncertainty**: Output $80\%$ and $95\%$ prediction bands alongside point estimates.
- **FR-1.5 Model Explainability**: Provide feature importance and SHAP-based waterfall plots explaining drivers of rate movements (bunker fuel, BDI trends, port congestion, commodity prices, FX rates).

### FR-2: Vessel Type & Physical Constraint Optimizer (Module B)
- **FR-2.1 Port Infrastructure Constraint Engine**:
  - Evaluate physical and operational restrictions for origin and discharge ports:
    - Maximum Permissible Draft (in meters, accounting for tidal windows & seasonal siltation).
    - Maximum Length Overall (LOA in meters).
    - Maximum Beam (in meters).
    - Cargo Handling & Discharge Rates (tonnes/day).
    - Lighterage / Transshipment mandates (e.g. Sagar/Sandheads lightering for Haldia).
- **FR-2.2 Optimization & Recommendation**:
  - Given a parcel size (e.g. 75,000 MT coal) and route, evaluate feasibility across all vessel classes.
  - Compute total delivered logistics cost per tonne ($\text{Freight} + \text{Bunker} + \text{Port/Berth Charges} + \text{Demurrage Risk} + \text{Lighterage Costs}$).
  - Recommend the optimal vessel type with full constraint satisfaction logs (e.g., *"Capesize rejected: exceeds Paradip draft of 14.5m; Panamax recommended at lowest total landed cost"*).

### FR-3: Market Timing & Spot vs Multi-Voyage Contract Evaluator (Module C)
- **FR-3.1 Decision Logic Engine**:
  - Compare instantaneous Spot Market rates vs forward Short-Term (3–6 months) and Medium-Term (6–12 months) Multiple Voyage Contracts (COA / Period Charter).
  - Output clear actionable signals:
    - `ENTER NOW (Spot)`: If forward rates are projected to rise significantly.
    - `ENTER NOW (Term Contract / COA)`: Lock in forward rates when current curve is near trough.
    - `WAIT / DEFER (X Weeks)`: If rate forecast indicates near-term downward correction.
- **FR-3.2 Idle Scenario & Repositioning Module**:
  - Detect projected low-demand / high-rate collapse windows.
  - Suggest triangular routing / repositioning alternatives to minimize ballast legs and deadheading.

### FR-4: Port Congestion & Disruption Risk Early Warning (Module D)
- **FR-4.1 AIS Congestion Tracker / Proxy**:
  - Monitor anchorage vessel density and average waiting turnaround time at major discharge and load ports.
- **FR-4.2 Macro & Marine Weather Risk Alerts**:
  - Ingest marine weather conditions (wave height, cyclone season warnings in Bay of Bengal) and flag potential demurrage and turnaround delays.
  - Flag extreme volatility / anomaly spikes in fuel and freight indices.

### FR-5: Interactive Decision Support Dashboard (UI/UX)
- **FR-5.1 Procurement Scenario Planner**: Interactive input controls for:
  - Cargo Type (Thermal Coal, Coking Coal, Iron Ore, etc.)
  - Cargo Quantity (Metric Tonnes)
  - Origin Port & Loading Window
  - Destination Port & Required Delivery Window
  - Contract Strategy Preference (Spot vs Medium-Term COA)
- **FR-5.2 Visual Analytics**:
  - Route Map Visualization (origin $\rightarrow$ discharge with live congestion & weather overlays)
  - Interactive Forecast Time-Series Graphs (Historical + Forecast + Confidence Cone)
  - Vessel Feasibility & Cost Comparison Matrix
  - Actionable Strategy Summary Card & Exportable PDF/Excel Procurement Briefing.

---

## 3. Data Requirements

| Category | Specific Datasets | Source / API | Update Frequency |
| :--- | :--- | :--- | :--- |
| **Port Infrastructure** | Max Draft, LOA, Beam, Berths, Handling Rates for 7 Indian East Coast Ports + 12 International Load Ports | Official Port Handbooks, Ministry of Ports (data.gov.in) | Static / Curated Ref |
| **Indian Port Throughput** | Port traffic, berth waiting days, commodity volume | `data.gov.in` (OGD API via `datagovindia`) | Monthly / Historical |
| **Freight Indices** | Baltic Dry Index (BDI, BCI, BPI, BSI, BHSI) | Trading Economics API, Public Market Feeds, Calibrated Generator | Daily / Weekly |
| **Commodities & Energy** | Thermal Coal (Australia/Newcastle, S. Africa), Coking Coal, Brent/VLSFO Bunker Fuel | World Bank Pink Sheet, EIA API, Commodities-API | Daily / Monthly |
| **Currency / Macro** | USD/INR, USD/AUD, Global Manufacturing PMI | Open Exchange Rates / exchangerate-api | Daily |
| **AIS & Congestion** | Port anchorage counts, vessel positions | AISstream.io (WebSocket), MarineTraffic proxies | Real-time / Daily |
| **Marine Weather** | Wave height, wind speed, swell in Bay of Bengal & trade lanes | Open-Meteo Marine API (Free, No Key) | Real-time / 7-day forecast |

---

## 4. Non-Functional Requirements (NFR)

- **NFR-1 Performance & Latency**: Full scenario recommendation pipeline and forecast chart generation in $< 2.0\text{ seconds}$.
- **NFR-2 Reliability & Offline Mode**: Pre-cached dataset fallbacks and synthetic generators so demo never fails without internet connection.
- **NFR-3 Modularity**: Clean decoupling between Data Ingestion, ML Inference, Optimization Constraints, and Web Presentation.
- **NFR-4 Usability**: Intuitive for a non-technical logistics/procurement manager; zero raw terminal interaction needed.
- **NFR-5 Security & Integrity**: API keys isolated in environment configurations (`.env`), read-only data layer for queries.
