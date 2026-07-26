export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { currentOrg } from "@/lib/org-auth";

// GET /api/org/me — the signed-in organization's profile + wallet + first-login flag.
export async function GET() {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  return NextResponse.json({
    org: {
      id: org.id,
      name: org.name,
      workEmail: org.workEmail,
      phone: org.phone,
      country: org.country,
      walletBalance: org.walletBalance,
      mustSetPassword: org.mustSetPassword,
    },
  });
}
