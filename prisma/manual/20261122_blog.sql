-- Blog / public updates page. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "BlogPost" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "coverImage"  TEXT,
  "linkUrl"     TEXT,
  "linkLabel"   TEXT,
  "pinned"      BOOLEAN NOT NULL DEFAULT false,
  "published"   BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "authorId"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX IF NOT EXISTS "BlogPost_published_publishedAt_idx" ON "BlogPost"("published", "publishedAt");
