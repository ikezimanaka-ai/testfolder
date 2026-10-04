import { SVGAssetEditor, sanitizeSvgSource } from "./studio-svg-editor.js";

const STORAGE_KEY = "canvas-engine-studio-project-v1";
const ENGINE_URL = new URL("../../engine.js", location.href).toString();
const UI_URL = new URL("../../ui-objects.js", location.href).toString();
const starter = {
  title: "starter-project",
  activeFile: "main.js",
  files: [{
    name: "main.js",
    value: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";
import { TextObject } from "./ui-objects.js";

class Player extends GameObject {
  constructor() {
    super({ x: 120, y: 120, tags: ["player"], shapes: [Shapes.circle(24, { fill: "#62d6ff" })] });
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-180 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(180 * dt);
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#182744" }));
engine.addObject(world, new Player());
engine.addObject(world, new TextObject("Canvas プレビュー", { x: 24, y: 30, fontSize: 20, color: "#e2e8f0" }));
GameStudio.log("ゲームを起動しました");
engine.start();`,
  }],
  assets: [],
};
const $ = (selector) => document.querySelector(selector);
const status = $("#save-state");
const preview = $("#preview");
const editorNode = $("#editor");
const filesList = $("#project-tree");
const symbolTree = $("#symbol-tree");
const objectTree = $("#object-tree");
const diagnosticList = $("#diagnostic-list");
const consoleList = $("#console-list");

let startupNotice = "";
let project = loadProject();
let editor;
let svgEditor;
let activeRunId = 0;
let autosaveTimer = 0;
let symbolTimer = 0;
let consoleEntries = [];
let runtimeDiagnostics = [];
let sourceDiagnostics = [];
let pendingDeleteFile = null;

function validFileName(name) {
  return typeof name === "string" && /^[\w.-]+\.m?js$/i.test(name) && !name.includes("..");
}

function normalizeProject(value) {
  if (!value || !Array.isArray(value.files)) throw new Error("プロジェクトにfiles配列がありません。");
  if (!value.files.every((file) => file && validFileName(file.name) && typeof file.value === "string")) {
    throw new Error("ファイル名またはJavaScriptソースが不正です。");
  }
  const files = value.files.map(({ name, value: source }) => ({ name, value: source }));
  if (!files.length || new Set(files.map((file) => file.name)).size !== files.length) throw new Error("JavaScriptファイルがないか、同名ファイルが重複しています。");
  if (files.some((file) => ["engine.js", "ui-objects.js"].includes(file.name))) throw new Error("engine.js と ui-objects.js は予約済みファイル名です。");
  if (value.assets !== undefined && !Array.isArray(value.assets)) throw new Error("SVG assetsは配列で指定してください。");
  const inputAssets = value.assets ?? [];
  if (!inputAssets.every((asset) => asset && typeof asset.name === "string" && typeof asset.svg === "string")) {
    throw new Error("SVGアセットの名前または内容が不正です。");
  }
  const assets = inputAssets.map(({ name, svg }) => ({ name: name.replace(/[^\w.-]/g, "_"), svg: sanitizeSvgSource(svg) }));
  if (assets.some((asset) => !asset.name) || new Set(assets.map((asset) => asset.name)).size !== assets.length) {
    throw new Error("SVGアセット名が空か、同名アセットが重複しています。");
  }
  return {
    title: typeof value.title === "string" ? value.title : "project",
    activeFile: files.some((file) => file.name === value.activeFile) ? value.activeFile : files[0].name,
    files,
    assets,
  };
}

function loadProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeProject(JSON.parse(saved)) : structuredClone(starter);
  } catch {
    startupNotice = "保存データを読めないため初期プロジェクトを開きました";
    return structuredClone(starter);
  }
}

function activeFile() {
  return project.files.find((file) => file.name === project.activeFile) ?? project.files[0];
}

function syncActiveSource() {
  if (editor && activeFile()) activeFile().value = editor.getValue();
}

function saveProject() {
  syncActiveSource();
  project.title = $("#project-name").value.trim() || "game-project";
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    status.textContent = `保存済み ${new Date().toLocaleTimeString()}`;
    status.style.color = "#86efac";
  } catch (error) {
    status.textContent = `保存に失敗: ${error.message}`;
    status.style.color = "#fca5a5";
    addConsole("error", ["プロジェクトを保存できません", error.message]);
  }
}

function scheduleSave() {
  status.textContent = "未保存";
  status.style.color = "#fcd34d";
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveProject, 500);
}

function renderProjectTree() {
  filesList.replaceChildren();
  const section = document.createElement("li");
  section.className = "tree-meta";
  section.textContent = "JavaScript";
  filesList.append(section);
  for (const file of project.files) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.className = `tree-row${file.name === project.activeFile ? " selected" : ""}`;
    button.textContent = `📄 ${file.name}`;
    button.addEventListener("click", () => switchFile(file.name));
    const actions = document.createElement("div");
    actions.className = "file-actions";
    actions.append(button);
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "tree-action";
    rename.title = "名前を変更";
    rename.textContent = "✎";
    rename.addEventListener("click", () => renameFile(file, actions));
    actions.append(rename);
    if (project.files.length > 1) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "tree-action";
      remove.title = pendingDeleteFile === file.name ? "もう一度押して削除" : "削除";
      remove.textContent = pendingDeleteFile === file.name ? "?" : "×";
      remove.addEventListener("click", () => {
        if (pendingDeleteFile !== file.name) {
          pendingDeleteFile = file.name;
          status.textContent = `${file.name} を削除するには「?」をもう一度押してください`;
          renderProjectTree();
          return;
        }
        project.files = project.files.filter((candidate) => candidate !== file);
        pendingDeleteFile = null;
        if (project.activeFile === file.name) project.activeFile = project.files[0].name;
        editor.getModel().setValue(activeFile().value);
        renderProjectTree();
        updateSymbols();
        scheduleSave();
      });
      actions.append(remove);
    }
    row.append(actions);
    filesList.append(row);
  }
  const assetsHeading = document.createElement("li");
  assetsHeading.className = "tree-meta";
  assetsHeading.textContent = "SVGアセット";
  filesList.append(assetsHeading);
  const addAsset = document.createElement("li");
  const addAssetButton = document.createElement("button");
  addAssetButton.className = "tree-row";
  addAssetButton.textContent = "＋ 新しいSVG";
  addAssetButton.addEventListener("click", addSvgAsset);
  addAsset.append(addAssetButton);
  filesList.append(addAsset);
  project.assets.forEach((asset) => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.className = "tree-row";
    button.textContent = `◇ ${asset.name}`;
    button.addEventListener("click", () => openAsset(asset));
    row.append(button);
    filesList.append(row);
  });
}

function switchFile(name) {
  syncActiveSource();
  project.activeFile = name;
  const file = activeFile();
  const model = editor.getModel();
  model.setValue(file.value);
  monaco.editor.setModelLanguage(model, "javascript");
  renderProjectTree();
  updateSymbols();
  scheduleSave();
}

function renameFile(file, container) {
  container.replaceChildren();
  const input = document.createElement("input");
  input.value = file.name;
  input.setAttribute("aria-label", "新しいファイル名");
  const finish = (save) => {
    if (save) {
      const name = input.value.trim();
      if (!validFileName(name) || ["engine.js", "ui-objects.js"].includes(name) ||
          project.files.some((candidate) => candidate !== file && candidate.name === name)) {
        addConsole("warn", ["ファイル名が不正か、すでに使われています"]);
      } else {
        const previous = file.name;
        file.name = name;
        if (project.activeFile === previous) project.activeFile = name;
      }
    }
    renderProjectTree();
    scheduleSave();
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") finish(false);
  });
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "保存";
  save.addEventListener("click", () => finish(true));
  container.append(input, save);
  input.focus();
  input.select();
}

function addFile() {
  let name = `script-${project.files.length + 1}.js`;
  while (project.files.some((file) => file.name === name)) name = `script-${Number(name.match(/\d+/)?.[0] || 0) + 1}.js`;
  const file = { name, value: 'GameStudio.log("新しいファイル");\n' };
  project.files.push(file);
  switchFile(name);
}

function addSvgAsset() {
  let next = project.assets.length + 1;
  while (project.assets.some((asset) => asset.name === `asset-${next}`)) next++;
  const name = `asset-${next}`;
  const asset = { name, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360"></svg>` };
  project.assets.push(asset);
  renderProjectTree();
  openAsset(asset);
  scheduleSave();
}

function openAsset(asset) {
  $("#code-workspace").hidden = true;
  $("#svg-workspace").hidden = false;
  document.querySelectorAll("[data-workspace]").forEach((button) => button.classList.toggle("active", button.dataset.workspace === "svg"));
  svgEditor.currentAsset = asset;
  svgEditor.load(asset.svg);
  setInspector("properties");
}

function setWorkspace(name) {
  const codeMode = name === "code";
  $("#code-workspace").hidden = !codeMode;
  $("#svg-workspace").hidden = codeMode;
  document.querySelectorAll("[data-workspace]").forEach((button) => button.classList.toggle("active", button.dataset.workspace === name));
}

function serializeProject() {
  syncActiveSource();
  project.title = $("#project-name").value.trim() || "game-project";
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: `${project.title}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadProjectFile(file) {
  const reader = new FileReader();
  reader.onerror = () => addConsole("error", ["プロジェクトファイルを読めませんでした"]);
  reader.onload = () => {
    try {
      project = normalizeProject(JSON.parse(String(reader.result)));
      $("#project-name").value = project.title;
      renderProjectTree();
      editor.getModel().setValue(activeFile().value);
      updateSymbols();
      saveProject();
    } catch (error) {
      addConsole("error", ["JSONプロジェクトを読み込めません", error.message]);
    }
  };
  reader.readAsText(file);
}

function base64DataUrl(source) {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:text/javascript;base64,${btoa(binary)}`;
}

function normalizeModulePath(from, specifier) {
  const parts = specifier.startsWith(".") ? from.split("/").slice(0, -1) : [];
  for (const part of (specifier.startsWith(".") ? specifier : specifier).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function rewriteImports(source, fileName) {
  return source.replace(/((?:from\s*|import\s*)["'])([^"']+)(["'])/g, (full, before, specifier, after) => {
    if (!specifier.startsWith(".")) return full;
    const normalized = normalizeModulePath(fileName, specifier);
    const resolved = normalized === "engine.js" ? "engine.js" : normalized === "ui-objects.js" ? "ui-objects.js" : normalized;
    return `${before}studio/${resolved}${after}`;
  });
}

async function runGame() {
  syncActiveSource();
  project.title = $("#project-name").value.trim() || "game-project";
  stopGame();
  const runId = ++activeRunId;
  $("#run-state").textContent = "起動中…";
  runtimeDiagnostics = [];
  renderDiagnostics();
  try {
    const [engineSource, uiSource] = await Promise.all([
      fetch(ENGINE_URL).then((response) => {
        if (!response.ok) throw new Error(`engine.js: HTTP ${response.status}`);
        return response.text();
      }),
      fetch(UI_URL).then((response) => {
        if (!response.ok) throw new Error(`ui-objects.js: HTTP ${response.status}`);
        return response.text();
      }),
    ]);
    const moduleSources = new Map([
      ["engine.js", engineSource],
      ["ui-objects.js", rewriteImports(uiSource, "ui-objects.js")],
      ...project.files.map((file) => [file.name, rewriteImports(file.value, file.name)]),
    ]);
    const imports = Object.fromEntries([...moduleSources].map(([name, source]) => [`studio/${name}`, base64DataUrl(source)]));
    const entry = project.files.some((file) => file.name === "main.js") ? "main.js" : project.activeFile;
    const bridge = `<script>
      (() => {
        const runId = ${JSON.stringify(runId)};
        const send = (type, payload) => parent.postMessage({ source: "engine-studio", runId, type, payload }, "*");
        const print = (value) => {
          try { return typeof value === "string" ? value : JSON.stringify(value, (_key, item) => typeof item === "bigint" ? String(item) + "n" : item); }
          catch { return String(value); }
        };
        const sendLog = (level, args) => send("log", { level, args: args.map(print) });
        for (const level of ["log", "info", "warn", "error", "debug"]) {
          const original = console[level].bind(console);
          console[level] = (...args) => { original(...args); sendLog(level === "info" || level === "debug" ? "log" : level, args); };
        }
        const engines = new Set();
        globalThis.GameStudio = Object.freeze({
          log: (...args) => sendLog("log", args),
          warn: (...args) => sendLog("warn", args),
          error: (...args) => sendLog("error", args),
          assets: Object.freeze(${JSON.stringify(Object.fromEntries(project.assets.map((asset) => [asset.name, asset.svg])))}),
          assetUrl(name) {
            const svg = this.assets[name];
            if (typeof svg !== "string") throw new Error("SVG asset not found: " + name);
            return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
          },
          _registerEngine(engine) { engines.add(engine); },
        });
        addEventListener("error", (event) => send("runtime-error", { message: event.message || "Runtime error", line: event.lineno || 0, column: event.colno || 0 }));
        addEventListener("unhandledrejection", (event) => send("runtime-error", { message: String(event.reason?.stack || event.reason), line: 0, column: 0 }));
        setInterval(() => {
          const snapshot = [...engines].map((engine) => ({
            displays: engine.displays.map((display) => ({
              id: display.id, width: display.width, height: display.height, x: display.x, y: display.y,
              objects: display.objects.filter((object) => !object._removed).map((object) => ({
                type: object.constructor.name, tags: [...object.tags], x: object.x, y: object.y,
                width: object.width, height: object.height, rotation: object.rotation, opacity: object.opacity,
                shapeCount: object.shapes.length,
              })),
            })),
          }));
          send("objects", snapshot);
        }, 500);
      })();
    </script>`;
    const importMap = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
    const documentText = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#020617}canvas{display:block;width:100%;height:100%}</style></head><body><canvas id="game"></canvas>${bridge}${importMap}<script type="module">import("studio/${entry}").catch(error=>{parent.postMessage({source:"engine-studio",runId:${JSON.stringify(runId)},type:"runtime-error",payload:{message:String(error.stack||error),line:0,column:0}},"*")});</script></body></html>`;
    preview.srcdoc = documentText;
    $("#run-state").textContent = "実行中";
    $("#run-state").style.color = "#86efac";
    scheduleSave();
  } catch (error) {
    $("#run-state").textContent = "実行失敗";
    $("#run-state").style.color = "#fca5a5";
    runtimeDiagnostics = [{ severity: "error", message: error.message, file: "runtime", line: 0 }];
    renderDiagnostics();
    addConsole("error", ["ゲームを起動できません", error.message]);
  }
}

function stopGame() {
  activeRunId++;
  preview.srcdoc = "<!doctype html><html><body style='margin:0;background:#020617'></body></html>";
  $("#run-state").textContent = "停止中";
  $("#run-state").style.color = "";
  objectTree.replaceChildren();
}

function handleRuntimeMessage(event) {
  if (event.source !== preview.contentWindow || event.data?.source !== "engine-studio" || event.data.runId !== activeRunId) return;
  const { type, payload } = event.data;
  if (type === "log") addConsole(payload.level, payload.args);
  else if (type === "runtime-error") {
    runtimeDiagnostics.push({ severity: "error", message: payload.message, file: "実行時", line: payload.line || 0 });
    renderDiagnostics();
    addConsole("error", [payload.message]);
  } else if (type === "objects") renderObjectTree(payload);
}

function addConsole(level, values) {
  consoleEntries.push({ level, values: values.map(String), time: new Date() });
  if (consoleEntries.length > 500) consoleEntries.shift();
  renderConsole();
}

function renderConsole() {
  const filter = $("#console-filter").value.toLowerCase();
  consoleList.replaceChildren();
  consoleEntries.filter((entry) => entry.values.join(" ").toLowerCase().includes(filter)).forEach((entry) => {
    const row = document.createElement("li");
    row.className = `console-row ${entry.level}`;
    const time = document.createElement("span");
    time.className = "console-time";
    time.textContent = entry.time.toLocaleTimeString();
    row.append(time, document.createTextNode(`[${entry.level}] ${entry.values.join(" ")}`));
    consoleList.append(row);
  });
}

function renderObjectTree(snapshot) {
  objectTree.replaceChildren();
  for (const engine of snapshot) {
    engine.displays.forEach((display) => {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Display ${display.id} · ${display.width}×${display.height}`;
      details.append(summary);
      for (const object of display.objects) {
        const item = document.createElement("li");
        item.className = "tree-row";
        const size = object.width || object.height ? `${object.width}×${object.height}` : `${object.shapeCount}図形`;
        item.textContent = `${object.type} [${object.tags.join(", ")}] · (${formatNumber(object.x)}, ${formatNumber(object.y)}) · ${size} · rot ${formatNumber(object.rotation)}° · α ${formatNumber(object.opacity)}`;
        details.append(item);
      }
      objectTree.append(details);
    });
  }
}

function formatNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)).toString() : "—";
}

function tokenize(source) {
  const tokens = [];
  const expression = /(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|([A-Za-z_$][\w$]*)|(\d+(?:\.\d+)?)|(=>|===|!==|==|!=|<=|>=|\+\+|--|&&|\|\||\?\?|[\s\S])/gy;
  let match;
  while ((match = expression.exec(source))) {
    if (/^\s+$/.test(match[0]) || match[0].startsWith("//") || match[0].startsWith("/*")) continue;
    tokens.push({ value: match[1] ? match[1].slice(1, -1) : match[0], start: match.index, end: expression.lastIndex, string: Boolean(match[1]) });
  }
  return tokens;
}

function matchingBrace(tokens, start) {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (tokens[index].value === "{") depth++;
    if (tokens[index].value === "}" && --depth === 0) return index;
  }
  return tokens.length - 1;
}

function parseSymbols(source) {
  const tokens = tokenize(source);
  const scopes = [];
  const nodes = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].string) continue;
    if (tokens[index].value === "function") {
      let nameIndex = index + 1;
      if (tokens[nameIndex]?.value === "*") nameIndex++;
      const name = tokens[nameIndex]?.value === "(" ? "(anonymous function)" : tokens[nameIndex]?.value;
      let parameterOpen = nameIndex;
      while (parameterOpen < tokens.length && tokens[parameterOpen].value !== "(") parameterOpen++;
      const parameterClose = matchingPair(tokens, parameterOpen, "(", ")");
      let body = parameterClose + 1;
      while (body < tokens.length && tokens[body].value !== "{") body++;
      if (body < tokens.length) {
        scopes.push({
          start: tokens[body].start, end: tokens[matchingBrace(tokens, body)].end,
          node: { name, kind: "function", line: lineAt(source, tokens[index].start), offset: tokens[index].start, children: extractParameters(tokens, parameterOpen, parameterClose, source) },
        });
      }
    } else if (tokens[index].value === "class" && /^[A-Za-z_$]/.test(tokens[index + 1]?.value || "")) {
      let body = index + 1;
      while (body < tokens.length && tokens[body].value !== "{") body++;
      if (body < tokens.length) scopes.push({ start: tokens[body].start, end: tokens[matchingBrace(tokens, body)].end, node: { name: tokens[index + 1].value, kind: "class", line: lineAt(source, tokens[index].start), offset: tokens[index].start, children: [] } });
    }
  }
  const reserved = new Set(["if", "for", "while", "switch", "catch", "with", "function", "return", "super"]);
  for (let index = 0; index < tokens.length - 2; index++) {
    if (tokens[index].string || !/^[A-Za-z_$][\w$]*$/.test(tokens[index].value) || reserved.has(tokens[index].value) || tokens[index + 1].value !== "(") continue;
    let depth = 0;
    let close = index + 1;
    for (; close < tokens.length; close++) {
      if (tokens[close].value === "(") depth++;
      else if (tokens[close].value === ")" && --depth === 0) break;
    }
    if (tokens[close + 1]?.value !== "{") continue;
    const classScope = scopes
      .filter((scope) => scope.node.kind === "class" && tokens[index].start > scope.start && tokens[index].start < scope.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    if (!classScope) continue;
    const classBody = tokens.findIndex((token) => token.start === classScope.start);
    let braceDepth = 0;
    for (let cursor = classBody; cursor < index; cursor++) {
      if (tokens[cursor].value === "{") braceDepth++;
      else if (tokens[cursor].value === "}") braceDepth--;
    }
    if (braceDepth !== 1) continue;
    const body = close + 1;
    scopes.push({
      start: tokens[body].start, end: tokens[matchingBrace(tokens, body)].end,
      node: {
        name: tokens[index].value, kind: "method", line: lineAt(source, tokens[index].start), offset: tokens[index].start,
        children: extractParameters(tokens, index + 1, close, source),
      },
    });
  }
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].string) continue;
    if (!["const", "let", "var"].includes(tokens[index].value)) continue;
    const previous = tokens[index - 1]?.value;
    if (previous === "." || previous === "?" || previous === "import") continue;
    let nameIndex = index + 1;
    while (tokens[nameIndex] && !/^[A-Za-z_$][\w$]*$/.test(tokens[nameIndex].value)) {
      if ([";", "{", "}"].includes(tokens[nameIndex].value)) break;
      nameIndex++;
    }
    const token = tokens[nameIndex];
    if (!token || !/^[A-Za-z_$][\w$]*$/.test(token.value)) continue;
    const end = statementEnd(tokens, nameIndex + 1);
    let functionScope = null;
    for (const scope of scopes) {
      if (tokens[index].start >= scope.start && tokens[index].start < scope.end && (!functionScope || scope.end - scope.start < functionScope.end - functionScope.start)) functionScope = scope;
    }
    const node = { name: token.value, kind: tokens[index].value, line: lineAt(source, tokens[index].start), offset: tokens[index].start, children: [] };
    const arrow = tokens.slice(nameIndex + 1, end).findIndex((part) => part.value === "=>");
    if (arrow >= 0) {
      const arrowIndex = nameIndex + 1 + arrow;
      if (tokens[arrowIndex - 1]?.value === ")") {
        let open = arrowIndex - 1;
        let depth = 0;
        for (; open >= 0; open--) {
          if (tokens[open].value === ")") depth++;
          else if (tokens[open].value === "(" && --depth === 0) break;
        }
        node.children.push(...extractParameters(tokens, open, arrowIndex - 1, source));
      } else if (/^[A-Za-z_$][\w$]*$/.test(tokens[arrowIndex - 1]?.value || "")) {
        node.children.push({ name: tokens[arrowIndex - 1].value, kind: "parameter", line: lineAt(source, tokens[arrowIndex - 1].start), offset: tokens[arrowIndex - 1].start, children: [] });
      }
      const bodyIndex = tokens.findIndex((part, candidate) => candidate > arrowIndex && (part.value === "{" || part.value === ";"));
      if (bodyIndex >= 0 && tokens[bodyIndex].value === "{") scopes.push({ start: tokens[bodyIndex].start, end: tokens[matchingBrace(tokens, bodyIndex)].end, node });
      else node.kind = "function";
    }
    nodes.push({ node, scope: functionScope });
  }
  for (const scope of scopes) nodes.push({ node: scope.node, scope: null, scopeRange: scope });
  const roots = [];
  const orderedScopes = scopes.slice().sort((a, b) => (a.end - a.start) - (b.end - b.start));
  for (const item of nodes) {
    const parentScope = orderedScopes.find((scope) => item.node.offset >= scope.start && item.node.offset < scope.end && scope.node !== item.node);
    if (parentScope) parentScope.node.children.push(item.node);
    else roots.push(item.node);
  }
  const deduped = new Map();
  const unique = (list) => {
    const result = [];
    for (const node of list) {
      const key = `${node.kind}:${node.name}:${node.offset}`;
      if (deduped.has(key)) continue;
      deduped.set(key, node);
      node.children = unique(node.children);
      result.push(node);
    }
    return result;
  };
  return unique(roots).sort((a, b) => a.offset - b.offset);
}

function matchingPair(tokens, start, open, close) {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (tokens[index].value === open) depth++;
    else if (tokens[index].value === close && --depth === 0) return index;
  }
  return start;
}

function extractParameters(tokens, open, close, source) {
  if (tokens[open]?.value !== "(" || close <= open) return [];
  const result = [];
  let segmentStart = open + 1;
  let nesting = 0;
  for (let index = open + 1; index <= close; index++) {
    const value = tokens[index]?.value;
    if (["(", "[", "{"].includes(value)) nesting++;
    else if ([")", "]", "}"].includes(value)) nesting--;
    if ((value === "," && nesting === 0) || index === close) {
      const candidate = tokens.slice(segmentStart, index).find((token) => /^[A-Za-z_$][\w$]*$/.test(token.value) && !token.string);
      if (candidate) result.push({ name: candidate.value, kind: "parameter", line: lineAt(source, candidate.start), offset: candidate.start, children: [] });
      segmentStart = index + 1;
    }
  }
  return result;
}

function statementEnd(tokens, from) {
  let depth = 0;
  for (let index = from; index < tokens.length; index++) {
    const value = tokens[index].value;
    if (["(", "[", "{"].includes(value)) depth++;
    else if ([")", "]", "}"].includes(value)) {
      if (depth === 0) return index;
      depth--;
    } else if (value === ";" && depth === 0) return index;
  }
  return tokens.length;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function updateSymbols() {
  if (!editor) return;
  clearTimeout(symbolTimer);
  symbolTimer = setTimeout(() => {
    const source = editor.getValue();
    const symbols = parseSymbols(source);
    const filter = $("#symbol-filter").value.toLowerCase();
    symbolTree.replaceChildren();
    const containsMatch = (item) => `${item.name} ${item.kind}`.toLowerCase().includes(filter) ||
      item.children.some(containsMatch);
    const append = (items, parent) => {
      for (const item of items) {
        const matches = `${item.name} ${item.kind}`.toLowerCase().includes(filter);
        if (!matches && filter && !containsMatch(item)) continue;
        const li = document.createElement("li");
        if (item.children.length) {
          const scopeRow = document.createElement("div");
          scopeRow.className = "scope-row";
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.className = "tree-row";
          summary.textContent = `${item.name} · ${item.kind} · L${item.line}`;
          details.append(summary);
          const children = document.createElement("ul");
          children.className = "tree-list";
          append(item.children, children);
          details.append(children);
          const jump = document.createElement("button");
          jump.type = "button";
          jump.className = "tree-toggle";
          jump.title = "宣言のコードへ移動";
          jump.textContent = "↗";
          jump.addEventListener("click", () => jumpToLine(item.line));
          scopeRow.append(details, jump);
          li.append(scopeRow);
        } else {
          const button = document.createElement("button");
          button.className = "tree-row";
          button.textContent = `${item.name} · ${item.kind} · L${item.line}`;
          button.addEventListener("click", () => jumpToLine(item.line));
          li.append(button);
        }
        parent.append(li);
      }
    };
    append(symbols, symbolTree);
  }, 180);
}

function jumpToLine(line) {
  const model = editor.getModel();
  const position = { lineNumber: Math.max(1, line), column: 1 };
  editor.setPosition(position);
  editor.revealPositionInCenter(position);
  editor.focus();
}

function updateDiagnostics() {
  const markers = monaco.editor.getModelMarkers({ resource: editor.getModel().uri });
  sourceDiagnostics = markers.map((marker) => ({
    severity: marker.severity === monaco.MarkerSeverity.Error ? "error" : "warning",
    file: activeFile().name, line: marker.startLineNumber,
    message: marker.message, column: marker.startColumn,
  }));
  renderDiagnostics();
}

function renderDiagnostics() {
  const all = [...sourceDiagnostics, ...runtimeDiagnostics];
  $("#diagnostic-count").textContent = String(all.length);
  diagnosticList.replaceChildren();
  all.forEach((diagnostic) => {
    const row = document.createElement("li");
    row.className = `diagnostic-row ${diagnostic.severity}`;
    const location = document.createElement("span");
    location.className = "diagnostic-location";
    location.textContent = `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}`;
    row.append(location, document.createTextNode(diagnostic.message));
    row.addEventListener("click", () => {
      if (diagnostic.file && project.files.some((file) => file.name === diagnostic.file)) {
        switchFile(diagnostic.file);
        jumpToLine(diagnostic.line || 1);
      }
    });
    diagnosticList.append(row);
  });
}

function setInspector(tab) {
  document.querySelectorAll("[data-inspector]").forEach((button) => button.classList.toggle("active", button.dataset.inspector === tab));
  $("#symbols-panel").hidden = tab !== "symbols";
  $("#objects-panel").hidden = tab !== "objects";
  $("#properties-panel").hidden = tab !== "properties";
}

function setDock(tab) {
  document.querySelectorAll("[data-dock]").forEach((button) => button.classList.toggle("active", button.dataset.dock === tab));
  $("#diagnostics-panel").hidden = tab !== "diagnostics";
  $("#console-panel").hidden = tab !== "console";
}

function setLayout(layout) {
  const workspace = $("#code-workspace");
  workspace.classList.toggle("tab-mode", layout === "tabs");
  workspace.classList.remove("show-preview");
  $("#layout-split").classList.toggle("active", layout === "split");
  $("#layout-tabs").classList.toggle("active", layout === "tabs");
  $("#preview-tab").style.display = layout === "tabs" ? "inline-block" : "none";
  $("#preview-tab").textContent = "ゲーム画面";
}

function init() {
  $("#project-name").value = project.title;
  renderProjectTree();
  svgEditor = new SVGAssetEditor($("#svg-editor-root"), {
    onChange: (state) => {
      if (svgEditor.currentAsset) svgEditor.currentAsset.svg = state.svg;
      scheduleSave();
    },
    onSelection: () => setInspector("properties"),
    onAssetRename: (value) => {
      const next = value.trim().replace(/[^\w.-]/g, "_");
      const asset = svgEditor.currentAsset;
      if (!asset || !next || project.assets.some((item) => item !== asset && item.name === next)) {
        addConsole("warn", ["アセット名が空か、すでに使われています"]);
        svgEditor._renderProperties();
        return;
      }
      asset.name = next;
      renderProjectTree();
      scheduleSave();
    },
    onAssetDelete: (asset) => {
      project.assets = project.assets.filter((item) => item !== asset);
      svgEditor.clear();
      setWorkspace("code");
      setInspector("symbols");
      document.querySelector(".inspector-panel").classList.remove("mobile-open");
      $("#toggle-inspector").setAttribute("aria-expanded", "false");
      renderProjectTree();
      scheduleSave();
    },
  });
  document.querySelectorAll("[data-workspace]").forEach((button) => button.addEventListener("click", () => setWorkspace(button.dataset.workspace)));
  document.querySelectorAll("[data-inspector]").forEach((button) => button.addEventListener("click", () => setInspector(button.dataset.inspector)));
  document.querySelectorAll("[data-dock]").forEach((button) => button.addEventListener("click", () => setDock(button.dataset.dock)));
  $("#layout-split").addEventListener("click", () => setLayout("split"));
  $("#layout-tabs").addEventListener("click", () => setLayout("tabs"));
  $("#preview-tab").addEventListener("click", () => {
    const showingPreview = $("#code-workspace").classList.toggle("show-preview");
    $("#preview-tab").textContent = showingPreview ? "コード" : "ゲーム画面";
  });
  $("#run").addEventListener("click", runGame);
  $("#stop").addEventListener("click", stopGame);
  $("#save").addEventListener("click", saveProject);
  $("#download-project").addEventListener("click", serializeProject);
  $("#load-project").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) loadProjectFile(file);
    event.target.value = "";
  });
  $("#new-file").addEventListener("click", addFile);
  $("#project-name").addEventListener("input", scheduleSave);
  $("#symbol-filter").addEventListener("input", updateSymbols);
  $("#console-filter").addEventListener("input", renderConsole);
  $("#clear-console").addEventListener("click", () => { consoleEntries = []; renderConsole(); });
  $("#toggle-dock").addEventListener("click", (event) => {
    const dock = document.querySelector(".bottom-dock");
    dock.classList.toggle("collapsed");
    event.currentTarget.textContent = dock.classList.contains("collapsed") ? "展開" : "折りたたむ";
  });
  $("#toggle-inspector").addEventListener("click", (event) => {
    const open = document.querySelector(".inspector-panel").classList.toggle("mobile-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  $("#close-inspector").addEventListener("click", () => {
    document.querySelector(".inspector-panel").classList.remove("mobile-open");
    $("#toggle-inspector").setAttribute("aria-expanded", "false");
  });
  window.addEventListener("message", handleRuntimeMessage);
  window.addEventListener("beforeunload", syncActiveSource);
  $("#project-name").value = project.title;
  if (typeof window.require !== "function") {
    status.textContent = "Monaco CDNを読み込めませんでした";
    status.style.color = "#fca5a5";
    editorNode.textContent = "コードエディターを読み込めません。ネットワーク接続を確認してください。";
    return;
  }
  window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
  window.require(["vs/editor/editor.main"], () => {
    editor = monaco.editor.create(editorNode, {
      value: activeFile().value,
      language: "javascript",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    });
    editor.onDidChangeModelContent(() => {
      syncActiveSource();
      updateSymbols();
      scheduleSave();
      updateDiagnostics();
    });
    monaco.editor.onDidChangeMarkers(() => updateDiagnostics());
    updateSymbols();
    updateDiagnostics();
    saveProject();
    if (startupNotice) {
      status.textContent = startupNotice;
      status.style.color = "#fcd34d";
    }
    runGame();
  }, (error) => {
    status.textContent = "Monaco Editorの初期化に失敗しました";
    status.style.color = "#fca5a5";
    editorNode.textContent = `Monaco Editorを初期化できません: ${error.message || error}`;
  });
}

init();
