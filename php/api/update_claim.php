<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/log_activity.php';

handlePreflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed. Use POST.'], 405);
}

$body = getRequestBody();
$claim_id = str_replace('claim-', '', $body['claimId'] ?? '');
$status = $body['status'] ?? '';

if (!$claim_id || !in_array($status, ['approved', 'rejected'])) {
    jsonResponse(['error' => 'Invalid parameters.'], 400);
}

$db = getDB();

try {
    $db->beginTransaction();

    // Update claim status
    $stmt = $db->prepare('UPDATE claims SET status = ? WHERE id = ?');
    $stmt->execute([$status, $claim_id]);

    // Get item_id, item_name, claimant name for this claim
    $stmt = $db->prepare(
        'SELECT c.item_id, c.claimant_id, i.item_name, u.name AS claimant_name
           FROM claims c
           JOIN items i ON i.id = c.item_id
           JOIN users u ON u.id = c.claimant_id
          WHERE c.id = ?'
    );
    $stmt->execute([$claim_id]);
    $claim = $stmt->fetch();
    $item_id      = $claim['item_id'];
    $itemName     = $claim['item_name']     ?? 'Unknown item';
    $claimantName = $claim['claimant_name'] ?? 'Unknown user';
    $claimantId   = $claim['claimant_id']   ?? null;

    if ($status === 'approved') {
        // Update item status to returned
        $stmt = $db->prepare('UPDATE items SET status = "returned" WHERE id = ?');
        $stmt->execute([$item_id]);
        
        // Reject all other pending claims for this item
        $stmt = $db->prepare('UPDATE claims SET status = "rejected" WHERE item_id = ? AND status = "pending" AND id != ?');
        $stmt->execute([$item_id, $claim_id]);

    } else if ($status === 'rejected') {
        // Check if there are any other pending claims
        $stmt = $db->prepare('SELECT COUNT(*) FROM claims WHERE item_id = ? AND status = "pending"');
        $stmt->execute([$item_id]);
        $pending_count = $stmt->fetchColumn();

        if ($pending_count == 0) {
            // Revert item status to available if no other pending claims
            $stmt = $db->prepare('UPDATE items SET status = "available" WHERE id = ?');
            $stmt->execute([$item_id]);
        }
    }

    $db->commit();

    // ── Auto-log this activity ──────────────────────────────
    if ($status === 'approved') {
        logActivity(
            'claim_approved',
            "Claim approved — {$itemName} returned to {$claimantName}",
            'claim',
            (int) $claim_id,
            $claimantId ? (int) $claimantId : null,
            '#0d9488'
        );
    } else {
        logActivity(
            'claim_rejected',
            "Claim rejected for {$itemName}",
            'claim',
            (int) $claim_id,
            $claimantId ? (int) $claimantId : null,
            '#dc2626'
        );
    }

    jsonResponse([
        'success' => true,
        'message' => 'Claim updated successfully.'
    ]);

} catch (PDOException $e) {
    $db->rollBack();
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
}

