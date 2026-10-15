const CATALOG_KEY = "canvas-engine-studio-projects-v2";
const LEGACY_PROJECT_KEY = "canvas-engine-studio-project-v1";
const LAST_PROJECT_KEY = "canvas-engine-studio-last-project-v1";
const PROJECT_KEY_PREFIX = "canvas-engine-studio-project-v2:";
const MAX_REVISIONS = 100;

function clone(value) {
  return structuredClone(value);
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function parseStoredJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label}を読み込めません: ${error.message}`);
  }
}

function readCatalog() {
  const raw = localStorage.getItem(CATALOG_KEY);
  if (raw === null) return null;
  const catalog = parseStoredJson(raw, "プロジェクト一覧");
  if (!Array.isArray(catalog) || catalog.some((item) =>
    !item || typeof item.id !== "string" || typeof item.title !== "string"
  )) {
    throw new Error("プロジェクト一覧の保存データが不正です。");
  }
  return catalog;
}

function projectStorageKey(id) {
  return `${PROJECT_KEY_PREFIX}${encodeURIComponent(id)}`;
}

function readProjectRecord(id) {
  const raw = localStorage.getItem(projectStorageKey(id));
  if (raw === null) throw new Error("プロジェクトが見つかりません。");
  const record = parseStoredJson(raw, "プロジェクト");
  if (!record || !record.project || !Array.isArray(record.history)) {
    throw new Error("プロジェクトの保存データが不正です。");
  }
  return record;
}

function writeProjectRecord(id, record) {
  localStorage.setItem(projectStorageKey(id), JSON.stringify(record));
}

function updateCatalogEntry(id, project) {
  const catalog = getProjectCatalog();
  const existing = catalog.find((item) => item.id === id);
  const metadata = {
    id,
    title: project.title || "Untitled project",
    updatedAt: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, metadata);
  else catalog.push(metadata);
  localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
}

function migrateLegacyProject() {
  const raw = localStorage.getItem(LEGACY_PROJECT_KEY);
  if (raw === null) return [];
  const legacyProject = parseStoredJson(raw, "旧プロジェクト");
  if (!legacyProject || !Array.isArray(legacyProject.files)) {
    throw new Error("旧プロジェクトの保存データが不正です。");
  }
  const id = createId();
  const createdAt = new Date().toISOString();
  const project = { ...legacyProject, title: legacyProject.title || "starter-project" };
  const record = {
    project,
    history: [{
      id: createId(),
      createdAt,
      summary: `移行時点 ${new Date(createdAt).toLocaleString()}`,
      snapshot: clone(project),
    }],
  };
  writeProjectRecord(id, record);
  localStorage.setItem(CATALOG_KEY, JSON.stringify([{
    id,
    title: project.title,
    updatedAt: createdAt,
  }]));
  localStorage.removeItem(LEGACY_PROJECT_KEY);
  return readCatalog();
}

export function getProjectCatalog() {
  return readCatalog() ?? migrateLegacyProject();
}

export function getProject(id) {
  return clone(readProjectRecord(id).project);
}

export function getProjectHistory(id) {
  return clone(readProjectRecord(id).history);
}

export function createProject(title, project) {
  const id = createId();
  const nextProject = { ...clone(project), title: title.trim() || "Untitled project" };
  writeProjectRecord(id, { project: nextProject, history: [] });
  updateCatalogEntry(id, nextProject);
  return id;
}

export function saveProjectDraft(id, project) {
  const record = readProjectRecord(id);
  record.project = clone(project);
  writeProjectRecord(id, record);
  updateCatalogEntry(id, record.project);
}

export function saveProjectRevision(id, project) {
  const record = readProjectRecord(id);
  const snapshot = clone(project);
  const latest = record.history.at(-1);
  if (latest && JSON.stringify(latest.snapshot) === JSON.stringify(snapshot)) {
    return null;
  }
  const createdAt = new Date().toISOString();
  record.project = snapshot;
  record.history.push({
    id: createId(),
    createdAt,
    summary: `保存 ${new Date(createdAt).toLocaleString()}`,
    snapshot: clone(snapshot),
  });
  record.history = record.history.slice(-MAX_REVISIONS);
  writeProjectRecord(id, record);
  updateCatalogEntry(id, record.project);
  return record.history.at(-1);
}

export function restoreProjectRevision(id, revisionId) {
  const record = readProjectRecord(id);
  const revision = record.history.find((item) => item.id === revisionId);
  if (!revision) throw new Error("選択した履歴が見つかりません。");
  const restoredProject = clone(revision.snapshot);
  const createdAt = new Date().toISOString();
  record.project = restoredProject;
  record.history.push({
    id: createId(),
    createdAt,
    summary: `復元 ${new Date(createdAt).toLocaleString()}`,
    snapshot: clone(restoredProject),
  });
  record.history = record.history.slice(-MAX_REVISIONS);
  writeProjectRecord(id, record);
  updateCatalogEntry(id, record.project);
  return clone(restoredProject);
}

export function deleteProject(id) {
  const catalog = getProjectCatalog();
  const filtered = catalog.filter((item) => item.id !== id);
  if (filtered.length === catalog.length) return false;
  localStorage.removeItem(projectStorageKey(id));
  localStorage.setItem(CATALOG_KEY, JSON.stringify(filtered));
  if (localStorage.getItem(LAST_PROJECT_KEY) === id) {
    localStorage.removeItem(LAST_PROJECT_KEY);
  }
  return true;
}

export function getLastProjectId() {
  return localStorage.getItem(LAST_PROJECT_KEY);
}

export function setLastProjectId(id) {
  localStorage.setItem(LAST_PROJECT_KEY, id);
}
