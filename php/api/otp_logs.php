<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — GET /api/otp_logs.php
//  Returns the OTP audit log. Admin-only endpoint.
//  Pass a valid admin session token to access.
//
//  Request  : GET ?token=<admin_token>&limit=50&offset=0
//  Response : 200 { "success": true, "logs": [...], "total": N }
//           : 401/403 { "error": "..." }
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed. Use GET.'], 405);
}

// ── Extract token ─────────────────────────────────────────────
$token = trim($_GET['token'] ?? '');

if (!$token) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
        $token = trim($m[1]);
    }
}

if (!$token || strlen($token) !== 64 || !ctype_xdigit($token)) {
    jsonResponse(['error' => 'A valid session token is required.'], 401);
}

$db = getDB();

try {
    // ── Validate token and check admin role ───────────────────
    $stmt = $db->prepare(
        'SELECT u.id, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > NOW()
         LIMIT 1'
    );
    $stmt->execute([$token]);
    $session = $stmt->fetch();

    if (!$session) {
        jsonResponse(['error' => 'Invalid or expired session.'], 401);
    }
    if ($session['role'] !== 'admin') {
        jsonResponse(['error' => 'Access denied. Admin role required.'], 403);
    }

    // ── Pagination params ─────────────────────────────────────
    $limit  = max(1, min(200, (int) ($_GET['limit']  ?? 50)));
    $offset = max(0, (int) ($_GET['offset'] ?? 0));
    $email  = trim($_GET['email'] ?? '');   // optional email filter

    // ── Fetch logs ────────────────────────────────────────────
    $where  = $email ? 'WHERE email = ?' : '';
    $params = $email ? [$email] : [];

    $countStmt = $db->prepare("SELECT COUNT(*) AS total FROM otp_logs $where");
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $logsStmt = $db->prepare(
        "SELECT id, email, action, ip_address, created_at
         FROM otp_logs
         $where
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?"
    );
    $logsStmt->execute(array_merge($params, [$limit, $offset]));
    $logs = $logsStmt->fetchAll();

    jsonResponse([
        'success' => true,
        'total'   => $total,
        'limit'   => $limit,
        'offset'  => $offset,
        'logs'    => $logs,
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
