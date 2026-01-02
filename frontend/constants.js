export const REAL_MNEE_ADDRESS = "0x8ccedbAe4916b79da7F3F612EfB2EB93A2bFD6cF";
export const MOCK_MNEE_ADDRESS = "0x249E2dCF1C601B3fE319A2E7A5465A41c03C3eaF";

export const MOCK_PACT_ESCROW_ADDRESS =
  "0x0d811F333B36cb6B2d38dE74D2d32510Ae2E4497";

// TODO: fill this in when you deploy mainnet
export const REAL_PACT_ESCROW_ADDRESS = ""; // <-- set later

export const TESTING_RPC_URL =
  "https://sepolia.infura.io/v3/8335d89b7b5e46ed9dfdb90608a63414";

export const PRODUCTION_RPC_URL =
  "https://eth-mainnet.g.alchemy.com/v2/sUcn_ZXiRFVqVOEgUxnlw";

export function getEnvironment() {
  return localStorage.getItem("pactory-environment") || "testing";
}

export function getRPCUrl() {
  return getEnvironment() === "production"
    ? PRODUCTION_RPC_URL
    : TESTING_RPC_URL;
}

export function getMNEEAddress() {
  return getEnvironment() === "production"
    ? REAL_MNEE_ADDRESS
    : MOCK_MNEE_ADDRESS;
}

export function getPactEscrowAddress() {
  return getEnvironment() === "production"
    ? REAL_PACT_ESCROW_ADDRESS
    : MOCK_PACT_ESCROW_ADDRESS;
}
