import os
import joblib
import numpy as np
import pandas as pd
import re
from typing import Dict, Tuple

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
FAILURE_MODEL_PATH = os.path.join(MODEL_DIR, "failure_model_v1.joblib")

_failure_model = None

def load_failure_model():
    global _failure_model
    if _failure_model is None and os.path.exists(FAILURE_MODEL_PATH):
        try:
            _failure_model = joblib.load(FAILURE_MODEL_PATH)
        except Exception as e:
            print(f"[ML Service] Failed to load failure model: {e}")
            _failure_model = None
    return _failure_model

def predict_failure_risk(features: Dict[str, float], X: np.ndarray) -> Tuple[float, str]:
    """
    Returns (failure_risk_percentage, model_version_string)
    """
    model = load_failure_model()
    if model is not None:
        try:
            prob = float(model.predict_proba(X)[0][1])
            return prob * 100.0, "v1.0.0-rf-classifier"
        except Exception as e:
            print(f"[ML Service] Prediction error with loaded model: {e}")

    # Baseline probabilistic model formula if joblib artifact is not loaded
    # Risk factors: temp_dev, vib_dev, error_count, op_hours, days_maint
    t_risk = min(40.0, features["temp_baseline_dev"] * 6.0)
    v_risk = min(35.0, features["vib_baseline_dev"] * 15.0)
    e_risk = min(25.0, features["error_count"] * 3.5)
    h_risk = min(15.0, (features["operating_hours"] / 10000.0) * 10.0)
    m_risk = min(15.0, (features["days_since_maintenance"] / 180.0) * 10.0)

    total_risk = min(99.0, max(1.0, t_risk + v_risk + e_risk + h_risk + m_risk))
    return round(total_risk, 1), "v1.0.0-demo-baseline"

def predict_with_artifact(features: Dict[str, float], artifact_path: str, model_version: str) -> Tuple[float, str]:
    normalized = os.path.normpath(artifact_path)
    if os.path.isabs(normalized) or normalized.startswith("..") or not normalized.startswith("trained\\") and not normalized.startswith("trained/"):
        raise ValueError("Invalid operational model artifact reference.")
    artifact_name = os.path.basename(normalized)
    if not re.fullmatch(r"[0-9a-f-]+\.joblib", artifact_name):
        raise ValueError("Invalid operational model artifact reference.")
    artifact_path = os.path.join(MODEL_DIR, "trained", artifact_name)
    if not os.path.isfile(artifact_path):
        raise FileNotFoundError("Operational model artifact is unavailable.")
    artifact = joblib.load(artifact_path)
    pipeline = artifact["pipeline"]
    prediction_input = pd.DataFrame([features])
    if not set(artifact.get("featureColumns", [])).issubset(prediction_input.columns):
        raise ValueError("Operational model feature schema is not compatible.")
    if not hasattr(pipeline, "predict_proba"):
        raise ValueError("Operational model does not provide probability estimates.")
    probabilities = pipeline.predict_proba(prediction_input)
    if probabilities.shape[1] < 2:
        raise ValueError("Operational model does not provide a binary failure probability.")
    return float(probabilities[0][1] * 100.0), model_version
