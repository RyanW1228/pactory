import { ethers } from "./ethers-6.7.esm.min.js";
import { RPC_URL, MNEE_ADDRESS } from "./constants.js";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// DOMs
const mneeBalanceSpan = document.getElementById("mneeBalance");
const exitButton = document.getElementById("exitButton");

const defaultRoleText = document.getElementById("defaultRoleText");
const toggleRoleButton = document.getElementById("toggleRoleButton");

const counterpartyLabel = document.getElementById("counterpartyLabel");
const counterpartyInput = document.getElementById("counterpartyInput");
const counterpartyStatus = document.getElementById("counterpartyStatus");

const durationDays = document.getElementById("durationDays");
const durationHours = document.getElementById("durationHours");
const durationMinutes = document.getElementById("durationMinutes");
const durationStatus = document.getElementById("durationStatus");

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

const sendForReviewButton = document.getElementById("sendForReviewButton");
const sendForReviewStatus = document.getElementById("sendForReviewStatus");

// State
const address = localStorage.getItem("address");
if (!address) window.location.href = "./index.html";

const provider = new ethers.JsonRpcProvider(RPC_URL);

let progressMilestones = [
  { views: "", payout: "" }, // start with one
];
let milestonesLocked = false;

let aonRewards = [{ views: "", payout: "" }]; // start with one
let aonRewardsLocked = false;

// Storage helpers
function roleKey(addr) {
  return `pactRole:${addr.toLowerCase()}`;
}

function getRole(addr) {
  return localStorage.getItem(roleKey(addr)) || "sponsor";
}

function setRole(addr, role) {
  localStorage.setItem(roleKey(addr), role);
}

// UI
function renderRole() {
  const role = getRole(address);
  defaultRoleText.innerText = role === "sponsor" ? "Sponsor" : "Creator";
  toggleRoleButton.disabled = false;

  counterpartyLabel.innerText =
    role === "sponsor" ? "Creator address" : "Sponsor address";
}

function renderProgressMilestones() {
  progressMilestonesEl.innerHTML = progressMilestones
    .map((m, i) => {
      const isLatest = i === progressMilestones.length - 1;
      const editable = !milestonesLocked && isLatest;
      const ro = editable ? "" : "readonly";
      const dis = editable ? "" : "disabled";
      const rateText = impliedRateText(i);

      return `
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:10px;">
          <div style="width:90px; font-weight:600;">
            Milestone ${i + 1}
          </div>

          <div>
            <label>Views</label><br />
            <input
              type="number"
              min="1"
              step="1"
              value="${m.views}"
              data-index="${i}"
              data-field="views"
              style="width:120px;"
              ${ro}
              ${dis}
            />
          </div>

          <div>
            <label>Total Payout ($)</label><br />
            <input
              type="number"
              min="0"
              step="0.01"
              value="${m.payout}"
              data-index="${i}"
              data-field="payout"
              style="width:120px;"
              ${ro}
              ${dis}
            />
          </div>

          <div style="min-width:260px;">
            <div style="font-size:12px; opacity:0.7;">Implied rate</div>
            <div id="rate-${i}" style="font-weight:600;">${
        rateText || "-"
      }</div>
          </div>
        </div>
      `;
    })
    .join("");

  renderPayoutGraph();
}

function renderProgressPayEnabled() {
  const enabled = progressPayEnabled.checked;

  progressPayBody.style.display = enabled ? "block" : "none";
  noProgressPayText.style.display = enabled ? "none" : "block";

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
  const locked = milestonesLocked;

  // When unlocked
  addMilestoneButton.style.display = locked ? "none" : "inline-block";
  deleteMilestoneButton.style.display =
    locked || progressMilestones.length <= 1 ? "none" : "inline-block";
  saveMilestonesButton.style.display = locked ? "none" : "inline-block";

  // When locked
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
    return `For views 1 to ${v}, you earn $${rate.toFixed(2)}/view`;
  }

  const prev = progressMilestones[i - 1];
  const pv = Number(prev.views);
  const pp = Number(prev.payout);
  if (!Number.isFinite(pv) || !Number.isFinite(pp)) return "";

  const dv = v - pv;
  const dp = p - pp;
  if (dv <= 0 || dp <= 0) return "";

  const rate = dp / dv;
  return `For views ${pv + 1} to ${v}, you earn $${rate.toFixed(2)}/view`;
}

function renderAonRewards() {
  aonRewardsEl.innerHTML = aonRewards
    .map((m, i) => {
      const isLatest = i === aonRewards.length - 1;
      const editable = !aonRewardsLocked && isLatest;
      const ro = editable ? "" : "readonly";
      const dis = editable ? "" : "disabled";
      const rewardText = aonRewardText(i);

      return `
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:10px;">
          <div style="width:90px; font-weight:600;">
            Reward ${i + 1}
          </div>

          <div>
            <label>Views</label><br />
            <input
              type="number"
              min="1"
              step="1"
              value="${m.views}"
              data-index="${i}"
              data-field="views"
              style="width:120px;"
              ${ro}
              ${dis}
            />
          </div>

          <div>
            <label>Reward Payout ($)</label><br />
            <input
              type="number"
              min="0"
              step="0.01"
              value="${m.payout}"
              data-index="${i}"
              data-field="payout"
              style="width:120px;"
              ${ro}
              ${dis}
            />
          </div>

          <div style="min-width:320px;">
          <div style="font-size:12px; opacity:0.7;">Reward</div>
          <div id="aon-reward-${i}" style="font-weight:600;">
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

  return `You earn an additional $${p.toFixed(2)} at ${v} views.`;
}

function progressPayoutAtViews(x) {
  // x: integer views
  if (!progressPayEnabled.checked) return 0;

  // valid milestones only, sorted
  const ms = progressMilestones
    .map((m) => ({ v: Number(m.views), p: Number(m.payout) }))
    .filter(
      (m) => Number.isInteger(m.v) && m.v > 0 && Number.isFinite(m.p) && m.p > 0
    )
    .sort((a, b) => a.v - b.v);

  if (ms.length === 0) return 0;

  // clamp
  if (x <= 0) return 0;
  if (x >= ms[ms.length - 1].v) return ms[ms.length - 1].p;

  // first segment
  if (x <= ms[0].v) return (x / ms[0].v) * ms[0].p;

  // interpolate between milestones
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
    if (x >= r.v) sum += r.p; // one-time bonus earned once threshold reached
  }
  return sum;
}

function totalPayoutAtViews(x) {
  return progressPayoutAtViews(x) + aonBonusAtViews(x);
}

// Collect the x "vertices" we care about: 0, all milestone/reward view thresholds, plus ∞ at the end.
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

// Map each key (including ∞) to an evenly spaced x-position.
function makeOrdinalScaleX(keys, padL, innerW) {
  const n = keys.length;
  const pos = new Map();
  const step = n <= 1 ? 0 : innerW / (n - 1);
  keys.forEach((k, i) => pos.set(k, padL + i * step));
  return (k) => pos.get(k);
}

// Display label for x-axis keys
function formatXKey(k) {
  return k === X_INF ? "∞" : String(k);
}

function aonBonusBeforeViews(k) {
  // bonus strictly before reaching k views (i.e., rewards with v < k)
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

  // Axes
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

  // Ordinal x keys (0 ... ∞)
  const keys = collectKeyViewsWithInfinity();

  // If there are no numeric thresholds yet, show hint and just label 0/∞
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

  // Compute payout "just before" and "at" each threshold so AON can jump vertically
  const pts = keys.map((k) => {
    if (k === X_INF) {
      const y = totalPayoutAtViews(Number.MAX_SAFE_INTEGER);
      return { k, yBefore: y, yAfter: y };
    }

    const progress = progressPayoutAtViews(k);
    const yBefore = progress + aonBonusBeforeViews(k); // rewards with v < k
    const yAfter = progress + aonBonusAtViews(k); // rewards with v <= k
    return { k, yBefore, yAfter };
  });

  const maxY = Math.max(1, ...pts.map((p) => Math.max(p.yBefore, p.yAfter)));
  const sy = (y) => padT + innerH - (y / maxY) * innerH;

  // Y-axis ticks + labels
  const yTicks = makeNiceTicks(maxY, 6);

  for (const yVal of yTicks) {
    const y = sy(yVal);

    payoutGraph.innerHTML += `
    <line x1="${padL - 4}" y1="${y}" x2="${padL}" y2="${y}" stroke="#999"/>
    <text
      x="${padL - 8}"
      y="${y + 3}"
      font-size="10"
      fill="#666"
      text-anchor="end"
    >
      ${formatMoneyTick(yVal)}
    </text>
  `;
  }

  // X labels (keep it readable)
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

  // Hybrid path:
  // - slope into each keypoint to yBefore (progress ramps)
  // - if AON triggers at that keypoint, jump vertically to yAfter
  let d = `M ${sx(pts[0].k)} ${sy(pts[0].yAfter)} `;

  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    const xCur = sx(cur.k);

    // slope into the threshold (AON still "not yet" at this exact instant)
    d += `L ${xCur} ${sy(cur.yBefore)} `;

    // vertical jump if AON adds payout at exactly this threshold
    if (Math.abs(cur.yAfter - cur.yBefore) > 1e-9) {
      d += `L ${xCur} ${sy(cur.yAfter)} `;
    }
  }

  payoutGraph.innerHTML += `
    <path d="${d}" fill="none" stroke="#333" stroke-width="2"/>
  `;

  // === Slider marker (vertical line + dot) ===
  if (viewsSlider) {
    const v = Number(viewsSlider.value || 0);

    // For marker X: interpolate INSIDE ordinal segments (segments are equal-width,
    // but within a segment we slide smoothly by true numeric fraction).
    const numericKeys = keys.filter((k) => k !== X_INF); // includes 0
    let xMarker = sx(numericKeys[numericKeys.length - 1]); // default clamp right

    if (v <= numericKeys[0]) {
      xMarker = sx(numericKeys[0]);
    } else {
      for (let i = 0; i < numericKeys.length - 1; i++) {
        const a = numericKeys[i];
        const b = numericKeys[i + 1];
        if (v <= b) {
          const xa = sx(a);
          const xb = sx(b);
          const t = (v - a) / (b - a); // 0..1
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
  // simple display; tweak later if you want cents always
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

  // clamp current value
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

// Validation
function validateCounterparty() {
  const value = counterpartyInput.value.trim();
  const role = getRole(address);
  const otherParty = role === "sponsor" ? "Creator" : "Sponsor";

  if (!value) {
    counterpartyStatus.innerText = "";
    return false;
  }

  if (!ethers.isAddress(value)) {
    counterpartyStatus.innerText = "Invalid Ethereum address";
    return false;
  }

  if (value.toLowerCase() === address.toLowerCase()) {
    counterpartyStatus.innerText = `${otherParty} cannot be your own address`;
    return false;
  }

  counterpartyStatus.innerText = `✓ Valid ${otherParty} address`;
  return true;
}

function validateDuration() {
  const d = Number(durationDays.value);
  const h = Number(durationHours.value);
  const m = Number(durationMinutes.value);

  if (![d, h, m].every(Number.isInteger)) {
    durationStatus.innerText = "Duration values must be integers";
    return false;
  }

  if (d < 0 || h < 0 || m < 0) {
    durationStatus.innerText = "Duration values cannot be negative";
    return false;
  }

  if (h > 23) {
    durationStatus.innerText = "Hours must be between 0 and 23";
    return false;
  }

  if (m > 59) {
    durationStatus.innerText = "Minutes must be between 0 and 59";
    return false;
  }

  if (d === 0 && h === 0 && m === 0) {
    durationStatus.innerText = "Duration must be greater than 0";
    return false;
  }

  durationStatus.innerText = "✓ Valid duration";
  return true;
}

function validateMilestonesAndExplain() {
  // 1) Empty fields
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

  // 2) Proper numeric fields
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

  // 3) Must strictly increase (views and total payout)
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
  // 1) Empty fields
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

  // 2) Proper numeric fields
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

  // 3) Views must strictly increase (payout does NOT need to)
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

// Chain reads
async function loadMneeBalance() {
  const token = new ethers.Contract(MNEE_ADDRESS, ERC20_ABI, provider);
  const [raw, decimals] = await Promise.all([
    token.balanceOf(address),
    token.decimals(),
  ]);
  mneeBalanceSpan.innerText = ethers.formatUnits(raw, decimals);
}

// Handlers
toggleRoleButton.onclick = () => {
  const cur = getRole(address);
  const next = cur === "sponsor" ? "creator" : "sponsor";
  setRole(address, next);
  renderRole();

  // reset fields
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

  // update only the rate text (no full re-render)
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

  progressMilestones.pop(); // delete latest
  ppStatus.innerText = "";
  renderProgressMilestones();
  updateDeleteMilestoneVisibility();
  renderPayoutGraph();
};

saveMilestonesButton.onclick = () => {
  // optional: ensure milestones are valid before locking
  const result = validateMilestonesAndExplain();
  if (!result.ok) {
    ppStatus.innerText = result.msg;
    return;
  }

  milestonesLocked = true;
  ppStatus.innerText = "✓ Saved. Progress Pay is locked.";
  renderProgressMilestones();
  updateMilestoneControlsVisibility();
  renderPayoutGraph();
};

editMilestonesButton.onclick = () => {
  milestonesLocked = false;
  ppStatus.innerText = ""; // or "Editing enabled."
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

// Init
renderRole();
validateCounterparty();
validateDuration();
renderProgressMilestones();
updateMilestoneControlsVisibility();
renderProgressPayEnabled();
renderAonRewards();
updateAonRewardControlsVisibility();
renderAonPayEnabled();
renderPayoutGraph();
syncSliderBounds();
updateSliderReadout();
await loadMneeBalance();
