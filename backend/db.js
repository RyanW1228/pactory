// db.js
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./pacts.db";
const db = new Database(DB_PATH);

// Initialize database schema
db.exec(`
  PRAGMA journal_mode = WAL;

  -- Pacts table
  CREATE TABLE IF NOT EXISTS pacts (
    id TEXT PRIMARY KEY,
    creator_address TEXT NOT NULL,
    sponsor_address TEXT NOT NULL,
    status TEXT NOT NULL,
    terms_json TEXT NOT NULL,
    video_url TEXT,
    contract_address TEXT,
    chain_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_pacts_creator ON pacts(creator_address);
  CREATE INDEX IF NOT EXISTS idx_pacts_sponsor ON pacts(sponsor_address);

  -- Nonce challenges for wallet auth
  CREATE TABLE IF NOT EXISTS nonces (
    address TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  -- Active login sessions
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_address ON sessions(address);
`);

export default db;
