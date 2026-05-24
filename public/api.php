<?php
// ═══════════════════════════════════════════════════════════════
//  FoundWise — Didit OTP Proxy (api.php)
//  The frontend JS calls this to send/verify OTPs via Didit.
//  Keeps the API key on the server side.
// ═══════════════════════════════════════════════════════════════

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Config ────────────────────────────────────────────────────
$DIDIT_API_KEY  = 'FkUH95i9_nyq5ZqdLv3Swmjds7AHlPZ_VqVc3ldTL34';
$DIDIT_BASE_URL = 'https://verification.didit.me';

// ── Parse request ─────────────────────────────────────────────
$input = json_decode(file_get_contents('php://input'), true);
if (!$input || empty($input['endpoint'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing endpoint']);
    exit;
}

$endpoint = $input['endpoint'];
$payload  = $input['payload'] ?? [];

// ── Whitelist allowed endpoints ───────────────────────────────
$allowed = ['/v3/email/send/', '/v3/email/check/'];
if (!in_array($endpoint, $allowed)) {
    http_response_code(403);
    echo json_encode(['error' => 'Endpoint not allowed']);
    exit;
}

// ── Forward to Didit ──────────────────────────────────────────
$ch = curl_init($DIDIT_BASE_URL . $endpoint);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'x-api-key: ' . $DIDIT_API_KEY,
    ],
    CURLOPT_TIMEOUT => 15,
]);

$response   = curl_exec($ch);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError  = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode(['error' => 'Could not reach verification service: ' . $curlError]);
    exit;
}

http_response_code($httpCode);
echo $response ?: json_encode(['error' => 'Empty response from Didit']);
