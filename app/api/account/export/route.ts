export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";

// Data-subject access request: returns the logged-in user's own data as a JSON download.
// The raw (encrypted) ID number is intentionally excluded — only the masked last 4 digits
// are included, since the export is a copy the user downloads.
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        consentRecords: true,
        dataSubmissions: { select: { id: true, projectId: true, status: true, language: true, gender: true, submittedAt: true } },
        surveyResponses: { select: { id: true, surveyId: true, submittedAt: true } },
        withdrawals: true,
        referrals: { select: { id: true, referredId: true, earned: true, createdAt: true } },
        callRecordings: { select: { id: true, callCode: true, duration: true, createdAt: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    // Strip secrets / internal auth material from the export.
    const {
      password: _password,
      idNumber: _idNumber,
      ...safeUser
    } = user;
    void _password;
    void _idNumber;

    const exportData = {
      exportedAt: new Date().toISOString(),
      account: {
        ...safeUser,
        idNumber: user.idNumberLast4 ? `•••••${user.idNumberLast4}` : null,
      },
    };

    logActivity({
      type: "account_export",
      userId: session.user.id,
      userName: session.user.name,
      severity: "info",
      ip: getIp(request),
    });

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="hustleclickgh-data-${user.userId}.json"`,
      },
    });
  } catch (error) {
    console.error("Account export error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
