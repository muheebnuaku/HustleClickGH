-- Currencies for projects and field-team payments. Additive + idempotent.
ALTER TABLE "User"          ADD COLUMN IF NOT EXISTS "leaderCurrency" TEXT;
ALTER TABLE "DataProject"   ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'GHS';
ALTER TABLE "LeaderPayable" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'GHS';
ALTER TABLE "LeaderPayout"  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'GHS';
