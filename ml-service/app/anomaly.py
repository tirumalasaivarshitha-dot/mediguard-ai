import os
import joblib
import numpy as np
from typing import Dict, List, Tuple
from .schemas import AnomalyItem

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
ANOMALY_MODEL_PATH = os.path.join(MODEL_DIR, "anomaly_model_v1.joblib")

_anomaly_model = None

def load_anomaly_model():
    global _anomaly_model
    if _anomaly_model is None and os.path.exists(ANOMALY_MODEL_PATH):
        try:
            _anomaly_model = joblib.load(ANOMALY_MODEL_PATH)
        except Exception as e:
            print(f"[ML Service] Failed to load anomaly model: {e}")
            _anomaly_model = None
    return _anomaly_model

def detect_anomalies(features: Dict[str, float], X: np.ndarray) -> Tuple[str, List[AnomalyItem]]:
    model = load_anomaly_model()
    anomalies: List[AnomalyItem] = []
    is_anomaly = False
    is_severe = False

    if model is not None:
        try:
            pred = model.predict(X)[0] # -1 for anomaly, 1 for normal
            score = float(model.score_samples(X)[0])
            if pred == -1:
                is_anomaly = True
                if score < -0.65:
                    is_severe = True
        except Exception as e:
            print(f"[ML Service] Anomaly detection model error: {e}")

    # Inspect specific metric thresholds to populate anomaly items and fallback flag
    if features["temp_baseline_dev"] > 5.0:
        is_anomaly = True
        if features["temp_baseline_dev"] > 10.0:
            is_severe = True
        anomalies.append(AnomalyItem(
            metric="Temperature",
            summary=f"Temperature is {features['temp_current']}°C (+{round(features['temp_baseline_dev'], 1)}°C above baseline)",
            severity="HIGH" if features["temp_baseline_dev"] > 10.0 else "MEDIUM"
        ))

    if features["vib_baseline_dev"] > 1.2:
        is_anomaly = True
        if features["vib_baseline_dev"] > 2.5:
            is_severe = True
        anomalies.append(AnomalyItem(
            metric="Vibration",
            summary=f"Vibration level is {features['vib_current']} mm/s (+{round(features['vib_baseline_dev'], 1)} mm/s deviation)",
            severity="HIGH" if features["vib_baseline_dev"] > 2.5 else "MEDIUM"
        ))

    if features["power_baseline_dev"] > 3.0:
        is_anomaly = True
        anomalies.append(AnomalyItem(
            metric="Power Consumption",
            summary=f"Power reading is {features['power_current']} kW (deviates by {round(features['power_baseline_dev'], 1)} kW)",
            severity="MEDIUM"
        ))

    if features["error_count"] > 5:
        is_anomaly = True
        anomalies.append(AnomalyItem(
            metric="Error Log Count",
            summary=f"Elevated error rate with {int(features['error_count'])} active error logs",
            severity="HIGH" if features["error_count"] > 10 else "MEDIUM"
        ))

    if is_severe:
        status = "SEVERE_ANOMALY"
    elif is_anomaly:
        status = "ANOMALY_DETECTED"
    else:
        status = "NORMAL"

    return status, anomalies
