-- Radar: public posts that may be projects for us (see lib/radar.ts).
CREATE TABLE IF NOT EXISTS "RadarItem" (
  "id"        TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "source"    TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "company"   TEXT,
  "location"  TEXT,
  "snippet"   TEXT,
  "postedAt"  TIMESTAMP(3),
  "score"     INTEGER,
  "verdict"   TEXT NOT NULL DEFAULT 'unscored',
  "leadType"  TEXT,
  "reason"    TEXT,
  "angle"     TEXT,
  "status"    TEXT NOT NULL DEFAULT 'new',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadarItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RadarItem_url_key" ON "RadarItem"("url");
CREATE INDEX IF NOT EXISTS "RadarItem_status_score_idx" ON "RadarItem"("status", "score");
CREATE INDEX IF NOT EXISTS "RadarItem_verdict_createdAt_idx" ON "RadarItem"("verdict", "createdAt");
