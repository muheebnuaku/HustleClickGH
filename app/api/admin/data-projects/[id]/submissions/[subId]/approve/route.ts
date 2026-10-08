export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { canReward, buyerCost } from "@/lib/org";
import { DEFAULT_MANAGER_COMMISSION } from "@/lib/constants";
import { leaderFee, coverWithAdvance } from "@/lib/field-teams";
import { formatMoney } from "@/lib/currency";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id: projectId, subId } = await params;

    const submission = await prisma.dataSubmission.findUnique({
      where: { id: subId },
    });

    if (!submission || submission.projectId !== projectId) {
      return NextResponse.json({ message: "Submission not found" }, { status: 404 });
    }

    // Allow approving a pending OR a previously-rejected submission (rejection
    // doesn't credit or count anything, so approving now pays out exactly once).
    if (submission.status === "approved") {
      return NextResponse.json(
        { message: "Submission is already approved" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = await (prisma.dataProject.findUnique as any)({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ message: "Project not found" }, { status: 404 });
    }

    // Escrow guard: org-funded projects can only pay out from their funded budget.
    if (!canReward(project)) {
      await prisma.dataProject.update({ where: { id: projectId }, data: { status: "paused" } }).catch(() => {});
      return NextResponse.json(
        { message: "This project's funded budget is exhausted. Ask the organization to top it up before approving more." },
        { status: 402 }
      );
    }

    // Approve: contributor earns the (lower) reward; the org's budget is drawn by
    // the buyer price. The platform keeps the difference (buyerCost − reward).
    const cost = buyerCost(project);
    const projectUpdate: Parameters<typeof prisma.dataProject.update>[0]["data"] = {
      currentSubmissions: { increment: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spent: { increment: cost } as any,
    };
    if (submission.gender === "male" && project.malesNeeded !== null) {
      projectUpdate.malesApproved = { increment: 1 };
    } else if (submission.gender === "female" && project.femalesNeeded !== null) {
      projectUpdate.femalesApproved = { increment: 1 };
    }

    // Paid through the contributor's field-team leader (bulk payouts): record
    // what the leader owes instead of crediting the contributor's balance.
    // `rewarded` stays false because nothing was credited to their balance.
    if (project.payoutMode === "via_leader") {
      const member = await prisma.user.findUnique({ where: { id: submission.userId }, select: { id: true, fullName: true, teamLeaderId: true, leaderRole: true, leaderFeePercent: true } });
      // A leader's own submission goes on their own bulk payment (no leader fee on
      // their own work); everyone else's goes to the leader they belong to.
      const ownItem = !!member?.leaderRole;
      const leader = ownItem
        ? member
        : member?.teamLeaderId
          ? await prisma.user.findUnique({ where: { id: member.teamLeaderId }, select: { id: true, fullName: true, teamLeaderId: true, leaderRole: true, leaderFeePercent: true } })
          : null;
      if (!leader?.leaderRole) {
        return NextResponse.json(
          { message: "This project is paid through team leaders, but this contributor isn't in a team. Add them to a supervisor's team under Field Teams, then approve." },
          { status: 400 },
        );
      }
      const { feePercent, feeAmount } = leaderFee(project.reward, ownItem ? 0 : leader.leaderFeePercent);
      const advanceId = await prisma.$transaction(async (tx) => {
        await tx.dataSubmission.update({
          where: { id: subId },
          data: { status: "approved", rewarded: false, reviewedAt: new Date(), reviewedBy: session.user.id },
        });
        await tx.dataProject.update({ where: { id: projectId }, data: projectUpdate });
        const payable = await tx.leaderPayable.create({
          data: {
            leaderId: leader.id,
            contributorId: submission.userId,
            submissionId: subId,
            projectId,
            projectTitle: project.title,
            currency: project.currency,
            amount: project.reward,
            feePercent,
            feeAmount,
          },
        });
        // Already paid upfront? Use the leader's (or their representative's) advance.
        const lead = await tx.user.findUnique({ where: { id: leader.id }, select: { teamLeaderId: true } });
        const leaderIds = [leader.id, ...(lead?.teamLeaderId ? [lead.teamLeaderId] : [])];
        return coverWithAdvance(tx, payable.id, leaderIds, projectId, project.reward + feeAmount, project.currency);
      });
      return NextResponse.json({
        message: advanceId
          ? `Submission approved. ${formatMoney(project.reward + feeAmount, project.currency)} covered by the advance already paid to ${leader.fullName}.`
          : `Submission approved. ${formatMoney(project.reward, project.currency)} (+ ${formatMoney(feeAmount, project.currency)} fee) added to ${leader.fullName}'s next bulk payment.`,
      });
    }

    // Contributor balances are GH₵ only; other currencies are paid via team leaders.
    if (project.currency && project.currency !== "GHS") {
      return NextResponse.json({ message: `This project is in ${project.currency}. Switch it to "Pay through team leaders" — contributor balances are in GH₵.` }, { status: 400 });
    }

    // Manager commission: if the contributor was referred by a manager, that
    // manager earns a % of this reward (per-manager rate, admin-editable).
    const contributor = await prisma.user.findUnique({
      where: { id: submission.userId },
      select: { referredBy: true },
    });
    const commissionWrites: Prisma.PrismaPromise<unknown>[] = [];
    let commissionNote = "";
    if (contributor?.referredBy) {
      const referrer = await prisma.user.findUnique({
        where: { id: contributor.referredBy },
        select: { id: true, role: true, commissionPercent: true },
      });
      if (referrer?.role === "manager") {
        const percent = referrer.commissionPercent ?? DEFAULT_MANAGER_COMMISSION;
        const amount = Math.round(project.reward * (percent / 100) * 100) / 100;
        if (amount > 0) {
          commissionWrites.push(
            prisma.user.update({
              where: { id: referrer.id },
              data: { balance: { increment: amount }, totalEarned: { increment: amount } },
            }),
            prisma.managerCommission.create({
              data: {
                managerId: referrer.id,
                referredUserId: submission.userId,
                submissionId: subId,
                projectId,
                rewardAmount: project.reward,
                percent,
                amount,
              },
            }),
          );
          commissionNote = ` Manager commission GH₵${amount.toFixed(2)} (${percent}%) credited.`;
        }
      }
    }

    await prisma.$transaction([
      prisma.dataSubmission.update({
        where: { id: subId },
        data: {
          status: "approved",
          rewarded: true,
          reviewedAt: new Date(),
          reviewedBy: session.user.id,
        },
      }),
      prisma.dataProject.update({
        where: { id: projectId },
        data: projectUpdate,
      }),
      prisma.user.update({
        where: { id: submission.userId },
        data: {
          balance: { increment: project.reward },
          totalEarned: { increment: project.reward },
        },
      }),
      ...commissionWrites,
    ]);

    return NextResponse.json({
      message: `Submission approved. GH₵${project.reward.toFixed(2)} credited to user.${commissionNote}`,
    });
  } catch (error) {
    console.error("Approve submission error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
