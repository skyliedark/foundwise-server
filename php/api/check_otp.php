<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — POST /api/check_otp.php
//  Verifies a 6-digit OTP against the stored code in MySQL.
//
//  Request  : POST { "email": "user@gmail.com", "code": "123456" }
//  Response : 200 { "success": true }
//           : 400 { "error": "Invalid or expired code." }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$body  = getRequestBody();
$email = trim(strtolower($body['email'] ?? ''));
$code  = trim($body['code'] ?? '');

if (!$email || !isValidEmail($email)) {
    jsonResponse(['error' => 'A valid email is required.'], 400);
}
if (!$code || strlen($code) !== 6) {
    jsonResponse(['error' => 'A 6-digit code is required.'], 400);
}

$db = getDB();

try {
    // Find matching, unused, non-expired code
    $stmt = $db->prepare(
        'SELECT id FROM otp_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1'
    );
    $stmt->execute([$email, $code]);
    $row = $stmt->fetch();

    if (!$row) {
        jsonResponse(['error' => 'Invalid or expired code. Please try again.'], 400);
    }

    // Mark as used
    $db->prepare('UPDATE otp_codes SET used = 1 WHERE id = ?')
       ->execute([$row['id']]);

    jsonResponse([
        'success'  => true,
        'message'  => 'Email verified successfully.',
        'verified' => true,
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
