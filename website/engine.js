class Utils {
  static parseColor(color) {
    if (Array.isArray(color)) return color.slice(0, 3).map(value => Math.max(0, Math.min(255, Number(value) || 0)));
    const value = String(color || '').trim().toLowerCase();
    const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) { const digits = hex[1].length === 3 ? hex[1].split('').map(digit => digit + digit).join('') : hex[1]; return [parseInt(digits.slice(0,2),16), parseInt(digits.slice(2,4),16), parseInt(digits.slice(4,6),16)]; }
    const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return rgb ? rgb.slice(1, 4).map(Number) : null;
  }
  static colorWithinTolerance(actual, expected, tolerance = 0) {
    const a = Utils.parseColor(actual), b = Utils.parseColor(expected), limit = Math.max(0, Number(tolerance) || 0);
    return !!a && !!b && a.every((value, index) => Math.abs(value - b[index]) <= limit);
  }
  static distancePoints(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.hypot(dx, dy);
  }
  static distancePointToObject(px, py, obj) {
    // use object's center
    return Utils.distancePoints(px, py, obj.x, obj.y);
  }
  static distanceObjectToObject(a, b) {
    return Utils.distancePoints(a.x, a.y, b.x, b.y);
  }
  static angleToDxDy(angleDeg, dist) {
    const r = (angleDeg * Math.PI) / 180;
    return { dx: Math.cos(r) * dist, dy: Math.sin(r) * dist };
  }
}

let __idCounter = 1;
const __objectIds = new Set();
const __privateValues = new WeakMap();
class GameObject {
  constructor(spec = {}) {
    this.id = spec.id ?? __idCounter++;
    if (__objectIds.has(this.id))
      throw new Error(`GameObject ID is already in use: ${this.id}`);
    __objectIds.add(this.id);
    this.tag = Array.isArray(spec.tag)
      ? spec.tag.slice()
      : spec.tag
        ? [spec.tag]
        : [];
    this.x = spec.x ?? 0;
    this.y = spec.y ?? 0;
    this.angle = spec.angle ?? 0;
    this.width = spec.width ?? (spec.radius ? spec.radius * 2 : 10);
    this.height = spec.height ?? (spec.radius ? spec.radius * 2 : 10);
    this._baseWidth = this.width;
    this._baseHeight = this.height;
    this.color = spec.color || "rgba(0,150,200,0.9)";
    this.image = spec.image || null;
    this.colliders =
      Array.isArray(spec.colliders) && spec.colliders.length
        ? spec.colliders.map((c) =>
            Object.assign({}, c, {
              points: c.points
                ? c.points.map((p) => ({ x: p.x, y: p.y }))
                : undefined,
            }),
          )
        : [{ type: "rect", width: this.width, height: this.height }];
    this.programs = Array.isArray(spec.programs) ? spec.programs.slice() : [];
    this.initialPrograms = Array.isArray(spec.initialPrograms)
      ? spec.initialPrograms.slice()
      : [];
    this.isCopy = spec.isCopy === true;
    this._initialProgramsRun = false;
    this.visible = spec.visible !== undefined ? spec.visible : true;
    this.onCopy = typeof spec.onCopy === "function" ? spec.onCopy : null;
    __privateValues.set(this, Object.assign(Object.create(null), spec.private || {}));
  }

  getInfo() {
    return {
      id: this.id,
      tag: this.tag.slice(),
      x: this.x,
      y: this.y,
      angle: this.angle,
      width: this.width,
      height: this.height,
      color: this.color,
      image: this.image,
      colliders: this.colliders.map((c) =>
        Object.assign({}, c, {
          points: c.points
            ? c.points.map((p) => ({ x: p.x, y: p.y }))
            : undefined,
        }),
      ),
      initialPrograms: this.initialPrograms.slice(),
      programs: this.programs.slice(),
    };
  }

  copy(overrides = {}) {
    const spec = Object.assign({}, this.getInfo(), overrides);
    if (!Object.prototype.hasOwnProperty.call(overrides, "id")) delete spec.id;
    spec.isCopy = Object.prototype.hasOwnProperty.call(overrides, "isCopy")
      ? overrides.isCopy === true
      : true;
    const copy = new GameObject(spec);
    copy._imageElement = this._imageElement || null;
    if (this.onCopy)
      try {
        this.onCopy(copy);
      } catch (e) {
        console.error(e);
      }
    return copy;
  }

  removeFrom(display) {
    const target = display instanceof Display ? display : this._display;
    if (target) target._removeById(this.id);
  }

  destroy() {
    __objectIds.delete(this.id);
    this.remove();
  }

  remove() {
    this.removeFrom();
  }

  setPrivate(name, value) {
    if (typeof name !== "string" || !name) throw new TypeError("Private variable name must be a non-empty string");
    __privateValues.get(this)[name] = value;
    return value;
  }

  getPrivate(name, fallback = undefined) {
    const values = __privateValues.get(this);
    return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : fallback;
  }

  hasPrivate(name) {
    return Object.prototype.hasOwnProperty.call(__privateValues.get(this), name);
  }

  changePrivate(name, delta = 0) {
    if (typeof name !== "string" || !name) throw new TypeError("Private variable name must be a non-empty string");
    const current = Number(this.getPrivate(name, 0)) || 0;
    const next = current + Number(delta || 0);
    this.setPrivate(name, next);
    return next;
  }

  setScale(scale = 1) {
    const ratio = Number(scale);
    if (!Number.isFinite(ratio) || ratio <= 0) throw new TypeError("Scale must be a positive finite number");
    const factor = ratio <= 1 ? ratio : ratio <= 100 ? ratio / 100 : ratio;
    const baseWidth = this._baseWidth ?? this.width;
    const baseHeight = this._baseHeight ?? this.height;
    this.width = baseWidth * factor;
    this.height = baseHeight * factor;
    for (const collider of this.colliders) {
      if (collider.type === "rect") {
        collider.width = (collider.width ?? baseWidth) * factor;
        collider.height = (collider.height ?? baseHeight) * factor;
      } else if (collider.type === "circle") {
        collider.radius = (collider.radius ?? Math.min(baseWidth, baseHeight) / 2) * factor;
      } else if (collider.type === "polygon" && Array.isArray(collider.points)) {
        collider.points = collider.points.map((point) => ({
          x: (point.x ?? 0) * factor,
          y: (point.y ?? 0) * factor,
        }));
      }
    }
    return this;
  }

  get hidden() {
    return !this.visible;
  }

  set hidden(value) {
    this.visible = !Boolean(value);
  }

  _debugPrivateSnapshot() {
    return Object.assign({}, __privateValues.get(this));
  }

  touchesTag(tag, display = this._display) {
    return !!display && display.listObjects().some(object => object !== this && object.tag.includes(tag) && this.intersectsObject(object));
  }

  isCollidingWith(tagOrSpec, x = this.x, y = this.y, options = {}, display = this._display) {
    if (tagOrSpec && typeof tagOrSpec === "object" && !Array.isArray(tagOrSpec)) {
      const spec = tagOrSpec;
      return this.isCollidingWith(
        spec.tag,
        spec.x ?? x ?? this.x,
        spec.y ?? y ?? this.y,
        {
          width: spec.width,
          height: spec.height,
          angle: spec.angle,
          colliders: spec.colliders,
          ...options,
        },
        spec.display ?? display,
      );
    }
    if (!display) return false;
    const probe = this.copy({
      x: Number(x ?? this.x) || this.x,
      y: Number(y ?? this.y) || this.y,
      width: Number(options.width ?? this.width) || this.width,
      height: Number(options.height ?? this.height) || this.height,
      angle: Number(options.angle ?? this.angle) || this.angle,
      colliders: Array.isArray(options.colliders) && options.colliders.length
        ? options.colliders.map((c) => Object.assign({}, c, {
            points: c.points ? c.points.map((p) => ({ x: p.x, y: p.y })) : undefined,
          }))
        : undefined,
    });
    const tags = Array.isArray(tagOrSpec) ? tagOrSpec : tagOrSpec ? [tagOrSpec] : [];
    return display.listObjects().some((object) => {
      if (object === this) return false;
      if (tags.length > 0 && !tags.some((value) => object.tag.includes(value))) return false;
      return probe.intersectsObject(object);
    });
  }

  isCollusion(tagOrSpec, x = this.x, y = this.y, options = {}, display = this._display) {
    return this.isCollidingWith(tagOrSpec, x, y, options, display);
  }

  touchesColor(color, tolerance = 0, display = this._display) {
    return !!display && display.listObjects().some(object => object !== this && Utils.colorWithinTolerance(object.color, color, tolerance) && this.intersectsObject(object));
  }

  isColorWithinTolerance(color, tolerance = 0) {
    return Utils.colorWithinTolerance(this.color, color, tolerance);
  }

  setImage(image) {
    this._imageElement = typeof image === "string" ? Object.assign(new Image(), {src:image}) : image;
    this.image = typeof image === "string" ? {kind:"image", src:image} : {kind:"image"};
    return this;
  }

  loadImage(source) {
    return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { this.setImage(image); resolve(image); }; image.onerror = reject; image.src = source; });
  }

  addObjectById(id, overrides = {}) {
    if (!this._display)
      throw new Error(
        "Object must belong to a Display before adding another Object",
      );
    return this._display.addObjectById(id, overrides);
  }

  setId(id) {
    if (id === this.id) return this;
    if (__objectIds.has(id))
      throw new Error(`GameObject ID is already in use: ${id}`);
    __objectIds.delete(this.id);
    __objectIds.add(id);
    this.id = id;
    return this;
  }

  move(dx, dy) {
    this.x += dx;
    this.y += dy;
  }
  Xmove(distance) {
    this.x += Number(distance) || 0;
  }
  Ymove(distance) {
    this.y -= Number(distance) || 0;
  }
  moveTo(x, y) {
    this.x = x;
    this.y = y;
  }
  rotateTo(angle) {
    this.angle = angle;
  }
  rotateBy(d) {
    this.angle = (this.angle + d) % 360;
  }

  containsPoint(px, py) {
    return this.colliders.some((c) =>
      GameObject._pointInCollider(px, py, this, c),
    );
  }

  intersectsObject(other) {
    return this.colliders.some((a) =>
      other.colliders.some((b) =>
        GameObject._collidersIntersect(this, a, other, b),
      ),
    );
  }

  static _transformPoint(object, point) {
    const r = (object.angle * Math.PI) / 180,
      cos = Math.cos(r),
      sin = Math.sin(r);
    return {
      x: object.x + point.x * cos - point.y * sin,
      y: object.y + point.x * sin + point.y * cos,
    };
  }

  static _shape(c) {
    if (c.type === "circle")
      return {
        type: "circle",
        x: c.x || 0,
        y: c.y || 0,
        radius: c.radius || 0,
      };
    if (c.type === "polygon")
      return { type: "polygon", points: c.points || [] };
    const width = c.width ?? 10,
      height = c.height ?? 10;
    return {
      type: "polygon",
      points: [
        { x: -width / 2, y: -height / 2 },
        { x: width / 2, y: -height / 2 },
        { x: width / 2, y: height / 2 },
        { x: -width / 2, y: height / 2 },
      ],
    };
  }

  static _worldShape(object, collider) {
    const shape = GameObject._shape(collider);
    if (shape.type === "circle") {
      const center = GameObject._transformPoint(object, shape);
      return Object.assign(shape, center);
    }
    return {
      type: "polygon",
      points: shape.points.map((p) => GameObject._transformPoint(object, p)),
    };
  }

  static _pointInCollider(px, py, object, collider) {
    const shape = GameObject._worldShape(object, collider);
    if (shape.type === "circle")
      return Utils.distancePoints(px, py, shape.x, shape.y) <= shape.radius;
    let inside = false;
    for (
      let i = 0, j = shape.points.length - 1;
      i < shape.points.length;
      j = i++
    ) {
      const a = shape.points[i],
        b = shape.points[j];
      if (
        a.y > py !== b.y > py &&
        px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
    }
    return inside;
  }

  static _collidersIntersect(a, ca, b, cb) {
    const sa = GameObject._worldShape(a, ca),
      sb = GameObject._worldShape(b, cb);
    if (sa.type === "circle" && sb.type === "circle")
      return (
        Utils.distancePoints(sa.x, sa.y, sb.x, sb.y) <= sa.radius + sb.radius
      );
    if (sa.type === "circle") return GameObject._circlePolygon(sa, sb);
    if (sb.type === "circle") return GameObject._circlePolygon(sb, sa);
    return GameObject._polygonPolygon(sa.points, sb.points);
  }

  static _circlePolygon(circle, polygon) {
    if (GameObject._pointInPolygon(circle.x, circle.y, polygon.points))
      return true;
    return polygon.points.some((p, i) => {
      const q = polygon.points[(i + 1) % polygon.points.length],
        dx = q.x - p.x,
        dy = q.y - p.y,
        t = Math.max(
          0,
          Math.min(
            1,
            ((circle.x - p.x) * dx + (circle.y - p.y) * dy) /
              (dx * dx + dy * dy || 1),
          ),
        ),
        x = p.x + t * dx,
        y = p.y + t * dy;
      return Utils.distancePoints(circle.x, circle.y, x, y) <= circle.radius;
    });
  }

  static _pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i],
        b = points[j];
      if (
        a.y > y !== b.y > y &&
        x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
    }
    return inside;
  }

  static _polygonPolygon(a, b) {
    const axes = [];
    for (const points of [a, b])
      for (let i = 0; i < points.length; i++) {
        const p = points[i],
          q = points[(i + 1) % points.length],
          dx = q.x - p.x,
          dy = q.y - p.y;
        axes.push({ x: -dy, y: dx });
      }
    return axes.every((axis) => {
      const project = (points) =>
        points.map((p) => p.x * axis.x + p.y * axis.y);
      const pa = project(a),
        pb = project(b);
      return (
        Math.max(...pa) >= Math.min(...pb) && Math.max(...pb) >= Math.min(...pa)
      );
    });
  }

  touchesDisplayEdge(display) {
    if (!display) return false;
    const hw = this.width / 2,
      hh = this.height / 2;
    return (
      this.x - hw <= 0 ||
      this.y - hh <= 0 ||
      this.x + hw >= display.width ||
      this.y + hh >= display.height
    );
  }

  draw(ctx) {
    if (!this.visible) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.angle * Math.PI) / 180);
    if (this._imageElement && this._imageElement.complete) {
      ctx.drawImage(
        this._imageElement,
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height,
      );
      ctx.restore();
      return;
    }
    ctx.fillStyle = this.color;
    for (const collider of this.colliders) {
      const shape = GameObject._shape(collider);
      if (shape.type === "circle") {
        ctx.beginPath();
        ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        shape.points.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

class Display {
  constructor({
    name = "display",
    width = 300,
    height = 150,
    transparent = true,
    blend = "normal",
  } = {}) {
    this.name = name;
    this.width = width;
    this.height = height;
    this.transparent = !!transparent;
    this.blend = blend; // 'normal'|'blur'|'transparent'|'fill'
    this.objects = [];
    this.drawables = [];
    this.paused = false;
    this.public = {};
    this._hidden = new Set();
    this._onTick = null;
  }

  listObjects() {
    return this.objects.slice();
  }
  findByTag(tag) {
    return this.objects.filter((o) => o.tag.includes(tag));
  }
  findByCondition(fn) {
    return this.objects.filter(fn);
  }

  pauseAll() {
    this.paused = true;
  }
  resumeAll() {
    this.paused = false;
  }

  hideObject(id) {
    this._hidden.add(id);
  }
  showObject(id) {
    this._hidden.delete(id);
  }

  addObject(obj, overrides = {}) {
    if (typeof obj === "string" || typeof obj === "number")
      return this.addObjectById(obj, overrides);
    if (!(obj instanceof GameObject))
      throw new TypeError("Display object must be a GameObject");
    if (obj._display && obj._display !== this) obj._display._removeById(obj.id);
    obj._display = this;
    this.objects.push(obj);
    if (this._engine) this._engine.runInitialPrograms(obj, this);
    return obj;
  }

  addObjectById(id, overrides = {}) {
    if (!this._engine) throw new Error("Display must belong to an Engine");
    const template = this._engine.getTemplate(id);
    if (!template) throw new Error(`Object template ID was not found: ${id}`);
    return this.addObject(
      template.copy(Object.assign({}, overrides, { isCopy: false })),
    );
  }

  addDrawable(drawable) {
    if (typeof drawable !== "function")
      throw new TypeError("Display drawable must be a function");
    this.drawables.push(drawable);
    return drawable;
  }

  // add object from a prototype (doesn't mutate prototype)
  addObjectFromPrototype(proto, overrides = {}) {
    const copy = proto.copy(overrides);
    this.addObject(copy);
    return copy;
  }

  _removeById(id) {
    const removed = this.objects.filter((o) => o.id === id);
    this.objects = this.objects.filter((o) => o.id !== id);
    for (const obj of removed) if (obj._display === this) obj._display = null;
  }

  delete() {
    if (this._engine) {
      this._engine._removeDisplay(this);
    }
  }

  // compute bounding rect of occupied area
  _occupiedBBox() {
    if (this.objects.length === 0) return null;
    let minx = Infinity,
      miny = Infinity,
      maxx = -Infinity,
      maxy = -Infinity;
    for (const o of this.objects) {
      const x1 = o.x - o.width / 2,
        y1 = o.y - o.height / 2,
        x2 = o.x + o.width / 2,
        y2 = o.y + o.height / 2;
      if (x1 < minx) minx = x1;
      if (y1 < miny) miny = y1;
      if (x2 > maxx) maxx = x2;
      if (y2 > maxy) maxy = y2;
    }
    return { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
  }

  // draw to a provided context
  drawTo(ctx) {
    // draw objects
    for (const o of this.objects) {
      if (this._hidden.has(o.id)) continue;
      o.draw(ctx);
    }
    for (const drawable of this.drawables) drawable(ctx, this);
  }
}

class InputManager {
  constructor(element = null) {
    this.element = null;
    this.mouse = {
      x: 0,
      y: 0,
      pressed: false,
      justClicked: false,
      lastClickTime: 0,
    };
    this.keys = new Set();
    this._bound = {};
    if (element) this.attachTo(element);
  }

  attachTo(element) {
    if (!element) element = window;
    this.detach();
    this.element = element;
    this._bound.mdown = (e) => {
      this.mouse.pressed = true;
      this.mouse.justClicked = true;
      this.mouse.lastClickTime = performance.now();
      this._updateMousePos(e);
    };
    this._bound.mup = (e) => {
      this.mouse.pressed = false;
      this._updateMousePos(e);
    };
    this._bound.move = (e) => {
      this._updateMousePos(e);
    };
    this._bound.kdown = (e) => {
      this.keys.add(e.key);
      if (e.key === " " || e.code === "Space") this.keys.add("Space");
      if (e.key === "Space" || e.code === "Space") this.keys.add(" ");
    };
    this._bound.kup = (e) => {
      this.keys.delete(e.key);
      if (e.key === " " || e.code === "Space") this.keys.delete("Space");
      if (e.key === "Space" || e.code === "Space") this.keys.delete(" ");
    };
    // prefer pointer events but fallback
    this.element.addEventListener("pointerdown", this._bound.mdown);
    this.element.addEventListener("pointerup", this._bound.mup);
    this.element.addEventListener("pointermove", this._bound.move);
    window.addEventListener("keydown", this._bound.kdown);
    window.addEventListener("keyup", this._bound.kup);
  }

  detach() {
    if (!this.element || !this._bound.mdown) return;
    this.element.removeEventListener("pointerdown", this._bound.mdown);
    this.element.removeEventListener("pointerup", this._bound.mup);
    this.element.removeEventListener("pointermove", this._bound.move);
    window.removeEventListener("keydown", this._bound.kdown);
    window.removeEventListener("keyup", this._bound.kup);
    this.element = null;
    this._bound = {};
  }

  _updateMousePos(e) {
    const rect =
      this.element && this.element.getBoundingClientRect
        ? this.element.getBoundingClientRect()
        : { left: 0, top: 0 };
    const scaleX =
      this.element && this.element.width && rect.width
        ? this.element.width / rect.width
        : 1;
    const scaleY =
      this.element && this.element.height && rect.height
        ? this.element.height / rect.height
        : 1;
    this.mouse.x = (e.clientX - rect.left) * scaleX || 0;
    this.mouse.y = (e.clientY - rect.top) * scaleY || 0;
  }

  isKeyPressed(key) {
    if (key === "Space") return this.keys.has("Space") || this.keys.has(" ");
    if (key === " ") return this.keys.has(" ") || this.keys.has("Space");
    return this.keys.has(key);
  }

  timeSinceLastClick() {
    return this.mouse.lastClickTime
      ? performance.now() - this.mouse.lastClickTime
      : Infinity;
  }

  // call once per frame to clear per-frame flags
  update() {
    this.mouse.justClicked = false;
  }

  programApi() {
    return {
      mouse: () => Object.assign({}, this.mouse),
      key: (key) => this.isKeyPressed(key),
    };
  }
}

class Engine {
  constructor({ fps = 60, canvas } = {}) {
    this.fps = Math.max(1, Number(fps) || 60);
    this.displays = [];
    this.public = {};
    this.templates = new Map();
    this.startupPrograms = [];
    this.framePrograms = [];
    this._running = false;
    this._tickHandle = null;
    this._updaters = new Set();
    this._renderHooks = new Set();
    this._buffers = new Map();
    this.canvas = canvas || null;
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.input = new InputManager();
    this.public.input = this.input;
    this.public.INPUT = this.input.programApi();
  }

  addDisplay(display) {
    display._engine = this;
    display.public.input = this.input;
    this.displays.push(display);
    return display;
  }

  registerTemplate(object) {
    if (!(object instanceof GameObject))
      throw new TypeError("Engine template must be a GameObject");
    if (this.templates.has(object.id))
      throw new Error(`Object template ID is already registered: ${object.id}`);
    this.templates.set(object.id, object);
    object._templateEngine = this;
    return object;
  }

  getTemplate(id) {
    return this.templates.get(id) || null;
  }

  unregisterTemplate(id) {
    return this.templates.delete(id);
  }

  runInitialPrograms(object, display) {
    if (object._initialProgramsRun) return;
    const scope = Object.fromEntries(
      this.displays.map((layer) => [layer.name, layer]),
    );
    scope.INPUT = this.public.INPUT;
    for (const source of object.initialPrograms) {
      const program = String(source || '').replace(/\bthis\./g, 'self.');
      new Function(
        "self",
        "display",
        "engine",
        "INPUT",
        "scope",
        `
          return (function () {
            with (scope) { ${program}\n }
          }).call(self);
        `,
      )(object, display, this, this.public.INPUT, scope);
    }
    object._initialProgramsRun = true;
  }

  addStartupProgram(source) {
    if (typeof source !== "string")
      throw new TypeError("Startup program must be a string");
    this.startupPrograms.push(source);
    return source;
  }

  runStartupPrograms() {
    const scope = Object.fromEntries(
      this.displays.map((layer) => [layer.name, layer]),
    );
    scope.INPUT = this.public.INPUT;
    for (const source of this.startupPrograms) {
      const program = String(source || '').replace(/\bthis\./g, 'engine.');
      new Function(
        "engine",
        "INPUT",
        "scope",
        `
          return (function () {
            with (scope) { ${program}\n }
          }).call(engine);
        `,
      )(this, this.public.INPUT, scope);
    }
  }

  _removeDisplay(display) {
    this.displays = this.displays.filter((d) => d !== display);
    this._buffers.delete(display);
  }

  onUpdate(fn) {
    if (typeof fn !== "function")
      throw new TypeError("Engine updater must be a function");
    this._updaters.add(fn);
    return fn;
  }

  removeUpdate(fn) {
    return this._updaters.delete(fn);
  }

  onRender(fn) {
    if (typeof fn !== "function")
      throw new TypeError("Engine render hook must be a function");
    this._renderHooks.add(fn);
    return fn;
  }

  start() {
    if (!this.canvas || !this.ctx)
      throw new Error("Engine requires a canvas to start");
    if (this._running) return;
    this._running = true;
    const interval = 1000 / this.fps;
    let last = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      // attach input to canvas on start
      if (!this.input || !this.input.element) {
        this.input.attachTo(this.canvas);
      }
      const elapsed = now - last;
      if (elapsed < interval) {
        this._tickHandle = requestAnimationFrame(loop);
        return;
      }
      last = now;
      const dt = Math.min(elapsed, 250);
      for (const update of this._updaters) update(dt / 1000, this.input);
      this._renderFrame();
      this._tickHandle = requestAnimationFrame(loop);
    };
    this._tickHandle = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    if (this._tickHandle) {
      cancelAnimationFrame(this._tickHandle);
      this._tickHandle = null;
    }
  }

  _renderFrame() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // render displays in order; if an upper display has blend affecting lower, re-render lower into clipped area
    for (let i = 0; i < this.displays.length; i++) {
      const d = this.displays[i];
      const buffer = this._getBuffer(d);
      const off = buffer.canvas;
      const offCtx = buffer.ctx;
      offCtx.clearRect(0, 0, d.width, d.height);
      if (d.transparent) offCtx.clearRect(0, 0, d.width, d.height);
      else {
        offCtx.fillStyle = "white";
        offCtx.fillRect(0, 0, d.width, d.height);
      }
      // draw display content
      offCtx.save();
      d.drawTo(offCtx);
      offCtx.restore();

      // If any upper display (j>i) requests effect that should modify this layer, handle here by checking next display
      let composite = off;
      for (let j = i + 1; j < this.displays.length; j++) {
        const up = this.displays[j];
        if (up.blend === "normal") continue;
        const bbox = up._occupiedBBox();
        if (!bbox) continue;
        const tempIndex = buffer.tempIndex;
        const tmp = buffer.temps[tempIndex].canvas;
        const tctx = buffer.temps[tempIndex].ctx;
        buffer.tempIndex = (tempIndex + 1) % buffer.temps.length;
        tctx.clearRect(0, 0, d.width, d.height);
        tctx.drawImage(composite, 0, 0);
        tctx.save();
        tctx.beginPath();
        tctx.rect(bbox.x, bbox.y, bbox.w, bbox.h);
        tctx.clip();
        if (up.blend === "blur") {
          tctx.filter = "blur(6px)";
          tctx.drawImage(composite, 0, 0);
        }
        if (up.blend === "transparent") {
          tctx.globalAlpha = 0.5;
          tctx.drawImage(composite, 0, 0);
        }
        if (up.blend === "fill") {
          tctx.fillStyle = "rgba(0,0,0,0.2)";
          tctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
        }
        tctx.restore();
        composite = tmp;
      }

      // finally draw composite onto main canvas at 0,0 (we assume displays align)
      ctx.drawImage(composite, 0, 0);
    }
    // update input per-frame (clears per-frame flags)
    if (this.input) this.input.update();
    for (const renderHook of this._renderHooks) renderHook(this);
  }

  _getBuffer(display) {
    let buffer = this._buffers.get(display);
    if (
      !buffer ||
      buffer.canvas.width !== display.width ||
      buffer.canvas.height !== display.height
    ) {
      const canvas = document.createElement("canvas");
      canvas.width = display.width;
      canvas.height = display.height;
      const temps = [0, 1].map(() => {
        const temp = document.createElement("canvas");
        temp.width = display.width;
        temp.height = display.height;
        return { canvas: temp, ctx: temp.getContext("2d") };
      });
      buffer = { canvas, ctx: canvas.getContext("2d"), temps, tempIndex: 0 };
      this._buffers.set(display, buffer);
    }
    return buffer;
  }

  // helper: add display and return it
  createDisplay(spec) {
    const d = new Display(spec);
    return this.addDisplay(d);
  }
}

// expose
if (typeof window !== "undefined")
  window.GameEngine = { Engine, Display, GameObject, Utils };
if (typeof module !== "undefined")
  module.exports = { Engine, Display, GameObject, Utils };
