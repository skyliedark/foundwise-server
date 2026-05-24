<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — POST /api/send_otp.php
//  Generates a 6-digit OTP, stores it in MySQL, and emails it.
//  Uses PHP mail() via XAMPP sendmail — no external API needed.
//
//  Request  : POST { "email": "user@gmail.com" }
//  Response : 200 { "success": true }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$body  = getRequestBody();
$email = trim(strtolower($body['email'] ?? ''));

if (!$email || !isValidEmail($email)) {
    jsonResponse(['error' => 'A valid email is required.'], 400);
}

$db = getDB();

try {
    // Invalidate any previous unused codes for this email
    $db->prepare('UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0')
       ->execute([$email]);

    // Generate 6-digit code
    $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

    // Store with 10-minute expiry
    $stmt = $db->prepare(
        'INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))'
    );
    $stmt->execute([$email, $code]);

    // Send email
    $to      = $email;
    $subject = 'FoundWise - Your Verification Code: ' . $code;
    $message = '
    <html>
    <body style="font-family:Arial,sans-serif;background:#0b1430;padding:40px 20px;">
      <div style="max-width:400px;margin:0 auto;background:#111b3c;border-radius:16px;padding:32px;border:1px solid rgba(124,58,237,.3);">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:linear-gradient(135deg,#1a56db,#7c3aed,#d946ef);border-radius:12px;padding:10px 14px;">
            <span style="color:#fff;font-size:18px;font-weight:bold;">&#9733; FoundWise</span>
          </div>
        </div>
        <h2 style="color:#f1f5f9;text-align:center;margin:0 0 8px;">Verification Code</h2>
        <p style="color:#94a3b8;text-align:center;font-size:14px;margin:0 0 24px;">Enter this code to verify your identity</p>
        <div style="background:rgba(124,58,237,.15);border:2px solid rgba(124,58,237,.4);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
          <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#c4b5fd;">' . $code . '</span>
        </div>
        <p style="color:#64748b;text-align:center;font-size:12px;margin:0;">This code expires in <strong>10 minutes</strong>.<br>If you did not request this, please ignore this email.</p>
      </div>
    </body>
    </html>';

    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= "From: FoundWise <noreply@foundwise.com>\r\n";

    $sent = @mail($to, $subject, $message, $headers);

    if (!$sent) {
        // mail() failed — log it but still tell user to check email
        error_log("FoundWise: mail() failed for $email with code $code");
    }

    jsonResponse([
        'success' => true,
        'message' => 'Verification code sent to ' . $email . '. Check your inbox (and spam folder).',
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
