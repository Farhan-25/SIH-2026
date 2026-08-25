"""
Baseline Time-Series Forecasting Models and Evaluation Metrics.
Includes Naive, Simple Moving Average (SMA), Exponential Smoothing (EMA),
and Auto-Regressive baselines with evaluation metrics (RMSE, MAE, MAPE, Directional Accuracy).
"""

from typing import Dict, Any, List, Tuple
import numpy as np
import pandas as pd


def compute_evaluation_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
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

    return {
        "rmse": round(float(rmse), 3),
        "mae": round(float(mae), 3),
        "mape_pct": round(float(mape), 2),
        "mda_pct": round(float(mda), 2)
    }


class BaselineForecaster:
    """Statistical & Naive baseline models for dry bulk freight rate benchmarking."""

    def __init__(self, method: str = "ema", window: int = 4, alpha: float = 0.3):
        self.method = method
        self.window = window
        self.alpha = alpha

    def fit_predict(self, series: pd.Series, horizon_steps: int = 4) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generates in-sample fitted values and out-of-sample forward forecast.
        """
        values = series.values.astype(float)
        n = len(values)

        if self.method == "naive":
            in_sample = np.roll(values, 1)
            in_sample[0] = values[0]
            forecast = np.full(horizon_steps, values[-1])

        elif self.method == "sma":
            in_sample = pd.Series(values).rolling(window=self.window, min_periods=1).mean().values
            forecast = np.full(horizon_steps, np.mean(values[-self.window:]))

        elif self.method == "ema":
            ema_series = pd.Series(values).ewm(alpha=self.alpha, adjust=False).mean().values
            in_sample = ema_series
            forecast = np.full(horizon_steps, ema_series[-1])

        else:
            raise ValueError(f"Unknown baseline method: {self.method}")

        return in_sample, forecast
