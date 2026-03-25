import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET /api/admin/call-recordings — all recordings (admin only)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page     = Math.max(1, parseInt(searchParams.get("page")     || "1"));
  const limit    = Math.min(50, parseInt(searchParams.get("limit")    || "25"));
  const search   = searchParams.get("search") || "";
  const callType = searchParams.get("callType") || "";
  const skip     = (page - 1) * limit;

  const where = {
    ...(callType && { callType }),
    ...(search && {
      OR: [
        { otherName:  { contains: search, mode: "insensitive" as const } },
        { callCode:   { contains: search, mode: "insensitive" as const } },
        { user: { fullName: { contains: search, mode: "insensitive" as const } } },
      ],
    }),
  };

  const [recordings, total] = await Promise.all([
    prisma.callRecording.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { user: { select: { fullName: true, userId: true } } },
    }),
    prisma.callRecording.count({ where }),
  ]);

  return NextResponse.json({ recordings, total, page, pages: Math.ceil(total / limit) });
}
