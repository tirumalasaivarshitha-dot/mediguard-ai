CREATE TYPE "HistoricalDateQuality" AS ENUM ('EXACT', 'YEAR_ONLY', 'UNKNOWN');

CREATE TABLE "HistoricalManufacturer" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "normalizedName" TEXT NOT NULL, "country" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HistoricalManufacturer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HistoricalManufacturer_normalizedName_key" ON "HistoricalManufacturer"("normalizedName");
CREATE INDEX "HistoricalManufacturer_name_idx" ON "HistoricalManufacturer"("name");

CREATE TABLE "HistoricalDevice" (
  "id" TEXT NOT NULL, "deviceCode" TEXT, "name" TEXT NOT NULL, "normalizedName" TEXT NOT NULL, "modelNumber" TEXT NOT NULL DEFAULT '', "manufacturerId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HistoricalDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HistoricalDevice_manufacturerId_normalizedName_modelNumber_key" ON "HistoricalDevice"("manufacturerId", "normalizedName", "modelNumber");
CREATE INDEX "HistoricalDevice_deviceCode_idx" ON "HistoricalDevice"("deviceCode");
CREATE INDEX "HistoricalDevice_normalizedName_idx" ON "HistoricalDevice"("normalizedName");
ALTER TABLE "HistoricalDevice" ADD CONSTRAINT "HistoricalDevice_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "HistoricalManufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HistoricalSafetyEvent" (
  "id" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "deviceCode" TEXT, "manufacturerId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "country" TEXT NOT NULL DEFAULT 'Global', "eventDate" TIMESTAMP(3), "eventYear" INTEGER, "dateQuality" "HistoricalDateQuality" NOT NULL DEFAULT 'UNKNOWN', "recallClass" TEXT NOT NULL DEFAULT 'Unknown', "eventType" TEXT NOT NULL DEFAULT 'Safety event', "description" TEXT NOT NULL, "actionTaken" TEXT, "sourceUrl" TEXT, "rawData" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HistoricalSafetyEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HistoricalSafetyEvent_sourceId_key" ON "HistoricalSafetyEvent"("sourceId");
CREATE INDEX "HistoricalSafetyEvent_manufacturerId_idx" ON "HistoricalSafetyEvent"("manufacturerId");
CREATE INDEX "HistoricalSafetyEvent_deviceId_idx" ON "HistoricalSafetyEvent"("deviceId");
CREATE INDEX "HistoricalSafetyEvent_eventDate_idx" ON "HistoricalSafetyEvent"("eventDate");
CREATE INDEX "HistoricalSafetyEvent_eventYear_idx" ON "HistoricalSafetyEvent"("eventYear");
CREATE INDEX "HistoricalSafetyEvent_recallClass_idx" ON "HistoricalSafetyEvent"("recallClass");
CREATE INDEX "HistoricalSafetyEvent_country_idx" ON "HistoricalSafetyEvent"("country");
ALTER TABLE "HistoricalSafetyEvent" ADD CONSTRAINT "HistoricalSafetyEvent_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "HistoricalManufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoricalSafetyEvent" ADD CONSTRAINT "HistoricalSafetyEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "HistoricalDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HistoricalSafetyAggregate" (
  "id" TEXT NOT NULL, "manufacturerId" TEXT NOT NULL, "year" INTEGER, "recallClass" TEXT NOT NULL, "eventCount" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HistoricalSafetyAggregate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HistoricalSafetyAggregate_manufacturerId_year_recallClass_key" ON "HistoricalSafetyAggregate"("manufacturerId", "year", "recallClass");
CREATE INDEX "HistoricalSafetyAggregate_year_idx" ON "HistoricalSafetyAggregate"("year");
CREATE INDEX "HistoricalSafetyAggregate_recallClass_idx" ON "HistoricalSafetyAggregate"("recallClass");
ALTER TABLE "HistoricalSafetyAggregate" ADD CONSTRAINT "HistoricalSafetyAggregate_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "HistoricalManufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
