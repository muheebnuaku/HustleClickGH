-- Several client organizations can review one project; verdicts are shared.
ALTER TABLE "DataProject" ADD COLUMN IF NOT EXISTS "reviewOrgIds" TEXT;
ALTER TABLE "DataSubmission" ADD COLUMN IF NOT EXISTS "clientReviewedByOrgId" TEXT;
-- Carry existing single reviewers over.
UPDATE "DataProject" SET "reviewOrgIds" = json_build_array("reviewOrgId")::text
WHERE "reviewOrgId" IS NOT NULL AND "reviewOrgIds" IS NULL;
-- Existing verdicts were given by that single reviewer.
UPDATE "DataSubmission" s SET "clientReviewedByOrgId" = p."reviewOrgId"
FROM "DataProject" p
WHERE s."projectId" = p."id" AND s."clientVerdict" IS NOT NULL AND s."clientReviewedByOrgId" IS NULL AND p."reviewOrgId" IS NOT NULL;
