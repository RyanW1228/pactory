// server.js
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import { ethers } from "ethers";
import rateLimit from "express-rate-limit";
import "dotenv/config";

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
// DB
// --------------------
const dbPath = process.env.DB_PATH || "./pacts.db";
const db = new Database(dbPath);

// --- schema ---
db.exec(`
CREATE TABLE IF NOT EXISTS pacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  name TEXT NOT NULL,

  creator_address TEXT NOT NULL,
  sponsor_address TEXT NOT NULL,

  proposer_role TEXT NOT NULL CHECK (proposer_role IN ('sponsor','creator')),
  proposer_address TEXT NOT NULL,

  counterparty_address TEXT NOT NULL,

  duration_seconds INTEGER NOT NULL,

  progress_enabled INTEGER NOT NULL,
  progress_locked INTEGER NOT NULL,
  progress_json TEXT NOT NULL,

  aon_enabled INTEGER NOT NULL,
  aon_locked INTEGER NOT NULL,
  aon_json TEXT NOT NULL,

  status TEXT NOT NULL,
  replaces_pact_id INTEGER, 

  video_link TEXT
);

CREATE TABLE IF NOT EXISTS video_stats (
  pact_id INTEGER PRIMARY KEY REFERENCES pacts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  video_url TEXT NOT NULL,

  views INTEGER NOT NULL,
  likes INTEGER NOT NULL,
  comments INTEGER NOT NULL,

  last_checked_at TEXT NOT NULL
);



CREATE INDEX IF NOT EXISTS idx_pacts_status ON pacts(status);
CREATE INDEX IF NOT EXISTS idx_pacts_sponsor ON pacts(sponsor_address);
CREATE INDEX IF NOT EXISTS idx_pacts_creator ON pacts(creator_address);
`);

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
  db.exec(`ALTER TABLE pacts ADD COLUMN replaces_pact_id INTEGER`);
}

if (!hasColumn("pacts", "video_link")) {
  db.exec(`ALTER TABLE pacts ADD COLUMN video_link TEXT`);
}

// --------------------
// Helpers
// --------------------
function nowIso() {
  return new Date().toISOString();
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
  const res = await fetch(
    `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrls: [videoUrl],
        resultsPerPage: 1,
      }),
    }
  );

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("no data returned from Apify");
  }

  const v = data[0];

  return {
    views: v.playCount ?? 0,
    likes: v.diggCount ?? 0,
    comments: v.commentCount ?? 0,
  };
}

// double check math on this

function calculateUnlocked(pact, views) {
  let unlocked = 0;

  const progress = JSON.parse(pact.progress_json || "[]");
  const aon = JSON.parse(pact.aon_json || "[]");

  for (const m of progress) {
    if (views >= m.views) unlocked = Math.max(unlocked, m.payout);
  }

  for (const r of aon) {
    if (views >= r.views) unlocked += r.payout;
  }

  return unlocked;
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
      oldId = Number(replacesPactId);
      if (!Number.isInteger(oldId)) throw new Error("Invalid replacesPactId");

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

    const stmt = db.prepare(`
      INSERT INTO pacts (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const runTx = db.transaction(() => {
      const info = stmt.run(
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
    res.json({ ok: true, pactId: info.lastInsertRowid });
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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new Error("Invalid id");

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new Error("Invalid id");

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new Error("Invalid id");

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid pact id");

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new Error("Invalid pact id");

    const pact = db.prepare(`SELECT * FROM pacts WHERE id=?`).get(id);
    if (!pact) throw new Error("Pact not found");

    if (!pact.video_link) {
      throw new Error("No video link attached to pact");
    }

    const platform = (() => {
      const u = String(pact.video_link || "").toLowerCase();
      if (u.includes("tiktok.com")) return "tiktok";
      if (u.includes("instagram.com")) return "instagram";
      return "unknown";
    })();

    let stats;
    if (platform === "tiktok") {
      stats = await scrapeTikTokVideo(pact.video_link);
    } else {
      throw new Error("Instagram not wired yet");
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

    res.json({
      ok: true,
      platform,
      views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
      unlockedPayout: unlocked,
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Delete pact (only when status='created') — either party can delete
app.delete("/api/pacts/:id/created", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new Error("Invalid id");

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new Error("Invalid id");

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
