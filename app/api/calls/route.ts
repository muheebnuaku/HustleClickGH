export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

// POST: Initiator creates a call session, stores SDP offer
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, offer } = body;

    if (!projectId || !offer) {
      return NextResponse.json({ message: "projectId and offer are required" }, { status: 400 });
    }

    // Clean up any previous waiting sessions from this user for this project
    await prisma.callSession.deleteMany({
      where: { initiatorId: session.user.id, projectId, status: "waiting" },
    });

    const callCode = nanoid(8).toUpperCase();

    const callSession = await prisma.callSession.create({
      data: {
        callCode,
        projectId,
        initiatorId: session.user.id,
        offer: JSON.stringify(offer),
        status: "waiting",
      },
    });

    return NextResponse.json({ callCode: callSession.callCode });
  } catch (error) {
    console.error("Create call error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
