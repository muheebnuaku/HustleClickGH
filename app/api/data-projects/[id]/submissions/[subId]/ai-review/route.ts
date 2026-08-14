export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { scoreFrames, isAiConfigured } from "@/lib/ai-review";

// POST { frames: string[] } — auto AI quality suggestion, called by the
// contributor's browser right after they submit (frames extracted from their
// local files). Stores the result on the submission so the admin just sees it.
// Owner-or-admin only. Gated on OPENAI_API_KEY (no-op 503 otherwise).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (!isAiConfigured()) return NextResponse.json({ message: "AI review not configured" }, { status: 503 });

    const { id: projectId, subId } = await params;
    const { frames } = await request.json().catch(() => ({ frames: [] }));
    const clean = Array.isArray(frames)
      ? frames.filter((f: unknown) => typeof f === "string" && f.startsWith("data:image")).slice(0, 6)
      : [];
    if (clean.length === 0) return NextResponse.json({ message: "No frames" }, { status: 400 });

    const submission = await prisma.dataSubmission.findUnique({
      where: { id: subId },
      select: { projectId: true, userId: true },
    });
    if (!submission || submission.projectId !== projectId) {
      return NextResponse.json({ message: "Submission not found" }, { status: 404 });
    }
    // Only the owner (or an admin) may trigger scoring for this submission.
    if (submission.userId !== session.user.id && session.user.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const project = await prisma.dataProject.findUnique({
      where: { id: projectId },
      select: { instructions: true, projectType: true },
    });
    if (!project) return NextResponse.json({ message: "Project not found" }, { status: 404 });

    const result = await scoreFrames(project.instructions, project.projectType, clean);
    await prisma.dataSubmission.update({ where: { id: subId }, data: { aiReview: JSON.stringify(result) } });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Auto AI review error:", error);
    return NextResponse.json({ message: (error as Error).message || "AI review failed" }, { status: 500 });
  }
}
