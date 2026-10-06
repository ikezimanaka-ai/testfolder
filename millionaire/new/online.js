import { applyOnlineAction, createOnlineGame, getOnlineSnapshot, markOnlinePlayerLeft } from "./multi-poker.js?v=20261006-daifugo-engine";

const $ = (selector) => document.querySelector(selector);
const IDLE_LIMIT = 10 * 60 * 1000;
const LOBBY_NAME = "daifugo-lobby-v1";
const MAX_PLAYERS = 10;
const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const SUITS = ["♠", "♥", "♦", "♣"];

const lobbyPage = Boolean($("#online-lobby"));
const gamePage = Boolean($("#room-status"));
const rooms = new Map();
let context;
let lobbyRoom;
let lobbyMember;
let lobbyStream;
let gameRoom;
let gameMember;
let gameStream;
let activeRoomId = "";
let roomName = "";
let isHost = false;
let phase = "waiting";
let roomPlayers = [];
let playerId = null;
let role = "spectator";
let gameSnapshot = null;
let privateHand = [];
let selectedIds = new Set();
let ownKeyPair;
let ownPublicKeyText = "";
let hostPublicKey;
let idleTimer;
let finishTimer;
let roomClosing = false;
let localLeave = false;
let ownName = "";
let lastActivity = Date.now();
let expectedHostId = "";
let hostMemberId = "";
let lobbyDiscoveryTimer;
let lobbyDiscoveryCount = 0;
let lastRoomListSignature = "";
let chatMessages = [];

function debugLog(event, details = {}) {
  console.info(`[DaifugoOnline] ${event}`, details);
}

function displayStatus(message, error = false) {
  const target = $("#online-status") ?? $("#room-status");
  if (target) {
    target.textContent = message;
    target.classList.toggle("online-error", error);
  }
  if (error && $("#room-notice")) $("#room-notice").textContent = message;
}

function reportFailure(error, message) {
  console.error(message, error);
  displayStatus(`${message}: ${error?.message ?? error}`, true);
}

function addChatMessage(name, text, timestamp = Date.now()) {
  chatMessages.push({ name, text, timestamp });
  if (chatMessages.length > 100) chatMessages = chatMessages.slice(-100);
  const root = $("#online-chat-messages");
  if (!root) return;
  const item = document.createElement("li");
  item.className = "online-chat-message";
  const author = document.createElement("strong");
  author.textContent = name;
  const content = document.createElement("span");
  content.textContent = `: ${text}`;
  const time = document.createElement("time");
  time.className = "online-chat-time";
  time.dateTime = new Date(timestamp).toISOString();
  time.textContent = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  item.append(author, content, time);
  root.append(item);
  root.scrollTop = root.scrollHeight;
}

function sendChatMessage(event) {
  event.preventDefault();
  const input = $("#online-chat-input");
  const text = input.value.trim().slice(0, 300);
  if (!text || !gameStream || !gameMember) return;
  try {
    write(gameStream, { type: "CHAT", text });
    addChatMessage(ownName, text);
    if (isHost) markActivity();
    input.value = "";
    input.focus();
  } catch (error) {
    reportFailure(error, "チャットを送信できませんでした");
  }
}

function getConfig() {
  const config = globalThis.SKYWAY_CONFIG;
  if (!config || typeof config.appId !== "string" || !config.appId || typeof config.secret !== "string" || !config.secret) {
    throw new Error("SkyWayの実行時設定がありません。online-config.example.js を参考に、ローカル設定ファイルを作成してください。");
  }
  return config;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function makeSkyWayMemberName() {
  return `player-${makeId().replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`;
}

function normalizePlayerName(value) {
  return String(value || "").trim().slice(0, 24);
}

function safeName(value) {
  return normalizePlayerName(value) || `プレイヤー${Math.floor(Math.random() * 900 + 100)}`;
}

function readPlayerNameCookie() {
  try {
    const cookie = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("millionaire_online_player_name="));
    if (!cookie) return "";
    return decodeURIComponent(cookie.slice("millionaire_online_player_name=".length));
  } catch (error) {
    console.warn("オンラインプレイヤー名のCookieを読み込めませんでした。", error);
    return "";
  }
}

function savePlayerNameCookie(value) {
  const name = normalizePlayerName(value);
  if (!name) return;
  try {
    const expires = new Date();
    expires.setTime(expires.getTime() + 365 * 24 * 60 * 60 * 1000);
    document.cookie = `millionaire_online_player_name=${encodeURIComponent(name)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
  } catch (error) {
    console.warn("オンラインプレイヤー名のCookieを保存できませんでした。", error);
  }
}

function parseMessage(raw) {
  try {
    const value = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    return JSON.parse(value);
  } catch (error) {
    console.error("SkyWayメッセージを読み取れませんでした。", error);
    return null;
  }
}

function write(stream, message) {
  if (!stream) throw new Error("通信ストリームがまだ接続されていません。");
  stream.write(JSON.stringify(message));
  if (message.type === "ROOM_REQUEST" || message.type === "ROOM_UPSERT" || message.type === "ROOM_DELETE" || message.type === "ROOM_SNAPSHOT") {
    debugLog("lobby.send", {
      type: message.type,
      roomId: message.room?.id ?? message.id ?? null,
      memberCount: message.room?.memberCount ?? message.rooms?.length ?? null
    });
  }
}

function subscribePublications(room, member, onMessage) {
  const subscribed = new Set();
  const subscribing = new Set();
  const publisherIsPresent = (publication) =>
    room.members.some((roomMember) => roomMember.id === publication.publisher?.id);
  const subscribe = (publication) => {
    if (!publication || publication.contentType !== "data" || publication.publisher?.id === member.id ||
      !publisherIsPresent(publication) || subscribed.has(publication.id) || subscribing.has(publication.id)) return;
    subscribing.add(publication.id);
    debugLog("stream.subscribe.start", {
      memberId: member.id,
      publisherId: publication.publisher?.id,
      publicationId: publication.id,
      currentMemberIds: room.members.map((roomMember) => roomMember.id)
    });
    void member.subscribe(publication.id).then((result) => {
      subscribed.add(publication.id);
      debugLog("stream.subscribe.ready", {
        memberId: member.id,
        publisherId: publication.publisher?.id,
        publicationId: publication.id
      });
      result.stream.onData.add((raw) => {
        const message = parseMessage(raw);
        if (message) {
          if (["ROOM_REQUEST", "ROOM_UPSERT", "ROOM_DELETE", "ROOM_SNAPSHOT"].includes(message.type)) {
            debugLog("lobby.receive", {
              type: message.type,
              senderId: publication.publisher.id,
              roomId: message.room?.id ?? message.id ?? null,
              memberCount: message.room?.memberCount ?? message.rooms?.length ?? null
            });
          }
          onMessage(message, publication.publisher.id);
        }
      });
    }).catch((error) => {
      debugLog("stream.subscribe.failed", {
        memberId: member.id,
        publisherId: publication.publisher?.id,
        publicationId: publication.id,
        publisherStillInRoom: publisherIsPresent(publication),
        error: error?.message ?? String(error)
      });
      if (!publisherIsPresent(publication)) return;
      console.error("SkyWayデータストリームを購読できませんでした。", error);
      if (gamePage) displayStatus("参加者の通信を開始できませんでした。", true);
    }).finally(() => {
      subscribing.delete(publication.id);
    });
  };
  room.onStreamPublished.add((event) => subscribe(event.publication));
  return () => {
    for (const publication of room.publications) subscribe(publication);
  };
}

async function createStream(room, member, onMessage) {
  const subscribeExistingPublications = subscribePublications(room, member, onMessage);
  const stream = await globalThis.skyway_room.SkyWayStreamFactory.createDataStream();
  const publication = await member.publish(stream);
  debugLog("stream.published", {
    memberId: member.id,
    publicationId: publication.id,
    roomMemberIds: room.members.map((roomMember) => roomMember.id)
  });
  subscribeExistingPublications();
  return stream;
}

async function connectContext() {
  if (!globalThis.skyway_room) throw new Error("SkyWay SDKを読み込めませんでした。ネットワーク接続を確認してください。");
  if (!globalThis.crypto?.subtle) throw new Error("手札を保護する暗号化に対応した安全な接続（HTTPSまたはlocalhost）が必要です。");
  if (!globalThis.SKYWAY_CONFIG) {
    const response = await fetch("./online-config.local.js", { cache: "no-store" });
    if (!response.ok) throw new Error("SkyWay設定ファイルがありません。online-config.example.js を online-config.local.js にコピーして設定してください。");
    await import("./online-config.local.js");
  }
  const config = getConfig();
  const { SkyWayContext } = globalThis.skyway_room;
  context = await SkyWayContext.CreateForDevelopment(config.appId, config.secret);
  debugLog("context.ready", { authentication: "development", secretsLogged: false });
}

function roomMetadata() {
  return {
    id: activeRoomId,
    name: roomName,
    hostId: gameMember?.id,
    phase,
    memberCount: roomPlayers.filter((player) => !player.left).length,
    playerCount: roomPlayers.filter((player) => !player.left && player.role === "player").length,
    maxPlayers: MAX_PLAYERS,
    updatedAt: lastActivity
  };
}

function announceRoom() {
  if (!isHost || !lobbyStream || !activeRoomId) return;
  const meta = roomMetadata();
  rooms.set(meta.id, meta);
  debugLog("room.advertised", { ...meta });
  write(lobbyStream, { type: "ROOM_UPSERT", room: meta });
  renderRoomList();
}

function isRoomMetadata(room) {
  return Boolean(
    room && typeof room.id === "string" && typeof room.name === "string" &&
    typeof room.hostId === "string" && Number.isFinite(room.updatedAt) &&
    Number.isInteger(room.memberCount) && room.memberCount >= 1 && room.memberCount <= MAX_PLAYERS &&
    (room.phase === "waiting" || room.phase === "playing")
  );
}

function announceDelete(roomId) {
  rooms.delete(roomId);
  renderRoomList();
  if (lobbyStream) write(lobbyStream, { type: "ROOM_DELETE", id: roomId });
}

function markActivity() {
  lastActivity = Date.now();
  if (isHost) announceRoom();
}

function onLobbyMessage(message, senderId) {
  if (!message || typeof message !== "object") return;
  if (message.type === "ROOM_UPSERT" && isRoomMetadata(message.room)) {
    if (Date.now() - message.room.updatedAt < IDLE_LIMIT) {
      rooms.set(message.room.id, message.room);
      renderRoomList();
    }
  } else if (message.type === "ROOM_DELETE" && typeof message.id === "string") {
    rooms.delete(message.id);
    renderRoomList();
  } else if (message.type === "ROOM_REQUEST") {
    for (const room of rooms.values()) write(lobbyStream, { type: "ROOM_UPSERT", room });
    if (isHost && activeRoomId) announceRoom();
  } else if (message.type === "ROOM_SNAPSHOT" && Array.isArray(message.rooms)) {
    message.rooms.forEach((room) => {
      if (isRoomMetadata(room) && Date.now() - room.updatedAt < IDLE_LIMIT) rooms.set(room.id, room);
    });
    renderRoomList();
  }
  if (senderId === lobbyMember?.id) return;
}

async function connectLobby() {
  await connectContext();
  const { SkyWayRoom } = globalThis.skyway_room;
  lobbyRoom = await SkyWayRoom.FindOrCreate(context, { type: "p2p", name: LOBBY_NAME });
  lobbyMember = await lobbyRoom.join({ name: makeSkyWayMemberName() });
  debugLog("lobby.joined", {
    memberId: lobbyMember.id,
    roomName: LOBBY_NAME,
    members: lobbyRoom.members.map(({ id, name }) => ({ id, name })),
    existingPublications: lobbyRoom.publications.map((publication) => ({
      id: publication.id,
      publisherId: publication.publisher?.id,
      contentType: publication.contentType
    }))
  });
  lobbyStream = await createStream(lobbyRoom, lobbyMember, onLobbyMessage);
  debugLog("connection.ready", {
    page: lobbyPage ? "lobby" : "game",
    lobbyMemberId: lobbyMember.id,
    lobbyMembers: lobbyRoom.members.map(({ id, name }) => ({ id, name })),
    roomCount: rooms.size
  });
  requestLobbyRooms();
  lobbyDiscoveryTimer = window.setInterval(() => {
    if (lobbyDiscoveryCount >= 4) {
      window.clearInterval(lobbyDiscoveryTimer);
      lobbyDiscoveryTimer = window.setInterval(requestLobbyRooms, 5000);
      return;
    }
    requestLobbyRooms();
  }, 1500);
  if (lobbyPage) displayStatus("ロビーに接続しました。");
}

function requestLobbyRooms() {
  if (!lobbyStream) return;
  lobbyDiscoveryCount++;
  write(lobbyStream, { type: "ROOM_REQUEST" });
  debugLog("lobby.discovery", {
    attempt: lobbyDiscoveryCount,
    knownRooms: rooms.size,
    members: lobbyRoom?.members.map(({ id, name }) => ({ id, name })) ?? []
  });
}

function renderRoomList() {
  if (!lobbyPage) return;
  const list = $("#room-list");
  const now = Date.now();
  const expired = [];
  for (const [id, room] of rooms) {
    if (now - room.updatedAt >= IDLE_LIMIT) {
      rooms.delete(id);
      expired.push(id);
    }
  }
  expired.forEach((id) => { if (lobbyStream) write(lobbyStream, { type: "ROOM_DELETE", id }); });
  const available = [...rooms.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const signature = JSON.stringify(available.map(({ id, name, phase, memberCount }) => ({ id, name, phase, memberCount })));
  if (signature !== lastRoomListSignature) {
    lastRoomListSignature = signature;
    debugLog("room.list.updated", { count: available.length, rooms: available });
  }
  $("#room-list-count").textContent = `${available.length}部屋`;
  list.replaceChildren();
  if (!available.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "募集中の部屋はありません。";
    list.append(empty);
    return;
  }
  available.forEach((room) => {
    const item = document.createElement("article");
    item.className = "room-item";
    const details = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = room.name;
    const description = document.createElement("p");
    description.textContent = `${room.phase === "playing" ? "対戦中（観戦可）" : "参加者募集中"} · ${room.memberCount}/${room.maxPlayers}人`;
    details.append(title, description);
    const join = document.createElement("button");
    join.className = room.memberCount >= room.maxPlayers ? "secondary" : "primary";
    join.type = "button";
    join.textContent = room.memberCount >= room.maxPlayers ? "満員" : "参加";
    join.disabled = room.memberCount >= room.maxPlayers;
    join.addEventListener("click", () => {
      const name = safeName($("#online-name").value);
      location.href = `./online.html?room=${encodeURIComponent(room.id)}&name=${encodeURIComponent(name)}&owner=${encodeURIComponent(room.hostId)}`;
    });
    item.append(details, join);
    list.append(item);
  });
}

function exportKey(key) {
  return crypto.subtle.exportKey("raw", key).then((buffer) => toBase64(new Uint8Array(buffer)));
}

function toBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function prepareIdentity() {
  ownKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  ownPublicKeyText = await exportKey(ownKeyPair.publicKey);
}

async function importPublicKey(value) {
  return crypto.subtle.importKey("raw", fromBase64(value), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function deriveHandKey(privateKey, publicKey) {
  return crypto.subtle.deriveKey({ name: "ECDH", public: publicKey }, privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptHand(hand, recipientPublicKey) {
  const key = await deriveHandKey(ownKeyPair.privateKey, recipientPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(hand));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) };
}

async function decryptHand(message) {
  if (message.hostPublicKey) hostPublicKey = await importPublicKey(message.hostPublicKey);
  if (!hostPublicKey || !ownKeyPair) return;
  const key = await deriveHandKey(ownKeyPair.privateKey, hostPublicKey);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(message.iv) }, key, fromBase64(message.data));
  privateHand = JSON.parse(new TextDecoder().decode(decrypted));
  renderGame();
}

async function connectGameRoom(id, asHost = false) {
  const { SkyWayRoom } = globalThis.skyway_room;
  activeRoomId = id;
  isHost = asHost;
  gameRoom = await SkyWayRoom.FindOrCreate(context, { type: "p2p", name: id });
  gameMember = await gameRoom.join({ name: makeSkyWayMemberName() });
  debugLog("game-room.joined", {
    roomId: id,
    memberId: gameMember.id,
    owner: asHost,
    members: gameRoom.members.map(({ id: memberId, name }) => ({ id: memberId, name }))
  });
  hostMemberId = isHost ? gameMember.id : expectedHostId;
  await prepareIdentity();
  gameStream = await createStream(gameRoom, gameMember, (message, senderId) => { void onGameMessage(message, senderId); });
  gameRoom.onMemberLeft.add((event) => {
    if (event.member?.id && event.member.id !== gameMember?.id && isHost) {
      try {
        handlePlayerLeave(event.member.id);
      } catch (error) {
        reportFailure(error, "退出した参加者の状態を更新できませんでした");
      }
    }
  });
  if (isHost) {
    phase = "waiting";
    roomName = `${ownName}の部屋`;
    roomPlayers = [{ memberId: gameMember.id, name: ownName, role: "player", gameId: 0, left: false, publicKey: ownPublicKeyText }];
    playerId = 0;
    role = "player";
    await broadcastHostKey();
    markActivity();
    broadcastRoomState();
  } else {
    write(gameStream, { type: "HELLO", name: ownName, publicKey: ownPublicKeyText });
    const retryHello = window.setInterval(() => {
      if (playerId != null || !gameStream) {
        window.clearInterval(retryHello);
        return;
      }
      write(gameStream, { type: "HELLO", name: ownName, publicKey: ownPublicKeyText });
    }, 1200);
    window.setTimeout(() => window.clearInterval(retryHello), 10000);
  }
  if (gamePage) {
    renderGame();
    displayStatus(isHost ? "部屋を作成しました。" : "部屋に接続しました。");
  }
  if (isHost) {
    idleTimer = window.setInterval(() => {
      if (Date.now() - lastActivity >= IDLE_LIMIT) void dissolveRoom("10分間操作がなかったため部屋を解散しました。");
    }, 15000);
  }
}

async function broadcastHostKey() {
  if (!isHost || !gameStream) return;
  write(gameStream, { type: "HOST_KEY", publicKey: ownPublicKeyText });
}

function publicGameSnapshot() {
  const snapshot = getOnlineSnapshot();
  if (!snapshot) return null;
  return {
    ...snapshot,
    players: snapshot.players.map(({ hand: _hand, ...player }) => player)
  };
}

async function broadcastGameState() {
  if (!isHost || !gameStream || !gameSnapshot) return;
  const snapshot = publicGameSnapshot();
  write(gameStream, { type: "GAME_STATE", snapshot, phase });
  for (const participant of roomPlayers) {
    if (participant.role !== "player" || participant.left || participant.gameId == null || !participant.publicKey) continue;
    const player = getOnlineSnapshot(participant.gameId)?.players[participant.gameId];
    if (!player?.hand) continue;
    try {
      const encrypted = participant.memberId === gameMember.id
        ? null
        : await encryptHand(player.hand, await importPublicKey(participant.publicKey));
      if (encrypted) write(gameStream, { type: "PRIVATE_HAND", recipient: participant.memberId, hostPublicKey: ownPublicKeyText, ...encrypted });
      else {
        privateHand = player.hand;
        renderGame();
      }
    } catch (error) {
      console.error("手札の暗号化に失敗しました。", error);
      displayStatus("手札を安全に送信できませんでした。", true);
    }
  }
}

function broadcastRoomState() {
  if (!isHost || !gameStream) return;
  write(gameStream, {
    type: "ROOM_STATE",
    roomName,
    phase,
    ownerId: gameMember.id,
    players: roomPlayers.map(({ publicKey: _publicKey, ...player }) => player),
    memberCount: roomPlayers.filter((player) => !player.left).length
  });
  announceRoom();
  renderGame();
}

function findPlayerByMember(memberId) {
  return roomPlayers.find((player) => player.memberId === memberId);
}

async function handleHostHello(message, senderId) {
  if (!isHost) return;
  if (typeof message.publicKey !== "string") {
    write(gameStream, { type: "ACTION_ERROR", recipient: senderId, reason: "暗号鍵を確認できませんでした。" });
    return;
  }
  await importPublicKey(message.publicKey);
  const existing = findPlayerByMember(senderId);
  if (existing) {
    existing.publicKey = message.publicKey;
    write(gameStream, { type: "ROLE", recipient: senderId, role: existing.role, playerId: existing.gameId });
    broadcastRoomState();
    await broadcastHostKey();
    if (phase === "playing") await broadcastGameState();
    return;
  }
  if (roomPlayers.filter((player) => !player.left).length >= MAX_PLAYERS) {
    write(gameStream, { type: "ROOM_FULL", recipient: senderId });
    return;
  }
  const newRole = phase === "playing" ? "spectator" : "player";
  const used = new Set(roomPlayers.map((player) => player.gameId).filter((id) => id != null));
  let gameId = null;
  if (newRole === "player") {
    gameId = 0;
    while (used.has(gameId)) gameId++;
  }
  roomPlayers.push({
    memberId: senderId,
    name: safeName(message.name),
    role: newRole,
    gameId,
    left: false,
    publicKey: message.publicKey
  });
  markActivity();
  broadcastRoomState();
  write(gameStream, { type: "ROLE", recipient: senderId, role: newRole, playerId: gameId });
  await broadcastHostKey();
  if (phase === "playing") await broadcastGameState();
}

function onGameMessage(message, senderId) {
  if (!message || typeof message !== "object") return;
  debugLog("game.receive", { type: message.type, senderId, phase });
  const hostMessages = new Set(["HOST_KEY", "ROOM_STATE", "ROLE", "GAME_STATE", "PRIVATE_HAND", "ROOM_FULL", "DISBAND", "ACTION_ERROR"]);
  if (!isHost && hostMessages.has(message.type) && (senderId !== hostMemberId || (message.type === "ROOM_STATE" && message.ownerId !== senderId))) return;
  if (message.type === "HELLO") {
    void handleHostHello(message, senderId).catch((error) => reportFailure(error, "参加者を登録できませんでした"));
  } else if (message.type === "HOST_KEY" && typeof message.publicKey === "string") {
    void importPublicKey(message.publicKey).then((key) => { hostPublicKey = key; }).catch((error) => {
      console.error("ホストの暗号鍵を読み込めませんでした。", error);
      displayStatus("ホストの手札暗号鍵を読み込めませんでした。", true);
    });
  } else if (message.type === "ROOM_STATE") {
    hostMemberId = message.ownerId;
    roomName = message.roomName;
    phase = message.phase;
    roomPlayers = message.players;
    if (gameMember?.id === message.ownerId) isHost = true;
    const mine = findPlayerByMember(gameMember?.id);
    if (mine) {
      role = mine.role;
      playerId = mine.gameId;
    }
    if (message.phase !== "playing") {
      gameSnapshot = null;
      privateHand = [];
      selectedIds.clear();
    }
    renderGame();
  } else if (message.type === "ROLE" && message.recipient === gameMember?.id) {
    role = message.role;
    playerId = message.playerId;
    renderGame();
  } else if (message.type === "GAME_STATE" && message.snapshot) {
    phase = message.phase;
    gameSnapshot = message.snapshot;
    selectedIds.clear();
    renderGame();
  } else if (message.type === "PRIVATE_HAND" && message.recipient === gameMember?.id) {
    void decryptHand(message).catch((error) => reportFailure(error, "手札を復号できませんでした"));
  } else if (message.type === "ACTION" && isHost) {
    void processAction(message, senderId).catch((error) => reportFailure(error, "ゲーム操作を処理できませんでした"));
  } else if (message.type === "ACTION_ERROR" && message.recipient === gameMember?.id) {
    displayStatus(message.reason || "操作を受け付けられませんでした。", true);
  } else if (message.type === "CHAT" && typeof message.text === "string") {
    const sender = findPlayerByMember(senderId);
    const text = message.text.trim().slice(0, 300);
    if (sender && !sender.left && text) {
      addChatMessage(sender.name, text);
      if (isHost) markActivity();
    }
  } else if (message.type === "ROOM_FULL" && message.recipient === gameMember?.id) {
    displayStatus("この部屋は満員です。", true);
    window.setTimeout(() => { void leaveGameRoom(); }, 200);
  } else if (message.type === "DISBAND") {
    phase = "closed";
    displayStatus(message.reason || "部屋が解散されました。", true);
    window.setTimeout(() => { location.href = "./index.html"; }, 1800);
  } else if (message.type === "LEAVE" && isHost) {
    handlePlayerLeave(senderId);
  }
  if (senderId !== gameMember?.id && isHost && message.type === "ACTION") markActivity();
}

async function processAction(message, senderId) {
  const participant = findPlayerByMember(senderId);
  if (!participant || participant.left || participant.role !== "player" || participant.gameId !== message.playerId) return;
  const result = applyOnlineAction(participant.gameId, message.action);
  if (!result.ok) {
    write(gameStream, { type: "ACTION_ERROR", recipient: senderId, reason: result.reason });
    return;
  }
  markActivity();
  gameSnapshot = result.snapshot;
  renderGame();
  await broadcastGameState();
  if (result.snapshot.finished) scheduleFinishRound();
}

function handlePlayerLeave(memberId) {
  const participant = findPlayerByMember(memberId);
  if (!participant || participant.left) return;
  if (phase === "playing" && participant.role === "player" && participant.gameId != null) {
    participant.left = true;
    const snapshot = markOnlinePlayerLeft(participant.gameId);
    gameSnapshot = snapshot;
    if (snapshot?.finished) scheduleFinishRound();
    else {
      markActivity();
      broadcastRoomState();
      void broadcastGameState();
    }
  } else {
    roomPlayers = roomPlayers.filter((player) => player.memberId !== memberId);
    markActivity();
    broadcastRoomState();
  }
}

function startGame() {
  if (!isHost || phase !== "waiting") return;
  const participants = roomPlayers.filter((player) => !player.left && player.role === "player").sort((a, b) => a.gameId - b.gameId);
  if (participants.length < 2) {
    displayStatus("ゲーム開始には2人以上必要です。", true);
    return;
  }
  if (participants.length > MAX_PLAYERS) {
    displayStatus(`1部屋の参加上限は${MAX_PLAYERS}人です。`, true);
    return;
  }
  phase = "playing";
  gameSnapshot = createOnlineGame(participants.map((player) => player.name));
  participants.forEach((player, index) => { player.gameId = index; });
  markActivity();
  broadcastRoomState();
  void broadcastGameState();
}

function scheduleFinishRound() {
  if (finishTimer) return;
  finishTimer = window.setTimeout(() => {
    finishTimer = null;
    void finishRound().catch((error) => reportFailure(error, "待機状態に戻せませんでした"));
  }, 1800);
}

async function finishRound() {
  if (!isHost || phase !== "playing" || !gameSnapshot?.finished) return;
  returnToWaiting();
}

function abortGame() {
  if (!isHost || phase !== "playing") return;
  if (!window.confirm("対戦を強制終了して、全員を待機状態に戻しますか？")) return;
  returnToWaiting();
}

function returnToWaiting() {
  if (finishTimer) window.clearTimeout(finishTimer);
  finishTimer = null;
  phase = "waiting";
  roomPlayers = roomPlayers.filter((player) => !player.left);
  roomPlayers.forEach((player, index) => {
    player.role = "player";
    player.gameId = index;
  });
  gameSnapshot = null;
  privateHand = [];
  selectedIds.clear();
  markActivity();
  broadcastRoomState();
}

function submitAction(action) {
  if (role !== "player" || playerId == null || phase !== "playing") return;
  if (isHost) {
    const result = applyOnlineAction(playerId, action);
    if (!result.ok) {
      displayStatus(result.reason, true);
      return;
    }
    gameSnapshot = result.snapshot;
    selectedIds.clear();
    markActivity();
    renderGame();
    void broadcastGameState();
    if (result.snapshot.finished) scheduleFinishRound();
  } else {
    write(gameStream, { type: "ACTION", playerId, action });
    renderGame();
  }
}

function renderRoomPlayers() {
  const root = $("#online-players");
  if (!root) return;
  root.replaceChildren();
  roomPlayers.forEach((player) => {
    const seat = document.createElement("article");
    seat.className = `online-seat${gameSnapshot?.current === player.gameId && phase === "playing" ? " current" : ""}${player.left ? " left" : ""}`;
    const title = document.createElement("strong");
    title.textContent = player.name;
    const meta = document.createElement("p");
    const status = player.left ? "退出済み（このゲーム終了後に削除）" : player.role === "spectator" ? "観戦中" : player.gameId === 0 && isHost ? "部屋主" : player.role === "player" ? "参加者" : "";
    const gamePlayer = player.role === "player" && player.gameId != null;
    const handCount = gamePlayer && (role === "spectator" || player.memberId !== gameMember?.id)
      ? gameSnapshot?.players?.[player.gameId]?.handCount
      : undefined;
    meta.textContent = handCount == null ? status : `${status} · 手札 ${handCount}枚`;
    seat.append(title, meta);
    root.append(seat);
  });
}

function makeCard(card, interactive) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `card${["♥", "♦"].includes(card.suit) ? " red" : ""}${card.joker ? " joker" : ""}${selectedIds.has(card.id) ? " selected" : ""}`;
  button.disabled = !interactive;
  const rank = document.createElement("span");
  rank.className = "rank";
  rank.textContent = card.joker ? card.assignedRank ?? "★" : card.rank;
  const suit = document.createElement("span");
  suit.className = "suit";
  suit.textContent = card.joker ? `JOKER ${card.assignedSuit ?? ""}` : card.suit;
  button.append(rank, suit);
  if (interactive) button.addEventListener("click", () => {
    selectedIds.has(card.id) ? selectedIds.delete(card.id) : selectedIds.add(card.id);
    renderGame();
  });
  return button;
}

function renderHand() {
  const root = $("#online-hand");
  if (!root) return;
  root.replaceChildren();
  const pending = gameSnapshot?.pending;
  const selectingEffectCards = pending?.from === playerId && ["give", "discard"].includes(pending.type);
  const turn = role === "player" && phase === "playing" && !gameSnapshot?.finished &&
    (selectingEffectCards || (!pending && gameSnapshot?.current === playerId));
  privateHand.slice().sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)).forEach((card) => root.append(makeCard(card, turn)));
  if (!privateHand.length && role === "player" && phase === "playing") {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "手札を安全に受信しています...";
    root.append(empty);
  }
  if ($("#online-selection-count")) $("#online-selection-count").textContent = `${selectedIds.size}枚選択`;
}

function renderEffects() {
  const root = $("#online-effects");
  if (!root) return;
  root.replaceChildren();
  const pending = gameSnapshot?.pending;
  const canChooseEffect = pending && pending.from === playerId && role === "player";
  const field = (label, control) => {
    const wrapper = document.createElement("label");
    wrapper.className = "online-field";
    wrapper.append(document.createTextNode(label), control);
    root.append(wrapper);
  };
  if (canChooseEffect && pending.type === "threshold") {
    const select = document.createElement("select");
    select.id = "online-threshold";
    select.innerHTML = '<option value="over">J以上</option><option value="under">J以下</option>';
    field("次の人が出す数字", select);
  } else if (canChooseEffect && pending.type === "give") {
    const select = document.createElement("select");
    select.id = "online-give-target";
    const targets = roomPlayers.filter((player) => !player.left && player.gameId !== playerId && player.role === "player");
    targets.forEach((player) => {
      const option = document.createElement("option");
      option.value = player.gameId;
      option.textContent = player.name;
      select.append(option);
    });
    field("カードを渡す相手", select);
    root.append(document.createTextNode(targets.length ? `手札から最大${pending.count}枚選択してください。` : "渡す相手がいないため、カードを選ばず確定してください。"));
  } else if (canChooseEffect && pending.type === "discard") {
    root.textContent = `手札から最大${pending.count}枚選択してください。`;
  } else if (canChooseEffect && pending.type === "q") {
    root.append(document.createTextNode(`捨てる数字を最大${pending.count}種類選択してください。`));
    [...RANKS, "Joker"].forEach((rank) => {
      const label = document.createElement("label");
      label.className = "online-field";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "online-q-rank";
      input.value = rank;
      label.append(input, document.createTextNode(rank));
      root.append(label);
    });
  } else if (canChooseEffect && pending.type === "joker") {
    root.append(document.createTextNode("選択したJokerの数字と柄を指定してください。"));
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "secondary";
    backButton.textContent = "カード選択に戻る";
    backButton.addEventListener("click", () => {
      if (gameSnapshot?.pending?.type !== "joker" || gameSnapshot.pending.from !== playerId) return;
      gameSnapshot = { ...gameSnapshot, pending: null };
      selectedIds.clear();
      renderGame();
    });
    root.append(backButton);
  }
  const selectedCards = privateHand.filter((card) => selectedIds.has(card.id));
  const naturalRanks = new Set(selectedCards.filter((card) => !card.joker).map((card) => card.rank));
  const defaultRank = naturalRanks.size === 1 ? [...naturalRanks][0] : "3";
  const naturalSuits = new Set(selectedCards.filter((card) => !card.joker).map((card) => card.suit));
  const defaultSuit = naturalSuits.size === 1 ? [...naturalSuits][0] : "♠";
  if (selectedCards.some((card) => card.joker)) {
    const hint = document.createElement("p");
    hint.className = "online-help";
    hint.textContent = "Jokerを出す前に、下の選択欄で数字と柄を指定してください。数字が揃ったカードと一緒に出す場合は、その数字を選びます。";
    root.append(hint);
  }
  selectedCards.filter((card) => card.joker).forEach((card) => {
    const rankSelect = document.createElement("select");
    rankSelect.dataset.jokerRank = card.id;
    [...RANKS, "Joker"].forEach((rank) => {
      const option = document.createElement("option");
      option.value = rank;
      option.textContent = rank;
      if (rank === (card.assignedRank ?? defaultRank)) option.selected = true;
      rankSelect.append(option);
    });
    const suitSelect = document.createElement("select");
    suitSelect.dataset.jokerSuit = card.id;
    SUITS.forEach((suit) => {
      const option = document.createElement("option");
      option.value = suit;
      option.textContent = suit;
      if (suit === (card.assignedSuit ?? defaultSuit)) option.selected = true;
      suitSelect.append(option);
    });
    field(`Jokerの数字（この選択なら${defaultRank}がおすすめ）`, rankSelect);
    field(`Jokerの柄（この選択なら${defaultSuit}がおすすめ）`, suitSelect);
  });
}

function renderGame() {
  if (!gamePage) return;
  $("#room-title").textContent = roomName || "大富豪オンライン";
  $("#phase-title").textContent = phase === "playing" ? "対戦中" : phase === "closed" ? "解散済み" : "待機中";
  $("#phase-detail").textContent = phase === "playing" ? `現在のターン：${gameSnapshot?.players?.[gameSnapshot.current]?.name ?? "確認中"}` : "参加者が集まったら部屋主がゲームを開始します。";
  $("#room-status").textContent = phase === "playing" ? role === "spectator" ? "観戦中" : "対戦中" : "待機中";
  $("#start-game-online").hidden = !isHost || phase !== "waiting";
  $("#start-game-online").disabled = roomPlayers.filter((player) => !player.left && player.role === "player").length < 2;
  $("#abort-game-online").hidden = !isHost || phase !== "playing";
  $("#leave-room").hidden = phase === "closed";
  $("#dissolve-room").hidden = !isHost || phase === "closed";
  renderRoomPlayers();
  const game = $("#online-game");
  game.hidden = phase !== "playing" && !gameSnapshot?.finished;
  $("#spectator-notice").hidden = role !== "spectator" || phase !== "playing";
  const field = $("#online-field-cards");
  field.replaceChildren();
  if (gameSnapshot?.field?.cards?.length) gameSnapshot.field.cards.forEach((card) => field.append(makeCard(card, false)));
  else {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "場は空です";
    field.append(empty);
  }
  $("#online-field-rule").textContent = gameSnapshot?.field?.cards?.length ? `${gameSnapshot.field.cards.length}枚 / ${gameSnapshot.field.rank}` : "次は何枚でも出せます";
  renderHand();
  renderEffects();
  const pending = gameSnapshot?.pending;
  const myTurn = role === "player" && (pending ? pending.from === playerId : gameSnapshot?.current === playerId);
  $("#play-card-action").hidden = role !== "player" || phase !== "playing";
  $("#play-card-action").textContent = pending?.from === playerId ? "効果を確定" : "出す";
  $("#play-card-action").disabled = !myTurn;
  $("#pass-action").hidden = role !== "player" || phase !== "playing";
  $("#pass-action").disabled = !myTurn || Boolean(pending);
  const log = $("#online-log");
  log.replaceChildren();
  (gameSnapshot?.logs ?? []).forEach((entry) => {
    const line = document.createElement("li");
    line.textContent = entry;
    log.append(line);
  });
  if (gameSnapshot?.finished) $("#phase-detail").textContent = "ゲーム終了。参加者は待機状態に戻りました。";
}

function submitOnlineAction() {
  const pending = gameSnapshot?.pending;
  if (pending?.from === playerId) {
    if (pending.type === "threshold") {
      submitAction({ type: "effect", direction: $("#online-threshold").value });
    } else if (pending.type === "give") {
      const target = $("#online-give-target");
      submitAction({ type: "effect", targetId: Number(target.value), cardIds: [...selectedIds] });
    } else if (pending.type === "discard") {
      submitAction({ type: "effect", cardIds: [...selectedIds] });
    } else if (pending.type === "q") {
      const ranks = [...document.querySelectorAll('input[name="online-q-rank"]:checked')].map((input) => input.value);
      submitAction({ type: "effect", ranks });
    } else if (pending.type === "joker") {
      const cards = privateHand.filter((card) => selectedIds.has(card.id)).map((card) => {
        if (!card.joker) return { id: card.id };
        return {
          id: card.id,
          assignedRank: [...document.querySelectorAll("[data-joker-rank]")].find((input) => input.dataset.jokerRank === card.id)?.value ?? "3",
          assignedSuit: [...document.querySelectorAll("[data-joker-suit]")].find((input) => input.dataset.jokerSuit === card.id)?.value ?? "♠"
        };
      });
      submitAction({ type: "play", cards });
    }
    return;
  }
  if (privateHand.some((card) => card.joker && selectedIds.has(card.id))) {
    gameSnapshot = { ...gameSnapshot, pending: { type: "joker", from: playerId } };
    renderGame();
    return;
  }
  const cards = privateHand.filter((card) => selectedIds.has(card.id)).map((card) => {
    if (!card.joker) return { id: card.id };
    return {
      id: card.id,
      assignedRank: [...document.querySelectorAll("[data-joker-rank]")].find((input) => input.dataset.jokerRank === card.id)?.value ?? "3",
      assignedSuit: [...document.querySelectorAll("[data-joker-suit]")].find((input) => input.dataset.jokerSuit === card.id)?.value ?? "♠"
    };
  });
  submitAction({ type: "play", cards });
}

async function leaveGameRoom() {
  if (!gameRoom || localLeave) return;
  if (isHost) {
    await dissolveRoom("部屋主が部屋を退出したため、部屋を解散しました。");
    return;
  }
  localLeave = true;
  write(gameStream, { type: "LEAVE" });
  await new Promise((resolve) => window.setTimeout(resolve, 200));
  if (idleTimer) window.clearInterval(idleTimer);
  await gameRoom.leave(gameMember);
  gameMember = null;
  gameRoom = null;
  if (lobbyPage) displayStatus("部屋を出ました。");
}

async function dissolveRoom(reason) {
  if (!isHost || roomClosing || (phase === "closed" && !gameRoom)) return;
  roomClosing = true;
  phase = "closed";
  if (idleTimer) window.clearInterval(idleTimer);
  const errors = [];
  const roomToClose = gameRoom;
  const memberToLeave = gameMember;
  let channelClosed = false;
  try {
    try {
      announceDelete(activeRoomId);
    } catch (error) {
      console.error("部屋一覧から部屋を削除できませんでした。", error);
      errors.push(error);
    }
    if (gameStream) {
      try {
        write(gameStream, { type: "DISBAND", reason });
      } catch (error) {
        console.error("参加者に部屋の解散を通知できませんでした。", error);
        errors.push(error);
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    if (!roomToClose) {
      const error = new Error("終了対象のSkyWayルームがありません。");
      console.error(error.message);
      errors.push(error);
    } else if (roomToClose.state === "closed") {
      channelClosed = true;
    } else {
      try {
        await roomToClose.close();
        channelClosed = true;
      } catch (error) {
        console.error("SkyWayルームを閉じられませんでした。", error);
        errors.push(error);
        if (memberToLeave) {
          try {
            await roomToClose.leave(memberToLeave);
          } catch (leaveError) {
            console.error("SkyWayルームのクローズ失敗後にホストを退出させられませんでした。", leaveError);
            errors.push(leaveError);
          }
        }
      }
    }
  } finally {
    if (channelClosed) {
      gameMember = null;
      gameRoom = null;
      gameStream = null;
    }
    roomClosing = false;
  }
  if (!channelClosed) throw new AggregateError(errors, "SkyWayルームを閉じられませんでした。");
  if (gamePage) {
    displayStatus(errors.length ? "SkyWayルームは閉じましたが、一覧削除または参加者通知に失敗しました。" : reason, errors.length > 0);
    window.setTimeout(() => { location.href = "./index.html"; }, 1800);
  }
}

function attachPageActions() {
  if (lobbyPage) {
    const nameInput = $("#online-name");
    if (nameInput) {
      nameInput.addEventListener("input", () => {
        savePlayerNameCookie(nameInput.value);
      });
    }
    $("#create-room").addEventListener("click", async () => {
      if (!lobbyStream) return displayStatus("SkyWay接続後に部屋を作成できます。", true);
      ownName = safeName($("#online-name").value);
      $("#online-name").value = ownName;
      savePlayerNameCookie(ownName);
      try {
        const id = `daifugo-${makeId()}`;
        location.href = `./online.html?room=${encodeURIComponent(id)}&name=${encodeURIComponent(ownName)}&host=1`;
      } catch (error) {
        console.error("部屋を作成できませんでした。", error);
        displayStatus(`部屋を作成できませんでした: ${error.message}`, true);
      }
    });
  }
  if (!gamePage) return;
  $("#start-game-online").addEventListener("click", startGame);
  $("#abort-game-online").addEventListener("click", abortGame);
  $("#online-chat-form").addEventListener("submit", sendChatMessage);
  $("#play-card-action").addEventListener("click", submitOnlineAction);
  $("#pass-action").addEventListener("click", () => submitAction({ type: "pass" }));
  $("#leave-room").addEventListener("click", async () => {
    try {
      await leaveGameRoom();
      location.href = "./index.html";
    } catch (error) {
      console.error("部屋を退出できませんでした。", error);
      displayStatus(`部屋を退出できませんでした: ${error.message}`, true);
    }
  });
  $("#dissolve-room").addEventListener("click", () => {
    void dissolveRoom("部屋主が部屋を解散しました。").catch((error) => reportFailure(error, "部屋を解散できませんでした"));
  });
  document.querySelector('a[href="./index.html"]')?.addEventListener("click", (event) => {
    if (!gameRoom) return;
    event.preventDefault();
    void leaveGameRoom().then(() => { location.href = "./index.html"; }).catch((error) => {
      console.error("部屋を退出できませんでした。", error);
      displayStatus(`部屋を退出できませんでした: ${error.message}`, true);
    });
  });
}

async function startApp() {
  attachPageActions();
  const params = new URLSearchParams(location.search);
  expectedHostId = params.get("owner") || "";
  const storedName = readPlayerNameCookie();
  ownName = safeName(params.get("name") || (lobbyPage ? $("#online-name").value : "") || storedName);
  if (lobbyPage) $("#online-name").value = ownName;
  savePlayerNameCookie(ownName);
  try {
    await connectLobby();
    if (gamePage) {
      const id = params.get("room");
      if (!id) throw new Error("参加する部屋が指定されていません。部屋一覧から参加してください。");
      await connectGameRoom(id, params.get("host") === "1");
    }
  } catch (error) {
    console.error("オンライン接続に失敗しました。", error);
    displayStatus(error.message || "オンライン接続に失敗しました。", true);
    if (lobbyPage) {
      const list = $("#room-list");
      list.replaceChildren();
      const hint = document.createElement("p");
      hint.className = "empty";
      hint.textContent = "接続設定を確認してから再読み込みしてください。";
      list.append(hint);
    }
  }
  if (lobbyPage) window.setInterval(renderRoomList, 15000);
}

if (lobbyPage || gamePage) void startApp();
