-- Remove the retired development account before replacing the enum.
DELETE FROM "User" WHERE "employeeId" = 'MGR001';

ALTER TYPE "UserRole" RENAME TO "UserRole_old";

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BIOMEDICAL_ENGINEER', 'TECHNICIAN');

ALTER TABLE "User"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "UserRole"
    USING ("role"::text::"UserRole"),
  ALTER COLUMN "role" SET DEFAULT 'BIOMEDICAL_ENGINEER';

DROP TYPE "UserRole_old";
