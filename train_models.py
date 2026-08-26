"""
Comprehensive 1-Command Automated Model Training & Backtesting Pipeline for SIH26006.
Trains both Tree Ensembles (XGBoost, LightGBM, ElasticNet) and Deep Learning Neural Networks
(BiLSTM + Multi-Head Self-Attention in PyTorch) across full training epochs with backprop,
computes benchmark evaluation metrics (MAE, RMSE, MAPE, R2), and saves all model checkpoints.

Usage:
    python train_models.py
"""

import os
import sys
import time
import pandas as pd
import numpy as np

from src.data.freight_rate_synthesizer import build_unified_freight_dataset
from src.models.ml_forecasting import FreightMLForecaster
from src.models.deep_learning_forecaster import DeepLearningFreightForecaster


def print_banner(text: str):
    line = "=" * 80
    print(f"\n{line}\n  🚀 {text}\n{line}")


def main():
    start_time = time.time()
    print_banner("SIH26006 INTELLIGENT FREIGHT FORECASTING — DEEP ML & NEURAL TRAINING PIPELINE")

    # Step 1: Ingest & Build High-Fidelity Dataset
    print("\n[1/5] 📡 Ingesting Real OGD Port Data, FRED FX/Energy Feeds & Building Dataset...")
    df_raw = build_unified_freight_dataset(
        start_date="2018-01-01",
        end_date="2026-08-25"
    )
    print(f"      ✅ Total Data Points: {len(df_raw):,} records")
    print(f"      ✅ Date Range:        {df_raw['date'].min()} to {df_raw['date'].max()}")
    print(f"      ✅ Trade Routes:      {df_raw['route_id'].nunique()} corridors")
    print(f"      ✅ Vessel Classes:    {df_raw['vessel_class'].nunique()} ship types")

    # Step 2: Initialize & Train Tree Ensembles (XGBoost, LightGBM, ElasticNet, Quantiles)
    print("\n[2/5] 🌲 Training Gradient-Boosted Tree Models & Quantile Risk Cones...")
    tree_forecaster = FreightMLForecaster(model_type="ensemble")
    tree_metrics = tree_forecaster.train(df_raw, test_size=0.15)
    tree_forecaster.save_model("models/freight_xgb_model.joblib")
    print("      ✅ Tree Models & Quantile Cones Trained & Saved (models/freight_xgb_model.joblib)")

    # Step 3: Train Deep Learning Neural Network (PyTorch BiLSTM + Multi-Head Attention)
    print("\n[3/5] 🧠 Training PyTorch Deep Learning Model (BiLSTM + Self-Attention with 30 Epochs)...")
    deep_forecaster = DeepLearningFreightForecaster(epochs=30, batch_size=64, lr=0.003)
    deep_metrics = deep_forecaster.train_epochs(df_raw, test_size=0.15, verbose=True)
    deep_forecaster.save_checkpoint("models/freight_deep_lstm.pt")
    print(f"\n      ✅ PyTorch Deep Model Saved to `models/freight_deep_lstm.pt` ({os.path.getsize('models/freight_deep_lstm.pt')/1024:.1f} KB)")

    # Step 4: Print Comprehensive Benchmark Comparison Matrix
    print_banner("MODEL EVALUATION & BACKTEST BENCHMARK RESULTS")

    rows = []
    # Tree models
    for m in ["xgboost", "lightgbm", "elasticnet", "ensemble"]:
        if m in tree_metrics:
            row = tree_metrics[m]
            w_str = f"{tree_forecaster.model_weights.get(m, 0.0) * 100:.1f}%" if m in tree_forecaster.model_weights else "Active Combined"
            rows.append({
                "Model Family": "Tree / Linear",
                "Model Architecture": m.upper() if m != "elasticnet" else "ElasticNet (Baseline)",
                "MAE ($/MT)": f"${row['mae_usd']:.2f}",
                "RMSE ($/MT)": f"${row['rmse_usd']:.2f}",
                "MAPE (%)": f"{row['mape_pct']:.2f}%",
                "R² Score": f"{row['r2_score']:.4f}",
                "Status": "Checkpoint Saved"
            })

    # Deep Neural Network
    rows.append({
        "Model Family": "Deep Learning",
        "Model Architecture": "PyTorch BiLSTM + Attention",
        "MAE ($/MT)": f"${deep_metrics['mae_usd']:.2f}",
        "RMSE ($/MT)": f"${deep_metrics['rmse_usd']:.2f}",
        "MAPE (%)": f"{deep_metrics['mape_pct']:.2f}%",
        "R² Score": f"{deep_metrics['r2_score']:.4f}",
        "Status": "Checkpoint Saved (.pt)"
    })

    bench_df = pd.DataFrame(rows)
    print(bench_df.to_string(index=False))

    # Step 5: Test Sample Forward Forecast & SHAP Drivers
    print("\n[5/5] 🔍 Running Verification Deep & Ensemble Predictions on AU_NEW_TO_IN_PRT (Panamax)...")
    test_route = df_raw[(df_raw["route_id"] == "AU_NEW_TO_IN_PRT") & (df_raw["vessel_class"] == "Panamax")]

    tree_pred = tree_forecaster.predict_future(test_route, horizon_weeks=12)
    deep_pred = deep_forecaster.predict_future(test_route, horizon_weeks=12)

    print(f"      • Horizon: 12 Weeks ({tree_pred['forecast_dates'][0]} to {tree_pred['forecast_dates'][-1]})")
    print(f"      • Tree Ensemble 12W Trajectory: ${tree_pred['predictions_usd_per_mt'][0]:.2f} → ${tree_pred['predictions_usd_per_mt'][-1]:.2f}/MT")
    print(f"      • PyTorch Deep 12W Trajectory:  ${deep_pred['predictions_usd_per_mt'][0]:.2f} → ${deep_pred['predictions_usd_per_mt'][-1]:.2f}/MT")
    print(f"      • 80% Quantile Risk Cone:      [${tree_pred['lower_bound_80pct'][-1]:.2f} - ${tree_pred['upper_bound_80pct'][-1]:.2f}]")

    print("\n      🎯 Top Explainable SHAP Features:")
    for feat, imp in list(tree_pred["top_driving_factors"].items())[:6]:
        print(f"         - {feat:<26}: {imp * 100:.1f}% contribution")

    elapsed = time.time() - start_time
    print_banner(f"ALL DEEP NEURAL & ENSEMBLE MODELS TRAINED AND READY IN {elapsed:.2f}s!")


if __name__ == "__main__":
    main()
