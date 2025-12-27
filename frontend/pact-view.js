// Config
//const API_BASE = "https://backend-muddy-hill-3958.fly.dev";
const API_BASE = "http://localhost:3000";

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
contentEl.innerHTML = `
  <div style="border:1px solid #ddd; border-radius:10px; padding:12px;">
    <div><strong>Status:</strong> ${prettyStatus(p.status)}</div>
    <div><strong>Created:</strong> ${formatEastern(p.created_at)}</div>
    <div><strong>Sponsor:</strong> ${prettyAddr(p.sponsor_address)}</div>
    <div><strong>Creator:</strong> ${prettyAddr(p.creator_address)}</div>
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
  String(p.status) === "created";

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

  videoBtn.onclick = () => {
    // send them to your video link page (create this page next)
    window.location.href = `./video-link.html?id=${encodeURIComponent(id)}`;
  };

  contentEl.appendChild(videoBtn);
  

// --- Fund Pact button (ONLY sponsor, ONLY created) ---
const canFund =
  normAddr(address) === normAddr(p.sponsor_address) &&
  String(p.status) === "created";

if (canFund) {
  const fundBtn = document.createElement("button");
  fundBtn.type = "button";
  fundBtn.innerText = "Fund Pact";

  fundBtn.style.marginTop = "10px";
  fundBtn.style.marginLeft = "10px";
  fundBtn.style.background = "#1f7a1f";
  fundBtn.style.color = "white";
  fundBtn.style.padding = "8px 14px";
  fundBtn.style.borderRadius = "8px";
  fundBtn.style.border = "none";
  fundBtn.style.cursor = "pointer";

  fundBtn.onclick = async () => {
    const amt = prompt("Enter amount of MNEE to fund:");
    if (!amt || isNaN(amt) || Number(amt) <= 0) return;

    fundBtn.disabled = true;
    fundBtn.style.opacity = "0.7";

    try {
      if (!window.ethereum) throw new Error("MetaMask not found");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const mnee = new ethers.Contract(
        MNEE_ADDRESS,
        [
          "function approve(address,uint256) returns (bool)",
          "function decimals() view returns (uint8)"
        ],
        signer
      );

      const escrow = new ethers.Contract(
        PACT_ESCROW_ADDRESS,
        PactEscrowABI,
        signer
      );

      const decimals = await mnee.decimals();
      const wei = ethers.parseUnits(String(amt), decimals);

      // 1) approve
      const tx1 = await mnee.approve(PACT_ESCROW_ADDRESS, wei);
      await tx1.wait();

      // 2) fund
      const tx2 = await escrow.fund(p.id, wei);
      await tx2.wait();

      alert("Pact funded successfully");
      localStorage.setItem("pactsNeedsRefresh", "1");
      window.location.replace("./pacts-dashboard.html");
    } catch (e) {
      alert(e?.message || "Funding failed");
      fundBtn.disabled = false;
      fundBtn.style.opacity = "1";
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
}}
