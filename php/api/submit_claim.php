<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/log_activity.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed. Use POST.'], 405);
}

$body = getRequestBody();
$item_id = str_replace('item-', '', $body['itemId'] ?? '');
$claimant_id = $body['user_id'] ?? null;
$student_id = trim($body['sid'] ?? '');
$gmail = trim($body['gmailEmail'] ?? '');
$proof_text = trim($body['proof'] ?? '');

if (!$item_id || !$claimant_id || !$proof_text) {
    jsonResponse(['error' => 'Missing required fields.'], 400);
}

$db = getDB();

try {
    $db->beginTransaction();

    // Insert claim
    $stmt = $db->prepare('
        INSERT INTO claims (item_id, claimant_id, student_id, gmail, proof_text, status) 
        VALUES (?, ?, ?, ?, ?, "pending")
    ');
    $stmt->execute([$item_id, $claimant_id, $student_id, $gmail, $proof_text]);
    $claimId = (int) $db->lastInsertId();

    // Update item status to pending
    $stmt = $db->prepare('UPDATE items SET status = "pending" WHERE id = ?');
    $stmt->execute([$item_id]);

    // Fetch item name for the activity log
    $stmt = $db->prepare('SELECT item_name FROM items WHERE id = ?');
    $stmt->execute([$item_id]);
    $itemRow = $stmt->fetch();
    $itemName = $itemRow ? $itemRow['item_name'] : 'Unknown item';

    $db->commit();

    // ── Auto-log this activity ──────────────────────────────
    logActivity(
        'claim_submitted',
        "Claim submitted for {$itemName}",
        'claim',
        $claimId,
        (int) $claimant_id,
        '#d97706'
    );

    jsonResponse([
        'success' => true,
        'claim_id' => $claimId,
        'message' => 'Claim submitted successfully.'
    ], 201);

} catch (PDOException $e) {
    $db->rollBack();
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}

