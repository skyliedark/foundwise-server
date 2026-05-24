// ═══════════════════════════════════════════════════════════════
//  FoundWise — Gmail Claim Notification Mailer
//  Sends a professional HTML receipt email when a claim is
//  approved and the item status is set to "Claimed".
// ═══════════════════════════════════════════════════════════════
'use strict';

const nodemailer = require('nodemailer');

// ── Validate required Gmail env vars ───────────────────────────
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.warn(
    '\n⚠️  [Mailer] GMAIL_USER or GMAIL_APP_PASSWORD is not set in .env.\n' +
    '   Claim notification emails will not be sent.\n'
  );
}

// ── Create the reusable Gmail SMTP transporter ─────────────────
// Uses an App Password (not your real Gmail password).
// Generate one at: Google Account → Security → App Passwords
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,        // SSL on port 465
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
  // Reject unauthorised certs in production; set false only for local testing
  tls: { rejectUnauthorized: true },
});

// ── Verify transporter once at startup (optional but helpful) ──
transporter.verify((err) => {
  if (err) {
    console.warn('[Mailer] ⚠️  Gmail SMTP transporter failed verification:', err.message);
  } else {
    console.log('[Mailer] ✅  Gmail SMTP transporter is ready.');
  }
});

// ── Helper: generate a short, human-readable reference number ──
function generateRefNumber() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FW-${ts}-${rand}`;
}

// ── Helper: format a Date object to a readable string ──────────
function formatDate(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput); // fallback
  return d.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// ══════════════════════════════════════════════════════════════
//  sendClaimNotification({ studentEmail, itemName, claimDate })
//
//  Call this function AFTER your SQL UPDATE sets the claim/item
//  status to "Claimed" / "Returned" and the query succeeds.
//
//  Returns: { success: boolean, refNumber?: string, error?: string }
// ══════════════════════════════════════════════════════════════
async function sendClaimNotification({ studentEmail, itemName, claimDate }) {
  // ── Guard: mailer not configured ──────────────────────────
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn('[Mailer] Skipping email — credentials not configured.');
    return { success: false, error: 'Mailer credentials not configured.' };
  }

  // ── Guard: validate inputs ─────────────────────────────────
  if (!studentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
    return { success: false, error: 'Invalid student email address.' };
  }
  if (!itemName || typeof itemName !== 'string') {
    return { success: false, error: 'itemName is required.' };
  }

  const refNumber    = generateRefNumber();
  const formattedDate = formatDate(claimDate || new Date());
  const safeItem     = itemName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeEmail    = studentEmail.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ── HTML Email Template ────────────────────────────────────
  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FoundWise — Item Claimed</title>
</head>
<body style="margin:0; padding:0; background-color:#0f1117; font-family:'Segoe UI', Roboto, Arial, sans-serif;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#0f1117; padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px; width:100%; background:#1a1d27;
                      border-radius:16px; overflow:hidden;
                      border:1px solid rgba(255,255,255,0.08);">

          <!-- ── Header / Hero ── -->
          <tr>
            <td style="background:linear-gradient(135deg,#6c63ff 0%,#3ecfcf 100%);
                        padding:40px 40px 36px; text-align:center;">

              <!-- Logo placeholder: swap the src for your real logo URL -->
              <div style="margin-bottom:16px;">
                <div style="display:inline-block;
                            background:rgba(255,255,255,0.15);
                            border-radius:14px; padding:10px 20px;">
                  <span style="font-size:26px; font-weight:800; letter-spacing:-0.5px;
                               color:#ffffff; font-family:'Segoe UI',sans-serif;">
                    🔍 FoundWise
                  </span>
                </div>
              </div>

              <!-- Success badge -->
              <div style="display:inline-block;
                          background:rgba(255,255,255,0.2);
                          border-radius:50px; padding:6px 18px;
                          font-size:13px; font-weight:600;
                          color:#ffffff; letter-spacing:0.5px;
                          margin-bottom:20px;">
                ✅ &nbsp; ITEM SUCCESSFULLY CLAIMED
              </div>

              <h1 style="margin:0; font-size:28px; font-weight:700;
                         color:#ffffff; line-height:1.3;">
                Great news! Your item<br/>has been claimed.
              </h1>
              <p style="margin:12px 0 0; font-size:15px; color:rgba(255,255,255,0.8);">
                Please keep this email as your official receipt.
              </p>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:36px 40px;">

              <!-- Greeting -->
              <p style="margin:0 0 24px; font-size:16px; color:#c9cde0; line-height:1.6;">
                Hi there,
              </p>
              <p style="margin:0 0 28px; font-size:16px; color:#c9cde0; line-height:1.6;">
                Your claim for the item listed below has been
                <strong style="color:#6c63ff;">approved and marked as Claimed</strong>
                in the FoundWise system. You may now proceed to the
                Lost &amp; Found office to collect your item.
              </p>

              <!-- Details card -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="background:#12151f; border-radius:12px;
                            border:1px solid rgba(108,99,255,0.3);
                            margin-bottom:28px;">
                <tr>
                  <td style="padding:28px 28px 10px;">
                    <p style="margin:0 0 4px; font-size:11px; font-weight:700;
                               color:#6c63ff; letter-spacing:1.2px; text-transform:uppercase;">
                      Item Details
                    </p>
                  </td>
                </tr>

                <!-- Item Name -->
                <tr>
                  <td style="padding:6px 28px 6px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
                          <span style="font-size:13px; color:#7a7f99;">Item&nbsp;Name</span><br/>
                          <span style="font-size:17px; font-weight:600; color:#e8eaf6;">${safeItem}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Claimed By -->
                <tr>
                  <td style="padding:6px 28px 6px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
                          <span style="font-size:13px; color:#7a7f99;">Claimed&nbsp;By</span><br/>
                          <span style="font-size:15px; font-weight:500; color:#e8eaf6;">${safeEmail}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Date & Time -->
                <tr>
                  <td style="padding:6px 28px 6px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
                          <span style="font-size:13px; color:#7a7f99;">Date&nbsp;&amp;&nbsp;Time</span><br/>
                          <span style="font-size:15px; font-weight:500; color:#e8eaf6;">${formattedDate}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Reference Number -->
                <tr>
                  <td style="padding:6px 28px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:12px 0;">
                          <span style="font-size:13px; color:#7a7f99;">Reference&nbsp;Number</span><br/>
                          <span style="font-size:18px; font-weight:700; color:#3ecfcf;
                                       letter-spacing:1px; font-family:monospace;">
                            ${refNumber}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="background:rgba(108,99,255,0.1); border-radius:10px;
                            border-left:4px solid #6c63ff; margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0; font-size:14px; color:#a8adc8; line-height:1.6;">
                      <strong style="color:#c9cde0;">📌 Next Step:</strong>&nbsp;
                      Bring this email (or your reference number
                      <strong style="color:#3ecfcf;">${refNumber}</strong>)
                      to the Lost &amp; Found office as your digital receipt.
                      This confirms your ownership of the claimed item.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <div style="text-align:center; margin-bottom:32px;">
                <a href="http://localhost/foundwise"
                   style="display:inline-block; padding:14px 36px;
                          background:linear-gradient(135deg,#6c63ff,#3ecfcf);
                          color:#ffffff; font-size:15px; font-weight:600;
                          text-decoration:none; border-radius:8px;
                          letter-spacing:0.3px;">
                  View My Claims on FoundWise
                </a>
              </div>

              <!-- Divider -->
              <hr style="border:none; border-top:1px solid rgba(255,255,255,0.07); margin:0 0 24px;" />

              <!-- Footer note -->
              <p style="margin:0; font-size:13px; color:#555a75; line-height:1.6; text-align:center;">
                If you did not initiate this claim or believe this is a mistake,
                please contact your campus Lost &amp; Found office immediately.<br/><br/>
                <strong style="color:#6c63ff;">FoundWise</strong> — Lost &amp; Found Management System<br/>
                This is an automated message. Please do not reply to this email.
              </p>

            </td>
          </tr>

          <!-- ── Footer strip ── -->
          <tr>
            <td style="background:#12151f; padding:18px 40px; text-align:center;
                        border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0; font-size:12px; color:#3d4159;">
                © ${new Date().getFullYear()} FoundWise &nbsp;|&nbsp; School Lost &amp; Found System
              </p>
            </td>
          </tr>

        </table>
        <!-- /Email card -->

      </td>
    </tr>
  </table>

</body>
</html>
  `.trim();

  // ── Plain-text fallback ────────────────────────────────────
  const textBody = [
    'FoundWise — Item Claimed Confirmation',
    '======================================',
    '',
    `Item Name     : ${itemName}`,
    `Claimed By    : ${studentEmail}`,
    `Date & Time   : ${formattedDate}`,
    `Reference No. : ${refNumber}`,
    '',
    'Please bring this reference number to the Lost & Found office',
    'as your digital receipt.',
    '',
    '© FoundWise — Automated Notification. Do not reply.',
  ].join('\n');

  // ── Build the mail options ─────────────────────────────────
  const mailOptions = {
    from    : `"FoundWise System" <${GMAIL_USER}>`,
    to      : studentEmail,
    subject : `[FoundWise] Success: Your lost item (${itemName}) has been claimed`,
    text    : textBody,
    html    : htmlBody,
  };

  // ── Send & return result ───────────────────────────────────
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Mailer] ✅  Claim notification sent to ${studentEmail}. MessageId: ${info.messageId}`);
    return { success: true, refNumber, messageId: info.messageId };

  } catch (err) {
    // Always log the full error server-side; return a clean summary to the caller
    console.error(`[Mailer] ❌  Failed to send claim notification to ${studentEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendClaimNotification };
