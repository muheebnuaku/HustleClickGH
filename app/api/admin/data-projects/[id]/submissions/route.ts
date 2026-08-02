export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getContributorQuality } from "@/lib/reputation";

// GET: All submissions for a project
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id: projectId } = await params;

    const submissions = await prisma.dataSubmission.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, userId: true, fullName: true, email: true, phone: true },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    // Contributor reputation (approval rate) as a reviewer signal.
    const userIds = Array.from(new Set(submissions.map((s) => s.userId)));
    const quality = await getContributorQuality(userIds);
    const enriched = submissions.map((s) => ({ ...s, contributorQuality: quality.get(s.userId) ?? null }));

    return NextResponse.json({ submissions: enriched });
  } catch (error) {
    console.error("Admin submissions fetch error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
