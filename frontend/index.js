// index.js
import { ethers } from "./ethers-6.7.esm.min.js";
import {
  getRPCUrl,
  getMNEEAddress,
  getEnvironment,
  MOCK_MNEE_ADDRESS, // <-- from your constants.js
} from "./constants.js";

// --------------------
// DOM
// --------------------
const connectButton = document.getElementById("connectButton");
const logoutButton = document.getElementById("logoutButton");
const viewPactsButton = document.getElementById("viewPactsButton");
const ethLabel = document.getElementById("ethLabel");

const accountSpan = document.getElementById("account");
const ethBalanceSpan = document.getElementById("ethBalance");
const mneeBalanceSpan = document.getElementById("mneeBalance");
const mneeLabel = document.getElementById("mneeLabel");

const defaultModeText = document.getElementById("defaultModeText");
const toggleDefaultModeButton = document.getElementById(
  "toggleDefaultModeButton"
);

const environmentToggle = document.getElementById("environmentToggle");
const environmentText = document.getElementById("environmentText");
const mintMockMNEEButton = document.getElementById("mintMockMNEEButton");

// --------------------
// ABIs
// --------------------
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// Only used for mock minting in TESTING env
const MOCK_MNEE_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount) external",
];

// --------------------
// View mode (Sponsor/Creator) — unchanged
// --------------------
function viewModeKey(address) {
  return `pactViewMode:${address.toLowerCase()}`;
}
function getDefaultMode(address) {
  return localStorage.getItem(viewModeKey(address)) || "sponsor";
}
function setDefaultMode(address, mode) {
  localStorage.setItem(viewModeKey(address), mode);
}
function renderDefaultModeUI(address) {
  const mode = getDefaultMode(address);
  defaultModeText.innerText = mode === "sponsor" ? "Sponsor" : "Creator";
  toggleDefaultModeButton.disabled = false;
  toggleDefaultModeButton.checked = mode === "creator";
}

// --------------------
// Balances (THIS is the important part)
// Uses getRPCUrl() + getMNEEAddress() ALWAYS
// --------------------
async function showBalances(address) {
  const rpcUrl = getRPCUrl();
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const [ethWei, tokenAddr] = await Promise.all([
    provider.getBalance(address),
    Promise.resolve(getMNEEAddress()),
  ]);

  ethBalanceSpan.innerText = ethers.formatEther(ethWei);

  const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
  const [raw, decimals] = await Promise.all([
    token.balanceOf(address),
    token.decimals(),
  ]);

  mneeBalanceSpan.innerText = ethers.formatUnits(raw, decimals);
}

// --------------------
// Environment UI
// --------------------
async function updateEnvironmentUI() {
  const env = getEnvironment();

  if (ethLabel) {
    ethLabel.textContent =
      env === "testing" ? "Sepolia ETH Balance" : "ETH Balance";
  }

  // Toggle state
  if (environmentToggle) environmentToggle.checked = env === "production";

  // Text
  if (environmentText)
    environmentText.textContent =
      env === "production" ? "Production" : "Testing";

  // Label
  if (mneeLabel)
    mneeLabel.textContent =
      env === "testing" ? "mMNEE Balance" : "MNEE Balance";

  // Mint button only in testing
  if (mintMockMNEEButton)
    mintMockMNEEButton.style.display = env === "testing" ? "block" : "none";

  // Refresh balances when env changes (if logged in)
  const stored = localStorage.getItem("address");
  if (stored) await showBalances(stored);
}

// Toggle handler (stores env then reloads)
if (environmentToggle) {
  environmentToggle.onchange = () => {
    const newEnv = environmentToggle.checked ? "production" : "testing";
    const currentEnv = getEnvironment();

    if (newEnv === currentEnv) {
      environmentToggle.checked = !environmentToggle.checked;
      return;
    }

    const envName = newEnv === "production" ? "Production" : "Testing";
    const ok = confirm(
      `Switch to ${envName} environment? This will reload the page.`
    );
    if (!ok) {
      environmentToggle.checked = !environmentToggle.checked;
      return;
    }

    localStorage.setItem("pactory-environment", newEnv);
    window.location.reload();
  };
}

// --------------------
// Connect / Logout
// --------------------
async function connect() {
  if (!window.ethereum) {
    connectButton.innerText = "Install MetaMask";
    return;
  }

  await window.ethereum.request({
    method: "wallet_requestPermissions",
    params: [{ eth_accounts: {} }],
  });

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  const address = accounts[0];

  localStorage.setItem("address", address);
  accountSpan.innerText = address;

  connectButton.style.display = "none";
  logoutButton.style.display = "inline-block";

  // default mode per wallet
  if (!localStorage.getItem(viewModeKey(address)))
    setDefaultMode(address, "sponsor");
  renderDefaultModeUI(address);

  await showBalances(address);
}

function logout() {
  localStorage.removeItem("address");

  accountSpan.innerText = "Not connected";
  ethBalanceSpan.innerText = "-";
  mneeBalanceSpan.innerText = "-";

  defaultModeText.innerText = "-";
  toggleDefaultModeButton.disabled = true;

  logoutButton.style.display = "none";
  connectButton.style.display = "inline-block";
}

// --------------------
// Mint Mock MNEE (testing only)
// IMPORTANT: mints MOCK_MNEE_ADDRESS (Sepolia) ALWAYS
// --------------------
async function mintMockMNEE() {
  const env = getEnvironment();
  if (env !== "testing") {
    alert("Mock minting is only available in Testing.");
    return;
  }

  const storedAddress = localStorage.getItem("address");
  if (!storedAddress) {
    alert("Please connect your wallet first.");
    return;
  }

  if (!window.ethereum) {
    alert("MetaMask not found. Please install MetaMask.");
    return;
  }

  try {
    mintMockMNEEButton.disabled = true;
    mintMockMNEEButton.textContent = "Minting...";

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const signer = await browserProvider.getSigner();
    const address = await signer.getAddress();

    if (address.toLowerCase() !== storedAddress.toLowerCase()) {
      alert(`Address mismatch. Please connect with ${storedAddress}`);
      return;
    }

    // Use MOCK_MNEE_ADDRESS directly (since mint is only for testing)
    const mock = new ethers.Contract(MOCK_MNEE_ADDRESS, MOCK_MNEE_ABI, signer);
    const decimals = await mock.decimals();
    const amount = ethers.parseUnits("1000", decimals);

    mintMockMNEEButton.textContent = "Confirm in MetaMask...";
    const tx = await mock.mint(address, amount);

    mintMockMNEEButton.textContent = "Waiting for confirmation...";
    await tx.wait();

    alert(`✅ Minted 1000 mMNEE.\nTx: ${tx.hash}`);

    mintMockMNEEButton.textContent = "Mint Mock MNEE";
    await showBalances(address);
  } catch (e) {
    console.error(e);
    const msg = e?.shortMessage || e?.message || String(e);
    alert(`Mint failed:\n\n${msg}`);
    mintMockMNEEButton.textContent = "Mint Mock MNEE";
  } finally {
    mintMockMNEEButton.disabled = false;
  }
}

// --------------------
// Mode toggle (your modal flow is fine; here’s the simple version)
// If you want your modal confirmation, keep your existing modal code.
// --------------------
if (toggleDefaultModeButton) {
  toggleDefaultModeButton.onchange = () => {
    const addr = localStorage.getItem("address");
    if (!addr) return;

    const current = getDefaultMode(addr);
    const next = current === "sponsor" ? "creator" : "sponsor";
    setDefaultMode(addr, next);
    renderDefaultModeUI(addr);
  };
}

// --------------------
// Wire buttons
// --------------------
connectButton.onclick = () => connect().catch((e) => alert(e?.message || e));

viewPactsButton.onclick = () => {
  const addr = localStorage.getItem("address");
  if (!addr) return alert("Connect a wallet first.");
  window.location.href = "./pacts-dashboard.html";
};

logoutButton.onclick = logout;

if (mintMockMNEEButton) mintMockMNEEButton.onclick = mintMockMNEE;

// --------------------
// Init
// --------------------
async function init() {
  await updateEnvironmentUI();

  const stored = localStorage.getItem("address");
  if (!stored) {
    accountSpan.innerText = "Not connected";
    ethBalanceSpan.innerText = "-";
    mneeBalanceSpan.innerText = "-";
    defaultModeText.innerText = "-";
    toggleDefaultModeButton.disabled = true;

    logoutButton.style.display = "none";
    connectButton.style.display = "inline-block";
    return;
  }

  accountSpan.innerText = stored;
  connectButton.style.display = "none";
  logoutButton.style.display = "inline-block";

  if (!localStorage.getItem(viewModeKey(stored)))
    setDefaultMode(stored, "sponsor");
  renderDefaultModeUI(stored);

  await showBalances(stored);
}

init().catch(console.error);

// If some other page changes environment, refresh the UI/balances here
window.addEventListener("storage", (event) => {
  if (event.key === "pactory-environment")
    updateEnvironmentUI().catch(() => {});
});
