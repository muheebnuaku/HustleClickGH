import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { deleteUserAccount } from "@/lib/user-deletion";
import type { DuplicateRiskResult } from "@/lib/fraud-check";

// ---------------------------------------------------------------------------
// Lana — the admin trust & safety agent.
//
// Autonomy policy (deliberately narrow): Lana may ONLY act on her own when
// auto-suspending a brand-new signup she's highly confident (riskScore >= 85)
// is a duplicate account — always reversible, always logged, always reported.
// Nothing involving money, and no permanent action (deleting an account),
// ever happens without an admin explicitly approving it via a LanaCase.
// ---------------------------------------------------------------------------

const AUTO_SUSPEND_THRESHOLD = 85;
const LANA_MODEL = "gpt-4o-mini";

// --- Registration -----------------------------------------------------------

export async function evaluateRegistration(user: { id: string; fullName: string; userId: string }, duplicateRisk: DuplicateRiskResult) {
  if (!duplicateRisk.flagged) return;

  const highConfidence = duplicateRisk.riskScore >= AUTO_SUSPEND_THRESHOLD;

  const kase = await prisma.lanaCase.create({
    data: {
      type: "duplicate_account",
      subjectUserId: user.id,
      relatedUserIds: JSON.stringify(duplicateRisk.suspectedDuplicateOfUserId ? [duplicateRisk.suspectedDuplicateOfUserId] : []),
      riskScore: duplicateRisk.riskScore,
      summary: `${user.fullName} (${user.userId}) looks like a possible duplicate account`,
      reasoning: duplicateRisk.reason ?? "Flagged by the duplicate-account heuristic.",
      proposedAction: "suspend",
      status: highConfidence ? "auto_actioned" : "open",
      autoActionTaken: highConfidence ? "suspended" : null,
    },
  });

  if (highConfidence) {
    await prisma.user.update({ where: { id: user.id }, data: { status: "suspended" } });
    await logActivity({
      type: "lana_auto_action",
      userId: user.id,
      userName: user.fullName,
      severity: "warning",
      metadata: { userId: user.userId, action: "suspended", caseId: kase.id, riskScore: duplicateRisk.riskScore, reason: duplicateRisk.reason },
    });
  }
}

// --- Withdrawals --------------------------------------------------------------

interface EarningsBreakdown {
  totalEarned: number;
  balance: number;
  approvedSurveyEarnings: number;
  approvedDataSubmissionEarnings: number;
  referralEarnings: number;
  referralCount: number;
  flaggedReferredCount: number; // how many people they referred are themselves flagged/suspended
  isFlagged: boolean; // is this user themselves flagged
  referrerFlagged: boolean; // is whoever referred THEM flagged/suspended
}

async function getUserEarningsBreakdown(userId: string): Promise<EarningsBreakdown> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true, totalEarned: true, fraudRiskScore: true, referredBy: true },
  });
  if (!user) throw new Error("User not found");

  const [surveyResponses, dataSubmissions, referralsGiven, referredUsers] = await Promise.all([
    prisma.surveyResponse.findMany({
      where: { userId, rewarded: true },
      select: { survey: { select: { reward: true } } },
    }),
    prisma.dataSubmission.findMany({
      where: { userId, status: "approved", rewarded: true },
      select: { project: { select: { reward: true } } },
    }),
    prisma.referral.findMany({ where: { referrerId: userId }, select: { earned: true, referredId: true } }),
    prisma.user.findMany({
      where: { referredBy: userId },
      select: { fraudRiskScore: true, status: true },
    }),
  ]);

  const referrer = user.referredBy
    ? await prisma.user.findUnique({ where: { id: user.referredBy }, select: { fraudRiskScore: true, status: true } })
    : null;

  return {
    totalEarned: user.totalEarned,
    balance: user.balance,
    approvedSurveyEarnings: surveyResponses.reduce((s, r) => s + r.survey.reward, 0),
    approvedDataSubmissionEarnings: dataSubmissions.reduce((s, d) => s + d.project.reward, 0),
    referralEarnings: referralsGiven.reduce((s, r) => s + r.earned, 0),
    referralCount: referralsGiven.length,
    flaggedReferredCount: referredUsers.filter((u) => u.fraudRiskScore != null || u.status === "suspended").length,
    isFlagged: user.fraudRiskScore != null,
    referrerFlagged: Boolean(referrer && (referrer.fraudRiskScore != null || referrer.status === "suspended")),
  };
}

export async function evaluateWithdrawal(withdrawal: { id: string; userId: string; amount: number }, user: { fullName: string; userId: string }) {
  const breakdown = await getUserEarningsBreakdown(withdrawal.userId);

  // Cheap pre-filter — only bother Lana (and spend an AI call) when there's
  // an actual signal, so routine legitimate withdrawals never surface at all.
  const referralShare = breakdown.totalEarned > 0 ? breakdown.referralEarnings / breakdown.totalEarned : 0;
  const worthChecking =
    breakdown.isFlagged ||
    breakdown.referrerFlagged ||
    breakdown.flaggedReferredCount > 0 ||
    (referralShare > 0.4 && breakdown.referralCount >= 3);

  if (!worthChecking) return;

  if (!process.env.OPENAI_API_KEY) {
    // No AI available — fall back to a plain flag for manual review rather
    // than silently skipping a case that already tripped the pre-filter.
    await prisma.lanaCase.create({
      data: {
        type: "suspicious_withdrawal",
        subjectUserId: withdrawal.userId,
        relatedWithdrawalId: withdrawal.id,
        relatedUserIds: "[]",
        riskScore: 50,
        summary: `${user.fullName} (${user.userId}) requested GH₵${withdrawal.amount.toFixed(2)} — earnings mix looks referral-heavy`,
        reasoning: `Referral share of total earnings is ${(referralShare * 100).toFixed(0)}%, with ${breakdown.flaggedReferredCount} flagged referred account(s). AI review unavailable (no API key) — flagged by heuristic pre-filter.`,
        proposedAction: "investigate",
      },
    });
    return;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `A user on HustleClickGH (Ghana survey/reward platform) has requested a withdrawal. Assess whether their earnings look legitimate (earned by actually completing surveys/data-submission tasks) or look like referral/reward farming (earnings mostly from referral bonuses, especially via accounts already flagged as likely duplicates).

Withdrawal: GH₵${withdrawal.amount.toFixed(2)} requested by ${user.fullName} (${user.userId})

Earnings breakdown:
- Total earned (lifetime): GH₵${breakdown.totalEarned.toFixed(2)}
- Current balance: GH₵${breakdown.balance.toFixed(2)}
- From approved survey completions: GH₵${breakdown.approvedSurveyEarnings.toFixed(2)}
- From approved data-submission tasks: GH₵${breakdown.approvedDataSubmissionEarnings.toFixed(2)}
- From referral bonuses: GH₵${breakdown.referralEarnings.toFixed(2)} (${breakdown.referralCount} referrals, ${breakdown.flaggedReferredCount} of those referred accounts are themselves flagged as likely duplicates)
- This user is themselves flagged as a likely duplicate account: ${breakdown.isFlagged}
- Whoever referred this user is flagged/suspended: ${breakdown.referrerFlagged}

Respond with ONLY a JSON object, no other text:
{"suspicious": boolean, "riskScore": number (0-100), "reasoning": string (one or two short sentences an admin can act on)}`;

  try {
    const completion = await openai.chat.completions.create({
      model: LANA_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    if (!parsed.suspicious) return;

    await prisma.lanaCase.create({
      data: {
        type: "suspicious_withdrawal",
        subjectUserId: withdrawal.userId,
        relatedWithdrawalId: withdrawal.id,
        relatedUserIds: "[]",
        riskScore: Math.max(0, Math.min(100, Number(parsed.riskScore) || 50)),
        summary: `${user.fullName} (${user.userId}) requested GH₵${withdrawal.amount.toFixed(2)} — earnings look referral-farmed`,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "Flagged by AI review.",
        proposedAction: "reject_withdrawal",
      },
    });
  } catch (err) {
    console.error("[lana] withdrawal assessment failed:", err);
  }
}

// --- Case resolution ----------------------------------------------------------

export async function resolveCase(caseId: string, decision: "approve" | "reject" | "dismiss", adminUserId: string, note?: string) {
  const kase = await prisma.lanaCase.findUnique({ where: { id: caseId } });
  if (!kase) throw new Error("Case not found");

  let actionTaken: string | null = kase.autoActionTaken;

  if (decision === "approve") {
    if (kase.proposedAction === "suspend" && kase.status !== "auto_actioned") {
      await prisma.user.update({ where: { id: kase.subjectUserId }, data: { status: "suspended" } });
      actionTaken = "suspended";
    } else if (kase.proposedAction === "delete_account") {
      await deleteUserAccount(kase.subjectUserId, { reason: "admin_action", performedByUserId: adminUserId });
      actionTaken = "deleted";
    } else if (kase.proposedAction === "reject_withdrawal" && kase.relatedWithdrawalId) {
      await prisma.withdrawal.updateMany({
        where: { id: kase.relatedWithdrawalId, status: "pending" },
        data: { status: "rejected", processedAt: new Date(), processedBy: adminUserId, notes: note ?? "Rejected by admin via Lana." },
      });
      actionTaken = "withdrawal_rejected";
    }
  } else if (decision === "reject" && kase.status === "auto_actioned" && kase.autoActionTaken === "suspended") {
    // Admin overrides Lana's auto-suspend.
    await prisma.user.update({ where: { id: kase.subjectUserId }, data: { status: "active" } });
    actionTaken = "unsuspended";
  }

  const updated = await prisma.lanaCase.update({
    where: { id: caseId },
    data: {
      status: decision === "approve" ? "resolved_approved" : decision === "reject" ? "resolved_rejected" : "dismissed",
      resolvedAt: new Date(),
      resolvedBy: adminUserId,
      adminNote: note ?? null,
      autoActionTaken: actionTaken,
    },
  });

  await logActivity({
    type: "lana_case_resolved",
    userId: kase.subjectUserId,
    severity: "info",
    metadata: { caseId, decision, actionTaken, note },
  });

  return updated;
}

// --- Delete-account proposal (admin-initiated, not autonomous) ----------------
// Lets an admin ask Lana's panel to propose deletion for a user already under
// review (e.g. following up on an auto-suspended duplicate), which then goes
// through the same approve/reject flow as any other case.
export async function proposeDeletion(subjectUserId: string, reasoning: string) {
  const user = await prisma.user.findUnique({ where: { id: subjectUserId }, select: { fullName: true, userId: true } });
  if (!user) throw new Error("User not found");
  return prisma.lanaCase.create({
    data: {
      type: "duplicate_account",
      subjectUserId,
      relatedUserIds: "[]",
      riskScore: 90,
      summary: `Proposal: delete ${user.fullName} (${user.userId})`,
      reasoning,
      proposedAction: "delete_account",
      status: "open",
    },
  });
}

// --- Chat ------------------------------------------------------------------

export async function chatWithLana(adminMessage: string, adminUserId: string) {
  await prisma.lanaMessage.create({ data: { role: "admin", content: adminMessage, adminUserId } });

  if (!process.env.OPENAI_API_KEY) {
    const reply = "I don't have an AI connection configured right now (OPENAI_API_KEY is unset), so I can only show you the case queue, not chat about it.";
    await prisma.lanaMessage.create({ data: { role: "lana", content: reply } });
    return reply;
  }

  const [openCases, recentResolved, recentHistory, recentActivity] = await Promise.all([
    prisma.lanaCase.findMany({ where: { status: { in: ["open", "auto_actioned"] } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.lanaCase.findMany({ where: { status: { notIn: ["open", "auto_actioned"] } }, orderBy: { resolvedAt: "desc" }, take: 10 }),
    prisma.lanaMessage.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.activityLog.findMany({
      where: { type: { in: ["register", "withdrawal_request", "fraud_flagged", "lana_auto_action", "lana_case_resolved", "login_failed"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const systemPrompt = `You are Lana, the trust & safety AI agent for HustleClickGH's admin dashboard (a Ghanaian survey/micro-earning platform). You monitor registrations, withdrawals, and referral activity for fraud/multi-accounting, and talk to the admin about it plainly and concisely — you're a colleague giving a briefing, not a chatbot reciting disclaimers.

Your autonomy is narrow: you may only auto-suspend a brand-new signup on your own, and only when very confident (risk score >= 85). Everything else — deleting accounts, rejecting withdrawals — needs the admin's explicit approval through the case queue; you never claim to have done those on your own.

Open cases (need admin attention):
${openCases.map((c) => `- [${c.id}] ${c.type} risk=${c.riskScore} status=${c.status} action=${c.autoActionTaken ?? "none yet"} :: ${c.summary} — ${c.reasoning}`).join("\n") || "(none right now)"}

Recently resolved cases:
${recentResolved.map((c) => `- ${c.type} :: ${c.summary} -> ${c.status}${c.adminNote ? ` (note: ${c.adminNote})` : ""}`).join("\n") || "(none yet)"}

Recent relevant activity log:
${recentActivity.map((a) => `- ${a.createdAt.toISOString()} ${a.type} ${a.userName ?? ""} ${a.metadata ?? ""}`).join("\n") || "(none)"}

Keep replies short (a few sentences) unless the admin asks for detail.`;

  const history = recentHistory
    .reverse()
    .map((m) => ({ role: (m.role === "admin" ? "user" : "assistant") as "user" | "assistant", content: m.content }));

  try {
    const completion = await openai.chat.completions.create({
      model: LANA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: adminMessage },
      ],
      temperature: 0.3,
      max_tokens: 400,
    });
    const reply = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond to that.";
    await prisma.lanaMessage.create({ data: { role: "lana", content: reply } });
    return reply;
  } catch (err) {
    console.error("[lana] chat failed:", err);
    const reply = "I hit an error trying to think that through — try again in a moment.";
    await prisma.lanaMessage.create({ data: { role: "lana", content: reply } });
    return reply;
  }
}
