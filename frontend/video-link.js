import { ethers } from "./ethers-6.7.esm.min.js";

// Config
// const API_BASE = "https://backend-muddy-hill-3958.fly.dev";
const API_BASE = "http://localhost:3000";

// DOM
const backButton = document.getElementById("backButton");
const cancelButton = document.getElementById("cancelButton");
const saveButton = document.getElementById("saveButton");
const statusEl = document.getElementById("status");
const titleEl = document.getElementById("title");
const metaEl = document.getElementById("meta");
const videoLinkInput = document.getElementById("videoLinkInput");

// Session
const address = localStorage.getItem("address");
if (!address) window.location.href = "./index.html";

// Params
const params = new URLSearchParams(window.location.search);
const id = params.get("id");

if (!id) {
  alert("Missing pact id");
  window.location.href = "./pacts-dashboard.html";
}

function normAddr(a) {
  return String(a || "").toLowerCase();
}

function setStatus(msg, ok = false) {
  if (!statusEl) return;
  statusEl.classList.toggle("ok", !!ok);
  statusEl.innerText = msg || "";
}

function isProbablyUrl(s) {
  try {
    const u = new URL(String(s || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
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

backButton?.addEventListener("click", () => history.back());
cancelButton?.addEventListener("click", () => history.back());

async function loadPactOrThrow() {
  const res = await fetch(`${API_BASE}/api/pacts/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok)
    throw new Error(data?.error || "Failed to load pact");
  if (!data.pact) throw new Error("Missing pact in response");

  return data.pact;
}

// Init
let pact;
try {
  pact = await loadPactOrThrow();

  // Frontend guard: ONLY creator can access this page
  if (normAddr(pact.creator_address) !== normAddr(address)) {
    alert("Only the creator can input the video link.");
    window.location.href = "./pacts-dashboard.html";
  }

  if (String(pact.status) !== "created") {
    alert("This pact is not in Created status.");
    window.location.href = "./pacts-dashboard.html";
  }

  titleEl.innerText = pact?.name?.trim() ? pact.name : `Pact #${pact.id}`;
  metaEl.innerText = `Creator: ${pact.creator_address} • Sponsor: ${pact.sponsor_address}`;

  // If you add video_link to backend later, we’ll prefill it here:
  // videoLinkInput.value = pact.video_link || "";
} catch (e) {
  alert(e?.message || "Failed to load pact");
  window.location.href = "./pacts-dashboard.html";
}

// Save handler (backend route coming next)
saveButton?.addEventListener("click", async () => {
  setStatus("");

  const link = String(videoLinkInput?.value || "").trim();
  if (!link) return setStatus("Please paste a video link.");
  if (!isProbablyUrl(link))
    return setStatus("Please enter a valid URL (https://...)");
  
  // Validate platform support
  const platformCheck = isValidVideoPlatform(link);
  if (!platformCheck.valid) {
    return setStatus(platformCheck.error);
  }

  // lock UI
  saveButton.disabled = true;
  saveButton.style.opacity = "0.7";
  saveButton.style.cursor = "not-allowed";

  try {
    // NOTE: We haven’t added this endpoint yet.
    // Next step we’ll implement: POST /api/pacts/:id/video-link
    const res = await fetch(
      `${API_BASE}/api/pacts/${encodeURIComponent(id)}/video-link`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, videoLink: link }),
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      return setStatus(data?.error || `Save failed (HTTP ${res.status}).`);
    }

    setStatus("✓ Saved video link.", true);

    // make dashboard refresh when user goes back
    localStorage.setItem("pactsNeedsRefresh", "1");

    // go back to pact view
    window.location.replace(
      `./pact-view.html?id=${encodeURIComponent(id)}&mode=created`
    );
  } catch (e) {
    setStatus("Backend not reachable.");
  } finally {
    saveButton.disabled = false;
    saveButton.style.opacity = "1";
    saveButton.style.cursor = "pointer";
  }
});
