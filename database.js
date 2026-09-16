/**
 * database.js — Bi License Server
 *
 * SQLite database. Hai bảng:
 *   - licenses   : chứa mọi key, trạng thái, device binding
 *   - check_log  : lịch sử mỗi lần extension gọi verify
 */

// node:sqlite — built-in từ Node 22+, không cần cài gì, không cần compile
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'licenses.db');
const db = new DatabaseSync(DB_PATH);

// WAL mode: đọc không chặn ghi — quan trọng khi nhiều extension cùng check
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Key dạng BIAUTO-XXXX-XXXX-XXXX
    key             TEXT UNIQUE NOT NULL,

    -- active | revoked | expired
    status          TEXT NOT NULL DEFAULT 'active',

    -- weekly | monthly | 3month | lifetime | daily | 3day | quarterly
    tier            TEXT NOT NULL DEFAULT 'weekly',

    -- ISO 8601 hoặc NULL nếu là lifetime
    expiry          TEXT,

    -- Fingerprint SHA-256 của thiết bị đã kích hoạt. NULL = chưa bind
    device_id       TEXT,

    -- Đếm số lần check trong ngày — chống brute force
    daily_checks    INTEGER NOT NULL DEFAULT 0,
    last_check_date TEXT,   -- YYYY-MM-DD, reset về 0 khi ngày đổi

    created_at      TEXT NOT NULL DEFAULT (datetime('now')),

    -- Ghi chú admin tuỳ ý: "Nguyễn Văn A, mua 15/9"
    notes           TEXT
  );

  -- Log mọi lần extension gọi verify — audit trail
  CREATE TABLE IF NOT EXISTS check_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT NOT NULL,
    device_id  TEXT,
    result     TEXT NOT NULL,   -- approved | rejected
    reason     TEXT,            -- lý do nếu rejected
    ip         TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Index cho truy vấn nhanh
  CREATE INDEX IF NOT EXISTS idx_licenses_key    ON licenses(key);
  CREATE INDEX IF NOT EXISTS idx_check_log_key   ON check_log(key);
  CREATE INDEX IF NOT EXISTS idx_check_log_time  ON check_log(checked_at);
`);

module.exports = db;
