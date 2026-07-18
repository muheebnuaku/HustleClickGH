export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// List the logged-in user's enrolled passkeys/biometrics.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: session.user.id },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ credentials });
}

// Remove one of the user's passkeys.
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });

  // Scope delete to the current user so one user can't remove another's key.
  await prisma.webAuthnCredential.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ message: "Removed" });
}
