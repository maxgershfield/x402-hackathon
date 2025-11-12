# Smart Contract Generator (SC-Gen)

Monorepo layout containing the SC-Gen API, x402 distribution service hooks, and the Next.js frontend.

```
contract-generator/
├── api/   # .NET 9 backend (was SmartContractGenerator/)
└── ui/    # Next.js 13 frontend (was contract-generator-ui/)
```

## Quick Start

```bash
# API
cd contract-generator/api/src/SmartContractGen/ScGen.API
dotnet restore
dotnet run    # http://localhost:5000

# UI
cd contract-generator/ui
npm install
npm run dev   # http://localhost:3000 (or 3002 if you prefer)
```

## Integrations

- x402 webhook: `appsettings.json -> X402:DistributionWebhookUrl`
- NFT mint metadata: see `x402/X402_SCGEN_REVENUE_TO_NFT_YIELD.md`
- Frontend components for distribution receipts: `ui/hooks/use-x402-distribution.ts`

