export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { scoreFrames, isAiConfigured } from "@/lib/ai-review";

// POST { frames: string[] } — admin-triggered AI quality suggestion for a
// submission. Frames are extracted in the admin's browser (video → canvas) and
// sent here; we grade them against the project's instructions. Suggestion only.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }
    if (!isAiConfigured()) {
      return NextResponse.json({ message: "AI review not configured — set OPENAI_API_KEY." }, { status: 503 });
    }

    const { id: projectId, subId } = await params;
    const { frames } = await request.json().catch(() => ({ frames: [] }));
    if (!Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ message: "No frames provided. AI review needs a video or image submission." }, { status: 400 });
    }
    // Guard payload size (base64 frames are large).
    const trimmed = frames.filter((f: unknown) => typeof f === "string" && f.startsWith("data:image")).slice(0, 6);
    if (trimmed.length === 0) {
      return NextResponse.json({ message: "Frames were unreadable." }, { status: 400 });
    }

    const submission = await prisma.dataSubmission.findUnique({ where: { id: subId }, select: { projectId: true } });
    if (!submission || submission.projectId !== projectId) {
      return NextResponse.json({ message: "Submission not found" }, { status: 404 });
    }
    const project = await prisma.dataProject.findUnique({ where: { id: projectId }, select: { instructions: true, projectType: true } });
    if (!project) return NextResponse.json({ message: "Project not found" }, { status: 404 });

    const result = await scoreFrames(project.instructions, project.projectType, trimmed);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("AI review error:", error);
    return NextResponse.json({ message: (error as Error).message || "AI review failed" }, { status: 500 });
  }
}
