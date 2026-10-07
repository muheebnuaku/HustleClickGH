"use client";

// Instant page switches. Pages load their data with fetch() in an effect, so every
// visit used to wait on the network behind a skeleton. This keeps the last answer
// of the main page-load endpoints in memory and, right after an in-app navigation,
// hands it back instantly while a background request refreshes it for next time.
//
// Safety rules:
//  - Only GETs to the endpoints below, only 200 JSON, only up to MAX_AGE old.
//  - Cached answers are used only just after a navigation. Refresh buttons, polling
//    and the first page load always hit the network.
//  - Any write (POST/PUT/PATCH/DELETE to /api, except background pings) clears
//    everything, so you never see data from before your own change.

const CACHEABLE = [
  /^\/api\/dashboard\/stats$/,
  /^\/api\/data-projects$/,
  /^\/api\/profile$/,
  /^\/api\/surveys$/,
  /^\/api\/withdrawals$/,
  /^\/api\/referrals$/,
  /^\/api\/team(\/projects)?$/,
  /^\/api\/admin\/(users|data-projects|teams|organizations|partners|payments|surveys|locations)$/,
  /^\/api\/org\/(projects|wallet|settings|me)$/,
];
// Background traffic that must not wipe the cache.
const IGNORE_WRITES = /^\/api\/(presence|calls|call-signal|signal|push|webauthn|ai|messages\/unread)/;
const MAX_AGE = 60_000; // serve cached data at most a minute old
const NAV_WINDOW = 2_000; // requests within 2s of a navigation count as "page load"

type Entry = { body: string; status: number; type: string; at: number };

declare global {
  interface Window { __hcFastNav?: boolean }
}

if (typeof window !== "undefined" && !window.__hcFastNav) {
  window.__hcFastNav = true;
  const cache = new Map<string, Entry>();
  let generation = 0; // bumped by every write; answers from before a write are dropped
  let lastNav = 0;
  const markNav = () => { lastNav = Date.now(); };
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = window.history[m].bind(window.history);
    window.history[m] = (...args: Parameters<History["pushState"]>) => {
      // replaceState is also used for scroll/state bookkeeping — only URL changes count.
      const next = args[2] != null ? new URL(String(args[2]), location.href).pathname : location.pathname;
      if (m === "pushState" || next !== location.pathname) markNav();
      return orig(...args);
    };
  }
  window.addEventListener("popstate", markNav);

  const realFetch = window.fetch.bind(window);
  const pathOf = (input: RequestInfo | URL) => {
    try {
      const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      return u.origin === location.origin ? { key: u.pathname + u.search, path: u.pathname } : null;
    } catch { return null; }
  };
  const store = async (key: string, res: Response, gen: number) => {
    if (gen !== generation) return;
    const type = res.headers.get("content-type") || "";
    if (res.status !== 200 || !type.includes("application/json")) return;
    try { const body = await res.clone().text(); if (gen === generation) cache.set(key, { body, status: res.status, type, at: Date.now() }); } catch { /* ignore */ }
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const where = pathOf(input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!where || !where.path.startsWith("/api/")) return realFetch(input, init);

    if (method !== "GET") {
      if (!IGNORE_WRITES.test(where.path)) { cache.clear(); generation++; }
      return realFetch(input, init);
    }
    if (!CACHEABLE.some((r) => r.test(where.path)) || init?.cache === "no-store" || init?.cache === "reload") {
      return realFetch(input, init);
    }

    const gen = generation;
    const hit = cache.get(where.key);
    const now = Date.now();
    if (hit && now - hit.at < MAX_AGE && now - lastNav < NAV_WINDOW) {
      // Instant answer; refresh in the background for the next visit.
      realFetch(input, init).then((r) => store(where.key, r, gen)).catch(() => {});
      return new Response(hit.body, { status: hit.status, headers: { "content-type": hit.type } });
    }
    const res = await realFetch(input, init);
    store(where.key, res, gen);
    return res;
  };
}

/** Mounted once in the root layout; importing it installs the cache. */
export function FastNav() {
  return null;
}
