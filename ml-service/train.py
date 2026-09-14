import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix

from app.features import FEATURE_NAMES

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

def generate_synthetic_dataset(n_samples: int = 2000):
    """
    Generates synthetic training dataset for medical equipment predictive maintenance demo.
    Data Source Label: SYNTHETIC TRAINING DATA
    Disclaimer: DEMO MODEL — NOT CLINICALLY VALIDATED
    """
    np.random.seed(42)

    temp_current = np.random.normal(loc=42.0, scale=8.0, size=n_samples)
    temp_dev = np.maximum(0.0, temp_current - 40.0)

    vib_current = np.random.normal(loc=1.2, scale=1.0, size=n_samples)
    vib_dev = np.maximum(0.0, vib_current - 1.0)

    power_current = np.random.normal(loc=8.0, scale=5.0, size=n_samples)
    power_dev = np.abs(power_current - 8.0)

    operating_hours = np.random.uniform(low=100.0, high=15000.0, size=n_samples)
    error_count = np.random.poisson(lam=2.5, size=n_samples)
    days_since_maint = np.random.uniform(low=5.0, high=200.0, size=n_samples)

    temp_trend = np.random.normal(loc=0.1, scale=0.5, size=n_samples)
    vib_trend = np.random.normal(loc=0.05, scale=0.2, size=n_samples)

    # Calculate synthetic failure target based on multi-factor degradation score
    score = (
        temp_dev * 5.0 +
        vib_dev * 12.0 +
        error_count * 4.0 +
        (operating_hours / 10000.0) * 8.0 +
        (days_since_maint / 180.0) * 10.0 +
        np.random.normal(0, 5, size=n_samples)
    )

    failure_target = (score > 35.0).astype(int)

    data = pd.DataFrame({
        "temp_current": temp_current,
        "temp_baseline_dev": temp_dev,
        "vib_current": vib_current,
        "vib_baseline_dev": vib_dev,
        "power_current": power_current,
        "power_baseline_dev": power_dev,
        "operating_hours": operating_hours,
        "error_count": error_count,
        "days_since_maintenance": days_since_maint,
        "temp_trend": temp_trend,
        "vib_trend": vib_trend,
        "target": failure_target,
    })

    return data

def train_and_save():
    print("=== MediGuard AI ML Model Training ===")
    print("Data Source Label: SYNTHETIC TRAINING DATA")
    print("Disclaimer: DEMO MODEL — NOT CLINICALLY VALIDATED\n")

    df = generate_synthetic_dataset(n_samples=2500)
    X = df[FEATURE_NAMES]
    y = df["target"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

    # 1. Train RandomForest Classifier
    rf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
    rf.fit(X_train, y_train)

    y_pred = rf.predict(X_test)
    y_prob = rf.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)
    cm = confusion_matrix(y_test, y_pred)

    print("--- Failure Prediction Model Evaluation ---")
    print(f"Accuracy  : {acc:.4f}")
    print(f"Precision : {prec:.4f}")
    print(f"Recall    : {rec:.4f} (Safety-oriented metric)")
    print(f"F1 Score  : {f1:.4f}")
    print(f"ROC-AUC   : {auc:.4f}")
    print(f"Confusion Matrix:\n{cm}\n")

    # 2. Train IsolationForest Anomaly Model
    iso = IsolationForest(n_estimators=100, contamination=0.15, random_state=42)
    iso.fit(X_train)

    # Save Model Artifacts
    rf_path = os.path.join(MODEL_DIR, "failure_model_v1.joblib")
    iso_path = os.path.join(MODEL_DIR, "anomaly_model_v1.joblib")

    joblib.dump(rf, rf_path)
    joblib.dump(iso, iso_path)

    print(f"Saved Failure Prediction Model -> {rf_path}")
    print(f"Saved Anomaly Detection Model  -> {iso_path}")

if __name__ == "__main__":
    train_and_save()
