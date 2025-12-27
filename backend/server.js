// server.js
import express from "express";
import cors from "cors";
import { Database } from "@sqlitecloud/drivers";
import { ethers } from "ethers";

// ------------------
// App setup
// ------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ------------------
// Database (SQLiteCloud)
// ------------------
const db = new Database(
  "sqlitecloud://cteuqdjnvk.g6.sqlite.cloud:8860/pacts.db?apikey=XPV0ij4QGSNPQQMQroc9ZDd97sixQLYSWANqKGqXMx8"
);

// ------------------
// Init schema
// ------------------
async function initDB() {
  await db.sql`
    CREATE TABLE IF NOT EXISTS pacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

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
  `;

  await db.sql`
    CREATE INDEX IF NOT EXISTS idx_pacts_status ON pacts(status);
  `;
  await db.sql`
    CREATE INDEX IF NOT EXISTS idx_pacts_sponsor ON pacts(sponsor_address);
  `;
  await db.sql`
    CREATE INDEX IF NOT EXISTS idx_pacts_creator ON pacts(creator_address);
  `;

  console.log("✅ Database ready");
}

// ------------------
// Helpers
// ------------------
function nowIso() {
  return new Date().toISOString();
}

function normAddr(a) {
  return String(a || "").toLowerCase();
}

function requireAddress(a, label) {
  if (!ethers.isAddress(a)) {
    throw new Error(`Invalid ${label} address`);
  }
  return ethers.getAddress(a); // checksum
}

function verifySignatureOrThrow({ message, signature, expectedAddress }) {
  if (!message || !signature) throw new Error("Missing signature");

  const recovered = ethers.verifyMessage(message, signature);
  if (normAddr(recovered) !== normAddr(expectedAddress)) {
    throw new Error("Signature does not match proposer address");
  }
}

// ------------------
// Health check
// ------------------
app.get("/health", async (req, res) => {
  try {
    await db.sql`SELECT 1;`;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ------------------
// Create pact
// ------------------
app.post("/api/pacts", async (req, res) => {
  try {
    const {
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
    } = req.body;

    const proposer = requireAddress(proposerAddress, "proposer");
    const counterparty = requireAddress(counterpartyAddress, "counterparty");

    if (normAddr(proposer) === normAddr(counterparty)) {
      throw new Error("Counterparty cannot be your own address");
    }

    if (proposerRole !== "sponsor" && proposerRole !== "creator") {
      throw new Error("Invalid proposer role");
    }

    const dur = Number(durationSeconds);
    if (!Number.isInteger(dur) || dur <= 0) {
      throw new Error("Invalid duration");
    }

    if (progressEnabled && !progressLocked) {
      throw new Error("Progress Pay must be saved or disabled");
    }
    if (aonEnabled && !aonLocked) {
      throw new Error("All-or-Nothing Pay must be saved or disabled");
    }

    const hasProgress =
      progressEnabled &&
      Array.isArray(progressMilestones) &&
      progressMilestones.length > 0;

    const hasAon =
      aonEnabled && Array.isArray(aonRewards) && aonRewards.length > 0;

    if (!hasProgress && !hasAon) {
      throw new Error("Must include at least one payment");
    }

    verifySignatureOrThrow({
      message,
      signature,
      expectedAddress: proposer,
    });

    const sponsorAddress =
      proposerRole === "sponsor" ? proposer : counterparty;
    const creatorAddress =
      proposerRole === "creator" ? proposer : counterparty;

    const t = nowIso();

    await db.sql`
      INSERT INTO pacts (
        created_at, updated_at,
        creator_address, sponsor_address,
        proposer_role, proposer_address,
        counterparty_address,
        duration_seconds,
        progress_enabled, progress_locked, progress_json,
        aon_enabled, aon_locked, aon_json,
        status
      ) VALUES (
        ${t}, ${t},
        ${creatorAddress}, ${sponsorAddress},
        ${proposerRole}, ${proposer},
        ${counterparty},
        ${dur},
        ${progressEnabled ? 1 : 0},
        ${progressLocked ? 1 : 0},
        ${JSON.stringify(progressMilestones || [])},
        ${aonEnabled ? 1 : 0},
        ${aonLocked ? 1 : 0},
        ${JSON.stringify(aonRewards || [])},
        'sent_for_review'
      );
    `;

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ------------------
// List pacts
// ------------------
app.get("/api/pacts", async (req, res) => {
  try {
    const { address, role, bucket } = req.query;

    if (!address || !ethers.isAddress(address)) {
      throw new Error("Invalid address");
    }

    const addr = normAddr(address);

    let where = [];
    let params = [];

    if (role === "sponsor") {
      where.push("lower(sponsor_address) = ?");
      params.push(addr);
    } else if (role === "creator") {
      where.push("lower(creator_address) = ?");
      params.push(addr);
    } else {
      throw new Error("role must be sponsor or creator");
    }

    if (bucket === "sent_for_review") {
      where.push("status = 'sent_for_review'");
      where.push("lower(proposer_address) = ?");
      params.push(addr);
    } else if (bucket === "awaiting_your_review") {
      where.push("status = 'sent_for_review'");
      where.push("lower(proposer_address) <> ?");
      params.push(addr);
    }

    const sql = `
      SELECT id, created_at, sponsor_address, creator_address,
             status, proposer_address, proposer_role
      FROM pacts
      WHERE ${where.join(" AND ")}
      ORDER BY id DESC
      LIMIT 100
    `;

    const rows = await db.sql(sql, ...params);
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ------------------
// Get pact details
// ------------------
app.get("/api/pacts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new Error("Invalid id");

    const rows = await db.sql`SELECT * FROM pacts WHERE id = ${id};`;
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    const row = rows[0];
    res.json({
      ok: true,
      pact: {
        ...row,
        progress_milestones: JSON.parse(row.progress_json || "[]"),
        aon_rewards: JSON.parse(row.aon_json || "[]"),
      },
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ------------------
// Delete pact
// ------------------
app.delete("/api/pacts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { address } = req.query;

    if (!Number.isInteger(id)) throw new Error("Invalid id");
    if (!address || !ethers.isAddress(address)) {
      throw new Error("Invalid address");
    }

    const addr = normAddr(address);
    const rows = await db.sql`SELECT * FROM pacts WHERE id = ${id};`;

    if (!rows.length) throw new Error("Pact not found");

    const pact = rows[0];
    const isProposer = normAddr(pact.proposer_address) === addr;
    const isCounterparty = normAddr(pact.counterparty_address) === addr;

    if (!isProposer && !isCounterparty) {
      throw new Error("Not authorized");
    }

    if (pact.status !== "sent_for_review") {
      throw new Error("Pact can no longer be deleted");
    }

    await db.sql`DELETE FROM pacts WHERE id = ${id};`;
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ------------------
// Start server
// ------------------
initDB().then(() => {
  app.listen(3000, () => {
    console.log("🚀 API running at http://localhost:3000");
  });
});
