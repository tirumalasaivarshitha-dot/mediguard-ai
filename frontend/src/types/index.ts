export type Tone = 'healthy' | 'warning' | 'high' | 'critical' | 'info' | 'neutral'

export type UserRole =
  | 'hospital_admin'
  | 'biomedical_engineer'
  | 'maintenance_technician'

export type ConnectionState = 'connected' | 'reconnecting' | 'offline'

export type TelemetrySource = 'csv' | 'excel' | 'api' | 'realtime' | 'synthetic' | 'SIMULATED_TELEMETRY' | 'BATCH_INGESTION'

export type OperationalStatus = 'operational' | 'attention' | 'degraded' | 'offline' | 'maintenance'

export type HealthStatusLabel = 'Excellent' | 'Good' | 'Attention Required' | 'Poor' | 'Critical'

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical'

export type AnomalyLevel = 'Normal' | 'Anomaly Detected' | 'Severe Anomaly'

export type SafetyStatus = 'Normal' | 'Review Required' | 'Safety Event'

export type Criticality = 'Low' | 'Medium' | 'High' | 'Life-supporting'

export type MaintenanceState = 'current' | 'due' | 'overdue' | 'in_progress'

export type WorkOrderStatus = 'Pending' | 'Assigned' | 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled'

export type WorkOrderType = 'Preventive' | 'Corrective' | 'Inspection' | 'Calibration' | 'Emergency'

export type NotificationSeverity = 'Info' | 'Warning' | 'High' | 'Critical'

export type AlertStatus = 'Unacknowledged' | 'Acknowledged' | 'Assigned' | 'Escalated' | 'Resolved' | 'Dismissed'

export type ModelStatus = 'Draft' | 'Training' | 'Evaluating' | 'Recommended for Review' | 'Active' | 'Archived' | 'Rejected'

export type DatasetStatus = 'Uploaded' | 'Profiled' | 'Configured' | 'Invalid' | 'Ready'

export type Equipment = {
  id: string
  name?: string
  equipmentType: string
  manufacturer: string
  model: string
  department: string
  location: string
  installationDate: string
  warrantyExpiry: string
  operatingHours: number
  healthScore: number
  failureRisk: number
  operationalStatus: OperationalStatus
  criticality: Criticality
  assignedTechnicianId: string | null
  assignedTechnicianUserId?: string | null
  lastMaintenance: string
  nextMaintenance: string
  maintenanceState: MaintenanceState
  safetyStatus: SafetyStatus
  telemetrySource: TelemetrySource
  connectionState: ConnectionState
  lastTelemetryAt: string | null
  sourceDatasetId?: string | null
  sourceDatasetName?: string | null
  sourceDatasetType?: string | null
  sourceIdentifier?: string | null
  sourceRowIndex?: number | null
  isHistorical?: boolean
  historicalDetails?: {
    deviceName: string
    manufacturerName: string
    classification: string | null
    deviceCode: string | null
    riskClass: string | null
    country: string | null
    modelNumber: string
    manufacturerCountry: string | null
    eventCount: number
    lastEvent: {
      eventType: string
      actionTaken: string | null
      eventDate: string | null
      country: string
      description: string
    } | null
  }
  equipmentCode?: string
}

export type TelemetryPoint = {
  timestamp: string
  temperature: number
  vibration: number
  powerKw: number
  pressure: number
  voltage: number
  errorCount: number
  operatingHours: number
}

export type TelemetrySeries = {
  equipmentId: string
  source: TelemetrySource
  simulated: boolean
  lastUpdate: string
  connectionState: ConnectionState
  points: TelemetryPoint[]
  current: TelemetryPoint
  units: Record<string, string>
}

export type FeatureContribution = {
  feature: string
  contribution: number
  direction: 'increases_risk' | 'decreases_risk' | 'neutral'
  note: string
}

export type AnomalyFinding = {
  metric: string
  level: AnomalyLevel
  summary: string
}

export type RiskAssessment = {
  equipmentId: string
  healthScore: number
  healthLabel: HealthStatusLabel
  failureRisk: number
  riskLevel: RiskLevel
  operationalStatus: OperationalStatus
  safetyStatus: SafetyStatus
  maintenancePriority: number
  priorityLabel: 'Low' | 'Routine' | 'Elevated' | 'Urgent'
  recommendedAction: string
  anomalyLevel: AnomalyLevel
  anomalies: AnomalyFinding[]
  explanations: string[]
  contributions: FeatureContribution[]
  modelId: string
  assessedAt: string
  source: TelemetrySource | 'manual'
  modelVersion?: string
  modelDataset?: string | null
  modelTrainingDataType?: string | null
  modelDisclaimer?: string
  modelType?: string
  dataLabel?: string
  isValidated?: boolean
}

export type HistoricalSafetyAssessment = {
  equipmentId: string
  equipment: {
    equipmentCode: string
    name: string
    manufacturer: string
    model: string
    sourceIdentifier: string
  }
  dataLabel: 'HISTORICAL SAFETY DATA'
  disclaimer: string
  cutoffDate: string
  model: {
    id: string
    name: string
    version: string
    algorithm: string
    datasetName: string
    trainingDataType: string | null
    status: string
    target: string
    targetDefinition: string
  }
  prediction: {
    predictedClass: number | string
    recurrenceProbability: number | null
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
    explanation: string[]
    contributions: { feature: string; contribution: number }[]
  }
  operationalAction: string
}

export type Prediction = {
  equipmentId: string
  riskAssessment: RiskAssessment
}

export type Technician = {
  id: string
  userId?: string
  name: string
  role: string
  expertise: string[]
  certifications: string[]
  department: string
  location: string
  availability: 'Available' | 'Busy' | 'Off shift'
  currentWorkload: number
  assignedEquipmentIds: string[]
}

export type WorkOrder = {
  id: string
  workOrderCode?: string
  equipmentId: string
  title: string
  description?: string | null
  type: WorkOrderType
  priorityLabel: 'Low' | 'Routine' | 'Elevated' | 'Urgent'
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  assignedTechnicianId: string | null
  scheduledDate: string | null
  scheduledAt?: string | null
  dueDate?: string | null
  dueAt?: string | null
  status: WorkOrderStatus
  downtimeHours: number | null
  downtimeMinutes?: number | null
  parts: string[]
  partsUsed?: string[]
  estimatedCost: number | null
  maintenanceCost?: number | null
  actualCost?: number | null
  notes: string
  technicianNotes?: string | null
  completionNotes?: string | null
  source?: 'AI_ASSESSMENT' | 'MANUAL' | string
  assessmentId?: string | null
  failureRisk?: number | null
  createdAt: string
  updatedAt?: string
  completedAt: string | null
  equipmentName?: string | null
  equipmentType?: string | null
  equipmentCode?: string | null
  assignedTechnicianName?: string | null
  relatedAlertId?: string | null
  relatedAlertTitle?: string | null
  relatedAlertStatus?: string | null
  relatedAlertRiskScore?: number | null
  relatedAlertReason?: string | null
  relatedAlertRecommendedAction?: string | null
}

export type MaintenanceRecord = {
  id: string
  equipmentId: string
  workOrderId: string | null
  date: string
  type: WorkOrderType
  technicianId: string
  summary: string
  downtimeHours: number
  cost: number
}

export type SafetyAlert = {
  id: string
  equipmentId: string
  title?: string
  severity: 'Warning' | 'High' | 'Critical'
  riskScore?: number | null
  reason: string
  recommendedAction: string
  responsibleRole: string
  assignedTechnicianId: string | null
  assignedTechnicianUserId?: string | null
  assignedTechnicianName?: string | null
  status: AlertStatus
  createdAt: string
  equipmentName?: string | null
  equipmentType?: string | null
  equipmentStatus?: string | null
  equipmentCode?: string | null
  healthScore?: number | null
  workOrderId?: string | null
  workOrderCode?: string | null
  workOrderStatus?: WorkOrderStatus | null
  updatedAt?: string
}

export type AppNotification = {
  id: string
  severity: NotificationSeverity
  title: string
  body: string
  createdAt: string
  read: boolean
  href?: string
}

export type HistoryPerson = {
  id: string
  name?: string | null
  email?: string | null
}

export type HistoryEquipment = {
  id: string
  equipmentCode?: string | null
  name?: string | null
  equipmentType?: string | null
  department?: string | null
  location?: string | null
}

export type HistoryItem = {
  id: string
  type: 'MAINTENANCE' | 'ALERT'
  equipment: HistoryEquipment
  alert?: Record<string, unknown> | null
  maintenance?: Record<string, unknown> | null
  status: string
  completedAt?: string | null
  reviewedAt?: string | null
  riskLevel?: string | null
  failureRisk?: number | null
  problem?: string | null
  action?: string | null
  assignedTechnician?: HistoryPerson | null
  reviewedBy?: HistoryPerson | null
  acknowledgedAt?: string | null
  acknowledgedBy?: string | null
  dataset?: { id: string; name: string } | null
  model?: { id: string; name: string; version: string; datasetId: string | null; datasetName: string | null } | null
  activityAt?: string | null
}

export type DatasetProfile = {
  rows: number
  columns: number
  numericalColumns: number
  categoricalColumns: number
  missingValuePercent: number
  duplicates: number
  potentialTarget: string | null
  warnings: string[]
  columnNames: string[]
  columnDetails?: { name: string; type: string; missingCount: number; uniqueCount: number }[]
  datetimeColumns?: string[]
  missingTotal?: number
  previewRows?: Record<string, unknown>[]
  possibleIdColumns?: string[]
  errors?: string[]
  detectedMapping?: DetectedColumnMapping[]
  unmappedColumns?: string[]
  suspiciousColumns?: string[]
  capabilities?: DatasetCapabilities
  compatibility?: 'COMPATIBLE' | 'COMPATIBLE_WITH_LIMITATIONS' | 'REJECTED'
}

export type DetectedColumnMapping = {
  sourceColumn: string
  detectedType: string
  canonicalField?: string
  confidence: number | null
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNMAPPED'
  status: 'MAPPED' | 'UNMAPPED'
  reason: string
  sampleValues: unknown[]
}

export type DatasetCapabilities = {
  equipmentIdentification: boolean
  telemetryAnalysis: boolean
  failurePrediction: boolean
  anomalyDetection: boolean
  maintenanceAnalysis: boolean
  conditionAssessment: boolean
  historicalSafetyIntelligence: boolean
  operationalTelemetry: boolean
}

export type ColumnMapping = {
  equipmentId?: string
  equipmentName?: string
  equipmentType?: string
  model?: string
  manufacturer?: string
  location?: string
  department?: string
  facility?: string
  temperature?: string
  vibration?: string
  pressure?: string
  power?: string
  humidity?: string
  operatingHours?: string
  errorCount?: string
  lastMaintenance?: string
  maintenanceCount?: string
  maintenanceStatus?: string
  maintenance?: string
  failureTarget?: string
  failureIndicator?: string
  faultStatus?: string
  failureType?: string
  conditionStatus?: string
  timestamp?: string
}

export type Dataset = {
  id: string
  name: string
  format: 'csv' | 'xlsx'
  uploadedAt: string
  status: DatasetStatus
  profile: DatasetProfile
  mapping: ColumnMapping | null
  source?: string
  datasetType?: string
  isOperational?: boolean
  provenance?: unknown
}

export type DatasetAICapabilities = {
  datasetId: string
  compatibility: DatasetProfile['compatibility']
  capabilities: DatasetCapabilities
  recommendedMode: string
  selectedModel: {
    id: string
    name: string
    version: string
    algorithm: string
    trainingDataType: string | null
    datasetName: string | null
    status: string
    isOperational: boolean
    artifactAvailable: boolean
  } | null
  modelCompatibility: Array<{
    modelId: string
    modelName: string
    compatible: boolean
    missingFeatures: string[]
  }>
  reason: string
  limitations: string[]
  warnings: string[]
}

export type UnifiedDatasetAssessment = {
  equipmentId: string
  equipmentName: string
  equipmentType: string
  condition: string
  healthScore: number | null
  riskLevel: string
  failureRisk: number | null
  anomalyDetected: boolean
  aiMode: string
  selectedModel: {
    id: string
    name: string
    version: string
    algorithm: string
    trainingDataType: string | null
    datasetName?: string | null
    status?: string
    isOperational: boolean
    isValidated: boolean
    artifactAvailable?: boolean
  } | null
  reasons: string[]
  contributingFactors: Array<{
    factor: string
    direction: 'INCREASES_RISK' | 'DECREASES_RISK' | 'NEUTRAL'
  }>
  recommendedActions: string[]
  maintenancePriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  priorityReason: string
  limitations: string[]
  dataLabel: string
  historicalSafetyRisk?: number | null
}

export type ConfusionMatrix = {
  truePositive: number
  falsePositive: number
  trueNegative: number
  falseNegative: number
}

export type ModelEvaluation = {
  accuracy: number
  precision: number
  recall: number
  f1: number
  rocAuc: number
  confusionMatrix: ConfusionMatrix
  featureImportance: { feature: string; importance: number }[]
}

export type MlModel = {
  id: string
  name: string
  version: string
  algorithm: string
  datasetId: string
  datasetName: string
  targetColumn?: string
  trainedAt: string
  activatedAt: string | null
  status: ModelStatus
  isOperational?: boolean
  evaluation: ModelEvaluation | null
}

export type HistoricalSafetyEvent = {
  id: string
  deviceType: string
  manufacturer: string
  country: string
  year: number
  recallClass: 'I' | 'II' | 'III' | 'Notice'
  eventType: 'Recall' | 'Safety notice' | 'Field correction'
  summary: string
}

export type SimulationResult = {
  equipmentId: string
  labeledAs: 'SIMULATION / ESTIMATE'
  currentHealth: number
  currentRisk: number
  estimatedHealth: number
  estimatedRisk: number
  riskReductionPoints: number
  healthImprovementPoints: number
  potentialDowntimeReductionHours: number
  notes: string[]
}

export type AuditLog = {
  id: string
  at: string
  actor: string
  action: string
  entityType: string
  entityId: string
  detail: string
}

export type SessionUser = {
  id: string
  employeeId: string
  name: string
  email: string
  role: UserRole
  department?: string
}

export type ManualAssessmentInput = {
  equipmentType: string
  temperature: number
  vibration: number
  powerKw: number
  operatingHours: number
  errorCount: number
  lastMaintenanceDaysAgo: number
  department: string
  equipmentId?: string
}

export type DashboardSnapshot = {
  total: number
  healthy: number
  attention: number
  highRisk: number
  critical: number
  underMaintenance: number
  activeSafetyAlerts: number
  maintenanceDue: number
  activeDatasetId?: string | null
  activeDatasetName?: string | null
  dataMode?: string
  disclaimer?: string
}
