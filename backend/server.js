import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import { ethers } from "ethers";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const dbPath = process.env.DB_PATH || "./pacts.db";
const db = new Database(dbPath);

// --- schema ---
db.exec(`
CREATE TABLE IF NOT EXISTS pacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- ✅ shared canonical name for both parties
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

  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pacts_status ON pacts(status);
CREATE INDEX IF NOT EXISTS idx_pacts_sponsor ON pacts(sponsor_address);
CREATE INDEX IF NOT EXISTS idx_pacts_creator ON pacts(creator_address);
`);

// --- migration: add name column for existing DBs ---
function hasColumn(table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => String(r.name).toLowerCase() === col.toLowerCase());
}
if (!hasColumn("pacts", "name")) {
  // SQLite supports ADD COLUMN, but not IF NOT EXISTS.
  db.exec(`ALTER TABLE pacts ADD COLUMN name TEXT`);
  // Backfill for existing rows so NOT NULL logic isn't needed for old entries
  db.exec(
    `UPDATE pacts SET name = 'Untitled Pact' WHERE name IS NULL OR TRIM(name) = ''`
  );
  // Optional: You can't easily add NOT NULL constraint after the fact in SQLite without rebuild.
  // We enforce name required at write-time below.
}

// --- helpers ---
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

// --- routes ---

// Create pact (Sent for Review)
app.post("/api/pacts", (req, res) => {
  try {
    const {
      name, // ✅ NEW
      proposerAddress,
      proposerRole, // 'sponsor' or 'creator'
      counterpartyAddress,
      durationSeconds,

      progressEnabled,
      progressLocked,
      progressMilestones, // array

      aonEnabled,
      aonLocked,
      aonRewards, // array

      message,
      signature,
    } = req.body;

    const pactName = requireName(name);

    // Basic validation
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
      !!progressEnabled &&
      Array.isArray(progressMilestones) &&
      progressMilestones.length > 0;
    const hasAon =
      !!aonEnabled && Array.isArray(aonRewards) && aonRewards.length > 0;
    if (!hasProgress && !hasAon)
      throw new Error("Must include at least one payment");

    // Ethereum verification (signature)
    verifySignatureOrThrow({ message, signature, expectedAddress: proposer });

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
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

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
      "sent_for_review"
    );

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

    res.json({
      ok: true,
      pact: {
        ...row,
        progress_milestones: JSON.parse(row.progress_json || "[]"),
        aon_rewards: JSON.parse(row.aon_json || "[]"),
      },
    });
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
app.listen(PORT, "0.0.0.0", () => console.log(`API running on port ${PORT}`));
