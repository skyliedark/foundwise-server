<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';

handlePreflight();

$db = getDB();

try {
    $stmt = $db->query('
        SELECT c.id, c.item_id, c.claimant_id, c.student_id, c.gmail, c.proof_text as proof, 
               c.status, c.created_at as ts, u.name as claimant 
        FROM claims c 
        LEFT JOIN users u ON c.claimant_id = u.id 
        ORDER BY c.created_at ASC
    ');
    $claims = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $mapped = array_map(function($c) {
        return [
            'id' => 'claim-' . $c['id'],
            'itemId' => 'item-' . $c['item_id'],
            'claimant' => $c['claimant'] ?: 'Unknown',
            'sid' => $c['student_id'],
            'gmailEmail' => $c['gmail'],
            'gmailVerified' => true,
            'proof' => $c['proof'],
            'status' => $c['status'],
            'ts' => strtotime($c['ts']) * 1000
        ];
    }, $claims);

    jsonResponse([
        'success' => true,
        'claims' => $mapped
    ]);

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}
