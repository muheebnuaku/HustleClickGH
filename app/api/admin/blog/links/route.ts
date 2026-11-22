export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminUserId } from "@/lib/admin-guard";
import { BlogInputError, saveCommunityLinks } from "@/lib/blog";

// Admin: replace the WhatsApp group / community links shown on /blog.
export async function PUT(request: Request) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const { links } = await request.json();
    const saved = await saveCommunityLinks(links);
    revalidatePath("/blog", "layout");
    return NextResponse.json({ links: saved });
  } catch (error) {
    if (error instanceof BlogInputError) return NextResponse.json({ message: error.message }, { status: 400 });
    console.error("Community links save failed:", error);
    return NextResponse.json({ message: "Failed to save links" }, { status: 500 });
  }
}
