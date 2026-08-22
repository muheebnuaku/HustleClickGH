import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { deleteUserAccount } from "@/lib/user-deletion";
import { normalizePhone, emailLocalPart, levenshtein, sharesPhonePrefix } from "@/lib/fraud-check";
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

// A registration burst from one IP that isn't extreme enough to hard-block
// (see lib/registration-guard.ts) but is well past normal — flagged, never
// auto-acted on, since a shared network is a real possibility in Ghana and
// this needs a human to actually look at who these accounts are.
export async function flagRegistrationVelocity(user: { id: string; fullName: string; userId: string }, count: number, ip: string | null) {
  const existing = await prisma.lanaCase.findFirst({
    where: { type: "registration_velocity", subjectUserId: user.id, status: { in: ["open", "auto_actioned"] } },
  });
  if (existing) return;

  await prisma.lanaCase.create({
    data: {
      type: "registration_velocity",
      subjectUserId: user.id,
      relatedUserIds: "[]",
      riskScore: Math.min(100, count * 12),
      summary: `${user.fullName} (${user.userId}) is the ${count}th account registered from this network in the last hour`,
      reasoning: `${count} accounts have registered from IP ${ip ?? "unknown"} within an hour. Could be a busy shared network, or one person/script mass-registering. Worth checking whether these accounts share other similarity (name, phone pattern).`,
      proposedAction: "investigate",
    },
  });
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

// Other accounts that have withdrawn to the SAME Mobile Money number — a
// strong signal independent of registration phone, since it's the actual
// cash-out destination. Caught the real cluster this feature was built
// after: three different "people" all paying out to one MoMo number.
async function findOtherAccountsSharingPayoutNumber(mobileNumber: string, excludeUserId: string) {
  const key = normalizePhone(mobileNumber);
  if (!key) return [];
  const all = await prisma.withdrawal.findMany({
    where: { userId: { not: excludeUserId } },
    select: { userId: true, mobileNumber: true, user: { select: { fullName: true, userId: true } } },
  });
  const matches = all.filter((w) => normalizePhone(w.mobileNumber) === key);
  const byUser = new Map(matches.map((w) => [w.userId, w.user]));
  return [...byUser.entries()].map(([id, u]) => ({ id, fullName: u.fullName, userId: u.userId }));
}

export async function evaluateWithdrawal(
  withdrawal: { id: string; userId: string; amount: number; mobileNumber: string },
  user: { fullName: string; userId: string }
) {
  const [breakdown, sharedPayoutAccounts] = await Promise.all([
    getUserEarningsBreakdown(withdrawal.userId),
    findOtherAccountsSharingPayoutNumber(withdrawal.mobileNumber, withdrawal.userId),
  ]);

  // Cheap pre-filter — only bother Lana (and spend an AI call) when there's
  // an actual signal, so routine legitimate withdrawals never surface at all.
  const referralShare = breakdown.totalEarned > 0 ? breakdown.referralEarnings / breakdown.totalEarned : 0;
  const worthChecking =
    breakdown.isFlagged ||
    breakdown.referrerFlagged ||
    breakdown.flaggedReferredCount > 0 ||
    sharedPayoutAccounts.length > 0 ||
    (referralShare > 0.4 && breakdown.referralCount >= 3);

  if (!worthChecking) return;

  const payoutLine = sharedPayoutAccounts.length
    ? `This withdrawal's Mobile Money number is ALSO used by ${sharedPayoutAccounts.length} other account(s): ${sharedPayoutAccounts.map((a) => `${a.fullName} (${a.userId})`).join(", ")}.`
    : "No other account has withdrawn to this same Mobile Money number.";

  if (!process.env.OPENAI_API_KEY) {
    // No AI available — fall back to a plain flag for manual review rather
    // than silently skipping a case that already tripped the pre-filter.
    await prisma.lanaCase.create({
      data: {
        type: "suspicious_withdrawal",
        subjectUserId: withdrawal.userId,
        relatedWithdrawalId: withdrawal.id,
        relatedUserIds: JSON.stringify(sharedPayoutAccounts.map((a) => a.id)),
        riskScore: sharedPayoutAccounts.length ? 70 : 50,
        summary: `${user.fullName} (${user.userId}) requested GH₵${withdrawal.amount.toFixed(2)} — ${sharedPayoutAccounts.length ? "shared payout number" : "earnings mix looks referral-heavy"}`,
        reasoning: `Referral share of total earnings is ${(referralShare * 100).toFixed(0)}%, with ${breakdown.flaggedReferredCount} flagged referred account(s). ${payoutLine} AI review unavailable (no API key) — flagged by heuristic pre-filter.`,
        proposedAction: "investigate",
      },
    });
    return;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `A user on HustleClickGH (Ghana survey/reward platform) has requested a withdrawal. Assess whether their earnings look legitimate (earned by actually completing surveys/data-submission tasks) or look like referral/reward farming (earnings mostly from referral bonuses, especially via accounts already flagged as likely duplicates), or like a payout-number cash-out ring (multiple accounts paying out to the same Mobile Money number).

Withdrawal: GH₵${withdrawal.amount.toFixed(2)} requested by ${user.fullName} (${user.userId})

Earnings breakdown:
- Total earned (lifetime): GH₵${breakdown.totalEarned.toFixed(2)}
- Current balance: GH₵${breakdown.balance.toFixed(2)}
- From approved survey completions: GH₵${breakdown.approvedSurveyEarnings.toFixed(2)}
- From approved data-submission tasks: GH₵${breakdown.approvedDataSubmissionEarnings.toFixed(2)}
- From referral bonuses: GH₵${breakdown.referralEarnings.toFixed(2)} (${breakdown.referralCount} referrals, ${breakdown.flaggedReferredCount} of those referred accounts are themselves flagged as likely duplicates)
- This user is themselves flagged as a likely duplicate account: ${breakdown.isFlagged}
- Whoever referred this user is flagged/suspended: ${breakdown.referrerFlagged}
- Payout number check: ${payoutLine}

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
        relatedUserIds: JSON.stringify(sharedPayoutAccounts.map((a) => a.id)),
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

  const relatedIds: string[] = (() => {
    try {
      return JSON.parse(kase.relatedUserIds);
    } catch {
      return [];
    }
  })();

  if (decision === "approve") {
    if (kase.proposedAction === "suspend" && kase.status !== "auto_actioned") {
      await prisma.user.update({ where: { id: kase.subjectUserId }, data: { status: "suspended" } });
      actionTaken = "suspended";
    } else if (kase.proposedAction === "suspend_others" && kase.status !== "auto_actioned") {
      // Group case: subjectUserId is the one to KEEP active; relatedUserIds are the ones to suspend.
      if (relatedIds.length) await prisma.user.updateMany({ where: { id: { in: relatedIds } }, data: { status: "suspended" } });
      actionTaken = "suspended_others";
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
  } else if (decision === "reject" && kase.status === "auto_actioned") {
    // Admin overrides an action Lana already took on her own.
    if (kase.autoActionTaken === "suspended") {
      await prisma.user.update({ where: { id: kase.subjectUserId }, data: { status: "active" } });
      actionTaken = "unsuspended";
    } else if (kase.autoActionTaken === "suspended_others" && relatedIds.length) {
      await prisma.user.updateMany({ where: { id: { in: relatedIds } }, data: { status: "active" } });
      actionTaken = "unsuspended_others";
    }
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

  const existing = await prisma.lanaCase.findFirst({
    where: { subjectUserId, proposedAction: "delete_account", status: { in: ["open", "auto_actioned"] } },
  });
  if (existing) return existing;

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

// --- Chat tools --------------------------------------------------------------
// Real database lookups Lana can run mid-conversation, instead of only being
// able to discuss cases she already has. Read-only — nothing here mutates
// anything; actions still only happen through the case approve/reject flow.

const USER_FIELDS = { id: true, userId: true, fullName: true, email: true, phone: true, status: true, city: true, region: true, createdAt: true, fraudRiskScore: true, fraudRiskReason: true } as const;

async function toolLookupByPhone(phone: string) {
  const key = normalizePhone(phone);
  if (!key) return { error: "That doesn't look like a usable phone number." };

  const [users, withdrawals] = await Promise.all([
    prisma.user.findMany({ where: { role: "user" }, select: USER_FIELDS }),
    prisma.withdrawal.findMany({
      select: { id: true, userId: true, amount: true, mobileNumber: true, status: true, requestedAt: true, user: { select: { fullName: true, userId: true } } },
    }),
  ]);

  const matchingUsers = users.filter((u) => normalizePhone(u.phone) === key);
  const matchingWithdrawals = withdrawals.filter((w) => normalizePhone(w.mobileNumber) === key);

  return {
    registeredAccountsWithThisPhone: matchingUsers,
    withdrawalsPaidToThisNumber: matchingWithdrawals.map((w) => ({
      withdrawalId: w.id,
      amount: w.amount,
      status: w.status,
      requestedAt: w.requestedAt,
      byAccount: `${w.user.fullName} (${w.user.userId})`,
    })),
    distinctAccountsUsingThisPayoutNumber: [...new Set(matchingWithdrawals.map((w) => w.userId))].length,
  };
}

async function toolLookupByName(name: string) {
  const users = await prisma.user.findMany({
    where: { role: "user", fullName: { contains: name, mode: "insensitive" } },
    select: USER_FIELDS,
    take: 20,
  });
  return { matches: users };
}

async function toolGetUserDetails(userIdOrCode: string) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userIdOrCode }, { userId: userIdOrCode }] },
    select: { ...USER_FIELDS, referredBy: true },
  });
  if (!user) return { error: "No user found with that id/code." };

  const [breakdown, withdrawals, cases] = await Promise.all([
    getUserEarningsBreakdown(user.id),
    prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { requestedAt: "desc" }, take: 10, select: { amount: true, mobileNumber: true, status: true, requestedAt: true } }),
    prisma.lanaCase.findMany({ where: { subjectUserId: user.id }, select: { type: true, riskScore: true, status: true, summary: true, createdAt: true } }),
  ]);

  return { user, earnings: breakdown, recentWithdrawals: withdrawals, lanaCaseHistory: cases };
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "lookup_by_phone",
      description: "Find every registered account with this phone number, AND every withdrawal that's been paid out to this Mobile Money number (which can belong to different accounts than the one registered with it).",
      parameters: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"] },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_by_name",
      description: "Find accounts by (partial, case-insensitive) full name.",
      parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_details",
      description: "Full detail on one specific user: profile, earnings breakdown (survey/data-submission/referral split), recent withdrawals, and their Lana case history. Accepts either the internal id or the USERxxxx code.",
      parameters: { type: "object", properties: { userIdOrCode: { type: "string" } }, required: ["userIdOrCode"] },
    },
  },
  {
    type: "function",
    function: {
      name: "suspend_accounts",
      description: "Suspend one or more accounts immediately (reversible). Only call this when the admin has given a clear, explicit instruction to suspend SPECIFIC accounts that are already identified in this conversation (e.g. from a lookup you just did). Never call it speculatively or for a vague request — ask which accounts they mean first if it's not obvious.",
      parameters: {
        type: "object",
        properties: {
          userIds: { type: "array", items: { type: "string" }, description: "Internal ids or USERxxxx codes of the accounts to suspend" },
          reason: { type: "string" },
        },
        required: ["userIds", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_accounts",
      description: "Permanently delete one or more accounts and all their data. IRREVERSIBLE. Only call this when the admin has given a clear, explicit instruction to delete SPECIFIC accounts that are already identified in this conversation. Never call it speculatively.",
      parameters: {
        type: "object",
        properties: {
          userIds: { type: "array", items: { type: "string" }, description: "Internal ids or USERxxxx codes of the accounts to delete" },
          reason: { type: "string" },
        },
        required: ["userIds", "reason"],
      },
    },
  },
];

async function resolveUserRefs(refs: string[]) {
  if (refs.length === 0) return [];
  return prisma.user.findMany({
    where: { OR: refs.flatMap((r) => [{ id: r }, { userId: r }]) },
    select: { id: true, fullName: true, userId: true, status: true },
  });
}

async function toolSuspendAccounts(userIds: string[], reason: string, adminUserId: string) {
  const users = await resolveUserRefs(userIds);
  if (users.length === 0) return { error: "No matching accounts found." };
  await prisma.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { status: "suspended" } });
  for (const u of users) {
    await logActivity({ type: "lana_auto_action", userId: u.id, userName: u.fullName, severity: "warning", metadata: { action: "suspended", reason, source: "chat", adminUserId } });
  }
  return { suspended: users.map((u) => `${u.fullName} (${u.userId})`) };
}

async function toolDeleteAccounts(userIds: string[], reason: string, adminUserId: string) {
  const users = await resolveUserRefs(userIds);
  if (users.length === 0) return { error: "No matching accounts found." };
  const deleted: string[] = [];
  for (const u of users) {
    await deleteUserAccount(u.id, { reason: "admin_action", performedByUserId: adminUserId });
    deleted.push(`${u.fullName} (${u.userId})`);
  }
  return { deleted, note: "Each deletion is logged in the activity log (type account_delete_request)." };
}

async function runTool(name: string, args: Record<string, unknown>, adminUserId: string): Promise<unknown> {
  try {
    if (name === "lookup_by_phone") return await toolLookupByPhone(String(args.phone ?? ""));
    if (name === "lookup_by_name") return await toolLookupByName(String(args.name ?? ""));
    if (name === "get_user_details") return await toolGetUserDetails(String(args.userIdOrCode ?? ""));
    if (name === "suspend_accounts") return await toolSuspendAccounts(Array.isArray(args.userIds) ? args.userIds.map(String) : [], String(args.reason ?? ""), adminUserId);
    if (name === "delete_accounts") return await toolDeleteAccounts(Array.isArray(args.userIds) ? args.userIds.map(String) : [], String(args.reason ?? ""), adminUserId);
    return { error: `Unknown tool ${name}` };
  } catch (err) {
    console.error(`[lana] tool ${name} failed:`, err);
    return { error: "That failed." };
  }
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

You have tools to look things up live (by phone, by name, or full detail on one user) — use them whenever the admin asks about a specific number, person, or account rather than saying you don't have access.

You also have tools to suspend or delete accounts directly. Use them ONLY when the admin gives a clear, explicit instruction about SPECIFIC accounts already identified earlier in this conversation (e.g. after you've just looked something up and they say "delete them" or "suspend USER1234") — that's their explicit approval, same as clicking a button in the case queue, just through chat. Never call these tools speculatively, on a vague request, or on accounts you haven't actually confirmed the identity of in this conversation — ask a clarifying question instead if there's any ambiguity about which accounts they mean. After using one, briefly confirm exactly what you did (who, and whether it was suspend or delete).

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

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: adminMessage },
  ];

  try {
    // Tool-use loop — Lana can call a lookup, see the result, and either call
    // another or answer. Capped so a confused loop can't run away.
    for (let round = 0; round < 4; round++) {
      const completion = await openai.chat.completions.create({
        model: LANA_MODEL,
        messages,
        tools: TOOLS,
        temperature: 0.3,
        max_tokens: 500,
      });
      const choice = completion.choices[0]?.message;
      if (!choice) break;

      if (choice.tool_calls?.length) {
        messages.push(choice);
        for (const call of choice.tool_calls) {
          if (call.type !== "function") continue;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            // leave args empty — tool implementations validate their own inputs
          }
          const result = await runTool(call.function.name, args, adminUserId);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue; // let the model see the tool results and respond
      }

      const reply = choice.content?.trim() || "I'm not sure how to respond to that.";
      await prisma.lanaMessage.create({ data: { role: "lana", content: reply } });
      return reply;
    }

    const reply = "I looked into that but couldn't settle on an answer — try rephrasing?";
    await prisma.lanaMessage.create({ data: { role: "lana", content: reply } });
    return reply;
  } catch (err) {
    console.error("[lana] chat failed:", err);
    const reply = "I hit an error trying to think that through — try again in a moment.";
    await prisma.lanaMessage.create({ data: { role: "lana", content: reply } });
    return reply;
  }
}

// --- Reset (testing/demo utility, manual, admin-triggered) --------------------
// Undoes everything Lana has done: reactivates every account she suspended
// (live OR backfill, whether or not the admin has reviewed it yet), clears
// the fraud-flag fields she set, and wipes all cases and chat history. Meant
// for re-running the backfill scan from a clean slate after a code change —
// NOT a routine admin action, since it also reverts suspensions an admin
// may have already independently confirmed.
export async function resetLanaState() {
  const cases = await prisma.lanaCase.findMany({ select: { subjectUserId: true, relatedUserIds: true, autoActionTaken: true } });
  const toReactivate = new Set<string>();
  for (const c of cases) {
    if (c.autoActionTaken === "suspended") toReactivate.add(c.subjectUserId);
    if (c.autoActionTaken === "suspended_others") {
      try {
        (JSON.parse(c.relatedUserIds) as string[]).forEach((id) => toReactivate.add(id));
      } catch {
        // ignore malformed JSON — nothing to reactivate from this row
      }
    }
  }

  const reactivated = toReactivate.size
    ? await prisma.user.updateMany({ where: { id: { in: [...toReactivate] }, status: "suspended" }, data: { status: "active" } })
    : { count: 0 };

  const flagsCleared = await prisma.user.updateMany({
    where: { OR: [{ fraudRiskScore: { not: null } }, { fraudFlaggedAt: { not: null } }] },
    data: { fraudRiskScore: null, fraudRiskReason: null, fraudFlaggedAt: null, suspectedDuplicateOfUserId: null },
  });

  const casesDeleted = await prisma.lanaCase.deleteMany({});
  const messagesDeleted = await prisma.lanaMessage.deleteMany({});

  return {
    accountsReactivated: reactivated.count,
    flagsCleared: flagsCleared.count,
    casesDeleted: casesDeleted.count,
    messagesDeleted: messagesDeleted.count,
  };
}

// --- Backfill scan (manual, admin-triggered) ----------------------------------
// Everything above only evaluates NEW registrations/withdrawals as they
// happen. This retroactively scans what already existed before Lana did —
// and, unlike the live per-signup check, does it as proper GROUPS (a phone
// number can connect 5-10 accounts, not just a pair) with each member's real
// activity and referral chain considered, so Lana can tell which one account
// in a cluster is the genuine one worth keeping active rather than just
// suspending whichever happened to register second.

interface ClusterMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  city: string | null;
  region: string | null;
  status: string;
  createdAt: Date;
  referredBy: string | null;
}

// Same signal as the live/pairwise check (lib/fraud-check.ts), just scored
// standalone so it can feed a union-find over the WHOLE user base instead of
// "new signup vs a candidate pool".
function pairScore(a: ClusterMember, b: ClusterMember): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const aPhone = normalizePhone(a.phone);
  const bPhone = normalizePhone(b.phone);
  if (aPhone && bPhone) {
    const dist = levenshtein(aPhone, bPhone);
    if (dist === 0) {
      score += 100;
      reasons.push("identical phone number");
    } else if (dist <= 2) {
      score += (3 - dist) * 25;
      reasons.push(`phone number differs by ${dist} digit${dist > 1 ? "s" : ""}`);
    } else if (sharesPhonePrefix(aPhone, bPhone)) {
      score += 30;
      reasons.push("shares the same phone number prefix");
    }
  }

  const aEmail = emailLocalPart(a.email);
  const bEmail = emailLocalPart(b.email);
  if (aEmail && bEmail && aEmail !== bEmail) {
    const dist = levenshtein(aEmail, bEmail);
    const longer = Math.max(aEmail.length, bEmail.length);
    if (longer >= 5 && dist <= 3) {
      score += (4 - dist) * 15;
      reasons.push(`email address is very similar ("${b.email}")`);
    }
  }

  if (score > 0 && a.city && b.city && a.city.trim().toLowerCase() === b.city.trim().toLowerCase() && a.region && b.region && a.region.trim().toLowerCase() === b.region.trim().toLowerCase()) {
    score += 15;
    reasons.push("same city/region");
  }

  return { score, reasons };
}

// Minimum pairwise score to UNION two accounts into the same cluster —
// deliberately a bit above "any similarity at all" (which findCandidates/the
// live check uses for a top-5 shortlist) to limit spurious transitive
// merges, since union-find will chain A~B~C into one group even if A and C
// aren't directly similar.
const CLUSTER_UNION_THRESHOLD = 40;

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

async function buildDuplicateClusters(): Promise<ClusterMember[][]> {
  const users: ClusterMember[] = await prisma.user.findMany({
    where: { role: "user" },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, fullName: true, email: true, phone: true, city: true, region: true, status: true, createdAt: true, referredBy: true },
  });

  const uf = new UnionFind();
  for (const u of users) uf.find(u.id);
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < i; j++) {
      if (pairScore(users[i], users[j]).score >= CLUSTER_UNION_THRESHOLD) uf.union(users[i].id, users[j].id);
    }
  }

  const groups = new Map<string, ClusterMember[]>();
  for (const u of users) {
    const root = uf.find(u.id);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(u);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

interface MemberWithFacts extends ClusterMember {
  approvedSurveys: number;
  approvedSubmissions: number;
  approvedWithdrawals: number;
  referrerLabel: string | null; // "fullName (USERxxxx)" of whoever referred them
}

async function withActivityAndReferrer(m: ClusterMember): Promise<MemberWithFacts> {
  const [approvedSurveys, approvedSubmissions, approvedWithdrawals, referrer] = await Promise.all([
    prisma.surveyResponse.count({ where: { userId: m.id, rewarded: true } }),
    prisma.dataSubmission.count({ where: { userId: m.id, status: "approved" } }),
    prisma.withdrawal.count({ where: { userId: m.id, status: "approved" } }),
    m.referredBy ? prisma.user.findUnique({ where: { id: m.referredBy }, select: { fullName: true, userId: true } }) : null,
  ]);
  return {
    ...m,
    approvedSurveys,
    approvedSubmissions,
    approvedWithdrawals,
    referrerLabel: referrer ? `${referrer.fullName} (${referrer.userId})` : null,
  };
}

function findCommonReferrer(members: MemberWithFacts[]): { label: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const m of members) if (m.referrerLabel) counts.set(m.referrerLabel, (counts.get(m.referrerLabel) ?? 0) + 1);
  const found = [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])[0];
  return found ? { label: found[0], count: found[1] } : null;
}

interface ClusterAssessment {
  riskScore: number;
  keepActiveUserId: string | null; // null = recommend suspending everyone in the cluster
  reasoning: string;
}

async function assessCluster(members: MemberWithFacts[]): Promise<ClusterAssessment> {
  const commonReferrer = findCommonReferrer(members);
  const activityScore = (m: MemberWithFacts) => m.approvedSurveys + m.approvedSubmissions + m.approvedWithdrawals;

  if (!process.env.OPENAI_API_KEY) {
    const ranked = [...members].sort((a, b) => activityScore(b) - activityScore(a));
    const keepActiveUserId = activityScore(ranked[0]) > 0 ? ranked[0].id : null;
    return {
      riskScore: Math.min(100, 55 + members.length * 8),
      keepActiveUserId,
      reasoning: `Heuristic (no AI available): ${members.length} accounts cluster on phone/email/location similarity.${commonReferrer ? ` ${commonReferrer.count} of them were referred by ${commonReferrer.label}.` : ""}${keepActiveUserId ? ` Recommending ${ranked[0].fullName} stay active — most real activity in the group.` : " No account in the group shows real activity."}`,
    };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `These accounts on HustleClickGH (Ghana survey/reward platform) were grouped by similar phone number, email, and/or location — likely the same person running multiple accounts to farm referral bonuses and task rewards, OR a genuine coincidence (e.g. family sharing a network).

${members
  .map(
    (m, i) =>
      `${i + 1}. id=${m.id} name="${m.fullName}" userId=${m.userId ?? ""} email="${m.email}" phone="${m.phone}" location="${m.city}, ${m.region}" status=${m.status} joined=${m.createdAt.toISOString().slice(0, 10)} — approved surveys: ${m.approvedSurveys}, approved data submissions: ${m.approvedSubmissions}, approved withdrawals: ${m.approvedWithdrawals}, referred by: ${m.referrerLabel ?? "nobody (direct signup)"}`
  )
  .join("\n")}

${commonReferrer ? `${commonReferrer.count} of these accounts were referred by the SAME person: ${commonReferrer.label}.` : "No two accounts in this group share a referrer."}

Decide: is this genuinely one person operating multiple accounts (or a referral-farming ring)? If so, which ONE account (if any) has real, legitimate activity and should stay active — the rest should be suspended. An account with zero approved surveys/submissions/withdrawals has done nothing that would be lost by suspending it. Don't assume the oldest account is automatically the "real" one — judge by actual activity.

Respond with ONLY a JSON object, no other text:
{"isGenuineDuplicateGroup": boolean, "riskScore": number (0-100), "keepActiveAccountId": string or null (the "id" field of the one account to leave active, or null if none should stay active), "reasoning": string (2-3 sentences an admin can act on, mention the referrer connection if relevant)}`;

  try {
    const completion = await openai.chat.completions.create({
      model: LANA_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const riskScore = Math.max(0, Math.min(100, Number(parsed.riskScore) || 0));
    const keepId = typeof parsed.keepActiveAccountId === "string" ? parsed.keepActiveAccountId : null;
    return {
      riskScore: Boolean(parsed.isGenuineDuplicateGroup) ? riskScore : 0,
      keepActiveUserId: keepId && members.some((m) => m.id === keepId) ? keepId : null,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "Flagged by AI cluster review.",
    };
  } catch (err) {
    console.error("[lana] cluster assessment failed:", err);
    const ranked = [...members].sort((a, b) => activityScore(b) - activityScore(a));
    return {
      riskScore: Math.min(100, 50 + members.length * 8),
      keepActiveUserId: activityScore(ranked[0]) > 0 ? ranked[0].id : null,
      reasoning: `AI review failed — heuristic fallback: ${members.length} similar accounts, keeping the one with the most real activity active.`,
    };
  }
}

export interface BackfillBatchResult {
  totalClusters: number;
  remainingClusters: number;
  done: boolean;
  casesCreatedThisBatch: number;
  autoSuspendedThisBatch: number;
  sharedPayout: { distinctSharedNumbers: number };
}

// Runs one bounded chunk of the backfill scan and returns where it got to, so
// the caller (the panel) can show real progress and stay comfortably under
// any serverless request-duration limit. Clusters that already have a case
// are skipped, which is what makes this safe to just call repeatedly (no
// offset bookkeeping needed — a fresh cluster computation each call
// naturally excludes anything already handled).
const BACKFILL_TIME_BUDGET_MS = 40_000;

export async function runLanaBackfillBatch(): Promise<BackfillBatchResult> {
  const started = Date.now();
  const sharedPayout = await backfillSharedPayoutNumbers();

  const allClusters = await buildDuplicateClusters();
  const pending: ClusterMember[][] = [];
  for (const cluster of allClusters) {
    const existing = await prisma.lanaCase.findFirst({ where: { subjectUserId: { in: cluster.map((m) => m.id) }, type: "duplicate_account" } });
    if (!existing) pending.push(cluster);
  }

  let casesCreated = 0;
  let autoSuspended = 0;
  let processed = 0;

  for (const cluster of pending) {
    if (Date.now() - started > BACKFILL_TIME_BUDGET_MS) break;
    processed++;

    const withFacts = await Promise.all(cluster.map(withActivityAndReferrer));
    const assessment = await assessCluster(withFacts);
    if (assessment.riskScore < 50) continue; // not confident enough to raise

    const keepId = assessment.keepActiveUserId;
    const others = withFacts.filter((m) => m.id !== keepId);
    if (others.length === 0) continue; // everyone's "the keeper" — nothing to flag

    const subject = keepId ? withFacts.find((m) => m.id === keepId)! : withFacts[0];
    const suspendCandidates = keepId ? others : withFacts.filter((m) => m.id !== subject.id);

    for (const m of suspendCandidates) {
      await prisma.user.update({ where: { id: m.id }, data: { fraudRiskScore: assessment.riskScore, fraudRiskReason: assessment.reasoning, fraudFlaggedAt: new Date(), suspectedDuplicateOfUserId: subject.id } });
    }

    const highConfidence = assessment.riskScore >= AUTO_SUSPEND_THRESHOLD;
    const kase = await prisma.lanaCase.create({
      data: {
        type: "duplicate_account",
        subjectUserId: subject.id,
        relatedUserIds: JSON.stringify(suspendCandidates.map((m) => m.id)),
        riskScore: assessment.riskScore,
        summary: `${suspendCandidates.length + 1}-account cluster around ${subject.fullName} — ${keepId ? "keeping this one active, suspending the rest" : "no genuine activity found in any of them"}`,
        reasoning: `${assessment.reasoning} (found in backfill scan)`,
        proposedAction: "suspend_others",
        status: highConfidence ? "auto_actioned" : "open",
        autoActionTaken: highConfidence ? "suspended_others" : null,
      },
    });
    casesCreated++;

    if (highConfidence) {
      await prisma.user.updateMany({ where: { id: { in: suspendCandidates.map((m) => m.id) } }, data: { status: "suspended" } });
      autoSuspended += suspendCandidates.length;
      await logActivity({
        type: "lana_auto_action",
        userId: subject.id,
        userName: subject.fullName,
        severity: "warning",
        metadata: { action: "suspended_others", caseId: kase.id, suspendedUserIds: suspendCandidates.map((m) => m.id), riskScore: assessment.riskScore, reason: assessment.reasoning, source: "backfill" },
      });
    }
  }

  return {
    totalClusters: allClusters.length,
    remainingClusters: pending.length - processed,
    done: processed >= pending.length,
    casesCreatedThisBatch: casesCreated,
    autoSuspendedThisBatch: autoSuspended,
    sharedPayout,
  };
}

async function backfillSharedPayoutNumbers() {
  const withdrawals = await prisma.withdrawal.findMany({
    select: { userId: true, mobileNumber: true, user: { select: { fullName: true, userId: true } } },
  });

  const byNumber = new Map<string, { id: string; fullName: string; userId: string }[]>();
  for (const w of withdrawals) {
    const key = normalizePhone(w.mobileNumber);
    if (!key) continue;
    const list = byNumber.get(key) ?? [];
    if (!list.some((u) => u.id === w.userId)) list.push({ id: w.userId, fullName: w.user.fullName, userId: w.user.userId });
    byNumber.set(key, list);
  }

  let casesCreated = 0;
  for (const [, accounts] of byNumber) {
    if (accounts.length < 2) continue;

    const subject = accounts[0];
    const others = accounts.slice(1);
    const existing = await prisma.lanaCase.findFirst({
      where: { type: "shared_payout_number", subjectUserId: subject.id, status: { in: ["open", "auto_actioned"] } },
    });
    if (existing) continue;

    await prisma.lanaCase.create({
      data: {
        type: "shared_payout_number",
        subjectUserId: subject.id,
        relatedUserIds: JSON.stringify(others.map((a) => a.id)),
        riskScore: Math.min(100, 50 + accounts.length * 15),
        summary: `${accounts.length} accounts share one withdrawal payout number: ${accounts.map((a) => `${a.fullName} (${a.userId})`).join(", ")}`,
        reasoning: `Found in backfill scan — these accounts have all withdrawn to the same Mobile Money number, which is either one person cashing out multiple accounts or a shared agent number. Needs manual judgment on which (if any) accounts to act on, so this is never auto-suspended.`,
        proposedAction: "investigate",
      },
    });
    casesCreated++;
  }

  return { distinctSharedNumbers: casesCreated };
}
