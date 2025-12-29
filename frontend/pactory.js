import { ethers } from "./ethers-6.7.esm.min.js";
import { RPC_URL, MNEE_ADDRESS, PACT_ESCROW_ADDRESS } from "./constants.js";
import { PactEscrowABI } from "./pactEscrowAbi.js";
import { triggerFireworks } from "./fireworks.js";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)", // we must approve before funding
];

// DOMs
// const provider = new ethers.JsonRpcProvider(RPC_URL); // old line
let provider, signer, escrow, mnee;

const exitButton = document.getElementById("exitButton");

const defaultRoleText = document.getElementById("defaultRoleText");
const toggleRoleButton = document.getElementById("toggleRoleButton");
const fundPactTestButton = document.getElementById("fundPactTestButton");

const counterpartyLabel = document.getElementById("counterpartyLabel");
const counterpartyInput = document.getElementById("counterpartyInput");
const counterpartyStatus = document.getElementById("counterpartyStatus");

const durationDays = document.getElementById("durationDays");
const durationHours = document.getElementById("durationHours");
const durationMinutes = document.getElementById("durationMinutes");
const durationStatus = document.getElementById("durationStatus");

// ✅ NEW: Pact name input (required)
const pactNameInput = document.getElementById("pactName");

const MAX_MILESTONES = 10;
const progressMilestonesEl = document.getElementById("progressMilestones");
const addMilestoneButton = document.getElementById("addMilestoneButton");
const ppStatus = document.getElementById("ppStatus");
const progressPayEnabled = document.getElementById("progressPayEnabled");
const noProgressPayText = document.getElementById("noProgressPayText");
const progressPayBody = document.getElementById("progressPayBody");
const deleteMilestoneButton = document.getElementById("deleteMilestoneButton");
const saveMilestonesButton = document.getElementById("saveMilestonesButton");
const editMilestonesButton = document.getElementById("editMilestonesButton");

const aonRewardsEl = document.getElementById("aonRewards");
const addAonRewardButton = document.getElementById("addAonRewardButton");
const aonStatus = document.getElementById("aonStatus");
const aonPayEnabled = document.getElementById("aonPayEnabled");
const noAonPayText = document.getElementById("noAonPayText");
const aonPayBody = document.getElementById("aonPayBody");
const deleteAonRewardButton = document.getElementById("deleteAonRewardButton");
const saveAonRewardButton = document.getElementById("saveAonRewardButton");
const editAonRewardsButton = document.getElementById("editAonRewardsButton");

const payoutGraph = document.getElementById("payoutGraph");
const X_INF = "__INF__";

const viewsSlider = document.getElementById("viewsSlider");
const sliderViewsLabel = document.getElementById("sliderViewsLabel");
const sliderPayoutLabel = document.getElementById("sliderPayoutLabel");

const sendForReviewStatus = document.getElementById("sendForReviewStatus");
const sendForReviewButton = document.getElementById("sendForReviewButton");

if (!sendForReviewButton) {
  alert("Missing #sendForReviewButton in DOM");
  throw new Error("Missing #sendForReviewButton");
}

function setSendStatus(msg, ok = false) {
  if (!sendForReviewStatus) return;
  sendForReviewStatus.innerText = msg || "";
  sendForReviewStatus.className = "status-text " + (ok ? "status-ok" : "status-error");
}

//const API_BASE = "https://backend-muddy-hill-3958.fly.dev";
const API_BASE = "http://localhost:3000";

// --- negotiate mode params ---
const params = new URLSearchParams(window.location.search);
const pageMode = params.get("mode"); // "negotiate" | null
const pactId = params.get("id"); // pact id to load

let replacesPactIdForSubmit = null;

// State
const address = localStorage.getItem("address");
if (!address) window.location.href = "./index.html";

// establish default if missing (same logic as index.js)
if (!localStorage.getItem(viewModeKey(address))) {
  localStorage.setItem(viewModeKey(address), "sponsor");
}

let progressMilestones = [{ views: "", payout: "" }]; // start with one
let milestonesLocked = false;

let aonRewards = [{ views: "", payout: "" }]; // start with one
let aonRewardsLocked = false;

// Storage helpers
function viewModeKey(addr) {
  return `pactViewMode:${addr.toLowerCase()}`;
}

function getRole(addr) {
  return localStorage.getItem(viewModeKey(addr)) || "sponsor";
}

function setRole(addr, role) {
  localStorage.setItem(viewModeKey(addr), role);
}

// ✅ Pact name storage (local only; per-user)
function pactNameKey(addr, pactId) {
  return `pactName:${String(addr || "").toLowerCase()}:${String(pactId)}`;
}

function setPactName(addr, pactId, name) {
  const n = String(name || "").trim();
  if (!n) return;
  localStorage.setItem(pactNameKey(addr, pactId), n);
}

function earnVerb() {
  return getRole(address) === "sponsor" ? "reward" : "earn";
}

function otherPartyLabel() {
  return getRole(address) === "sponsor" ? "Creator" : "Sponsor";
}

function renderRole() {
  const role = getRole(address);
  defaultRoleText.innerText = role === "sponsor" ? "Sponsor" : "Creator";
  toggleRoleButton.disabled = false;

  counterpartyLabel.innerText =
    role === "sponsor" ? "Creator address" : "Sponsor address";
}

function splitDuration(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const days = Math.floor(s / 86400);
  const rem1 = s % 86400;
  const hours = Math.floor(rem1 / 3600);
  const rem2 = rem1 % 3600;
  const minutes = Math.floor(rem2 / 60);
  return { days, hours, minutes };
}

function coerceMilestones(arr) {
  if (!Array.isArray(arr) || arr.length === 0)
    return [{ views: "", payout: "" }];
  return arr.map((m) => ({
    views: String(m?.views ?? ""),
    payout: String(m?.payout ?? ""),
  }));
}

async function loadNegotiatePactOrThrow(id) {
  replacesPactIdForSubmit = Number(id);
  const res = await fetch(`${API_BASE}/api/pacts/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data?.error || "Failed to load pact");
  }

  if (!data.pact) {
    throw new Error("Failed to load pact (missing pact in response).");
  }

  const p = data.pact;

  // Security: only the counterparty should be able to negotiate from pact-view’s rule.
  // If someone manually types the URL, we still protect.
  if (String(p.status) !== "sent_for_review") {
    throw new Error("This pact is not negotiable (not awaiting review).");
  }
  if (
    String(p.counterparty_address || "").toLowerCase() !== address.toLowerCase()
  ) {
    throw new Error("Not authorized to negotiate this pact.");
  }

  // 1) Role: counterparty becomes the proposer in negotiation -> opposite of original proposer_role
  const originalProposerRole = String(p.proposer_role);
  const newRole = originalProposerRole === "sponsor" ? "creator" : "sponsor";
  setRole(address, newRole);
  renderRole();

  // 2) Name
  if (pactNameInput) pactNameInput.value = String(p.name || "");

  // 3) Counterparty input = other party (original proposer_address)
  counterpartyInput.value = String(p.proposer_address || "");
  validateCounterparty();

  // --- view-only fields in negotiate mode ---
  toggleRoleButton.disabled = true; // role can't change
  setViewOnly(pactNameInput, true); // pact name can't change
  setViewOnly(counterpartyInput, false);
  counterpartyInput.readOnly = true; // keep value, but user can't edit

  counterpartyStatus.innerText = ""; // optional: hide validation text

  // 4) Duration
  const { days, hours, minutes } = splitDuration(p.duration_seconds);
  if (!Number.isFinite(Number(p.duration_seconds))) {
    throw new Error("Loaded pact is missing duration_seconds.");
  }

  durationDays.value = days;
  durationHours.value = hours;
  durationMinutes.value = minutes;
  validateDuration();

  // 5) Progress pay
  progressPayEnabled.checked = !!p.progress_enabled;
  milestonesLocked = !!p.progress_locked;

  if (progressPayEnabled.checked) {
    progressMilestones = coerceMilestones(p.progress_milestones);
  } else {
    progressMilestones = [{ views: "", payout: "" }];
    milestonesLocked = false;
    ppStatus.innerText = "";
  }

  renderProgressMilestones();
  renderProgressPayEnabled();
  updateMilestoneControlsVisibility();
  updateDeleteMilestoneVisibility();

  // 6) AON pay
  aonPayEnabled.checked = !!p.aon_enabled;
  aonRewardsLocked = !!p.aon_locked;

  if (aonPayEnabled.checked) {
    aonRewards = coerceMilestones(p.aon_rewards);
  } else {
    aonRewards = [{ views: "", payout: "" }];
    aonRewardsLocked = false;
    aonStatus.innerText = "";
  }

  renderAonRewards();
  renderAonPayEnabled();
  updateAonRewardControlsVisibility();
  updateDeleteAonRewardVisibility();

  // 7) Graph/slider sync
  renderPayoutGraph();
  syncSliderBounds();
  updateSliderReadout();

  // UX: make it obvious this is negotiation
  if (sendForReviewButton)
    sendForReviewButton.innerText = "Send revised pact for review";
}

function setViewOnly(el, on) {
  if (!el) return;

  // inputs: use readOnly so value is still readable/submittable/validatable
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    el.readOnly = !!on;
    return;
  }

  // other controls (buttons/checkboxes) can be disabled
  if ("disabled" in el) el.disabled = !!on;
}

function renderProgressMilestones() {
  // ✅ guarantee at least one row
  if (!Array.isArray(progressMilestones) || progressMilestones.length === 0) {
    progressMilestones = [{ views: "", payout: "" }];
  }

  progressMilestonesEl.innerHTML = progressMilestones
    .map((m, i) => {
      const isLatest = i === progressMilestones.length - 1;
      const editable = !milestonesLocked && isLatest;
      const ro = editable ? "" : "readonly";
      const dis = editable ? "" : "disabled";
      const rateText = impliedRateText(i);

      return `
        <div class="milestone-row">
          <div class="milestone-label">Milestone ${i + 1}</div>

          <div class="milestone-inputs">
            <div>
              <label style="font-size: 0.85rem; margin-bottom: 4px;">Views</label>
              <input
                type="number"
                min="1"
                step="1"
                value="${m.views}"
                data-index="${i}"
                data-field="views"
                ${ro}
                ${dis}
              />
            </div>

            <div>
              <label style="font-size: 0.85rem; margin-bottom: 4px;">Total Payout ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value="${m.payout}"
                data-index="${i}"
                data-field="payout"
                ${ro}
                ${dis}
              />
            </div>
          </div>

          <div class="rate-display">
            ${
              i === 0
                ? `<div style="font-size:0.75rem; opacity:0.7; margin-bottom:4px;">Implied rate</div>`
                : `<div style="height:14px;"></div>`
            }
            <div id="rate-${i}" style="font-weight:600; color: #0277BD;">
              ${rateText || "-"}
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  renderPayoutGraph();
}

function formatRate(rate, sig = 2, minDecimals = 2) {
  if (!Number.isFinite(rate) || rate <= 0) return "";

  const abs = Math.abs(rate);

  if (abs >= 1) return rate.toFixed(minDecimals);

  const exp = Math.floor(Math.log10(abs));
  const neededDecimalsForSig = -exp + (sig - 1);
  const decimals = Math.max(minDecimals, neededDecimalsForSig);
  return rate.toFixed(decimals);
}

function renderProgressPayEnabled() {
  const enabled = progressPayEnabled.checked;

  progressPayBody.style.display = enabled ? "block" : "none";
  noProgressPayText.style.display = enabled ? "none" : "block";

  saveMilestonesButton.style.display =
    enabled && !milestonesLocked ? "inline-block" : "none";
  editMilestonesButton.style.display =
    enabled && milestonesLocked ? "inline-block" : "none";

  if (!enabled) {
    progressMilestones = [{ views: "", payout: "" }];
    ppStatus.innerText = "";
    milestonesLocked = false;
    renderProgressMilestones();
  }

  updateMilestoneControlsVisibility();
}

function updateDeleteMilestoneVisibility() {
  deleteMilestoneButton.style.display =
    progressMilestones.length > 1 ? "inline-block" : "none";
}

function updateMilestoneControlsVisibility() {
  if (!progressPayEnabled.checked) {
    addMilestoneButton.style.display = "none";
    deleteMilestoneButton.style.display = "none";
    saveMilestonesButton.style.display = "none";
    editMilestonesButton.style.display = "none";
    return;
  }

  const locked = milestonesLocked;
  addMilestoneButton.style.display = locked ? "none" : "inline-block";
  deleteMilestoneButton.style.display =
    locked || progressMilestones.length <= 1 ? "none" : "inline-block";
  saveMilestonesButton.style.display = locked ? "none" : "inline-block";
  editMilestonesButton.style.display = locked ? "inline-block" : "none";
}

function impliedRateText(i) {
  const cur = progressMilestones[i];
  const vStr = String(cur.views ?? "").trim();
  const pStr = String(cur.payout ?? "").trim();
  if (!vStr || !pStr) return "";

  const v = Number(vStr);
  const p = Number(pStr);
  if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(p) || p <= 0) return "";

  if (i === 0) {
    const rate = p / v;
    return `For views 1 to ${v}, you ${earnVerb()} $${formatRate(rate)}/view`;
  }

  const prev = progressMilestones[i - 1];
  const pv = Number(prev.views);
  const pp = Number(prev.payout);
  if (!Number.isFinite(pv) || !Number.isFinite(pp)) return "";

  const dv = v - pv;
  const dp = p - pp;
  if (dv <= 0 || dp <= 0) return "";

  const rate = dp / dv;
  return `For views ${pv + 1} to ${v}, you ${earnVerb()} $${formatRate(
    rate
  )}/view`;
}

function renderAonRewards() {
  // ✅ guarantee at least one row
  if (!Array.isArray(aonRewards) || aonRewards.length === 0) {
    aonRewards = [{ views: "", payout: "" }];
  }

  aonRewardsEl.innerHTML = aonRewards
    .map((m, i) => {
      const isLatest = i === aonRewards.length - 1;
      const editable = !aonRewardsLocked && isLatest;
      const ro = editable ? "" : "readonly";
      const dis = editable ? "" : "disabled";
      const rewardText = aonRewardText(i);

      return `
        <div class="reward-row">
          <div class="milestone-label">Reward ${i + 1}</div>

          <div class="milestone-inputs">
            <div>
              <label style="font-size: 0.85rem; margin-bottom: 4px;">Views</label>
              <input
                type="number"
                min="1"
                step="1"
                value="${m.views}"
                data-index="${i}"
                data-field="views"
                ${ro}
                ${dis}
              />
            </div>

            <div>
              <label style="font-size: 0.85rem; margin-bottom: 4px;">Reward Payout ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value="${m.payout}"
                data-index="${i}"
                data-field="payout"
                ${ro}
                ${dis}
              />
            </div>
          </div>

          <div class="rate-display" style="min-width: 320px;">
            <div style="font-size:0.75rem; opacity:0.7; margin-bottom:4px;">Reward</div>
            <div id="aon-reward-${i}" style="font-weight:600; color: #0277BD;">
              ${rewardText || "-"}
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  renderPayoutGraph();
}

function renderAonPayEnabled() {
  const enabled = aonPayEnabled.checked;

  aonPayBody.style.display = enabled ? "block" : "none";
  noAonPayText.style.display = enabled ? "none" : "block";

  saveAonRewardButton.style.display =
    enabled && !aonRewardsLocked ? "inline-block" : "none";
  editAonRewardsButton.style.display =
    enabled && aonRewardsLocked ? "inline-block" : "none";

  if (!enabled) {
    aonRewards = [{ views: "", payout: "" }];
    aonStatus.innerText = "";
    aonRewardsLocked = false;
    renderAonRewards();
  }

  updateAonRewardControlsVisibility();
}

function updateDeleteAonRewardVisibility() {
  deleteAonRewardButton.style.display =
    aonRewards.length > 1 ? "inline-block" : "none";
}

function updateAonRewardControlsVisibility() {
  if (!aonPayEnabled.checked) {
    addAonRewardButton.style.display = "none";
    deleteAonRewardButton.style.display = "none";
    saveAonRewardButton.style.display = "none";
    editAonRewardsButton.style.display = "none";
    return;
  }

  const locked = aonRewardsLocked;
  addAonRewardButton.style.display = locked ? "none" : "inline-block";
  deleteAonRewardButton.style.display =
    locked || aonRewards.length <= 1 ? "none" : "inline-block";
  saveAonRewardButton.style.display = locked ? "none" : "inline-block";
  editAonRewardsButton.style.display = locked ? "inline-block" : "none";
}

function aonRewardText(i) {
  const cur = aonRewards[i];
  const vStr = String(cur.views ?? "").trim();
  const pStr = String(cur.payout ?? "").trim();
  if (!vStr || !pStr) return "";

  const v = Number(vStr);
  const p = Number(pStr);
  if (!Number.isInteger(v) || v <= 0 || !Number.isFinite(p) || p <= 0)
    return "";

  return `You ${earnVerb()} an additional $${p.toFixed(2)} at ${v} views.`;
}

function progressPayoutAtViews(x) {
  if (!progressPayEnabled.checked) return 0;

  const ms = progressMilestones
    .map((m) => ({ v: Number(m.views), p: Number(m.payout) }))
    .filter(
      (m) => Number.isInteger(m.v) && m.v > 0 && Number.isFinite(m.p) && m.p > 0
    )
    .sort((a, b) => a.v - b.v);

  if (ms.length === 0) return 0;

  if (x <= 0) return 0;
  if (x >= ms[ms.length - 1].v) return ms[ms.length - 1].p;

  if (x <= ms[0].v) return (x / ms[0].v) * ms[0].p;

  for (let i = 1; i < ms.length; i++) {
    const a = ms[i - 1],
      b = ms[i];
    if (x <= b.v) {
      const t = (x - a.v) / (b.v - a.v);
      return a.p + t * (b.p - a.p);
    }
  }
  return ms[ms.length - 1].p;
}

function aonBonusAtViews(x) {
  if (!aonPayEnabled.checked) return 0;

  const rewards = aonRewards
    .map((r) => ({ v: Number(r.views), p: Number(r.payout) }))
    .filter(
      (r) => Number.isInteger(r.v) && r.v > 0 && Number.isFinite(r.p) && r.p > 0
    );

  let sum = 0;
  for (const r of rewards) {
    if (x >= r.v) sum += r.p;
  }
  return sum;
}

function totalPayoutAtViews(x) {
  return progressPayoutAtViews(x) + aonBonusAtViews(x);
}

function collectKeyViewsWithInfinity() {
  const set = new Set();
  set.add(0);

  if (progressPayEnabled.checked) {
    for (const m of progressMilestones) {
      const v = Number(String(m.views ?? "").trim());
      if (Number.isInteger(v) && v > 0) set.add(v);
    }
  }

  if (aonPayEnabled.checked) {
    for (const r of aonRewards) {
      const v = Number(String(r.views ?? "").trim());
      if (Number.isInteger(v) && v > 0) set.add(v);
    }
  }

  const numeric = Array.from(set).sort((a, b) => a - b);
  return [...numeric, X_INF];
}

function makeOrdinalScaleX(keys, padL, innerW) {
  const n = keys.length;
  const pos = new Map();
  const step = n <= 1 ? 0 : innerW / (n - 1);
  keys.forEach((k, i) => pos.set(k, padL + i * step));
  return (k) => pos.get(k);
}

function formatXKey(k) {
  return k === X_INF ? "∞" : String(k);
}

function aonBonusBeforeViews(k) {
  if (!aonPayEnabled.checked) return 0;
  if (!Number.isFinite(k)) return 0;

  const rewards = aonRewards
    .map((r) => ({ v: Number(r.views), p: Number(r.payout) }))
    .filter(
      (r) => Number.isInteger(r.v) && r.v > 0 && Number.isFinite(r.p) && r.p > 0
    );

  let sum = 0;
  for (const r of rewards) {
    if (r.v < k) sum += r.p;
  }
  return sum;
}

function niceStep(rawStep) {
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const f = rawStep / base;

  if (f <= 1) return 1 * base;
  if (f <= 2) return 2 * base;
  if (f <= 5) return 5 * base;
  return 10 * base;
}

function makeNiceTicks(maxVal, target = 6) {
  if (maxVal <= 0) return [0];
  const step = niceStep(maxVal / target);
  const top = Math.ceil(maxVal / step) * step;

  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function formatMoneyTick(v) {
  if (v >= 1000) return `$${Math.round(v).toLocaleString()}`;
  return `$${v.toFixed(0)}`;
}

function renderPayoutGraph() {
  if (!payoutGraph) return;

  const w = Number(payoutGraph.getAttribute("width")) || 680;
  const h = Number(payoutGraph.getAttribute("height")) || 220;

  const padL = 52,
    padR = 14,
    padT = 14,
    padB = 42;

  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  payoutGraph.setAttribute("viewBox", `0 0 ${w} ${h}`);
  payoutGraph.innerHTML = "";

  payoutGraph.innerHTML += `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${
    padT + innerH
  }" stroke="#999"/>
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${
    padT + innerH
  }" stroke="#999"/>
    <text x="${padL}" y="${h - 10}" font-size="11" fill="#666">views</text>
    <text x="10" y="${padT + 12}" font-size="11" fill="#666">payout</text>
  `;

  const keys = collectKeyViewsWithInfinity();

  const hasAnyThreshold = keys.some((k) => k !== 0 && k !== X_INF);
  if (!hasAnyThreshold) {
    payoutGraph.innerHTML += `
      <text x="${padL + 10}" y="${padT + 22}" font-size="12" fill="#999">
        Enter milestone/reward view thresholds to see the graph.
      </text>
    `;

    const axisY = padT + innerH;
    const x0 = padL;
    const xInf = padL + innerW;

    payoutGraph.innerHTML += `
      <line x1="${x0}" y1="${axisY}" x2="${x0}" y2="${
      axisY + 6
    }" stroke="#999"/>
      <text x="${x0}" y="${
      axisY + 20
    }" font-size="10" fill="#666" text-anchor="middle">0</text>

      <line x1="${xInf}" y1="${axisY}" x2="${xInf}" y2="${
      axisY + 6
    }" stroke="#999"/>
      <text x="${xInf}" y="${
      axisY + 20
    }" font-size="10" fill="#666" text-anchor="middle">∞</text>
    `;
    return;
  }

  const sx = makeOrdinalScaleX(keys, padL, innerW);

  const pts = keys.map((k) => {
    if (k === X_INF) {
      const y = totalPayoutAtViews(Number.MAX_SAFE_INTEGER);
      return { k, yBefore: y, yAfter: y };
    }

    const progress = progressPayoutAtViews(k);
    const yBefore = progress + aonBonusBeforeViews(k);
    const yAfter = progress + aonBonusAtViews(k);
    return { k, yBefore, yAfter };
  });

  const maxY = Math.max(1, ...pts.map((p) => Math.max(p.yBefore, p.yAfter)));
  const sy = (y) => padT + innerH - (y / maxY) * innerH;

  const yTicks = makeNiceTicks(maxY, 6);

  for (const yVal of yTicks) {
    const y = sy(yVal);

    payoutGraph.innerHTML += `
      <line x1="${padL - 4}" y1="${y}" x2="${padL}" y2="${y}" stroke="#999"/>
      <text x="${padL - 8}" y="${
      y + 3
    }" font-size="10" fill="#666" text-anchor="end">
        ${formatMoneyTick(yVal)}
      </text>
    `;
  }

  const maxLabels = 8;
  const showIdx = new Set();
  showIdx.add(0);
  showIdx.add(keys.length - 1);

  if (keys.length > maxLabels) {
    const step = Math.ceil((keys.length - 2) / (maxLabels - 2));
    for (let i = step; i < keys.length - 1; i += step) showIdx.add(i);
  } else {
    for (let i = 1; i < keys.length - 1; i++) showIdx.add(i);
  }

  const axisY = padT + innerH;
  keys.forEach((k, i) => {
    if (!showIdx.has(i)) return;
    const x = sx(k);
    payoutGraph.innerHTML += `
      <line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 6}" stroke="#999"/>
      <text x="${x}" y="${
      axisY + 20
    }" font-size="10" fill="#666" text-anchor="middle">
        ${formatXKey(k)}
      </text>
    `;
  });

  let d = `M ${sx(pts[0].k)} ${sy(pts[0].yAfter)} `;

  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    const xCur = sx(cur.k);

    d += `L ${xCur} ${sy(cur.yBefore)} `;

    if (Math.abs(cur.yAfter - cur.yBefore) > 1e-9) {
      d += `L ${xCur} ${sy(cur.yAfter)} `;
    }
  }

  payoutGraph.innerHTML += `<path d="${d}" fill="none" stroke="#333" stroke-width="2"/>`;

  if (viewsSlider) {
    const v = Number(viewsSlider.value || 0);

    const numericKeys = keys.filter((k) => k !== X_INF);
    let xMarker = sx(numericKeys[numericKeys.length - 1]);

    if (v <= numericKeys[0]) {
      xMarker = sx(numericKeys[0]);
    } else {
      for (let i = 0; i < numericKeys.length - 1; i++) {
        const a = numericKeys[i];
        const b = numericKeys[i + 1];
        if (v <= b) {
          const xa = sx(a);
          const xb = sx(b);
          const t = (v - a) / (b - a);
          xMarker = xa + t * (xb - xa);
          break;
        }
      }
    }

    const earned = totalPayoutAtViews(v);
    const yMarker = sy(earned);

    payoutGraph.innerHTML += `
      <line x1="${xMarker}" y1="${padT}" x2="${xMarker}" y2="${
      padT + innerH
    }" stroke="#888" stroke-dasharray="4 4"/>
      <circle cx="${xMarker}" cy="${yMarker}" r="4" fill="#333"/>
    `;
  }

  syncSliderBounds();
  updateSliderReadout();
}

function maxThresholdViews() {
  let maxV = 0;

  if (progressPayEnabled.checked) {
    for (const m of progressMilestones) {
      const v = Number(String(m.views ?? "").trim());
      if (Number.isInteger(v) && v > maxV) maxV = v;
    }
  }

  if (aonPayEnabled.checked) {
    for (const r of aonRewards) {
      const v = Number(String(r.views ?? "").trim());
      if (Number.isInteger(v) && v > maxV) maxV = v;
    }
  }

  return maxV;
}

function formatMoney(v) {
  return `$${v.toFixed(2)}`;
}

function syncSliderBounds() {
  if (!viewsSlider) return;

  const maxV = maxThresholdViews();

  if (maxV <= 0) {
    viewsSlider.min = "0";
    viewsSlider.max = "0";
    viewsSlider.value = "0";
    viewsSlider.disabled = true;
    return;
  }

  viewsSlider.disabled = false;
  viewsSlider.min = "0";
  viewsSlider.max = String(maxV);

  const cur = Number(viewsSlider.value || 0);
  if (cur > maxV) viewsSlider.value = String(maxV);
}

function updateSliderReadout() {
  if (!viewsSlider) return;

  const v = Number(viewsSlider.value || 0);
  sliderViewsLabel.innerText = String(v);

  const earned = totalPayoutAtViews(v);
  sliderPayoutLabel.innerText = formatMoney(earned);
}

// ✅ NEW: validate pact name (required)
function validatePactName() {
  if (!pactNameInput) return true; // if missing in DOM, don't hard-crash
  const name = String(pactNameInput.value || "").trim();
  return name.length > 0;
}

// Validation
function validateCounterparty() {
  const value = counterpartyInput.value.trim();
  const role = getRole(address);
  const otherParty = role === "sponsor" ? "Creator" : "Sponsor";

  if (!value) {
    counterpartyStatus.innerText = "";
    counterpartyStatus.className = "status-text";
    return false;
  }

  if (!ethers.isAddress(value)) {
    counterpartyStatus.innerText = `Invalid ${
      role === "sponsor" ? "Creator" : "Sponsor"
    } address`;
    counterpartyStatus.className = "status-text status-error";
    return false;
  }

  if (value.toLowerCase() === address.toLowerCase()) {
    counterpartyStatus.innerText = `${otherParty} cannot be your own address`;
    counterpartyStatus.className = "status-text status-error";
    return false;
  }

  counterpartyStatus.innerText = `✓ Valid ${otherParty} address`;
  counterpartyStatus.className = "status-text status-ok";
  return true;
}

function validateDuration() {
  const d = Number(durationDays.value);
  const h = Number(durationHours.value);
  const m = Number(durationMinutes.value);

  if (![d, h, m].every(Number.isInteger)) {
    durationStatus.innerText = "Duration values must be integers";
    durationStatus.className = "status-text status-error";
    return false;
  }

  if (d < 0 || h < 0 || m < 0) {
    durationStatus.innerText = "Duration values cannot be negative";
    durationStatus.className = "status-text status-error";
    return false;
  }

  if (h > 23) {
    durationStatus.innerText = "Hours must be between 0 and 23";
    durationStatus.className = "status-text status-error";
    return false;
  }

  if (m > 59) {
    durationStatus.innerText = "Minutes must be between 0 and 59";
    durationStatus.className = "status-text status-error";
    return false;
  }

  if (d === 0 && h === 0 && m === 0) {
    durationStatus.innerText = "Duration must be greater than 0";
    durationStatus.className = "status-text status-error";
    return false;
  }

  durationStatus.innerText = "✓ Valid duration";
  durationStatus.className = "status-text status-ok";
  return true;
}

function validateMilestonesAndExplain() {
  for (let i = 0; i < progressMilestones.length; i++) {
    const m = progressMilestones[i];
    const viewsStr = String(m.views ?? "").trim();
    const payoutStr = String(m.payout ?? "").trim();

    if (!viewsStr || !payoutStr) {
      return {
        ok: false,
        msg: `Milestone ${
          i + 1
        }: fill in the empty fields (Views and Total Payout ($)).`,
      };
    }
  }

  for (let i = 0; i < progressMilestones.length; i++) {
    const m = progressMilestones[i];
    const views = Number(String(m.views).trim());
    const payout = Number(String(m.payout).trim());

    if (!Number.isInteger(views) || views <= 0) {
      return {
        ok: false,
        msg: `Milestone ${
          i + 1
        }: Views must be a positive whole number (e.g., 1000).`,
      };
    }

    if (!Number.isFinite(payout) || payout <= 0) {
      return {
        ok: false,
        msg: `Milestone ${
          i + 1
        }: Total Payout ($) must be a positive number (e.g., 250 or 250.50).`,
      };
    }
  }

  for (let i = 1; i < progressMilestones.length; i++) {
    const prevViews = Number(progressMilestones[i - 1].views);
    const prevPayout = Number(progressMilestones[i - 1].payout);

    const curViews = Number(progressMilestones[i].views);
    const curPayout = Number(progressMilestones[i].payout);

    if (curViews <= prevViews) {
      return {
        ok: false,
        msg: `Milestone ${
          i + 1
        }: Views must be greater than Milestone ${i} (currently ${curViews} ≤ ${prevViews}).`,
      };
    }

    if (curPayout <= prevPayout) {
      return {
        ok: false,
        msg: `Milestone ${
          i + 1
        }: Total Payout ($) must be greater than Milestone ${i} (currently ${curPayout} ≤ ${prevPayout}).`,
      };
    }
  }

  return { ok: true, msg: "✓ Milestones look good." };
}

function validateAonRewardsAndExplain() {
  for (let i = 0; i < aonRewards.length; i++) {
    const m = aonRewards[i];
    const viewsStr = String(m.views ?? "").trim();
    const payoutStr = String(m.payout ?? "").trim();

    if (!viewsStr || !payoutStr) {
      return {
        ok: false,
        msg: `Reward ${
          i + 1
        }: fill in the empty fields (Views and Total Payout ($)).`,
      };
    }
  }

  for (let i = 0; i < aonRewards.length; i++) {
    const m = aonRewards[i];
    const views = Number(String(m.views).trim());
    const payout = Number(String(m.payout).trim());

    if (!Number.isInteger(views) || views <= 0) {
      return {
        ok: false,
        msg: `Reward ${
          i + 1
        }: Views must be a positive whole number (e.g., 1000).`,
      };
    }

    if (!Number.isFinite(payout) || payout <= 0) {
      return {
        ok: false,
        msg: `Reward ${
          i + 1
        }: Total Payout ($) must be a positive number (e.g., 250 or 250.50).`,
      };
    }
  }

  for (let i = 1; i < aonRewards.length; i++) {
    const prevViews = Number(aonRewards[i - 1].views);
    const curViews = Number(aonRewards[i].views);

    if (curViews <= prevViews) {
      return {
        ok: false,
        msg: `Reward ${
          i + 1
        }: Views must be greater than Reward ${i} (currently ${curViews} ≤ ${prevViews}).`,
      };
    }
  }

  return { ok: true, msg: "✓ Rewards look good." };
}

async function verifyEthOwnershipOrAlert() {
  if (!window.ethereum) {
    alert("MetaMask not found. Install MetaMask to verify.");
    return false;
  }

  const browserProvider = new ethers.BrowserProvider(window.ethereum);

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  const selected = (accounts?.[0] || "").toLowerCase();

  if (!selected) {
    alert("No wallet selected in MetaMask.");
    return false;
  }

  if (selected !== address.toLowerCase()) {
    alert(
      `MetaMask account does not match your login address.\n\nLogin: ${address}\nMetaMask: ${accounts[0]}`
    );
    return false;
  }

  const signer = await browserProvider.getSigner();

  const role = getRole(address);
  const counterparty = counterpartyInput.value.trim();
  const durationSec =
    Number(durationDays.value) * 86400 +
    Number(durationHours.value) * 3600 +
    Number(durationMinutes.value) * 60;

  const nonce = ethers.hexlify(ethers.randomBytes(16));
  const issuedAt = new Date().toISOString();

  const message =
    `Pactory verification\n` +
    `Address: ${address}\n` +
    `Role: ${role}\n` +
    `Counterparty: ${counterparty || "(none)"}\n` +
    `DurationSeconds: ${durationSec}\n` +
    `Nonce: ${nonce}\n` +
    `IssuedAt: ${issuedAt}`;

  let signature;
  try {
    signature = await signer.signMessage(message);
  } catch {
    alert("Signature was rejected. Verification failed.");
    return false;
  }

  const recovered = ethers.verifyMessage(message, signature).toLowerCase();
  if (recovered !== address.toLowerCase()) {
    alert("Signature verification failed (recovered address mismatch).");
    return false;
  }

  localStorage.setItem(`pactVerifySig:${address.toLowerCase()}`, signature);
  localStorage.setItem(`pactVerifyMsg:${address.toLowerCase()}`, message);

  return true;
}

async function initContracts() {
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();

  escrow = new ethers.Contract(PACT_ESCROW_ADDRESS, PactEscrowABI, signer);

  mnee = new ethers.Contract(MNEE_ADDRESS, ERC20ABI, signer);
}

// Handlers
toggleRoleButton.onclick = () => {
  const cur = getRole(address);
  const next = cur === "sponsor" ? "creator" : "sponsor";
  setRole(address, next);
  renderRole();

  counterpartyInput.value = "";
  counterpartyStatus.innerText = "";

  durationDays.value = 0;
  durationHours.value = 0;
  durationMinutes.value = 0;
  durationStatus.innerText = "";

  progressPayEnabled.checked = true;
  noProgressPayText.style.display = "none";
  progressPayBody.style.display = "block";

  progressMilestones = [{ views: "", payout: "" }];
  ppStatus.innerText = "";
  milestonesLocked = false;
  renderProgressMilestones();
  updateDeleteMilestoneVisibility();

  aonPayEnabled.checked = true;
  noAonPayText.style.display = "none";
  aonPayBody.style.display = "block";

  aonRewards = [{ views: "", payout: "" }];
  aonStatus.innerText = "";
  aonRewardsLocked = false;
  renderAonRewards();
  updateAonRewardControlsVisibility();

  syncSliderBounds();
  updateSliderReadout();
  renderPayoutGraph();
};

async function fundPactOnChain(pactId, amountUsd) {
  await initContracts();

  //convert dollars to MNEE (1 MNEE = $1.00)
  const amountMnee = ethers.parseUnits(
    amountUsd.toString(),
    await mnee.decimals()
  );

  //approve the escrow contract to spend MNEE
  const approveTx = await mnee.approve(PACT_ESCROW_ADDRESS, amountMnee);
  await approveTx.wait();

  //fund the pact
  const fundTx = await escrow.fund(pactId, amountMnee);
  await fundTx.wait();

  return true;
}

counterpartyInput.addEventListener("input", validateCounterparty);

[durationDays, durationHours, durationMinutes].forEach((el) =>
  el.addEventListener("input", validateDuration)
);

progressMilestonesEl.addEventListener("input", (e) => {
  const idx = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (Number.isNaN(idx) || !field) return;

  const latestIdx = progressMilestones.length - 1;
  if (!milestonesLocked && idx !== latestIdx) return;

  progressMilestones[idx][field] = e.target.value;
  renderPayoutGraph();

  const rateEl = document.getElementById(`rate-${idx}`);
  if (rateEl) rateEl.innerText = impliedRateText(idx) || "-";
});

progressPayEnabled.addEventListener("change", renderProgressPayEnabled);

exitButton.onclick = () => {
  window.location.href = "./pacts-dashboard.html";
};

addMilestoneButton.onclick = () => {
  const result = validateMilestonesAndExplain();

  if (!result.ok) {
    ppStatus.innerText = result.msg;
    return;
  }

  if (progressMilestones.length >= MAX_MILESTONES) {
    ppStatus.innerText = "Maximum of 10 milestones reached.";
    ppStatus.className = "status-text status-error";
    return;
  }

  progressMilestones.push({ views: "", payout: "" });
  ppStatus.innerText = "";
  renderProgressMilestones();
  updateDeleteMilestoneVisibility();
  renderPayoutGraph();
};

deleteMilestoneButton.onclick = () => {
  if (progressMilestones.length <= 1) return;

  progressMilestones.pop();
  ppStatus.innerText = "";
  renderProgressMilestones();
  updateDeleteMilestoneVisibility();
  renderPayoutGraph();
};

saveMilestonesButton.onclick = () => {
  const result = validateMilestonesAndExplain();
  if (!result.ok) {
    ppStatus.innerText = result.msg;
    ppStatus.className = "status-text status-error";
    return;
  }

  milestonesLocked = true;
  ppStatus.innerText = "✓ Saved. Progress Pay is locked.";
  ppStatus.className = "status-text status-ok";
  renderProgressMilestones();
  updateMilestoneControlsVisibility();
  renderPayoutGraph();
};

editMilestonesButton.onclick = () => {
  milestonesLocked = false;
  ppStatus.innerText = "";
  renderProgressMilestones();
  updateMilestoneControlsVisibility();
  renderPayoutGraph();
};

aonRewardsEl.addEventListener("input", (e) => {
  const idx = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (Number.isNaN(idx) || !field) return;

  const latestIdx = aonRewards.length - 1;
  if (!aonRewardsLocked && idx !== latestIdx) return;

  aonRewards[idx][field] = e.target.value;
  renderPayoutGraph();

  const textEl = document.getElementById(`aon-reward-${idx}`);
  if (textEl) textEl.innerText = aonRewardText(idx) || "-";
});

aonPayEnabled.addEventListener("change", renderAonPayEnabled);

addAonRewardButton.onclick = () => {
  const result = validateAonRewardsAndExplain();
  if (!result.ok) {
    aonStatus.innerText = result.msg;
    return;
  }

  if (aonRewards.length >= MAX_MILESTONES) {
    aonStatus.innerText = "Maximum of 10 rewards reached.";
    aonStatus.className = "status-text status-error";
    return;
  }

  aonRewards.push({ views: "", payout: "" });
  aonStatus.innerText = "";
  renderAonRewards();
  updateDeleteAonRewardVisibility();
  updateAonRewardControlsVisibility();
  renderPayoutGraph();
};

deleteAonRewardButton.onclick = () => {
  if (aonRewards.length <= 1) return;

  aonRewards.pop();
  aonStatus.innerText = "";
  renderAonRewards();
  updateDeleteAonRewardVisibility();
  updateAonRewardControlsVisibility();
  renderPayoutGraph();
};

saveAonRewardButton.onclick = () => {
  const result = validateAonRewardsAndExplain();
  if (!result.ok) {
    aonStatus.innerText = result.msg;
    return;
  }

  aonRewardsLocked = true;
  aonStatus.innerText = "✓ Saved. All-or-Nothing Pay is locked.";
  aonStatus.className = "status-text status-ok";
  renderAonRewards();
  updateAonRewardControlsVisibility();
  renderPayoutGraph();
};

editAonRewardsButton.onclick = () => {
  aonRewardsLocked = false;
  aonStatus.innerText = "";
  renderAonRewards();
  updateAonRewardControlsVisibility();
  renderPayoutGraph();
};

viewsSlider?.addEventListener("input", () => {
  updateSliderReadout();
  renderPayoutGraph();
});

sendForReviewButton.onclick = async () => {
  setSendStatus("");

  // lock UI
  sendForReviewButton.disabled = true;
  sendForReviewButton.style.opacity = "0.7";
  sendForReviewButton.style.cursor = "not-allowed";

  try {
    // 0) Pact name required
    const pactName = String(pactNameInput?.value || "").trim();
    if (!pactName) return setSendStatus("Pact name is required.");
    if (pactName.length > 60)
      return setSendStatus("Pact name must be 60 characters or less.");

    // 1) Counterparty valid
    if (!validateCounterparty())
      return setSendStatus(
        counterpartyStatus.innerText || "Enter a valid address."
      );

    // 2) Duration valid
    if (!validateDuration())
      return setSendStatus(
        durationStatus.innerText || "Enter a valid duration."
      );

    // 3) Progress pay: disabled OR saved
    if (progressPayEnabled.checked) {
      if (!milestonesLocked)
        return setSendStatus(
          "Progress Pay is enabled — please Save it (lock it) or disable it."
        );
      const result = validateMilestonesAndExplain();
      if (!result.ok) return setSendStatus(result.msg);
    }

    // 4) AON pay: disabled OR saved
    if (aonPayEnabled.checked) {
      if (!aonRewardsLocked)
        return setSendStatus(
          "All-or-Nothing Pay is enabled — please Save it (lock it) or disable it."
        );
      const result = validateAonRewardsAndExplain();
      if (!result.ok) return setSendStatus(result.msg);
    }

    // 5) Must have at least one payment
    const hasProgressPayment =
      progressPayEnabled.checked &&
      progressMilestones.some((m) => {
        const v = Number(String(m.views ?? "").trim());
        const p = Number(String(m.payout ?? "").trim());
        return Number.isInteger(v) && v > 0 && Number.isFinite(p) && p > 0;
      });

    const hasAonPayment =
      aonPayEnabled.checked &&
      aonRewards.some((r) => {
        const v = Number(String(r.views ?? "").trim());
        const p = Number(String(r.payout ?? "").trim());
        return Number.isInteger(v) && v > 0 && Number.isFinite(p) && p > 0;
      });

    if (!hasProgressPayment && !hasAonPayment)
      return setSendStatus(
        "You must include at least one payment (a milestone and/or a reward)."
      );

    // Ethereum verification
    setSendStatus("Waiting for MetaMask signature...");
    const ok = await verifyEthOwnershipOrAlert();
    if (!ok) return setSendStatus("Verification failed.");

    // Build payload
    const role = getRole(address);
    const counterparty = counterpartyInput.value.trim();
    const durationSeconds =
      Number(durationDays.value) * 86400 +
      Number(durationHours.value) * 3600 +
      Number(durationMinutes.value) * 60;

    const message = localStorage.getItem(
      `pactVerifyMsg:${address.toLowerCase()}`
    );
    const signature = localStorage.getItem(
      `pactVerifySig:${address.toLowerCase()}`
    );

    const payload = {
      name: pactName,
      proposerAddress: address,
      proposerRole: role,
      counterpartyAddress: counterparty,
      durationSeconds,

      progressEnabled: progressPayEnabled.checked,
      progressLocked: milestonesLocked,
      progressMilestones: progressPayEnabled.checked ? progressMilestones : [],

      aonEnabled: aonPayEnabled.checked,
      aonLocked: aonRewardsLocked,
      aonRewards: aonPayEnabled.checked ? aonRewards : [],

      message,
      signature,
    };

    // ✅ keep replace behavior in negotiate mode
    if (pageMode === "negotiate" && replacesPactIdForSubmit != null) {
      payload.replacesPactId = replacesPactIdForSubmit;
    }

    setSendStatus("Saving pact...");

    let resp;
    try {
      resp = await fetch(`${API_BASE}/api/pacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return setSendStatus("Backend not reachable.");
    }

    let data = {};
    try {
      data = await resp.json();
    } catch {
      data = {};
    }

    if (!resp.ok || !data.ok) {
      return setSendStatus(
        data?.error || `Failed to save pact (HTTP ${resp.status}).`
      );
    }

    // success
    if (data?.pactId) {
      setPactName(address, data.pactId, pactName);
    }

    setSendStatus("✓ Successfully saved. Redirecting...", true);
    
    // Trigger fireworks celebration!
    triggerFireworks();
    
    // Redirect after a short delay to see fireworks
    setTimeout(() => {
      window.location.replace("./pacts-dashboard.html");
    }, 2000);
    return;
  } finally {
    // unlock UI (won’t matter if redirect happens)
    sendForReviewButton.disabled = false;
    sendForReviewButton.style.opacity = "1";
    sendForReviewButton.style.cursor = "pointer";
  }
};

(async () => {
  try {
    // If negotiating, load the pact FIRST (it fills the fields and locks stuff)
    if (pageMode === "negotiate" && pactId) {
      await loadNegotiatePactOrThrow(pactId);
      return; // IMPORTANT: don't re-init everything and overwrite the loaded values
    }

    // Normal "new pact" init
    renderRole();
    validateCounterparty();

    renderProgressPayEnabled();
    renderAonPayEnabled();

    renderProgressMilestones();
    renderAonRewards();

    updateMilestoneControlsVisibility();
    updateAonRewardControlsVisibility();

    syncSliderBounds();
    updateSliderReadout();
    renderPayoutGraph();
  } catch (e) {
    alert(`Init failed: ${e?.message || e}`);
  }
})();
