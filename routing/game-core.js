export const WIDTH = 1000;
export const HEIGHT = 625;
export const PLOT = { left: 58, right: 968, top: 142, bottom: 500, xMin: -49, xMax: 49, yMin: -20, yMax: 20 };
export const FLOOR_Y = PLOT.bottom;
export const CHECKPOINT_STEP = 10;
export const CHECKPOINT_KEY = "graph-dodger-highest-stage";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const line = (x1, y1, x2, y2, width = 13) => ({ kind: "line", x1, y1, x2, y2, width });
const bullet = (x, y, angle, speed = 155, radius = 7) => ({ kind: "bullet", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius });

export function stageDuration(stage) { return clamp(26 - Math.floor((stage - 1) / 5) * 1.2, 14, 26); }
export function hazardInterval(stage) { return clamp(1.75 - Math.floor((stage - 1) / 4) * 0.11, 0.62, 1.75); }
export function warningDuration(stage) { return Math.max(0.42, 0.78 - Math.max(0, stage - 1) * 0.012); }
export const HAZARD_DURATION = 2.65;
export function hazardsPerBurst(stage) { return stage < 3 ? 2 : stage < 8 ? 3 : stage < 18 ? 4 : 5; }

// Patterns use only straight warning lanes and individual projectiles; no graph/function attacks.
const patternNames = ["狙い撃ち連射", "扇状弾幕", "隙間のある輪", "二重螺旋", "抜け道のある壁", "弾幕の雨", "左右クロス弾"];
export function createHazardBurst(stage, sequence, count = hazardsPerBurst(stage), targetX = (PLOT.left + PLOT.right) / 2, targetY = PLOT.bottom - 25) {
  const index = Math.floor(Math.random() * patternNames.length);
  const attacks = [];
  const centerX = (PLOT.left + PLOT.right) / 2;
  const centerY = PLOT.top + 38 + Math.random() * 70;
  const aim = Math.atan2(targetY - centerY, targetX - centerX) + (Math.random() - 0.5) * 0.14;
  const difficulty = Math.min(1, stage / 24);
  if (index === 0) {
    // Repeated narrow volleys lock onto the player's position at warning time.
    for (let volley = 0; volley < 3 + Math.floor(difficulty * 2); volley++) {
      const spread = 0.08 + volley * 0.018;
      for (let i = -3; i <= 3; i++) attacks.push(bullet(centerX + volley * 20, centerY, aim + i * spread, 150 + stage * 2 + Math.random() * 24, 5.5));
    }
  } else if (index === 1) {
    const spread = 17 + Math.floor(difficulty * 7), rotation = aim + (Math.random() - 0.5) * 0.5;
    for (let i = -spread; i <= spread; i++) attacks.push(bullet(centerX, centerY, rotation + i * 0.043, 148 + stage * 2, 5.5));
  } else if (index === 2) {
    const n = 42 + Math.floor(difficulty * 18), gap = Math.floor(Math.random() * n), gapWidth = 3;
    const rotation = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const distance = Math.min((i - gap + n) % n, (gap - i + n) % n);
      if (distance > gapWidth) attacks.push(bullet(centerX, centerY, rotation + Math.PI * 2 * i / n, 132 + stage * 1.5, 5.5));
    }
  } else if (index === 3) {
    const arms = Math.random() < 0.5 ? 2 : 3, perArm = 16 + Math.floor(difficulty * 8), rotation = Math.random() * Math.PI * 2;
    for (let arm = 0; arm < arms; arm++) for (let i = 0; i < perArm; i++) {
      attacks.push(bullet(centerX, centerY, rotation + arm * Math.PI * 2 / arms + i * 0.11, 124 + stage, 5.5));
    }
  } else if (index === 4) {
    const fromLeft = Math.random() < 0.5, gap = 2 + Math.floor(Math.random() * 6), rows = 13;
    for (let row = 0; row < rows; row++) if (row < gap || row > gap + 1) {
      const y = PLOT.top + 15 + row * (PLOT.bottom - PLOT.top - 30) / (rows - 1);
      attacks.push(line(fromLeft ? PLOT.left : PLOT.right, y, fromLeft ? PLOT.left + 360 : PLOT.right - 360, y + (Math.random() - 0.5) * 18, 12));
    }
  } else if (index === 5) {
    const columns = 19 + Math.floor(difficulty * 8), gap = Math.floor(Math.random() * columns), drift = (Math.random() - 0.5) * 0.38;
    for (let i = 0; i < columns; i++) {
      if (Math.abs(i - gap) < 2) continue;
      const x = PLOT.left + 18 + i * (PLOT.right - PLOT.left - 36) / (columns - 1);
      for (let row = 0; row < 2; row++) attacks.push(bullet(x + (row ? 18 : 0), PLOT.top - row * 58, Math.PI / 2 + drift + (Math.random() - 0.5) * 0.08, 145 + stage, 5.5));
    }
  } else {
    const origins = [PLOT.left + 12, PLOT.right - 12];
    const y = PLOT.top + 85 + Math.random() * 70;
    for (const originX of origins) {
      const base = Math.atan2(targetY - y, targetX - originX);
      for (let i = -11; i <= 11; i++) attacks.push(bullet(originX, y, base + i * 0.055, 138 + stage, 5.5));
    }
  }
  return { name: patternNames[index], attacks };
}

export function hazardHitsPlayer(hazard, player) {
  if (hazard.kind === "bullet") return Math.hypot(player.x - hazard.x, player.y - hazard.y) < player.radius + hazard.radius;
  const dx = hazard.x2 - hazard.x1, dy = hazard.y2 - hazard.y1;
  const length2 = dx * dx + dy * dy;
  const t = clamp(((player.x - hazard.x1) * dx + (player.y - hazard.y1) * dy) / (length2 || 1), 0, 1);
  return Math.hypot(player.x - (hazard.x1 + t * dx), player.y - (hazard.y1 + t * dy)) < player.radius + hazard.width / 2;
}

export function damageForStage(stage) { return 1 + Math.floor(Math.max(0, stage - 1) / 8); }
export function availableCheckpoints(highestStage) {
  const checkpoints = [1];
  for (let stage = CHECKPOINT_STEP; stage <= highestStage; stage += CHECKPOINT_STEP) checkpoints.push(stage);
  return checkpoints;
}
export function readHighestStage(storage = globalThis.localStorage) {
  try { return Math.max(1, Number(storage?.getItem(CHECKPOINT_KEY)) || 1); } catch { return 1; }
}
export function saveHighestStage(stage, storage = globalThis.localStorage) {
  const highest = Math.max(readHighestStage(storage), Math.floor(stage));
  try { storage?.setItem(CHECKPOINT_KEY, String(highest)); } catch { /* Storage may be unavailable. */ }
  return highest;
}

export const CARD_POOL = [
  { id: "heart", title: "予備の心臓", description: "最大HP +1", color: "#ff8295", apply: s => { s.maxHp += 1; s.hp += 1; } },
  { id: "speed", title: "軽量シューズ", description: "移動速度 +12%", color: "#7de4c2", apply: s => { s.speed *= 1.12; } },
  { id: "jump", title: "エアステップ", description: "空中ジャンプ +1回", color: "#8ca2ff", apply: s => { s.extraJumps += 1; } },
  { id: "shield", title: "継続シールド", description: "シールド +1", color: "#63d9ff", apply: s => { s.shields += 1; } },
  { id: "resolve", title: "不屈の余裕", description: "無敵時間 +0.45秒", color: "#c49aff", apply: s => { s.invulnerabilityBonus += 0.45; } },
  { id: "feather", title: "羽根のブーツ", description: "ジャンプ加速度 +2", color: "#f3d078", apply: s => { s.jumpAcceleration += 2; } },
  { id: "magnet", title: "安全磁場", description: "被弾判定を少し小さく", color: "#f29bd3", apply: s => { s.hitboxBonus = (s.hitboxBonus || 0) + 3; } },
  { id: "focus", title: "予見の砂時計", description: "攻撃予告 +0.15秒", color: "#8bd6f2", apply: s => { s.warningBonus = (s.warningBonus || 0) + 0.15; } },
  { id: "scoring", title: "連勝バッジ", description: "ステージ報酬 +50", color: "#f9a36b", apply: s => { s.scoreBonus = (s.scoreBonus || 0) + 50; } },
];

export function createRunState(stage = 1) {
  return { stage, hp: 3, maxHp: 3, speed: 300, extraJumps: 0, shields: 0, invulnerabilityBonus: 0, jumpAcceleration: 20, hitboxBonus: 0, warningBonus: 0, scoreBonus: 0, jumpsUsed: 0, mode: "ground", score: 0 };
}
export function drawCards(seed, count = 3) {
  const cards = [...CARD_POOL];
  let value = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280;
  const result = [];
  while (result.length < Math.min(count, cards.length)) {
    value = (value * 9301 + 49297) % 233280;
    result.push(cards.splice(value % cards.length, 1)[0]);
  }
  return result;
}
export function applyDamage(state, stage) {
  if (state.shields > 0) { state.shields -= 1; return { kind: "shield", amount: 0 }; }
  const amount = damageForStage(stage);
  state.hp = Math.max(0, state.hp - amount);
  return { kind: "hp", amount };
}
