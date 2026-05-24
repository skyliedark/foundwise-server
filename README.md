# FoundWise — Lost & Found Management System

A Node.js/Express backend for the **FoundWise** campus lost-and-found platform.  
Handles OTP verification (via Didit API), item claim workflows, and email notifications (via Nodemailer/Gmail SMTP) — all backed by a MySQL database running on XAMPP.

---

## Project Structure

```
foundwise-server/
├── server.js           ← Express backend (OTP proxy, claim API)
├── mailer.js           ← Nodemailer email notifications
├── package.json
├── .env.example        ← Copy to .env and fill in your keys
├── .gitignore
├── database/           ← SQL schema & migrations
├── php/                ← PHP helpers (legacy API bridge)
└── public/
    ├── FoundWise.html  ← Main dashboard (admin & student)
    ├── login.html      ← Login / OTP verification page
    └── api.php         ← PHP API endpoint
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

Open `.env` and fill in **all** values:
```env
# Didit OTP API
DIDIT_API_KEY=your_didit_api_key_here
DIDIT_BASE_URL=https://verification.didit.me

# Server
PORT=3000
ALLOWED_ORIGIN=http://localhost:3000

# MySQL (XAMPP)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=foundwise
DB_USER=root
DB_PASS=

# PHP API bridge
PHP_API_URL=http://localhost/foundwise/api

# Gmail SMTP (claim notifications)
GMAIL_USER=your.school.email@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password_here
```

### 3. Start XAMPP
Make sure **Apache** and **MySQL** are running in the XAMPP Control Panel.

### 4. Start the server
```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

### 5. Open the app
Go to: **http://localhost:3000**

---

## API Endpoints

| Method | Route               | Description                                    |
|--------|---------------------|------------------------------------------------|
| `POST` | `/api/otp/send`     | Sends a 6-digit OTP to the given email         |
| `POST` | `/api/otp/verify`   | Verifies the OTP code entered by the user      |
| `POST` | `/api/claim/notify` | Sends a claim notification email to a student  |
| `POST` | `/claim-item`       | Marks an item as claimed and notifies the owner|

---

## Security Features

- ✅ **API key hidden** — stored in `.env`, never sent to the browser
- ✅ **Rate limiting** — max 5 OTP sends per IP per 10 minutes; 10 verify attempts
- ✅ **CORS** — only your own frontend origin can call the API
- ✅ **Input validation** — email format and 6-digit code are validated server-side
- ✅ **Error sanitization** — raw Didit errors are never leaked to the client
- ✅ **DB transactions** — claim operations use transactions with rollback on failure
