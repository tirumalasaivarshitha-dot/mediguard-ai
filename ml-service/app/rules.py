from typing import Dict, Any, Tuple
from .schemas import EquipmentInput

def compute_health_score(failure_risk: float, anomaly_status: str, error_count: float) -> Tuple[int, str]:
    penalty = failure_risk * 0.65
    if anomaly_status == "SEVERE_ANOMALY":
        penalty += 20.0
    elif anomaly_status == "ANOMALY_DETECTED":
        penalty += 10.0

    penalty += min(15.0, error_count * 2.0)
    score = int(max(0, min(100, round(100.0 - penalty))))

    if score >= 90:
        label = "Excellent"
    elif score >= 75:
        label = "Good"
    elif score >= 60:
        label = "Attention Required"
    elif score >= 40:
        label = "Poor"
    else:
        label = "Critical"

    return score, label

def compute_risk_level(failure_risk: float) -> str:
    if failure_risk >= 75.0:
        return "CRITICAL"
    elif failure_risk >= 50.0:
        return "HIGH"
    elif failure_risk >= 25.0:
        return "MEDIUM"
    else:
        return "LOW"

def compute_operational_status(failure_risk: float, health_score: int, anomaly_status: str) -> str:
    if failure_risk >= 75.0 or health_score < 40:
        return "CRITICAL"
    if failure_risk >= 50.0:
        return "DEGRADED"
    if anomaly_status != "NORMAL" or health_score < 75:
        return "ATTENTION_REQUIRED"
    return "OPERATIONAL"

def compute_safety_status(failure_risk: float, anomaly_status: str) -> str:
    if anomaly_status == "SEVERE_ANOMALY" or failure_risk >= 75.0:
        return "Safety Event"
    if anomaly_status == "ANOMALY_DETECTED" or failure_risk >= 50.0:
        return "Review Required"
    return "Normal"

def compute_maintenance_priority(
    failure_risk: float,
    criticality: str,
    anomaly_status: str,
    days_since_maint: float
) -> Tuple[int, str]:
    crit_weights = {"LOW": 1.0, "MEDIUM": 1.25, "HIGH": 1.5, "CRITICAL": 1.8, "LIFE-SUPPORTING": 1.8}
    weight = crit_weights.get(criticality.upper(), 1.25)

    base = failure_risk * 0.7 * weight
    if anomaly_status == "SEVERE_ANOMALY":
        base += 20
    elif anomaly_status == "ANOMALY_DETECTED":
        base += 10

    if days_since_maint > 90:
        base += 15

    priority_score = int(max(0, min(100, round(base))))

    if priority_score >= 80:
        label = "Urgent"
    elif priority_score >= 60:
        label = "Elevated"
    elif priority_score >= 35:
        label = "Routine"
    else:
        label = "Low"

    return priority_score, label

def generate_recommended_action(risk_level: str, anomaly_status: str, equipment_type: str) -> str:
    if risk_level == "CRITICAL":
        return f"Initiate immediate safety review and urgent biomedical maintenance for {equipment_type}."
    elif risk_level == "HIGH":
        return f"Prioritize biomedical inspection and review recent {equipment_type} telemetry logs."
    elif risk_level == "MEDIUM" or anomaly_status != "NORMAL":
        return f"Schedule preventive inspection and continue monitoring {equipment_type} telemetry."
    else:
        return f"Continue routine telemetry monitoring for {equipment_type} according to standard schedule."
