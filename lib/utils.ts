import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Contributor-facing money (balances, earnings, rewards, withdrawals) is in Cedis.
export function formatCurrency(amount: number): string {
  return `GH₵${amount.toFixed(2)}`;
}

// Organization/buyer-facing money (wallet, funding, project pricing) is in USD.
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
