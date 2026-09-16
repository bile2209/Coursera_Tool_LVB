/**
 * routes/admin.js — Admin API (bảo vệ bằng X-Admin-Key header)
 *
 * Tất cả request phải kèm header:
 *   X-Admin-Key: <ADMIN_API_KEY từ .env>
 *
 * Endpoints:
 *   POST /admin/create        — tạo key mới
 *   GET  /admin/list          — liệt kê tất cả key
 *   GET  /admin/detail?key=   — chi tiết 1 key + lịch sử check
 *   POST /admin/revoke        — thu hồi key
 *   POST /admin/reset-device  — gỡ bind thiết bị (cho user đổi máy)
 *   POST /admin/extend        — gia hạn thêm N ngày
 *   GET  /admin/stats         — thống kê tổng quan
 */

const express = require('express');
const router  = express.Router();
const db      = require('../database');
const crypto  = require('crypto');

// ──────────────────────────────────────────────────────────
//  Middleware: xác thực Admin API Key
// ──────────────────────────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'change-this-secret';

function requireAdmin(req, res, next) {
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid X-Admin-Key' });
  }
  next();
}

router.use(requireAdmin);

// ──────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────

/** Tạo key ngẫu nhiên dạng BIAUTO-A1B2-C3D4-E5F6 */
function generateKey() {
  const hex = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `BIAUTO-${hex()}-${hex()}-${hex()}`;
}

/** Tính ngày hết hạn từ tier */
function calcExpiry(tier) {
  const d = new Date();
  const tierMap = {
    daily:     1,
    '3day':    3,
    weekly:    7,
    monthly:   30,
    '3month':  90,
    quarterly: 90,
    lifetime:  null
  };

  const days = tierMap[tier];
  if (days === undefined) return null; // unknown tier → no expiry
  if (days === null) return null;      // lifetime → no expiry

  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const VALID_TIERS = ['daily', '3day', 'weekly', 'monthly', '3month', 'quarterly', 'lifetime'];

// ──────────────────────────────────────────────────────────
//  POST /admin/create
//  Body: { tier, notes, count }
// ──────────────────────────────────────────────────────────
router.post('/create', (req, res) => {
  const { tier = 'weekly', notes = '', count = 1 } = req.body;

  if (!VALID_TIERS.includes(tier)) {
    return res.status(400).json({
      error: `Tier không hợp lệ. Dùng một trong: ${VALID_TIERS.join(', ')}`
    });
  }

  const batchSize = Math.min(Math.max(parseInt(count) || 1, 1), 100);
  const stmt = db.prepare(`
    INSERT INTO licenses (key, status, tier, expiry, notes)
    VALUES (?, 'active', ?, ?, ?)
  `);

  const created = [];
  for (let i = 0; i < batchSize; i++) {
    const key    = generateKey();
    const expiry = calcExpiry(tier);
    stmt.run(key, tier, expiry, notes);
    created.push({ key, tier, expiry: expiry || 'lifetime' });
  }

  console.log(`[ADMIN] Created ${batchSize} key(s) | tier=${tier}`);
  res.json({ success: true, count: created.length, created });
});

// ──────────────────────────────────────────────────────────
//  GET /admin/list?status=active&tier=weekly
// ──────────────────────────────────────────────────────────
router.get('/list', (req, res) => {
  const { status, tier } = req.query;
  const conditions = [];
  const params     = [];

  if (status) { conditions.push('status = ?'); params.push(status); }
  if (tier)   { conditions.push('tier = ?');   params.push(tier); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const rows  = db.prepare(
    `SELECT * FROM licenses ${where} ORDER BY created_at DESC LIMIT 500`
  ).all(...params);

  res.json({ count: rows.length, licenses: rows });
});

// ──────────────────────────────────────────────────────────
//  GET /admin/detail?key=BIAUTO-XXXX-XXXX-XXXX
// ──────────────────────────────────────────────────────────
router.get('/detail', (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Thiếu tham số key' });

  const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);
  if (!license) return res.status(404).json({ error: 'Không tìm thấy key này' });

  const logs = db.prepare(
    'SELECT * FROM check_log WHERE key = ? ORDER BY checked_at DESC LIMIT 50'
  ).all(key);

  res.json({ license, recent_checks: logs });
});

// ──────────────────────────────────────────────────────────
//  POST /admin/revoke
//  Body: { key }
// ──────────────────────────────────────────────────────────
router.post('/revoke', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Thiếu key' });

  const result = db.prepare(
    "UPDATE licenses SET status = 'revoked' WHERE key = ?"
  ).run(key);

  if (result.changes === 0) return res.status(404).json({ error: 'Key không tồn tại' });

  console.log(`[ADMIN] Revoked key: ${key}`);
  res.json({ success: true, message: `Key ${key} đã bị thu hồi.` });
});

// ──────────────────────────────────────────────────────────
//  POST /admin/reset-device
//  Body: { key }
//  Dùng khi user đổi máy và cần mở khoá thiết bị cũ
// ──────────────────────────────────────────────────────────
router.post('/reset-device', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Thiếu key' });

  const result = db.prepare(
    'UPDATE licenses SET device_id = NULL WHERE key = ?'
  ).run(key);

  if (result.changes === 0) return res.status(404).json({ error: 'Key không tồn tại' });

  console.log(`[ADMIN] Reset device binding: ${key}`);
  res.json({ success: true, message: `Đã gỡ bind thiết bị cho key ${key}. User có thể kích hoạt trên máy mới.` });
});

// ──────────────────────────────────────────────────────────
//  POST /admin/extend
//  Body: { key, days }
//  Gia hạn thêm N ngày kể từ ngày hết hạn hiện tại
// ──────────────────────────────────────────────────────────
router.post('/extend', (req, res) => {
  const { key, days } = req.body;
  if (!key || !days) return res.status(400).json({ error: 'Thiếu key hoặc days' });

  const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);
  if (!license) return res.status(404).json({ error: 'Key không tồn tại' });

  // Tính base: nếu còn hạn thì gia hạn từ ngày hết hạn, nếu hết rồi thì từ hôm nay
  const base = (license.expiry && new Date(license.expiry) > new Date())
    ? new Date(license.expiry)
    : new Date();

  base.setDate(base.getDate() + parseInt(days));
  const newExpiry = base.toISOString();

  db.prepare(
    "UPDATE licenses SET expiry = ?, status = 'active' WHERE key = ?"
  ).run(newExpiry, key);

  console.log(`[ADMIN] Extended key: ${key} | new expiry: ${newExpiry}`);
  res.json({ success: true, key, newExpiry });
});

// ──────────────────────────────────────────────────────────
//  GET /admin/stats — thống kê nhanh
// ──────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const total    = db.prepare("SELECT COUNT(*) as n FROM licenses").get().n;
  const active   = db.prepare("SELECT COUNT(*) as n FROM licenses WHERE status = 'active'").get().n;
  const revoked  = db.prepare("SELECT COUNT(*) as n FROM licenses WHERE status = 'revoked'").get().n;
  const expired  = db.prepare("SELECT COUNT(*) as n FROM licenses WHERE status = 'expired'").get().n;
  const bound    = db.prepare("SELECT COUNT(*) as n FROM licenses WHERE device_id IS NOT NULL").get().n;
  const today    = new Date().toISOString().slice(0, 10);
  const checksToday = db.prepare(
    "SELECT COUNT(*) as n FROM check_log WHERE checked_at LIKE ?").get(today + '%').n;

  res.json({
    licenses: { total, active, revoked, expired, bound_to_device: bound },
    today:    { total_verify_calls: checksToday }
  });
});

module.exports = router;
