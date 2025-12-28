// Config
//const API_BASE = "https://backend-muddy-hill-3958.fly.dev";
const API_BASE = "http://localhost:3000";

import { ethers } from "./ethers-6.7.esm.min.js";
import { RPC_URL, MNEE_ADDRESS, PACT_ESCROW_ADDRESS } from "./constants.js";
import { PactEscrowABI } from "./pactEscrowAbi.js";

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
backButton.onclick = () => history.back();

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

// Helpers
function normAddr(a) {
  return String(a || "").toLowerCase();
}

function prettyAddr(a) {
  return a;
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

  const token = new ethers.Contract(MNEE_ADDRESS, ERC20_ABI, provider);
  const [raw, decimals] = await Promise.all([
    token.balanceOf(userAddress),
    token.decimals(),
  ]);

  return { raw, decimals };
}

function renderPayments(label, enabled, items, isProgress) {
  if (!enabled) return `<div><strong>${label}:</strong> Disabled</div>`;
  if (!items || items.length === 0)
    return `<div><strong>${label}:</strong> None</div>`;

  const rows = items
    .map((x, i) => {
      const views = x.views;
      const payout = x.payout;
      return `<li>${isProgress ? "Milestone" : "Reward"} ${
        i + 1
      }: ${views} views → $${payout}</li>`;
    })
    .join("");

  return `<div style="margin-top:10px;"><strong>${label}:</strong><ul>${rows}</ul></div>`;
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

const p = data.pact;

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
      <div><strong>Sponsor:</strong> ${rp.sponsor_address}</div>
      <div><strong>Creator:</strong> ${rp.creator_address}</div>
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

contentEl.innerHTML = `
  <div style="border:1px solid #ddd; border-radius:10px; padding:12px;">
    <div><strong>Status:</strong> ${prettyStatus(p.status)}</div>
    <div><strong>Created:</strong> ${formatEastern(p.created_at)}</div>
    <div><strong>Sponsor:</strong> ${prettyAddr(p.sponsor_address)}</div>
    <div><strong>Creator:</strong> ${prettyAddr(p.creator_address)}</div>

    <div><strong>Max payout:</strong> $${
      Number.isFinite(maxPayout) ? maxPayout.toFixed(2) : "-"
    }</div>

    <div><strong>Video Link:</strong> ${
      String(p.video_link || "").trim()
        ? `<a href="${p.video_link}" target="_blank" rel="noopener noreferrer">${p.video_link}</a>`
        : `<span style="opacity:0.7;">(not set)</span>`
    }</div>

    <div><strong>Duration:</strong> ${formatDuration(p.duration_seconds)}</div>

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
`;

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

    videoBtn.disabled = true;

    try {
      const r = await fetch(
        `${API_BASE}/api/pacts/${encodeURIComponent(id)}/video-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, videoLink: trimmed }),
        }
      );

      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        videoBtn.disabled = false;
        return alert(d?.error || "Failed to save video link");
      }

      localStorage.setItem("pactsNeedsRefresh", "1");
      window.location.reload();
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
    // Must be MetaMask + sponsor
    if (!window.ethereum) {
      alert("MetaMask not found.");
      return;
    }

    // 1) compute required max payout (in MNEE terms)
    const required = maxPayoutMnee(p); // you already have this
    const link = String(p.video_link || "").trim();

    if (!Number.isFinite(required) || required <= 0) {
      alert("Cannot fund: pact has no valid payout amounts.");
      return;
    }

    const ok = confirm(
      `Before you approve and fund:\n\n` +
        `• Verify the video link:\n  ${link || "(missing)"}\n\n` +
        `• This will (1) create the on-chain pact if needed, (2) approve MNEE, (3) fund the pact.\n\n` +
        `Max funding required: ${required.toFixed(2)} MNEE\n\n` +
        `Continue?`
    );
    if (!ok) return;

    fundBtn.disabled = true;
    fundBtn.style.opacity = "0.7";
    fundBtn.style.cursor = "not-allowed";

    try {
      // 2) get signer (MetaMask)
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();

      const net = await browserProvider.getNetwork();
      if (Number(net.chainId) !== 11155111) {
        alert(
          "Wrong network in MetaMask. Please switch to Sepolia and try again."
        );
        fundBtn.disabled = false;
        fundBtn.style.opacity = "1";
        fundBtn.style.cursor = "pointer";
        return;
      }

      // sanity: make sure the connected wallet matches the logged-in address
      const signerAddr = await signer.getAddress();
      if (normAddr(signerAddr) !== normAddr(address)) {
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
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
      ];
      const token = new ethers.Contract(MNEE_ADDRESS, ERC20_ABI, signer);

      const decimals = await token.decimals();

      // IMPORTANT: your UI payouts are in dollars; treat as MNEE with 2dp display
      // convert to token base units using token decimals
      const needRaw = ethers.parseUnits(required.toFixed(2), decimals);

      // 3) make sure sponsor has enough
      const balRaw = await token.balanceOf(address);
      if (balRaw < needRaw) {
        const have = Number(ethers.formatUnits(balRaw, decimals));
        alert(
          `Insufficient MNEE.\n\n` +
            `You have: ${have.toFixed(4)} MNEE\n` +
            `You need at least: ${required.toFixed(2)} MNEE`
        );
        fundBtn.disabled = false;
        fundBtn.style.opacity = "1";
        fundBtn.style.cursor = "pointer";
        return;
      }

      // 4) create pact on-chain IF it doesn't exist yet
      //    (if it already exists, sponsor will be non-zero)
      let onchain = null;
      try {
        onchain = await escrow.pacts(id);
      } catch {
        // ignore; not fatal
      }

      const sponsorOnchain = onchain?.sponsor ? String(onchain.sponsor) : "";
      const exists =
        sponsorOnchain &&
        sponsorOnchain !== "0x0000000000000000000000000000000000000000";

      if (!exists) {
        // createPact(pactId, creator, maxPayoutRaw, durationSeconds)
        const txCreate = await escrow.createPact(
          id,
          p.creator_address,
          needRaw,
          p.duration_seconds
        );
        await txCreate.wait();
      }

      // 5) approve IF needed (avoid unnecessary tx)
      const allowance = await token.allowance(address, PACT_ESCROW_ADDRESS);
      if (allowance < needRaw) {
        const txApprove = await token.approve(PACT_ESCROW_ADDRESS, needRaw);
        await txApprove.wait();
      }

      // 6) fund(pactId) — contract pulls pact.maxPayout
      const txFund = await escrow.fund(id);
      await txFund.wait();

      alert("✅ Pact created (if needed) + approved + funded successfully!");

      // optional: refresh / mark needs refresh
      localStorage.setItem("pactsNeedsRefresh", "1");
      window.location.reload();
    } catch (e) {
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
  negotiateBtn.style.background = "#2c3e50";
  negotiateBtn.style.color = "white";
  negotiateBtn.style.padding = "8px 14px";
  negotiateBtn.style.borderRadius = "8px";
  negotiateBtn.style.border = "none";
  negotiateBtn.style.cursor = "pointer";

  negotiateBtn.onclick = () => {
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
  acceptBtn.style.background = "#1f7a1f";
  acceptBtn.style.color = "white";
  acceptBtn.style.padding = "8px 14px";
  acceptBtn.style.borderRadius = "8px";
  acceptBtn.style.border = "none";
  acceptBtn.style.cursor = "pointer";

  acceptBtn.onclick = async () => {
    const ok = confirm("Accept this pact? This will mark it as Created.");
    if (!ok) return;

    acceptBtn.disabled = true;
    acceptBtn.style.opacity = "0.7";
    acceptBtn.style.cursor = "not-allowed";

    try {
      const r = await fetch(
        `${API_BASE}/api/pacts/${encodeURIComponent(id)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
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
let actionLabel = null;
if (mode === "sent") actionLabel = "Delete";
if (mode === "awaiting") actionLabel = "Reject";
if (mode === "created") actionLabel = "Delete";

if (actionLabel) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerText = actionLabel;

  btn.style.marginTop = "16px";
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

      const delRes = await fetch(endpoint, { method: "DELETE" });
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
