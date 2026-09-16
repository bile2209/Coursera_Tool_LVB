/**
 * server.js — Bi License Server
 *
 * Entry point. Chạy:
 *   npm start        (production)
 *   npm run dev      (development, auto-reload)
 */

require('dotenv').config();
// Tắt cảnh báo "SQLite is an experimental feature" — hoạt động ổn trên Node 22+
process.removeAllListeners('warning');

const express    = require('express');
const cors       = require('cors');
const db         = require('./database');          // khởi tạo DB trước
const verifyRouter = require('./routes/verify');
const adminRouter  = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Log mọi request (tắt đi nếu log quá nhiều)
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────

// Public: extension gọi vào đây
app.use('/', verifyRouter);

// Admin: bảo vệ bằng X-Admin-Key header
app.use('/admin', adminRouter);

// Health check — Railway/Render dùng để kiểm tra server còn sống
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Bi License Server v1.0`);
  console.log(`  Listening on port ${PORT}`);
  console.log(`  Admin key: ${process.env.ADMIN_API_KEY ? '***set***' : 'NOT SET — change in .env!'}\n`);
});
