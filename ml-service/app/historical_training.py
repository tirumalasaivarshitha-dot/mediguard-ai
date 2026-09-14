import os
import time
import uuid
import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix

ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "trained")
os.makedirs(ARTIFACT_DIR, exist_ok=True)

FORBIDDEN_FEATURE_TERMS = (
    "status", "action", "cause", "summary", "url", "created_at", "updated_at",
    "event_type", "event_date", "recall_class", "description", "target",
    "source_id", "device_id", "manufacturer_id", "identifier", "outcome",
)


def _validate_samples(samples):
    if not isinstance(samples, list) or len(samples) < 20:
        raise ValueError("Historical training requires at least 20 temporal samples.")
    rows = []
    for sample in samples:
        if not isinstance(sample, dict) or not isinstance(sample.get("features"), dict):
            raise ValueError("Each temporal sample must contain a features object.")
        cutoff = pd.to_datetime(sample.get("cutoffDate"), errors="coerce", utc=True)
        if pd.isna(cutoff):
            raise ValueError("Every temporal sample must contain a valid cutoffDate.")
        features = sample["features"]
        for name in features:
            lowered = name.lower()
            if any(term in lowered for term in FORBIDDEN_FEATURE_TERMS):
                raise ValueError(f"Leaky historical feature is not permitted: {name}")
        target = int(sample.get("target"))
        if target not in (0, 1):
            raise ValueError("Historical target must be binary.")
        rows.append({"cutoffDate": cutoff, "target": target, **features})
    return pd.DataFrame(rows).sort_values("cutoffDate").reset_index(drop=True)


def _train_one(df, algorithm, split_cutoff, source_counts, target_definition):
    cutoff = pd.to_datetime(split_cutoff, errors="coerce", utc=True)
    if pd.isna(cutoff):
        raise ValueError("A chronological split cutoff is required.")
    train = df[df["cutoffDate"] < cutoff]
    evaluation = df[df["cutoffDate"] >= cutoff]
    if train.empty or evaluation.empty or train["target"].nunique() < 2 or evaluation["target"].nunique() < 2:
        raise ValueError("Chronological train and evaluation partitions must each contain both target classes.")

    X_train = train.drop(columns=["cutoffDate", "target"])
    X_eval = evaluation.drop(columns=["cutoffDate", "target"])
    y_train = train["target"]
    y_eval = evaluation["target"]
    numeric = X_train.select_dtypes(include=["number"]).columns.tolist()
    categorical = [column for column in X_train.columns if column not in numeric]
    preprocess = ColumnTransformer([
        ("numeric", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), numeric),
        ("categorical", Pipeline([
            ("impute", SimpleImputer(strategy="most_frequent")),
            ("encode", OneHotEncoder(handle_unknown="ignore")),
        ]), categorical),
    ])
    models = {
        "Logistic Regression": LogisticRegression(max_iter=1000, random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=1),
    }
    if algorithm not in models:
        raise ValueError(f"Unsupported historical model type: {algorithm}")
    pipeline = Pipeline([("preprocess", preprocess), ("model", models[algorithm])])
    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_eval)
    probabilities = pipeline.predict_proba(X_eval)[:, 1]
    transformed = pipeline.named_steps["preprocess"].get_feature_names_out().tolist()
    estimator = pipeline.named_steps["model"]
    importance = getattr(estimator, "feature_importances_", None)
    if importance is None:
        importance = estimator.coef_[0]
    artifact_name = f"historical_{algorithm.lower().replace(' ', '_')}_{uuid.uuid4().hex}.joblib"
    artifact_path = os.path.join(ARTIFACT_DIR, artifact_name)
    joblib.dump({
        "pipeline": pipeline,
        "targetColumn": "future_qualifying_safety_event_365d",
        "featureColumns": X_train.columns.tolist(),
        "algorithm": algorithm,
        "targetDefinition": target_definition,
        "splitCutoff": cutoff.isoformat(),
        "sourceCounts": source_counts,
    }, artifact_path)
    return {
        "artifactPath": f"trained/{artifact_name}",
        "trainingDuration": 0,
        "trainingSamples": len(train),
        "evaluationSamples": len(evaluation),
        "featureCount": len(transformed),
        "originalFeatures": X_train.columns.tolist(),
        "transformedFeatures": transformed,
        "preprocessing": "Chronological split; numeric median imputation/scaling; categorical most-frequent imputation/one-hot encoding",
        "metrics": {
            "accuracy": float(accuracy_score(y_eval, predictions)),
            "precision": float(precision_score(y_eval, predictions, zero_division=0)),
            "recall": float(recall_score(y_eval, predictions, zero_division=0)),
            "f1Score": float(f1_score(y_eval, predictions, zero_division=0)),
            "rocAuc": float(roc_auc_score(y_eval, probabilities)),
            "confusionMatrix": confusion_matrix(y_eval, predictions).tolist(),
        },
        "featureImportance": [
            {"feature": name, "importance": float(value)}
            for name, value in sorted(zip(transformed, importance), key=lambda item: abs(item[1]), reverse=True)[:50]
        ],
    }


def train_historical_safety(payload):
    started = time.perf_counter()
    df = _validate_samples(payload.get("samples"))
    if df["target"].nunique() < 2:
        raise ValueError("Historical target must contain both classes.")
    models = {}
    for algorithm in payload.get("algorithms", ["Logistic Regression", "Random Forest"]):
        trained = _train_one(
            df, algorithm, payload.get("splitCutoff"),
            payload.get("sourceCounts", {}),
            payload.get("targetDefinition", ""),
        )
        trained["trainingDuration"] = round(time.perf_counter() - started)
        models[algorithm] = trained
    return {"success": True, "models": models}
