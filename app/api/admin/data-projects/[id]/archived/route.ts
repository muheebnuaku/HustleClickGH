export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET: durable participation records for deleted submissions on this project.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }
  const { id: projectId } = await params;
  const records = await prisma.contributionRecord.findMany({
    where: { projectId },
    orderBy: { archivedAt: "desc" },
    take: 500,
  });
  return NextResponse.json({ records });
}
