# x402 Hackathon Submission

This bundle captures the full demo implementation we used to showcase **x402 yield streaming into NFTs**. It includes:

- The `contract-generator` product (Next.js UI + .NET API) where users buy credits with SOL and trigger distributions.
- The standalone `x402` backend service that receives webhooks, queries NFT holders, and performs on-chain payouts.
- The `metabricks-nft-api` (C# minimal API) that we used to mint the MetaBricks yNFT collection showcased in the demo.
- All supporting docs: quick start, pitch deck, end-to-end notes, and agent handoff context.

## Repository Layout

| Path | Description |
| ---- | ----------- |
| `contract-generator/` | Next.js front-end (`ui/`) and Smart Contract Generator API (`api/`). Includes `QUICKSTART_SERVICES.md` and `AGENT_HANDOFF_CONTEXT.md`. |
| `x402/backend-service/` | Node.js service that executes the x402 revenue distribution logic. Uses the QuickNode devnet RPC. |
| `x402/docs/` | Reference material, pitch assets, and technical overviews of the x402 protocol. |
| `metabricks-nft-api/` | Minimal ASP.NET API that mints yNFTs (MetaBricks) used in the demo flow. |

## Quick Start

1. Follow `contract-generator/QUICKSTART_SERVICES.md` for the step-by-step startup instructions (x402 backend → .NET API → Next.js UI).
2. Update the Solana RPC settings if needed:  
   - `contract-generator/api/src/SmartContractGen/ScGen.API/appsettings.json` → `X402:SolanaRpcUrl`  
   - `x402/backend-service/src/server.js` (and related files) → `solanaRpcUrl` defaults to the QuickNode endpoint.
3. Run the services:
   ```bash
   # 1. x402 backend (Node.js)
   cd x402/backend-service
   npm install
   SOLANA_RPC_URL=<your rpc> npm run dev

   # 2. Smart Contract Generator API (.NET 9)
   cd contract-generator/api/src/SmartContractGen/ScGen.API
   dotnet restore
   dotnet run

   # 3. Next.js UI
   cd contract-generator/ui
   npm install
   npm run dev
   ```
4. Visit `http://localhost:3001/generate/template` to walk through credit purchase → x402 distribution → dashboard telemetry.

## Minting the yNFT Collection

The MetaBricks yNFT collection (formerly MetaBricks/xNFT) showcased in the demo was minted via the `metabricks-nft-api` project:

```bash
cd metabricks-nft-api
dotnet restore
dotnet run
```

This service exposes the minimal endpoints we used to mint devnet NFTs, upload metadata to IPFS/Pinata, and register collections for x402 yield distribution. You can link the minting flow with the Smart Contract Generator by pointing it at the appropriate webhook URLs documented in `x402/metabricks-integration/`.

## Demo Narrative & Supporting Docs

- Hackathon pitch: `x402/x402_hackathon_pitch.md`
- End-to-end architecture notes: `x402/X402_SCGEN_END_TO_END.md`
- Agent handoff context: `contract-generator/AGENT_HANDOFF_CONTEXT.md`
- Quick start for services: `contract-generator/QUICKSTART_SERVICES.md`
- Metabricks integration guides: `x402/metabricks-integration/`

These documents give judges and future engineers the full context for how x402 brings revenue share to NFTs and how the demo is wired together.

## Next Steps

- Push this folder to a clean public GitHub repo (e.g., `x402-hackathon`) so the judging team can review the code, docs, and run the demo quickly.
- Add your own funded signer keypair JSON at `x402/backend-service/devnet-signer.json` (we intentionally left the sample key out of this bundle).
- When you reproduce the demo, ensure the signer wallet holds enough SOL to cover payouts (1 SOL distribution requires at least 0.975 SOL after fees).
- Replace any devnet credentials or webhook secrets before sharing the repository publicly.

Good luck with the submission, and thanks for showing off x402 yield to the NFT world!

