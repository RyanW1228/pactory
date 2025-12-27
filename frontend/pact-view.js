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

// Render
titleEl.innerText = `Pact #${p.id}`;
contentEl.innerHTML = `
  <div style="border:1px solid #ddd; border-radius:10px; padding:12px;">
    <div><strong>Status:</strong> ${p.status}</div>
    <div><strong>Created:</strong> ${p.created_at}</div>
    <div><strong>Sponsor:</strong> ${prettyAddr(p.sponsor_address)}</div>
    <div><strong>Creator:</strong> ${prettyAddr(p.creator_address)}</div>
    <div><strong>Proposer role:</strong> ${p.proposer_role}</div>
    <div><strong>Proposer address:</strong> ${prettyAddr(
      p.proposer_address
    )}</div>
    <div><strong>Duration (seconds):</strong> ${p.duration_seconds}</div>

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

  <div style="margin-top:12px; font-size:12px; opacity:0.8;">
    View-only: editing will be added later.
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

      // If it's already gone, treat that as success for UX
      const err = String(delData?.error || "");
      const alreadyGone = err.toLowerCase().includes("not found");

      if ((!delRes.ok || !delData.ok) && !alreadyGone) {
        alert(delData?.error || "Failed to delete pact");
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        return;
      }

      // Always redirect back to dashboard and force refresh
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
