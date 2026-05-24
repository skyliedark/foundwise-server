<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/log_activity.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed. Use POST.'], 405);
}

$body = getRequestBody();
$user_id = $body['user_id'] ?? null;
$type = $body['type'] ?? 'found';
$item_name = trim($body['name'] ?? '');
$description = trim($body['description'] ?? '');
$category = trim($body['category'] ?? '');
$location_found = trim($body['location'] ?? '');

if (!$user_id || !$item_name || !$category || !$location_found) {
    jsonResponse(['error' => 'Missing required fields.'], 400);
}

$catMap = [
    'Electronics' => 'Electronics',
    'Bags' => 'Personal',
    'Accessories' => 'Accessories',
    'Documents / IDs' => 'Documents',
    'Keys' => 'Personal',
    'Clothing' => 'Clothing',
    'Others' => 'Other'
];
$dbCategory = $catMap[$category] ?? 'Other';

$db = getDB();

try {
    $stmt = $db->prepare(
        'INSERT INTO items (user_id, type, item_name, description, category, location_found, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$user_id, $type, $item_name, $description, $dbCategory, $location_found, 'available']);
    $itemId = (int) $db->lastInsertId();

    // ── Auto-log this activity ──────────────────────────────
    logActivity(
        'item_reported',
        "New item reported ({$type}): {$item_name} at {$location_found}",
        'item',
        $itemId,
        (int) $user_id,
        '#1C5C38'
    );

    jsonResponse([
        'success' => true,
        'item_id' => $itemId,
        'message' => 'Item reported successfully.',
    ], 201);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}

