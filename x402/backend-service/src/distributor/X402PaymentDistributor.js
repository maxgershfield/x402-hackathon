/**
 * OASIS Web4 x402 Payment Distribution Service
 * 
 * Handles automatic revenue distribution to NFT holders via x402 protocol
 * Integrated with OASIS API backend
 */

const { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const crypto = require('crypto');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');

class X402PaymentDistributor {
  constructor(config) {
    this.config = config;
    this.connection = new Connection(config.solanaRpcUrl, 'confirmed');
    this.platformFeePercent = config.platformFeePercent ?? 2.5;
    this.signer = null;

    if (!config.useMockData) {
      this.signer = this.loadSigner(config);
    }
    
    console.log('✅ X402PaymentDistributor initialized');
    console.log('   Solana RPC:', config.solanaRpcUrl);
    console.log('   OASIS API:', config.oasisApiUrl);
    console.log('   Platform Fee %:', this.platformFeePercent);
    console.log('   Signer Loaded:', this.signer ? this.signer.publicKey.toBase58() : 'Mock Mode');
  }

  loadSigner(config) {
    try {
      let secretKey = null;

      if (config.signerSecretKey) {
        secretKey = this.parseSecretKey(config.signerSecretKey);
      } else if (config.signerKeypairPath) {
        const resolvedPath = path.resolve(config.signerKeypairPath);
        const raw = fs.readFileSync(resolvedPath, 'utf8');
        secretKey = this.parseSecretKey(raw);
      }

      if (!secretKey) {
        throw new Error('Signer secret key not provided. Set X402_SIGNER_SECRET or X402_SIGNER_KEYPAIR_PATH.');
      }

      return Keypair.fromSecretKey(secretKey);
    } catch (error) {
      console.error('❌ Failed to load signer keypair:', error.message);

      if (!config.useMockData) {
        throw error;
      }

      return null;
    }
  }

  parseSecretKey(rawKey) {
    if (!rawKey) {
      return null;
    }

    const trimmed = rawKey.trim();

    try {
      if (trimmed.startsWith('[')) {
        const arr = JSON.parse(trimmed);
        return Uint8Array.from(arr);
      }

      return Uint8Array.from(bs58.decode(trimmed));
    } catch (error) {
      console.error('❌ Unable to parse signer secret key:', error.message);
      throw error;
    }
  }

  /**
   * Register NFT for x402 revenue distribution
   * Called when NFT is minted with x402 enabled
   */
  async registerNFTForX402(nftMintAddress, paymentEndpoint, revenueModel, treasuryWallet) {
    console.log(`🔧 Registering NFT for x402: ${nftMintAddress}`);
    
    const x402Url = `${paymentEndpoint}?nft=${nftMintAddress}`;
    
    const metadata = {
      x402: {
        enabled: true,
        paymentUrl: x402Url,
        revenueModel: revenueModel,
        treasuryWallet: treasuryWallet,
        distributionEnabled: true,
        protocol: 'x402-v1',
        registeredAt: new Date().toISOString()
      }
    };
    
    // Store in your database (MongoDB via storage-utils)
    try {
      const storageUtils = require('../storage/storage-utils');
      await storageUtils.storeX402Config(nftMintAddress, metadata.x402);
      
      console.log(`✅ NFT registered with x402: ${x402Url}`);
      return { 
        success: true, 
        x402Url,
        status: 'registered'
      };
      
    } catch (error) {
      console.error('❌ Failed to register x402:', error);
      throw error;
    }
  }

  /**
   * Handle incoming x402 payment and distribute to NFT holders
   * Called by webhook when payment is received
   */
  async handleX402Payment(paymentEvent) {
    console.log(`💰 Processing x402 payment: ${paymentEvent.amount} ${paymentEvent.currency || 'SOL'}`);
    console.log(`🎯 Target NFT: ${paymentEvent.metadata?.nftMintAddress || paymentEvent.nftMintAddress || 'unknown'}`);
    
    try {
      // Step 1: Get NFT configuration
      const storageUtils = require('../storage/storage-utils');
      const incomingMintAddress = paymentEvent.metadata?.nftMintAddress || paymentEvent.nftMintAddress;
      const x402Config = incomingMintAddress
        ? await storageUtils.getX402Config(incomingMintAddress)
        : null;

      if (!x402Config || !x402Config.enabled) {
        throw new Error('x402 not enabled for this NFT');
      }

      const effectiveMintAddress = incomingMintAddress || x402Config.nftMintAddress;

      if (!effectiveMintAddress) {
        throw new Error('Unable to determine NFT mint address for distribution.');
      }
      console.log(`📋 NFT config: ${x402Config.revenueModel} model`);
      
      // Step 2: Get all NFT holders from Solana
      const holders = await this.getNFTHolders(effectiveMintAddress);
      
      if (holders.length === 0) {
        throw new Error('No NFT holders found');
      }
      
      console.log(`👥 Found ${holders.length} NFT holders`);
      
      // Step 3: Calculate distribution amounts
      const totalLamports = this.normalizeToLamports(paymentEvent.amount, paymentEvent.currency);
      if (totalLamports <= 0) {
        throw new Error('Payment amount must be greater than zero');
      }

      const distributionPercentage = x402Config.distributionPercentage ?? 100;
      const platformFeeLamports = Math.floor(totalLamports * (this.platformFeePercent / 100));
      const distributableLamports = totalLamports - platformFeeLamports;
      const holderPoolLamports = Math.floor(distributableLamports * (distributionPercentage / 100));
      let treasuryLamports = Math.max(distributableLamports - holderPoolLamports, 0);

      const amountPerHolder = Math.floor(holderPoolLamports / holders.length);
      if (amountPerHolder <= 0) {
        throw new Error('Distribution per holder is below 1 lamport. Increase payment amount.');
      }

      const holderRemainder = holderPoolLamports - (amountPerHolder * holders.length);
      treasuryLamports += holderRemainder;

      console.log('💵 Distribution details:');
      console.log(`   Total: ${(totalLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
      console.log(`   Platform fee: ${(platformFeeLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
      console.log(`   Holder pool: ${(holderPoolLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
      console.log(`   Treasury allocation: ${(treasuryLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
      console.log(`   Per holder: ${(amountPerHolder / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

      let txSignature = null;
      let distributionStatus = this.signer ? 'completed' : 'mock-distribution';

      try {
        txSignature = await this.executeDistribution({
          holders,
          amountPerHolder,
          treasuryLamports,
          treasuryWallet: x402Config.treasuryWallet,
          platformFeeLamports,
          paymentEvent,
          totalLamports
        });
        console.log(`✅ Distribution complete! Tx: ${txSignature}`);
      } catch (distributionError) {
        console.error('❌ On-chain distribution failed, falling back to mock record:', distributionError.message);
        txSignature = this.generateMockSignature();
        distributionStatus = 'mock-distribution';
      }

      // Step 5: Record in database
      await storageUtils.recordX402Distribution({
        nftMintAddress: effectiveMintAddress,
        totalAmount: totalLamports,
        recipients: holders.length,
        amountPerHolder,
        txSignature,
        timestamp: Date.now(),
        status: distributionStatus,
        metadata: {
          operation: paymentEvent.operation || paymentEvent.metadata?.serviceType,
          source: paymentEvent.endpoint || 'sc-gen',
          treasuryAmount: treasuryLamports,
          platformFeeLamports,
          currency: 'LAMPORTS'
        }
      });

      return {
        success: true,
        distributionTx: txSignature,
        recipients: holders.length,
        amountPerHolder: amountPerHolder / LAMPORTS_PER_SOL,
        totalDistributed: holderPoolLamports / LAMPORTS_PER_SOL,
        treasuryAmount: treasuryLamports / LAMPORTS_PER_SOL,
        platformFee: platformFeeLamports / LAMPORTS_PER_SOL,
        status: distributionStatus
      };
 
    } catch (error) {
      console.error('❌ Payment distribution failed:', error);
      throw error;
    }
  }

  normalizeToLamports(amount, currency) {
    if (amount === undefined || amount === null) {
      return 0;
    }

    const numericAmount = Number(amount);

    if (Number.isNaN(numericAmount)) {
      throw new Error(`Invalid payment amount: ${amount}`);
    }

    if (currency && currency.toUpperCase() === 'LAMPORTS') {
      return Math.floor(numericAmount);
    }

    return Math.floor(numericAmount * LAMPORTS_PER_SOL);
  }

  async executeDistribution({ holders, amountPerHolder, treasuryLamports, treasuryWallet }) {
    if (!this.signer) {
      console.warn('⚠️ No signer configured - returning mock signature.');
      return this.generateMockSignature();
    }

    try {
      const transaction = new Transaction();

      holders.forEach(holder => {
        if (amountPerHolder > 0) {
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: this.signer.publicKey,
              toPubkey: new PublicKey(holder.walletAddress),
              lamports: amountPerHolder
            })
          );
        }
      });

      if (treasuryLamports > 0 && treasuryWallet && treasuryWallet !== this.signer.publicKey.toBase58()) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.signer.publicKey,
            toPubkey: new PublicKey(treasuryWallet),
            lamports: treasuryLamports
          })
        );
      }

      if (transaction.instructions.length === 0) {
        throw new Error('No transfer instructions generated for distribution.');
      }

      transaction.feePayer = this.signer.publicKey;

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.signer],
        { commitment: 'confirmed' }
      );

      console.log(`🪙 Transfers confirmed on-chain: ${signature}`);
      return signature;
    } catch (error) {
      console.error('❌ Failed to execute on-chain distribution:', error.message);
      throw error;
    }
  }

  /**
   * Get all current holders of an NFT from Solana blockchain
   */
  async getNFTHolders(nftMintAddress) {
    try {
      console.log(`🔍 Querying NFT holders for: ${nftMintAddress}`);
      
      // For demo/development: return mock holders
      // In production: query Solana blockchain
      if (this.config.useMockData) {
        return this.getMockHolders();
      }
      
      // Query Solana blockchain for actual holders
      const mintPublicKey = new PublicKey(nftMintAddress);
      
      const tokenAccounts = await this.connection.getParsedProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
          filters: [
            {
              dataSize: 165, // Token account size
            },
            {
              memcmp: {
                offset: 0,
                bytes: mintPublicKey.toBase58(),
              },
            },
          ],
        }
      );
      
      const holders = [];
      
      for (const accountInfo of tokenAccounts) {
        try {
          const parsedData = accountInfo.account.data.parsed;
          if (parsedData && parsedData.info.tokenAmount.uiAmount > 0) {
            holders.push({
              walletAddress: parsedData.info.owner,
              tokenAccount: accountInfo.pubkey.toBase58(),
              balance: parsedData.info.tokenAmount.uiAmount
            });
          }
        } catch (error) {
          console.warn('Error parsing token account:', error);
        }
      }
      
      console.log(`✅ Found ${holders.length} holders on-chain`);
      return holders;
      
    } catch (error) {
      console.error('Error querying holders from Solana:', error);
      // Fallback to mock data for demo
      return this.getMockHolders();
    }
  }

  /**
   * Get mock holders for testing/demo
   */
  getMockHolders() {
    const mockHolderCount = 250; // Simulate 250 NFT holders
    const holders = [];
    
    for (let i = 0; i < mockHolderCount; i++) {
      holders.push({
        walletAddress: `MockHolder${i + 1}Wallet${Math.random().toString(36).substring(7)}`,
        tokenAccount: `MockAccount${i + 1}`,
        balance: 1
      });
    }
    
    console.log(`📊 Using ${mockHolderCount} mock holders for demo`);
    return holders;
  }

  /**
   * Get payment statistics for an NFT
   */
  async getPaymentStats(nftMintAddress) {
    try {
      const storageUtils = require('../storage/storage-utils');
      const distributions = await storageUtils.getX402Distributions(nftMintAddress);
      
      const totalDistributed = distributions.reduce((sum, d) => sum + d.totalAmount, 0) / LAMPORTS_PER_SOL;
      const distributionCount = distributions.length;
      
      // Get current holder count
      const holders = await this.getNFTHolders(nftMintAddress);
      
      return {
        nftMintAddress,
        totalDistributed,
        distributionCount,
        holderCount: holders.length,
        averagePerDistribution: distributionCount > 0 ? totalDistributed / distributionCount : 0,
        distributions: distributions.slice(0, 10) // Last 10 distributions
      };
      
    } catch (error) {
      console.error('Error fetching payment stats:', error);
      // Return default stats
      return {
        nftMintAddress,
        totalDistributed: 0,
        distributionCount: 0,
        holderCount: 0,
        averagePerDistribution: 0,
        distributions: []
      };
    }
  }

  /**
   * Generate mock transaction signature for demo
   */
  generateMockSignature() {
    return 'x402_distribution_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * Validate x402 webhook signature
   */
  validateSignature(signature, payload, secret) {
    if (!signature || !secret) {
      console.warn('⚠️  No signature validation (development mode)');
      return true;
    }
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return signature === expectedSignature;
  }
}

module.exports = X402PaymentDistributor;

