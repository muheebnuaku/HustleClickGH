export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { reverseGeocode } from "@/lib/reverse-geocode";
import { logActivity, getIp } from "@/lib/activity-log";

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

// Coarser than this and it isn't really the device's own position.
const MAX_ACCURACY_M = 50_000;

// Save the user's location from DEVICE GPS only: the browser sends coordinates,
// the server works out country/region/city. Typed locations are not accepted,
// so project location targeting can't be dodged by editing a text field.
// (POST and PUT behave the same; POST kept for older clients.)
async function saveFromDevice(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { lat, lng, accuracy } = await request.json().catch(() => ({}));
    if (
      typeof lat !== "number" || typeof lng !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) {
      return NextResponse.json({ message: "Use your device's current location to update this." }, { status: 400 });
    }
    if (typeof accuracy === "number" && accuracy > MAX_ACCURACY_M) {
      return NextResponse.json({ message: "Your location is too imprecise. Turn on GPS / location services and try again." }, { status: 400 });
    }

    const place = await reverseGeocode(lat, lng);
    if (!place) {
      return NextResponse.json({ message: "Couldn't work out where you are right now. Please try again in a moment." }, { status: 502 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { country: place.country, region: place.region, city: place.city, locationRequested: false },
    });

    logActivity({
      type: "location_update",
      userId: session.user.id,
      userName: session.user.name ?? null,
      metadata: { ...place, accuracyM: typeof accuracy === "number" ? Math.round(accuracy) : null },
      ip: getIp(request),
    });

    return NextResponse.json({ message: "Location updated", location: place });
  } catch (error) {
    console.error("Location save error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}

export const POST = saveFromDevice;
export const PUT = saveFromDevice;
