export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;
    const userId = session.user.id;
    const body = await request.json();
    const { fileUrl, fileName, fileType, fileSizeMB, language, promptUsed, consentGiven } = body;

    if (!fileUrl || !fileName || !fileType || !fileSizeMB) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    if (!consentGiven) {
      return NextResponse.json(
        { message: "You must give consent before submitting" },
        { status: 400 }
      );
    }

    const project = await prisma.dataProject.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ message: "Project not found" }, { status: 404 });
    }

    if (project.status !== "active") {
      return NextResponse.json(
        { message: "This project is no longer accepting submissions" },
        { status: 400 }
      );
    }

    if (project.currentSubmissions >= project.maxSubmissions) {
      return NextResponse.json(
        { message: "This project has reached its submission limit" },
        { status: 400 }
      );
    }

    // Validate file format
    const acceptedFormats: string[] = JSON.parse(project.acceptedFormats);
    const fileExt = fileName.split(".").pop()?.toLowerCase() || "";
    
    // Always accept webm for voice projects (browser recordings use webm)
    const isVoiceProject = project.projectType === "voice";
    const isWebmFile = fileExt === "webm";
    const isCallRecording = promptUsed?.toLowerCase().includes("call recording") || promptUsed?.toLowerCase().includes("live call");
    
    if (!acceptedFormats.includes(fileExt) && !(isVoiceProject && isWebmFile) && !isCallRecording) {
      return NextResponse.json(
        { message: `File format .${fileExt} is not accepted. Allowed: ${acceptedFormats.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (fileSizeMB > project.maxFileSizeMB) {
      return NextResponse.json(
        { message: `File size ${fileSizeMB.toFixed(1)}MB exceeds limit of ${project.maxFileSizeMB}MB` },
        { status: 400 }
      );
    }

    // Check if user already submitted
    const existing = await prisma.dataSubmission.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (existing) {
      // Allow re-submission if the previous one was rejected
      if (existing.status === "rejected") {
        // Delete the old rejected submission to allow a fresh one
        await prisma.dataSubmission.delete({
          where: { id: existing.id },
        });
      } else {
        return NextResponse.json(
          { message: "You have already submitted to this project" },
          { status: 400 }
        );
      }
    }

    const submission = await prisma.dataSubmission.create({
      data: {
        projectId,
        userId,
        fileUrl,
        fileName,
        fileType,
        fileSizeMB,
        language: language || null,
        promptUsed: promptUsed || null,
        consentGiven: true,
        consentGivenAt: new Date(),
        status: "pending",
      },
    });

    return NextResponse.json({
      message: "Submission received! Your recording is under review.",
      submissionId: submission.id,
    });
  } catch (error) {
    console.error("Data submission error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
