-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BIOMEDICAL_ENGINEER', 'TECHNICIAN', 'DEPARTMENT_MANAGER');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('OPERATIONAL', 'ATTENTION_REQUIRED', 'HIGH_RISK', 'CRITICAL', 'UNDER_MAINTENANCE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkOrderType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PENDING', 'ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'ESCALATED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('HIGH_RISK', 'SAFETY_ALERT', 'MAINTENANCE_DUE', 'TECHNICIAN_ASSIGNMENT', 'WORK_ORDER_UPDATE', 'RETURNED_TO_SERVICE', 'MODEL_TRAINING', 'DATASET_VALIDATION');

-- CreateEnum
CREATE TYPE "DatasetType" AS ENUM ('HISTORICAL_SAFETY', 'TELEMETRY', 'MAINTENANCE', 'USER_UPLOADED', 'SYNTHETIC');

-- CreateEnum
CREATE TYPE "DatasetStatus" AS ENUM ('UPLOADED', 'PROFILING', 'READY', 'TRAINING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ModelStatus" AS ENUM ('TRAINING', 'EVALUATION', 'ACTIVE', 'INACTIVE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'BIOMEDICAL_ENGINEER',
    "department" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "expertise" JSONB,
    "certifications" JSONB,
    "department" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "availability" TEXT NOT NULL DEFAULT 'Available',
    "workload" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "equipmentCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "installationDate" TIMESTAMP(3),
    "warrantyExpiry" TIMESTAMP(3),
    "operatingHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criticality" "Criticality" NOT NULL DEFAULT 'MEDIUM',
    "status" "EquipmentStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "healthScore" INTEGER NOT NULL DEFAULT 100,
    "failureRisk" INTEGER NOT NULL DEFAULT 0,
    "lastMaintenanceAt" TIMESTAMP(3),
    "nextMaintenanceAt" TIMESTAMP(3),
    "assignedTechnicianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryReading" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperature" DOUBLE PRECISION,
    "vibration" DOUBLE PRECISION,
    "powerConsumption" DOUBLE PRECISION,
    "pressure" DOUBLE PRECISION,
    "voltage" DOUBLE PRECISION,
    "operatingHours" DOUBLE PRECISION,
    "errorCount" INTEGER,
    "additionalData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "failureRisk" INTEGER NOT NULL,
    "operationalStatus" TEXT NOT NULL,
    "safetyStatus" TEXT NOT NULL,
    "anomalyStatus" TEXT,
    "maintenancePriority" TEXT,
    "explanation" TEXT,
    "modelVersionId" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceWorkOrder" (
    "id" TEXT NOT NULL,
    "workOrderCode" TEXT,
    "equipmentId" TEXT NOT NULL,
    "assignedTechnicianId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "WorkOrderType" NOT NULL DEFAULT 'PREVENTIVE',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "estimatedCost" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "maintenanceCost" DOUBLE PRECISION,
    "downtimeMinutes" INTEGER,
    "partsUsed" JSONB,
    "notes" TEXT,
    "technicianNotes" TEXT,
    "completionNotes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "assessmentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyAlert" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "riskScore" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'AI_ASSESSMENT',
    "assignedToId" TEXT,
    "workOrderId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "relatedEquipmentId" TEXT,
    "relatedAlertId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "columnCount" INTEGER NOT NULL DEFAULT 0,
    "targetColumn" TEXT,
    "profileSummary" JSONB,
    "mappingConfig" JSONB,
    "validationStatus" TEXT DEFAULT 'VALIDATED',
    "validationWarnings" JSONB,
    "storagePath" TEXT,
    "status" "DatasetStatus" NOT NULL DEFAULT 'UPLOADED',
    "datasetType" "DatasetType" NOT NULL DEFAULT 'TELEMETRY',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "datasetId" TEXT,
    "datasetName" TEXT,
    "status" "ModelStatus" NOT NULL DEFAULT 'TRAINING',
    "accuracy" DOUBLE PRECISION,
    "precision" DOUBLE PRECISION,
    "recall" DOUBLE PRECISION,
    "f1Score" DOUBLE PRECISION,
    "rocAuc" DOUBLE PRECISION,
    "trainingDuration" INTEGER,
    "confusionMatrix" JSONB,
    "featureImportance" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "trainedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalSafetyRecord" (
    "id" TEXT NOT NULL,
    "deviceCode" TEXT,
    "deviceName" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "modelNumber" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Global',
    "eventYear" INTEGER NOT NULL,
    "recallClass" TEXT NOT NULL DEFAULT 'Class II',
    "eventType" TEXT NOT NULL DEFAULT 'Field Safety Notice',
    "description" TEXT NOT NULL,
    "actionTaken" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalSafetyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianProfile_userId_key" ON "TechnicianProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianProfile_employeeCode_key" ON "TechnicianProfile"("employeeCode");

-- CreateIndex
CREATE INDEX "TechnicianProfile_department_idx" ON "TechnicianProfile"("department");

-- CreateIndex
CREATE INDEX "TechnicianProfile_availability_idx" ON "TechnicianProfile"("availability");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_equipmentCode_key" ON "Equipment"("equipmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_serialNumber_key" ON "Equipment"("serialNumber");

-- CreateIndex
CREATE INDEX "Equipment_department_idx" ON "Equipment"("department");

-- CreateIndex
CREATE INDEX "Equipment_equipmentType_idx" ON "Equipment"("equipmentType");

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");

-- CreateIndex
CREATE INDEX "Equipment_criticality_idx" ON "Equipment"("criticality");

-- CreateIndex
CREATE INDEX "Equipment_assignedTechnicianId_idx" ON "Equipment"("assignedTechnicianId");

-- CreateIndex
CREATE INDEX "TelemetryReading_equipmentId_idx" ON "TelemetryReading"("equipmentId");

-- CreateIndex
CREATE INDEX "TelemetryReading_timestamp_idx" ON "TelemetryReading"("timestamp");

-- CreateIndex
CREATE INDEX "Assessment_equipmentId_idx" ON "Assessment"("equipmentId");

-- CreateIndex
CREATE INDEX "Assessment_assessedAt_idx" ON "Assessment"("assessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceWorkOrder_workOrderCode_key" ON "MaintenanceWorkOrder"("workOrderCode");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_equipmentId_idx" ON "MaintenanceWorkOrder"("equipmentId");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_assignedTechnicianId_idx" ON "MaintenanceWorkOrder"("assignedTechnicianId");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_status_idx" ON "MaintenanceWorkOrder"("status");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_priority_idx" ON "MaintenanceWorkOrder"("priority");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_scheduledAt_idx" ON "MaintenanceWorkOrder"("scheduledAt");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_dueAt_idx" ON "MaintenanceWorkOrder"("dueAt");

-- CreateIndex
CREATE INDEX "SafetyAlert_equipmentId_idx" ON "SafetyAlert"("equipmentId");

-- CreateIndex
CREATE INDEX "SafetyAlert_status_idx" ON "SafetyAlert"("status");

-- CreateIndex
CREATE INDEX "SafetyAlert_severity_idx" ON "SafetyAlert"("severity");

-- CreateIndex
CREATE INDEX "SafetyAlert_workOrderId_idx" ON "SafetyAlert"("workOrderId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Dataset_datasetType_idx" ON "Dataset"("datasetType");

-- CreateIndex
CREATE INDEX "Dataset_status_idx" ON "Dataset"("status");

-- CreateIndex
CREATE INDEX "ModelVersion_status_idx" ON "ModelVersion"("status");

-- CreateIndex
CREATE INDEX "ModelVersion_isActive_idx" ON "ModelVersion"("isActive");

-- CreateIndex
CREATE INDEX "HistoricalSafetyRecord_manufacturer_idx" ON "HistoricalSafetyRecord"("manufacturer");

-- CreateIndex
CREATE INDEX "HistoricalSafetyRecord_deviceName_idx" ON "HistoricalSafetyRecord"("deviceName");

-- CreateIndex
CREATE INDEX "HistoricalSafetyRecord_eventYear_idx" ON "HistoricalSafetyRecord"("eventYear");

-- CreateIndex
CREATE INDEX "HistoricalSafetyRecord_recallClass_idx" ON "HistoricalSafetyRecord"("recallClass");

-- CreateIndex
CREATE INDEX "HistoricalSafetyRecord_country_idx" ON "HistoricalSafetyRecord"("country");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- AddForeignKey
ALTER TABLE "TechnicianProfile" ADD CONSTRAINT "TechnicianProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "TechnicianProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryReading" ADD CONSTRAINT "TelemetryReading_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "TechnicianProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyAlert" ADD CONSTRAINT "SafetyAlert_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyAlert" ADD CONSTRAINT "SafetyAlert_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyAlert" ADD CONSTRAINT "SafetyAlert_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "TechnicianProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyAlert" ADD CONSTRAINT "SafetyAlert_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "MaintenanceWorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relatedEquipmentId_fkey" FOREIGN KEY ("relatedEquipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_relatedAlertId_fkey" FOREIGN KEY ("relatedAlertId") REFERENCES "SafetyAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelVersion" ADD CONSTRAINT "ModelVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
