import { SceneEngine, INPUT } from "../editor/engine/scene-engine/engine.js";
import {
  WIDTH, HEIGHT, FLOOR_Y, PLOT, createHazardBurst, hazardHitsPlayer, stageDuration,
  hazardInterval, hazardsPerBurst, warningDuration, HAZARD_DURATION, damageForStage, availableCheckpoints, readHighestStage, saveHighestStage,
  createRunState, drawCards, applyDamage,
} from "./game-core.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const engine = new SceneEngine({ canvas, width: WIDTH, height: HEIGHT, fps: 60, background: "#101321" });
let highestStage = readHighestStage();
let run = createRunState();
let player = { x: WIDTH / 2, y: FLOOR_Y - 18, vx: 0, vy: 0, radius: 17, onGround: true };
let stageClock = 0, hazardClock = 2, hazardSequence = 0, warning = null, activeHazards = [], invulnerable = 0;
let modeClock = 0, selectedCards = [], cardRects = [], checkpointRects = [], gameOverStage = 1;
let damageFlash = 0, toast = "", toastClock = 0, safeBlink = 0;
let pointer = { x: 0, y: 0, clicked: false };

canvas.addEventListener("pointerdown", event => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = (event.clientX - rect.left) * WIDTH / rect.width;
  pointer.y = (event.clientY - rect.top) * HEIGHT / rect.height;
  pointer.clicked = true;
  canvas.focus();
});

function resetStage() {
  stageClock = 0;
  hazardClock = 1.2;
  hazardSequence = 0;
  warning = null;
  activeHazards = [];
  modeClock = 0;
  player.x = WIDTH / 2;
  player.y = FLOOR_Y - player.radius;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.jumpAcceleration = 0;
  run.mode = "ground";
  run.jumpsUsed = 0;
  invulnerable = 0;
}

function startRun(stage = 1) {
  run = createRunState(stage);
  highestStage = saveHighestStage(stage);
  resetStage();
  engine.switchScene("game");
}

function beginStage(stage) {
  run.stage = stage;
  run.hp = run.maxHp;
  highestStage = saveHighestStage(stage);
  resetStage();
  engine.switchScene("game");
}

function endStage() {
  run.hp = run.maxHp;
  run.score += 100 + run.stage * 10 + (run.scoreBonus || 0);
  selectedCards = drawCards(run.stage * 17 + run.score, 3);
  engine.switchScene("cards");
}

function loseRun() {
  gameOverStage = run.stage;
  highestStage = saveHighestStage(run.stage);
  engine.switchScene("over");
}

function movePlayer(dt) {
  const left = INPUT.onKey("ArrowLeft") || INPUT.onKey("KeyA") || INPUT.onKey("a");
  const right = INPUT.onKey("ArrowRight") || INPUT.onKey("KeyD") || INPUT.onKey("d");
  const up = INPUT.onKey("ArrowUp") || INPUT.onKey("KeyW") || INPUT.onKey("w");
  const down = INPUT.onKey("ArrowDown") || INPUT.onKey("KeyS") || INPUT.onKey("s");
  const jumpHeld = INPUT.onKey("Space") || INPUT.onKey(" ") || up;
  const jumpPressed = INPUT.pressed("Space") || INPUT.pressed(" ") || INPUT.pressed("ArrowUp") || INPUT.pressed("KeyW");
  const direction = Number(right) - Number(left);
  player.vx = direction * run.speed;
  player.x = Math.max(PLOT.left + player.radius, Math.min(PLOT.right - player.radius, player.x + player.vx * dt));

  if (run.mode === "flight") {
    const vertical = Number(down) - Number(up);
    player.vy = vertical * run.speed;
    player.y = Math.max(PLOT.top + player.radius, Math.min(PLOT.bottom - player.radius, player.y + player.vy * dt));
    player.onGround = player.y >= FLOOR_Y - player.radius;
    if (player.onGround) player.y = FLOOR_Y - player.radius;
    run.jumpsUsed = 0;
    return;
  }

  if (jumpPressed && run.jumpsUsed <= run.extraJumps) {
    player.vy = -160;
    player.jumpAcceleration = run.jumpAcceleration;
    player.onGround = false;
    run.jumpsUsed += 1;
  }
  if (!player.onGround) {
    // Start at 20, then decay by 1 per held frame or 5 per released frame.
    // Keep the signed value through zero until landing so the force reverses downward.
    player.vy -= player.jumpAcceleration * 180 * dt;
    player.jumpAcceleration -= (jumpHeld ? 1 : 5) * dt * 60;
  }
  player.vy += 1180 * dt;
  player.y += player.vy * dt;
  if (player.y - player.radius <= PLOT.top) {
    player.y = PLOT.top + player.radius;
    player.vy = Math.max(0, player.vy);
  }
  if (player.y + player.radius >= FLOOR_Y) {
    player.y = FLOOR_Y - player.radius;
    player.vy = 0;
    if (!player.onGround) run.jumpsUsed = 0;
    player.onGround = true;
    player.jumpAcceleration = 0;
  } else player.onGround = false;
}

function spawnHazards() {
  const count = hazardsPerBurst(run.stage);
  warning = {
    ...createHazardBurst(run.stage, hazardSequence, count, player.x, player.y),
    time: warningDuration(run.stage) + (run.warningBonus || 0),
  };
  hazardSequence += count;
  hazardClock = hazardInterval(run.stage) * (0.88 + Math.random() * 0.26);
}

function activateHazards() {
  const attacks = warning?.attacks ?? [];
  attacks.forEach((attack, i) => {
    activeHazards.push({ ...attack, life: HAZARD_DURATION, hit: false, colorIndex: i });
  });
  warning = null;
}

function updateGame(dt) {
  stageClock += dt;
  modeClock += dt;
  invulnerable = Math.max(0, invulnerable - dt);
  damageFlash = Math.max(0, damageFlash - dt);
  safeBlink += dt * 5;
  hazardClock -= dt;
  if (modeClock > 10.5 + (run.stage % 3) * 1.3) {
    modeClock = 0;
    run.mode = run.mode === "ground" ? "flight" : "ground";
    if (run.mode === "ground" && player.y + player.radius < FLOOR_Y - 4) player.vy = Math.max(player.vy, 90);
  }
  if (warning) {
    warning.time -= dt;
    if (warning.time <= 0) activateHazards();
  } else if (hazardClock <= 0) spawnHazards();

  movePlayer(dt);
  for (const hazard of activeHazards) {
    hazard.life -= dt;
    if (hazard.kind === "bullet") { hazard.x += hazard.vx * dt; hazard.y += hazard.vy * dt; }
    if (!hazard.hit && hazardHitsPlayer(hazard, { ...player, radius: Math.max(6, player.radius - (run.hitboxBonus || 0)) }) && invulnerable <= 0) {
      hazard.hit = true;
      const damage = applyDamage(run, run.stage);
      damageFlash = 0.28;
      if (damage.kind === "shield") {
        toast = "シールドが攻撃を防いだ！";
        toastClock = 1.6;
      } else {
        invulnerable = 1.05 + run.invulnerabilityBonus;
        toast = `−${damage.amount} HP`;
        toastClock = 1.15;
        if (run.hp <= 0) { loseRun(); return; }
      }
    }
  }
  activeHazards = activeHazards.filter(hazard => hazard.life > 0);
  toastClock = Math.max(0, toastClock - dt);
  if (stageClock >= stageDuration(run.stage)) endStage();
}

function roundedRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function text(value, x, y, size = 16, color = "#f0f2ff", weight = 500, align = "left", family = "Manrope, 'Noto Sans JP', sans-serif") {
  ctx.font = `${weight} ${size}px ${family}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(value, x, y);
}
function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
function noGlow() { ctx.shadowBlur = 0; }

function drawBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, "#171a30"); bg.addColorStop(1, "#101321");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#111424"; ctx.fillRect(PLOT.left, PLOT.top, PLOT.right - PLOT.left, PLOT.bottom - PLOT.top);
  ctx.fillStyle = "#131827"; ctx.fillRect(0, FLOOR_Y + 2, WIDTH, HEIGHT - FLOOR_Y - 2);
  ctx.fillStyle = "#535ce0"; ctx.fillRect(0, FLOOR_Y, WIDTH, 2);
  ctx.fillStyle = "#747aff"; ctx.fillRect(0, FLOOR_Y, WIDTH, 1);
  drawAxes();
}

function xToPixel(value) { return PLOT.left + (value - PLOT.xMin) / (PLOT.xMax - PLOT.xMin) * (PLOT.right - PLOT.left); }
function yToPixel(value) { return PLOT.bottom - (value - PLOT.yMin) / (PLOT.yMax - PLOT.yMin) * (PLOT.bottom - PLOT.top); }

function drawAxes() {
  const xAxis = xToPixel(0), yAxis = yToPixel(0);
  for (let x = Math.ceil(PLOT.xMin); x <= PLOT.xMax; x++) {
    const px = xToPixel(x);
    ctx.strokeStyle = x === 0 ? "#bfc3e888" : x % 5 === 0 ? "#ffffff16" : "#ffffff08";
    ctx.lineWidth = x === 0 ? 1.8 : x % 5 === 0 ? 1 : .65;
    ctx.beginPath(); ctx.moveTo(px, PLOT.top); ctx.lineTo(px, PLOT.bottom); ctx.stroke();
  }
  for (let y = Math.ceil(PLOT.yMin); y <= PLOT.yMax; y++) {
    const py = yToPixel(y);
    ctx.strokeStyle = y === 0 ? "#bfc3e888" : y % 5 === 0 ? "#ffffff16" : "#ffffff08";
    ctx.lineWidth = y === 0 ? 1.8 : y % 5 === 0 ? 1 : .65;
    ctx.beginPath(); ctx.moveTo(PLOT.left, py); ctx.lineTo(PLOT.right, py); ctx.stroke();
  }
  const xLabels = [-45, -20, -10, -5, -1, 1, 5, 10, 20, 45];
  const yLabels = [-20, -10, -5, -1, 1, 5, 10, 20];
  ctx.font = "10px 'DM Mono', monospace"; ctx.fillStyle = "#aeb2d0"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const value of xLabels) {
    const px = xToPixel(value); ctx.beginPath(); ctx.moveTo(px, yAxis - 4); ctx.lineTo(px, yAxis + 4); ctx.strokeStyle = "#d4d7f0aa"; ctx.stroke();
    ctx.fillText(String(value), px, yAxis + 7);
  }
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const value of yLabels) {
    const py = yToPixel(value); ctx.beginPath(); ctx.moveTo(xAxis - 4, py); ctx.lineTo(xAxis + 4, py); ctx.strokeStyle = "#d4d7f0aa"; ctx.stroke();
    ctx.fillText(String(value), xAxis - 7, py);
  }
  ctx.font = "600 12px 'DM Mono', monospace"; ctx.fillStyle = "#d4d7f0";
  ctx.textAlign = "right"; ctx.fillText("y", xAxis - 8, PLOT.top - 10);
  ctx.textAlign = "left"; ctx.fillText("x", PLOT.right + 8, yAxis + 5);
}

const hazardColors = ["#ff668e", "#ffc56b", "#67dfd0"];
function drawHazard(hazard, glowColor = "#ff7195", opacity = 1, preview = false) {
  ctx.save(); ctx.globalAlpha = opacity;
  if (hazard.kind === "bullet") {
    const x = preview ? hazard.x + hazard.vx * 0.65 : hazard.x;
    const y = preview ? hazard.y + hazard.vy * 0.65 : hazard.y;
    ctx.beginPath(); ctx.arc(x, y, hazard.radius, 0, Math.PI * 2);
    ctx.fillStyle = glowColor; glow(glowColor, 14); ctx.fill(); noGlow();
  } else {
    ctx.beginPath(); ctx.moveTo(hazard.x1, hazard.y1); ctx.lineTo(hazard.x2, hazard.y2);
    ctx.lineWidth = hazard.width; ctx.lineCap = "round"; ctx.strokeStyle = glowColor;
    ctx.setLineDash(preview ? [10, 8] : []); glow(glowColor, preview ? 10 : 18); ctx.stroke(); noGlow(); ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  if (invulnerable > 0 && Math.floor(safeBlink) % 2) ctx.globalAlpha = 0.48;
  const color = damageFlash > 0 ? "#ff718b" : run.mode === "flight" ? "#78e9d4" : "#a4a8ff";
  glow(color, 20); ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2); ctx.fill(); noGlow();
  ctx.fillStyle = "#f4f5ff"; ctx.beginPath(); ctx.arc(player.x + 5, player.y - 4, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#333755"; ctx.beginPath(); ctx.arc(player.x + 6, player.y - 4, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color + "88"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, player.radius + 5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawHud() {
  roundedRect(24, 20, 952, 66, 13, "#181b2cdd", "#ffffff14");
  text(`STAGE ${String(run.stage).padStart(2, "0")}`, 46, 45, 12, "#a7a9ca", 700, "left", "'DM Mono', monospace");
  text(run.mode === "ground" ? "GROUND" : "ZERO GRAVITY", 46, 67, 10, run.mode === "ground" ? "#9ca1ff" : "#73e8d2", 500, "left", "'DM Mono', monospace");
  const hpX = 190;
  for (let i = 0; i < run.maxHp; i++) {
    const filled = i < run.hp; ctx.fillStyle = filled ? "#ff7891" : "#34364c";
    ctx.beginPath(); ctx.arc(hpX + i * 22, 52, 6.5, 0, Math.PI * 2); ctx.fill();
  }
  const timer = Math.max(0, 1 - stageClock / stageDuration(run.stage));
  roundedRect(475, 46, 190, 8, 4, "#34364c", null); roundedRect(475, 46, 190 * timer, 8, 4, "#8489ff", null);
  text(`${Math.ceil(stageDuration(run.stage) - stageClock)}s`, 682, 51, 12, "#d7d9f3", 500, "left", "'DM Mono', monospace");
  text(`◆ ${run.shields}`, 854, 51, 14, "#75ddff", 700, "center");
  text(`SCORE ${String(run.score).padStart(5, "0")}`, 946, 51, 10, "#9295b3", 500, "right", "'DM Mono', monospace");
}

function drawGame() {
  drawBackground();
  for (const hazard of activeHazards) drawHazard(hazard, hazardColors[hazard.colorIndex % hazardColors.length]);
  if (activeHazards.length) {
    let x = PLOT.left;
    for (const [i, hazard] of activeHazards.entries()) {
      const label = hazard.kind === "line" ? "予告レーザー" : "弾";
      ctx.font = "500 11px 'DM Mono', monospace";
      const w = Math.min(330, ctx.measureText(label).width + 18);
      roundedRect(x, 101, w, 24, 7, "#191c2ddd", `${hazardColors[i % hazardColors.length]}88`);
      text(label, x + 9, 113, 10, hazardColors[i % hazardColors.length], 600, "left", "'DM Mono', monospace");
      x += w + 8;
      if (x > PLOT.right - 20) break;
    }
  }
  drawPlayer();
  if (warning) {
    warning.attacks.forEach((attack, i) => drawHazard(attack, hazardColors[i % hazardColors.length], 0.42, true));
    roundedRect(342, PLOT.top + 18, 316, 34, 10, "#171a2add", "#ff9aaf77");
    text(`次の攻撃：${warning.name}`, 500, PLOT.top + 35, 12, "#ffd1db", 700, "center");
  }
  drawHud();
  if (toastClock > 0) {
    roundedRect(338, 552, 324, 38, 12, "#202238ee", "#ffffff19");
    text(toast, 500, 571, 13, "#f2f2ff", 600, "center");
  }
}

function button(label, x, y, w, h, sub = "") {
  roundedRect(x, y, w, h, 12, "#767cff", "#aeb0ff");
  text(label, x + w / 2, y + h / 2 - (sub ? 8 : 0), 15, "#fff", 700, "center");
  if (sub) text(sub, x + w / 2, y + h / 2 + 14, 10, "#dedfff", 500, "center");
}

function drawTitle() {
  drawBackground();
  for (let i = 0; i < 3; i++) drawHazard({ kind: "line", x1: 160 + i * 280, y1: PLOT.top, x2: 320 + i * 190, y2: PLOT.bottom, width: 4 }, ["#8b8fff", "#5ce0d1", "#ff7897"][i], 0.3);
  roundedRect(171, 105, 658, 411, 22, "#131626ed", "#ffffff18");
  text("DANMAKU SURVIVAL", 500, 155, 10, "#9b9eba", 600, "center", "'DM Mono', monospace");
  text("LINE", 500, 224, 54, "#f5f4ff", 800, "center");
  text("DODGER", 500, 280, 54, "#989cff", 800, "center");
  text("予告線と弾幕を避ける", 500, 330, 16, "#d4d5e8", 500, "center");
  text("放射・螺旋・扇状・レーザー", 500, 359, 12, "#9295b3", 500, "center");
  button("ゲームスタート", 383, 401, 234, 56, "← → / A D　移動 · SPACE　ジャンプ");
  if (highestStage > 1) text(`到達ステージ ${highestStage}　·　チェックポイントは敗北後に選択できます`, 500, 483, 11, "#8589a8", 500, "center");
}

function drawCardsScene() {
  drawBackground(); drawHud();
  roundedRect(105, 111, 790, 402, 20, "#151827f5", "#ffffff18");
  text("STAGE CLEAR", 500, 153, 10, "#8ee5ce", 700, "center", "'DM Mono', monospace");
  text("次の強化を選ぶ", 500, 191, 28, "#f3f2ff", 700, "center");
  text("HPは全回復しました。カードは周回中ずっと有効です。", 500, 222, 12, "#a1a3bd", 400, "center");
  cardRects = [];
  const cardW = 226, gap = 18, startX = 500 - (cardW * 3 + gap * 2) / 2;
  selectedCards.forEach((card, index) => {
    const x = startX + index * (cardW + gap), y = 269, h = 176;
    cardRects.push({ x, y, w: cardW, h });
    roundedRect(x, y, cardW, h, 15, "#1e2134", "#ffffff20");
    roundedRect(x + 16, y + 16, 42, 42, 12, `${card.color}25`, `${card.color}77`);
    const cardIcons = { heart: "♥", speed: "↗", jump: "↑", shield: "◇", resolve: "◌", feather: "✧", magnet: "⊙", focus: "⌛", scoring: "★" };
    text(cardIcons[card.id] ?? "✦", x + 37, y + 38, 21, card.color, 700, "center");
    text(`0${index + 1}`, x + cardW - 17, y + 26, 10, "#737792", 500, "right", "'DM Mono', monospace");
    text(card.title, x + 17, y + 82, 16, "#f0efff", 700);
    text(card.description, x + 17, y + 111, 11, "#a6a8c0", 500);
    roundedRect(x + 17, y + 137, cardW - 34, 25, 8, "#777cff25", null);
    text("このカードを選ぶ", x + cardW / 2, y + 150, 10, "#b8baff", 600, "center");
  });
  text("1・2・3 キー またはカードをクリック", 500, 478, 10, "#8588a5", 500, "center", "'DM Mono', monospace");
}

function drawGameOver() {
  drawBackground();
  drawHazard({ kind: "line", x1: PLOT.left, y1: PLOT.top, x2: PLOT.right, y2: PLOT.bottom, width: 8 }, "#ff6289", 0.15);
  roundedRect(122, 69, 756, 498, 20, "#151725f2", "#ffffff1a");
  text("RUN ENDED", 500, 113, 10, "#ff879d", 700, "center", "'DM Mono', monospace");
  text("GAME OVER", 500, 159, 38, "#f3f2ff", 800, "center");
  text(`ステージ ${gameOverStage} でゲームオーバー`, 500, 195, 13, "#a4a6bf", 500, "center");
  text("再挑戦するステージを選択", 500, 246, 15, "#dedff1", 600, "center");
  checkpointRects = [];
  const options = availableCheckpoints(highestStage);
  const cols = Math.min(5, options.length), w = 112, h = 54, gap = 12;
  const rows = Math.ceil(options.length / cols), totalH = rows * h + (rows - 1) * gap;
  const top = 282 - Math.max(0, totalH - h) / 2;
  options.forEach((stage, index) => {
    const row = Math.floor(index / cols), col = index % cols;
    const rowCount = Math.min(cols, options.length - row * cols);
    const rowWidth = rowCount * w + (rowCount - 1) * gap;
    const x = (WIDTH - rowWidth) / 2 + col * (w + gap), y = top + row * (h + gap);
    checkpointRects.push({ stage, x, y, w, h });
    button(`${stage} 面`, x, y, w, h, stage === 1 ? "はじめから" : "初期強化で再開");
  });
  const retryY = Math.min(492, top + rows * (h + gap) + 18);
  text("最高到達 " + highestStage + " 面　·　チェックポイント到達時の強化は引き継がれません", 500, retryY, 10, "#8588a5", 500, "center");
}

function inRect(point, rect) { return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h; }

engine.registerScene("title", {
  onUpdate() {
    if (INPUT.pressed("Enter") || INPUT.pressed("Space") || INPUT.pressed(" ") || pointer.clicked) startRun(1);
    pointer.clicked = false;
  },
  onRender() { drawTitle(); },
});
engine.registerScene("game", {
  onUpdate(dt) { updateGame(dt); },
  onRender() { drawGame(); },
});
engine.registerScene("cards", {
  onUpdate() {
    let picked = -1;
    for (let i = 0; i < 3; i++) if (INPUT.pressed(String(i + 1)) || INPUT.pressed(`Digit${i + 1}`)) picked = i;
    if (pointer.clicked) picked = cardRects.findIndex(rect => inRect(pointer, rect));
    pointer.clicked = false;
    if (picked >= 0 && selectedCards[picked]) {
      selectedCards[picked].apply(run);
      beginStage(run.stage + 1);
    }
  },
  onRender() { drawCardsScene(); },
});
engine.registerScene("over", {
  onUpdate() {
    let checkpoint = null;
    for (const option of checkpointRects) {
      if (INPUT.pressed(String(option.stage)) || INPUT.pressed(`Digit${option.stage}`)) checkpoint = option.stage;
      if (option.stage === 1 && (INPUT.pressed("Enter") || INPUT.pressed("Space"))) checkpoint = 1;
    }
    if (pointer.clicked) checkpoint = checkpointRects.find(rect => inRect(pointer, rect))?.stage ?? null;
    pointer.clicked = false;
    if (checkpoint !== null) startRun(checkpoint);
  },
  onRender() { drawGameOver(); },
});

engine.start("title");
