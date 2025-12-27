// Config
const API_BASE = "https://backend-muddy-hill-3958.fly.dev";

// DOM
const backButton = document.getElementById("backButton");
const titleEl = document.getElementById("title");
const contentEl = document.getElementById("content");

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
}
if (!id) {
  alert("Missing pact id");
  history.back();
}

// Helpers
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

// ✅ Title shows the DB name (shared across both parties/devices)
titleEl.innerText = String(p.name || "").trim() ? p.name : `Pact #${p.id}`;

// Render
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

// Action button
let actionLabel = null;
if (mode === "sent") actionLabel = "Delete Pact";
if (mode === "awaiting") actionLabel = "Reject Pact";

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
    const ok = confirm(
      actionLabel === "Delete Pact"
        ? "Are you sure you want to delete this pact?"
        : "Are you sure you want to reject this pact?"
    );
    if (!ok) return;

    btn.disabled = true;
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";

    try {
      const delRes = await fetch(
        `${API_BASE}/api/pacts/${encodeURIComponent(
          id
        )}?address=${encodeURIComponent(address)}`,
        { method: "DELETE" }
      );

      const delData = await delRes.json().catch(() => ({}));
      const err = String(delData?.error || "");
      const alreadyGone = err.toLowerCase().includes("not found");

      if ((!delRes.ok || !delData.ok) && !alreadyGone) {
        alert(delData?.error || "Failed to delete pact");
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        return;
      }

      localStorage.setItem("pactsNeedsRefresh", "1");
      window.location.replace("./pacts-dashboard.html");
    } catch (e) {
      alert("Delete failed (backend not reachable).");
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
  };

  contentEl.appendChild(btn);
}
