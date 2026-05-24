# FoundWise — Lost & Found Management System

A Node.js/Express backend for the **FoundWise** campus lost-and-found platform.  
Handles user authentication (Google OAuth & PHP password auth), item claim workflows, and email notifications (via Nodemailer/Gmail SMTP) — all backed by a MySQL database running on XAMPP.

---

## Project Structure

```
foundwise-server/
├── server.js           ← Express backend (claim API, notifications)
├── mailer.js           ← Nodemailer email notifications
├── package.json
├── .env.example        ← Copy to .env and fill in your keys
├── .gitignore
├── database/           ← SQL schema & migrations
├── php/                ← PHP API (auth, user management)
└── public/
    ├── FoundWise.html  ← Main dashboard (admin & student)
    └── login.html      ← Login page (password + Google OAuth)
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
| `POST` | `/api/claim/notify` | Sends a claim notification email to a student  |
| `POST` | `/claim-item`       | Marks an item as claimed and notifies the owner|

---

## Security Features

- ✅ **Google OAuth** — secure sign-in via Google accounts
- ✅ **Rate limiting** — protects endpoints from abuse
- ✅ **CORS** — only your own frontend origin can call the API
- ✅ **Input validation** — all inputs are validated server-side
- ✅ **DB transactions** — claim operations use transactions with rollback on failure
- ✅ **Error sanitization** — internal errors are never leaked to the client
