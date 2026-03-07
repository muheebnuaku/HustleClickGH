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
    const { projectId, offer, usePersonalCode } = body;

    if (!offer) {
      return NextResponse.json({ message: "offer is required" }, { status: 400 });
    }

    // Determine the call code to use
    let callCode: string;
    
    if (usePersonalCode) {
      // Use user's personal call code
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { personalCallCode: true },
      });
      
      if (!user?.personalCallCode) {
        // Generate one if it doesn't exist
        callCode = nanoid(5).toUpperCase();
        await prisma.user.update({
          where: { id: session.user.id },
          data: { personalCallCode: callCode },
        });
      } else {
        callCode = user.personalCallCode;
      }
      
      // Delete any existing waiting sessions with this personal code
      await prisma.callSession.deleteMany({
        where: { callCode, status: "waiting" },
      });
    } else {
      // Generate a random code for project-specific calls
      callCode = nanoid(8).toUpperCase();
      
      if (projectId) {
        // Clean up any previous waiting sessions from this user for this project
        await prisma.callSession.deleteMany({
          where: { initiatorId: session.user.id, projectId, status: "waiting" },
        });
      }
    }

    const callSession = await prisma.callSession.create({
      data: {
        callCode,
        projectId: projectId || null,
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
