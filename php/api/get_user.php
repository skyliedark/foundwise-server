<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — GET /api/get_user.php?token=<session_token>
//  Returns the authenticated user's profile for a valid token.
//
//  Request  : GET ?token=<64-char-hex>
//             OR Authorization: Bearer <token> header
//  Response : 200 { "success": true, "user": {...} }
//           : 401 { "error": "Invalid or expired session." }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed. Use GET.'], 405);
}

// ── Extract token from query string or Authorization header ───
$token = $_GET['token'] ?? '';

if (!$token) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        $token = $m[1];
    }
}

$token = trim($token);

if (!$token || strlen($token) !== 64 || !ctype_xdigit($token)) {
    jsonResponse(['error' => 'A valid session token is required.'], 401);
}

$db = getDB();

try {
    // ── Join sessions + users, check expiry ───────────────────
    $stmt = $db->prepare(
        'SELECT u.id, u.email, u.name, u.role, u.is_verified, u.created_at,
                s.token, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?
           AND s.expires_at > NOW()
         LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();

    if (!$row) {
        jsonResponse(['error' => 'Invalid or expired session. Please log in again.'], 401);
    }

    jsonResponse([
        'success' => true,
        'user' => [
            'id'          => (int) $row['id'],
            'email'       => $row['email'],
            'name'        => $row['name'],
            'role'        => $row['role'],
            'is_verified' => (bool) $row['is_verified'],
            'member_since'=> $row['created_at'],
        ],
        'session' => [
            'token'      => $row['token'],
            'expires_at' => $row['expires_at'],
        ],
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
