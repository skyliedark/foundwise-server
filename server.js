// ═══════════════════════════════════════════════════════════════
//  FoundWise — Secure OTP Proxy Server
//  Keeps your Didit API key on the server, never in the browser.
// ═══════════════════════════════════════════════════════════════
'use strict';

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const fetch      = require('node-fetch');
const path       = require('path');
const mysql2     = require('mysql2/promise');
const { sendClaimNotification } = require('./mailer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MySQL connection pool (mysql2) ─────────────────────────────
// Re-uses connections across requests — no per-request connect overhead.
const db = mysql2.createPool({
  host              : process.env.DB_HOST     || 'localhost',
  port              : Number(process.env.DB_PORT) || 3306,
  database          : process.env.DB_NAME     || 'foundwise',
  user              : process.env.DB_USER     || 'root',
  password          : process.env.DB_PASS     || '',
  waitForConnections: true,
  connectionLimit   : 10,
  queueLimit        : 0,
  timezone          : '+00:00',
});

// ── Validate required env vars on startup ──────────────────────
const DIDIT_API_KEY  = process.env.DIDIT_API_KEY;
const DIDIT_BASE_URL = process.env.DIDIT_BASE_URL || 'https://verification.didit.me/v3/email/send/';
const PHP_API_URL    = process.env.PHP_API_URL    || 'http://localhost/foundwise/api';

if (!DIDIT_API_KEY || DIDIT_API_KEY === 'your_real_didit_api_key_here') {
  console.error('\n❌  ERROR: DIDIT_API_KEY is not set in your .env file.');
  console.error('   Copy .env.example → .env and fill in your real API key.\n');
  process.exit(1);
}

// ── CORS ───────────────────────────────────────────────────────
// Only allow requests from your own frontend
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST'],
}));

// ── Body parsing ───────────────────────────────────────────────
app.use(express.json());

// ── Serve the frontend HTML from /public ──────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiter: max 5 OTP sends per IP per 10 minutes ────────
const otpSendLimiter = rateLimit({
  windowMs : 10 * 60 * 1000,   // 10 minutes
  max      : 5,
  message  : { error: 'Too many OTP requests. Please wait 10 minutes.' },
  standardHeaders: true,
  legacyHeaders  : false,
});

// ── Rate limiter: max 10 verify attempts per IP per 10 minutes ─
const otpVerifyLimiter = rateLimit({
  windowMs : 10 * 60 * 1000,
  max      : 10,
  message  : { error: 'Too many verification attempts. Please wait 10 minutes.' },
  standardHeaders: true,
  legacyHeaders  : false,
});

// ── Helper: forward a request to Didit ────────────────────────
async function diditRequest(endpoint, body) {
  const url = `${DIDIT_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method  : 'POST',
    headers : {
      'Content-Type': 'application/json',
      'x-api-key'   : DIDIT_API_KEY,   // ← key stays on server only
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  return { ok: response.ok, status: response.status, data };
}

// ── Validate email format ──────────────────────────────────────
function isValidEmail(email) {
  return typeof email === 'string' &&
         /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── Relay a verified OTP event to the PHP/MySQL layer ──────────
// Fire-and-forget: if PHP is unavailable the Node response is
// still sent to the browser successfully.
async function relayVerifyToPhp(email) {
  try {
    const res = await fetch(`${PHP_API_URL}/verify_otp.php`, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`[PHP relay] ✅  User ${email} marked verified in MySQL. Token: ${data.token?.slice(0, 8)}...`);
    } else {
      console.warn(`[PHP relay] ⚠️  PHP returned ${res.status}:`, data.error || data);
    }
  } catch (err) {
    console.warn('[PHP relay] ⚠️  Could not reach PHP API (is XAMPP running?):', err.message);
  }
}

// ══════════════════════════════════════════════════════════════
//  ROUTE: POST /api/otp/send
//  Body : { email: "user@example.com" }
//  Calls Didit to send a 6-digit OTP to the given email.
// ══════════════════════════════════════════════════════════════
app.post('/api/otp/send', otpSendLimiter, async (req, res) => {
  const { email } = req.body;

  // ── Input validation ─────────────────────────────────────────
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  try {
    const { ok, status, data } = await diditRequest('/v3/email/send/', {
      email: email.trim().toLowerCase(),
    });

    if (!ok) {
      // Surface a clean error to the client (never leak raw Didit internals)
      const message = data.detail || data.message || `Didit error ${status}`;
      console.error(`[OTP send] Didit returned ${status}:`, data);
      return res.status(status === 403 ? 502 : status).json({ error: message });
    }

    console.log(`[OTP send] ✅  Sent to ${email}`);
    return res.json({ success: true, message: 'OTP sent successfully.' });

  } catch (err) {
    console.error('[OTP send] Network error:', err.message);
    return res.status(502).json({ error: 'Could not reach the verification service. Check your internet connection.' });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE: POST /api/otp/verify
//  Body : { email: "user@example.com", code: "123456" }
//  Verifies the OTP code entered by the user.
// ══════════════════════════════════════════════════════════════
app.post('/api/otp/verify', otpVerifyLimiter, async (req, res) => {
  const { email, code } = req.body;

  // ── Input validation ─────────────────────────────────────────
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!code || !/^\d{6}$/.test(String(code).trim())) {
    return res.status(400).json({ error: 'A 6-digit numeric code is required.' });
  }

  try {
    const { ok, status, data } = await diditRequest('/v3/email/check/', {
      email: email.trim().toLowerCase(),
      code : String(code).trim(),
    });

    if (!ok) {
      const message = data.detail || data.message || `Didit error ${status}`;
      console.error(`[OTP verify] Didit returned ${status}:`, data);
      return res.status(400).json({ error: message });
    }

    console.log(`[OTP verify] ✅  Verified ${email}`);

    // ── Relay to PHP/MySQL (fire-and-forget) ───────────────
    relayVerifyToPhp(email.trim().toLowerCase());

    return res.json({ success: true, message: 'Email verified successfully.' });

  } catch (err) {
    console.error('[OTP verify] Network error:', err.message);
    return res.status(502).json({ error: 'Could not reach the verification service. Check your internet connection.' });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE: POST /api/claim/notify
//  Body : { studentEmail, itemName, claimDate }
//
//  Called by the PHP layer (or frontend) AFTER the SQL UPDATE
//  that sets the claim/item status to "Claimed" / "Returned".
//  Returns JSON: { success, refNumber } on success.
// ══════════════════════════════════════════════════════════════
app.post('/api/claim/notify', async (req, res) => {
  const { studentEmail, itemName, claimDate } = req.body;

  // ── Basic validation ──────────────────────────────────────
  if (!studentEmail || !itemName) {
    return res.status(400).json({
      error: 'studentEmail and itemName are required.',
    });
  }

  const result = await sendClaimNotification({
    studentEmail,
    itemName,
    claimDate: claimDate || new Date().toISOString(),
  });

  if (!result.success) {
    // Non-fatal: the claim is already saved in the DB; email is best-effort
    console.error('[/api/claim/notify] Email failed:', result.error);
    return res.status(502).json({
      success : false,
      error   : 'Claim saved, but notification email could not be sent.',
      detail  : result.error,
    });
  }

  return res.json({
    success   : true,
    refNumber : result.refNumber,
    message   : `Claim notification sent to ${studentEmail}.`,
  });
});

// ══════════════════════════════════════════════════════════════
//  ROUTE: POST /claim-item
//  Body : { item_id: number, claimer_name: string }
//
//  Anti-Gravity workflow:
//   1. Open a DB transaction
//   2. UPDATE items SET status = 'claimed', claimer_name = ?
//   3. SELECT the claimant's email via claims → users JOIN
//   4. COMMIT — only now is the DB mutated permanently
//   5. Send Nodemailer confirmation to the student
//
//  If the DB step fails → rollback + 500 (no email sent)
//  If email fails after commit → 200 still returned (claim is
//    saved), but the error is logged for ops visibility.
// ══════════════════════════════════════════════════════════════
app.post('/claim-item', async (req, res) => {
  const { item_id, claimer_name } = req.body;

  // ── Input validation ──────────────────────────────────────
  if (!item_id || isNaN(Number(item_id))) {
    return res.status(400).json({ error: 'A valid item_id is required.' });
  }
  if (!claimer_name || typeof claimer_name !== 'string' || !claimer_name.trim()) {
    return res.status(400).json({ error: 'claimer_name is required.' });
  }

  const itemId      = Number(item_id);
  const claimerName = claimer_name.trim();
  const claimDate   = new Date();

  // ── Acquire a connection for the transaction ───────────────
  let connection;
  try {
    connection = await db.getConnection();
  } catch (connErr) {
    console.error('[/claim-item] DB connection failed:', connErr.message);
    return res.status(500).json({ error: 'Database connection failed. Is XAMPP running?' });
  }

  try {
    await connection.beginTransaction();

    // ── STEP 1: Update the item status to 'claimed' ─────────
    const [updateResult] = await connection.execute(
      `UPDATE items
          SET status       = 'claimed',
              claimer_name = ?,
              updated_at   = NOW()
        WHERE id     = ?
          AND status != 'claimed'`,   // idempotency guard
      [claimerName, itemId]
    );

    if (updateResult.affectedRows === 0) {
      // Either item doesn't exist or was already claimed
      await connection.rollback();
      connection.release();
      return res.status(409).json({
        error: `Item #${itemId} does not exist or is already claimed.`,
      });
    }

    // ── STEP 2: Fetch the claimant's email ──────────────────
    // Join claims → users to get the latest pending claim's email
    const [rows] = await connection.execute(
      `SELECT u.email, u.name, i.item_name
           FROM claims   c
           JOIN users    u ON u.id = c.claimant_id
           JOIN items    i ON i.id = c.item_id
          WHERE c.item_id = ?
            AND c.status  = 'pending'
          ORDER BY c.created_at DESC
          LIMIT 1`,
      [itemId]
    );

    // ── STEP 3: Commit the transaction ──────────────────────
    // We commit before sending the email so the DB is the
    // source of truth regardless of email delivery.
    await connection.commit();
    connection.release();

    console.log(`[/claim-item] ✅  Item #${itemId} marked claimed by "${claimerName}".`);

    // ── STEP 4: Send Nodemailer email (best-effort) ─────────
    if (rows.length > 0) {
      const { email, name, item_name } = rows[0];

      // Fire-and-forget — don't await so the HTTP response is instant
      sendClaimNotification({
        studentEmail : email,
        itemName     : item_name,
        claimDate,
      }).then(result => {
        if (result.success) {
          console.log(`[/claim-item] 📧  Notification sent to ${email}. Ref: ${result.refNumber}`);
        } else {
          console.error(`[/claim-item] ⚠️  Email failed for ${email}:`, result.error);
        }
      });
    } else {
      console.warn(`[/claim-item] ⚠️  No pending claim/email found for item #${itemId}. Email skipped.`);
    }

    // ── STEP 5: Return success immediately ──────────────────
    return res.status(200).json({
      success    : true,
      message    : `Item #${itemId} has been successfully claimed by ${claimerName}.`,
      item_id    : itemId,
      claimer    : claimerName,
      claimed_at : claimDate.toISOString(),
    });

  } catch (err) {
    // ── DB error: rollback and return 500; do NOT send email ─
    console.error('[/claim-item] ❌  Transaction failed:', err.message);
    try { await connection.rollback(); } catch (_) { /* ignore rollback error */ }
    connection.release();

    return res.status(500).json({
      error  : 'Database transaction failed. The item was NOT marked as claimed.',
      detail : err.message,
    });
  }
});

// ── Catch-all: serve index.html for SPA routing ───────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  FoundWise server running at http://localhost:${PORT}`);
  console.log(`    Didit base URL : ${DIDIT_BASE_URL}`);
  console.log(`    CORS origin    : ${allowedOrigin}`);
  console.log(`    API key        : ${DIDIT_API_KEY.slice(0, 6)}${'*'.repeat(20)}\n`);
});
