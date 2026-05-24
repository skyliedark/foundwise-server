<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — POST /api/verify_otp.php
//  Called AFTER Node.js confirms OTP is valid with Didit.
//  Marks the user as verified, logs the event, creates a session.
//
//  Request  : POST application/json
//             { "email": "user@example.com" }
//  Response : 200 { "success": true, "token": "...", "user": {...} }
//           : 400/404 { "error": "..." }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed. Use POST.'], 405);
}

// ── Parse & validate body ─────────────────────────────────────
$body  = getRequestBody();
$email = trim(strtolower($body['email'] ?? ''));

if (!$email || !isValidEmail($email)) {
    jsonResponse(['error' => 'A valid email address is required.'], 400);
}

$db = getDB();

try {
    // ── Look up the user ──────────────────────────────────────
    $stmt = $db->prepare('SELECT id, email, name, role FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(['error' => 'No account found for this email. Please register first.'], 404);
    }

    // ── Mark user as verified ─────────────────────────────────
    $db->prepare('UPDATE users SET is_verified = 1 WHERE id = ?')->execute([$user['id']]);

    // ── Log the OTP verify success ────────────────────────────
    $logStmt = $db->prepare(
        'INSERT INTO otp_logs (email, action, ip_address, user_agent) VALUES (?, ?, ?, ?)'
    );
    $logStmt->execute([
        $email,
        'verify_success',
        getClientIp(),
        substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500),
    ]);

    // ── Create session token (24-hour expiry) ─────────────────
    $token     = generateToken();
    $expiresAt = date('Y-m-d H:i:s', strtotime('+24 hours'));

    $db->prepare(
        'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)'
    )->execute([$user['id'], $token, $expiresAt]);

    jsonResponse([
        'success'    => true,
        'token'      => $token,
        'expires_at' => $expiresAt,
        'user'       => [
            'id'    => (int) $user['id'],
            'email' => $user['email'],
            'name'  => $user['name'],
            'role'  => $user['role'],
        ],
        'message' => 'Email verified. Session created.',
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
