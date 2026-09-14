-- Add a stable hospital employee identifier without removing email contact data.
ALTER TABLE "User" ADD COLUMN "employeeId" TEXT;

UPDATE "User"
SET "employeeId" = 'LEGACY-' || UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 12))
WHERE "employeeId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "employeeId" SET NOT NULL;
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");
CREATE INDEX "User_employeeId_idx" ON "User"("employeeId");
