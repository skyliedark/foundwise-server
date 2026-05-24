<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — POST /api/register.php
//  Registers a new user (email + optional name).
//  Creates the user row with is_verified = 0.
//  The OTP step handled by Node.js will later mark them verified.
//
//  Request  : POST application/json
//             { "email": "user@example.com", "name": "John Doe" }
//  Response : 201 { "success": true, "user_id": 5, "message": "..." }
//           : 400 { "error": "..." }
//           : 409 { "error": "Email already registered." }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed. Use POST.'], 405);
}

// ── Parse & validate body ─────────────────────────────────────
$body     = getRequestBody();
$email    = trim(strtolower($body['email'] ?? ''));
$name     = trim($body['name'] ?? '');
$password = $body['password'] ?? '';
$role     = trim($body['role'] ?? 'student');
$allowed_roles = ['student', 'front_desk', 'admin'];
if (!in_array($role, $allowed_roles)) { $role = 'student'; }

if (!$email || !isValidEmail($email)) {
    jsonResponse(['error' => 'A valid email address is required.'], 400);
}
if ($name && strlen($name) > 150) {
    jsonResponse(['error' => 'Name must be 150 characters or fewer.'], 400);
}
$passHash = $password ? password_hash($password, PASSWORD_BCRYPT) : null;

// ── Insert into DB ────────────────────────────────────────────
$db = getDB();

try {
    // Check if email already exists
    $stmt = $db->prepare('SELECT id, is_verified FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $existing = $stmt->fetch();

    if ($existing) {
        if ($existing['is_verified']) {
            jsonResponse(['error' => 'Email already registered and verified. Please log in.'], 409);
        }
        // Exists but not yet verified — return their existing user_id so OTP can proceed
        jsonResponse([
            'success' => true,
            'user_id' => (int) $existing['id'],
            'message' => 'Account exists but is not verified. Please verify your email.',
            'already_exists' => true,
        ], 200);
    }

    $stmt = $db->prepare(
        'INSERT INTO users (email, name, role, password_hash, is_verified) VALUES (?, ?, ?, ?, 0)'
    );
    $stmt->execute([$email, $name ?: null, $role, $passHash]);
    $userId = (int) $db->lastInsertId();

    jsonResponse([
        'success' => true,
        'user_id' => $userId,
        'message' => 'Registration successful. Please verify your email with the OTP.',
    ], 201);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
