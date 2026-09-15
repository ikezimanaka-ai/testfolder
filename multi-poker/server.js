const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8000);
const BASE_PATH = __dirname;
const ROOT_PATH = path.resolve(BASE_PATH, '..');
const rooms = new Map();
const roomClients = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function clampRoomId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 32) || null;
}

function createRoomId() {
  return `room-${crypto.randomBytes(3).toString('hex')}`;
}

function getRoomList() {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (now - room.updatedAt > 60_000) rooms.delete(id);
  }

  return Array.from(rooms.values())
    .map((room) => ({ id: room.id, players: room.players, updatedAt: room.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getRoomMembers(roomId) {
  const sockets = roomClients.get(roomId) || new Set();
  return Array.from(sockets)
    .filter((ws) => ws && ws.readyState === ws.OPEN)
    .map((ws) => ws.clientId)
    .filter(Boolean);
}

function broadcastToRoom(roomId, payload, senderId = null) {
  const sockets = roomClients.get(roomId) || new Set();
  for (const socket of sockets) {
    if (!socket || socket.readyState !== socket.OPEN) continue;
    if (senderId && socket.clientId === senderId) continue;
    socket.send(JSON.stringify(payload));
  }
}

function sendHtml(res, html, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveHtmlPage(res, roomId = null) {
  const templatePath = path.join(BASE_PATH, 'index.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  const roomValue = roomId ? JSON.stringify(roomId) : 'null';
  const injected = `<script>window.__MULTI_POKER_ROOM_ID__ = ${roomValue};</script>`;
  html = html.replace('<script>window.__MULTI_POKER_ROOM_ID__ = null;</script>', injected);
  sendHtml(res, html);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let packet;
    try {
      packet = JSON.parse(String(raw));
    } catch (error) {
      return;
    }

    const roomId = clampRoomId(packet.roomId || socket.roomId || null);
    const clientId = String(packet.clientId || socket.clientId || '').trim() || null;

    if (!roomId || !clientId) return;

    if (packet.type === 'join-room') {
      socket.roomId = roomId;
      socket.clientId = clientId;
      if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
      roomClients.get(roomId).add(socket);
      socket.send(JSON.stringify({
        type: 'join-room-ack',
        roomId,
        clientId,
        members: getRoomMembers(roomId),
      }));
      broadcastToRoom(roomId, {
        type: 'room-members',
        roomId,
        members: getRoomMembers(roomId),
      });
      return;
    }

    if (packet.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', roomId, clientId }));
      return;
    }

    broadcastToRoom(roomId, { ...packet, roomId, clientId }, clientId);
  });

  socket.on('close', () => {
    const roomId = socket.roomId;
    const clientId = socket.clientId;
    if (!roomId || !clientId) return;
    const members = roomClients.get(roomId);
    if (!members) return;
    members.delete(socket);
    if (!members.size) roomClients.delete(roomId);
    broadcastToRoom(roomId, {
      type: 'room-members',
      roomId,
      members: getRoomMembers(roomId),
    });
  });
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/multi-poker' || pathname === '/multi-poker/') {
    serveHtmlPage(res, null);
    return;
  }

  if (pathname === '/multi-poker/api/rooms') {
    if (req.method === 'GET') {
      sendJson(res, { rooms: getRoomList() });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch (error) {
          sendJson(res, { ok: false, error: 'Invalid JSON' }, 400);
          return;
        }

        const roomId = clampRoomId(payload.roomId || createRoomId());
        if (!roomId) {
          sendJson(res, { ok: false, error: 'Invalid room id' }, 400);
          return;
        }

        const room = rooms.get(roomId) || { id: roomId, updatedAt: Date.now(), players: 0 };
        room.updatedAt = Date.now();
        room.players = Number(room.players || 0);
        rooms.set(roomId, room);
        sendJson(res, { ok: true, roomId, room: room });
      });
      return;
    }
  }

  if (pathname === '/multi-poker/api/rooms/heartbeat' || pathname.startsWith('/multi-poker/api/rooms/')) {
    const heartbeatMatch = pathname.match(/^\/multi-poker\/api\/rooms\/([^/]+)\/heartbeat$/);
    if (pathname === '/multi-poker/api/rooms/heartbeat' || heartbeatMatch) {
      if (req.method !== 'POST') {
        sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch (error) {
          payload = {};
        }
        const roomId = clampRoomId(payload.roomId || (heartbeatMatch ? heartbeatMatch[1] : null));
        if (!roomId) {
          sendJson(res, { ok: false, error: 'Invalid room id' }, 400);
          return;
        }
        const room = rooms.get(roomId) || { id: roomId, updatedAt: Date.now(), players: 1 };
        room.updatedAt = Date.now();
        room.players = Math.max(1, Number(room.players || 1));
        rooms.set(roomId, room);
        sendJson(res, { ok: true, roomId, room });
      });
      return;
    }
  }

  if (pathname.startsWith('/multi-poker/room/')) {
    const match = pathname.match(/^\/multi-poker\/room\/([^/?#]+)/);
    if (match) {
      const roomId = clampRoomId(match[1]);
      const room = roomId ? rooms.get(roomId) : null;
      if (roomId && !room) {
        rooms.set(roomId, { id: roomId, updatedAt: Date.now(), players: 1 });
      }
      serveHtmlPage(res, roomId || null);
      return;
    }
  }

  const requestedFile = pathname.replace(/^\/multi-poker/, '');
  const maybeRootAsset = pathname.startsWith('/poker/') || pathname.startsWith('/cards/') || pathname.startsWith('/web/') || pathname.startsWith('/website/') || pathname.startsWith('/sans/') || pathname.startsWith('/qs/') || pathname.startsWith('/wine/') || pathname.startsWith('/flask/');

  let safePath = path.normalize(path.join(BASE_PATH, requestedFile || 'index.html'));
  if (maybeRootAsset) {
    safePath = path.normalize(path.join(ROOT_PATH, pathname.replace(/^\//, '')));
  }

  if (!safePath.startsWith(BASE_PATH) && !safePath.startsWith(ROOT_PATH)) {
    sendJson(res, { ok: false, error: 'Forbidden' }, 403);
    return;
  }

  if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
    serveFile(res, safePath);
    return;
  }

  serveHtmlPage(res, null);
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/multi-poker-ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
    return;
  }
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`multi-poker server listening on http://localhost:${PORT}/multi-poker/`);
});
