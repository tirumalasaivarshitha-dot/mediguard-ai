ALTER TABLE "HistoricalManufacturer" ADD COLUMN "parentCompany" TEXT;
ALTER TABLE "HistoricalDevice" ADD COLUMN "classification" TEXT;
ALTER TABLE "HistoricalDevice" ADD COLUMN "country" TEXT;
ALTER TABLE "HistoricalDevice" ADD COLUMN "implanted" TEXT;
ALTER TABLE "HistoricalDevice" ADD COLUMN "quantityInCommerce" DOUBLE PRECISION;
ALTER TABLE "HistoricalDevice" ADD COLUMN "riskClass" TEXT;
