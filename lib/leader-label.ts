// Display names for field-team positions. A Country Representative can also be a
// Supervisor (leads contributors directly) — one person, both positions.

export function leaderLabel(role?: string | null, alsoSupervisor?: boolean | null, short = false): string {
  if (role === "representative") {
    const rep = short ? "Country Rep" : "Country Representative";
    return alsoSupervisor ? `${rep} & Supervisor` : rep;
  }
  return role === "supervisor" ? "Supervisor" : "";
}
