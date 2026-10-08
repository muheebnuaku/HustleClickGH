-- In-app capture projects can also accept an uploaded file.
ALTER TABLE "DataProject" ADD COLUMN IF NOT EXISTS "allowUpload" BOOLEAN NOT NULL DEFAULT false;
