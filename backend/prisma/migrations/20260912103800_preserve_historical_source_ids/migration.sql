-- Historical records previously keyed by descriptive text. Rebuild this analytical dataset
-- so source identifiers are preserved without attempting unsafe row matching.
TRUNCATE TABLE "HistoricalSafetyAggregate", "HistoricalSafetyEvent", "HistoricalDevice", "HistoricalManufacturer" CASCADE;
ALTER TABLE "HistoricalManufacturer" ADD COLUMN "sourceId" TEXT NOT NULL, ADD COLUMN "sourceKey" TEXT NOT NULL;
ALTER TABLE "HistoricalDevice" ADD COLUMN "sourceId" TEXT NOT NULL, ADD COLUMN "sourceKey" TEXT NOT NULL;
CREATE UNIQUE INDEX "HistoricalManufacturer_sourceId_key" ON "HistoricalManufacturer"("sourceId");
CREATE UNIQUE INDEX "HistoricalManufacturer_sourceKey_key" ON "HistoricalManufacturer"("sourceKey");
CREATE UNIQUE INDEX "HistoricalDevice_sourceId_key" ON "HistoricalDevice"("sourceId");
CREATE UNIQUE INDEX "HistoricalDevice_sourceKey_key" ON "HistoricalDevice"("sourceKey");
DROP INDEX IF EXISTS "HistoricalManufacturer_normalizedName_key";
DROP INDEX IF EXISTS "HistoricalDevice_manufacturerId_normalizedName_modelNumber_key";
