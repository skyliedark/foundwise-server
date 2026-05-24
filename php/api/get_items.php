<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

$db = getDB();

try {
    $stmt = $db->query('
        SELECT i.id, i.item_name as name, i.description, i.category, i.location_found as location, 
               i.image_url, i.status, i.type, i.created_at as date, u.name as reporter 
        FROM items i 
        LEFT JOIN users u ON i.user_id = u.id 
        ORDER BY i.created_at ASC
    ');
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Map DB rows to the frontend format
    $mapped = array_map(function($i) {
        return [
            'id' => 'item-' . $i['id'],
            'num' => $i['id'],
            'name' => $i['name'],
            'category' => $i['category'],
            'location' => $i['location'],
            'date' => $i['date'],
            'description' => $i['description'],
            'reporter' => $i['reporter'] ?: 'Unknown',
            'status' => $i['status'],
            'type' => $i['type'],
            'ts' => strtotime($i['date']) * 1000
        ];
    }, $items);

    jsonResponse([
        'success' => true,
        'items' => $mapped
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
