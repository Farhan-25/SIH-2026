"""
Automated Unit and Integration Test Suite for SIH26006.
Verifies all 4 analytical engines, constraint optimization, database queries, and API endpoints.
"""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.data.db_manager import FreightDBManager
from src.models.ml_forecasting import FreightMLForecaster
from src.optimization.market_timing import MarketTimingEngine
from src.optimization.vessel_optimizer import VesselConstraintOptimizer
from src.risk.risk_engine import RiskAndDisruptionEngine


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
    assert "risk_and_congestion" in data


def test_admin_crud_endpoints(api_client, db):
    # 1. Test Port CRUD
    test_port = {
        "port_id": "IN_TEST_PORT",
        "port_name": "Test Port Odisha",
        "state": "Odisha",
        "country": "India",
        "region": "East Coast India",
        "coordinates": {"lat": 19.5, "lon": 85.8},
        "max_permissible_draft_m": 16.5,
        "handling_capacity_mtpa": 40.0
    }
    r_post = api_client.post("/api/v1/admin/ports", json=test_port)
    assert r_post.status_code == 200

    ports = db.load_ports_master()
    assert "IN_TEST_PORT" in ports["indian_east_coast_ports"]

    r_del = api_client.delete("/api/v1/admin/ports/IN_TEST_PORT")
    assert r_del.status_code == 200

    ports_after = db.load_ports_master()
    assert "IN_TEST_PORT" not in ports_after["indian_east_coast_ports"]

    # 2. Test Route CRUD
    test_route = {
        "route_id": "TEST_ORIG_TO_TEST_DEST",
        "origin_port": "AU_HAY",
        "destination_port": "IN_PRT",
        "origin_name": "Hay Point",
        "destination_name": "Paradip",
        "distance_nautical_miles": 5200,
        "primary_cargo": "Coking Coal",
        "typical_vessel_classes": ["Capesize"]
    }
    r_route_post = api_client.post("/api/v1/admin/routes", json=test_route)
    assert r_route_post.status_code == 200

    routes = db.load_routes_master()
    route_ids = [r["route_id"] for r in routes["trade_routes"]]
    assert "TEST_ORIG_TO_TEST_DEST" in route_ids

    r_route_del = api_client.delete("/api/v1/admin/routes/TEST_ORIG_TO_TEST_DEST")
    assert r_route_del.status_code == 200


def test_ogd_port_turnaround_tracker(db):
    from src.data.ogd_client import OGDPortTurnaroundTracker
    tracker = OGDPortTurnaroundTracker(db_manager=db)
    trt_map = tracker.get_latest_turnaround_map()
    assert isinstance(trt_map, dict)
    assert "IN_PRT" in trt_map
    assert trt_map["IN_PRT"] > 0.0


def test_chokepoints_and_risk_weights_api(api_client, db):
    # 1. Test Chokepoints CRUD
    chk_payload = {
        "chokepoint_key": "test_strait",
        "name": "Test Maritime Strait",
        "terms": ["test strait", "test waterway"],
        "baseline_volume_per_day": 8.0,
        "is_active": True
    }
    r_chk_post = api_client.post("/api/v1/admin/chokepoints", json=chk_payload)
    assert r_chk_post.status_code == 200

    chks = db.load_chokepoints_master(active_only=False)
    assert "test_strait" in chks
    assert chks["test_strait"]["name"] == "Test Maritime Strait"

    r_chk_del = api_client.delete("/api/v1/admin/chokepoints/test_strait")
    assert r_chk_del.status_code == 200

    # 2. Test Risk Weights Configuration & Normalization
    new_weights = {
        "event_severity": 0.40,
        "volume_anomaly": 0.30,
        "negative_sentiment": 0.15,
        "recency": 0.15
    }
    r_w_post = api_client.post("/api/v1/admin/risk-weights", json=new_weights)
    assert r_w_post.status_code == 200
    norm_w = r_w_post.json()["normalized_weights"]
    assert round(sum(norm_w.values()), 2) == 1.0


def test_dynamic_geopolitical_risk_engine(db):
    from src.risk.geopolitical_risk import GeopoliticalRiskEngine
    geo_engine = GeopoliticalRiskEngine(db_manager=db)
    chks = geo_engine.get_chokepoints()
    assert "red_sea" in chks
    assert "suez_canal" in chks
    
    risk_res = geo_engine.compute_chokepoint_risk("red_sea")
    assert "risk_score" in risk_res
    assert 0.0 <= risk_res["risk_score"] <= 1.0
    assert "formula_weights" in risk_res


def test_copilot_engine_briefing_and_chat(api_client, db):
    from src.api.copilot_engine import MaritimeCopilotEngine
    copilot = MaritimeCopilotEngine(db_manager=db)

    # 1. Test Overview Briefing
    briefing = copilot.generate_overview_briefing()
    assert "briefing" in briefing
    assert len(briefing["key_insights"]) > 0
    assert len(briefing["suggested_actions"]) > 0

    # 2. Test API Briefing Endpoint
    r_briefing = api_client.get("/api/v1/copilot/briefing")
    assert r_briefing.status_code == 200
    assert "briefing" in r_briefing.json()

    # 3. Test API Chat Endpoint - Rate Driver Query
    r_chat1 = api_client.post("/api/v1/copilot/chat", json={
        "message": "What are the freight rate drivers for Newcastle to Paradip?",
        "context": {}
    })
    assert r_chat1.status_code == 200
    res1 = r_chat1.json()
    assert "response" in res1
    assert "key_insights" in res1

    # 4. Test API Chat Endpoint - Port Constraints Query
    r_chat2 = api_client.post("/api/v1/copilot/chat", json={
        "message": "Explain port draft limits and lighterage constraints at Haldia vs Paradip",
        "context": {}
    })
    assert r_chat2.status_code == 200
    res2 = r_chat2.json()
    assert "Haldia" in res2["response"]


def test_ais_name_cleaner():
    from src.data.aisstream_client import _clean_ais_name

    assert _clean_ais_name("CAPE PULA", "219000123") == "CAPE PULA"
    assert _clean_ais_name("", "219000123") == "MMSI 219000123"
    assert _clean_ais_name("UNKNOWN", "219000123") == "MMSI 219000123"


def test_live_ais_tagged_to_trade_lane():
    from src.data.gfw_client import GFWClient

    gfw = GFWClient()
    tagged = gfw._assign_route(90.0, 9.0)
    assert tagged is not None
    assert tagged.get("route_id")
    assert tagged.get("waypoints")


# ════════════════════════════════════════════════════════════════════════════
#  NEW TESTS — SIH26006 PS alignment (idle scenario, consolidation KPI, Russia)
# ════════════════════════════════════════════════════════════════════════════

# ── 1. Idle Scenario: Risk level classification ──────────────────────────────

def test_idle_scenario_risk_levels(timing_engine):
    """
    PS: "forecasting periods of low demand" — idle_risk_level must be graded
    Low / Medium / High based on forward curve, not just a qualitative label.
    """
    spot = 20.0
    # High risk: rates drop >10%
    dropping_forecast = [18.0, 17.0, 16.5, 15.0] * 3  # ~-25%
    res_high = timing_engine.evaluate_strategy(
        current_spot_rate=spot,
        forecast_rates=dropping_forecast,
        target_volume_mt=75000,
        route_id="AU_NEW_TO_IN_PRT",
    )
    idle_high = res_high["idle_scenario_guidance"]
    assert idle_high["idle_risk_level"] == "High"
    assert isinstance(idle_high["idle_days_estimate"], (int, float))
    assert idle_high["idle_days_estimate"] > 0

    # Low risk: rates stable/rising
    rising_forecast = [21.0, 22.0, 23.0, 24.0] * 3
    res_low = timing_engine.evaluate_strategy(
        current_spot_rate=spot,
        forecast_rates=rising_forecast,
        target_volume_mt=75000,
        route_id="AU_NEW_TO_IN_PRT",
    )
    idle_low = res_low["idle_scenario_guidance"]
    assert idle_low["idle_risk_level"] == "Low"


# ── 2. Idle Scenario: Quantified $ savings and real alternate routes ─────────

def test_idle_scenario_quantified_savings(timing_engine):
    """
    PS: "suggesting alternative employment opportunities" — each alternate must
    carry estimated_savings_usd > 0.  The headline savings_vs_ballast_usd must
    also be positive when idle risk is High.
    """
    spot = 18.0
    dropping = [15.0, 14.0, 13.5, 13.0] * 3  # severe softening
    res = timing_engine.evaluate_strategy(
        current_spot_rate=spot,
        forecast_rates=dropping,
        target_volume_mt=75000,
        route_id="AU_HAY_TO_IN_VTZ",
    )
    guidance = res["idle_scenario_guidance"]
    assert guidance["savings_vs_ballast_usd"] > 0
    assert len(guidance["alternate_employment"]) >= 1
    for alt in guidance["alternate_employment"]:
        assert "route_id" in alt
        assert "description" in alt
        assert alt["estimated_savings_usd"] > 0
        assert alt["estimated_idle_days_avoided"] > 0


# ── 3. Spot-to-Contract Consolidation KPI ────────────────────────────────────

def test_spot_to_contract_consolidation_pct(timing_engine):
    """
    PS Objective: "moving from multiple single spot contracts to short/medium term
    multiple voyage contracts." — consolidation_pct must track term decisions correctly.
    """
    # History: 4 TERM + 1 SPOT = 80% consolidation when we add one more TERM
    history = [
        "ENTER_NOW_TERM_CONTRACT",
        "ENTER_NOW_TERM_CONTRACT",
        "ENTER_NOW_SPOT",
        "ENTER_NOW_TERM_CONTRACT",
        "ENTER_NOW_TERM_CONTRACT",
    ]
    spot = 15.0
    rising = [16.0, 17.5, 19.0, 20.5, 21.0, 22.0]  # bullish → TERM signal
    res = timing_engine.evaluate_strategy(
        current_spot_rate=spot,
        forecast_rates=rising,
        target_volume_mt=75000,
        recommendation_history=history,
    )
    # Should return TERM action and history now has 6 items (4 TERM + 1 SPOT + 1 TERM = 83.3%)
    assert res["recommended_action"] == "ENTER_NOW_TERM_CONTRACT"
    pct = res["spot_to_contract_consolidation_pct"]
    assert pct is not None
    assert 75.0 <= pct <= 90.0  # 5 or 6 TERM out of 6 → ~83-100%

    # No history: must return None (single call, not enough data)
    res_no_history = timing_engine.evaluate_strategy(
        current_spot_rate=spot,
        forecast_rates=rising,
        target_volume_mt=75000,
    )
    assert res_no_history["spot_to_contract_consolidation_pct"] is None


# ── 4. Russia Routes in Master Data ─────────────────────────────────────────

def test_russia_routes_in_master_data(db):
    """
    PS names Russia as an origin. Both Russia load ports and both Russia routes
    must be present in the master reference data.
    """
    ports = db.load_ports_master()
    routes = db.load_routes_master()

    global_ports = ports.get("global_load_ports", {})
    assert "RU_TAM" in global_ports, "Taman (RU_TAM) missing from global_load_ports"
    assert "RU_VOS" in global_ports, "Vostochny (RU_VOS) missing from global_load_ports"

    route_ids = {r["route_id"] for r in routes.get("trade_routes", [])}
    assert "RU_TAM_TO_IN_VTZ" in route_ids, "RU_TAM_TO_IN_VTZ missing from trade_routes"
    assert "RU_VOS_TO_IN_PRT" in route_ids, "RU_VOS_TO_IN_PRT missing from trade_routes"


# ── 5. Vessel Optimizer: Taman (Russia, Black Sea) → Visakhapatnam ───────────

def test_vessel_optimizer_russia_taman(vessel_optimizer):
    """
    PS origin: Russia (Black Sea — Taman). Panamax must be physically feasible
    for RU_TAM → IN_VTZ with the same draft/LOA/beam solver used for other corridors.
    """
    res = vessel_optimizer.optimize_vessel_choice(
        cargo_parcel_mt=70000,
        origin_port_id="RU_TAM",
        dest_port_id="IN_VTZ",
    )
    assert res["origin_port"] == "Port of Taman (OTVKO Bulk Terminal)"
    assert res["destination_port"] == "Visakhapatnam Port (Vizag)"
    # At least Panamax should be feasible (Vizag draft 18.1m, Taman draft 18.5m)
    feasible_classes = {v["vessel_class"] for v in res["all_vessel_evaluations"] if v["is_feasible"]}
    assert "Panamax" in feasible_classes, f"Panamax not feasible for Taman→Vizag: {feasible_classes}"


# ── 6. Vessel Optimizer: Vostochny (Russia, Far East) → Paradip ─────────────

def test_vessel_optimizer_russia_vostochny(vessel_optimizer):
    """
    PS origin: Russia (Far East — Vostochny). Panamax must be feasible for
    RU_VOS → IN_PRT with standard constraint checks (Paradip draft 14.5m).
    """
    res = vessel_optimizer.optimize_vessel_choice(
        cargo_parcel_mt=65000,
        origin_port_id="RU_VOS",
        dest_port_id="IN_PRT",
    )
    assert res["origin_port"] == "Vostochny Port (Urgal / PPK)"
    assert res["destination_port"] == "Paradip Port"
    feasible_classes = {v["vessel_class"] for v in res["all_vessel_evaluations"] if v["is_feasible"]}
    assert "Panamax" in feasible_classes, f"Panamax not feasible for Vostochny→Paradip: {feasible_classes}"


# ── 7. Feature Engineer: Origin Coverage Warning ─────────────────────────────

def test_feature_engineer_origin_coverage_warns():
    """
    validate_origin_coverage() must return False for RU_ (and others) when the
    DataFrame only has Australia routes, and must NOT raise an exception.
    """
    import pandas as pd
    from src.models.feature_engineering import FreightFeatureEngineer

    fe = FreightFeatureEngineer()
    # Minimal DataFrame with only Australia routes
    df = pd.DataFrame({
        "route_id": ["AU_NEW_TO_IN_PRT", "AU_HAY_TO_IN_VTZ"],
        "vessel_class": ["Panamax", "Panamax"],
    })
    coverage = fe.validate_origin_coverage(df)
    assert coverage["AU_"] is True,  "Australia should be present"
    assert coverage["RU_"] is False, "Russia should be absent"
    assert coverage["US_"] is False, "USA should be absent"
    assert coverage["MZ_"] is False, "Mozambique should be absent"
    assert coverage["ID_"] is False, "Indonesia should be absent"

