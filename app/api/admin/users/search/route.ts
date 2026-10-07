export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET ?q= — quick people lookup for pickers (appoint a leader, add to a team).
// Matches User ID, name, email or phone; returns the top few.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ users: [] });
  const digits = q.replace(/\D/g, "");

  const users = await prisma.user.findMany({
    where: {
      role: { in: ["user", "manager"] },
      OR: [
        { userId: { startsWith: q.toUpperCase() } },
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q.toLowerCase() } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-9) } }] : []),
      ],
    },
    select: { id: true, userId: true, fullName: true, email: true, phone: true, country: true, region: true, city: true, status: true, leaderRole: true, leaderAlsoSupervisor: true, teamLeaderId: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return NextResponse.json({ users });
}
