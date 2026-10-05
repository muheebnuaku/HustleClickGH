// Server-side: turn device GPS coordinates into country / region / city, so a
// contributor's location comes from where their phone actually is rather than
// what they type. zoom=10 = city/town level (finer zooms return neighbourhoods).
// Uses OpenStreetMap Nominatim (free, no key; policy requires
// an identifying User-Agent and low volume — one call per location update).

import { GHANA_REGIONS } from "@/lib/constants";

export interface ResolvedLocation {
  country: string;
  region: string;
  city: string;
}

const UA = "HustleClickGH/1.0 (+https://www.hustleclickgh.com; info@hustleclickgh.com)";

// OSM names Ghana's regions "Greater Accra Region" etc.; store them exactly as
// the rest of the app spells them (lib/constants GHANA_REGIONS).
function normalizeRegion(raw: string, country: string): string {
  const stripped = raw.replace(/\s+region$/i, "").trim();
  if (/ghana/i.test(country)) {
    const match = GHANA_REGIONS.find((r) => r.toLowerCase() === stripped.toLowerCase());
    if (match) return match;
  }
  return stripped;
}

export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedLocation | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=en`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const a = (data?.address ?? {}) as Record<string, string | undefined>;
    const country = a.country?.trim();
    if (!country) return null;
    const regionRaw = a.state || a.region || a.state_district || a.county || "";
    const city = a.city || a.town || a.village || a.municipality || a.suburb || a.city_district || a.county || "";
    return {
      country,
      region: normalizeRegion(regionRaw, country) || country,
      city: city.trim() || normalizeRegion(regionRaw, country) || country,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
