export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Should this user be asked for their location? (admin-triggered + still missing)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { country: true, region: true, city: true, locationRequested: true },
  });

  const shouldPrompt = Boolean(user?.locationRequested && !user?.country?.trim());
  return NextResponse.json({ shouldPrompt, location: user });
}

// Save the user's location and clear the admin prompt flag.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { country, region, city } = await request.json();
    if (!country?.trim() || !region?.trim() || !city?.trim()) {
      return NextResponse.json({ message: "Country, region and city are required" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        country: String(country).trim(),
        region: String(region).trim(),
        city: String(city).trim(),
        locationRequested: false,
      },
    });

    return NextResponse.json({ message: "Location saved" });
  } catch (error) {
    console.error("Location save error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
