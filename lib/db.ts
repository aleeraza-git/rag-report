import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "rag.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS facility_state (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_stats (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS downtime_log (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_log_updated ON activity_log(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_downtime_log_updated ON downtime_log(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tickets_updated ON tickets(updated_at DESC);
  `);
  return _db;
}

type Row = { id: string; data: unknown; updated_at: string };

export function upsert(table: string, id: string, data: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO ${table} (id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(id, JSON.stringify(data), new Date().toISOString());
}

export function getAllRows(table: string): Row[] {
  return (getDb().prepare(`SELECT id, data, updated_at FROM ${table}`).all() as any[]).map(
    (r) => ({ id: r.id, data: JSON.parse(r.data), updated_at: r.updated_at })
  );
}

export function getOrderedRows(table: string, limit: number): Row[] {
  return (
    getDb()
      .prepare(`SELECT id, data, updated_at FROM ${table} ORDER BY updated_at DESC LIMIT ?`)
      .all(limit) as any[]
  ).map((r) => ({ id: r.id, data: JSON.parse(r.data), updated_at: r.updated_at }));
}

/**
 * Rows written at or after `sinceIso`, newest first.
 *
 * Reporting needs history by TIME, not by row count: a fixed "last N rows" cap
 * silently truncates the oldest events in a long window, which would make a
 * 30-day report quietly incomplete. Uses idx_<table>_updated.
 */
export function getRowsSince(table: string, sinceIso: string, limit = 50000): Row[] {
  return (
    getDb()
      .prepare(
        `SELECT id, data, updated_at FROM ${table}
         WHERE updated_at >= ? ORDER BY updated_at DESC LIMIT ?`
      )
      .all(sinceIso, limit) as any[]
  ).map((r) => ({ id: r.id, data: JSON.parse(r.data), updated_at: r.updated_at }));
}

export function getOneRow(table: string, id: string): Row | null {
  const r = getDb().prepare(`SELECT id, data, updated_at FROM ${table} WHERE id = ?`).get(id) as any;
  return r ? { id: r.id, data: JSON.parse(r.data), updated_at: r.updated_at } : null;
}

export function deleteRow(table: string, id: string): void {
  getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}
