import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { deleteUserAccount } from "@/lib/user-deletion";
import { normalizePhone, emailLocalPart, levenshtein, assessDuplicateRisk } from "@/lib/fraud-check";
import type { DuplicateRiskResult, Candidate } from "@/lib/fraud-check";

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
];

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    if (name === "lookup_by_phone") return await toolLookupByPhone(String(args.phone ?? ""));
    if (name === "lookup_by_name") return await toolLookupByName(String(args.name ?? ""));
    if (name === "get_user_details") return await toolGetUserDetails(String(args.userIdOrCode ?? ""));
    return { error: `Unknown tool ${name}` };
  } catch (err) {
    console.error(`[lana] tool ${name} failed:`, err);
    return { error: "That lookup failed." };
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

You have tools to look things up live (by phone, by name, or full detail on one user) — use them whenever the admin asks about a specific number, person, or account rather than saying you don't have access. You do NOT have a tool to take action (suspend/delete/reject) — if the admin wants that, tell them to use the case queue, or that you'll need to flag it first.

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
          const result = await runTool(call.function.name, args);
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

// --- Backfill scan (manual, admin-triggered) ----------------------------------
// Everything above only evaluates NEW registrations/withdrawals as they
// happen. This retroactively scans what already existed before Lana did.

export interface BackfillBatchResult {
  totalUsers: number;
  processedUpTo: number; // pass this back as `offset` on the next call
  done: boolean;
  casesCreatedThisBatch: number;
  autoSuspendedThisBatch: number;
  sharedPayout: { distinctSharedNumbers: number } | null; // only set on the first call (offset 0)
}

// Runs one bounded chunk of the backfill scan and returns where it got to,
// so the caller (the panel) can show real progress and stay comfortably
// under any serverless request-duration limit instead of one long call that
// can time out with no feedback. The shared-payout-number pass is cheap
// (no AI calls) and runs once, on the first batch only.
const BACKFILL_TIME_BUDGET_MS = 40_000;

export async function runLanaBackfillBatch(offset: number): Promise<BackfillBatchResult> {
  const started = Date.now();
  const sharedPayout = offset === 0 ? await backfillSharedPayoutNumbers() : null;

  const users = await prisma.user.findMany({
    where: { role: "user" },
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true, email: true, phone: true, city: true, region: true, fraudRiskScore: true },
  });

  let casesCreated = 0;
  let autoSuspended = 0;
  let i = offset;

  for (; i < users.length; i++) {
    if (Date.now() - started > BACKFILL_TIME_BUDGET_MS) break; // yield — caller resumes at `i`

    const u = users[i];
    if (u.fraudRiskScore != null) continue; // already flagged previously

    const alreadyCased = await prisma.lanaCase.findFirst({ where: { subjectUserId: u.id, type: "duplicate_account" } });
    if (alreadyCased) continue;

    // Compare against earlier-created accounts only, so the earlier one is
    // treated as "the original" and we flag one side of each pair, not both.
    const candidates: Candidate[] = [];
    const uPhoneKey = normalizePhone(u.phone);
    const uEmailLocal = emailLocalPart(u.email);
    for (let j = 0; j < i; j++) {
      const v = users[j];
      let score = 0;
      const reasons: string[] = [];

      const vPhoneKey = normalizePhone(v.phone);
      if (vPhoneKey && uPhoneKey) {
        const dist = levenshtein(vPhoneKey, uPhoneKey);
        if (dist === 0) {
          score += 100;
          reasons.push("identical phone number");
        } else if (dist <= 2) {
          score += (3 - dist) * 25;
          reasons.push(`phone number differs by ${dist} digit${dist > 1 ? "s" : ""}`);
        }
      }

      const vEmailLocal = emailLocalPart(v.email);
      if (vEmailLocal && uEmailLocal && vEmailLocal !== uEmailLocal) {
        const dist = levenshtein(vEmailLocal, uEmailLocal);
        const longer = Math.max(vEmailLocal.length, uEmailLocal.length);
        if (longer >= 5 && dist <= 3) {
          score += (4 - dist) * 15;
          reasons.push(`email address is very similar ("${v.email}")`);
        }
      }

      if (score > 0 && v.city && u.city && v.city.trim().toLowerCase() === u.city.trim().toLowerCase() && v.region && u.region && v.region.trim().toLowerCase() === u.region.trim().toLowerCase()) {
        score += 15;
        reasons.push("same city/region");
      }

      if (score > 0) candidates.push({ ...v, score, matchReasons: reasons });
    }

    if (candidates.length === 0) continue;
    candidates.sort((a, b) => b.score - a.score);
    const top5 = candidates.slice(0, 5);

    const risk = await assessDuplicateRisk({ fullName: u.fullName, email: u.email, phone: u.phone, city: u.city ?? "", region: u.region ?? "" }, top5);
    if (!risk.flagged) continue;

    await prisma.user.update({ where: { id: u.id }, data: { fraudRiskScore: risk.riskScore, fraudRiskReason: risk.reason, fraudFlaggedAt: new Date(), suspectedDuplicateOfUserId: risk.suspectedDuplicateOfUserId } });

    const highConfidence = risk.riskScore >= AUTO_SUSPEND_THRESHOLD;
    const kase = await prisma.lanaCase.create({
      data: {
        type: "duplicate_account",
        subjectUserId: u.id,
        relatedUserIds: JSON.stringify(risk.suspectedDuplicateOfUserId ? [risk.suspectedDuplicateOfUserId] : []),
        riskScore: risk.riskScore,
        summary: `${u.fullName} looks like a possible duplicate account (found in backfill scan)`,
        reasoning: risk.reason ?? "Flagged by the duplicate-account heuristic during the backfill scan.",
        proposedAction: "suspend",
        status: highConfidence ? "auto_actioned" : "open",
        autoActionTaken: highConfidence ? "suspended" : null,
      },
    });
    casesCreated++;

    if (highConfidence) {
      await prisma.user.update({ where: { id: u.id }, data: { status: "suspended" } });
      autoSuspended++;
      await logActivity({ type: "lana_auto_action", userId: u.id, userName: u.fullName, severity: "warning", metadata: { action: "suspended", caseId: kase.id, riskScore: risk.riskScore, reason: risk.reason, source: "backfill" } });
    }
  }

  return {
    totalUsers: users.length,
    processedUpTo: i,
    done: i >= users.length,
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
