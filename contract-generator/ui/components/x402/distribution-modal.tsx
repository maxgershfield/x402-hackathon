"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, ExternalLink, X } from "lucide-react";

type DistributionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  nftName: string;
  nftMintAddress: string;
  distribution?: {
    distributionTx?: string;
    fundingTx?: string;
    amountPerHolder?: number;
    totalDistributed?: number;
    recipients?: number;
    platformFee?: number;
    treasuryAmount?: number;
  } | null;
};

const ASCII_PIPE = `
╔═══════════════════════════════════════════════════════╗
║  x402 DISTRIBUTION PIPELINE - LIVE SOL FEED            ║
╠═══════════════════════════════════════════════════════╣
║  SOURCE     ►   SC-GEN Treasury Wallet                ║
║  ROUTER     ►   x402 Payment Engine                   ║
║  SINK       ►   NFT Holder Accounts (Devnet)          ║
╠═══════════════════════════════════════════════════════╣
║  STATUS     ►   TRANSFER COMPLETE                     ║
╚═══════════════════════════════════════════════════════╝`;

const FLOW_FRAMES = [
  "SOURCE ••••••••► ROUTER ▷ ▷ ▷ ▷ ▷ ▷ ▷ HOLDERS",
  "SOURCE ▷ ▷ ▷ ▷ ▷ ROUTER ••••••••► HOLDERS",
  "SOURCE ▷ ▷ ▷ ▷ ▷ ROUTER ▷ ▷ ▷ ▷ ▷ ▷ ▷ HOLDERS",
  "SOURCE ▷ ▷ ▷ ▷ ▷ ROUTER ▷ ▷ ▷ ▷ ▷ ▷ ▷ HOLDERS",
  "SOURCE ▷ ▷ ▷ ▷ ▷ ROUTER ▷ ▷ ▷ ▷ ▷ ▷ ▷ HOLDERS",
];

export function DistributionModal({
  isOpen,
  onClose,
  nftName,
  nftMintAddress,
  distribution,
}: DistributionModalProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % FLOW_FRAMES.length);
    }, 220);

    return () => clearInterval(interval);
  }, [isOpen]);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

  const formattedDistribution = useMemo(() => {
    if (!distribution) {
      return null;
    }

    const toSol = (value?: number | null) =>
      value !== undefined && value !== null ? Number(value).toFixed(6) : "0.000000";

    return {
      total: toSol(distribution.totalDistributed),
      perHolder: toSol(distribution.amountPerHolder),
      recipients: distribution.recipients ?? 0,
      platformFee: toSol(distribution.platformFee),
      treasury: toSol(distribution.treasuryAmount),
      fundingTx: distribution.fundingTx,
      distributionTx: distribution.distributionTx,
    };
  }, [distribution]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-full max-w-md">
      <div className="overflow-hidden rounded-2xl border border-cyan-400/40 bg-[rgba(4,12,24,0.95)] shadow-[0_20px_60px_rgba(10,180,255,0.25)]">
        <div className="flex items-start gap-3 border-b border-cyan-400/20 bg-[rgba(4,12,24,0.9)] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(4,200,255,0.18)] text-cyan-200">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/70">
              x402 Distribution Complete
            </p>
            <h3 className="text-sm font-semibold text-cyan-50">
              {formattedDistribution?.total ?? "0.000000"} SOL to {nftName}
            </h3>
            <p className="text-[11px] text-cyan-200/70">
              {formatNumber(formattedDistribution?.recipients ?? 0)} holders received yield
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-cyan-200/70 transition hover:text-cyan-100"
            aria-label="Close distribution details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-xl border border-cyan-400/20 bg-[rgba(4,12,24,0.8)] p-3 font-mono text-[11px] text-cyan-200/80">
            {FLOW_FRAMES[frameIndex]}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-cyan-100/80">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/60">
                Mint
              </dt>
              <dd className="font-mono text-[11px] text-cyan-100">
                {nftMintAddress.slice(0, 8)}…{nftMintAddress.slice(-6)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/60">
                Per Holder
              </dt>
              <dd className="font-semibold text-cyan-100">
                {formattedDistribution?.perHolder ?? "0.000000"} SOL
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/60">
                Platform Fee
              </dt>
              <dd className="font-semibold text-cyan-100">
                {formattedDistribution?.platformFee ?? "0.000000"} SOL
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/60">
                Treasury
              </dt>
              <dd className="font-semibold text-cyan-100">
                {formattedDistribution?.treasury ?? "0.000000"} SOL
              </dd>
            </div>
          </dl>

          <div className="mt-4 space-y-2">
            {formattedDistribution?.distributionTx && (
              <Link
                href={`https://solscan.io/tx/${formattedDistribution.distributionTx}?cluster=devnet`}
                target="_blank"
                className="flex items-center justify-between rounded-lg border border-cyan-400/20 bg-[rgba(4,12,24,0.75)] px-3 py-2 text-[11px] text-cyan-200/80 transition hover:border-cyan-200/60 hover:text-cyan-100"
              >
                <span>
                  Distribution ·{" "}
                  {formattedDistribution.distributionTx.slice(0, 8)}…
                  {formattedDistribution.distributionTx.slice(-6)}
                </span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
            {formattedDistribution?.fundingTx && (
              <Link
                href={`https://solscan.io/tx/${formattedDistribution.fundingTx}?cluster=devnet`}
                target="_blank"
                className="flex items-center justify-between rounded-lg border border-cyan-400/20 bg-[rgba(4,12,24,0.75)] px-3 py-2 text-[11px] text-cyan-200/80 transition hover:border-cyan-200/60 hover:text-cyan-100"
              >
                <span>
                  Funding · {formattedDistribution.fundingTx.slice(0, 8)}…
                  {formattedDistribution.fundingTx.slice(-6)}
                </span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

