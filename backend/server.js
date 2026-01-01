// server.js
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import db from "./db.js";

const app = express();
app.set("trust proxy", 1);

//shivers
// Check for VERIFIER_PRIVATE_KEY
const privateKey = process.env.VERIFIER_PRIVATE_KEY;
if (!privateKey || privateKey === "[ REDACTED ]" || privateKey.trim() === "") {
  console.error("❌ ERROR: VERIFIER_PRIVATE_KEY is not set or is invalid!");
  console.error("Please set VERIFIER_PRIVATE_KEY in your .env file");
  console.error("Example: VERIFIER_PRIVATE_KEY=0x1234567890abcdef...");
  process.exit(1);
}

const verifierWallet = new ethers.Wallet(privateKey);
console.log("✅ Verifier address:", verifierWallet.address);

// --------------------
// ✅ CORS + Preflight (put BEFORE limiter + routes)
// --------------------
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

// --------------------
// ✅ Rate limit (skip OPTIONS so preflight never hangs)
// --------------------
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return globalLimiter(req, res, next);
});

// --------------------
// DB (single source of truth)
// --------------------

// --- migration helpers ---
function hasColumn(table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => String(r.name).toLowerCase() === col.toLowerCase());
}

if (!hasColumn("pacts", "name")) {
  db.exec(`ALTER TABLE pacts ADD COLUMN name TEXT`);
  db.exec(
    `UPDATE pacts SET name = 'Untitled Pact' WHERE name IS NULL OR TRIM(name) = ''`
  );
}

if (!hasColumn("pacts", "replaces_pact_id")) {
  db.exec(`ALTER TABLE pacts ADD COLUMN replaces_pact_id TEXT`);
}

if (!hasColumn("pacts", "video_link")) {
  db.exec(`ALTER TABLE pacts ADD COLUMN video_link TEXT`);
}

if (!hasColumn("pacts", "active_started_at")) {
  db.exec(`ALTER TABLE pacts ADD COLUMN active_started_at TEXT`);
}

if (!hasColumn("pacts", "active_ends_at")) {
  db.exec(`ALTER TABLE pacts ADD COLUMN active_ends_at TEXT`);
}

// --------------------
// Helpers
// --------------------
function nowIso() {
  return new Date().toISOString();
}

function newPactId() {
  // random 32 bytes -> uint256 decimal string
  return ethers.toBigInt(ethers.randomBytes(32)).toString();
}

function normAddr(a) {
  return String(a || "").toLowerCase();
}

function requireAddress(a, label) {
  if (!ethers.isAddress(a)) throw new Error(`Invalid ${label} address`);
  return ethers.getAddress(a); // checksum
}

function verifySignatureOrThrow({ message, signature, expectedAddress }) {
  if (!message || !signature) throw new Error("Missing signature");
  const recovered = ethers.verifyMessage(message, signature);
  if (normAddr(recovered) !== normAddr(expectedAddress)) {
    throw new Error("Signature does not match proposer address");
  }
}

function requireName(name) {
  const n = String(name || "").trim();
  if (!n) throw new Error("Pact name is required");
  if (n.length > 60) throw new Error("Pact name must be 60 characters or less");
  return n;
}

function requirePactIdString(id) {
  const s = String(id || "").trim();
  // uint256 decimal string (no signs, no decimals)
  if (!/^\d+$/.test(s)) throw new Error("Invalid id");
  return s;
}

function canonPayments(arr) {
  if (!Array.isArray(arr)) return [];
  // normalize types + remove junk + sort deterministically
  return arr
    .map((x) => ({
      views: Number(x?.views),
      payout: Number(x?.payout),
    }))
    .filter(
      (x) =>
        Number.isInteger(x.views) &&
        x.views > 0 &&
        Number.isFinite(x.payout) &&
        x.payout > 0
    )
    .sort((a, b) => a.views - b.views || a.payout - b.payout);
}

// ✅ max payout = max(progress total payout) + sum(all AON bonus payouts)
function computeMaxPayoutUsd(rowLike) {
  const progressEnabled =
    rowLike.progressEnabled != null
      ? !!rowLike.progressEnabled
      : !!rowLike.progress_enabled;

  const aonEnabled =
    rowLike.aonEnabled != null ? !!rowLike.aonEnabled : !!rowLike.aon_enabled;

  const progressArr = canonPayments(
    Array.isArray(rowLike.progressMilestones)
      ? rowLike.progressMilestones
      : JSON.parse(rowLike.progress_json || "[]")
  );

  const aonArr = canonPayments(
    Array.isArray(rowLike.aonRewards)
      ? rowLike.aonRewards
      : JSON.parse(rowLike.aon_json || "[]")
  );

  const progressMax =
    progressEnabled && progressArr.length
      ? Math.max(...progressArr.map((x) => x.payout))
      : 0;

  const aonMax =
    aonEnabled && aonArr.length ? aonArr.reduce((s, x) => s + x.payout, 0) : 0;

  return progressMax + aonMax;
}

function pactEquivalent(oldPactRow, incoming) {
  // Compare all the “meaningful” fields of a pact in negotiation mode
  const sameDuration =
    Number(oldPactRow.duration_seconds) === Number(incoming.durationSeconds);

  const sameProgressEnabled =
    Boolean(oldPactRow.progress_enabled) === Boolean(incoming.progressEnabled);
  const sameProgressLocked =
    Boolean(oldPactRow.progress_locked) === Boolean(incoming.progressLocked);

  const sameAonEnabled =
    Boolean(oldPactRow.aon_enabled) === Boolean(incoming.aonEnabled);
  const sameAonLocked =
    Boolean(oldPactRow.aon_locked) === Boolean(incoming.aonLocked);

  const oldProgress = canonPayments(
    JSON.parse(oldPactRow.progress_json || "[]")
  );
  const newProgress = canonPayments(incoming.progressMilestones || []);

  const oldAon = canonPayments(JSON.parse(oldPactRow.aon_json || "[]"));
  const newAon = canonPayments(incoming.aonRewards || []);

  const sameProgress =
    JSON.stringify(oldProgress) === JSON.stringify(newProgress);
  const sameAon = JSON.stringify(oldAon) === JSON.stringify(newAon);

  return (
    sameDuration &&
    sameProgressEnabled &&
    sameProgressLocked &&
    sameProgress &&
    sameAonEnabled &&
    sameAonLocked &&
    sameAon
  );
}

async function scrapeTikTokVideo(videoUrl) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is missing");

  const endpoint =
    "https://api.apify.com/v2/acts/clockworks~tiktok-video-scraper/run-sync-get-dataset-items";

  const res = await fetch(`${endpoint}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // ✅ correct input key for this actor
      postURLs: [videoUrl],
      resultsPerPage: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
    }),
  });

  // If Apify returns non-2xx, show the response text to debug quickly
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Apify HTTP ${res.status}: ${txt || res.statusText}`);
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    // helpful debug: Apify sometimes returns an empty dataset when URL is malformed/unreachable
    throw new Error("Apify returned 0 items (empty dataset)");
  }

  const v = data[0];

  return {
    views: Number(v.playCount ?? 0),
    likes: Number(v.diggCount ?? 0),
    comments: Number(v.commentCount ?? 0),
  };
}

async function scrapeInstagramVideo(videoUrl) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is missing");

  const endpoint =
    "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items";

  const res = await fetch(`${endpoint}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Instagram scraper expects startUrls array with objects containing url
      startUrls: [{ url: videoUrl }],
      resultsType: "posts",
      resultsLimit: 1,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Apify HTTP ${res.status}: ${txt || res.statusText}`);
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Apify returned 0 items (empty dataset)");
  }

  const v = data[0];

  return {
    views: Number(v.videoViewCount ?? v.playCount ?? v.videoPlayCount ?? 0),
    likes: Number(v.likesCount ?? v.likes ?? 0),
    comments: Number(v.commentsCount ?? v.comments ?? 0),
  };
}

async function scrapeYouTubeShortsVideo(videoUrl) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is missing");

  const endpoint =
    "https://api.apify.com/v2/acts/streamers~youtube-shorts-scraper/run-sync-get-dataset-items";

  // Extract video ID from YouTube URL if it's a full URL
  // YouTube URLs can be: https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID or https://www.youtube.com/shorts/VIDEO_ID
  let videoId = null;
  if (videoUrl.includes("youtube.com/shorts/")) {
    videoId = videoUrl.split("/shorts/")[1].split("?")[0];
  } else if (videoUrl.includes("youtube.com/watch?v=")) {
    videoId = videoUrl.split("v=")[1].split("&")[0];
  } else if (videoUrl.includes("youtu.be/")) {
    videoId = videoUrl.split("youtu.be/")[1].split("?")[0];
  }

  const res = await fetch(`${endpoint}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // YouTube Shorts scraper can accept video URLs directly
      startUrls: videoId ? [{ url: `https://www.youtube.com/watch?v=${videoId}` }] : [{ url: videoUrl }],
      maxShortsPerSearch: 1,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Apify HTTP ${res.status}: ${txt || res.statusText}`);
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Apify returned 0 items (empty dataset)");
  }

  const v = data[0];

  return {
    views: Number(v.viewCount ?? v.views ?? 0),
    likes: Number(v.likeCount ?? v.likes ?? 0),
    comments: Number(v.commentCount ?? v.comments ?? 0),
  };
}

// double check math on this

function canon(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((x) => ({ views: Number(x?.views), payout: Number(x?.payout) }))
    .filter(
      (x) =>
        Number.isInteger(x.views) &&
        x.views > 0 &&
        Number.isFinite(x.payout) &&
        x.payout > 0
    )
    .sort((a, b) => a.views - b.views);
}

function progressPayoutAtViewsFromRow(pactRow, x) {
  if (!pactRow.progress_enabled) return 0;

  const ms = canon(JSON.parse(pactRow.progress_json || "[]"));
  if (ms.length === 0) return 0;

  const views = Math.max(0, Number(x || 0));
  if (views <= 0) return 0;

  // if past last milestone -> last payout
  if (views >= ms[ms.length - 1].views) return ms[ms.length - 1].payout;

  // if before first milestone -> linear from 0 to first payout
  if (views <= ms[0].views) {
    return (views / ms[0].views) * ms[0].payout;
  }

  // between milestones -> interpolate
  for (let i = 1; i < ms.length; i++) {
    const a = ms[i - 1];
    const b = ms[i];
    if (views <= b.views) {
      const t = (views - a.views) / (b.views - a.views);
      return a.payout + t * (b.payout - a.payout);
    }
  }

  return ms[ms.length - 1].payout;
}

function aonBonusAtViewsFromRow(pactRow, x) {
  if (!pactRow.aon_enabled) return 0;

  const rewards = canon(JSON.parse(pactRow.aon_json || "[]"));
  const views = Math.max(0, Number(x || 0));

  let sum = 0;
  for (const r of rewards) {
    if (views >= r.views) sum += r.payout;
  }
  return sum;
}

function calculateUnlocked(pactRow, views) {
  return (
    progressPayoutAtViewsFromRow(pactRow, views) +
    aonBonusAtViewsFromRow(pactRow, views)
  );
}

// --------------------
// Routes
// --------------------

// Create pact (Sent for Review)
app.post("/api/pacts", (req, res) => {
  try {
    const {
      name,
      proposerAddress,
      proposerRole,
      counterpartyAddress,
      durationSeconds,

      progressEnabled,
      progressLocked,
      progressMilestones,

      aonEnabled,
      aonLocked,
      aonRewards,

      message,
      signature,

      replacesPactId,
    } = req.body;

    const pactName = requireName(name);

    const proposer = requireAddress(proposerAddress, "proposer");
    const counterparty = requireAddress(counterpartyAddress, "counterparty");

    if (normAddr(proposer) === normAddr(counterparty)) {
      throw new Error("Counterparty cannot be your own address");
    }

    if (proposerRole !== "sponsor" && proposerRole !== "creator") {
      throw new Error("Invalid proposer role");
    }

    const dur = Number(durationSeconds);
    if (!Number.isInteger(dur) || dur <= 0) throw new Error("Invalid duration");

    // must be disabled or locked
    if (progressEnabled && !progressLocked)
      throw new Error("Progress Pay must be saved or disabled");
    if (aonEnabled && !aonLocked)
      throw new Error("All-or-Nothing Pay must be saved or disabled");

    // must have at least one payment
    const hasProgress =
      !!progressEnabled && canonPayments(progressMilestones).length > 0;
    const hasAon = !!aonEnabled && canonPayments(aonRewards).length > 0;

    if (!hasProgress && !hasAon) {
      throw new Error("Must include at least one payment");
    }

    // Ethereum verification (signature)
    verifySignatureOrThrow({ message, signature, expectedAddress: proposer });

    let oldId = null;
    let oldPact = null;

    if (replacesPactId != null) {
      oldId = requirePactIdString(replacesPactId);
      oldPact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(oldId);

      if (!oldPact) throw new Error("Old pact not found");

      if (normAddr(oldPact.counterparty_address) !== normAddr(proposer)) {
        throw new Error("Not authorized to replace this pact");
      }

      if (oldPact.status !== "sent_for_review") {
        throw new Error("Old pact is not replaceable");
      }
    }

    // ✅ prevent no-op negotiation (only when replacing an existing pact)
    if (oldPact) {
      if (
        pactEquivalent(oldPact, {
          durationSeconds: dur,
          progressEnabled,
          progressLocked,
          progressMilestones,
          aonEnabled,
          aonLocked,
          aonRewards,
        })
      ) {
        throw new Error(
          "No changes detected — you must modify the pact before resubmitting."
        );
      }
    }

    // Determine sponsor/creator addresses from proposer role
    const sponsorAddress = proposerRole === "sponsor" ? proposer : counterparty;
    const creatorAddress = proposerRole === "creator" ? proposer : counterparty;

    const t = nowIso();
    const pactId = newPactId();

    const stmt = db.prepare(`
  INSERT INTO pacts (
    id,
    created_at, updated_at,
    name,
    creator_address, sponsor_address,
    proposer_role, proposer_address,
    counterparty_address,
    duration_seconds,
    progress_enabled, progress_locked, progress_json,
    aon_enabled, aon_locked, aon_json,
    status,
    replaces_pact_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

    const runTx = db.transaction(() => {
      const info = stmt.run(
        pactId, // ✅ NEW: this must be FIRST because your INSERT includes id
        t,
        t,
        pactName,
        creatorAddress,
        sponsorAddress,
        proposerRole,
        proposer,
        counterparty,
        dur,
        progressEnabled ? 1 : 0,
        progressLocked ? 1 : 0,
        JSON.stringify(progressMilestones || []),
        aonEnabled ? 1 : 0,
        aonLocked ? 1 : 0,
        JSON.stringify(aonRewards || []),
        "sent_for_review",
        oldId
      );

      if (oldId != null) {
        db.prepare(
          `UPDATE pacts
           SET status = 'replaced', updated_at = ?
           WHERE id = ?`
        ).run(t, oldId);
      }

      return info;
    });

    const info = runTx();
    res.json({ ok: true, pactId });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

// List pacts for dashboard sections
app.get("/api/pacts", (req, res) => {
  try {
    const { address, role, status, bucket } = req.query;

    if (!address || !ethers.isAddress(address))
      throw new Error("Invalid address");
    const addr = normAddr(address);

    let where = "";
    const params = [];

    // role filter (who the pact belongs to)
    if (role === "sponsor") {
      where += (where ? " AND " : "") + "lower(sponsor_address)=?";
      params.push(addr);
    } else if (role === "creator") {
      where += (where ? " AND " : "") + "lower(creator_address)=?";
      params.push(addr);
    } else {
      throw new Error("role must be sponsor or creator");
    }

    // bucket logic
    if (bucket === "sent_for_review") {
      where +=
        (where ? " AND " : "") + "status=? AND lower(proposer_address)=?";
      params.push("sent_for_review", addr);
    } else if (bucket === "awaiting_your_review") {
      where +=
        (where ? " AND " : "") + "status=? AND lower(proposer_address)<>?";
      params.push("sent_for_review", addr);
    } else if (bucket === "created_requires_video_link") {
      // created + no video link yet
      where +=
        (where ? " AND " : "") +
        "status=? AND (video_link IS NULL OR TRIM(video_link)='')";
      params.push("created");
    } else if (bucket === "created_requires_funding") {
      // created + video link present
      where +=
        (where ? " AND " : "") +
        "status=? AND (video_link IS NOT NULL AND TRIM(video_link)<> '')";
      params.push("created");
    } else if (bucket === "created") {
      // fallback (all created)
      where += (where ? " AND " : "") + "status=?";
      params.push("created");
    } else if (status) {
      where += (where ? " AND " : "") + "status=?";
      params.push(String(status));
    }

    const rows = db
      .prepare(
        `SELECT id, name, created_at, sponsor_address, creator_address, status,
        proposer_address, proposer_role, video_link,
        active_started_at, active_ends_at,
        progress_enabled, progress_json,
        aon_enabled, aon_json
         FROM pacts
         WHERE ${where}
         ORDER BY id DESC
         LIMIT 100`
      )
      .all(...params);

    const outRows = rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      sponsor_address: r.sponsor_address,
      creator_address: r.creator_address,
      status: r.status,
      proposer_address: r.proposer_address,
      proposer_role: r.proposer_role,
      video_link: r.video_link,
      active_started_at: r.active_started_at,
      active_ends_at: r.active_ends_at,
      max_payout_usd: computeMaxPayoutUsd(r),
    }));

    const withMax = rows.map((r) => ({
      ...r,
      max_payout_usd: computeMaxPayoutUsd(r),
    }));

    res.json({ ok: true, rows: outRows });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

// Read pact details (view-only page)
app.get("/api/pacts/:id", (req, res) => {
  try {
    const id = requirePactIdString(req.params.id);

    const row = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);

    if (!row) return res.status(404).json({ ok: false, error: "Not found" });

    const maxPayoutUsd = computeMaxPayoutUsd(row);

    const replaced =
      row.replaces_pact_id != null
        ? db.prepare(`SELECT * FROM pacts WHERE id=?`).get(row.replaces_pact_id)
        : null;

    res.json({
      ok: true,
      pact: {
        ...row,
        max_payout_usd: maxPayoutUsd,
        progress_milestones: JSON.parse(row.progress_json || "[]"),
        aon_rewards: JSON.parse(row.aon_json || "[]"),
        cached_views: row.cached_views,
        cached_unlocked: row.cached_unlocked,
        cached_unearned: row.cached_unearned,
        cached_available: row.cached_available,
        cached_stats_updated_at: row.cached_stats_updated_at,
      },
      replaced_pact: replaced
        ? {
            ...replaced,
            max_payout_usd: computeMaxPayoutUsd(replaced),
            progress_milestones: JSON.parse(replaced.progress_json || "[]"),
            aon_rewards: JSON.parse(replaced.aon_json || "[]"),
          }
        : null,
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

// Accept pact (counterparty approves -> moves to "created")
app.post("/api/pacts/:id/accept", (req, res) => {
  try {
    const id = requirePactIdString(req.params.id);

    const { address } = req.body || {};
    if (!address || !ethers.isAddress(address))
      throw new Error("Invalid address");

    const addr = normAddr(address);

    const pact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);
    if (!pact) throw new Error("Pact not found");

    // Must be awaiting review
    if (pact.status !== "sent_for_review") {
      throw new Error("Pact is not awaiting review");
    }

    // Only counterparty can accept
    if (normAddr(pact.counterparty_address) !== addr) {
      throw new Error("Not authorized to accept this pact");
    }

    // Extra guard: don't let proposer accept their own pact
    if (normAddr(pact.proposer_address) === addr) {
      throw new Error("Proposer cannot accept their own pact");
    }

    const t = nowIso();

    db.prepare(
      `UPDATE pacts
       SET status='created', updated_at=?
       WHERE id=? AND status='sent_for_review'`
    ).run(t, id);

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

// Set video link (ONLY creator, ONLY when status='created')
app.post("/api/pacts/:id/video-link", (req, res) => {
  try {
    const id = requirePactIdString(req.params.id);

    const { address, videoLink } = req.body || {};
    if (!address || !ethers.isAddress(address))
      throw new Error("Invalid address");

    const link = String(videoLink || "").trim();
    if (!link) throw new Error("Video link is required");
    if (link.length > 500) throw new Error("Video link too long");
    if (!/^https?:\/\/\S+$/i.test(link)) throw new Error("Invalid link format");

    const pact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);
    if (!pact) throw new Error("Pact not found");

    if (String(pact.status) !== "created") {
      throw new Error("Video link can only be set when pact is Created");
    }

    if (normAddr(pact.creator_address) !== normAddr(address)) {
      throw new Error("Only the creator can set the video link");
    }

    const t = nowIso();
    db.prepare(`UPDATE pacts SET video_link=?, updated_at=? WHERE id=?`).run(
      link,
      t,
      id
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

// Create on-chain createPactWithSig signature (ONLY sponsor should call this)
app.post("/api/pacts/:id/create-sig", async (req, res) => {
  try {
    const id = requirePactIdString(req.params.id);

    const { address, tokenDecimals, escrowAddress, chainId } = req.body || {};
    if (!address || !ethers.isAddress(address))
      throw new Error("Invalid address");

    const decimals = Number(tokenDecimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw new Error("Invalid tokenDecimals");
    }

    // ✅ validate escrowAddress
    if (!escrowAddress || !ethers.isAddress(escrowAddress)) {
      throw new Error("Missing escrowAddress");
    }
    const escrow = ethers.getAddress(escrowAddress);

    // ✅ validate chainId (must be Sepolia for your setup)
    const cid = Number(chainId);
    if (!Number.isInteger(cid)) throw new Error("Missing chainId");
    if (cid !== 11155111) throw new Error("Wrong chainId (expected Sepolia)");

    const addr = normAddr(address);

    const pact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);
    if (!pact) throw new Error("Pact not found");

    // must be sponsor
    if (normAddr(pact.sponsor_address) !== addr) {
      throw new Error("Only sponsor can create on-chain signature");
    }

    // your DB says "created" is the state prior to funding
    if (String(pact.status) !== "created") {
      throw new Error("Pact must be Created to sign on-chain creation");
    }

    // must have video link before sponsor funds (matches your UI rule)
    if (!String(pact.video_link || "").trim()) {
      throw new Error("Video link must be set before funding");
    }

    const maxUsd = computeMaxPayoutUsd(pact);
    if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
      throw new Error("Invalid max payout");
    }

    const cents = Math.round(maxUsd * 100);
    const maxPayoutRaw = ethers.parseUnits((cents / 100).toFixed(2), decimals);

    const durationSeconds = Number(pact.duration_seconds);
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Invalid duration");
    }

    const creator = requireAddress(pact.creator_address, "creator");
    const sponsor = requireAddress(pact.sponsor_address, "sponsor");

    // expiry (10 minutes)
    const expiry = Math.floor(Date.now() / 1000) + 10 * 60;

    const packedHash = ethers.solidityPackedKeccak256(
      [
        "uint256",
        "address",
        "address",
        "uint256",
        "address",
        "uint256",
        "uint256",
        "uint256",
      ],
      [
        cid, // ✅ was 11155111
        escrow,
        sponsor,
        id,
        creator,
        maxPayoutRaw,
        durationSeconds,
        expiry,
      ]
    );

    // Contract does toEthSignedMessageHash(packedHash), so backend must sign the 32-byte hash as a message.
    const sig = await verifierWallet.signMessage(ethers.getBytes(packedHash));

    res.json({
      ok: true,
      pactId: id,
      sponsor,
      creator,
      durationSeconds,
      maxPayoutRaw: maxPayoutRaw.toString(),
      expiry,
      sig,
      escrow,
      chainId: cid,
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

app.post("/api/pacts/:id/sync-views", async (req, res) => {
  try {
    const id = requirePactIdString(req.params.id);

    const pact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);
    if (!pact) throw new Error("Pact not found");

    // ✅ disallow syncing after deadline
    if (pact.active_ends_at) {
      const end = Date.parse(pact.active_ends_at);
      if (Number.isFinite(end) && Date.now() > end) {
        throw new Error("Pact expired");
      }
    }

    if (!pact.video_link) {
      throw new Error("No video link attached to pact");
    }

    const platform = (() => {
      const u = String(pact.video_link || "").toLowerCase();
      if (u.includes("tiktok.com")) return "tiktok";
      if (u.includes("instagram.com") || u.includes("instagr.am")) return "instagram";
      if (u.includes("youtube.com/shorts/") || (u.includes("youtube.com") && u.includes("shorts"))) return "youtube_shorts";
      if (u.includes("youtu.be/")) {
        // Could be a short, but we'll treat youtu.be links as potential shorts
        return "youtube_shorts";
      }
      return "unknown";
    })();

    let stats;
    if (platform === "tiktok") {
      stats = await scrapeTikTokVideo(pact.video_link);
    } else if (platform === "instagram") {
      stats = await scrapeInstagramVideo(pact.video_link);
    } else if (platform === "youtube_shorts") {
      stats = await scrapeYouTubeShortsVideo(pact.video_link);
    } else {
      throw new Error(`Unsupported platform. Supported platforms: TikTok, Instagram, YouTube Shorts`);
    }

    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO video_stats (
        pact_id, platform, video_url,
        views, likes, comments, last_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pact_id) DO UPDATE SET
        views=excluded.views,
        likes=excluded.likes,
        comments=excluded.comments,
        last_checked_at=excluded.last_checked_at
    `
    ).run(
      id,
      platform,
      pact.video_link,
      stats.views,
      stats.likes,
      stats.comments,
      now
    );

    const unlocked = calculateUnlocked(pact, stats.views);

    const max = computeMaxPayoutUsd(pact);
    const unearned = Math.max(0, max - unlocked);
    const available = unlocked; // subtract paidOut on frontend

    db.prepare(
      `
  UPDATE pacts
  SET
    cached_views=?,
    cached_unlocked=?,
    cached_unearned=?,
    cached_available=?,
    cached_stats_updated_at=?
  WHERE id=?
`
    ).run(stats.views, unlocked, unearned, available, now, id);

    res.json({
      ok: true,
      platform,
      views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
      unlockedPayout: unlocked,
      unearnedPayout: unearned,
      availablePayout: available, // backend definition: same as unlocked for now
      statsUpdatedAt: now,
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Delete pact (only when status='created') — either party can delete
app.delete("/api/pacts/:id/created", (req, res) => {
  try {
    const id = requirePactIdString(req.params.id);

    const { address } = req.query;
    if (!address || !ethers.isAddress(address))
      throw new Error("Invalid address");

    const addr = normAddr(address);

    const pact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);
    if (!pact) throw new Error("Pact not found");

    // Only allowed when created
    if (String(pact.status) !== "created") {
      throw new Error("Only created pacts can be deleted here");
    }

    // Either party can delete
    const isSponsor = normAddr(pact.sponsor_address) === addr;
    const isCreator = normAddr(pact.creator_address) === addr;

    if (!isSponsor && !isCreator) {
      throw new Error("Not authorized to delete this pact");
    }

    db.prepare(`DELETE FROM pacts WHERE id=?`).run(id);

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

// Delete (or reject) pact
app.delete("/api/pacts/:id", (req, res) => {
  try {
    const id = requirePactIdString(req.params.id);

    const { address } = req.query;
    if (!address || !ethers.isAddress(address))
      throw new Error("Invalid address");

    const addr = normAddr(address);

    const pact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);
    if (!pact) throw new Error("Pact not found");

    // Only proposer OR counterparty can delete/reject
    const isProposer = normAddr(pact.proposer_address) === addr;
    const isCounterparty = normAddr(pact.counterparty_address) === addr;

    if (!isProposer && !isCounterparty) {
      throw new Error("Not authorized to delete/reject this pact");
    }

    // Only allowed while sent_for_review
    if (pact.status !== "sent_for_review") {
      throw new Error("Pact can no longer be deleted");
    }

    db.prepare(`DELETE FROM pacts WHERE id=?`).run(id);

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

app.post("/api/pacts/:id/mark-active", (req, res) => {
  try {
    const id = requirePactIdString(req.params.id);

    const { address } = req.body || {};
    if (!address || !ethers.isAddress(address))
      throw new Error("Invalid address");

    const pact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);
    if (!pact) throw new Error("Pact not found");

    // only sponsor can mark active
    if (normAddr(pact.sponsor_address) !== normAddr(address)) {
      throw new Error("Only sponsor can mark pact active");
    }

    // only allow from created -> active
    if (String(pact.status) !== "created") {
      throw new Error("Pact must be Created to mark active");
    }

    const startIso = nowIso();
    const endIso = new Date(
      Date.now() + Number(pact.duration_seconds) * 1000
    ).toISOString();

    db.prepare(
      `
  UPDATE pacts
  SET status='active',
      active_started_at=?,
      active_ends_at=?,
      updated_at=?
  WHERE id=?
`
    ).run(startIso, endIso, startIso, id);

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

app.post("/api/pacts/:id/payout-sig", async (req, res) => {
  try {
    const id = requirePactIdString(req.params.id);

    const { address, totalEarnedUsd, tokenDecimals, escrowAddress, chainId } =
      req.body || {};
    if (!address || !ethers.isAddress(address))
      throw new Error("Invalid address");

    const pact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);
    if (!pact) throw new Error("Pact not found");

    // only creator can claim
    if (normAddr(pact.creator_address) !== normAddr(address)) {
      throw new Error("Only creator can claim");
    }

    const cid = Number(chainId);
    if (cid !== 11155111) throw new Error("Wrong chainId (expected Sepolia)");

    if (!escrowAddress || !ethers.isAddress(escrowAddress)) {
      throw new Error("Missing escrowAddress");
    }
    const escrow = ethers.getAddress(escrowAddress);

    const decimals = Number(tokenDecimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw new Error("Invalid tokenDecimals");
    }

    const earned = Number(totalEarnedUsd);
    if (!Number.isFinite(earned) || earned < 0)
      throw new Error("Invalid totalEarnedUsd");

    // convert to token units (2 decimals)
    const cents = Math.round(earned * 100);
    const totalEarnedRaw = ethers.parseUnits(
      (cents / 100).toFixed(2),
      decimals
    );

    // expiry (10 min)
    const expiry = Math.floor(Date.now() / 1000) + 10 * 60;

    // Must match contract digest: (chainid, this, pactId, totalEarned, expiry)
    const packedHash = ethers.solidityPackedKeccak256(
      ["uint256", "address", "uint256", "uint256", "uint256"],
      [cid, escrow, id, totalEarnedRaw, expiry]
    );

    const sig = await verifierWallet.signMessage(ethers.getBytes(packedHash));

    res.json({
      ok: true,
      pactId: id,
      totalEarnedRaw: totalEarnedRaw.toString(),
      expiry,
      sig,
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || "Bad request" });
  }
});

app.get("/api/health/db", (req, res) => {
  try {
    const row = db.prepare("SELECT 1 AS ok").get();
    res.json({ ok: true, db: row.ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
