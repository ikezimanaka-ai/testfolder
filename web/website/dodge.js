const DODGE_WIDTH = 800;
const DODGE_HEIGHT = 450;
const PLAYER_SPEED = 280;
var OBSTACLE_SPEED = 500;
const HIT_LIMIT = 3;
const INVINCIBLE_SECONDS = 1.2;

const root = new Deal(document.getElementById("app"));
const main = root.CE("main", { id: "dodge-app" });
new Deal(main).CE("p", { text: "矢印キーまたは WASD で青いプレイヤーを動かし、右から来る赤い四角をよけます。3回当たるとゲームオーバーです。" });
const canvas = new Deal(main).CE("canvas", { attrs: { id: "dodge-canvas", width: DODGE_WIDTH, height: DODGE_HEIGHT, "aria-label": "回避ゲーム" } });
new Deal(main).CE("p", { html: '<a href="./guide.html#demo">総合ガイドのデモ章</a> / <a href="./explan/dodge.html">このゲームの仕組み</a> / <a href="./index.html">websiteトップ</a>' });

const engine = new GameEngine.Engine({ fps: 60, canvas });
const background = engine.createDisplay({ name: "background", width: DODGE_WIDTH, height: DODGE_HEIGHT, transparent: false, blend: "normal" });
const actors = engine.createDisplay({ name: "actors", width: DODGE_WIDTH, height: DODGE_HEIGHT, transparent: true, blend: "normal" });
const hud = engine.createDisplay({ name: "hud", width: DODGE_WIDTH, height: DODGE_HEIGHT, transparent: true, blend: "normal" });
background.addObject(new GameEngine.GameObject({ x: DODGE_WIDTH / 2, y: DODGE_HEIGHT / 2, width: DODGE_WIDTH, height: DODGE_HEIGHT, color: "#16262d" }));

let player;
let obstacles = [];
let running = false;
let scoreValue = 0;
let hitCount = 0;
let spawnTimer = 0;
let invincible = 0;

function resetGame() {
  OBSTACLE_SPEED = 500;
  for (const obstacle of obstacles) obstacle.removeFrom(actors);
  obstacles = [];
  if (player) player.removeFrom(actors);
  player = new GameEngine.GameObject({ x: 100, y: DODGE_HEIGHT / 2, width: 30, height: 30, color: "#4fd1c5", tag: ["player"] });
  actors.addObject(player);
  scoreValue = 0;
  hitCount = 0;
  spawnTimer = 0;
  invincible = 0;
  updatePanel();
}

function spawnObstacle() {
  const size = 28 + Math.random() * 36;
  const y = size / 2 + Math.random() * (DODGE_HEIGHT - size);
  const obstacle = new GameEngine.GameObject({ x: DODGE_WIDTH + size, y, width: size, height: size, color: "#ef8354", tag: ["obstacle"] });
  actors.addObject(obstacle);
  obstacles.push(obstacle);
}

function movePlayer(input, dt) {
  let dx = 0;
  let dy = 0;
  if (input.isKeyPressed("ArrowLeft") || input.isKeyPressed("a")) dx -= 1;
  if (input.isKeyPressed("ArrowRight") || input.isKeyPressed("d")) dx += 1;
  if (input.isKeyPressed("ArrowUp") || input.isKeyPressed("w")) dy -= 1;
  if (input.isKeyPressed("ArrowDown") || input.isKeyPressed("s")) dy += 1;
  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    player.move((dx / length) * PLAYER_SPEED * dt, (dy / length) * PLAYER_SPEED * dt);
  }
  const halfWidth = player.width / 2;
  const halfHeight = player.height / 2;
  player.x = Math.max(halfWidth, Math.min(DODGE_WIDTH - halfWidth, player.x));
  player.y = Math.max(halfHeight, Math.min(DODGE_HEIGHT - halfHeight, player.y));
}

function updateObstacles(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = 0.65 - (OBSTACLE_SPEED - 500) * 0.0007 + Math.random() * 0.5 * ((OBSTACLE_SPEED - 490) * 0.0007);
  }
  for (let index = obstacles.length - 1; index >= 0; index -= 1) {
    const obstacle = obstacles[index];
    obstacle.move(-OBSTACLE_SPEED * dt, 0);
    if (obstacle.x + obstacle.width / 2 < 0) {
      obstacle.removeFrom(actors);
      obstacles.splice(index, 1);
      scoreValue += 1;
      continue;
    }
    if (invincible <= 0 && player.intersectsObject(obstacle)) {
      hitCount += 1;
      invincible = INVINCIBLE_SECONDS;
      if (hitCount >= HIT_LIMIT) {
        running = false;
        gameStatus = "ゲームオーバー。もう一度挑戦できます";
        engine.stop();
      }
    }
  }
  OBSTACLE_SPEED += 0.02;
}

function updatePanel() {
  if (running) gameStatus = invincible > 0 ? `無敵中 ${invincible.toFixed(1)}秒` : "プレイ中";
}

let gameStatus = "開始ボタンを押してください";

function drawHud(ctx) {
  ctx.save();
  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = "#f4f1e8";
  ctx.fillText(`スコア ${scoreValue}`, 24, 34);
  ctx.fillText(`被弾 ${hitCount} / ${HIT_LIMIT}`, 24, 64);
  ctx.fillStyle = invincible > 0 ? "#f4c95d" : "#f4f1e8";
  ctx.fillText(gameStatus, 24, DODGE_HEIGHT - 24);
  ctx.restore();
}

const canvasUI = new CanvasUI();
const startButton = canvasUI.add(new CanvasButton({
  x: DODGE_WIDTH - 220, y: 20, width: 190, height: 48,
  text: "開始 / リスタート",
  font: "bold 18px sans-serif",
  onClick: startGame
}));
hud.addDrawable((ctx) => { drawHud(ctx); canvasUI.draw(ctx); });

engine.onUpdate((dt, input) => {
  if (!running) return;
  movePlayer(input, dt);
  updateObstacles(dt);
  invincible = Math.max(0, invincible - dt);
  player.visible = invincible <= 0 || Math.floor(invincible * 12) % 2 === 0;
  updatePanel();
});

function startGame() {
  resetGame();
  running = true;
  gameStatus = "プレイ中";
  engine.start();
}

canvasUI.bindTo(canvas);

resetGame();
engine.input.attachTo(canvas);
engine.start();
