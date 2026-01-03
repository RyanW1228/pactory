import { ethers } from "./ethers-6.7.esm.min.js";
import {
  getRPCUrl,
  getMNEEAddress,
  getEnvironment,
  getPactEscrowAddress,
} from "./constants.js";

import { PactEscrowABI } from "./pactEscrowAbi.js";

const ERC20ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

let provider, signer, escrow, mnee;
// Config
//const API_BASE = "https://backend-muddy-hill-3958.fly.dev";
const API_BASE = "http://localhost:3000";

// Session
const address = localStorage.getItem("address");
if (!address) window.location.href = "./index.html";

// ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const ENV = getEnvironment(); // "testing" | "production"

function withEnv(pathOrUrl) {
  const u = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl, API_BASE); // ✅ forces backend origin

  u.searchParams.set("env", getEnvironment());
  return u.toString();
}

// DOM
const homeButton = document.getElementById("homeButton");
const proposePactButton = document.getElementById("proposePactButton");

const currentViewSpan = document.getElementById("currentView");
const dashboardTitle = document.getElementById("dashboardTitle");
const sectionsContainer = document.getElementById("sectionsContainer");

const toggleViewButton = document.getElementById("toggleViewButton");
const mneeBalanceSpan = document.getElementById("mneeBalance");

// Sections
const SPONSOR_SECTIONS = [
  "Active",
  "Created — Requires Funding",
  "Created — Waiting for Video Link",
  "Awaiting Your Review",
  "Sent for Review",
  "Completed",
];

const CREATOR_SECTIONS = [
  "Active",
  "Created — Waiting for Funding",
  "Created — Requires Video Link",
  "Awaiting Your Review",
  "Sent for Review",
  "Completed",
];

// const pact = await escrow.pacts(pactId);

// console.log({
//   sponsor: pact.sponsor,
//   creator: pact.creator,
//   status: pact.status,
//   funded: pact.fundedAmount.toString()
// });

// View mode storage
function viewModeKey(addr) {
  return `pactViewMode:${addr.toLowerCase()}`;
}

function getViewMode() {
  return localStorage.getItem(viewModeKey(address)) || "sponsor";
}

// Helper function to format address with name
function formatAddressWithName(addr) {
  if (!addr) return addr;
  // Check if address has a saved name
  const nameKey = `addressName:${addr.toLowerCase()}`;
  const name = localStorage.getItem(nameKey);
  if (name) {
    return `${name} (${addr})`;
  }
  return addr;
}

async function setViewMode(mode) {
  localStorage.setItem(viewModeKey(address), mode);
  await refreshDashboard();
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

// Render static section containers
function renderSections(mode) {
  const sections = mode === "sponsor" ? SPONSOR_SECTIONS : CREATOR_SECTIONS;

  sectionsContainer.innerHTML = sections
    .map((title) => {
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return `
        <details class="section">
          <summary><strong>${title}</strong><span id="count-${id}" class="count-badge">(0)</span></summary>
          <div id="list-${id}" class="list">
            <p class="empty">No pacts yet.</p>
          </div>
        </details>
      `;
    })
    .join("");
}

async function refreshDashboard() {
  const mode = getViewMode();

  // keep the UI labels in sync without re-rendering everything twice
  dashboardTitle.innerText =
    mode === "sponsor" ? "Your Sponsor Pacts" : "Your Creator Pacts";
  currentViewSpan.innerText = mode === "sponsor" ? "Sponsor" : "Creator";

  // Update toggle state: checked = creator, unchecked = sponsor
  if (toggleViewButton) {
    toggleViewButton.checked = mode === "creator";
  }

  renderSections(mode);

  // load everything (including Active)
  await Promise.all([
    loadActive(mode),
    loadSentForReview(mode),
    loadAwaitingYourReview(mode),
    loadCreated(mode),
    loadArchive(mode),
  ]);
}

async function refreshIfNeeded() {
  if (localStorage.getItem("pactsNeedsRefresh") === "1") {
    localStorage.removeItem("pactsNeedsRefresh");
    await refreshDashboard();
  }
}

function attachManageHandler(listEl) {
  if (!listEl) return;

  listEl.onclick = async (e) => {
    // 1) Delete (created)
    const delBtn = e.target.closest("[data-delete-created]");
    if (delBtn) {
      const pactId = delBtn.getAttribute("data-delete-created");
      if (!pactId) return;

      const ok = confirm("Delete this pact?\n\nThis cannot be undone.");
      if (!ok) return;

      delBtn.disabled = true;
      delBtn.style.opacity = "0.7";
      delBtn.style.cursor = "not-allowed";

      try {
        const url = withEnv(
          `${API_BASE}/api/pacts/${encodeURIComponent(
            pactId
          )}/created?address=${encodeURIComponent(address)}`
        );
        const resp = await fetch(url, { method: "DELETE" });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
          alert(data?.error || "Failed to delete pact");
          delBtn.disabled = false;
          delBtn.style.opacity = "1";
          delBtn.style.cursor = "pointer";
          return;
        }

        // refresh dashboard
        localStorage.setItem("pactsNeedsRefresh", "1");
        await refreshDashboard();
      } catch (err) {
        alert("Delete failed (backend not reachable).");
        delBtn.disabled = false;
        delBtn.style.opacity = "1";
        delBtn.style.cursor = "pointer";
      }
      return;
    }

    // 1b) Delete (archive)
    const delArchiveBtn = e.target.closest("[data-delete-archive]");
    if (delArchiveBtn) {
      const pactId = delArchiveBtn.getAttribute("data-delete-archive");
      if (!pactId) return;

      const ok = confirm(
        "Delete this archived pact?\n\nThis cannot be undone."
      );
      if (!ok) return;

      delArchiveBtn.disabled = true;
      delArchiveBtn.style.opacity = "0.7";
      delArchiveBtn.style.cursor = "not-allowed";

      try {
        const url = withEnv(
          `${API_BASE}/api/pacts/${encodeURIComponent(
            pactId
          )}/archive?address=${encodeURIComponent(address)}`
        );
        const resp = await fetch(url, { method: "DELETE" });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
          alert(data?.error || "Failed to delete pact");
          delArchiveBtn.disabled = false;
          delArchiveBtn.style.opacity = "1";
          delArchiveBtn.style.cursor = "pointer";
          return;
        }

        // refresh dashboard
        localStorage.setItem("pactsNeedsRefresh", "1");
        await refreshDashboard();
      } catch (err) {
        alert("Delete failed (backend not reachable).");
        delArchiveBtn.disabled = false;
        delArchiveBtn.style.opacity = "1";
        delArchiveBtn.style.cursor = "pointer";
      }
      return;
    }

    // 2) Open pact view
    const btn = e.target.closest("[data-open-pact]");
    if (!btn) return;

    const pactId = btn.getAttribute("data-open-pact");
    const m = btn.getAttribute("data-open-mode"); // "sent" | "awaiting" | "created"
    if (!pactId || !m) return;

    window.location.href = `./pact-view.html?id=${encodeURIComponent(
      pactId
    )}&mode=${encodeURIComponent(m)}`;
  };
}

function formatUsd(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return `$${x.toFixed(2)}`;
}

function maxPayoutLine(p) {
  // server should return max_payout_usd
  return `Max payout: ${formatUsd(p?.max_payout_usd)}`;
}

function displayPactTitle(p) {
  const n = String(p?.name || "").trim();
  return n ? n : `Pact #${p.id}`;
}

// Sent for Review (proposer)
async function loadSentForReview(mode) {
  const sectionId = "sent-for-review";
  const listEl = document.getElementById(`list-${sectionId}`);
  const countEl = document.getElementById(`count-${sectionId}`);
  if (!listEl || !countEl) return;

  attachManageHandler(listEl);

  try {
    const url = withEnv(
      `${API_BASE}/api/pacts?address=${encodeURIComponent(
        address
      )}&role=${encodeURIComponent(mode)}&bucket=sent_for_review`
    );

    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    countEl.innerText = `(${data?.rows?.length || 0})`;

    if (
      !res.ok ||
      !data.ok ||
      !Array.isArray(data.rows) ||
      data.rows.length === 0
    ) {
      listEl.innerHTML = `<p class="empty">No pacts yet.</p>`;
      return;
    }

    listEl.innerHTML = data.rows
      .map((p) => {
        const other =
          mode === "sponsor" ? p.creator_address : p.sponsor_address;

        return `
          <div style="padding:10px; border:1px solid #ddd; border-radius:10px; margin:8px 0;">
            <div style="font-weight:600;">${displayPactTitle(p)}</div>
            <div style="font-size:12px; opacity:0.8;">Other party: ${formatAddressWithName(
              other
            )}</div>
            <div style="font-size:12px; opacity:0.8;">${maxPayoutLine(p)}</div>
            <div style="font-size:12px; opacity:0.8;">Created: ${formatEastern(
              p.created_at
            )}</div>
            <button type="button" data-open-pact="${
              p.id
            }" data-open-mode="sent" style="margin-top:8px;">
              Manage
            </button>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.log("Sent for Review load failed:", e);
    countEl.innerText = "(0)";
    listEl.innerHTML = `<p class="empty">Failed to load.</p>`;
  }
}

async function loadActive(mode) {
  const sectionId = "active";
  const listEl = document.getElementById(`list-${sectionId}`);
  const countEl = document.getElementById(`count-${sectionId}`);
  if (!listEl || !countEl) return;

  attachManageHandler(listEl);

  try {
    const url = withEnv(
      `${API_BASE}/api/pacts?address=${encodeURIComponent(
        address
      )}&role=${encodeURIComponent(mode)}&status=active`
    );

    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    countEl.innerText = `(${data?.rows?.length || 0})`;

    if (
      !res.ok ||
      !data.ok ||
      !Array.isArray(data.rows) ||
      data.rows.length === 0
    ) {
      listEl.innerHTML = `<p class="empty">No active pacts yet.</p>`;
      return;
    }

    listEl.innerHTML = data.rows
      .map((p) => {
        const other =
          mode === "sponsor" ? p.creator_address : p.sponsor_address;

        return `
          <div style="padding:10px; border:1px solid #ddd; border-radius:10px; margin:8px 0;">
            <div style="font-weight:600;">${displayPactTitle(p)}</div>
            <div style="font-size:12px; opacity:0.8;">Other party: ${formatAddressWithName(
              other
            )}</div>
            <div style="font-size:12px; opacity:0.8;">${maxPayoutLine(p)}</div>
            <div style="font-size:12px; opacity:0.8;">Created: ${formatEastern(
              p.created_at
            )}</div>
            <div style="font-size:12px; opacity:0.8;">Start: ${formatEastern(
              p.active_started_at
            )}</div>
<div style="font-size:12px; opacity:0.8;">End: ${formatEastern(
          p.active_ends_at
        )}</div>

            <button type="button" data-open-pact="${
              p.id
            }" data-open-mode="created" style="margin-top:8px;">
              Manage
            </button>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.log("Active load failed:", e);
    countEl.innerText = "(0)";
    listEl.innerHTML = `<p class="empty">Failed to load.</p>`;
  }
}

// Awaiting Your Review (counterparty)
async function loadAwaitingYourReview(mode) {
  const sectionId = "awaiting-your-review";
  const listEl = document.getElementById(`list-${sectionId}`);
  const countEl = document.getElementById(`count-${sectionId}`);
  if (!listEl || !countEl) return;

  attachManageHandler(listEl);

  try {
    const url = withEnv(
      `${API_BASE}/api/pacts?address=${encodeURIComponent(
        address
      )}&role=${encodeURIComponent(mode)}&bucket=awaiting_your_review`
    );

    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    countEl.innerText = `(${data?.rows?.length || 0})`;

    if (
      !res.ok ||
      !data.ok ||
      !Array.isArray(data.rows) ||
      data.rows.length === 0
    ) {
      listEl.innerHTML = `<p class="empty">No pacts yet.</p>`;
      return;
    }

    listEl.innerHTML = data.rows
      .map((p) => {
        const other =
          mode === "sponsor" ? p.creator_address : p.sponsor_address;

        return `
          <div style="padding:10px; border:1px solid #ddd; border-radius:10px; margin:8px 0;">
            <div style="font-weight:600;">${displayPactTitle(p)}</div>
            <div style="font-size:12px; opacity:0.8;">Other party: ${formatAddressWithName(
              other
            )}</div>
            <div style="font-size:12px; opacity:0.8;">${maxPayoutLine(p)}</div>
            <div style="font-size:12px; opacity:0.8;">Created: ${formatEastern(
              p.created_at
            )}</div>
            <button type="button" data-open-pact="${
              p.id
            }" data-open-mode="awaiting" style="margin-top:8px;">
              Manage
            </button>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.log("Awaiting Your Review load failed:", e);
    countEl.innerText = "(0)";
    listEl.innerHTML = `<p class="empty">Failed to load.</p>`;
  }
}

// Created (both parties)
// Sponsor section id: "created"
// Creator section id: "created-requires-video-link"
// Created (split into two sections based on video_link)
// Sponsor:
//   - Created — Requires Funding        (video_link present)
//   - Created — Waiting for Video Link  (video_link missing)
//
// Creator:
//   - Created — Waiting for Funding     (video_link present)
//   - Created — Requires Video Link     (video_link missing)
// Created (split into 2 buckets by video_link)
async function loadCreated(mode) {
  // Sponsor has:
  //  - Created — Requires Funding
  //  - Created — Waiting for Video Link
  //
  // Creator has:
  //  - Created — Waiting for Funding
  //  - Created — Requires Video Link

  const targets =
    mode === "sponsor"
      ? [
          // sponsor: funding required once link exists
          {
            sectionId: "created-requires-funding",
            bucket: "created_requires_funding",
            openMode: "created",
          },
          // sponsor: waiting for creator to add link
          {
            sectionId: "created-waiting-for-video-link",
            bucket: "created_requires_video_link",
            openMode: "created",
          },
        ]
      : [
          // creator: waiting for sponsor to fund once link exists
          {
            sectionId: "created-waiting-for-funding",
            bucket: "created_requires_funding",
            openMode: "created",
          },
          // creator: creator must add link
          {
            sectionId: "created-requires-video-link",
            bucket: "created_requires_video_link",
            openMode: "created",
          },
        ];

  for (const t of targets) {
    const listEl = document.getElementById(`list-${t.sectionId}`);
    const countEl = document.getElementById(`count-${t.sectionId}`);
    if (!listEl || !countEl) continue;

    attachManageHandler(listEl);

    try {
      const url = withEnv(
        `${API_BASE}/api/pacts?address=${encodeURIComponent(
          address
        )}&role=${encodeURIComponent(mode)}&bucket=${encodeURIComponent(
          t.bucket
        )}`
      );

      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));

      countEl.innerText = `(${data?.rows?.length || 0})`;

      if (
        !res.ok ||
        !data.ok ||
        !Array.isArray(data.rows) ||
        data.rows.length === 0
      ) {
        listEl.innerHTML = `<p class="empty">No pacts yet.</p>`;
        continue;
      }

      listEl.innerHTML = data.rows
        .map((p) => {
          const other =
            mode === "sponsor" ? p.creator_address : p.sponsor_address;

          return `
            <div style="padding:10px; border:1px solid #ddd; border-radius:10px; margin:8px 0;">
              <div style="font-weight:600;">${displayPactTitle(p)}</div>
              <div style="font-size:12px; opacity:0.8;">Other party: ${formatAddressWithName(
                other
              )}</div>
              <div style="font-size:12px; opacity:0.8;">${maxPayoutLine(
                p
              )}</div>
              <div style="font-size:12px; opacity:0.8;">Created: ${formatEastern(
                p.created_at
              )}</div>

              <button
                type="button"
                data-open-pact="${p.id}"
                data-open-mode="${t.openMode}"
                style="margin-top:8px;"
              >
                Manage
              </button>
            </div>
          `;
        })
        .join("");
    } catch (e) {
      console.log("Created load failed:", e);
      countEl.innerText = "(0)";
      listEl.innerHTML = `<p class="empty">Failed to load.</p>`;
    }
  }
}

// Archive
async function loadArchive(mode) {
  const sectionId = "archive";
  const listEl = document.getElementById(`list-${sectionId}`);
  const countEl = document.getElementById(`count-${sectionId}`);
  if (!listEl || !countEl) return;

  attachManageHandler(listEl);

  try {
    const url = withEnv(
      `${API_BASE}/api/pacts?address=${encodeURIComponent(
        address
      )}&role=${encodeURIComponent(mode)}&status=replaced`
    );

    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));

    countEl.innerText = `(${data?.rows?.length || 0})`;

    if (
      !res.ok ||
      !data.ok ||
      !Array.isArray(data.rows) ||
      data.rows.length === 0
    ) {
      listEl.innerHTML = `<p class="empty">No archived pacts yet.</p>`;
      return;
    }

    listEl.innerHTML = data.rows
      .map((p) => {
        const other =
          mode === "sponsor" ? p.creator_address : p.sponsor_address;

        return `
          <div style="padding:10px; border:1px solid #ddd; border-radius:10px; margin:8px 0;">
            <div style="font-weight:600;">${displayPactTitle(p)}</div>
            <div style="font-size:12px; opacity:0.8;">Other party: ${formatAddressWithName(
              other
            )}</div>
            <div style="font-size:12px; opacity:0.8;">${maxPayoutLine(p)}</div>
            <div style="font-size:12px; opacity:0.8;">Created: ${formatEastern(
              p.created_at
            )}</div>
            <div style="margin-top:8px; display:flex; gap:8px;">
              <button type="button" data-open-pact="${
                p.id
              }" data-open-mode="archive" style="margin-top:0;">
                View
              </button>
              <button type="button" data-delete-archive="${
                p.id
              }" style="margin-top:0; background:#D32F2F;">
                Delete
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.log("Archive load failed:", e);
    countEl.innerText = "(0)";
    listEl.innerHTML = `<p class="empty">Failed to load.</p>`;
  }
}

// Balance (optional / non-fatal)
async function loadMneeBalanceSafe() {
  if (!mneeBalanceSpan) return;

  try {
    const provider = new ethers.JsonRpcProvider(getRPCUrl());
    // Use current environment's MNEE address
    const mneeAddress = getMNEEAddress();
    const token = new ethers.Contract(mneeAddress, ERC20_ABI, provider);

    const [raw, decimals] = await Promise.all([
      token.balanceOf(address),
      token.decimals(),
    ]);

    mneeBalanceSpan.innerText = ethers.formatUnits(raw, decimals);
  } catch (e) {
    console.log("MNEE balance load failed:", e);
    mneeBalanceSpan.innerText = "-";
  }
}

async function initContracts() {
  if (!window.ethereum) {
    alert("MetaMask not found");
    return;
  }

  provider = new ethers.JsonRpcProvider(getRPCUrl());

  // read-only contracts (no signer)
  escrow = new ethers.Contract(getPactEscrowAddress(), PactEscrowABI, provider);
  mnee = new ethers.Contract(getMNEEAddress(), ERC20ABI, provider);

  // ✅ expose for debugging in DevTools
  window.provider = provider;
  window.escrow = escrow;
  window.mnee = mnee;

  console.log("✅ Dashboard contracts ready", {
    escrow: escrow.target,
    mnee: mnee.target,
  });
}

// Update MNEE label based on environment
function updateMneeLabel() {
  const env = getEnvironment();
  const mneeLabel = document.getElementById("mneeLabel");
  if (mneeLabel) {
    mneeLabel.textContent = env === "testing" ? "mMNEE" : "MNEE";
  }
}

// Init
async function init() {
  try {
    // Update MNEE label on page load
    updateMneeLabel();

    // Listen for environment changes
    window.addEventListener("storage", async (e) => {
      if (e.key === "pactory-environment") {
        updateMneeLabel();
        await initContracts();
        await loadMneeBalanceSafe();
        await refreshDashboard();
      }
    });

    homeButton?.addEventListener("click", () => {
      window.location.href = "./index.html";
    });

    proposePactButton?.addEventListener("click", () => {
      window.location.href = "./pactory.html";
    });

    // Initialize view switch modal
    const viewSwitchModal = document.getElementById("viewSwitchModal");
    const viewModalCancelBtn = document.getElementById("viewModalCancelBtn");
    const viewModalConfirmBtn = document.getElementById("viewModalConfirmBtn");
    const currentViewText = document.getElementById("currentViewText");
    const nextViewText = document.getElementById("nextViewText");

    function showViewSwitchModal(currentMode, nextMode) {
      if (!viewSwitchModal || !currentViewText || !nextViewText) {
        console.error("View switch modal elements not found");
        // Fallback: just switch without confirmation
        setViewMode(nextMode);
        return;
      }
      currentViewText.textContent =
        currentMode === "sponsor" ? "Sponsor" : "Creator";
      nextViewText.textContent = nextMode === "sponsor" ? "Sponsor" : "Creator";
      viewSwitchModal.classList.add("show");
      viewSwitchModal.style.display = "flex";
    }

    function hideViewSwitchModal() {
      if (viewSwitchModal) {
        viewSwitchModal.classList.remove("show");
        viewSwitchModal.style.display = "none";
      }
    }

    if (viewModalCancelBtn) {
      viewModalCancelBtn.onclick = () => {
        // Revert toggle if user cancels
        if (toggleViewButton) {
          const currentMode = getViewMode();
          toggleViewButton.checked = currentMode === "creator";
        }
        hideViewSwitchModal();
      };
    }

    if (viewSwitchModal) {
      viewSwitchModal.onclick = (e) => {
        if (e.target === viewSwitchModal) {
          // Revert toggle if user clicks outside modal to close
          if (toggleViewButton) {
            const currentMode = getViewMode();
            toggleViewButton.checked = currentMode === "creator";
          }
          hideViewSwitchModal();
        }
      };
    }

    if (viewModalConfirmBtn) {
      viewModalConfirmBtn.onclick = () => {
        const cur = getViewMode();
        const next = cur === "sponsor" ? "creator" : "sponsor";
        setViewMode(next);
        hideViewSwitchModal();
      };
    }

    // Handle toggle switch change event
    if (toggleViewButton) {
      toggleViewButton.onchange = () => {
        const cur = getViewMode();
        const next = toggleViewButton.checked ? "creator" : "sponsor";

        // If already in the target mode, revert the toggle
        if (next === cur) {
          toggleViewButton.checked = !toggleViewButton.checked;
          return;
        }

        showViewSwitchModal(cur, next);

        // If user cancels, revert the toggle
        // This is handled in hideViewSwitchModal or we need to track cancellation
      };
    }

    if (!localStorage.getItem(viewModeKey(address))) {
      localStorage.setItem(viewModeKey(address), "sponsor");
    }

    setViewMode(getViewMode());

    if (localStorage.getItem("pactsNeedsRefresh") === "1") {
      localStorage.removeItem("pactsNeedsRefresh");
      await refreshDashboard();
    }

    window.addEventListener("pageshow", async () => {
      try {
        // pageshow fires when coming back from browser back (bfcache)
        await refreshIfNeeded();
        // also refresh anyway to keep dashboard consistent
        await refreshDashboard();
      } catch (e) {
        console.log("pageshow refresh failed:", e);
      }
    });

    // also refresh when tab regains focus (covers cases pageshow doesn't)
    window.addEventListener("focus", async () => {
      try {
        await refreshIfNeeded();
      } catch (e) {
        console.log("focus refresh failed:", e);
      }
    });

    await loadMneeBalanceSafe();
  } catch (e) {
    console.error("Dashboard init crashed:", e);
    alert(`Dashboard JS crashed: ${e?.message || e}`);
  }
}

init();

window.addEventListener("load", async () => {
  try {
    await initContracts();
    // now safe to call escrow / mnee
    await refreshDashboard();
  } catch (e) {
    console.error("Init failed", e);
  }
});
