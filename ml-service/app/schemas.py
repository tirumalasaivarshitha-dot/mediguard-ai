from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class TelemetryReadingInput(BaseModel):
    timestamp: Optional[str] = None
    temperature: Optional[float] = None
    vibration: Optional[float] = None
    powerKw: Optional[float] = None
    pressure: Optional[float] = None
    voltage: Optional[float] = None
    operatingHours: Optional[float] = None
    errorCount: Optional[int] = 0

class EquipmentInput(BaseModel):
    id: str
    equipmentCode: Optional[str] = "EQ-000"
    name: Optional[str] = "Medical Equipment"
    equipmentType: str = "Medical Device"
    manufacturer: Optional[str] = "Generic"
    model: Optional[str] = "Standard"
    department: Optional[str] = "General"
    location: Optional[str] = "Storage"
    operatingHours: Optional[float] = 100.0
    criticality: Optional[str] = "MEDIUM"
    lastMaintenanceDaysAgo: Optional[int] = 30

class AssessmentRequest(BaseModel):
    equipment: EquipmentInput
    telemetry: Optional[List[TelemetryReadingInput]] = []
    manualReadings: Optional[TelemetryReadingInput] = None
    featureVector: Optional[Dict[str, Any]] = None
    source: Optional[str] = "telemetry"
    modelArtifact: Optional[str] = None
    modelVersionOverride: Optional[str] = None
    modelDataset: Optional[str] = None
    modelTrainingDataType: Optional[str] = None

class FeatureContributionItem(BaseModel):
    feature: str
    contribution: float
    summary: str

class AnomalyItem(BaseModel):
    metric: str
    summary: str
    severity: str

class AssessmentResponse(BaseModel):
    equipmentId: str
    equipmentType: str
    healthScore: int
    healthLabel: str
    failureRisk: float
    riskLevel: str
    operationalStatus: str
    safetyStatus: str
    anomalyStatus: str
    anomalies: List[AnomalyItem]
    maintenancePriority: int
    priorityLabel: str
    contributingFactors: List[str]
    contributions: List[FeatureContributionItem]
    recommendedAction: str
    modelVersion: str
    assessmentType: str = "ML"
    dataType: str = "SIMULATED_TELEMETRY"
    modelDisclaimer: str = "DEMO MODEL — NOT CLINICALLY VALIDATED"
    modelDataset: Optional[str] = None
    modelTrainingDataType: Optional[str] = None
    modelType: Optional[str] = None
    dataLabel: Optional[str] = None
    isValidated: Optional[bool] = None
    assessedAt: str
