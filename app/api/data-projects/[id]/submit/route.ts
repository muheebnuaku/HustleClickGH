export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";
import { hashFileFromUrl, VELOCITY_WINDOW_MS, VELOCITY_MAX } from "@/lib/anti-fraud";

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
    const { files: filesInput, fileUrl, fileName, fileType, fileSizeMB, language, promptUsed, consentGiven, gender } = body;

    // A submission can hold several files (one user's full set). New clients send
    // `files: [{fileUrl,fileName,fileType,fileSizeMB}, …]`; older single-file
    // callers send the flat fields — normalize both to one array.
    type SubFile = { fileUrl: string; fileName: string; fileType: string; fileSizeMB: number };
    const filesArr: SubFile[] =
      Array.isArray(filesInput) && filesInput.length
        ? filesInput
        : fileUrl && fileName
        ? [{ fileUrl, fileName, fileType, fileSizeMB }]
        : [];

    if (!filesArr.length || filesArr.some((f) => !f.fileUrl || !f.fileName || !f.fileType || !f.fileSizeMB)) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }
    const primary = filesArr[0];

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

    // Velocity limit — throttle rapid-fire submissions (reward farming).
    const recentCount = await prisma.dataSubmission.count({
      where: { userId, submittedAt: { gte: new Date(Date.now() - VELOCITY_WINDOW_MS) } },
    });
    if (recentCount >= VELOCITY_MAX) {
      return NextResponse.json(
        { message: "You're submitting too quickly. Please try again later." },
        { status: 429 }
      );
    }

    if (project.currentSubmissions >= project.maxSubmissions) {
      return NextResponse.json(
        { message: "This project has reached its submission limit" },
        { status: 400 }
      );
    }

    // Per-user submission limit
    const userSubmissionCount = await prisma.dataSubmission.count({
      where: { projectId, userId },
    });
    const maxPerUser = project.maxSubmissionsPerUser ?? 1;
    if (userSubmissionCount >= maxPerUser) {
      const times = maxPerUser === 1 ? "once" : maxPerUser === 2 ? "twice" : `${maxPerUser} times`;
      return NextResponse.json(
        { message: `You can only submit ${times} to this project` },
        { status: 400 }
      );
    }

    // Gender quota validation
    if (project.malesNeeded !== null || project.femalesNeeded !== null) {
      if (!gender || !["male", "female"].includes(gender)) {
        return NextResponse.json(
          { message: "Please select your gender to submit to this project" },
          { status: 400 }
        );
      }
      if (gender === "male" && project.malesNeeded !== null) {
        const maleCount = await prisma.dataSubmission.count({
          where: { projectId, gender: "male", status: { in: ["pending", "approved"] } },
        });
        if (maleCount >= project.malesNeeded) {
          return NextResponse.json(
            { message: "All male slots for this project are filled. Only female submissions are accepted now." },
            { status: 400 }
          );
        }
      }
      if (gender === "female" && project.femalesNeeded !== null) {
        const femaleCount = await prisma.dataSubmission.count({
          where: { projectId, gender: "female", status: { in: ["pending", "approved"] } },
        });
        if (femaleCount >= project.femalesNeeded) {
          return NextResponse.json(
            { message: "All female slots for this project are filled. Only male submissions are accepted now." },
            { status: 400 }
          );
        }
      }
    }

    // Validate every file's format and size.
    const acceptedFormats: string[] = JSON.parse(project.acceptedFormats);
    const isVoiceProject = project.projectType === "voice";
    // Live call recordings are exempt from format/size checks (webm, can be large).
    const isCallRecording = promptUsed?.toLowerCase().includes("call recording") || promptUsed?.toLowerCase().includes("live call");

    for (const f of filesArr) {
      const ext = f.fileName.split(".").pop()?.toLowerCase() || "";
      const isWebmFile = ext === "webm";
      if (!acceptedFormats.includes(ext) && !(isVoiceProject && isWebmFile) && !isCallRecording) {
        return NextResponse.json(
          { message: `File "${f.fileName}" (.${ext}) is not accepted. Allowed: ${acceptedFormats.join(", ")}` },
          { status: 400 }
        );
      }
      if (!isCallRecording && f.fileSizeMB > project.maxFileSizeMB) {
        return NextResponse.json(
          { message: `File "${f.fileName}" (${f.fileSizeMB.toFixed(1)}MB) exceeds the ${project.maxFileSizeMB}MB limit` },
          { status: 400 }
        );
      }
    }

    // Check if user already submitted
    const existing = await prisma.dataSubmission.findFirst({
      where: { projectId, userId },
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

    // Duplicate-content detection: hash the primary file and reject if the same
    // content was already submitted to this project (by anyone) and not rejected.
    const fileHash = await hashFileFromUrl(primary.fileUrl, request.url, Number(primary.fileSizeMB));
    if (fileHash) {
      const dup = await prisma.dataSubmission.findFirst({
        where: { projectId, fileHash, status: { in: ["pending", "approved"] } },
        select: { id: true, userId: true },
      });
      if (dup) {
        logActivity({
          type: "submission",
          userId,
          userName: session.user.name ?? null,
          severity: "warning",
          metadata: { projectId, reason: "duplicate_content", matchedSubmission: dup.id, sameUser: dup.userId === userId },
          ip: getIp(request),
        });
        return NextResponse.json(
          { message: "This exact recording has already been submitted. Please record a new one." },
          { status: 409 }
        );
      }
    }

    const submission = await prisma.dataSubmission.create({
      data: {
        projectId,
        userId,
        // Primary file mirrors files[0] for back-compat with single-file views.
        fileUrl: primary.fileUrl,
        fileName: primary.fileName,
        fileType: primary.fileType,
        fileSizeMB: primary.fileSizeMB,
        fileHash,
        files: JSON.stringify(
          filesArr.map((f) => ({ url: f.fileUrl, name: f.fileName, type: f.fileType, sizeMB: f.fileSizeMB }))
        ),
        language: language || null,
        promptUsed: promptUsed || null,
        gender: gender || null,
        consentGiven: true,
        consentGivenAt: new Date(),
        status: "pending",
      },
    });

    logActivity({
      type: "submission",
      userId,
      userName: session.user.name ?? null,
      severity: "success",
      metadata: {
        submissionId: submission.id,
        projectId,
        projectTitle: project.title,
        fileName: primary.fileName,
        fileType: primary.fileType,
        fileSizeMB: primary.fileSizeMB,
        fileCount: filesArr.length,
        language: language || null,
        gender: gender || null,
      },
      ip: getIp(request),
    });

    const n = filesArr.length;
    return NextResponse.json({
      message: `Submission received! Your ${n === 1 ? "recording is" : `${n} files are`} under review.`,
      submissionId: submission.id,
    });
  } catch (error) {
    console.error("Data submission error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
