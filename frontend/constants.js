export const REAL_MNEE_ADDRESS = "0x8ccedbAe4916b79da7F3F612EfB2EB93A2bFD6cF";

export const MOCK_MNEE_ADDRESS = "0x249E2dCF1C601B3fE319A2E7A5465A41c03C3eaF";

export const MOCK_PACT_ESCROW_ADDRESS =
  "0x243B3Bc9f26b7667C33Ba4E68Ade010B91CEC2bc";

//export const REAL_PACT_ESCROW_ADDRESS =

export const TESTING_RPC_URL =
  "https://sepolia.infura.io/v3/8335d89b7b5e46ed9dfdb90608a63414";

export const PRODUCTION_RPC_URL =
  "https://eth-mainnet.g.alchemy.com/v2/sUcn_ZXiRFVqVOEgUxnlw";

export function getEnvironment() {
  return localStorage.getItem("pactory-environment") || "testing";
}

export function getRPCUrl() {
  const env = getEnvironment();
  return env === "production" ? PRODUCTION_RPC_URL : TESTING_RPC_URL;
}

export function getMNEEAddress() {
  const env = getEnvironment();
  return env === "production" ? REAL_MNEE_ADDRESS : MOCK_MNEE_ADDRESS;
}
