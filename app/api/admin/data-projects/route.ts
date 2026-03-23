export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET: All projects with submission counts
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const projects = await prisma.dataProject.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    });

    // Count by status for each project
    const projectsWithStats = await Promise.all(
      projects.map(async (p) => {
        const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
          prisma.dataSubmission.count({ where: { projectId: p.id, status: "pending" } }),
          prisma.dataSubmission.count({ where: { projectId: p.id, status: "approved" } }),
          prisma.dataSubmission.count({ where: { projectId: p.id, status: "rejected" } }),
        ]);
        return {
          ...p,
          samplePrompts: p.samplePrompts ? JSON.parse(p.samplePrompts) : [],
          languages: p.languages ? JSON.parse(p.languages) : [],
          acceptedFormats: JSON.parse(p.acceptedFormats),
          pendingCount,
          approvedCount,
          rejectedCount,
          totalSubmissions: p._count.submissions,
        };
      })
    );

    return NextResponse.json({ projects: projectsWithStats });
  } catch (error) {
    console.error("Admin data projects fetch error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}

// POST: Create new project
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      projectType,
      instructions,
      samplePrompts,
      sampleVideoUrl,
      reward,
      maxSubmissions,
      languages,
      minDurationSecs,
      maxDurationSecs,
      maxFileSizeMB,
      acceptedFormats,
      expiresAt,
      audioSampleRate,
      audioChannels,
      audioBitDepth,
      recordingType,
      malesNeeded,
      femalesNeeded,
    } = body;

    if (!title || !description || !projectType || !instructions || !reward || !maxSubmissions || !acceptedFormats) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    const project = await prisma.dataProject.create({
      data: {
        title,
        description,
        projectType,
        instructions,
        samplePrompts: samplePrompts?.length ? JSON.stringify(samplePrompts) : null,
        sampleVideoUrl: sampleVideoUrl || null,
        reward: parseFloat(reward),
        maxSubmissions: parseInt(maxSubmissions),
        languages: languages?.length ? JSON.stringify(languages) : null,
        minDurationSecs: minDurationSecs ? parseInt(minDurationSecs) : 3,
        maxDurationSecs: maxDurationSecs ? parseInt(maxDurationSecs) : 60,
        maxFileSizeMB: maxFileSizeMB ? parseInt(maxFileSizeMB) : 25,
        acceptedFormats: JSON.stringify(acceptedFormats),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        audioSampleRate: audioSampleRate ? parseInt(audioSampleRate) : null,
        audioChannels: audioChannels ? parseInt(audioChannels) : null,
        audioBitDepth: audioBitDepth ? parseInt(audioBitDepth) : null,
        recordingType: recordingType || null,
        malesNeeded: malesNeeded ? parseInt(malesNeeded) : null,
        femalesNeeded: femalesNeeded ? parseInt(femalesNeeded) : null,
        createdBy: session.user.id,
      },
    });

    return NextResponse.json({ message: "Project created successfully", project });
  } catch (error) {
    console.error("Admin create project error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
