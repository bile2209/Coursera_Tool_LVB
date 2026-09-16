# Bi License Server

Server quản lý license key cho **Bi Automation V4**.

---

## Yêu cầu

- Node.js **v22 trở lên** (dùng built-in `node:sqlite`, không cần compile gì)
- npm (đi kèm Node.js)

## Cài đặt local

```bash
npm install
```

**Windows:**
```cmd
copy .env.example .env
```

**Linux / Mac:**
```bash
cp .env.example .env
```

Mở file `.env`, đổi `ADMIN_API_KEY` thành chuỗi bí mật dài.

```bash
npm start
```

Server chạy tại `http://localhost:3000`.

---

## Deploy lên Railway (khuyên dùng — free)

1. Tạo tài khoản tại [railway.app](https://railway.app)
2. Tạo project mới → **Deploy from GitHub repo**
3. Push code lên GitHub (bỏ `node_modules/` và `.env`)
4. Trong Railway dashboard → **Variables** → thêm:
   - `ADMIN_API_KEY` = một chuỗi dài ngẫu nhiên (ít nhất 32 ký tự)
   - `DB_PATH` = `/data/licenses.db` (Railway cung cấp persistent volume)
5. Railway tự detect `Procfile` và chạy `node server.js`
6. Lấy URL dạng `https://bi-license-server-xxxx.up.railway.app`

---

## Cập nhật extension

Mở `core/license-manager.js`, dòng 18–19:

```javascript
// TRƯỚC (server cũ)
const LICENSE_SERVER = 'https://quizsolver.infinityfreeapp.com/coursera_license';
const VERIFY_URL     = `${LICENSE_SERVER}/verify.php`;

// SAU (server mới — thay URL Railway của bạn vào)
const LICENSE_SERVER = 'https://bi-license-server-xxxx.up.railway.app';
const VERIFY_URL     = `${LICENSE_SERVER}/verify`;
```

---

## Tạo key mới

### Cách 1: Command line (local)

```bash
node keygen.js weekly 3     # 3 key weekly
node keygen.js monthly      # 1 key monthly
node keygen.js lifetime     # 1 key lifetime
```

### Cách 2: Admin API (từ xa)

```bash
# Tạo 1 key weekly
curl -X POST https://YOUR-SERVER/admin/create \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{"tier":"weekly","notes":"Nguyễn Văn A"}'

# Tạo 5 key monthly cùng lúc
curl -X POST https://YOUR-SERVER/admin/create \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{"tier":"monthly","count":5}'
```

---

## Quản lý key

```bash
# Xem tất cả key
curl "https://YOUR-SERVER/admin/list" -H "X-Admin-Key: your-admin-key"

# Xem key đang active
curl "https://YOUR-SERVER/admin/list?status=active" -H "X-Admin-Key: your-admin-key"

# Xem chi tiết + lịch sử check của 1 key
curl "https://YOUR-SERVER/admin/detail?key=BIAUTO-XXXX-XXXX-XXXX" \
  -H "X-Admin-Key: your-admin-key"

# Thu hồi key (user vi phạm / hoàn tiền)
curl -X POST https://YOUR-SERVER/admin/revoke \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{"key":"BIAUTO-XXXX-XXXX-XXXX"}'

# User đổi máy — reset device binding
curl -X POST https://YOUR-SERVER/admin/reset-device \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{"key":"BIAUTO-XXXX-XXXX-XXXX"}'

# Gia hạn thêm 7 ngày
curl -X POST https://YOUR-SERVER/admin/extend \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{"key":"BIAUTO-XXXX-XXXX-XXXX","days":7}'

# Thống kê tổng quan
curl "https://YOUR-SERVER/admin/stats" -H "X-Admin-Key: your-admin-key"
```

---

## Cấu trúc thư mục

```
bi-license-server/
├── server.js          ← entry point
├── database.js        ← SQLite init + schema
├── routes/
│   ├── verify.js      ← public: extension gọi vào đây
│   └── admin.js       ← private: quản lý key
├── keygen.js          ← tạo key từ CLI
├── package.json
├── Procfile           ← Railway deploy
├── .env.example
└── .gitignore
```

---

## Database schema

```sql
licenses (
  key             TEXT  -- BIAUTO-XXXX-XXXX-XXXX
  status          TEXT  -- active | revoked | expired
  tier            TEXT  -- daily | 3day | weekly | monthly | 3month | quarterly | lifetime
  expiry          TEXT  -- ISO 8601, NULL nếu lifetime
  device_id       TEXT  -- fingerprint thiết bị, NULL nếu chưa kích hoạt
  daily_checks    INT   -- reset về 0 mỗi ngày
  last_check_date TEXT  -- YYYY-MM-DD
  notes           TEXT  -- ghi chú admin
)
```

---

## Các tier hỗ trợ

| Tier       | Thời hạn |
|------------|----------|
| daily      | 1 ngày   |
| 3day       | 3 ngày   |
| weekly     | 7 ngày   |
| monthly    | 30 ngày  |
| 3month     | 90 ngày  |
| quarterly  | 90 ngày  |
| lifetime   | Không hạn|
# Coursera_Tool_LVB
