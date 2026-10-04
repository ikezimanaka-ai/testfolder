import { Engine, Display, GameObject, INPUT, Shapes } from "../engine.js";
import { TextObject, ButtonObject } from "../ui-objects.js";

const WIDTH = 800;
const HEIGHT = 450;
const patterns = ["放射", "螺旋", "狙い撃ち", "波", "輪と隙間", "回転十字", "ビーム", "雨", "曲線", "交互の壁", "狙い撃ち連射", "遅延リング", "左右スイープ"];

class Player extends GameObject {
  constructor(overrides = {}) {
    super({ shapes: [Shapes.circle(9, { fill: "#fef08a" })] }, overrides);
  }
  onUpdate(dt) {
    const speed = INPUT.onKey("Shift") || INPUT.onKey("KeyX") ? 105 : 260;
    if (INPUT.onKey("ArrowLeft")) this.moveX(-speed * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(speed * dt);
    if (INPUT.onKey("ArrowUp")) this.moveY(-speed * dt);
    if (INPUT.onKey("ArrowDown")) this.moveY(speed * dt);
    this.x = Math.max(14, Math.min(786, this.x));
    this.y = Math.max(44, Math.min(436, this.y));
  }
}

class Bullet extends GameObject {
  constructor(overrides = {}) {
    super({
      radius: 6,
      shapes: [Shapes.circle(overrides.radius ?? 6, { fill: overrides.fill ?? "#f8fafc" })],
    }, overrides);
    this.age = 0;
  }
  onUpdate(dt) {
    this.age += dt;
    if (this.beam) {
      if (this.age > 1.6) this.destroy();
      return;
    }
    if (this.wave) this.vy += Math.sin(this.age * 5 + this.phase) * 10 * dt;
    if (this.angularVelocity) {
      const speed = Math.hypot(this.vx, this.vy);
      const angle = Math.atan2(this.vy, this.vx) + this.angularVelocity * dt;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }
    this.move(this.vx * dt, this.vy * dt);
    if (this.x < -50 || this.x > WIDTH + 50 || this.y < -50 || this.y > HEIGHT + 50 || this.age > 12) this.destroy();
  }
}

const engine = new Engine(document.querySelector("#game"), 60, WIDTH, HEIGHT);
const world = engine.newDisplay(new Display("dodge", WIDTH, HEIGHT, { background: "#170d2b" }));
const status = engine.addObject(world, new TextObject("", { x: 20, y: 27, fontSize: 17, color: "#fef3c7" }));
const patternView = engine.addObject(world, new TextObject("", { x: WIDTH - 20, y: 27, anchor: "end", fontSize: 17, color: "#c4b5fd" }));
const hint = engine.addObject(world, new TextObject("矢印キーで移動 / Shift・Xで低速 / 小さい黄色の円を守る", { x: WIDTH / 2, y: HEIGHT - 14, anchor: "middle", fontSize: 14, color: "#cbd5e1" }));
const player = engine.addObject(world, new Player({ x: WIDTH / 2, y: HEIGHT - 65 }));
const restartButton = engine.addObject(world, new ButtonObject("もう一度挑戦", { x: 300, y: 200, width: 200, height: 55, shadow: true, opacity: 0 }));
const bullets = [];
const warnings = [];
const scheduled = [];
let started = performance.now();
let score = 0;
let lives = 3;
let gameOver = false;
let patternClock = 0;
let patternIndex = 0;
let patternStep = 0;
let spawnClock = 0;
let hitCooldown = 0;
let warningCounter = 0;

function addBullet(x, y, angle, speed, color = "#f8fafc", options = {}) {
  const bullet = engine.addObject(world, new Bullet({
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, fill: color, ...options,
  }));
  bullets.push(bullet);
  return bullet;
}

function radialBurst(count = 18, gapIndex = -1) {
  for (let i = 0; i < count; i++) {
    if (i === gapIndex || i === gapIndex + 1) continue;
    addBullet(400, 190, Math.PI * 2 * i / count, 85 + score * .15, "#fb7185");
  }
}

function spiral() {
  const angle = patternStep * .34;
  for (let arm = 0; arm < 2; arm++) addBullet(400, 190, angle + arm * Math.PI, 105, "#c4b5fd", { angularVelocity: arm ? -.35 : .35 });
}

function aimedFan() {
  const base = Math.atan2(player.y - 190, player.x - 400);
  for (let i = -2; i <= 2; i++) addBullet(400, 190, base + i * .13, 145, "#f9a8d4");
}

function wave() {
  for (let i = 0; i < 5; i++) addBullet(70 + i * 165, -8, Math.PI / 2, 105, "#67e8f9", { wave: true, phase: i });
}

function ringWithGap() {
  const gap = patternStep % 12;
  radialBurst(24, gap);
}

function rotatingCross() {
  const angle = patternStep * .2;
  for (let i = 0; i < 4; i++) addBullet(400, 190, angle + i * Math.PI / 2, 120, "#fde68a", { angularVelocity: i % 2 ? -.3 : .3 });
}

function beam() {
  const x = patternStep % 2 ? 190 : 610;
  const warning = engine.addObject(world, new GameObject({
    x, y: 48, warning: true,
    shapes: [Shapes.polygon([[-14, 0], [0, -18], [14, 0]], { fill: "#facc15", opacity: .9 })],
  }));
  warning.element.setAttribute("data-warning", `beam-${warningCounter++}`);
  warnings.push(warning);
  scheduled.push({
    delay: .65,
    run() {
      warning.destroy();
      const beamBullet = engine.addObject(world, new Bullet({
        x, y: 250, beam: true, radius: 14,
        fill: "#f43f5e",
        shapes: [Shapes.roundRect(20, 380, 8, { fill: "#f43f5e", opacity: .75 })],
      }));
      bullets.push(beamBullet);
      warnings.splice(warnings.indexOf(warning), 1);
    },
  });
}

function rain() {
  for (let i = 0; i < 9; i++) addBullet(35 + i * 90, -8, Math.PI / 2 + (i % 2 ? .12 : -.12), 125, "#a7f3d0");
}

function curved() {
  const side = patternStep % 2 ? 1 : -1;
  for (let i = 0; i < 7; i++) addBullet(80 + i * 105, -8, Math.PI / 2, 100, "#f0abfc", { wave: true, phase: side * i, angularVelocity: side * .18 });
}

function alternatingWalls() {
  const fromLeft = patternStep % 2 === 0;
  for (let i = 0; i < 7; i++) {
    if (fromLeft && i === 5 || !fromLeft && i === 1) continue;
    addBullet(fromLeft ? -8 : WIDTH + 8, 65 + i * 52, fromLeft ? 0 : Math.PI, 115, "#fdba74");
  }
}

function aimedBurst() {
  const base = Math.atan2(player.y - 180, player.x - 400);
  for (let i = 0; i < 3; i++) {
    scheduled.push({ delay: i * .18, run() { addBullet(400, 180, base, 170, "#fda4af"); } });
  }
}

function delayedRing() {
  const gap = (patternStep * 3) % 20;
  scheduled.push({ delay: .45, run() {
    radialBurst(20, gap);
  }});
}

function sweep() {
  const fromLeft = patternStep % 2 === 0;
  for (let i = 0; i < 12; i++) {
    const angle = fromLeft ? -.45 + i * .08 : Math.PI + .45 - i * .08;
    addBullet(fromLeft ? -8 : WIDTH + 8, 80 + i * 24, angle, 135, "#86efac");
  }
}

function spawnPattern() {
  const name = patterns[patternIndex];
  if (name === "放射") radialBurst(20);
  if (name === "螺旋") spiral();
  if (name === "狙い撃ち") aimedFan();
  if (name === "波") wave();
  if (name === "輪と隙間") ringWithGap();
  if (name === "回転十字") rotatingCross();
  if (name === "ビーム") beam();
  if (name === "雨") rain();
  if (name === "曲線") curved();
  if (name === "交互の壁") alternatingWalls();
  if (name === "狙い撃ち連射") aimedBurst();
  if (name === "遅延リング") delayedRing();
  if (name === "左右スイープ") sweep();
  patternStep++;
}

function restart() {
  for (const bullet of bullets) bullet.destroy();
  bullets.length = 0;
  started = performance.now();
  score = 0;
  lives = 3;
  gameOver = false;
  patternClock = 0;
  patternIndex = 0;
  patternStep = 0;
  scheduled.length = 0;
  for (const warning of warnings) warning.destroy();
  warnings.length = 0;
  player.moveTo(WIDTH / 2, HEIGHT - 65);
  player.opacity = 1;
  restartButton.opacity = 0;
}

restartButton.onClick = restart;

world.onUpdate = (dt) => {
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (bullets[i]._removed) bullets.splice(i, 1);
  }
  if (gameOver) return;
  const elapsed = (performance.now() - started) / 1000;
  score = Math.floor(elapsed * 10);
  patternClock += dt;
  spawnClock += dt;
  hitCooldown = Math.max(0, hitCooldown - dt);
  for (let i = scheduled.length - 1; i >= 0; i--) {
    scheduled[i].delay -= dt;
    if (scheduled[i].delay <= 0) {
      scheduled[i].run();
      scheduled.splice(i, 1);
    }
  }
  if (patternClock >= 4.5) {
    patternClock = 0;
    patternIndex = (patternIndex + 1) % patterns.length;
    patternStep = 0;
  }
  const interval = patternIndex === 1 || patternIndex === 5 ? .12 : .55;
  if (spawnClock >= interval) {
    spawnClock = 0;
    spawnPattern();
    if (elapsed >= 18) {
      const savedIndex = patternIndex;
      patternIndex = (patternIndex + 3) % patterns.length;
      spawnPattern();
      patternIndex = savedIndex;
    }
  }
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    if (hitCooldown > 0) continue;
    const distance = Math.hypot(player.x - bullet.x, player.y - bullet.y);
    if (distance < (bullet.radius ?? 6) + 8) {
      lives--;
      hitCooldown = 1;
      player.moveTo(WIDTH / 2, HEIGHT - 65);
      if (lives <= 0) {
        gameOver = true;
        player.opacity = 0;
        restartButton.opacity = 1;
      }
    }
  }
  status.text = gameOver ? `ゲームオーバー　スコア: ${score}` : `生存スコア: ${score}　残り: ${lives}`;
  patternView.text = elapsed >= 18
    ? `弾幕: ${patterns[patternIndex]} + 複合`
    : `弾幕: ${patterns[patternIndex]}`;
};

engine.start();
