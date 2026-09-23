const STORAGE_KEY = "engine-multifile-project-v1";
const engineImportUrl = new URL("../../engine.js", location.href).toString();
const uiImportUrl = new URL("../../ui-objects.js", location.href).toString();

const starterProject = {
  title: "starter-project",
  activeFile: "main.js",
  files: [
    {
      name: "main.js",
      language: "javascript",
      value: `import { Engine, Display, GameObject, INPUT } from "./engine.js";

const shape = document.createElementNS("http://www.w3.org/2000/svg", "circle");
shape.setAttribute("r", 24);

class Player extends GameObject {
  constructor() {
    super({ x: 120, y: 120, tags: ["player"], shapes: [shape] });
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-180 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(180 * dt);
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const display = engine.newDisplay(new Display("world", 640, 360, { background: "#182744" }));
const player = engine.addObject(display, new Player());
player.element.setAttribute("fill", "#62d6ff");
engine.start();`
    },
    {
      name: "helper.js",
      language: "javascript",
      value: `export function makePlayerShape() {
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  shape.setAttribute("r", 24);
  return shape;
}`
    }
  ]
};

const status = document.querySelector("#status");
const preview = document.querySelector("#preview");
const fileList = document.querySelector("#file-list");
const saveButton = document.querySelector("#save-json");
const downloadButton = document.querySelector("#download-json");
const loadInput = document.querySelector("#load-json");
const newFileButton = document.querySelector("#new-file");

let editor;
let project = loadProjectFromStorage();

function cloneProject(projectData) {
  return JSON.parse(JSON.stringify(projectData));
}

function ensureProjectShape(projectData) {
  if (!projectData || !Array.isArray(projectData.files) || projectData.files.length === 0) {
    return cloneProject(starterProject);
  }

  const files = projectData.files
    .filter((file) => file && typeof file === "object")
    .map((file) => ({
      name: typeof file.name === "string" && file.name.trim() ? file.name.trim() : "untitled.js",
      language: typeof file.language === "string" ? file.language : "javascript",
      value: typeof file.value === "string" ? file.value : "",
    }))
    .filter((file) => file.name !== "engine.js" && file.name !== "ui-objects.js");

  if (!files.length) return cloneProject(starterProject);

  const fallbackActive = files[0].name;
  return {
    title: typeof projectData.title === "string" ? projectData.title : "project",
    activeFile: files.some((file) => file.name === projectData.activeFile) ? projectData.activeFile : fallbackActive,
    files,
  };
}

function loadProjectFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneProject(starterProject);
    return ensureProjectShape(JSON.parse(raw));
  } catch {
    return cloneProject(starterProject);
  }
}

function saveProjectToStorage() {
  const current = getActiveFile();
  if (current && editor) current.value = editor.getValue();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  status.textContent = " ローカル保存しました";
}

function getActiveFile() {
  if (!project.files.length) return null;
  return project.files.find((file) => file.name === project.activeFile) || project.files[0];
}

function updateEditorValue() {
  const active = getActiveFile();
  if (!editor || !active) return;
  if (editor.getValue() !== active.value) {
    editor.setValue(active.value);
  }
  const model = editor.getModel();
  if (model) monaco.editor.setModelLanguage(model, active.language || "javascript");
}

function renderFileList() {
  fileList.innerHTML = "";
  project.files.forEach((file) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = file.name;
    button.className = file.name === project.activeFile ? "active" : "";
    button.addEventListener("click", () => {
      if (!editor) return;
      const current = getActiveFile();
      if (current) current.value = editor.getValue();
      project.activeFile = file.name;
      renderFileList();
      updateEditorValue();
    });
    item.appendChild(button);
    fileList.appendChild(item);
  });
}

function createEditorInstance() {
  const active = getActiveFile();
  if (!active) return;

  editor = monaco.editor.create(document.querySelector("#editor"), {
    value: active.value,
    language: active.language || "javascript",
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: false },
  });

  editor.onDidChangeModelContent(() => {
    const current = getActiveFile();
    if (current) current.value = editor.getValue();
  });
}

function removeLocalImports(source) {
  return source.replace(/^\s*import[\s\S]*?from\s*["']\.\/[^"']+["'];?\s*$/gm, "");
}

function getPreviewEntry() {
  return project.files.some((file) => file.name === "main.js") ? "main.js" : getActiveFile()?.name || "main.js";
}

async function run() {
  const active = getActiveFile();
  if (!active || !editor) return;
  active.value = editor.getValue();

  const entry = getPreviewEntry();
  const entryFile = project.files.find((file) => file.name === entry);
  if (!entryFile) return;
  try {
    const [engineSource, uiSource] = await Promise.all([
      fetch(engineImportUrl).then((response) => response.text()),
      fetch(uiImportUrl).then((response) => response.text()),
    ]);
    const projectSource = project.files
      .filter((file) => file.name !== entry)
      .map((file) => removeLocalImports(file.value))
      .join("\n");
    const entrySource = removeLocalImports(entryFile.value);
    const safeUiSource = removeLocalImports(uiSource).replace(/\bSVG_NS\b/g, "UI_SVG_NS");
    const combinedSource = [engineSource, safeUiSource, projectSource, entrySource]
      .join("\n")
      .replace(/<\/script/gi, "<\\/script");
    preview.srcdoc = `<!doctype html><html><body style="margin:0;background:#020617;"><canvas id="game" style="width:100vw;height:100vh;display:block"></canvas><script type="module">${combinedSource}</script></body></html>`;
    status.textContent = " 実行しました";
  } catch (error) {
    status.textContent = ` 実行に失敗しました: ${error.message}`;
  }
}

function addNewFile() {
  const nextIndex = project.files.length + 1;
  const fileName = `file-${nextIndex}.js`;
  project.files.push({
    name: fileName,
    language: "javascript",
    value: `export const value = ${nextIndex};\nconsole.log("${fileName}");`,
  });
  project.activeFile = fileName;
  renderFileList();
  updateEditorValue();
  status.textContent = " ファイルを追加しました";
}

function downloadProjectJson() {
  const current = getActiveFile();
  if (current && editor) current.value = editor.getValue();

  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.title || "engine-project"}.json`;
  link.click();
  URL.revokeObjectURL(url);
  status.textContent = " JSON をダウンロードしました";
}

function loadProjectJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      project = ensureProjectShape(parsed);
      renderFileList();
      updateEditorValue();
      saveProjectToStorage();
      status.textContent = " JSON を読み込みました";
    } catch {
      status.textContent = " JSON の読み込みに失敗しました";
    }
  };
  reader.readAsText(file);
}

window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
window.require(["vs/editor/editor.main"], () => {
  project = ensureProjectShape(project);
  renderFileList();
  createEditorInstance();

  document.querySelector("#run").addEventListener("click", () => {
    const current = getActiveFile();
    if (current && editor) current.value = editor.getValue();
    run();
  });

  saveButton.addEventListener("click", saveProjectToStorage);
  downloadButton.addEventListener("click", downloadProjectJson);
  loadInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) loadProjectJson(file);
    event.target.value = "";
  });
  newFileButton.addEventListener("click", addNewFile);

  updateEditorValue();
  run();
});
