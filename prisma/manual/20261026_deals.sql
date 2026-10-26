-- Deals pipeline + messages (see lib/deals.ts).
CREATE TABLE IF NOT EXISTS "Deal" (
  "id"               TEXT NOT NULL,
  "source"           TEXT NOT NULL,
  "company"          TEXT NOT NULL,
  "contactName"      TEXT,
  "contactEmail"     TEXT,
  "contactTitle"     TEXT,
  "contactUrl"       TEXT,
  "country"          TEXT,
  "summary"          TEXT,
  "evidenceUrl"      TEXT,
  "stage"            TEXT NOT NULL DEFAULT 'new',
  "kind"             TEXT,
  "triage"           TEXT,
  "nextStep"         TEXT,
  "nextDate"         TIMESTAMP(3),
  "valueUsd"         DOUBLE PRECISION,
  "notes"            TEXT,
  "partnerInquiryId" TEXT,
  "radarItemId"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_partnerInquiryId_key" ON "Deal"("partnerInquiryId");
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_radarItemId_key" ON "Deal"("radarItemId");
CREATE INDEX IF NOT EXISTS "Deal_stage_nextDate_idx" ON "Deal"("stage", "nextDate");
CREATE INDEX IF NOT EXISTS "Deal_createdAt_idx" ON "Deal"("createdAt");

CREATE TABLE IF NOT EXISTS "DealMessage" (
  "id"        TEXT NOT NULL,
  "dealId"    TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "toEmail"   TEXT,
  "subject"   TEXT,
  "body"      TEXT NOT NULL,
  "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DealMessage_dealId_createdAt_idx" ON "DealMessage"("dealId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "DealMessage" ADD CONSTRAINT "DealMessage_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
