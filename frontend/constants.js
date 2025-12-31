// Environment configuration
const REAL_MNEE_ADDRESS = "0x8ccedbAe4916b79da7F3F612EfB2EB93A2bFD6cF"; // Real MNEE on mainnet
const MOCK_MNEE_ADDRESS = "0x249E2dCF1C601B3fE319A2E7A5465A41c03C3eaF"; // MockMNEE contract address
const TESTNET_MNEE_ADDRESS = "0x5D74F51bD1b03E8F7742538647cf7ce369c91582"; // testnet MNEE address

export const PACT_ESCROW_ADDRESS = "0x243B3Bc9f26b7667C33Ba4E68Ade010B91CEC2bc";

// export const RPC_URL = "https://eth-mainnet.g.alchemy.com/v2/sUcn_ZXiRFVqVOEgUxnlw"; // mainnet rpc i think??? bro idk
export const RPC_URL =
  "https://sepolia.infura.io/v3/8335d89b7b5e46ed9dfdb90608a63414"; // sepolia rpc

// Get current environment (defaults to testing)
export function getEnvironment() {
  return localStorage.getItem("pactory-environment") || "testing";
}

// Get MNEE address based on environment
export function getMNEEAddress() {
  const env = getEnvironment();
  if (env === "production") {
    return REAL_MNEE_ADDRESS;
  } else {
    // Testing environment - use MockMNEE
    return MOCK_MNEE_ADDRESS;
  }
}

// Export for backward compatibility (will be dynamically resolved)
// Note: Use getMNEEAddress() for dynamic resolution, MNEE_ADDRESS is for static imports
export let MNEE_ADDRESS = getMNEEAddress();

// MockMNEE contract address (for minting)
export const MOCK_MNEE_CONTRACT_ADDRESS = MOCK_MNEE_ADDRESS;
