/**
 * Deletes ALL objects from the Vercel Blob store, then you can delete the store
 * itself from the Vercel dashboard. Requires BLOB_READ_WRITE_TOKEN and an ACTIVE
 * (non-suspended) store — a suspended store rejects API calls, in which case just
 * delete the store from vercel.com → Storage.
 *
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx npx tsx scripts/clear-blob.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { list, del } from "@vercel/blob";

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set. Provide it inline or in .env.local.");
    process.exit(1);
  }

  let cursor: string | undefined;
  let total = 0;
  do {
    const res = await list({ cursor, limit: 1000 });
    const urls = res.blobs.map((b) => b.url);
    if (urls.length) {
      await del(urls);
      total += urls.length;
      console.log(`Deleted ${total} objects so far…`);
    }
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);

  console.log(`Done. Removed ${total} objects from the Vercel Blob store.`);
  console.log("You can now delete the store itself from vercel.com → Storage.");
}

main().catch((e) => {
  console.error("Failed:", e.message);
  console.error("If the store is suspended, delete it from the Vercel dashboard instead.");
  process.exit(1);
});
