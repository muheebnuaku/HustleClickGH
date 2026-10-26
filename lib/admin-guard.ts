import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/** The signed-in admin's user id, or null for anyone else (managers included). */
export async function adminUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user && session.user.role === "admin" ? session.user.id : null;
}
