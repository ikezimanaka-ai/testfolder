const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["circle", "ellipse", "rect", "line", "polygon", "polyline", "path", "text", "image", "g"]);

class Input {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.pointer = { x: 0, y: 0, down: false, pressed: false, released: false, button: -1 };
    window.addEventListener("keydown", (event) => {
      const target = event.target;
      const textEntry = target instanceof HTMLElement &&
        (target.matches("input, textarea, select") || target.isContentEditable);
      if (textEntry) return;
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
  pointerDown() { return this.pointer.down; }
  pointerPressed() { return this.pointer.pressed; }
  pointerReleased() { return this.pointer.released; }
  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
    this.pointer.pressed = false;
    this.pointer.released = false;
  }
  clear() {
    this.keys.clear();
    this.justPressed.clear();
    this.justReleased.clear();
    if (this.pointer.down) this.pointer.released = true;
    this.pointer.down = false;
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
  return element;
}

function pointList(points) {
  if (typeof points === "string") {
    return points.trim().split(/\s+/).map((pair) => pair.split(",").map(Number))
      .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
  }
  return (points ?? []).map((point) => Array.isArray(point) ? point : [point.x, point.y]);
}

function shapeBounds(shape) {
  if (!shape) return { x: 0, y: 0, width: 0, height: 0 };
  const number = (key, fallback = 0) => Number(shape[key] ?? shape.getAttribute?.(key) ?? fallback) || 0;
  const type = shape.type ?? shape.tagName?.toLowerCase();
  if (type === "circle") {
    const r = number("r");
    return { x: number("cx") - r, y: number("cy") - r, width: r * 2, height: r * 2 };
  }
  if (type === "ellipse") {
    const rx = number("rx");
    const ry = number("ry");
    return { x: number("cx") - rx, y: number("cy") - ry, width: rx * 2, height: ry * 2 };
  }
  if (type === "line") {
    const x1 = number("x1"), x2 = number("x2"), y1 = number("y1"), y2 = number("y2");
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  }
  if (type === "polygon" || type === "polyline") {
    const points = pointList(shape.points ?? shape.getAttribute?.("points"));
    if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
    const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  if (type === "text") {
    const text = shape.text ?? shape.textContent ?? "";
    const size = number("fontSize", number("font-size", 16));
    const x = number("x"), y = number("y");
    return { x, y: y - size, width: Math.max(size / 2, text.length * size * .65), height: size * 1.2 };
  }
  if (type === "image") return { x: number("x"), y: number("y"), width: number("width"), height: number("height") };
  return { x: number("x"), y: number("y"), width: number("width"), height: number("height") };
}

function shapeFromElement(element, bounds = shapeBounds(element)) {
  if (!element?.tagName || !SVG_TAGS.has(element.tagName.toLowerCase())) return null;
  const type = element.tagName.toLowerCase();
  const read = (key, fallback = 0) => Number(element.getAttribute(key) ?? fallback) || 0;
  if (type === "circle") return { type, cx: read("cx"), cy: read("cy"), r: read("r") };
  if (type === "ellipse") return { type, cx: read("cx"), cy: read("cy"), rx: read("rx"), ry: read("ry") };
  if (type === "rect") return { type, x: read("x"), y: read("y"), width: read("width"), height: read("height") };
  if (type === "line") return { type, x1: read("x1"), y1: read("y1"), x2: read("x2"), y2: read("y2") };
  if (type === "polygon" || type === "polyline") return { type, points: pointList(element.getAttribute("points")) };
  if (type === "text") return { type, x: read("x"), y: read("y"), text: element.textContent ?? "", fontSize: read("font-size", 16) };
  if (type === "image") return { type: "rect", x: read("x"), y: read("y"), width: read("width"), height: read("height") };
  return { type: "rect", ...bounds };
}

function localVertices(shape) {
  const type = shape.type ?? shape.tagName?.toLowerCase();
  if (type === "line") {
    const x1 = Number(shape.x1 ?? shape.getAttribute?.("x1") ?? 0) || 0;
    const x2 = Number(shape.x2 ?? shape.getAttribute?.("x2") ?? 0) || 0;
    const y1 = Number(shape.y1 ?? shape.getAttribute?.("y1") ?? 0) || 0;
    const y2 = Number(shape.y2 ?? shape.getAttribute?.("y2") ?? 0) || 0;
    const pad = Math.max(1, Number(shape.strokeWidth ?? shape.getAttribute?.("stroke-width")) || 1) / 2;
    const left = Math.min(x1, x2) - pad, right = Math.max(x1, x2) + pad;
    const top = Math.min(y1, y2) - pad, bottom = Math.max(y1, y2) + pad;
    return [[left, top], [right, top], [right, bottom], [left, bottom]];
  }
  if (type === "circle" || type === "ellipse") {
    const cx = Number(shape.cx ?? shape.getAttribute?.("cx") ?? 0) || 0;
    const cy = Number(shape.cy ?? shape.getAttribute?.("cy") ?? 0) || 0;
    const rx = Number(shape.r ?? shape.getAttribute?.("r") ?? shape.rx ?? shape.getAttribute?.("rx") ?? 0) || 0;
    const ry = Number(shape.r ?? shape.getAttribute?.("r") ?? shape.ry ?? shape.getAttribute?.("ry") ?? 0) || 0;
    return Array.from({ length: 32 }, (_, i) => [cx + rx * Math.cos(i * Math.PI / 16), cy + ry * Math.sin(i * Math.PI / 16)]);
  }
  if (type === "polygon" || type === "polyline") return pointList(shape.points ?? shape.getAttribute?.("points"));
  const bounds = shapeBounds(shape);
  return [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
  ];
}

function transformedVertices(object, shape) {
  const radians = object.rotation * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const skewX = Math.tan((object.skewX ?? 0) * Math.PI / 180);
  const skewY = Math.tan((object.skewY ?? 0) * Math.PI / 180);
  return localVertices(shape).map(([x, y]) => {
    const skewedX = x + y * skewX;
    const skewedY = y + x * skewY;
    x = skewedX * object.scaleX;
    y = skewedY * object.scaleY;
    return [object.x + x * cos - y * sin, object.y + x * sin + y * cos];
  });
}

function boundsForPoints(points) {
  if (!points.length) return { left: 0, top: 0, right: 0, bottom: 0 };
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function polygonsIntersect(a, b) {
  const area = (points) => points.reduce((total, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return total + x * nextY - nextX * y;
  }, 0) / 2;
  if (a.length < 3 || b.length < 3 || Math.abs(area(a)) < 1e-9 || Math.abs(area(b)) < 1e-9) return false;
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i], p2 = polygon[(i + 1) % polygon.length];
      const axis = [p2[1] - p1[1], p1[0] - p2[0]];
      if (Math.hypot(...axis) < 1e-9) continue;
      const project = (points) => points.map(([x, y]) => x * axis[0] + y * axis[1]);
      const pa = project(a), pb = project(b);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  }
  return true;
}

function tagsMatch(object, criteria) {
  if (typeof criteria === "string" || Array.isArray(criteria)) return object.hasTags(criteria);
  if (typeof criteria === "function") return criteria(object);
  if (!criteria || typeof criteria !== "object") return true;
  if (criteria.tags && !object.hasTags(criteria.tags)) return false;
  if (criteria.anyTags && !(Array.isArray(criteria.anyTags) || criteria.anyTags instanceof Set
    ? [...criteria.anyTags] : [criteria.anyTags]).some((tag) => object.hasTag(tag))) return false;
  if (criteria.notTags && (Array.isArray(criteria.notTags) || criteria.notTags instanceof Set
    ? [...criteria.notTags] : [criteria.notTags]).some((tag) => object.hasTag(tag))) return false;
  for (const key of ["x", "y", "width", "height", "rotation", "opacity"]) {
    const condition = criteria[key];
    if (condition === undefined) continue;
    if (typeof condition === "number" && object[key] !== condition) return false;
    if (condition && typeof condition === "object") {
      if (condition.min !== undefined && object[key] < condition.min) return false;
      if (condition.max !== undefined && object[key] > condition.max) return false;
      if (condition.equals !== undefined && object[key] !== condition.equals) return false;
    }
  }
  for (const [key, value] of Object.entries(criteria.where ?? {})) {
    const actual = object.getPrivate(key) ?? object[key];
    if (typeof value === "function" ? !value(actual, object) : actual !== value) return false;
  }
  return true;
}

function drawDescriptor(context, shape, object) {
  const type = shape.type ?? shape.tagName?.toLowerCase();
  if (!type) return;
  context.save();
  const attr = (key, fallback = 0) => Number(shape[key] ?? shape.getAttribute?.(key) ?? fallback) || 0;
  const style = shape.style ?? {};
  const inherited = object.element;
  const readStyle = (key, fallback) => shape[key] ?? shape.getAttribute?.(key) ??
    style[key] ?? style.getPropertyValue?.(key) ?? inherited?.getAttribute?.(key) ?? fallback;
  const fill = readStyle("fill", object.fill ?? "#000");
  const stroke = readStyle("stroke", object.stroke ?? "transparent");
  context.fillStyle = fill === "none" ? "transparent" : fill;
  context.strokeStyle = stroke === "none" ? "transparent" : stroke;
  context.lineWidth = Number(readStyle("stroke-width", object.lineWidth ?? 1)) || 1;
  const opacity = Number(readStyle("opacity", 1));
  context.globalAlpha *= Number.isFinite(opacity) ? opacity : 1;
  context.beginPath();
  if (type === "rect") {
    context.rect(attr("x"), attr("y"), attr("width"), attr("height"));
  } else if (type === "roundRect") {
    const x = attr("x"), y = attr("y"), w = attr("width"), h = attr("height");
    const radius = Math.min(attr("radius", 8), Math.abs(w) / 2, Math.abs(h) / 2);
    context.roundRect(x, y, w, h, radius);
  } else if (type === "circle") {
    context.arc(attr("cx"), attr("cy"), Math.max(0, attr("r")), 0, Math.PI * 2);
  } else if (type === "ellipse") {
    context.ellipse(attr("cx"), attr("cy"), Math.max(0, attr("rx")), Math.max(0, attr("ry")), 0, 0, Math.PI * 2);
  } else if (type === "line") {
    context.moveTo(attr("x1"), attr("y1"));
    context.lineTo(attr("x2"), attr("y2"));
  } else if (type === "polygon" || type === "polyline") {
    const points = pointList(shape.points);
    if (points.length) {
      context.moveTo(...points[0]);
      for (const point of points.slice(1)) context.lineTo(...point);
      if (type === "polygon") context.closePath();
    }
  } else if (type === "text") {
    context.font = `${shape.fontStyle ?? "normal"} ${attr("fontSize", 16)}px ${shape.fontFamily ?? "sans-serif"}`;
    const align = shape.align ?? "left";
    context.textAlign = align === "middle" ? "center" : align === "start" ? "left" : align === "end" ? "right" : align;
    const baseline = shape.baseline ?? "alphabetic";
    context.textBaseline = baseline === "central" ? "middle" : baseline;
    context.fillText(shape.text ?? "", attr("x"), attr("y"));
    context.restore();
    return;
  } else {
    return;
  }
  if (type !== "line" && type !== "polyline" && fill !== "none" && fill !== "transparent") context.fill();
  if (context.strokeStyle !== "transparent" && context.lineWidth > 0) context.stroke();
  context.restore();
}

function svgShapeDataUrl(shape, object, bounds = object._getShapeBounds(shape)) {
  const width = Math.max(1, bounds.width || object.width || 100);
  const height = Math.max(1, bounds.height || object.height || 100);
  const clone = shape.cloneNode(true);
  const groupStyle = ["fill", "stroke", "stroke-width", "opacity"].map((key) => {
    const value = object.element?.getAttribute(key);
    return value === null || value === undefined ? "" : `${key}:${value};`;
  }).join("");
  const markup = `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="${bounds.x} ${bounds.y} ${width} ${height}"><g style="${groupStyle}">${new XMLSerializer().serializeToString(clone)}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

export const Shapes = Object.freeze({
  rect: (width, height, style = {}) => ({ type: "rect", x: -width / 2, y: -height / 2, width, height, ...style }),
  rectAt: (x, y, width, height, style = {}) => ({ type: "rect", x, y, width, height, ...style }),
  roundRect: (width, height, radius = 8, style = {}) => ({ type: "roundRect", x: -width / 2, y: -height / 2, width, height, radius, ...style }),
  circle: (radius, style = {}) => ({ type: "circle", cx: 0, cy: 0, r: radius, ...style }),
  ellipse: (rx, ry, style = {}) => ({ type: "ellipse", cx: 0, cy: 0, rx, ry, ...style }),
  line: (x1, y1, x2, y2, style = {}) => ({ type: "line", x1, y1, x2, y2, ...style }),
  polygon: (points, style = {}) => ({ type: "polygon", points: pointList(points), ...style }),
  text: (text, style = {}) => ({ type: "text", text: String(text), x: 0, y: 0, ...style }),
});

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
    this.skewX ??= 0;
    this.skewY ??= 0;
    this.opacity ??= 1;
    this.tags = new Set(this.tags ?? []);
    this.shapes = this.shapes ?? [];
    this.collisionShapes = this.collisionShapes ?? this.shapes;
    this.display = null;
    this.engine = null;
    this.element = null;
    this._initialized = false;
    this._private = new Map();
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
  hasTags(tags) { return [...(Array.isArray(tags) || tags instanceof Set ? tags : [tags])].every((tag) => this.hasTag(tag)); }
  setPrivate(key, value) {
    if (key && typeof key === "object") {
      for (const [name, item] of Object.entries(key)) this._private.set(name, item);
      return this;
    }
    this._private.set(key, value);
    return this;
  }
  SetPrivate(key, value) { return this.setPrivate(key, value); }
  getPrivate(key, fallback) { return this._private.has(key) ? this._private.get(key) : fallback; }
  destroy() {
    this._removed = true;
    if (this.dispose) this.dispose();
    else this.element?.remove();
    this.onDestroy?.call(this);
    return this;
  }
  getObject(criteria) { return this.display?.getObjects(criteria) ?? []; }
  touching(criteria) { return this.getObject(criteria).filter((other) => other !== this && this.intersects(other)); }
  touchTag(tag) { return this.touching(tag).length > 0; }
  intersects(other) {
    const ownShapes = this.collisionShapes.map((shape) => this._shapeDescriptor(shape)).filter(Boolean);
    const otherShapes = other.collisionShapes.map((shape) => other._shapeDescriptor(shape)).filter(Boolean);
    return ownShapes.some((shape) => otherShapes.some((otherShape) => {
      const a = transformedVertices(this, shape), b = transformedVertices(other, otherShape);
      return polygonsIntersect(a, b);
    }));
  }
  containsPoint(x, y) {
    const point = [x, y];
    return this.collisionShapes.some((shape) => {
      const descriptor = this._shapeDescriptor(shape);
      const vertices = transformedVertices(this, descriptor);
      let inside = false;
      for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
        if (((yi > point[1]) !== (yj > point[1])) &&
            (point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || Number.EPSILON) + xi)) inside = !inside;
      }
      return inside;
    });
  }
  createElement() {
    this.element = svgElement("g");
    this.element.style.pointerEvents = "none";
    this.element.setPointerCapture = () => this.engine?._captureObjectPointer(this);
    this._shapeNodes = [];
    for (const shape of this.shapes) {
      if (shape?.nodeType) {
        const clone = shape.cloneNode(true);
        clone.style.pointerEvents = "none";
        this._shapeNodes.push(clone);
        this.element.append(clone);
      } else if (shape?.type) {
        const proxy = this._makeProxyShape(shape);
        proxy.style.pointerEvents = "none";
        this._shapeNodes.push(proxy);
        this.element.append(proxy);
      }
    }
    return this.element;
  }
  _getShapeBounds(shape) {
    const index = this.shapes.indexOf(shape);
    if (index >= 0) {
      try {
        const bounds = this._shapeNodes?.[index]?.getBBox();
        if (bounds && (bounds.width || bounds.height)) {
          return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        }
      } catch {
        return shapeBounds(shape);
      }
    }
    return shapeBounds(shape);
  }
  _shapeDescriptor(shape) {
    if (!shape?.nodeType) return shape;
    const bounds = this._getShapeBounds(shape);
    return shapeFromElement(shape, bounds);
  }
  _makeProxyShape(shape) {
    const type = shape.type === "roundRect" ? "rect" : shape.type;
    const attributes = { ...shape };
    delete attributes.type;
    delete attributes.text;
    delete attributes.points;
    if (shape.type === "roundRect") attributes.rx = shape.radius;
    if (shape.type === "polygon" && Array.isArray(shape.points)) attributes.points = shape.points.map((point) => point.join(",")).join(" ");
    const node = svgElement(type, attributes);
    if (shape.text !== undefined) node.textContent = shape.text;
    return node;
  }
  updateElement() {
    if (!this.element) return;
    this.element.setAttribute("transform", `translate(${this.x} ${this.y}) rotate(${this.rotation}) skewX(${this.skewX}) skewY(${this.skewY}) scale(${this.scaleX} ${this.scaleY})`);
    this.element.setAttribute("opacity", this.opacity);
    this.element.setAttribute("display", this.opacity <= 0 || this._removed ? "none" : "inline");
  }
  _drawContent(context) {
    for (const shape of this.shapes) {
      if (shape?.nodeType) this.engine?._drawSvgShape(context, shape, this);
      else drawDescriptor(context, shape, this);
    }
    this.onDraw?.call(this, context, this.engine?.dt ?? 0, this.engine);
  }
  draw(context) {
    if (this.opacity <= 0 || this._removed || this.element && !this.element.isConnected) return;
    context.save();
    context.translate(this.x, this.y);
    context.rotate(this.rotation * Math.PI / 180);
    context.scale(this.scaleX, this.scaleY);
    context.transform(1, Math.tan(this.skewY * Math.PI / 180), Math.tan(this.skewX * Math.PI / 180), 1, 0, 0);
    context.globalAlpha *= Math.max(0, Math.min(1, this.opacity));
    if (this.mosaic) this.engine?._drawMosaic(context, this, (target) => this._drawContent(target));
    else this._drawContent(context);
    if (this.engine?.debug?.hitboxes) this.engine._drawHitboxes(context, this);
    context.restore();
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
    this.element.style.pointerEvents = "none";
    this.clipId = `${this.engine.filterId}-clip-${this.engine.displays.length}`;
    const clip = svgElement("clipPath", { id: this.clipId, clipPathUnits: "userSpaceOnUse" });
    clip.append(svgElement("rect", { x: 0, y: 0, width: this.width, height: this.height }));
    this.engine._defs.append(clip);
    this.element.setAttribute("clip-path", `url(#${this.clipId})`);
    for (const object of this.objects) this.element.append(object.element);
    return this.element;
  }
  addObject(object, overrides = {}) {
    const gameObject = object instanceof GameObject ? object : new GameObject(object, overrides);
    if (object instanceof GameObject) Object.assign(gameObject, overrides);
    gameObject.display = this;
    gameObject.engine = this.engine;
    gameObject.createElement();
    gameObject.updateElement();
    this.objects.push(gameObject);
    this.element?.append(gameObject.element);
    if (this.engine?.running) {
      gameObject._initialized = true;
      gameObject.onStart?.call(gameObject, this.engine);
    }
    return gameObject;
  }
  getObjects(criteria) { return this.objects.filter((object) => tagsMatch(object, criteria)); }
  bringToFront(object) {
    const index = this.objects.indexOf(object);
    if (index < 0) throw new Error("Object must belong to this Display.");
    this.objects.splice(index, 1);
    this.objects.push(object);
    this.element?.append(object.element);
    this.engine?.render();
    return object;
  }
  sendToBack(object) {
    const index = this.objects.indexOf(object);
    if (index < 0) throw new Error("Object must belong to this Display.");
    this.objects.splice(index, 1);
    this.objects.unshift(object);
    this.element?.insertBefore(object.element, this.element.children[0] ?? null);
    this.engine?.render();
    return object;
  }
  start() {
    this.onStart?.call(this, this.engine);
    for (const object of this.objects) {
      if (!object._initialized) {
        object._initialized = true;
        object.onStart?.call(object, this.engine);
      }
    }
  }
  update(dt) {
    this.onUpdate?.call(this, dt, this.engine);
    let activeCount = 0;
    for (const object of this.objects) {
      if (object._removed) continue;
      object.onUpdate?.call(object, dt, this.engine);
      if (object._removed) continue;
      object.updateElement(dt);
      this.objects[activeCount++] = object;
    }
    this.objects.length = activeCount;
  }
  draw(context) {
    context.save();
    context.translate(this.x, this.y);
    context.beginPath();
    context.rect(0, 0, this.width, this.height);
    context.clip();
    if (this.background) {
      context.fillStyle = this.background;
      context.fillRect(0, 0, this.width, this.height);
    }
    for (const object of this.objects) object.draw(context);
    if (this.engine?.debug?.displays) {
      context.strokeStyle = "#facc15";
      context.lineWidth = 1;
      context.strokeRect(0, 0, this.width, this.height);
    }
    context.restore();
  }
}

export class Engine {
  constructor(canvas, fps = 60, logicalWidth = 800, logicalHeight = 450) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("Engine requires a canvas element.");
    if (logicalWidth <= 0 || logicalHeight <= 0) throw new RangeError("Engine logical size must be positive.");
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) throw new Error("Engine could not create a 2D canvas context.");
    this.fps = fps;
    this._frameInterval = Number.isFinite(fps) && fps > 0 ? 1000 / fps : 0;
    this.logicalWidth = logicalWidth;
    this.logicalHeight = logicalHeight;
    this.dt = 0;
    this.displays = [];
    if (typeof globalThis.GameStudio?._registerEngine === "function") globalThis.GameStudio._registerEngine(this);
    this.running = false;
    this.debug = { hitboxes: false, displays: false, fps: false };
    this._lastTime = 0;
    this._frameRequest = 0;
    this._svgImageCache = new Map();
    this.filterId = `canvas-engine-${Math.random().toString(36).slice(2)}`;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._pointerEventListeners = [];
    this._canvasEventListeners = [];
    this.svg = svgElement("svg", { preserveAspectRatio: "none" });
    this.svg.style.position = "absolute";
    this.svg.style.inset = "0";
    this.svg.style.width = "100%";
    this.svg.style.height = "100%";
    this.svg.style.overflow = "hidden";
    this.svg.style.opacity = "0";
    this.svg.style.pointerEvents = "none";
    this.svg.setAttribute("aria-hidden", "true");
    this._defs = svgElement("defs");
    this.svg.append(this._defs);
    const parent = canvas.parentElement;
    if (!parent) throw new Error("Canvas must have a parent element.");
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    parent.append(this.svg);
    this._resizeObserver.observe(parent);
    this._bindPointerEvents(canvas);
    this.canvas.style.touchAction = "none";
    for (const type of ["selectstart", "dragstart", "contextmenu"]) {
      const listener = (event) => event.preventDefault();
      this.canvas.addEventListener(type, listener);
      this._canvasEventListeners.push([type, listener]);
    }
    this.resize();
  }
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this._pixelRatio = ratio;
    this._scale = Math.min(rect.width / this.logicalWidth, rect.height / this.logicalHeight) || 1;
    this._offsetX = (rect.width - this.logicalWidth * this._scale) / 2;
    this._offsetY = (rect.height - this.logicalHeight * this._scale) / 2;
    this.svg.setAttribute("viewBox", `0 0 ${this.logicalWidth} ${this.logicalHeight}`);
    this.svg.setAttribute("width", rect.width);
    this.svg.setAttribute("height", rect.height);
    this.svg.style.left = `${this._offsetX}px`;
    this.svg.style.top = `${this._offsetY}px`;
    this.svg.style.width = `${this.logicalWidth * this._scale}px`;
    this.svg.style.height = `${this.logicalHeight * this._scale}px`;
    this.render();
  }
  pointerToLogical(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - this._offsetX) / this._scale,
      y: (event.clientY - rect.top - this._offsetY) / this._scale,
    };
  }
  _bindPointerEvents(target) {
    const register = (type, handler) => {
      target.addEventListener(type, handler);
      this._pointerEventListeners.push([target, type, handler]);
    };
    const update = (event, state) => {
      const point = this.pointerToLogical(event);
      Object.assign(INPUT.pointer, point);
      if (state === "down" && !INPUT.pointer.down) INPUT.pointer.pressed = true;
      if ((state === "up" || state === "cancel") && INPUT.pointer.down) INPUT.pointer.released = true;
      if (state === "down") INPUT.pointer.down = true;
      if (state === "up" || state === "cancel") INPUT.pointer.down = false;
      INPUT.pointer.button = event.button ?? -1;
      if (state === "move") {
        const hit = this._hitTest(point);
        if (hit !== this._hoveredObject) {
          this._dispatchPointer(this._hoveredObject, "pointerleave", event);
          this._hoveredObject = hit;
          this._dispatchPointer(hit, "pointerenter", event);
        }
        this._dispatchPointer(this._pointerTarget ?? hit, "pointermove", event);
      } else if (state === "down") {
        this._pointerTarget = this._hitTest(point);
        if (this._pointerTarget && event.isTrusted) {
          try {
            target.setPointerCapture(event.pointerId);
          } catch (error) {
            console.warn("Canvas pointer capture is unavailable; dragging may stop outside the canvas.", error);
          }
        }
        this._dispatchPointer(this._pointerTarget, "pointerdown", event);
      } else {
        this._dispatchPointer(this._pointerTarget ?? this._hitTest(point), state === "up" ? "pointerup" : "pointercancel", event);
        this._pointerTarget = null;
        const hit = this._hitTest(point);
        if (hit !== this._hoveredObject) {
          this._dispatchPointer(this._hoveredObject, "pointerleave", event);
          this._hoveredObject = hit;
          this._dispatchPointer(hit, "pointerenter", event);
        }
      }
    };
    register("pointermove", (event) => update(event, "move"));
    register("pointerdown", (event) => update(event, "down"));
    register("pointerup", (event) => update(event, "up"));
    register("pointercancel", (event) => update(event, "cancel"));
    register("pointerleave", (event) => {
      if (this._pointerTarget) return;
      this._dispatchPointer(this._hoveredObject, "pointerleave", event);
      this._hoveredObject = null;
    });
  }
  _hitTest(point) {
    for (const display of [...this.displays].reverse()) {
      const x = point.x - display.x, y = point.y - display.y;
      if (x < 0 || y < 0 || x > display.width || y > display.height) continue;
      for (const object of [...display.objects].reverse()) {
        if (object.opacity > 0 && !object._removed && object.element?.isConnected && object.containsPoint(x, y)) return object;
      }
    }
    return null;
  }
  _dispatchPointer(object, type, sourceEvent) {
    if (!object?.element) return;
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: sourceEvent.pointerId ?? 1,
      pointerType: sourceEvent.pointerType ?? "mouse",
      isPrimary: sourceEvent.isPrimary ?? true,
      clientX: sourceEvent.clientX,
      clientY: sourceEvent.clientY,
      button: sourceEvent.button ?? 0,
      buttons: sourceEvent.buttons ?? 0,
      pressure: sourceEvent.pressure ?? 0,
      altKey: sourceEvent.altKey,
      ctrlKey: sourceEvent.ctrlKey,
      metaKey: sourceEvent.metaKey,
      shiftKey: sourceEvent.shiftKey,
    });
    object.element.dispatchEvent(event);
    if (event.defaultPrevented) sourceEvent.preventDefault();
  }
  _captureObjectPointer(object) {
    this._pointerTarget = object;
  }
  newDisplay(display, x = display.x, y = display.y) {
    if (!(display instanceof Display)) throw new TypeError("newDisplay requires a Display.");
    display.x = x;
    display.y = y;
    display.engine = this;
    display.createElement();
    this.displays.push(display);
    this.svg.append(display.element);
    for (const object of display.objects) {
      object.engine = this;
      object.updateElement();
    }
    if (this.running) display.start();
    this.render();
    return display;
  }
  addObject(display, object, overrides = {}) {
    if (!this.displays.includes(display)) throw new Error("Display must be added to this Engine first.");
    const result = display.addObject(object, overrides);
    this.render();
    return result;
  }
  async loadImage(url) {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  }
  async loadSVG(url) {
    const image = await this.loadImage(url);
    return image;
  }
  async loadFont(family, url, descriptors = {}) {
    const font = new FontFace(family, `url("${url}")`, descriptors);
    await font.load();
    document.fonts.add(font);
    return font;
  }
  setDebug(options = true) {
    this.debug = typeof options === "boolean"
      ? { hitboxes: options, displays: options, fps: false }
      : { ...this.debug, ...options };
    this.render();
    return this;
  }
  getObjects(criteria) { return this.displays.flatMap((display) => display.getObjects(criteria)); }
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
  destroy() {
    this.stop();
    this._resizeObserver.disconnect();
    for (const [target, type, listener] of this._pointerEventListeners) {
      target.removeEventListener(type, listener);
    }
    this._pointerEventListeners.length = 0;
    for (const [type, listener] of this._canvasEventListeners) {
      this.canvas.removeEventListener(type, listener);
    }
    this._canvasEventListeners.length = 0;
    for (const display of this.displays) {
      for (const object of display.objects) object.dispose?.();
    }
    this.svg.remove();
  }
  _frame(time) {
    if (!this.running) return;
    const elapsed = time - this._lastTime;
    if (this._frameInterval && elapsed < this._frameInterval - 0.5) {
      this._frameRequest = requestAnimationFrame((nextTime) => this._frame(nextTime));
      return;
    }
    this.dt = Math.min(elapsed / 1000, 0.25);
    this._lastTime = time;
    for (const display of this.displays) display.update(this.dt);
    this.render();
    INPUT.endFrame();
    this._frameRequest = requestAnimationFrame((nextTime) => this._frame(nextTime));
  }
  render() {
    if (!this.ctx) return;
    const context = this.ctx;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(this._pixelRatio * this._scale, 0, 0, this._pixelRatio * this._scale,
      this._pixelRatio * this._offsetX, this._pixelRatio * this._offsetY);
    for (const display of this.displays) display.draw(context);
    if (this.debug.fps) {
      context.fillStyle = "#facc15";
      context.font = "14px monospace";
      context.fillText(`FPS ${this.dt ? (1 / this.dt).toFixed(1) : "--"}`, 8, 18);
    }
  }
  _drawSvgShape(context, shape, object) {
    const bounds = object._getShapeBounds(shape);
    const url = svgShapeDataUrl(shape, object, bounds);
    let image = this._svgImageCache.get(url);
    if (!image) {
      image = new Image();
      image.onload = () => this.render();
      image.onerror = () => console.error("Failed to rasterize SVG shape for Canvas rendering.");
      image.src = url;
      this._svgImageCache.set(url, image);
    }
    if (image.complete && image.naturalWidth) {
      context.drawImage(image, bounds.x, bounds.y, bounds.width || object.width || 100, bounds.height || object.height || 100);
    }
  }
  _drawMosaic(context, object, drawContent = (target) => object._drawContent(target)) {
    const allPoints = (object.collisionShapes?.length ? object.collisionShapes : object.shapes).flatMap((shape) => {
      const descriptor = object._shapeDescriptor(shape);
      return localVertices(descriptor);
    });
    const measured = boundsForPoints(allPoints);
    const bounds = allPoints.length
      ? measured
      : { left: 0, top: 0, right: object.width || 100, bottom: object.height || 40 };
    const width = Math.max(1, bounds.right - bounds.left), height = Math.max(1, bounds.bottom - bounds.top);
    const scale = Math.max(2, Number(object.mosaicSize) || 8);
    const small = object._mosaicCanvas ??= document.createElement("canvas");
    const smallWidth = Math.max(1, Math.ceil(width / scale));
    const smallHeight = Math.max(1, Math.ceil(height / scale));
    if (small.width !== smallWidth) small.width = smallWidth;
    if (small.height !== smallHeight) small.height = smallHeight;
    const smallContext = small.getContext("2d");
    smallContext.setTransform(1, 0, 0, 1, 0, 0);
    smallContext.clearRect(0, 0, small.width, small.height);
    smallContext.save();
    smallContext.translate(-bounds.left / scale, -bounds.top / scale);
    smallContext.scale(1 / scale, 1 / scale);
    drawContent(smallContext);
    smallContext.restore();
    const smoothing = context.imageSmoothingEnabled;
    context.imageSmoothingEnabled = false;
    context.drawImage(small, bounds.left, bounds.top, small.width * scale, small.height * scale);
    context.imageSmoothingEnabled = smoothing;
  }
  _drawHitboxes(context, object) {
    context.save();
    context.strokeStyle = "#f43f5e";
    context.lineWidth = 1 / Math.max(.01, this._scale);
    for (const shape of object.collisionShapes) {
      const descriptor = object._shapeDescriptor(shape);
      const vertices = localVertices(descriptor);
      if (!vertices.length) continue;
      context.beginPath();
      context.moveTo(...vertices[0]);
      for (const point of vertices.slice(1)) context.lineTo(...point);
      context.closePath();
      context.stroke();
    }
    context.restore();
  }
}

export const ObjectBase = GameObject;
