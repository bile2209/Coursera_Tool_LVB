/**
 * routes/verify.js — Public endpoint
 *
 * Extension gọi:
 *   GET /coursera_license/verify.php?key=...&deviceId=...&t=...
 *
 * Server trả về:
 *   { valid: true,  expiry, tier, reason: null }
 *   { valid: false, reason: 'expired' | 'not_found' | ... }
 *
 * Lý do (reason) mà license-manager.js hiểu:
 *   not_found    — key không tồn tại trong DB
 *   revoked      — admin đã thu hồi
 *   expired      — hết hạn
 *   wrong_device — key đang bind với thiết bị khác
 *   daily_limit  — đã check quá 10 lần trong ngày
 */

const express = require('express');
const router  = express.Router();
const db      = require('../database');

const MAX_DAILY_CHECKS = 10;

// ──────────────────────────────────────────────────────────
//  Hỗ trợ cả hai đường dẫn:
//    /coursera_license/verify.php  — tương thích với extension hiện tại
//    /verify                       — clean path cho server mới
// ──────────────────────────────────────────────────────────
router.get('/coursera_license/verify.php', handleVerify);
router.get('/verify', handleVerify);

function handleVerify(req, res) {
  const { key, deviceId } = req.query;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  // ── 1. Validate input ──────────────────────────────────
  if (!key || !deviceId) {
    return res.json({ valid: false, reason: 'missing_params' });
  }

  const today = new Date().toISOString().slice(0, 10); // "2026-09-16"

  // ── 2. Tìm key trong database ──────────────────────────
  const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key.trim());

  if (!license) {
    logCheck(key, deviceId, 'rejected', 'not_found', ip);
    return res.json({ valid: false, reason: 'not_found' });
  }

  // ── 3. Kiểm tra revoked ────────────────────────────────
  if (license.status === 'revoked') {
    logCheck(key, deviceId, 'rejected', 'revoked', ip);
    return res.json({ valid: false, reason: 'revoked' });
  }

  // ── 4. Kiểm tra hết hạn ───────────────────────────────
  if (license.expiry) {
    if (new Date(license.expiry).getTime() < Date.now()) {
      db.prepare("UPDATE licenses SET status = 'expired' WHERE key = ?").run(key);
      logCheck(key, deviceId, 'rejected', 'expired', ip);
      return res.json({ valid: false, reason: 'expired' });
    }
  }

  // ── 5. Reset daily counter nếu sang ngày mới ──────────
  let dailyChecks = license.daily_checks;
  if (license.last_check_date !== today) {
    dailyChecks = 0;
  }

  // ── 6. Kiểm tra giới hạn 10 lần/ngày ─────────────────
  if (dailyChecks >= MAX_DAILY_CHECKS) {
    logCheck(key, deviceId, 'rejected', 'daily_limit', ip);
    return res.json({ valid: false, reason: 'daily_limit' });
  }

  // ── 7. Device binding ──────────────────────────────────
  if (license.device_id && license.device_id !== deviceId) {
    // Key đã được kích hoạt trên thiết bị khác
    logCheck(key, deviceId, 'rejected', 'wrong_device', ip);
    return res.json({ valid: false, reason: 'wrong_device' });
  }

  // ── 8. Cập nhật DB ─────────────────────────────────────
  if (!license.device_id) {
    // Lần đầu kích hoạt — bind device này
    db.prepare(`
      UPDATE licenses
      SET device_id       = ?,
          status          = 'active',
          daily_checks    = 1,
          last_check_date = ?
      WHERE key = ?
    `).run(deviceId, today, key);
  } else {
    // Key đã active — chỉ tăng counter
    db.prepare(`
      UPDATE licenses
      SET daily_checks    = ?,
          last_check_date = ?
      WHERE key = ?
    `).run(dailyChecks + 1, today, key);
  }

  // ── 9. Trả về approved ────────────────────────────────
  logCheck(key, deviceId, 'approved', null, ip);

  return res.json({
    valid:  true,
    expiry: license.expiry || null,
    tier:   license.tier,
    reason: null
  });
}

// Ghi log không làm hỏng response nếu lỗi
function logCheck(key, deviceId, result, reason, ip) {
  try {
    db.prepare(`
      INSERT INTO check_log (key, device_id, result, reason, ip)
      VALUES (?, ?, ?, ?, ?)
    `).run(key, deviceId, result, reason, ip);
  } catch (err) {
    console.error('[log error]', err.message);
  }
}

module.exports = router;
