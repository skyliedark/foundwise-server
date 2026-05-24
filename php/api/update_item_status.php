<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/log_activity.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed. Use POST.'], 405);
}

$body = getRequestBody();
$item_id = $body['itemId'] ?? '';
$status = $body['status'] ?? '';

// Strip "item-" prefix if present
$item_id = str_replace('item-', '', $item_id);

$validStatuses = ['found', 'lost', 'pending', 'returned', 'claimed'];
if (!$item_id || !in_array($status, $validStatuses)) {
    jsonResponse(['error' => 'Invalid parameters. Provide itemId and a valid status.'], 400);
}

$db = getDB();

try {
    // Get item name and current status
    $stmt = $db->prepare('SELECT item_name, status FROM items WHERE id = ?');
    $stmt->execute([$item_id]);
    $item = $stmt->fetch();

    if (!$item) {
        jsonResponse(['error' => 'Item not found.'], 404);
    }

    $oldStatus = $item['status'];
    $itemName = $item['item_name'] ?? 'Unknown item';

    if ($oldStatus === $status) {
        jsonResponse(['success' => true, 'message' => 'Status unchanged.']);
    }

    // Update item status
    $stmt = $db->prepare('UPDATE items SET status = ? WHERE id = ?');
    $stmt->execute([$status, $item_id]);

    // Determine user_id from request if available
    $userId = isset($body['user_id']) ? (int) $body['user_id'] : null;

    // Log the activity
    $colorMap = [
        'found' => '#16a34a',
        'lost' => '#dc2626',
        'pending' => '#d97706',
        'returned' => '#0d9488',
        'claimed' => '#C5E938'
    ];
    $color = $colorMap[$status] ?? '#1C5C38';

    logActivity(
        'item_status_changed',
        "Item \"{$itemName}\" status changed from {$oldStatus} to {$status}",
        'item',
        (int) $item_id,
        $userId,
        $color
    );

    jsonResponse([
        'success' => true,
        'message' => 'Item status updated successfully.',
        'oldStatus' => $oldStatus,
        'newStatus' => $status
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
