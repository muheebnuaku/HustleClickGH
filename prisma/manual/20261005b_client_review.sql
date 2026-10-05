-- Client review access: an Organization can be granted pass/fail review of a
-- project's submissions on its portal. Additive + idempotent; safe to run before deploy.

ALTER TABLE "DataProject"
  ADD COLUMN IF NOT EXISTS "reviewOrgId" TEXT;

ALTER TABLE "DataSubmission"
  ADD COLUMN IF NOT EXISTS "clientVerdict"    TEXT,
  ADD COLUMN IF NOT EXISTS "clientNote"       TEXT,
  ADD COLUMN IF NOT EXISTS "clientReviewedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "DataProject_reviewOrgId_idx" ON "DataProject"("reviewOrgId");
