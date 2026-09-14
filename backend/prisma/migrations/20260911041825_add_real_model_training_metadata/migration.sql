-- AlterTable
ALTER TABLE "ModelVersion" ADD COLUMN     "artifactPath" TEXT,
ADD COLUMN     "disclaimer" TEXT,
ADD COLUMN     "evaluationSamples" INTEGER,
ADD COLUMN     "featureCount" INTEGER,
ADD COLUMN     "targetColumn" TEXT,
ADD COLUMN     "trainingDataType" TEXT,
ADD COLUMN     "trainingSamples" INTEGER;
