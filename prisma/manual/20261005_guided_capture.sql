-- Guided camera capture (nose-dot task), per-submission metadata, location targeting.
-- Additive only: every column is nullable or has a default, so it is safe to run
-- BEFORE the code that uses it is deployed (old code simply ignores the columns).
-- Idempotent — safe to re-run.

ALTER TABLE "DataProject"
  ADD COLUMN IF NOT EXISTS "captureMode"     TEXT    NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS "captureConfig"   TEXT,
  ADD COLUMN IF NOT EXISTS "metadataFields"  TEXT,
  ADD COLUMN IF NOT EXISTS "targetCountries" TEXT,
  ADD COLUMN IF NOT EXISTS "targetRegions"   TEXT,
  ADD COLUMN IF NOT EXISTS "targetCities"    TEXT,
  ADD COLUMN IF NOT EXISTS "requireGeo"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "clientName"      TEXT,
  ADD COLUMN IF NOT EXISTS "referenceCode"   TEXT;

ALTER TABLE "DataSubmission"
  ADD COLUMN IF NOT EXISTS "metadata"    TEXT,
  ADD COLUMN IF NOT EXISTS "captureData" TEXT,
  ADD COLUMN IF NOT EXISTS "location"    TEXT;
