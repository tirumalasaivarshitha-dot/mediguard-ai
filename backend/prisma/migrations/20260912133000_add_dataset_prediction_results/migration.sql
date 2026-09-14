CREATE TABLE "DatasetPredictionResult" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "prediction" TEXT NOT NULL,
    "predictedClass" TEXT,
    "failureRisk" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "errorMessage" TEXT,
    "predictedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatasetPredictionResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DatasetPredictionResult_datasetId_modelVersionId_rowIndex_key"
ON "DatasetPredictionResult"("datasetId", "modelVersionId", "rowIndex");

CREATE INDEX "DatasetPredictionResult_datasetId_modelVersionId_idx"
ON "DatasetPredictionResult"("datasetId", "modelVersionId");

CREATE INDEX "DatasetPredictionResult_status_idx"
ON "DatasetPredictionResult"("status");

ALTER TABLE "DatasetPredictionResult"
ADD CONSTRAINT "DatasetPredictionResult_datasetId_fkey"
FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DatasetPredictionResult"
ADD CONSTRAINT "DatasetPredictionResult_modelVersionId_fkey"
FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
