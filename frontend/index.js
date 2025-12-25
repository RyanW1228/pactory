import { ethers } from "./ethers-6.7.esm.min.js";
import { MNEE_ADDRESS, RPC_URL } from "./constants.js";

const connectButton = document.getElementById("connectButton");
const accountSpan = document.getElementById("account");
const balanceSpan = document.getElementById("ethBalance");
const mneeBalanceSpan = document.getElementById("mneeBalance");
const viewPactsButton = document.getElementById("viewPactsButton");
const logoutButton = document.getElementById("logoutButton");
const stored = localStorage.getItem("address");
const defaultModeText = document.getElementById("defaultModeText");
const toggleDefaultModeButton = document.getElementById(
  "toggleDefaultModeButton"
);

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

await loadFromLocalStorage();

if (stored) {
  logoutButton.style.display = "inline-block";
  connectButton.style.display = "none";
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

  localStorage.setItem("address", address);
  accountSpan.innerText = address;
  connectButton.style.display = "none";
  logoutButton.style.display = "inline-block";

  setDefaultMode(address, getDefaultMode(address));
  renderDefaultModeUI(address);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  await showBalances(provider, address);
}

async function loadFromLocalStorage() {
  const stored = localStorage.getItem("address");
  if (!stored) {
    defaultModeText.innerText = "-";
    toggleDefaultModeButton.disabled = true;
    return;
  }

  accountSpan.innerText = stored;

  // establish per-wallet default if missing
  const key = viewModeKey(stored);
  if (!localStorage.getItem(key)) localStorage.setItem(key, "sponsor");

  // paint balances + default view
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  await showBalances(provider, stored);
  renderDefaultModeUI(stored);
}

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

connectButton.onclick = connect;

viewPactsButton.onclick = () => {
  const address = localStorage.getItem("address");
  if (!address) {
    alert("Please connect a wallet first so we know which address to show.");
    return;
  }

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
  const address = localStorage.getItem("address");
  if (!address) return;

  const current = getDefaultMode(address);
  const next = current === "sponsor" ? "creator" : "sponsor";
  setDefaultMode(address, next);
  renderDefaultModeUI(address);
};
