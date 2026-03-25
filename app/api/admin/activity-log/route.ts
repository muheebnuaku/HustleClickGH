export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/activity-log
 * Returns paginated activity log entries for the admin activity log page.
 * Query params: page, limit, type, severity, userId, search
 */
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const page     = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"));
    const limit    = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50"));
    const type     = url.searchParams.get("type") ?? undefined;
    const severity = url.searchParams.get("severity") ?? undefined;
    const userId   = url.searchParams.get("userId") ?? undefined;
    const search   = url.searchParams.get("search") ?? undefined;

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};
    if (type)     where.type     = type;
    if (severity) where.severity = severity;
    if (userId)   where.userId   = userId;
    if (search) {
      where.OR = [
        { userName: { contains: search, mode: "insensitive" } },
        { type:     { contains: search, mode: "insensitive" } },
        { metadata: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      logs: logs.map(l => ({
        ...l,
        metadata: l.metadata ? JSON.parse(l.metadata) : null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Activity log fetch error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
