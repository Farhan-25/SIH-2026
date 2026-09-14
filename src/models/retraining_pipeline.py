"""
Automated Model Retraining Pipeline for SIH26006.
==================================================
Scheduled pipeline that re-fits the full tree ensemble and BiLSTM models
weekly as new OGD port turnaround and commodity data arrives.

Can be invoked:
  - Automatically by the weekly scheduler in BackgroundFleetAndMarketWorker
  - Manually via POST /api/v1/admin/retrain/trigger
  - Standalone: python -m src.models.retraining_pipeline

State machine:
  idle -> running -> success | failed

On success, calls FreightModelService.reload() so the live API picks up
the new weights without a server restart.
"""

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("freightiq.retraining")

MODELS_DIR = "models"
PROCESSED_CSV = "data/processed/unified_freight_timeseries.csv"
RETRAIN_LOG_PATH = os.path.join(MODELS_DIR, "retrain_log.json")

# -- State shared across the process (single-process FastAPI server) ----------
_RETRAIN_STATE: dict[str, Any] = {
    "status": "idle",           # idle | running | success | failed
    "last_triggered_at": None,
    "last_completed_at": None,
    "last_duration_seconds": None,
    "last_error": None,
    "run_count": 0,
    "metrics_snapshot": {},
    "triggered_by": None,
}


def get_retrain_state() -> dict[str, Any]:
    """Returns a copy of the current retraining state (thread-safe read)."""
    return dict(_RETRAIN_STATE)


def _update_state(**kwargs: Any) -> None:
    """Merges kwargs into the global retrain state dict."""
    _RETRAIN_STATE.update(kwargs)


def _persist_log(record: dict[str, Any]) -> None:
    """Appends a JSON record to the retrain log file for audit trail."""
    try:
        os.makedirs(MODELS_DIR, exist_ok=True)
        history: list[dict[str, Any]] = []
        if os.path.exists(RETRAIN_LOG_PATH):
            with open(RETRAIN_LOG_PATH, "r", encoding="utf-8") as f:
                history = json.load(f)
        history.append(record)
        # Keep last 52 entries (one year of weekly runs)
        history = history[-52:]
        with open(RETRAIN_LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        logger.warning("Could not persist retrain log: %s", e)


def run_retraining_pipeline(
    triggered_by: str = "scheduler",
    model_service: Any | None = None,
) -> dict[str, Any]:
    """
    Executes a full model retraining cycle:
      1. Fetch latest market data (BDI, commodities, FX, OGD port data)
      2. Rebuild the unified weekly timeseries CSV
      3. Re-fit XGBoost 500est + LightGBM 500est + ElasticNet + quantile cones
      4. Re-fit PyTorch BiLSTM+Attention (100 epochs)
      5. Save all artifacts to models/
      6. Hot-reload FreightModelService if provided
      7. Persist audit log entry

    Args:
        triggered_by: Label for audit trail ('scheduler' | 'manual_api' | 'cli')
        model_service: Live FreightModelService instance to hot-reload on success.
                       Pass None to skip hot-reload (e.g., standalone CLI runs).

    Returns:
        Result dict with status, duration_seconds, and metrics_snapshot.
    """
    global _RETRAIN_STATE

    if _RETRAIN_STATE["status"] == "running":
        logger.info("Retraining already in progress -- skipping concurrent trigger.")
        return {"status": "already_running", "message": "Pipeline is already executing."}

    triggered_at = datetime.now(timezone.utc).isoformat()
    _update_state(
        status="running",
        last_triggered_at=triggered_at,
        last_error=None,
        triggered_by=triggered_by,
    )

    t_start = time.time()
    result: dict[str, Any] = {
        "status": "failed",
        "triggered_by": triggered_by,
        "triggered_at": triggered_at,
        "duration_seconds": None,
        "metrics_snapshot": {},
        "error": None,
    }

    try:
        logger.info(
            "[Retraining] Starting weekly model retraining pipeline (triggered_by=%s)",
            triggered_by,
        )

        # -- Step 1: Fetch latest market data & rebuild dataset ---------------
        logger.info("[Retraining] Step 1/4 -- Fetching latest market data...")
        from src.data.real_data_collector import build_real_market_dataset

        df_raw = build_real_market_dataset(
            start_date="2015-01-01",
            end_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            output_csv=PROCESSED_CSV,
        )
        n_records = len(df_raw)
        date_range = f"{df_raw['date'].min().date()} -> {df_raw['date'].max().date()}"
        logger.info("[Retraining] Dataset built: %s records  (%s)", n_records, date_range)

        # -- Step 2: Re-fit tree ensemble -------------------------------------
        logger.info("[Retraining] Step 2/4 -- Training tree ensemble (XGB + LGB + quantiles)...")
        import joblib
        from lightgbm import LGBMRegressor
        from sklearn.ensemble import GradientBoostingRegressor
        from sklearn.linear_model import ElasticNet
        from sklearn.preprocessing import StandardScaler
        from xgboost import XGBRegressor

        from src.models.baseline_forecasting import compute_evaluation_metrics
        from src.models.feature_engineering import FreightFeatureEngineer

        fe = FreightFeatureEngineer()
        feature_names = fe.get_feature_columns()
        feat_df = fe.create_features(df_raw)

        feat_df = feat_df.replace([float("inf"), float("-inf")], float("nan"))
        feat_df["freight_rate_usd_per_mt"] = feat_df["freight_rate_usd_per_mt"].clip(0.5, 1000.0)
        feat_df = feat_df.dropna(subset=["freight_rate_usd_per_mt"]).reset_index(drop=True)
        feat_df[feature_names] = feat_df[feature_names].ffill().bfill()
        feat_df[feature_names] = feat_df[feature_names].fillna(feat_df[feature_names].median())
        feat_df[feature_names] = feat_df[feature_names].clip(-1e6, 1e6)

        X = feat_df[feature_names]
        y = feat_df["freight_rate_usd_per_mt"]
        split_idx = int(len(X) * 0.85)
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        xgb = XGBRegressor(
            n_estimators=500, learning_rate=0.03, max_depth=6,
            subsample=0.8, colsample_bytree=0.8, min_child_weight=3,
            gamma=0.1, reg_alpha=0.05, reg_lambda=1.0,
            random_state=42, n_jobs=-1, tree_method="hist",
        )
        xgb.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

        lgb = LGBMRegressor(
            n_estimators=500, learning_rate=0.03, max_depth=7,
            num_leaves=63, subsample=0.8, colsample_bytree=0.8,
            min_child_samples=20, reg_alpha=0.05, reg_lambda=1.0,
            random_state=42, n_jobs=-1, verbose=-1,
        )
        lgb.fit(X_train, y_train)

        elastic = ElasticNet(alpha=0.1, l1_ratio=0.5, max_iter=5000, random_state=42)
        elastic.fit(X_train, y_train)

        xgb_m = compute_evaluation_metrics(y_test.values, xgb.predict(X_test))
        lgb_m = compute_evaluation_metrics(y_test.values, lgb.predict(X_test))
        ela_m = compute_evaluation_metrics(y_test.values, elastic.predict(X_test))

        inv = {
            k: 1.0 / max(m["mape_pct"], 0.1)
            for k, m in [("xgboost", xgb_m), ("lightgbm", lgb_m), ("elasticnet", ela_m)]
        }
        total_inv = sum(inv.values())
        weights = {k: round(v / total_inv, 3) for k, v in inv.items()}

        ensemble_preds = (
            weights["xgboost"] * xgb.predict(X_test)
            + weights["lightgbm"] * lgb.predict(X_test)
            + weights["elasticnet"] * elastic.predict(X_test)
        )
        ens_m = compute_evaluation_metrics(y_test.values, ensemble_preds)

        q_upper = GradientBoostingRegressor(
            loss="quantile", alpha=0.90, n_estimators=200, max_depth=4, random_state=42
        )
        q_upper.fit(X_train, y_train)
        q_lower = GradientBoostingRegressor(
            loss="quantile", alpha=0.10, n_estimators=200, max_depth=4, random_state=42
        )
        q_lower.fit(X_train, y_train)

        try:
            import shap as _shap
            shap_explainer = _shap.TreeExplainer(xgb)
        except Exception:
            shap_explainer = None

        scaler = StandardScaler()
        scaler.fit(X_train)

        tree_metrics = {
            "ensemble": ens_m,
            "xgboost": xgb_m,
            "lightgbm": lgb_m,
            "elasticnet": ela_m,
            "dynamic_weights": weights,
        }

        os.makedirs(MODELS_DIR, exist_ok=True)
        joblib.dump(
            {
                "xgb_model": xgb,
                "lgb_model": lgb,
                "elastic_model": elastic,
                "model_upper": q_upper,
                "model_lower": q_lower,
                "scaler": scaler,
                "shap_explainer": shap_explainer,
                "feature_names": feature_names,
                "metrics": tree_metrics,
                "model_weights": weights,
            },
            os.path.join(MODELS_DIR, "freight_xgb_model.joblib"),
        )
        logger.info(
            "[Retraining] Tree ensemble saved. Ensemble MAPE=%.2f%%",
            ens_m.get("mape_pct", 0),
        )

        # -- Step 3: Re-fit BiLSTM deep model ---------------------------------
        logger.info("[Retraining] Step 3/4 -- Training BiLSTM+Attention (100 epochs)...")
        from src.models.deep_learning_forecaster import DeepLearningFreightForecaster

        deep_forecaster = DeepLearningFreightForecaster(epochs=100, batch_size=128, lr=0.002)
        deep_forecaster.history = {"train_loss": [], "val_loss": [], "val_mape": [], "epochs": []}
        deep_metrics = deep_forecaster.train_epochs(df_raw, test_size=0.15, verbose=False)
        deep_forecaster.save_checkpoint(os.path.join(MODELS_DIR, "freight_deep_lstm.pt"))
        logger.info(
            "[Retraining] BiLSTM saved. MAPE=%.2f%%",
            deep_metrics.get("mape_pct", 0),
        )

        # -- Step 4: Update model registry JSON files -------------------------
        logger.info("[Retraining] Step 4/4 -- Writing updated model registry metadata...")
        now_iso = datetime.now(timezone.utc).isoformat()
        routes_list = df_raw["route_id"].unique().tolist()
        vessels_list = df_raw["vessel_class"].unique().tolist()

        metrics_registry = {
            "version": "3.0",
            "retrained_at": now_iso,
            "triggered_by": triggered_by,
            "evaluation_split": "Temporal 85/15 train/test (no look-ahead bias)",
            "training_data_summary": {
                "total_records": n_records,
                "date_range": f"{df_raw['date'].min().date()} to {df_raw['date'].max().date()}",
                "routes": routes_list,
                "vessel_classes": vessels_list,
            },
            "models": {
                "tree_ensemble": {
                    "architecture": "Dynamic Inverse-MAPE Ensemble (XGBoost 500est + LightGBM 500est + ElasticNet)",
                    "weights": weights,
                    "metrics": ens_m,
                    "sub_models": {
                        "xgboost": xgb_m,
                        "lightgbm": lgb_m,
                        "elasticnet": ela_m,
                    },
                },
                "deep_bilstm_attention": {
                    "architecture": "PyTorch BiLSTM (hidden=128) + Multi-Head Self-Attention (4 heads) + Quantile Heads",
                    "epochs_trained": deep_forecaster.epochs,
                    "metrics": deep_metrics,
                },
            },
            "feature_count": len(feature_names),
            "created_at": now_iso,
        }
        with open(os.path.join(MODELS_DIR, "metrics.json"), "w", encoding="utf-8") as f:
            json.dump(metrics_registry, f, indent=2)

        # -- Step 5: Hot-reload live inference service ------------------------
        if model_service is not None:
            try:
                model_service.reload()
                logger.info("[Retraining] FreightModelService hot-reloaded with new weights.")
            except Exception as e:
                logger.warning(
                    "[Retraining] Hot-reload failed (new weights on next server start): %s", e
                )

        # -- Finalise ---------------------------------------------------------
        elapsed = round(time.time() - t_start, 1)
        metrics_snapshot = {
            "ensemble_mape_pct": round(ens_m.get("mape_pct", 0), 3),
            "ensemble_r2": round(ens_m.get("r2_score", 0), 4),
            "xgb_mape_pct": round(xgb_m.get("mape_pct", 0), 3),
            "lgb_mape_pct": round(lgb_m.get("mape_pct", 0), 3),
            "bilstm_mape_pct": round(deep_metrics.get("mape_pct", 0), 3),
            "dynamic_weights": weights,
            "training_records": n_records,
            "date_range": date_range,
        }

        completed_at = datetime.now(timezone.utc).isoformat()
        _update_state(
            status="success",
            last_completed_at=completed_at,
            last_duration_seconds=elapsed,
            last_error=None,
            run_count=_RETRAIN_STATE["run_count"] + 1,
            metrics_snapshot=metrics_snapshot,
        )

        result.update(
            {
                "status": "success",
                "completed_at": completed_at,
                "duration_seconds": elapsed,
                "metrics_snapshot": metrics_snapshot,
                "training_records": n_records,
            }
        )
        _persist_log({**result, "triggered_by": triggered_by, "triggered_at": triggered_at})
        logger.info(
            "[Retraining] Pipeline complete in %.1fs. Ensemble MAPE=%.2f%%",
            elapsed,
            ens_m.get("mape_pct", 0),
        )

    except Exception as exc:
        elapsed = round(time.time() - t_start, 1)
        err_msg = str(exc)
        logger.error(
            "[Retraining] Pipeline failed after %.1fs: %s", elapsed, err_msg, exc_info=True
        )
        _update_state(
            status="failed",
            last_completed_at=datetime.now(timezone.utc).isoformat(),
            last_duration_seconds=elapsed,
            last_error=err_msg,
        )
        result.update({"status": "failed", "duration_seconds": elapsed, "error": err_msg})
        _persist_log({**result, "triggered_by": triggered_by, "triggered_at": triggered_at})

    return result


def get_retrain_history() -> list[dict[str, Any]]:
    """Returns the persisted retraining audit log (last 52 runs)."""
    if not os.path.exists(RETRAIN_LOG_PATH):
        return []
    try:
        with open(RETRAIN_LOG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


# -- Standalone CLI entry point -----------------------------------------------
if __name__ == "__main__":
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="SIH26006 Model Retraining Pipeline")
    parser.parse_args()  # reserved for future flags (e.g. --skip-deep)

    print("=" * 70)
    print("  SIH26006 -- AUTOMATED MODEL RETRAINING PIPELINE")
    print("=" * 70)
    res = run_retraining_pipeline(triggered_by="cli")
    print(f"\nStatus           : {res['status']}")
    print(f"Duration         : {res.get('duration_seconds')}s")
    if res["status"] == "success":
        snap = res.get("metrics_snapshot", {})
        print(f"Ensemble MAPE    : {snap.get('ensemble_mape_pct')}%")
        print(f"Ensemble R2      : {snap.get('ensemble_r2')}")
        print(f"BiLSTM MAPE      : {snap.get('bilstm_mape_pct')}%")
        print(f"Training records : {snap.get('training_records')}")
        print(f"Date range       : {snap.get('date_range')}")
    elif res.get("error"):
        print(f"Error            : {res['error']}")
