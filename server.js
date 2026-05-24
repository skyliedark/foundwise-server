// ═══════════════════════════════════════════════════════════════
//  FoundWise — Lost & Found Management Server
//  All-in-one Express backend: auth, items, claims, notifications.
// ═══════════════════════════════════════════════════════════════
'use strict';

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const crypto     = require('crypto');
const bcrypt     = require('bcryptjs');
const mysql2     = require('mysql2/promise');
const nodemailer = require('nodemailer');
const { sendClaimNotification } = require('./mailer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MySQL connection pool ──────────────────────────────────────
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

// ── CORS ───────────────────────────────────────────────────────
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin, methods: ['GET', 'POST'] }));

// ── Body parsing ───────────────────────────────────────────────
app.use(express.json());

// ── Serve the frontend HTML from /public ──────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Gmail SMTP transporter (for OTP emails) ───────────────────
const GMAIL_USER         = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
let smtpTransporter = null;
if (GMAIL_USER && GMAIL_APP_PASSWORD) {
  smtpTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    tls: { rejectUnauthorized: true },
  });
}

// ── Helpers ────────────────────────────────────────────────────
function isValidEmail(e) { return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function generateToken() { return crypto.randomBytes(32).toString('hex'); }
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : req.ip || 'unknown';
}

async function logActivity(action, description, entityType, entityId, userId, color = '#1C5C38', req = null) {
  try {
    await db.execute(
      'INSERT INTO activity_logs (user_id, action, description, entity_type, entity_id, color, ip_address) VALUES (?,?,?,?,?,?,?)',
      [userId || null, action, description, entityType || null, entityId || null, color, req ? getClientIp(req) : null]
    );
  } catch (e) { console.error('[logActivity] failed:', e.message); }
}

// ══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { email: rawEmail, password } = req.body;
  const email = (rawEmail || '').trim().toLowerCase();
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'A valid email address is required.' });

  try {
    const [rows] = await db.execute('SELECT id, email, name, password_hash, role, is_verified FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'No account found with this email. Please create one.' });
    const user = rows[0];

    if (!password) return res.status(400).json({ error: 'Please enter your password.' });
    if (!user.password_hash) return res.status(400).json({ error: 'This account uses Google sign-in. Please use the Google button.' });
    if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

    res.json({ success: true, user_id: user.id, is_verified: !!user.is_verified, name: user.name, role: user.role });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { email: rawEmail, name: rawName, password, role: rawRole } = req.body;
  const email = (rawEmail || '').trim().toLowerCase();
  const name = (rawName || '').trim();
  const allowed = ['student', 'front_desk', 'admin'];
  const role = allowed.includes(rawRole) ? rawRole : 'student';
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'A valid email address is required.' });
  if (name && name.length > 150) return res.status(400).json({ error: 'Name must be 150 characters or fewer.' });
  const passHash = password ? bcrypt.hashSync(password, 10) : null;

  try {
    const [existing] = await db.execute('SELECT id, is_verified FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) {
      if (existing[0].is_verified) return res.status(409).json({ error: 'Email already registered and verified. Please log in.' });
      return res.json({ success: true, user_id: existing[0].id, message: 'Account exists but is not verified.', already_exists: true });
    }
    const [result] = await db.execute('INSERT INTO users (email, name, role, password_hash, is_verified) VALUES (?,?,?,?,0)', [email, name || null, role, passHash]);
    res.status(201).json({ success: true, user_id: result.insertId, message: 'Registration successful.' });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// POST /api/google-auth
app.post('/api/google-auth', async (req, res) => {
  const { email: rawEmail, name: rawName, google_id } = req.body;
  const email = (rawEmail || '').trim().toLowerCase();
  const name = (rawName || '').trim();
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email from Google.' });

  try {
    const [rows] = await db.execute('SELECT id, name, role, is_verified FROM users WHERE email = ? LIMIT 1', [email]);
    if (rows.length) {
      const user = rows[0];
      if (!user.is_verified) await db.execute('UPDATE users SET is_verified = 1 WHERE id = ?', [user.id]);
      return res.json({ success: true, user_id: user.id, name: user.name || name, role: user.role || 'student' });
    }
    const [result] = await db.execute('INSERT INTO users (email, name, role, is_verified) VALUES (?,?,?,1)', [email, name, 'student']);
    res.status(201).json({ success: true, user_id: result.insertId, name, role: 'student' });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// POST /api/verify-otp  (creates session token after login/register)
app.post('/api/verify-otp', async (req, res) => {
  const email = ((req.body.email || '')).trim().toLowerCase();
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'A valid email address is required.' });

  try {
    const [rows] = await db.execute('SELECT id, email, name, role FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'No account found for this email.' });
    const user = rows[0];
    await db.execute('UPDATE users SET is_verified = 1 WHERE id = ?', [user.id]);
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await db.execute('INSERT INTO sessions (user_id, token, expires_at) VALUES (?,?,?)', [user.id, token, expiresAt]);
    res.json({ success: true, token, expires_at: expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ITEM ROUTES
// ══════════════════════════════════════════════════════════════

// GET /api/items
app.get('/api/items', async (_req, res) => {
  try {
    const [rows] = await db.execute(`SELECT i.id, i.item_name as name, i.description, i.category, i.location_found as location,
       i.image_url, i.status, i.type, i.created_at as date, u.name as reporter
       FROM items i LEFT JOIN users u ON i.user_id = u.id ORDER BY i.created_at ASC`);
    const items = rows.map(i => ({
      id: 'item-' + i.id, num: i.id, name: i.name, category: i.category, location: i.location,
      date: i.date, description: i.description, reporter: i.reporter || 'Unknown',
      status: i.status, type: i.type, ts: new Date(i.date).getTime()
    }));
    res.json({ success: true, items });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// POST /api/items
app.post('/api/items', async (req, res) => {
  const { user_id, type = 'found', name, description = '', category, location } = req.body;
  if (!user_id || !name || !category || !location) return res.status(400).json({ error: 'Missing required fields.' });
  const catMap = { 'Electronics': 'Electronics', 'Bags': 'Personal', 'Accessories': 'Accessories', 'Documents / IDs': 'Documents', 'Keys': 'Personal', 'Clothing': 'Clothing', 'Others': 'Other' };
  const dbCat = catMap[category] || 'Other';

  try {
    const [result] = await db.execute('INSERT INTO items (user_id, type, item_name, description, category, location_found, status) VALUES (?,?,?,?,?,?,?)',
      [user_id, type, name.trim(), description.trim(), dbCat, location.trim(), 'available']);
    await logActivity('item_reported', `New item reported (${type}): ${name} at ${location}`, 'item', result.insertId, Number(user_id), '#1C5C38', req);
    res.status(201).json({ success: true, item_id: result.insertId, message: 'Item reported successfully.' });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// POST /api/items/status
app.post('/api/items/status', async (req, res) => {
  let { itemId, status, user_id } = req.body;
  itemId = String(itemId).replace('item-', '');
  const valid = ['found', 'lost', 'pending', 'returned', 'claimed'];
  if (!itemId || !valid.includes(status)) return res.status(400).json({ error: 'Invalid parameters.' });

  try {
    const [rows] = await db.execute('SELECT item_name, status FROM items WHERE id = ?', [itemId]);
    if (!rows.length) return res.status(404).json({ error: 'Item not found.' });
    const old = rows[0].status, itemName = rows[0].item_name;
    if (old === status) return res.json({ success: true, message: 'Status unchanged.' });
    await db.execute('UPDATE items SET status = ? WHERE id = ?', [status, itemId]);
    const colors = { found: '#16a34a', lost: '#dc2626', pending: '#d97706', returned: '#0d9488', claimed: '#C5E938' };
    await logActivity('item_status_changed', `Item "${itemName}" status changed from ${old} to ${status}`, 'item', Number(itemId), user_id ? Number(user_id) : null, colors[status] || '#1C5C38', req);
    res.json({ success: true, message: 'Item status updated.', oldStatus: old, newStatus: status });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  CLAIM ROUTES
// ══════════════════════════════════════════════════════════════

// GET /api/claims
app.get('/api/claims', async (_req, res) => {
  try {
    const [rows] = await db.execute(`SELECT c.id, c.item_id, c.claimant_id, c.student_id, c.gmail, c.proof_text as proof,
       c.status, c.created_at as ts, u.name as claimant
       FROM claims c LEFT JOIN users u ON c.claimant_id = u.id ORDER BY c.created_at ASC`);
    const claims = rows.map(c => ({
      id: 'claim-' + c.id, itemId: 'item-' + c.item_id, claimant: c.claimant || 'Unknown',
      sid: c.student_id, gmailEmail: c.gmail, gmailVerified: true,
      proof: c.proof, status: c.status, ts: new Date(c.ts).getTime()
    }));
    res.json({ success: true, claims });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// POST /api/claims
app.post('/api/claims', async (req, res) => {
  const { itemId: rawItemId, user_id, sid, gmailEmail, proof } = req.body;
  const item_id = String(rawItemId || '').replace('item-', '');
  if (!item_id || !user_id || !proof) return res.status(400).json({ error: 'Missing required fields.' });

  try {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    const [cr] = await conn.execute('INSERT INTO claims (item_id, claimant_id, student_id, gmail, proof_text, status) VALUES (?,?,?,?,?,?)',
      [item_id, user_id, (sid || '').trim(), (gmailEmail || '').trim(), proof.trim(), 'pending']);
    await conn.execute('UPDATE items SET status = "pending" WHERE id = ?', [item_id]);
    const [itemRows] = await conn.execute('SELECT item_name FROM items WHERE id = ?', [item_id]);
    await conn.commit(); conn.release();
    const itemName = itemRows[0]?.item_name || 'Unknown item';
    await logActivity('claim_submitted', `Claim submitted for ${itemName}`, 'claim', cr.insertId, Number(user_id), '#d97706', req);
    res.status(201).json({ success: true, claim_id: cr.insertId, message: 'Claim submitted successfully.' });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// POST /api/claims/update
app.post('/api/claims/update', async (req, res) => {
  const { claimId: rawId, status } = req.body;
  const claim_id = String(rawId || '').replace('claim-', '');
  if (!claim_id || !['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid parameters.' });

  try {
    const conn = await db.getConnection();
    await conn.beginTransaction();
    await conn.execute('UPDATE claims SET status = ? WHERE id = ?', [status, claim_id]);
    const [info] = await conn.execute(`SELECT c.item_id, c.claimant_id, i.item_name, u.name AS claimant_name
       FROM claims c JOIN items i ON i.id = c.item_id JOIN users u ON u.id = c.claimant_id WHERE c.id = ?`, [claim_id]);
    const { item_id, claimant_id, item_name, claimant_name } = info[0] || {};

    if (status === 'approved') {
      await conn.execute('UPDATE items SET status = "returned" WHERE id = ?', [item_id]);
      await conn.execute('UPDATE claims SET status = "rejected" WHERE item_id = ? AND status = "pending" AND id != ?', [item_id, claim_id]);
    } else {
      const [pc] = await conn.execute('SELECT COUNT(*) as cnt FROM claims WHERE item_id = ? AND status = "pending"', [item_id]);
      if (pc[0].cnt === 0) await conn.execute('UPDATE items SET status = "available" WHERE id = ?', [item_id]);
    }
    await conn.commit(); conn.release();

    if (status === 'approved') {
      await logActivity('claim_approved', `Claim approved — ${item_name} returned to ${claimant_name}`, 'claim', Number(claim_id), claimant_id ? Number(claimant_id) : null, '#0d9488', req);
    } else {
      await logActivity('claim_rejected', `Claim rejected for ${item_name}`, 'claim', Number(claim_id), claimant_id ? Number(claimant_id) : null, '#dc2626', req);
    }
    res.json({ success: true, message: 'Claim updated successfully.' });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ACTIVITY LOG & USER ROUTES
// ══════════════════════════════════════════════════════════════

// GET /api/activity-logs
app.get('/api/activity-logs', async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const action = req.query.action || null;
  try {
    let sql = `SELECT al.id, al.user_id, al.action, al.description, al.entity_type, al.entity_id,
                      al.color, al.ip_address, al.created_at, u.name AS user_name
                 FROM activity_logs al LEFT JOIN users u ON u.id = al.user_id`;
    const params = [];
    if (action) { sql += ' WHERE al.action = ?'; params.push(action); }
    sql += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(limit);
    const [logs] = await db.execute(sql, params);
    res.json({ success: true, logs, count: logs.length });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// GET /api/user
app.get('/api/user', async (req, res) => {
  let token = (req.query.token || '').trim();
  if (!token) { const auth = req.headers.authorization || ''; const m = auth.match(/^Bearer\s+(.+)$/i); if (m) token = m[1].trim(); }
  if (!token || token.length !== 64 || !/^[0-9a-f]+$/i.test(token)) return res.status(401).json({ error: 'A valid session token is required.' });

  try {
    const [rows] = await db.execute(`SELECT u.id, u.email, u.name, u.role, u.is_verified, u.created_at,
       s.token, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > NOW() LIMIT 1`, [token]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid or expired session.' });
    const r = rows[0];
    res.json({ success: true, user: { id: r.id, email: r.email, name: r.name, role: r.role, is_verified: !!r.is_verified, member_since: r.created_at }, session: { token: r.token, expires_at: r.expires_at } });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  OTP ROUTES (for Gmail verification during claims)
// ══════════════════════════════════════════════════════════════

// POST /api/otp/send
app.post('/api/otp/send', async (req, res) => {
  const email = ((req.body.email || '')).trim().toLowerCase();
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });

  try {
    await db.execute('UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0', [email]);
    const code = String(crypto.randomInt(0, 999999)).padStart(6, '0');
    await db.execute('INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))', [email, code]);

    // Send email via nodemailer
    if (smtpTransporter) {
      const html = `<html><body style="font-family:Arial,sans-serif;background:#0b1430;padding:40px 20px;">
        <div style="max-width:400px;margin:0 auto;background:#111b3c;border-radius:16px;padding:32px;border:1px solid rgba(124,58,237,.3);">
          <div style="text-align:center;margin-bottom:24px;"><div style="display:inline-block;background:linear-gradient(135deg,#1a56db,#7c3aed,#d946ef);border-radius:12px;padding:10px 14px;">
            <span style="color:#fff;font-size:18px;font-weight:bold;">&#9733; FoundWise</span></div></div>
          <h2 style="color:#f1f5f9;text-align:center;margin:0 0 8px;">Verification Code</h2>
          <p style="color:#94a3b8;text-align:center;font-size:14px;margin:0 0 24px;">Enter this code to verify your identity</p>
          <div style="background:rgba(124,58,237,.15);border:2px solid rgba(124,58,237,.4);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
            <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#c4b5fd;">${code}</span></div>
          <p style="color:#64748b;text-align:center;font-size:12px;margin:0;">This code expires in <strong>10 minutes</strong>.<br>If you did not request this, please ignore this email.</p>
        </div></body></html>`;
      try { await smtpTransporter.sendMail({ from: `"FoundWise" <${GMAIL_USER}>`, to: email, subject: 'FoundWise - Your Verification Code: ' + code, html }); }
      catch (mailErr) { console.error('[OTP] Email failed:', mailErr.message); }
    }
    res.json({ success: true, message: 'Verification code sent to ' + email });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// POST /api/otp/check
app.post('/api/otp/check', async (req, res) => {
  const email = ((req.body.email || '')).trim().toLowerCase();
  const code = (req.body.code || '').trim();
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!code || code.length !== 6) return res.status(400).json({ error: 'A 6-digit code is required.' });

  try {
    const [rows] = await db.execute('SELECT id FROM otp_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1', [email, code]);
    if (!rows.length) return res.status(400).json({ error: 'Invalid or expired code. Please try again.' });
    await db.execute('UPDATE otp_codes SET used = 1 WHERE id = ?', [rows[0].id]);
    res.json({ success: true, message: 'Email verified successfully.', verified: true });
  } catch (e) { res.status(500).json({ error: 'Database error: ' + e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  EXISTING CLAIM NOTIFICATION ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/claim/notify
app.post('/api/claim/notify', async (req, res) => {
  const { studentEmail, itemName, claimDate } = req.body;
  if (!studentEmail || !itemName) return res.status(400).json({ error: 'studentEmail and itemName are required.' });
  const result = await sendClaimNotification({ studentEmail, itemName, claimDate: claimDate || new Date().toISOString() });
  if (!result.success) return res.status(502).json({ success: false, error: 'Notification email could not be sent.', detail: result.error });
  res.json({ success: true, refNumber: result.refNumber, message: `Claim notification sent to ${studentEmail}.` });
});

// ── Catch-all: serve login.html for SPA routing ───────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ── Start server ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  FoundWise server running at http://localhost:${PORT}`);
  console.log(`    CORS origin : ${allowedOrigin}\n`);
});
