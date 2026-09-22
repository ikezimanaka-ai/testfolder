import { Engine, Display, GameObject, INPUT } from "../engine.js";
import { TextObject, BarObject, ButtonObject } from "../ui-objects.js";

const NS = "http://www.w3.org/2000/svg";
const shape = (name, attrs) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

class Ship extends GameObject {
  constructor(overrides = {}) {
    super({ tags: ["ship"], shapes: [shape("polygon", { points: "-16,-22 18,0 -16,22 -8,0" })] }, overrides);
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-260 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(260 * dt);
    if (INPUT.onKey("ArrowUp")) this.moveY(-260 * dt);
    if (INPUT.onKey("ArrowDown")) this.moveY(260 * dt);
    this.x = Math.max(25, Math.min(775, this.x));
    this.y = Math.max(55, Math.min(425, this.y));
  }
}

class Shot extends GameObject {
  constructor(overrides = {}) {
    super({ tags: ["shot"], shapes: [shape("rect", { x: -3, y: -10, width: 6, height: 20, rx: 3 })] }, overrides);
  }
  onUpdate(dt) {
    this.moveX(560 * dt);
    if (this.x > 820) this.opacity = 0;
  }
}

class Enemy extends GameObject {
  constructor(overrides = {}) {
    super({ tags: ["enemy"], shapes: [shape("circle", { r: 18 })], hp: 6, maxHp: 6, speed: 230, hitCooldown: 0 }, overrides);
  }
  onUpdate(dt) {
    this.moveX(-this.speed * dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    if (this.x < -40) this.reset();
  }
  reset() {
    this.x = 840 + Math.random() * 180;
    this.y = 70 + Math.random() * 320;
    this.hp = this.maxHp;
    this.opacity = 1;
    this.hitCooldown = 0;
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 800, 450);
const world = engine.newDisplay(new Display("space", 800, 450, { background: "#020617" }));
const status = engine.addObject(world, new TextObject("", { x: 20, y: 30, fontSize: 18, color: "#e0f2fe" }));
const livesText = engine.addObject(world, new TextObject("", { x: 20, y: 55, fontSize: 16, color: "#fda4af" }));
const ship = engine.addObject(world, new Ship({ x: 100, y: 225 }));
ship.element.setAttribute("fill", "#67e8f9");
const enemies = [];
for (let i = 0; i < 6; i++) {
  const enemy = engine.addObject(world, new Enemy({ x: 700 + i * 150, y: 70 + (i % 4) * 90 }));
  enemy.element.setAttribute("fill", "#fb7185");
  enemy.hpBar = engine.addObject(world, new BarObject({ x: enemy.x - 22, y: enemy.y + 25, width: 44, height: 6, value: 1, fill: "#ef4444", background: "#450a0a", radius: 2 }));
  enemies.push(enemy);
}
const shots = [];
let score = 0;
let lives = 3;
let cooldown = 0;
let gameOver = false;
let restartButton;

function setStatus(text) {
  if (status) status.text = text;
}

function restart() {
  score = 0;
  lives = 3;
  gameOver = false;
  ship.opacity = 1;
  ship.moveTo(100, 225);
  for (const enemy of enemies) enemy.reset();
  for (const shot of shots) shot.opacity = 0;
  restartButton.opacity = 0;
  setStatus("撃破: 0　（矢印キー + Space）");
}

restartButton = engine.addObject(world, new ButtonObject("次のゲーム", {
  x: 300, y: 205, width: 200, height: 55, shadow: true, opacity: 0,
}));
restartButton.onClick = restart;

world.onUpdate = (dt) => {
  if (gameOver) return;
  cooldown -= dt;
  if (INPUT.onKey("Space") && cooldown <= 0) {
    const shot = engine.addObject(world, new Shot({ x: ship.x + 25, y: ship.y }));
    shot.element.setAttribute("fill", "#fef08a");
    shots.push(shot);
    cooldown = .18;
  }
  for (const enemy of enemies) {
    enemy.hpBar.moveTo(enemy.x - 22, enemy.y + 25);
    enemy.hpBar.value = enemy.hp / enemy.maxHp;
    if (enemy.hp <= 0) enemy.reset();
    if (enemy.opacity && Math.hypot(ship.x - enemy.x, ship.y - enemy.y) < 30 && enemy.hitCooldown <= 0) {
      enemy.hitCooldown = 1;
      lives--;
      ship.x = 400;
      ship.y = 390;
      if (lives <= 0) {
        gameOver = true;
        ship.opacity = 0;
        restartButton.opacity = 1;
        setStatus(`ゲームオーバー　スコア: ${score}`);
      }
    }
  }
  for (const shot of shots) {
    if (!shot.opacity) continue;
    for (const enemy of enemies) {
      if (enemy.opacity && Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < 25) {
        shot.opacity = 0;
        enemy.hp--;
        if (enemy.hp <= 0) score++;
      }
    }
  }
  setStatus(`撃破: ${score}　（矢印キー + Space）`);
  livesText.text = `残りミス: ${lives}`;
};

engine.start();
