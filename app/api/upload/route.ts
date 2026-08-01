export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { nanoid } from "nanoid";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase-admin";

/**
 * Issues a short-lived signed upload URL for Supabase Storage.
 *
 * The browser POSTs { projectId, fileName } here; we authenticate the session,
 * build a unique object path, and return a signed token the browser uses to
 * upload the file DIRECTLY to Supabase Storage (never through this serverless
 * function — so there is no 4.5 MB body limit). All files live in Supabase.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { message: "Storage not configured — SUPABASE_SERVICE_ROLE_KEY missing" },
      { status: 503 }
    );
  }

  let body: { projectId?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  // Sanitize the folder prefix (path traversal guard) and derive a unique name.
  const projectId = (body.projectId || "general").replace(/[^a-zA-Z0-9_-]/g, "") || "general";
  const rawName = body.fileName || `file-${Date.now()}`;
  const ext = rawName.includes(".") ? rawName.slice(rawName.lastIndexOf(".") + 1).replace(/[^a-zA-Z0-9]/g, "") : "bin";
  const objectPath = `${projectId}/${nanoid(16)}.${ext || "bin"}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(objectPath);

  if (error || !data) {
    console.error("createSignedUploadUrl error:", error);
    return NextResponse.json(
      { message: error?.message || "Could not create upload URL" },
      { status: 500 }
    );
  }

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);

  return NextResponse.json({
    bucket: STORAGE_BUCKET,
    path: data.path,
    token: data.token,
    publicUrl: pub.publicUrl,
  });
}
