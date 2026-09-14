-- AlterTable
ALTER TABLE "ModelVersion" ADD COLUMN     "featureSchema" JSONB,
ADD COLUMN     "isOperational" BOOLEAN NOT NULL DEFAULT false;
