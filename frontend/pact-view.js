// Config
//const API_BASE = "https://backend-muddy-hill-3958.fly.dev";
const API_BASE = "http://localhost:3000";

import { ethers } from "./ethers-6.7.esm.min.js";
import { RPC_URL, MNEE_ADDRESS, PACT_ESCROW_ADDRESS, getMNEEAddress } from "./constants.js";
import { PactEscrowABI } from "./pactEscrowAbi.js";
import {
  showSecondaryLoadingScreen,
  hideSecondaryLoadingScreen,
} from "./loading-screen.js";

// 🔁 Reload page if MetaMask network or account changes
if (window.ethereum) {
  window.ethereum.on("chainChanged", (cid) => {
    console.log("[MetaMask] chainChanged:", cid, "(NOT reloading page)");
  });

  window.ethereum.on("accountsChanged", (accts) => {
    console.log("[MetaMask] accountsChanged:", accts, "(NOT reloading page)");
  });
}

// DOM
const backButton = document.getElementById("backButton");
const titleEl = document.getElementById("title");
const contentEl = document.getElementById("content");

// Guard: required DOM
if (!backButton || !titleEl || !contentEl) {
  alert(
    "pact-view.html is missing required elements (backButton/title/content)."
  );
  throw new Error("Missing required DOM elements");
}

// Nav
backButton.onclick = () => {
  localStorage.setItem("pactsNeedsRefresh", "1");
  window.location.assign("./pacts-dashboard.html");
};

// Params + session
const params = new URLSearchParams(window.location.search);
const id = params.get("id");
const mode = params.get("mode"); // "sent" | "awaiting"
const address = localStorage.getItem("address");

if (!address) {
  alert("Not logged in");
  history.back();
  throw new Error("Not logged in");
}
if (!id) {
  alert("Missing pact id");
  history.back();
  throw new Error("Missing pact id");
}

const pactId = String(id); // ✅ use this everywhere for cache + chain + api

// Helpers

function renderActiveFromCache(p) {
  document.getElementById("ap-views").innerText = String(p.cached_views ?? "-");

  const earned = Number(p.cached_unlocked ?? 0);
  document.getElementById("ap-earned").innerText = Number.isFinite(earned)
    ? earned.toFixed(2)
    : "0.00";

  const unearned = Number(p.cached_unearned ?? 0);
  document.getElementById("ap-unearned").innerText = Number.isFinite(unearned)
    ? unearned.toFixed(2)
    : "0.00";

  // If you don't want on-chain reads on refresh, just show backend "available"
  const available = Number(p.cached_available ?? earned);
  document.getElementById("ap-available").innerText = Number.isFinite(available)
    ? available.toFixed(2)
    : "0.00";
}

function isExpired(p) {
  const endMs = parseIsoSafe(p.active_ends_at);
  return endMs != null && Date.now() > endMs;
}

function disableEarningsActions({ refreshBtn, claimBtn, errEl, reason }) {
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = "0.6";
    refreshBtn.style.cursor = "not-allowed";
    refreshBtn.title = reason || "Expired";
  }
  if (claimBtn) {
    claimBtn.disabled = true;
    claimBtn.style.opacity = "0.6";
    claimBtn.style.cursor = "not-allowed";
    claimBtn.title = reason || "Expired";
  }
  if (errEl) {
    errEl.style.display = "block";
    errEl.innerText = reason || "Expired";
  }
}

function fmt(n, d = 4) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x.toFixed(d);
}

function normAddr(a) {
  return String(a || "").toLowerCase();
}

// Signature verification for pact actions
async function verifySignatureForAction(action, pactId) {
  if (!window.ethereum) {
    alert("MetaMask not found. Please install MetaMask.");
    return false;
  }

  // Helper: timeout wrapper
  const withTimeout = (p, ms, label) =>
    Promise.race([
      p,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`${label} timed out`)), ms)
      ),
    ]);

  // 1) Get accounts
  let accounts;
  try {
    accounts = await withTimeout(
      window.ethereum.request({ method: "eth_accounts" }),
      8000,
      "eth_accounts"
    );
  } catch (e) {
    alert(`Wallet check failed: ${e?.message || e}`);
    return false;
  }

  // 2) If not connected, request connect
  if (!accounts || accounts.length === 0) {
    try {
      accounts = await withTimeout(
        window.ethereum.request({ method: "eth_requestAccounts" }),
        30000,
        "MetaMask connect"
      );
    } catch (e) {
      alert(
        `Wallet connect failed (popup may be blocked, MetaMask may be locked, or request pending):\n\n${
          e?.message || e
        }`
      );
      return false;
    }
  }

  const selected = (accounts?.[0] || "").toLowerCase();
  if (!selected) {
    alert("No wallet selected.");
    return false;
  }

  if (selected !== address.toLowerCase()) {
    alert(
      `MetaMask account does not match your login address.\n\nLogin: ${address}\nMetaMask: ${accounts[0]}`
    );
    return false;
  }

  // 3) Build message with action context
  const nonce = ethers.hexlify(ethers.randomBytes(16));
  const issuedAt = new Date().toISOString();

  const message =
    `Pactory verification\n` +
    `Address: ${address}\n` +
    `Action: ${action}\n` +
    `Pact ID: ${pactId}\n` +
    `Nonce: ${nonce}\n` +
    `IssuedAt: ${issuedAt}`;

  // 4) Sign (popup)
  let signature;
  try {
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const signer = await browserProvider.getSigner();
    signature = await withTimeout(
      signer.signMessage(message),
      60000,
      "MetaMask signature"
    );
  } catch (e) {
    alert(
      `Signature failed (MetaMask may be locked, popup blocked, or request pending):\n\n${
        e?.message || e
      }`
    );
    return false;
  }

  // 5) Verify signature
  const recovered = ethers.verifyMessage(message, signature).toLowerCase();
  if (recovered !== address.toLowerCase()) {
    alert("Signature verification failed (recovered address mismatch).");
    return false;
  }

  // 6) Store signature and message
  const storageKey = `pactActionSig:${address.toLowerCase()}:${action}:${pactId}`;
  localStorage.setItem(storageKey, signature);
  localStorage.setItem(`${storageKey}:msg`, message);

  return { signature, message };
}

function isValidVideoPlatform(url) {
  const u = String(url || "").toLowerCase();
  
  // Check for TikTok
  if (u.includes("tiktok.com")) return { valid: true, platform: "TikTok" };
  
  // Check for Instagram (including Reels)
  if (u.includes("instagram.com") || u.includes("instagr.am")) {
    return { valid: true, platform: "Instagram" };
  }
  
  // Check for YouTube Shorts
  if (u.includes("youtube.com/shorts/") || (u.includes("youtube.com") && u.includes("shorts"))) {
    return { valid: true, platform: "YouTube Shorts" };
  }
  
  // Also accept regular YouTube URLs (youtu.be or youtube.com/watch)
  if (u.includes("youtu.be/") || (u.includes("youtube.com") && u.includes("watch"))) {
    return { valid: true, platform: "YouTube" };
  }
  
  return { 
    valid: false, 
    error: "Unsupported platform. Please use TikTok, Instagram, or YouTube Shorts links." 
  };
}

function prettyAddr(a) {
  if (!a) return a;
  // Check if address has a saved name
  if (window.getAddressName) {
    const name = window.getAddressName(a);
    if (name) {
      return `${name} (${a})`;
    }
  }
  return a;
}

// Payout graph helper functions for pact-view
const X_INF_PACT_VIEW = "__INF__";

function collectKeyViewsWithInfinityForPact(pact) {
  const set = new Set();
  set.add(0);

  if (pact.progress_enabled && Array.isArray(pact.progress_milestones)) {
    for (const m of pact.progress_milestones) {
      const v = Number(m?.views || 0);
      if (Number.isInteger(v) && v > 0) set.add(v);
    }
  }

  if (pact.aon_enabled && Array.isArray(pact.aon_rewards)) {
    for (const r of pact.aon_rewards) {
      const v = Number(r?.views || 0);
      if (Number.isInteger(v) && v > 0) set.add(v);
    }
  }

  const numeric = Array.from(set).sort((a, b) => a - b);
  return [...numeric, X_INF_PACT_VIEW];
}

function progressPayoutAtViewsForPact(pact, x) {
  if (!pact.progress_enabled || !Array.isArray(pact.progress_milestones)) return 0;

  const ms = pact.progress_milestones
    .map((m) => ({ v: Number(m?.views || 0), p: Number(m?.payout || 0) }))
    .filter((m) => Number.isInteger(m.v) && m.v > 0 && Number.isFinite(m.p) && m.p > 0)
    .sort((a, b) => a.v - b.v);

  if (ms.length === 0) return 0;
  if (x < ms[0].v) return 0;

  for (let i = 0; i < ms.length - 1; i++) {
    const a = ms[i];
    const b = ms[i + 1];
    if (x < b.v) {
      const t = (x - a.v) / (b.v - a.v);
      return a.p + t * (b.p - a.p);
    }
  }
  return ms[ms.length - 1].p;
}

function aonBonusAtViewsForPact(pact, x) {
  if (!pact.aon_enabled || !Array.isArray(pact.aon_rewards)) return 0;

  const rewards = pact.aon_rewards
    .map((r) => ({ v: Number(r?.views || 0), p: Number(r?.payout || 0) }))
    .filter((r) => Number.isInteger(r.v) && r.v > 0 && Number.isFinite(r.p) && r.p > 0);

  let sum = 0;
  for (const r of rewards) {
    if (x >= r.v) sum += r.p;
  }
  return sum;
}

function aonBonusBeforeViewsForPact(pact, k) {
  if (!pact.aon_enabled || !Array.isArray(pact.aon_rewards)) return 0;
  if (!Number.isFinite(k)) return 0;

  const rewards = pact.aon_rewards
    .map((r) => ({ v: Number(r?.views || 0), p: Number(r?.payout || 0) }))
    .filter((r) => Number.isInteger(r.v) && r.v > 0 && Number.isFinite(r.p) && r.p > 0);

  let sum = 0;
  for (const r of rewards) {
    if (r.v < k) sum += r.p;
  }
  return sum;
}

function makeOrdinalScaleXForPact(keys, padL, innerW) {
  const n = keys.length;
  const pos = new Map();
  const step = n <= 1 ? 0 : innerW / (n - 1);
  keys.forEach((k, i) => pos.set(k, padL + i * step));
  return (k) => pos.get(k);
}

function formatXKeyForPact(k) {
  return k === X_INF_PACT_VIEW ? "∞" : String(k);
}

function niceStepForPact(rawStep) {
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const f = rawStep / base;

  if (f <= 1) return 1 * base;
  if (f <= 2) return 2 * base;
  if (f <= 5) return 5 * base;
  return 10 * base;
}

function makeNiceTicksForPact(maxVal, target = 6) {
  if (maxVal <= 0) return [0];
  const step = niceStepForPact(maxVal / target);
  const top = Math.ceil(maxVal / step) * step;

  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function formatMoneyTickForPact(v) {
  if (v >= 1000) {
    return `$${v.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `$${v.toFixed(2)}`;
}

function renderPactPayoutGraph(pact) {
  const graphEl = document.getElementById("pactViewPayoutGraph");
  if (!graphEl) return;

  const w = 680;
  const h = 240;
  const padL = 90;
  const padR = 20;
  const padT = 30;
  const padB = 50;

  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  graphEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
  graphEl.innerHTML = "";

  graphEl.innerHTML += `<rect x="0" y="0" width="${w}" height="${h}" fill="#FAFBFF" rx="8"/>`;

  graphEl.innerHTML += `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="#1976D2" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#1976D2" stroke-width="2.5" stroke-linecap="round"/>
  `;

  graphEl.innerHTML += `
    <text x="${padL + innerW / 2}" y="${h - 12}" font-size="13" fill="#1565C0" font-weight="600" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">Views</text>
    <text x="20" y="${padT + innerH / 2}" font-size="13" fill="#1565C0" font-weight="600" transform="rotate(-90, 20, ${padT + innerH / 2})" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">Payout ($)</text>
  `;

  const keys = collectKeyViewsWithInfinityForPact(pact);
  const hasAnyThreshold = keys.some((k) => k !== 0 && k !== X_INF_PACT_VIEW);

  if (!hasAnyThreshold) {
    const axisY = padT + innerH;
    const x0 = padL;
    const xInf = padL + innerW;

    graphEl.innerHTML += `
      <line x1="${x0}" y1="${axisY}" x2="${x0}" y2="${axisY + 6}" stroke="#1976D2" stroke-width="2" stroke-linecap="round"/>
      <text x="${x0}" y="${axisY + 22}" font-size="11" fill="#1565C0" font-weight="600" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">0</text>
      <line x1="${xInf}" y1="${axisY}" x2="${xInf}" y2="${axisY + 6}" stroke="#1976D2" stroke-width="2" stroke-linecap="round"/>
      <text x="${xInf}" y="${axisY + 22}" font-size="11" fill="#1565C0" font-weight="600" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">∞</text>
    `;
    return;
  }

  const sx = makeOrdinalScaleXForPact(keys, padL, innerW);

  const pts = keys.map((k) => {
    if (k === X_INF_PACT_VIEW) {
      const y = progressPayoutAtViewsForPact(pact, Number.MAX_SAFE_INTEGER) + aonBonusAtViewsForPact(pact, Number.MAX_SAFE_INTEGER);
      return { k, yBefore: y, yAfter: y };
    }

    const progress = progressPayoutAtViewsForPact(pact, k);
    const yBefore = progress + aonBonusBeforeViewsForPact(pact, k);
    const yAfter = progress + aonBonusAtViewsForPact(pact, k);
    return { k, yBefore, yAfter };
  });

  const maxY = Math.max(1, ...pts.map((p) => Math.max(p.yBefore, p.yAfter)));

  let yTicks = makeNiceTicksForPact(maxY, 6);
  const currentMax = Math.max(...yTicks);
  if (currentMax < maxY) {
    yTicks = yTicks.filter(t => t <= maxY);
    if (!yTicks.includes(maxY)) {
      yTicks.push(maxY);
    }
    yTicks.sort((a, b) => a - b);
  } else if (currentMax > maxY) {
    yTicks = yTicks.filter(t => t < currentMax);
    yTicks.push(maxY);
    yTicks.sort((a, b) => a - b);
  } else {
    yTicks.sort((a, b) => a - b);
  }

  const scaleMaxY = Math.max(...yTicks);
  const sy = (y) => padT + innerH - (y / scaleMaxY) * innerH;

  for (const yVal of yTicks) {
    const y = sy(yVal);

    graphEl.innerHTML += `
      <line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" stroke="#E3F2FD" stroke-width="1" stroke-dasharray="2 2" opacity="0.6"/>
      <line x1="${padL - 5}" y1="${y}" x2="${padL}" y2="${y}" stroke="#1976D2" stroke-width="2" stroke-linecap="round"/>
      <text x="${padL - 15}" y="${y + 4}" font-size="11" fill="#1565C0" font-weight="600" text-anchor="end" font-family="system-ui, -apple-system, sans-serif">${formatMoneyTickForPact(yVal)}</text>
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

    graphEl.innerHTML += `
      <line x1="${x}" y1="${padT}" x2="${x}" y2="${axisY}" stroke="#E3F2FD" stroke-width="1" stroke-dasharray="2 2" opacity="0.6"/>
      <line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 6}" stroke="#1976D2" stroke-width="2" stroke-linecap="round"/>
      <text x="${x}" y="${axisY + 22}" font-size="11" fill="#1565C0" font-weight="600" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${formatXKeyForPact(k)}</text>
    `;
  });

  let defs = graphEl.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    graphEl.appendChild(defs);
  }

  const gradientId = "pact-view-payout-gradient";
  if (!graphEl.querySelector(`#${gradientId}`)) {
    const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    gradient.id = gradientId;
    gradient.setAttribute("x1", "0%");
    gradient.setAttribute("y1", "0%");
    gradient.setAttribute("x2", "0%");
    gradient.setAttribute("y2", "100%");

    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "#2196F3");
    stop1.setAttribute("stop-opacity", "1");

    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", "#42A5F5");
    stop2.setAttribute("stop-opacity", "1");

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
  }

  const areaGradientId = "pact-view-area-gradient";
  if (!graphEl.querySelector(`#${areaGradientId}`)) {
    const areaGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    areaGradient.id = areaGradientId;
    areaGradient.setAttribute("x1", "0%");
    areaGradient.setAttribute("y1", "0%");
    areaGradient.setAttribute("x2", "0%");
    areaGradient.setAttribute("y2", "100%");

    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "#2196F3");
    stop1.setAttribute("stop-opacity", "0.2");

    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", "#42A5F5");
    stop2.setAttribute("stop-opacity", "0.05");

    areaGradient.appendChild(stop1);
    areaGradient.appendChild(stop2);
    defs.appendChild(areaGradient);
  }

  const shadowFilterId = "pact-view-line-shadow";
  if (!graphEl.querySelector(`#${shadowFilterId}`)) {
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.id = shadowFilterId;
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");

    const feGaussianBlur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    feGaussianBlur.setAttribute("in", "SourceAlpha");
    feGaussianBlur.setAttribute("stdDeviation", "3");
    feGaussianBlur.setAttribute("result", "blur");
    filter.appendChild(feGaussianBlur);

    const feOffset = document.createElementNS("http://www.w3.org/2000/svg", "feOffset");
    feOffset.setAttribute("dx", "2");
    feOffset.setAttribute("dy", "2");
    feOffset.setAttribute("result", "offsetblur");
    filter.appendChild(feOffset);

    const transfer = document.createElementNS("http://www.w3.org/2000/svg", "feComponentTransfer");
    const funcA = document.createElementNS("http://www.w3.org/2000/svg", "feFuncA");
    funcA.setAttribute("type", "linear");
    funcA.setAttribute("slope", "0.3");
    transfer.appendChild(funcA);
    filter.appendChild(transfer);

    const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
    const mergeNode1 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    mergeNode1.setAttribute("in", "offsetblur");
    merge.appendChild(mergeNode1);
    const mergeNode2 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    mergeNode2.setAttribute("in", "SourceGraphic");
    merge.appendChild(mergeNode2);
    filter.appendChild(merge);

    defs.appendChild(filter);
  }

  let areaPath = `M ${sx(pts[0].k)} ${padT + innerH} L ${sx(pts[0].k)} ${sy(pts[0].yAfter)} `;
  let linePath = `M ${sx(pts[0].k)} ${sy(pts[0].yAfter)} `;

  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    const xCur = sx(cur.k);

    linePath += `L ${xCur} ${sy(cur.yBefore)} `;
    areaPath += `L ${xCur} ${sy(cur.yBefore)} `;

    if (Math.abs(cur.yAfter - cur.yBefore) > 1e-9) {
      linePath += `L ${xCur} ${sy(cur.yAfter)} `;
      areaPath += `L ${xCur} ${sy(cur.yAfter)} `;
    }
  }

  const lastX = sx(pts[pts.length - 1].k);
  areaPath += `L ${lastX} ${padT + innerH} Z`;

  graphEl.innerHTML += `<path d="${areaPath}" fill="url(#${areaGradientId})" opacity="0.6"/>`;
  graphEl.innerHTML += `<path d="${linePath}" fill="none" stroke="url(#${gradientId})" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#${shadowFilterId})"/>`;
}

function prettyStatus(s) {
  if (!s) return "";
  return String(s)
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatEastern(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(d);
}

function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return "";
  let s = Math.max(0, Number(seconds));

  const days = Math.floor(s / 86400);
  s %= 86400;
  const hours = Math.floor(s / 3600);
  s %= 3600;
  const minutes = Math.floor(s / 60);
  const secs = Math.floor(s % 60);

  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (secs || parts.length === 0)
    parts.push(`${secs} second${secs === 1 ? "" : "s"}`);

  return parts.join(", ");
}

function maxPayoutMnee(pact) {
  const prog = Array.isArray(pact?.progress_milestones)
    ? pact.progress_milestones
    : [];
  const aon = Array.isArray(pact?.aon_rewards) ? pact.aon_rewards : [];

  // progress: take MAX single payout
  let progressMax = 0;
  for (const x of prog) {
    const v = Number(x?.payout);
    if (Number.isFinite(v) && v > progressMax) progressMax = v;
  }

  // aon: SUM all payouts (because they can all trigger)
  let aonSum = 0;
  for (const x of aon) {
    const v = Number(x?.payout);
    if (Number.isFinite(v) && v > 0) aonSum += v;
  }

  return progressMax + aonSum;
}

async function getMneeBalanceAndDecimals(userAddress) {
  if (!window.ethereum) throw new Error("MetaMask not found");

  const provider = new ethers.BrowserProvider(window.ethereum);

  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];

  // Use current environment's MNEE address
  const mneeAddress = getMNEEAddress();
  const token = new ethers.Contract(mneeAddress, ERC20_ABI, provider);
  const [raw, decimals] = await Promise.all([
    token.balanceOf(userAddress),
    token.decimals(),
  ]);

  return { raw, decimals };
}

function renderPayments(label, enabled, items, isProgress) {
  if (!enabled)
    return `<div style="margin-top: 16px;"><strong>${label}:</strong> <span style="color: #666; font-weight: normal;">Disabled</span></div>`;
  if (!items || items.length === 0)
    return `<div style="margin-top: 16px;"><strong>${label}:</strong> <span style="color: #666; font-weight: normal;">None</span></div>`;

  const rows = items
    .map((x, i) => {
      const views = Number(x.views || 0).toLocaleString();
      const payout = Number(x.payout || 0).toFixed(2);
      return `<li style="margin: 8px 0; padding-left: 4px;">${
        isProgress ? "Milestone" : "Reward"
      } ${
        i + 1
      }: <strong>${views}</strong> views → <strong>$${payout}</strong></li>`;
    })
    .join("");

  return `<div style="margin-top: 16px; margin-bottom: 8px;"><strong>${label}:</strong><ul style="margin: 8px 0 0 0; padding-left: 24px; list-style-position: inside; list-style-type: disc;">${rows}</ul></div>`;
}

// Data load
let res, data;
try {
  res = await fetch(`${API_BASE}/api/pacts/${encodeURIComponent(id)}`);
  data = await res.json();
} catch (e) {
  alert("Backend not reachable.");
  throw e;
}

if (!res.ok || !data.ok) {
  alert(data?.error || "Failed to load pact");
  throw new Error(data?.error || "Failed to load pact");
}

let p = data.pact; // change from const to let

async function fetchLatestPact(pactId) {
  const r = await fetch(`${API_BASE}/api/pacts/${encodeURIComponent(pactId)}`, {
    cache: "no-store",
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d?.error || "Failed to load pact");
  return d.pact;
}

const replacedHtml = data.replaced_pact
  ? (() => {
      const rp = data.replaced_pact;
      return `
        <details open style="margin:10px 0;" id="replacedPactDetails">
          <summary><strong>Replaced Pact (previous version)</strong></summary>
          <div style="margin-top:8px; border:1px solid #ddd; border-radius:10px; padding:12px;">
            <div><strong>Name:</strong> ${rp.name || "Untitled Pact"}</div>
            <div><strong>Status:</strong> ${prettyStatus(rp.status)}</div>
            <div><strong>Sponsor:</strong> ${rp.sponsor_address}${normAddr(rp.sponsor_address) === normAddr(address) ? ' <span style="color: #1976D2; font-weight: 600;">(You)</span>' : ''}</div>
            <div><strong>Creator:</strong> ${rp.creator_address}${normAddr(rp.creator_address) === normAddr(address) ? ' <span style="color: #1976D2; font-weight: 600;">(You)</span>' : ''}</div>
            <div><strong>Duration:</strong> ${formatDuration(
              rp.duration_seconds
            )}</div>

            ${renderPayments(
              "Progress Pay",
              !!rp.progress_enabled,
              rp.progress_milestones,
              true
            )}
            ${renderPayments(
              "All-or-Nothing Pay",
              !!rp.aon_enabled,
              rp.aon_rewards,
              false
            )}
          </div>
        </details>
      `;
    })()
  : "";

// --------------------
// ACTIVE PANEL HELPERS
// --------------------
function isActivePact(p) {
  return String(p?.status) === "active";
}

function parseIsoSafe(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : null;
}

function formatCountdown(ms) {
  if (ms == null) return "-";
  if (ms <= 0) return "0s";

  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  const sec = s % 60;

  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

async function fetchActiveStats(pactId) {
  const url = `${API_BASE}/api/pacts/${encodeURIComponent(pactId)}/sync-views`;

  const r = await fetch(url, { method: "POST" });

  const raw = await r.text();

  console.log("[SYNC VIEWS] status:", r.status);
  console.log("[SYNC VIEWS] raw:", raw);

  let d = {};
  try {
    d = JSON.parse(raw);
  } catch {}

  if (!r.ok || !d.ok) throw new Error(d?.error || "sync-views failed");

  return d;
}

async function readOnchainPaidOut(pactId) {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  const escrow = new ethers.Contract(
    PACT_ESCROW_ADDRESS,
    PactEscrowABI,
    browserProvider
  );

  const pact = await escrow.pacts(pactId);
  // your contract has: paidOut (uint256)
  return {
    paidOutRaw: pact.paidOut, // BigInt-like
    maxPayoutRaw: pact.maxPayout, // BigInt-like
    sponsor: pact.sponsor,
    creator: pact.creator,
  };
}

async function getTokenDecimals() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  const ERC20_READ_ABI = ["function decimals() view returns (uint8)"];
  // Use current environment's MNEE address
  const mneeAddress = getMNEEAddress();
  const token = new ethers.Contract(
    mneeAddress,
    ERC20_READ_ABI,
    browserProvider
  );
  return Number(await token.decimals());
}

function renderActivePanelSkeleton() {
  // inserted ABOVE the old content block
  const wrap = document.createElement("div");
  wrap.id = "activePanel";
  wrap.style.border = "1px solid #ddd";
  wrap.style.borderRadius = "10px";
  wrap.style.padding = "12px";
  wrap.style.marginBottom = "12px";

  wrap.innerHTML = `
    <div><strong>Start:</strong> <span id="ap-start">-</span></div>
    <div><strong>End:</strong> <span id="ap-end">-</span></div>
    <div><strong>Time remaining:</strong> <span id="ap-remaining">-</span></div>

    <div style="margin-top:10px;"><strong>Video link:</strong> <span id="ap-link">-</span></div>
    <div><strong>Views:</strong> <span id="ap-views">-</span></div>

    <div style="margin-top:10px;"><strong>Earned (unlocked):</strong> <span id="ap-earned">-</span></div>
        <div><strong>Unearned:</strong> <span id="ap-unearned">-</span></div>
    <div><strong>Available to Claim:</strong> <span id="ap-available">-</span></div>

  `;

  return wrap;
}

function renderActiveStatic(p) {
  // Start / End
  document.getElementById("ap-start").innerText = p.active_started_at
    ? formatEastern(p.active_started_at)
    : "-";

  document.getElementById("ap-end").innerText = p.active_ends_at
    ? formatEastern(p.active_ends_at)
    : "-";

  // Video link
  const link = String(p.video_link || "").trim();
  document.getElementById("ap-link").innerHTML = link
    ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a>`
    : `<span style="opacity:0.7;">(not set)</span>`;
}

function renderActiveCountdownTick(p) {
  const endMs = parseIsoSafe(p.active_ends_at);
  const remainingMs = endMs != null ? Math.max(0, endMs - Date.now()) : null;
  const remEl = document.getElementById("ap-remaining");
  if (remEl) remEl.innerText = formatCountdown(remainingMs);
}

async function renderActiveStatsWithOnchainAvailable(p) {
  // Views
  document.getElementById("ap-views").innerText = String(p.cached_views ?? "-");

  // Earned / Unearned (from DB cache)
  const earnedUsd = Number(p.cached_unlocked ?? 0);
  const unearnedUsd = Number(p.cached_unearned ?? 0);

  document.getElementById("ap-earned").innerText = Number.isFinite(earnedUsd)
    ? earnedUsd.toFixed(2)
    : "0.00";

  document.getElementById("ap-unearned").innerText = Number.isFinite(
    unearnedUsd
  )
    ? unearnedUsd.toFixed(2)
    : "0.00";

  // Available to claim (on-chain accurate): earned - paidOut
  let availableUsd = earnedUsd;

  try {
    const on = await readOnchainPaidOut(pactId);
    const decimals = await getTokenDecimals();
    const paidOut = Number(ethers.formatUnits(on.paidOutRaw, decimals));
    availableUsd = Math.max(0, earnedUsd - paidOut);
  } catch (e) {
    console.warn("[AvailableToClaim] on-chain read failed:", e);
    // Fallback: show earned (or keep previous). I’ll keep earned so it never blanks.
    availableUsd = earnedUsd;
  }

  document.getElementById("ap-available").innerText = Number.isFinite(
    availableUsd
  )
    ? availableUsd.toFixed(2)
    : "0.00";
}

async function refreshActivePanel(p) {
  console.log("[REFRESH CLICKED] pactId =", pactId);

  const stats = await fetchActiveStats(pactId);

  // Earned
  const earnedUsd = Number(stats.unlockedPayout);
  document.getElementById("ap-earned").innerText = Number.isFinite(earnedUsd)
    ? earnedUsd.toFixed(2)
    : "0.00";

  // Views
  document.getElementById("ap-views").innerText = String(stats.views ?? "-");

  // Unearned = Max - Earned
  const max = Number(maxPayoutMnee(p));
  const unearned =
    Number.isFinite(max) && Number.isFinite(earnedUsd)
      ? Math.max(0, max - earnedUsd)
      : 0;

  document.getElementById("ap-unearned").innerText = unearned.toFixed(2);

  // Available = Earned - Claimed (paidOut)
  let available = earnedUsd;

  try {
    const on = await readOnchainPaidOut(pactId);
    const decimals = await getTokenDecimals();
    const paidOutTokens = Number(ethers.formatUnits(on.paidOutRaw, decimals));
    available = Math.max(0, earnedUsd - paidOutTokens);
    available = Math.min(available, max);
  } catch (e) {
    console.warn("[AvailableToClaim] on-chain read failed:", e);
  }

  document.getElementById("ap-available").innerText = available.toFixed(2);
}

// ---- Replaced pact dropdown ----
const replacedDetails = document.getElementById("replacedPactDetails");
const replacedBody = document.getElementById("replacedPactBody");

if (data.replaced_pact) {
  replacedDetails.style.display = "block";

  const rp = data.replaced_pact;

  replacedBody.innerHTML = `
    <div style="border:1px solid #ddd; border-radius:10px; padding:12px;">
      <div><strong>Name:</strong> ${rp.name || "Untitled Pact"}</div>
      <div><strong>Status:</strong> ${rp.status}</div>
      <div><strong>Sponsor:</strong> ${rp.sponsor_address}${normAddr(rp.sponsor_address) === normAddr(address) ? ' <span style="color: #1976D2; font-weight: 600;">(You)</span>' : ''}</div>
      <div><strong>Creator:</strong> ${rp.creator_address}${normAddr(rp.creator_address) === normAddr(address) ? ' <span style="color: #1976D2; font-weight: 600;">(You)</span>' : ''}</div>
      <div><strong>Duration:</strong> ${formatDuration(
        rp.duration_seconds
      )}</div>

      ${renderPayments(
        "Progress Pay",
        !!rp.progress_enabled,
        rp.progress_milestones,
        true
      )}

      ${renderPayments(
        "All-or-Nothing Pay",
        !!rp.aon_enabled,
        rp.aon_rewards,
        false
      )}
    </div>
  `;
} else {
  replacedDetails.style.display = "none";
}

// ✅ Title shows the DB name (shared across both parties/devices)
titleEl.innerText = String(p.name || "").trim() ? p.name : `Pact #${p.id}`;

// Render main content
const maxPayout = maxPayoutMnee(p);

const oldPanelHtml = `
  <div style="border:1px solid rgba(33, 150, 243, 0.15); border-radius:12px; padding:20px; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);">
    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(33, 150, 243, 0.1);"><strong>Status:</strong> ${prettyStatus(
      p.status
    )}</div>
    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(33, 150, 243, 0.1);"><strong>Created:</strong> ${formatEastern(
      p.created_at
    )}</div>
    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(33, 150, 243, 0.1);"><strong>Sponsor:</strong> ${prettyAddr(
      p.sponsor_address
    )}${normAddr(p.sponsor_address) === normAddr(address) ? ' <span style="color: #1976D2; font-weight: 600;">(You)</span>' : ''}</div>
    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(33, 150, 243, 0.1);"><strong>Creator:</strong> ${prettyAddr(
      p.creator_address
    )}${normAddr(p.creator_address) === normAddr(address) ? ' <span style="color: #1976D2; font-weight: 600;">(You)</span>' : ''}</div>

    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(33, 150, 243, 0.1);"><strong>Max payout:</strong> $${
      Number.isFinite(maxPayout) ? maxPayout.toFixed(2) : "-"
    }</div>

    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(33, 150, 243, 0.1);"><strong>Video Link:</strong> ${
      String(p.video_link || "").trim()
        ? `<a href="${p.video_link}" target="_blank" rel="noopener noreferrer" style="color: #1976D2; text-decoration: none;">${p.video_link}</a>`
        : `<span style="color: #999; font-style: italic;">(not set)</span>`
    }</div>

    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(33, 150, 243, 0.1);"><strong>Duration:</strong> ${formatDuration(
      p.duration_seconds
    )}</div>

    ${renderPayments(
      "Progress Pay",
      !!p.progress_enabled,
      p.progress_milestones,
      true
    )}
    ${renderPayments(
      "All-or-Nothing Pay",
      !!p.aon_enabled,
      p.aon_rewards,
      false
    )}
  </div>

  <details class="payout-graph-details" style="margin-top: 20px;">
    <summary style="cursor: pointer; font-weight: 600; font-size: 1.125rem; color: #1E3A5F; padding: 12px; background: #E3F2FD; border-radius: 8px; border: 1px solid rgba(33, 150, 243, 0.2); list-style: none; display: flex; align-items: center; justify-content: space-between;">
      <span>Payout Visualization</span>
      <span class="dropdown-arrow" style="transition: transform 0.2s; display: inline-block; font-size: 0.875rem; color: #1976D2;">▼</span>
    </summary>
    <div style="margin-top: 16px; padding: 16px; background: #FAFBFF; border-radius: 8px; border: 1px solid rgba(33, 150, 243, 0.15);">
      <svg id="pactViewPayoutGraph" width="680" height="240" style="width: 100%; height: auto; max-width: 680px; border: 1px solid rgba(33, 150, 243, 0.2); border-radius: 10px; background: linear-gradient(135deg, #FAFBFF 0%, #F5F9FF 100%);"></svg>
    </div>
  </details>
`;

const oldDetails = document.getElementById("oldPactDetails");
const oldBody = document.getElementById("oldPactBody");

if (isActivePact(p) && oldDetails && oldBody) {
  // Active pact: old info ONLY inside dropdown
  oldDetails.style.display = "block";
  oldBody.innerHTML = replacedHtml + oldPanelHtml;

  // And make sure contentEl starts empty so you don't see a duplicate
  contentEl.innerHTML = "";
  
  // Render payout graph after content is inserted
  setTimeout(() => {
    renderPactPayoutGraph(p);
  }, 100);
} else {
  // Non-active pact: show old info normally (no dropdown)
  if (oldDetails) oldDetails.style.display = "none";
  contentEl.innerHTML = replacedHtml + oldPanelHtml;
  
  // Render payout graph after content is inserted
  setTimeout(() => {
    renderPactPayoutGraph(p);
  }, 100);
}

// --------------------
// ACTIVE PANEL (only when status=active)
// --------------------
// --------------------
// ACTIVE PANEL (only when status=active)
// --------------------
if (isActivePact(p)) {
  const panel = renderActivePanelSkeleton();

  // ✅ external controls (outside the panel)
  const controls = document.createElement("div");
  controls.style.marginBottom = "10px";

  // ✅ Sponsor-only reclaim after duration
  // ✅ Sponsor-only reclaim after duration (DO NOT show on creator page)
  const isSponsor = normAddr(address) === normAddr(p.sponsor_address);
  const canReclaim = isSponsor && isExpired(p);

  if (isSponsor) {
    const reclaimBtn = document.createElement("button");
    reclaimBtn.id = "ap-reclaim";
    reclaimBtn.type = "button";
    reclaimBtn.innerText = "Reclaim Unspent MNEE";
    reclaimBtn.style.display = "block";
    reclaimBtn.style.marginTop = "8px";

    reclaimBtn.disabled = !canReclaim;
    reclaimBtn.style.opacity = canReclaim ? "1" : "0.6";
    reclaimBtn.style.cursor = canReclaim ? "pointer" : "not-allowed";

    reclaimBtn.onclick = async () => {
      try {
        if (!isExpired(p)) {
          alert("Not yet expired — you can reclaim after the duration ends.");
          return;
        }

        if (!window.ethereum) {
          alert("MetaMask not found.");
          return;
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        const signerAddr = await signer.getAddress();
        if (normAddr(signerAddr) !== normAddr(address)) {
          alert(
            `MetaMask account mismatch.\n\nLogged in as: ${address}\nMetaMask is: ${signerAddr}`
          );
          return;
        }

        reclaimBtn.disabled = true;

        const escrow = new ethers.Contract(
          PACT_ESCROW_ADDRESS,
          PactEscrowABI,
          signer
        );

        const tx = await escrow.refundAfterDeadline(id);
        await tx.wait();

        alert("✅ Reclaimed unspent MNEE!");
        await refreshActivePanel(p);
      } catch (e) {
        alert(`Reclaim failed:\n\n${e?.shortMessage || e?.message || e}`);
      }
    };

    controls.appendChild(reclaimBtn);
  }

  const refreshBtn = document.createElement("button");
  refreshBtn.id = "ap-refresh";
  refreshBtn.type = "button";
  refreshBtn.innerText = "Refresh";
  refreshBtn.style.display = "block";
  refreshBtn.style.marginBottom = "2px"; // 🔑 remove default gap

  const errEl = document.createElement("div");
  errEl.id = "ap-error";
  errEl.style.marginTop = "1px";
  errEl.style.color = "#c0392b";
  errEl.style.display = "none";

  const claimBtn = document.createElement("button");
  claimBtn.type = "button";
  claimBtn.innerText = "Claim";
  claimBtn.style.display = "block";
  claimBtn.style.marginTop = "8px";
  claimBtn.style.background = "#1f7a1f";
  claimBtn.style.color = "white";
  claimBtn.style.padding = "8px 14px";
  claimBtn.style.borderRadius = "8px";
  claimBtn.style.border = "none";
  claimBtn.style.cursor = "pointer";

  const isCreator = normAddr(address) === normAddr(p.creator_address);
  if (!isCreator) claimBtn.style.display = "none";

  controls.appendChild(claimBtn);

  controls.appendChild(refreshBtn);
  controls.appendChild(errEl);

  // ✅ put controls ABOVE the panel, and both above old content
  contentEl.prepend(controls);
  contentEl.prepend(panel);
  // set non-API fields once (no Refresh touch)
  renderActiveStatic(p);
  await renderActiveStatsWithOnchainAvailable(p);

  // --------------------
  // AUTO-REFRESH ON DEADLINE (exactly once) + disable afterwards
  // --------------------
  let didAutoDeadlineRefresh = false;

  async function runDeadlineRefreshOnce() {
    if (didAutoDeadlineRefresh) return;
    didAutoDeadlineRefresh = true;

    try {
      // sync -> refetch -> render
      await fetchActiveStats(pactId);
      p = await fetchLatestPact(pactId);

      titleEl.innerText = String(p.name || "").trim()
        ? p.name
        : `Pact #${p.id}`;
      renderActiveStatic(p);
      await renderActiveStatsWithOnchainAvailable(p);
    } catch (e) {
      console.warn("[DEADLINE AUTO-REFRESH FAILED]", e);
    } finally {
      // lock refresh + claim after the deadline
      disableEarningsActions({
        refreshBtn,
        claimBtn,
        errEl,
        reason: "Pact duration ended — refreshing/claiming is disabled.",
      });
    }
  }

  const endMs = parseIsoSafe(p.active_ends_at);
  if (endMs == null) {
    console.warn(
      "Missing/invalid active_ends_at; cannot schedule deadline refresh."
    );
  } else {
    const delay = endMs - Date.now();

    if (delay <= 0) {
      // already expired
      disableEarningsActions({
        refreshBtn,
        claimBtn,
        errEl,
        reason: "Pact duration ended — refreshing/claiming is disabled.",
      });
    } else {
      setTimeout(runDeadlineRefreshOnce, delay);
    }
  }

  renderActiveFromCache(p);

  // nice ticking countdown (no API calls)
  renderActiveCountdownTick(p);
  setInterval(() => renderActiveCountdownTick(p), 1000);

  // wire refresh
  refreshBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // ✅ guard: do not allow refresh after expiry
    if (isExpired(p)) {
      disableEarningsActions({
        refreshBtn,
        claimBtn,
        errEl,
        reason: "Pact duration ended — refreshing is disabled.",
      });
      return;
    }

    refreshBtn.disabled = true;
    errEl.style.display = "none";
    errEl.innerText = "";

    // Show loading screen
    showSecondaryLoadingScreen("Refreshing view counts... This may take a moment.");

    try {
      const stats = await fetchActiveStats(pactId); // ONE call

      // Views / Earned / Unearned from backend
      document.getElementById("ap-views").innerText = String(
        stats.views ?? "-"
      );

      const earnedUsd = Number(stats.unlockedPayout ?? 0);
      document.getElementById("ap-earned").innerText = Number.isFinite(
        earnedUsd
      )
        ? earnedUsd.toFixed(2)
        : "0.00";

      const unearnedUsd = Number(stats.unearnedPayout ?? 0);
      document.getElementById("ap-unearned").innerText = Number.isFinite(
        unearnedUsd
      )
        ? unearnedUsd.toFixed(2)
        : "0.00";

      // Available = backend “available” (NOT subtracting paidOut)
      const availableUsd = Number(stats.availablePayout ?? earnedUsd);
      document.getElementById("ap-available").innerText = Number.isFinite(
        availableUsd
      )
        ? availableUsd.toFixed(2)
        : "0.00";

      // optional: show updated time if you add it to skeleton
      const upEl = document.getElementById("ap-updated");
      if (upEl)
        upEl.innerText = stats.statsUpdatedAt
          ? formatEastern(stats.statsUpdatedAt)
          : "-";

      // keep p in sync for Claim checks (cached_available/cached_unlocked)
      p = await fetchLatestPact(pactId);
      
      // Hide loading screen on success
      hideSecondaryLoadingScreen();
    } catch (err) {
      console.error("[REFRESH ERROR]", err);
      errEl.style.display = "block";
      errEl.innerText = err?.message || String(err);
      // Hide loading screen on error
      hideSecondaryLoadingScreen();
    } finally {
      refreshBtn.disabled = false;
    }
  };

  claimBtn.onclick = async () => {
    try {
      // ✅ guard: do not allow claim after expiry
      if (isExpired(p)) {
        alert("Pact duration ended — claiming is disabled.");
        disableEarningsActions({
          refreshBtn,
          claimBtn,
          errEl,
          reason: "Pact duration ended — refreshing/claiming is disabled.",
        });
        return;
      }
      if (!window.ethereum) {
        alert("MetaMask not found.");
        return;
      }

      // ------------------------------------------------------------------
      // 1) Use backend-cached earned amount (must Refresh first)
      // ------------------------------------------------------------------
      const totalEarnedUsd = Number(p.cached_unlocked ?? 0);
      if (!Number.isFinite(totalEarnedUsd) || totalEarnedUsd <= 0) {
        alert("Nothing earned yet. Click Refresh first.");
        return;
      }

      // ------------------------------------------------------------------
      // 2) Compute REAL available = earned - paidOut (on-chain)
      // ------------------------------------------------------------------
      const decimals = await getTokenDecimals();
      const onchain = await readOnchainPaidOut(pactId);
      const paidOutUsd = Number(
        ethers.formatUnits(onchain.paidOutRaw, decimals)
      );

      const realAvailableUsd = Math.max(0, totalEarnedUsd - paidOutUsd);
      if (realAvailableUsd <= 0) {
        alert("Nothing available to claim.");
        return;
      }

      // ------------------------------------------------------------------
      // 3) User confirmation
      // ------------------------------------------------------------------
      const ok = confirm(
        `Claim ${realAvailableUsd.toFixed(2)} MNEE to your creator wallet?`
      );
      if (!ok) return;

      // ------------------------------------------------------------------
      // 3.5) Signature verification
      // ------------------------------------------------------------------
      const sigResult = await verifySignatureForAction("claim", id);
      if (!sigResult) {
        return; // User cancelled or verification failed
      }

      // ------------------------------------------------------------------
      // 4) MetaMask checks
      // ------------------------------------------------------------------
      const provider = new ethers.BrowserProvider(window.ethereum);
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== 11155111) {
        alert("Switch MetaMask to Sepolia and try again.");
        return;
      }

      const signer = await provider.getSigner();
      const signerAddr = await signer.getAddress();
      if (normAddr(signerAddr) !== normAddr(address)) {
        alert(
          `MetaMask account mismatch.\n\nLogged in: ${address}\nMetaMask: ${signerAddr}`
        );
        return;
      }

      claimBtn.disabled = true;

      // ------------------------------------------------------------------
      // 5) Get backend payout signature (TOTAL earned, not delta)
      // ------------------------------------------------------------------
      const sigRes = await fetch(
        `${API_BASE}/api/pacts/${encodeURIComponent(p.id)}/payout-sig`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            totalEarnedUsd: totalEarnedUsdForSig,
            tokenDecimals: decimals,
            escrowAddress: PACT_ESCROW_ADDRESS,
            chainId: 11155111,
          }),
        }
      );

      const sigData = await sigRes.json().catch(() => ({}));
      if (!sigRes.ok || !sigData.ok) {
        throw new Error(sigData?.error || "Failed to fetch payout signature");
      }

      // ------------------------------------------------------------------
      // 6) Execute payout on-chain
      // ------------------------------------------------------------------
      const escrow = new ethers.Contract(
        PACT_ESCROW_ADDRESS,
        PactEscrowABI,
        signer
      );

      const tx = await escrow.payoutWithSig(
        p.id,
        BigInt(sigData.totalEarnedRaw),
        sigData.expiry,
        sigData.sig
      );
      await tx.wait();

      // ------------------------------------------------------------------
      // 7) Update UI (available goes to zero; earned stays)
      // ------------------------------------------------------------------
      document.getElementById("ap-available").innerText = "0.00";

      alert("✅ Claimed successfully!");
    } catch (e) {
      alert(`Claim failed:\n\n${e?.shortMessage || e?.message || e}`);
    } finally {
      claimBtn.disabled = false;
    }
  };

  // update countdown every 1s WITHOUT spamming API
  setInterval(() => {
    const endMs = parseIsoSafe(p.active_ends_at);
    const remainingMs = endMs != null ? Math.max(0, endMs - Date.now()) : null;

    const remEl = document.getElementById("ap-remaining");
    if (remEl) remEl.innerText = formatCountdown(remainingMs);

    // 🔓 auto-enable reclaim button when expired
    const rb = document.getElementById("ap-reclaim");
    if (rb) {
      const ok =
        normAddr(address) === normAddr(p.sponsor_address) && isExpired(p);

      rb.disabled = !ok;
      rb.style.opacity = ok ? "1" : "0.6";
      rb.style.cursor = ok ? "pointer" : "not-allowed";
    }
  }, 1000);
}

// --- Input Video Link button (ONLY creator, ONLY created view) ---
const canInputVideoLink =
  mode === "created" &&
  normAddr(address) === normAddr(p.creator_address) &&
  String(p.status) === "created" &&
  (!p.video_link || !String(p.video_link).trim());

if (canInputVideoLink) {
  const videoBtn = document.createElement("button");
  videoBtn.type = "button";
  videoBtn.innerText = "Input Video Link";

  videoBtn.style.marginTop = "10px";
  videoBtn.style.background = "#2c3e50";
  videoBtn.style.color = "white";
  videoBtn.style.padding = "8px 14px";
  videoBtn.style.borderRadius = "8px";
  videoBtn.style.border = "none";
  videoBtn.style.cursor = "pointer";

  videoBtn.onclick = async () => {
    const current = String(p.video_link || "").trim();
    const link = prompt("Paste the video link:", current);
    if (link == null) return;

    const trimmed = String(link).trim();
    if (!trimmed) return alert("Please enter a link.");
    if (!/^https?:\/\/\S+$/i.test(trimmed)) {
      return alert(
        "Link must start with http:// or https:// and contain no spaces."
      );
    }
    
    // Validate platform support
    const platformCheck = isValidVideoPlatform(trimmed);
    if (!platformCheck.valid) {
      return alert(platformCheck.error);
    }

    // Signature verification
    const sigResult = await verifySignatureForAction("input_video_link", id);
    if (!sigResult) {
      return; // User cancelled or verification failed
    }

    videoBtn.disabled = true;

    try {
      const r = await fetch(
        `${API_BASE}/api/pacts/${encodeURIComponent(id)}/video-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            address, 
            videoLink: trimmed,
            signature: sigResult.signature,
            message: sigResult.message
          }),
        }
      );

      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        videoBtn.disabled = false;
        return alert(d?.error || "Failed to save video link");
      }

      localStorage.setItem("pactsNeedsRefresh", "1");
      window.location.replace("./pacts-dashboard.html");
    } catch {
      videoBtn.disabled = false;
      alert("Save failed (backend not reachable).");
    }
  };

  contentEl.appendChild(videoBtn);
}

// --- Approve + Fund button (ONLY sponsor, ONLY created view, ONLY when video_link is set) ---
const canApproveAndFund =
  mode === "created" &&
  normAddr(address) === normAddr(p.sponsor_address) &&
  String(p.status) === "created" &&
  String(p.video_link || "").trim().length > 0;

if (canApproveAndFund) {
  const fundBtn = document.createElement("button");
  fundBtn.type = "button";
  fundBtn.innerText = "Approve and Fund";

  fundBtn.style.marginTop = "10px";
  fundBtn.style.marginLeft = "10px";
  fundBtn.style.background = "#1f7a1f";
  fundBtn.style.color = "white";
  fundBtn.style.padding = "8px 14px";
  fundBtn.style.borderRadius = "8px";
  fundBtn.style.border = "none";
  fundBtn.style.cursor = "pointer";

  fundBtn.onclick = async () => {
    try {
    // Must be MetaMask + sponsor
    if (!window.ethereum) {
      alert("MetaMask not found.");
      return;
    }

      // ✅ 1) compute required max payout (MNEE units in UI)
      const required = maxPayoutMnee(p);
    const link = String(p.video_link || "").trim();

    if (!Number.isFinite(required) || required <= 0) {
      alert("Cannot fund: pact has no valid payout amounts.");
      return;
    }
      if (!link) {
        alert("Cannot fund: missing video link.");
      return;
    }

      // ✅ 2) read-only provider first (NO signer yet) + check chain
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const net = await browserProvider.getNetwork();
      if (Number(net.chainId) !== 11155111) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xaa36a7" }], // Sepolia
          });

          alert(
            "Switched to Sepolia. Page will reload — click Approve and Fund again."
          );
          window.location.reload();
          return;
        } catch (err) {
          alert("Please switch MetaMask to Sepolia and try again.");
          fundBtn.disabled = false;
          fundBtn.style.opacity = "1";
          fundBtn.style.cursor = "pointer";
          return;
        }
      }

      // ✅ 3) FIRST: balance check BEFORE confirm / signature / tx
      const ERC20_READ_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
      ];
      // Use current environment's MNEE address
      const mneeAddress = getMNEEAddress();
      const tokenRead = new ethers.Contract(
        mneeAddress,
        ERC20_READ_ABI,
        browserProvider
      );

      const [decimals, balRaw] = await Promise.all([
        tokenRead.decimals(),
        tokenRead.balanceOf(address),
      ]);

      const needRaw = ethers.parseUnits(required.toFixed(2), decimals);

      if (balRaw < needRaw) {
        const have = ethers.formatUnits(balRaw, decimals);
        const need = ethers.formatUnits(needRaw, decimals);
        alert(
          `Insufficient MNEE.\n\n` +
            `You have: ${have} MNEE\n` +
            `You need at least: ${need} MNEE\n\n` +
            `Get more MNEE on Sepolia, then try again.`
        );
        return;
      }

      // ✅ 4) confirm AFTER we know user can actually fund
    const ok = confirm(
      `Before you approve and fund:\n\n` +
          `• Verify the video link:\n  ${link}\n\n` +
        `• This will (1) create the on-chain pact if needed, (2) approve MNEE, (3) fund the pact.\n\n` +
        `Max funding required: ${required.toFixed(2)} MNEE\n\n` +
        `Continue?`
    );
    if (!ok) return;

    fundBtn.disabled = true;
    fundBtn.style.opacity = "0.7";
    fundBtn.style.cursor = "not-allowed";

      // Show loading screen immediately with informative message
      showSecondaryLoadingScreen("Processing transaction... This may take a minute. Please wait.");

    try {
        // ✅ 5) get signer (MetaMask) AFTER checks
      const signer = await browserProvider.getSigner();

      // sanity: make sure the connected wallet matches the logged-in address
      const signerAddr = await signer.getAddress();
      if (normAddr(signerAddr) !== normAddr(address)) {
          // Hide loading screen on early return
          hideSecondaryLoadingScreen();
        alert(
          `MetaMask account mismatch.\n\n` +
            `Logged in as: ${address}\n` +
            `MetaMask is: ${signerAddr}\n\n` +
            `Switch accounts in MetaMask and try again.`
        );
        fundBtn.disabled = false;
        fundBtn.style.opacity = "1";
        fundBtn.style.cursor = "pointer";
        return;
      }

      const escrow = new ethers.Contract(
        PACT_ESCROW_ADDRESS,
        PactEscrowABI,
        signer
      );

      const ERC20_ABI = [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
      ];
      // Use current environment's MNEE address (reuse mneeAddress from earlier in function)
      const token = new ethers.Contract(mneeAddress, ERC20_ABI, signer);

        // ✅ 6) create pact on-chain IF it doesn't exist yet
        let onchain = null;
        try {
          onchain = await escrow.pacts(id);
        } catch {}

        const sponsorOnchain = onchain?.sponsor ? String(onchain.sponsor) : "";
        const exists =
          sponsorOnchain &&
          sponsorOnchain !== "0x0000000000000000000000000000000000000000";

        if (!exists) {
          // get backend signature for createPactWithSig
          const sigRes = await fetch(
            `${API_BASE}/api/pacts/${encodeURIComponent(id)}/create-sig`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address, // sponsor logged-in address
                tokenDecimals: Number(decimals),
                escrowAddress: PACT_ESCROW_ADDRESS,
                chainId: 11155111,
              }),
            }
          );

          const sigData = await sigRes.json().catch(() => ({}));
          if (!sigRes.ok || !sigData.ok) {
            throw new Error(
              sigData?.error || "Failed to fetch create signature"
            );
          }

          // sanity: backend signed the same maxPayout you computed
          const backendMax = BigInt(sigData.maxPayoutRaw);
          if (backendMax !== needRaw) {
            throw new Error(
              `Max payout mismatch.\nFrontend: ${needRaw}\nBackend: ${backendMax}`
            );
          }

          const txCreate = await escrow.createPactWithSig(
            sigData.sponsor,
            id,
            sigData.creator,
            backendMax,
            sigData.durationSeconds,
            sigData.expiry,
            sigData.sig
          );
          await txCreate.wait();
        }

        // ✅ 7) approve IF needed (avoid unnecessary tx)
        const allowance = await token.allowance(address, PACT_ESCROW_ADDRESS);
        if (allowance < needRaw) {
          const txApprove = await token.approve(PACT_ESCROW_ADDRESS, needRaw);
          await txApprove.wait();
          
          // Verify approval went through
          const newAllowance = await token.allowance(address, PACT_ESCROW_ADDRESS);
          if (newAllowance < needRaw) {
            throw new Error(`Approval failed. Allowance is ${ethers.formatUnits(newAllowance, decimals)} but need ${ethers.formatUnits(needRaw, decimals)}`);
          }
        }

        // ✅ 7.5) Check on-chain pact state before funding
        let onchainPact;
        try {
          onchainPact = await escrow.pacts(id);
        } catch (e) {
          throw new Error(`Failed to read pact from contract: ${e.message}`);
        }
        
        const onchainSponsor = String(onchainPact.sponsor);
        const onchainStatus = Number(onchainPact.status);
        const onchainDeadline = Number(onchainPact.deadline);
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Status enum: 0 = Created, 1 = Funded, 2 = Closed
        if (onchainSponsor === "0x0000000000000000000000000000000000000000") {
          throw new Error("Pact does not exist on-chain. Please ensure the pact was created successfully.");
        }
        
        if (normAddr(onchainSponsor) !== normAddr(address)) {
          throw new Error(`Pact sponsor mismatch. On-chain: ${onchainSponsor}, Your address: ${address}`);
        }
        
        if (onchainStatus !== 0) {
          const statusNames = ["Created", "Funded", "Closed"];
          throw new Error(`Pact is not in Created status. Current status: ${statusNames[onchainStatus] || "Unknown"}`);
        }
        
        if (currentTime > onchainDeadline) {
          throw new Error(`Pact deadline has passed. Deadline: ${new Date(onchainDeadline * 1000).toLocaleString()}, Current: ${new Date().toLocaleString()}`);
        }

        // ✅ 8) fund(pactId) — contract pulls pact.maxPayout
        const txFund = await escrow.fund(id);
        await txFund.wait();

        alert("✅ Pact created (if needed) + approved + funded successfully!");

        localStorage.setItem("pactsNeedsRefresh", "1");
        // Hide loading screen before reload
        hideSecondaryLoadingScreen();
        // Small delay to ensure loading screen hides before reload
        setTimeout(() => {
          window.location.reload();
        }, 350);
      } catch (e) {
        // Hide loading screen on error
        hideSecondaryLoadingScreen();
        alert(`Approve/Fund failed:\n\n${e?.shortMessage || e?.message || e}`);
        fundBtn.disabled = false;
        fundBtn.style.opacity = "1";
        fundBtn.style.cursor = "pointer";
      }

      const escrow = new ethers.Contract(
        PACT_ESCROW_ADDRESS,
        PactEscrowABI,
        signer
      );

      const ERC20_ABI = [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
      ];
      // Use current environment's MNEE address (reuse mneeAddress from earlier in function)
      const token = new ethers.Contract(mneeAddress, ERC20_ABI, signer);

      // ✅ 6) create pact on-chain IF it doesn't exist yet
      let onchain = null;
      try {
        onchain = await escrow.pacts(id);
      } catch {}

      const sponsorOnchain = onchain?.sponsor ? String(onchain.sponsor) : "";
      const exists =
        sponsorOnchain &&
        sponsorOnchain !== "0x0000000000000000000000000000000000000000";

      if (!exists) {
        // get backend signature for createPactWithSig
        const sigRes = await fetch(
          `${API_BASE}/api/pacts/${encodeURIComponent(id)}/create-sig`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address, // sponsor logged-in address
              tokenDecimals: Number(decimals),
              escrowAddress: PACT_ESCROW_ADDRESS,
              chainId: 11155111,
            }),
          }
        );

        const sigData = await sigRes.json().catch(() => ({}));
        if (!sigRes.ok || !sigData.ok) {
          throw new Error(sigData?.error || "Failed to fetch create signature");
        }

        // sanity: backend signed the same maxPayout you computed
        const backendMax = BigInt(sigData.maxPayoutRaw);
        if (backendMax !== needRaw) {
          throw new Error(
            `Max payout mismatch.\nFrontend: ${needRaw}\nBackend: ${backendMax}`
          );
        }

        const txCreate = await escrow.createPactWithSig(
          sigData.sponsor,
          id,
          sigData.creator,
          backendMax,
          sigData.durationSeconds,
          sigData.expiry,
          sigData.sig
        );
        await txCreate.wait();
      }

      // ✅ 7) approve IF needed (avoid unnecessary tx)
      const allowance = await token.allowance(address, PACT_ESCROW_ADDRESS);
      if (allowance < needRaw) {
        const txApprove = await token.approve(PACT_ESCROW_ADDRESS, needRaw);
        await txApprove.wait();
      }

      // ✅ 8) fund(pactId) — contract pulls pact.maxPayout
      const txFund = await escrow.fund(id);
      await txFund.wait();

      // ✅ mark DB pact as active
      const markRes = await fetch(
        `${API_BASE}/api/pacts/${encodeURIComponent(id)}/mark-active`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        }
      );

      const markData = await markRes.json().catch(() => ({}));
      if (!markRes.ok || !markData.ok) {
        throw new Error(
          markData?.error || "Funded on-chain, but failed to mark Active in DB"
        );
      }

      localStorage.setItem("pactsNeedsRefresh", "1");
      alert("✅ Pact funded successfully!");

      return;
    } catch (e) {
      // Outer catch for any errors before the inner try block
      hideSecondaryLoadingScreen();
      alert(`Approve/Fund failed:\n\n${e?.shortMessage || e?.message || e}`);
      fundBtn.disabled = false;
      fundBtn.style.opacity = "1";
      fundBtn.style.cursor = "pointer";
    }
  };

  contentEl.appendChild(fundBtn);
}

// --- Negotiate button (only counterparty, only awaiting review) ---
const canNegotiate =
  mode === "awaiting" &&
  normAddr(address) === normAddr(p.counterparty_address) &&
  String(p.status) === "sent_for_review";

const canAccept =
  mode === "awaiting" &&
  normAddr(address) === normAddr(p.counterparty_address) &&
  String(p.status) === "sent_for_review";

if (canNegotiate) {
  const negotiateBtn = document.createElement("button");
  negotiateBtn.type = "button";
  negotiateBtn.innerText = "Negotiate Pact";

  negotiateBtn.style.marginTop = "10px";
  negotiateBtn.style.marginRight = "10px";
  negotiateBtn.style.background = "#2c3e50";
  negotiateBtn.style.color = "white";
  negotiateBtn.style.padding = "8px 14px";
  negotiateBtn.style.borderRadius = "8px";
  negotiateBtn.style.border = "none";
  negotiateBtn.style.cursor = "pointer";

  negotiateBtn.onclick = async () => {
    // Signature verification
    const sigResult = await verifySignatureForAction("negotiate", id);
    if (!sigResult) {
      return; // User cancelled or verification failed
    }
    
    // Store signature for negotiate page
    localStorage.setItem(`pactNegotiateSig:${address.toLowerCase()}:${id}`, sigResult.signature);
    localStorage.setItem(`pactNegotiateMsg:${address.toLowerCase()}:${id}`, sigResult.message);
    
    window.location.href = `./pactory.html?mode=negotiate&id=${encodeURIComponent(
      id
    )}`;
  };

  contentEl.appendChild(negotiateBtn);
}

if (canAccept) {
  const acceptBtn = document.createElement("button");
  acceptBtn.type = "button";
  acceptBtn.innerText = "Accept Pact";

  acceptBtn.style.marginTop = "10px";
  acceptBtn.style.marginLeft = "10px";
  acceptBtn.style.marginRight = "10px";
  acceptBtn.style.background = "#1f7a1f";
  acceptBtn.style.color = "white";
  acceptBtn.style.padding = "8px 14px";
  acceptBtn.style.borderRadius = "8px";
  acceptBtn.style.border = "none";
  acceptBtn.style.cursor = "pointer";

  acceptBtn.onclick = async () => {
    const ok = confirm("Accept this pact? This will mark it as Created.");
    if (!ok) return;

    // Signature verification
    const sigResult = await verifySignatureForAction("accept", id);
    if (!sigResult) {
      return; // User cancelled or verification failed
    }

    acceptBtn.disabled = true;
    acceptBtn.style.opacity = "0.7";
    acceptBtn.style.cursor = "not-allowed";

    try {
      const r = await fetch(
        `${API_BASE}/api/pacts/${encodeURIComponent(id)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            address,
            signature: sigResult.signature,
            message: sigResult.message
          }),
        }
      );

      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        alert(d?.error || "Failed to accept pact");
        acceptBtn.disabled = false;
        acceptBtn.style.opacity = "1";
        acceptBtn.style.cursor = "pointer";
        return;
      }

      localStorage.setItem("pactsNeedsRefresh", "1");
      window.location.replace("./pacts-dashboard.html");
    } catch {
      alert("Accept failed (backend not reachable).");
      acceptBtn.disabled = false;
      acceptBtn.style.opacity = "1";
      acceptBtn.style.cursor = "pointer";
    }
  };

  contentEl.appendChild(acceptBtn);
}

// Action button
// Action button (no delete for ACTIVE pacts)
let actionLabel = null;

if (String(p.status) !== "active") {
if (mode === "sent") actionLabel = "Delete";
if (mode === "awaiting") actionLabel = "Reject";
if (mode === "created") actionLabel = "Delete";
}

if (actionLabel) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerText = actionLabel;

  btn.style.marginTop = "10px";
  btn.style.marginLeft = "10px";
  btn.style.background = "#c0392b";
  btn.style.color = "white";
  btn.style.padding = "8px 14px";
  btn.style.borderRadius = "8px";
  btn.style.border = "none";
  btn.style.cursor = "pointer";

  btn.onclick = async () => {
    const msg =
      actionLabel === "Reject"
        ? "Are you sure you want to reject this pact?"
        : "Are you sure you want to delete this pact?";

    const ok = confirm(msg);
    if (!ok) return;

    // Signature verification
    const action = actionLabel === "Reject" ? "reject" : "delete";
    const sigResult = await verifySignatureForAction(action, id);
    if (!sigResult) {
      return; // User cancelled or verification failed
    }

    btn.disabled = true;
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";

    try {
      // ✅ choose correct endpoint
      const endpoint =
        mode === "created"
          ? `${API_BASE}/api/pacts/${encodeURIComponent(
              id
            )}/created?address=${encodeURIComponent(address)}`
          : `${API_BASE}/api/pacts/${encodeURIComponent(
              id
            )}?address=${encodeURIComponent(address)}`;

      const delRes = await fetch(endpoint, { 
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: sigResult.signature,
          message: sigResult.message
        })
      });
      const delData = await delRes.json().catch(() => ({}));

      if (!delRes.ok || !delData.ok) {
        alert(delData?.error || "Failed");
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        return;
      }

      localStorage.setItem("pactsNeedsRefresh", "1");
      window.location.replace("./pacts-dashboard.html");
    } catch (e) {
      alert("Request failed (backend not reachable).");
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
  };

  contentEl.appendChild(btn);
}
