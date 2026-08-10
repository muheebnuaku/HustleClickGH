export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";
import { VELOCITY_WINDOW_MS, VELOCITY_MAX } from "@/lib/anti-fraud";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    // Block users suspended after they logged in (JWT sessions stay valid).
    if (session.user.status === "suspended") {
      return NextResponse.json({ message: "Your account has been suspended." }, { status: 403 });
    }

    const { id: projectId } = await params;
    const userId = session.user.id;
    const body = await request.json();
    const { files: filesInput, fileUrl, fileName, fileType, fileSizeMB, language, promptUsed, consentGiven, gender } = body;

    // A submission can hold several files (one user's full set). New clients send
    // `files: [{fileUrl,fileName,fileType,fileSizeMB}, …]`; older single-file
    // callers send the flat fields — normalize both to one array.
    type SubFile = { fileUrl: string; fileName: string; fileType: string; fileSizeMB: number; meta?: unknown; fileHash?: string };
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

    // Run the independent gate counts in parallel — fewer DB round-trips under
    // load (hundreds of concurrent submissions).
    const [recentCount, userSubmissionCount] = await Promise.all([
      // Velocity — throttle rapid-fire submissions (reward farming).
      prisma.dataSubmission.count({
        where: { userId, submittedAt: { gte: new Date(Date.now() - VELOCITY_WINDOW_MS) } },
      }),
      // Per-user limit — count only non-rejected (rejected can be retried).
      prisma.dataSubmission.count({
        where: { projectId, userId, status: { in: ["pending", "approved"] } },
      }),
    ]);

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

    // Managers are exempt from the project's per-user limit — their cap is set
    // per-manager by an admin (null = unlimited).
    let maxPerUser: number | null;
    if (session.user.role === "manager") {
      const mgr = await prisma.user.findUnique({ where: { id: userId }, select: { managerSubmitLimit: true } });
      maxPerUser = mgr?.managerSubmitLimit ?? null; // null → unlimited
    } else {
      maxPerUser = project.maxSubmissionsPerUser ?? 1;
    }
    if (maxPerUser !== null && userSubmissionCount >= maxPerUser) {
      const times = maxPerUser === 1 ? "once" : maxPerUser === 2 ? "twice" : `${maxPerUser} times`;
      return NextResponse.json(
        { message: `You've reached your submission limit — you can only submit ${times} to this project.` },
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

    // Enforce the project's files-per-submission limit.
    const maxFiles = project.maxFilesPerSubmission ?? 1;
    if (filesArr.length > maxFiles) {
      return NextResponse.json(
        { message: `This project allows at most ${maxFiles} file${maxFiles === 1 ? "" : "s"} per submission.` },
        { status: 400 }
      );
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
      // 0 / blank = no project size limit (files still bounded by storage).
      if (!isCallRecording && project.maxFileSizeMB > 0 && f.fileSizeMB > project.maxFileSizeMB) {
        return NextResponse.json(
          { message: `File "${f.fileName}" (${f.fileSizeMB.toFixed(1)}MB) exceeds the ${project.maxFileSizeMB}MB limit` },
          { status: 400 }
        );
      }
    }

    // Clean up any prior REJECTED submissions so they don't clutter the user's
    // history when they retry. Non-rejected ones are kept and counted toward the
    // per-user limit (already enforced above).
    await prisma.dataSubmission.deleteMany({
      where: { projectId, userId, status: "rejected" },
    });

    // Duplicate-content detection using the hash the browser computed (sent with
    // the submission). This avoids re-downloading the file server-side, keeping
    // the endpoint thin under load. Reject if the same content was already
    // submitted to this project (by anyone) and not rejected.
    const fileHash = typeof primary.fileHash === "string" && primary.fileHash ? primary.fileHash : null;
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
          filesArr.map((f) => ({ url: f.fileUrl, name: f.fileName, type: f.fileType, sizeMB: f.fileSizeMB, meta: f.meta ?? null, hash: f.fileHash ?? null }))
        ),
        durationSecs:
          primary.meta && typeof primary.meta === "object" && "durationSecs" in primary.meta
            ? (primary.meta as { durationSecs?: number }).durationSecs ?? null
            : null,
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
