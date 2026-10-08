-- Per-person submissions-per-project limit (like a manager's), set by an admin.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "submitLimit" INTEGER;
