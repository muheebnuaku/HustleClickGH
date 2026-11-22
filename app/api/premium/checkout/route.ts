export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { PremiumInputError, startPaystackCheckout } from "@/lib/premium";

// Start a Paystack checkout for Premium; the browser is sent to the returned URL.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true } });
    if (!user?.email) return NextResponse.json({ message: "Add an e-mail address to your account first." }, { status: 400 });
    return NextResponse.json(await startPaystackCheckout(user));
  } catch (error) {
    if (error instanceof PremiumInputError) return NextResponse.json({ message: error.message }, { status: 400 });
    console.error("Premium checkout failed:", error);
    return NextResponse.json({ message: "Could not start the payment. Please try again." }, { status: 502 });
  }
}
