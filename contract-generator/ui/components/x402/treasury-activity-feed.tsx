/**
 * Treasury Activity Feed
 *
 * Shows near real-time income and distributions for an NFT treasury wallet
 * using x402 distribution history while minimizing direct Solana RPC usage.
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

type TreasuryActivityFeedProps = {
  treasuryWallet: string;
  nftName: string;
  mintAddress: string;
  x402ApiUrl?: string;
  solanaRpcUrl?: string;
};

type Transaction = {
  signature: string;
  timestamp: number;
  type: "income" | "distribution";
  amount: number;
  status: "confirmed" | "pending";
  description: string;
};

const LAMPORTS_PER_SOL = 1_000_000_000;
const REFRESH_INTERVAL = 60_000; // 60 seconds

export function TreasuryActivityFeed({
  treasuryWallet,
  nftName,
  mintAddress,
  x402ApiUrl,
  solanaRpcUrl,
}: TreasuryActivityFeedProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalIncome, setTotalIncome] = useState<number>(0);
  const [totalDistributed, setTotalDistributed] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apiBase = useMemo(
    () => x402ApiUrl ?? process.env.NEXT_PUBLIC_X402_API_URL ?? "http://localhost:4000",
    [x402ApiUrl]
  );

  const rpcEndpoint = useMemo(
    () => solanaRpcUrl ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    [solanaRpcUrl]
  );

  const loadData = useCallback(async () => {
    if (!treasuryWallet || treasuryWallet.length < 32 || !mintAddress) {
      setErrorMessage("Treasury wallet or mint address missing.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [historyRes, statsRes] = await Promise.allSettled([
        fetch(`${apiBase}/api/x402/history/${mintAddress}?limit=20`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        }),
        fetch(`${apiBase}/api/x402/stats/${mintAddress}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        }),
      ]);

      const collectedTransactions: Transaction[] = [];
      let incomeTotal = 0;
      let distributedTotal = 0;

      if (
        historyRes.status === "fulfilled" &&
        historyRes.value.ok
      ) {
        const historyJson = await historyRes.value.json();
        const distributions = historyJson?.distributions ?? [];

        distributions.forEach((dist: any) => {
          const timestamp = typeof dist.timestamp === "number" ? dist.timestamp : Date.now();
          const baseSignature = dist.txSignature ?? `${mintAddress}-${timestamp}`;
          const totalLamports = Number(dist.totalAmount ?? 0);
          const recipients = Number(dist.recipients ?? 0);
          const amountPerHolderLamports = Number(dist.amountPerHolder ?? 0);
          const holderPoolLamports = amountPerHolderLamports * recipients;

          if (totalLamports > 0) {
            const amountSol = totalLamports / LAMPORTS_PER_SOL;
            collectedTransactions.push({
              signature: `${baseSignature}-income`,
              timestamp,
              type: "income",
              amount: amountSol,
              status: "confirmed",
              description: "Revenue received",
            });
            incomeTotal += amountSol;
          }

          if (holderPoolLamports > 0) {
            const amountSol = holderPoolLamports / LAMPORTS_PER_SOL;
            collectedTransactions.push({
              signature: `${baseSignature}-distribution`,
              timestamp,
              type: "distribution",
              amount: amountSol,
              status: "confirmed",
              description: "Distributed to holders",
            });
            distributedTotal += amountSol;
          }
        });
      } else if (historyRes.status === "fulfilled") {
        if (historyRes.value.status === 429) {
          setErrorMessage("Solana RPC rate limit reached. Showing cached data.");
        } else {
          setErrorMessage("Unable to load x402 distribution history.");
        }
      } else {
        setErrorMessage("Failed to request x402 distribution history.");
      }

      if (
        statsRes.status === "fulfilled" &&
        statsRes.value.ok
      ) {
        const statsJson = await statsRes.value.json();
        const stats = statsJson?.stats;
        if (stats?.totalDistributed !== undefined) {
          // Prefer backend aggregate if available (already SOL units)
          incomeTotal = stats.totalDistributed;
        }
      }

      collectedTransactions.sort((a, b) => b.timestamp - a.timestamp);
      setTransactions(collectedTransactions);
      setTotalIncome(incomeTotal);
      setTotalDistributed(distributedTotal);

      try {
        const { Connection, PublicKey } = await import("@solana/web3.js");
        const connection = new Connection(rpcEndpoint, "confirmed");
        const lamports = await connection.getBalance(new PublicKey(treasuryWallet));
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (rpcError: any) {
        console.warn("Failed to fetch treasury balance:", rpcError?.message ?? rpcError);
        if (!errorMessage) {
          setErrorMessage("Unable to refresh treasury balance (RPC rate limit). Showing last known value.");
        }
      }
    } catch (err: any) {
      console.error("Error loading treasury activity:", err);
      setErrorMessage(err?.message ?? "Unexpected error loading treasury activity.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, mintAddress, rpcEndpoint, treasuryWallet, errorMessage]);

  useEffect(() => {
    if (!treasuryWallet || !mintAddress) {
      return;
    }

    void loadData();
    const interval = setInterval(() => {
      void loadData();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [treasuryWallet, mintAddress, loadData]);

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleManualRefresh = () => {
    void loadData();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-foreground)]">Treasury Activity</h3>
          <p className="text-sm text-[var(--muted)]">
            Revenue inflows and x402 distributions for {nftName}
          </p>
        </div>
        <button
          onClick={handleManualRefresh}
          className="text-xs text-[var(--accent)] hover:underline disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs text-orange-200">
          {errorMessage}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
            </svg>
            <span className="text-xs text-[var(--muted)]">Current Balance</span>
          </div>
          <div className="text-2xl font-bold text-[var(--accent)]">{balance.toFixed(4)} SOL</div>
        </div>

        <div className="rounded-xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
            <span className="text-xs text-[var(--muted)]">Total Income</span>
          </div>
          <div className="text-2xl font-bold text-green-400">+{totalIncome.toFixed(4)} SOL</div>
        </div>

        <div className="rounded-xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
            <span className="text-xs text-[var(--muted)]">Total Distributed</span>
          </div>
          <div className="text-2xl font-bold text-orange-400">-{totalDistributed.toFixed(4)} SOL</div>
        </div>
      </div>

      {/* Treasury Wallet Address */}
      <div className="rounded-xl border border-[var(--color-card-border)]/40 bg-[rgba(6,10,24,0.5)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--muted)] mb-1">Treasury Wallet</p>
            <p className="text-sm text-[var(--accent)] font-mono">
              {treasuryWallet.slice(0, 12)}...{treasuryWallet.slice(-12)}
            </p>
          </div>
          <a
            href={`https://solscan.io/account/${treasuryWallet}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            View on Solscan →
          </a>
        </div>
      </div>

      {/* Transaction Timeline */}
      <div className="rounded-2xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] p-6">
        <h4 className="text-base font-semibold text-[var(--color-foreground)] mb-4">Activity Timeline</h4>

        {loading && transactions.length === 0 ? (
          <div className="text-center py-8 text-[var(--muted)]">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full mb-2" />
            <p className="text-sm">Loading transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto mb-3 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-[var(--muted)]">No transactions yet. Payments will appear once revenue flows.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {transactions.map((tx) => (
              <div
                key={tx.signature}
                className={`rounded-lg border p-4 transition-all ${
                  tx.type === "income"
                    ? "border-green-400/40 bg-green-400/5"
                    : "border-orange-400/40 bg-orange-400/5"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {tx.type === "income" ? (
                      <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <polyline points="19 12 12 19 5 12" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <polyline points="5 12 12 5 19 12" />
                      </svg>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-foreground)]">{tx.description}</p>
                      <p className="text-xs text-[var(--muted)]">{formatDate(tx.timestamp)}</p>
                    </div>
                  </div>
                  <div className={`text-right ${tx.type === "income" ? "text-green-400" : "text-orange-400"}`}>
                    <p className="text-lg font-bold">{tx.type === "income" ? "+" : "-"}{tx.amount.toFixed(4)}</p>
                    <p className="text-xs">SOL</p>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-[var(--color-card-border)]/30">
                  <p className="text-xs text-[var(--muted)] font-mono break-all">{tx.signature.replace(/-(income|distribution)$/i, "")}</p>
                  <a
                    href={`https://solscan.io/tx/${tx.signature.replace(/-(income|distribution)$/i, "")}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent)] hover:underline mt-1 inline-block"
                  >
                    View on Solscan →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-xl border border-[var(--color-card-border)]/40 bg-[rgba(6,10,24,0.5)] p-4">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-[var(--accent)] mt-0.5 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            <strong className="text-[var(--color-foreground)]">Complete transparency:</strong> Source payments are logged, holder distributions are tracked, and every transaction links back to Solscan.
          </p>
        </div>
      </div>
    </div>
  );
}

