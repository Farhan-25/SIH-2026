"""
Multi-Factor Machine Learning Freight Forecasting Engine.
Trains XGBoost / Gradient Boosting Regressors using macroeconomic, bunker fuel,
and route congestion features. Outputs multi-horizon predictions with prediction intervals.
"""

import os
import joblib
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from xgboost import XGBRegressor
from src.models.feature_engineering import FreightFeatureEngineer
from src.models.baseline_forecasting import compute_evaluation_metrics


class FreightMLForecaster:
    """Multi-factor regression model for dry bulk freight forecasting with uncertainty intervals."""

    def __init__(self, model_type: str = "xgboost"):
        self.model_type = model_type
        self.feature_engineer = FreightFeatureEngineer()
        self.model = None
        self.model_upper = None
        self.model_lower = None
        self.feature_names = self.feature_engineer.get_feature_columns()
        self.metrics = {}

    def train(self, df: pd.DataFrame, test_size: float = 0.15) -> Dict[str, float]:
        """
        Trains point forecast and quantile models on feature-engineered dataset.
        """
        feat_df = self.feature_engineer.create_features(df)
        X = feat_df[self.feature_names]
        y = feat_df["freight_rate_usd_per_mt"]

        split_idx = int(len(X) * (1 - test_size))
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        if self.model_type == "xgboost":
            self.model = XGBRegressor(
                n_estimators=150,
                learning_rate=0.05,
                max_depth=5,
                subsample=0.85,
                colsample_bytree=0.85,
                random_state=42
            )
            self.model.fit(X_train, y_train)
        else:
            self.model = GradientBoostingRegressor(
                n_estimators=150,
                learning_rate=0.05,
                max_depth=5,
                random_state=42
            )
            self.model.fit(X_train, y_train)

        # Train Quantile Regressors for 80% / 90% confidence cones
        self.model_upper = GradientBoostingRegressor(loss="quantile", alpha=0.90, n_estimators=100, max_depth=4)
        self.model_upper.fit(X_train, y_train)

        self.model_lower = GradientBoostingRegressor(loss="quantile", alpha=0.10, n_estimators=100, max_depth=4)
        self.model_lower.fit(X_train, y_train)

        # Evaluate on test partition
        preds = self.model.predict(X_test)
        self.metrics = compute_evaluation_metrics(y_test.values, preds)

        return self.metrics

    def predict_future(
        self,
        route_df: pd.DataFrame,
        horizon_weeks: int = 12
    ) -> Dict[str, Any]:
        """
        Iterative recursive multi-step forecasting for forward horizon.
        """
        if self.model is None:
            raise ValueError("Model is not fitted. Call train() first.")

        feat_df = self.feature_engineer.create_features(route_df).sort_values("date")
        latest_row = feat_df.iloc[-1:].copy()

        current_date = pd.to_datetime(latest_row["date"].values[0])
        forecast_dates = [current_date + pd.Timedelta(weeks=w) for w in range(1, horizon_weeks + 1)]

        predictions = []
        lower_bounds = []
        upper_bounds = []

        curr_features = latest_row[self.feature_names].copy()

        for w in range(horizon_weeks):
            pred_val = float(self.model.predict(curr_features)[0])
            low_val = float(self.model_lower.predict(curr_features)[0])
            up_val = float(self.model_upper.predict(curr_features)[0])

            # Ensure logical bounds
            low_val = min(low_val, pred_val * 0.95)
            up_val = max(up_val, pred_val * 1.05)

            predictions.append(round(pred_val, 2))
            lower_bounds.append(round(low_val, 2))
            upper_bounds.append(round(up_val, 2))

            # Shift autoregressive features forward
            curr_features["target_lag_12"] = curr_features["target_lag_8"]
            curr_features["target_lag_8"] = curr_features["target_lag_4"]
            curr_features["target_lag_4"] = curr_features["target_lag_2"]
            curr_features["target_lag_2"] = curr_features["target_lag_1"]
            curr_features["target_lag_1"] = pred_val

        # Feature importances
        importances = {}
        if hasattr(self.model, "feature_importances_"):
            raw_imp = self.model.feature_importances_
            top_indices = np.argsort(raw_imp)[::-1][:6]
            for idx in top_indices:
                importances[self.feature_names[idx]] = round(float(raw_imp[idx]), 3)

        return {
            "forecast_dates": [d.strftime("%Y-%m-%d") for d in forecast_dates],
            "predictions_usd_per_mt": predictions,
            "lower_bound_80pct": lower_bounds,
            "upper_bound_80pct": upper_bounds,
            "top_driving_factors": importances,
            "evaluation_metrics": self.metrics
        }

    def save_model(self, filepath: str = "models/freight_xgb_model.joblib"):
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump({
            "model": self.model,
            "model_upper": self.model_upper,
            "model_lower": self.model_lower,
            "feature_names": self.feature_names,
            "metrics": self.metrics
        }, filepath)

    def load_model(self, filepath: str = "models/freight_xgb_model.joblib"):
        checkpoint = joblib.load(filepath)
        self.model = checkpoint["model"]
        self.model_upper = checkpoint["model_upper"]
        self.model_lower = checkpoint["model_lower"]
        self.feature_names = checkpoint["feature_names"]
        self.metrics = checkpoint["metrics"]
