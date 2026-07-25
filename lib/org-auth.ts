import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrgForUser } from "@/lib/org";

/**
 * Resolve the organization for the current request, or null if the caller isn't
 * a valid org account. Admins are allowed through but have no org of their own.
 */
export async function currentOrg() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { session: null, org: null };
  const org = await getOrgForUser(session.user.id);
  return { session, org };
}
