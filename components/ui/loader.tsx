import { cn } from "@/lib/utils";

/**
 * Standard page/section loading spinner used across the app.
 * Matches the My Surveys loading style: a green ring spinner centered in the viewport.
 */
export function PageLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center min-h-[60vh]", className)}>
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500" />
    </div>
  );
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
