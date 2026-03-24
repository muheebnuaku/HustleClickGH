export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// PUT: Full project edit
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      title, description, instructions, samplePrompts, reward,
      maxSubmissions, languages, minDurationSecs, maxDurationSecs,
      maxFileSizeMB, expiresAt, malesNeeded, femalesNeeded,
      audioSampleRate, audioChannels, audioBitDepth, recordingType,
    } = body;

    const project = await prisma.dataProject.update({
      where: { id },
      data: {
        title,
        description,
        instructions,
        samplePrompts: JSON.stringify(
          Array.isArray(samplePrompts) ? samplePrompts : []
        ),
        reward: parseFloat(reward),
        maxSubmissions: parseInt(maxSubmissions),
        languages: JSON.stringify(
          Array.isArray(languages) ? languages : []
        ),
        minDurationSecs: parseInt(minDurationSecs) || 3,
        maxDurationSecs: parseInt(maxDurationSecs) || 60,
        maxFileSizeMB: parseFloat(maxFileSizeMB) || 15,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        malesNeeded: malesNeeded ? parseInt(malesNeeded) : null,
        femalesNeeded: femalesNeeded ? parseInt(femalesNeeded) : null,
        audioSampleRate: audioSampleRate ? parseInt(audioSampleRate) : null,
        audioChannels: audioChannels ? parseInt(audioChannels) : null,
        audioBitDepth: audioBitDepth ? parseInt(audioBitDepth) : null,
        recordingType: recordingType || null,
      },
    });

    return NextResponse.json({ message: "Project updated", project });
  } catch (error) {
    console.error("Admin edit project error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}

// PATCH: Update project status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!["active", "paused", "completed"].includes(status)) {
      return NextResponse.json({ message: "Invalid status" }, { status: 400 });
    }

    const project = await prisma.dataProject.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ message: "Project updated", project });
  } catch (error) {
    console.error("Admin update project error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}

// DELETE: Remove project and all submissions
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.dataProject.delete({ where: { id } });

    return NextResponse.json({ message: "Project deleted" });
  } catch (error) {
    console.error("Admin delete project error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
