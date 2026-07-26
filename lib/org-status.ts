// Friendly, human labels for DataProject.status in the org portal.
const LABELS: Record<string, string> = {
  pending_review: "Pending review",
  active: "Live",
  paused: "Paused",
  completed: "Completed",
  rejected: "Rejected",
  draft: "Draft",
};

export function orgStatusLabel(status: string): string {
  return LABELS[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function orgStatusClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "pending_review":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "rejected":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "completed":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  }
}
