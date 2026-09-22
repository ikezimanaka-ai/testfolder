import { Engine, Display, GameObject, INPUT } from "./engine.js";
import { TextObject } from "./ui-objects.js";

function shape(name, attributes = {}, text = null) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== null) element.textContent = text;
  return element;
}

class Player extends GameObject {
  constructor(overrides = {}) {
    super(overrides);
    this.tags.add("player");
    this.shapes = [this.shapes[0] ?? this._shape()];
  }
  _shape() {
    return shape("circle", { cx: 0, cy: 0, r: 24 });
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-140 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(140 * dt);
    if (INPUT.onKey("ArrowUp")) this.moveY(-140 * dt);
    if (INPUT.onKey("ArrowDown")) this.moveY(140 * dt);
    this.moveX(70 * dt);
    if (this.x > 700) this.x = 80;
    this.rotation += 90 * dt;
    this.mosaic = this.touchTag("target");
  }
}

class Target extends GameObject {
  constructor(overrides = {}) {
    super(overrides);
    this.tags.add("target");
    this.shapes = [this.shapes[0] ?? this._shape()];
  }
  _shape() {
    return shape("rect", { x: -24, y: -24, width: 48, height: 48, rx: 8 });
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 800, 450);
const background = engine.newDisplay(new Display("background", 800, 450, { background: "#182744" }), 0, 0);
const world = engine.newDisplay(new Display("world", 500, 320), 120, 60);
const player = engine.addObject(world, new Player({ x: 70, y: 160 }));
engine.addObject(world, new Target({ x: 350, y: 160 }));
player.element.setAttribute("fill", "#62d6ff");
world.objects[1].element.setAttribute("fill", "#ff7698");
engine.addObject(world, {
  tags: ["label"],
  shapes: [shape("text", { x: 10, y: 30 }, "Display at (120, 60)")],
});
const stats = engine.addObject(background, new TextObject("", { x: 18, y: 30, fontSize: 18, color: "#e0f2fe" }));
background.onUpdate = () => { stats.text = `dt: ${engine.dt.toFixed(3)}s | touching: ${player.touchTag("target")}`; };
engine.start();
