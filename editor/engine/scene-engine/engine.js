const DEFAULT_FRAME_MS = 1000 / 60;

function getRequestAnimationFrame() {
  if (typeof globalThis.requestAnimationFrame === "function") return globalThis.requestAnimationFrame.bind(globalThis);
  return (callback) => setTimeout(() => callback(Date.now()), 16);
}

function getCancelAnimationFrame() {
  if (typeof globalThis.cancelAnimationFrame === "function") return globalThis.cancelAnimationFrame.bind(globalThis);
  return (handle) => clearTimeout(handle);
}

const requestAnimationFrame = getRequestAnimationFrame();
const cancelAnimationFrame = getCancelAnimationFrame();

function noop() {}

export class Scene {
  constructor(name, hooks = {}) {
    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("Scene name must be a non-empty string.");
    }
    this.name = name.trim();
    this.onEnter = typeof hooks.onEnter === "function" ? hooks.onEnter : noop;
    this.onUpdate = typeof hooks.onUpdate === "function" ? hooks.onUpdate : noop;
    this.onExit = typeof hooks.onExit === "function" ? hooks.onExit : noop;
    this.onRender = typeof hooks.onRender === "function" ? hooks.onRender : null;
    this.data = hooks.data ?? {};
  }

  enter(engine) {
    return this.onEnter.call(this, engine, this.data);
  }

  update(engine, dt) {
    return this.onUpdate.call(this, dt, engine, this.data);
  }

  exit(engine) {
    return this.onExit.call(this, engine, this.data);
  }

  render(engine) {
    if (typeof this.onRender === "function") {
      return this.onRender.call(this, engine, this.data);
    }
    return undefined;
  }
}

class Input {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this._bound = false;
    this._target = null;
  }

  bind(target = globalThis) {
    if (!target || typeof target.addEventListener !== "function" || this._bound) {
      return this;
    }
    this._bound = true;
    this._target = target;
    target.addEventListener("keydown", (event) => {
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
    target.addEventListener("keyup", (event) => {
      this.keys.delete(event.key);
      this.keys.delete(event.code);
      this.justReleased.add(event.key);
      this.justReleased.add(event.code);
    });
    target.addEventListener("blur", () => this.clear());
    return this;
  }

  onKey(keyid) {
    return this.keys.has(keyid);
  }

  pressed(keyid) {
    return this.justPressed.has(keyid);
  }

  released(keyid) {
    return this.justReleased.has(keyid);
  }

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

export class SceneEngine {
  constructor(options = {}) {
    const {
      canvas = null,
      width = 800,
      height = 450,
      fps = 60,
      background = "#0b1120",
      autoStart = false,
      initialScene = null,
    } = options;

    this.width = Number(width) || 800;
    this.height = Number(height) || 450;
    this.background = background;
    this.fps = Number(fps) > 0 ? Number(fps) : 60;
    this.dt = 0;
    this.running = false;
    this.scenes = new Map();
    this.currentScene = null;
    this.currentSceneName = null;
    this._lastFrameTime = 0;
    this._frameRequest = null;
    this._frameIntervalMs = 1000 / this.fps;

    this.canvas = canvas ?? this._createCanvas();
    this.ctx = this.canvas?.getContext?.("2d") ?? this._createCanvasContext();

    if (typeof window !== "undefined") {
      INPUT.bind(window);
    } else if (typeof globalThis !== "undefined") {
      INPUT.bind(globalThis);
    }

    if (autoStart) {
      this.start(initialScene);
    }
  }

  _createCanvas() {
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      const canvas = document.createElement("canvas");
      canvas.width = this.width;
      canvas.height = this.height;
      return canvas;
    }
    return {
      width: this.width,
      height: this.height,
      getContext: () => this._createCanvasContext(),
    };
  }

  _createCanvasContext() {
    return {
      clearRect() {},
      fillRect() {},
      fillStyle: this.background,
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      arc() {},
      fill() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      setTransform() {},
      strokeRect() {},
      fillText() {},
      measureText() {
        return { width: 0 };
      },
    };
  }

  registerScene(name, sceneOrHooks = {}) {
    const scene = sceneOrHooks instanceof Scene
      ? sceneOrHooks
      : new Scene(name, sceneOrHooks);

    if (scene.name !== name) {
      scene.name = name;
    }
    if (this.scenes.has(scene.name)) {
      throw new Error(`Scene "${scene.name}" is already registered.`);
    }

    this.scenes.set(scene.name, scene);
    return scene;
  }

  getScene(name) {
    return this.scenes.get(name) ?? null;
  }

  hasScene(name) {
    return this.scenes.has(name);
  }

  start(sceneName = null) {
    const nextSceneName = sceneName ?? this.currentSceneName ?? [...this.scenes.keys()][0];
    if (!nextSceneName) {
      throw new Error("No scene is available to start.");
    }
    if (!this.scenes.has(nextSceneName)) {
      throw new Error(`Scene "${nextSceneName}" is not registered.`);
    }

    const nextScene = this.scenes.get(nextSceneName);
    if (this.currentScene && this.currentScene !== nextScene) {
      this.currentScene.exit(this);
    }

    this.currentScene = nextScene;
    this.currentSceneName = nextScene.name;
    this.running = true;
    this._lastFrameTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    nextScene.enter(this);
    this.render();
    this._scheduleFrame();
    return this;
  }

  switchScene(sceneName) {
    if (!this.scenes.has(sceneName)) {
      throw new Error(`Scene "${sceneName}" is not registered.`);
    }

    const nextScene = this.scenes.get(sceneName);
    if (this.currentScene === nextScene) {
      this.currentScene.exit(this);
      this.currentScene.enter(this);
      this.render();
      return this;
    }

    if (this.currentScene) {
      this.currentScene.exit(this);
    }

    this.currentScene = nextScene;
    this.currentSceneName = nextScene.name;
    nextScene.enter(this);
    this.render();
    return this;
  }

  update(dt) {
    if (!this.currentScene) {
      return this;
    }
    this.currentScene.update(this, dt);
    this.render();
    INPUT.endFrame();
    return this;
  }

  stop() {
    this.running = false;
    if (this._frameRequest !== null) {
      cancelAnimationFrame(this._frameRequest);
      this._frameRequest = null;
    }
    return this;
  }

  render() {
    if (!this.ctx) {
      return this;
    }
    const ctx = this.ctx;
    if (typeof ctx.clearRect === "function") {
      ctx.clearRect(0, 0, this.width, this.height);
    }
    if (typeof ctx.fillRect === "function") {
      ctx.fillStyle = this.background;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (this.currentScene) {
      this.currentScene.render(this);
    }

    return this;
  }

  _scheduleFrame() {
    if (!this.running) {
      return;
    }
    this._frameRequest = requestAnimationFrame((time) => this._tick(time));
  }

  _tick(time) {
    if (!this.running) {
      return;
    }
    const elapsed = this._lastFrameTime ? time - this._lastFrameTime : this._frameIntervalMs;
    this.dt = Math.min(elapsed / 1000, 0.25);
    this._lastFrameTime = time;

    if (this.currentScene) {
      this.currentScene.update(this, this.dt);
    }

    this.render();
    INPUT.endFrame();
    this._scheduleFrame();
  }
}
