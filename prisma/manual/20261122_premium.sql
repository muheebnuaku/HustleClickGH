-- Premium plan: expiry on users, early-access timing on projects, MoMo upgrade requests.
-- Safe to run more than once.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumUntil" TIMESTAMP(3);

ALTER TABLE "DataProject" ADD COLUMN IF NOT EXISTS "launchedAt" TIMESTAMP(3);
ALTER TABLE "DataProject" ADD COLUMN IF NOT EXISTS "openToAllAt" TIMESTAMP(3);
ALTER TABLE "DataProject" ADD COLUMN IF NOT EXISTS "everyoneNotifiedAt" TIMESTAMP(3);

-- Projects already live count as launched and announced, so nothing is
-- re-announced or locked when this ships.
UPDATE "DataProject" SET "launchedAt" = "createdAt", "everyoneNotifiedAt" = "createdAt"
WHERE "launchedAt" IS NULL AND "status" <> 'pending_review' AND "status" <> 'rejected';

CREATE TABLE IF NOT EXISTS "PremiumRequest" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "amount"     DOUBLE PRECISION NOT NULL,
  "currency"   TEXT NOT NULL DEFAULT 'GHS',
  "momoNumber" TEXT NOT NULL,
  "reference"  TEXT NOT NULL,
  "receiptUrl" TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'pending',
  "adminNote"  TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PremiumRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PremiumRequest_status_createdAt_idx" ON "PremiumRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PremiumRequest_userId_idx" ON "PremiumRequest"("userId");
CREATE INDEX IF NOT EXISTS "PremiumRequest_reference_idx" ON "PremiumRequest"("reference");
DO $$ BEGIN
  ALTER TABLE "PremiumRequest" ADD CONSTRAINT "PremiumRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
