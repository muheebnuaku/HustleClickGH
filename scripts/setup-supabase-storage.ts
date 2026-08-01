/**
 * Creates (or updates) the public Supabase Storage bucket used for all uploads.
 * Run once after adding SUPABASE_SERVICE_ROLE_KEY:  npx tsx scripts/setup-supabase-storage.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

async function main() {
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env / .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const opts = {
    public: true,
    fileSizeLimit: 524_288_000, // 500 MB
    allowedMimeTypes: ["audio/*", "video/*", "image/*"],
  };

  const { data: existing } = await supabase.storage.getBucket(bucket);
  if (existing) {
    const { error } = await supabase.storage.updateBucket(bucket, opts);
    if (error) { console.error("updateBucket failed:", error.message); process.exit(1); }
    console.log(`Bucket "${bucket}" already existed — settings updated (public, 500MB, audio/video/image).`);
  } else {
    const { error } = await supabase.storage.createBucket(bucket, opts);
    if (error) { console.error("createBucket failed:", error.message); process.exit(1); }
    console.log(`Bucket "${bucket}" created (public, 500MB, audio/video/image).`);
  }
}

main();
