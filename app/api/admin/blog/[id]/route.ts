export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { adminUserId } from "@/lib/admin-guard";
import { BlogInputError, excerpt, updatePost } from "@/lib/blog";
import { sendPushToAll } from "@/lib/push";

// Admin: edit, publish/unpublish or pin a post. `notify: true` on a published post sends a push.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  try {
    const b = await request.json();
    const post = await updatePost(id, b);
    if (!post) return NextResponse.json({ message: "Post not found" }, { status: 404 });
    revalidatePath("/blog");
    revalidatePath(`/blog/${post.slug}`);
    let pushed = null;
    if (post.published && b.notify === true) {
      pushed = await sendPushToAll({ title: post.title, body: excerpt(post.body, 120), url: `/blog/${post.slug}`, tag: `blog-${post.id}` });
    }
    return NextResponse.json({ post, pushed });
  } catch (error) {
    if (error instanceof BlogInputError) return NextResponse.json({ message: error.message }, { status: 400 });
    console.error("Blog update failed:", error);
    return NextResponse.json({ message: "Failed to update the post" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const post = await prisma.blogPost.findUnique({ where: { id }, select: { slug: true } });
  if (!post) return NextResponse.json({ message: "Post not found" }, { status: 404 });
  await prisma.blogPost.delete({ where: { id } });
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  return NextResponse.json({ ok: true });
}
