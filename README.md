# Pactory

Pactory is a blockchain-based escrow and verification system for creator sponsorships.  
It ensures that advertisers only pay for _verified engagement_ by locking funds in a smart contract and releasing them automatically once performance conditions are met.

Built for trustless payments, transparent accounting, and abuse-resistant sponsorships.

---

## Problem

Online sponsorships rely on trust:

- Creators may inflate views or engagement.
- Sponsors often pay upfront with little recourse.
- Disputes are subjective and slow to resolve.

There is no neutral, programmable enforcement layer between sponsors and creators.

---

## Solution

Pactory introduces **on-chain escrow with verifiable performance conditions**.

1. Sponsors lock funds in a smart contract.
2. Creators publish sponsored content.
3. Engagement metrics are verified off-chain.
4. Once conditions are satisfied, funds are automatically released.
5. If conditions are not met, funds can be reclaimed.

No manual payouts. No trust assumptions. No opaque intermediaries.

---

## How It Works

### 1. Escrow Creation

A sponsor deposits stablecoins into the `PactEscrow` contract, defining:

- Recipient (creator)
- Required performance metrics (e.g. views, engagement)
- Expiry window

### 2. Verification

An off-chain verification layer checks the content’s performance against the agreed conditions.

### 3. Settlement

- **Success:** funds are released to the creator.
- **Failure / Timeout:** funds return to the sponsor.

All state transitions are recorded on-chain.

---

## Architecture

Sponsor
│
▼
PactEscrow (Smart Contract)
│
├── Deposit funds
├── Lock under conditions
├── Release on success
└── Refund on failure
│
▼
Creator

markdown
Copy code

### Core Components

- **Solidity Contracts (Foundry)**
  - Escrow logic
  - Token handling
  - Condition enforcement
- **Frontend (Next.js / React)**
  - Campaign creation
  - Escrow tracking
  - Claim / settlement actions
- **Verification Layer**
  - Validates off-chain engagement
  - Triggers on-chain settlement

---

## Smart Contracts

- `PactEscrow.sol`
  - Handles deposits, locking, release, and refunds
  - Enforces sponsor-defined conditions
  - Emits on-chain events for full auditability

---

## Tech Stack

- **Solidity + Foundry** — Smart contracts, testing, deployment
- **Next.js / React / TypeScript** — Frontend interface
- **Ethers v6** — Blockchain interaction
- **Ethereum (Sepolia/Mainnet)** — On-chain settlement
- **Stablecoin (MNEE / ERC-20)** — Deterministic payouts

---

## Local Development

### Install Dependencies

```bash
forge install
npm install
Build Contracts
bash
Copy code
forge build
Run Tests
bash
Copy code
forge test
Start Local Chain
bash
Copy code
anvil
Deploy
bash
Copy code
forge script script/Deploy.s.sol --rpc-url <RPC_URL> --private-key <PRIVATE_KEY> --broadcast
Example Flow
Sponsor creates a campaign and deposits funds.

Creator publishes sponsored content.

Verification confirms engagement metrics.

Escrow contract releases payment automatically.

Why Pactory
Trustless – no intermediaries or manual enforcement

Transparent – all escrow states visible on-chain

Fair – creators get paid instantly when conditions are met

Secure – sponsors only pay for verified performance

Future Work
Multi-oracle verification

DAO-governed dispute resolution

Cross-platform metric aggregation

Creator reputation and campaign scoring
```
