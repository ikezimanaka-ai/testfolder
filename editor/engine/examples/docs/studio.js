import { SVGAssetEditor, sanitizeSvgSource } from "./studio-svg-editor.js";
import {
  createProject,
  getLastProjectId,
  getProject,
  getProjectCatalog,
  getProjectHistory,
  restoreProjectRevision,
  saveProjectDraft,
  saveProjectRevision,
  setLastProjectId,
} from "./studio-project-store.js";

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
let projectId = new URLSearchParams(location.search).get("project");
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
let clipboard = null;
let projectSelection = [];

function loadProject() {
  try {
    const catalog = getProjectCatalog();
    if (!projectId) {
      const lastProjectId = getLastProjectId();
      projectId = catalog.some((item) => item.id === lastProjectId) ? lastProjectId : catalog[0]?.id ?? null;
    }
    if (projectId) {
      if (!catalog.some((item) => item.id === projectId)) throw new Error("指定されたプロジェクトが見つかりません。");
      setLastProjectId(projectId);
      return normalizeProject(getProject(projectId));
    }
    return structuredClone(starter);
  } catch (error) {
    startupNotice = `プロジェクトを読み込めませんでした: ${error.message}`;
    projectId = null;
    return structuredClone(starter);
  }
}

function validFileName(name) {
  return typeof name === "string" && name.trim() && !name.includes("/") && !name.includes("\\") && !name.includes("..") && !name.startsWith(".");
}

function validFolderName(name) {
  return typeof name === "string" && name.trim() && !name.includes("/") && !name.includes("\\") && !name.includes("..") && !name.startsWith(".");
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function getEntryPath(entry) {
  if (!entry) return "";
  return typeof entry.path === "string" && entry.path ? entry.path.replace(/\\/g, "/") : entry.name || "";
}

function normalizeProjectEntry(entry, parentPath = "") {
  if (!entry || typeof entry.name !== "string") throw new Error("ファイルまたはフォルダ名がありません。");
  const name = entry.name.trim();
  const pathValue = typeof entry.path === "string" && entry.path ? entry.path.replace(/\\/g, "/") : parentPath ? `${parentPath}/${name}` : name;
  if (entry.kind === "folder") {
    const folder = {
      name,
      path: pathValue,
      kind: "folder",
      expanded: typeof entry.expanded === "boolean" ? entry.expanded : true,
      children: Array.isArray(entry.children) ? entry.children.map((child) => normalizeProjectEntry(child, pathValue)) : [],
    };
    if (entry.value !== undefined) delete folder.value;
    return folder;
  }
  if (typeof entry.kind === "string" && entry.kind === "binary") {
    const data = typeof entry.data === "string" ? entry.data : typeof entry.base64 === "string" ? entry.base64 : "";
    if (!data) throw new Error(`バイナリファイル ${name} の内容が空です。`);
    return {
      name,
      path: pathValue,
      kind: "binary",
      mimeType: typeof entry.mimeType === "string" ? entry.mimeType : "application/octet-stream",
      data,
    };
  }
  const source = typeof entry.value === "string" ? entry.value : "";
  if (!source && typeof entry.data === "string" && entry.encoding === "base64") {
    return {
      name,
      path: pathValue,
      kind: "text",
      value: atob(entry.data),
    };
  }
  return {
    name,
    path: pathValue,
    kind: "text",
    value: source,
  };
}

function normalizeProject(value) {
  if (!value || !Array.isArray(value.files)) throw new Error("プロジェクトにfiles配列がありません。");
  const files = value.files.map((entry) => normalizeProjectEntry(entry));
  if (!files.length || new Set(files.map((entry) => getEntryPath(entry))).size !== files.length) {
    throw new Error("ファイルがないか、同名または同じパスの項目が重複しています。");
  }
  if (files.some((entry) => entry.kind !== "folder" && ["engine.js", "ui-objects.js"].includes(entry.name))) {
    throw new Error("engine.js と ui-objects.js は予約済みファイル名です。");
  }
  if (value.assets !== undefined && !Array.isArray(value.assets)) throw new Error("SVG assetsは配列で指定してください。");
  const inputAssets = value.assets ?? [];
  if (!inputAssets.every((asset) => asset && typeof asset.name === "string" && typeof asset.svg === "string")) {
    throw new Error("SVGアセットの名前または内容が不正です。");
  }
  const assets = inputAssets.map(({ name, svg }) => ({ name: name.replace(/[^\w.-]/g, "_"), svg: sanitizeSvgSource(svg) }));
  if (assets.some((asset) => !asset.name) || new Set(assets.map((asset) => asset.name)).size !== assets.length) {
    throw new Error("SVGアセット名が空か、同名アセットが重複しています。");
  }
  const activeFile = typeof value.activeFile === "string" ? value.activeFile : files[0]?.path ?? "";
  return {
    title: typeof value.title === "string" ? value.title : "project",
    activeFile: files.some((entry) => entry.kind !== "folder" && getEntryPath(entry) === activeFile) ? activeFile : files.find((entry) => entry.kind !== "folder")?.path ?? "",
    files,
    assets,
  };
}

function flattenProjectEntries(entries = project.files, output = []) {
  for (const entry of entries) {
    output.push(entry);
    if (entry.kind === "folder" && Array.isArray(entry.children)) flattenProjectEntries(entry.children, output);
  }
  return output;
}

function flattenProjectFiles(entries = project.files) {
  return flattenProjectEntries(entries).filter((entry) => entry && entry.kind !== "folder");
}

function findEntryByPath(entries, path) {
  for (const entry of entries) {
    if (getEntryPath(entry) === path) return entry;
    if (entry.kind === "folder" && Array.isArray(entry.children)) {
      const found = findEntryByPath(entry.children, path);
      if (found) return found;
    }
  }
  return null;
}

function parentPathOf(path) {
  if (!path) return "";
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index) : "";
}

function entryDisplayName(entry) {
  return entry.kind === "folder" ? `📁 ${entry.name}` : entry.kind === "binary" ? `📦 ${entry.name}` : `📄 ${entry.name}`;
}

function activeFile() {
  const activePath = project.activeFile || project.files.find((entry) => entry.kind !== "folder")?.path || "";
  return findEntryByPath(project.files, activePath) || project.files.find((entry) => entry.kind !== "folder") || null;
}

function syncActiveSource() {
  const file = activeFile();
  if (!editor || !file || file.kind === "folder" || file.kind === "binary") return;
  file.value = editor.getValue();
}

function saveProject() {
  syncActiveSource();
  project.title = $("#project-name").value.trim() || "game-project";
  try {
    if (!projectId) {
      projectId = createProject(project.title, project);
      setLastProjectId(projectId);
    }
    const revision = saveProjectRevision(projectId, project);
    if (!revision) saveProjectDraft(projectId, project);
    status.textContent = revision ? `履歴に保存 ${new Date().toLocaleTimeString()}` : `保存済み ${new Date().toLocaleTimeString()}`;
    status.style.color = "#86efac";
  } catch (error) {
    status.textContent = `保存に失敗: ${error.message}`;
    status.style.color = "#fca5a5";
    addConsole("error", ["プロジェクトを保存できません", error.message]);
  }
}

function showProjectHistory() {
  const list = $("#history-list");
  const history = getProjectHistory(projectId).reverse();
  list.replaceChildren();
  $("#history-empty").hidden = history.length > 0;
  for (const revision of history) {
    const item = document.createElement("li");
    item.className = "history-item";
    const details = document.createElement("span");
    details.textContent = `${revision.summary} (${new Date(revision.createdAt).toLocaleString()})`;
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "復元";
    restore.addEventListener("click", () => {
      if (!window.confirm(`「${revision.summary}」の内容を復元しますか？`)) return;
      try {
        clearTimeout(autosaveTimer);
        project = normalizeProject(restoreProjectRevision(projectId, revision.id));
        $("#project-name").value = project.title;
        renderProjectTree();
        if (editor) editor.getModel().setValue(activeFile().value);
        if (svgEditor) svgEditor.clear();
        setWorkspace("code");
        updateSymbols();
        $("#history-dialog").close();
        status.textContent = "変更履歴を復元しました。";
        status.style.color = "#86efac";
      } catch (error) {
        status.textContent = `履歴の復元に失敗しました: ${error.message}`;
        status.style.color = "#fca5a5";
      }
    });
    item.append(details, restore);
    list.append(item);
  }
  $("#history-dialog").showModal();
}

function scheduleSave() {
  status.textContent = "未保存";
  status.style.color = "#fcd34d";
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    syncActiveSource();
    project.title = $("#project-name").value.trim() || "game-project";
    try {
      if (!projectId) {
        projectId = createProject(project.title, project);
        setLastProjectId(projectId);
      }
      saveProjectDraft(projectId, project);
      status.textContent = "自動保存済み";
      status.style.color = "#86efac";
    } catch (error) {
      status.textContent = `自動保存に失敗: ${error.message}`;
      status.style.color = "#fca5a5";
      addConsole("error", ["プロジェクトを保存できません", error.message]);
    }
  }, 500);
}

function ensureUniqueName(baseName, parentPath = "") {
  const parentLabel = parentPath ? parentPath : "";
  const original = typeof baseName === "string" ? baseName.trim() || "item" : "item";
  const position = original.lastIndexOf(".");
  const extension = position > 0 ? original.slice(position) : "";
  const stem = position > 0 ? original.slice(0, position) : original;
  const normalizedStem = stem.replace(/\(\d+\)$/, "");
  const folderEntries = parentLabel ? (findEntryByPath(project.files, parentLabel)?.kind === "folder" ? findEntryByPath(project.files, parentLabel).children : []) : project.files;
  const fileNames = new Set((folderEntries || []).map((entry) => entry.name));

  const sameStemNames = Array.from(fileNames).filter((name) => {
    const filePosition = name.lastIndexOf(".");
    if (filePosition < 0 || name.slice(filePosition) !== extension) return false;
    const fileStem = name.slice(0, filePosition);
    return fileStem === normalizedStem || (/\(\d+\)$/.test(fileStem) && fileStem.replace(/\(\d+\)$/, "") === normalizedStem);
  });

  if (!fileNames.has(original) && sameStemNames.length === 0) return original;

  let nextIndex = 2;
  for (const name of sameStemNames) {
    const filePosition = name.lastIndexOf(".");
    const fileStem = name.slice(0, filePosition);
    const match = fileStem.match(/\((\d+)\)$/);
    if (match && fileStem.replace(/\(\d+\)$/, "") === normalizedStem) {
      nextIndex = Math.max(nextIndex, Number(match[1]) + 1);
    }
  }

  let candidate = `${normalizedStem}(${nextIndex})${extension}`;
  while (fileNames.has(candidate)) {
    nextIndex += 1;
    candidate = `${normalizedStem}(${nextIndex})${extension}`;
  }
  return candidate;
}

function insertEntry(entry, parentPath = "") {
  const target = parentPath ? findEntryByPath(project.files, parentPath) : null;
  const container = target && target.kind === "folder" ? target.children : project.files;
  if (Array.isArray(container)) {
    container.push(entry);
    return entry;
  }
  return null;
}

function removeEntryByPath(entries, path) {
  const index = entries.findIndex((entry) => getEntryPath(entry) === path);
  if (index >= 0) {
    entries.splice(index, 1);
    return true;
  }
  for (const entry of entries) {
    if (entry.kind === "folder" && Array.isArray(entry.children)) {
      if (removeEntryByPath(entry.children, path)) return true;
    }
  }
  return false;
}

function duplicateEntry(entry, parentPath = "") {
  const clone = structuredClone(entry);
  const baseName = entry.name;
  const nextName = ensureUniqueName(baseName, parentPath);
  clone.name = nextName;
  clone.path = parentPath ? `${parentPath}/${nextName}` : nextName;
  if (clone.kind === "folder") {
    clone.children = (Array.isArray(entry.children) ? entry.children : []).map((child) => duplicateEntry(child, clone.path));
    clone.expanded = true;
  }
  return clone;
}

function updateChildPaths(entry, parentPath = "") {
  const nextPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  entry.path = nextPath;
  if (entry.kind === "folder" && Array.isArray(entry.children)) {
    entry.children.forEach((child) => updateChildPaths(child, nextPath));
  }
}

function setProjectSelection(paths, additive = false) {
  const target = Array.from(new Set(paths.filter(Boolean)));
  if (additive) {
    projectSelection = Array.from(new Set([...projectSelection, ...target]));
  } else {
    projectSelection = target;
  }
}

function getSelectedEntries() {
  return projectSelection
    .map((path) => findEntryByPath(project.files, path))
    .filter(Boolean);
}

function renderProjectTree() {
  filesList.replaceChildren();
  const section = document.createElement("li");
  section.className = "tree-meta";
  section.textContent = "ファイル";
  filesList.append(section);

  const renderEntries = (entries, depth = 0) => {
    const list = document.createElement("ul");
    list.className = "tree-children";
    entries.forEach((entry) => {
      const row = document.createElement("li");
      const wrapper = document.createElement("div");
      wrapper.className = "scope-row";
      wrapper.style.marginLeft = `${depth * 14}px`;
      wrapper.dataset.path = getEntryPath(entry);
      wrapper.draggable = true;
      wrapper.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-entry-path", getEntryPath(entry));
        setProjectSelection([getEntryPath(entry)], event.ctrlKey || event.metaKey);
      });
      wrapper.addEventListener("dragover", (event) => {
        if (entry.kind === "folder") {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      });
      wrapper.addEventListener("drop", (event) => {
        event.preventDefault();
        if (entry.kind !== "folder") return;
        const sourcePath = event.dataTransfer.getData("application/x-entry-path");
        if (!sourcePath || sourcePath === getEntryPath(entry)) return;
        moveEntryToFolder(sourcePath, getEntryPath(entry));
      });

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "tree-toggle";
      toggle.textContent = entry.kind === "folder" ? (entry.expanded ? "∨" : ">") : "";
      toggle.disabled = entry.kind !== "folder";
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (entry.kind === "folder") {
          entry.expanded = !entry.expanded;
          renderProjectTree();
        }
      });

      const button = document.createElement("button");
      const isSelected = projectSelection.includes(getEntryPath(entry));
      button.type = "button";
      button.className = `tree-row${isSelected ? " selected" : ""}`;
      button.textContent = entryDisplayName(entry);
      button.addEventListener("click", (event) => {
        if (entry.kind === "folder") {
          entry.expanded = !entry.expanded;
          renderProjectTree();
          return;
        }
        const additive = event.ctrlKey || event.metaKey || event.shiftKey;
        setProjectSelection([getEntryPath(entry)], additive ? true : false);
        switchFile(getEntryPath(entry));
      });
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        setProjectSelection([getEntryPath(entry)], false);
        openContextMenu(event, entry);
      });

      wrapper.append(toggle, button);
      row.append(wrapper);
      if (entry.kind === "folder" && entry.expanded && Array.isArray(entry.children) && entry.children.length) {
        const nested = renderEntries(entry.children, depth + 1);
        row.append(nested);
      }
      list.append(row);
    });
    return list;
  };

  filesList.append(renderEntries(project.files));

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

function switchFile(targetPath) {
  syncActiveSource();
  const resolved = findEntryByPath(project.files, targetPath) || findEntryByPath(project.files, project.activeFile) || activeFile();
  if (!resolved || resolved.kind === "folder") return;
  project.activeFile = getEntryPath(resolved);
  const file = activeFile();
  if (!editor || !file) return;
  if (file.kind === "binary") {
    const model = editor.getModel();
    model.setValue(`/* ${file.name} はバイナリファイルです。テキストとして編集できません。 */\n`);
    monaco.editor.setModelLanguage(model, "plaintext");
    renderProjectTree();
    return;
  }
  const model = editor.getModel();
  model.setValue(file.value);
  monaco.editor.setModelLanguage(model, "javascript");
  renderProjectTree();
  updateSymbols();
  scheduleSave();
}

function renameFile(file, container) {
  const name = window.prompt("新しい名前を入力", file.name);
  if (name == null) return;
  const nextName = name.trim();
  if (!validFileName(nextName) && !(file.kind === "folder" && validFolderName(nextName))) {
    addConsole("warn", ["名前が不正です"]);
    return;
  }
  const parent = parentPathOf(getEntryPath(file));
  const nextPath = parent ? `${parent}/${nextName}` : nextName;
  const exists = flattenProjectEntries(project.files).some((entry) => getEntryPath(entry) !== getEntryPath(file) && getEntryPath(entry) === nextPath);
  if (exists || ["engine.js", "ui-objects.js"].includes(nextName)) {
    addConsole("warn", ["同名の項目がすでに存在します"]);
    return;
  }
  if (file.kind === "folder") {
    const keep = file.name;
    file.name = nextName;
    updateChildPaths(file, parent);
    if (project.activeFile === `${parent}/${keep}`) project.activeFile = nextPath;
  } else {
    const previous = getEntryPath(file);
    file.name = nextName;
    file.path = nextPath;
    if (project.activeFile === previous) project.activeFile = nextPath;
  }
  renderProjectTree();
  scheduleSave();
}

function addFile(parentPath = "") {
  const baseName = `script-${flattenProjectEntries(project.files).filter((entry) => entry.kind !== "folder").length + 1}.js`;
  const name = ensureUniqueName(baseName, parentPath);
  const file = { name, path: parentPath ? `${parentPath}/${name}` : name, kind: "text", value: 'GameStudio.log("新しいファイル");\n' };
  insertEntry(file, parentPath);
  project.activeFile = file.path;
  renderProjectTree();
  switchFile(file.path);
}

function addFolder(parentPath = "") {
  const name = ensureUniqueName("new-folder", parentPath);
  const entry = { name, path: parentPath ? `${parentPath}/${name}` : name, kind: "folder", expanded: true, children: [] };
  insertEntry(entry, parentPath);
  projectSelection = [entry.path];
  renderProjectTree();
  scheduleSave();
}

function downloadEntry(entry) {
  if (entry.kind === "folder") {
    addConsole("warn", ["フォルダはダウンロードできません"]);
    return;
  }
  const isBinary = entry.kind === "binary";
  const blob = isBinary
    ? new Blob([Uint8Array.from(atob(entry.data), (char) => char.charCodeAt(0))], { type: entry.mimeType || "application/octet-stream" })
    : new Blob([entry.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: entry.name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBinaryFile(file) {
  downloadEntry(file);
}

async function addFileFromLocal(file, parentPath = "") {
  const sanitized = file.name.replace(/[\\/]+/g, "_");
  const name = sanitized && !flattenProjectEntries(project.files).some((entry) => entry.name === sanitized && parentPathOf(getEntryPath(entry)) === parentPath)
    ? sanitized
    : `${Date.now()}-${sanitized || "file"}`;
  const entryPath = parentPath ? `${parentPath}/${name}` : name;
  const isText = file.type.startsWith("text/") || /\.(js|ts|json|md|txt|html|css|svg|xml|csv)$/i.test(name);
  const entry = isText
    ? { name, path: entryPath, kind: "text", value: await file.text() }
    : { name, path: entryPath, kind: "binary", mimeType: file.type || "application/octet-stream", data: arrayBufferToBase64(await file.arrayBuffer()) };
  insertEntry(entry, parentPath);
  project.activeFile = entry.path;
  renderProjectTree();
  switchFile(entry.path);
  scheduleSave();
}

function openContextMenu(event, entry) {
  let menu = $("#project-context-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "project-context-menu";
    menu.className = "context-menu";
    menu.hidden = true;
    document.body.append(menu);
  }
  const selected = getSelectedEntries();
  const active = selected.length ? selected : [entry];
  const targetPath = getEntryPath(entry);
  const isFile = entry.kind !== "folder";
  const hasClipboard = Boolean(clipboard && clipboard.entries.length);
  menu.innerHTML = ``;
  const items = [
    { label: "新しいファイル", action: () => addFile(targetPath) },
    { label: "空フォルダ", action: () => addFolder(targetPath) },
    { label: "ローカルアップロード", action: () => $("#local-file-input").click() },
    { label: "名前を変更", action: () => renameFile(entry, null) },
    { label: "コピー", action: () => { clipboard = { mode: "copy", entries: active.map((item) => structuredClone(item)) }; addConsole("log", ["コピーしました"]) ; } },
    { label: "切り取り", action: () => { clipboard = { mode: "cut", entries: active.map((item) => structuredClone(item)) }; addConsole("log", ["切り取りしました"]) ; } },
    { label: "貼り付け", action: () => pasteClipboard(targetPath), enabled: hasClipboard },
    { label: "削除", action: () => deleteSelectedEntries(), enabled: active.length > 0 },
    { label: "ダウンロード", action: () => isFile && downloadEntry(entry), enabled: isFile },
  ];
  items.forEach((item) => {
    if (!item.enabled && item.enabled !== undefined) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      item.action();
      hideContextMenu();
    });
    menu.append(button);
  });
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.hidden = false;
}

function hideContextMenu() {
  const menu = $("#project-context-menu");
  if (menu) menu.hidden = true;
}

function deleteSelectedEntries() {
  const selected = getSelectedEntries();
  if (!selected.length) return;
  selected.forEach((entry) => removeEntryByPath(project.files, getEntryPath(entry)));
  projectSelection = [];
  if (project.activeFile && !findEntryByPath(project.files, project.activeFile)) {
    const next = flattenProjectEntries(project.files).find((entry) => entry.kind !== "folder");
    project.activeFile = next ? getEntryPath(next) : "";
  }
  renderProjectTree();
  scheduleSave();
}

function moveEntryToFolder(sourcePath, targetFolderPath) {
  if (!sourcePath || !targetFolderPath) return;
  const sourceEntry = findEntryByPath(project.files, sourcePath);
  const targetFolder = findEntryByPath(project.files, targetFolderPath);
  if (!sourceEntry || !targetFolder || targetFolder.kind !== "folder") return;
  if (sourceEntry === targetFolder || getEntryPath(sourceEntry).startsWith(`${getEntryPath(targetFolder)}/`)) return;
  removeEntryByPath(project.files, sourcePath);
  sourceEntry.path = `${targetFolderPath}/${sourceEntry.name}`;
  if (sourceEntry.kind === "folder") {
    sourceEntry.children.forEach((child) => updateChildPaths(child, sourceEntry.path));
  }
  targetFolder.children.push(sourceEntry);
  targetFolder.expanded = true;
  projectSelection = [sourceEntry.path];
  renderProjectTree();
  scheduleSave();
}

function pasteClipboard(targetPath = "") {
  if (!clipboard || !clipboard.entries.length) return;
  const parent = targetPath ? findEntryByPath(project.files, targetPath) : null;
  const targetFolder = parent && parent.kind === "folder" ? parent : null;
  const destination = targetFolder ? getEntryPath(targetFolder) : "";
  clipboard.entries.forEach((entry) => {
    const copied = duplicateEntry(entry, destination);
    if (targetFolder) {
      targetFolder.children.push(copied);
      targetFolder.expanded = true;
    } else {
      project.files.push(copied);
    }
  });
  if (clipboard.mode === "cut") {
    clipboard.entries.forEach((entry) => removeEntryByPath(project.files, getEntryPath(entry)));
  }
  clipboard = null;
  renderProjectTree();
  scheduleSave();
}

function createUniqueSvgAssetName(baseName = "asset") {
  const source = typeof baseName === "string" && baseName.trim() ? baseName.trim() : "asset";
  const normalized = source.replace(/\.[^./]+$/, "") || "asset";
  const taken = new Set(project.assets.map((asset) => asset.name));
  let index = 1;
  let candidate = normalized;
  while (taken.has(candidate)) {
    index += 1;
    candidate = `${normalized}(${index - 1})`;
  }
  return candidate;
}

function addSvgAsset() {
  const name = createUniqueSvgAssetName(`asset-${project.assets.length + 1}`);
  const asset = { name, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360"></svg>` };
  project.assets.push(asset);
  renderProjectTree();
  openAsset(asset);
  scheduleSave();
}

function addCurrentSvgToProject() {
  if (!svgEditor || !svgEditor.currentAsset) {
    addConsole("warn", ["SVGアセットが選択されていません"]);
    return;
  }
  const asset = svgEditor.currentAsset;
  const fileName = ensureUniqueName(`${asset.name}.svg`);
  const entry = {
    name: fileName,
    path: fileName,
    kind: "text",
    value: sanitizeSvgSource(asset.svg),
  };
  insertEntry(entry);
  project.activeFile = entry.path;
  renderProjectTree();
  switchFile(entry.path);
  scheduleSave();
  addConsole("log", [`SVGをファイルツリーへ追加しました: ${fileName}`]);
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
  const fromText = typeof from === "string" ? from.replace(/\\/g, "/") : "";
  const parts = specifier.startsWith(".") ? fromText.split("/").slice(0, -1) : [];
  for (const part of specifier.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length) parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function rewriteImports(source, fileName) {
  if (typeof source !== "string" || !source) return source;
  if (typeof fileName !== "string" || !fileName || fileName.startsWith("[object ")) return source;
  return source.replace(/((?:from\s*|import\s*)["'])([^"']+)(["'])/g, (full, before, specifier, after) => {
    if (typeof specifier !== "string" || !specifier.startsWith(".")) return full;
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
    const projectFiles = flattenProjectFiles();
    const moduleSources = new Map([
      ["engine.js", engineSource],
      ["ui-objects.js", rewriteImports(uiSource, "ui-objects.js")],
      ...projectFiles
        .filter((file) => typeof getEntryPath(file) === "string" && getEntryPath(file))
        .map((file) => [getEntryPath(file), rewriteImports(file.value, getEntryPath(file))]),
    ]);
    const imports = Object.fromEntries([...moduleSources].map(([name, source]) => [`studio/${name}`, base64DataUrl(source)]));
    const entry = projectFiles.find((file) => {
      const path = getEntryPath(file);
      return typeof path === "string" && path && (path === project.activeFile || file.name === "main.js");
    }) || projectFiles.find((file) => typeof getEntryPath(file) === "string" && getEntryPath(file)) || null;
    const rawEntryModule = entry ? getEntryPath(entry) : "main.js";
    const entryModule = typeof rawEntryModule === "string" && rawEntryModule && !rawEntryModule.startsWith("[object ") ? rawEntryModule : "main.js";
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
    const documentText = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#020617}canvas{display:block;width:100%;height:100%}</style></head><body><canvas id="game"></canvas>${bridge}${importMap}<script type="module">import("studio/${entryModule}").catch(error=>{parent.postMessage({source:"engine-studio",runId:${JSON.stringify(runId)},type:"runtime-error",payload:{message:String(error.stack||error),line:0,column:0}},"*")});</script></body></html>`;
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
      if (diagnostic.file && findEntryByPath(project.files, diagnostic.file)) {
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
  $("#show-history").addEventListener("click", () => {
    try {
      showProjectHistory();
    } catch (error) {
      status.textContent = `変更履歴を読み込めません: ${error.message}`;
      status.style.color = "#fca5a5";
    }
  });
  $("#close-history").addEventListener("click", () => $("#history-dialog").close());
  $("#download-project").addEventListener("click", serializeProject);
  $("#load-project").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) loadProjectFile(file);
    event.target.value = "";
  });
  $("#new-file").addEventListener("click", addFile);
  $("#new-generic-file").addEventListener("click", () => $("#local-file-input").click());
  $("#svg-add-to-project").addEventListener("click", addCurrentSvgToProject);
  $("#local-file-input").addEventListener("change", async (event) => {
    const files = [...(event.target.files ?? [])];
    for (const file of files) await addFileFromLocal(file);
    event.target.value = "";
  });
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
  document.addEventListener("click", (event) => {
    const menu = $("#project-context-menu");
    if (menu && !menu.hidden && !event.target.closest("#project-context-menu")) {
      hideContextMenu();
    }
  });
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
