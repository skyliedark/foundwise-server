# FoundWise — Secure OTP Server

This Node.js/Express server proxies email OTP requests to the **Didit API**.  
Your `DIDIT_API_KEY` lives only in the `.env` file on the server — it is **never** sent to the browser.

---

## Project Structure

```
foundwise-server/
├── server.js          ← Express backend (OTP proxy)
├── package.json
├── .env.example       ← Copy this to .env and fill in your keys
├── .gitignore         ← Keeps .env out of Git
└── public/
    └── index.html     ← Your FoundWise frontend (served by Express)
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Create your `.env` file
```bash
cp .env.example .env
```

Open `.env` and set your real Didit API key:
```env
DIDIT_API_KEY=your_real_didit_api_key_here
DIDIT_BASE_URL=https://verification.didit.me
PORT=3000
ALLOWED_ORIGIN=http://localhost:3000
```

> **Get your API key:** Log in at https://didit.me → Dashboard → API Keys → Create New Key

### 3. Start the server
```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

### 4. Open the app
Go to: **http://localhost:3000**

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/otp/send` | Sends a 6-digit OTP to the given email |
| `POST` | `/api/otp/verify` | Verifies the OTP code entered by the user |

### Send OTP
```
POST /api/otp/send
Content-Type: application/json

{ "email": "user@example.com" }
```

### Verify OTP
```
POST /api/otp/verify
Content-Type: application/json

{ "email": "user@example.com", "code": "123456" }
```

---

## Security Features

- ✅ **API key hidden** — stored in `.env`, never sent to the browser
- ✅ **Rate limiting** — max 5 OTP sends per IP per 10 minutes; 10 verify attempts
- ✅ **CORS** — only your own frontend origin can call the API
- ✅ **Input validation** — email format and 6-digit code are validated server-side
- ✅ **Error sanitization** — raw Didit errors are never leaked to the client

---

## Deploying to Production

### Option A: Railway / Render / Fly.io (easiest)
1. Push your code to GitHub (`.env` is in `.gitignore` — safe to push)
2. Create a new project on [Railway](https://railway.app) or [Render](https://render.com)
3. Set the environment variables in their dashboard (same as your `.env`)
4. Deploy — they auto-detect Node.js and run `npm start`

### Option B: VPS (e.g. DigitalOcean)
```bash
# On your server
git clone your-repo
cd foundwise-server
npm install --production
cp .env.example .env
nano .env   # fill in your keys
npm start   # or use PM2: pm2 start server.js --name foundwise
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `DIDIT_API_KEY is not set` | Copy `.env.example` → `.env` and set your key |
| `502 Bad Gateway` on OTP send | Your API key is wrong — regenerate it at didit.me |
| `Too many OTP requests` | Rate limit hit — wait 10 minutes |
| CORS error in browser | Set `ALLOWED_ORIGIN` in `.env` to match your frontend URL |
