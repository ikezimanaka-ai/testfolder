import { Engine, Display, GameObject, INPUT } from "../../engine.js";
import { TextObject } from "../../ui-objects.js";

function svgShape(name, attrs = {}, text = null) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text !== null) el.textContent = text;
  return el;
}

function makeCircle(radius = 8) {
  return svgShape("circle", { cx: 0, cy: 0, r: radius });
}

function makeRect(width = 80, height = 20) {
  return svgShape("rect", { x: -width / 2, y: -height / 2, width, height, rx: 4 });
}

class Ball extends GameObject {
  constructor(x = 300, y = 320) {
    super({ x, y, tags: ["ball"], shapes: [makeCircle(8)] });
    this.vx = 200;
    this.vy = 220;
  }
  onUpdate(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 0 || this.x > 800) this.vx *= -1;
    if (this.y < 0) this.vy *= -1;
  }
}

class Paddle extends GameObject {
  constructor() {
    super({ x: 400, y: 420, tags: ["paddle"], shapes: [makeRect(120, 16)] });
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-260 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(260 * dt);
    if (this.x < 60) this.x = 60;
    if (this.x > 740) this.x = 740;
  }
}

class Block extends GameObject {
  constructor(x, y) {
    super({ x, y, tags: ["block"], shapes: [makeRect(56, 20)] });
  }
}

const canvas = document.querySelector("#game");
const engine = new Engine(canvas, 60, 800, 450);
const world = engine.newDisplay(new Display("world", 800, 450, { background: "#0f172a" }));

const ball = engine.addObject(world, new Ball(200, 200));
const paddle = engine.addObject(world, new Paddle());

for (let row = 0; row < 5; row++) {
  for (let col = 0; col < 10; col++) {
    const block = engine.addObject(world, new Block(80 + col * 64, 60 + row * 28));
    block.element.setAttribute("fill", ["#7dd3fc", "#a78bfa", "#f9a8d4", "#86efac", "#fbbf24"][row % 5]);
  }
}

const status = engine.addObject(world, new TextObject("Press to play", {
  x: 18, y: 26, color: "#e2e8f0", fontSize: 18
}));

ball.element.setAttribute("fill", "#f8fafc");
paddle.element.setAttribute("fill", "#7dd3fc");

let started = false;

window.addEventListener("keydown", (event) => {
  if (event.key === " " || event.code === "Space") {
    if (!started) {
      started = true;
      status.text = "Break the blocks!";
    }
  }
});

world.onUpdate = (dt) => {
  if (!started) return;

  if (ball.touchTag("paddle")) {
    ball.vy = -Math.abs(ball.vy);
    const offset = (ball.x - paddle.x) / (paddle.width / 2);
    ball.vx = offset * 260;
  }

  for (const obj of world.objects) {
    if (!obj.hasTag("block")) continue;
    if (ball.touching("block").length > 0) {
      ball.vy *= -1;
      obj.opacity = 0;
      obj.element.remove();
      obj.tags.clear();
      status.text = "Nice!";
      break;
    }
  }

  if (ball.y > 470) {
    status.text = "Game Over";
    engine.stop();
  }

  if (world.objects.every((obj) => !obj.hasTag("block") || obj.opacity === 0)) {
    status.text = "Clear!";
    engine.stop();
  }
};

engine.start();
