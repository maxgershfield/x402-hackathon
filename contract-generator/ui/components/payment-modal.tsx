'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, CheckCircle, XCircle, Wallet, ExternalLink, Sparkles } from 'lucide-react';
import {
  getPricing,
  initiatePayment,
  calculateNFTDistribution,
  getNFTHolderCount,
  type Operation,
  type Blockchain,
  type PaymentResponse,
  type PaymentRequirement
} from '@/lib/x402-payment';
import {
  getPhantomWallet,
  isWalletInstalled,
  getWalletBalance,
  type WalletAdapter
} from '@/lib/solana-wallet';
import { formatCredits, getCreditBalance } from '@/lib/credits-client';

interface PaymentModalProps {
  operation: Operation;
  blockchain: Blockchain;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentToken: string) => void;
  onUseCredits?: () => void;
  onBuyCredits?: () => void;
  onWalletConnected?: (walletAddress: string) => void;
  walletAddress?: string | null;
  paymentInfo?: PaymentRequirement | null;
  creditBalance?: number;
}

export function PaymentModal({ 
  operation, 
  blockchain, 
  isOpen, 
  onClose, 
  onSuccess,
  onUseCredits,
  onBuyCredits,
  onWalletConnected,
  walletAddress,
  paymentInfo,
  creditBalance
}: PaymentModalProps) {
  const [wallet, setWallet] = useState<WalletAdapter | null>(null);
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [nftHolders, setNftHolders] = useState<number>(10000);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'paying' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [paymentResult, setPaymentResult] = useState<PaymentResponse | null>(null);
  const [creditsBalance, setCreditsBalance] = useState<number>(paymentInfo?.credits?.current ?? creditBalance ?? 0);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const resolvedOperation: Operation = (paymentInfo?.pricing?.operation as Operation) || operation;
  const resolvedBlockchain: Blockchain = (paymentInfo?.pricing?.blockchain as Blockchain) || blockchain;

  const pricing = useMemo(() => {
    if (paymentInfo?.pricing?.price !== undefined) {
      return {
        operation: resolvedOperation,
        blockchain: resolvedBlockchain,
        price: paymentInfo.pricing.price,
        currency: paymentInfo.pricing.currency ?? 'SOL',
        distributionPercentage: paymentInfo.pricing.distributionPercentage ?? 90,
      };
    }

    return getPricing(resolvedOperation, resolvedBlockchain);
  }, [paymentInfo, resolvedOperation, resolvedBlockchain]);

  const distribution = useMemo(
    () => calculateNFTDistribution(pricing.price, pricing.distributionPercentage ?? 90, nftHolders),
    [pricing.price, pricing.distributionPercentage, nftHolders]
  );

  const requiredCredits = paymentInfo?.credits?.required ?? 0;
  const creditsShortfall = Math.max(requiredCredits - creditsBalance, 0);
  const hasEnoughCredits = requiredCredits > 0 && creditsBalance >= requiredCredits;
  const hasWalletAddress = Boolean(wallet?.publicKey?.toString() || walletAddress);

  const resolvedWalletAddress = useMemo(() => {
    if (wallet?.publicKey) {
      return wallet.publicKey.toString();
    }
    return walletAddress ?? null;
  }, [wallet?.publicKey, walletAddress]);

  useEffect(() => {
    setCreditsBalance(paymentInfo?.credits?.current ?? creditBalance ?? 0);
  }, [paymentInfo, creditBalance]);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMounted, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setStatus('idle');
      setError('');
      setPaymentResult(null);
      return;
    }

    const address = resolvedWalletAddress;
    if (!address || requiredCredits <= 0) {
      return;
    }

    let active = true;
    setCreditsLoading(true);

    getCreditBalance(address)
      .then((credits) => {
        if (!active) return;
        setCreditsBalance(credits);
      })
      .catch(() => {
        if (!active) return;
        // Leave previous creditsBalance
      })
      .finally(() => {
        if (!active) return;
        setCreditsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, resolvedWalletAddress, requiredCredits]);

  const handleConnectWallet = async () => {
    if (!isWalletInstalled()) {
      window.open('https://phantom.app/', '_blank');
      return;
    }

    setStatus('connecting');
    setError('');

    try {
      const phantomWallet = getPhantomWallet();
      if (!phantomWallet) {
        throw new Error('Phantom wallet not found');
      }

      await phantomWallet.connect();
      setWallet(phantomWallet);
      setConnected(true);

      if (phantomWallet.publicKey) {
        const bal = await getWalletBalance(phantomWallet.publicKey);
        setBalance(bal);
        onWalletConnected?.(phantomWallet.publicKey.toString());
      }

      setStatus('idle');
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
      setStatus('error');
    }
  };

  const handlePayment = async () => {
    if (!wallet || !connected) {
      setError('Please connect your wallet first');
      return;
    }

    if (balance < pricing.price) {
      setError(`Insufficient balance. You need ${pricing.price} SOL but have ${balance.toFixed(4)} SOL`);
      return;
    }

    setStatus('paying');
    setError('');

    try {
      const result = await initiatePayment(wallet, resolvedOperation, resolvedBlockchain);
      setPaymentResult(result);
      setStatus('success');
      
      // Call success callback after short delay
      setTimeout(() => {
        onSuccess(result.paymentToken);
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Payment failed');
      setStatus('error');
    }
  };

  const handleUseCredits = () => {
    if (!hasWalletAddress) {
      setError('Connect your wallet to use credits');
      return;
    }
    onUseCredits?.();
  };

  const handleBuyCredits = () => {
    onBuyCredits?.();
  };

  if (!isMounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="glass-card rounded-2xl border border-[var(--card-border)]/60 bg-[rgba(7,10,26,0.95)] shadow-2xl shadow-[var(--accent)]/20 max-w-md w-full p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[var(--foreground)]">Complete Payment</h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Payment Details */}
        <div className="rounded-xl border border-[var(--card-border)]/30 bg-[rgba(5,8,18,0.6)] p-5 mb-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Operation</span>
              <span className="font-semibold text-[var(--foreground)]">
                {resolvedOperation.charAt(0).toUpperCase() + resolvedOperation.slice(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Blockchain</span>
              <span className="font-semibold text-[var(--foreground)]">{resolvedBlockchain}</span>
            </div>
            <div className="border-t border-[var(--card-border)]/30 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-[var(--muted)]">Amount</span>
                <span className="text-3xl font-bold text-[var(--accent)]">
                  {pricing.price} {pricing.currency ?? 'SOL'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Credits Option */}
        {requiredCredits > 0 && (
          <div className="rounded-xl border border-purple-500/40 bg-[rgba(80,45,128,0.15)] p-5 mb-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-purple-200">
                <Sparkles className="w-5 h-5" />
                <span className="font-semibold text-lg text-purple-100">Use Credits Instead</span>
              </div>
              {creditsLoading && <Loader2 className="w-4 h-4 animate-spin text-purple-200" />}
            </div>
            <div className="space-y-3 text-sm text-purple-100/90">
              <div className="flex justify-between">
                <span>Required</span>
                <span className="font-semibold">{formatCredits(requiredCredits)}</span>
              </div>
              <div className="flex justify-between">
                <span>Your balance</span>
                <span className="font-semibold">
                  {hasWalletAddress ? formatCredits(Math.max(creditsBalance, 0)) : 'Connect wallet'}
                </span>
              </div>
              {hasEnoughCredits ? (
                <button
                  onClick={handleUseCredits}
                  className="mt-3 w-full rounded-xl bg-purple-500 hover:bg-purple-400 text-[#041321] font-semibold py-3 px-4 transition-all shadow-lg shadow-purple-500/30"
                >
                  Use {formatCredits(requiredCredits)}
                </button>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-purple-200/80">
                    {hasWalletAddress
                      ? `You need ${formatCredits(creditsShortfall)} more credits to cover this operation.`
                      : 'Connect your wallet to check your credits and use them instantly.'}
                  </p>
                  <button
                    onClick={handleBuyCredits}
                    className="w-full rounded-xl border border-purple-400/50 bg-transparent text-purple-200 font-semibold py-3 px-4 transition-all hover:bg-purple-500/20"
                  >
                    Buy Credit Pack
                  </button>
                  {paymentInfo?.credits?.packs && paymentInfo.credits.packs.length > 0 && (
                    <div className="text-[10px] text-purple-200/70">
                      Starter pack: {paymentInfo.credits.packs[0].credits} credits · {paymentInfo.credits.packs[0].priceSOL} SOL
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* NFT Distribution Info */}
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] backdrop-blur-sm p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="text-3xl">💎</div>
            <div className="flex-1">
              <h3 className="font-semibold text-[var(--foreground)] mb-3 text-lg">
                Revenue Distribution
              </h3>
              <div className="text-sm text-[var(--foreground)] space-y-2">
                <p className="flex items-center gap-2">
                  <span className="text-[var(--accent)]">→</span>
                  {(pricing.distributionPercentage ?? 90)}% to {nftHolders.toLocaleString()} NFT holders
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-[var(--accent)]">→</span>
                  Each holder: {distribution.perHolder.toFixed(6)} SOL
                </p>
                <p className="text-xs pt-3 border-t border-[var(--accent)]/30 text-[var(--muted)]">
                  Want to earn from all API usage? <a href="/mint-nft" className="underline font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80">Mint an NFT</a>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Connection */}
        {!connected && (
          <div className="mb-6">
            <button
              onClick={handleConnectWallet}
              disabled={status === 'connecting'}
              className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent)]/80 text-[#041321] font-semibold py-4 px-6 rounded-xl transition-all shadow-lg shadow-[var(--accent)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'connecting' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5" />
                  {isWalletInstalled() ? 'Connect Phantom Wallet' : 'Install Phantom Wallet'}
                </>
              )}
            </button>
          </div>
        )}

        {/* Wallet Info */}
        {connected && wallet?.publicKey && (
          <div className="mb-6 p-4 rounded-xl border border-[var(--positive)]/40 bg-[rgba(34,197,94,0.1)] backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-[var(--positive)]" />
              <span className="text-sm font-semibold text-[var(--foreground)]">Wallet Connected</span>
            </div>
            <div className="text-xs text-[var(--muted)] space-y-1.5">
              <p className="font-mono truncate text-[var(--accent)]">{wallet.publicKey.toString()}</p>
              <p className="text-[var(--foreground)]">Balance: <span className="font-semibold text-[var(--accent)]">{balance.toFixed(4)} SOL</span></p>
            </div>
          </div>
        )}

        {/* Payment Button */}
        {connected && (
          <button
            onClick={handlePayment}
            disabled={status === 'paying' || status === 'success'}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent)]/80 text-[#041321] font-semibold py-4 px-6 rounded-xl transition-all shadow-lg shadow-[var(--accent)]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'paying' && (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing Payment...
              </>
            )}
            {status === 'success' && (
              <>
                <CheckCircle className="w-5 h-5" />
                Payment Complete!
              </>
            )}
            {status !== 'paying' && status !== 'success' && (
              <>Pay {pricing.price} SOL</>
            )}
          </button>
        )}

        {/* Success Message */}
        {status === 'success' && paymentResult && (
          <div className="mt-4 p-5 rounded-xl border border-[var(--positive)]/40 bg-[rgba(34,197,94,0.1)] backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[var(--positive)]/20">
                <CheckCircle className="w-5 h-5 text-[var(--positive)]" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-[var(--foreground)] mb-1 text-lg">
                  ✅ Payment Successful!
                </p>
                <p className="text-sm text-[var(--positive)] mb-3">
                  Your contract operation will begin shortly.
                </p>
                <a
                  href={`https://explorer.solana.com/tx/${paymentResult.signature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--accent)] hover:text-[var(--accent)]/80 hover:underline flex items-center gap-1 transition-colors"
                >
                  View transaction <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 rounded-xl border border-[var(--negative)]/40 bg-[rgba(239,68,68,0.1)] backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[var(--negative)]/20">
                <XCircle className="w-5 h-5 text-[var(--negative)]" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-[var(--foreground)] mb-1">
                  Payment Failed
                </p>
                <p className="text-sm text-[var(--negative)]">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-6 pt-6 border-t border-[var(--card-border)]/30">
          <p className="text-xs text-[var(--muted)] text-center leading-relaxed">
            Payments powered by <span className="text-[var(--accent)] font-semibold">x402 protocol</span> on Solana
            <br />
            Revenue automatically distributed to NFT holders
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

