// pactEscrowAbi.js
export const PactEscrowABI = [
  {
    type: "constructor",
    inputs: [
      { name: "_mnee", type: "address", internalType: "address" },
      { name: "_verifier", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "mnee",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IERC20" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "verifier",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },

  // -------------------------
  // create / fund / payout
  // -------------------------
  {
    type: "function",
    name: "createPactWithSig",
    inputs: [
      { name: "sponsor", type: "address", internalType: "address" },
      { name: "pactId", type: "uint256", internalType: "uint256" },
      { name: "creator", type: "address", internalType: "address" },
      { name: "maxPayout", type: "uint256", internalType: "uint256" },
      { name: "durationSeconds", type: "uint256", internalType: "uint256" },
      { name: "expiry", type: "uint256", internalType: "uint256" },
      { name: "sig", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "fund",
    inputs: [{ name: "pactId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "payoutWithSig",
    inputs: [
      { name: "pactId", type: "uint256", internalType: "uint256" },
      { name: "totalEarned", type: "uint256", internalType: "uint256" },
      { name: "expiry", type: "uint256", internalType: "uint256" },
      { name: "sig", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // -------------------------
  // NEW: finalize after deadline (required before refund)
  // -------------------------
  {
    type: "function",
    name: "finalizeAfterDeadlineWithSig",
    inputs: [
      { name: "pactId", type: "uint256", internalType: "uint256" },
      { name: "finalEarned", type: "uint256", internalType: "uint256" },
      { name: "expiry", type: "uint256", internalType: "uint256" },
      { name: "sig", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // -------------------------
  // refund (now requires finalized=true)
  // -------------------------
  {
    type: "function",
    name: "refundAfterDeadline",
    inputs: [{ name: "pactId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // -------------------------
  // view: pacts now returns 2 extra fields
  // -------------------------
  {
    type: "function",
    name: "pacts",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "sponsor", type: "address", internalType: "address" },
      { name: "creator", type: "address", internalType: "address" },
      { name: "maxPayout", type: "uint256", internalType: "uint256" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
      { name: "status", type: "uint8", internalType: "enum PactEscrow.Status" },
      { name: "paidOut", type: "uint256", internalType: "uint256" },
      { name: "refunded", type: "bool", internalType: "bool" },

      // NEW:
      { name: "finalEarned", type: "uint256", internalType: "uint256" },
      { name: "finalized", type: "bool", internalType: "bool" },
    ],
    stateMutability: "view",
  },

  // (Optional) If you want to listen to this event in frontend:
  {
    type: "event",
    name: "PactFinalized",
    inputs: [
      { name: "pactId", type: "uint256", indexed: true },
      { name: "finalEarned", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
];
