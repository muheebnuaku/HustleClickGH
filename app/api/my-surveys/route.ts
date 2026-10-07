export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET - List user's surveys
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const surveys = await prisma.survey.findMany({
      where: {
        createdBy: session.user.id,
        surveyType: "user",
      },
      include: {
        questions: true,
        _count: {
          select: { responses: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(surveys);
  } catch (error) {
    console.error("Error fetching user surveys:", error);
    return NextResponse.json({ error: "Failed to fetch surveys" }, { status: 500 });
  }
}

// POST - Create a new survey
// POST — creating your own surveys has been retired (existing ones are kept).
export async function POST() {
  return NextResponse.json({ error: "Creating surveys is no longer available." }, { status: 410 });
}
