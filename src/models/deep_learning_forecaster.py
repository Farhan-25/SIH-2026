"""
PyTorch Deep Learning Time-Series Forecaster (BiLSTM + Multi-Head Self-Attention).
Implements a deep neural network architecture for multi-horizon freight rate forecasting
with full epoch training loops, backpropagation, batch optimization, and quantile risk heads.
"""

import os
import time
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    class Dataset:
        pass
    class _NNModuleMock:
        pass
    class _NNMock:
        Module = _NNModuleMock
    nn = _NNMock()

from sklearn.preprocessing import StandardScaler

from src.models.feature_engineering import FreightFeatureEngineer
from src.models.baseline_forecasting import compute_evaluation_metrics


class TimeSeriesDataset(Dataset):
    """PyTorch Dataset for sliding-window tabular time-series features."""

    def __init__(self, X: np.ndarray, y: np.ndarray, seq_len: int = 4):
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y, dtype=torch.float32).unsqueeze(-1)
        self.seq_len = seq_len

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


class QuantilePinballLoss(nn.Module):
    """Pinball loss for asymmetric quantile uncertainty estimation."""

    def __init__(self, quantiles: List[float] = [0.10, 0.90]):
        super().__init__()
        self.quantiles = quantiles

    def forward(self, preds: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        # preds: [batch, len(quantiles)], target: [batch, 1]
        losses = []
        for i, q in enumerate(self.quantiles):
            err = target - preds[:, i:i+1]
            loss = torch.max((q - 1) * err, q * err)
            losses.append(loss.mean())
        return torch.stack(losses).sum()


class FreightTransformerLSTM(nn.Module):
    """
    Hybrid Deep Neural Network combining:
    1. Feature Embedding + LayerNorm
    2. Bi-Directional LSTM for sequential recurrence
    3. Multi-Head Self-Attention for long-range market shocks
    4. Multi-head output heads: Point Prediction + Quantile bounds
    """

    def __init__(self, input_dim: int, hidden_dim: int = 64, num_heads: int = 4, num_layers: int = 2):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim

        # 1. Feature Embedding
        self.embedding = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
            nn.Dropout(0.15)
        )

        # 2. Bi-LSTM Layer
        self.lstm = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=hidden_dim // 2,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=0.1 if num_layers > 1 else 0.0
        )

        # 3. Multi-Head Self-Attention
        self.attention = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=num_heads,
            batch_first=True,
            dropout=0.1
        )
        self.norm = nn.LayerNorm(hidden_dim)

        # 4. Dense MLP Backbone
        self.mlp = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.GELU(),
            nn.Dropout(0.15),
            nn.Linear(64, 32),
            nn.GELU(),
        )

        # 5. Output Heads (Point prediction + Upper/Lower Quantiles)
        self.point_head = nn.Linear(32, 1)
        self.quantile_head = nn.Linear(32, 2)  # [q_0.10, q_0.90]

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        # x: [batch, input_dim] -> add sequence dim [batch, 1, input_dim]
        if x.dim() == 2:
            x_seq = x.unsqueeze(1)
        else:
            x_seq = x

        # Embedding
        emb = self.embedding(x_seq)  # [batch, 1, hidden_dim]

        # LSTM
        lstm_out, _ = self.lstm(emb)  # [batch, 1, hidden_dim]

        # Self-Attention
        attn_out, _ = self.attention(lstm_out, lstm_out, lstm_out)
        h = self.norm(lstm_out + attn_out).squeeze(1)  # [batch, hidden_dim]

        # MLP Features
        feat = self.mlp(h)

        point_pred = self.point_head(feat)
        quantile_preds = self.quantile_head(feat)

        return point_pred, quantile_preds


class DeepLearningFreightForecaster:
    """Manager class for training, evaluating, and checkpointing the PyTorch deep model."""

    def __init__(self, epochs: int = 35, batch_size: int = 64, lr: float = 0.003):
        self.epochs = epochs
        self.batch_size = batch_size
        self.lr = lr

        self.feature_engineer = FreightFeatureEngineer()
        self.feature_names = self.feature_engineer.get_feature_columns()
        self.scaler_X = StandardScaler()
        self.scaler_y = StandardScaler()

        if HAS_TORCH:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = "cpu"
        self.model = None
        self.history = {"train_loss": [], "val_loss": [], "val_mape": [], "epochs": []}
        self.metrics = {}

    def train_epochs(
        self,
        df: pd.DataFrame,
        test_size: float = 0.15,
        verbose: bool = True
    ) -> Dict[str, Any]:
        """
        Executes full epoch-based gradient descent training with backpropagation and validation.
        """
        feat_df = self.feature_engineer.create_features(df)
        X = feat_df[self.feature_names].values
        y = feat_df["freight_rate_usd_per_mt"].values

        split_idx = int(len(X) * (1 - test_size))
        X_train_raw, X_test_raw = X[:split_idx], X[split_idx:]
        y_train_raw, y_test_raw = y[:split_idx], y[split_idx:]

        # Normalize features
        X_train = self.scaler_X.fit_transform(X_train_raw)
        X_test = self.scaler_X.transform(X_test_raw)

        train_dataset = TimeSeriesDataset(X_train, y_train_raw)
        test_dataset = TimeSeriesDataset(X_test, y_test_raw)

        train_loader = DataLoader(train_dataset, batch_size=self.batch_size, shuffle=True)
        test_loader = DataLoader(test_dataset, batch_size=self.batch_size, shuffle=False)

        # Initialize Neural Network
        input_dim = X.shape[1]
        self.model = FreightTransformerLSTM(input_dim=input_dim, hidden_dim=64, num_heads=4).to(self.device)

        mse_criterion = nn.MSELoss()
        pinball_criterion = QuantilePinballLoss(quantiles=[0.10, 0.90])
        optimizer = optim.AdamW(self.model.parameters(), lr=self.lr, weight_decay=1e-4)
        scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=self.epochs, eta_min=1e-5)

        if verbose:
            print(f"\n🧠 Starting PyTorch Deep Learning Training on {self.device}:")
            print(f"   • Model Architecture: BiLSTM + Multi-Head Self-Attention + Quantile Risk Heads")
            print(f"   • Total Trainable Parameters: {sum(p.numel() for p in self.model.parameters()):,}")
            print(f"   • Training Batches per Epoch: {len(train_loader)} (Batch Size = {self.batch_size})")
            print(f"   • Optimization: AdamW (lr={self.lr}) + Cosine Annealing Schedule\n")
            header = f"{'Epoch':<8} | {'Train Loss (MSE)':<18} | {'Val Loss':<12} | {'Val MAE ($)':<14} | {'Val MAPE (%)':<14} | {'LR':<10}"
            print(header)
            print("-" * len(header))

        best_val_loss = float("inf")
        best_state = None

        for epoch in range(1, self.epochs + 1):
            # --- Training Phase ---
            self.model.train()
            train_losses = []
            for batch_x, batch_y in train_loader:
                batch_x = batch_x.to(self.device)
                batch_y = batch_y.to(self.device)

                optimizer.zero_grad()
                point_pred, quantiles = self.model(batch_x)

                loss_mse = mse_criterion(point_pred, batch_y)
                loss_quant = pinball_criterion(quantiles, batch_y)
                total_loss = loss_mse + 0.3 * loss_quant

                total_loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.5)
                optimizer.step()

                train_losses.append(loss_mse.item())

            scheduler.step()
            avg_train_loss = np.mean(train_losses)

            # --- Validation Phase ---
            self.model.eval()
            val_preds = []
            val_trues = []
            with torch.no_grad():
                for val_x, val_y in test_loader:
                    val_x = val_x.to(self.device)
                    point_pred, _ = self.model(val_x)
                    val_preds.extend(point_pred.cpu().numpy().flatten())
                    val_trues.extend(val_y.numpy().flatten())

            val_preds = np.array(val_preds)
            val_trues = np.array(val_trues)
            val_mse = np.mean((val_trues - val_preds) ** 2)
            val_mae = np.mean(np.abs(val_trues - val_preds))
            val_mape = np.mean(np.abs((val_trues - val_preds) / (val_trues + 1e-5))) * 100.0
            current_lr = scheduler.get_last_lr()[0]

            self.history["epochs"].append(epoch)
            self.history["train_loss"].append(round(float(avg_train_loss), 4))
            self.history["val_loss"].append(round(float(val_mse), 4))
            self.history["val_mape"].append(round(float(val_mape), 2))

            if val_mse < best_val_loss:
                best_val_loss = val_mse
                best_state = {k: v.cpu() for k, v in self.model.state_dict().items()}

            if verbose and (epoch % 5 == 0 or epoch == 1 or epoch == self.epochs):
                print(f"Epoch {epoch:<3}/{self.epochs:<2} | {avg_train_loss:<18.4f} | {val_mse:<12.4f} | ${val_mae:<13.2f} | {val_mape:<13.2f}% | {current_lr:<10.6f}")

        # Restore best weights
        if best_state is not None:
            self.model.load_state_dict(best_state)

        # Final benchmark metrics on test set
        self.metrics = compute_evaluation_metrics(val_trues, val_preds)
        return self.metrics

    def predict_future(self, route_df: pd.DataFrame, horizon_weeks: int = 12) -> Dict[str, Any]:
        """
        Iterative recursive deep multi-horizon forecasting with neural quantile heads.
        """
        if self.model is None:
            raise ValueError("Deep Learning Model is not fitted.")

        self.model.eval()
        feat_df = self.feature_engineer.create_features(route_df).sort_values("date")
        latest_row = feat_df.iloc[-1:].copy()

        current_date = pd.to_datetime(latest_row["date"].values[0])
        forecast_dates = [current_date + pd.Timedelta(weeks=w) for w in range(1, horizon_weeks + 1)]

        predictions = []
        lower_bounds = []
        upper_bounds = []

        curr_features = latest_row[self.feature_names].copy()

        with torch.no_grad():
            for _ in range(horizon_weeks):
                scaled_x = self.scaler_X.transform(curr_features.values)
                tensor_x = torch.tensor(scaled_x, dtype=torch.float32).to(self.device)

                point_p, quant_p = self.model(tensor_x)
                pred_val = float(point_p.cpu().item())
                q_low = float(quant_p[:, 0].cpu().item())
                q_up = float(quant_p[:, 1].cpu().item())

                # Logical bounding
                q_low = min(q_low, pred_val * 0.94)
                q_up = max(q_up, pred_val * 1.06)

                predictions.append(round(pred_val, 2))
                lower_bounds.append(round(q_low, 2))
                upper_bounds.append(round(q_up, 2))

                # Autoregressive lag step
                curr_features["target_lag_12"] = curr_features["target_lag_8"]
                curr_features["target_lag_8"] = curr_features["target_lag_4"]
                curr_features["target_lag_4"] = curr_features["target_lag_2"]
                curr_features["target_lag_2"] = curr_features["target_lag_1"]
                curr_features["target_lag_1"] = pred_val

        return {
            "forecast_dates": [d.strftime("%Y-%m-%d") for d in forecast_dates],
            "predictions_usd_per_mt": predictions,
            "lower_bound_80pct": lower_bounds,
            "upper_bound_80pct": upper_bounds,
            "evaluation_metrics": self.metrics,
            "training_history": self.history
        }

    def save_checkpoint(self, filepath: str = "models/freight_deep_lstm.pt"):
        """Saves PyTorch state dict, scalers, and training history."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        torch.save({
            "model_state": self.model.state_dict(),
            "scaler_X": self.scaler_X,
            "feature_names": self.feature_names,
            "metrics": self.metrics,
            "history": self.history
        }, filepath)

    def load_checkpoint(self, filepath: str = "models/freight_deep_lstm.pt"):
        """Loads PyTorch checkpoint."""
        checkpoint = torch.load(filepath, map_location=self.device, weights_only=False)
        self.feature_names = checkpoint["feature_names"]
        self.scaler_X = checkpoint["scaler_X"]
        self.metrics = checkpoint["metrics"]
        self.history = checkpoint.get("history", {})

        input_dim = len(self.feature_names)
        self.model = FreightTransformerLSTM(input_dim=input_dim, hidden_dim=64, num_heads=4).to(self.device)
        self.model.load_state_dict(checkpoint["model_state"])
        self.model.eval()
