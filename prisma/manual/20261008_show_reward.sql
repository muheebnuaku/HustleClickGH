-- Lets admins hide a via-leader project's reward from contributors (the leader pays them).
ALTER TABLE "DataProject" ADD COLUMN IF NOT EXISTS "showReward" BOOLEAN NOT NULL DEFAULT true;
