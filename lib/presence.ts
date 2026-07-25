/** A user counts as "online" if their last heartbeat was within this window. */
export const ONLINE_WINDOW_MS = 90_000; // 90s (client heartbeats every ~45s)

export function isOnline(lastSeenAt: Date | string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}
