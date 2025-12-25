import { ethers } from "./ethers-6.7.esm.min.js";
import { RPC_URL, MNEE_ADDRESS } from "./constants.js";

const mneeBalanceSpan = document.getElementById("mneeBalance");
const exitButton = document.getElementById("exitButton");
const address = localStorage.getItem("address");
if (!address) {
  window.location.href = "./index.html";
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);

// read MNEE balance
const token = new ethers.Contract(MNEE_ADDRESS, ERC20_ABI, provider);
const [raw, decimals] = await Promise.all([
  token.balanceOf(address),
  token.decimals(),
]);

mneeBalanceSpan.innerText = ethers.formatUnits(raw, decimals);

exitButton.onclick = () => {
  window.location.href = "./pacts-dashboard.html";
};
