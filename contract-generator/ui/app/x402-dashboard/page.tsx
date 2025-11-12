"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TreasuryActivityFeed } from "@/components/x402/treasury-activity-feed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RevenueModel = 'equal' | 'weighted';

interface NFTCollection {
  mintAddress: string;
  name: string;
  symbol: string;
  totalSupply: number;
  imageUrl: string;
  imageType: 'image' | 'video';
  revenueModel: RevenueModel;
  treasuryWallet: string;
  totalDistributed: number;
  lastDistribution: string;
  holderCount: number;
  latestTx: string | null;
  history: Array<{
    txSignature: string | null;
    totalAmount: number;
    recipients: number;
    timestamp: number;
    amountPerHolder: number;
  }>;
}

/**
 * x402 Revenue Distribution Dashboard
 * 
 * Where artists/creators come to:
 * - View their x402-enabled NFTs
 * - Distribute revenue to holders
 * - View distribution history
 * - See statistics
 */

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export default function X402DashboardPage() {
  const [viewMode, setViewMode] = useState<'stats' | 'treasury'>('treasury');

  const metaBrickTreasury = "3BTEJ9uANDQ5DqSZwmjQm2CsnGuofojBgViKRpVZco5X";
  const X402_API_URL = process.env.NEXT_PUBLIC_X402_API_URL || 'http://localhost:4000';
  const LAMPORTS_PER_SOL = 1_000_000_000;
  const nftSeedRef = useRef<NFTCollection[]>([
    {
      mintAddress: "8b7jJB3QsyR1z7odturFSXR33g7FcWpyCTKjpXcfbNTb",
      name: "MetaBrick x402 Legendary Yield",
      symbol: "MBRICK",
      totalSupply: 432,
      imageUrl: "/metabrick-legendary.png",
      imageType: "image",
      revenueModel: "equal",
      treasuryWallet: metaBrickTreasury,
      totalDistributed: 0,
      lastDistribution: "No distributions yet",
      holderCount: 0,
      latestTx: null,
      history: []
    },
    {
      mintAddress: "DHWmpxk8A64geR3FgFPe8cEHRtsFdPJzTRb37svzfndD",
      name: "MetaBrick x402 Regular Yield (not active)",
      symbol: "MBRICK",
      totalSupply: 1,
      imageUrl: "/metabrick-regular.png",
      imageType: "image",
      revenueModel: "equal",
      treasuryWallet: metaBrickTreasury,
      totalDistributed: 0,
      lastDistribution: "No distributions yet",
      holderCount: 0,
      latestTx: null,
      history: []
    }
  ]);

  const [nftHolders, setNftHolders] = useState<NFTCollection[]>(() => nftSeedRef.current);
  const [selectedNFT, setSelectedNFT] = useState<string | null>(
    nftSeedRef.current[0]?.mintAddress ?? null
  );

  const buildTotalsMap = (nfts: typeof nftSeedRef.current) => {
    const totals: Record<string, number> = {};
    nfts.forEach((nft) => {
      totals[nft.mintAddress] = nft.totalDistributed || 0;
    });
    return totals;
  };

  const previousTotalsRef = useRef<Record<string, number>>(buildTotalsMap(nftSeedRef.current));
  const displayedTotalsRef = useRef<Record<string, number>>(buildTotalsMap(nftSeedRef.current));
  const [displayedTotals, setDisplayedTotals] = useState<Record<string, number>>(
    () => buildTotalsMap(nftSeedRef.current)
  );

  const [revenuePulse, setRevenuePulse] = useState<Record<string, boolean>>({});
  const [aggregatePulse, setAggregatePulse] = useState(false);

  const aggregatePreviousRef = useRef<number>(
    nftSeedRef.current.reduce((sum, nft) => sum + (nft.totalDistributed || 0), 0)
  );

  const aggregateRevenueActual = nftHolders.reduce(
     (sum, nft) => sum + (nft.totalDistributed || 0),
     0
   );
   const displayedAggregateRevenue = nftHolders.reduce(
     (sum, nft) => sum + (displayedTotals[nft.mintAddress] ?? 0),
     0
   );
 
  const allDistributions = nftHolders
    .flatMap((nft) =>
      (nft.history ?? []).map((dist) => ({
        tx: dist.txSignature,
        label: nft.name,
        amount: dist.totalAmount / LAMPORTS_PER_SOL,
        recipients: dist.recipients,
        timestamp: dist.timestamp,
      }))
    )
    .filter((entry) => entry.tx)
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  const latestPayout = allDistributions[0] ?? null;
  const latestTransactions = allDistributions.slice(0, 5);

  const setDisplayedTotal = useCallback((mintAddress: string, value: number) => {
    displayedTotalsRef.current[mintAddress] = value;
    setDisplayedTotals((prev) => ({
      ...prev,
      [mintAddress]: value,
    }));
  }, []);

  const fetchX402Data = useCallback(async () => {
    try {
      const baseCollections = nftSeedRef.current;
      const updatedCollections = await Promise.all(
        baseCollections.map(async (base) => {
          let totalDistributed = base.totalDistributed;
          let holderCount = base.holderCount;
          let lastDistribution = base.lastDistribution;
          let latestTx = base.latestTx;
          let history: NFTCollection['history'] = base.history ?? [];

          try {
            const statsResponse = await fetch(`${X402_API_URL}/api/x402/stats/${base.mintAddress}`);
            if (statsResponse.ok) {
              const statsJson = await statsResponse.json();
              const stats = statsJson?.stats;
              if (stats) {
                if (typeof stats.totalDistributed === 'number') {
                  totalDistributed = stats.totalDistributed;
                }
                if (typeof stats.holderCount === 'number') {
                  holderCount = stats.holderCount;
                }
                if (Array.isArray(stats.distributions) && stats.distributions.length > 0) {
                  const mostRecent = stats.distributions[0];
                  if (mostRecent?.timestamp) {
                    lastDistribution = formatTimestamp(mostRecent.timestamp);
                  }
                }
              }
            }
          } catch (error) {
            console.warn('Failed to load x402 stats', error);
          }

          try {
            const historyResponse = await fetch(
              `${X402_API_URL}/api/x402/history/${base.mintAddress}?limit=10`
            );
            if (historyResponse.ok) {
              const historyJson = await historyResponse.json();
              const distributions = historyJson?.distributions ?? [];
              history = distributions.map((dist: any) => ({
                txSignature: dist.txSignature ?? dist.tx_signature ?? null,
                totalAmount: dist.totalAmount ?? dist.amount ?? 0,
                recipients: dist.recipients ?? 0,
                timestamp: dist.timestamp ?? 0,
                amountPerHolder: dist.amountPerHolder ?? 0,
              }));

              if (history.length > 0) {
                const latest = history[0];
                if (latest.timestamp) {
                  lastDistribution = formatTimestamp(latest.timestamp);
                }
                if (latest.txSignature) {
                  latestTx = latest.txSignature;
                }
              }
            }
          } catch (error) {
            console.warn('Failed to load x402 history', error);
          }

          return {
            ...base,
            totalDistributed,
            holderCount,
            lastDistribution,
            latestTx,
            history,
          };
        })
      );

      nftSeedRef.current = updatedCollections;
      setNftHolders(updatedCollections);
    } catch (error) {
      console.error('Error fetching x402 data', error);
    }
  }, []);

  useEffect(() => {
    void fetchX402Data();
    const intervalId = setInterval(fetchX402Data, 15000);
    return () => clearInterval(intervalId);
  }, [fetchX402Data]);
 
  const runDemoPayout = useCallback(() => {
    const increments = [0.0032, 0.0016, 0.0009];
    const now = new Date();
    const formattedTimestamp = now.toISOString().replace("T", " ").replace("Z", " UTC");

    setNftHolders((prev) =>
      prev.map((nft, index) => {
        const increment = increments[index] ?? 0.0005;
        if (increment <= 0) {
          return nft;
        }

        const nextTotal = Number((nft.totalDistributed + increment).toFixed(4));
        return {
          ...nft,
          totalDistributed: nextTotal,
          lastDistribution: nextTotal > 0 ? formattedTimestamp : nft.lastDistribution,
          latestTx: `DEMO_${now.getTime()}_${index}`,
        };
      })
    );
  }, []);

  useEffect(() => {
    const previous = previousTotalsRef.current;
    const updates: Record<string, boolean> = {};
    const timeoutIds: Array<ReturnType<typeof setTimeout>> = [];

    nftHolders.forEach((nft) => {
      const previousValue = previous[nft.mintAddress] ?? 0;
      const currentValue = nft.totalDistributed || 0;

      if (currentValue > previousValue) {
        updates[nft.mintAddress] = true;
        const timeoutId = setTimeout(() => {
          setRevenuePulse((current) => ({
            ...current,
            [nft.mintAddress]: false,
          }));
        }, 1800);
        timeoutIds.push(timeoutId);
      }

      previous[nft.mintAddress] = currentValue;
    });

    if (Object.keys(updates).length > 0) {
      setRevenuePulse((current) => ({
        ...current,
        ...updates,
      }));
    }

    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, [nftHolders]);

  useEffect(() => {
    const intervals: Array<ReturnType<typeof setInterval>> = [];

    nftHolders.forEach((nft) => {
      const target = nft.totalDistributed || 0;
      const currentDisplayed = displayedTotalsRef.current[nft.mintAddress] ?? 0;

      if (target === currentDisplayed) {
        return;
      }

      if (target <= currentDisplayed) {
        setDisplayedTotal(nft.mintAddress, Number(target.toFixed(6)));
        return;
      }

      const duration = 1200;
      const stepMs = 1000 / 60;
      let elapsed = 0;
      const startValue = currentDisplayed;
      const change = target - startValue;

      const intervalId = setInterval(() => {
        elapsed += stepMs;
        const progress = Math.min(elapsed / duration, 1);
        const value = startValue + change * progress;
        setDisplayedTotal(nft.mintAddress, Number(value.toFixed(6)));

        if (progress >= 1) {
          clearInterval(intervalId);
        }
      }, stepMs);

      intervals.push(intervalId);
    });

    return () => {
      intervals.forEach(clearInterval);
    };
  }, [nftHolders, setDisplayedTotal]);

  useEffect(() => {
    const previousTotal = aggregatePreviousRef.current;
    const nextTotal = aggregateRevenueActual;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (nextTotal > previousTotal) {
      setAggregatePulse(true);
      timeoutId = setTimeout(() => {
        setAggregatePulse(false);
      }, 1800);
    }

    aggregatePreviousRef.current = nextTotal;

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [aggregateRevenueActual]);

  const selectedNFTData = nftHolders.find(nft => nft.mintAddress === selectedNFT);

  return (
    <>
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--accent)] transition mb-4"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Contract Generator
          </Link>
          <div className="flex items-center gap-4 mb-2">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(79,70,229,0.12)] border border-[rgba(129,140,248,0.35)] text-2xl">
              💠
            </span>
            <div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-[var(--accent)] via-purple-400 to-blue-400 text-transparent bg-clip-text drop-shadow-[0_0_20px_rgba(79,70,229,0.35)]">
                  yNFT Treasury
                </span>
              </h1>
              <p className="text-sm uppercase tracking-[0.4em] text-[var(--muted)]/80 mt-2">
                MetaBricks Revenue Streams
              </p>
            </div>
          </div>
          <p className="text-[var(--muted)]">
            Track how Smart Contract Generator fees are flowing directly to MetaBricks holders via x402.
          </p>
        </div>

        {/* How It Works */}
        <details className="mb-8 rounded-2xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] px-6 py-5 text-sm text-[var(--color-foreground)]">
          <summary className="cursor-pointer text-base font-semibold text-[var(--accent)]">
            ⚙️ How SC-Gen revenue reaches MetaBricks holders
          </summary>
          <div className="mt-4 space-y-3 text-[var(--muted)]">
            <p>
              Every time a developer runs the Smart Contract Generator, a portion of the fee is
              routed through the x402 payment engine and paid out to MetaBricks holders on Solana.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <span className="text-[var(--color-foreground)] font-medium">Developer pays SC-Gen:</span>
                transaction signatures are captured by the API.
              </li>
              <li>
                <span className="text-[var(--color-foreground)] font-medium">SC-Gen hits the x402 webhook:</span>
                we forward the mint address of the MetaBrick tied to that revenue stream.
              </li>
              <li>
                <span className="text-[var(--color-foreground)] font-medium">x402 service distributes funds:</span>
                it signs a real Solana transfer, sending SOL from the devnet treasury
                (`{metaBrickTreasury}`) to every current holder.
              </li>
              <li>
                <span className="text-[var(--color-foreground)] font-medium">Holders receive on-chain yield:</span>
                revenue lands in wallets instantly; every payout is visible on Solscan.
              </li>
            </ol>
            <p>
              Use the dashboard below to inspect collections, run manual payouts, or validate
              the latest transactions.
            </p>
          </div>
        </details>

        <div className="mb-10 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={runDemoPayout}
            className="text-sm"
          >
            Trigger Demo Distribution Animation
          </Button>
          <p className="text-xs text-[var(--muted)]">
            Watch the cards flash a green <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold align-middle">+</span> and totals tick up when fresh yield hits wallets.
          </p>
        </div>

        {/* Platform Overview */}
        <div className="mb-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] p-5">
            <div className="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">
              Platform Revenue Shared
            </div>
            <div
              className={`flex items-center gap-3 text-3xl font-semibold transition-colors duration-300 ${
                aggregatePulse ? 'text-emerald-300' : 'text-[var(--accent)]'
              }`}
            >
              {displayedAggregateRevenue.toFixed(4)} SOL
              {aggregatePulse && (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-base font-bold animate-bounce">
                  +
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Total SC-Gen earnings already swept into MetaBricks yield wallets.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] p-5">
            <div className="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">
              Latest Payout
            </div>
            {latestPayout ? (
              <>
                <div className="text-base font-semibold text-[var(--color-foreground)]">
                  {formatTimestamp(latestPayout.timestamp)}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {latestPayout.amount.toFixed(4)} SOL • Distributed to {latestPayout.recipients} holder{latestPayout.recipients === 1 ? '' : 's'}
                </div>
                <Link
                  href={`https://solscan.io/tx/${latestPayout.tx}?cluster=devnet`}
                  target="_blank"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                >
                  View on Solscan
                  <svg className="w-3 h-3" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                    <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </Link>
              </>
            ) : (
              <div className="text-base font-semibold text-[var(--color-foreground)]">
                No payouts yet
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] p-5">
            <div className="text-sm text-[var(--muted)] mb-2 uppercase tracking-wide">
              MetaBricks Treasury
            </div>
            <div className="font-mono text-sm text-[var(--accent)] break-all">
              {metaBrickTreasury}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              All SC-Gen platform earnings land here before fanning out to holders.
            </p>
          </div>
        </div>

        {/* NFT Selection Grid */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Metabricks yNFT Collections</h2>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {nftHolders.map((nft) => (
              <button
                key={nft.mintAddress}
                onClick={() => setSelectedNFT(nft.mintAddress)}
                className={`
                  relative overflow-hidden rounded-2xl border p-6 text-left transition-all duration-300
                  ${selectedNFT === nft.mintAddress
                    ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/50 shadow-[0_20px_50px_rgba(34,211,238,0.25)]'
                    : 'border-[var(--color-card-border)]/60 hover:border-[var(--accent)]/50'
                  }
                `}
              >
                <div className="relative">
                  {/* NFT Image/Video */}
                  <div className="mb-4 aspect-square overflow-hidden rounded-xl bg-[var(--color-card-background)]">
                    {nft.imageType === 'video' ? (
                      <video 
                        src={nft.imageUrl} 
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img 
                        src={nft.imageUrl} 
                        alt={nft.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>

                  {/* NFT Info */}
                  <h3 className="text-lg font-semibold mb-1">{nft.name}</h3>
                  <p className="text-sm text-[var(--muted)] mb-3">
                    {nft.symbol} • {nft.totalSupply} total supply
                  </p>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg bg-[var(--color-card-background)]/50 p-2">
                      <div className="text-[var(--muted)]">Total Distributed</div>
                      <div
                        className={`flex items-center gap-2 text-lg font-semibold transition-colors duration-300 ${
                          revenuePulse[nft.mintAddress] ? 'text-emerald-300' : 'text-[var(--accent)]'
                        }`}
                      >
                        {(displayedTotals[nft.mintAddress] ?? 0).toFixed(4)} SOL
                        {revenuePulse[nft.mintAddress] && (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-sm font-bold animate-bounce">
                            +
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg bg-[var(--color-card-background)]/50 p-2">
                      <div className="text-[var(--muted)]">Holders</div>
                      <div className="text-lg font-semibold text-[var(--accent)]">
                        {nft.holderCount}
                      </div>
                    </div>
                  </div>

                  {/* Last Distribution */}
                  <div className="mt-3 pt-3 border-t border-[var(--color-card-border)]/30 text-xs text-[var(--muted)]">
                    Last distribution: {nft.lastDistribution}
                  </div>
                </div>
              </button>
            ))}

            {/* Add More Placeholder */}
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-[var(--color-card-border)]/60 p-6 min-h-[400px]">
              <div className="text-center">
                <svg 
                  className="w-12 h-12 mx-auto mb-3 text-[var(--muted)]" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <p className="text-sm text-[var(--muted)]">
                  Launch more MetaBricks to expand yield capacity
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Selected NFT Actions */}
        {selectedNFT && selectedNFTData && (
          <div className="rounded-2xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] p-6">
            {/* View Mode Toggle */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">
                {selectedNFTData.name}
              </h2>
              
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'treasury' ? 'default' : 'outline'}
                  onClick={() => setViewMode('treasury')}
                  className="text-sm"
                >
                  Treasury Activity
                </Button>
                <Button
                  variant={viewMode === 'stats' ? 'default' : 'outline'}
                  onClick={() => setViewMode('stats')}
                  className="text-sm"
                >
                  Statistics
                </Button>
              </div>
            </div>

            {/* Content */}
            {viewMode === 'treasury' ? (
              <div>
                <TreasuryActivityFeed
                   treasuryWallet={selectedNFTData.treasuryWallet}
                   nftName={selectedNFTData.name}
                   mintAddress={selectedNFTData.mintAddress}
                   x402ApiUrl={X402_API_URL}
                   solanaRpcUrl={process.env.NEXT_PUBLIC_SOLANA_RPC_URL}
                 />
              </div>
            ) : viewMode === 'stats' ? (
              <div className="grid gap-6 md:grid-cols-2">
                 <Card className="bg-[var(--color-card-background)] border border-[var(--color-border)]/50">
                   <CardHeader>
                     <CardTitle className="text-lg">Statistics</CardTitle>
                     <CardDescription>Coming soon</CardDescription>
                   </CardHeader>
                   <CardContent>
                     <p>This section will display detailed statistics for the selected NFT collection.</p>
                   </CardContent>
                 </Card>
              </div>
            ) : null}
          </div>
        )}

        {/* No Selection State */}
        {!selectedNFT && (
          <div className="text-center py-16">
            <svg 
              className="w-16 h-16 mx-auto mb-4 text-[var(--muted)]" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            <h3 className="text-xl font-semibold mb-2">
              Select an NFT Collection
            </h3>
            <p className="text-[var(--muted)]">
              Choose a MetaBricks yNFT above to review treasury activity and stats
            </p>
          </div>
        )}

        {/* Global Transaction History */}
        <div className="mt-12 rounded-2xl border border-[var(--color-card-border)]/60 bg-[rgba(8,12,28,0.85)] p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-[var(--color-foreground)]">
              Latest On-Chain Revenue Distributions
            </h2>
            <Link
              href="https://solscan.io/address/3BTEJ9uANDQ5DqSZwmjQm2CsnGuofojBgViKRpVZco5X?cluster=devnet"
              target="_blank"
              className="text-xs text-[var(--accent)] hover:underline"
            >
              View treasury on Solscan
            </Link>
          </div>

          {latestTransactions.length === 0 ? (
            <div className="text-sm text-[var(--muted)]">
              No distributions recorded yet. Run a payout to see the Solana transactions here.
            </div>
          ) : (
            <div className="space-y-3">
              {latestTransactions.map((entry) => (
                <div
                  key={entry.tx}
                  className="flex items-center justify-between rounded-xl border border-[var(--color-card-border)]/40 bg-[rgba(6,10,24,0.7)] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">
                      {entry.label}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {formatTimestamp(entry.timestamp)} • {entry.recipients} holder{entry.recipients === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--accent)]">
                      {entry.amount.toFixed(4)} SOL
                    </p>
                    <Link
                      href={`https://solscan.io/tx/${entry.tx}?cluster=devnet`}
                      target="_blank"
                      className="text-[10px] text-[var(--accent)] hover:underline"
                    >
                      {entry.tx.slice(0, 12)}...
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  </>
  );
}

