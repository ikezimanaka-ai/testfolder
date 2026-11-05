import { Display, Engine, GameObject } from "../editor/engine/engine.js";

const sourceCache = new Map();
const LOG_PREFIX = "[SceneEngine]";

function programLog(level, ...args) {
  console[level]?.(LOG_PREFIX, ...args);
}

/** URL references are relative to the page; fetched source is shared between objects. */
export function programURL(url, { fetcher = globalThis.fetch } = {}) {
  if (typeof url !== "string" || !url.trim()) throw new TypeError("programURL expects a non-empty relative URL.");
  const key = url.trim();
  return {
    url: key,
    load() {
      if (!sourceCache.has(key)) {
        const request = Promise.resolve().then(() => fetcher(key)).then((response) => {
          if (!response.ok) throw new Error(`Could not load program (${response.status}): ${key}`);
          return response.text();
        });
        sourceCache.set(key, request);
      }
      return sourceCache.get(key);
    },
  };
}

function splitStatements(source) {
  const statements = [];
  let current = "", round = 0, square = 0, curly = 0;
  let quote = "", escaped = false, lineComment = false, blockComment = false, template = false;
  const flush = () => { const value = current.trim(); if (value) statements.push(value); current = ""; };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i], next = source[i + 1];
    if (lineComment) { if (char === "\n") { lineComment = false; if (!round && !square && !curly) flush(); else current += " "; } continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i += 1; } continue; }
    if (quote || template) {
      current += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (quote && char === quote) quote = "";
      else if (template && char === "`") template = false;
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; i += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; i += 1; continue; }
    if (char === "\"" || char === "'") { quote = char; current += char; continue; }
    if (char === "`") { template = true; current += char; continue; }
    if (char === "(") round += 1;
    else if (char === ")") round = Math.max(0, round - 1);
    else if (char === "[") square += 1;
    else if (char === "]") square = Math.max(0, square - 1);
    else if (char === "{") curly += 1;
    else if (char === "}") curly = Math.max(0, curly - 1);
    if (char === "\n" && !round && !square && !curly) flush();
    else if (char === ";" && !round && !square && !curly) flush();
    else current += char;
  }
  flush();
  return statements;
}

function splitArguments(text) {
  const result = [];
  let start = 0, depth = 0, quote = "", escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
    } else if (char === "\"" || char === "'") quote = char;
    else if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) { result.push(text.slice(start, i)); start = i + 1; }
  }
  if (text.trim()) result.push(text.slice(start));
  return result;
}

function compileProgram(source) {
  const output = [];
  let loopId = 0;
  for (const statement of splitStatements(source)) {
    const repeat = /^repeat\s*\(\s*(["'])EOF\1\s*,\s*(.+)\s*\)$/.exec(statement);
    if (repeat) { const id = loopId++; output.push(`for(let __loop${id}=0;__loop${id}<(${repeat[2]});__loop${id}++){`); continue; }
    if (/^["']EOF["']$/.test(statement)) { output.push("}"); continue; }
    const wait = /^wait\s*\((.*)\)$/.exec(statement);
    if (wait) { output.push(`yield {type:"wait",ms:(${wait[1]})};`); continue; }
    const waitFor = /^waitFor\s*\((.*)\)$/.exec(statement);
    if (waitFor) {
      const args = splitArguments(waitFor[1]);
      const key = /^(?:"([\w$]+)"|'([\w$]+)')$/.exec(args[0]?.trim() ?? "");
      if (!key || !args[1]) throw new SyntaxError('waitFor syntax is waitFor("name", expectedValue).');
      const name = key[1] || key[2];
      output.push(`yield {type:"waitFor",test:()=>((this._programVariables.has(${JSON.stringify(name)})?this._programVariables.get(${JSON.stringify(name)}):(typeof this.getPrivate==="function"?this.getPrivate(${JSON.stringify(name)},this[${JSON.stringify(name)}]):this[${JSON.stringify(name)}]))===(${args.slice(1).join(",")}))};`);
    } else output.push(statement);
    output.push('yield {type:"step"};');
  }
  return output.join("\n");
}

function addProgramRuntime(Base) {
  return class ProgramRuntime extends Base {
    constructor(...args) {
      super(...args);
      this._programVariables = new Map();
      this._commands = new Map();
      this._frameTask = null;
      this._placementTask = null;
      this._placementStarted = false;
      this._programError = null;
      this._commands.set("placed", () => this.onPlaced?.call(this));
    }

    registerCommand(name, callback) {
      if (typeof callback !== "function") throw new TypeError("Program command must be a function.");
      this._commands.set(name, callback);
      return this;
    }

    setVariable(name, value) { this._programVariables.set(name, value); return this; }
    getVariable(name) { return this._programVariables.get(name); }
    setProgram(program) { this._frameTask = this._createTask(program); return this; }
    setPlacementProgram(program) { this._placementTask = this._createTask(program); return this; }

    _createTask(program) {
      const ref = typeof program === "string" ? programURL(program) : program;
      const task = { loading: true, iterator: null, waitMs: 0, waitFor: null, label: ref?.url ?? this.constructor.name, steps: 0, loggedLoops: 0 };
      const loading = typeof ref === "string" ? Promise.resolve(ref) : ref?.load?.() ?? (typeof ref?.source === "string" ? Promise.resolve(ref.source) : null);
      if (!loading) throw new TypeError("setProgram expects a programURL(...) reference or source wrapper.");
      programLog("info", `loading ${task.label}`);
      Promise.resolve(loading).then((source) => {
        if (task.cancelled) return;
        const scope = new Proxy({ object: this }, {
          has: (target, key) => key in target || key in this || this._programVariables.has(key) || this._commands.has(key),
          get: (target, key) => key in target ? target[key] : this._programVariables.has(key) ? this._programVariables.get(key) : this._commands.has(key) ? this._commands.get(key).bind(this) : this[key],
          set: (target, key, value) => { if (key in target) target[key] = value; else this._programVariables.set(key, value); return true; },
        });
        const factory = new Function("scope", `with(scope){return (function*(){${compileProgram(String(source))}\n}).call(scope.object);}`);
        task.iterator = factory(scope);
        task.loading = false;
        task.statements = splitStatements(String(source));
        programLog("info", `ready ${task.label} (${task.statements.length} statements)`);
        if (task.placement && this._placementStarted) this._stepTask(task, 0);
      }).catch((error) => {
        task.loading = false; task.error = error; this._programError = error;
        programLog("error", `failed to load/compile ${task.label}`, error);
        this.onProgramError?.(error);
      });
      return task;
    }

    _stepTask(task, dt) {
      if (!task || task.loading || task.finished || !task.iterator) return;
      this._frameDelta = dt;
      if (task.waitMs > 0) { task.waitMs = Math.max(0, task.waitMs - Math.max(0, dt) * 1000); return; }
      try {
        if (task.waitFor && !task.waitFor()) return;
        task.waitFor = null;
        const result = task.iterator.next();
        if (result.done) { task.finished = true; programLog("info", `finished ${task.label}`); return; }
        task.steps += 1;
        // Frame-loop programs intentionally repeat one command; report the first few and then sample.
        if (task.steps <= 8 || task.steps % 120 === 0) {
          const sourceLine = task.statements?.[(task.steps - 1) % (task.statements?.length || 1)] ?? "<program step>";
          programLog("info", `${task.label} step ${task.steps}: ${sourceLine}`);
        }
        if (result.value?.type === "wait") {
          task.waitMs = Math.max(0, Number(result.value.ms) || 0);
          programLog("info", `${task.label} waiting ${task.waitMs}ms`);
        } else if (result.value?.type === "waitFor") {
          task.waitFor = result.value.test;
          if (!task.waitFor()) programLog("info", `${task.label} waiting for condition`);
        }
      } catch (error) {
        task.finished = true; this._programError = error;
        programLog("error", `runtime error in ${task.label}`, error);
        this.onProgramError?.(error);
      }
    }

    _scaledDt(dt) { return dt * (this.engine?.timeScale ?? 1); }

    onStart(engine) {
      if (super.onStart) super.onStart(engine);
      if (!this._placementStarted) {
        this._placementStarted = true;
        if (this._placementTask) { this._placementTask.placement = true; this._stepTask(this._placementTask, 0); }
      }
    }

    onUpdate(dt, engine) {
      this._stepTask(this._frameTask, this._scaledDt(dt));
    }

    get programError() { return this._programError; }
    get programRunning() { return Boolean(this._frameTask && !this._frameTask.finished); }
  };
}

export class ProgramObject extends addProgramRuntime(GameObject) {}

export class Scene extends addProgramRuntime(Display) {
  constructor(name, width, height, options = {}) {
    super(name, width, height, { ...options, background: null });
    this.name = name;
    this.active = false;
    this._visible = new Map();
    this.onStart = () => {
      if (this._placementStarted) return;
      this._placementStarted = true;
      if (this._placementTask) { this._placementTask.placement = true; this._stepTask(this._placementTask, 0); }
    };
    this.onUpdate = (dt) => this._stepTask(this._frameTask, this._scaledDt(dt));
    this.setPlacementProgram(options.placementProgram ?? programURL("./programs/scene-placed.js"));
  }

  update(dt) {
    if (!this.active) return this;
    super.update(dt);
    if (!this.active) return this;
    const liveObjects = new Set(this.objects);
    for (const object of this._visible.keys()) if (!liveObjects.has(object)) this._visible.delete(object);
    return this;
  }

  addObject(object, overrides = {}) {
    if (!object._placementTask) object.setPlacementProgram(programURL("./programs/object-placed.js"));
    const result = super.addObject(object, overrides);
    this._visible.set(result, result.opacity);
    if (!this.active) result.opacity = 0;
    return result;
  }

  start() {
    if (!this.active) return this;
    super.start();
    return this;
  }

  setActive(active) {
    const next = Boolean(active);
    if (next === this.active) return this;
    this.active = next;
    for (const object of this.objects) {
      if (this.active) object.opacity = this._visible.get(object) ?? 1;
      else { this._visible.set(object, object.opacity); object.opacity = 0; }
    }
    if (this.active && this.engine?.running) this.start();
    this.engine?.render();
    return this;
  }
}

export class GameEngine extends Engine {
  constructor(canvas, fps = 60, logicalWidth = 960, logicalHeight = 620) {
    super(canvas, fps, logicalWidth, logicalHeight);
    this.scenes = new Map();
    this.currentScene = null;
    this.timeScale = 1;
  }

  addScene(name, scene) {
    if (!(scene instanceof Scene)) throw new TypeError("addScene expects a Scene.");
    if (this.scenes.has(name)) throw new Error(`Scene "${name}" already exists.`);
    scene.name = name;
    this.scenes.set(name, scene);
    this.newDisplay(scene);
    scene.setActive(false);
    return scene;
  }

  start(sceneName = this.currentScene?.name ?? this.scenes.keys().next().value) {
    if (!sceneName || !this.scenes.has(sceneName)) throw new Error("Choose a registered scene before starting the engine.");
    for (const [name, scene] of this.scenes) scene.setActive(name === sceneName);
    this.currentScene = this.scenes.get(sceneName);
    super.start();
    return this;
  }

  switchScene(sceneName) {
    const next = this.scenes.get(sceneName);
    if (!next) throw new Error(`Scene "${sceneName}" does not exist.`);
    if (next === this.currentScene) return this;
    this.currentScene?.setActive(false);
    this.currentScene = next;
    next.setActive(true);
    return this;
  }
}

export { Engine, Display, GameObject };
