<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — Activity Log Helper
//  Reusable function to insert rows into the activity_logs table.
//  Include this file from any endpoint that needs to log events.
// ═══════════════════════════════════════════════════════════════

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

/**
 * Insert a new activity log row.
 *
 * @param string      $action       Machine-readable key (e.g. item_reported)
 * @param string      $description  Human-readable sentence for the UI
 * @param string|null $entityType   Related entity type (item, claim, report, user)
 * @param int|null    $entityId     PK of the related entity
 * @param int|null    $userId       The user who triggered the action
 * @param string      $color        Timeline dot color
 */
function logActivity(
    string  $action,
    string  $description,
    ?string $entityType = null,
    ?int    $entityId   = null,
    ?int    $userId     = null,
    string  $color      = '#1C5C38'
): void {
    try {
        $db = getDB();
        $stmt = $db->prepare(
            'INSERT INTO activity_logs (user_id, action, description, entity_type, entity_id, color, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $action,
            $description,
            $entityType,
            $entityId,
            $color,
            getClientIp()
        ]);
    } catch (\PDOException $e) {
        // Activity logging is best-effort — never break the parent operation
        error_log('[FoundWise] Activity log insert failed: ' . $e->getMessage());
    }
}
