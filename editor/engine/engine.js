const SVG_NS = "http://www.w3.org/2000/svg";

class Input {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    window.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar"].includes(event.key) || event.code === "Space") {
        event.preventDefault();
      }
      if (!this.keys.has(event.key) && !this.keys.has(event.code)) {
        this.justPressed.add(event.key);
        this.justPressed.add(event.code);
      }
      this.keys.add(event.key);
      this.keys.add(event.code);
    });
    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key);
      this.keys.delete(event.code);
      this.justReleased.add(event.key);
      this.justReleased.add(event.code);
    });
    window.addEventListener("blur", () => this.clear());
  }
  onKey(keyid) { return this.keys.has(keyid); }
  pressed(keyid) { return this.justPressed.has(keyid); }
  released(keyid) { return this.justReleased.has(keyid); }
  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
  }
  clear() {
    this.keys.clear();
    this.justPressed.clear();
    this.justReleased.clear();
  }
}

export const INPUT = new Input();

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  element.setAttribute("focusable", "false");
  element.setAttribute("tabindex", "-1");
  element.style.userSelect = "none";
  element.style.webkitUserSelect = "none";
  element.style.touchAction = "none";
  element.style.outline = "none";
  element.style.webkitTapHighlightColor = "transparent";
  return element;
}

export class GameObject {
  constructor(definition = {}, overrides = {}) {
    Object.assign(this, definition, overrides);
    this.x ??= 0;
    this.y ??= 0;
    this.width ??= 0;
    this.height ??= 0;
    this.rotation ??= 0;
    this.scaleX ??= 1;
    this.scaleY ??= 1;
    this.opacity ??= 1;
    this.tags = new Set(this.tags ?? []);
    this.shapes = this.shapes ?? [];
    this.display = null;
    this.engine = null;
    this.element = null;
    this._initialized = false;
  }

  moveX(pixels) { this.x += pixels; return this; }
  moveY(pixels) { this.y += pixels; return this; }
  moveTo(x, y) { this.x = x; this.y = y; return this; }
  move(x, y) { return this.moveTo(this.x + x, this.y + y); }
  static fromAngleDistance(angle, distance) {
    const radians = angle * Math.PI / 180;
    return { x: Math.cos(radians) * distance, y: Math.sin(radians) * distance };
  }
  offsetFromAngle(angle, distance) { return this.move(...Object.values(GameObject.fromAngleDistance(angle, distance))); }
  hasTag(tag) { return this.tags.has(tag); }
  getObject(tags) { return this.display?.getObjects(tags) ?? []; }
  touching(tags) {
    return this.getObject(tags).filter((other) => other !== this && this.intersects(other));
  }
  touchTag(tag) { return this.touching(tag).length > 0; }
  intersects(other) {
    return this.shapes.some((shape) => other.shapes.some((otherShape) => {
      const a = shape.getBoundingClientRect();
      const b = otherShape.getBoundingClientRect();
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }));
  }
  createElement() {
    this.element = svgElement("g");
    for (const shape of this.shapes) this.element.append(shape);
    return this.element;
  }
  updateElement() {
    if (!this.element) return;
    this.element.setAttribute("transform", `translate(${this.x} ${this.y}) rotate(${this.rotation}) scale(${this.scaleX} ${this.scaleY})`);
    this.element.setAttribute("opacity", this.opacity);
    this.element.style.filter = this.mosaic ? `url(#${this.engine.filterId})` : "";
  }
}

export class Display {
  constructor(id, width, height, options = {}) {
    this.id = id;
    this.width = width;
    this.height = height;
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.background = options.background ?? null;
    this.objects = [];
    this.onStart = options.onStart;
    this.onUpdate = options.onUpdate;
    this.element = null;
    this.engine = null;
  }
  createElement() {
    this.element = svgElement("g", { "data-display": this.id, transform: `translate(${this.x} ${this.y})` });
    if (this.background) {
      const background = svgElement("rect", { width: this.width, height: this.height, fill: this.background });
      this.element.append(background);
    }
    return this.element;
  }
  addObject(object, overrides = {}) {
    const gameObject = object instanceof GameObject ? object : new GameObject(object, overrides);
    if (object instanceof GameObject) Object.assign(gameObject, overrides);
    gameObject.display = this;
    gameObject.engine = this.engine;
    gameObject.createElement();
    this.objects.push(gameObject);
    this.element?.append(gameObject.element);
    return gameObject;
  }
  getObjects(tags) {
    const wanted = new Set(Array.isArray(tags) ? tags : [tags]);
    return this.objects.filter((object) => [...wanted].every((tag) => object.hasTag(tag)));
  }
  start() {
    if (this.onStart) this.onStart.call(this, this.engine);
    for (const object of this.objects) {
      if (!object._initialized) {
        object._initialized = true;
        object.onStart?.call(object, this.engine);
      }
    }
  }
  update(dt) {
    this.onUpdate?.call(this, dt, this.engine);
    for (const object of this.objects) {
      object.onUpdate?.call(object, dt, this.engine);
      object.updateElement(dt);
    }
  }
}

export class Engine {
  constructor(canvas, fps = 60, logicalWidth = 800, logicalHeight = 450) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("Engine requires a canvas element.");
    if (logicalWidth <= 0 || logicalHeight <= 0) throw new RangeError("Engine logical size must be positive.");
    this.canvas = canvas;
    this.fps = fps;
    this.logicalWidth = logicalWidth;
    this.logicalHeight = logicalHeight;
    this.dt = 0;
    this.displays = [];
    this.running = false;
    this._lastTime = 0;
    this._frameRequest = 0;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this.svg = svgElement("svg", { preserveAspectRatio: "xMidYMid meet" });
    this.svg.style.position = "absolute";
    this.svg.style.inset = "0";
    this.svg.style.width = "100%";
    this.svg.style.height = "100%";
    this.svg.style.overflow = "hidden";
    this.svg.style.userSelect = "none";
    this.svg.style.webkitUserSelect = "none";
    this.svg.style.touchAction = "none";
    this.svg.style.outline = "none";
    this.svg.setAttribute("aria-hidden", "true");
    this.svg.addEventListener("focusin", (event) => {
      event.preventDefault();
      event.target.blur?.();
    });
    this.svg.addEventListener("pointerdown", (event) => event.preventDefault());
    this.svg.addEventListener("selectstart", (event) => event.preventDefault());
    this.svg.addEventListener("dragstart", (event) => event.preventDefault());
    this.svg.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.setAttribute("tabindex", "-1");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.userSelect = "none";
    this.canvas.style.webkitUserSelect = "none";
    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("focus", () => this.canvas.blur());
    this.canvas.addEventListener("selectstart", (event) => event.preventDefault());
    this.canvas.addEventListener("dragstart", (event) => event.preventDefault());
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.filterId = `mosaic-${Math.random().toString(36).slice(2)}`;
    const defs = svgElement("defs");
    const filter = svgElement("filter", { id: this.filterId });
    filter.append(svgElement("feFlood", { "flood-color": "transparent" }));
    this.svg.append(defs);
    defs.append(filter);
    const parent = canvas.parentElement;
    if (!parent) throw new Error("Canvas must have a parent element.");
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    parent.append(this.svg);
    this._resizeObserver.observe(parent);
    this.resize();
  }
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio));
    this.canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
    this.svg.setAttribute("viewBox", `0 0 ${this.logicalWidth} ${this.logicalHeight}`);
    this.svg.setAttribute("width", rect.width);
    this.svg.setAttribute("height", rect.height);
  }
  newDisplay(display, x = display.x, y = display.y) {
    if (!(display instanceof Display)) throw new TypeError("newDisplay requires a Display.");
    display.x = x;
    display.y = y;
    display.engine = this;
    display.createElement();
    this.displays.push(display);
    this.svg.append(display.element);
    for (const object of display.objects) object.engine = this;
    if (this.running) display.start();
    return display;
  }
  addObject(display, object, overrides = {}) {
    if (!this.displays.includes(display)) throw new Error("Display must be added to this Engine first.");
    return display.addObject(object, overrides);
  }
  start() {
    if (this.running) return;
    this.running = true;
    for (const display of this.displays) display.start();
    this._lastTime = performance.now();
    this._frameRequest = requestAnimationFrame((time) => this._frame(time));
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this._frameRequest);
  }
  _frame(time) {
    if (!this.running) return;
    this.dt = Math.min((time - this._lastTime) / 1000, 0.25);
    this._lastTime = time;
    for (const display of this.displays) display.update(this.dt);
    INPUT.endFrame();
    this._frameRequest = requestAnimationFrame((nextTime) => this._frame(nextTime));
  }
}

export const ObjectBase = GameObject;
