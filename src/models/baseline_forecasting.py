"""
Freight Forecast Evaluation Metrics.
Provides RMSE, MAE, MAPE, Directional Accuracy, and R² scoring.
"""

from typing import Any

import numpy as np


def compute_evaluation_metrics(y_true: Any, y_pred: Any) -> dict[str, float]:
    """
    Computes standard time-series forecast error metrics:
    - RMSE (Root Mean Squared Error)
    - MAE (Mean Absolute Error)
    - MAPE (Mean Absolute Percentage Error in %)
    - MDA (Mean Directional Accuracy in %)
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))
    mae = np.mean(np.abs(y_true - y_pred))
    mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-5))) * 100.0

    # Directional Accuracy (sign of change vs previous step)
    if len(y_true) > 1:
        dir_true = np.sign(np.diff(y_true))
        dir_pred = np.sign(np.diff(y_pred))
        mda = np.mean(dir_true == dir_pred) * 100.0
    else:
        mda = 100.0

    # R-squared score
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2) + 1e-8
    r2 = 1.0 - (ss_res / ss_tot)

    return {
        "rmse": round(float(rmse), 3),
        "rmse_usd": round(float(rmse), 3),
        "mae": round(float(mae), 3),
        "mae_usd": round(float(mae), 3),
        "mape_pct": round(float(mape), 2),
        "mda_pct": round(float(mda), 2),
        "r2_score": round(float(r2), 4)
    }

