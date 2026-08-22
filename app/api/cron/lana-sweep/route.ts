export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkForBouncedWelcomeEmails } from "@/lib/email-bounce-check";
import { deleteUnonboardedAccounts, scanLoginFailurePatterns } from "@/lib/lana";

// Daily sweep (see vercel.json) for patterns only visible in aggregate — a
// referral "ring" can look fine account-by-account (each referral passes the
// registration-time check) but stand out once you look at a referrer's whole
// downstream. Deliberately heuristic/no AI call here to keep this cheap to
// run broadly; Lana's chat can reason over any case in more depth on demand.
const MIN_REFERRALS = 3;
const FLAGGED_RATIO_THRESHOLD = 0.5;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  const referrers = await prisma.user.findMany({
    where: { role: "user" },
    select: {
      id: true,
      fullName: true,
      userId: true,
      referrals: { select: { referred: { select: { fraudRiskScore: true, status: true } } } },
    },
  });

  let created = 0;
  for (const r of referrers) {
    if (r.referrals.length < MIN_REFERRALS) continue;
    const flagged = r.referrals.filter((x) => x.referred.fraudRiskScore != null || x.referred.status === "suspended").length;
    const ratio = flagged / r.referrals.length;
    if (ratio < FLAGGED_RATIO_THRESHOLD) continue;

    const existing = await prisma.lanaCase.findFirst({
      where: { subjectUserId: r.id, type: "referral_farming", status: { in: ["open", "auto_actioned"] } },
    });
    if (existing) continue;

    await prisma.lanaCase.create({
      data: {
        type: "referral_farming",
        subjectUserId: r.id,
        relatedUserIds: "[]",
        riskScore: Math.round(ratio * 100),
        summary: `${r.fullName} (${r.userId}) has ${flagged}/${r.referrals.length} referred accounts flagged`,
        reasoning: `${(ratio * 100).toFixed(0)}% of the accounts this user referred are themselves flagged as likely duplicates or suspended — consistent with a referral-farming ring rather than organic growth. Found in the daily sweep.`,
        proposedAction: "investigate",
      },
    });
    created++;
  }

  const bounceCheck = await checkForBouncedWelcomeEmails().catch((err) => {
    console.error("[lana-sweep] bounce check failed:", err);
    return { checked: 0, bouncesFound: 0, skipped: "threw" };
  });

  // Runs at most once a day (Hobby-plan cron cadence), so an account is
  // actually removed anywhere from 24-48h after registering, not exactly
  // at the 24h mark — a reasonable trade-off for a cleanup job, not a
  // security boundary.
  const unonboardedCleanup = await deleteUnonboardedAccounts().catch((err) => {
    console.error("[lana-sweep] unonboarded cleanup failed:", err);
    return { checked: 0, deleted: 0 };
  });

  const loginActivity = await scanLoginFailurePatterns().catch((err) => {
    console.error("[lana-sweep] login-failure scan failed:", err);
    return { accountsChecked: 0, casesCreated: 0 };
  });

  return NextResponse.json({ scanned: referrers.length, casesCreated: created, bounceCheck, unonboardedCleanup, loginActivity });
}
