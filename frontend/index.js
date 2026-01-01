import { ethers } from "./ethers-6.7.esm.min.js";
import { MNEE_ADDRESS, RPC_URL, getMNEEAddress, getEnvironment, MOCK_MNEE_CONTRACT_ADDRESS } from "./constants.js";
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
); // Now a checkbox input

const environmentToggle = document.getElementById("environmentToggle");
const environmentText = document.getElementById("environmentText");
const mintMockMNEEButton = document.getElementById("mintMockMNEEButton");

// ABI (minimal)
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// MockMNEE ABI (includes mint function)
const MOCK_MNEE_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount) external",
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
  // Update toggle state to match current mode (creator = checked, sponsor = unchecked)
  toggleDefaultModeButton.checked = mode === "creator";
}

async function showBalances(provider, address) {
  const ethWei = await provider.getBalance(address);
  balanceSpan.innerText = ethers.formatEther(ethWei);

  // Use current environment's MNEE address
  const mneeAddress = getMNEEAddress();
  const token = new ethers.Contract(mneeAddress, ERC20_ABI, provider);
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
  
  // Update allowlist UI after connecting
  updateAllowlistUI();
  if (isAllowlistEnabled()) {
    renderAllowlist();
  }
}

async function setupContracts(params) {
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();

  escrow = new ethers.Contract(
    ESCROW_ADDRESS,
    PactEscrowABI,
    signer);

  // Use current environment's MNEE address
  const mneeAddress = getMNEEAddress();
  mnee = new ethers.Contract(
    mneeAddress, ERC20_ABI, signer
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

// Environment management
async function updateEnvironmentUI() {
  const env = getEnvironment();
  if (environmentToggle) {
    environmentToggle.checked = env === "production";
  }
  if (environmentText) {
    environmentText.textContent = env === "production" ? "Production" : "Testing";
  }
  if (mintMockMNEEButton) {
    mintMockMNEEButton.style.display = env === "testing" ? "block" : "none";
  }
  
  // Update MNEE label based on environment
  const mneeLabel = document.getElementById("mneeLabel");
  if (mneeLabel) {
    mneeLabel.textContent = env === "testing" ? "mMNEE Balance" : "MNEE Balance";
  }
  
  // Refresh balance when environment changes
  const address = localStorage.getItem("address");
  if (address) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    await showBalances(provider, address);
  }
}

// Initialize environment UI when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (environmentToggle) {
      updateEnvironmentUI();
    }
  });
} else {
  if (environmentToggle) {
    updateEnvironmentUI();
  }
}

// Environment toggle handler
if (environmentToggle) {
  environmentToggle.onchange = () => {
    // Get the new environment state from the toggle
    const newEnv = environmentToggle.checked ? "production" : "testing";
    const currentEnv = getEnvironment();
    
    // If already in the target environment, revert the toggle
    if (newEnv === currentEnv) {
      environmentToggle.checked = !environmentToggle.checked;
      return;
    }
    
    // Show confirmation dialog BEFORE making any changes
    const envName = newEnv === "production" ? "Production" : "Testing";
    if (confirm(`Switch to ${envName} environment? This will reload the page.`)) {
      // User confirmed - save the new environment and reload
      localStorage.setItem("pactory-environment", newEnv);
      window.location.reload();
    } else {
      // User cancelled - revert the toggle to its previous state
      environmentToggle.checked = !environmentToggle.checked;
      // No need to update UI since we're reverting to the current state
    }
  };
}

// Mint Mock MNEE function
async function mintMockMNEE() {
  // Check if wallet is connected
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

    // Get signer from MetaMask
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const signer = await browserProvider.getSigner();
    const address = await signer.getAddress();

    // Verify the connected address matches the stored address
    if (address.toLowerCase() !== storedAddress.toLowerCase()) {
      alert(`Address mismatch. Please connect with ${storedAddress}`);
      mintMockMNEEButton.disabled = false;
      mintMockMNEEButton.textContent = "Mint Mock MNEE";
      return;
    }

    // Get decimals from the contract to ensure correct amount
    const mockMNEE = new ethers.Contract(MOCK_MNEE_CONTRACT_ADDRESS, MOCK_MNEE_ABI, signer);
    const decimals = await mockMNEE.decimals();
    const amount = ethers.parseUnits("1000", decimals); // Mint 1000 Mock MNEE
    
    mintMockMNEEButton.textContent = "Confirming transaction...";
    
    // Call the mint function
    const tx = await mockMNEE.mint(address, amount);
    
    mintMockMNEEButton.textContent = "Waiting for confirmation...";
    await tx.wait();
    
    alert(`✅ Successfully minted 1000 Mock MNEE!\n\nTransaction: ${tx.hash}\n\nYour balance will update shortly.`);
    mintMockMNEEButton.textContent = "Mint Mock MNEE";
    
    // Refresh balance
    if (mneeBalanceSpan) {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      await showBalances(provider, address);
    }
  } catch (error) {
    console.error("Mint error:", error);
    const errorMsg = error?.shortMessage || error?.message || String(error);
    alert(`Failed to mint Mock MNEE:\n\n${errorMsg}\n\nMake sure:\n- You're on the correct network (Sepolia)\n- The Mock MNEE contract is deployed\n- You have enough ETH for gas`);
    mintMockMNEEButton.textContent = "Mint Mock MNEE";
  } finally {
    mintMockMNEEButton.disabled = false;
  }
}

if (mintMockMNEEButton) {
  mintMockMNEEButton.onclick = () => mintMockMNEE();
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

// Confirmation Modal Elements (will be available after DOM loads)
let modeSwitchModal, modalCancelBtn, modalConfirmBtn, currentModeText, nextModeText;

// Initialize modal elements when DOM is ready
function initModeSwitchModal() {
  modeSwitchModal = document.getElementById("modeSwitchModal");
  modalCancelBtn = document.getElementById("modalCancelBtn");
  modalConfirmBtn = document.getElementById("modalConfirmBtn");
  currentModeText = document.getElementById("currentModeText");
  nextModeText = document.getElementById("nextModeText");
  
  if (!modeSwitchModal || !modalCancelBtn || !modalConfirmBtn) {
    console.warn("Mode switch modal elements not found");
    return;
  }
  
  // Close modal on cancel or overlay click
  modalCancelBtn.onclick = () => {
    hideModeSwitchModal();
    // Reset toggle to previous state
    const addr = localStorage.getItem("address");
    if (!addr) return;
    const current = getDefaultMode(addr);
    toggleDefaultModeButton.checked = current === "creator";
  };

  modeSwitchModal.onclick = (e) => {
    if (e.target === modeSwitchModal) {
      hideModeSwitchModal();
      // Reset toggle to previous state
      const addr = localStorage.getItem("address");
      if (!addr) return;
      const current = getDefaultMode(addr);
      toggleDefaultModeButton.checked = current === "creator";
    }
  };

  // Confirm mode switch
  modalConfirmBtn.onclick = () => {
    const addr = localStorage.getItem("address");
    if (!addr) return;

    const current = getDefaultMode(addr);
    const next = current === "sponsor" ? "creator" : "sponsor";
    setDefaultMode(addr, next);
    renderDefaultModeUI(addr);
    hideModeSwitchModal();
  };
}

// Show confirmation modal
function showModeSwitchModal(currentMode, nextMode) {
  // Ensure modal is initialized
  if (!modeSwitchModal || !currentModeText || !nextModeText) {
    // Try to initialize if not already done
    initModeSwitchModal();
    // Check again
    if (!modeSwitchModal || !currentModeText || !nextModeText) {
      console.error("Modal elements not found. Cannot show confirmation.");
      // Fallback: just switch without confirmation
      const addr = localStorage.getItem("address");
      if (!addr) return;
      const current = getDefaultMode(addr);
      const next = current === "sponsor" ? "creator" : "sponsor";
      setDefaultMode(addr, next);
      renderDefaultModeUI(addr);
      return;
    }
  }
  currentModeText.textContent = currentMode === "sponsor" ? "Sponsor" : "Creator";
  nextModeText.textContent = nextMode === "sponsor" ? "Sponsor" : "Creator";
  modeSwitchModal.classList.add("show");
  // Force display in case CSS isn't working
  modeSwitchModal.style.display = "flex";
  console.log("Modal shown:", modeSwitchModal.classList.contains("show"));
}

// Hide confirmation modal
function hideModeSwitchModal() {
  if (modeSwitchModal) {
    modeSwitchModal.classList.remove("show");
    modeSwitchModal.style.display = "none";
  }
}

// Initialize modal when DOM is ready
// Use a function that waits for the modal to exist
function ensureModalInitialized() {
  if (!modeSwitchModal || !modalCancelBtn || !modalConfirmBtn) {
    initModeSwitchModal();
    // If still not found, try again after a short delay
    if (!modeSwitchModal || !modalCancelBtn || !modalConfirmBtn) {
      setTimeout(ensureModalInitialized, 100);
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(ensureModalInitialized, 0);
  });
} else {
  // DOM already loaded, initialize with a small delay to ensure HTML is parsed
  setTimeout(ensureModalInitialized, 100);
}

// Toggle switch handler
if (toggleDefaultModeButton) {
  toggleDefaultModeButton.onchange = () => {
    const addr = localStorage.getItem("address");
    if (!addr) {
      console.warn("Address not set, cannot switch mode");
      const current = getDefaultMode(addr || "");
      if (toggleDefaultModeButton) {
        toggleDefaultModeButton.checked = current === "creator";
      }
      return;
    }

    const current = getDefaultMode(addr);
    const next = current === "sponsor" ? "creator" : "sponsor";
    
    // Show confirmation modal
    showModeSwitchModal(current, next);
    
    // Don't update the toggle state yet - wait for confirmation
    // The toggle will be reset if user cancels
  };
}

// Address Names Management
const addressNameInput = document.getElementById("addressNameInput");
const addressNameLabelInput = document.getElementById("addressNameLabelInput");
const saveAddressNameButton = document.getElementById("saveAddressNameButton");
const addressNameStatus = document.getElementById("addressNameStatus");
const addressNamesListContent = document.getElementById("addressNamesListContent");

// Helper functions for address names
function getAddressName(address) {
  if (!address) return null;
  const key = `addressName:${address.toLowerCase()}`;
  return localStorage.getItem(key);
}

function setAddressName(address, name) {
  if (!address) return false;
  const key = `addressName:${address.toLowerCase()}`;
  if (name && name.trim()) {
    localStorage.setItem(key, name.trim());
    return true;
  } else {
    localStorage.removeItem(key);
    return false;
  }
}

function getAllAddressNames() {
  const names = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("addressName:")) {
      const address = key.replace("addressName:", "");
      names[address] = localStorage.getItem(key);
    }
  }
  return names;
}

function formatAddressWithName(address) {
  if (!address) return address;
  const name = getAddressName(address);
  if (name) {
    return `${name} (${address})`;
  }
  return address;
}

function renderAddressNamesList() {
  if (!addressNamesListContent) return;
  
  const names = getAllAddressNames();
  const entries = Object.entries(names);
  
  if (entries.length === 0) {
    addressNamesListContent.innerHTML = '<div style="color: #999; font-style: italic; padding: 12px;">No address names saved yet.</div>';
    return;
  }
  
  addressNamesListContent.innerHTML = entries.map(([address, name]) => `
    <div class="address-name-item">
      <div class="address-name-item-address">${address}</div>
      <div class="address-name-item-label">${name}</div>
      <button class="address-name-item-delete" data-address="${address}">Delete</button>
    </div>
  `).join("");
  
  // Add delete handlers
  addressNamesListContent.querySelectorAll(".address-name-item-delete").forEach(btn => {
    btn.onclick = () => {
      const addr = btn.getAttribute("data-address");
      if (confirm(`Delete name for ${addr}?`)) {
        setAddressName(addr, "");
        renderAddressNamesList();
        addressNameStatus.textContent = "Address name deleted.";
        addressNameStatus.style.color = "#1976D2";
        setTimeout(() => {
          addressNameStatus.textContent = "";
        }, 2000);
      }
    };
  });
}

if (saveAddressNameButton) {
  saveAddressNameButton.onclick = () => {
    const address = addressNameInput?.value.trim();
    const name = addressNameLabelInput?.value.trim();
    
    if (!address) {
      addressNameStatus.textContent = "Please enter an address.";
      addressNameStatus.style.color = "#C62828";
      return;
    }
    
    if (!ethers.isAddress(address)) {
      addressNameStatus.textContent = "Invalid Ethereum address.";
      addressNameStatus.style.color = "#C62828";
      return;
    }
    
    if (!name) {
      addressNameStatus.textContent = "Please enter a name.";
      addressNameStatus.style.color = "#C62828";
      return;
    }
    
    setAddressName(address, name);
    renderAddressNamesList();
    addressNameStatus.textContent = "Address name saved!";
    addressNameStatus.style.color = "#1B5E20";
    
    // Clear inputs
    if (addressNameInput) addressNameInput.value = "";
    if (addressNameLabelInput) addressNameLabelInput.value = "";
    
    setTimeout(() => {
      addressNameStatus.textContent = "";
    }, 2000);
  };
}

// Export functions for use in other files
window.getAddressName = getAddressName;
window.formatAddressWithName = formatAddressWithName;

// Allowlist management
const allowlistInput = document.getElementById("allowlistInput");
const addAllowlistButton = document.getElementById("addAllowlistButton");
const allowlistStatus = document.getElementById("allowlistStatus");
const allowlistListContent = document.getElementById("allowlistListContent");
const allowlistToggle = document.getElementById("allowlistToggle");
const allowlistContent = document.getElementById("allowlistContent");

function isAllowlistEnabled() {
  if (!address) return false;
  const key = `allowlistEnabled:${address.toLowerCase()}`;
  const stored = localStorage.getItem(key);
  return stored === "true";
}

function setAllowlistEnabled(enabled) {
  if (!address) return;
  const key = `allowlistEnabled:${address.toLowerCase()}`;
  localStorage.setItem(key, enabled ? "true" : "false");
}

function getAllowedAddresses() {
  if (!address) return [];
  const key = `allowlist:${address.toLowerCase()}`;
  const stored = localStorage.getItem(key);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    return [];
  }
}

function setAllowedAddresses(addresses) {
  if (!address) return;
  const key = `allowlist:${address.toLowerCase()}`;
  localStorage.setItem(key, JSON.stringify(addresses));
}

function addToAllowlist(addressToAdd) {
  if (!address) return;
  const addresses = getAllowedAddresses();
  const normalized = addressToAdd.toLowerCase();
  if (!addresses.includes(normalized)) {
    addresses.push(normalized);
    setAllowedAddresses(addresses);
  }
}

function removeFromAllowlist(addressToRemove) {
  if (!address) return;
  const addresses = getAllowedAddresses();
  const normalized = addressToRemove.toLowerCase();
  const filtered = addresses.filter(addr => addr !== normalized);
  setAllowedAddresses(filtered);
}

function isAddressAllowed(addressToCheck) {
  if (!address) return true; // If not logged in, allow all (shouldn't happen)
  
  // If allowlist is not enabled, allow all addresses
  if (!isAllowlistEnabled()) return true;
  
  const addresses = getAllowedAddresses();
  // If allowlist is enabled but empty, block all addresses
  if (addresses.length === 0) return false;
  
  return addresses.includes(addressToCheck.toLowerCase());
}

function updateAllowlistUI() {
  if (!address) return;
  
  const enabled = isAllowlistEnabled();
  if (allowlistToggle) {
    allowlistToggle.checked = enabled;
  }
  if (allowlistContent) {
    allowlistContent.style.display = enabled ? "block" : "none";
  }
}

function renderAllowlist() {
  if (!allowlistListContent || !address) return;
  
  const addresses = getAllowedAddresses();
  
  if (addresses.length === 0) {
    allowlistListContent.innerHTML = '<div style="color: #999; font-style: italic; padding: 12px;">No addresses in allowlist yet. Add addresses to restrict pact creation.</div>';
    return;
  }
  
  allowlistListContent.innerHTML = addresses.map(addr => {
    const name = getAddressName(addr);
    const displayName = name ? `${name} (${addr})` : addr;
    return `
      <div class="address-name-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin-bottom: 8px; background: #FAFBFF; border-radius: 6px; border: 1px solid rgba(33, 150, 243, 0.1);">
        <div class="address-name-item-address" style="font-family: \'SF Mono\', \'Monaco\', \'Menlo\', monospace; font-size: 0.8125rem; color: #1E3A5F; word-break: break-all; flex: 1;">${displayName}</div>
        <button class="address-name-item-delete" data-address="${addr}" style="padding: 6px 12px; background: #D32F2F; color: white; border: none; border-radius: 4px; font-size: 0.75rem; font-weight: 600; cursor: pointer; margin-left: 12px; white-space: nowrap;">Remove</button>
      </div>
    `;
  }).join("");
  
  // Attach delete handlers
  allowlistListContent.querySelectorAll(".address-name-item-delete").forEach(btn => {
    btn.onclick = () => {
      const addr = btn.getAttribute("data-address");
      if (confirm(`Remove ${addr} from allowlist?`)) {
        removeFromAllowlist(addr);
        renderAllowlist();
        if (allowlistStatus) {
          allowlistStatus.textContent = "Address removed from allowlist.";
          allowlistStatus.style.color = "#1976D2";
          setTimeout(() => {
            allowlistStatus.textContent = "";
          }, 3000);
        }
      }
    };
  });
}

if (addAllowlistButton) {
  addAllowlistButton.onclick = () => {
    if (!address) {
      if (allowlistStatus) {
        allowlistStatus.textContent = "Please connect your wallet first.";
        allowlistStatus.style.color = "#C62828";
      }
      return;
    }
    
    const addressToAdd = allowlistInput?.value.trim();
    
    if (!addressToAdd) {
      if (allowlistStatus) {
        allowlistStatus.textContent = "Please enter an address.";
        allowlistStatus.style.color = "#C62828";
      }
      return;
    }
    
    if (!ethers.isAddress(addressToAdd)) {
      if (allowlistStatus) {
        allowlistStatus.textContent = "Invalid Ethereum address.";
        allowlistStatus.style.color = "#C62828";
      }
      return;
    }
    
    if (isAddressAllowed(addressToAdd)) {
      if (allowlistStatus) {
        allowlistStatus.textContent = "Address is already in allowlist.";
        allowlistStatus.style.color = "#F57C00";
      }
      return;
    }
    
    addToAllowlist(addressToAdd);
    renderAllowlist();
    if (allowlistStatus) {
      allowlistStatus.textContent = "Address added to allowlist!";
      allowlistStatus.style.color = "#1B5E20";
    }
    
    // Clear input
    if (allowlistInput) allowlistInput.value = "";
    
    if (allowlistStatus) {
      setTimeout(() => {
        allowlistStatus.textContent = "";
      }, 3000);
    }
  };
}

// Toggle allowlist on/off
if (allowlistToggle) {
  allowlistToggle.onchange = () => {
    if (!address) {
      if (allowlistStatus) {
        allowlistStatus.textContent = "Please connect your wallet first.";
        allowlistStatus.style.color = "#C62828";
      }
      allowlistToggle.checked = false;
      return;
    }
    
    const enabled = allowlistToggle.checked;
    setAllowlistEnabled(enabled);
    updateAllowlistUI();
    
    if (enabled) {
      renderAllowlist();
    }
  };
}

// Export functions for use in other files
window.getAllowedAddresses = getAllowedAddresses;
window.isAddressAllowed = isAddressAllowed;
window.addToAllowlist = addToAllowlist;
window.removeFromAllowlist = removeFromAllowlist;
window.isAllowlistEnabled = isAllowlistEnabled;

// Init
loadFromLocalStorage().catch(() => {});
updateEnvironmentUI().catch(() => {});
renderAddressNamesList();

// Listen for environment changes from other pages
window.addEventListener('storage', async (event) => {
  if (event.key === 'pactory-environment') {
    await updateEnvironmentUI();
  } else if (event.key && event.key.startsWith('addressName:')) {
    renderAddressNamesList();
  } else if (event.key && event.key.startsWith('allowlist:')) {
    if (isAllowlistEnabled()) {
      renderAllowlist();
    }
  } else if (event.key && event.key.startsWith('allowlistEnabled:')) {
    updateAllowlistUI();
    if (isAllowlistEnabled()) {
      renderAllowlist();
    }
  }
});

// Render allowlist on page load if address is available
if (address) {
  updateAllowlistUI();
  if (isAllowlistEnabled()) {
    renderAllowlist();
  }
}
