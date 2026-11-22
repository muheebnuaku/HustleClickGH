export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { adminUserId } from "@/lib/admin-guard";
import { BlogInputError, createPost, excerpt, getCommunityLinks } from "@/lib/blog";
import { sendPushToAll } from "@/lib/push";

// Admin: every post (drafts included) plus the community links.
export async function GET() {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const posts = await prisma.blogPost.findMany({ orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }] });
    return NextResponse.json({ posts, links: await getCommunityLinks() });
  } catch (error) {
    console.error("Blog list failed:", error);
    return NextResponse.json({ message: "Could not load posts. Has the blog SQL been run on the database?" }, { status: 500 });
  }
}

// Admin: create a post. `notify: true` with `published: true` also sends a push notification.
export async function POST(request: Request) {
  const adminId = await adminUserId();
  if (!adminId) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const b = await request.json();
    const post = await createPost(b, adminId);
    revalidatePath("/blog");
    let pushed = null;
    if (post.published && b.notify === true) {
      pushed = await sendPushToAll({ title: post.title, body: excerpt(post.body, 120), url: `/blog/${post.slug}`, tag: `blog-${post.id}` });
    }
    return NextResponse.json({ post, pushed });
  } catch (error) {
    if (error instanceof BlogInputError) return NextResponse.json({ message: error.message }, { status: 400 });
    console.error("Blog create failed:", error);
    return NextResponse.json({ message: "Failed to save the post" }, { status: 500 });
  }
}
