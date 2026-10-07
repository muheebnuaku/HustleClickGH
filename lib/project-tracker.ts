// Per-project progress, broken down by field team: advance paid → submitted →
// admin check → client pass/fail → paid out → contributor confirmed.
// Used by the admin project page and by leaders on /team.

import { prisma } from "@/lib/prisma";
import { parseStringList } from "@/lib/project-config";
import { round2 } from "@/lib/field-teams";

export interface TrackerRow {
  key: string; // leader id, or "none" for people not in a team
  leaderName: string;
  leaderRole: string | null;
  contributors: number;
  submitted: number;
  pending: number;
  approved: number;
  rejected: number;
  clientPass: number;
  clientFail: number;
  owed: number; // approved, waiting for a bulk payment (count)
  sentToLeader: number; // in a bulk payment / covered by an advance, not yet paid out
  paidOut: number; // leader marked the contributor paid
  confirmed: number; // contributor confirmed receipt
  disputed: number;
  advancePaid: number; // GH₵ advanced for this project
  advanceLeft: number; // GH₵ not yet used up
}

const blank = (key: string, leaderName: string, leaderRole: string | null): TrackerRow => ({
  key, leaderName, leaderRole, contributors: 0, submitted: 0, pending: 0, approved: 0, rejected: 0,
  clientPass: 0, clientFail: 0, owed: 0, sentToLeader: 0, paidOut: 0, confirmed: 0, disputed: 0, advancePaid: 0, advanceLeft: 0,
});

/** `onlyLeaders` limits the result to those teams (a leader viewing their own scope). */
export async function buildTracker(projectId: string, onlyLeaders?: string[]) {
  const project = await prisma.dataProject.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, payoutMode: true, assignedLeaderIds: true, maxSubmissions: true, currentSubmissions: true, reward: true, reviewOrgId: true, status: true, currency: true },
  });
  if (!project) return null;

  const subs = await prisma.dataSubmission.findMany({
    where: { projectId },
    select: { id: true, userId: true, status: true, clientVerdict: true, user: { select: { teamLeaderId: true } } },
  });
  const [payables, advances] = await Promise.all([
    prisma.leaderPayable.findMany({ where: { projectId }, select: { submissionId: true, leaderId: true, status: true, contributorConfirmedAt: true, disputedAt: true } }),
    prisma.leaderPayout.findMany({ where: { kind: "advance", projectId }, select: { leaderId: true, total: true, creditRemaining: true } }),
  ]);
  const assigned = parseStringList(project.assignedLeaderIds);
  const leaderIds = Array.from(new Set([
    ...assigned,
    ...subs.map((s) => s.user?.teamLeaderId).filter((x): x is string => !!x),
    ...payables.map((p) => p.leaderId),
    ...advances.map((a) => a.leaderId),
  ]));
  const leaders = new Map(
    (await prisma.user.findMany({ where: { id: { in: leaderIds } }, select: { id: true, fullName: true, leaderRole: true } })).map((l) => [l.id, l]),
  );
  const payBySub = new Map(payables.map((p) => [p.submissionId, p]));

  const rows = new Map<string, TrackerRow>();
  const row = (key: string) => {
    if (!rows.has(key)) {
      const l = leaders.get(key);
      rows.set(key, blank(key, key === "none" ? "Not in a team" : l?.fullName ?? "Former leader", l?.leaderRole ?? null));
    }
    return rows.get(key)!;
  };
  for (const id of assigned) row(id); // assigned teams show even before anyone submits

  const people = new Map<string, Set<string>>();
  for (const s of subs) {
    const pay = payBySub.get(s.id);
    // Paid items belong to the leader they were paid through; otherwise the person's current leader.
    const key = pay?.leaderId ?? s.user?.teamLeaderId ?? "none";
    const r = row(key);
    if (!people.has(key)) people.set(key, new Set());
    people.get(key)!.add(s.userId);
    r.submitted++;
    if (s.status === "pending") r.pending++;
    else if (s.status === "approved") r.approved++;
    else if (s.status === "rejected") r.rejected++;
    if (s.clientVerdict === "pass") r.clientPass++;
    if (s.clientVerdict === "fail") r.clientFail++;
    if (pay) {
      if (pay.status === "owed") r.owed++;
      else if (pay.status === "sent") r.sentToLeader++;
      else if (pay.status === "paid") r.paidOut++;
      if (pay.contributorConfirmedAt) r.confirmed++;
      if (pay.disputedAt) r.disputed++;
    }
  }
  for (const [k, set] of people) row(k).contributors = set.size;
  for (const a of advances) {
    const r = row(a.leaderId);
    r.advancePaid = round2(r.advancePaid + a.total);
    r.advanceLeft = round2(r.advanceLeft + a.creditRemaining);
  }

  let list = Array.from(rows.values());
  if (onlyLeaders) list = list.filter((r) => onlyLeaders.includes(r.key));
  list.sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : b.submitted - a.submitted));

  const total = list.reduce((t, r) => {
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = round2(t[k] + (r[k] as number));
    return t;
  }, { contributors: 0, submitted: 0, pending: 0, approved: 0, rejected: 0, clientPass: 0, clientFail: 0, owed: 0, sentToLeader: 0, paidOut: 0, confirmed: 0, disputed: 0, advancePaid: 0, advanceLeft: 0 });

  return { project: { ...project, assignedLeaderIds: assigned }, rows: list, total };
}
