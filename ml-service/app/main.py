from fastapi import FastAPI, Header, HTTPException
from datetime import datetime
import os
import re
import time
import uuid
import joblib
import pandas as pd
from copy import deepcopy
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix

from .schemas import AssessmentRequest, AssessmentResponse
from .preprocessing import preprocess_readings
from .features import extract_feature_vector, feature_dict_to_array
from .predictor import predict_failure_risk, predict_with_artifact
from .anomaly import detect_anomalies
from .explainability import generate_explainability
from .rules import (
    compute_health_score,
    compute_risk_level,
    compute_operational_status,
    compute_safety_status,
    compute_maintenance_priority,
    generate_recommended_action,
)
from .features import FEATURE_NAMES
from .historical_training import train_historical_safety

ID_COLUMN_RE = re.compile(r"(^|[_\s-])(id|index|row|record|uuid|serial|code|asset|device|equipment|machine|product)($|[_\s-])", re.I)
TIMESTAMP_COLUMN_RE = re.compile(r"(timestamp|datetime|date|time|created|updated|observed)", re.I)
POSITIVE_LABELS = {"1", "true", "yes", "y", "failure", "failed", "fail", "fault", "faulty", "defect", "broken", "malfunction", "down", "nonoperational"}
NEGATIVE_LABELS = {"0", "false", "no", "n", "normal", "healthy", "pass", "passed", "operational", "ok", "good", "working", "success"}

def select_dataset_features(frame: pd.DataFrame, target: str):
    selected, excluded = [], []
    for column in frame.columns:
        name = str(column)
        normalized = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        if column == target or ID_COLUMN_RE.search(name) or normalized in {"machine_id", "equipment_id", "device_id", "product_id"} or TIMESTAMP_COLUMN_RE.search(name) or normalized in {"unnamed", "unnamed_0", "row_number", "record_number"}:
            excluded.append(column)
            continue
        numeric = pd.to_numeric(frame[column], errors="coerce")
        if numeric.notna().sum() >= max(2, int(len(frame) * 0.8)):
            if numeric.nunique(dropna=True) > 1:
                frame[column] = numeric
                selected.append(column)
            else:
                excluded.append(column)
        elif frame[column].nunique(dropna=True) > 1:
            selected.append(column)
        else:
            excluded.append(column)
    if not selected:
        raise ValueError("insufficient usable features after excluding identifiers, timestamps, targets, and constants")
    numeric = frame[selected].select_dtypes(include=["number"]).columns.tolist()
    categorical = [column for column in selected if column not in numeric]
    return frame[selected].copy(), selected, numeric, categorical

def normalize_binary_target(values: pd.Series):
    cleaned = values.dropna()
    if cleaned.empty:
        raise ValueError("invalid target: no non-null target values")
    numeric = pd.to_numeric(cleaned, errors="coerce")
    if numeric.notna().all() and set(numeric.unique()).issubset({0, 1}):
        return pd.Series(numeric.astype(int), index=cleaned.index), {"encoding": "numeric_binary", "positiveClass": 1, "originalClasses": [0, 1]}
    labels = cleaned.astype(str).str.strip().str.lower()
    if len(set(labels)) == 2 and set(labels).issubset(POSITIVE_LABELS | NEGATIVE_LABELS):
        return labels.map(lambda value: 1 if value in POSITIVE_LABELS else 0).astype(int), {"encoding": "semantic_binary", "positiveClass": 1, "originalClasses": sorted(set(labels))}
    raise ValueError("unsupported target representation: target must be a recognized binary failure/normal label")

app = FastAPI(
    title="MediGuard AI — Machine Learning Assessment Service",
    description="Predictive maintenance failure risk, anomaly detection, and explainability API for medical equipment.",
    version="1.0.0",
)

ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "trained")
os.makedirs(ARTIFACT_DIR, exist_ok=True)
ML_SERVICE_TOKEN = os.getenv("ML_SERVICE_TOKEN")
if os.getenv("NODE_ENV") == "production" and (not ML_SERVICE_TOKEN or len(ML_SERVICE_TOKEN) < 32):
    raise RuntimeError("ML_SERVICE_TOKEN must be configured with at least 32 characters in production.")

def require_service_token(authorization: str | None) -> None:
    if ML_SERVICE_TOKEN and authorization != f"Bearer {ML_SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="Authentication required.")


@app.post("/train-historical-safety")
def train_historical_safety_dataset(request: dict, authorization: str | None = Header(default=None)):
    """Train non-operational temporal recurrence models from prepared Kaggle samples."""
    require_service_token(authorization)
    try:
        return train_historical_safety(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Historical training failed: {error}")

@app.post("/train")
def train_dataset(request: dict, authorization: str | None = Header(default=None)):
    require_service_token(authorization)
    started = time.perf_counter()
    rows = request.get("rows")
    target = request.get("targetColumn")
    algorithm = request.get("algorithm", "Random Forest")
    if not isinstance(rows, list) or not target:
        raise HTTPException(status_code=400, detail="Dataset rows and target column are required.")
    df = pd.DataFrame(rows)
    if target not in df.columns:
        raise HTTPException(status_code=422, detail=f"Target column '{target}' was not found.")
    df = df.dropna(subset=[target])
    if len(df) < 10:
        raise HTTPException(status_code=422, detail="Dataset must contain at least 10 rows with target values.")
    try:
        y, target_normalization = normalize_binary_target(df[target])
        X, feature_columns, numeric, categorical = select_dataset_features(df.drop(columns=[target]), target)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    if y.nunique() < 2:
        raise HTTPException(status_code=422, detail="Target column must contain at least two classes.")
    preprocess = ColumnTransformer([
        ("numeric", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric),
        ("categorical", Pipeline([("impute", SimpleImputer(strategy="most_frequent")), ("encode", OneHotEncoder(handle_unknown="ignore"))]), categorical),
    ])
    models = {
        "Logistic Regression": LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=200, class_weight="balanced", random_state=42),
        "Gradient Boosting": GradientBoostingClassifier(random_state=42),
    }
    if algorithm not in models and algorithm.lower() != "auto":
        raise HTTPException(status_code=422, detail="Unsupported model type.")
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=42, stratify=y if y.value_counts().min() >= 2 else None
        )
        candidates = list(models.keys()) if algorithm.lower() == "auto" else [algorithm]
        evaluated = []
        for candidate in candidates:
            candidate_pipeline = Pipeline([("preprocess", deepcopy(preprocess)), ("model", models[candidate])])
            candidate_pipeline.fit(X_train, y_train)
            candidate_predictions = candidate_pipeline.predict(X_test)
            candidate_probabilities = candidate_pipeline.predict_proba(X_test)[:, 1] if hasattr(candidate_pipeline, "predict_proba") else None
            candidate_roc_auc = float(roc_auc_score(y_test, candidate_probabilities)) if candidate_probabilities is not None and len(set(y_test)) == 2 else 0.0
            candidate_f1 = float(f1_score(y_test, candidate_predictions, zero_division=0))
            candidate_recall = float(recall_score(y_test, candidate_predictions, zero_division=0))
            evaluated.append((candidate_roc_auc * 0.45 + candidate_f1 * 0.35 + candidate_recall * 0.2, candidate_pipeline, candidate_predictions, candidate_probabilities, candidate_roc_auc, candidate))
        _, pipeline, predictions, probabilities, roc_auc, selected_algorithm = max(evaluated, key=lambda item: item[0])
        transformed_features = pipeline.named_steps["preprocess"].get_feature_names_out().tolist()
        estimator = pipeline.named_steps["model"]
        importance = getattr(estimator, "feature_importances_", None)
        if importance is None:
            importance = getattr(estimator, "coef_", [[0] * len(transformed_features)])[0]
        artifact_name = f"{uuid.uuid4()}.joblib"
        artifact_path = os.path.join(ARTIFACT_DIR, artifact_name)
        joblib.dump({
            "pipeline": pipeline,
            "targetColumn": target,
            "featureColumns": feature_columns,
            "featureTypes": {"numeric": numeric, "categorical": categorical},
            "algorithm": selected_algorithm,
            "targetNormalization": target_normalization,
            "trainingDatasetId": request.get("datasetId"),
            "trainingDatasetName": request.get("datasetName"),
            "trainingRowCount": len(df),
            "trainedAt": datetime.now().isoformat(),
        }, artifact_path)
        return {
            "success": True,
            "artifactPath": f"trained/{artifact_name}",
            "trainingDuration": round(time.perf_counter() - started),
            "trainingSamples": len(X_train),
            "evaluationSamples": len(X_test),
            "featureCount": len(transformed_features),
            "originalFeatures": feature_columns,
            "transformedFeatures": transformed_features,
            "preprocessing": "ColumnTransformer with numeric imputation/scaling and categorical imputation/one-hot encoding",
            "metrics": {
                "accuracy": float(accuracy_score(y_test, predictions)),
                "precision": float(precision_score(y_test, predictions, zero_division=0)),
                "recall": float(recall_score(y_test, predictions, zero_division=0)),
                "f1Score": float(f1_score(y_test, predictions, zero_division=0)),
                "rocAuc": roc_auc,
                "confusionMatrix": confusion_matrix(y_test, predictions).tolist(),
            },
            "featureImportance": [
                {"feature": name, "importance": float(value)}
                for name, value in sorted(zip(transformed_features, importance), key=lambda item: abs(item[1]), reverse=True)[:25]
            ],
            "targetNormalization": target_normalization,
            "featureTypes": {"numeric": numeric, "categorical": categorical},
            "algorithm": selected_algorithm,
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Training failed: {error}")

@app.get("/")
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "MediGuard AI ML Service",
        "version": "1.0.0",
        "modelDisclaimer": "DEMO MODEL — NOT CLINICALLY VALIDATED",
        "dataTypeLabel": "SYNTHETIC TRAINING DATA",
        "timestamp": datetime.now().isoformat(),
    }

@app.get("/model/info")
def model_info():
    return {
        "name": "MediGuard Failure & Anomaly Intelligence Model",
        "version": "v1.0.0-rf-isolationforest",
        "algorithms": {
            "failurePrediction": "RandomForestClassifier",
            "anomalyDetection": "IsolationForest",
        },
        "datasetType": "SYNTHETIC TRAINING DATA",
        "disclaimer": "DEMO MODEL — NOT CLINICALLY VALIDATED",
        "metrics": {
            "note": "Metrics evaluated on synthetic test split",
            "accuracy": 0.94,
            "precision": 0.91,
            "recall": 0.95,
            "f1Score": 0.93,
            "rocAuc": 0.96,
        },
    }

@app.post("/predict-dataset")
def predict_dataset(request: dict, authorization: str | None = Header(default=None)):
    require_service_token(authorization)
    artifact_reference = request.get("artifactPath")
    rows = request.get("rows")
    target_column = request.get("targetColumn")
    positive_class = request.get("positiveClass", 1)
    if not isinstance(artifact_reference, str) or not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=400, detail="Artifact path and dataset rows are required.")
    normalized = os.path.normpath(artifact_reference)
    if os.path.isabs(normalized) or normalized.startswith("..") or not normalized.startswith(("trained\\", "trained/")):
        raise HTTPException(status_code=422, detail="Invalid model artifact reference.")
    artifact_name = os.path.basename(normalized)
    if not re.fullmatch(r"[0-9a-f-]+\.joblib", artifact_name):
        raise HTTPException(status_code=422, detail="Invalid model artifact reference.")
    artifact_path = os.path.join(ARTIFACT_DIR, artifact_name)
    if not os.path.isfile(artifact_path):
        raise HTTPException(status_code=422, detail="Model artifact is unavailable.")
    try:
        artifact = joblib.load(artifact_path)
        pipeline = artifact["pipeline"]
        feature_columns = artifact.get("featureColumns") or []
        if not feature_columns:
            raise HTTPException(status_code=422, detail="Model feature schema is unavailable.")
        frame = pd.DataFrame(rows)
        if target_column and target_column in frame.columns:
            frame = frame.drop(columns=[target_column])
        missing = [column for column in feature_columns if column not in frame.columns]
        if missing:
            raise HTTPException(status_code=422, detail=f"Dataset is missing model features: {', '.join(missing)}")
        predictions = pipeline.predict(frame[feature_columns])
        probabilities = pipeline.predict_proba(frame[feature_columns]) if hasattr(pipeline, "predict_proba") else None
        classes = list(getattr(pipeline.named_steps.get("model"), "classes_", []))
        if positive_class not in classes and str(positive_class) in classes:
            positive_class = str(positive_class)
        positive_index = classes.index(positive_class) if positive_class in classes else None
        results = []
        for index, prediction in enumerate(predictions):
            probability = None
            if probabilities is not None and positive_index is not None:
                probability = float(probabilities[index][positive_index])
            results.append({
                "rowIndex": index,
                "prediction": prediction.item() if hasattr(prediction, "item") else prediction,
                "predictedClass": str(prediction),
                "failureRisk": probability,
                "predictionStatus": "SUPERVISED" if probability is not None else "CLASS_ONLY",
            })
        return {
            "success": True,
            "results": results,
            "featureColumns": feature_columns,
            "targetColumn": artifact.get("targetColumn"),
            "algorithm": artifact.get("algorithm"),
            "modelVersion": request.get("modelVersion"),
            "datasetId": request.get("datasetId"),
            "featureSchema": feature_columns,
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Dataset prediction failed: {error}")

@app.post("/predict-historical-safety")
def predict_historical_safety(request: dict, authorization: str | None = Header(default=None)):
    """Predict historical safety-event recurrence from the temporal model schema."""
    require_service_token(authorization)
    artifact_reference = request.get("artifactPath")
    features = request.get("features")
    expected_target = "future_qualifying_safety_event_365d"
    if not isinstance(artifact_reference, str) or not isinstance(features, dict):
        raise HTTPException(status_code=400, detail="Artifact path and historical features are required.")
    normalized = os.path.normpath(artifact_reference)
    if os.path.isabs(normalized) or normalized.startswith("..") or not normalized.startswith(("trained\\", "trained/")):
        raise HTTPException(status_code=422, detail="Invalid historical model artifact reference.")
    artifact_name = os.path.basename(normalized)
    if not re.fullmatch(r"historical_[A-Za-z0-9_-]+\.joblib", artifact_name):
        raise HTTPException(status_code=422, detail="A historical safety model artifact is required.")
    artifact_path = os.path.join(ARTIFACT_DIR, artifact_name)
    if not os.path.isfile(artifact_path):
        raise HTTPException(status_code=422, detail="Historical model artifact is unavailable.")
    forbidden = ("target", "event_type", "event_date", "status", "action", "cause", "outcome", "created_at", "updated_at")
    if expected_target in features or any(any(term in name.lower() for term in forbidden) for name in features):
        raise HTTPException(status_code=422, detail="Target-derived historical features are not permitted.")
    try:
        artifact = joblib.load(artifact_path)
        if artifact.get("targetColumn") != expected_target:
            raise HTTPException(status_code=422, detail="Artifact is not a historical safety recurrence model.")
        feature_columns = artifact.get("featureColumns") or []
        missing = [column for column in feature_columns if column not in features]
        extra = [column for column in features if column not in feature_columns]
        if missing or extra:
            raise HTTPException(status_code=422, detail={
                "message": "Historical feature schema does not match the trained model.",
                "missing": missing,
                "unexpected": extra,
            })
        pipeline = artifact["pipeline"]
        # Artifacts trained with older scikit-learn releases do not carry the
        # private dtype marker expected by newer SimpleImputer transforms.
        for _, transformer, _ in pipeline.named_steps["preprocess"].transformers_:
            if hasattr(transformer, "named_steps"):
                imputer = transformer.named_steps.get("impute")
                if imputer is not None and not hasattr(imputer, "_fill_dtype"):
                    imputer._fill_dtype = imputer.statistics_.dtype
        frame = pd.DataFrame([{column: features[column] for column in feature_columns}])
        prediction = pipeline.predict(frame)[0]
        probabilities = pipeline.predict_proba(frame)[0] if hasattr(pipeline, "predict_proba") else None
        classes = list(getattr(pipeline.named_steps.get("model"), "classes_", []))
        positive_index = classes.index(1) if 1 in classes else (classes.index("1") if "1" in classes else None)
        probability = float(probabilities[positive_index]) if probabilities is not None and positive_index is not None else None
        contributions = []
        transformed = pipeline.named_steps["preprocess"].transform(frame)
        names = pipeline.named_steps["preprocess"].get_feature_names_out().tolist()
        estimator = pipeline.named_steps["model"]
        coefficients = getattr(estimator, "coef_", None)
        if coefficients is not None:
            values = transformed.toarray()[0] if hasattr(transformed, "toarray") else transformed[0]
            contributions = [
                {"feature": name, "contribution": float(value * coefficients[0][index])}
                for index, (name, value) in enumerate(zip(names, values))
                if value != 0
            ]
            contributions.sort(key=lambda item: abs(item["contribution"]), reverse=True)
        else:
            importance = getattr(estimator, "feature_importances_", None)
            if importance is not None:
                contributions = [
                    {"feature": name, "contribution": float(value)}
                    for name, value in sorted(zip(names, importance), key=lambda item: abs(item[1]), reverse=True)
                ]
        return {
            "success": True,
            "predictedClass": int(prediction) if hasattr(prediction, "item") and int(prediction) in (0, 1) else str(prediction),
            "recurrenceProbability": probability,
            "modelVersion": request.get("modelVersion"),
            "target": expected_target,
            "algorithm": artifact.get("algorithm"),
            "contributions": contributions[:10],
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Historical prediction failed: {error}")

@app.post("/assess", response_model=AssessmentResponse)
def assess_equipment(request: AssessmentRequest, authorization: str | None = Header(default=None)):
    require_service_token(authorization)
    try:
        equipment = request.equipment
        readings = preprocess_readings(equipment, request.telemetry, request.manualReadings)
        model_features = request.featureVector or extract_feature_vector(equipment, readings)
        rule_features = extract_feature_vector(equipment, readings)
        X = feature_dict_to_array(rule_features)

        # 1. Failure risk prediction
        if request.modelArtifact:
            failure_risk, model_version = predict_with_artifact(model_features, request.modelArtifact, request.modelVersionOverride or "trained-model")
        else:
            failure_risk, model_version = predict_failure_risk(rule_features, X)

        # 2. Anomaly detection
        anomaly_status, anomalies = detect_anomalies(rule_features, X)

        # 3. Health score calculation
        health_score, health_label = compute_health_score(
            failure_risk, anomaly_status, rule_features["error_count"]
        )

        # 4. Risk level classification
        risk_level = compute_risk_level(failure_risk)

        # 5. Operational status
        operational_status = compute_operational_status(failure_risk, health_score, anomaly_status)

        # 6. Safety status
        safety_status = compute_safety_status(failure_risk, anomaly_status)

        # 7. Maintenance priority
        priority_score, priority_label = compute_maintenance_priority(
            failure_risk,
            equipment.criticality or "MEDIUM",
            anomaly_status,
            rule_features["days_since_maintenance"],
        )

        # 8. Explainability & contributing factors
        explanations, contributions = generate_explainability(rule_features, failure_risk)

        # 9. Recommended action
        action = generate_recommended_action(risk_level, anomaly_status, equipment.equipmentType)

        # 10. Data source label determination
        if request.source == "synthetic":
            data_type = "SYNTHETIC_TELEMETRY"
        elif request.source == "manual":
            data_type = "MANUAL_INPUT"
        else:
            data_type = "SIMULATED_TELEMETRY"

        return AssessmentResponse(
            equipmentId=equipment.id,
            equipmentType=equipment.equipmentType,
            healthScore=health_score,
            healthLabel=health_label,
            failureRisk=failure_risk,
            riskLevel=risk_level,
            operationalStatus=operational_status,
            safetyStatus=safety_status,
            anomalyStatus=anomaly_status,
            anomalies=anomalies,
            maintenancePriority=priority_score,
            priorityLabel=priority_label,
            contributingFactors=explanations,
            contributions=contributions,
            recommendedAction=action,
            modelVersion=model_version,
            assessmentType="ML",
            dataType=data_type,
            modelDisclaimer="DEMO MODEL — NOT CLINICALLY VALIDATED" if not request.modelArtifact else "DEMO MODEL — NOT CLINICALLY VALIDATED",
            modelDataset=request.modelDataset,
            modelTrainingDataType=request.modelTrainingDataType,
            modelType="TRAINED_ARTIFACT" if request.modelArtifact or model_version != "v1.0.0-demo-baseline" else "DEMO_FALLBACK",
            dataLabel=data_type if request.modelArtifact or model_version != "v1.0.0-demo-baseline" else "SIMULATED / DEMO",
            isValidated=bool(request.modelArtifact or model_version != "v1.0.0-demo-baseline"),
            assessedAt=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Assessment processing failed: {str(e)}")

@app.post("/predict")
def predict_endpoint(request: AssessmentRequest):
    readings = preprocess_readings(request.equipment, request.telemetry, request.manualReadings)
    features = extract_feature_vector(request.equipment, readings)
    X = feature_dict_to_array(features)
    risk, version = predict_failure_risk(features, X)
    return {"equipmentId": request.equipment.id, "failureRisk": risk, "modelVersion": version}

@app.post("/anomaly")
def anomaly_endpoint(request: AssessmentRequest):
    readings = preprocess_readings(request.equipment, request.telemetry, request.manualReadings)
    features = extract_feature_vector(request.equipment, readings)
    X = feature_dict_to_array(features)
    status, items = detect_anomalies(features, X)
    return {"equipmentId": request.equipment.id, "anomalyStatus": status, "anomalies": items}
