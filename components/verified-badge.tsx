import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Blue verification tick shown next to a verified user's name.
 * Rendered only when the admin has verified the account.
 */
export function VerifiedBadge({
  size = 16,
  className,
  withLabel = false,
}: {
  size?: number;
  className?: string;
  withLabel?: boolean;
}) {
  if (withLabel) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
          className
        )}
      >
        <BadgeCheck size={13} /> Verified
      </span>
    );
  }

  return (
    <BadgeCheck
      size={size}
      className={cn("text-blue-600 shrink-0", className)}
      aria-label="Verified account"
    />
  );
}
