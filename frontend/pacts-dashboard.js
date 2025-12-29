import { ethers } from "./ethers-6.7.esm.min.js";
import { RPC_URL, MNEE_ADDRESS, PACT_ESCROW_ADDRESS } from "./constants.js";
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
  "Archive",
];

const CREATOR_SECTIONS = [
  "Active",
  "Created — Waiting for Funding",
  "Created — Requires Video Link",
  "Awaiting Your Review",
  "Sent for Review",
  "Archive",
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

function setViewMode(mode) {
  localStorage.setItem(viewModeKey(address), mode);

  if (mode === "sponsor") {
    dashboardTitle.innerText = "Your Sponsor Pacts";
    currentViewSpan.innerText = "Sponsor";
  } else {
    dashboardTitle.innerText = "Your Creator Pacts";
    currentViewSpan.innerText = "Creator";
  }

  renderSections(mode);

  // load sections that actually query backend
  loadSentForReview(mode);
  loadAwaitingYourReview(mode);
  loadCreated(mode);
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
          <summary><strong>${title}</strong> <span class="count-badge" id="count-${id}">(0)</span></summary>
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
  setViewMode(mode);
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
        const resp = await fetch(
          `${API_BASE}/api/pacts/${encodeURIComponent(
            pactId
          )}/created?address=${encodeURIComponent(address)}`,
          { method: "DELETE" }
        );

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
    const url = `${API_BASE}/api/pacts?address=${encodeURIComponent(
      address
    )}&role=${encodeURIComponent(mode)}&bucket=sent_for_review`;

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
          <div class="pact-card">
            <div class="pact-title">${displayPactTitle(p)}</div>
            <div class="pact-meta"><strong>Other party:</strong> ${other}</div>
            <div class="pact-meta"><strong>${maxPayoutLine(p)}</strong></div>
            <div class="pact-meta">Created: ${formatEastern(
              p.created_at
            )}</div>
            <button type="button" data-open-pact="${
              p.id
            }" data-open-mode="sent">
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

// Awaiting Your Review (counterparty)
async function loadAwaitingYourReview(mode) {
  const sectionId = "awaiting-your-review";
  const listEl = document.getElementById(`list-${sectionId}`);
  const countEl = document.getElementById(`count-${sectionId}`);
  if (!listEl || !countEl) return;

  attachManageHandler(listEl);

  try {
    const url = `${API_BASE}/api/pacts?address=${encodeURIComponent(
      address
    )}&role=${encodeURIComponent(mode)}&bucket=awaiting_your_review`;

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
          <div class="pact-card">
            <div class="pact-title">${displayPactTitle(p)}</div>
            <div class="pact-meta"><strong>Other party:</strong> ${other}</div>
            <div class="pact-meta"><strong>${maxPayoutLine(p)}</strong></div>
            <div class="pact-meta">Created: ${formatEastern(
              p.created_at
            )}</div>
            <button type="button" data-open-pact="${
              p.id
            }" data-open-mode="awaiting">
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
      const url = `${API_BASE}/api/pacts?address=${encodeURIComponent(
        address
      )}&role=${encodeURIComponent(mode)}&bucket=${encodeURIComponent(
        t.bucket
      )}`;

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
            <div class="pact-card">
              <div class="pact-title">${displayPactTitle(p)}</div>
              <div class="pact-meta"><strong>Other party:</strong> ${other}</div>
              <div class="pact-meta"><strong>${maxPayoutLine(
                p
              )}</strong></div>
              <div class="pact-meta">Created: ${formatEastern(
                p.created_at
              )}</div>

              <button
                type="button"
                data-open-pact="${p.id}"
                data-open-mode="${t.openMode}"
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

// Balance (optional / non-fatal)
async function loadMneeBalanceSafe() {
  if (!mneeBalanceSpan) return;

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const token = new ethers.Contract(MNEE_ADDRESS, ERC20_ABI, provider);

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

  provider = new ethers.JsonRpcProvider(RPC_URL);

  // read-only contracts (no signer)
  escrow = new ethers.Contract(PACT_ESCROW_ADDRESS, PactEscrowABI, provider);
  mnee = new ethers.Contract(MNEE_ADDRESS, ERC20ABI, provider);

  // ✅ expose for debugging in DevTools
  window.provider = provider;
  window.escrow = escrow;
  window.mnee = mnee;

  console.log("✅ Dashboard contracts ready", {
    escrow: escrow.target,
    mnee: mnee.target,
  });
}

// Init
async function init() {
  try {
    homeButton?.addEventListener("click", () => {
      window.location.href = "./index.html";
    });

    proposePactButton?.addEventListener("click", () => {
      window.location.href = "./pactory.html";
    });

    toggleViewButton?.addEventListener("click", () => {
      const cur = getViewMode();
      const next = cur === "sponsor" ? "creator" : "sponsor";
      setViewMode(next);
    });

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
        await refreshDashboard();
      } catch (e) {
        console.log("pageshow refresh failed:", e);
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
