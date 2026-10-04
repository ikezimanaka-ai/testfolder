import { GameObject, Shapes } from "./engine.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function element(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.setAttribute("focusable", "false");
  node.setAttribute("tabindex", "-1");
  node.style.userSelect = "none";
  node.style.webkitUserSelect = "none";
  node.style.touchAction = "none";
  node.style.pointerEvents = "none";
  return node;
}

function drawBase(object, context, draw) {
  if (object.opacity <= 0 || object._removed || object.element && !object.element.isConnected) return false;
  context.save();
  context.translate(object.x, object.y);
  context.rotate(object.rotation * Math.PI / 180);
  context.scale(object.scaleX, object.scaleY);
  context.transform(1, Math.tan(object.skewY * Math.PI / 180), Math.tan(object.skewX * Math.PI / 180), 1, 0, 0);
  context.globalAlpha *= Math.max(0, Math.min(1, object.opacity));
  if (object.mosaic) object.engine?._drawMosaic(context, object, draw);
  else draw(context);
  if (object.engine?.debug?.hitboxes) object.engine._drawHitboxes(context, object);
  context.restore();
  return true;
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
  context.beginPath();
  context.roundRect(x, y, width, height, r);
}

function objectLocalPoint(object, point) {
  const x = point.x - (object.display?.x ?? 0) - object.x;
  const y = point.y - (object.display?.y ?? 0) - object.y;
  const angle = object.rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const sx = object.scaleX, sy = object.scaleY;
  const kx = Math.tan(object.skewX * Math.PI / 180);
  const ky = Math.tan(object.skewY * Math.PI / 180);
  const a = cos * sx - sin * sy * ky;
  const c = cos * sx * kx - sin * sy;
  const b = sin * sx + cos * sy * ky;
  const d = sin * sx * kx + cos * sy;
  const determinant = a * d - b * c;
  if (!determinant) return { x: 0, y: 0 };
  return { x: (d * x - c * y) / determinant, y: (-b * x + a * y) / determinant };
}

export class ShapeObject extends GameObject {
  constructor(shape, overrides = {}) {
    super({ shapes: [shape], ...overrides });
    this.collisionShapes = overrides.collisionShapes ?? this.shapes;
  }
}

export class RectObject extends ShapeObject {
  constructor(width = 100, height = 60, overrides = {}) {
    const { x = -width / 2, y = -height / 2, radius = 0, ...options } = overrides;
    super({ type: radius ? "roundRect" : "rect", x, y, width, height, radius, ...options }, { width, height, ...overrides });
  }
}

export class CircleObject extends ShapeObject {
  constructor(radius = 24, overrides = {}) {
    super({ type: "circle", cx: 0, cy: 0, r: radius, ...overrides.style }, {
      width: radius * 2, height: radius * 2, ...overrides,
    });
  }
}

export class EllipseObject extends ShapeObject {
  constructor(rx = 40, ry = 24, overrides = {}) {
    super({ type: "ellipse", cx: 0, cy: 0, rx, ry, ...overrides.style }, {
      width: rx * 2, height: ry * 2, ...overrides,
    });
  }
}

export class LineObject extends ShapeObject {
  constructor(x1 = 0, y1 = 0, x2 = 100, y2 = 0, overrides = {}) {
    super({ type: "line", x1, y1, x2, y2, fill: "transparent", ...overrides.style }, {
      width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), ...overrides,
    });
  }
}

export class PolygonObject extends ShapeObject {
  constructor(points = [], overrides = {}) {
    super(Shapes.polygon(points, overrides.style ?? {}), { ...overrides });
  }
}

export class TextObject extends GameObject {
  constructor(text, overrides = {}) {
    super({
      x: 0,
      y: 0,
      text,
      fontSize: 24,
      fontFamily: "sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#ffffff",
      anchor: "start",
      baseline: "alphabetic",
      tags: ["text"],
      shapes: [],
    }, overrides);
  }
  createElement() {
    this.element = element("g");
    this.textElement = element("text", {
      x: 0, y: 0, fill: this.color, "font-size": this.fontSize,
      "font-family": this.fontFamily, "text-anchor": this.anchor,
    });
    this.textElement.textContent = this.text;
    this.element.append(this.textElement);
    return this.element;
  }
  updateElement() {
    super.updateElement();
    if (!this.textElement) return;
    this.textElement.textContent = this.text;
    this.textElement.setAttribute("fill", this.color);
    this.textElement.setAttribute("font-size", this.fontSize);
    this.textElement.setAttribute("font-family", this.fontFamily);
  }
  draw(context) {
    drawBase(this, context, (ctx) => {
      ctx.fillStyle = this.color;
      ctx.font = `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px "${this.fontFamily}"`;
      ctx.textAlign = this.anchor === "middle" ? "center" : this.anchor === "end" ? "right" : this.anchor;
      ctx.textBaseline = this.baseline === "central" ? "middle" : this.baseline;
      const rows = String(this.text ?? "").split("\n");
      rows.forEach((row, index) => ctx.fillText(row, 0, index * this.fontSize * 1.2));
    });
  }
}

export class BarObject extends GameObject {
  constructor(overrides = {}) {
    super({
      x: 0, y: 0, width: 240, height: 24, value: 1,
      background: "#334155", fill: "#22c55e", radius: 8, tags: ["bar"], shapes: [],
    }, overrides);
    this.collisionShapes = [Shapes.rectAt(0, 0, this.width, this.height)];
  }
  createElement() {
    this.element = element("g");
    this.backgroundElement = element("rect", { x: 0, y: 0, width: this.width, height: this.height, rx: this.radius });
    this.fillElement = element("rect", { x: 0, y: 0, width: 0, height: this.height, rx: this.radius });
    this.element.append(this.backgroundElement, this.fillElement);
    return this.element;
  }
  draw(context) {
    drawBase(this, context, (ctx) => {
      const amount = Math.max(0, Math.min(1, Number(this.value) || 0));
      roundedRect(ctx, 0, 0, this.width, this.height, this.radius);
      ctx.fillStyle = this.background;
      ctx.fill();
      roundedRect(ctx, 0, 0, this.width * amount, this.height, this.radius);
      ctx.fillStyle = this.fill;
      ctx.fill();
    });
  }
  updateElement() {
    super.updateElement();
    if (!this.fillElement) return;
    const amount = Math.max(0, Math.min(1, Number(this.value) || 0));
    this.fillElement.setAttribute("width", this.width * amount);
    this.fillElement.setAttribute("fill", this.fill);
    this.backgroundElement.setAttribute("fill", this.background);
  }
}

export class ButtonObject extends GameObject {
  constructor(label, overrides = {}) {
    super({
      x: 0, y: 0, width: 180, height: 48, label, fontSize: 18, radius: 8,
      color: "#ffffff", background: "#2563eb", hoverBackground: "#3b82f6",
      pressedBackground: "#1d4ed8", fontFamily: "sans-serif", shadow: true,
      hoverScale: 1.04, hoverLift: -2, hoverDuration: 0.12, onClick: null,
      tags: ["button"], shapes: [],
    }, overrides);
    this.hovered = false;
    this.pressed = false;
    this._hoverAmount = 0;
    this.collisionShapes = [Shapes.rectAt(0, 0, this.width, this.height)];
  }
  createElement() {
    this.element = element("g", { role: "button", "aria-label": this.label });
    this.element.setPointerCapture = () => this.engine?._captureObjectPointer(this);
    const hitbox = element("rect", { x: 0, y: 0, width: this.width, height: this.height, fill: "transparent" });
    this.element.append(hitbox);
    return this.element;
  }
  onStart() {
    this.element.addEventListener("pointerenter", () => { this.hovered = true; });
    this.element.addEventListener("pointerleave", () => { this.hovered = false; this.pressed = false; });
    this.element.addEventListener("pointerdown", () => { this.pressed = true; });
    this.element.addEventListener("pointerup", () => {
      if (this.pressed) this.onClick?.call(this, this);
      this.pressed = false;
    });
  }
  updateElement(dt = this.engine?.dt ?? 0) {
    super.updateElement();
    if (!this.element) return;
    const target = this.hovered ? 1 : 0;
    const duration = Math.max(.001, this.hoverDuration);
    this._hoverAmount += (target - this._hoverAmount) * Math.min(1, dt / duration);
    this.element.setAttribute("aria-label", this.label);
  }
  draw(context) {
    const amount = this._hoverAmount;
    const width = this.width * (1 + (this.hoverScale - 1) * amount);
    const height = this.height * (1 + (this.hoverScale - 1) * amount);
    drawBase(this, context, (ctx) => {
      ctx.translate(0, this.hoverLift * amount);
      if (this.shadow) {
        roundedRect(ctx, 0, 4, width, height, this.radius);
        ctx.fillStyle = "rgba(0,0,0,.32)";
        ctx.fill();
      }
      roundedRect(ctx, 0, 0, width, height, this.radius);
      ctx.fillStyle = this.pressed ? this.pressedBackground : (this.hovered ? this.hoverBackground : this.background);
      ctx.fill();
      ctx.fillStyle = this.color;
      ctx.font = `${this.fontSize}px "${this.fontFamily}"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.label, width / 2, height / 2);
    });
  }
}

export class SliderObject extends GameObject {
  constructor(overrides = {}) {
    super({
      x: 0, y: 0, width: 220, height: 28, min: 0, max: 1, value: .5,
      step: 0, track: "#475569", fill: "#38bdf8", thumb: "#f8fafc",
      onChange: null, tags: ["slider"], shapes: [],
    }, overrides);
    this.collisionShapes = [Shapes.rectAt(0, 0, this.width, this.height)];
    this.dragging = false;
  }
  createElement() {
    this.element = element("g", { role: "slider", "aria-valuemin": this.min, "aria-valuemax": this.max });
    const hitbox = element("rect", { x: -8, y: 0, width: this.width + 16, height: this.height, fill: "transparent" });
    this.element.setPointerCapture = () => this.engine?._captureObjectPointer(this);
    this.element.append(hitbox);
    return this.element;
  }
  onStart() {
    this.element.addEventListener("pointerenter", () => { this.hovered = true; });
    this.element.addEventListener("pointerleave", () => { if (!this.dragging) this.hovered = false; });
    this.element.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.element.setPointerCapture?.(event.pointerId);
      this._setFromPointer(event);
    });
    this.element.addEventListener("pointermove", (event) => { if (this.dragging) this._setFromPointer(event); });
    const finish = () => { this.dragging = false; this.hovered = false; };
    this.element.addEventListener("pointerup", finish);
    this.element.addEventListener("pointercancel", finish);
  }
  _setFromPointer(event) {
    const point = this.engine.pointerToLogical(event);
    const local = objectLocalPoint(this, point).x / (this.width || 1);
    let next = this.min + Math.max(0, Math.min(1, local)) * (this.max - this.min);
    if (this.step > 0) next = this.min + Math.round((next - this.min) / this.step) * this.step;
    next = Math.max(this.min, Math.min(this.max, next));
    if (next !== this.value) {
      this.value = next;
      this.onChange?.call(this, next, this);
    }
  }
  updateElement() {
    super.updateElement();
    this.element?.setAttribute("aria-valuenow", this.value);
  }
  draw(context) {
    const fraction = Math.max(0, Math.min(1, (this.value - this.min) / (this.max - this.min || 1)));
    drawBase(this, context, (ctx) => {
      ctx.fillStyle = this.track;
      ctx.fillRect(0, this.height / 2 - 3, this.width, 6);
      ctx.fillStyle = this.fill;
      ctx.fillRect(0, this.height / 2 - 3, this.width * fraction, 6);
      ctx.beginPath();
      ctx.arc(this.width * fraction, this.height / 2, this.dragging || this.hovered ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = this.thumb;
      ctx.fill();
    });
  }
}

export class TextInputObject extends GameObject {
  constructor(overrides = {}) {
    super({
      x: 0, y: 0, width: 220, height: 42, value: "", placeholder: "",
      label: "Text input", fontSize: 18, fontFamily: "sans-serif",
      color: "#f8fafc", background: "#1e293b", border: "#64748b",
      maxLength: 0, onInput: null, onChange: null, tags: ["text-input"], shapes: [],
    }, overrides);
    this.collisionShapes = [Shapes.rectAt(0, 0, this.width, this.height)];
  }
  createElement() {
    this.element = element("g", { role: "textbox", "aria-label": this.label });
    const hitbox = element("rect", { x: 0, y: 0, width: this.width, height: this.height, fill: "transparent" });
    this.element.setPointerCapture = () => this.engine?._captureObjectPointer(this);
    this.element.append(hitbox);
    return this.element;
  }
  onStart() {
    const input = document.createElement("input");
    input.type = "text";
    input.value = String(this.value ?? "");
    input.placeholder = this.placeholder;
    input.maxLength = this.maxLength > 0 ? this.maxLength : 524288;
    input.setAttribute("aria-label", this.label);
    Object.assign(input.style, {
      position: "fixed", left: "-10000px", top: "0", width: "1px", height: "1px",
      opacity: "0", outline: "none", border: "0", padding: "0", pointerEvents: "none",
    });
    document.body.append(input);
    this.inputElement = input;
    input.addEventListener("input", () => {
      this.value = input.value;
      this.onInput?.call(this, this.value, this);
    });
    input.addEventListener("change", () => this.onChange?.call(this, this.value, this));
    this.element.addEventListener("pointerdown", () => input.focus({ preventScroll: true }));
  }
  focus() { this.inputElement?.focus({ preventScroll: true }); return this; }
  blur() { this.inputElement?.blur(); return this; }
  draw(context) {
    drawBase(this, context, (ctx) => {
      ctx.fillStyle = this.background;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.strokeStyle = this.border;
      ctx.strokeRect(0, 0, this.width, this.height);
      ctx.font = `${this.fontSize}px "${this.fontFamily}"`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = this.value ? this.color : "#94a3b8";
      const text = this.value || this.placeholder;
      ctx.save();
      ctx.beginPath();
      ctx.rect(8, 0, this.width - 16, this.height);
      ctx.clip();
      ctx.fillText(text, 8, this.height / 2);
      ctx.restore();
    });
  }
  dispose() {
    this.inputElement?.remove();
    this.element?.remove();
    this._removed = true;
  }
}

export class NumberInputObject extends TextInputObject {
  constructor(overrides = {}) {
    super({ inputMode: "decimal", ...overrides, tags: ["number-input", ...(overrides.tags ?? [])] });
    this.min = overrides.min ?? -Infinity;
    this.max = overrides.max ?? Infinity;
    this.step = overrides.step ?? 1;
  }
  onStart() {
    super.onStart();
    this.inputElement.type = "number";
    this.inputElement.inputMode = this.inputMode ?? "decimal";
    if (Number.isFinite(this.min)) this.inputElement.min = this.min;
    if (Number.isFinite(this.max)) this.inputElement.max = this.max;
    this.inputElement.step = this.step;
    this.inputElement.addEventListener("input", () => {
      if (this.inputElement.value === "" || this.inputElement.value === "-") return;
      const value = Number(this.inputElement.value);
      if (Number.isFinite(value)) this.value = Math.max(this.min, Math.min(this.max, value));
    });
  }
  get numberValue() { return Number(this.value) || 0; }
  set numberValue(value) { this.value = String(Math.max(this.min, Math.min(this.max, Number(value)))); }
}

export class ImageObject extends GameObject {
  constructor(src, overrides = {}) {
    super({ src, x: 0, y: 0, width: 100, height: 100, tags: ["image"], shapes: [] }, overrides);
    this.collisionShapes = overrides.collisionShapes ?? [Shapes.rectAt(0, 0, this.width, this.height)];
  }
  onStart() {
    if (this.image || this._loading) return;
    this._loading = this.engine.loadImage(this.src).then((image) => {
      this.image = image;
      this.engine.render();
      this.onLoad?.call(this, image);
    }).catch((error) => {
      this.loadError = error;
      console.error(`Failed to load image: ${this.src}`, error);
      this.onLoadError?.call(this, error);
    });
  }
  draw(context) {
    if (!this.image) return;
    drawBase(this, context, (ctx) => ctx.drawImage(this.image, 0, 0, this.width, this.height));
  }
}

export class SpriteAnimationObject extends ImageObject {
  constructor(frames, overrides = {}) {
    super("", { ...overrides, tags: ["animation", ...(overrides.tags ?? [])] });
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new TypeError("SpriteAnimationObject requires at least one frame URL.");
    }
    this.frames = frames;
    this.frameIndex = 0;
    this.frameDuration = Number(overrides.frameDuration ?? .1);
    if (!Number.isFinite(this.frameDuration) || this.frameDuration <= 0) {
      throw new RangeError("SpriteAnimationObject frameDuration must be positive.");
    }
    this.loop = overrides.loop ?? true;
    this._frameElapsed = 0;
  }
  onStart() {
    if (this._loading) return;
    this._loading = Promise.all(this.frames.map((url) => this.engine.loadImage(url))).then((images) => {
      this.images = images;
      this.image = images[0] ?? null;
      this.engine.render();
      this.onLoad?.call(this, images);
    }).catch((error) => {
      this.loadError = error;
      console.error("Failed to load sprite animation frame.", error);
      this.onLoadError?.call(this, error);
    });
  }
  onUpdate(dt) {
    if (!this.images?.length || this.frames.length < 2) return;
    this._frameElapsed += dt;
    while (this._frameElapsed >= this.frameDuration) {
      this._frameElapsed -= this.frameDuration;
      if (this.frameIndex + 1 >= this.images.length) {
        if (!this.loop) { this.frameIndex = this.images.length - 1; break; }
        this.frameIndex = 0;
      } else this.frameIndex++;
      this.image = this.images[this.frameIndex];
    }
  }
}
