import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dir = process.env.DATA_DIR || '/data';
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'jts-monitor.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

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
CREATE TABLE IF NOT EXISTS run_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings(key,value) VALUES('interval_minutes','5');
INSERT OR IGNORE INTO settings(key,value) VALUES('failure_threshold','2');
INSERT OR IGNORE INTO settings(key,value) VALUES('retention_days','30');
`);

export default db;
