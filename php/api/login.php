<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — POST /api/login.php
//  Checks that the user exists and is verified.
//  Creates (or refreshes) a session token.
//  Since FoundWise uses OTP, "login" = "request a new OTP send".
//  This endpoint validates the user is known before OTP is sent.
//
//  Request  : POST application/json
//             { "email": "user@example.com" }
//  Response : 200 { "success": true, "user_id": 5, "is_verified": true }
//           : 400/404 { "error": "..." }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed. Use POST.'], 405);
}

// ── Parse & validate ──────────────────────────────────────────
$body     = getRequestBody();
$email    = trim(strtolower($body['email'] ?? ''));
$password = $body['password'] ?? '';

if (!$email || !isValidEmail($email)) {
    jsonResponse(['error' => 'A valid email address is required.'], 400);
}

$db = getDB();

try {
    // ── Look up user ──────────────────────────────────────────
    $stmt = $db->prepare(
        'SELECT id, email, name, password_hash, role, is_verified FROM users WHERE email = ? LIMIT 1'
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(['error' => 'No account found with this email. Please create one.'], 404);
    }

    // ── Verify password ─────────────────────────────────────────
    if (!$password) {
        jsonResponse(['error' => 'Please enter your password.'], 400);
    }

    if (!$user['password_hash']) {
        // Account created via Google — no password set
        jsonResponse(['error' => 'This account uses Google sign-in. Please use the Google button.'], 400);
    }

    if (!password_verify($password, $user['password_hash'])) {
        jsonResponse(['error' => 'Incorrect password. Please try again.'], 401);
    }

    // ── Log the login attempt ─────────────────────────────────
    $db->prepare(
        'INSERT INTO otp_logs (email, action, ip_address, user_agent) VALUES (?, ?, ?, ?)'
    )->execute([
        $email,
        'send',
        getClientIp(),
        substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500),
    ]);

    jsonResponse([
        'success'     => true,
        'user_id'     => (int) $user['id'],
        'is_verified' => (bool) $user['is_verified'],
        'name'        => $user['name'],
        'role'        => $user['role'],
        'message'     => 'User found. Proceed with OTP.',
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
