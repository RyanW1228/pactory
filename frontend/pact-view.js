// pact-view.js

// Config
// const API_BASE = "https://backend-muddy-hill-3958.fly.dev";
const API_BASE = "http://localhost:3000";

import { ethers } from "./ethers-6.7.esm.min.js";
import {
  getMNEEAddress,
  getPactEscrowAddress,
  getEnvironment,
} from "./constants.js";
import { PactEscrowABI } from "./pactEscrowAbi.js";
import {
  showSecondaryLoadingScreen,
  hideSecondaryLoadingScreen,
} from "./loading-screen.js";

// --------------------
// MetaMask listeners (no auto reload)
// --------------------
if (window.ethereum) {
  window.ethereum.on("chainChanged", (cid) => {
    console.log("[MetaMask] chainChanged:", cid, "(NOT reloading page)");
  });
  window.ethereum.on("accountsChanged", (accts) => {
    console.log("[MetaMask] accountsChanged:", accts, "(NOT reloading page)");
  });
}

// --------------------
// DOM
// --------------------
const backButton = document.getElementById("backButton");
const titleEl = document.getElementById("title");
const contentEl = document.getElementById("content");

if (!backButton || !titleEl || !contentEl) {
  alert(
    "pact-view.html is missing required elements (backButton/title/content)."
  );
  throw new Error("Missing required DOM elements");
}

// Optional dropdown containers (safe even if missing)
const oldDetails = document.getElementById("oldPactDetails"); // <details>
const oldBody = document.getElementById("oldPactBody"); // <div>
const replacedDetails = document.getElementById("replacedPactDetails"); // <details>
const replacedBody = document.getElementById("replacedPactBody"); // <div>

// --------------------
// Environment + addresses
// --------------------
const ENV =
  typeof getEnvironment === "function" ? getEnvironment() : "production"; // "testing" | "production"

function withEnv(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}env=${encodeURIComponent(ENV)}`;
}

const PACT_ESCROW_ADDRESS = getPactEscrowAddress();

// Nav
backButton.onclick = () => {
  localStorage.setItem("pactsNeedsRefresh", "1");
  window.location.assign("./pacts-dashboard.html");
};

// --------------------
// Params + session
// --------------------
const params = new URLSearchParams(window.location.search);
const id = params.get("id");
const mode = params.get("mode"); // "sent" | "awaiting" | "created"
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

const pactIdStr = String(id);
let pactIdNum;
try {
  pactIdNum = BigInt(pactIdStr);
} catch {
  alert("Invalid pact id (must be numeric)");
  throw new Error("Invalid pact id (must be numeric)");
}

// --------------------
// Small helpers
// --------------------
function normAddr(a) {
  return String(a || "").toLowerCase();
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

function isActivePact(p) {
  return String(p?.status) === "active";
}

function isExpired(p) {
  const endMs = parseIsoSafe(p.active_ends_at);
  return endMs != null && Date.now() > endMs;
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

  // aon: SUM all payouts
  let aonSum = 0;
  for (const x of aon) {
    const v = Number(x?.payout);
    if (Number.isFinite(v) && v > 0) aonSum += v;
  }

  return progressMax + aonSum;
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

function disableEarningsActions({ refreshBtn, claimBtn, errEl, reason }) {
  const r = reason || "Expired";
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = "0.6";
    refreshBtn.style.cursor = "not-allowed";
    refreshBtn.title = r;
  }
  if (claimBtn) {
    claimBtn.disabled = true;
    claimBtn.style.opacity = "0.6";
    claimBtn.style.cursor = "not-allowed";
    claimBtn.title = r;
  }
  if (errEl) {
    errEl.style.display = "block";
    errEl.innerText = r;
  }
}

function isCountableVideoLink(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL." };
  }

  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = u.pathname;

  // TikTok: /@user/video/123...
  if (host.endsWith("tiktok.com")) {
    const ok = /^\/@[^/]+\/video\/\d+/.test(path);
    return ok
      ? { valid: true, platform: "TikTok" }
      : {
          valid: false,
          error: "TikTok link must look like: tiktok.com/@user/video/123...",
        };
  }

  // Instagram: /reel/{code} or /p/{code}
  if (host === "instagram.com" || host === "instagr.am") {
    const ok = /^\/(reel|p)\/[A-Za-z0-9_-]+/.test(path);
    return ok
      ? { valid: true, platform: "Instagram" }
      : {
          valid: false,
          error:
            "Instagram link must be a Reel or Post: instagram.com/reel/... or instagram.com/p/...",
        };
  }

  // YouTube Shorts: /shorts/{id}
  if (host === "youtube.com" && path.startsWith("/shorts/")) {
    const ok = /^\/shorts\/[A-Za-z0-9_-]{6,}/.test(path);
    return ok
      ? { valid: true, platform: "YouTube Shorts" }
      : {
          valid: false,
          error:
            "YouTube Shorts link must look like: youtube.com/shorts/VIDEOID",
        };
  }

  // YouTube watch: /watch?v=VIDEOID
  if (host === "youtube.com" && path === "/watch") {
    const v = u.searchParams.get("v");
    const ok = /^[A-Za-z0-9_-]{6,}$/.test(v || "");
    return ok
      ? { valid: true, platform: "YouTube" }
      : {
          valid: false,
          error: "YouTube link must look like: youtube.com/watch?v=VIDEOID",
        };
  }

  // youtu.be/VIDEOID
  if (host === "youtu.be") {
    const ok = /^\/[A-Za-z0-9_-]{6,}$/.test(path);
    return ok
      ? { valid: true, platform: "YouTube" }
      : {
          valid: false,
          error: "Short YouTube link must look like: youtu.be/VIDEOID",
        };
  }

  return {
    valid: false,
    error:
      "Unsupported platform. Use TikTok, Instagram Reel/Post, or YouTube watch/shorts.",
  };
}

// --------------------
// Signature verification
// --------------------
async function verifySignatureForAction(action, pactId) {
  if (!window.ethereum) {
    alert("MetaMask not found. Please install MetaMask.");
    return false;
  }

  const withTimeout = (p, ms, label) =>
    Promise.race([
      p,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`${label} timed out`)), ms)
      ),
    ]);

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

  if (!accounts || accounts.length === 0) {
    try {
      accounts = await withTimeout(
        window.ethereum.request({ method: "eth_requestAccounts" }),
        30000,
        "MetaMask connect"
      );
    } catch (e) {
      alert(`Wallet connect failed:\n\n${e?.message || e}`);
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

  const nonce = ethers.hexlify(ethers.randomBytes(16));
  const issuedAt = new Date().toISOString();
  const message =
    `Pactory verification\n` +
    `Address: ${address}\n` +
    `Action: ${action}\n` +
    `Pact ID: ${pactId}\n` +
    `Nonce: ${nonce}\n` +
    `IssuedAt: ${issuedAt}`;

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
    alert(`Signature failed:\n\n${e?.message || e}`);
    return false;
  }

  const recovered = ethers.verifyMessage(message, signature).toLowerCase();
  if (recovered !== address.toLowerCase()) {
    alert("Signature verification failed (recovered address mismatch).");
    return false;
  }

  const storageKey = `pactActionSig:${address.toLowerCase()}:${action}:${pactId}`;
  localStorage.setItem(storageKey, signature);
  localStorage.setItem(`${storageKey}:msg`, message);

  return { signature, message };
}

// --------------------
// Chain helpers
// --------------------
async function getTokenDecimals() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  const ERC20_READ_ABI = ["function decimals() view returns (uint8)"];
  const token = new ethers.Contract(
    getMNEEAddress(),
    ERC20_READ_ABI,
    browserProvider
  );
  return Number(await token.decimals());
}

async function readOnchainPact(pactIdNum) {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  const escrow = new ethers.Contract(
    PACT_ESCROW_ADDRESS,
    PactEscrowABI,
    browserProvider
  );
  const pact = await escrow.pacts(pactIdNum);
  return {
    paidOutRaw: pact.paidOut,
    maxPayoutRaw: pact.maxPayout,
    sponsor: pact.sponsor,
    creator: pact.creator,
    status: pact.status, // 0 Created, 1 Funded, 2 Closed
    refunded: pact.refunded,
    deadline: pact.deadline,

    // NEW (safe even if you don't use yet)
    finalEarnedRaw: pact.finalEarned,
    finalized: pact.finalized,
  };
}

// completed = expired AND (closed/refunded OR paidOut ~= maxPayout)
async function isPactCompleted(p) {
  if (!isExpired(p)) return false;
  try {
    const on = await readOnchainPact(pactIdNum);
    const status = Number(on.status);
    const refunded = Boolean(on.refunded);
    if (status === 2 || refunded) return true;

    const decimals = await getTokenDecimals();
    const paidOut = Number(ethers.formatUnits(on.paidOutRaw, decimals));
    const maxPayout = Number(ethers.formatUnits(on.maxPayoutRaw, decimals));
    return Math.abs(paidOut - maxPayout) < 0.01;
  } catch (e) {
    console.warn("[isPactCompleted] on-chain read failed:", e);
    return false;
  }
}

// --------------------
// Backend helpers
// --------------------
async function fetchLatestPact(pactIdStr) {
  const r = await fetch(
    withEnv(`${API_BASE}/api/pacts/${encodeURIComponent(pactIdStr)}`),
    { cache: "no-store" }
  );
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d?.error || "Failed to load pact");
  return d.pact;
}

async function fetchActiveStats(pactIdStr) {
  const url = withEnv(
    `${API_BASE}/api/pacts/${encodeURIComponent(pactIdStr)}/sync-views`
  );
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

// --------------------
// Active panel rendering
// --------------------
function renderActivePanelSkeleton() {
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
  document.getElementById("ap-start").innerText = p.active_started_at
    ? formatEastern(p.active_started_at)
    : "-";
  document.getElementById("ap-end").innerText = p.active_ends_at
    ? formatEastern(p.active_ends_at)
    : "-";

  const link = String(p.video_link || "").trim();
  document.getElementById("ap-link").innerHTML = link
    ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${link}</a>`
    : `<span style="opacity:0.7;">(not set)</span>`;
}

function renderActiveFromCache(p) {
  const views = p.cached_views ?? "-";
  document.getElementById("ap-views").innerText = String(views);

  const earned = Number(p.cached_unlocked ?? 0);
  document.getElementById("ap-earned").innerText = Number.isFinite(earned)
    ? earned.toFixed(2)
    : "0.00";

  const unearned = Number(p.cached_unearned ?? 0);
  document.getElementById("ap-unearned").innerText = Number.isFinite(unearned)
    ? unearned.toFixed(2)
    : "0.00";

  const available = Number(p.cached_available ?? earned);
  document.getElementById("ap-available").innerText = Number.isFinite(available)
    ? available.toFixed(2)
    : "0.00";
}

function renderActiveCountdownTick(p) {
  const endMs = parseIsoSafe(p.active_ends_at);
  const remainingMs = endMs != null ? Math.max(0, endMs - Date.now()) : null;
  const remEl = document.getElementById("ap-remaining");
  if (remEl) remEl.innerText = formatCountdown(remainingMs);
}

// --------------------
// Payout graph (unchanged logic, compact)
// --------------------
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
  if (!pact.progress_enabled || !Array.isArray(pact.progress_milestones))
    return 0;

  const ms = pact.progress_milestones
    .map((m) => ({ v: Number(m?.views || 0), p: Number(m?.payout || 0) }))
    .filter(
      (m) => Number.isInteger(m.v) && m.v > 0 && Number.isFinite(m.p) && m.p > 0
    )
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
    .filter(
      (r) => Number.isInteger(r.v) && r.v > 0 && Number.isFinite(r.p) && r.p > 0
    );

  let sum = 0;
  for (const r of rewards) if (x >= r.v) sum += r.p;
  return sum;
}

function aonBonusBeforeViewsForPact(pact, k) {
  if (!pact.aon_enabled || !Array.isArray(pact.aon_rewards)) return 0;
  if (!Number.isFinite(k)) return 0;

  const rewards = pact.aon_rewards
    .map((r) => ({ v: Number(r?.views || 0), p: Number(r?.payout || 0) }))
    .filter(
      (r) => Number.isInteger(r.v) && r.v > 0 && Number.isFinite(r.p) && r.p > 0
    );

  let sum = 0;
  for (const r of rewards) if (r.v < k) sum += r.p;
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

  const w = 680,
    h = 240,
    padL = 90,
    padR = 20,
    padT = 30,
    padB = 50;

  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  graphEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
  graphEl.innerHTML = "";

  graphEl.innerHTML += `<rect x="0" y="0" width="${w}" height="${h}" fill="#FAFBFF" rx="8"/>`;
  graphEl.innerHTML += `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${
    padT + innerH
  }" stroke="#1976D2" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${
    padT + innerH
  }" stroke="#1976D2" stroke-width="2.5" stroke-linecap="round"/>
  `;
  graphEl.innerHTML += `
    <text x="${padL + innerW / 2}" y="${
    h - 12
  }" font-size="13" fill="#1565C0" font-weight="600" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">Views</text>
    <text x="20" y="${
      padT + innerH / 2
    }" font-size="13" fill="#1565C0" font-weight="600" transform="rotate(-90, 20, ${
    padT + innerH / 2
  })" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">Payout ($)</text>
  `;

  const keys = collectKeyViewsWithInfinityForPact(pact);
  const hasAnyThreshold = keys.some((k) => k !== 0 && k !== X_INF_PACT_VIEW);
  if (!hasAnyThreshold) return;

  const sx = makeOrdinalScaleXForPact(keys, padL, innerW);

  const pts = keys.map((k) => {
    if (k === X_INF_PACT_VIEW) {
      const y =
        progressPayoutAtViewsForPact(pact, Number.MAX_SAFE_INTEGER) +
        aonBonusAtViewsForPact(pact, Number.MAX_SAFE_INTEGER);
      return { k, yBefore: y, yAfter: y };
    }
    const progress = progressPayoutAtViewsForPact(pact, k);
    const yBefore = progress + aonBonusBeforeViewsForPact(pact, k);
    const yAfter = progress + aonBonusAtViewsForPact(pact, k);
    return { k, yBefore, yAfter };
  });

  const maxY = Math.max(1, ...pts.map((p) => Math.max(p.yBefore, p.yAfter)));
  const yTicks = makeNiceTicksForPact(maxY, 6);
  const scaleMaxY = Math.max(...yTicks);
  const sy = (y) => padT + innerH - (y / scaleMaxY) * innerH;

  for (const yVal of yTicks) {
    const y = sy(yVal);
    graphEl.innerHTML += `
      <line x1="${padL}" y1="${y}" x2="${
      padL + innerW
    }" y2="${y}" stroke="#E3F2FD" stroke-width="1" stroke-dasharray="2 2" opacity="0.6"/>
      <line x1="${
        padL - 5
      }" y1="${y}" x2="${padL}" y2="${y}" stroke="#1976D2" stroke-width="2" stroke-linecap="round"/>
      <text x="${padL - 15}" y="${
      y + 4
    }" font-size="11" fill="#1565C0" font-weight="600" text-anchor="end" font-family="system-ui, -apple-system, sans-serif">${formatMoneyTickForPact(
      yVal
    )}</text>
    `;
  }

  const axisY = padT + innerH;

  // x labels (sparse)
  const maxLabels = 8;
  const showIdx = new Set([0, keys.length - 1]);
  if (keys.length > maxLabels) {
    const step = Math.ceil((keys.length - 2) / (maxLabels - 2));
    for (let i = step; i < keys.length - 1; i += step) showIdx.add(i);
  } else {
    for (let i = 1; i < keys.length - 1; i++) showIdx.add(i);
  }

  keys.forEach((k, i) => {
    if (!showIdx.has(i)) return;
    const x = sx(k);
    graphEl.innerHTML += `
      <line x1="${x}" y1="${padT}" x2="${x}" y2="${axisY}" stroke="#E3F2FD" stroke-width="1" stroke-dasharray="2 2" opacity="0.6"/>
      <line x1="${x}" y1="${axisY}" x2="${x}" y2="${
      axisY + 6
    }" stroke="#1976D2" stroke-width="2" stroke-linecap="round"/>
      <text x="${x}" y="${
      axisY + 22
    }" font-size="11" fill="#1565C0" font-weight="600" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${formatXKeyForPact(
      k
    )}</text>
    `;
  });

  // defs
  let defs = graphEl.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    graphEl.appendChild(defs);
  }

  const gradientId = "pact-view-payout-gradient";
  if (!graphEl.querySelector(`#${gradientId}`)) {
    const gradient = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "linearGradient"
    );
    gradient.id = gradientId;
    gradient.setAttribute("x1", "0%");
    gradient.setAttribute("y1", "0%");
    gradient.setAttribute("x2", "0%");
    gradient.setAttribute("y2", "100%");

    const stop1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "stop"
    );
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "#2196F3");
    stop1.setAttribute("stop-opacity", "1");

    const stop2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "stop"
    );
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", "#42A5F5");
    stop2.setAttribute("stop-opacity", "1");

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
  }

  const areaGradientId = "pact-view-area-gradient";
  if (!graphEl.querySelector(`#${areaGradientId}`)) {
    const areaGradient = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "linearGradient"
    );
    areaGradient.id = areaGradientId;
    areaGradient.setAttribute("x1", "0%");
    areaGradient.setAttribute("y1", "0%");
    areaGradient.setAttribute("x2", "0%");
    areaGradient.setAttribute("y2", "100%");

    const stop1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "stop"
    );
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "#2196F3");
    stop1.setAttribute("stop-opacity", "0.2");

    const stop2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "stop"
    );
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", "#42A5F5");
    stop2.setAttribute("stop-opacity", "0.05");

    areaGradient.appendChild(stop1);
    areaGradient.appendChild(stop2);
    defs.appendChild(areaGradient);
  }

  const shadowFilterId = "pact-view-line-shadow";
  if (!graphEl.querySelector(`#${shadowFilterId}`)) {
    const filter = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "filter"
    );
    filter.id = shadowFilterId;
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");

    const feGaussianBlur = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feGaussianBlur"
    );
    feGaussianBlur.setAttribute("in", "SourceAlpha");
    feGaussianBlur.setAttribute("stdDeviation", "3");
    feGaussianBlur.setAttribute("result", "blur");
    filter.appendChild(feGaussianBlur);

    const feOffset = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feOffset"
    );
    feOffset.setAttribute("dx", "2");
    feOffset.setAttribute("dy", "2");
    feOffset.setAttribute("result", "offsetblur");
    filter.appendChild(feOffset);

    const transfer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feComponentTransfer"
    );
    const funcA = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feFuncA"
    );
    funcA.setAttribute("type", "linear");
    funcA.setAttribute("slope", "0.3");
    transfer.appendChild(funcA);
    filter.appendChild(transfer);

    const merge = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMerge"
    );
    const mergeNode1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMergeNode"
    );
    mergeNode1.setAttribute("in", "offsetblur");
    const mergeNode2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feMergeNode"
    );
    mergeNode2.setAttribute("in", "SourceGraphic");
    merge.appendChild(mergeNode1);
    merge.appendChild(mergeNode2);
    filter.appendChild(merge);

    defs.appendChild(filter);
  }

  let areaPath = `M ${sx(pts[0].k)} ${padT + innerH} L ${sx(pts[0].k)} ${sy(
    pts[0].yAfter
  )} `;
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

// --------------------
// Load pact
// --------------------
let res, data;
try {
  res = await fetch(
    withEnv(`${API_BASE}/api/pacts/${encodeURIComponent(pactIdStr)}`)
  );
  data = await res.json();
} catch (e) {
  alert("Backend not reachable.");
  throw e;
}

if (!res.ok || !data.ok) {
  alert(data?.error || "Failed to load pact");
  throw new Error(data?.error || "Failed to load pact");
}

let p = data.pact;

// ✅ Show environment badge
const envBadge = document.getElementById("envBadge");

// Prefer pact.env if stored; otherwise fall back to current environment
const env =
  String(p?.env || "").trim() ||
  (typeof getEnvironment === "function" ? getEnvironment() : "") ||
  localStorage.getItem("pactory-environment") ||
  "production";

if (envBadge) {
  envBadge.innerText = `ENV: ${env.toUpperCase()}`;

  if (env === "testing") {
    envBadge.style.background = "rgba(255, 193, 7, 0.14)";
    envBadge.style.borderColor = "rgba(255, 193, 7, 0.35)";
    envBadge.style.color = "#8a5a00";
  } else {
    envBadge.style.background = "rgba(76, 175, 80, 0.12)";
    envBadge.style.borderColor = "rgba(76, 175, 80, 0.30)";
    envBadge.style.color = "#1b5e20";
  }
}

// Title
titleEl.innerText = String(p.name || "").trim() ? p.name : `Pact #${p.id}`;

// --------------------
// Replaced pact dropdown (ONLY here — no duplicate string injection)
// --------------------
if (replacedDetails && replacedBody) {
  if (data.replaced_pact) {
    replacedDetails.style.display = "block";
    const rp = data.replaced_pact;
    replacedBody.innerHTML = `
      <div style="border:1px solid #ddd; border-radius:10px; padding:12px;">
        <div><strong>Name:</strong> ${rp.name || "Untitled Pact"}</div>
        <div><strong>Status:</strong> ${prettyStatus(rp.status)}</div>
        <div><strong>Sponsor:</strong> ${rp.sponsor_address}${
      normAddr(rp.sponsor_address) === normAddr(address)
        ? ' <span style="color: #1976D2; font-weight: 600;">(You)</span>'
        : ""
    }</div>
        <div><strong>Creator:</strong> ${rp.creator_address}${
      normAddr(rp.creator_address) === normAddr(address)
        ? ' <span style="color: #1976D2; font-weight: 600;">(You)</span>'
        : ""
    }</div>
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
}

// --------------------
// Old info panel HTML
// --------------------
const maxPayout = maxPayoutMnee(p);

const oldPanelHtml = `
  <div style="border:1px solid rgba(33, 150, 243, 0.15); border-radius:12px; padding:20px; background:#FFFFFF; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(33,150,243,0.1);"><strong>Status:</strong> ${prettyStatus(
      p.status
    )}</div>
    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(33,150,243,0.1);"><strong>Created:</strong> ${formatEastern(
      p.created_at
    )}</div>
    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(33,150,243,0.1);"><strong>Sponsor:</strong> ${
      p.sponsor_address
    }${
  normAddr(p.sponsor_address) === normAddr(address)
    ? ' <span style="color:#1976D2; font-weight:600;">(You)</span>'
    : ""
}</div>
    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(33,150,243,0.1);"><strong>Creator:</strong> ${
      p.creator_address
    }${
  normAddr(p.creator_address) === normAddr(address)
    ? ' <span style="color:#1976D2; font-weight:600;">(You)</span>'
    : ""
}</div>

    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(33,150,243,0.1);"><strong>Max payout:</strong> $${
      Number.isFinite(maxPayout) ? maxPayout.toFixed(2) : "-"
    }</div>

    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(33,150,243,0.1);"><strong>Video Link:</strong> ${
      String(p.video_link || "").trim()
        ? `<a href="${p.video_link}" target="_blank" rel="noopener noreferrer" style="color:#1976D2; text-decoration:none;">${p.video_link}</a>`
        : `<span style="color:#999; font-style:italic;">(not set)</span>`
    }</div>

    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(33,150,243,0.1);"><strong>Duration:</strong> ${formatDuration(
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
    <summary style="cursor:pointer; font-weight:600; font-size:1.125rem; color:#1E3A5F; padding:12px; background:#E3F2FD; border-radius:8px; border:1px solid rgba(33,150,243,0.2); list-style:none; display:flex; align-items:center; justify-content:space-between;">
      <span>Payout Visualization</span>
      <span class="dropdown-arrow" style="transition:transform 0.2s; display:inline-block; font-size:0.875rem; color:#1976D2;">▼</span>
    </summary>
    <div style="margin-top:16px; padding:16px; background:#FAFBFF; border-radius:8px; border:1px solid rgba(33,150,243,0.15);">
      <svg id="pactViewPayoutGraph" width="680" height="240" style="width:100%; height:auto; max-width:680px; border:1px solid rgba(33,150,243,0.2); border-radius:10px; background:linear-gradient(135deg,#FAFBFF 0%,#F5F9FF 100%);"></svg>
    </div>
  </details>
`;

// Active pact: old info ONLY in dropdown; Non-active: old info in main content
if (isActivePact(p) && oldDetails && oldBody) {
  oldDetails.style.display = "block";
  oldBody.innerHTML = oldPanelHtml;
  contentEl.innerHTML = ""; // prevent duplicate
  setTimeout(() => renderPactPayoutGraph(p), 50);
} else {
  if (oldDetails) oldDetails.style.display = "none";
  contentEl.innerHTML = oldPanelHtml;
  setTimeout(() => renderPactPayoutGraph(p), 50);
}

// --------------------
// ACTIVE PANEL (only when status=active)
// --------------------
if (isActivePact(p)) {
  const panel = renderActivePanelSkeleton();

  const controls = document.createElement("div");
  controls.style.marginBottom = "10px";

  const refreshBtn = document.createElement("button");
  refreshBtn.id = "ap-refresh";
  refreshBtn.type = "button";
  refreshBtn.innerText = "Refresh";
  refreshBtn.style.display = "block";
  refreshBtn.style.marginBottom = "2px";

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

  // Sponsor-only reclaim (only show for sponsor)
  const isSponsor = normAddr(address) === normAddr(p.sponsor_address);
  if (isSponsor) {
    const reclaimBtn = document.createElement("button");
    reclaimBtn.id = "ap-reclaim";
    reclaimBtn.type = "button";
    reclaimBtn.innerText = "Reclaim Unspent MNEE";
    reclaimBtn.style.display = "block";
    reclaimBtn.style.marginTop = "8px";

    const canReclaim = isExpired(p);
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

        // ✅ make sure we have the latest cached_unlocked before finalizing
        showSecondaryLoadingScreen(
          "Finalizing pact... (refreshing stats first)"
        );
        try {
          await fetchActiveStats(pactIdStr);
          p = await fetchLatestPact(pactIdStr);
        } finally {
          hideSecondaryLoadingScreen();
        }

        const finalEarnedUsd = Number(p.cached_unlocked ?? 0);
        if (!Number.isFinite(finalEarnedUsd) || finalEarnedUsd < 0) {
          alert("Missing/invalid earned amount. Click Refresh first.");
          return;
        }

        reclaimBtn.disabled = true;

        const net = await provider.getNetwork();
        if (Number(net.chainId) !== 11155111) {
          alert("Switch MetaMask to Sepolia and try again.");
          return;
        }

        const decimals = await getTokenDecimals();

        // ✅ get finalize signature from backend
        const finalizeUrl = withEnv(
          `${API_BASE}/api/pacts/${encodeURIComponent(pactIdStr)}/finalize-sig`
        );
        const finRes = await fetch(finalizeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            finalEarnedUsd,
            tokenDecimals: decimals,
            escrowAddress: PACT_ESCROW_ADDRESS,
            chainId: 11155111,
          }),
        });

        const finData = await finRes.json().catch(() => ({}));
        if (!finRes.ok || !finData.ok) {
          throw new Error(
            finData?.error || "Failed to fetch finalize signature"
          );
        }

        const escrow = new ethers.Contract(
          PACT_ESCROW_ADDRESS,
          PactEscrowABI,
          signer
        );

        // ✅ 1) finalize (locks finalEarned on-chain)
        const tx1 = await escrow.finalizeAfterDeadlineWithSig(
          pactIdNum,
          BigInt(finData.finalEarnedRaw),
          finData.expiry,
          finData.sig
        );
        await tx1.wait();

        // ✅ 2) refund remaining (sponsor gets ONLY max - finalEarned - paidOut)
        const tx2 = await escrow.refundAfterDeadline(pactIdNum);
        await tx2.wait();

        alert("✅ Finalized + reclaimed unspent MNEE!");
      } catch (e) {
        alert(`Reclaim failed:\n\n${e?.shortMessage || e?.message || e}`);
      } finally {
        reclaimBtn.disabled = false;
      }
    };

    controls.appendChild(reclaimBtn);
  }

  controls.appendChild(claimBtn);
  controls.appendChild(refreshBtn);
  controls.appendChild(errEl);

  // Put panel + controls at top of main content
  contentEl.prepend(controls);
  contentEl.prepend(panel);

  // Fill from pact
  renderActiveStatic(p);
  renderActiveFromCache(p);

  // Countdown tick
  renderActiveCountdownTick(p);
  setInterval(() => renderActiveCountdownTick(p), 1000);

  // Auto-disable refresh/claim exactly at end
  // Auto-disable Refresh exactly at end (Claim stays enabled)
  const endMs = parseIsoSafe(p.active_ends_at);
  if (endMs != null) {
    const delay = endMs - Date.now();

    const disableRefreshOnly = () => {
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.style.opacity = "0.6";
        refreshBtn.style.cursor = "not-allowed";
        refreshBtn.title = "Pact duration ended — refreshing is disabled.";
      }
      if (errEl) {
        errEl.style.display = "block";
        errEl.innerText = "Pact duration ended — refreshing is disabled.";
      }
    };

    if (delay <= 0) disableRefreshOnly();
    else setTimeout(disableRefreshOnly, delay);
  }

  // Refresh click (ONE backend call + then refetch pact)
  refreshBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

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

    showSecondaryLoadingScreen(
      "Refreshing view counts... This may take a moment."
    );
    try {
      const stats = await fetchActiveStats(pactIdStr);

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

      const availableUsd = Number(stats.availablePayout ?? earnedUsd);
      document.getElementById("ap-available").innerText = Number.isFinite(
        availableUsd
      )
        ? availableUsd.toFixed(2)
        : "0.00";

      // keep pact in sync (cached_* fields)
      p = await fetchLatestPact(pactIdStr);
      titleEl.innerText = String(p.name || "").trim()
        ? p.name
        : `Pact #${p.id}`;
    } catch (err) {
      console.error("[REFRESH ERROR]", err);
      errEl.style.display = "block";
      errEl.innerText = err?.message || String(err);
    } finally {
      hideSecondaryLoadingScreen();
      refreshBtn.disabled = false;
    }
  };

  // Claim click (creator only)
  claimBtn.onclick = async () => {
    try {
      if (!window.ethereum) {
        alert("MetaMask not found.");
        return;
      }

      // Use backend-cached earned amount (must Refresh first)
      const totalEarnedUsd = Number(p.cached_unlocked ?? 0);
      if (!Number.isFinite(totalEarnedUsd) || totalEarnedUsd <= 0) {
        alert("Nothing earned yet. Click Refresh first.");
        return;
      }

      // Real available = earned - paidOut (on-chain)
      const decimals = await getTokenDecimals();
      const onchain = await readOnchainPact(pactIdNum);
      const paidOutUsd = Number(
        ethers.formatUnits(onchain.paidOutRaw, decimals)
      );
      const realAvailableUsd = Math.max(0, totalEarnedUsd - paidOutUsd);

      if (realAvailableUsd <= 0) {
        alert("Nothing available to claim.");
        return;
      }

      const ok = confirm(
        `Claim ${realAvailableUsd.toFixed(2)} MNEE to your creator wallet?`
      );
      if (!ok) return;

      const sigResult = await verifySignatureForAction("claim", pactIdStr);
      if (!sigResult) return;

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

      // Get backend payout signature (TOTAL earned, not delta)
      const payoutUrl = withEnv(
        `${API_BASE}/api/pacts/${encodeURIComponent(pactIdStr)}/payout-sig`
      );
      const sigRes = await fetch(payoutUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          totalEarnedUsd,
          tokenDecimals: decimals,
          escrowAddress: PACT_ESCROW_ADDRESS,
          chainId: 11155111,
          signature: sigResult.signature,
          message: sigResult.message,
        }),
      });

      const sigData = await sigRes.json().catch(() => ({}));
      if (!sigRes.ok || !sigData.ok) {
        throw new Error(sigData?.error || "Failed to fetch payout signature");
      }

      const escrow = new ethers.Contract(
        PACT_ESCROW_ADDRESS,
        PactEscrowABI,
        signer
      );
      const tx = await escrow.payoutWithSig(
        pactIdNum,
        BigInt(sigData.totalEarnedRaw),
        sigData.expiry,
        sigData.sig
      );
      await tx.wait();

      document.getElementById("ap-available").innerText = "0.00";
      alert("✅ Claimed successfully!");

      // refresh pact cache
      p = await fetchLatestPact(pactIdStr);
    } catch (e) {
      alert(`Claim failed:\n\n${e?.shortMessage || e?.message || e}`);
    } finally {
      claimBtn.disabled = false;
    }
  };

  // Archive button (only once, only if completed)
  setTimeout(async () => {
    const completed = await isPactCompleted(p);
    if (!completed) return;
    if (document.getElementById("ap-archive")) return;

    const archiveBtn = document.createElement("button");
    archiveBtn.id = "ap-archive";
    archiveBtn.type = "button";
    archiveBtn.innerText = "Archive";
    archiveBtn.style.display = "block";
    archiveBtn.style.marginTop = "12px";
    archiveBtn.style.background = "#546E7A";
    archiveBtn.style.color = "white";
    archiveBtn.style.padding = "8px 14px";
    archiveBtn.style.borderRadius = "8px";
    archiveBtn.style.border = "none";
    archiveBtn.style.cursor = "pointer";

    archiveBtn.onclick = async () => {
      const ok = confirm(
        "Archive this completed pact?\n\nThis will move it to the Archive section."
      );
      if (!ok) return;

      const sigResult = await verifySignatureForAction("archive", pactIdStr);
      if (!sigResult) return;

      archiveBtn.disabled = true;
      archiveBtn.style.opacity = "0.7";
      archiveBtn.style.cursor = "not-allowed";

      try {
        const url = withEnv(
          `${API_BASE}/api/pacts/${encodeURIComponent(
            pactIdStr
          )}/archive?address=${encodeURIComponent(address)}`
        );
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signature: sigResult.signature,
            message: sigResult.message,
          }),
        });

        const out = await resp.json().catch(() => ({}));
        if (!resp.ok || !out.ok) {
          alert(out?.error || "Failed to archive pact");
          archiveBtn.disabled = false;
          archiveBtn.style.opacity = "1";
          archiveBtn.style.cursor = "pointer";
          return;
        }

        alert("✅ Pact archived successfully!");
        localStorage.setItem("pactsNeedsRefresh", "1");
        window.location.assign("./pacts-dashboard.html");
      } catch {
        alert("Archive failed (backend not reachable).");
        archiveBtn.disabled = false;
        archiveBtn.style.opacity = "1";
        archiveBtn.style.cursor = "pointer";
      }
    };

    controls.appendChild(archiveBtn);
  }, 800);
}

// --------------------
// Input Video Link button (ONLY creator, ONLY created mode, ONLY when not set)
// --------------------
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

    const platformCheck = isCountableVideoLink(trimmed);
    if (!platformCheck.valid) return alert(platformCheck.error);

    const sigResult = await verifySignatureForAction(
      "input_video_link",
      pactIdStr
    );
    if (!sigResult) return;

    videoBtn.disabled = true;

    try {
      const url = withEnv(
        `${API_BASE}/api/pacts/${encodeURIComponent(pactIdStr)}/video-link`
      );
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          videoLink: trimmed,
          signature: sigResult.signature,
          message: sigResult.message,
        }),
      });

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

// --------------------
// Approve + Fund button (ONLY sponsor, ONLY created mode, ONLY if video_link set)
// --------------------
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
    if (!window.ethereum) {
      alert("MetaMask not found.");
      return;
    }

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

    const browserProvider = new ethers.BrowserProvider(window.ethereum);

    // ensure Sepolia
    const net = await browserProvider.getNetwork();
    if (Number(net.chainId) !== 11155111) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }],
        });
        alert(
          "Switched to Sepolia. Page will reload — click Approve and Fund again."
        );
        window.location.reload();
        return;
      } catch {
        alert("Please switch MetaMask to Sepolia and try again.");
        return;
      }
    }

    // Balance check
    const ERC20_READ_ABI = [
      "function balanceOf(address) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ];
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
        `Insufficient MNEE.\n\nYou have: ${have} MNEE\nYou need at least: ${need} MNEE\n\nGet more MNEE on Sepolia, then try again.`
      );
      return;
    }

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

    showSecondaryLoadingScreen(
      "Processing transaction... This may take a minute. Please wait."
    );
    try {
      const signer = await browserProvider.getSigner();
      const signerAddr = await signer.getAddress();
      if (normAddr(signerAddr) !== normAddr(address)) {
        alert(
          `MetaMask account mismatch.\n\nLogged in as: ${address}\nMetaMask is: ${signerAddr}\n\nSwitch accounts in MetaMask and try again.`
        );
        return;
      }

      const escrow = new ethers.Contract(
        PACT_ESCROW_ADDRESS,
        PactEscrowABI,
        signer
      );

      // If pact doesn't exist, create with backend signature
      let onchainSponsor = "0x0000000000000000000000000000000000000000";
      try {
        const on = await escrow.pacts(pactIdNum);
        onchainSponsor = String(on.sponsor);
      } catch {}

      const exists =
        onchainSponsor &&
        onchainSponsor !== "0x0000000000000000000000000000000000000000";
      if (!exists) {
        const createUrl = withEnv(
          `${API_BASE}/api/pacts/${encodeURIComponent(pactIdStr)}/create-sig`
        );
        const sigRes = await fetch(createUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            tokenDecimals: Number(decimals),
            escrowAddress: PACT_ESCROW_ADDRESS,
            chainId: 11155111,
          }),
        });

        const sigData = await sigRes.json().catch(() => ({}));
        if (!sigRes.ok || !sigData.ok)
          throw new Error(sigData?.error || "Failed to fetch create signature");

        const backendMax = BigInt(sigData.maxPayoutRaw);
        if (backendMax !== needRaw) {
          throw new Error(
            `Max payout mismatch.\nFrontend: ${needRaw}\nBackend: ${backendMax}`
          );
        }

        const txCreate = await escrow.createPactWithSig(
          sigData.sponsor,
          pactIdNum,
          sigData.creator,
          backendMax,
          sigData.durationSeconds,
          sigData.expiry,
          sigData.sig
        );
        await txCreate.wait();
      }

      // Approve if needed
      const ERC20_ABI = [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
      ];
      const token = new ethers.Contract(mneeAddress, ERC20_ABI, signer);

      const allowance = await token.allowance(address, PACT_ESCROW_ADDRESS);
      if (allowance < needRaw) {
        const txApprove = await token.approve(PACT_ESCROW_ADDRESS, needRaw);
        await txApprove.wait();
      }

      // Validate on-chain state and sponsor
      const onchain = await escrow.pacts(pactIdNum);
      const chainSponsor = String(onchain.sponsor);
      const chainStatus = Number(onchain.status);
      const chainDeadline = Number(onchain.deadline);
      const now = Math.floor(Date.now() / 1000);

      if (chainSponsor === "0x0000000000000000000000000000000000000000") {
        throw new Error(
          "Pact does not exist on-chain. Please ensure creation succeeded."
        );
      }
      if (normAddr(chainSponsor) !== normAddr(address)) {
        throw new Error(
          `Pact sponsor mismatch. On-chain: ${chainSponsor}, Your address: ${address}`
        );
      }
      if (chainStatus !== 0) {
        const statusNames = ["Created", "Funded", "Closed"];
        throw new Error(
          `Pact is not in Created status. Current status: ${
            statusNames[chainStatus] || "Unknown"
          }`
        );
      }
      if (now > chainDeadline) {
        throw new Error(
          `Pact deadline has passed. Deadline: ${new Date(
            chainDeadline * 1000
          ).toLocaleString()}`
        );
      }

      // Fund
      const txFund = await escrow.fund(pactIdNum);
      await txFund.wait();

      // Mark DB pact as active
      const markUrl = withEnv(
        `${API_BASE}/api/pacts/${encodeURIComponent(pactIdStr)}/mark-active`
      );
      const markRes = await fetch(markUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const markData = await markRes.json().catch(() => ({}));
      if (!markRes.ok || !markData.ok) {
        throw new Error(
          markData?.error || "Funded on-chain, but failed to mark Active in DB"
        );
      }

      alert("✅ Pact created (if needed) + approved + funded successfully!");
      localStorage.setItem("pactsNeedsRefresh", "1");
      window.location.reload();
    } catch (e) {
      alert(`Approve/Fund failed:\n\n${e?.shortMessage || e?.message || e}`);
      fundBtn.disabled = false;
      fundBtn.style.opacity = "1";
      fundBtn.style.cursor = "pointer";
    } finally {
      hideSecondaryLoadingScreen();
    }
  };

  contentEl.appendChild(fundBtn);
}

// --------------------
// Negotiate / Accept (counterparty)
// --------------------
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
    const sigResult = await verifySignatureForAction("negotiate", pactIdStr);
    if (!sigResult) return;

    localStorage.setItem(
      `pactNegotiateSig:${address.toLowerCase()}:${pactIdStr}`,
      sigResult.signature
    );
    localStorage.setItem(
      `pactNegotiateMsg:${address.toLowerCase()}:${pactIdStr}`,
      sigResult.message
    );

    window.location.href = `./pactory.html?mode=negotiate&id=${encodeURIComponent(
      pactIdStr
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

    const sigResult = await verifySignatureForAction("accept", pactIdStr);
    if (!sigResult) return;

    acceptBtn.disabled = true;
    acceptBtn.style.opacity = "0.7";
    acceptBtn.style.cursor = "not-allowed";

    try {
      const url = withEnv(
        `${API_BASE}/api/pacts/${encodeURIComponent(pactIdStr)}/accept`
      );
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          signature: sigResult.signature,
          message: sigResult.message,
        }),
      });

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

// --------------------
// Delete / Reject (not for active pacts)
// --------------------
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

    const action = actionLabel === "Reject" ? "reject" : "delete";
    const sigResult = await verifySignatureForAction(action, pactIdStr);
    if (!sigResult) return;

    btn.disabled = true;
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";

    try {
      const endpoint =
        mode === "created"
          ? `${API_BASE}/api/pacts/${encodeURIComponent(
              pactIdStr
            )}/created?address=${encodeURIComponent(address)}`
          : `${API_BASE}/api/pacts/${encodeURIComponent(
              pactIdStr
            )}?address=${encodeURIComponent(address)}`;

      const delRes = await fetch(withEnv(endpoint), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: sigResult.signature,
          message: sigResult.message,
        }),
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
    } catch {
      alert("Request failed (backend not reachable).");
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
  };

  contentEl.appendChild(btn);
}
