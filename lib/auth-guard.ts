import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/**
 * Resolve the current session and reject suspended (or signed-out) users.
 * The session callback re-reads `status` from the DB on every request, so this
 * blocks anyone suspended AFTER they logged in — a plain login check misses them
 * because JWT sessions stay valid until they expire.
 *
 * Returns either `{ session }` or `{ error, status }` for the caller to return.
 */
export async function requireActiveUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { session: null as never, error: "Unauthorized", status: 401 as const };
  }
  if (session.user.status === "suspended") {
    return { session: null as never, error: "Your account has been suspended.", status: 403 as const };
  }
  return { session, error: null, status: 200 as const };
}
