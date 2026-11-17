<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) mkdir($dataDir, 0755, true);

$roomsFile = $dataDir . '/rooms.json';
$usersFile = $dataDir . '/users.json';

function readJson($file) {
    if (!file_exists($file)) return [];
    $decoded = json_decode(file_get_contents($file), true);
    return is_array($decoded) ? $decoded : [];
}

function writeJson($file, $data) {
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
}

$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? [];

if ($action === 'save_profile') {
    $email = strtolower(trim($input['email'] ?? ''));
    if ($email !== '') {
        $users = readJson($usersFile);
        $users[$email] = $input;
        writeJson($usersFile, $users);
    }
    echo json_encode(['ok' => true]);
    exit;
}

$rooms = readJson($roomsFile);
$now = time();
foreach ($rooms as $code => $room) {
    if (($now - ($room['updatedAt'] ?? $now)) > 1800) unset($rooms[$code]);
}

if ($action === 'create') {
    $player = $input['player'] ?? null;
    if (!$player || empty($player['id'])) {
        echo json_encode(['ok' => false, 'msg' => 'Jugador inválido']);
        exit;
    }
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $code = '';
    for ($i = 0; $i < 5; $i++) $code .= $chars[random_int(0, strlen($chars) - 1)];

    $rooms[$code] = [
        'code' => $code,
        'hostId' => $player['id'],
        'status' => 'waiting',
        'track' => 'circuit',
        'lapsMiles' => '2-2',
        'updatedAt' => $now,
        'players' => [
            $player['id'] => [
                'id' => $player['id'],
                'name' => $player['name'],
                'color' => $player['color'] ?? '#0284c7',
                'modelId' => $player['modelId'] ?? 'skyline_gtr',
                'x' => 0, 'z' => 0, 'heading' => 0, 'speed' => 0, 'lap' => 1
            ]
        ]
    ];
    writeJson($roomsFile, $rooms);
    echo json_encode(['ok' => true, 'room' => $rooms[$code]]);
    exit;
}

if ($action === 'join') {
    $code = strtoupper(trim($input['code'] ?? ''));
    $player = $input['player'] ?? null;
    if (!isset($rooms[$code])) {
        echo json_encode(['ok' => false, 'msg' => 'Código de sala no encontrado.']);
        exit;
    }
    if (count($rooms[$code]['players']) >= 6 && !isset($rooms[$code]['players'][$player['id']])) {
        echo json_encode(['ok' => false, 'msg' => 'Sala llena (máx. 6 jugadores).']);
        exit;
    }
    $rooms[$code]['players'][$player['id']] = [
        'id' => $player['id'],
        'name' => $player['name'],
        'color' => $player['color'] ?? '#38bdf8',
        'modelId' => $player['modelId'] ?? 'skyline_gtr',
        'x' => 0, 'z' => 0, 'heading' => 0, 'speed' => 0, 'lap' => 1
    ];
    $rooms[$code]['updatedAt'] = $now;
    writeJson($roomsFile, $rooms);
    echo json_encode(['ok' => true, 'room' => $rooms[$code]]);
    exit;
}

if ($action === 'sync') {
    $code = strtoupper(trim($input['code'] ?? ''));
    $playerId = $input['playerId'] ?? '';
    if (!isset($rooms[$code])) {
        echo json_encode(['ok' => false]);
        exit;
    }
    if (!empty($input['startRace'])) {
        $rooms[$code]['status'] = 'racing';
        if (!empty($input['track'])) $rooms[$code]['track'] = $input['track'];
        if (!empty($input['lapsMiles'])) $rooms[$code]['lapsMiles'] = $input['lapsMiles'];
    }
    if (isset($input['state']) && isset($rooms[$code]['players'][$playerId])) {
        $st = $input['state'];
        $rooms[$code]['players'][$playerId]['x'] = floatval($st['x'] ?? 0);
        $rooms[$code]['players'][$playerId]['z'] = floatval($st['z'] ?? 0);
        $rooms[$code]['players'][$playerId]['heading'] = floatval($st['heading'] ?? 0);
        $rooms[$code]['players'][$playerId]['speed'] = floatval($st['speed'] ?? 0);
        $rooms[$code]['players'][$playerId]['lap'] = intval($st['lap'] ?? 1);
    }
    $rooms[$code]['updatedAt'] = $now;
    writeJson($roomsFile, $rooms);
    echo json_encode(['ok' => true, 'room' => $rooms[$code]]);
    exit;
}

if ($action === 'leave') {
    $code = strtoupper(trim($input['code'] ?? ''));
    $playerId = $input['playerId'] ?? '';
    if (isset($rooms[$code]['players'][$playerId])) {
        unset($rooms[$code]['players'][$playerId]);
        if (count($rooms[$code]['players']) === 0) unset($rooms[$code]);
        writeJson($roomsFile, $rooms);
    }
    echo json_encode(['ok' => true]);
    exit;
}

echo json_encode(['ok' => false]);
