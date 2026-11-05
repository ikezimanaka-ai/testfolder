import { GameObject, INPUT, Shapes } from "../editor/engine/engine.js";
import { ProgramObject, programURL } from "./object-program.js";

const OBJECT_FRAME = programURL("./programs/object-placed.js");

export class ShapeObject extends ProgramObject {
  constructor(shapes, options = {}) {
    super({ ...options, shapes, collisionShapes: options.collisionShapes ?? [] });
    this.setPlacementProgram(OBJECT_FRAME);
  }
}

export class TextObject extends ShapeObject {
  constructor(text, options = {}) {
    const { x = 0, y = 0, size = 18, color = "#f4f7fb", align = "middle", font = "monospace", ...rest } = options;
    super([Shapes.text(String(text), { x: 0, y: 0, fill: color, fontSize: size, fontFamily: font, align, baseline: "middle" })], { ...rest, x, y });
    this.textShape = this.shapes[0];
  }
  setText(value) { this.textShape.text = String(value); return this; }
}

export class PanelObject extends ShapeObject {
  constructor(x, y, width, height, options = {}) {
    const { color = "#0c1421", border = "#2d4059", radius = 10, ...rest } = options;
    super([Shapes.roundRect(width, height, radius, { fill: color, stroke: border, "stroke-width": 1 })], {
      ...rest, x, y, width, height, collisionShapes: [],
    });
  }
}

export class ButtonObject extends ShapeObject {
  constructor(label, x, y, width, height, onClick, options = {}) {
    const { color = "#07121b", background = "#72ecff", border = background, size = 16, ...rest } = options;
    super([
      Shapes.roundRect(width, height, 7, { fill: background, stroke: border, "stroke-width": 1 }),
      Shapes.text(label, { x: 0, y: 1, fill: color, fontSize: size, fontFamily: "sans-serif", align: "middle", baseline: "middle" }),
    ], { ...rest, x, y, width, height, collisionShapes: [Shapes.rectAt(-width / 2, -height / 2, width, height)] });
    this.onClick = onClick;
    this.background = background;
    this.hovered = false;
    this.setProgram(programURL("./programs/button-update.js"));
    this.registerCommand("tickButton", this.tickButton);
  }
  onStart(engine) {
    super.onStart(engine);
    if (this._buttonEventsBound || !this.element) return;
    this._buttonEventsBound = true;
    this.element.addEventListener("pointerenter", () => { this.hovered = true; });
    this.element.addEventListener("pointerleave", () => { this.hovered = false; });
    this.element.addEventListener("pointerdown", () => { this._pressed = true; });
    this.element.addEventListener("pointerup", () => {
      if (this._pressed) this.onClick?.call(this, this);
      this._pressed = false;
    });
  }
  tickButton() { this.scaleX = this.scaleY = this.hovered ? 1.035 : 1; }
}

export class PlayerObject extends ShapeObject {
  constructor(scene, x, y) {
    const shape = Shapes.polygon([[15, 0], [-8, -9], [-3, 0], [-8, 9]], { fill: "#d9fbff", stroke: "#72ecff", "stroke-width": 2 });
    super([shape, Shapes.circle(3, { fill: "#39c9e8" })], {
      x, y, width: 28, height: 22, collisionShapes: [Shapes.circle(10)],
    });
    this.scene = scene;
    Object.assign(this, { radius: 10, health: 3, maxHealth: 3, invulnerable: 0, dashTime: 0, dashCooldown: 0, faceX: 1, faceY: 0, dashEnabled: true });
    this.setProgram(programURL("./programs/player-update.js"));
    this.registerCommand("tickPlayer", this.tickPlayer);
  }
  tickPlayer() {
    if (this.scene.paused || this.scene.status !== "playing") return;
    const dt = this._frameDelta;
    let dx = Number(INPUT.onKey("ArrowRight") || INPUT.onKey("KeyD")) - Number(INPUT.onKey("ArrowLeft") || INPUT.onKey("KeyA"));
    let dy = Number(INPUT.onKey("ArrowDown") || INPUT.onKey("KeyS")) - Number(INPUT.onKey("ArrowUp") || INPUT.onKey("KeyW"));
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 0) { dx /= magnitude; dy /= magnitude; this.faceX = dx; this.faceY = dy; }
    if (this.dashEnabled && INPUT.pressed("Space") && this.dashCooldown <= 0) {
      this.dashTime = 0.18; this.dashCooldown = 0.9; this.invulnerable = Math.max(this.invulnerable, 0.22);
      if (!magnitude) { dx = this.faceX; dy = this.faceY; }
    }
    const dashing = this.dashTime > 0;
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const speed = 250 * (dashing ? 3.1 : 1);
    this.move(dx * speed * dt, dy * speed * dt);
    const bounds = this.scene.arena;
    this.x = Math.max(bounds.x + this.radius + 4, Math.min(bounds.x + bounds.width - this.radius - 4, this.x));
    this.y = Math.max(bounds.y + this.radius + 4, Math.min(bounds.y + bounds.height - this.radius - 4, this.y));
    this.rotation = Math.atan2(this.faceY, this.faceX) * 180 / Math.PI;
    this.opacity = this.invulnerable > 0 && Math.floor(this.scene.gameTime * 24) % 2 === 0 ? 0.38 : 1;
  }
}

export class WarningObject extends ShapeObject {
  constructor(scene, attack, delay = 0) {
    super(WarningObject.shapesFor(attack), { x: 0, y: 0, collisionShapes: [], opacity: delay > 0 ? 0 : 1 });
    this.scene = scene; this.attack = attack; this.delay = delay; this.remaining = attack.duration;
    this.color = attack.pattern.color; this.label = attack.pattern.name;
    this.setProgram(programURL("./programs/warning-sequence.js"));
    this.registerCommand("showWarning", this.showWarning);
    this.registerCommand("fireWarning", this.fireWarning);
  }
  static shapesFor(attack) {
    const { pattern, x, y, min, max } = attack;
    const color = pattern.color;
    const shapes = [];
    const alert = (px, py, text = "!") => shapes.push(Shapes.text(text, { x: px, y: py, fill: color, fontSize: 26, fontFamily: "monospace", align: "middle", baseline: "middle" }));
    const outline = (cx, cy, radius) => shapes.push(Shapes.circle(radius, { cx, cy, fill: "transparent", stroke: color, "stroke-width": 2, opacity: 0.8 }));
    if (pattern.id === "hbeam") {
      shapes.push(Shapes.line(52, attack.y, 908, attack.y, { stroke: color, "stroke-width": 28, opacity: 0.3 }));
      shapes.push(Shapes.line(52, attack.y, 908, attack.y, { stroke: color, "stroke-width": 2 })); alert(480, attack.y);
    } else if (pattern.id === "vbeam") {
      shapes.push(Shapes.line(attack.x, 52, attack.x, 568, { stroke: color, "stroke-width": 28, opacity: 0.3 }));
      shapes.push(Shapes.line(attack.x, 52, attack.x, 568, { stroke: color, "stroke-width": 2 })); alert(attack.x, 310);
    } else if (pattern.id === "sweepH") {
      shapes.push(Shapes.rectAt(52, min, 856, max - min, { fill: color, opacity: 0.1 }));
      shapes.push(Shapes.line(52, min, 908, min, { stroke: color, "stroke-width": 2 }));
      shapes.push(Shapes.line(52, max, 908, max, { stroke: color, "stroke-width": 2 })); alert(480, attack.y, "↕!");
    } else if (pattern.id === "sweepV") {
      shapes.push(Shapes.rectAt(min, 52, max - min, 516, { fill: color, opacity: 0.1 }));
      shapes.push(Shapes.line(min, 52, min, 568, { stroke: color, "stroke-width": 2 }));
      shapes.push(Shapes.line(max, 52, max, 568, { stroke: color, "stroke-width": 2 })); alert(attack.x, 310, "↔!");
    } else if (pattern.id === "lanes") {
      const laneWidth = 856 / 6;
      for (let i = 0; i < 6; i += 1) if (i !== attack.safeLane) {
        shapes.push(Shapes.rectAt(52 + i * laneWidth, 52, laneWidth - 3, 516, { fill: color, opacity: 0.12 }));
        alert(52 + (i + 0.5) * laneWidth, 72);
      }
    } else if (pattern.id === "mines") {
      for (const spot of attack.spots) { outline(spot.x, spot.y, 30); alert(spot.x, spot.y); }
    } else if (pattern.id === "rain" || pattern.id === "diagonal") {
      if (attack.edge === "top") for (let i = 0; i < 9; i += 1) shapes.push(Shapes.line(82 + i * 100, 52, 130 + i * 100, 200, { stroke: color, "stroke-width": 2, opacity: 0.65 }));
      else for (let i = 0; i < 7; i += 1) shapes.push(Shapes.line(52, 80 + i * 72, 212, 92 + i * 72, { stroke: color, "stroke-width": 2, opacity: 0.65 }));
      alert(attack.edge === "top" ? 480 : 74, attack.edge === "top" ? 68 : 310);
    } else if (pattern.id === "pincer" || pattern.id === "sideFan") {
      shapes.push(Shapes.line(52, attack.y, 908, attack.y, { stroke: color, "stroke-width": 22, opacity: 0.22 }));
      alert(480, attack.y, pattern.id === "sideFan" ? "!◁▷!" : "⇥ ! ⇤");
    } else {
      outline(x, y, pattern.id === "ring" || pattern.id === "doubleRing" || pattern.id === "wave" ? 38 : 26);
      shapes.push(Shapes.line(x, y, x + Math.cos(attack.angle) * 52, y + Math.sin(attack.angle) * 52, { stroke: color, "stroke-width": 3 }));
      alert(x, y);
    }
    return shapes;
  }
  showWarning() { if (!this.scene.paused && this.scene.status === "playing") this.opacity = 0.72; }
  fireWarning() { if (!this.scene.paused && this.scene.status === "playing") this.scene.activateAttack(this.attack); this.destroy(); }
}

export class HazardObject extends ShapeObject {
  constructor(scene, spec) {
    const radius = spec.radius ?? 6;
    let shapes;
    if (spec.kind === "beam" || spec.kind === "sweep") shapes = [Shapes.rect(spec.width, spec.height, { fill: spec.color, stroke: "#ffffff88", "stroke-width": 2, opacity: 0.88 })];
    else shapes = [Shapes.circle(radius, { fill: spec.kind === "mine" ? "#101827" : spec.color, stroke: spec.color, "stroke-width": spec.kind === "mine" ? 3 : 1, opacity: spec.kind === "mine" ? 0.8 : 1 })];
    super(shapes, { x: spec.x, y: spec.y, width: spec.width ?? radius * 2, height: spec.height ?? radius * 2, collisionShapes: [spec.kind === "beam" || spec.kind === "sweep" ? Shapes.rect(spec.width, spec.height) : Shapes.circle(radius)] });
    Object.assign(this, spec, { scene, age: 0, life: spec.life ?? 8, elapsed: 0, exploded: false });
    this._baseShapes = shapes;
    this.setProgram(programURL(spec.kind === "mine" ? "./programs/mine-sequence.js" : "./programs/hazard-update.js"));
    this.registerCommand("tickHazard", this.tickHazard);
    this.registerCommand("explodeMine", this.explodeMine);
    this.registerCommand("removeHazard", this.removeHazard);
  }
  tickHazard() {
    if (this.scene.paused || this.scene.status !== "playing") return;
    const dt = this._frameDelta;
    this.age += dt;
    if (this.kind === "beam") { this.life -= dt; if (this.life <= 0) this.destroy(); return; }
    if (this.kind === "sweep") {
      this.x = this.horizontal ? this.scene.width / 2 : this.x;
      this.y = this.horizontal ? this.y : this.scene.height / 2;
      const key = this.horizontal ? "y" : "x";
      this[key] += this.direction * 180 * dt;
      if (this[key] < this.min || this[key] > this.max) { this.direction *= -1; this[key] = Math.max(this.min, Math.min(this.max, this[key])); }
      this.life -= dt; if (this.life <= 0) this.destroy(); return;
    }
    if (this.kind === "mine") return;
    if (this.delay > 0) { this.delay -= dt; this.opacity = 0.34; return; }
    this.opacity = 1;
    if (this.homing > 0) {
      const desired = Math.atan2(this.scene.player.y - this.y, this.scene.player.x - this.x);
      const current = Math.atan2(this.vy, this.vx);
      const turn = Math.max(-2 * dt, Math.min(2 * dt, Math.atan2(Math.sin(desired - current), Math.cos(desired - current))));
      const angle = current + turn, speed = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed; this.homing -= dt;
    }
    this.move(this.vx * dt, this.vy * dt);
    if (this.bounces > 0) {
      const a = this.scene.arena;
      if (this.x < a.x + 8 || this.x > a.x + a.width - 8) { this.vx *= -1; this.bounces -= 1; }
      if (this.y < a.y + 8 || this.y > a.y + a.height - 8) { this.vy *= -1; this.bounces -= 1; }
    }
    if (this.splitAt && this.age >= this.splitAt && !this.split) {
      this.split = true; const angle = Math.atan2(this.vy, this.vx), velocity = Math.hypot(this.vx, this.vy) * 0.82;
      for (const offset of [-0.65, 0.65]) this.scene.spawnBullet({ kind: "bullet", x: this.x, y: this.y, vx: Math.cos(angle + offset) * velocity, vy: Math.sin(angle + offset) * velocity, radius: 4, color: this.color });
    }
    if (this.age > this.life || this.x < -60 || this.x > 1020 || this.y < -60 || this.y > 680) this.destroy();
  }
  explodeMine() {
    if (this.scene.status !== "playing" || this.scene.paused) return;
    this.exploded = true;
    this.scene.spawnRadial(this.x, this.y, this.burstCount, this.speed, this.color);
    this.opacity = 0.38;
    if (this.shapes[0]?.type === "circle") this.shapes[0].r = 42;
  }
  removeHazard() { this.destroy(); }
}

export function createText(text, x, y, options) { return new TextObject(text, { x, y, ...options }); }
