"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/page-kit";

export default function RegisterPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to the unified auth page, PRESERVING ?ref= (and any other query)
    // and signalling it to open the register side.
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("register", "1");
    router.replace(`/login?${params.toString()}`);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 dark:via-black">
      <div className="text-center">
        <Skeleton className="mx-auto mb-4 h-2 w-40 rounded-full" />
        <p className="text-zinc-500">Redirecting...</p>
      </div>
    </div>
  );
}
