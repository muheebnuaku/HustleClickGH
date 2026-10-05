import { prisma } from "@/lib/prisma";

export type OrgProjectAccess = "owner" | "review";

/**
 * How an organization may see a project: "owner" (funded it — full portal incl.
 * budget + dataset export) or "review" (an admin granted pass/fail review of
 * submissions). null = no access.
 */
export async function orgProjectAccess(orgId: string, projectId: string) {
  const project = await prisma.dataProject.findUnique({ where: { id: projectId } });
  if (!project) return { project: null, access: null as OrgProjectAccess | null };
  const access: OrgProjectAccess | null =
    project.orgId === orgId ? "owner" : project.reviewOrgId === orgId ? "review" : null;
  return { project: access ? project : null, access };
}
