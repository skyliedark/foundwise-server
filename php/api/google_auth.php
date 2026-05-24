<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — POST /api/google_auth.php
//  Handles Google Sign-In: auto-registers new users, logs in existing ones.
//
//  Request  : POST { "email": "...", "name": "...", "google_id": "..." }
//  Response : 200 { "success": true, "user_id": ..., "name": ..., "role": ... }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$body      = getRequestBody();
$email     = trim(strtolower($body['email'] ?? ''));
$name      = trim($body['name'] ?? '');
$googleId  = trim($body['google_id'] ?? '');

if (!$email || !isValidEmail($email)) {
    jsonResponse(['error' => 'Invalid email from Google.'], 400);
}

$db = getDB();

try {
    // Check if user exists
    $stmt = $db->prepare('SELECT id, name, role, is_verified FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user) {
        // Existing user — mark as verified and log them in
        if (!$user['is_verified']) {
            $db->prepare('UPDATE users SET is_verified = 1 WHERE id = ?')->execute([$user['id']]);
        }

        jsonResponse([
            'success'  => true,
            'user_id'  => (int) $user['id'],
            'name'     => $user['name'] ?: $name,
            'role'     => $user['role'] ?: 'student',
            'message'  => 'Signed in with Google.',
        ]);
    } else {
        // New user — auto-register with Google
        $stmt = $db->prepare(
            'INSERT INTO users (email, name, role, is_verified) VALUES (?, ?, ?, 1)'
        );
        $stmt->execute([$email, $name, 'student']);
        $userId = (int) $db->lastInsertId();

        jsonResponse([
            'success'  => true,
            'user_id'  => $userId,
            'name'     => $name,
            'role'     => 'student',
            'message'  => 'Account created with Google.',
        ], 201);
    }

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
