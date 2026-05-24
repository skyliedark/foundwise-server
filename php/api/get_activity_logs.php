<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — GET /api/get_activity_logs.php
//  Returns the most recent activity log entries.
//  Query params:
//    ?limit=50  (default 50, max 200)
//    ?action=claim_approved  (optional filter)
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

$limit  = min(200, max(1, (int) ($_GET['limit'] ?? 50)));
$action = $_GET['action'] ?? null;

$db = getDB();

try {
    $sql    = 'SELECT al.id, al.user_id, al.action, al.description, al.entity_type, al.entity_id,
                      al.color, al.ip_address, al.created_at,
                      u.name AS user_name
                 FROM activity_logs al
            LEFT JOIN users u ON u.id = al.user_id';
    $params = [];

    if ($action) {
        $sql .= ' WHERE al.action = ?';
        $params[] = $action;
    }

    $sql .= ' ORDER BY al.created_at DESC LIMIT ?';
    $params[] = $limit;

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'logs'    => $logs,
        'count'   => count($logs),
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
