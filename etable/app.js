import {
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from 'https://esm.sh/@skyway-sdk/room@2.5.1?bundle';
import { SceneEngine } from '../editor/engine/scene-engine/engine.js';
import { applyDaifuguAction, createDaifuguGame } from '../table2/game-modes.js';

const TOKEN_ENDPOINT = '';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PACKET_CHARS = 10000;
const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,48}$/;
const canvas = document.querySelector('#etable');
const fileInput = document.querySelector('#image-file');
const tableEngine = globalThis.TowerEngine;
const engine = new SceneEngine({ canvas, width: 1200, height: 900, fps: 30, background: '#101819' });
const me = { id: crypto.randomUUID(), name: '' };
const skywayMemberName = `etable-${crypto.randomUUID()}`;
const lobbyRoomName = 'tower-public-lobby-v1';
const images = new Map();
const assets = new Map();
const publicRooms = new Map();
const chunkBuffers = new Map();
const subscribedPublications = new Set();
const memberPublicKeys = new Map();
const chatMessages = [];
const privateMessages = [];
const fields = {
  name: localStorage.getItem('tower-player-name') || '',
  room: new URLSearchParams(location.search).get('room') || '',
  label: '',
  walletAdd: '100',
  tableCoins: '10',
  walletReturn: '10',
  bet: '10',
  dealPerPlayer: '5',
  dealReserve: '0',
  excludeRanks: '',
  chat: '',
  directChat: '',
  effect: 'over',
  drawColor: '#f4f1d0',
  drawWidth: '5'
};
const selection = {
  selectedCards: new Set(),
  selectedImageId: null,
  recipientId: '',
  dealMode: 'even',
  gameMode: 'daifugu',
  jokerRank: '3',
  jokerSuit: '♠',
  drawingMode: 'none',
  handPage: 0,
  tilePage: 0,
  gameHandPage: 0,
  oldMaidHandPage: 0,
  oldMaidTargetPage: 0,
  effectTarget: '',
  potWinnerId: '',
  confirmAction: null,
  focusedField: null,
  pendingDoubleClick: null
};
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
let connecting = false;
let closing = false;
let handshakeTimer = 0;
let directoryTimer = 0;
let lobbyAnnounceTimer = 0;
let keyPair = null;
let publicKeyJwk = null;
let activeStrokeId = null;
let pendingDrawPoints = [];
let lastDrawSendAt = 0;
let pointerStart = null;
let pointerMoved = false;
let toastMessage = '';
let toastUntil = 0;
let connectionStatus = 'SkyWay未設定';
let rememberedInvite = '';
let focusedTargetIndex = -1;
let layoutTargets = [];
let layoutRegions = [];

function safeRender() {
  if (engine.currentScene) engine.render();
}

function notify(message, duration = 4200) {
  toastMessage = String(message);
  toastUntil = Date.now() + duration;
  safeRender();
}

function setupCanvasSize() {
  const width = Math.max(320, Math.floor(canvas.getBoundingClientRect().width || window.innerWidth));
  const isTable = engine.currentSceneName === 'table';
  const height = isTable ? Math.max(3900, Math.floor(width * 3.3)) : Math.max(950, Math.floor(width * 1.25));
  const ratio = Math.min(1.5, window.devicePixelRatio || 1);
  if (canvas.style.height !== `${height}px`) canvas.style.height = `${height}px`;
  if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
  if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
  engine.width = width;
  engine.height = height;
  engine.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function color(ctx, value) { ctx.fillStyle = value; }

function roundedRect(ctx, x, y, width, height, radius = 10) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawPanel(ctx, x, y, width, height, title, eyebrow = '') {
  roundedRect(ctx, x, y, width, height, 14);
  color(ctx, '#172321');
  ctx.fill();
  ctx.strokeStyle = '#30403c';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (eyebrow) {
    ctx.font = '500 10px monospace';
    color(ctx, '#92a39b');
    ctx.fillText(eyebrow, x + 16, y + 22);
  }
  ctx.font = '700 17px sans-serif';
  color(ctx, '#eef3e9');
  ctx.fillText(title, x + 16, y + (eyebrow ? 47 : 28));
}

function drawText(ctx, text, x, y, options = {}) {
  const { size = 13, color: textColor = '#dce7df', weight = 400, maxWidth = 0, lineHeight = size * 1.45 } = options;
  ctx.font = `${weight} ${size}px sans-serif`;
  ctx.fillStyle = textColor;
  const lines = [];
  let line = '';
  for (const part of String(text).split(/(?<=\s)/u)) {
    const next = line + part;
    if (maxWidth && line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = part.trimStart();
    } else line = next;
  }
  if (line) lines.push(line);
  lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight, maxWidth || undefined));
  return lines.length * lineHeight;
}

function addTarget(target) {
  layoutTargets.push(target);
}

function drawButton(ctx, label, x, y, width, height, action, style = 'secondary', disabled = false) {
  const themes = {
    primary: ['#a8e8c6', '#14201b'],
    secondary: ['#1d302a', '#e1ece4'],
    gold: ['#e1bb67', '#251d0d'],
    danger: ['#39201e', '#ffd4cc'],
    subtle: ['#182321', '#d8e5dc']
  };
  const [fill, textColor] = themes[style] || themes.secondary;
  roundedRect(ctx, x, y, width, height, 8);
  color(ctx, disabled ? '#27302d' : fill);
  ctx.fill();
  ctx.strokeStyle = style === 'secondary' ? '#3b514a' : '#0000';
  ctx.stroke();
  ctx.font = '700 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = disabled ? '#788a81' : textColor;
  ctx.fillText(label, x + width / 2, y + height / 2 + 4, width - 12);
  ctx.textAlign = 'left';
  addTarget({ x, y, width, height, action, disabled, label, type: 'button' });
}

function drawField(ctx, label, key, x, y, width, options = {}) {
  const { placeholder = '', type = 'text', maxLength = 500 } = options;
  ctx.font = '600 11px sans-serif';
  color(ctx, '#dce7df');
  ctx.fillText(label, x, y);
  roundedRect(ctx, x, y + 7, width, 36, 7);
  color(ctx, '#111b1b');
  ctx.fill();
  ctx.strokeStyle = selection.focusedField === key ? '#8ed8b5' : '#3a4c47';
  ctx.stroke();
  ctx.font = '12px sans-serif';
  ctx.fillStyle = fields[key] ? '#eef3e9' : '#74857d';
  ctx.fillText(fields[key] || placeholder, x + 10, y + 30, width - 20);
  if (selection.focusedField === key && Math.floor(Date.now() / 500) % 2 === 0) {
    const visible = fields[key] || '';
    const cursorX = Math.min(width - 12, 10 + ctx.measureText(visible).width);
    ctx.fillStyle = '#a8e8c6';
    ctx.fillRect(x + cursorX, y + 16, 1, 16);
  }
  addTarget({ x, y: y + 7, width, height: 36, type: 'field', key, maxLength, inputType: type, label });
}

function drawPill(ctx, label, x, y, width, value, tone = '#a8e8c6') {
  roundedRect(ctx, x, y, width, 28, 8);
  color(ctx, '#19342b');
  ctx.fill();
  ctx.font = '600 11px monospace';
  ctx.fillStyle = tone;
  ctx.fillText(`${label}: ${value}`, x + 9, y + 18, width - 18);
}

function assetImage(src) {
  if (!src) return null;
  if (images.has(src)) return images.get(src);
  const image = new Image();
  image.src = src;
  image.onload = safeRender;
  image.onerror = () => console.warn(`Image could not be loaded: ${src}`);
  images.set(src, image);
  return image;
}

function drawImage(ctx, src, x, y, width, height) {
  const image = assetImage(src);
  if (image?.complete && image.naturalWidth) ctx.drawImage(image, x, y, width, height);
  else {
    roundedRect(ctx, x, y, width, height, 4);
    color(ctx, '#e9e6d8');
    ctx.fill();
    ctx.fillStyle = '#24352e';
    ctx.font = '700 10px sans-serif';
    ctx.fillText('CARD', x + 4, y + height / 2);
  }
}

function textFieldKeyDown(event) {
  const key = event.key;
  const current = selection.focusedField;
  if (!current) return false;
  const target = layoutTargets.find(item => item.type === 'field' && item.key === current);
  const maxLength = target?.maxLength || 500;
  if (key === 'Escape') {
    selection.focusedField = null;
  } else if (key === 'Enter') {
    submitField(current);
  } else if (key === 'Backspace') {
    fields[current] = fields[current].slice(0, -1);
  } else if (key === 'Delete') {
    fields[current] = '';
  } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && fields[current].length < maxLength) {
    if (target?.inputType === 'number' && !/[0-9-]/.test(key)) return true;
    fields[current] += key;
  }
  safeRender();
  return true;
}

function submitField(key) {
  if (key === 'name') selection.focusedField = 'room';
  else if (key === 'room') {
    selection.focusedField = null;
    void connectRoom(false);
  } else if (key === 'chat') sendChat();
  else if (key === 'directChat') sendPrivateChat();
  else selection.focusedField = null;
}

function lobbyRender(engineInstance) {
  const ctx = engineInstance.ctx;
  const width = engineInstance.width;
  layoutTargets = [];
  layoutRegions = [];
  const margin = Math.max(18, Math.min(48, width * 0.055));
  const cardX = margin;
  const cardWidth = width - margin * 2;
  const y = 38;
  ctx.font = '700 22px monospace';
  color(ctx, '#a8e8c6');
  ctx.fillText('ETABLE', cardX, y + 25);
  ctx.font = '500 10px monospace';
  color(ctx, '#92a39b');
  ctx.fillText('SKYWAY SFU · CANVAS GAME TABLE', cardX, y + 48);
  drawPanel(ctx, cardX, 110, cardWidth, 705, 'みんなで遊ぶテーブル', 'WELCOME TO THE TABLE');
  drawText(ctx, '大富豪・神経衰弱・ババ抜き・麻雀牌を備えた共有テーブル。画面と操作はすべてCanvasで描画します。', cardX + 18, 184, {
    size: 13, color: '#92a39b', maxWidth: cardWidth - 36
  });
  drawPill(ctx, '接続', connectionStatus, cardX + 18, 224, Math.min(235, cardWidth - 36), '#e1bb67');

  ctx.font = '700 14px sans-serif';
  color(ctx, '#eef3e9');
  ctx.fillText(`公開中の部屋 · ${publicRooms.size}`, cardX + 18, 296);
  const roomEntries = [...publicRooms.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 5);
  if (!roomEntries.length) {
    drawText(ctx, TOKEN_ENDPOINT.trim() ? '公開部屋を確認しています…' : 'SkyWayトークン発行URLが未設定のため、オンラインの部屋一覧は利用できません。', cardX + 18, 326, {
      size: 12, color: '#92a39b', maxWidth: cardWidth - 36
    });
  }
  roomEntries.forEach((entry, index) => {
    const rowY = 320 + index * 54;
    roundedRect(ctx, cardX + 14, rowY, cardWidth - 28, 46, 8);
    color(ctx, '#192724');
    ctx.fill();
    drawText(ctx, `${entry.roomId}   ${entry.hostName || 'HOST'} · ${entry.players || 1}人`, cardX + 24, rowY + 27, {
      size: 12, color: '#a8e8c6', maxWidth: cardWidth - 120
    });
    drawButton(ctx, '参加', cardX + cardWidth - 82, rowY + 7, 60, 32, () => {
      fields.room = entry.roomId;
      if (fields.name.trim()) void connectRoom(false);
      else selection.focusedField = 'name';
    });
  });

  const fieldsY = Math.max(340 + roomEntries.length * 54, 375);
  drawField(ctx, 'あなたの名前', 'name', cardX + 18, fieldsY, cardWidth - 36, { maxLength: 24, placeholder: 'PLAYER' });
  drawField(ctx, '部屋ID', 'room', cardX + 18, fieldsY + 60, cardWidth - 36, { maxLength: 48, placeholder: '例: friday-game' });
  const buttonY = fieldsY + 124;
  drawButton(ctx, '新しい部屋を作る', cardX + 18, buttonY, (cardWidth - 46) / 2, 42, () => {
    if (!fields.room.trim()) fields.room = `table-${Math.random().toString(36).slice(2, 8)}`;
    void connectRoom(true);
  }, 'secondary');
  drawButton(ctx, '部屋に参加 ↗', cardX + 28 + (cardWidth - 46) / 2, buttonY, (cardWidth - 46) / 2, 42, () => void connectRoom(false), 'primary');
  drawText(ctx, '部屋IDは英数字・ハイフン・アンダースコアで1〜48文字。招待URLに ?room=部屋ID を指定できます。', cardX + 18, buttonY + 76, {
    size: 11, color: '#92a39b', maxWidth: cardWidth - 36
  });
  drawText(ctx, 'このアプリにはSkyWay秘密鍵を含めていません。接続には安全なサーバー側トークン発行の設定が必要です。', cardX + 18, buttonY + 118, {
    size: 11, color: '#ddcb95', maxWidth: cardWidth - 36
  });
  drawToast(ctx, width);
}

function drawToast(ctx, width) {
  if (!toastMessage || Date.now() > toastUntil) return;
  const toastWidth = Math.min(width - 28, 520);
  const toastY = Math.min(engine.height - 56, Math.max(12, window.scrollY + 12));
  roundedRect(ctx, (width - toastWidth) / 2, toastY, toastWidth, 44, 8);
  color(ctx, '#19342b');
  ctx.fill();
  ctx.strokeStyle = '#668578';
  ctx.stroke();
  drawText(ctx, toastMessage, (width - toastWidth) / 2 + 12, toastY + 27, {
    size: 12, color: '#eef3e9', maxWidth: toastWidth - 24
  });
}

function requestConfirmation(message, action) {
  selection.confirmAction = { message, action };
  safeRender();
}

function drawConfirmDialog(ctx, width) {
  if (!selection.confirmAction) return;
  const centerY = Math.min(engine.height - 90, Math.max(90, window.scrollY + window.innerHeight / 2));
  const panelWidth = Math.min(width - 32, 420);
  const x = (width - panelWidth) / 2;
  const y = centerY - 75;
  ctx.fillStyle = '#0009';
  ctx.fillRect(0, Math.max(0, window.scrollY), width, Math.min(engine.height, window.innerHeight));
  drawPanel(ctx, x, y, panelWidth, 150, '確認', 'PLEASE CONFIRM');
  drawText(ctx, selection.confirmAction.message, x + 16, y + 74, { size: 12, maxWidth: panelWidth - 32 });
  drawButton(ctx, 'キャンセル', x + 16, y + 103, (panelWidth - 42) / 2, 32, () => { selection.confirmAction = null; }, 'subtle');
  drawButton(ctx, '実行する', x + 26 + (panelWidth - 42) / 2, y + 103, (panelWidth - 42) / 2, 32, () => {
    const action = selection.confirmAction?.action;
    selection.confirmAction = null;
    action?.();
  }, 'danger');
}

function drawTableScene(engineInstance) {
  const ctx = engineInstance.ctx;
  const width = engineInstance.width;
  layoutTargets = [];
  layoutRegions = [];
  const margin = Math.max(12, Math.min(28, width * 0.04));
  const panelWidth = width - margin * 2;
  let y = 14;
  ctx.font = '700 20px monospace';
  color(ctx, '#a8e8c6');
  ctx.fillText('ETABLE', margin, y + 24);
  ctx.font = '11px sans-serif';
  color(ctx, '#92a39b');
  ctx.fillText(`${connectionStatus} · ${roomId}`, margin + 115, y + 22, Math.max(80, width - margin * 2 - 250));
  drawButton(ctx, '退出', width - margin - 70, y + 2, 70, 34, () => void leaveRoom(), 'danger');
  drawButton(ctx, '招待リンク', width - margin - 168, y + 2, 88, 34, () => void copyInvite(), 'subtle');
  y += 52;
  if (!state) {
    drawPanel(ctx, margin, y, panelWidth, 140, '部屋の状態を同期中', 'ROOM SYNC');
    drawText(ctx, 'ホストと安全なデータ接続を確立しています。しばらくお待ちください。', margin + 16, y + 78, {
      size: 12, color: '#92a39b', maxWidth: panelWidth - 32
    });
    drawToast(ctx, width);
    return;
  }

  const members = room?.members || state?.players || [];
  const playerPanelHeight = Math.max(96, Math.min(245, 54 + members.length * 18));
  drawPanel(ctx, margin, y, panelWidth, playerPanelHeight, `参加者 · ${members.length}`, 'AT THE TABLE');
  members.forEach((person, index) => {
    const player = state?.players.find(item => item.id === person.id);
    const name = person.name ? participantName(person) : (player?.name || 'PLAYER');
    const text = `${player?.id === hostId ? '★ ' : ''}${name}${player?.spectator ? ' · 観戦' : ''}  ◉ ${player?.coins || 0}`;
    drawText(ctx, text, margin + 16, y + 66 + index * 18, { size: 11, color: player?.id === me.id ? '#a8e8c6' : '#dce7df', maxWidth: panelWidth - 30 });
  });
  y += playerPanelHeight + 14;

  y = drawTools(ctx, width, margin, panelWidth, y);
  y = drawTable(ctx, width, margin, panelWidth, y);
  y = drawDrawingControls(ctx, width, margin, panelWidth, y);
  y = drawGame(ctx, width, margin, panelWidth, y);
  y = drawHands(ctx, width, margin, panelWidth, y);
  y = drawDecks(ctx, width, margin, panelWidth, y);
  y = drawMahjong(ctx, width, margin, panelWidth, y);
  y = drawDeal(ctx, width, margin, panelWidth, y);
  y = drawChat(ctx, width, margin, panelWidth, y);
  drawConfirmDialog(ctx, width);
  drawToast(ctx, width);
}

function drawTools(ctx, width, margin, panelWidth, y) {
  const height = 620;
  drawPanel(ctx, margin, y, panelWidth, height, 'テーブルツール', 'TABLE TOOLS · COINS');
  const innerX = margin + 14;
  const innerW = panelWidth - 28;
  const gap = 9;
  const half = (innerW - gap) / 2;
  let top = y + 64;
  drawField(ctx, 'ネームプレート', 'label', innerX, top, innerW, { maxLength: 40, placeholder: '名前やメモ' });
  drawButton(ctx, '＋ ネームプレートを置く', innerX, top + 52, innerW, 34, () => {
    dispatch({ type: 'add-label', label: fields.label.trim() || me.name, x: 50, y: 50 });
    fields.label = '';
  }, 'secondary');
  drawButton(ctx, '＋ 画像をアップロード', innerX, top + 94, innerW, 34, () => fileInput.click(), 'secondary');
  top += 142;
  drawField(ctx, 'コインケースから出す枚数', 'walletAdd', innerX, top, half, { type: 'number', maxLength: 8 });
  drawButton(ctx, '自分のコインに追加', innerX, top + 52, half, 34, () => dispatch({ type: 'add-wallet-coins', amount: fields.walletAdd }), 'gold');
  drawField(ctx, '場に出す枚数（マイナス可）', 'tableCoins', innerX + half + gap, top, half, { type: 'number', maxLength: 8 });
  drawButton(ctx, '卓にコインを出す', innerX + half + gap, top + 52, half, 34, () => dispatch({ type: 'place-coins', amount: fields.tableCoins, x: 50, y: 50 }));
  if (width < 640) {
    top += 96;
    drawField(ctx, 'ケースに戻す枚数', 'walletReturn', innerX, top, half, { type: 'number', maxLength: 8 });
    drawButton(ctx, 'コインケースに戻す', innerX, top + 52, half, 34, () => dispatch({ type: 'return-wallet-coins', amount: fields.walletReturn }), 'subtle');
    drawButton(ctx, '所持コインをすべて戻す', innerX + half + gap, top + 16, half, 42, () => requestConfirmation('所持コインをすべてコインケースに戻しますか？', () => dispatch({ type: 'return-all-wallet-coins' })), 'subtle');
    top += 92;
  } else {
    drawField(ctx, 'ケースに戻す枚数', 'walletReturn', innerX, top + 96, half, { type: 'number', maxLength: 8 });
    drawButton(ctx, 'コインケースに戻す', innerX, top + 148, half, 34, () => dispatch({ type: 'return-wallet-coins', amount: fields.walletReturn }), 'subtle');
    drawButton(ctx, '所持コインをすべて戻す', innerX + half + gap, top + 116, half, 42, () => requestConfirmation('所持コインをすべてコインケースに戻しますか？', () => dispatch({ type: 'return-all-wallet-coins' })), 'subtle');
    top += 190;
  }
  drawPill(ctx, 'あなたの所持コイン', state?.players.find(player => player.id === me.id)?.coins || 0, innerX, top - 2, innerW);
  top += 34;
  drawField(ctx, '賭け金', 'bet', innerX, top, half, { type: 'number', maxLength: 8 });
  const myPlayer = state.players.find(player => player.id === me.id);
  const blockedBet = Boolean(state.gamePot?.locked || (myPlayer?.spectator && state.game?.status === 'playing'));
  drawButton(ctx, '賭け金を出す', innerX, top + 52, half, 34, () => dispatch({ type: 'add-bet', amount: fields.bet }), 'gold', blockedBet);
  drawPill(ctx, 'ゲームの賭け金', state.gamePot?.amount || 0, innerX + half + gap, top + 8, half);
  if (host && state.game?.status === 'finished' && state.gamePot?.amount > 0) {
    const participants = state.game.mode === 'daifugu'
      ? state.game.daifugu.players.map(player => player.roomPlayerId)
      : state.game.mode === 'memory' ? state.game.players : state.game.players.map(player => player.id);
    const winners = participants.map(id => state.players.find(player => player.id === id)).filter(Boolean);
    const winner = winners.find(player => player.id === selection.potWinnerId) || winners.find(player => player.id === state.game.winnerId) || winners[0];
    if (winner && !selection.potWinnerId) selection.potWinnerId = winner.id;
    drawButton(ctx, `受取人: ${winner?.name || '選択'}  ▾`, innerX + half + gap, top + 50, half, 34, () => {
      if (!winners.length) return;
      const index = winners.findIndex(player => player.id === selection.potWinnerId);
      selection.potWinnerId = winners[(index + 1) % winners.length].id;
    }, 'secondary', !winner);
    drawButton(ctx, '勝者へ渡す', innerX, top + 96, half, 34, () => dispatch({ type: 'settle-pot', winnerId: selection.potWinnerId }), 'primary', !winner);
    drawButton(ctx, '賭け金を返金', innerX + half + gap, top + 96, half, 34, () => dispatch({ type: 'settle-pot', refund: true }), 'subtle');
  }
  if (host) {
    const publicText = state.publicListing ? '公開部屋一覧: 公開中' : '公開部屋一覧: 非公開';
    drawButton(ctx, publicText, innerX, y + height - 44, innerW, 32, () => dispatch({ type: 'set-public-listing', enabled: !state.publicListing }), 'subtle');
  }
  return y + height + 12;
}

function drawTable(ctx, width, margin, panelWidth, y) {
  const tableY = y + 62;
  const tableHeight = Math.max(330, Math.min(510, width * 0.7));
  const tableX = margin + 11;
  const tableWidth = panelWidth - 22;
  const tableBottom = tableY + tableHeight;
  drawPanel(ctx, margin, y, panelWidth, tableHeight + 136, '共有テーブル', 'ROOM TABLE');
  ctx.save();
  roundedRect(ctx, tableX, tableY, tableWidth, tableHeight, 10);
  const gradient = ctx.createRadialGradient(tableX + tableWidth / 2, tableY + tableHeight * 0.42, 10, tableX + tableWidth / 2, tableY + tableHeight / 2, tableWidth * .72);
  gradient.addColorStop(0, '#237354');
  gradient.addColorStop(1, '#123f33');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = '#6f855b';
  ctx.stroke();
  ctx.strokeStyle = '#b6cd833b';
  ctx.strokeRect(tableX + 8, tableY + 8, tableWidth - 16, tableHeight - 16);
  layoutRegions.push({ x: tableX, y: tableY, width: tableWidth, height: tableHeight, kind: 'table' });
  const entries = [
    ...state.objects.map(object => ({ ...object, objectType: 'object' })),
    ...state.cards.filter(card => card.zone === 'table').map(card => ({ ...card, objectType: 'card' })),
    ...state.mahjongTiles.filter(tile => tile.zone === 'table').map(tile => ({ ...tile, objectType: 'tile' }))
  ];
  if (!entries.length) {
    ctx.textAlign = 'center';
    ctx.font = '600 14px sans-serif';
    ctx.fillStyle = '#e1f4e34c';
    ctx.fillText('テーブルは空です', tableX + tableWidth / 2, tableY + tableHeight / 2);
    ctx.textAlign = 'left';
  }
  entries.forEach(entry => drawTableObject(ctx, entry, tableX, tableY, tableWidth, tableHeight));
  drawStrokes(ctx, tableX, tableY, tableWidth, tableHeight);
  ctx.restore();
  let controlsY = tableBottom + 18;
  drawText(ctx, 'ドラッグで移動 · カードはクリックで表裏切替 · ダブルクリックで回収', tableX, controlsY, { size: 10, color: '#92a39b' });
  controlsY += 14;
  drawButton(ctx, '場をすべて片付ける（ホスト）', tableX, controlsY, tableWidth, 34, () => requestConfirmation('場の物・カード・描画を片付けますか？', () => dispatch({ type: 'clear-table' })), 'danger', !host);
  controlsY += 45;
  if (selection.selectedImageId) {
    const selected = state.objects.find(object => object.id === selection.selectedImageId);
    if (selected) {
      drawText(ctx, `選択中画像のサイズ ${Math.round((selected.scale || 1) * 100)}%`, tableX, controlsY + 12, { size: 11 });
      drawButton(ctx, '−', tableX + tableWidth - 112, controlsY, 42, 34, () => dispatch({ type: 'scale-image', objectId: selected.id, scale: (selected.scale || 1) - .1 }));
      drawButton(ctx, '+', tableX + tableWidth - 62, controlsY, 42, 34, () => dispatch({ type: 'scale-image', objectId: selected.id, scale: (selected.scale || 1) + .1 }));
      controlsY += 40;
    }
  }
  return y + tableHeight + 166 + (selection.selectedImageId ? 40 : 0);
}

function drawTableObject(ctx, object, x, y, width, height) {
  const preview = pointerMoved && pointerStart?.target.object.id === object.id ? pointerStart.current : null;
  const centerX = x + (Number(preview?.x ?? object.x) / 100) * width;
  const centerY = y + (Number(preview?.y ?? object.y) / 100) * height;
  let objectWidth = 58;
  let objectHeight = 43;
  if (object.objectType === 'card') {
    objectWidth = 42;
    objectHeight = 60;
    drawCard(ctx, object, centerX - objectWidth / 2, centerY - objectHeight / 2, objectWidth, objectHeight);
  } else if (object.objectType === 'tile') {
    objectWidth = 34;
    objectHeight = 48;
    drawImage(ctx, `../pai-images/pai-images/${object.asset}-66-90-s.png`, centerX - objectWidth / 2, centerY - objectHeight / 2, objectWidth, objectHeight);
  } else if (object.kind === 'label') {
    objectWidth = Math.min(width - 12, Math.max(80, String(object.label).length * 9 + 24));
    objectHeight = 34;
    roundedRect(ctx, centerX - objectWidth / 2, centerY - objectHeight / 2, objectWidth, objectHeight, 6);
    color(ctx, '#e3c876');
    ctx.fill();
    ctx.font = '700 12px sans-serif';
    ctx.fillStyle = '#332a15';
    ctx.textAlign = 'center';
    ctx.fillText(object.label, centerX, centerY + 4, objectWidth - 12);
    ctx.textAlign = 'left';
  } else if (object.kind === 'coin') {
    objectWidth = 58;
    objectHeight = 58;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 27, 0, Math.PI * 2);
    color(ctx, '#d4a737');
    ctx.fill();
    ctx.strokeStyle = '#a17b2c';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '700 10px monospace';
    ctx.fillStyle = '#3c2b0c';
    ctx.textAlign = 'center';
    ctx.fillText(`◉ ${object.amount}`, centerX, centerY + 4, 48);
    ctx.textAlign = 'left';
  } else if (object.kind === 'image') {
    objectWidth = 88 * (object.scale || 1);
    objectHeight = 68 * (object.scale || 1);
    const image = images.get(assets.get(object.assetId));
    if (image?.complete && image.naturalWidth) {
      ctx.drawImage(image, centerX - objectWidth / 2, centerY - objectHeight / 2, objectWidth, objectHeight);
    } else {
      roundedRect(ctx, centerX - objectWidth / 2, centerY - objectHeight / 2, objectWidth, objectHeight, 5);
      color(ctx, '#193126');
      ctx.fill();
      ctx.strokeStyle = '#cfdfcf';
      ctx.stroke();
    }
  }
  addTarget({
    x: centerX - objectWidth / 2, y: centerY - objectHeight / 2,
    width: objectWidth, height: objectHeight, type: 'table-object',
    object, label: object.objectType === 'card' ? '卓上カード' : object.objectType === 'tile' ? '卓上麻雀牌' : object.kind
  });
}

function drawStrokes(ctx, x, y, width, height) {
  for (const stroke of state.strokes || []) {
    if (!stroke.points?.length) continue;
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      const px = x + point.x / 100 * width;
      const py = y + point.y / 100 * height;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = stroke.color || '#f4f1d0';
    ctx.lineWidth = Number(stroke.width) || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function drawDrawingControls(ctx, width, margin, panelWidth, y) {
  const panelHeight = 162;
  drawPanel(ctx, margin, y, panelWidth, panelHeight, 'テーブルに描く', 'LIVE DRAWING');
  const x = margin + 14;
  const half = (panelWidth - 37) / 2;
  drawButton(ctx, selection.drawingMode === 'pen' ? 'ペン ON' : 'ペン', x, y + 64, half, 34, () => toggleDrawing('pen'), 'secondary');
  drawButton(ctx, selection.drawingMode === 'eraser' ? '消しゴム ON' : '消しゴム', x + half + 9, y + 64, half, 34, () => toggleDrawing('eraser'), 'secondary');
  drawField(ctx, '色（#RRGGBB）', 'drawColor', x, y + 108, half, { maxLength: 7 });
  drawField(ctx, '太さ', 'drawWidth', x + half + 9, y + 108, half, { type: 'number', maxLength: 2 });
  drawButton(ctx, '描画をすべて消す（ホスト）', x, y + 151, panelWidth - 28, 32, () => dispatch({ type: 'clear-strokes' }), 'danger', !host);
  return y + panelHeight + 48;
}

function drawGame(ctx, width, margin, panelWidth, y) {
  const game = state.game;
  const active = game?.status === 'playing';
  const player = state.players.find(item => item.id === me.id);
  const spectator = Boolean(player?.spectator);
  let h = 278;
  if (game?.mode === 'memory') {
    const cardWidth = Math.min(48, (panelWidth - 62) / 8);
    h = Math.max(540, 7 * (cardWidth * 1.28 + 4) + 145);
  }
  if (game?.mode === 'daifugu') h = 390;
  if (game?.mode === 'old-maid') h = 390;
  drawPanel(ctx, margin, y, panelWidth, h, 'ゲーム進行', 'GAME MODE');
  let top = y + 60;
  const buttonW = (panelWidth - 42) / 2;
  drawButton(ctx, `ゲーム: ${modeName(selection.gameMode)}  ▾`, margin + 14, top, buttonW, 36, () => {
    const modes = ['daifugu', 'memory', 'old-maid'];
    selection.gameMode = modes[(modes.indexOf(selection.gameMode) + 1) % modes.length];
  }, 'secondary', Boolean(active) || !host);
  drawButton(ctx, 'ゲーム開始', margin + 28 + buttonW, top, buttonW, 36, () => dispatch({ type: 'start-game', mode: selection.gameMode }), 'primary', !host || Boolean(active) || Boolean(state.gamePot?.locked));
  top += 52;
  if (!game) {
    drawText(ctx, 'ゲームを選んで開始してください。ゲーム中に参加した人は観戦します。', margin + 16, top + 5, {
      size: 12, color: '#92a39b', maxWidth: panelWidth - 32
    });
    return y + h + 12;
  }
  if (active && host) {
    drawButton(ctx, 'ゲームを終了（ホスト）', margin + 14, top, panelWidth - 28, 32, () => requestConfirmation('進行中のゲームを終了しますか？', () => dispatch({ type: 'end-game' })), 'danger');
    top += 41;
  }
  if (game.mode === 'memory') top = drawMemoryGame(ctx, margin, panelWidth, top, game, active, spectator);
  else if (game.mode === 'old-maid') top = drawOldMaid(ctx, margin, panelWidth, top, game, active, spectator);
  else top = drawDaifugu(ctx, margin, panelWidth, top, game, active, spectator);
  drawText(ctx, `${game.message || ''}${spectator && active ? ' （観戦中）' : ''}`, margin + 16, Math.min(y + h - 12, top + 4), {
    size: 11, color: '#a8e8c6', maxWidth: panelWidth - 32
  });
  return y + h + 12;
}

function modeName(mode) {
  return ({ daifugu: '大富豪', memory: '神経衰弱', 'old-maid': 'ババ抜き' })[mode] || mode;
}

function drawMemoryGame(ctx, margin, panelWidth, top, game, active, spectator) {
  const width = panelWidth - 34;
  const gap = 4;
  const cardWidth = Math.max(25, Math.min(48, (width - gap * 7) / 8));
  const cardHeight = cardWidth * 1.28;
  const startX = margin + 17;
  game.board?.forEach((card, index) => {
    const col = index % 8;
    const row = Math.floor(index / 8);
    const x = startX + col * (cardWidth + gap);
    const y = top + row * (cardHeight + gap);
    const visible = card.faceUp || card.matched;
    const details = visible ? { ...card, suit: card.suit, rank: card.rank, faceUp: true } : { faceUp: false };
    const canFlip = active && !spectator && game.players?.[game.current] === me.id && !card.matched && !card.faceUp && !game.pendingMismatch;
    drawCard(ctx, details, x, y, cardWidth, cardHeight, canFlip
      ? () => dispatch({ type: 'game-action', gameAction: 'flip', cardId: card.id })
      : null, card.matched);
    if (!canFlip) {
      roundedRect(ctx, x, y, cardWidth, cardHeight, 4);
      ctx.fillStyle = '#0004';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  const scores = game.players.map(id => `${state.players.find(player => player.id === id)?.name || 'PLAYER'} ${game.scores[id] || 0}`).join(' · ');
  drawText(ctx, scores, startX, top + 7 * (cardHeight + gap) + 17, { size: 10, color: '#92a39b', maxWidth: width });
  if (active && !spectator && game.players?.[game.current] === me.id && game.pendingMismatch) {
    drawButton(ctx, '次の人へ', startX, top + 7 * (cardHeight + gap) + 28, 120, 30, () => dispatch({ type: 'game-action', gameAction: 'continue' }), 'primary');
  }
  return top + 7 * (cardHeight + gap) + 65;
}

function drawOldMaid(ctx, margin, panelWidth, top, game, active, spectator) {
  const own = game.players?.find(player => player.id === me.id);
  const current = game.players?.[game.current];
  const myTurn = current?.id === me.id;
  if (own) {
    drawText(ctx, `あなたの手札 ${own.hand.length}枚`, margin + 16, top + 12, { size: 12, weight: 700 });
    const cardCount = Math.min(8, own.hand.length);
    const cardWidth = Math.min(36, (panelWidth - 46) / 8);
    const first = selection.oldMaidHandPage * 8;
    own.hand.slice(first, first + cardCount).forEach((card, index) => drawCard(ctx, card, margin + 16 + index * (cardWidth + 4), top + 25, cardWidth, 50));
    if (own.hand.length > 8) {
      drawButton(ctx, '‹', margin + 16, top + 78, 35, 26, () => selection.oldMaidHandPage = Math.max(0, selection.oldMaidHandPage - 1));
      drawButton(ctx, '›', margin + 60, top + 78, 35, 26, () => selection.oldMaidHandPage = Math.min(Math.floor((own.hand.length - 1) / 8), selection.oldMaidHandPage + 1));
    }
    top += 112;
  }
  if (active && myTurn && !spectator) {
    let target = null;
    const currentIndex = game.players.findIndex(player => player.id === me.id);
    for (let offset = 1; offset < game.players.length; offset += 1) {
      const candidate = game.players[(currentIndex + offset) % game.players.length];
      if (candidate.hand.length) { target = candidate; break; }
    }
    if (target) {
      const recipient = state.players.find(player => player.id === target.id);
      drawText(ctx, `${recipient?.name || '相手'}の手札から1枚引く`, margin + 16, top + 14, { size: 11 });
      const first = selection.oldMaidTargetPage * 8;
      const cardWidth = Math.min(36, (panelWidth - 46) / 8);
      target.hand.slice(first, first + 8).forEach((card, index) => drawCard(
        ctx, { faceUp: false }, margin + 16 + index * (cardWidth + 4), top + 24, cardWidth, 50,
        active && !spectator && myTurn
          ? () => dispatch({ type: 'game-action', gameAction: 'draw', cardId: card.id })
          : null
      ));
      if (target.hand.length > 8) {
        drawButton(ctx, '‹', margin + 16, top + 78, 35, 26, () => selection.oldMaidTargetPage = Math.max(0, selection.oldMaidTargetPage - 1));
        drawButton(ctx, '›', margin + 60, top + 78, 35, 26, () => selection.oldMaidTargetPage = Math.min(Math.floor((target.hand.length - 1) / 8), selection.oldMaidTargetPage + 1));
      }
    }
    top += 112;
  }
  drawText(ctx, game.players.map(player => `${player.name}: ${player.hand.length}枚`).join(' · '), margin + 16, top + 14, {
    size: 10, color: '#92a39b', maxWidth: panelWidth - 32
  });
  return top + 35;
}

function drawDaifugu(ctx, margin, panelWidth, top, game, active, spectator) {
  const snapshot = game.daifugu;
  if (!snapshot) return top;
  const own = snapshot.players.find(player => player.roomPlayerId === me.id);
  const isTurn = snapshot.players[snapshot.current]?.roomPlayerId === me.id;
  const myHand = own?.hand || [];
  drawText(ctx, snapshot.finished
    ? `結果: ${snapshot.placements?.map((id, index) => `${index + 1}位 ${snapshot.players[id]?.name}`).join(' · ') || '終了'}`
    : `${snapshot.players[snapshot.current]?.name || '次の人'}の番${snapshot.revolution ? ' · 革命中' : ''}`, margin + 16, top + 10, {
    size: 11, color: '#a8e8c6', maxWidth: panelWidth - 32
  });
  top += 24;
  if (snapshot.field?.cards?.length) {
    drawText(ctx, `場: ${snapshot.field.cards.map(card => card.joker ? 'Joker' : `${card.suit}${card.rank}`).join('・')}`, margin + 16, top + 8, {
      size: 10, color: '#92a39b', maxWidth: panelWidth - 32
    });
    top += 22;
  }
  if (!own?.hand) {
    drawText(ctx, spectator ? '観戦中です。手札は表示されません。' : '手札情報を受信中です。', margin + 16, top + 14, { size: 11, color: '#92a39b' });
    return top + 30;
  }
  const cardsPerPage = Math.max(1, Math.min(10, Math.floor((panelWidth - 42) / 42)));
  const start = selection.gameHandPage * cardsPerPage;
  myHand.slice(start, start + cardsPerPage).forEach((card, index) => {
    drawCard(ctx, { ...card, faceUp: true }, margin + 16 + index * 42, top, 38, 54, () => {
      selection.selectedCards.has(card.id) ? selection.selectedCards.delete(card.id) : selection.selectedCards.add(card.id);
    }, selection.selectedCards.has(card.id));
  });
  top += 62;
  if (myHand.length > cardsPerPage) {
    drawButton(ctx, '‹', margin + 16, top, 36, 28, () => selection.gameHandPage = Math.max(0, selection.gameHandPage - 1));
    drawButton(ctx, '›', margin + 60, top, 36, 28, () => selection.gameHandPage = Math.min(Math.floor((myHand.length - 1) / cardsPerPage), selection.gameHandPage + 1));
    top += 33;
  }
  if (active && !spectator && isTurn && !snapshot.pending) {
    drawButton(ctx, '選択カードを出す', margin + 16, top, 140, 32, () => {
      const cards = myHand.filter(card => selection.selectedCards.has(card.id)).map(card => card.joker
        ? { id: card.id, assignedRank: selection.jokerRank, assignedSuit: selection.jokerSuit }
        : { id: card.id });
      dispatch({ type: 'game-action', action: { type: 'play', cards } });
      selection.selectedCards.clear();
    }, 'primary', selection.selectedCards.size === 0);
    drawButton(ctx, 'パス', margin + 164, top, 72, 32, () => dispatch({ type: 'game-action', action: { type: 'pass' } }));
    top += 40;
    if (myHand.some(card => card.joker && selection.selectedCards.has(card.id))) {
      const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
      const suits = ['♠', '♥', '♦', '♣'];
      drawButton(ctx, `Jokerの数字: ${selection.jokerRank}  ▾`, margin + 16, top, 160, 30, () => {
        selection.jokerRank = ranks[(ranks.indexOf(selection.jokerRank) + 1) % ranks.length];
      });
      drawButton(ctx, `Jokerの柄: ${selection.jokerSuit}  ▾`, margin + 184, top, 150, 30, () => {
        selection.jokerSuit = suits[(suits.indexOf(selection.jokerSuit) + 1) % suits.length];
      });
      top += 36;
    }
  }
  if (snapshot.pending && active && !spectator && isTurn) {
    drawField(ctx, snapshot.pending.type === 'threshold' ? 'J効果: over / under' : '効果の指定（数字はカンマ区切り）', 'effect', margin + 16, top, panelWidth - 32, { maxLength: 80 });
    top += 53;
    if (snapshot.pending.type === 'give') {
      const targets = snapshot.players.filter(player => player.roomPlayerId !== me.id && (player.handCount || player.hand?.length));
      targets.forEach((target, index) => {
        const targetId = target.id;
        drawButton(ctx, `${target.name}へ`, margin + 16 + index * 112, top, 102, 30, () => selection.effectTarget = targetId, selection.effectTarget === targetId ? 'gold' : 'secondary');
      });
      top += 36;
    }
    drawButton(ctx, '効果を確定', margin + 16, top, 130, 32, submitDaifuguEffect, 'primary');
    top += 38;
  }
  return top + 6;
}

function submitDaifuguEffect() {
  const pending = state.game.daifugu.pending;
  const choice = {};
  if (pending.type === 'threshold') choice.direction = fields.effect.trim().toLowerCase();
  else if (pending.type === 'give' || pending.type === 'discard') {
    choice.cardIds = state.game.daifugu.players.find(player => player.roomPlayerId === me.id)?.hand
      ?.filter(card => selection.selectedCards.has(card.id)).map(card => card.id) || [];
    if (pending.type === 'give') choice.targetId = selection.effectTarget;
  } else if (pending.type === 'q') {
    choice.ranks = fields.effect.split(',').map(value => value.trim()).filter(Boolean);
  }
  dispatch({ type: 'game-action', action: { type: 'effect', choice } });
  selection.selectedCards.clear();
}

function drawHands(ctx, width, margin, panelWidth, y) {
  const cards = state.cards.filter(card => card.zone === 'hand' && card.ownerId === me.id);
  const tiles = state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === me.id);
  const h = 185;
  drawPanel(ctx, margin, y, panelWidth, h, `あなたの手札 · ${cards.length}`, 'PRIVATE CARDS');
  drawText(ctx, '手札のカードを選ぶと卓に伏せて出します。', margin + 16, y + 61, { size: 10, color: '#92a39b' });
  const cardsPerPage = Math.max(1, Math.min(9, Math.floor((panelWidth - 32) / 46)));
  const start = selection.handPage * cardsPerPage;
  cards.slice(start, start + cardsPerPage).forEach((card, index) => drawCard(
    ctx, { ...card, faceUp: true }, margin + 16 + index * 46, y + 72, 40, 57,
    () => dispatch({ type: 'play-card', cardId: card.id, x: 50, y: 50 })
  ));
  if (cards.length > cardsPerPage) {
    drawButton(ctx, '‹', margin + panelWidth - 94, y + 138, 34, 28, () => selection.handPage = Math.max(0, selection.handPage - 1));
    drawButton(ctx, '›', margin + panelWidth - 52, y + 138, 34, 28, () => selection.handPage = Math.min(Math.floor((cards.length - 1) / cardsPerPage), selection.handPage + 1));
  }
  const tileY = y + h + 12;
  drawPanel(ctx, margin, tileY, panelWidth, 154, `あなたの麻雀手牌 · ${tiles.length}`, 'PRIVATE TILES');
  const tileFirst = selection.tilePage * 8;
  tiles.slice(tileFirst, tileFirst + 8).forEach((tile, index) => {
    drawImage(ctx, `../pai-images/pai-images/${tile.asset}-66-90-s.png`, margin + 16 + index * 34, tileY + 45, 30, 43);
    addTarget({ x: margin + 16 + index * 34, y: tileY + 45, width: 30, height: 43, type: 'button', label: '麻雀牌', action: () => dispatch({ type: 'play-mahjong-tile', tileId: tile.id, x: 50, y: 50 }) });
  });
  if (tiles.length > 8) {
    drawButton(ctx, '‹', margin + 16, tileY + 100, 35, 26, () => selection.tilePage = Math.max(0, selection.tilePage - 1));
    drawButton(ctx, '›', margin + 60, tileY + 100, 35, 26, () => selection.tilePage = Math.min(Math.floor((tiles.length - 1) / 8), selection.tilePage + 1));
  }
  return tileY + 166;
}

function drawDecks(ctx, width, margin, panelWidth, y) {
  const h = 192;
  drawPanel(ctx, margin, y, panelWidth, h, `トランプの箱 · ${state.decks.length}/2`, 'CARD BOXES');
  drawButton(ctx, '＋ 箱を追加', margin + 14, y + 58, 115, 34, () => dispatch({ type: 'add-deck' }), 'secondary', state.decks.length >= 2);
  drawButton(ctx, '全回収して箱に戻す', margin + 140, y + 58, panelWidth - 154, 34, () => dispatch({ type: 'collect-all-cards' }), 'subtle', state.decks.length === 0);
  state.decks.forEach((deck, index) => {
    const remaining = state.cards.filter(card => card.deckId === deck.id && card.zone === 'deck').length;
    const entryY = y + 104 + index * 38;
    drawButton(ctx, `箱 ${deck.index}から1枚引く · ${remaining}/52`, margin + 14, entryY, panelWidth - 134, 30, () => dispatch({ type: 'draw-card', deckId: deck.id }), 'secondary', !remaining);
    drawButton(ctx, '削除', margin + panelWidth - 108, entryY, 92, 30, () => requestConfirmation(`トランプの箱 ${deck.index} を削除し、カードを回収しますか？`, () => dispatch({ type: 'remove-deck', deckId: deck.id })), 'danger');
  });
  return y + h + 12;
}

function drawMahjong(ctx, width, margin, panelWidth, y) {
  const wallCount = state.mahjongTiles.filter(tile => tile.zone === 'wall').length;
  drawPanel(ctx, margin, y, panelWidth, 128, '麻雀牌', 'MAHJONG TILES');
  drawButton(ctx, '牌山を作る（136枚）', margin + 14, y + 58, (panelWidth - 39) / 2, 34, () => dispatch({ type: 'add-mahjong-wall' }), 'secondary');
  drawButton(ctx, `牌山から1枚引く · ${wallCount}`, margin + 25 + (panelWidth - 39) / 2, y + 58, (panelWidth - 39) / 2, 34, () => dispatch({ type: 'draw-mahjong-tile' }), 'gold', wallCount === 0);
  drawText(ctx, '役や和了の判定はありません。手牌の牌はクリックで場に出ます。', margin + 16, y + 111, { size: 10, color: '#92a39b' });
  return y + 140;
}

function drawDeal(ctx, width, margin, panelWidth, y) {
  const h = 248;
  drawPanel(ctx, margin, y, panelWidth, h, 'カードを配る', 'DEAL CARDS');
  drawButton(ctx, `配り方: ${selection.dealMode === 'even' ? '残りを均等に配る' : '1人あたりの枚数指定'}`, margin + 14, y + 58, panelWidth - 28, 34, () => {
    selection.dealMode = selection.dealMode === 'even' ? 'each' : 'even';
  }, 'secondary', !state.decks.length);
  const deck = state.decks[0];
  drawButton(ctx, `対象の箱: ${deck ? `箱 ${deck.index}` : 'なし'}  ▾`, margin + 14, y + 100, panelWidth - 28, 34, () => {
    if (state.decks.length > 1) fields.selectedDeckIndex = String((Number(fields.selectedDeckIndex || 0) + 1) % state.decks.length);
  }, 'secondary', !state.decks.length);
  drawField(ctx, '除外するランク（例 A, K, 7）', 'excludeRanks', margin + 14, y + 145, (panelWidth - 39) / 2);
  drawField(ctx, '箱に残す枚数', 'dealReserve', margin + 25 + (panelWidth - 39) / 2, y + 145, (panelWidth - 39) / 2, { type: 'number', maxLength: 3 });
  if (selection.dealMode === 'each') drawField(ctx, '1人あたり', 'dealPerPlayer', margin + 14, y + 201, panelWidth - 28, { type: 'number', maxLength: 3 });
  const index = Math.min(Number(fields.selectedDeckIndex || 0), Math.max(0, state.decks.length - 1));
  const selectedDeck = state.decks[index];
  drawButton(ctx, '全員に配る', margin + 14, y + h - 42, panelWidth - 28, 32, () => dispatch({
    type: 'deal',
    deckId: selectedDeck?.id,
    mode: selection.dealMode,
    perPlayer: fields.dealPerPlayer,
    reserve: fields.dealReserve,
    excludeRanks: fields.excludeRanks
  }), 'primary', !selectedDeck);
  return y + h + 12;
}

function drawChat(ctx, width, margin, panelWidth, y) {
  const height = 420;
  drawPanel(ctx, margin, y, panelWidth, height, 'メッセージ', 'ROOM CHAT · DIRECT CHAT');
  let top = y + 60;
  chatMessages.slice(-6).forEach(message => {
    top += drawText(ctx, `${message.name}: ${message.text}`, margin + 16, top + 10, {
      size: 11, color: message.name === me.name ? '#a8e8c6' : '#dce7df', maxWidth: panelWidth - 34
    }) + 3;
  });
  top = Math.max(top + 10, y + 205);
  drawField(ctx, 'メッセージ（Enterで送信）', 'chat', margin + 14, top, panelWidth - 28, { maxLength: 500, placeholder: 'メッセージを入力' });
  drawButton(ctx, '送信', margin + panelWidth - 86, top + 51, 72, 30, sendChat, 'primary');
  top += 96;
  const others = (room?.members || state.players).filter(person => person.id !== me.id);
  const recipient = others.find(person => person.id === selection.recipientId) || others[0];
  if (recipient && !selection.recipientId) selection.recipientId = recipient.id;
  drawButton(ctx, `個別チャット送信先: ${recipient ? participantName(recipient) : '相手なし'}  ▾`, margin + 14, top, panelWidth - 28, 32, () => {
    if (!others.length) return;
    const current = others.findIndex(person => person.id === selection.recipientId);
    selection.recipientId = others[(current + 1) % others.length].id;
  }, 'secondary', !recipient);
  top += 41;
  privateMessages.slice(-3).forEach(message => {
    top += drawText(ctx, `${message.label}: ${message.text}`, margin + 16, top + 10, {
      size: 10, color: '#92a39b', maxWidth: panelWidth - 34
    }) + 3;
  });
  drawField(ctx, '個別メッセージ', 'directChat', margin + 14, y + height - 89, panelWidth - 28, { maxLength: 500, placeholder: '個別メッセージを入力' });
  drawButton(ctx, '個別送信', margin + panelWidth - 102, y + height - 37, 88, 30, sendPrivateChat, 'primary', !recipient);
  return y + height + 12;
}

function toggleDrawing(mode) {
  selection.drawingMode = selection.drawingMode === mode ? 'none' : mode;
  safeRender();
}

function getPointerPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (engine.width / rect.width),
    y: (event.clientY - rect.top) * (engine.height / rect.height)
  };
}

function hitTest(point) {
  return [...layoutTargets].reverse().find(target =>
    point.x >= target.x && point.x <= target.x + target.width &&
    point.y >= target.y && point.y <= target.y + target.height
  );
}

function activateTarget(target) {
  if (!target || target.disabled) return;
  if (target.type === 'field') {
    selection.focusedField = target.key;
    safeRender();
  } else if (target.type === 'button') {
    target.action?.();
    safeRender();
  } else if (target.type === 'table-object') {
    handleTableObjectClick(target.object);
  }
}

function handleTableObjectClick(object) {
  if (selection.drawingMode !== 'none') return;
  if (object.objectType === 'card') {
    const now = Date.now();
    if (selection.pendingDoubleClick?.id === object.id && now - selection.pendingDoubleClick.at < 320) {
      clearTimeout(selection.pendingDoubleClick.timer);
      selection.pendingDoubleClick = null;
      dispatch({ type: 'collect-object', objectId: object.id });
    } else {
      const timer = setTimeout(() => {
        selection.pendingDoubleClick = null;
        dispatch({ type: 'flip-card', cardId: object.id });
      }, 260);
      selection.pendingDoubleClick = { id: object.id, at: now, timer };
    }
  } else if (object.objectType === 'tile') {
    const now = Date.now();
    if (selection.pendingDoubleClick?.id === object.id && now - selection.pendingDoubleClick.at < 320) {
      clearTimeout(selection.pendingDoubleClick.timer);
      selection.pendingDoubleClick = null;
      dispatch({ type: 'collect-object', objectId: object.id });
    } else selection.pendingDoubleClick = { id: object.id, at: now, timer: setTimeout(() => { selection.pendingDoubleClick = null; }, 300) };
  } else {
    if (object.kind === 'image') {
      selection.selectedImageId = object.id;
      safeRender();
    }
    const now = Date.now();
    if (selection.pendingDoubleClick?.id === object.id && now - selection.pendingDoubleClick.at < 320) {
      clearTimeout(selection.pendingDoubleClick.timer);
      selection.pendingDoubleClick = null;
      dispatch({ type: object.kind === 'coin' ? 'collect-coins' : 'collect-object', objectId: object.id });
    } else selection.pendingDoubleClick = { id: object.id, at: now, timer: setTimeout(() => { selection.pendingDoubleClick = null; }, 300) };
  }
}

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  canvas.focus();
  const point = getPointerPoint(event);
  const target = hitTest(point);
  const table = findTableBounds(point);
  if (selection.drawingMode !== 'none' && table && state) {
    canvas.setPointerCapture(event.pointerId);
    const normalized = { x: (point.x - table.x) / table.width * 100, y: (point.y - table.y) / table.height * 100 };
    if (selection.drawingMode === 'pen') {
      activeStrokeId = crypto.randomUUID();
      pendingDrawPoints = [];
      lastDrawSendAt = Date.now();
      dispatch({ type: 'add-stroke', strokeId: activeStrokeId, color: fields.drawColor, width: Number(fields.drawWidth), points: [normalized] });
    } else dispatch({ type: 'erase-stroke', ...normalized, radius: 3 });
  } else if (target?.type === 'table-object') {
    pointerStart = { ...point, target };
    pointerMoved = false;
    canvas.setPointerCapture(event.pointerId);
  } else if (target) {
    activateTarget(target);
  }
});

canvas.addEventListener('pointermove', event => {
  const point = getPointerPoint(event);
  if (pointerStart && canvas.hasPointerCapture(event.pointerId)) {
    if (Math.abs(point.x - pointerStart.x) + Math.abs(point.y - pointerStart.y) > 5) pointerMoved = true;
    if (pointerMoved) {
      const table = findTableBounds(pointerStart);
      if (table) {
        const x = Math.max(0, Math.min(100, (point.x - table.x) / table.width * 100));
        const y = Math.max(0, Math.min(100, (point.y - table.y) / table.height * 100));
        pointerStart.current = { x, y };
      }
      safeRender();
    }
  } else if (selection.drawingMode !== 'none' && canvas.hasPointerCapture(event.pointerId)) {
    const table = findTableBounds(point);
    if (!table) return;
    const normalized = { x: Math.max(0, Math.min(100, (point.x - table.x) / table.width * 100)), y: Math.max(0, Math.min(100, (point.y - table.y) / table.height * 100)) };
    if (selection.drawingMode === 'pen' && activeStrokeId) {
      pendingDrawPoints.push(normalized);
      if (Date.now() - lastDrawSendAt > 40) {
        dispatch({ type: 'append-stroke', strokeId: activeStrokeId, points: pendingDrawPoints.splice(0) });
        lastDrawSendAt = Date.now();
      }
    } else if (Date.now() - lastDrawSendAt > 40) {
      dispatch({ type: 'erase-stroke', ...normalized, radius: 3 });
      lastDrawSendAt = Date.now();
    }
  }
});

canvas.addEventListener('pointerup', event => {
  if (!canvas.hasPointerCapture(event.pointerId)) return;
  if (pointerStart) {
    if (pointerMoved) {
      const point = getPointerPoint(event);
      const table = findTableBounds(pointerStart);
      if (table) dispatch({ type: 'move-object', objectId: pointerStart.target.object.id, x: (point.x - table.x) / table.width * 100, y: (point.y - table.y) / table.height * 100 });
    } else handleTableObjectClick(pointerStart.target.object);
    pointerStart = null;
  }
  if (activeStrokeId && pendingDrawPoints.length) {
    dispatch({ type: 'append-stroke', strokeId: activeStrokeId, points: pendingDrawPoints.splice(0) });
  }
  activeStrokeId = null;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener('pointercancel', () => {
  pointerStart = null;
  if (activeStrokeId && pendingDrawPoints.length) dispatch({ type: 'append-stroke', strokeId: activeStrokeId, points: pendingDrawPoints.splice(0) });
  activeStrokeId = null;
});

function findTableBounds(point) {
  const region = layoutRegions.find(item => item.kind === 'table');
  if (region && point.x >= region.x && point.x <= region.x + region.width && point.y >= region.y && point.y <= region.y + region.height) return region;
  return null;
}

canvas.addEventListener('keydown', event => {
  if (textFieldKeyDown(event)) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Tab') {
    const targets = layoutTargets.filter(target => target.type === 'field' || (target.type === 'button' && !target.disabled));
    if (!targets.length) return;
    event.preventDefault();
    focusedTargetIndex = (focusedTargetIndex + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
    const focused = targets[focusedTargetIndex];
    if (focused.type === 'field') selection.focusedField = focused.key;
    else selection.focusedField = null;
    safeRender();
  } else if ((event.key === 'Enter' || event.key === ' ') && focusedTargetIndex >= 0) {
    const targets = layoutTargets.filter(target => target.type === 'field' || (target.type === 'button' && !target.disabled));
    activateTarget(targets[focusedTargetIndex]);
    event.preventDefault();
  } else if (event.key === 'Escape') {
    selection.focusedField = null;
    safeRender();
  }
});

window.addEventListener('resize', () => {
  if (engine.currentScene) {
    setupCanvasSize();
    safeRender();
  }
});

function participantName(participant) {
  try {
    const metadata = JSON.parse(participant.metadata || '{}');
    if (typeof metadata.displayName === 'string' && metadata.displayName.trim()) return metadata.displayName.trim().slice(0, 24);
  } catch (error) {
    console.warn('Could not read participant metadata', error);
  }
  return participant.name || 'PLAYER';
}

async function requestSkyWayToken(targetRoomId = '', createRoom = false) {
  if (!TOKEN_ENDPOINT.trim()) throw new Error('SkyWayトークン発行エンドポイントが未設定です。');
  const endpoint = new URL(TOKEN_ENDPOINT, location.href);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('SkyWayトークン発行URLはHTTP(S)で指定してください。');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      memberName: skywayMemberName,
      lobbyRoomName,
      roomId: targetRoomId || null,
      createRoom
    })
  });
  if (!response.ok) throw new Error(`トークン発行に失敗しました（HTTP ${response.status}）。`);
  const payload = await response.json();
  if (typeof payload?.token !== 'string' || !payload.token.trim()) throw new Error('トークン発行サーバーの応答にtokenがありません。');
  return payload.token;
}

function encodePacket(message) {
  const text = JSON.stringify({ ...message, memberId: me.id });
  const chunkId = crypto.randomUUID();
  const total = Math.ceil(text.length / PACKET_CHARS);
  for (let index = 0; index < total; index += 1) {
    dataStream.write(JSON.stringify({ chunkId, index, total, text: text.slice(index * PACKET_CHARS, (index + 1) * PACKET_CHARS) }));
  }
}

function send(message) {
  if (!dataStream) throw new Error('データ通信が準備できていません。');
  encodePacket(message);
}

function sendLobby(message) {
  if (lobbyStream) lobbyStream.write(JSON.stringify({ ...message, sentAt: Date.now() }));
}

function renderPublicRooms() {
  const now = Date.now();
  for (const [id, entry] of publicRooms) if (now - entry.lastSeen > 45_000) publicRooms.delete(id);
  safeRender();
}

function announcePublicRoom() {
  if (host && state?.publicListing && lobbyStream) sendLobby({
    type: 'room-announce', roomId, hostId, hostName: me.name, players: room?.members.length || state.players.length
  });
}

function removePublicRoomAnnouncement() {
  if (host && state?.publicListing) sendLobby({ type: 'room-remove', roomId, hostId });
}

function handleLobbyMessage(raw, sender) {
  if (typeof raw !== 'string' || raw.length > 2000) return;
  let message;
  try { message = JSON.parse(raw); } catch (error) { console.warn('Invalid room directory message', error); return; }
  if (!lobbyRoom?.members.some(item => item.id === sender.id)) return;
  if (message.type === 'room-announce' && typeof message.roomId === 'string' && ROOM_NAME_PATTERN.test(message.roomId) && typeof message.hostId === 'string') {
    publicRooms.set(message.roomId, {
      roomId: message.roomId, hostId: message.hostId,
      hostName: typeof message.hostName === 'string' ? message.hostName.slice(0, 24) : 'HOST',
      players: Math.max(1, Math.min(100, Number(message.players) || 1)),
      senderId: sender.id, lastSeen: Date.now()
    });
    renderPublicRooms();
  } else if (message.type === 'room-remove' && typeof message.roomId === 'string') {
    const entry = publicRooms.get(message.roomId);
    if (entry?.senderId === sender.id) publicRooms.delete(message.roomId);
    renderPublicRooms();
  } else if (message.type === 'room-list-request' && host) announcePublicRoom();
}

async function openLobby() {
  if (!TOKEN_ENDPOINT.trim()) {
    connectionStatus = 'SkyWayトークン未設定';
    safeRender();
    return;
  }
  if (lobbyStream) return;
  try {
    lobbyContext = await SkyWayContext.Create(await requestSkyWayToken());
    lobbyRoom = await SkyWayRoom.FindOrCreate(lobbyContext, { type: 'p2p', name: lobbyRoomName });
    lobbyMember = await lobbyRoom.join({ name: skywayMemberName });
    lobbyStream = await SkyWayStreamFactory.createDataStream({ ordered: true });
    await lobbyMember.publish(lobbyStream);
    lobbyRoom.onStreamPublished.add(({ publication }) => { void subscribeLobby(publication); });
    for (const publication of lobbyRoom.publications) void subscribeLobby(publication);
    sendLobby({ type: 'room-list-request' });
    directoryTimer = setInterval(renderPublicRooms, 10_000);
    connectionStatus = 'オンライン';
    safeRender();
  } catch (error) {
    console.error('Public room directory connection failed', error);
    connectionStatus = '部屋一覧に接続できません';
    notify(`公開部屋一覧に接続できませんでした: ${error.message}`);
  }
}

async function subscribeLobby(publication) {
  if (!lobbyMember || !publication?.id || publication.publisher?.id === lobbyMember.id) return;
  try {
    const { stream } = await lobbyMember.subscribe(publication);
    if (stream.contentType === 'data') stream.onData.add(data => handleLobbyMessage(data, publication.publisher));
  } catch (error) {
    console.error('Public room directory subscription failed', error);
  }
}

function receiveChunk(raw, publisherId) {
  if (typeof raw !== 'string' || raw.length > PACKET_CHARS + 400) return;
  let packet;
  try { packet = JSON.parse(raw); } catch (error) { console.warn('Invalid data packet', error); return; }
  if (typeof packet.chunkId !== 'string' || !Number.isInteger(packet.index) || !Number.isInteger(packet.total) ||
    packet.total < 1 || packet.total > 800 || packet.index < 0 || packet.index >= packet.total || typeof packet.text !== 'string') return;
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
  if (buffer.length > MAX_IMAGE_BYTES * 1.5) { chunkBuffers.delete(key); return; }
  if (buffer.received !== buffer.chunks.length) return;
  chunkBuffers.delete(key);
  try {
    const message = JSON.parse(buffer.chunks.join(''));
    const publisher = dataRoom?.members.find(item => item.id === publisherId);
    const linkedMember = room?.members.find(item => item.name === publisher?.name);
    if (!linkedMember || message.memberId !== linkedMember.id) return;
    handleMessage(message, linkedMember.id);
  } catch (error) {
    notify(`受信データを読み込めませんでした: ${error.message}`);
  }
}

async function subscribePublication(publication) {
  if (!dataMember || !publication?.id || subscribedPublications.has(publication.id) || publication.publisher?.id === dataMember.id) return;
  subscribedPublications.add(publication.id);
  try {
    const { stream } = await dataMember.subscribe(publication);
    if (stream.contentType === 'data') stream.onData.add(data => receiveChunk(data, publication.publisher.id));
  } catch (error) {
    subscribedPublications.delete(publication.id);
    notify(`データストリームの購読に失敗しました: ${error.message}`);
  }
}

function sendState(targetId) {
  if (!host || !state) return;
  if (targetId) { void sendSecureState(targetId); return; }
  for (const target of room?.members || []) if (target.id !== member?.id) void sendSecureState(target.id);
}

async function sendSecureState(targetId) {
  const recipientJwk = memberPublicKeys.get(targetId);
  if (!recipientJwk || !keyPair || !state) return;
  try {
    const recipientKey = await crypto.subtle.importKey('jwk', recipientJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const sharedKey = await crypto.subtle.deriveKey({ name: 'ECDH', public: recipientKey }, keyPair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(tableEngine.publicState(state, targetId)));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, plaintext);
    send({ type: 'secure-state', to: targetId, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) });
  } catch (error) { notify(`手札の暗号化に失敗しました: ${error.message}`); }
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
    const sharedKey = await crypto.subtle.deriveKey({ name: 'ECDH', public: hostKey }, keyPair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(message.iv) }, sharedKey, base64ToBytes(message.ciphertext));
    const incoming = JSON.parse(new TextDecoder().decode(plaintext));
    if (!Number.isInteger(incoming.revision) || (state && incoming.revision <= state.revision)) return;
    state = incoming;
    clearInterval(handshakeTimer);
    handshakeTimer = 0;
    safeRender();
    requestMissingAssets();
  } catch (error) { notify(`暗号化された状態を読み込めませんでした: ${error.message}`); }
}

function broadcastState() {
  if (!host) return;
  safeRender();
  sendState();
}

function applyRoomAction(action) {
  if (action.type === 'start-game' && action.mode === 'daifugu') {
    action = { ...action, daifugu: createDaifuguGame(state.players.filter(player => !player.spectator)) };
  } else if (action.type === 'game-action' && state.game?.mode === 'daifugu') {
    const daifugu = applyDaifuguAction(state.game.daifugu, action.actorId, action.action);
    return tableEngine.apply(state, { type: 'daifugu-state', actorId: state.hostId, daifugu });
  }
  return tableEngine.apply(state, action);
}

function dispatch(action) {
  try {
    const request = { ...action, actorId: me.id };
    if (host) {
      state = applyRoomAction(request);
      broadcastState();
      if (action.type === 'set-public-listing') void syncRoomMetadata().catch(error => notify(`部屋設定を保存できませんでした: ${error.message}`));
    } else send({ type: 'request', action: request });
  } catch (error) {
    notify(error.message);
  }
}

async function syncRoomMetadata() {
  if (!host || !room || !state) return;
  await room.updateMetadata(JSON.stringify({ hostId, hostName: me.name, publicListing: state.publicListing }));
  if (state.publicListing) announcePublicRoom();
  else sendLobby({ type: 'room-remove', roomId, hostId });
}

function handleMessage(message, publisherId) {
  if (!room?.members.some(candidate => candidate.id === publisherId)) return;
  if (message.type === 'key-share' && host && message.memberId === publisherId && message.publicKey?.kty === 'EC') {
    memberPublicKeys.set(publisherId, message.publicKey);
    send({ type: 'key-share-relay', ownerId: publisherId, publicKey: message.publicKey });
    return;
  }
  if (message.type === 'key-share-relay' && message.memberId === hostId && typeof message.ownerId === 'string' && message.publicKey?.kty === 'EC') {
    memberPublicKeys.set(message.ownerId, message.publicKey); return;
  }
  if (message.type === 'key-directory' && message.memberId === hostId && message.to === me.id && Array.isArray(message.keys)) {
    for (const entry of message.keys) if (entry.id && entry.key?.kty === 'EC') memberPublicKeys.set(entry.id, entry.key);
    return;
  }
  if (message.type === 'secure-state' && message.memberId === hostId && message.to === me.id) { void openSecureState(message); return; }
  if (message.type === 'request' && host) {
    if (message.action?.type === 'state-request') {
      if (state.players.some(player => player.id === publisherId)) {
        send({ type: 'key-directory', to: publisherId, keys: [...memberPublicKeys].map(([id, key]) => ({ id, key })) });
        sendState(publisherId);
        send({ type: 'chat-history', to: publisherId, messages: chatMessages });
      }
      return;
    }
    try {
      state = applyRoomAction({ ...message.action, actorId: publisherId });
      broadcastState();
      if (message.action.type === 'set-public-listing') void syncRoomMetadata().catch(error => notify(`部屋設定を保存できませんでした: ${error.message}`));
    } catch (error) { send({ type: 'error', to: publisherId, message: error.message }); }
    return;
  }
  if (message.type === 'error' && message.to === me.id && message.memberId === hostId) { notify(message.message || '操作に失敗しました。'); return; }
  if (message.type === 'chat' && typeof message.text === 'string' && message.text.length <= 500) {
    const sender = room.members.find(item => item.id === publisherId);
    const entry = { name: sender ? participantName(sender) : 'PLAYER', text: message.text, sentAt: message.sentAt };
    chatMessages.push(entry);
    if (chatMessages.length > 50) chatMessages.shift();
    safeRender();
    return;
  }
  if (message.type === 'direct-chat' && message.to === me.id && typeof message.text === 'string' && message.text.trim() && message.text.length <= 500) {
    const sender = room.members.find(item => item.id === publisherId);
    privateMessages.push({ label: `${sender ? participantName(sender) : 'PLAYER'} から`, text: message.text });
    if (privateMessages.length > 30) privateMessages.shift();
    safeRender();
    return;
  }
  if (message.type === 'chat-history' && message.to === me.id && message.memberId === hostId) {
    chatMessages.splice(0, chatMessages.length, ...(Array.isArray(message.messages) ? message.messages.slice(-50) : []));
    safeRender(); return;
  }
  if (message.type === 'asset-upload' && host) {
    if (typeof message.assetId !== 'string' || typeof message.data !== 'string' || !message.data.startsWith('data:image/webp;base64,') || message.data.length > MAX_IMAGE_BYTES * 1.4) {
      send({ type: 'error', to: publisherId, message: '画像データが大きすぎるか、形式が正しくありません。' }); return;
    }
    assets.set(message.assetId, message.data);
    send({ type: 'asset-relay', assetId: message.assetId, data: message.data }); return;
  }
  if (message.type === 'asset-relay' && message.memberId === hostId && typeof message.assetId === 'string' && typeof message.data === 'string' && message.data.startsWith('data:image/webp;base64,') && message.data.length <= MAX_IMAGE_BYTES * 1.4) {
    assets.set(message.assetId, message.data);
    assetImage(message.data);
    safeRender(); return;
  }
  if (message.type === 'asset-request' && host && typeof message.assetId === 'string') {
    const data = assets.get(message.assetId);
    if (data) send({ type: 'asset-relay', to: publisherId, assetId: message.assetId, data });
  }
}

function requestMissingAssets() {
  if (!state || host) return;
  for (const object of state.objects) if (object.kind === 'image' && !assets.has(object.assetId)) {
    try { send({ type: 'asset-request', assetId: object.assetId }); } catch (error) { console.error('Image request could not be sent', error); }
  }
}

function sendChat() {
  const text = fields.chat.trim();
  if (!text) return;
  const sentAt = Date.now();
  try {
    send({ type: 'chat', text, sentAt });
    chatMessages.push({ name: me.name, text, sentAt });
    if (chatMessages.length > 50) chatMessages.shift();
    fields.chat = '';
    safeRender();
  } catch (error) { notify(error.message); }
}

function sendPrivateChat() {
  const text = fields.directChat.trim();
  const recipient = room?.members.find(item => item.id === selection.recipientId);
  if (!text || !recipient) { notify('個別メッセージの送信先を選んでください。'); return; }
  try {
    send({ type: 'direct-chat', to: recipient.id, text, sentAt: Date.now() });
    privateMessages.push({ label: `${participantName(recipient)} へ`, text });
    fields.directChat = '';
    safeRender();
  } catch (error) { notify(error.message); }
}

async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選択してください。');
  if (file.size > 24 * 1024 * 1024) throw new Error('アップロード前の画像は24 MB以下にしてください。');
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    let quality = .84;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scratch = document.createElement('canvas');
      scratch.width = Math.max(1, Math.round(bitmap.width * scale));
      scratch.height = Math.max(1, Math.round(bitmap.height * scale));
      const drawing = scratch.getContext('2d');
      if (!drawing) throw new Error('画像を圧縮できませんでした。');
      drawing.drawImage(bitmap, 0, 0, scratch.width, scratch.height);
      const blob = await new Promise(resolve => scratch.toBlob(resolve, 'image/webp', quality));
      if (!blob) throw new Error('WebP画像の作成に失敗しました。');
      if (blob.size <= MAX_IMAGE_BYTES) return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('圧縮画像を読み込めませんでした。'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      quality = Math.max(.35, quality - .08);
      scale *= .82;
    }
    throw new Error('圧縮後の画像が5 MBを超えています。小さい画像を選んでください。');
  } finally { bitmap.close(); }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const data = await compressImage(file);
    const assetId = crypto.randomUUID();
    assets.set(assetId, data);
    assetImage(data);
    send({ type: 'asset-upload', assetId, data });
    dispatch({ type: 'add-image', assetId });
    notify('画像を共有テーブルに追加しました。');
  } catch (error) { notify(error.message); }
});

async function connectRoom(create) {
  if (connecting) return;
  const name = fields.name.trim().slice(0, 24);
  const desiredRoom = fields.room.trim().toLowerCase();
  if (!name) { selection.focusedField = 'name'; notify('あなたの名前を入力してください。'); return; }
  if (!ROOM_NAME_PATTERN.test(desiredRoom)) { selection.focusedField = 'room'; notify('部屋IDは英数字、ハイフン、アンダースコアで1〜48文字にしてください。'); return; }
  if (!TOKEN_ENDPOINT.trim()) {
    connectionStatus = 'SkyWayトークン未設定';
    notify('SkyWayトークン発行URLは未設定です。秘密鍵をブラウザーに置かず、安全なサーバー側トークン発行を構成してください。', 7000);
    safeRender();
    return;
  }
  me.name = name;
  roomId = desiredRoom;
  localStorage.setItem('tower-player-name', name);
  state = null;
  host = false;
  hostId = null;
  chatMessages.length = 0;
  assets.clear();
  memberPublicKeys.clear();
  subscribedPublications.clear();
  chunkBuffers.clear();
  connecting = true;
  connectionStatus = 'SkyWayに接続中';
  safeRender();
  try {
    keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    context = await SkyWayContext.Create(await requestSkyWayToken(roomId, create));
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
    const metadata = room.metadata ? JSON.parse(room.metadata) : null;
    if (create) {
      host = true;
      hostId = member.id;
      memberPublicKeys.set(member.id, publicKeyJwk);
      state = tableEngine.createState(roomId, { id: member.id, name: me.name });
      await room.updateMetadata(JSON.stringify({ hostId, hostName: me.name, publicListing: state.publicListing }));
    } else {
      if (!metadata?.hostId) throw new Error('部屋のホスト情報を読み込めません。部屋IDを確認してください。');
      hostId = metadata.hostId;
      host = hostId === member.id;
    }
    dataStream = await SkyWayStreamFactory.createDataStream({ ordered: true });
    await dataMember.publish(dataStream);
    send({ type: 'key-share', publicKey: publicKeyJwk });
    dataRoom.onStreamPublished.add(({ publication }) => void subscribePublication(publication));
    room.onMemberListChanged.add(() => safeRender());
    room.onMemberMetadataUpdated.add(() => safeRender());
    room.onMemberJoined.add(({ member: joined }) => {
      safeRender();
      if (host && joined.id !== member.id) {
        try {
          state = tableEngine.apply(state, { type: 'add-player', actorId: member.id, player: { id: joined.id, name: participantName(joined) } });
          broadcastState();
        } catch (error) { notify(error.message); }
      }
    });
    room.onMemberLeft.add(({ member: departed }) => {
      if (departed.id === hostId && !host) finishRoom('ホストが退出したため、部屋を解散しました。', true);
      else if (host) {
        try {
          state = tableEngine.apply(state, { type: 'remove-player', actorId: member.id, playerId: departed.id });
          broadcastState();
        } catch (error) { notify(error.message); }
      }
      safeRender();
    });
    room.onClosed.add(() => finishRoom('部屋は解散されました。'));
    dataRoom.onClosed.add(() => finishRoom('部屋のデータ通信が切断されました。'));
    for (const publication of dataRoom.publications) void subscribePublication(publication);
    if (host) {
      for (const participant of room.members) {
        if (participant.id !== member.id) state = tableEngine.apply(state, {
          type: 'add-player', actorId: member.id, player: { id: participant.id, name: participantName(participant) }
        });
      }
    }
    engine.switchScene('table');
    connectionStatus = 'オンライン';
    if (host) {
      announcePublicRoom();
      lobbyAnnounceTimer = setInterval(announcePublicRoom, 15_000);
    } else {
      let attempts = 0;
      const requestState = () => {
        if (state || attempts >= 15) {
          clearInterval(handshakeTimer);
          handshakeTimer = 0;
          if (!state) {
            connectionStatus = '同期エラー';
            notify('ホストから部屋の状態を受信できません。部屋IDを確認してください。', 7000);
          }
          return;
        }
        attempts += 1;
        try {
          send({ type: 'key-share', publicKey: publicKeyJwk });
          send({ type: 'request', action: { type: 'state-request' } });
        } catch (error) { notify(`ルーム同期に失敗しました: ${error.message}`); }
      };
      requestState();
      handshakeTimer = setInterval(requestState, 1000);
    }
    if (create) chatMessages.push({ name: 'SYSTEM', text: '部屋を作成しました。招待リンクを共有してください。' });
    safeRender();
  } catch (error) {
    await cleanupConnection();
    connectionStatus = '接続エラー';
    engine.switchScene('lobby');
    notify(`部屋に接続できませんでした: ${error.message}`, 7000);
  } finally { connecting = false; }
}

async function cleanupConnection(closeRoom = false) {
  if ((!room && !dataRoom && !context) || closing) return;
  closing = true;
  clearInterval(lobbyAnnounceTimer);
  lobbyAnnounceTimer = 0;
  if (closeRoom) removePublicRoomAnnouncement();
  try {
    const results = closeRoom
      ? await Promise.allSettled([room?.close(), dataRoom?.close()].filter(Boolean))
      : await Promise.allSettled([room && member ? room.leave(member) : undefined, dataRoom && dataMember ? dataRoom.leave(dataMember) : undefined].filter(Boolean));
    for (const result of results) if (result.status === 'rejected') console.error('SkyWay room cleanup failed', result.reason);
    await context?.dispose();
  } catch (error) { console.error('SkyWay room cleanup failed', error); }
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
  connectionStatus = '切断';
  engine.switchScene('lobby');
  notify(message);
}

async function leaveRoom() {
  if (host) await cleanupConnection(true);
  else await cleanupConnection();
  connectionStatus = '退出しました';
  selection.focusedField = null;
  engine.switchScene('lobby');
}

async function copyInvite() {
  const link = new URL(location.href);
  link.search = new URLSearchParams({ room: roomId }).toString();
  try {
    await navigator.clipboard.writeText(link.href);
    notify('招待リンクをコピーしました。');
  } catch (error) {
    rememberedInvite = link.href;
    notify(`招待リンク（Canvasに表示）: ${rememberedInvite}`, 9000);
  }
}

function daifuguCardImage(card) {
  if (card.joker) return '../cards/j01@2x.png';
  const suit = ['s', 'h', 'd', 'c'].includes(card.suit) ? card.suit : { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' }[card.suit];
  const rank = Number(card.rank) || { A: 1, J: 11, Q: 12, K: 13 }[card.rank];
  return `../cards/${suit}${String(rank).padStart(2, '0')}@2x.png`;
}

function drawCard(ctx, card, x, y, width = 42, height = 60, action = null, selected = false) {
  const src = card.joker ? '../cards/j01@2x.png' : card.faceUp === false ? '../cards/back@2x.png' : daifuguCardImage(card);
  drawImage(ctx, src, x, y, width, height);
  if (selected) {
    ctx.strokeStyle = '#e1bb67';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
  }
  if (action) addTarget({ x, y, width, height, type: 'button', action, label: 'カード' });
}

engine.registerScene('lobby', {
  onEnter() {
    setupCanvasSize();
    void openLobby();
  },
  onRender: lobbyRender
});
engine.registerScene('table', {
  onEnter() {
    selection.drawingMode = 'none';
    setupCanvasSize();
  },
  onRender: drawTableScene
});
engine.start('lobby');

window.addEventListener('beforeunload', () => {
  if (host) removePublicRoomAnnouncement();
  if (host && (room || dataRoom)) void cleanupConnection(true);
});
