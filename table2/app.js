import {
  SkyWayAuthToken,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
  nowInSec
} from 'https://esm.sh/@skyway-sdk/room@2.5.1?bundle';
import { applyDaifuguAction, createDaifuguGame } from './game-modes.js';

// Local testing only. Never publish a Secret Key in browser JavaScript.
const API_KEY = '5bf4cd2d-f57b-4df3-a8db-d0afbb5b83cd';
const PASSWORD = '9wX7DnZiArKdrcRz9IO/nicEc+uQF7kCLtcA34bWNUw=';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PACKET_CHARS = 10000;
const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,48}$/;
const $ = selector => document.querySelector(selector);

const ui = {
  lobby: $('#lobby'),
  app: $('#table-app'),
  joinForm: $('#join-form'),
  playerName: $('#player-name'),
  roomId: $('#room-id'),
  connection: $('#connection-state'),
  roomTitle: $('#room-title'),
  playerList: $('#player-list'),
  playerCount: $('#player-count'),
  felt: $('#felt'),
  drawingLayer: $('#drawing-layer'),
  empty: $('#empty-table'),
  decks: $('#decks'),
  dealDeck: $('#deal-deck'),
  handRow: $('#hand-row'),
  handCount: $('#hand-count'),
  gameMode: $('#game-mode'),
  gameStatus: $('#game-status'),
  gameControls: $('#game-controls'),
  mahjongHandRow: $('#mahjong-hand-row'),
  mahjongHandCount: $('#mahjong-hand-count'),
  mahjongWallCount: $('#mahjong-wall-count'),
  publicRoomList: $('#public-room-list'),
  publicRoomCount: $('#public-room-count'),
  chatLog: $('#chat-log'),
  chatForm: $('#chat-form'),
  chatText: $('#chat-text'),
  privateChatLog: $('#private-chat-log'),
  privateChatForm: $('#private-chat-form'),
  privateChatText: $('#private-chat-text'),
  privateChatRecipient: $('#private-chat-recipient'),
  toast: $('#toast')
};

ui.app.hidden = true;
ui.app.dataset.active = 'false';

const me = { id: crypto.randomUUID(), name: '' };
const skywayMemberName = `tower-${crypto.randomUUID()}`;
const lobbyRoomName = 'tower-public-lobby-v1';
const chunkBuffers = new Map();
const subscribedPublications = new Set();
const assets = new Map();
const publicRooms = new Map();
let room = null;
let context = null;
let lobbyContext = null;
let member = null;
let dataStream = null;
let dataRoom = null;
let dataMember = null;
let lobbyRoom = null;
let lobbyMember = null;
let lobbyStream = null;
let state = null;
let hostId = null;
let host = false;
let roomId = '';
let closing = false;
let connecting = false;
let handshakeTimer = 0;
let toastTimer = 0;
let chatMessages = [];
let keyPair = null;
let publicKeyJwk = null;
let selectedImageId = null;
let drawingMode = 'none';
let activeStrokeId = null;
let lastDrawSendAt = 0;
let pendingDrawPoints = [];
let directoryTimer = 0;
let lobbyAnnounceTimer = 0;
const memberPublicKeys = new Map();

ui.playerName.value = localStorage.getItem('tower-player-name') || '';
const initialRoom = new URLSearchParams(location.search).get('room');
if (initialRoom) ui.roomId.value = initialRoom;

function notify(message, duration = 3600) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), duration);
}

function participantName(participant) {
  try {
    const metadata = JSON.parse(participant.metadata || '{}');
    if (typeof metadata.displayName === 'string' && metadata.displayName.trim()) {
      return metadata.displayName.trim().slice(0, 24);
    }
  } catch {
    return participant.name || 'PLAYER';
  }
  return participant.name || 'PLAYER';
}

function setConnection(label) {
  ui.connection.textContent = label;
}

function createToken() {
  const issuedAt = nowInSec();
  const rooms = [{
    name: lobbyRoomName,
    methods: ['create', 'updateMetadata', 'close'],
    member: { name: skywayMemberName, methods: ['updateMetadata', 'publish', 'subscribe'] }
  }];
  if (roomId) {
    rooms.push(
      {
        name: roomId,
        methods: ['create', 'updateMetadata', 'close'],
        member: { name: skywayMemberName, methods: ['updateMetadata', 'publish', 'subscribe'] },
        sfu: { enabled: true }
      },
      {
        name: `tower-data-${roomId}`,
        methods: ['create', 'updateMetadata', 'close'],
        member: { name: skywayMemberName, methods: ['updateMetadata', 'publish', 'subscribe'] }
      }
    );
  }
  return new SkyWayAuthToken({
    jti: crypto.randomUUID(),
    iat: issuedAt,
    exp: issuedAt + 60 * 60,
    version: 3,
    scope: {
      appId: API_KEY.trim(),
      rooms,
      turn: { enabled: true }
    }
  }).encode(PASSWORD);
}

function encodePacket(message) {
  const text = JSON.stringify({ ...message, memberId: me.id });
  const chunkId = crypto.randomUUID();
  const total = Math.ceil(text.length / PACKET_CHARS);
  for (let index = 0; index < total; index += 1) {
    const packet = JSON.stringify({
      chunkId,
      index,
      total,
      text: text.slice(index * PACKET_CHARS, (index + 1) * PACKET_CHARS)
    });
    dataStream.write(packet);
  }
}

function send(message) {
  if (!dataStream) throw new Error('データ通信が準備できていません。');
  encodePacket(message);
}

function sendLobby(message) {
  if (!lobbyStream) return;
  lobbyStream.write(JSON.stringify({ ...message, sentAt: Date.now() }));
}

function renderPublicRooms() {
  const now = Date.now();
  for (const [id, entry] of publicRooms) {
    if (now - entry.lastSeen > 45_000) publicRooms.delete(id);
  }
  ui.publicRoomList.replaceChildren();
  ui.publicRoomCount.textContent = String(publicRooms.size);
  const entries = [...publicRooms.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-rooms';
    empty.textContent = lobbyStream ? '公開中の部屋はありません。' : '公開部屋一覧に接続できません。';
    ui.publicRoomList.append(empty);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement('li');
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = entry.roomId;
    const detail = document.createElement('small');
    detail.textContent = `${entry.hostName || 'HOST'} · ${entry.players || 1}人`;
    info.append(title, detail);
    const join = document.createElement('button');
    join.type = 'button';
    join.className = 'button secondary';
    join.textContent = '参加';
    join.addEventListener('click', () => {
      ui.roomId.value = entry.roomId;
      if (ui.playerName.value.trim()) void connect(false);
      else ui.playerName.focus();
    });
    item.append(info, join);
    ui.publicRoomList.append(item);
  }
}

function announcePublicRoom() {
  if (!host || !state || !state.publicListing || !lobbyStream) return;
  sendLobby({
    type: 'room-announce',
    roomId,
    hostId,
    hostName: me.name,
    players: room?.members.length || state.players.length
  });
}

function removePublicRoomAnnouncement() {
  if (host && state?.publicListing) sendLobby({ type: 'room-remove', roomId, hostId });
}

async function syncRoomMetadata() {
  if (!host || !room || !state) return;
  await room.updateMetadata(JSON.stringify({
    hostId,
    hostName: me.name,
    publicListing: state.publicListing
  }));
  if (state.publicListing) announcePublicRoom();
  else sendLobby({ type: 'room-remove', roomId, hostId });
}

function handleLobbyMessage(raw, sender) {
  if (typeof raw !== 'string' || raw.length > 2000) return;
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  if (!lobbyRoom?.members.some(item => item.id === sender.id)) return;
  if (message.type === 'room-announce') {
    if (
      typeof message.roomId !== 'string' ||
      !ROOM_NAME_PATTERN.test(message.roomId) ||
      typeof message.hostId !== 'string'
    ) return;
    publicRooms.set(message.roomId, {
      roomId: message.roomId,
      hostId: message.hostId,
      hostName: typeof message.hostName === 'string' ? message.hostName.slice(0, 24) : 'HOST',
      players: Math.max(1, Math.min(100, Number(message.players) || 1)),
      senderId: sender.id,
      lastSeen: Date.now()
    });
    renderPublicRooms();
  } else if (message.type === 'room-remove' && typeof message.roomId === 'string') {
    const entry = publicRooms.get(message.roomId);
    if (entry?.senderId === sender.id) {
      publicRooms.delete(message.roomId);
      renderPublicRooms();
    }
  } else if (message.type === 'room-list-request' && host) {
    announcePublicRoom();
  }
}

async function subscribeLobbyPublication(publication) {
  if (!lobbyMember || !publication?.id || publication.publisher?.id === lobbyMember.id) return;
  try {
    const { stream } = await lobbyMember.subscribe(publication);
    if (stream.contentType === 'data') {
      stream.onData.add(data => handleLobbyMessage(data, publication.publisher));
    }
  } catch (error) {
    console.error('Public room directory subscription failed', error);
  }
}

async function openLobby({ reuseContext = false } = {}) {
  if (!API_KEY.trim() || !PASSWORD.trim() || lobbyStream) {
    renderPublicRooms();
    return;
  }
  try {
    if (!reuseContext) {
      lobbyContext = await SkyWayContext.Create(createToken());
    }
    lobbyRoom = await SkyWayRoom.FindOrCreate(reuseContext ? context : lobbyContext, { type: 'p2p', name: lobbyRoomName });
    lobbyMember = await lobbyRoom.join({ name: skywayMemberName });
    lobbyStream = await SkyWayStreamFactory.createDataStream({ ordered: true });
    await lobbyMember.publish(lobbyStream);
    lobbyRoom.onStreamPublished.add(({ publication }) => { void subscribeLobbyPublication(publication); });
    for (const publication of lobbyRoom.publications) void subscribeLobbyPublication(publication);
    sendLobby({ type: 'room-list-request' });
    clearInterval(directoryTimer);
    directoryTimer = setInterval(renderPublicRooms, 10_000);
    renderPublicRooms();
  } catch (error) {
    console.error('Public room directory connection failed', error);
    renderPublicRooms();
    if (reuseContext) throw error;
  }
}

async function closeLobby() {
  if (!lobbyMember) return;
  clearInterval(directoryTimer);
  directoryTimer = 0;
  try {
    await lobbyRoom.leave(lobbyMember);
  } catch (error) {
    console.error('Public room directory disconnect failed', error);
  }
  lobbyRoom = null;
  lobbyMember = null;
  lobbyStream = null;
  if (lobbyContext) {
    await lobbyContext.dispose();
    lobbyContext = null;
  }
}

function receiveChunk(raw, publisherId) {
  if (typeof raw !== 'string' || raw.length > PACKET_CHARS + 400) return;
  let packet;
  try {
    packet = JSON.parse(raw);
  } catch {
    return;
  }
  if (
    typeof packet.chunkId !== 'string' ||
    !Number.isInteger(packet.index) ||
    !Number.isInteger(packet.total) ||
    packet.total < 1 ||
    packet.total > 800 ||
    packet.index < 0 ||
    packet.index >= packet.total ||
    typeof packet.text !== 'string'
  ) return;

  const key = `${publisherId}:${packet.chunkId}`;
  let buffer = chunkBuffers.get(key);
  if (!buffer) {
    buffer = { chunks: new Array(packet.total), received: 0, length: 0 };
    chunkBuffers.set(key, buffer);
    setTimeout(() => chunkBuffers.delete(key), 30_000);
  }
  if (buffer.chunks.length !== packet.total || buffer.chunks[packet.index] !== undefined) return;
  buffer.chunks[packet.index] = packet.text;
  buffer.received += 1;
  buffer.length += packet.text.length;
  if (buffer.length > MAX_IMAGE_BYTES * 1.5) {
    chunkBuffers.delete(key);
    return;
  }
  if (buffer.received !== buffer.chunks.length) return;
  chunkBuffers.delete(key);
  try {
    const message = JSON.parse(buffer.chunks.join(''));
    const publisher = dataRoom?.members.find(candidate => candidate.id === publisherId);
    const linkedMember = room?.members.find(candidate => candidate.name === publisher?.name);
    const sfMemberId = linkedMember?.id;
    if (!sfMemberId || message.memberId !== sfMemberId) return;
    handleMessage(message, sfMemberId);
  } catch (error) {
    notify(`受信したデータを読み込めませんでした: ${error.message}`);
  }
}

async function subscribePublication(publication) {
  if (!dataMember || !publication?.id || subscribedPublications.has(publication.id)) return;
  if (publication.publisher?.id === dataMember.id) return;
  subscribedPublications.add(publication.id);
  try {
    const { stream } = await dataMember.subscribe(publication);
    if (stream.contentType !== 'data') return;
    stream.onData.add(data => receiveChunk(data, publication.publisher.id));
  } catch (error) {
    subscribedPublications.delete(publication.id);
    notify(`データストリームの購読に失敗しました: ${error.message}`);
  }
}

function sendState(targetId) {
  if (!host || !state) return;
  if (targetId) {
    void sendSecureState(targetId);
    return;
  }
  for (const target of room.members) {
    if (target.id !== member.id) {
      void sendSecureState(target.id);
    }
  }
}

async function sendSecureState(targetId) {
  const recipientJwk = memberPublicKeys.get(targetId);
  if (!recipientJwk || !keyPair || !state) return;
  try {
    const recipientKey = await crypto.subtle.importKey(
      'jwk',
      recipientJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const sharedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: recipientKey },
      keyPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(TowerEngine.publicState(state, targetId)));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, plaintext);
    send({
      type: 'secure-state',
      to: targetId,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    });
  } catch (error) {
    notify(`手札の暗号化に失敗しました: ${error.message}`);
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(encoded) {
  const binary = atob(encoded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function openSecureState(message) {
  try {
    const hostJwk = memberPublicKeys.get(hostId);
    if (!hostJwk || !keyPair) return;
    const hostKey = await crypto.subtle.importKey('jwk', hostJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const sharedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: hostKey },
      keyPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(message.iv) },
      sharedKey,
      base64ToBytes(message.ciphertext)
    );
    const incoming = JSON.parse(new TextDecoder().decode(plaintext));
    if (!Number.isInteger(incoming.revision) || (state && incoming.revision <= state.revision)) return;
    state = incoming;
    clearInterval(handshakeTimer);
    handshakeTimer = 0;
    render();
    requestMissingAssets();
  } catch (error) {
    notify(`暗号化された状態を読み込めませんでした: ${error.message}`);
  }
}

function broadcastState() {
  if (!host) return;
  render();
  sendState();
}

function applyRoomAction(action) {
  if (action.type === 'start-game' && action.mode === 'daifugu') {
    const players = state.players.filter(player => !player.spectator);
    action = { ...action, daifugu: createDaifuguGame(players) };
  } else if (action.type === 'game-action' && state.game?.mode === 'daifugu') {
    const daifugu = applyDaifuguAction(state.game.daifugu, action.actorId, action.action);
    return TowerEngine.apply(state, {
      type: 'daifugu-state',
      actorId: state.hostId,
      daifugu
    });
  }
  return TowerEngine.apply(state, action);
}

function dispatch(action) {
  try {
    const request = { ...action, actorId: me.id };
    if (host) {
      state = applyRoomAction(request);
      broadcastState();
      if (action.type === 'set-public-listing') {
        void syncRoomMetadata().catch(error => notify(`部屋設定を保存できませんでした: ${error.message}`));
      }
    } else {
      send({ type: 'request', action: request });
    }
  } catch (error) {
    notify(error.message);
  }
}

function handleMessage(message, publisherId) {
  if (!room?.members.some(candidate => candidate.id === publisherId)) return;
  if (message.type === 'key-share' && host && message.memberId === publisherId && message.publicKey?.kty === 'EC') {
    memberPublicKeys.set(publisherId, message.publicKey);
    send({ type: 'key-share-relay', ownerId: publisherId, publicKey: message.publicKey });
    return;
  }
  if (message.type === 'key-share-relay' && message.memberId === hostId && typeof message.ownerId === 'string' && message.publicKey?.kty === 'EC') {
    memberPublicKeys.set(message.ownerId, message.publicKey);
    return;
  }
  if (message.type === 'key-directory' && message.memberId === hostId && message.to === me.id && Array.isArray(message.keys)) {
    for (const entry of message.keys) {
      if (typeof entry.id === 'string' && entry.key?.kty === 'EC') memberPublicKeys.set(entry.id, entry.key);
    }
    return;
  }
  if (message.type === 'secure-state' && message.memberId === hostId && message.to === me.id) {
    void openSecureState(message);
    return;
  }
  if (message.type === 'request' && host) {
    if (message.action?.type === 'state-request') {
      const player = state.players.find(item => item.id === publisherId);
      if (player) {
        send({
          type: 'key-directory',
          to: publisherId,
          keys: [...memberPublicKeys].map(([id, key]) => ({ id, key }))
        });
        sendState(publisherId);
        send({ type: 'chat-history', to: publisherId, messages: chatMessages });
      }
      return;
    }
    try {
      state = applyRoomAction({ ...message.action, actorId: publisherId });
      broadcastState();
      if (message.action.type === 'set-public-listing') {
        void syncRoomMetadata().catch(error => notify(`部屋設定を保存できませんでした: ${error.message}`));
      }
    } catch (error) {
      send({ type: 'error', to: publisherId, message: error.message });
    }
    return;
  }
  if (message.type === 'error' && message.to === me.id && message.memberId === hostId) {
    notify(message.message || '操作に失敗しました。');
    return;
  }
  if (message.type === 'chat' && typeof message.text === 'string' && message.text.length <= 500) {
    const sender = room.members.find(item => item.id === publisherId);
    const senderName = sender ? participantName(sender) : 'PLAYER';
    appendChat(senderName, message.text, message.sentAt);
    if (host) {
      chatMessages.push({ name: senderName, text: message.text, sentAt: message.sentAt });
      chatMessages = chatMessages.slice(-50);
    }
    return;
  }
  if (
    message.type === 'direct-chat' &&
    message.to === me.id &&
    typeof message.text === 'string' &&
    message.text.trim().length > 0 &&
    message.text.length <= 500
  ) {
    const sender = room.members.find(item => item.id === publisherId);
    if (sender) appendPrivateChat(`${participantName(sender)} から`, message.text, message.sentAt);
    return;
  }
  if (message.type === 'chat-history' && message.to === me.id && message.memberId === hostId) {
    ui.chatLog.replaceChildren();
    chatMessages = Array.isArray(message.messages) ? message.messages.slice(-50) : [];
    for (const item of chatMessages) appendChat(item.name, item.text, item.sentAt);
    return;
  }
  if (message.type === 'asset-upload' && host) {
    if (
      typeof message.assetId !== 'string' ||
      typeof message.data !== 'string' ||
      !message.data.startsWith('data:image/webp;base64,') ||
      message.data.length > MAX_IMAGE_BYTES * 1.4
    ) {
      send({ type: 'error', to: publisherId, message: '画像データが大きすぎるか、形式が正しくありません。' });
      return;
    }
    assets.set(message.assetId, message.data);
    send({ type: 'asset-relay', assetId: message.assetId, data: message.data });
    return;
  }
  if (message.type === 'asset-relay' && message.memberId === hostId) {
    if (
      typeof message.assetId === 'string' &&
      typeof message.data === 'string' &&
      message.data.startsWith('data:image/webp;base64,') &&
      message.data.length <= MAX_IMAGE_BYTES * 1.4
    ) {
      assets.set(message.assetId, message.data);
      render();
    }
    return;
  }
  if (message.type === 'asset-request' && host && typeof message.assetId === 'string') {
    const data = assets.get(message.assetId);
    if (data) send({ type: 'asset-relay', to: publisherId, assetId: message.assetId, data });
  }
}

function requestMissingAssets() {
  if (!state || host) return;
  for (const item of state.objects) {
    if (item.kind === 'image' && !assets.has(item.assetId)) {
      try {
        send({ type: 'asset-request', assetId: item.assetId });
      } catch {
        return;
      }
    }
  }
}

function appendChat(name, text, sentAt = Date.now()) {
  if (typeof text !== 'string') return;
  const item = document.createElement('li');
  item.className = 'chat-message';
  const sender = document.createElement('strong');
  sender.textContent = `${name}: `;
  const content = document.createTextNode(text);
  const time = document.createElement('time');
  const timestamp = Number.isFinite(sentAt) ? sentAt : Date.now();
  const date = new Date(timestamp);
  time.dateTime = date.toISOString();
  time.textContent = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  item.append(sender, content, time);
  ui.chatLog.append(item);
  while (ui.chatLog.children.length > 50) ui.chatLog.firstElementChild.remove();
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}

function appendPrivateChat(label, text, sentAt = Date.now()) {
  const item = document.createElement('li');
  item.className = 'chat-message';
  const sender = document.createElement('strong');
  sender.textContent = `${label}: `;
  const content = document.createTextNode(text);
  const time = document.createElement('time');
  const date = new Date(Number.isFinite(sentAt) ? sentAt : Date.now());
  time.dateTime = date.toISOString();
  time.textContent = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  item.append(sender, content, time);
  ui.privateChatLog.append(item);
  while (ui.privateChatLog.children.length > 50) ui.privateChatLog.firstElementChild.remove();
  ui.privateChatLog.scrollTop = ui.privateChatLog.scrollHeight;
}

function cardImage(card) {
  if (!card.faceUp) return '../cards/back@2x.png';
  return `../cards/${card.suit}${String(card.rank).padStart(2, '0')}@2x.png`;
}

function createObjectElement(object, card = null, tile = null) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `table-object ${card ? 'table-card' : tile ? 'table-mahjong' : `table-${object.kind}`}`;
  button.style.left = `${object.x}%`;
  button.style.top = `${object.y}%`;
  button.dataset.objectId = object.id;
  const ownerId = card ? card.ownerId : tile ? tile.ownerId : object.ownerId;
  const owner = state.players.find(player => player.id === ownerId);
  const ownerName = (card ? card.ownerName : object.ownerName) || owner?.name || '名前不明';
  const attribution = `置いた人: ${ownerName}`;
  button.title = attribution;
  button.setAttribute(
    'aria-label',
    `${card ? 'カードはクリックで表裏切替、ダブルクリックで手札へ' : tile ? '麻雀牌。ダブルクリックで手牌へ戻す' : 'ダブルクリックで片づける'}。${attribution}`
  );
  if (drawingMode !== 'none') button.tabIndex = -1;
  if (card) {
    const image = document.createElement('img');
    image.src = cardImage(card);
    image.alt = card.faceUp ? `${card.suit} ${card.rank}` : '伏せたカード';
    button.append(image);
  } else if (tile) {
    const image = document.createElement('img');
    image.src = `../pai-images/pai-images/${tile.asset}-66-90-s.png`;
    image.alt = `${tile.suit} ${tile.rank}${tile.red ? ' 赤牌' : ''}`;
    button.append(image);
  } else if (object.kind === 'label') {
    button.textContent = object.label;
  } else if (object.kind === 'coin') {
    button.textContent = `◉ ${object.amount}`;
  } else if (object.kind === 'image') {
    const image = document.createElement('img');
    image.className = 'table-image';
    image.alt = '共有画像';
    image.src = assets.get(object.assetId) || '';
    image.style.transform = `scale(${object.scale || 1})`;
    button.append(image);
  }

  let start = null;
  let moved = false;
  button.addEventListener('pointerdown', event => {
    if (drawingMode !== 'none' || event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add('dragging');
    moved = false;
    start = { x: event.clientX, y: event.clientY };
  });
  button.addEventListener('pointermove', event => {
    if (drawingMode !== 'none' || !start || !button.hasPointerCapture(event.pointerId)) return;
    const rect = ui.felt.getBoundingClientRect();
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) moved = true;
    if (moved) {
      button.style.left = `${Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))}%`;
      button.style.top = `${Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))}%`;
    }
  });
  button.addEventListener('pointerup', event => {
    if (drawingMode !== 'none') return;
    if (!start) return;
    button.releasePointerCapture(event.pointerId);
    button.classList.remove('dragging');
    if (moved) {
      const rect = ui.felt.getBoundingClientRect();
      dispatch({
        type: 'move-object',
        objectId: object.id,
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100
      });
      button.dataset.draggedAt = String(Date.now());
    }
    start = null;
  });
  button.addEventListener('pointercancel', () => {
    start = null;
    button.classList.remove('dragging');
    render();
  });
  let flipTimer = 0;
  button.addEventListener('click', () => {
    if (drawingMode !== 'none') return;
    if (Date.now() - Number(button.dataset.draggedAt || 0) < 250) return;
    if (card) {
      clearTimeout(flipTimer);
      flipTimer = setTimeout(() => dispatch({ type: 'flip-card', cardId: card.id }), 220);
    } else if (object.kind === 'image') {
      selectedImageId = object.id;
      $('#image-scale-wrap').hidden = false;
      $('#image-scale').value = String(object.scale || 1);
      $('#image-scale-value').textContent = `${Math.round((object.scale || 1) * 100)}%`;
    }
  });
  button.addEventListener('dblclick', event => {
    event.preventDefault();
    if (drawingMode !== 'none' || Date.now() - Number(button.dataset.draggedAt || 0) < 250) return;
    clearTimeout(flipTimer);
    if (card) dispatch({ type: 'collect-object', objectId: card.id });
    else if (object.kind === 'coin') dispatch({ type: 'collect-coins', objectId: object.id });
    else dispatch({ type: 'collect-object', objectId: object.id });
  });
  return button;
}

function drawingPath(stroke) {
  return stroke.points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
}

function renderDrawing() {
  ui.drawingLayer.replaceChildren();
  for (const stroke of state.strokes || []) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const owner = state.players.find(player => player.id === stroke.actorId);
    path.setAttribute('d', drawingPath(stroke));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', stroke.color);
    path.setAttribute('stroke-width', String(stroke.width));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.classList.add('ink-stroke');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `記入者: ${owner?.name || '退出した参加者'}`;
    path.append(title);
    path.addEventListener('pointerenter', () => {
      $('#drawing-label').textContent = `記入者: ${owner?.name || '退出した参加者'}`;
    });
    path.addEventListener('pointerleave', () => updateDrawingLabel());
    ui.drawingLayer.append(path);
  }
}

function renderWallet() {
  const own = state.players.find(player => player.id === me.id);
  const balance = own?.coins || 0;
  $('#wallet-coins').textContent = String(balance);
  $('#return-all-wallet').disabled = balance <= 0;
}

function updateDrawingLabel() {
  const labels = {
    none: '通常モード: 物を移動・操作できます。',
    pen: 'ペンで描画中: テーブル上の物は操作できません。',
    eraser: '消しゴム中: テーブル上の物は操作できません。'
  };
  $('#drawing-label').textContent = labels[drawingMode];
  $('#pen-mode').setAttribute('aria-pressed', String(drawingMode === 'pen'));
  $('#eraser-mode').setAttribute('aria-pressed', String(drawingMode === 'eraser'));
  ui.drawingLayer.classList.toggle('drawing-enabled', drawingMode !== 'none');
}

function drawingPoint(event) {
  const rect = ui.drawingLayer.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
  };
}

function flushStrokePoints() {
  if (!activeStrokeId || !pendingDrawPoints.length) return;
  const points = pendingDrawPoints;
  pendingDrawPoints = [];
  dispatch({ type: 'append-stroke', strokeId: activeStrokeId, points });
}

function render() {
  if (!state) return;
  ui.roomTitle.textContent = roomId;
  ui.playerCount.textContent = String(room?.members.length || state.players.length);
  ui.playerList.replaceChildren();
  for (const player of room?.members || state.players) {
    const item = document.createElement('li');
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    const nameText = room?.members ? participantName(player) : player.name;
    avatar.textContent = (nameText || 'P').slice(0, 1).toUpperCase();
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = nameText || 'PLAYER';
    item.append(avatar, name);
    const playerState = state.players.find(candidate => candidate.id === player.id);
    if (playerState) {
      const balance = document.createElement('small');
      balance.className = 'player-wallet';
      balance.textContent = `◉ ${playerState.coins || 0}`;
      item.append(balance);
    }
    if (player.id === hostId) {
      const hostLabel = document.createElement('small');
      hostLabel.className = 'player-host';
      hostLabel.textContent = 'HOST';
      item.append(hostLabel);
    }
    if (playerState?.spectator) {
      const spectatorLabel = document.createElement('small');
      spectatorLabel.className = 'player-spectator';
      spectatorLabel.textContent = '観戦';
      item.append(spectatorLabel);
    }
    ui.playerList.append(item);
  }
  const selectedRecipientId = ui.privateChatRecipient.value;
  ui.privateChatRecipient.replaceChildren();
  for (const player of room?.members || state.players) {
    if (player.id === me.id) continue;
    const option = document.createElement('option');
    option.value = player.id;
    option.textContent = room?.members ? participantName(player) : player.name;
    ui.privateChatRecipient.append(option);
  }
  if ([...ui.privateChatRecipient.options].some(option => option.value === selectedRecipientId)) {
    ui.privateChatRecipient.value = selectedRecipientId;
  }
  $('#host-badge').hidden = !host;
  ui.felt.replaceChildren();
  ui.felt.classList.toggle('drawing-mode', drawingMode !== 'none');
  for (const object of state.objects) ui.felt.append(createObjectElement(object));
  for (const card of state.cards.filter(item => item.zone === 'table')) {
    ui.felt.append(createObjectElement(card, card));
  }
  for (const tile of state.mahjongTiles.filter(item => item.zone === 'table')) {
    ui.felt.append(createObjectElement(tile, null, tile));
  }
  ui.empty.hidden = state.objects.length + state.cards.filter(item => item.zone === 'table').length +
    state.mahjongTiles.filter(item => item.zone === 'table').length > 0;
  const hand = state.cards.filter(card => card.zone === 'hand' && card.ownerId === me.id);
  ui.handCount.textContent = String(hand.length);
  ui.handRow.replaceChildren();
  for (const card of hand) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'hand-card';
    item.title = 'クリックしてテーブルに出す';
    const image = document.createElement('img');
    image.src = cardImage({ ...card, faceUp: true });
    image.alt = `${card.suit} ${card.rank}`;
    item.append(image);
    item.addEventListener('click', () => dispatch({ type: 'play-card', cardId: card.id, x: 50, y: 50 }));
    ui.handRow.append(item);
  }
  const mahjongHand = state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === me.id);
  ui.mahjongHandCount.textContent = String(mahjongHand.length);
  ui.mahjongHandRow.replaceChildren();
  for (const tile of mahjongHand) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'mahjong-hand-tile';
    item.title = 'クリックして共有テーブルに出す';
    const image = document.createElement('img');
    image.src = `../pai-images/pai-images/${tile.asset}-66-90-s.png`;
    image.alt = `${tile.suit} ${tile.rank}${tile.red ? ' 赤牌' : ''}`;
    item.append(image);
    item.addEventListener('click', () => dispatch({
      type: 'play-mahjong-tile',
      tileId: tile.id,
      x: 50 + (mahjongHand.indexOf(tile) % 5) * 4,
      y: 50
    }));
    ui.mahjongHandRow.append(item);
  }
  ui.mahjongWallCount.textContent = String(state.mahjongTiles.filter(tile => tile.zone === 'wall').length);
  $('#create-mahjong-wall').hidden = !host;
  $('#create-mahjong-wall').disabled = state.mahjongTiles.some(tile => tile.zone !== 'wall');
  $('#draw-mahjong-tile').disabled = !state.mahjongTiles.some(tile => tile.zone === 'wall');
  renderGame();
  renderPot();
  renderWallet();
  renderDrawing();
  $('#room-options-panel').hidden = !host;
  $('#public-listing').checked = Boolean(state.publicListing);
  $('#clear-drawing').hidden = !host;
  $('#clear-table').hidden = !host;
  updateDrawingLabel();
  if (selectedImageId && !state.objects.some(item => item.id === selectedImageId && item.kind === 'image')) {
    selectedImageId = null;
  }

  function appendGameButton(container, text, action, disabled = false, className = 'button secondary') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener('click', action);
    container.append(button);
    return button;
  }

  function renderPot() {
    const pot = state.gamePot || { amount: 0 };
    $('#game-pot-amount').textContent = String(pot.amount);
    const own = state.players.find(player => player.id === me.id);
    const cannotBet = Boolean(pot.locked || (own?.spectator && state.game?.status === 'playing'));
    $('#bet-amount').disabled = cannotBet;
    $('#bet-form button').disabled = cannotBet;
    const panel = $('#settle-pot-panel');
    panel.hidden = !host || state.game?.status !== 'finished' || pot.amount < 1;
    const select = $('#pot-winner');
    const selected = select.value;
    select.replaceChildren();
    const game = state.game;
    const participantIds = game?.mode === 'daifugu'
      ? game.daifugu.players.map(player => player.roomPlayerId)
      : game?.mode === 'memory'
        ? game.players
        : game?.players?.map(player => player.id) || [];
    for (const id of participantIds) {
      const player = state.players.find(candidate => candidate.id === id);
      if (!player) continue;
      const option = document.createElement('option');
      option.value = player.id;
      option.textContent = player.name;
      select.append(option);
    }
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
    else if (game?.winnerId) select.value = game.winnerId;
    $('#award-pot').disabled = !select.options.length;
  }

  function daifuguCardImage(card) {
    if (card.joker) return '../cards/j01@2x.png';
    const suit = ['s', 'h', 'd', 'c'].includes(card.suit)
      ? card.suit
      : { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' }[card.suit];
    const rank = Number(card.rank) || { A: 1, J: 11, Q: 12, K: 13 }[card.rank];
    return `../cards/${suit}${String(rank).padStart(2, '0')}@2x.png`;
  }

  function renderGame() {
    const game = state.game;
    const active = game?.status === 'playing';
    const player = state.players.find(candidate => candidate.id === me.id);
    const spectator = Boolean(player?.spectator);
    $('#start-game').hidden = !host || active;
    $('#start-game').disabled = Boolean(state.gamePot?.locked);
    $('#game-mode').disabled = active || !host;
    $('#end-game').hidden = !host || !active;
    ui.gameControls.replaceChildren();
    if (!game) {
      ui.gameStatus.textContent = 'ゲームを選んで開始してください。途中参加者は次のゲームまで観戦します。';
      return;
    }
    ui.gameMode.value = game.mode;
    if (game.mode === 'daifugu') {
      renderDaifugu(game, active, spectator);
      return;
    }
    const modeName = game.mode === 'memory' ? '神経衰弱' : 'ババ抜き';
    const currentId = game.mode === 'memory'
      ? game.players[game.current]
      : game.players[game.current]?.id;
    const currentPlayer = state.players.find(candidate => candidate.id === currentId);
    ui.gameStatus.textContent = `${modeName} · ${game.status === 'playing' ? `${currentPlayer?.name || '次の人'}の番` : '終了'} · ${game.message || ''}${spectator && active ? '（あなたは観戦中です）' : ''}`;

    if (game.mode === 'memory') {
      const board = document.createElement('div');
      board.className = 'memory-board';
      game.board.forEach(card => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'memory-card';
        button.disabled = !active || spectator || currentId !== me.id || card.matched || card.faceUp || Boolean(game.pendingMismatch);
        const image = document.createElement('img');
        image.src = card.faceUp || card.matched ? cardImage({ ...card, faceUp: true }) : '../cards/back@2x.png';
        image.alt = card.faceUp || card.matched ? `${card.suit} ${card.rank}` : '伏せたカード';
        button.append(image);
        if (card.matched) button.classList.add('matched');
        button.addEventListener('click', () => dispatch({ type: 'game-action', gameAction: 'flip', cardId: card.id }));
        board.append(button);
      });
      ui.gameControls.append(board);
      const scores = document.createElement('p');
      scores.className = 'game-scores';
      scores.textContent = game.players.map(id => {
        const entry = state.players.find(candidate => candidate.id === id);
        return `${entry?.name || 'PLAYER'}: ${game.scores[id] || 0}`;
      }).join(' · ');
      ui.gameControls.append(scores);
      if (active && !spectator && currentId === me.id && game.pendingMismatch) {
        appendGameButton(ui.gameControls, '次の人へ', () => dispatch({ type: 'game-action', gameAction: 'continue' }), false, 'button primary');
      }
    } else if (game.mode === 'old-maid') {
      const own = game.players.find(candidate => candidate.id === me.id);
      const currentPlayerState = game.players[game.current];
      if (own) {
        const ownTitle = document.createElement('strong');
        ownTitle.textContent = `あなたの手札（${own.hand.length}枚）`;
        ui.gameControls.append(ownTitle);
        const hand = document.createElement('div');
        hand.className = 'hand-row game-card-row';
        own.hand.forEach(card => {
          const image = document.createElement('img');
          image.className = 'game-hand-card';
          image.src = daifuguCardImage(card);
          image.alt = card.joker ? 'Joker' : `${card.suit}${card.rank}`;
          hand.append(image);
        });
        ui.gameControls.append(hand);
      }
      if (active && !spectator && currentId === me.id) {
        const targetIndex = game.players.findIndex(candidate => candidate.id === me.id);
        let opponent = null;
        for (let offset = 1; offset < game.players.length; offset += 1) {
          const candidate = game.players[(targetIndex + offset) % game.players.length];
          if (candidate.hand.length) {
            opponent = candidate;
            break;
          }
        }
        const targetPlayer = opponent && state.players.find(candidate => candidate.id === opponent.id);
        const targetLabel = document.createElement('p');
        targetLabel.textContent = opponent ? `${targetPlayer?.name || '相手'}の手札から1枚選んでください（${opponent.hand.length}枚）` : '引ける相手がいません。';
        ui.gameControls.append(targetLabel);
        if (opponent) {
          const backs = document.createElement('div');
          backs.className = 'hand-row game-card-row';
          opponent.hand.forEach(card => {
            appendGameButton(backs, '', () => dispatch({ type: 'game-action', gameAction: 'draw', cardId: card.id }), false, 'old-maid-back')
              .append(Object.assign(document.createElement('img'), { src: '../cards/back@2x.png', alt: '伏せたカード' }));
          });
          ui.gameControls.append(backs);
        }
      }
      const counts = document.createElement('p');
      counts.className = 'game-scores';
      counts.textContent = game.players.map(candidate =>
        `${state.players.find(entry => entry.id === candidate.id)?.name || candidate.name}: ${candidate.hand.length}枚`
      ).join(' · ');
      ui.gameControls.append(counts);
    }
  }

  function renderDaifugu(game, active, spectator) {
    const snapshot = game.daifugu;
    const current = snapshot.players[snapshot.current];
    const own = snapshot.players.find(candidate => candidate.roomPlayerId === me.id);
    const isTurn = current?.roomPlayerId === me.id;
    ui.gameStatus.textContent = `大富豪 · ${active ? `${current?.name || '次の人'}の番` : '終了'}${snapshot.revolution ? ' · 革命中' : ''}${snapshot.field?.cards?.length ? ` · 場 ${snapshot.field.cards.map(card => card.joker ? 'Joker' : `${card.suit}${card.rank}`).join('・')}` : ''}${spectator && active ? '（観戦中です）' : ''}`;
    if (snapshot.finished) {
      const placements = snapshot.placements.map((playerId, index) =>
        `${index + 1}位 ${snapshot.players[playerId]?.name || ''}`
      );
      const result = document.createElement('p');
      result.textContent = placements.join(' · ') || '結果を確認してください。';
      ui.gameControls.append(result);
      return;
    }
    if (!own?.hand) {
      const note = document.createElement('p');
      note.textContent = spectator ? 'このゲームは観戦中です。手札は表示されません。' : '手札情報を受信しています。';
      ui.gameControls.append(note);
    } else {
      const hand = document.createElement('div');
      hand.className = 'hand-row game-card-row';
      own.hand.forEach(card => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'game-hand-select';
        button.dataset.cardId = card.id;
        button.disabled = !active || spectator || !isTurn;
        const image = document.createElement('img');
        image.src = daifuguCardImage(card);
        image.alt = card.joker ? 'Joker' : `${card.suit}${card.rank}`;
        button.append(image);
        button.addEventListener('click', () => button.classList.toggle('selected'));
        hand.append(button);
      });
      ui.gameControls.append(hand);
    }
    if (active && !spectator && isTurn && !snapshot.pending && own?.hand) {
      appendGameButton(ui.gameControls, '選択カードを出す', submitDaifuguPlay, false, 'button primary');
      appendGameButton(ui.gameControls, 'パス', () => dispatch({ type: 'game-action', action: { type: 'pass' } }));
    } else if (active && !spectator && isTurn && snapshot.pending && own?.hand) {
      appendGameButton(ui.gameControls, '効果を選択', submitDaifuguEffect, false, 'button primary');
    }
    if (snapshot.logs?.length) {
      const log = document.createElement('p');
      log.className = 'game-scores';
      log.textContent = snapshot.logs[0];
      ui.gameControls.append(log);
    }
  }

  function selectedDaifuguIds() {
    return [...ui.gameControls.querySelectorAll('.game-hand-select.selected')].map(button => button.dataset.cardId);
  }

  function submitDaifuguPlay() {
    const snapshot = state.game.daifugu;
    const own = snapshot.players.find(candidate => candidate.roomPlayerId === me.id);
    const selected = selectedDaifuguIds().map(id => {
      const card = own.hand.find(candidate => candidate.id === id);
      if (!card?.joker) return { id };
      const rank = prompt('Jokerの数字を入力してください（3〜2）', '3');
      const suit = prompt('Jokerの柄を入力してください（♠、♥、♦、♣）', '♠');
      if (!rank || !suit) return null;
      return { id, assignedRank: rank, assignedSuit: suit };
    });
    if (!selected.length || selected.some(card => !card)) {
      if (!selected.length) notify('出すカードを選んでください。');
      return;
    }
    dispatch({ type: 'game-action', action: { type: 'play', cards: selected } });
  }

  function submitDaifuguEffect() {
    const pending = state.game.daifugu.pending;
    const choice = {};
    if (pending.type === 'threshold') {
      choice.direction = prompt('次の人はJより上か下か（over / under）', 'over');
    } else if (pending.type === 'give' || pending.type === 'discard') {
      choice.cardIds = selectedDaifuguIds();
      if (pending.type === 'give') {
        const targets = state.game.daifugu.players.filter(player => player.roomPlayerId !== me.id && (player.handCount || player.hand?.length));
        const target = prompt(`カードを渡す相手の番号を入力してください: ${targets.map((player, index) => `${index + 1}:${player.name}`).join(' ')}`);
        choice.targetId = targets[Number(target) - 1]?.id;
      }
    } else if (pending.type === 'q') {
      const ranks = prompt('全員から捨てる数字をカンマ区切りで入力してください（例: 3,7）', '3');
      choice.ranks = ranks ? ranks.split(',').map(rank => rank.trim()).filter(Boolean) : [];
    }
    dispatch({ type: 'game-action', action: { type: 'effect', choice } });
  }
  $('#image-scale-wrap').hidden = !selectedImageId;
  if (selectedImageId) {
    const selected = state.objects.find(item => item.id === selectedImageId);
    if (selected) {
      $('#image-scale').value = String(selected.scale || 1);
      $('#image-scale-value').textContent = `${Math.round((selected.scale || 1) * 100)}%`;
    }
  }
  renderDecks();
}

function renderDecks() {
  ui.decks.replaceChildren();
  ui.dealDeck.replaceChildren();
  for (const deck of state.decks) {
    const remaining = state.cards.filter(card => card.deckId === deck.id && card.zone === 'deck').length;
    const option = document.createElement('option');
    option.value = deck.id;
    option.textContent = `箱 ${deck.index}（残り ${remaining} 枚）`;
    ui.dealDeck.append(option);

    const entry = document.createElement('div');
    entry.className = 'deck-entry';
    const draw = document.createElement('button');
    draw.type = 'button';
    draw.className = 'deck-draw';
    draw.disabled = remaining === 0;
    draw.setAttribute('aria-label', `箱 ${deck.index} から1枚引く`);
    const back = document.createElement('img');
    back.className = 'deck-back';
    back.src = '../cards/back@2x.png';
    back.alt = '';
    const meta = document.createElement('span');
    meta.className = 'deck-meta';
    const title = document.createElement('strong');
    title.textContent = `トランプの箱 ${deck.index}`;
    const count = document.createElement('small');
    count.textContent = `${remaining} / 52 枚`;
    meta.append(title, count);
    draw.append(back, meta);
    draw.addEventListener('click', () => dispatch({ type: 'draw-card', deckId: deck.id }));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button danger deck-remove';
    remove.textContent = '箱を削除（カードを回収）';
    remove.addEventListener('click', () => {
      if (confirm(`トランプの箱 ${deck.index} を削除し、箱のカードを回収しますか？`)) {
        dispatch({ type: 'remove-deck', deckId: deck.id });
      }
    });
    entry.append(draw);
    entry.append(remove);
    ui.decks.append(entry);
  }
  $('#add-deck').disabled = state.decks.length >= 2;
  $('#collect-cards').disabled = state.decks.length === 0;
  $('#deal-button').disabled = state.decks.length === 0 || state.players.length === 0;
  if (ui.dealDeck.options.length && ![...ui.dealDeck.options].some(option => option.selected)) {
    ui.dealDeck.selectedIndex = 0;
  }
}

async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選択してください。');
  if (file.size > 24 * 1024 * 1024) throw new Error('アップロード前の画像は24 MB以下にしてください。');
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.84;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const drawing = canvas.getContext('2d');
      if (!drawing) throw new Error('画像を圧縮できませんでした。');
      drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (!blob) throw new Error('WebP画像の作成に失敗しました。');
      if (blob.size <= MAX_IMAGE_BYTES) {
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('圧縮画像を読み込めませんでした。'));
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
      }
      quality = Math.max(0.35, quality - 0.08);
      scale *= 0.82;
    }
    throw new Error('圧縮後の画像が5 MBを超えています。小さい画像を選んでください。');
  } finally {
    bitmap.close();
  }
}

async function connect(create) {
  if (connecting) return;
  const name = ui.playerName.value.trim().slice(0, 24);
  if (!name) {
    ui.playerName.focus();
    notify('あなたの名前を入力してください。');
    return;
  }
  if (!API_KEY.trim() || !PASSWORD.trim()) {
    notify('app.js に SkyWay の API_KEY と PASSWORD（Secret Key）を設定してください。', 6500);
    return;
  }
  const desiredRoom = ui.roomId.value.trim().toLowerCase();
  if (!ROOM_NAME_PATTERN.test(desiredRoom)) {
    ui.roomId.focus();
    notify('部屋IDは英数字、ハイフン、アンダースコアで1〜48文字にしてください。');
    return;
  }
  me.name = name;
  roomId = desiredRoom;
  localStorage.setItem('tower-player-name', name);
  state = null;
  host = false;
  hostId = null;
  chatMessages = [];
  assets.clear();
  memberPublicKeys.clear();
  subscribedPublications.clear();
  chunkBuffers.clear();
  connecting = true;
  setConnection('SkyWayに接続中');
  try {
    const token = createToken();
    keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    context = await SkyWayContext.Create(token);
    room = create
      ? await SkyWayRoom.Create(context, { type: 'sfu', name: roomId })
      : await SkyWayRoom.Find(context, { name: roomId }, { type: 'sfu' });
    member = await room.join({ name: skywayMemberName });
    me.id = member.id;
    await member.updateMetadata(JSON.stringify({ displayName: me.name }));
    dataRoom = create
      ? await SkyWayRoom.Create(context, { type: 'p2p', name: `tower-data-${roomId}` })
      : await SkyWayRoom.Find(context, { name: `tower-data-${roomId}` }, { type: 'p2p' });
    dataMember = await dataRoom.join({ name: skywayMemberName });
    const roomMetadata = room.metadata ? JSON.parse(room.metadata) : null;
    if (create) {
      host = true;
      hostId = member.id;
      memberPublicKeys.set(member.id, publicKeyJwk);
      state = TowerEngine.createState(roomId, { id: member.id, name: me.name });
      await room.updateMetadata(JSON.stringify({
        hostId,
        hostName: me.name,
        publicListing: state.publicListing
      }));
    } else {
      if (!roomMetadata?.hostId) throw new Error('部屋のホスト情報を読み込めません。部屋IDを確認してください。');
      hostId = roomMetadata.hostId;
      host = hostId === member.id;
    }
    dataStream = await SkyWayStreamFactory.createDataStream({ ordered: true });
    await dataMember.publish(dataStream);
    send({ type: 'key-share', publicKey: publicKeyJwk });
    dataRoom.onStreamPublished.add(({ publication }) => { void subscribePublication(publication); });
    room.onMemberListChanged.add(() => render());
    room.onMemberMetadataUpdated.add(({ member: updated }) => {
      if (!host) return;
      try {
        state = TowerEngine.apply(state, {
          type: 'add-player',
          actorId: member.id,
          player: { id: updated.id, name: participantName(updated) }
        });
        broadcastState();
      } catch (error) {
        notify(error.message);
      }
      render();
    });
    room.onMemberJoined.add(({ member: joined }) => {
      render();
      if (host && joined.id !== member.id) {
        try {
          state = TowerEngine.apply(state, {
            type: 'add-player',
            actorId: member.id,
            player: { id: joined.id, name: participantName(joined) }
          });
          broadcastState();
        } catch (error) {
          notify(error.message);
        }
      }
    });
    room.onMemberLeft.add(({ member: departed }) => {
      render();
      if (departed.id === hostId && !host) {
        finishRoom('ホストが退出したため、部屋を解散しました。', true);
      } else if (host) {
        try {
          state = TowerEngine.apply(state, {
            type: 'remove-player',
            actorId: member.id,
            playerId: departed.id
          });
          broadcastState();
        } catch (error) {
          notify(error.message);
        }
      }
    });
    room.onClosed.add(() => finishRoom('部屋は解散されました。'));
    dataRoom.onClosed.add(() => finishRoom('部屋のデータ通信が切断されました。'));
    for (const publication of dataRoom.publications) void subscribePublication(publication);
    if (host) {
      for (const participant of room.members) {
        if (participant.id === member.id) continue;
        state = TowerEngine.apply(state, {
          type: 'add-player',
          actorId: member.id,
          player: { id: participant.id, name: participantName(participant) }
        });
      }
    }

    ui.lobby.hidden = true;
    ui.app.hidden = false;
    ui.app.dataset.active = 'true';
    setConnection('オンライン');
    if (host) render();
    if (host) {
      announcePublicRoom();
      clearInterval(lobbyAnnounceTimer);
      lobbyAnnounceTimer = setInterval(announcePublicRoom, 15_000);
    }
    else {
      let attempts = 0;
      const requestState = () => {
        if (state || attempts >= 15) {
          clearInterval(handshakeTimer);
          handshakeTimer = 0;
          if (!state) {
            setConnection('同期エラー');
            notify('ホストから部屋の状態を受信できません。部屋が存在するか確認してください。', 7000);
          }
          return;
        }
        attempts += 1;
        try {
          send({ type: 'key-share', publicKey: publicKeyJwk });
          send({ type: 'request', action: { type: 'state-request' } });
        } catch (error) {
          setConnection('同期エラー');
          notify(`ルーム同期に失敗しました: ${error.message}`);
        }
      };
      requestState();
      handshakeTimer = setInterval(requestState, 1000);
    }
    if (create) appendChat('SYSTEM', '部屋を作成しました。招待リンクを共有してください。');
  } catch (error) {
    await cleanupConnection();
    ui.app.hidden = true;
    ui.app.dataset.active = 'false';
    ui.lobby.hidden = false;
    setConnection('接続エラー');
    notify(`部屋に接続できませんでした: ${error.message}`, 7000);
  } finally {
    connecting = false;
  }
}

async function cleanupConnection(closeRoom = false) {
  if ((!room && !dataRoom && !context) || closing) return;
  closing = true;
  clearInterval(lobbyAnnounceTimer);
  lobbyAnnounceTimer = 0;
  if (closeRoom) removePublicRoomAnnouncement();
  try {
    let results;
    if (closeRoom) {
      results = await Promise.allSettled([room?.close(), dataRoom?.close()].filter(Boolean));
    } else {
      results = await Promise.allSettled([
        room && member ? room.leave(member) : undefined,
        dataRoom && dataMember ? dataRoom.leave(dataMember) : undefined
      ].filter(Boolean));
    }
    for (const result of results) {
      if (result.status === 'rejected') console.error('SkyWay room cleanup failed', result.reason);
    }
    await context?.dispose();
  } catch (error) {
    console.error('SkyWay room cleanup failed', error);
  }
  room = null;
  member = null;
  dataStream = null;
  dataRoom = null;
  dataMember = null;
  state = null;
  context = null;
  host = false;
  hostId = null;
  clearInterval(handshakeTimer);
  handshakeTimer = 0;
  subscribedPublications.clear();
  closing = false;
}

function finishRoom(message, closeRoom = false) {
  if (closing) return;
  void cleanupConnection(closeRoom);
  ui.app.hidden = true;
  ui.app.dataset.active = 'false';
  ui.lobby.hidden = false;
  setConnection('切断');
  notify(message);
}

ui.joinForm.addEventListener('submit', event => {
  event.preventDefault();
  void connect(false);
});
$('#create-room').addEventListener('click', () => {
  if (!ui.roomId.value.trim()) ui.roomId.value = `table-${Math.random().toString(36).slice(2, 8)}`;
  void connect(true);
});
$('#leave-room').addEventListener('click', async () => {
  if (host) await cleanupConnection(true);
  else await cleanupConnection();
  ui.app.hidden = true;
  ui.app.dataset.active = 'false';
  ui.lobby.hidden = false;
  setConnection('退出しました');
});
$('#copy-room').addEventListener('click', async () => {
  const link = new URL(location.href);
  link.search = new URLSearchParams({ room: roomId }).toString();
  try {
    await navigator.clipboard.writeText(link.href);
    notify('招待リンクをコピーしました。');
  } catch {
    notify(`招待リンク: ${link.href}`, 9000);
  }
});
$('#label-form').addEventListener('submit', event => {
  event.preventDefault();
  const label = $('#label-text').value.trim() || me.name;
  dispatch({ type: 'add-label', label, x: 50, y: 50 });
  $('#label-text').value = '';
});
$('#image-upload').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const data = await compressImage(file);
    const assetId = crypto.randomUUID();
    assets.set(assetId, data);
    send({ type: 'asset-upload', assetId, data });
    dispatch({ type: 'add-image', assetId });
    notify('画像を共有テーブルに追加しました。');
  } catch (error) {
    notify(error.message);
  }
});
$('#coin-form').addEventListener('submit', event => {
  event.preventDefault();
  dispatch({ type: 'add-wallet-coins', amount: $('#coin-amount').value });
});
$('#coin-place-form').addEventListener('submit', event => {
  event.preventDefault();
  dispatch({ type: 'place-coins', amount: $('#coin-place-amount').value, x: 50, y: 50 });
});
$('#coin-return-form').addEventListener('submit', event => {
  event.preventDefault();
  dispatch({ type: 'return-wallet-coins', amount: $('#coin-return-amount').value });
});
$('#bet-form').addEventListener('submit', event => {
  event.preventDefault();
  dispatch({ type: 'add-bet', amount: $('#bet-amount').value });
});
$('#award-pot').addEventListener('click', () => {
  const winnerId = $('#pot-winner').value;
  if (winnerId) dispatch({ type: 'settle-pot', winnerId });
});
$('#refund-pot').addEventListener('click', () => dispatch({ type: 'settle-pot', refund: true }));
$('#return-all-wallet').addEventListener('click', () => {
  if (confirm('所持コインをすべてコインケースに戻しますか？')) {
    dispatch({ type: 'return-all-wallet-coins' });
  }
});
$('#clear-table').addEventListener('click', () => {
  if (confirm('場の物・表に出ているカード・描画をすべて片付けますか？ コインは持ち主に戻り、カードは箱に戻ります。')) {
    dispatch({ type: 'clear-table' });
  }
});
$('#add-deck').addEventListener('click', () => dispatch({ type: 'add-deck' }));
$('#collect-cards').addEventListener('click', () => dispatch({ type: 'collect-all-cards' }));
$('#deal-mode').addEventListener('change', event => {
  $('#per-player-wrap').hidden = event.target.value !== 'each';
});
$('#deal-button').addEventListener('click', () => {
  dispatch({
    type: 'deal',
    deckId: ui.dealDeck.value,
    mode: $('#deal-mode').value,
    perPlayer: $('#per-player').value,
    reserve: $('#reserve-count').value,
    excludeRanks: $('#exclude-ranks').value
  });
});
$('#start-game').addEventListener('click', () => dispatch({
  type: 'start-game',
  mode: ui.gameMode.value
}));
$('#end-game').addEventListener('click', () => {
  if (confirm('進行中のゲームを終了しますか？')) dispatch({ type: 'end-game' });
});
$('#create-mahjong-wall').addEventListener('click', () => dispatch({ type: 'add-mahjong-wall' }));
$('#draw-mahjong-tile').addEventListener('click', () => dispatch({ type: 'draw-mahjong-tile' }));
$('#public-listing').addEventListener('change', event => {
  dispatch({ type: 'set-public-listing', enabled: event.target.checked });
});
$('#image-scale').addEventListener('input', event => {
  const scale = Number(event.target.value);
  $('#image-scale-value').textContent = `${Math.round(scale * 100)}%`;
  if (selectedImageId) dispatch({ type: 'scale-image', objectId: selectedImageId, scale });
});
$('#pen-mode').addEventListener('click', () => {
  drawingMode = drawingMode === 'pen' ? 'none' : 'pen';
  updateDrawingLabel();
});
$('#eraser-mode').addEventListener('click', () => {
  drawingMode = drawingMode === 'eraser' ? 'none' : 'eraser';
  updateDrawingLabel();
});
$('#clear-drawing').addEventListener('click', () => dispatch({ type: 'clear-strokes' }));
ui.drawingLayer.addEventListener('pointerdown', event => {
  if (drawingMode === 'none' || event.button !== 0 || !state) return;
  event.preventDefault();
  ui.drawingLayer.setPointerCapture(event.pointerId);
  const point = drawingPoint(event);
  if (drawingMode === 'pen') {
    activeStrokeId = crypto.randomUUID();
    pendingDrawPoints = [];
    lastDrawSendAt = Date.now();
    dispatch({
      type: 'add-stroke',
      strokeId: activeStrokeId,
      color: $('#draw-color').value,
      width: Number($('#draw-width').value),
      points: [point]
    });
  } else {
    lastDrawSendAt = Date.now();
    dispatch({ type: 'erase-stroke', ...point, radius: 3 });
  }
});
ui.drawingLayer.addEventListener('pointermove', event => {
  if (!ui.drawingLayer.hasPointerCapture(event.pointerId) || drawingMode === 'none') return;
  const point = drawingPoint(event);
  if (drawingMode === 'pen' && activeStrokeId) {
    pendingDrawPoints.push(point);
    if (Date.now() - lastDrawSendAt >= 40) {
      flushStrokePoints();
      lastDrawSendAt = Date.now();
    }
  } else if (drawingMode === 'eraser') {
    if (Date.now() - lastDrawSendAt >= 40) {
      lastDrawSendAt = Date.now();
      dispatch({ type: 'erase-stroke', ...point, radius: 3 });
    }
  }
});
ui.drawingLayer.addEventListener('pointerup', event => {
  if (!ui.drawingLayer.hasPointerCapture(event.pointerId)) return;
  if (drawingMode === 'pen') flushStrokePoints();
  ui.drawingLayer.releasePointerCapture(event.pointerId);
  activeStrokeId = null;
});
ui.drawingLayer.addEventListener('pointercancel', () => {
  if (activeStrokeId) flushStrokePoints();
  activeStrokeId = null;
});
ui.chatForm.addEventListener('submit', event => {
  event.preventDefault();
  const text = ui.chatText.value.trim();
  if (!text) return;
  const sentAt = Date.now();
  try {
    send({ type: 'chat', text, sentAt });
    appendChat(me.name, text, sentAt);
    if (host) {
      chatMessages.push({ name: me.name, text, sentAt });
      chatMessages = chatMessages.slice(-50);
    }
    ui.chatText.value = '';
  } catch (error) {
    notify(error.message);
  }
});
ui.privateChatForm.addEventListener('submit', event => {
  event.preventDefault();
  const text = ui.privateChatText.value.trim();
  const to = ui.privateChatRecipient.value;
  if (!text || !to) {
    notify('個別メッセージの送信先を選んでください。');
    return;
  }
  const recipient = room?.members.find(item => item.id === to);
  if (!recipient) {
    notify('送信先が退出したため、個別メッセージを送れません。');
    return;
  }
  try {
    const sentAt = Date.now();
    send({ type: 'direct-chat', to, text, sentAt });
    appendPrivateChat(`${participantName(recipient)} へ`, text, sentAt);
    ui.privateChatText.value = '';
  } catch (error) {
    notify(error.message);
  }
});

addEventListener('beforeunload', () => {
  if (host) removePublicRoomAnnouncement();
  if (host && (room || dataRoom)) void cleanupConnection(true);
});

void openLobby();
