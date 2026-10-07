import { PageSkeleton } from "@/components/ui/page-kit";
import { cn } from "@/lib/utils";

/** Standard page loading placeholder (a skeleton, not a spinner). */
export function PageLoader({ className }: { className?: string }) {
  return <PageSkeleton className={cn("mx-auto w-full max-w-5xl p-4 sm:p-6", className)} />;
}

/** Smaller inline spinner for buttons/sections. */
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-500",
        className
      )}
    />
  );
}
