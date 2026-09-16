const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const suits = ['s', 'h', 'd', 'c'];
const handNames = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ'];

function makeDeck() {
  return suits.flatMap(suit => Array.from({ length: 13 }, (_, index) => ({ suit, rank: index + 1, id: `${suit}${index + 1}` })));
}

function shuffle(deck) {
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  return deck;
}

function evaluate(hand) {
  const ranks = hand.map(card => card.rank === 1 ? 14 : card.rank).sort((a, b) => b - a);
  const counts = ranks.reduce((result, rank) => ({ ...result, [rank]: (result[rank] || 0) + 1 }), {});
  const groups = Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]));
  const flush = new Set(hand.map(card => card.suit)).size === 1;
  const unique = [...new Set(ranks)];
  let straight = 0;
  for (let high = 14; high >= 5; high -= 1) {
    if ([0, 1, 2, 3, 4].every(offset => unique.includes(high - offset))) straight = high;
  }
  if (!straight && unique.includes(14) && unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5)) straight = 5;
  if (straight && flush) return { rank: 8, name: handNames[8], tie: [straight] };
  if (groups[0][1] === 4) return { rank: 7, name: handNames[7], tie: [Number(groups[0][0]), ...ranks] };
  if (groups[0][1] === 3 && groups[1]?.[1] === 2) return { rank: 6, name: handNames[6], tie: [Number(groups[0][0]), Number(groups[1][0])] };
  if (flush) return { rank: 5, name: handNames[5], tie: ranks };
  if (straight) return { rank: 4, name: handNames[4], tie: [straight] };
  if (groups[0][1] === 3) return { rank: 3, name: handNames[3], tie: [Number(groups[0][0]), ...ranks] };
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) return { rank: 2, name: handNames[2], tie: [Number(groups[0][0]), Number(groups[1][0]), ...ranks] };
  if (groups[0][1] === 2) return { rank: 1, name: handNames[1], tie: [Number(groups[0][0]), ...ranks] };
  return { rank: 0, name: handNames[0], tie: ranks };
}

function compare(left, right) {
  if (left.rank !== right.rank) return left.rank - right.rank;
  for (let index = 0; index < Math.max(left.tie.length, right.tie.length); index += 1) {
    if ((left.tie[index] || 0) !== (right.tie[index] || 0)) return (left.tie[index] || 0) - (right.tie[index] || 0);
  }
  return 0;
}

function roomSnapshot(room) {
  return { id: room.id, name: room.name, players: room.players.length, maxPlayers: 6, playing: room.phase !== 'waiting' };
}

function broadcastRooms() {
  const message = JSON.stringify({ type: 'rooms', rooms: [...rooms.values()].map(roomSnapshot) });
  sockets.forEach(socket => { if (socket.readyState === WebSocket.OPEN) socket.send(message); });
}

function publicState(room, playerId) {
  return {
    type: 'state',
    room: roomSnapshot(room),
    hostId: room.hostId,
    phase: room.phase,
    pot: room.pot,
    round: room.round,
    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      hand: player.id === playerId ? player.hand : [],
      handCount: player.hand.length,
      folded: player.folded,
      ready: player.ready,
      evaluation: room.phase === 'finished' ? evaluate(player.hand) : null,
    })),
    winner: room.winner,
    message: room.message,
  };
}

function sendRoom(room) {
  room.players.forEach(player => {
    if (player.socket.readyState === WebSocket.OPEN) player.socket.send(JSON.stringify(publicState(room, player.id)));
  });
}

function createRoom(id) {
  return { id, name: id, hostId: null, players: [], deck: [], pot: 0, phase: 'waiting', round: 0, winner: null, message: 'ホストがゲームを開始するまで待機中' };
}

function startGame(room) {
  if (room.players.length < 2) return;
  room.deck = shuffle(makeDeck());
  room.pot = room.players.length * 10;
  room.round += 1;
  room.winner = null;
  room.phase = 'draw';
  room.message = '交換するカードを選択してください';
  room.players.forEach(player => {
    player.hand = room.deck.splice(0, 5);
    player.folded = false;
    player.ready = false;
  });
  sendRoom(room);
  broadcastRooms();
}

function finishGame(room) {
  const alive = room.players.filter(player => !player.folded);
  if (!alive.length) return;
  const winner = alive.reduce((best, player) => compare(evaluate(player.hand), evaluate(best.hand)) > 0 ? player : best, alive[0]);
  room.winner = winner.id;
  room.phase = 'finished';
  room.message = `${winner.name} が ${evaluate(winner.hand).name} で勝利しました`;
  sendRoom(room);
  broadcastRooms();
}

function removePlayer(player) {
  const room = player.room;
  if (!room) return;
  room.players = room.players.filter(item => item !== player);
  if (room.hostId === player.id) room.hostId = room.players[0]?.id || null;
  if (!room.players.length) rooms.delete(room.id);
  else { room.message = `${player.name} が退出しました`; sendRoom(room); }
  broadcastRooms();
}

function handleMessage(player, message) {
  const data = JSON.parse(message);
  if (data.type === 'rooms') return broadcastRooms();
  if (data.type === 'join') {
    const id = String(data.roomId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
    if (!id) return player.socket.send(JSON.stringify({ type: 'error', message: '部屋IDを入力してください' }));
    const room = rooms.get(id) || createRoom(id);
    if (room.players.length >= 6) return player.socket.send(JSON.stringify({ type: 'error', message: 'この部屋は満員です' }));
    player.id = String(data.playerId || crypto.randomUUID());
    player.name = String(data.name || 'PLAYER').trim().slice(0, 16) || 'PLAYER';
    player.room = room;
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    rooms.set(id, room);
    sendRoom(room);
    broadcastRooms();
    return;
  }
  const room = player.room;
  if (!room) return;
  if (data.type === 'start' && room.hostId === player.id && room.phase !== 'draw') return startGame(room);
  if (data.type === 'draw' && room.phase === 'draw' && !player.folded) {
    const indexes = [...new Set((data.indexes || []).map(Number))].filter(index => index >= 0 && index < 5).slice(0, 5);
    indexes.forEach(index => { player.hand[index] = room.deck.pop(); });
    player.ready = true;
    if (room.players.filter(item => !item.folded).every(item => item.ready)) finishGame(room);
    else sendRoom(room);
    return;
  }
  if (data.type === 'fold' && room.phase === 'draw') {
    player.folded = true;
    player.ready = true;
    if (room.players.filter(item => !item.folded).length <= 1) finishGame(room);
    else if (room.players.filter(item => !item.folded).every(item => item.ready)) finishGame(room);
    else sendRoom(room);
  }
}

const sockets = new Set();
const server = http.createServer((request, response) => {
  const requested = decodeURIComponent(request.url.split('?')[0]);
  const file = requested === '/' ? '/multi-poker/room.html' : requested;
  const safePath = path.normalize(path.join(ROOT, file));
  if (!safePath.startsWith(ROOT) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
  response.writeHead(200, { 'Content-Type': types[path.extname(safePath)] || 'application/octet-stream' });
  fs.createReadStream(safePath).pipe(response);
});
const webSocketServer = new WebSocket.Server({ server });
webSocketServer.on('connection', socket => {
  const player = { socket, id: null, name: null, room: null, hand: [], folded: false, ready: false };
  sockets.add(socket);
  socket.on('message', message => { try { handleMessage(player, message.toString()); } catch (error) { socket.send(JSON.stringify({ type: 'error', message: '通信データを処理できませんでした' })); } });
  socket.on('close', () => { sockets.delete(socket); removePlayer(player); });
  socket.send(JSON.stringify({ type: 'connected' }));
});
server.listen(PORT, () => console.log(`Multi-poker server: http://localhost:${PORT}/multi-poker/room.html`));