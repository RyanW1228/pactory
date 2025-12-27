import { ethers } from "./ethers-6.7.esm.min.js";
import { MNEE_ADDRESS, RPC_URL } from "./constants.js";
import { PactEscrowABI } from "./pactEscrowAbi.js";

const ESCROW_ADDRESS = "0xCB1ab619DC66DB20186bABABA7bEa2b2D3079Ecc";  // deployed testnet address

let provider, signer, escrow, mnee;


// DOM
const connectButton = document.getElementById("connectButton");
const logoutButton = document.getElementById("logoutButton");
const viewPactsButton = document.getElementById("viewPactsButton");

const accountSpan = document.getElementById("account");
const balanceSpan = document.getElementById("ethBalance");
const mneeBalanceSpan = document.getElementById("mneeBalance");

const defaultModeText = document.getElementById("defaultModeText");
const toggleDefaultModeButton = document.getElementById(
  "toggleDefaultModeButton"
);

// ABI (minimal)
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

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
}

async function showBalances(provider, address) {
  const ethWei = await provider.getBalance(address);
  balanceSpan.innerText = ethers.formatEther(ethWei);

  const token = new ethers.Contract(MNEE_ADDRESS, ERC20_ABI, provider);
  const [raw, decimals] = await Promise.all([
    token.balanceOf(address),
    token.decimals(),
  ]);
  mneeBalanceSpan.innerText = ethers.formatUnits(raw, decimals);
}

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

  // Persist address (soft login)
  localStorage.setItem("address", address);
  accountSpan.innerText = address;

  connectButton.style.display = "none";
  logoutButton.style.display = "inline-block";

  // Default mode per wallet
  setDefaultMode(address, getDefaultMode(address));
  renderDefaultModeUI(address);

  // Read balances via RPC (as before)
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  await showBalances(provider, address);
}

async function setupContracts(params) {
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();

  escrow = new ethers.Contract(
    ESCROW_ADDRESS,
    PactEscrowABI,
    signer);

  mnee = new ethers.Contract(
    MNEE_ADDRESS, ERC20ABI, signer
  );


  
}

async function loadFromLocalStorage() {
  const stored = localStorage.getItem("address");
  if (!stored) {
    accountSpan.innerText = "Not connected";
    balanceSpan.innerText = "-";
    mneeBalanceSpan.innerText = "-";
    defaultModeText.innerText = "-";
    toggleDefaultModeButton.disabled = true;

    logoutButton.style.display = "none";
    connectButton.style.display = "inline-block";
    return;
  }

  accountSpan.innerText = stored;

  // establish per-wallet default if missing
  const key = viewModeKey(stored);
  if (!localStorage.getItem(key)) localStorage.setItem(key, "sponsor");

  // show correct buttons
  logoutButton.style.display = "inline-block";
  connectButton.style.display = "none";

  // paint balances + default view
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  await showBalances(provider, stored);
  renderDefaultModeUI(stored);
}

async function connect() {
  if (!window.ethereum) {
    alert("Install MetaMask first.");
    return;
  }

  // 🔴 FORCE account chooser every time
  await window.ethereum.request({
    method: "wallet_requestPermissions",
    params: [{ eth_accounts: {} }],
  });

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  const address = accounts?.[0];
  if (!address) {
    alert("No account selected.");
    return;
  }

  // Persist address (soft login)
  localStorage.setItem("address", address);
  accountSpan.innerText = address;

  connectButton.style.display = "none";
  logoutButton.style.display = "inline-block";

  // Default view per wallet
  if (!localStorage.getItem(viewModeKey(address))) {
    setDefaultMode(address, "sponsor");
  }
  renderDefaultModeUI(address);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  await showBalances(provider, address);
}

// Handlers
connectButton.onclick = () => connect().catch((e) => alert(e?.message || e));

viewPactsButton.onclick = () => {
  const addr = localStorage.getItem("address");
  if (!addr) return alert("Connect a wallet first.");
  window.location.href = "./pacts-dashboard.html";
};

logoutButton.onclick = () => {
  localStorage.removeItem("address");

  accountSpan.innerText = "Not connected";
  balanceSpan.innerText = "-";
  mneeBalanceSpan.innerText = "-";

  logoutButton.style.display = "none";
  connectButton.style.display = "inline-block";

  defaultModeText.innerText = "-";
  toggleDefaultModeButton.disabled = true;
};

toggleDefaultModeButton.onclick = () => {
  const addr = localStorage.getItem("address");
  if (!addr) return;

  const current = getDefaultMode(addr);
  const next = current === "sponsor" ? "creator" : "sponsor";
  setDefaultMode(addr, next);
  renderDefaultModeUI(addr);
};

// Init
loadFromLocalStorage().catch(() => {});
