// Salas Multijugador con Código Único (PHP InfinityFree + Fallback Local)
const MultiplayerManager = (() => {
  let currentRoom = null;
  let pollInterval = null;
  let onRoomUpdated = null;
  let onRaceStarted = null;

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async function apiCall(action, payload = {}) {
    try {
      const res = await fetch(`api/rooms.php?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('HTTP error');
      return await res.json();
    } catch (err) {
      return localFallback(action, payload);
    }
  }

  function localFallback(action, payload) {
    const DB_KEY = 'apex_ultimate_rooms_db';
    const rooms = JSON.parse(localStorage.getItem(DB_KEY) || '{}');

    if (action === 'create') {
      const code = generateRoomCode();
      rooms[code] = {
        code,
        hostId: payload.player.id,
        status: 'waiting',
        track: 'circuit',
        lapsMiles: '2-2',
        players: {
          [payload.player.id]: {
            ...payload.player,
            x: 0, z: 0, heading: 0, speed: 0, lap: 1, updatedAt: Date.now()
          }
        }
      };
      localStorage.setItem(DB_KEY, JSON.stringify(rooms));
      return { ok: true, room: rooms[code] };
    }

    if (action === 'join') {
      const code = (payload.code || '').toUpperCase().trim();
      if (!rooms[code]) return { ok: false, msg: 'Código de sala no encontrado.' };
      if (Object.keys(rooms[code].players).length >= 6 && !rooms[code].players[payload.player.id]) {
        return { ok: false, msg: 'Sala llena (máx. 6 jugadores).' };
      }
      rooms[code].players[payload.player.id] = {
        ...payload.player,
        x: 0, z: 0, heading: 0, speed: 0, lap: 1, updatedAt: Date.now()
      };
      localStorage.setItem(DB_KEY, JSON.stringify(rooms));
      return { ok: true, room: rooms[code] };
    }

    if (action === 'sync') {
      const code = payload.code;
      if (!rooms[code]) return { ok: false };
      if (payload.startRace) {
        rooms[code].status = 'racing';
        rooms[code].track = payload.track || rooms[code].track;
        rooms[code].lapsMiles = payload.lapsMiles || rooms[code].lapsMiles;
      }
      if (payload.state && rooms[code].players[payload.playerId]) {
        Object.assign(rooms[code].players[payload.playerId], payload.state, { updatedAt: Date.now() });
      }
      localStorage.setItem(DB_KEY, JSON.stringify(rooms));
      return { ok: true, room: rooms[code] };
    }

    if (action === 'leave') {
      const code = payload.code;
      if (rooms[code] && rooms[code].players[payload.playerId]) {
        delete rooms[code].players[payload.playerId];
        if (Object.keys(rooms[code].players).length === 0) delete rooms[code];
        localStorage.setItem(DB_KEY, JSON.stringify(rooms));
      }
      return { ok: true };
    }
    return { ok: false };
  }

  async function createRoom(user, activeCar) {
    const res = await apiCall('create', {
      player: { id: user.id, name: user.name, color: activeCar.color, modelId: activeCar.modelId }
    });
    if (res.ok) { currentRoom = res.room; startPolling(user.id); }
    return res;
  }

  async function joinRoom(code, user, activeCar) {
    const res = await apiCall('join', {
      code,
      player: { id: user.id, name: user.name, color: activeCar.color, modelId: activeCar.modelId }
    });
    if (res.ok) { currentRoom = res.room; startPolling(user.id); }
    return res;
  }

  function startPolling(playerId) {
    stopPolling();
    pollInterval = setInterval(async () => {
      if (!currentRoom) return;
      const res = await apiCall('sync', { code: currentRoom.code, playerId });
      if (res.ok && res.room) {
        const wasWaiting = currentRoom.status === 'waiting';
        currentRoom = res.room;
        if (onRoomUpdated) onRoomUpdated(currentRoom);
        if (wasWaiting && currentRoom.status === 'racing' && onRaceStarted) onRaceStarted(currentRoom);
      }
    }, 350);
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  async function syncPlayerPosition(playerId, stateObj) {
    if (!currentRoom) return;
    const res = await apiCall('sync', { code: currentRoom.code, playerId, state: stateObj });
    if (res.ok && res.room) currentRoom = res.room;
  }

  async function startRoomRace(playerId, track, lapsMiles) {
    if (!currentRoom) return;
    const res = await apiCall('sync', { code: currentRoom.code, playerId, startRace: true, track, lapsMiles });
    if (res.ok && res.room) {
      currentRoom = res.room;
      if (onRaceStarted) onRaceStarted(currentRoom);
    }
  }

  async function leaveRoom(playerId) {
    if (!currentRoom) return;
    const code = currentRoom.code;
    stopPolling();
    currentRoom = null;
    await apiCall('leave', { code, playerId });
  }

  return {
    createRoom, joinRoom, syncPlayerPosition, startRoomRace, leaveRoom,
    getRoom: () => currentRoom,
    setCallbacks: (cbU, cbS) => { onRoomUpdated = cbU; onRaceStarted = cbS; }
  };
})();
