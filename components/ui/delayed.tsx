"use client";

import { useEffect, useState } from "react";

/**
 * Renders children only if they're still mounted after `ms`. Loading
 * placeholders go inside, so a page that loads quickly never flashes one.
 */
export function Delayed({ ms = 200, children }: { ms?: number; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return show ? <>{children}</> : null;
}
