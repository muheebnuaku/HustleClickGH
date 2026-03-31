import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { downloadAndReuploadRecording } from "@/lib/recording-share";
import { logActivity } from "@/lib/activity-log";

// GET /api/call-recordings — list current user's recordings (newest first)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, parseInt(searchParams.get("page")  || "1"));
  const limit = Math.min(50, parseInt(searchParams.get("limit") || "20"));
  const skip  = (page - 1) * limit;

  const [recordings, total] = await Promise.all([
    prisma.callRecording.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.callRecording.count({ where: { userId: session.user.id } }),
  ]);

  return NextResponse.json({ recordings, total, page, pages: Math.ceil(total / limit) });
}

// POST /api/call-recordings — save a recording entry after upload
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { callCode, fileUrl, duration, callType, otherName, fileSize } = body;

  if (!fileUrl) return NextResponse.json({ error: "fileUrl required" }, { status: 400 });

  const recording = await prisma.callRecording.create({
    data: {
      callCode:  callCode  || "",
      userId:    session.user.id,
      fileUrl,
      duration:  typeof duration === "number" ? Math.round(duration) : 0,
      callType:  callType  || "audio",
      otherName: otherName || null,
      fileSize:  typeof fileSize === "number" ? fileSize : null,
    },
  });

  // Attempt to auto-share with call partner if durations are within ±30 seconds
  if (callCode) {
    (async () => {
      try {
        const otherRecording = await prisma.callRecording.findFirst({
          where: {
            callCode,
            userId: { not: session.user.id },
          },
          orderBy: { createdAt: "desc" },
          include: { user: { select: { fullName: true } } },
        });

        if (!otherRecording) return; // Partner hasn't uploaded yet

        const durationDiff = Math.abs(recording.duration - otherRecording.duration);

        // Only auto-share if durations are within ±30 seconds
        if (durationDiff > 30) return;

        // Download and re-upload the longest recording
        const longestRecording = recording.duration >= otherRecording.duration ? recording : otherRecording;
        const shorterRecording = longestRecording.id === recording.id ? otherRecording : recording;
        const recipientUserId = longestRecording.userId === session.user.id ? otherRecording.userId : session.user.id;

        const ext = longestRecording.fileUrl.includes(".")
          ? longestRecording.fileUrl.slice(longestRecording.fileUrl.lastIndexOf("."))
          : ".webm";
        const fileName = `call-${callCode}-shared${ext}`;

        const sharedFileUrl = await downloadAndReuploadRecording(
          longestRecording.fileUrl,
          fileName,
        );

        // Create a copy of the longest recording for the other user
        await prisma.callRecording.create({
          data: {
            callCode,
            userId: recipientUserId,
            duration: longestRecording.duration,
            fileUrl: sharedFileUrl,
            callType: longestRecording.callType,
            otherName: longestRecording.otherName,
            fileSize: longestRecording.fileSize,
            shareFromRecordingId: longestRecording.id,
          },
        });

        // Log the successful share
        logActivity({
          type: "recording_shared",
          userId: recipientUserId,
          severity: "info",
          metadata: {
            callCode,
            sharedByUserId: longestRecording.userId,
            duration: longestRecording.duration,
            durationDiff,
          },
        }).catch(() => {});
      } catch (err) {
        // Log error but don't fail the original upload
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        logActivity({
          type: "recording_share_failed",
          userId: session.user.id,
          severity: "warning",
          metadata: {
            callCode,
            error: errorMsg,
          },
        }).catch(() => {});
      }
    })();
  }

  return NextResponse.json({ recording }, { status: 201 });
}
