import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild, children, ...props }, ref) => {
    if (asChild) {
      return <span className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]":
              variant === "primary",
            "bg-transparent border border-solid border-black/[.08] hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]":
              variant === "outline",
            "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700":
              variant === "secondary",
            "hover:bg-zinc-100 dark:hover:bg-zinc-800": variant === "ghost",
          },
          {
            "h-9 px-4 text-sm": size === "sm",
            "h-12 px-5 text-base": size === "md",
            "h-14 px-6 text-lg": size === "lg",
          },
          className
        )}
        {...props}
      >
        {children}
      </span>;
    }
    
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]":
              variant === "primary",
            "bg-transparent border border-solid border-black/[.08] hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]":
              variant === "outline",
            "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700":
              variant === "secondary",
            "hover:bg-zinc-100 dark:hover:bg-zinc-800": variant === "ghost",
          },
          {
            "h-9 px-4 text-sm": size === "sm",
            "h-12 px-5 text-base": size === "md",
            "h-14 px-6 text-lg": size === "lg",
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
