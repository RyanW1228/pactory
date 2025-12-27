// server.js
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import { ethers } from "ethers";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", 1);

// --------------------
// ✅ CORS + Preflight (put BEFORE limiter + routes)
// --------------------
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
//app.options("/.*/", cors());

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
  replaces_pact_id INTEGER
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
    } else if (bucket === "created") {
      where += (where ? " AND " : "") + "status=?";
      params.push("created");
    } else if (status) {
      where += (where ? " AND " : "") + "status=?";
      params.push(String(status));
    }

    const rows = db
      .prepare(
        `SELECT id, name, created_at, sponsor_address, creator_address, status, proposer_address, proposer_role
         FROM pacts
         WHERE ${where}
         ORDER BY id DESC
         LIMIT 100`
      )
      .all(...params);

    res.json({ ok: true, rows });
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

    const replaced =
      row.replaces_pact_id != null
        ? db.prepare(`SELECT * FROM pacts WHERE id=?`).get(row.replaces_pact_id)
        : null;

    res.json({
      ok: true,
      pact: {
        ...row,
        progress_milestones: JSON.parse(row.progress_json || "[]"),
        aon_rewards: JSON.parse(row.aon_json || "[]"),
      },
      replaced_pact: replaced
        ? {
            ...replaced,
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
      throw new Error("Not authorized to delete this pact");
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
