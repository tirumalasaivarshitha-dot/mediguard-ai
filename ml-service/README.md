# MediGuard AI — Machine Learning Assessment Service (`ml-service`)

## Overview
`ml-service` is the standalone Python FastAPI service providing real machine learning predictions for medical equipment predictive maintenance, failure risk evaluation, anomaly detection, and explainability for **MediGuard AI**.

> [!IMPORTANT]
> **Data Source & Clinical Disclaimer**:
> - **Data Source Label**: `SYNTHETIC TRAINING DATA`
> - **Model Status**: `DEMO MODEL — NOT CLINICALLY VALIDATED`
> - **Safety Boundary**: Decision-support platform for biomedical engineering maintenance only. Not for clinical diagnostic use.

---

## Technical Architecture

- **Framework**: FastAPI (Python 3.10+)
- **ML Engine**: `scikit-learn` (`RandomForestClassifier` for failure risk prediction, `IsolationForest` for anomaly detection)
- **Feature Pipeline**: Imputation, baseline normalization, rolling metrics, trend/slope derivation, and error frequency scoring.

---

## Environment & Installation

### Requirements
```bash
pip install -r requirements.txt
```

### Model Training
To generate synthetic training dataset, train models, evaluate metrics, and save `joblib` artifacts:
```bash
python train.py
```

### Running Server
```bash
uvicorn app.main:app --port 8000 --reload
```

---

## API Endpoints

- `GET /health` — Service health check & DISCLAIMER labels.
- `GET /model/info` — Active model metadata, algorithm details, & evaluation metrics.
- `POST /assess` — Primary endpoint: returns health score (0-100), failure risk (0-100%), operational status, anomaly status, maintenance priority, explanations, feature contributions, and recommended actions.
- `POST /predict` — Failure risk probability endpoint.
- `POST /anomaly` — Anomaly status detection endpoint.
