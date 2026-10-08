// Browser-safe crypto payment types, choices and explorer links (no database).

export interface CryptoWallet {
  id: string;
  asset: string; // e.g. USDT, USDC, BTC, ETH
  network: string; // e.g. TRC20, ERC20, BEP20, Bitcoin
  address: string;
  note?: string;
}

export const CRYPTO_ASSETS = ["USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL"];
export const CRYPTO_NETWORKS = ["TRC20", "ERC20", "BEP20", "Polygon", "Solana", "Bitcoin", "Arbitrum", "Base"];

/** Block-explorer link for a transaction hash, when the network is known. */
export function explorerUrl(network: string, txHash: string): string | null {
  const h = encodeURIComponent(txHash.trim());
  switch (network.toLowerCase()) {
    case "trc20": return `https://tronscan.org/#/transaction/${h}`;
    case "erc20": return `https://etherscan.io/tx/${h}`;
    case "bep20": return `https://bscscan.com/tx/${h}`;
    case "polygon": return `https://polygonscan.com/tx/${h}`;
    case "arbitrum": return `https://arbiscan.io/tx/${h}`;
    case "base": return `https://basescan.org/tx/${h}`;
    case "solana": return `https://solscan.io/tx/${h}`;
    case "bitcoin": return `https://mempool.space/tx/${h}`;
    default: return null;
  }
}
