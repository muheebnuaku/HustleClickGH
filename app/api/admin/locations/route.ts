export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET — the countries, regions and cities our users actually have, with how many
// people are in each. Feeds the location pickers (project targeting, leaders).
// Spelling variants ("accra" / "Accra ") are merged under the most common form.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const rows = await prisma.user.groupBy({
    by: ["country", "region", "city"],
    where: { role: { in: ["user", "manager"] }, country: { not: null } },
    _count: { _all: true },
  });

  const key = (s: string) => s.trim().toLowerCase().replace(/\s+region$/, "").replace(/\s+/g, " ");
  type Agg = { label: Map<string, number>; count: number; country?: string; region?: string };
  const countries = new Map<string, Agg>(), regions = new Map<string, Agg>(), cities = new Map<string, Agg>();
  const bump = (m: Map<string, Agg>, k: string, raw: string, n: number, extra: Partial<Agg> = {}) => {
    const a = m.get(k) ?? { label: new Map(), count: 0, ...extra };
    a.count += n;
    a.label.set(raw.trim(), (a.label.get(raw.trim()) ?? 0) + n);
    m.set(k, a);
  };
  const best = (a: Agg) => Array.from(a.label.entries()).sort((x, y) => y[1] - x[1])[0][0];

  for (const r of rows) {
    const n = r._count._all;
    if (!r.country?.trim()) continue;
    const c = key(r.country);
    bump(countries, c, r.country, n);
    if (r.region?.trim()) bump(regions, `${c}|${key(r.region)}`, r.region, n, { country: c });
    if (r.city?.trim()) bump(cities, `${c}|${key(r.city)}`, r.city, n, { country: c, region: r.region ? key(r.region) : undefined });
  }
  const countryName = new Map(Array.from(countries.entries()).map(([k, a]) => [k, best(a)]));
  const regionName = new Map(Array.from(regions.entries()).map(([k, a]) => [k, best(a)]));

  const sorted = <T extends { count: number; name: string }>(l: T[]) => l.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return NextResponse.json({
    countries: sorted(Array.from(countries.entries()).map(([k, a]) => ({ name: countryName.get(k)!, count: a.count }))),
    regions: sorted(Array.from(regions.values()).map((a) => ({ name: best(a), country: countryName.get(a.country!)!, count: a.count }))),
    cities: sorted(Array.from(cities.values()).map((a) => ({
      name: best(a),
      country: countryName.get(a.country!)!,
      region: a.region ? regionName.get(`${a.country}|${a.region}`) ?? null : null,
      count: a.count,
    }))),
  });
}
