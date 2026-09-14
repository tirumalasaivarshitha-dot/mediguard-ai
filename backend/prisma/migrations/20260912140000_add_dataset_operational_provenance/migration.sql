ALTER TABLE "Dataset" ADD COLUMN "isOperational" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Equipment" ADD COLUMN "sourceDatasetId" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "sourceDatasetName" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "sourceRowIndex" INTEGER;
ALTER TABLE "Equipment" ADD COLUMN "sourceIdentifier" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "datasetPredictionResultId" TEXT;
ALTER TABLE "DatasetPredictionResult" ADD COLUMN "equipmentId" TEXT;

CREATE UNIQUE INDEX "Dataset_isOperational_key" ON "Dataset"("isOperational") WHERE "isOperational" = true;
CREATE UNIQUE INDEX "Equipment_sourceDatasetId_sourceRowIndex_key" ON "Equipment"("sourceDatasetId", "sourceRowIndex");
CREATE INDEX "Equipment_sourceDatasetId_idx" ON "Equipment"("sourceDatasetId");
CREATE UNIQUE INDEX "Assessment_datasetPredictionResultId_key" ON "Assessment"("datasetPredictionResultId");

ALTER TABLE "Equipment"
ADD CONSTRAINT "Equipment_sourceDatasetId_fkey"
FOREIGN KEY ("sourceDatasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Assessment"
ADD CONSTRAINT "Assessment_datasetPredictionResultId_fkey"
FOREIGN KEY ("datasetPredictionResultId") REFERENCES "DatasetPredictionResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DatasetPredictionResult"
ADD CONSTRAINT "DatasetPredictionResult_equipmentId_fkey"
FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
