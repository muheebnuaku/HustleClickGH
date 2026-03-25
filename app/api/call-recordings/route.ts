import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

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

  return NextResponse.json({ recording }, { status: 201 });
}
