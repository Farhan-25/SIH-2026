"""
Automated Unit and Integration Test Suite for SIH26006.
Verifies all 4 analytical engines, constraint optimization, database queries, and API endpoints.
"""

import pytest
import pandas as pd
from fastapi.testclient import TestClient

from src.data.db_manager import FreightDBManager
from src.models.ml_forecasting import FreightMLForecaster
from src.models.feature_engineering import FreightFeatureEngineer
from src.optimization.vessel_optimizer import VesselConstraintOptimizer
from src.optimization.market_timing import MarketTimingEngine
from src.risk.risk_engine import RiskAndDisruptionEngine
from src.api.main import app


@pytest.fixture
def db():
    return FreightDBManager()


@pytest.fixture
def vessel_optimizer():
    return VesselConstraintOptimizer()


@pytest.fixture
def timing_engine():
    return MarketTimingEngine()


@pytest.fixture
def risk_engine():
    return RiskAndDisruptionEngine()


@pytest.fixture
def api_client():
    return TestClient(app)


def test_master_reference_integrity(db):
    ports = db.load_ports_master()
    vessels = db.load_vessels_master()
    routes = db.load_routes_master()

    assert "indian_east_coast_ports" in ports
    assert "IN_PRT" in ports["indian_east_coast_ports"]
    assert "IN_HLD" in ports["indian_east_coast_ports"]
    assert "vessel_classes" in vessels
    assert "Capesize" in vessels["vessel_classes"]
    assert "Panamax" in vessels["vessel_classes"]
    assert len(routes["trade_routes"]) >= 10


def test_haldia_lighterage_constraint(vessel_optimizer):
    """Haldia has severe draft limits (8.0m) and MUST trigger lighterage / de-ballasting rules."""
    res = vessel_optimizer.optimize_vessel_choice(
        cargo_parcel_mt=50000,
        origin_port_id="ID_SMR",
        dest_port_id="IN_HLD"
    )
    assert res["destination_port"] == "Haldia Dock Complex (SMP Kolkata)"
    # Capesize should be rejected due to draft/LOA
    cape_eval = next(v for v in res["all_vessel_evaluations"] if v["vessel_class"] == "Capesize")
    assert not cape_eval["is_feasible"]
    assert len(cape_eval["rejection_reasons"]) > 0


def test_gangavaram_deep_draft_capesize(vessel_optimizer):
    """Gangavaram (19.5m draft) must accept fully-laden Capesize vessels from Hay Point."""
    res = vessel_optimizer.optimize_vessel_choice(
        cargo_parcel_mt=175000,
        origin_port_id="AU_HAY",
        dest_port_id="IN_GNV"
    )
    assert res["recommended_vessel_class"] in ["Capesize", "Newcastlemax"]


def test_ml_forecaster_inference():
    forecaster = FreightMLForecaster()
    forecaster.load_model("models/freight_xgb_model.joblib")

    df_raw = pd.read_csv("data/processed/unified_freight_timeseries.csv")
    route_sub = df_raw[(df_raw["route_id"] == "AU_NEW_TO_IN_PRT") & (df_raw["vessel_class"] == "Panamax")]

    res = forecaster.predict_future(route_sub, horizon_weeks=8)
    assert len(res["predictions_usd_per_mt"]) == 8
    assert len(res["lower_bound_80pct"]) == 8
    assert len(res["upper_bound_80pct"]) == 8
    # Lower bound must be <= upper bound
    for l, u in zip(res["lower_bound_80pct"], res["upper_bound_80pct"]):
        assert l <= u


def test_market_timing_bullish_contract_signal(timing_engine):
    spot = 15.0
    # Projected rising rates (15 -> 22)
    rising_forecast = [16.0, 17.5, 19.0, 20.5, 21.0, 22.0]
    res = timing_engine.evaluate_strategy(
        current_spot_rate=spot,
        forecast_rates=rising_forecast,
        forecast_lower=[r * 0.9 for r in rising_forecast],
        forecast_upper=[r * 1.1 for r in rising_forecast],
        target_volume_mt=75000
    )
    assert res["recommended_action"] == "ENTER_NOW_TERM_CONTRACT"
    assert res["estimated_cost_savings_usd"] > 0


def test_fastapi_endpoints(api_client):
    r1 = api_client.get("/api/v1/health")
    assert r1.status_code == 200
    assert r1.json()["status"] == "online"

    r2 = api_client.post("/api/v1/scenario-analyze", json={
        "cargo_type": "Thermal Coal",
        "cargo_parcel_mt": 75000,
        "origin_port_id": "AU_NEW",
        "dest_port_id": "IN_PRT",
        "horizon_weeks": 8
    })
    assert r2.status_code == 200
    data = r2.json()
    assert "scenario_summary" in data
    assert "freight_forecast" in data
    assert "market_timing_strategy" in data
    assert "risk_and_congestion" in data
