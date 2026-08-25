# 🚢 SIH26006: Setup & Execution Guide

> **Intelligent Freight Forecasting Model for Optimized Vessel Chartering & Bulk Cargo Procurement (Overseas $\rightarrow$ East Coast India)**

---

## ⚡ Quick Start: 1-Command Automated Runner

We provide an automated Python script that **fetches latest git changes**, **checks/installs all dependencies**, **cleans bytecode/cache**, and **launches both the backend and frontend servers simultaneously**:

```bash
# Clone the repository (if not already done)
git clone https://github.com/Farhan-25/SIH-2026.git
cd SIH-2026

# Run the automated sync & launch script
python sync_and_run.py
```

### 🎛️ Runner Options:
```bash
python sync_and_run.py               # Auto-sync Git + verify dependencies + launch Backend & Frontend
python sync_and_run.py --no-sync     # Launch without checking/pulling Git remote
python sync_and_run.py --sync-only   # Pull Git & verify dependencies without starting servers
python sync_and_run.py --backend     # Launch Backend (FastAPI) only
python sync_and_run.py --frontend    # Launch Frontend (React + Vite) only
python sync_and_run.py --clean       # Purge cache and exit
```

---

## 🖥️ Live Service URLs

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend UI (React)** | [http://localhost:3000](http://localhost:3000) | Command Center, Forecast, Vessels, Route Map, Risk, Strategy |
| **Backend API (FastAPI)** | [http://localhost:8000](http://localhost:8000) | Core ML forecasting and optimization REST endpoints |
| **Interactive API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Swagger UI for testing all API endpoints |
| **Health Check** | [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health) | Real-time system and model status |

---

## 🛠️ Manual Step-by-Step Setup

If you prefer to set up and run the services manually in separate terminals:

### 1. Prerequisites
- **Python 3.10+** (Tested on Python 3.10, 3.11, 3.12, 3.14)
- **Node.js 18+** & **npm**

### 2. Backend Setup & Run

```bash
# 1. Navigate to project root
cd SIH-2026

# 2. Install Python package & dependencies in editable mode
pip install -e .

# 3. (Optional) Configure environment variables
# Copy .env.example to .env and add any custom API keys
cp .env.example .env

# 4. Start the FastAPI backend
python -B -m uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup & Run

```bash
# 1. Navigate to frontend directory
cd SIH-2026/frontend

# 2. Install Node packages
npm install

# 3. Start the Vite dev server
npm run dev
```

---

## 🔑 Environment Configuration (`.env`)

Create a `.env` file in the project root with the following keys (defaults and fallback synthetic generators are included so the system runs smoothly even offline):

```env
# AISStream WebSocket Live Vessel Position Key
AISSTREAM_API_KEY=095a3c384de41d6568fa196bf41cef395109b055

# TwelveData Financial Commodities & FX Key
TWELVEDATA_API_KEY=29feab62b6574c3e9d006c52c97b46d7

# Open-Meteo Marine API (Free, no key needed)
# World Bank Pink Sheet (Free public data)
```

---

## 🧪 Running Automated Tests

To verify all data pipelines, ML forecasting algorithms, and vessel optimization constraint solvers:

```bash
pytest tests/ -v
```

---

## 📁 Project Architecture Overview

```
SIH-2026/
├── pyproject.toml               # Native Python package definition
├── sync_and_run.py              # Automated Git sync & concurrent runner
├── setup.md                     # This setup guide
├── ps.md                        # Problem statement specification
├── requirement.md               # Functional & non-functional requirements
├── task.md                      # Milestone execution tracker
├── memory.md                    # System state & persistent log
│
├── src/                         # Core Python Backend Package
│   ├── api/                     # FastAPI endpoints & routes (main.py)
│   ├── data/                    # Ingestion clients (AIS, Weather, FX, OGD Ports)
│   ├── models/                  # ML Engine (XGBoost, Feature Engineering, Quantiles)
│   ├── optimization/            # Constraint solver (Draft, LOA, Lighterage, Landed Cost)
│   └── risk/                    # Composite risk engine (AIS queue + Sea state)
│
├── frontend/                    # Modern React + Vite Web Application
│   ├── src/
│   │   ├── api/client.js        # Backend API integration
│   │   ├── pages/               # Dashboard, Forecast, Vessels, Routes, Risk, Strategy
│   │   └── index.css            # Dark glassmorphism design system
│   ├── vite.config.js           # Vite dev server & proxy configuration
│   └── package.json             # NPM dependencies
│
├── data/
│   ├── reference/               # Master Port, Vessel Class, and Route catalogs
│   └── raw/                     # Historical OGD port performance records
│
└── tests/                       # Automated pytest test suites
```

---

## ❓ Troubleshooting & FAQs

### Q: Why do I see no `__pycache__` folders?
**A**: We configured `PYTHONDONTWRITEBYTECODE=1` and IDE settings in `.vscode/settings.json` to keep the codebase clean and avoid generating compiled bytecode folders.

### Q: How do I update to the latest team commits?
**A**: Simply run `python sync_and_run.py`. It runs `git fetch` and `git pull --rebase` automatically before starting.
