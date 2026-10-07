// Currencies for project rewards and field-team payments.
//
// Contributors' own balances (and withdrawals) are always GH₵. A project in any
// other currency must be paid through field-team leaders, who pay their people
// locally — so balances never mix currencies.

export const BASE_CURRENCY = "GHS";

export const CURRENCIES: { code: string; label: string; symbol: string }[] = [
  { code: "GHS", label: "Ghana Cedi", symbol: "GH₵" },
  { code: "MWK", label: "Malawian Kwacha", symbol: "MK" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh" },
  { code: "UGX", label: "Ugandan Shilling", symbol: "USh" },
  { code: "TZS", label: "Tanzanian Shilling", symbol: "TSh" },
  { code: "ZMW", label: "Zambian Kwacha", symbol: "ZK" },
  { code: "RWF", label: "Rwandan Franc", symbol: "FRw" },
  { code: "ZAR", label: "South African Rand", symbol: "R" },
  { code: "XOF", label: "West African CFA Franc", symbol: "CFA" },
  { code: "XAF", label: "Central African CFA Franc", symbol: "FCFA" },
  { code: "SLE", label: "Sierra Leonean Leone", symbol: "Le" },
  { code: "LRD", label: "Liberian Dollar", symbol: "L$" },
  { code: "GMD", label: "Gambian Dalasi", symbol: "D" },
  { code: "ETB", label: "Ethiopian Birr", symbol: "Br" },
  { code: "EGP", label: "Egyptian Pound", symbol: "E£" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function normalizeCurrency(code: unknown): string {
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  return BY_CODE.has(c) ? c : BASE_CURRENCY;
}

export const currencySymbol = (code?: string | null) => BY_CODE.get(normalizeCurrency(code))?.symbol ?? "GH₵";

/** "GH₵12.50", "MK 4,500.00", "$3.00" */
export function formatMoney(amount: number, code?: string | null): string {
  const c = normalizeCurrency(code);
  const n = (Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = currencySymbol(c);
  // Short symbols sit tight to the number; letter codes get a space.
  return /^[^A-Za-z]+$/.test(sym) || c === "GHS" ? `${sym}${n}` : `${sym} ${n}`;
}

/** Sensible default currency for a country name (falls back to GH₵). */
export function currencyForCountry(country?: string | null): string {
  const k = (country || "").trim().toLowerCase();
  const map: Record<string, string> = {
    ghana: "GHS", malawi: "MWK", nigeria: "NGN", kenya: "KES", uganda: "UGX", tanzania: "TZS", zambia: "ZMW",
    rwanda: "RWF", "south africa": "ZAR", senegal: "XOF", "côte d'ivoire": "XOF", "cote d'ivoire": "XOF", "ivory coast": "XOF",
    togo: "XOF", benin: "XOF", "burkina faso": "XOF", mali: "XOF", niger: "XOF", cameroon: "XAF", gabon: "XAF",
    "sierra leone": "SLE", liberia: "LRD", gambia: "GMD", "the gambia": "GMD", ethiopia: "ETB", egypt: "EGP",
    "united states": "USD", usa: "USD", "united kingdom": "GBP", uk: "GBP",
  };
  return map[k] ?? BASE_CURRENCY;
}
