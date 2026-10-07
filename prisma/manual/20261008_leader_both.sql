-- One person can be both Country Representative and Supervisor.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "leaderAlsoSupervisor" BOOLEAN NOT NULL DEFAULT false;
