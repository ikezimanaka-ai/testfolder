import { createPointer } from "../filesystem/filesystem-api.js";
import { buildRunnerDocument } from "./game-runner.js";
import {
  writeStudioProjectJson,
} from "./studio-project-import.js";
import {
  loadLastWorkspaceHandle,
  saveLastWorkspaceHandle,
} from "./workspace-storage.js";
import { resolveFileIcon, setiIconTheme } from "./file-icons.js";
import {
  classifyFile,
  formatAspectRatio,
  formatDuration,
  formatFileSize,
} from "./file-metadata.js";
import {
  availableCopyName,
  batchRenameNames,
  canDropTreeEntries,
  orderedSelectedEntries,
  treeEntryKey,
  updateTreeSelection,
} from "./file-tree-selection.js";
import {
  buildSvgTransform,
  isSvgPath,
  parseSvgPath,
  parseSvgPoints,
  serializeSvgPath,
  serializeSvgPoints,
  svgEditableAttributes,
  svgModeForPath,
  svgPositionAttributes,
  translateSvgCoordinate,
} from "./svg-editor.js";

const $ = (selector) => document.querySelector(selector);
const ui = {
  editor: $("#editor"),
  executionWorkbench: $("#execution-workbench"),
  error: $("#editor-error"),
  fileDetails: $("#file-details"),
  fileDetailsList: $("#file-details-list"),
  fileDetailsPreview: $("#file-details-preview"),
  fileDetailsTitle: $("#file-details-title"),
  settingsDialog: $("#editor-settings"),
  settingsForm: $("#settings-form"),
  settingsInput: $("#directory-index-files"),
  iconExtension: $("#icon-extension"),
  iconImage: $("#icon-image"),
  iconPreview: $("#icon-preview"),
  linkNotFoundDialog: $("#link-not-found-dialog"),
  linkNotFoundMessage: $("#link-not-found-message"),
  contextMenu: $("#context-menu"),
  fileTree: $("#file-tree"),
  newFile: $("#new-file"),
  newFolder: $("#new-folder"),
  notification: $("#notification"),
  openFolder: $("#open-folder"),
  openSettings: $("#open-settings"),
  pasteEntry: $("#paste-entry"),
  refreshTree: $("#refresh-tree"),
  rootLabel: $("#root-label"),
  saveAll: $("#save-all"),
  saveFile: $("#save-file"),
  statusLanguage: $("#status-language"),
  statusPath: $("#status-path"),
  tabs: $("#tabs"),
  treePlaceholder: $("#tree-placeholder"),
  welcome: $("#welcome"),
  workspaceName: $("#workspace-name"),
  svgModeBar: $("#svg-mode-bar"),
  svgSelectionStatus: $("#svg-selection-status"),
  svgStage: $("#svg-stage"),
  svgWorkbench: $("#svg-workbench"),
  svgInspectorHint: $("#svg-inspector-hint"),
  svgProperties: $("#svg-properties"),
  saveIcon: $("#save-icon"),
  resetIcon: $("#reset-icon"),
};

let pointer = null;
let pendingWorkspaceHandle = null;
let rootName = "";
let editor = null;
let startupError = "";
let notificationTimer = 0;
let selectedPath = "";
let selectedKind = "";
let selectedEntries = new Map();
let selectionAnchorPath = "";
let activePath = "";
let tabs = [];
let executionTabs = [];
let activeExecutionTabId = "";
let nextExecutionTabId = 1;
let expandedFolders = new Set();
let clipboard = null;
let contextTarget = null;
let draggedEntries = [];
let draggedTabPath = "";
const DEFAULT_DIRECTORY_INDEX_FILES = ["index.html", "index.js", "index.htm", "index.mjs", "index.ts"];
const SETTINGS_DIRECTORY = ".monacSetting";
const SETTINGS_FILE = `${SETTINGS_DIRECTORY}/settings.json`;
const DEFAULT_ICON_ID = setiIconTheme.file;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SVG_SELECTABLE_ELEMENTS = new Set([
  "rect", "circle", "ellipse", "line", "polygon", "polyline", "path", "text", "tspan", "image",
]);
const UNSAFE_SVG_ELEMENTS = new Set([
  "animate", "animatemotion", "animatetransform", "audio", "embed", "foreignobject",
  "iframe", "object", "script", "set", "video",
]);
let directoryIndexFiles = [...DEFAULT_DIRECTORY_INDEX_FILES];
let customIconUrls = new Map();
let filePreviewUrl = "";
let fileDetailsPath = "";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function notify(message, isError = false) {
  window.clearTimeout(notificationTimer);
  ui.notification.textContent = message;
  ui.notification.classList.toggle("error", isError);
  ui.notification.hidden = false;
  notificationTimer = window.setTimeout(() => {
    ui.notification.hidden = true;
  }, 4500);
}

function showError(error) {
  const message = errorMessage(error);
  ui.statusPath.textContent = `エラー: ${message}`;
  notify(message, true);
  console.error(error);
}

function parentPath(path) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function basename(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

function validateDirectoryIndexFiles(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("既定ファイルはファイル名の一覧で指定してください。");
  }
  const names = values.map((value) => {
    if (typeof value === "string" && !value.trim()) return "";
    if (
      typeof value !== "string" ||
      value.trim() === "." ||
      value.trim() === ".." ||
      /[/\\\0]/.test(value.trim())
    ) {
      throw new TypeError("各既定ファイルはパスを含まないファイル名で指定してください。");
    }
    return value.trim();
  });
  const uniqueNames = [...new Set(names.filter(Boolean))];
  if (!uniqueNames.length) {
    throw new TypeError("既定ファイルを1つ以上指定してください。");
  }
  return uniqueNames;
}

function validateIconExtension(value) {
  const extension = value.trim().replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9._+-]*$/.test(extension) || extension.endsWith(".")) {
    throw new TypeError("拡張子は js や html のように入力してください。");
  }
  return extension;
}

function sameStringList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function loadWorkspaceSettings(workspacePointer) {
  const rootEntries = await workspacePointer.listDirectory("");
  if (!rootEntries.some((entry) =>
    entry.kind === "directory" && entry.name === SETTINGS_DIRECTORY
  )) {
    return [...DEFAULT_DIRECTORY_INDEX_FILES];
  }

  const settingsEntries = await workspacePointer.listDirectory(SETTINGS_DIRECTORY);
  if (!settingsEntries.some((entry) => entry.kind === "file" && entry.name === "settings.json")) {
    return [...DEFAULT_DIRECTORY_INDEX_FILES];
  }

  const stored = JSON.parse(await workspacePointer.readFile(SETTINGS_FILE));
  return validateDirectoryIndexFiles(stored.directoryIndexFiles);
}

async function isPngFile(file) {
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPng = signature.length === 8 &&
    signature[0] === 137 &&
    signature[1] === 80 &&
    signature[2] === 78 &&
    signature[3] === 71 &&
    signature[4] === 13 &&
    signature[5] === 10 &&
    signature[6] === 26 &&
    signature[7] === 10;
  if (!isPng) return false;
  const image = await createImageBitmap(file);
  try {
    return image.width > 0 && image.height > 0;
  } finally {
    image.close();
  }
}

async function loadCustomIconUrls(workspacePointer) {
  const rootEntries = await workspacePointer.listDirectory("");
  const settingsDirectory = rootEntries.find((entry) =>
    entry.kind === "directory" && entry.name === SETTINGS_DIRECTORY
  );
  if (!settingsDirectory) return new Map();

  const icons = new Map();
  try {
    const entries = await workspacePointer.listDirectory(SETTINGS_DIRECTORY);
    for (const entry of entries) {
      if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".png")) continue;
      const extension = entry.name.slice(0, -4).toLowerCase();
      if (!/^[a-z0-9][a-z0-9._+-]*$/.test(extension) || extension.endsWith(".")) continue;
      const path = `${SETTINGS_DIRECTORY}/${entry.name}`;
      const file = await workspacePointer.getFile(path);
      if (!await isPngFile(file)) {
        throw new Error(`「${path}」は有効なPNG画像ではありません。`);
      }
      icons.set(extension, URL.createObjectURL(file));
    }
    return icons;
  } catch (error) {
    for (const url of icons.values()) URL.revokeObjectURL(url);
    throw error;
  }
}

function releaseCustomIconUrls(icons = customIconUrls) {
  for (const url of icons.values()) URL.revokeObjectURL(url);
  icons.clear();
}

async function saveWorkspaceSettings(nextDirectoryIndexFiles) {
  const rootEntries = await pointer.listDirectory("");
  const settingsDirectory = rootEntries.find((entry) =>
    entry.kind === "directory" && entry.name === SETTINGS_DIRECTORY
  );
  const settingsEntries = settingsDirectory
    ? await pointer.listDirectory(SETTINGS_DIRECTORY)
    : [];
  const hasSettingsFile = settingsEntries.some((entry) =>
    entry.kind === "file" && entry.name === "settings.json"
  );

  if (sameStringList(nextDirectoryIndexFiles, DEFAULT_DIRECTORY_INDEX_FILES)) {
    if (hasSettingsFile) await pointer.deleteFile(SETTINGS_FILE);
    return;
  }

  await pointer.createFolder("", SETTINGS_DIRECTORY);
  await pointer.createFile(SETTINGS_DIRECTORY, "settings.json");
  await pointer.writeFile(SETTINGS_FILE, JSON.stringify({
    directoryIndexFiles: nextDirectoryIndexFiles,
  }, null, 2));
}

function createFileIcon(name) {
  const icon = document.createElement("span");
  icon.className = "tree-icon";
  icon.setAttribute("aria-hidden", "true");
  const resolved = resolveFileIcon(name, [...customIconUrls.keys()]);

  if (resolved.custom && customIconUrls.has(resolved.extension)) {
    const image = document.createElement("img");
    image.className = "custom-icon";
    image.src = customIconUrls.get(resolved.extension);
    image.alt = "";
    icon.append(image);
    return icon;
  }

  const definition = resolved.icon || setiIconTheme.iconDefinitions[DEFAULT_ICON_ID];
  icon.classList.add("seti-icon");
  icon.textContent = String.fromCodePoint(Number.parseInt(definition.fontCharacter.slice(1), 16));
  icon.style.color = definition.fontColor || "#c5c5c5";
  return icon;
}

function clearFileDetails() {
  if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
  filePreviewUrl = "";
  fileDetailsPath = "";
  ui.fileDetails.hidden = true;
  ui.fileDetailsTitle.textContent = "";
  ui.fileDetailsPreview.replaceChildren();
  ui.fileDetailsList.replaceChildren();
}

function addFileDetail(labelText, valueText) {
  const label = document.createElement("dt");
  label.textContent = labelText;
  const value = document.createElement("dd");
  value.textContent = valueText;
  ui.fileDetailsList.append(label, value);
  return value;
}

function setFileDimensions(width, height, dimensionElement, ratioElement) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    dimensionElement.textContent = "読み取れません";
    ratioElement.textContent = "読み取れません";
    return;
  }
  dimensionElement.textContent = `${width} × ${height} px`;
  ratioElement.textContent = formatAspectRatio(width, height);
}

function showFileDetails(path, file, kind) {
  clearFileDetails();
  fileDetailsPath = path;
  activePath = "";
  activeExecutionTabId = "";
  if (editor) editor.setModel(null);
  ui.editor.hidden = true;
  ui.executionWorkbench.hidden = true;
  ui.editor.classList.remove("svg-text-mode");
  ui.svgModeBar.hidden = true;
  ui.svgWorkbench.hidden = true;
  ui.welcome.hidden = true;
  ui.error.hidden = true;
  ui.fileDetails.hidden = false;
  ui.fileDetailsTitle.textContent = basename(path);
  ui.statusPath.textContent = path;
  ui.statusLanguage.textContent = {
    image: "画像",
    audio: "音声",
    video: "動画",
    binary: "バイナリ",
  }[kind];
  addFileDetail("種類", {
    image: "画像",
    audio: "音声",
    video: "動画",
    binary: "バイナリ",
  }[kind]);
  addFileDetail("サイズ", formatFileSize(file.size));

  if (kind === "image") {
    const preview = document.createElement("img");
    const dimensions = addFileDetail("大きさ", "読み込み中…");
    const ratio = addFileDetail("縦横比", "読み込み中…");
    filePreviewUrl = URL.createObjectURL(file);
    preview.src = filePreviewUrl;
    preview.alt = basename(path);
    preview.addEventListener("load", () => {
      setFileDimensions(preview.naturalWidth, preview.naturalHeight, dimensions, ratio);
    }, { once: true });
    preview.addEventListener("error", () => {
      dimensions.textContent = "読み取れません";
      ratio.textContent = "読み取れません";
    }, { once: true });
    ui.fileDetailsPreview.append(preview);
  } else if (kind === "audio" || kind === "video") {
    const media = document.createElement(kind);
    const duration = addFileDetail("長さ", "読み込み中…");
    const dimensions = kind === "video"
      ? addFileDetail("大きさ", "読み込み中…")
      : null;
    const ratio = kind === "video"
      ? addFileDetail("縦横比", "読み込み中…")
      : null;
    let metadataLoaded = false;
    media.controls = true;
    media.preload = "metadata";
    filePreviewUrl = URL.createObjectURL(file);
    media.src = filePreviewUrl;
    media.addEventListener("loadedmetadata", () => {
      metadataLoaded = true;
      duration.textContent = formatDuration(media.duration);
      if (kind === "video") {
        setFileDimensions(media.videoWidth, media.videoHeight, dimensions, ratio);
      }
    }, { once: true });
    media.addEventListener("error", () => {
      if (metadataLoaded) return;
      duration.textContent = "メタデータを読み取れません";
      if (kind === "video") {
        dimensions.textContent = "メタデータを読み取れません";
        ratio.textContent = "メタデータを読み取れません";
      }
    }, { once: true });
    ui.fileDetailsPreview.append(media);
  } else {
    const icon = createFileIcon(path);
    icon.classList.add("binary-preview-icon");
    ui.fileDetailsPreview.append(icon);
  }
  renderTabs();
}

function languageForPath(path) {
  const extension = basename(path).split(".").pop().toLowerCase();
  const languages = {
    c: "c",
    cc: "cpp",
    cpp: "cpp",
    cs: "csharp",
    cjs: "javascript",
    cts: "typescript",
    css: "css",
    go: "go",
    h: "cpp",
    htm: "html",
    html: "html",
    java: "java",
    js: "javascript",
    json: "json",
    jsx: "javascript",
    md: "markdown",
    mjs: "javascript",
    mts: "typescript",
    py: "python",
    scss: "scss",
    sh: "shell",
    sql: "sql",
    svg: "xml",
    ts: "typescript",
    tsx: "typescript",
    txt: "plaintext",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };
  return languages[extension] || "plaintext";
}

function humanLanguage(language) {
  const labels = {
    cpp: "C++",
    csharp: "C#",
    html: "HTML",
    javascript: "JavaScript",
    json: "JSON",
    markdown: "Markdown",
    plaintext: "Plain Text",
    python: "Python",
    typescript: "TypeScript",
    xml: "XML",
    yaml: "YAML",
  };
  return labels[language] || language;
}

function modelUri(path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return window.monaco.Uri.parse(`inmemory://workspace/${encoded}`);
}

function cloneSvgPreviewNode(source, sourceElements, previewElements) {
  if (source.nodeType !== Node.ELEMENT_NODE) return source.cloneNode(false);

  const namespace = source.namespaceURI || SVG_NAMESPACE;
  const preview = document.createElementNS(namespace, source.nodeName);
  for (const attribute of source.attributes) {
    if ([
      "data-handle-radius",
      "data-monac-handle",
      "data-monac-index",
      "data-monac-selection-overlay",
      "data-monac-svg-id",
    ].includes(attribute.name.toLowerCase())) continue;
    preview.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
  }
  const elementName = source.localName.toLowerCase();
  if (
    (source.namespaceURI === SVG_NAMESPACE || !source.namespaceURI) &&
    SVG_SELECTABLE_ELEMENTS.has(elementName)
  ) {
    const id = String(sourceElements.size);
    sourceElements.set(id, source);
    preview.dataset.monacSvgId = id;
    previewElements.set(id, preview);
  }
  for (const child of source.childNodes) {
    preview.append(cloneSvgPreviewNode(child, sourceElements, previewElements));
  }
  return preview;
}

function hasExternalSvgUrl(value) {
  return [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)]
    .some((match) => !match[2].trim().startsWith("#"));
}

function sanitizeSvgPreview(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const elements = [root];
  while (walker.nextNode()) elements.push(walker.currentNode);

  for (const element of elements) {
    if (
      element !== root &&
      (
        element.namespaceURI !== SVG_NAMESPACE ||
        UNSAFE_SVG_ELEMENTS.has(element.localName.toLowerCase()) ||
        (
          element.localName.toLowerCase() === "style" &&
          (/@import\b/i.test(element.textContent) || hasExternalSvgUrl(element.textContent))
        )
      )
    ) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith("on") ||
        name === "src" ||
        name === "base" ||
        (name === "href" && value && !value.startsWith("#")) ||
        (name === "style" && hasExternalSvgUrl(value)) ||
        hasExternalSvgUrl(value)
      ) {
        element.removeAttributeNode(attribute);
      }
    }
  }
}

function svgPointInElement(element, event, matrix = element.getScreenCTM?.()) {
  if (!matrix) return null;
  const point = element.ownerSVGElement.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

function svgPointInParent(element, event, matrix = element.parentElement?.getScreenCTM?.()) {
  if (!matrix) return null;
  const point = element.ownerSVGElement.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

function applySvgOffset(source, x, y, originalValues) {
  const transform = source.getAttribute("transform");
  const attributes = svgPositionAttributes(source.localName);
  if (!attributes.length || (transform && transform !== "none")) return false;

  const updates = attributes.map((attribute) => {
    const offset = attribute.startsWith("y") || attribute === "cy" ? y : x;
    return [
      attribute,
      translateSvgCoordinate(
        originalValues?.get(attribute) ?? source.getAttribute(attribute),
        offset,
      ),
    ];
  });
  if (updates.some(([, value]) => value === null)) return false;
  for (const [attribute, value] of updates) source.setAttribute(attribute, value);
  return true;
}

function selectSvgElement(tab, elementId) {
  tab.svgSelectionId = elementId;
  for (const element of ui.svgStage.querySelectorAll("[data-monac-svg-id]")) {
    element.classList.toggle("monac-svg-selected", element.dataset.monacSvgId === elementId);
  }

  const source = tab.svgElements.get(elementId);
  const preview = tab.svgPreviewElements.get(elementId);
  ui.svgProperties.replaceChildren();
  if (!source) {
    ui.svgSelectionStatus.textContent = "";
    ui.svgInspectorHint.textContent = "図形を選択すると、ドラッグで移動できます。";
    ui.svgStage.querySelector("[data-monac-selection-overlay]")?.remove();
    return;
  }

  const elementName = source.localName.toLowerCase();
  ui.svgSelectionStatus.textContent = `<${elementName}> を選択中`;
  if (elementName === "path") {
    ui.svgInspectorHint.textContent = "枠の角でサイズ変更、上の丸で回転、橙の点でパス、青の点でベジェ曲線を編集できます。";
  } else if (["polygon", "polyline"].includes(elementName)) {
    ui.svgInspectorHint.textContent = "枠の角でサイズ変更、上の丸で回転、橙の点で頂点を編集できます。";
  } else {
    ui.svgInspectorHint.textContent = "枠の角でサイズ変更、上の丸で回転、辺の四角で傾斜できます。";
  }
  const labels = {
    cx: "中心 X",
    cy: "中心 Y",
    dx: "移動 X",
    dy: "移動 Y",
    fill: "塗り",
    height: "高さ",
    r: "半径",
    rx: "角丸 X / 半径 X",
    ry: "角丸 Y / 半径 Y",
    stroke: "線",
    "stroke-width": "線の幅",
    width: "幅",
    x: "X",
    x1: "始点 X",
    x2: "終点 X",
    y: "Y",
    y1: "始点 Y",
    y2: "終点 Y",
    "font-size": "文字サイズ",
  };
  const simpleText = !source.children.length &&
    [...source.childNodes].every((child) => child.nodeType === Node.TEXT_NODE);
  if (["text", "tspan"].includes(elementName) && simpleText) {
    const label = document.createElement("label");
    label.textContent = "文字";
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = source.textContent || "";
    input.setAttribute("aria-label", "文字");
    input.addEventListener("change", () => {
      source.textContent = input.value;
      syncSvgModel(tab, elementId);
    });
    label.append(input);
    ui.svgProperties.append(label);
  } else if (["text", "tspan"].includes(elementName)) {
    const hint = document.createElement("p");
    hint.className = "svg-property-note";
    hint.textContent = "装飾を保つため、子要素のある文字は文字編集モードで編集してください。";
    ui.svgProperties.append(hint);
  }

  for (const attributeName of svgEditableAttributes(elementName)) {
    const label = document.createElement("label");
    label.textContent = labels[attributeName] || attributeName;
    const input = document.createElement("input");
    const rawValue = source.getAttribute(attributeName) || "";
    const numeric = !["fill", "stroke"].includes(attributeName) &&
      (!rawValue || Number.isFinite(Number(rawValue)));
    input.type = numeric ? "number" : "text";
    if (numeric) {
      input.step = "any";
      if (["height", "r", "rx", "ry", "stroke-width", "width", "font-size"].includes(attributeName)) {
        input.min = "0";
      }
    }
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = rawValue;
    input.setAttribute("aria-label", labels[attributeName] || attributeName);
    input.addEventListener("change", () => {
      const value = input.value.trim();
      if (numeric && value && !Number.isFinite(Number(value))) {
        showError(new TypeError(`${labels[attributeName] || attributeName}には数値を入力してください。`));
        return;
      }
      if (
        numeric &&
        value &&
        input.min &&
        Number(value) < Number(input.min)
      ) {
        showError(new TypeError(`${labels[attributeName] || attributeName}には0以上の値を入力してください。`));
        return;
      }
      if (value) source.setAttribute(attributeName, value);
      else source.removeAttribute(attributeName);
      syncSvgModel(tab, elementId);
    });
    label.append(input);
    ui.svgProperties.append(label);
  }

  tab.svgTransforms ||= new Map();
  if (!tab.svgTransforms.has(elementId)) {
    tab.svgTransforms.set(elementId, {
      base: source.getAttribute("transform") || "",
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      translateX: 0,
      translateY: 0,
    });
  }
  const transformValues = tab.svgTransforms.get(elementId);
  const bounds = preview?.getBBox();
  const centerX = bounds ? bounds.x + bounds.width / 2 : 0;
  const centerY = bounds ? bounds.y + bounds.height / 2 : 0;
  const transformHeading = document.createElement("h3");
  transformHeading.className = "svg-property-heading";
  transformHeading.textContent = "変形";
  ui.svgProperties.append(transformHeading);
  const transformControls = [
    ["scaleX", "追加倍率 X"],
    ["scaleY", "追加倍率 Y"],
    ["rotation", "追加回転（°）"],
    ["skewX", "追加傾斜 X（°）"],
    ["skewY", "追加傾斜 Y（°）"],
  ];
  for (const [key, labelText] of transformControls) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    if (key === "scaleX" || key === "scaleY") {
      input.min = "0.02";
      input.max = "100";
    } else if (key === "skewX" || key === "skewY") {
      input.min = "-40";
      input.max = "40";
    }
    input.value = String(transformValues[key]);
    input.setAttribute("aria-label", labelText);
    input.addEventListener("change", () => {
      const value = Number(input.value);
      if (
        !input.value ||
        !Number.isFinite(value) ||
        input.min && value < Number(input.min) ||
        input.max && value > Number(input.max)
      ) {
        showError(new TypeError(`${labelText}には数値を入力してください。`));
        return;
      }
      transformValues[key] = value;
      applySvgTransform(source, preview, transformValues, centerX, centerY);
      syncSvgModel(tab, elementId);
    });
    label.append(input);
    ui.svgProperties.append(label);
  }
  if (elementName === "path" && !parseSvgPath(source.getAttribute("d") || "")) {
    const hint = document.createElement("p");
    hint.className = "svg-property-note";
    hint.textContent = "このパス形式の点編集には未対応です。文字編集モードで編集してください。";
    ui.svgProperties.append(hint);
  } else if (
    ["polygon", "polyline"].includes(elementName) &&
    !parseSvgPoints(source.getAttribute("points") || "")
  ) {
    const hint = document.createElement("p");
    hint.className = "svg-property-note";
    hint.textContent = "頂点データを読み取れません。文字編集モードで編集してください。";
    ui.svgProperties.append(hint);
  }
  renderSvgSelectionOverlay(tab, elementId);
}

function applySvgTransform(source, preview, values, centerX, centerY) {
  const transform = buildSvgTransform(values.base, values, centerX, centerY);
  source.setAttribute("transform", transform);
  preview.setAttribute("transform", transform);
}

function addSvgHandle(group, x, y, kind, index = "") {
  const handle = document.createElementNS(SVG_NAMESPACE, "circle");
  handle.setAttribute("cx", x);
  handle.setAttribute("cy", y);
  handle.setAttribute("r", group.dataset.handleRadius || "6");
  handle.dataset.monacHandle = kind;
  handle.dataset.monacIndex = String(index);
  group.append(handle);
  return handle;
}

function renderSvgSelectionOverlay(tab, elementId) {
  const root = ui.svgStage.querySelector("svg");
  const target = tab.svgPreviewElements.get(elementId);
  if (!root || !target) return;
  ui.svgStage.querySelector("[data-monac-selection-overlay]")?.remove();
  const bounds = target.getBBox();
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return;

  const rootMatrix = root.getScreenCTM();
  const targetMatrix = target.getScreenCTM();
  if (!rootMatrix || !targetMatrix) return;
  const matrix = rootMatrix.inverse().multiply(targetMatrix);
  const screenScale = Math.max(0.001, Math.hypot(targetMatrix.a, targetMatrix.b));
  const overlay = document.createElementNS(SVG_NAMESPACE, "g");
  overlay.dataset.monacSelectionOverlay = "";
  overlay.dataset.monacSvgId = elementId;
  overlay.dataset.handleRadius = String(6 / screenScale);
  overlay.setAttribute("transform", `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`);
  const frame = document.createElementNS(SVG_NAMESPACE, "rect");
  frame.setAttribute("x", bounds.x);
  frame.setAttribute("y", bounds.y);
  frame.setAttribute("width", bounds.width);
  frame.setAttribute("height", bounds.height);
  frame.setAttribute("fill", "none");
  frame.setAttribute("pointer-events", "none");
  overlay.append(frame);

  const corners = [
    [bounds.x, bounds.y, "resize-nw"],
    [bounds.x + bounds.width, bounds.y, "resize-ne"],
    [bounds.x, bounds.y + bounds.height, "resize-sw"],
    [bounds.x + bounds.width, bounds.y + bounds.height, "resize-se"],
  ];
  for (const [x, y, kind] of corners) addSvgHandle(overlay, x, y, kind);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const rotateHandleY = bounds.y - Math.max(bounds.height * 0.15, 24 / screenScale);
  const rotateLink = document.createElementNS(SVG_NAMESPACE, "line");
  rotateLink.setAttribute("x1", centerX);
  rotateLink.setAttribute("y1", bounds.y);
  rotateLink.setAttribute("x2", centerX);
  rotateLink.setAttribute("y2", rotateHandleY);
  rotateLink.setAttribute("pointer-events", "none");
  overlay.append(rotateLink);
  addSvgHandle(overlay, centerX, rotateHandleY, "rotate");
  addSvgHandle(overlay, centerX, bounds.y, "skew-x");
  addSvgHandle(overlay, bounds.x, centerY, "skew-y");

  const source = tab.svgElements.get(elementId);
  if (["polygon", "polyline"].includes(source.localName.toLowerCase())) {
    const points = parseSvgPoints(source.getAttribute("points") || "");
    if (points) points.forEach((point, index) =>
      addSvgHandle(overlay, point.x, point.y, "vertex", index)
    );
  } else if (source.localName.toLowerCase() === "path") {
    const segments = parseSvgPath(source.getAttribute("d") || "");
    if (segments) {
      let previous = null;
      let subpathStart = null;
      segments.forEach((segment, index) => {
        if (segment.command === "Z") {
          previous = subpathStart;
          return;
        }
        if (segment.command === "M") subpathStart = segment.point;
        if (segment.command === "C") {
          for (const [kind, point, from] of [
            ["control1", segment.control1, previous],
            ["control2", segment.control2, segment.point],
          ]) {
            if (from) {
              const line = document.createElementNS(SVG_NAMESPACE, "line");
              line.setAttribute("x1", from.x);
              line.setAttribute("y1", from.y);
              line.setAttribute("x2", point.x);
              line.setAttribute("y2", point.y);
              line.setAttribute("pointer-events", "none");
              overlay.append(line);
            }
            addSvgHandle(overlay, point.x, point.y, kind, index);
          }
        } else if (segment.command === "Q") {
          if (previous) {
            const line = document.createElementNS(SVG_NAMESPACE, "line");
            line.setAttribute("x1", previous.x);
            line.setAttribute("y1", previous.y);
            line.setAttribute("x2", segment.control.x);
            line.setAttribute("y2", segment.control.y);
            line.setAttribute("pointer-events", "none");
            overlay.append(line);
          }
          addSvgHandle(overlay, segment.control.x, segment.control.y, "control", index);
        }
        addSvgHandle(overlay, segment.point.x, segment.point.y, "anchor", index);
        previous = segment.point;
      });
    }
  }
  root.append(overlay);
}

function syncSvgModel(tab, selectedId) {
  if (!tab.svgDocument.documentElement.namespaceURI) {
    tab.svgDocument.documentElement.setAttribute("xmlns", SVG_NAMESPACE);
  }
  const value = new XMLSerializer().serializeToString(tab.svgDocument);
  tab.model.pushEditOperations(
    [],
    [{ range: tab.model.getFullModelRange(), text: value }],
    () => null,
  );
  renderSvgEditor(tab, selectedId, true);
}

function renderSvgEditor(tab, selectedId = tab.svgSelectionId || "", preserveTransforms = false) {
  ui.svgStage.replaceChildren();
  ui.svgProperties.replaceChildren();
  ui.svgSelectionStatus.textContent = "";
  try {
    const value = tab.model.getValue();
    if (!preserveTransforms && tab.svgGuiModelValue !== value) {
      tab.svgTransforms = new Map();
    }
    const sourceDocument = new DOMParser().parseFromString(value, "image/svg+xml");
    const root = sourceDocument.documentElement;
    if (
      root.localName.toLowerCase() !== "svg" ||
      [...sourceDocument.getElementsByTagName("parsererror")].some((element) =>
        element.namespaceURI !== SVG_NAMESPACE
      )
    ) {
      throw new Error("有効なSVG XMLではありません。文字で編集して内容を確認してください。");
    }

    tab.svgDocument = sourceDocument;
    tab.svgGuiModelValue = value;
    tab.svgElements = new Map();
    tab.svgPreviewElements = new Map();
    const preview = cloneSvgPreviewNode(root, tab.svgElements, tab.svgPreviewElements);
    preview.setAttribute("xmlns", SVG_NAMESPACE);
    sanitizeSvgPreview(preview);
    ui.svgStage.append(preview);
    selectSvgElement(tab, selectedId);

    let drag = null;
    preview.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const handle = event.target instanceof Element
        ? event.target.closest("[data-monac-handle]")
        : null;
      if (handle) {
        const overlay = handle.closest("[data-monac-selection-overlay]");
        const elementId = overlay?.dataset.monacSvgId;
        const target = tab.svgPreviewElements.get(elementId);
        const source = tab.svgElements.get(elementId);
        const pointMatrix = target?.getScreenCTM?.();
        const start = target && svgPointInElement(target, event, pointMatrix);
        if (!target || !source || !start) return;
        event.preventDefault();
        const kind = handle.dataset.monacHandle;
        if (["vertex", "anchor", "control", "control1", "control2"].includes(kind)) {
          const polygonPoints = ["vertex"].includes(kind)
            ? parseSvgPoints(source.getAttribute("points") || "")
            : null;
          const pathSegments = ["anchor", "control", "control1", "control2"].includes(kind)
            ? parseSvgPath(source.getAttribute("d") || "")
            : null;
          if (kind === "vertex" && !polygonPoints || kind !== "vertex" && !pathSegments) {
            notify("この図形の点データをGUIで編集できません。文字編集モードをご利用ください。", true);
            return;
          }
          drag = {
            type: "node",
            kind,
            elementId,
            target,
            source,
            index: Number(handle.dataset.monacIndex),
            start,
            polygonPoints,
            pathSegments,
            pointMatrix,
            moved: false,
          };
        } else {
          const bounds = target.getBBox();
          const values = { ...tab.svgTransforms.get(elementId) };
          const kindParts = kind.split("-");
          const corner = kindParts[1] || "";
          const oppositeX = corner.endsWith("w") ? bounds.x + bounds.width : bounds.x;
          const oppositeY = corner.startsWith("n") ? bounds.y + bounds.height : bounds.y;
          drag = {
            type: "transform",
            kind,
            elementId,
            target,
            source,
            start,
            values,
            initialScale: { x: values.scaleX, y: values.scaleY },
            bounds,
            pointMatrix,
            center: {
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height / 2,
            },
            opposite: { x: oppositeX, y: oppositeY },
            startAngle: Math.atan2(
              start.y - (bounds.y + bounds.height / 2),
              start.x - (bounds.x + bounds.width / 2),
            ),
            moved: false,
          };
        }
        preview.setPointerCapture(event.pointerId);
        return;
      }
      const target = event.target instanceof Element
        ? event.target.closest("[data-monac-svg-id]")
        : null;
      if (!target || !preview.contains(target)) {
        selectSvgElement(tab, "");
        return;
      }
      const elementId = target.dataset.monacSvgId;
      const source = tab.svgElements.get(elementId);
      const pointMatrix = target.parentElement?.getScreenCTM?.();
      const start = svgPointInParent(target, event, pointMatrix);
      if (!source || !start) return;
      event.preventDefault();
      selectSvgElement(tab, elementId);
      const transformValues = tab.svgTransforms.get(elementId);
      drag = {
        type: "move",
        elementId,
        target,
        source,
        start,
        pointMatrix,
        originalPositions: new Map(svgPositionAttributes(source.localName).map((attribute) => [
          attribute,
          source.getAttribute(attribute),
        ])),
        initialTranslation: {
          x: transformValues.translateX,
          y: transformValues.translateY,
        },
        moved: false,
        offset: { x: 0, y: 0 },
      };
      preview.setPointerCapture(event.pointerId);
    });
    preview.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const current = drag.type === "move"
        ? svgPointInParent(drag.target, event, drag.pointMatrix)
        : svgPointInElement(drag.target, event, drag.pointMatrix);
      if (!current) return;
      const x = current.x - drag.start.x;
      const y = current.y - drag.start.y;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return;
      drag.moved = true;
      drag.offset = { x, y };
      if (drag.type === "transform") {
        const values = drag.values;
        if (drag.kind.startsWith("resize-")) {
          const initialX = drag.start.x - drag.opposite.x;
          const initialY = drag.start.y - drag.opposite.y;
          const scaleX = Math.abs(initialX) > 0.001
            ? ((current.x - drag.opposite.x) / initialX) * drag.initialScale.x
            : drag.initialScale.x;
          const scaleY = Math.abs(initialY) > 0.001
            ? ((current.y - drag.opposite.y) / initialY) * drag.initialScale.y
            : drag.initialScale.y;
          if (Number.isFinite(scaleX)) values.scaleX = Math.max(0.02, Math.min(100, scaleX));
          if (Number.isFinite(scaleY)) values.scaleY = Math.max(0.02, Math.min(100, scaleY));
        } else if (drag.kind === "rotate") {
          const angle = Math.atan2(
            current.y - drag.center.y,
            current.x - drag.center.x,
          );
          values.rotation += ((angle - drag.startAngle) * 180) / Math.PI;
          drag.startAngle = angle;
          drag.values.rotation = values.rotation;
          drag.start = current;
        } else if (drag.kind === "skew-x") {
          values.skewX = Math.max(
            -40,
            Math.min(
              40,
              values.skewX + (Math.atan2(x, Math.max(1, drag.bounds.height)) * 180) / Math.PI,
            ),
          );
          drag.start = current;
        } else if (drag.kind === "skew-y") {
          values.skewY = Math.max(
            -40,
            Math.min(
              40,
              values.skewY + (Math.atan2(y, Math.max(1, drag.bounds.width)) * 180) / Math.PI,
            ),
          );
          drag.start = current;
        }
        applySvgTransform(
          drag.source,
          drag.target,
          values,
          drag.center.x,
          drag.center.y,
        );
      } else if (drag.type === "node") {
        if (drag.kind === "vertex") {
          drag.polygonPoints[drag.index] = current;
          drag.source.setAttribute("points", serializeSvgPoints(drag.polygonPoints));
          drag.target.setAttribute("points", serializeSvgPoints(drag.polygonPoints));
        } else {
          const segment = drag.pathSegments[drag.index];
          if (drag.kind === "anchor") segment.point = current;
          else if (drag.kind === "control") segment.control = current;
          else segment[drag.kind] = current;
          const value = serializeSvgPath(drag.pathSegments);
          drag.source.setAttribute("d", value);
          drag.target.setAttribute("d", value);
        }
      } else {
        const values = tab.svgTransforms.get(drag.elementId);
        if (applySvgOffset(drag.source, x, y, drag.originalPositions)) {
          for (const attribute of drag.originalPositions.keys()) {
            drag.target.setAttribute(attribute, drag.source.getAttribute(attribute));
          }
        } else {
          values.translateX = drag.initialTranslation.x + x;
          values.translateY = drag.initialTranslation.y + y;
          const bounds = drag.target.getBBox();
          applySvgTransform(
            drag.source,
            drag.target,
            values,
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          );
        }
      }
    });
    const finishDrag = () => {
      if (!drag) return;
      if (drag.moved) {
        const elementId = drag.elementId;
        if (drag.type === "transform" || drag.type === "move") {
          const transform = drag.target.getAttribute("transform") || "";
          if (transform) drag.source.setAttribute("transform", transform);
          else drag.source.removeAttribute("transform");
          if (drag.type === "transform") {
            tab.svgTransforms.set(elementId, drag.values);
          }
        }
        drag = null;
        syncSvgModel(tab, elementId);
        return;
      }
      drag = null;
    };
    preview.addEventListener("pointerup", finishDrag);
    preview.addEventListener("pointercancel", finishDrag);
  } catch (error) {
    ui.svgStage.replaceChildren();
    const message = document.createElement("p");
    message.className = "svg-stage-message";
    message.textContent = errorMessage(error);
    ui.svgStage.append(message);
    ui.svgInspectorHint.textContent = "SVGの読み込みに失敗しました。文字で編集して内容を確認してください。";
    ui.svgSelectionStatus.textContent = "SVGを表示できません";
    showError(error);
  }
}

function normalizeLinkPath(path) {
  const segments = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function resolveLinkPath(model, href) {
  const reference = href.trim();
  if (
    !reference ||
    reference.startsWith("#") ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)
  ) {
    return null;
  }
  const pathOnly = reference.split(/[?#]/, 1)[0];
  let decodedPath;
  let basePath = "";
  try {
    decodedPath = decodeURIComponent(pathOnly);
    if (!pathOnly.startsWith("/")) {
      basePath = parentPath(decodeURIComponent(model.uri.path.replace(/^\/+/, "")));
    }
  } catch {
    return null;
  }
  return normalizeLinkPath(
    pathOnly.startsWith("/") ? decodedPath : `${basePath}/${decodedPath}`,
  );
}

function extractLinkReferences(model) {
  const text = model.getValue();
  const patterns = [
    /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi,
    /\b(?:import|from|require)\s*\(?\s*["']([^"']+)["']/g,
    /\burl\(\s*["']?([^"')]+)["']?\s*\)/gi,
    /\]\(\s*<?([^)> \t]+)>?\s*\)/g,
  ];
  const links = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const href = match[1];
      const path = resolveLinkPath(model, href);
      if (path === null || seen.has(`${match.index}:${path}`)) continue;
      seen.add(`${match.index}:${path}`);
      const start = match.index + match[0].indexOf(href);
      links.push({
        range: {
          startLineNumber: model.getPositionAt(start).lineNumber,
          startColumn: model.getPositionAt(start).column,
          endLineNumber: model.getPositionAt(start + href.length).lineNumber,
          endColumn: model.getPositionAt(start + href.length).column,
        },
        url: `inmemory://workspace/${path.split("/").map(encodeURIComponent).join("/")}`,
      });
    }
  }
  return links;
}

function getTab(path) {
  return tabs.find((tab) => tab.path === path) || null;
}

function isDirty(tab) {
  return tab.model.getValue() !== tab.savedValue;
}

function renderTabs() {
  ui.tabs.replaceChildren();
  for (const tab of tabs) {
    const button = document.createElement("div");
    button.className = `tab${!activeExecutionTabId && tab.path === activePath ? " active" : ""}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(!activeExecutionTabId && tab.path === activePath));
    button.tabIndex = 0;
    button.title = tab.path;
    button.draggable = true;
    button.dataset.path = tab.path;

    const label = document.createElement("span");
    label.className = "tab-name";
    label.textContent = basename(tab.path);
    const tabLabel = document.createElement("span");
    tabLabel.className = "tab-label";
    const folder = document.createElement("span");
    folder.className = "tab-folder";
    folder.textContent = parentPath(tab.path) || ".";
    tabLabel.append(label, folder);
    const dirty = document.createElement("span");
    dirty.className = "tab-dirty";
    dirty.textContent = isDirty(tab) ? "●" : "";
    dirty.setAttribute("aria-label", isDirty(tab) ? "未保存" : "");
    button.append(tabLabel, dirty);
    button.addEventListener("click", () => activateTab(tab.path));
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateTab(tab.path);
      }
    });
    button.addEventListener("dragstart", (event) => {
      if (event.target.closest(".tab-close")) {
        event.preventDefault();
        return;
      }
      draggedTabPath = tab.path;
      button.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-monac-tab", tab.path);
    });
    button.addEventListener("dragover", (event) => {
      if (!draggedTabPath || draggedTabPath === tab.path) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const after = event.clientX >= button.getBoundingClientRect().left + button.offsetWidth / 2;
      clearTabDropIndicators();
      button.classList.add(after ? "drag-after" : "drag-before");
    });
    button.addEventListener("drop", (event) => {
      if (!draggedTabPath || draggedTabPath === tab.path) return;
      event.preventDefault();
      const after = event.clientX >= button.getBoundingClientRect().left + button.offsetWidth / 2;
      reorderTab(draggedTabPath, tab.path, after);
      draggedTabPath = "";
      clearTabDropTargets();
    });
    button.addEventListener("dragend", () => {
      draggedTabPath = "";
      clearTabDropTargets();
    });

    const close = document.createElement("button");
    close.className = "tab-close";
    close.type = "button";
    close.textContent = "×";
    close.title = "タブを閉じる";
    close.setAttribute("aria-label", `${basename(tab.path)}を閉じる`);
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTab(tab.path);
    });
    button.append(close);
    ui.tabs.append(button);
  }
  for (const executionTab of executionTabs) {
    const button = document.createElement("div");
    button.className = `tab execution-tab${executionTab.id === activeExecutionTabId ? " active" : ""}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(executionTab.id === activeExecutionTabId));
    button.tabIndex = 0;
    button.title = `Canvas: ${executionTab.path}`;
    button.dataset.executionId = executionTab.id;
    const label = document.createElement("span");
    label.className = "tab-name";
    label.textContent = `▶ ${basename(executionTab.path)}`;
    button.append(label);
    button.addEventListener("click", () => activateExecutionTab(executionTab.id));
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateExecutionTab(executionTab.id);
      }
    });
    const close = document.createElement("button");
    close.className = "tab-close";
    close.type = "button";
    close.textContent = "×";
    close.title = "実行タブを閉じる";
    close.setAttribute("aria-label", `${basename(executionTab.path)}の実行タブを閉じる`);
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeExecutionTab(executionTab.id);
    });
    button.append(close);
    ui.tabs.append(button);
  }
  ui.saveFile.disabled = Boolean(activeExecutionTabId) || !activePath || !pointer;
  ui.saveAll.disabled = !tabs.some(isDirty) || !pointer;
  renderTreeDirtyState();
}

function clearTabDropTargets() {
  for (const tab of ui.tabs.querySelectorAll(".tab")) {
    tab.classList.remove("dragging", "drag-before", "drag-after");
  }
}

function clearTabDropIndicators() {
  for (const tab of ui.tabs.querySelectorAll(".tab")) {
    tab.classList.remove("drag-before", "drag-after");
  }
}

function reorderTab(sourcePath, targetPath, after = true) {
  const sourceIndex = tabs.findIndex((tab) => tab.path === sourcePath);
  if (sourceIndex < 0) return;
  const [tab] = tabs.splice(sourceIndex, 1);
  if (!targetPath) {
    tabs.push(tab);
    renderTabs();
    return;
  }
  const targetIndex = tabs.findIndex((item) => item.path === targetPath);
  if (targetIndex < 0) {
    tabs.splice(sourceIndex, 0, tab);
    return;
  }
  let insertIndex = tabs.findIndex((item) => item.path === targetPath);
  if (after) insertIndex += 1;
  tabs.splice(insertIndex, 0, tab);
  renderTabs();
}

function activateTab(path) {
  const tab = getTab(path);
  if (!tab) return;
  clearFileDetails();
  activeExecutionTabId = "";
  ui.executionWorkbench.hidden = true;
  for (const view of ui.executionWorkbench.querySelectorAll(".execution-view")) view.hidden = true;
  activePath = path;
  editor.setModel(tab.model);
  ui.editor.hidden = false;
  ui.welcome.hidden = true;
  ui.error.hidden = true;
  ui.statusPath.textContent = path;
  const isSvg = isSvgPath(path);
  const svgMode = isSvg ? svgModeForPath(path, tab.svgMode) : "text";
  tab.svgMode = svgMode;
  ui.svgModeBar.hidden = !isSvg;
  ui.svgWorkbench.hidden = !isSvg || svgMode !== "gui";
  ui.editor.classList.toggle("svg-text-mode", isSvg && svgMode === "text");
  ui.editor.hidden = isSvg && svgMode === "gui";
  for (const button of ui.svgModeBar.querySelectorAll("[data-svg-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.svgMode === svgMode));
  }
  ui.statusLanguage.textContent = isSvg
    ? (svgMode === "gui" ? "SVG (GUI)" : "XML")
    : humanLanguage(languageForPath(path));
  if (isSvg && svgMode === "gui") renderSvgEditor(tab);
  else if (!isSvg) ui.svgStage.replaceChildren();
  if (!ui.editor.hidden) editor.layout();
  renderTabs();
  renderTreeSelection();
}

function closeTab(path) {
  const tab = getTab(path);
  if (!tab) return;
  if (isDirty(tab) && !window.confirm(`${basename(path)} に未保存の変更があります。閉じますか？`)) {
    return;
  }
  const closingIndex = tabs.indexOf(tab);
  tabs = tabs.filter((item) => item !== tab);
  tab.model.dispose();
  if (activePath === path && activeExecutionTabId) {
    const nextTab = tabs[Math.min(closingIndex, tabs.length - 1)];
    activePath = nextTab?.path ?? "";
  } else if (activePath === path) {
    const nextTab = tabs[Math.min(closingIndex, tabs.length - 1)];
    if (nextTab) {
      activateTab(nextTab.path);
    } else {
      activePath = "";
      editor.setModel(null);
      clearFileDetails();
      ui.svgModeBar.hidden = true;
      ui.svgWorkbench.hidden = true;
      ui.editor.classList.remove("svg-text-mode");
      ui.editor.hidden = false;
      ui.welcome.hidden = false;
      ui.statusPath.textContent = pointer ? rootName : "準備完了";
      ui.statusLanguage.textContent = "Plain Text";
      renderTreeSelection();
    }
  }
  renderTabs();
}

function activateExecutionTab(id) {
  const tab = executionTabs.find((item) => item.id === id);
  if (!tab) return;
  clearFileDetails();
  activeExecutionTabId = id;
  ui.editor.hidden = true;
  ui.svgModeBar.hidden = true;
  ui.svgWorkbench.hidden = true;
  ui.welcome.hidden = true;
  ui.error.hidden = true;
  ui.executionWorkbench.hidden = false;
  for (const view of ui.executionWorkbench.querySelectorAll(".execution-view")) {
    view.hidden = view.dataset.executionId !== id;
  }
  ui.statusPath.textContent = `実行: ${tab.path}`;
  ui.statusLanguage.textContent = "Canvas";
  renderTabs();
}

function closeExecutionTab(id) {
  const index = executionTabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const [tab] = executionTabs.splice(index, 1);
  tab.closed = true;
  tab.iframe.srcdoc = "";
  tab.view.remove();
  if (activeExecutionTabId === id) {
    const nextExecution = executionTabs[Math.min(index, executionTabs.length - 1)];
    if (nextExecution) {
      activateExecutionTab(nextExecution.id);
    } else {
      activeExecutionTabId = "";
      if (activePath && getTab(activePath)) activateTab(activePath);
      else {
        ui.executionWorkbench.hidden = true;
        ui.editor.hidden = true;
        ui.welcome.hidden = false;
        ui.statusPath.textContent = pointer ? rootName : "準備完了";
        ui.statusLanguage.textContent = "Plain Text";
        renderTabs();
      }
    }
  }
  renderTabs();
}

async function openFile(path, requestedSvgMode = null) {
  if (!editor || !window.monaco) {
    throw new Error("Monaco Editorの準備ができていません。読み込み完了後にもう一度お試しください。");
  }
  const existing = getTab(path);
  if (existing) {
    if (isSvgPath(path) && requestedSvgMode) {
      existing.svgMode = svgModeForPath(path, requestedSvgMode);
    }
    activateTab(path);
    return;
  }
  const file = await pointer.getFile(path);
  const kind = classifyFile(file, path);
  const isSvg = isSvgPath(path);
  if (kind !== "text" && !isSvg) {
    showFileDetails(path, file, kind);
    return;
  }
  const value = await pointer.readFile(path);
  if (value.includes("\0")) {
    showFileDetails(path, file, "binary");
    return;
  }
  const language = languageForPath(path);
  const model = window.monaco.editor.createModel(value, language, modelUri(path));
  const tab = {
    path,
    model,
    savedValue: value,
    svgMode: svgModeForPath(path, requestedSvgMode),
  };
  model.onDidChangeContent(() => renderTabs());
  tabs.push(tab);
  activateTab(path);
}

function showMissingLink(path) {
  ui.linkNotFoundMessage.textContent = `「${path || "."}」に一致するファイルがありません。`;
  ui.linkNotFoundDialog.showModal();
}

async function openLinkedPath(path) {
  if (!pointer) {
    showMissingLink(path);
    return;
  }
  const segments = path.split("/").filter(Boolean);
  let directoryPath = "";
  let directoryEntry = null;

  try {
    for (const segment of segments) {
      const entries = await pointer.listDirectory(directoryPath);
      directoryEntry = entries.find((entry) => entry.name === segment) || null;
      if (!directoryEntry) {
        showMissingLink(path);
        return;
      }
      const currentPath = directoryPath ? `${directoryPath}/${segment}` : segment;
      if (directoryEntry.kind === "directory") {
        directoryPath = currentPath;
        continue;
      }
      if (currentPath !== path) {
        showMissingLink(path);
        return;
      }
      await openFile(currentPath);
      return;
    }

    const folderPath = directoryEntry?.kind === "directory" ? directoryPath : path;
    const entries = await pointer.listDirectory(folderPath);
    const indexFile = directoryIndexFiles.find((candidate) =>
      entries.some((entry) => entry.kind === "file" && entry.name === candidate),
    );
    if (!indexFile) {
      showMissingLink(`${folderPath ? `${folderPath}/` : ""}[${directoryIndexFiles.join(", ")}]`);
      return;
    }
    await openFile(folderPath ? `${folderPath}/${indexFile}` : indexFile);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      showMissingLink(path);
      return;
    }
    showError(error);
  }
}

function workspacePathFromResource(resource) {
  if (resource.scheme === "inmemory" && resource.authority === "workspace") {
    try {
      return normalizeLinkPath(decodeURIComponent(resource.path.replace(/^\/+/, "")));
    } catch {
      return null;
    }
  }
  if (resource.scheme || resource.authority || !resource.path || /^[?#]/.test(resource.path)) {
    return false;
  }
  const currentTab = getTab(activePath);
  return currentTab ? resolveLinkPath(currentTab.model, resource.path) : false;
}

async function saveTab(tab, quiet = false) {
  const contents = tab.model.getValue();
  await pointer.writeFile(tab.path, contents);
  tab.savedValue = contents;
  renderTabs();
  if (!quiet && tab.path === activePath) notify(`${basename(tab.path)} を保存しました。`);
}

async function saveActive() {
  const tab = getTab(activePath);
  if (!tab || !pointer) return;
  try {
    await saveTab(tab);
  } catch (error) {
    showError(error);
  }
}

async function saveAll() {
  const unsaved = tabs.filter(isDirty);
  if (!unsaved.length || !pointer) return;
  try {
    for (const tab of unsaved) await saveTab(tab, true);
    notify(`${unsaved.length} 個のファイルを保存しました。`);
  } catch (error) {
    showError(error);
  }
}

function renderTreeSelection() {
  ui.rootLabel.classList.toggle(
    "selected-root",
    selectedKind === "directory" && !selectedPath,
  );
  for (const row of ui.fileTree.querySelectorAll(".tree-row")) {
    const selected = selectedEntries.has(treeEntryKey(row.dataset.path, row.dataset.kind));
    row.classList.toggle("selected", selected);
    row.classList.toggle(
      "cut",
      Boolean(clipboard?.cut && clipboard.entries.some((entry) =>
        pathMatchesEntry(row.dataset.path, entry.path, entry.kind, row.dataset.kind)
      )),
    );
    row.setAttribute("aria-selected", String(selected));
  }
  renderTreeDirtyState();
}

function renderTreeDirtyState() {
  const dirtyPaths = tabs.filter(isDirty).map((tab) => tab.path);
  for (const row of ui.fileTree.querySelectorAll(".tree-row")) {
    const dirty = row.dataset.kind === "directory"
      ? dirtyPaths.some((path) => path.startsWith(`${row.dataset.path}/`))
      : dirtyPaths.includes(row.dataset.path);
    row.classList.toggle("unsaved", dirty);
  }
}

function hideContextMenu() {
  if (ui.contextMenu.hidden) return;
  ui.contextMenu.hidden = true;
  ui.contextMenu.replaceChildren();
  contextTarget = null;
}

function appendMenuSeparator() {
  const separator = document.createElement("div");
  separator.className = "menu-separator";
  separator.setAttribute("role", "separator");
  ui.contextMenu.append(separator);
}

function appendMenuItem(label, action, { shortcut = "", disabled = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.textContent = label;
  button.disabled = disabled;
  if (shortcut) {
    const key = document.createElement("span");
    key.className = "menu-shortcut";
    key.textContent = shortcut;
    button.append(key);
  }
  button.addEventListener("click", () => {
    hideContextMenu();
    action();
  });
  ui.contextMenu.append(button);
}

function openSettings() {
  if (!pointer) {
    notify("設定を変更するには、先にワークスペースを開いてください。");
    return;
  }
  ui.settingsInput.value = directoryIndexFiles.join("\n");
  ui.iconExtension.value = "";
  ui.iconImage.value = "";
  updateIconSettingsPreview();
  ui.settingsDialog.showModal();
  ui.settingsInput.focus();
}

function updateIconSettingsPreview() {
  ui.iconPreview.replaceChildren();
  let extension;
  try {
    extension = validateIconExtension(ui.iconExtension.value);
  } catch {
    ui.iconPreview.textContent = "拡張子を入力すると標準アイコンを確認できます。";
    return;
  }
  ui.iconPreview.append(createFileIcon(`preview.${extension}`));
  const label = document.createElement("span");
  label.textContent = customIconUrls.has(extension)
    ? `${extension}.png を使用中`
    : "VS Code Seti 標準アイコン";
  ui.iconPreview.append(label);
}

function installLinkSupport() {
  const languages = [
    "css",
    "html",
    "javascript",
    "javascriptreact",
    "json",
    "markdown",
    "scss",
    "typescript",
    "typescriptreact",
  ];
  window.monaco.languages.registerLinkProvider(languages, {
    provideLinks(model) {
      return { links: extractLinkReferences(model) };
    },
  });
  if (typeof window.monaco.editor.registerLinkOpener !== "function") {
    throw new Error("このMonaco Editorはリンクのローカルファイル連携に対応していません。");
  }
  window.monaco.editor.registerLinkOpener({
    open(resource) {
      if (!pointer) return false;
      const path = workspacePathFromResource(resource);
      if (path === false) return false;
      if (path === null) {
        showMissingLink(resource.path);
        return true;
      }
      void openLinkedPath(path);
      return true;
    },
  });
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    const nextSettings = validateDirectoryIndexFiles(
      ui.settingsInput.value.split(/\r?\n/),
    );
    await saveWorkspaceSettings(nextSettings);
    directoryIndexFiles = nextSettings;
    ui.settingsDialog.close();
    notify("設定を保存しました。");
  } catch (error) {
    showError(error);
  }
}

async function saveCustomIcon() {
  try {
    if (!pointer) throw new Error("先にワークスペースを開いてください。");
    const extension = validateIconExtension(ui.iconExtension.value);
    const file = ui.iconImage.files?.[0];
    if (!file) throw new Error("上書きするPNG画像を選択してください。");
    if (!await isPngFile(file)) {
      throw new TypeError("拡張子アイコンには有効なPNG画像を選択してください。");
    }

    await pointer.createFolder("", SETTINGS_DIRECTORY);
    const path = `${SETTINGS_DIRECTORY}/${extension}.png`;
    await pointer.createFile(SETTINGS_DIRECTORY, `${extension}.png`);
    await pointer.writeBinaryFile(path, file);
    const storedFile = await pointer.getFile(path);
    const nextUrl = URL.createObjectURL(storedFile);
    const previousUrl = customIconUrls.get(extension);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    customIconUrls.set(extension, nextUrl);
    ui.iconImage.value = "";
    updateIconSettingsPreview();
    await renderTree();
    notify(`「${extension}.png」を拡張子アイコンとして保存しました。`);
  } catch (error) {
    showError(error);
  }
}

async function resetCustomIcon() {
  try {
    if (!pointer) throw new Error("先にワークスペースを開いてください。");
    const extension = validateIconExtension(ui.iconExtension.value);
    const previousUrl = customIconUrls.get(extension);
    if (!previousUrl) {
      notify(`「${extension}」は標準アイコンを使用しています。`);
      return;
    }
    await pointer.deleteFile(`${SETTINGS_DIRECTORY}/${extension}.png`);
    URL.revokeObjectURL(previousUrl);
    customIconUrls.delete(extension);
    updateIconSettingsPreview();
    await renderTree();
    notify(`「${extension}」をVS Code標準アイコンに戻しました。`);
  } catch (error) {
    showError(error);
  }
}

function showContextMenu(x, y, target) {
  hideContextMenu();
  if (!pointer) return;
  if (target.path && !selectedEntries.has(treeEntryKey(target.path, target.kind))) {
    setSelected(target.path, target.kind);
  }
  contextTarget = target;
  const selected = getSelectedEntries();
  const hasSingleFile = selected.length === 1 && selected[0].kind === "file";
  const destination = target.kind === "directory" ? target.path : parentPath(target.path);

  if (target.kind === "directory") {
    appendMenuItem("新しいファイル", () => createEntry("file", destination));
    appendMenuItem("新しいフォルダー", () => createEntry("directory", destination));
    appendMenuSeparator();
  } else if (hasSingleFile) {
    if (isRunnableJavaScriptPath(target.path)) {
      appendMenuItem("GameEngine Fileとして実行", () =>
        runWorkspaceFile(target.path).catch(showError)
      );
      appendMenuSeparator();
      appendMenuItem("開く", () => openFile(target.path).catch(showError));
    } else if (isStudioProjectJsonPath(target.path)) {
      appendMenuItem("Studio JSONを読み込む", () =>
        importStudioProject(target.path, destination).catch(showError)
      );
      appendMenuSeparator();
      appendMenuItem("開く", () => openFile(target.path).catch(showError));
    } else if (isSvgPath(target.path)) {
      appendMenuItem("GUIで編集", () => openFile(target.path, "gui").catch(showError));
      appendMenuItem("文字で編集", () => openFile(target.path, "text").catch(showError));
    } else {
      appendMenuItem("開く", () => openFile(target.path).catch(showError));
    }
    appendMenuSeparator();
  }

  if (selected.length) {
    appendMenuItem("切り取り", () => setClipboard(selected, true), {
      shortcut: "Ctrl+X",
    });
    appendMenuItem("コピー", () => setClipboard(selected, false), {
      shortcut: "Ctrl+C",
    });
  }
  appendMenuItem("貼り付け", () => pasteEntry(destination), {
    shortcut: "Ctrl+V",
    disabled: !clipboard,
  });
  if (selected.length) {
    appendMenuSeparator();
    appendMenuItem("名前の変更", () => renameEntries(selected), {
      shortcut: "F2",
    });
    appendMenuItem("削除", () => deleteEntries(selected), {
      shortcut: "Delete",
    });
  }

  ui.contextMenu.hidden = false;
  const menuRect = ui.contextMenu.getBoundingClientRect();
  const left = Math.max(4, Math.min(x, window.innerWidth - menuRect.width - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - menuRect.height - 4));
  ui.contextMenu.style.left = `${left}px`;
  ui.contextMenu.style.top = `${top}px`;
  ui.contextMenu.querySelector("button:not(:disabled)")?.focus();
}

function isRunnableJavaScriptPath(path) {
  return /\.(?:js|mjs)$/i.test(path);
}

function isStudioProjectJsonPath(path) {
  return /\.json$/i.test(path);
}

function setExecutionState(tab, message, error = false) {
  tab.state.textContent = message;
  tab.state.title = message;
  tab.state.classList.toggle("error", error);
}

function createExecutionTab(path) {
  const id = `execution-${nextExecutionTabId++}`;
  const view = document.createElement("div");
  view.className = "execution-view";
  view.dataset.executionId = id;
  view.hidden = true;
  const toolbar = document.createElement("div");
  toolbar.className = "execution-toolbar";
  const title = document.createElement("strong");
  title.textContent = `Canvas — ${basename(path)}`;
  title.title = path;
  const state = document.createElement("span");
  state.className = "execution-state";
  state.textContent = "読み込み中…";
  const stop = document.createElement("button");
  stop.className = "button";
  stop.type = "button";
  stop.textContent = "停止";
  const iframe = document.createElement("iframe");
  iframe.className = "execution-frame";
  iframe.title = `${path} のCanvas実行`;
  iframe.setAttribute("sandbox", "allow-scripts");
  stop.addEventListener("click", () => {
    iframe.srcdoc = "";
    state.textContent = "停止中";
    state.title = "停止中";
    state.classList.remove("error");
  });
  toolbar.append(title, state, stop);
  view.append(toolbar, iframe);
  ui.executionWorkbench.append(view);
  const tab = { id, path, view, state, iframe, token: `${id}-${Date.now()}-${Math.random()}` };
  executionTabs.push(tab);
  activateExecutionTab(id);
  return tab;
}

async function readWorkspaceRunFiles(
  directoryPath = "",
  files = [],
  assets = {},
  workspacePointer = pointer,
  openSources = new Map(),
) {
  for (const entry of await workspacePointer.listDirectory(directoryPath)) {
    if (entry.kind === "directory") {
      if (entry.name === SETTINGS_DIRECTORY || entry.name === "node_modules") continue;
      const childPath = directoryPath ? `${directoryPath}/${entry.name}` : entry.name;
      await readWorkspaceRunFiles(childPath, files, assets, workspacePointer, openSources);
      continue;
    }
    const path = directoryPath ? `${directoryPath}/${entry.name}` : entry.name;
    if (isRunnableJavaScriptPath(path)) {
      files.push({
        path,
        value: openSources.has(path) ? openSources.get(path) : await workspacePointer.readFile(path),
      });
    } else if (/\.svg$/i.test(path)) {
      const svg = await workspacePointer.readFile(path);
      const name = basename(path).replace(/\.svg$/i, "");
      assets[path] = svg;
      if (!(name in assets)) assets[name] = svg;
    }
  }
  return { files, assets };
}

async function runWorkspaceFile(path) {
  if (!pointer) throw new Error("先にワークスペースを開いてください。");
  const workspacePointer = pointer;
  const openSources = new Map(tabs.map((tab) => [tab.path, tab.model.getValue()]));
  const executionTab = createExecutionTab(path);
  try {
    const [{ files, assets }, engineResponse, uiResponse] = await Promise.all([
      readWorkspaceRunFiles("", [], {}, workspacePointer, openSources),
      fetch(new URL("../engine.js", location.href)),
      fetch(new URL("../ui-objects.js", location.href)),
    ]);
    if (!executionTabs.includes(executionTab)) return;
    if (!engineResponse.ok) throw new Error(`engine.jsを読み込めません: HTTP ${engineResponse.status}`);
    if (!uiResponse.ok) throw new Error(`ui-objects.jsを読み込めません: HTTP ${uiResponse.status}`);
    const documentText = buildRunnerDocument({
      entryPath: path,
      files,
      engineSource: await engineResponse.text(),
      uiSource: await uiResponse.text(),
      assets,
      token: executionTab.token,
    });
    executionTab.iframe.srcdoc = documentText;
    setExecutionState(executionTab, "実行中");
  } catch (error) {
    if (!executionTabs.includes(executionTab)) return;
    setExecutionState(executionTab, `実行できません: ${errorMessage(error)}`, true);
    showError(error);
  }
}

async function importStudioProject(path, destination) {
  if (!pointer) throw new Error("先にワークスペースを開いてください。");
  const openTab = getTab(path);
  const source = openTab ? openTab.model.getValue() : await pointer.readFile(path);
  const { folderPath, project: normalized } = await writeStudioProjectJson(pointer, destination, source);

  for (const folder of normalized.folders) {
    const segments = folder.split("/");
    for (let index = 0; index < segments.length; index += 1) {
      expandedFolders.add(`${folderPath}/${segments.slice(0, index + 1).join("/")}`);
    }
  }
  expandedFolders.add(folderPath);
  expandedFolders.add(destination);
  await renderTree();
  const activeFilePath = `${folderPath}/${normalized.activeFile}`;
  await openFile(activeFilePath);
  notify(`Studioプロジェクト「${normalized.title}」を「${folderPath}」へ読み込みました。`);
}

function activeContextDestination() {
  if (!contextTarget) return selectedDirectory();
  return contextTarget.kind === "directory"
    ? contextTarget.path
    : parentPath(contextTarget.path);
}

function moveContextMenuFocus(event) {
  const items = [...ui.contextMenu.querySelectorAll("button:not(:disabled)")];
  if (!items.length) return;
  const currentIndex = items.indexOf(document.activeElement);
  let nextIndex = currentIndex;
  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
  else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = items.length - 1;
  else return;
  event.preventDefault();
  items[nextIndex].focus();
}

function setSelected(path, kind) {
  selectedPath = path;
  selectedKind = kind;
  selectedEntries = new Map(path ? [[treeEntryKey(path, kind), { path, kind }]] : []);
  selectionAnchorPath = path ? treeEntryKey(path, kind) : "";
  renderTreeSelection();
}

function getSelectedEntries() {
  return orderedSelectedEntries(
    [...ui.fileTree.querySelectorAll(".tree-row")],
    selectedEntries,
  );
}

function selectTreeEntry(path, kind, event) {
  const next = updateTreeSelection(
    [...ui.fileTree.querySelectorAll(".tree-row")],
    selectedEntries,
    selectionAnchorPath,
    path,
    kind,
    {
      shift: event.shiftKey,
      additive: event.ctrlKey || event.metaKey,
    },
  );
  selectedEntries = next.entries;
  selectedPath = next.path;
  selectedKind = next.kind;
  selectionAnchorPath = next.anchorPath;
  renderTreeSelection();
}

async function renderDirectory(container, directoryPath = "", depth = 0) {
  const entries = await pointer.listDirectory(directoryPath);
  for (const entry of entries) {
    if (!directoryPath && entry.kind === "directory" && entry.name === SETTINGS_DIRECTORY) {
      continue;
    }
    const path = directoryPath ? `${directoryPath}/${entry.name}` : entry.name;
    const isDirectory = entry.kind === "directory";
    const item = document.createElement("li");
    item.className = "tree-item";
    item.setAttribute("role", "none");

    const row = document.createElement("div");
    row.className = "tree-row";
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", String(depth + 1));
    if (isDirectory) {
      row.setAttribute("aria-expanded", String(expandedFolders.has(path)));
    }
    row.style.setProperty("--depth", depth);
    row.dataset.path = path;
    row.dataset.kind = entry.kind;
    row.tabIndex = 0;
    row.draggable = true;

    const chevron = document.createElement("span");
    chevron.className = "tree-chevron";
    chevron.textContent = isDirectory ? (expandedFolders.has(path) ? "⌄" : "›") : "";
    const icon = isDirectory
      ? document.createElement("span")
      : createFileIcon(entry.name);
    if (isDirectory) {
      icon.className = "tree-icon";
      icon.textContent = expandedFolders.has(path) ? "▾" : "▸";
    }
    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = entry.name;
    row.append(chevron, icon, label);

    row.addEventListener("click", (event) => {
      const modifiedSelection = event.ctrlKey || event.metaKey || event.shiftKey;
      if (modifiedSelection) event.preventDefault();
      selectTreeEntry(path, entry.kind, event);
      if (modifiedSelection) return;
      if (isDirectory) {
        if (expandedFolders.has(path)) expandedFolders.delete(path);
        else expandedFolders.add(path);
        renderTree().catch(showError);
      } else {
        openFile(path).catch(showError);
      }
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showContextMenu(event.clientX, event.clientY, { path, kind: entry.kind });
    });
    row.addEventListener("dragstart", (event) => {
      if (event.target.closest(".tree-row") !== row) return;
      event.stopPropagation();
      if (!selectedEntries.has(treeEntryKey(path, entry.kind))) setSelected(path, entry.kind);
      draggedEntries = getSelectedEntries();
      row.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "application/x-monac-entries",
        JSON.stringify(draggedEntries),
      );
    });
    row.addEventListener("dragend", () => {
      if (!draggedEntries.some((dragged) => dragged.path === path)) return;
      draggedEntries = [];
      clearTreeDropTargets();
    });
    row.addEventListener("dragover", (event) => {
      if (event.target.closest(".tree-row") !== row) return;
      if (!isDirectory || !canDropEntries(draggedEntries, path)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", (event) => {
      if (!row.contains(event.relatedTarget)) row.classList.remove("drop-target");
    });
    row.addEventListener("drop", (event) => {
      if (event.target.closest(".tree-row") !== row) return;
      if (!isDirectory || !draggedEntries.length) return;
      event.preventDefault();
      event.stopPropagation();
      const entriesToMove = draggedEntries;
      draggedEntries = [];
      clearTreeDropTargets();
      moveEntriesTo(entriesToMove, path).catch(showError);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        row.click();
      }
    });
    item.append(row);

    if (isDirectory && expandedFolders.has(path)) {
      const children = document.createElement("ul");
      children.className = "tree-children";
      children.setAttribute("role", "group");
      await renderDirectory(children, path, depth + 1);
      item.append(children);
    }
    container.append(item);
  }
}

async function renderTree() {
  if (!pointer) return;
  const tree = document.createElement("ul");
  tree.className = "file-tree";
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-multiselectable", "true");
  await renderDirectory(tree);
  ui.fileTree.replaceWith(tree);
  tree.id = "file-tree";
  ui.fileTree = tree;
  ui.treePlaceholder.textContent = tree.childElementCount > 0
    ? "フォルダーを開いてファイルを表示"
    : "このフォルダーには項目がありません";
  ui.treePlaceholder.hidden = tree.childElementCount > 0;
  renderTreeSelection();
}

function clearTreeDropTargets() {
  for (const target of document.querySelectorAll(".drop-target")) {
    target.classList.remove("drop-target");
  }
  for (const row of document.querySelectorAll(".tree-row.dragging")) {
    row.classList.remove("dragging");
  }
  ui.rootLabel.classList.remove("dragging");
}

function canDropEntries(entries, targetPath) {
  return canDropTreeEntries(entries, targetPath);
}

function selectedDirectory() {
  const selectionKey = treeEntryKey(selectedPath, selectedKind);
  const path = selectedEntries.has(selectionKey)
    ? selectedPath
    : [...selectedEntries.values()].at(-1)?.path || "";
  const kind = selectedEntries.get(selectionKey)?.kind;
  if (kind === "directory") return path;
  return path ? parentPath(path) : "";
}

function setClipboard(entries, cut) {
  if (!entries.length) return;
  clipboard = { entries: entries.map((entry) => ({ ...entry })), cut };
  ui.pasteEntry.disabled = false;
  renderTreeSelection();
  notify(`${entries.length} 個の項目を${cut ? "切り取り" : "コピー"}ました。`);
}

function pathMatchesEntry(path, entryPath, kind, pathKind) {
  if (path === entryPath) return !pathKind || pathKind === kind;
  return kind === "directory" && path.startsWith(`${entryPath}/`);
}

async function moveEntriesTo(entries, destination) {
  if (!pointer || !entries.length) return false;
  const moving = entries.filter((entry) => parentPath(entry.path) !== destination);
  if (!moving.length) {
    notify("同じフォルダー内なので移動しませんでした。");
    return false;
  }
  if (!canDropEntries(moving, destination)) {
    throw new TypeError("フォルダーを自分自身またはその中へ移動できません。");
  }

  const destinationEntries = await pointer.listDirectory(destination);
  const destinationNames = new Set(destinationEntries.map((entry) =>
    `${entry.kind}:${entry.name.toLowerCase()}`
  ));
  for (const entry of moving) {
    const name = `${entry.kind}:${basename(entry.path).toLowerCase()}`;
    if (destinationNames.has(name)) {
      throw new Error(`移動先に「${basename(entry.path)}」がすでに存在します。`);
    }
    destinationNames.add(name);
  }

  const affectedTabs = tabs.filter((tab) =>
    moving.some((entry) => pathMatchesEntry(tab.path, entry.path, entry.kind, "file"))
  );
  if (affectedTabs.some(isDirty)) {
    if (!window.confirm("移動するファイルに未保存の変更があります。保存してから移動しますか？")) return false;
    for (const tab of affectedTabs.filter(isDirty)) await saveTab(tab, true);
  }

  const movedEntries = [];
  try {
    for (const entry of moving) {
      const moved = await pointer.moveEntry(entry.path, destination, entry.kind);
      if (!moved) continue;
      const targetPath = destination
        ? `${destination}/${basename(entry.path)}`
        : basename(entry.path);
      remapEntryPaths(entry.path, targetPath, entry.kind);
      movedEntries.push({ path: targetPath, kind: entry.kind });
    }
  } finally {
    if (movedEntries.length && clipboard?.cut) {
      clipboard.entries = clipboard.entries.filter((copied) =>
        !movedEntries.some((entry) =>
          pathMatchesEntry(copied.path, entry.path, entry.kind, copied.kind)
        )
      );
      if (!clipboard.entries.length) {
        clipboard = null;
        ui.pasteEntry.disabled = true;
      }
    }
    if (movedEntries.length) expandPath(destination);
    await renderTree();
    renderTabs();
  }
  return movedEntries.length > 0;
}

function remapEntryPaths(sourcePath, targetPath, kind) {
  const remap = (path, pathKind) => pathMatchesEntry(path, sourcePath, kind, pathKind)
    ? `${targetPath}${path.slice(sourcePath.length)}`
    : path;
  tabs = tabs.map((tab) => ({ ...tab, path: remap(tab.path, "file") }));
  expandedFolders = new Set([...expandedFolders].map((path) => remap(path, "directory")));
  selectedPath = remap(selectedPath, selectedKind);
  activePath = remap(activePath, "file");
  fileDetailsPath = remap(fileDetailsPath, "file");
  selectedEntries = new Map([...selectedEntries.values()].map((entry) => {
    const path = remap(entry.path, entry.kind);
    const next = { path, kind: entry.kind };
    return [treeEntryKey(path, entry.kind), next];
  }));
  if (selectionAnchorPath) {
    const separator = selectionAnchorPath.indexOf("\0");
    const anchorKind = selectionAnchorPath.slice(0, separator);
    const anchorEntryPath = selectionAnchorPath.slice(separator + 1);
    selectionAnchorPath = treeEntryKey(remap(anchorEntryPath, anchorKind), anchorKind);
  }
  if (clipboard) {
    clipboard.entries = clipboard.entries.map((entry) => ({
      path: remap(entry.path, entry.kind),
      kind: entry.kind,
    }));
  }
  if (activePath) ui.statusPath.textContent = activePath;
  else if (fileDetailsPath) {
    ui.fileDetailsTitle.textContent = basename(fileDetailsPath);
    ui.statusPath.textContent = fileDetailsPath;
  }
}

async function copyTargetName(directory, name, kind) {
  const entries = await pointer.listDirectory(directory);
  return availableCopyName(name, kind, entries);
}

async function pasteEntry(destinationOverride) {
  if (!pointer || !clipboard) return;
  const destination = destinationOverride ?? selectedDirectory();
  const { entries, cut } = clipboard;
  try {
    if (cut) {
      const moved = await moveEntriesTo(entries, destination);
      if (!moved) return;
      clipboard = null;
      ui.pasteEntry.disabled = true;
      await renderTree();
      renderTabs();
      return;
    }

    let copiedCount = 0;
    const errors = [];
    for (const entry of entries) {
      try {
        const name = await copyTargetName(destination, basename(entry.path), entry.kind);
        await pointer.copyEntry(entry.path, destination, name, entry.kind);
        copiedCount += 1;
        clipboard.entries = clipboard.entries.filter((copied) =>
          copied.path !== entry.path || copied.kind !== entry.kind
        );
      } catch (error) {
        errors.push(error);
      }
    }

    if (!clipboard.entries.length) {
      clipboard = null;
      ui.pasteEntry.disabled = true;
    }
    await renderTree();
    renderTabs();
    if (errors.length) {
      throw new AggregateError(errors, `${errors.length} 個の項目をコピーできませんでした。`);
    }
    if (copiedCount) notify(`${copiedCount} 個の項目をコピーしました。`);
  } catch (error) {
    showError(error);
  }
}

function promptForName(message, initial = "") {
  const input = window.prompt(message, initial);
  if (input === null) return null;
  const name = input.trim();
  if (!name || name === "." || name === ".." || /[/\\\0]/.test(name)) {
    throw new TypeError("名前には空白やパス区切り文字を使えません。");
  }
  return name;
}

async function assertNameAvailable(directory, name, kind) {
  const entries = await pointer.listDirectory(directory);
  if (entries.some((entry) =>
    entry.kind === kind && entry.name.toLowerCase() === name.toLowerCase()
  )) {
    throw new Error(`「${name}」はすでに存在します。`);
  }
}

async function createEntry(kind, destinationOverride) {
  if (!pointer) return;
  try {
    const directory = destinationOverride ?? selectedDirectory();
    const name = await promptForName(kind === "file" ? "新しいファイル名" : "新しいフォルダー名");
    if (!name) return;
    await assertNameAvailable(directory, name, kind);
    if (kind === "file") {
      await pointer.createFile(directory, name);
      const path = directory ? `${directory}/${name}` : name;
      expandPath(directory);
      await renderTree();
      await openFile(path);
    } else {
      await pointer.createFolder(directory, name);
      expandPath(directory ? `${directory}/${name}` : name);
      await renderTree();
    }
  } catch (error) {
    showError(error);
  }
}

function expandPath(path) {
  let currentPath = "";
  for (const segment of path.split("/").filter(Boolean)) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    expandedFolders.add(currentPath);
  }
}

async function renameEntries(entries) {
  if (!entries.length) return;
  try {
    const name = await promptForName("新しい名前", basename(entries[0].path));
    if (!name) return;
    const targetNames = batchRenameNames(name, entries.length);
    const plans = entries.map((entry, index) => {
      const targetName = targetNames[index];
      const directory = parentPath(entry.path);
      return {
        ...entry,
        directory,
        originalPath: entry.path,
        targetName,
        targetPath: directory ? `${directory}/${targetName}` : targetName,
      };
    });
    const selectedPaths = new Set(entries.map((entry) => `${entry.kind}:${entry.path}`));
    const reservedNames = new Map();
    for (const plan of plans) {
      const key = plan.directory;
      if (!reservedNames.has(key)) reservedNames.set(key, new Set());
      const names = reservedNames.get(key);
      const normalizedName = plan.targetName.toLowerCase();
      const nameKey = `${plan.kind}:${normalizedName}`;
      if (names.has(nameKey)) throw new Error(`「${plan.targetName}」が重複しています。`);
      names.add(nameKey);

      const siblings = await pointer.listDirectory(plan.directory);
      if (siblings.some((sibling) =>
        sibling.kind === plan.kind &&
        sibling.name.toLowerCase() === normalizedName &&
        !selectedPaths.has(
          `${sibling.kind}:${plan.directory ? `${plan.directory}/` : ""}${sibling.name}`,
        )
      )) {
        throw new Error(`「${plan.targetName}」はすでに存在します。`);
      }
    }

    const temporaryNames = new Map();
    for (const [index, plan] of plans.entries()) {
      const key = plan.directory;
      const siblings = await pointer.listDirectory(plan.directory);
      const existingNames = new Set(siblings
        .filter((sibling) => sibling.kind === plan.kind)
        .map((sibling) => sibling.name.toLowerCase()));
      const targets = reservedNames.get(key);
      let sequence = 0;
      let temporaryName = `.monac-rename-${Date.now()}-${index}`;
      while (
        existingNames.has(temporaryName.toLowerCase()) ||
        targets.has(`${plan.kind}:${temporaryName.toLowerCase()}`) ||
        temporaryNames.has(`${key}/${temporaryName.toLowerCase()}`)
      ) {
        sequence += 1;
        temporaryName = `.monac-rename-${Date.now()}-${index}-${sequence}`;
      }
      temporaryNames.set(`${key}/${temporaryName.toLowerCase()}`, true);
      plan.temporaryPath = plan.directory
        ? `${plan.directory}/${temporaryName}`
        : temporaryName;
    }

    try {
      for (const plan of plans) {
        if (plan.originalPath === plan.targetPath) {
          plan.temporaryPath = plan.originalPath;
          continue;
        }
        if (plan.kind === "directory") {
          await pointer.renameFolder(plan.originalPath, basename(plan.temporaryPath));
        } else {
          await pointer.renameFile(plan.originalPath, basename(plan.temporaryPath));
        }
        remapEntryPaths(plan.originalPath, plan.temporaryPath, plan.kind);
      }
      for (const plan of plans) {
        if (plan.temporaryPath === plan.targetPath) continue;
        if (plan.kind === "directory") {
          await pointer.renameFolder(plan.temporaryPath, plan.targetName);
        } else {
          await pointer.renameFile(plan.temporaryPath, plan.targetName);
        }
        remapEntryPaths(plan.temporaryPath, plan.targetPath, plan.kind);
      }
    } finally {
      await renderTree();
      renderTabs();
    }
  } catch (error) {
    showError(error);
  }
}

async function deleteEntries(entries) {
  if (!entries.length) return;
  const affectedTabs = tabs.filter((tab) =>
    entries.some((entry) => pathMatchesEntry(tab.path, entry.path, entry.kind, "file"))
  );
  const activePathBeforeDelete = activePath;
  const hasUnsaved = affectedTabs.some(isDirty);
  const itemNames = entries.map((entry) => `「${basename(entry.path)}」`).join("、");
  const prompt = hasUnsaved
    ? `未保存の変更を含む${entries.length}個の項目（${itemNames}）を削除しますか？`
    : `${entries.length}個の項目（${itemNames}）を削除しますか？`;
  if (!window.confirm(prompt)) return;

  const deletedEntries = [];
  const errors = [];
  try {
    for (const entry of entries) {
      try {
        if (entry.kind === "directory") {
          await pointer.deleteFolder(entry.path, { confirm: false });
        } else {
          await pointer.deleteFile(entry.path);
        }
        deletedEntries.push(entry);
      } catch (error) {
        errors.push(error);
      }
    }

    for (const tab of affectedTabs) {
      if (!deletedEntries.some((entry) =>
        pathMatchesEntry(tab.path, entry.path, entry.kind, "file")
      )) continue;
      if (activePath === tab.path) activePath = "";
      tab.model.dispose();
      tabs = tabs.filter((item) => item !== tab);
    }
    const removedActiveFile = deletedEntries.some((entry) =>
      pathMatchesEntry(activePathBeforeDelete, entry.path, entry.kind, "file")
    );
    const removedFileDetails = deletedEntries.some((entry) =>
      fileDetailsPath && pathMatchesEntry(fileDetailsPath, entry.path, entry.kind, "file")
    );
    for (const entry of deletedEntries) {
      if (entry.kind === "directory") {
        expandedFolders = new Set([...expandedFolders].filter(
          (folder) => !pathMatchesEntry(folder, entry.path, entry.kind, "directory"),
        ));
      }
    }
    if (!activePath && editor && !activeExecutionTabId && (removedActiveFile || removedFileDetails)) {
      editor.setModel(null);
      clearFileDetails();
      ui.svgModeBar.hidden = true;
      ui.svgWorkbench.hidden = true;
      ui.editor.classList.remove("svg-text-mode");
      ui.editor.hidden = false;
      ui.welcome.hidden = false;
      ui.statusPath.textContent = rootName;
      ui.statusLanguage.textContent = "Plain Text";
    }
    selectedEntries = new Map([...selectedEntries].filter(([, selected]) =>
      !deletedEntries.some((entry) =>
        pathMatchesEntry(selected.path, entry.path, entry.kind, selected.kind)
      )
    ));
    if (deletedEntries.some((entry) =>
      pathMatchesEntry(selectedPath, entry.path, entry.kind, selectedKind)
    )) {
      const next = [...selectedEntries.values()].at(-1);
      selectedPath = next?.path ?? "";
      selectedKind = next?.kind ?? "";
      selectionAnchorPath = selectedPath
        ? treeEntryKey(selectedPath, selectedKind)
        : "";
    }
    if (clipboard) {
      clipboard.entries = clipboard.entries.filter((copied) =>
        !deletedEntries.some((entry) =>
          pathMatchesEntry(copied.path, entry.path, entry.kind, copied.kind)
        )
      );
      if (!clipboard.entries.length) {
        clipboard = null;
        ui.pasteEntry.disabled = true;
      }
    }
    await renderTree();
    renderTabs();
    if (errors.length) throw new AggregateError(errors, "一部の項目を削除できませんでした。");
  } catch (error) {
    showError(error);
  }
}

async function refreshTree() {
  try {
    const refreshedDirectoryIndexFiles = await loadWorkspaceSettings(pointer);
    const refreshedCustomIcons = await loadCustomIconUrls(pointer);
    releaseCustomIconUrls();
    directoryIndexFiles = refreshedDirectoryIndexFiles;
    customIconUrls = refreshedCustomIcons;
    await renderTree();
  } catch (error) {
    showError(error);
  }
}

async function openFolder() {
  if (tabs.some(isDirty) && !window.confirm("未保存の変更があります。別のフォルダーを開きますか？")) return;
  try {
    if (pendingWorkspaceHandle) {
      const permission = typeof pendingWorkspaceHandle.requestPermission === "function"
        ? await pendingWorkspaceHandle.requestPermission({ mode: "readwrite" })
        : "denied";
      if (permission === "granted") {
        await openWorkspaceHandle(pendingWorkspaceHandle);
        pendingWorkspaceHandle = null;
        return;
      }
    }
    if (typeof globalThis.showDirectoryPicker !== "function") {
      throw new Error("このブラウザーはフォルダー選択に対応していません。");
    }
    const handle = await globalThis.showDirectoryPicker();
    await openWorkspaceHandle(handle);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      notify("フォルダー選択をキャンセルしました。");
      return;
    }
    showError(error);
  }
}

async function openWorkspaceHandle(handle) {
  const nextPointer = await createPointer(handle);
  const nextDirectoryIndexFiles = await loadWorkspaceSettings(nextPointer);
  const nextCustomIconUrls = await loadCustomIconUrls(nextPointer);
  try {
    await saveLastWorkspaceHandle(handle);
  } catch (error) {
    notify(`前回のフォルダーを記憶できませんでした: ${errorMessage(error)}`, true);
    console.error(error);
  }

  for (const tab of executionTabs) {
    tab.closed = true;
    tab.iframe.srcdoc = "";
    tab.view.remove();
  }
  executionTabs = [];
  activeExecutionTabId = "";
  ui.executionWorkbench.replaceChildren();
  ui.executionWorkbench.hidden = true;
  for (const tab of tabs) tab.model.dispose();
  editor?.setModel(null);
  clearFileDetails();
  releaseCustomIconUrls();
  tabs = [];
  activePath = "";
  ui.svgModeBar.hidden = true;
  ui.svgWorkbench.hidden = true;
  ui.editor.classList.remove("svg-text-mode");
  selectedPath = "";
  selectedKind = "";
  expandedFolders = new Set();
  selectedEntries = new Map();
  selectionAnchorPath = "";
  clipboard = null;
  draggedEntries = [];
  draggedTabPath = "";
  ui.pasteEntry.disabled = true;
  pointer = nextPointer;
  directoryIndexFiles = nextDirectoryIndexFiles;
  customIconUrls = nextCustomIconUrls;
  rootName = nextPointer.name || "選択したフォルダー";
  ui.workspaceName.textContent = rootName;
  ui.rootLabel.textContent = rootName;
  ui.rootLabel.hidden = false;
  ui.welcome.hidden = false;
  ui.editor.hidden = Boolean(startupError);
  ui.error.textContent = startupError;
  ui.error.hidden = !startupError;
  ui.statusPath.textContent = rootName;
  ui.statusLanguage.textContent = "Plain Text";
  ui.newFile.disabled = false;
  ui.newFolder.disabled = false;
  ui.refreshTree.disabled = false;
  await renderTree();
  renderTabs();
}

async function restoreLastWorkspace() {
  try {
    const handle = await loadLastWorkspaceHandle();
    if (!handle) return;
    if (typeof handle.queryPermission !== "function") {
      throw new Error("保存されたフォルダーの権限を確認できません。");
    }
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") {
      await openWorkspaceHandle(handle);
      return;
    }
    pendingWorkspaceHandle = handle;
    notify("前回のフォルダーがあります。「フォルダーを開く」を押すと再接続します。");
  } catch (error) {
    showError(error);
  }
}

function initializeMonaco() {
  if (typeof window.require !== "function") {
    startupError = "Monaco Editorを読み込めません。ネットワーク接続を確認してください。";
    ui.editor.hidden = true;
    ui.error.textContent = startupError;
    ui.error.hidden = false;
    return;
  }
  window.require.config({
    paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" },
  });
  window.require(["vs/editor/editor.main"], () => {
    editor = window.monaco.editor.create(ui.editor, {
      automaticLayout: true,
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 14,
      minimap: { enabled: true },
      readOnly: false,
      scrollBeyondLastLine: false,
      theme: "vs-dark",
      wordWrap: "off",
    });
    try {
      installLinkSupport();
    } catch (error) {
      showError(error);
    }
    ui.editor.hidden = false;
    if (startupError) {
      ui.error.textContent = startupError;
      ui.error.hidden = false;
    }
    restoreLastWorkspace();
  }, (error) => {
    startupError = `Monaco Editorの初期化に失敗しました: ${errorMessage(error)}`;
    ui.editor.hidden = true;
    ui.error.textContent = startupError;
    ui.error.hidden = false;
    console.error(error);
  });
}

ui.openFolder.addEventListener("click", openFolder);
ui.openSettings.addEventListener("click", openSettings);
ui.svgModeBar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-svg-mode]");
  const tab = getTab(activePath);
  if (!button || !tab || !isSvgPath(tab.path)) return;
  tab.svgMode = svgModeForPath(tab.path, button.dataset.svgMode);
  activateTab(tab.path);
});
ui.settingsForm.addEventListener("submit", saveSettings);
$("#cancel-settings").addEventListener("click", () => ui.settingsDialog.close());
$("#reset-settings").addEventListener("click", () => {
  ui.settingsInput.value = DEFAULT_DIRECTORY_INDEX_FILES.join("\n");
});
ui.iconExtension.addEventListener("input", updateIconSettingsPreview);
ui.saveIcon.addEventListener("click", saveCustomIcon);
ui.resetIcon.addEventListener("click", resetCustomIcon);
document.querySelector("[data-open-folder]").addEventListener("click", openFolder);
ui.rootLabel.addEventListener("click", () => setSelected("", "directory"));
ui.rootLabel.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  setSelected("", "directory");
  showContextMenu(event.clientX, event.clientY, { path: "", kind: "directory" });
});
ui.rootLabel.addEventListener("dragover", (event) => {
  if (!canDropEntries(draggedEntries, "")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  ui.rootLabel.classList.add("drop-target");
});
ui.rootLabel.addEventListener("dragleave", (event) => {
  if (!ui.rootLabel.contains(event.relatedTarget)) ui.rootLabel.classList.remove("drop-target");
});
ui.rootLabel.addEventListener("drop", (event) => {
  if (!draggedEntries.length) return;
  event.preventDefault();
  event.stopPropagation();
  const entriesToMove = draggedEntries;
  draggedEntries = [];
  clearTreeDropTargets();
  moveEntriesTo(entriesToMove, "").catch(showError);
});
$(".tree-scroll").addEventListener("contextmenu", (event) => {
  if (!pointer) return;
  if (event.target.closest(".tree-row")) return;
  event.preventDefault();
  setSelected("", "directory");
  showContextMenu(event.clientX, event.clientY, { path: "", kind: "directory" });
});
$(".tree-scroll").addEventListener("dragover", (event) => {
  if (event.target.closest(".tree-row") || !canDropEntries(draggedEntries, "")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});
$(".tree-scroll").addEventListener("drop", (event) => {
  if (event.target.closest(".tree-row") || !draggedEntries.length) return;
  event.preventDefault();
  const entriesToMove = draggedEntries;
  draggedEntries = [];
  moveEntriesTo(entriesToMove, "").catch(showError);
});
ui.newFile.addEventListener("click", () => createEntry("file"));
ui.newFolder.addEventListener("click", () => createEntry("directory"));
ui.refreshTree.addEventListener("click", refreshTree);
ui.pasteEntry.addEventListener("click", pasteEntry);
ui.tabs.addEventListener("dragover", (event) => {
  if (!draggedTabPath || event.target.closest(".tab")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});
ui.tabs.addEventListener("drop", (event) => {
  if (!draggedTabPath || event.target.closest(".tab")) return;
  event.preventDefault();
  reorderTab(draggedTabPath, null);
  draggedTabPath = "";
  clearTabDropTargets();
});
window.addEventListener("message", (event) => {
  const tab = executionTabs.find((item) =>
    item.iframe.contentWindow === event.source &&
    event.data?.source === "monac-game-runner" &&
    event.data.token === item.token
  );
  if (!tab) return;
  if (event.data.type === "log") {
    const level = ["log", "warn", "error"].includes(event.data.payload?.level)
      ? event.data.payload.level
      : "log";
    console[level](`[${tab.path}]`, ...(Array.isArray(event.data.payload?.args) ? event.data.payload.args : []));
  } else if (event.data.type === "error") {
    const message = String(event.data.payload?.message || "ゲームの実行中にエラーが発生しました。");
    setExecutionState(tab, `実行エラー: ${message}`, true);
    console.error(`[${tab.path}] ${message}`);
  }
});
document.addEventListener("pointerdown", (event) => {
  if (!ui.contextMenu.hidden && !ui.contextMenu.contains(event.target)) hideContextMenu();
});
document.addEventListener("click", (event) => {
  if (!ui.contextMenu.hidden && !ui.contextMenu.contains(event.target)) hideContextMenu();
});
document.addEventListener("keydown", (event) => {
  if (!ui.contextMenu.hidden && event.key === "Escape") {
    event.preventDefault();
    hideContextMenu();
    return;
  }
  if (!ui.contextMenu.hidden && (event.ctrlKey || event.metaKey)) {
    const key = event.key.toLowerCase();
    if (key === "v" && clipboard) {
      event.preventDefault();
      const menuDestination = activeContextDestination();
      hideContextMenu();
      pasteEntry(menuDestination);
      return;
    }
    if ((key === "c" || key === "x") && getSelectedEntries().length) {
      event.preventDefault();
      const selected = getSelectedEntries();
      hideContextMenu();
      setClipboard(selected, key === "x");
      return;
    }
  }
  if (!ui.contextMenu.hidden) moveContextMenuFocus(event);
});
document.addEventListener("scroll", hideContextMenu, true);
window.addEventListener("resize", hideContextMenu);
window.addEventListener("blur", hideContextMenu);
ui.saveFile.addEventListener("click", saveActive);
ui.saveAll.addEventListener("click", saveAll);
document.addEventListener("keydown", (event) => {
  const targetIsTree = Boolean(document.activeElement.closest?.(".tree-row"));
  if (ui.contextMenu.hidden && targetIsTree && (event.ctrlKey || event.metaKey)) {
    const key = event.key.toLowerCase();
    if (key === "a") {
      event.preventDefault();
      selectedEntries = new Map([...ui.fileTree.querySelectorAll(".tree-row")].map((row) => {
        const entry = { path: row.dataset.path, kind: row.dataset.kind };
        return [treeEntryKey(entry.path, entry.kind), entry];
      }));
      const lastSelected = [...selectedEntries.values()].at(-1);
      selectedPath = lastSelected?.path ?? "";
      selectedKind = lastSelected?.kind ?? "";
      selectionAnchorPath = selectedPath
        ? treeEntryKey(selectedPath, selectedKind)
        : "";
      renderTreeSelection();
      return;
    }
    if (key === "c" || key === "x") {
      const selected = getSelectedEntries();
      if (!selected.length) return;
      event.preventDefault();
      setClipboard(selected, key === "x");
      return;
    }
    if (key === "v") {
      event.preventDefault();
      pasteEntry();
      return;
    }
  }
  const selected = getSelectedEntries();
  if (targetIsTree && event.key === "F2" && selected.length) {
    event.preventDefault();
    renameEntries(selected);
    return;
  }
  if (targetIsTree && event.key === "Delete" && selected.length) {
    event.preventDefault();
    deleteEntries(selected);
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveActive();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (tabs.some(isDirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});

initializeMonaco();
