-- Field-team hierarchy + bulk payments through team leaders.
-- Additive + idempotent; safe to run before the code that uses it is deployed.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "leaderRole"       TEXT,
  ADD COLUMN IF NOT EXISTS "leaderCountry"    TEXT,
  ADD COLUMN IF NOT EXISTS "leaderFeePercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "teamCode"         TEXT,
  ADD COLUMN IF NOT EXISTS "teamLeaderId"     TEXT,
  ADD COLUMN IF NOT EXISTS "teamJoinedAt"     TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "User_teamCode_key" ON "User"("teamCode");
CREATE INDEX IF NOT EXISTS "User_teamLeaderId_idx" ON "User"("teamLeaderId");

ALTER TABLE "DataProject"
  ADD COLUMN IF NOT EXISTS "payoutMode" TEXT NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS "assignedLeaderIds" TEXT;

CREATE TABLE IF NOT EXISTS "LeaderPayable" (
  "id"                     TEXT NOT NULL,
  "leaderId"               TEXT NOT NULL,
  "contributorId"          TEXT NOT NULL,
  "submissionId"           TEXT NOT NULL,
  "projectId"              TEXT NOT NULL,
  "projectTitle"           TEXT NOT NULL,
  "amount"                 DOUBLE PRECISION NOT NULL,
  "feePercent"             DOUBLE PRECISION NOT NULL,
  "feeAmount"              DOUBLE PRECISION NOT NULL,
  "status"                 TEXT NOT NULL DEFAULT 'owed',
  "payoutId"               TEXT,
  "paidAt"                 TIMESTAMP(3),
  "paidReceiptUrl"         TEXT,
  "contributorConfirmedAt" TIMESTAMP(3),
  "disputeNote"            TEXT,
  "disputedAt"             TIMESTAMP(3),
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaderPayable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LeaderPayable_submissionId_key" ON "LeaderPayable"("submissionId");
CREATE INDEX IF NOT EXISTS "LeaderPayable_leaderId_status_idx" ON "LeaderPayable"("leaderId", "status");
CREATE INDEX IF NOT EXISTS "LeaderPayable_contributorId_idx" ON "LeaderPayable"("contributorId");
CREATE INDEX IF NOT EXISTS "LeaderPayable_payoutId_idx" ON "LeaderPayable"("payoutId");

CREATE TABLE IF NOT EXISTS "LeaderPayout" (
  "id"             TEXT NOT NULL,
  "leaderId"       TEXT NOT NULL,
  "kind"           TEXT NOT NULL DEFAULT 'bulk',
  "projectId"      TEXT,
  "creditRemaining" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amount"         DOUBLE PRECISION NOT NULL,
  "feeAmount"      DOUBLE PRECISION NOT NULL,
  "total"          DOUBLE PRECISION NOT NULL,
  "itemCount"      INTEGER NOT NULL,
  "method"         TEXT NOT NULL,
  "reference"      TEXT,
  "receiptUrl"     TEXT,
  "localCurrency"  TEXT,
  "localAmount"    DOUBLE PRECISION,
  "notes"          TEXT,
  "status"         TEXT NOT NULL DEFAULT 'sent',
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  CONSTRAINT "LeaderPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeaderPayout_leaderId_createdAt_idx" ON "LeaderPayout"("leaderId", "createdAt");
