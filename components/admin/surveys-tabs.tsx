"use client";

import Link from "next/link";

/** Shared sub-nav so Surveys management and Responses read as one section. */
export function SurveysTabs({ active }: { active: "manage" | "responses" }) {
  const base = "flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors text-center";
  const on = "bg-white dark:bg-zinc-800 text-foreground shadow-sm";
  const off = "text-zinc-500 hover:text-foreground";
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 w-full sm:w-fit">
      <Link href="/admin/surveys" className={`${base} ${active === "manage" ? on : off}`}>Manage surveys</Link>
      <Link href="/admin/responses" className={`${base} ${active === "responses" ? on : off}`}>Responses &amp; analytics</Link>
    </div>
  );
}
