// Crypto payment details clients pay into (admin-managed, stored in AppSetting).
// Client wallet top-ups are paid in crypto outside the platform; the client
// submits the transaction ID, an admin checks it and confirms the top-up.

import { prisma } from "@/lib/prisma";

export { CRYPTO_ASSETS, CRYPTO_NETWORKS, explorerUrl, type CryptoWallet } from "@/lib/crypto-wallets-shared";
import type { CryptoWallet } from "@/lib/crypto-wallets-shared";

const KEY = "crypto_wallets";

export async function getCryptoWallets(): Promise<CryptoWallet[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return [];
  try {
    const v = JSON.parse(row.value);
    return Array.isArray(v) ? v.filter((w) => w && typeof w.address === "string") : [];
  } catch {
    return [];
  }
}

/** Validate + store the list. Returns an error message, or null when saved. */
export async function saveCryptoWallets(input: unknown): Promise<string | null> {
  if (!Array.isArray(input)) return "Send a list of wallets.";
  const clean: CryptoWallet[] = [];
  for (const raw of input.slice(0, 12)) {
    const w = raw as Partial<CryptoWallet>;
    const asset = String(w.asset ?? "").trim().toUpperCase().slice(0, 12);
    const network = String(w.network ?? "").trim().slice(0, 24);
    const address = String(w.address ?? "").trim();
    if (!asset || !network) return "Each wallet needs a coin and a network.";
    if (!/^[A-Za-z0-9:._-]{20,128}$/.test(address)) return `"${address || "(empty)"}" doesn't look like a wallet address.`;
    clean.push({ id: String(w.id || `${asset}-${network}-${address.slice(-6)}`).slice(0, 60), asset, network, address, note: w.note ? String(w.note).trim().slice(0, 140) : undefined });
  }
  await prisma.appSetting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(clean) }, create: { key: KEY, value: JSON.stringify(clean) } });
  return null;
}
