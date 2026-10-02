import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, "jts-monitor.db"));
// Configure SQLite for concurrent dashboard/worker access.
// Set the busy timeout first so SQLite waits for an existing lock.
db.pragma("busy_timeout = 5000");

try {
  db.pragma("journal_mode = WAL");
} catch (error: any) {
  // During `next build`, multiple workers can import this module
  // concurrently. Another process may already be enabling WAL.
  if (error?.code !== "SQLITE_BUSY") {
    throw error;
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  output TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS check_results(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  monitor TEXT NOT NULL,
  device TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  failure_stage TEXT,
  error TEXT DEFAULT '',
  screenshot TEXT,
  trace TEXT,
  video TEXT,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_check_results_run_id ON check_results(run_id);
CREATE INDEX IF NOT EXISTS idx_check_results_monitor_device ON check_results(monitor,device,id);
CREATE TABLE IF NOT EXISTS incidents(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  status TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alert_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS run_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'viewer',disabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS maintenance_windows(
  id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,created_by INTEGER,created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings(key,value) VALUES('interval_minutes','5');
INSERT OR IGNORE INTO settings(key,value) VALUES('failure_threshold','2');
INSERT OR IGNORE INTO settings(key,value) VALUES('retention_days','30');
INSERT OR IGNORE INTO settings(key,value) VALUES('alerts_enabled','0');
INSERT OR IGNORE INTO settings(key,value) VALUES('webhook_url','');
INSERT OR IGNORE INTO settings(key,value) VALUES('visual_enabled','1');
INSERT OR IGNORE INTO settings(key,value) VALUES('visual_threshold','5');
INSERT OR IGNORE INTO settings(key,value) VALUES('registration_enabled','1');
`);


function ensureColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("check_results", "diagnostics_json", "TEXT DEFAULT '{}'");
ensureColumn("check_results", "metrics_json", "TEXT DEFAULT '{}'");
ensureColumn("check_results", "visual_json", "TEXT DEFAULT '{}'");

export default db;
