# yNFT Lite Paper  
**Yield NFTs for Revenue-Sharing Real-World Assets**

---

## 1. Executive Summary
yNFTs bring predictable yield to non-fungible assets by wiring operational revenue directly to token holders. Built on the OASIS NFT API and the x402 payment protocol, yNFTs transform static collectibles into fractionalized revenue streams that any business can issue without writing smart contracts. Our pilot implementation, **MetaBricks yNFTs**, demonstrates how a simple Solana collection can participate in a treasury-backed revenue cycle driven by the Smart Contract Generator platform.

---

## 2. Why yNFTs Matter for Real-World Assets (RWAs)
- **Turn static ownership into active income**: When real estate, invoices, IP, or in-game assets are represented as NFTs, yNFTs layer yield on top by forwarding cash flow (in SOL or other assets) to holders.
- **Compliance-aware distribution**: Leveraging x402’s webhook model, distributions can include KYC/AML hooks, allowlists, or tax reporting without rewriting on-chain logic.
- **Composable with existing businesses**: Any revenue event—subscription fees, license payments, API usage—can route through the yNFT treasury layer, giving holders transparent, auditable returns.
- **Instant tradability**: Unlike traditional securities, yNFT fractions remain liquid. Holders can exit their position on NFT marketplaces while still collecting pro rata yield up to the point of sale.

---

## 3. System Architecture

```
Customer Wallet → Smart Contract Generator UI (Next.js)
    ↳ Initiates SOL payment via Phantom → ScGen API (.NET)
        ↳ Verifies on-chain tx (QuickNode RPC) and mints credits
        ↳ Fires x402 webhook with pack metadata + NFT mint
            ↳ x402 Service (Node.js)
                • Queries yNFT holder list via OASIS NFT API
                • Calculates platform + treasury + per-holder shares
                • Executes SOL transfers to holders (or fallback mock mode)
                • Logs history/feed for front-end telemetry
        ↳ Credits unlock contract generation/compilation/deployment
    ↳ Front-end dashboards (Treasury + Mini Console) surface live data
Treasury Wallet (Solana) ← Receives platform fee + reserves
Distribution Wallets ← Holders of MetaBricks yNFTs
```

**Key components**

| Layer | Role | Reference |
| --- | --- | --- |
| OASIS NFT API | Mints and manages yNFT collections with x402 metadata extensions. | `metabricks-nft-api/` |
| Smart Contract Generator | “Business” front-end + API where customers purchase credits. | `contract-generator/ui/`, `contract-generator/api/` |
| x402 Payment Protocol | Receives webhook, queries holders, pays out SOL. | `x402/backend-service/` |
| Treasury Layer | Tracks balances, platform fees, historical distributions. | `contract-generator/ui/app/x402-dashboard/page.tsx`, `x402/backend-service/src/storage/` |

---

## 4. Creating yNFTs with the OASIS NFT API
We use the OASIS NFT API (C# minimal service) to mint Solana NFTs pre-configured for x402 distributions.

1. **Mint assets**  
   Run `dotnet run` from `metabricks-nft-api/` to mint MetaBricks NFTs on devnet. Metadata includes:
   - yNFT branding (`yNFT`, `MetaBricks`)
   - x402 configuration (webhook URL, revenue model)
   - IPFS-hosted images (or static assets copied into `contract-generator/ui/public/`)
2. **Register collection for x402**  
   The x402 service loads metadata and records collection settings in `src/storage/x402-config.json`. Each entry specifies `paymentUrl`, `treasuryWallet`, and revenue model (e.g. `equal_split`).
3. **Fractional ownership**  
   Each minted NFT can be fractionalized via supply or by representing unique classes (e.g., Legendary vs Regular bricks). Additional metadata scripts in `x402/metabricks-integration/` show how to upload or update token JSON.

---

## 5. x402 Protocol Integration

**Webhook payload (from ScGen API to x402)**

```json
{
  "operation": "purchase-credits",
  "amountLamports": 1000000000,
  "payer": "<wallet>",
  "signature": "<solana_tx_signature>",
  "nftMintAddress": "8b7jJB3QsyR1z7odturFSXR33g7FcWpyCTKjpXcfbNTb",
  "metadata": {
    "packName": "Enterprise",
    "credits": 500
  }
}
```

**Distribution flow**
1. `X402PaymentService.cs` verifies the SOL transaction via QuickNode RPC (handles string/object formats in Solana JSON—see `VerifyTransactionOnChain` updates).
2. `TriggerDistributionWebhook` posts to the x402 backend with `nftMintAddress`, credit metadata, and platform fee %.  
3. `X402PaymentDistributor.js` (Node) loads holder list by invoking the OASIS NFT API or Solana RPC.
4. On-chain transfer: calculates lamports for each holder (`total = SOL paid`, `platformFee = 2.5%`, `treasuryAmount`, remainder to holders). Uses the signer keypair (`devnet-signer.json` placeholder) for `SystemProgram.transfer`.
5. Logs results to `src/storage/x402-distributions.json` for dashboards and historical queries. If RPC fails (rate limits, insufficient funds), falls back to mock mode and records a synthetic signature so UX demos continue.

---

## 6. Smart Contract Generator as the “Business”
The Smart Contract Generator platform simulates a SaaS product monetizing contract compilation:

- **Pricing + checkout** (`ui/lib/x402-payment.ts`, `CreditsPurchaseModal`): pulls pricing tables, prompts Phantom, signs SOL tx.
- **Credit ledger** (`CreditsService.cs`): increments user credits after verifying payment and distribution.
- **Mini Console telemetry** (`MiniConsole` component): streams logs of payment reception, x402 polling, distribution confirmation.
- **Dual consoles**: compile logs (`generate`), deployment logs, and payment logs run in parallel, giving real-time UX.
- **View-only dashboards**:  
  - `x402-dashboard/page.tsx` renders MetaBricks collections, treasury balance, and historical payouts.  
  - `TreasuryActivityFeed.tsx` queries `/api/x402/stats` & `/history`, minimizing direct RPC calls to avoid rate limits.

This setup positions ScGen as a revenue-generating dApp: every SOL payment flows through the same pipeline that any merchant could reuse.

---

## 7. Treasury and Distribution Layer

- **Treasury Wallet (`3BTEJ9uAND...`)** holds platform fees and reserves. UI polls QuickNode to display live balances.
- **Distribution tracking**: x402 service emits JSON entries capturing `totalAmount`, `platformFeeLamports`, `treasuryAmount`, `amountPerHolder`, `txSignature`.
- **Dashboard insights**: Latest payout, holder counts, and history appear on the UI. Images for MetaBricks yNFTs are bundled locally (`ui/public/metabrick-*.png`) to avoid CDN throttling.
- **Mock vs real mode**:  
  - Real payouts require the signer to hold sufficient SOL (e.g., 1 SOL payout needs ≥0.975 SOL after fees).  
  - Mock mode is triggered if RPC is unavailable or signer balance is low, ensuring demos still show state changes.

---

## 8. MetaBricks yNFT Case Study

| Asset | Role | Notes |
| --- | --- | --- |
| Legendary MetaBrick | Premium yNFT with live yield | Image served locally; featured in dashboard card. |
| Regular MetaBrick | Secondary tier (not active) | Visible for differentiating tiers; instructions show how to toggle activity. |
| Treasury Address | `3BTEJ9uAND...` | Receives platform fee share. |
| Holder wallet | Phantom devnet wallet | Receives 0.975 SOL when 1 SOL payment succeeds. |

**Demo flow**
1. User buys compilation credits (Phantom → SOL → ScGen API).
2. API verifies tx, records credits, fires x402 webhook.
3. x402 service hits OASIS NFT API, finds holder set (1 holder in demo).
4. QuickNode RPC submits SOL transfer from signer wallet to holder.
5. Front-end console logs show distribution details; treasury dashboard updates history.

---

## 9. Technical Reference Index

- `contract-generator/api/src/SmartContractGen/ScGen.API/appsettings.json` – sanitized config with placeholders for RPC URLs and secrets.
- `contract-generator/api/src/SmartContractGen/ScGen.Lib/Shared/Services/X402/X402PaymentService.cs` – on-chain verification, webhook trigger.
- `contract-generator/ui/components/x402/treasury-activity-feed.tsx` – live stats/history ingest.
- `x402/backend-service/src/X402Service.js` & `src/distributor/X402PaymentDistributor.js` – payout logic, fallback behavior.
- `x402/backend-service/src/storage/x402-distributions.json` – persisted distribution history (mock + real).
- `metabricks-nft-api/Services/NFTMintingService.cs` – NFT minting orchestrator.
- `x402/metabricks-integration/` – operational scripts and rollout plans.
- Supporting docs: `x402/x402_hackathon_pitch.md`, `x402/X402_SCGEN_END_TO_END.md`, `contract-generator/QUICKSTART_SERVICES.md`.

---

## 10. Compliance, Testing, and Next Steps
- **Compliance hooks**: x402 webhook handlers can optionally check allowlists, run payouts through KYC filters, or throttle by geography before transfer. Future iterations can add attestations into distributions metadata.
- **Testing regimen**:  
  - Unit tests (planned) for `X402PaymentService` verifying asset parsing.  
  - Integration tests with mock RPC (see `X402PaymentDistributor` fallback scenario).  
  - Manual QA scripts in `x402/metabricks-integration/TESTING_INSTRUCTIONS.md`.
- **Roadmap**:
  1. Extend yNFTs to support multiple treasuries and tiered revenue splits per NFT rarity.
  2. Add Move/EVM adapters so x402 yields can stream cross-chain.
  3. Launch public QuickNode-backed endpoints with rate-limiting dashboards.
  4. Package yNFT creation as a one-click flow within Smart Contract Generator.

---

## 11. Conclusion
yNFTs unlock a universal playbook for businesses seeking on-chain revenue sharing. By combining the OASIS NFT API, the x402 distribution protocol, and the Smart Contract Generator platform, we deliver:

- Seamless minting of yield-bearing NFTs,
- Automatic treasury accounting and real-time dashboards,
- Compliance-ready payouts that scale from demos to enterprise RWAs.

MetaBricks yNFTs are the first showcase. The same pattern can extend to tokenized property, digital media royalties, retail loyalty programs, or any asset that benefits from fractionalized cash flow. With this lite paper and the accompanying open-source repository (`https://github.com/maxgershfield/x402-hackathon`), teams can replicate, audit, and expand the yNFT model for their own real-world asset portfolios.

