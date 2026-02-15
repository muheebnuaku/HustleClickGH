export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Get user's completed surveys
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get all surveys the user has completed
    const completedResponses = await prisma.surveyResponse.findMany({
      where: {
        userId: userId,
      },
      include: {
        survey: {
          select: {
            id: true,
            title: true,
            description: true,
            reward: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    const completedSurveys = completedResponses.map((response) => ({
      id: response.survey.id,
      title: response.survey.title,
      description: response.survey.description,
      reward: response.survey.reward,
      completedAt: response.submittedAt,
      rewarded: response.rewarded,
    }));

    return NextResponse.json({ 
      completedSurveys,
      count: completedSurveys.length,
    });
  } catch (error) {
    console.error("Completed surveys fetch error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
