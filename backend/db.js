// db.js
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./pacts.db";
const db = new Database(DB_PATH);

// Recommended for concurrency
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ✅ One single schema (MATCHES server.js)
db.exec(`
CREATE TABLE IF NOT EXISTS pacts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  environment TEXT NOT NULL,

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
  replaces_pact_id TEXT,

  video_link TEXT,
  active_started_at TEXT, 
  active_ends_at TEXT,

  cached_views INTEGER,
cached_unlocked REAL,
cached_unearned REAL,
cached_available REAL,
cached_stats_updated_at TEXT
);

CREATE TABLE IF NOT EXISTS video_stats (
  pact_id TEXT PRIMARY KEY REFERENCES pacts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  video_url TEXT NOT NULL,

  views INTEGER NOT NULL,
  likes INTEGER NOT NULL,
  comments INTEGER NOT NULL,

  last_checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pacts_status ON pacts(status);
CREATE INDEX IF NOT EXISTS idx_pacts_env ON pacts(environment);
CREATE INDEX IF NOT EXISTS idx_pacts_sponsor ON pacts(sponsor_address);
CREATE INDEX IF NOT EXISTS idx_pacts_creator ON pacts(creator_address);
CREATE INDEX IF NOT EXISTS idx_pacts_replaces ON pacts(replaces_pact_id);
`);

export default db;
