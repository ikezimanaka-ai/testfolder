import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
  deleteProject,
  getProject,
  getProjectCatalog,
  getProjectHistory,
  restoreProjectRevision,
  saveProjectDraft,
  saveProjectRevision,
} from "./studio-project-store.js";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const project = (title, value) => ({
  title,
  activeFile: "main.js",
  files: [{ name: "main.js", value }],
  assets: [],
});

test.beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

test("migrates the legacy project and creates a baseline revision", () => {
  const legacy = project("legacy-game", "old source");
  localStorage.setItem("canvas-engine-studio-project-v1", JSON.stringify(legacy));

  const [metadata] = getProjectCatalog();
  assert.equal(metadata.title, "legacy-game");
  assert.deepEqual(getProject(metadata.id), legacy);
  assert.equal(getProjectHistory(metadata.id).length, 1);
  assert.equal(localStorage.getItem("canvas-engine-studio-project-v1"), null);
});

test("saves drafts, restores revisions as new history, and caps history at 100", () => {
  const id = createProject("game", project("game", "initial"));
  const first = saveProjectRevision(id, project("game", "first revision"));
  saveProjectDraft(id, project("game", "unsaved draft"));
  assert.equal(getProject(id).files[0].value, "unsaved draft");

  saveProjectRevision(id, project("game", "second revision"));
  const restored = restoreProjectRevision(id, first.id);
  assert.equal(restored.files[0].value, "first revision");
  assert.equal(getProject(id).files[0].value, "first revision");
  assert.equal(getProjectHistory(id).at(-1).summary.startsWith("復元 "), true);

  for (let index = 0; index < 105; index++) {
    saveProjectRevision(id, project("game", `revision ${index}`));
  }
  const history = getProjectHistory(id);
  assert.equal(history.length, 100);
  assert.equal(history.at(-1).snapshot.files[0].value, "revision 104");
});

test("deletes project data and catalog entry", () => {
  const id = createProject("to-delete", project("to-delete", ""));
  assert.equal(deleteProject(id), true);
  assert.deepEqual(getProjectCatalog(), []);
  assert.throws(() => getProject(id), /プロジェクトが見つかりません/);
});
