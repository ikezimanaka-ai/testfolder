import {
  SkyWayAuthToken,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
  nowInSec
} from 'https://esm.sh/@skyway-sdk/room@2.5.1?bundle';
import { SceneEngine } from '../editor/engine/scene-engine/engine.js';
import { CanvasScrollArea } from '../editor/engine/ui-objects.js';
import { applyDaifuguAction, createDaifuguGame } from '../table2/game-modes.js';
import { extendedApply, legalReversiMoves, publicPokerState } from './extra-games.js';

const API_KEY = '5bf4cd2d-f57b-4df3-a8db-d0afbb5b83cd';
const PASSWORD = '9wX7DnZiArKdrcRz9IO/nicEc+uQF7kCLtcA34bWNUw=';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PACKET_CHARS = 10000;
const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,48}$/;
const canvas = document.querySelector('#etable');
const fileInput = document.querySelector('#image-file');
const tableEngine = globalThis.TowerEngine;
const engine = new SceneEngine({ canvas, width: 1000, height: 600, fps: 30, background: '#101819' });
const handScrollArea = new CanvasScrollArea();
const gameHandScrollArea = new CanvasScrollArea();
const RIGHT_CONTENT = { x: 594, y: 160, scale: 0.94 };
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
  page: 'tools',
  toolsPage: 'place',
  coinPage: 'wallet',
  walletMode: 'add',
  cardsPage: 'hand',
  chatPage: 'room',
  selectedCards: new Set(),
  selectedImageId: null,
  selectedMahjongTileIds: new Set(),
  selectedMahjongDiscardId: null,
  recipientId: '',
  dealMode: 'even',
  gameMode: 'daifugu',
  jokerRank: '3',
  jokerSuit: '♠',
  effectDirection: 'over',
  effectTarget: '',
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
let pointerScroll = null;
let toastMessage = '';
let connectionStatus = 'SkyWay未設定';
let rememberedInvite = '';
let focusedTargetIndex = -1;
let layoutTargets = [];
let layoutRegions = [];

function safeRender() {
  if (engine.currentScene) engine.render();
}

function notify(message) {
  toastMessage = String(message);
  safeRender();
}

function setupCanvasSize() {
  const ratio = 1800 / 1000;
  if (canvas.width !== 1800) canvas.width = 1800;
  if (canvas.height !== 1080) canvas.height = 1080;
  engine.width = 1000;
  engine.height = 600;
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
  const cardX = 16;
  const cardWidth = width - 32;
  ctx.font = '700 20px monospace';
  color(ctx, '#a8e8c6');
  ctx.fillText('ETABLE', cardX, 29);
  ctx.font = '10px monospace';
  color(ctx, '#92a39b');
  ctx.fillText('ONLINE GAME TABLE', cardX + 102, 28);
  drawText(ctx, connectionStatus, width - 122, 28, { size: 9, color: '#e1bb67', maxWidth: 106 });
  drawPanel(ctx, cardX, 42, cardWidth, 210, '部屋に参加', 'LOBBY');
  drawText(ctx, `公開中 ${publicRooms.size} 部屋`, cardX + 13, 104, { size: 10, color: '#a8e8c6' });
  const roomEntries = [...publicRooms.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 5);
  if (!roomEntries.length) {
    drawText(ctx, API_KEY.trim() && PASSWORD.trim() ? '公開部屋はありません' : 'SkyWay未設定：部屋の新規作成・参加は利用できません', cardX + 13, 121, {
      size: 9, color: '#92a39b', maxWidth: cardWidth - 26
    });
  }
  roomEntries.slice(0, 1).forEach((entry, index) => {
    const rowY = 109 + index * 34;
    roundedRect(ctx, cardX + 10, rowY, cardWidth - 20, 30, 6);
    color(ctx, '#192724');
    ctx.fill();
    drawText(ctx, `${entry.roomId} · ${entry.players || 1}人`, cardX + 17, rowY + 19, {
      size: 10, color: '#a8e8c6', maxWidth: cardWidth - 95
    });
    drawButton(ctx, '参加', cardX + cardWidth - 64, rowY + 3, 48, 24, () => {
      fields.room = entry.roomId;
      if (fields.name.trim()) void connectRoom(false);
      else selection.focusedField = 'name';
    });
  });

  drawField(ctx, '名前', 'name', cardX + 12, 141, (cardWidth - 34) / 2, { maxLength: 24, placeholder: 'PLAYER' });
  drawField(ctx, '部屋ID', 'room', cardX + 22 + (cardWidth - 34) / 2, 141, (cardWidth - 34) / 2, { maxLength: 48, placeholder: 'room-name' });
  const buttonY = 195;
  drawButton(ctx, '部屋を作る', cardX + 12, buttonY, (cardWidth - 34) / 2, 34, () => {
    if (!fields.room.trim()) fields.room = `table-${Math.random().toString(36).slice(2, 8)}`;
    void connectRoom(true);
  }, 'secondary');
  drawButton(ctx, '参加する ↗', cardX + 22 + (cardWidth - 34) / 2, buttonY, (cardWidth - 34) / 2, 34, () => void connectRoom(false), 'primary');
  drawText(ctx, '部屋IDは英数字・ハイフン・_（1〜48文字）', cardX + 13, 245, { size: 9, color: '#92a39b' });
  drawToast(ctx, width);
}

function drawToast(ctx, width) {
  if (!toastMessage) return;
  const bounds = noticeBounds(width);
  ctx.fillStyle = '#0009';
  ctx.fillRect(0, 0, width, engine.height);
  drawPanel(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 'お知らせ', 'NOTICE');
  drawText(ctx, toastMessage, bounds.x + 16, bounds.y + 68, {
    size: 13, color: '#eef3e9', maxWidth: bounds.width - 32, lineHeight: 18
  });
  const targetIndex = layoutTargets.length;
  drawButton(ctx, '閉じる', bounds.x + bounds.width - 104, bounds.y + bounds.height - 40, 88, 30, () => {
    toastMessage = '';
    safeRender();
  }, 'primary');
  layoutTargets[targetIndex].overlay = 'notice';
}

function noticeBounds(width) {
  const panelWidth = Math.min(width - 32, 520);
  const panelHeight = 150;
  return { x: (width - panelWidth) / 2, y: (engine.height - panelHeight) / 2, width: panelWidth, height: panelHeight };
}

function confirmBounds(width) {
  const centerY = engine.height / 2;
  const panelWidth = Math.min(width - 32, 420);
  return { x: (width - panelWidth) / 2, y: centerY - 75, width: panelWidth, height: 150 };
}

function requestConfirmation(message, action) {
  selection.confirmAction = { message, action };
  safeRender();
}

function drawConfirmDialog(ctx, width) {
  if (!selection.confirmAction) return;
  const bounds = confirmBounds(width);
  const { x, y, width: panelWidth } = bounds;
  ctx.fillStyle = '#0009';
  ctx.fillRect(0, 0, width, engine.height);
  drawPanel(ctx, x, y, panelWidth, bounds.height, '確認', 'PLEASE CONFIRM');
  drawText(ctx, selection.confirmAction.message, x + 16, y + 74, { size: 12, maxWidth: panelWidth - 32 });
  const targetIndex = layoutTargets.length;
  drawButton(ctx, 'キャンセル', x + 16, y + 103, (panelWidth - 42) / 2, 32, () => { selection.confirmAction = null; }, 'subtle');
  drawButton(ctx, '実行する', x + 26 + (panelWidth - 42) / 2, y + 103, (panelWidth - 42) / 2, 32, () => {
    const action = selection.confirmAction?.action;
    selection.confirmAction = null;
    action?.();
  }, 'danger');
  layoutTargets.slice(targetIndex).forEach(target => { target.overlay = 'confirm'; });
}

function drawTableScene(engineInstance) {
  const ctx = engineInstance.ctx;
  const width = engineInstance.width;
  layoutTargets = [];
  layoutRegions = [];
  ctx.font = '700 22px monospace';
  color(ctx, '#a8e8c6');
  ctx.fillText('ETABLE', 18, 35);
  ctx.font = '12px sans-serif';
  color(ctx, '#92a39b');
  ctx.fillText(`${connectionStatus}${roomId ? ` · ${roomId}` : ''}`, 120, 34, 560);
  drawButton(ctx, '招待', width - 132, 12, 52, 30, () => void copyInvite(), 'subtle');
  drawButton(ctx, '退出', width - 72, 12, 56, 30, () => void leaveRoom(), 'danger');
  drawPermanentTable(ctx);
  drawRightPanel(ctx);
  drawConfirmDialog(ctx, width);
  drawToast(ctx, width);
}

function drawPermanentTable(ctx) {
  const panel = { x: 16, y: 62, width: 556, height: 522 };
  const table = { x: panel.x + 14, y: panel.y + 48, width: panel.width - 28, height: 438 };
  drawPanel(ctx, panel.x, panel.y, panel.width, panel.height, '共有テーブル', 'ROOM TABLE');
  drawText(ctx, `${state?.players.length || 0}人 · ${state?.game?.mode ? modeName(state.game.mode) : '自由卓'}${host ? ' · HOST' : ''}`,
    table.x, panel.y + 39, { size: 11, color: '#a8e8c6', maxWidth: table.width });
  roundedRect(ctx, table.x, table.y, table.width, table.height, 12);
  const gradient = ctx.createRadialGradient(table.x + table.width / 2, table.y + table.height * .42, 10,
    table.x + table.width / 2, table.y + table.height / 2, table.width * .72);
  gradient.addColorStop(0, '#237354');
  gradient.addColorStop(1, '#123f33');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = '#6f855b';
  ctx.stroke();
  ctx.strokeStyle = '#b6cd833b';
  ctx.strokeRect(table.x + 9, table.y + 9, table.width - 18, table.height - 18);
  layoutRegions.push({ ...table, kind: 'table' });
  if (!state) {
    drawText(ctx, '部屋の状態を同期中です。', table.x + 16, table.y + 30, { size: 12, color: '#dce7df' });
  } else {
    const entries = [
      ...state.objects.map(object => ({ ...object, objectType: 'object' })),
      ...state.cards.filter(card => card.zone === 'table').map(card => ({ ...card, objectType: 'card' })),
      ...state.mahjongTiles.filter(tile => tile.zone === 'table').map(tile => ({ ...tile, objectType: 'tile' }))
    ];
    if (!entries.length && !state.strokes?.length) {
      drawText(ctx, 'テーブルは空です。右側からカードやコインを追加できます。', table.x + 16, table.y + 30, {
        size: 12, color: '#dce7df', maxWidth: table.width - 32
      });
    }
    ctx.save();
    roundedRect(ctx, table.x, table.y, table.width, table.height, 12);
    ctx.clip();
    entries.forEach(entry => drawTableObject(ctx, entry, table.x, table.y, table.width, table.height));
    drawStrokes(ctx, table.x, table.y, table.width, table.height);
    drawMahjongRound(ctx, table);
    ctx.restore();
  }
  drawText(ctx, 'ドラッグで移動 · カードをタップして表裏切替 · ダブルタップで手札へ戻す',
    table.x, panel.y + panel.height - 12, { size: 10, color: '#92a39b', maxWidth: table.width });
}

function drawScreenTabs(ctx, width) {
  const tabs = [
    ['tools', '操作'],
    ['game', 'ゲーム'],
    ['cards', 'カード'],
    ['chat', 'チャット']
  ];
  const x = 596;
  const y = 116;
  const gap = 5;
  const buttonWidth = 72;
  tabs.forEach(([page, label], index) => drawButton(
    ctx, label, x + index * (buttonWidth + gap), y, buttonWidth, 36,
    () => {
      selection.page = page;
      selection.focusedField = null;
      selection.selectedCards.clear();
    },
    selection.page === page ? 'primary' : 'secondary'
  ));
}

function drawRightPanel(ctx) {
  const panel = { x: 586, y: 62, width: 398, height: 522 };
  drawPanel(ctx, panel.x, panel.y, panel.width, panel.height, '操作パネル', 'CONTROLS');
  drawScreenTabs(ctx, engine.width);
  if (!state) {
    drawText(ctx, 'ホストから部屋の状態を受信しています。', panel.x + 18, panel.y + 156, {
      size: 12, color: '#92a39b', maxWidth: panel.width - 36
    });
    return;
  }
  const scale = RIGHT_CONTENT.scale;
  const contentX = RIGHT_CONTENT.x;
  const contentY = RIGHT_CONTENT.y;
  const viewport = { x: contentX, y: contentY, width: panel.width - 16, height: panel.height - 112 };
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  ctx.clip();
  const firstTarget = layoutTargets.length;
  ctx.translate(contentX, contentY);
  ctx.scale(scale, scale);
  const margin = 12;
  const panelWidth = 376;
  if (selection.page === 'tools') drawToolsPage(ctx, margin, panelWidth);
  else if (selection.page === 'game') drawGamePage(ctx, margin, panelWidth);
  else if (selection.page === 'cards') drawCardsPage(ctx, margin, panelWidth);
  else if (selection.page === 'mahjong') drawMahjongPage(ctx, margin, panelWidth);
  else if (selection.page === 'chat') drawChatPage(ctx, margin, panelWidth);
  ctx.restore();
  const visibleBottom = viewport.y + viewport.height;
  layoutTargets = layoutTargets.filter((target, index) => {
    if (index < firstTarget) return true;
    target.x = contentX + target.x * scale;
    target.y = contentY + target.y * scale;
    target.width *= scale;
    target.height *= scale;
    return target.x + target.width >= viewport.x && target.x <= viewport.x + viewport.width &&
      target.y + target.height >= viewport.y && target.y <= visibleBottom;
  });
}

function drawPageSubtabs(ctx, items, selected, onSelect, y = 47) {
  const x = 12;
  const gap = 5;
  const width = (400 - x * 2 - gap * (items.length - 1)) / items.length;
  items.forEach(([key, label], index) => drawButton(
    ctx, label, x + index * (width + gap), y, width, 27,
    () => { onSelect(key); selection.focusedField = null; },
    selected === key ? 'primary' : 'secondary'
  ));
}

function drawTablePage(ctx, margin, panelWidth) {
  const members = room?.members || state.players;
  const count = state.players.length;
  const currentGame = state.game?.mode ? modeName(state.game.mode) : '自由卓';
  drawText(ctx, `${count}人 · ${currentGame}${host ? ' · HOST' : ''}`, margin + 2, 51, { size: 10, color: '#a8e8c6', maxWidth: panelWidth - 4 });
  drawButton(ctx, '参加者', 316, 37, 72, 25, () => {
    const names = members.map(person => participantName(person));
    notify(names.join(' / ') || '参加者はいません。');
  }, 'subtle');
  const tableX = margin + 2;
  const tableY = 69;
  const tableWidth = panelWidth - 4;
  const tableHeight = 153;
  roundedRect(ctx, tableX, tableY, tableWidth, tableHeight, 10);
  const gradient = ctx.createRadialGradient(200, 120, 5, 200, 135, 190);
  gradient.addColorStop(0, '#237354');
  gradient.addColorStop(1, '#123f33');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = '#6f855b';
  ctx.stroke();
  ctx.strokeStyle = '#b6cd833b';
  ctx.strokeRect(tableX + 7, tableY + 7, tableWidth - 14, tableHeight - 14);
  layoutRegions.push({ x: tableX, y: tableY, width: tableWidth, height: tableHeight, kind: 'table' });
  const entries = [
    ...state.objects.map(object => ({ ...object, objectType: 'object' })),
    ...state.cards.filter(card => card.zone === 'table').map(card => ({ ...card, objectType: 'card' })),
    ...state.mahjongTiles.filter(tile => tile.zone === 'table').map(tile => ({ ...tile, objectType: 'tile' }))
  ];
  if (!entries.length) {
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#cfe0d155';
    ctx.textAlign = 'center';
    ctx.fillText('共有テーブル · ドラッグで移動', 200, 139);
    ctx.textAlign = 'left';
  }
  entries.forEach(entry => drawTableObject(ctx, entry, tableX, tableY, tableWidth, tableHeight));
  drawStrokes(ctx, tableX, tableY, tableWidth, tableHeight);
  drawButton(ctx, 'ネームプレート', margin + 2, 231, 103, 26, () => { selection.page = 'tools'; selection.toolsPage = 'place'; });
  drawButton(ctx, 'カードを引く', margin + 111, 231, 91, 26, () => {
    const deck = state.decks[0];
    if (deck) dispatch({ type: 'draw-card', deckId: deck.id });
    else notify('「カード」画面で箱を追加してください。');
  }, 'secondary', !state.decks.length);
  drawButton(ctx, 'ゲーム', margin + 208, 231, 74, 26, () => { selection.page = 'game'; });
  drawButton(ctx, '片付け', margin + 288, 231, 90, 26, () => requestConfirmation('場の物・カード・描画を片付けますか？', () => dispatch({ type: 'clear-table' })), 'danger', !host);
}

function drawToolsPage(ctx, margin, panelWidth) {
  drawPageSubtabs(ctx, [['place', '置く'], ['coins', 'コイン'], ['drawing', '描画'], ['room', '部屋']], selection.toolsPage, page => { selection.toolsPage = page; });
  if (selection.toolsPage === 'place') {
    drawField(ctx, 'ネームプレート', 'label', margin + 4, 91, 220, { maxLength: 40, placeholder: '名前やメモ' });
    drawButton(ctx, 'テーブルに置く', 242, 98, 142, 36, () => {
      dispatch({ type: 'add-label', label: fields.label.trim() || me.name, x: 50, y: 50 });
      fields.label = '';
    }, 'primary');
    drawButton(ctx, '画像をアップロード', margin + 4, 157, panelWidth - 8, 38, () => fileInput.click(), 'secondary');
    const selectedImage = state.objects.find(object => object.id === selection.selectedImageId && object.kind === 'image');
    if (selectedImage) {
      drawText(ctx, `選択画像 ${Math.round((selectedImage.scale || 1) * 100)}%`, margin + 5, 213, { size: 10, color: '#a8e8c6' });
      drawButton(ctx, '−', margin + 142, 197, 52, 30, () => dispatch({ type: 'scale-image', objectId: selectedImage.id, scale: (selectedImage.scale || 1) - .1 }));
      drawButton(ctx, '+', margin + 201, 197, 52, 30, () => dispatch({ type: 'scale-image', objectId: selectedImage.id, scale: (selectedImage.scale || 1) + .1 }));
    }
    drawText(ctx, '画像はWebP圧縮されます（最大5MB）。', margin + 5, selectedImage ? 240 : 218, { size: 9, color: '#92a39b' });
  } else if (selection.toolsPage === 'coins') {
    drawPageSubtabs(ctx, [['wallet', '所持'], ['table', '卓上'], ['bet', '賭け金']], selection.coinPage, page => { selection.coinPage = page; }, 79);
    const half = (panelWidth - 14) / 2;
    if (selection.coinPage === 'wallet') {
      drawPill(ctx, '所持コイン', margin + 4, 116, panelWidth - 8, state.players.find(player => player.id === me.id)?.coins || 0);
      drawPageSubtabs(ctx, [['add', '追加'], ['return', 'ケースへ戻す']], selection.walletMode, page => { selection.walletMode = page; }, 151);
      if (selection.walletMode === 'add') {
        drawField(ctx, 'ケースから出す枚数', 'walletAdd', margin + 4, 197, half, { type: 'number', maxLength: 8 });
        drawButton(ctx, 'コインを受け取る', margin + 10 + half, 204, half, 34, () => dispatch({ type: 'add-wallet-coins', amount: fields.walletAdd }), 'gold');
      } else {
        drawField(ctx, 'ケースに戻す枚数', 'walletReturn', margin + 4, 197, half, { type: 'number', maxLength: 8 });
        drawButton(ctx, '指定数を戻す', margin + 10 + half, 204, half, 34, () => dispatch({ type: 'return-wallet-coins', amount: fields.walletReturn }), 'subtle');
        drawButton(ctx, '所持コインをすべて戻す', margin + 4, 240, panelWidth - 8, 19,
          () => requestConfirmation('所持コインをすべてコインケースに戻しますか？', () => dispatch({ type: 'return-all-wallet-coins' })), 'subtle');
      }
    } else if (selection.coinPage === 'table') {
      drawText(ctx, '場に出したコインは卓上をダブルクリックで回収できます。', margin + 4, 123, { size: 9, color: '#92a39b' });
      drawField(ctx, '卓に出す枚数（マイナス可）', 'tableCoins', margin + 4, 153, half, { type: 'number', maxLength: 8 });
      drawButton(ctx, '卓に出す', margin + 10 + half, 160, half, 34, () => dispatch({ type: 'place-coins', amount: fields.tableCoins, x: 50, y: 50 }));
    } else {
      const pot = state.gamePot || { amount: 0 };
      drawPill(ctx, '現在の賭け金', margin + 4, 116, panelWidth - 8, pot.amount, '#e1bb67');
      drawField(ctx, '賭ける枚数', 'bet', margin + 4, 151, half, { type: 'number', maxLength: 8 });
      const player = state.players.find(item => item.id === me.id);
      drawButton(ctx, '賭け金を出す', margin + 10 + half, 158, half, 34, () => dispatch({ type: 'add-bet', amount: fields.bet }), 'gold', Boolean(pot.locked || (player?.spectator && state.game?.status === 'playing') || (state.game?.mode === 'draw-poker' && state.game.status === 'playing')));
      drawText(ctx, pot.locked ? 'ゲーム終了後：精算が終わるまで次のゲームは開始できません。' : '賭け金はゲーム終了後にホストが精算します。', margin + 4, 224, { size: 9, color: '#92a39b', maxWidth: panelWidth - 8 });
    }
  } else if (selection.toolsPage === 'drawing') {
    drawButton(ctx, selection.drawingMode === 'pen' ? 'ペン ON' : 'ペン', margin + 4, 91, 115, 36, () => toggleDrawing('pen'));
    drawButton(ctx, selection.drawingMode === 'eraser' ? '消しゴム ON' : '消しゴム', margin + 128, 91, 135, 36, () => toggleDrawing('eraser'));
    drawField(ctx, '色（#RRGGBB）', 'drawColor', margin + 4, 146, 168, { maxLength: 7 });
    drawField(ctx, '太さ', 'drawWidth', margin + 184, 146, 100, { type: 'number', maxLength: 2 });
    drawButton(ctx, '描画をすべて消す（ホスト）', margin + 4, 211, panelWidth - 8, 34, () => requestConfirmation('描画をすべて消しますか？', () => dispatch({ type: 'clear-strokes' })), 'danger', !host);
  } else {
    drawText(ctx, `公開部屋一覧: ${state.publicListing ? '公開中' : '非公開'}`, margin + 5, 94, { size: 11, color: '#a8e8c6' });
    drawButton(ctx, state.publicListing ? '非公開にする' : '公開する', margin + 4, 104, 176, 34, () => dispatch({ type: 'set-public-listing', enabled: !state.publicListing }), 'secondary', !host);
    const pot = state.gamePot || { amount: 0 };
    drawText(ctx, `未精算の賭け金: ${pot.amount}枚${pot.locked ? '（精算まで次ゲーム不可）' : ''}`, margin + 5, 164, { size: 10, color: '#e1bb67' });
    if (host && state.game?.status === 'finished' && pot.amount > 0) {
      const ids = gamePlayerIdsForPot(state.game);
      const winners = ids.map(id => state.players.find(player => player.id === id)).filter(Boolean);
      const winner = winners.find(player => player.id === selection.potWinnerId) || winners.find(player => player.id === state.game.winnerId) || winners[0];
      if (winner && !selection.potWinnerId) selection.potWinnerId = winner.id;
      drawButton(ctx, `受取人: ${winner?.name || '選択'} ▾`, margin + 4, 177, 170, 32, () => {
        if (winners.length) selection.potWinnerId = winners[(winners.findIndex(player => player.id === selection.potWinnerId) + 1) % winners.length].id;
      }, 'secondary', !winner);
      drawButton(ctx, state.game.winners?.length > 1 ? '同点で分配' : '勝者へ渡す', margin + 182, 177, 100, 32, () => dispatch(state.game.winners?.length > 1 ? { type: 'settle-pot', winnerIds: state.game.winners } : { type: 'settle-pot', winnerId: selection.potWinnerId }), 'primary', !winner);
      drawButton(ctx, '返金', margin + 288, 177, 90, 32, () => dispatch({ type: 'settle-pot', refund: true }), 'subtle');
    }
  }
}

function gamePlayerIdsForPot(game) {
  if (game.mode === 'daifugu') return game.daifugu.players.map(player => player.roomPlayerId);
  return game.players.map(player => typeof player === 'string' ? player : player.id);
}

function drawGamePage(ctx, margin, panelWidth) {
  const game = selection.gameMode === 'mahjong' && state.mahjongGame
    ? { ...state.mahjongGame, mode: 'mahjong', status: state.mahjongGame.status || 'playing' }
    : state.game;
  const active = game?.status === 'playing';
  const currentMode = selection.gameMode;
  drawButton(ctx, `ゲーム: ${modeName(currentMode)} ▾`, margin + 2, 45, 153, 29, () => {
    const modes = ['daifugu', 'memory', 'old-maid', 'reversi', 'holdem', 'draw-poker', 'mahjong'];
    selection.gameMode = modes[(modes.indexOf(selection.gameMode) + 1) % modes.length];
  }, 'secondary', active || !host);
  drawButton(ctx, '開始', margin + 162, 45, 70, 29, () => dispatch({ type: 'start-game', mode: selection.gameMode }), 'primary', !host || active || Boolean(state.gamePot?.locked));
  if (active) drawButton(ctx, '終了', margin + 239, 45, 70, 29, () => requestConfirmation('ゲームを終了しますか？', () => dispatch({ type: 'end-game' })), 'danger', !host);
  if (!game) {
    if (currentMode === 'mahjong') {
      drawText(ctx, '4人で遊ぶリーチ麻雀。ホストが牌山を準備して局を開始します。', margin + 4, 98, { size: 10, color: '#92a39b', maxWidth: panelWidth - 8 });
      drawButton(ctx, '牌山を作る · 136枚', margin + 4, 130, 175, 36, () => dispatch({ type: 'add-mahjong-wall' }), 'secondary', !host);
      const wallCount = state.mahjongTiles.filter(tile => tile.zone === 'wall').length;
      drawButton(ctx, '四人で配牌して開始', margin + 190, 130, 178, 36, () => dispatch({ type: 'start-mahjong-round' }), 'primary', !host || state.players.length !== 4 || wallCount !== 136);
      drawText(ctx, `牌山 ${wallCount}枚 · 参加者 ${state.players.length}/4人`, margin + 4, 190, { size: 10, color: '#a8e8c6' });
      drawText(ctx, '麻雀の手牌と河はテーブル上に表示されます。', margin + 4, 218, { size: 10, color: '#92a39b' });
    } else {
      drawText(ctx, 'ゲームを選んで開始してください。', margin + 4, 112, { size: 11, color: '#92a39b' });
      drawText(ctx, '大富豪 · 神経衰弱 · ババ抜き · リバーシ · ホールデム · ドロー · 麻雀', margin + 4, 136, { size: 9, color: '#a8e8c6', maxWidth: panelWidth - 8 });
    }
    return;
  }
  if (game.mode === 'mahjong') { drawMahjongGamePage(ctx, margin, panelWidth, game); return; }
  if (game.mode === 'reversi') { drawReversiGame(ctx, margin, panelWidth, game, active); return; }
  if (game.mode === 'holdem' || game.mode === 'draw-poker') { drawPokerGame(ctx, margin, panelWidth, game, active); return; }
  if (game.mode === 'memory') drawMemoryCompact(ctx, margin, panelWidth, game, active);
  else if (game.mode === 'old-maid') drawOldMaidCompact(ctx, margin, panelWidth, game, active);
  else drawDaifuguCompact(ctx, margin, panelWidth, game, active);
}

function drawMemoryCompact(ctx, margin, panelWidth, game, active) {
  const cols = 13;
  const gap = 3;
  const width = Math.floor((panelWidth - gap * (cols - 1) - 12) / cols);
  const height = Math.min(31, Math.floor(width * 1.22));
  const x = margin + 6;
  const y = 86;
  game.board.forEach((card, index) => {
    const cx = x + (index % cols) * (width + gap);
    const cy = y + Math.floor(index / cols) * (height + gap);
    const visible = card.faceUp || card.matched;
    drawCard(ctx, { ...card, faceUp: visible }, cx, cy, width, height,
      active && !card.matched && !card.faceUp && !game.pendingMismatch && game.players[game.current] === me.id
        ? () => dispatch({ type: 'game-action', gameAction: 'flip', cardId: card.id })
        : null,
      card.matched);
  });
  if (game.pendingMismatch && game.players[game.current] === me.id) {
    drawButton(ctx, '次の人へ', 306, 231, 76, 24, () => dispatch({ type: 'game-action', gameAction: 'continue' }), 'primary');
  } else {
    const scores = game.players.map(id => `${state.players.find(player => player.id === id)?.name || 'PLAYER'} ${game.scores[id] || 0}`).join(' · ');
    drawText(ctx, scores, x, 234, { size: 8, color: '#92a39b', maxWidth: panelWidth - 12 });
  }
  drawText(ctx, game.message || '', x, 248, { size: 8, color: '#a8e8c6', maxWidth: panelWidth - 12 });
}

function drawDaifuguCompact(ctx, margin, panelWidth, game, active) {
  const snapshot = game.daifugu;
  const own = snapshot.players.find(player => player.roomPlayerId === me.id);
  const isTurn = snapshot.players[snapshot.current]?.roomPlayerId === me.id;
  if (snapshot.finished) {
    const placements = snapshot.placements?.map((id, index) => `${index + 1}位 ${snapshot.players[id]?.name || ''}`).join(' · ');
    drawText(ctx, placements || 'ゲーム終了', margin + 4, 112, { size: 11, color: '#e1bb67', maxWidth: panelWidth - 8 });
    drawText(ctx, snapshot.logs?.[0] || '', margin + 4, 142, { size: 9, color: '#92a39b', maxWidth: panelWidth - 8 });
    return;
  }
  drawText(ctx, `${snapshot.players[snapshot.current]?.name || '—'}の番${snapshot.revolution ? ' · 革命' : ''} ${snapshot.field?.cards?.map(card => card.joker ? 'J' : `${card.suit}${card.rank}`).join(' ') || ''}`, margin + 4, 91, {
    size: 9, color: '#a8e8c6', maxWidth: panelWidth - 8
  });
  if (!own?.hand) {
    drawText(ctx, '観戦中、または手札を同期中です。', margin + 4, 125, { size: 10, color: '#92a39b' });
    return;
  }
  const columns = 7;
  const rowHeight = 67;
  const contentHeight = Math.ceil(own.hand.length / columns) * rowHeight + 12;
  gameHandScrollArea.configure({
    x: margin + 4, y: 103, width: panelWidth - 16, height: 190, contentHeight
  });
  const firstTarget = layoutTargets.length;
  gameHandScrollArea.draw(ctx, () => own.hand.forEach((card, index) => {
    const x = margin + 8 + (index % columns) * 48;
    const y = 110 + Math.floor(index / columns) * rowHeight;
    drawCard(ctx, { ...card, faceUp: true }, x, y, 42, 58, active && isTurn ? () => {
      selection.selectedCards.has(card.id) ? selection.selectedCards.delete(card.id) : selection.selectedCards.add(card.id);
    } : null, selection.selectedCards.has(card.id));
  }));
  layoutTargets.slice(firstTarget).forEach(target => { target.y -= gameHandScrollArea.offset; });
  layoutTargets = layoutTargets.filter((target, index) => index < firstTarget ||
    (target.y + target.height >= gameHandScrollArea.y && target.y <= gameHandScrollArea.y + gameHandScrollArea.height));
  if (active && isTurn && !snapshot.pending) {
    drawButton(ctx, '選択を出す', margin + 4, 305, 132, 30, () => {
      const cards = own.hand.filter(card => selection.selectedCards.has(card.id)).map(card => card.joker
        ? { id: card.id, assignedRank: selection.jokerRank, assignedSuit: selection.jokerSuit } : { id: card.id });
      if (!cards.length) return notify('出すカードを選んでください。');
      dispatch({ type: 'game-action', action: { type: 'play', cards } });
      selection.selectedCards.clear();
    }, 'primary', selection.selectedCards.size === 0);
    drawButton(ctx, 'パス', margin + 143, 305, 70, 30, () => dispatch({ type: 'game-action', action: { type: 'pass' } }));
  } else if (active && isTurn && snapshot.pending) {
    const pending = snapshot.pending;
    let confirmY = 343;
    if (pending.type === 'threshold') {
      drawButton(ctx, `J効果: ${selection.effectDirection === 'over' ? '上' : '下'} ▾`, margin + 4, 305, 142, 30, () => {
        selection.effectDirection = selection.effectDirection === 'over' ? 'under' : 'over';
      });
    } else if (pending.type === 'give') {
      const targets = snapshot.players.filter(player => player.roomPlayerId !== me.id && (player.handCount || player.hand?.length));
      const target = targets.find(player => player.id === selection.effectTarget) || targets[0];
      if (target && !selection.effectTarget) selection.effectTarget = target.id;
      drawButton(ctx, `渡す相手: ${target?.name || '選択'} ▾`, margin + 4, 305, 170, 30, () => {
        if (targets.length) selection.effectTarget = targets[(targets.findIndex(player => player.id === selection.effectTarget) + 1) % targets.length].id;
      }, 'secondary', !target);
    } else if (pending.type === 'q') {
      drawField(ctx, '捨てる数字（例: 3,7）', 'effect', margin + 4, 300, 210, { maxLength: 32 });
      confirmY = 350;
    } else {
      drawText(ctx, '効果に使うカードを選択してください。', margin + 4, 305, { size: 9, color: '#e1bb67' });
    }
    drawButton(ctx, '効果を確定', margin + 226, confirmY, 108, 30, () => {
      const choice = {};
      if (pending.type === 'threshold') choice.direction = selection.effectDirection;
      if (pending.type === 'give') choice.targetId = selection.effectTarget;
      if (pending.type === 'give' || pending.type === 'discard') {
        choice.cardIds = own.hand.filter(card => selection.selectedCards.has(card.id)).map(card => card.id);
      }
      if (pending.type === 'q') choice.ranks = fields.effect.split(',').map(rank => rank.trim()).filter(Boolean);
      dispatch({ type: 'game-action', action: { type: 'effect', choice } });
      selection.selectedCards.clear();
    }, 'primary');
  }
  if (!snapshot.pending && own.hand.some(card => card.joker && selection.selectedCards.has(card.id))) {
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    const suits = ['♠', '♥', '♦', '♣'];
    drawButton(ctx, `J:${selection.jokerRank}`, margin + 4, 343, 76, 24, () => selection.jokerRank = ranks[(ranks.indexOf(selection.jokerRank) + 1) % ranks.length]);
    drawButton(ctx, selection.jokerSuit, margin + 86, 343, 50, 24, () => selection.jokerSuit = suits[(suits.indexOf(selection.jokerSuit) + 1) % suits.length]);
  }
  drawText(ctx, snapshot.message || '', margin + 4, 386, { size: 9, color: '#92a39b', maxWidth: panelWidth - 8 });
}

function drawOldMaidCompact(ctx, margin, panelWidth, game, active) {
  const own = game.players.find(player => player.id === me.id);
  const current = game.players[game.current];
  drawText(ctx, `${current?.name || '—'}の番 · ${game.message || ''}`, margin + 4, 91, { size: 9, color: '#a8e8c6', maxWidth: panelWidth - 8 });
  if (own) {
    const columns = 7;
    const rowHeight = 67;
    gameHandScrollArea.configure({
      x: margin + 4, y: 103, width: panelWidth - 16, height: 80,
      contentHeight: Math.ceil(own.hand.length / columns) * rowHeight + 12
    });
    const firstTarget = layoutTargets.length;
    gameHandScrollArea.draw(ctx, () => own.hand.forEach((card, index) => drawCard(
      ctx, card, margin + 8 + (index % columns) * 48, 110 + Math.floor(index / columns) * rowHeight, 42, 58
    )));
    layoutTargets.slice(firstTarget).forEach(target => { target.y -= gameHandScrollArea.offset; });
    layoutTargets = layoutTargets.filter((target, index) => index < firstTarget ||
      (target.y + target.height >= gameHandScrollArea.y && target.y <= gameHandScrollArea.y + gameHandScrollArea.height));
  }
  if (active && current?.id === me.id) {
    const index = game.players.findIndex(player => player.id === me.id);
    const opponent = game.players.slice(index + 1).concat(game.players.slice(0, index)).find(player => player.hand.length);
    if (opponent) {
      drawText(ctx, `${opponent.name}から1枚引く`, margin + 4, 193, { size: 9, color: '#e1bb67' });
      const pageSize = 8;
      const first = selection.oldMaidTargetPage * pageSize;
      opponent.hand.slice(first, first + pageSize).forEach((card, cardIndex) => drawCard(ctx, { faceUp: false }, margin + 4 + cardIndex * 30, 203, 24, 34,
        () => dispatch({ type: 'game-action', gameAction: 'draw', cardId: card.id })));
      if (opponent.hand.length > pageSize) drawButton(ctx, '次のカード', margin + 250, 207, 84, 26, () => selection.oldMaidTargetPage = (selection.oldMaidTargetPage + 1) % Math.ceil(opponent.hand.length / pageSize), 'subtle');
    }
  }
}

function drawCardsPage(ctx, margin, panelWidth) {
  drawPageSubtabs(ctx, [['hand', '手札'], ['decks', '箱'], ['deal', '配る']], selection.cardsPage, page => { selection.cardsPage = page; });
  if (selection.cardsPage === 'hand') {
    const cards = state.cards.filter(card => card.zone === 'hand' && card.ownerId === me.id);
    drawText(ctx, `手札 ${cards.length}枚 · スクロールして選択`, margin + 4, 88, { size: 11, color: '#a8e8c6', maxWidth: panelWidth - 8 });
    const columns = 6;
    const rowHeight = 82;
    const area = { x: margin + 4, y: 97, width: panelWidth - 16, height: 338 };
    handScrollArea.configure({
      ...area,
      contentHeight: Math.ceil(cards.length / columns) * rowHeight + 12
    });
    const firstTarget = layoutTargets.length;
    handScrollArea.draw(ctx, () => cards.forEach((card, index) => drawCard(
      ctx,
      { ...card, faceUp: true },
      area.x + 8 + (index % columns) * 58,
      area.y + 8 + Math.floor(index / columns) * rowHeight,
      50,
      68,
      () => dispatch({ type: 'play-card', cardId: card.id, x: 50, y: 50 })
    )));
    layoutTargets.slice(firstTarget).forEach(target => { target.y -= handScrollArea.offset; });
    layoutTargets = layoutTargets.filter((target, index) => index < firstTarget ||
      (target.y + target.height >= area.y && target.y <= area.y + area.height));
  } else if (selection.cardsPage === 'decks') {
    drawButton(ctx, '＋ トランプ箱を追加', margin + 4, 88, 180, 32, () => dispatch({ type: 'add-deck' }), 'primary', state.decks.length >= 2);
    drawButton(ctx, '全回収して箱に戻す', margin + 194, 88, 184, 32, () => dispatch({ type: 'collect-all-cards' }), 'subtle', !state.decks.length);
    state.decks.forEach((deck, index) => {
      const rowY = 132 + index * 48;
      const count = state.cards.filter(card => card.deckId === deck.id && card.zone === 'deck').length;
      drawButton(ctx, `箱 ${deck.index}から引く · ${count}/52`, margin + 4, rowY, 235, 34, () => dispatch({ type: 'draw-card', deckId: deck.id }), 'secondary', !count);
      drawButton(ctx, '削除', margin + 247, rowY, 72, 34, () => requestConfirmation(`箱 ${deck.index}を削除しますか？`, () => dispatch({ type: 'remove-deck', deckId: deck.id })), 'danger');
    });
    drawText(ctx, '箱は最大2つ。カードを引くと自分の手札に入ります。', margin + 4, 237, { size: 9, color: '#92a39b' });
  } else {
    const deckIndex = Math.min(Number(fields.selectedDeckIndex || 0), Math.max(0, state.decks.length - 1));
    const deck = state.decks[deckIndex];
    drawButton(ctx, `対象: ${deck ? `箱 ${deck.index}` : '箱なし'} ▾`, margin + 4, 88, 175, 31, () => {
      if (state.decks.length > 1) fields.selectedDeckIndex = String((deckIndex + 1) % state.decks.length);
    }, 'secondary', !deck);
    drawButton(ctx, `配り方: ${selection.dealMode === 'even' ? '均等' : '枚数指定'}`, margin + 188, 88, 190, 31, () => selection.dealMode = selection.dealMode === 'even' ? 'each' : 'even');
    drawField(ctx, '除外ランク', 'excludeRanks', margin + 4, 132, 175);
    drawField(ctx, '箱に残す枚数', 'dealReserve', margin + 188, 132, 190, { type: 'number', maxLength: 3 });
    if (selection.dealMode === 'each') drawField(ctx, '1人あたり', 'dealPerPlayer', margin + 4, 188, 175, { type: 'number', maxLength: 3 });
    drawButton(ctx, '全員に配る', margin + 188, 194, 190, 34, () => dispatch({
      type: 'deal', deckId: deck?.id, mode: selection.dealMode, perPlayer: fields.dealPerPlayer,
      reserve: fields.dealReserve, excludeRanks: fields.excludeRanks
    }), 'primary', !deck);
  }
}

function drawMahjongPage(ctx, margin, panelWidth) {
  const wallCount = state.mahjongTiles.filter(tile => tile.zone === 'wall').length;
  const game = state.mahjongGame;
  const hand = sortMahjongTiles(state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === me.id));
  if (!game) {
    drawText(ctx, `牌山 ${wallCount}枚 · 参加者 ${state.players.length}/4人`, margin + 4, 89, { size: 11, color: '#a8e8c6' });
    drawButton(ctx, '牌山を作る · 136枚', margin + 4, 112, 175, 36, () => dispatch({ type: 'add-mahjong-wall' }), 'secondary');
    drawButton(ctx, '四人で配牌して開始', margin + 190, 112, 178, 36, () => dispatch({ type: 'start-mahjong-round' }), 'primary',
      !host || state.players.length !== 4 || wallCount !== 136);
    drawText(ctx, '親14枚・子13枚で配り、右側の卓に手牌と河を表示します。', margin + 4, 178, {
      size: 11, color: '#dce7df', maxWidth: panelWidth - 8
    });
    drawText(ctx, '手牌を選択 → 捨てる ／ 河の牌を選択 → チー・ポン・カン', margin + 4, 202, {
      size: 10, color: '#92a39b', maxWidth: panelWidth - 8
    });
    return;
  }
  const currentPlayer = state.players.find(player => player.id === game.currentPlayerId);
  drawText(ctx, `${game.message} · 牌山 ${game.liveWallRemaining}枚`, margin + 4, 88, {
    size: 11, color: '#a8e8c6', maxWidth: panelWidth - 8
  });
  drawText(ctx, `選択中 ${selection.selectedMahjongTileIds.size}枚 · 河の牌 ${selection.selectedMahjongDiscardId ? '選択済み' : '未選択'}`,
    margin + 4, 110, { size: 10, color: '#e1bb67', maxWidth: panelWidth - 8 });
  const ownTurn = currentPlayer?.id === me.id;
  const lastDiscard = state.mahjongTiles.find(tile => tile.id === game.lastDiscardId);
  const canCall = game.phase === 'draw' && lastDiscard && lastDiscard.ownerId !== me.id;
  const canChi = canCall &&
    game.playerIds[(game.playerIds.indexOf(lastDiscard.ownerId) + 1) % game.playerIds.length] === me.id;
  drawButton(ctx, '牌山から引く', margin + 4, 128, 112, 34, () => {
    if (dispatch({ type: 'draw-mahjong-tile' })) {
      selection.selectedMahjongTileIds.clear();
      selection.selectedMahjongDiscardId = null;
    }
  }, 'gold',
    !ownTurn || game.phase !== 'draw' || game.liveWallRemaining === 0);
  drawButton(ctx, '選択牌を捨てる', margin + 124, 128, 128, 34, () => {
    if (selection.selectedMahjongTileIds.size !== 1) return notify('捨てる牌を1枚選んでください。');
    const [tileId] = selection.selectedMahjongTileIds;
    if (dispatch({ type: 'discard-mahjong-tile', tileId })) {
      selection.selectedMahjongTileIds.clear();
      selection.selectedMahjongDiscardId = null;
    }
  }, 'primary', !ownTurn || game.phase !== 'discard' || selection.selectedMahjongTileIds.size !== 1);
  const calledTileSelected = selection.selectedMahjongDiscardId === game.lastDiscardId;
  drawButton(ctx, 'チー', margin + 4, 172, 78, 32, () => callMahjongMeld('chi'), 'secondary',
    !canChi || !calledTileSelected || selection.selectedMahjongTileIds.size !== 2);
  drawButton(ctx, 'ポン', margin + 88, 172, 78, 32, () => callMahjongMeld('pon'), 'secondary',
    !canCall || !calledTileSelected || selection.selectedMahjongTileIds.size !== 2);
  drawButton(ctx, 'カン', margin + 172, 172, 78, 32, () => callMahjongMeld('kan'), 'secondary',
    !canCall || !game.rinshanRemaining || !calledTileSelected || selection.selectedMahjongTileIds.size !== 3);
  drawText(ctx, '卓上の自分の手牌をクリックして選択。捨て牌をクリックして鳴きます。', margin + 4, 226, {
    size: 9, color: '#92a39b', maxWidth: panelWidth - 8
  });
  drawButton(ctx, '局をリセット（ホスト）', margin + 4, 252, panelWidth - 8, 30, () => {
    requestConfirmation('現在の麻雀局をリセットしますか？', () => dispatch({ type: 'reset-mahjong-round' }));
  }, 'danger', !host);
}

function sortMahjongTiles(tiles) {
  const suitOrder = { man: 0, pin: 1, sou: 2, ji: 3 };
  return [...tiles].sort((a, b) => suitOrder[a.suit] - suitOrder[b.suit] || a.rank - b.rank || Number(b.red) - Number(a.red));
}

function callMahjongMeld(kind) {
  if (!selection.selectedMahjongDiscardId) return notify('河から鳴く牌を選んでください。');
  if (!dispatch({
    type: 'call-mahjong-meld',
    kind,
    tileIds: [...selection.selectedMahjongTileIds],
    calledTileId: selection.selectedMahjongDiscardId
  })) return;
  selection.selectedMahjongTileIds.clear();
  selection.selectedMahjongDiscardId = null;
}

function drawMahjongRound(ctx, table) {
  const game = state.mahjongGame;
  if (!game) return;
  const { playerIds } = game;
  const selfIndex = playerIds.indexOf(me.id);
  const locations = ['bottom', 'right', 'top', 'left'];
  const rivers = state.mahjongTiles.filter(tile => tile.zone === 'river');
  const melds = new Map();
  state.mahjongTiles.filter(tile => tile.zone === 'meld').forEach(tile => {
    const group = melds.get(tile.meldId) || [];
    group.push(tile);
    melds.set(tile.meldId, group);
  });
  const riverLayout = {
    top: { x: table.x + 174, y: table.y + 56, columns: 6 },
    bottom: { x: table.x + 174, y: table.y + table.height - 190, columns: 6 },
    left: { x: table.x + 58, y: table.y + 148, columns: 3 },
    right: { x: table.x + table.width - 127, y: table.y + 148, columns: 3 }
  };
  const tileWidth = 21;
  const tileHeight = 29;
  const gap = 2;
  playerIds.forEach((playerId, index) => {
    const offset = (index - selfIndex + playerIds.length) % playerIds.length;
    const location = locations[offset];
    const player = state.players.find(item => item.id === playerId);
    const playerHand = state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === playerId);
    const handCount = playerHand.length;
    const name = player?.name || 'PLAYER';
    if (location === 'bottom') {
      drawText(ctx, `${name} · 手牌 ${handCount}`, table.x + 12, table.y + table.height - 16, { size: 9, color: '#f0dfa1' });
      sortMahjongTiles(playerHand).forEach((tile, tileIndex) => {
        const x = table.x + 12 + tileIndex * 27;
        const y = table.y + table.height - 56;
        const selected = selection.selectedMahjongTileIds.has(tile.id);
        drawMahjongTile(ctx, tile, x, y - (selected ? 7 : 0), 25, 35,
          selection.page === 'mahjong' ? () => {
            if (selected) selection.selectedMahjongTileIds.delete(tile.id);
            else selection.selectedMahjongTileIds.add(tile.id);
            safeRender();
          } : null, selected);
      });
    } else {
      const hiddenCount = Math.min(handCount, 13);
      drawText(ctx, `${name} · 手牌 ${handCount}`,
        location === 'right' ? table.x + table.width - 232 : location === 'left' ? table.x + 132 : table.x + 12,
        location === 'top' ? table.y + 14 : location === 'left' ? table.y + 138 : table.y + 138,
        { size: 8, color: '#dce7df', maxWidth: 100 });
      if (location === 'top') {
        for (let i = 0; i < hiddenCount; i += 1) drawMahjongBack(ctx, table.x + 178 + i * 12, table.y + 18, 10, 15);
      } else {
        const x = location === 'left' ? table.x + 6 : table.x + table.width - 17;
        for (let i = 0; i < hiddenCount; i += 1) drawMahjongBack(ctx, x, table.y + 165 + i * 17, 11, 15);
      }
    }
    const river = rivers.filter(tile => tile.ownerId === playerId).sort((a, b) => a.riverIndex - b.riverIndex);
    const layout = riverLayout[location];
    river.forEach((tile, tileIndex) => {
      const col = tileIndex % layout.columns;
      const row = Math.floor(tileIndex / layout.columns);
      const x = layout.x + col * (tileWidth + gap);
      const y = layout.y + row * (tileHeight + gap);
      const selected = selection.selectedMahjongDiscardId === tile.id;
      drawMahjongTile(ctx, tile, x, y, tileWidth, tileHeight,
        selection.page === 'mahjong' && tile.id === game.lastDiscardId ? () => {
        selection.selectedMahjongDiscardId = selected ? null : tile.id;
        safeRender();
      } : null, selected);
    });
    const ownerMelds = [...melds.values()].filter(group => group[0].ownerId === playerId);
    const meldOrigin = location === 'right'
      ? { x: table.x + table.width - 42, y: table.y + 60 }
      : location === 'bottom'
        ? { x: table.x + 12, y: table.y + 245 }
        : { x: table.x + 12, y: table.y + (location === 'left' ? 60 : 36) };
    ownerMelds.forEach((group, groupIndex) => {
      group.sort((a, b) => Number(a.called) - Number(b.called));
      group.forEach((tile, tileIndex) => {
        const x = meldOrigin.x + tileIndex * 12;
        const y = meldOrigin.y + groupIndex * 22;
        drawMahjongTile(ctx, tile, x, y, 15, 22);
      });
    });
  });
  const dealer = state.players.find(player => player.id === game.dealerId);
  drawText(ctx, `親: ${dealer?.name || '—'} · ${game.liveWallRemaining}枚`, table.x + table.width / 2 - 42,
    table.y + table.height / 2, { size: 10, color: '#f0dfa1', maxWidth: 110 });
}

function drawMahjongTile(ctx, tile, x, y, width, height, action = null, selected = false) {
  drawImage(ctx, `../pai-images/pai-images/${tile.asset}-66-90-s.png`, x, y, width, height);
  if (selected) {
    ctx.strokeStyle = '#ffd86b';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
  }
  if (action) addTarget({ x, y, width, height, type: 'button', action, label: '麻雀牌' });
}

function drawMahjongBack(ctx, x, y, width, height) {
  roundedRect(ctx, x, y, width, height, 2);
  ctx.fillStyle = '#d9d0b6';
  ctx.fill();
  roundedRect(ctx, x + 2, y + 2, width - 4, height - 4, 2);
  ctx.fillStyle = '#287151';
  ctx.fill();
}

function drawChatPage(ctx, margin, panelWidth) {
  drawPageSubtabs(ctx, [['room', '全体'], ['direct', '個別']], selection.chatPage, page => { selection.chatPage = page; });
  const messages = selection.chatPage === 'room' ? chatMessages : privateMessages;
  const visible = messages.slice(-(selection.chatPage === 'room' ? 4 : 3));
  visible.forEach((message, index) => {
    const label = selection.chatPage === 'room' ? message.name : message.label;
    const y = selection.chatPage === 'room' ? 93 + index * 25 : 119 + index * 25;
    drawText(ctx, `${label}: ${message.text}`, margin + 5, y, { size: 10, color: '#dce7df', maxWidth: panelWidth - 10 });
  });
  if (selection.chatPage === 'room') {
    drawField(ctx, 'メッセージ', 'chat', margin + 4, 205, panelWidth - 94, { maxLength: 500, placeholder: 'Enterで送信' });
    drawButton(ctx, '送信', margin + panelWidth - 78, 212, 74, 30, sendChat, 'primary');
  } else {
    const others = (room?.members || state.players).filter(person => person.id !== me.id);
    const recipient = others.find(person => person.id === selection.recipientId) || others[0];
    if (recipient && !selection.recipientId) selection.recipientId = recipient.id;
    drawButton(ctx, `送信先: ${recipient ? participantName(recipient) : '相手なし'} ▾`, margin + 4, 83, panelWidth - 8, 26, () => {
      if (others.length) selection.recipientId = others[(others.findIndex(person => person.id === selection.recipientId) + 1) % others.length].id;
    }, 'secondary', !recipient);
    drawField(ctx, '個別メッセージ', 'directChat', margin + 4, 205, panelWidth - 94, { maxLength: 500 });
    drawButton(ctx, '送信', margin + panelWidth - 78, 212, 74, 30, sendPrivateChat, 'primary', !recipient);
  }
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
  drawPill(ctx, 'あなたの所持コイン', innerX, top - 2, innerW, state?.players.find(player => player.id === me.id)?.coins || 0);
  top += 34;
  drawField(ctx, '賭け金', 'bet', innerX, top, half, { type: 'number', maxLength: 8 });
  const myPlayer = state.players.find(player => player.id === me.id);
  const blockedBet = Boolean(state.gamePot?.locked || (myPlayer?.spectator && state.game?.status === 'playing') || (state.game?.mode === 'draw-poker' && state.game.status === 'playing'));
  drawButton(ctx, '賭け金を出す', innerX, top + 52, half, 34, () => dispatch({ type: 'add-bet', amount: fields.bet }), 'gold', blockedBet);
  drawPill(ctx, 'ゲームの賭け金', innerX + half + gap, top + 8, half, state.gamePot?.amount || 0);
  if (host && state.game?.status === 'finished' && state.gamePot?.amount > 0) {
    const participants = gamePlayerIdsForPot(state.game);
    const winners = participants.map(id => state.players.find(player => player.id === id)).filter(Boolean);
    const winner = winners.find(player => player.id === selection.potWinnerId) || winners.find(player => player.id === state.game.winnerId) || winners[0];
    if (winner && !selection.potWinnerId) selection.potWinnerId = winner.id;
    drawButton(ctx, `受取人: ${winner?.name || '選択'}  ▾`, innerX + half + gap, top + 50, half, 34, () => {
      if (!winners.length) return;
      const index = winners.findIndex(player => player.id === selection.potWinnerId);
      selection.potWinnerId = winners[(index + 1) % winners.length].id;
    }, 'secondary', !winner);
    drawButton(ctx, state.game.winners?.length > 1 ? '同点で分配' : '勝者へ渡す', innerX, top + 96, half, 34, () => dispatch(state.game.winners?.length > 1 ? { type: 'settle-pot', winnerIds: state.game.winners } : { type: 'settle-pot', winnerId: selection.potWinnerId }), 'primary', !winner);
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
  return ({ daifugu: '大富豪', memory: '神経衰弱', 'old-maid': 'ババ抜き', reversi: 'リバーシ', holdem: 'テキサスホールデム', 'draw-poker': 'ドローポーカー', mahjong: '麻雀' })[mode] || mode;
}

function drawPokerGame(ctx, margin, panelWidth, game, active) {
  const own=game.hands[me.id]||[], myTurn=game.players[game.current]===me.id;
  drawText(ctx, `${game.variant} · ${game.message}`, margin+4, 89, {size:10,color:'#a8e8c6',maxWidth:panelWidth-8});
  drawText(ctx, game.mode==='holdem' ? `ポット ${game.pot} · チップ ${game.chips[me.id] ?? '観戦'} · ${game.round}` : `交換 ${game.current}/${game.players.length}人 · 山札 ${game.deckCount ?? game.deck.length}枚`, margin+4, 111, {size:10,color:'#dce7df'});
  let x=margin+8;
  if(game.mode==='holdem'){
    drawText(ctx,'コミュニティカード',margin+4,142,{size:9,color:'#92a39b'});
    game.community.forEach(card=>{drawCard(ctx,{...card,faceUp:true},x,150,38,54);x+=42;});
    x=margin+8;drawText(ctx,'あなたの手札',margin+4,229,{size:9,color:'#92a39b'});
    own.forEach(card=>{drawCard(ctx,{...card,faceUp:true},x,236,48,68);x+=54;});
    if(active&&myTurn){const owed=Math.max(0,game.toCall-game.contrib[me.id]);
      drawButton(ctx,'フォールド',margin+4,322,88,30,()=>dispatch({type:'poker-action',action:{kind:'fold'}}),'danger');
      drawButton(ctx,owed?'コール':'チェック',margin+98,322,90,30,()=>dispatch({type:'poker-action',action:{kind:owed?'call':'check'}}),'primary');
      drawButton(ctx,'レイズ +20',margin+194,322,104,30,()=>dispatch({type:'poker-action',action:{kind:'raise',amount:20}}),'gold',game.chips[me.id]<owed+20);
    }
  } else {
    drawCard(ctx,{faceUp:false},margin+8,142,42,61);
    drawText(ctx,`DECK (${game.deckCount ?? game.deck.length})`,margin+5,218,{size:9,color:'#dce7df'});
    drawText(ctx,'DISCARD',margin+76,136,{size:9,color:'#dce7df'});
    game.discarded.slice(-5).forEach((card,index)=>drawCard(ctx,{...card,faceUp:true},margin+76+index*24,142,40,58));
    drawText(ctx,myTurn?'手札を選択して交換':'手札',margin+4,237,{size:9,color:myTurn?'#e1bb67':'#92a39b'});
    own.forEach(card=>{drawCard(ctx,{...card,faceUp:true},x,245,48,68,active&&myTurn?()=>selection.selectedCards.has(card.id)?selection.selectedCards.delete(card.id):selection.selectedCards.add(card.id):null,selection.selectedCards.has(card.id));x+=53;});
    if(active&&myTurn){
      const unavailable=selection.selectedCards.size>(game.deckCount ?? game.deck.length);
      drawButton(ctx,`選択カードを交換 (${selection.selectedCards.size}枚)`,margin+4,326,194,32,()=>{if(dispatch({type:'poker-action',action:{kind:'draw',cardIds:[...selection.selectedCards]}}))selection.selectedCards.clear();},'primary',unavailable);
      drawText(ctx,unavailable?'山札の残り枚数以内で選んでください。':'交換なしで進む場合は選択を空にして交換ボタンを押します。',margin+4,374,{size:8,color:unavailable?'#ffb3a8':'#92a39b',maxWidth:panelWidth-8});
    }
  }
  if(game.mode==='draw-poker') {
    const roster=game.players.map((id,index)=>`${state.players.find(p=>p.id===id)?.name||'Player'}${game.status==='finished'?` · ${game.handRanks?.[id]||'—'}${game.winners?.includes(id)?' ★':''}`:game.exchanged.includes(id)?' · 交換済':index===game.current?' · 手番':''}`).join(' / ');
    drawText(ctx,roster,margin+4,394,{size:8,color:'#92a39b',maxWidth:panelWidth-8});
  } else drawText(ctx,game.players.map(id=>`${state.players.find(p=>p.id===id)?.name||'Player'} ${game.chips[id]}${game.folded.includes(id)?' (fold)':''}`).join(' · '),margin+4,373,{size:9,color:'#92a39b',maxWidth:panelWidth-8});
}

function drawMahjongGamePage(ctx, margin, panelWidth, game) {
  const own = state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === me.id);
  const current = game.currentPlayerId === me.id;
  drawText(ctx, game.message || '', margin + 4, 94, { size: 10, color: '#a8e8c6', maxWidth: panelWidth - 8 });
  drawText(ctx, `手牌 ${own.length}枚 · 残り ${game.liveWallRemaining}枚 · ${game.phase === 'draw' ? 'ツモ番' : '打牌番'}`, margin + 4, 119, { size: 10, color: '#dce7df' });
  if (game.status === 'finished') {
    drawButton(ctx, '次局の準備（ホスト）', margin + 4, 144, 180, 32, () => dispatch({ type: 'reset-mahjong-round' }), 'secondary', !host);
    drawText(ctx, '牌山を作り直して次の局を開始できます。', margin + 4, 194, { size: 9, color: '#92a39b' }); return;
  }
  drawButton(ctx, '牌山から引く', margin + 4, 141, 112, 31, () => dispatch({ type: 'draw-mahjong-tile' }), 'gold', !current || game.phase !== 'draw' || !game.liveWallRemaining);
  drawButton(ctx, '選択牌を捨てる', margin + 124, 141, 128, 31, () => {
    if (selection.selectedMahjongTileIds.size !== 1) return notify('捨てる牌を1枚選んでください。');
    const [tileId] = selection.selectedMahjongTileIds; if (dispatch({ type: 'discard-mahjong-tile', tileId })) selection.selectedMahjongTileIds.clear();
  }, 'primary', !current || game.phase !== 'discard' || selection.selectedMahjongTileIds.size !== 1);
  drawButton(ctx, 'ツモ', margin + 260, 141, 54, 31, () => dispatch({ type: 'mahjong-win', kind: 'tsumo' }), 'gold', !current || game.phase !== 'discard');
  drawButton(ctx, 'ロン', margin + 320, 141, 54, 31, () => dispatch({ type: 'mahjong-win', kind: 'ron' }), 'primary', !game.lastDiscardId || current);
  const lastDiscard = state.mahjongTiles.find(tile => tile.id === game.lastDiscardId);
  const called = selection.selectedMahjongDiscardId === game.lastDiscardId;
  const canCall = game.phase === 'draw' && lastDiscard && lastDiscard.ownerId !== me.id;
  const canChi = canCall && game.playerIds[(game.playerIds.indexOf(lastDiscard.ownerId) + 1) % game.playerIds.length] === me.id;
  drawButton(ctx, 'チー', margin + 4, 181, 72, 28, () => callMahjongMeld('chi'), 'secondary', !canChi || !called || selection.selectedMahjongTileIds.size !== 2);
  drawButton(ctx, 'ポン', margin + 82, 181, 72, 28, () => callMahjongMeld('pon'), 'secondary', !canCall || !called || selection.selectedMahjongTileIds.size !== 2);
  drawButton(ctx, 'カン', margin + 160, 181, 72, 28, () => callMahjongMeld('kan'), 'secondary', !canCall || !called || selection.selectedMahjongTileIds.size !== 3);
  drawButton(ctx, '局をリセット', margin + 240, 181, 120, 28, () => requestConfirmation('現在の麻雀局をリセットしますか？', () => dispatch({ type: 'reset-mahjong-round' })), 'danger', !host);
}

function drawReversiGame(ctx, margin, panelWidth, game, active) {
  const size = 34, x0 = margin + 16, y0 = 94;
  const legal = active && game.players[game.current] === me.id ? new Set(legalReversiMoves(game, me.id).map(m => `${m.x},${m.y}`)) : new Set();
  drawText(ctx, game.status === 'finished' ? `終了 · 黒 ${game.scores?.[game.players[0]] ?? 0} : 白 ${game.scores?.[game.players[1]] ?? 0}` : `${game.colors[game.players[game.current]] === 'black' ? '黒' : '白'}の番`, margin + 4, 88, { size: 11, color: '#a8e8c6' });
  for (let y=0;y<8;y++) for(let x=0;x<8;x++) {
    const px=x0+x*size, py=y0+y*size; ctx.fillStyle='#28774f';ctx.fillRect(px,py,size-1,size-1);
    const cell=game.board[y][x]; if(cell){ctx.beginPath();ctx.arc(px+size/2,py+size/2,size*0.4,0,Math.PI*2);ctx.fillStyle=cell==='black'?'#101819':'#f2f0dc';ctx.fill();}
    else if(legal.has(`${x},${y}`)){ctx.beginPath();ctx.arc(px+size/2,py+size/2,4,0,Math.PI*2);ctx.fillStyle='#c5f4d9';ctx.fill();}
    if (legal.has(`${x},${y}`)) addTarget({x:px,y:py,width:size-1,height:size-1,type:'button',label:'リバーシのマス',action:()=>dispatch({type:'reversi-move',x,y})});
  }
  drawText(ctx, `${game.players.map(id=>`${state.players.find(p=>p.id===id)?.name||'プレイヤー'} ${game.board.flat().filter(c=>c===game.colors[id]).length}`).join(' · ')}`, x0, y0+8*size+18, {size:10,color:'#dce7df'});
  if(game.status==='finished') drawText(ctx, game.winnerId ? `${state.players.find(p=>p.id===game.winnerId)?.name||'プレイヤー'}の勝ち` : '引き分け', x0, y0+8*size+39,{size:10,color:'#e1bb67'});
  drawText(ctx, '薄い丸が置ける場所です。', x0, y0+8*size+58,{size:9,color:'#92a39b'});
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

function activeHandScrollArea() {
  if (selection.page === 'cards' && selection.cardsPage === 'hand') return handScrollArea;
  if (selection.page === 'game' && ['daifugu', 'old-maid'].includes(state?.game?.mode)) return gameHandScrollArea;
  return null;
}

function getRightPanelPoint(point) {
  return {
    x: (point.x - RIGHT_CONTENT.x) / RIGHT_CONTENT.scale,
    y: (point.y - RIGHT_CONTENT.y) / RIGHT_CONTENT.scale
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
  if (toastMessage) {
    const bounds = noticeBounds(engine.width);
    if (point.x < bounds.x || point.x > bounds.x + bounds.width ||
      point.y < bounds.y || point.y > bounds.y + bounds.height) {
      toastMessage = '';
      safeRender();
      return;
    }
    const noticeTarget = hitTest(point);
    if (noticeTarget?.overlay === 'notice') activateTarget(noticeTarget);
    return;
  }
  if (selection.confirmAction) {
    const bounds = confirmBounds(engine.width);
    if (point.x < bounds.x || point.x > bounds.x + bounds.width ||
      point.y < bounds.y || point.y > bounds.y + bounds.height) {
      selection.confirmAction = null;
      safeRender();
      return;
    }
    const confirmTarget = hitTest(point);
    if (confirmTarget?.overlay === 'confirm') activateTarget(confirmTarget);
    return;
  }
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
  } else if (!target) {
    const area = activeHandScrollArea();
    if (area?.contains(getRightPanelPoint(point))) {
      pointerScroll = { pointerId: event.pointerId, area, lastY: point.y };
      canvas.setPointerCapture(event.pointerId);
    }
  } else if (target) {
    activateTarget(target);
  }
});

canvas.addEventListener('pointermove', event => {
  const point = getPointerPoint(event);
  if (pointerScroll?.pointerId === event.pointerId && canvas.hasPointerCapture(event.pointerId)) {
    const delta = (point.y - pointerScroll.lastY) / RIGHT_CONTENT.scale;
    pointerScroll.lastY = point.y;
    if (pointerScroll.area.scrollBy(-delta)) safeRender();
  } else if (pointerStart && canvas.hasPointerCapture(event.pointerId)) {
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
  if (pointerScroll?.pointerId === event.pointerId) {
    pointerScroll = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    return;
  }
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
  pointerScroll = null;
  if (activeStrokeId && pendingDrawPoints.length) dispatch({ type: 'append-stroke', strokeId: activeStrokeId, points: pendingDrawPoints.splice(0) });
  activeStrokeId = null;
});

function findTableBounds(point) {
  const region = layoutRegions.find(item => item.kind === 'table');
  if (region && point.x >= region.x && point.x <= region.x + region.width && point.y >= region.y && point.y <= region.y + region.height) return region;
  return null;
}

canvas.addEventListener('wheel', event => {
  if (toastMessage || selection.confirmAction) return;
  const point = getPointerPoint(event);
  const localPoint = getRightPanelPoint(point);
  const scaleToLocal = engine.height / canvas.getBoundingClientRect().height / RIGHT_CONTENT.scale;
  const area = activeHandScrollArea();
  if (area?.handleWheel(event, localPoint, scaleToLocal)) safeRender();
}, { passive: false });

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
    if (toastMessage) toastMessage = '';
    else if (selection.confirmAction) selection.confirmAction = null;
    else selection.focusedField = null;
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

function createSkyWayToken(targetRoomId = '') {
  if (!API_KEY.trim() || !PASSWORD.trim()) {
    throw new Error('SkyWay接続用の認証情報がありません。安全なサーバー側トークン連携が必要です。');
  }
  const rooms = [{
    name: lobbyRoomName,
    methods: ['create', 'updateMetadata', 'close'],
    member: { name: skywayMemberName, methods: ['updateMetadata', 'publish', 'subscribe'] }
  }];
  if (targetRoomId) {
    rooms.push(
      {
        name: targetRoomId,
        methods: ['create', 'updateMetadata', 'close'],
        member: { name: skywayMemberName, methods: ['updateMetadata', 'publish', 'subscribe'] },
        sfu: { enabled: true }
      },
      {
        name: `tower-data-${targetRoomId}`,
        methods: ['create', 'updateMetadata', 'close'],
        member: { name: skywayMemberName, methods: ['updateMetadata', 'publish', 'subscribe'] }
      }
    );
  }
  const issuedAt = nowInSec();
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
  if (!API_KEY.trim() || !PASSWORD.trim()) {
    connectionStatus = 'SkyWayトークン未設定';
    safeRender();
    return;
  }
  if (lobbyStream) return;
  try {
    lobbyContext = await SkyWayContext.Create(createSkyWayToken());
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
    const plaintext = new TextEncoder().encode(JSON.stringify(publicStateFor(targetId)));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, plaintext);
    send({ type: 'secure-state', to: targetId, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) });
  } catch (error) { notify(`手札の暗号化に失敗しました: ${error.message}`); }
}

function publicStateFor(viewerId) {
  return publicPokerState(tableEngine.publicState(state, viewerId), viewerId);
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
  const extended = extendedApply(state, action);
  if (extended) return extended;
  if (action.type === 'start-game' && action.mode === 'mahjong') {
    if (!host) throw new Error('麻雀の開始はホストのみ実行できます。');
    if (state.game?.status === 'playing') throw new Error('別のゲームが進行中です。');
    if (state.gamePot?.locked) throw new Error('賭け金を精算してから開始してください。');
    return tableEngine.apply(state, { type: 'start-mahjong-round', actorId: action.actorId });
  }
  if (action.type === 'start-game' && action.mode === 'daifugu') {
    action = { ...action, daifugu: createDaifuguGame(state.players.filter(player => !player.spectator)) };
  } else if (action.type === 'game-action' && state.game?.mode === 'daifugu') {
    const daifugu = applyDaifuguAction(state.game.daifugu, action.actorId, action.action);
    return tableEngine.apply(state, { type: 'daifugu-state', actorId: state.hostId, daifugu });
  }
  const next = tableEngine.apply(state, action);
  if (action.type === 'discard-mahjong-tile' && next.mahjongGame) {
    const tile = next.mahjongTiles.find(item => item.id === action.tileId);
    const playerData = next.mahjongGame.mahjongPlayers || (next.mahjongGame.mahjongPlayers = {});
    const player = playerData[action.actorId] || (playerData[action.actorId] = { discardedKeys: [] });
    player.discardedKeys.push(`${tile.suit}:${tile.rank}`);
  }
  return next;
}

function dispatch(action) {
  try {
    const request = { ...action, actorId: me.id };
    if (host) {
      state = applyRoomAction(request);
      broadcastState();
      if (action.type === 'set-public-listing') void syncRoomMetadata().catch(error => notify(`部屋設定を保存できませんでした: ${error.message}`));
    } else send({ type: 'request', action: request });
    return true;
  } catch (error) {
    notify(error.message);
    return false;
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
  if (!API_KEY.trim() || !PASSWORD.trim()) {
    connectionStatus = 'SkyWayトークン未設定';
    notify('SkyWay接続は未設定です。安全なサーバー側トークン連携が必要です。', 7000);
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
    context = await SkyWayContext.Create(createSkyWayToken(roomId));
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
