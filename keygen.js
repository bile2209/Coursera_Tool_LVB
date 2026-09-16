#!/usr/bin/env node
/**
 * keygen.js — Tạo key nhanh từ command line
 *
 * Dùng khi chưa deploy server, hoặc muốn tạo hàng loạt:
 *
 *   node keygen.js weekly 5
 *   node keygen.js monthly
 *   node keygen.js lifetime 10
 *
 * Key sẽ được thêm thẳng vào DB local.
 */

require('dotenv').config();
// Tắt cảnh báo experimental của node:sqlite
process.removeAllListeners('warning');
const db = require('./database');

const VALID_TIERS = ['daily', '3day', 'weekly', 'monthly', '3month', 'quarterly', 'lifetime'];
const crypto = require('crypto');

function generateKey() {
  const hex = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `BIAUTO-${hex()}-${hex()}-${hex()}`;
}

function calcExpiry(tier) {
  const d = new Date();
  const map = { daily:1, '3day':3, weekly:7, monthly:30, '3month':90, quarterly:90, lifetime:null };
  const days = map[tier];
  if (days === undefined || days === null) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const tier  = process.argv[2] || 'weekly';
const count = parseInt(process.argv[3]) || 1;

if (!VALID_TIERS.includes(tier)) {
  console.error(`Tier không hợp lệ. Dùng: ${VALID_TIERS.join(', ')}`);
  process.exit(1);
}

const stmt = db.prepare(`
  INSERT INTO licenses (key, status, tier, expiry)
  VALUES (?, 'active', ?, ?)
`);

console.log(`\nTạo ${count} key tier=${tier}:\n`);

for (let i = 0; i < count; i++) {
  const key    = generateKey();
  const expiry = calcExpiry(tier);
  stmt.run(key, tier, expiry);
  console.log(`  ${key}  |  hết hạn: ${expiry || 'LIFETIME'}`);
}

console.log('\nXong. Key đã vào DB.\n');
