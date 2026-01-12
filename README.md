# Pactory

**Programmable escrow for creator sponsorships**

Pactory is a hackathon project that explores how sponsorship payments can be enforced trustlessly on-chain. Sponsors lock funds into a smart contract, creators deliver content, and payment is released only when agreed conditions are met. If conditions fail or expire, funds are refunded.

This repository contains the full stack:

- A web dashboard for campaign creation and monitoring
- Server routes for verification and settlement
- An Ethereum smart contract that holds escrow and enforces release/refund logic

---

## ✨ Key Features

- **On-chain escrow** – Sponsorship funds are locked in a smart contract, not held by a platform.
- **Condition-based settlement** – Payments are released only when performance criteria are satisfied.
- **Transparent audit trail** – Escrow lifecycle is visible via on-chain events.
- **Abuse-resistant payouts** – Sponsors don’t pay for unverified outcomes.
- **Hackathon-friendly MVP design** – Simple, traceable flows for rapid iteration.

---

## 🧱 Architecture

UI (Next.js)
|
v
/api/create -> create escrow + lock funds
/api/verify -> check off-chain performance conditions
/api/settle -> release or refund based on result
|
v
PactEscrow (Smart Contract)

- Holds sponsor funds
- Enforces conditions
- Releases or refunds

**Flow:**

1. Sponsor creates a campaign and deposits funds.
2. Creator publishes sponsored content.
3. Verification layer checks engagement metrics.
4. Contract releases payment on success or refunds on failure/expiry.
5. UI updates with final escrow state.

---

## ⚙️ Tech Stack

- **Frontend:** Next.js, React, TypeScript
- **Backend:** API routes (Node runtime)
- **Blockchain:** Ethereum (tested on Sepolia)
- **Smart Contracts:** Solidity (PactEscrow)
- **Wallet / RPC:** ethers.js
- **Token:** ERC-20 stablecoin (MNEE)

---

## 🚀 Getting Started

### 1. Clone

```bash
git clone <your-repo-url>
cd pactory
```

### 2. Install

```bash
npm install
forge install
```

### 3. Environment Variables

Create a `.env.local` file:

````env
# RPC + Wallet
SEPOLIA_RPC_URL=...
DEPLOYER_PRIVATE_KEY=...

# Deployed contract
NEXT_PUBLIC_PACT_ESCROW_ADDRESS=0x...

# Token
NEXT_PUBLIC_MNEE_ADDRESS=0x...

### 4. Run Locally

```bash
npm run dev
````

Visit: `http://localhost:3000`

---

## 🔐 Smart Contract

The **PactEscrow** contract is responsible for:

- Holding sponsor funds
- Enforcing agreed conditions
- Releasing payment to creators
- Refunding sponsors on failure or expiration

**Key concept:**

- **Escrowed settlement**: funds move only when conditions are satisfied.

---

## 🧪 Example Flow

1. Sponsor deposits tokens into escrow for a campaign.
2. Creator publishes the sponsored content.
3. Verification checks metrics against the campaign terms.
4. Settlement triggers **release** (success) or **refund** (failure/expiry).
5. Campaign status is visible on-chain and in the dashboard.

---

## 📂 Project Structure

```
src/
  app/
    campaigns/                # Campaign creation + tracking UI
    api/
      create/                 # Escrow creation
      verify/                 # Performance verification
      settle/                 # On-chain settlement
  lib/
    escrowStore.ts            # Campaign state tracking
    abis/                     # Contract ABIs
contracts/
  PactEscrow.sol              # Core escrow logic
```

---

## ⚠️ Limitations

- **Off-chain verification**: engagement metrics are not inherently on-chain.
- **MVP design**: not production-hardened.
- **Single verifier**: no dispute resolution or multi-source attestation yet.

---

## 🔮 What’s Next

- Multi-source verification (multi-oracle)
- Dispute resolution layer
- Creator reputation and scoring
- Cross-platform sponsorship support

---

## 📄 License

MIT
