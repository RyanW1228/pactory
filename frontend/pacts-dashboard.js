import { ethers } from "./ethers-6.7.esm.min.js";
import { RPC_URL, MNEE_ADDRESS } from "./constants.js";

const mneeBalanceSpan = document.getElementById("mneeBalance");
const address = localStorage.getItem("address");
if (!address) {
  window.location.href = "./index.html";
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const homeButton = document.getElementById("homeButton");
const proposePactButton = document.getElementById("proposePactButton");
const provider = new ethers.JsonRpcProvider(RPC_URL);

const token = new ethers.Contract(MNEE_ADDRESS, ERC20_ABI, provider);
const [raw, decimals] = await Promise.all([
  token.balanceOf(address),
  token.decimals(),
]);
mneeBalanceSpan.innerText = ethers.formatUnits(raw, decimals);

const toggleViewButton = document.getElementById("toggleViewButton");

const currentViewSpan = document.getElementById("currentView");
const dashboardTitle = document.getElementById("dashboardTitle");

const SPONSOR_SECTIONS = [
  "Active",
  "Requires Funding",
  "Created",
  "Awaiting Your Review",
  "Sent for Review",
  "Archive",
];

const CREATOR_SECTIONS = [
  "Active",
  "Created – Requires Video Link",
  "Awaiting Your Review",
  "Sent for Review",
  "Archive",
];

const sectionsContainer = document.getElementById("sectionsContainer");

function viewModeKey(address) {
  return `pactViewMode:${address.toLowerCase()}`;
}

function setViewMode(mode) {
  localStorage.setItem(viewModeKey(address), mode);

  if (mode === "sponsor") {
    dashboardTitle.innerText = "Your Sponsor Pacts";
    currentViewSpan.innerText = "Sponsor";
  } else {
    dashboardTitle.innerText = "Your Creator Pacts";
    currentViewSpan.innerText = "Creator";
  }

  renderSections(mode);
}

function renderSections(mode) {
  const sections = mode === "sponsor" ? SPONSOR_SECTIONS : CREATOR_SECTIONS;

  sectionsContainer.innerHTML = sections
    .map((title) => {
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return `
        <details class="section">
          <summary><strong>${title}</strong> <span id="count-${id}">(0)</span></summary>
          <div id="list-${id}" class="list">
            <p class="empty">No pacts yet.</p>
          </div>
        </details>
      `;
    })
    .join("");
}

function loadViewMode() {
  const saved = localStorage.getItem(viewModeKey(address)) || "sponsor";
  setViewMode(saved);
}

toggleViewButton.onclick = () => {
  const current = localStorage.getItem(viewModeKey(address)) || "sponsor";
  const next = current === "sponsor" ? "creator" : "sponsor";
  setViewMode(next);
};

homeButton.onclick = () => {
  window.location.href = "./index.html";
};

proposePactButton.onclick = () => {
  window.location.href = "./pactory.html";
};

loadViewMode();
