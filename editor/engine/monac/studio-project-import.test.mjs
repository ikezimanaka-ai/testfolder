import assert from "node:assert/strict";
import {
  normalizeStudioProject,
  parseStudioProjectJson,
  studioProjectFolderName,
  writeStudioProject,
  writeStudioProjectJson,
} from "./studio-project-import.js";

const project = {
  title: "My Game",
  activeFile: "src/main.js",
  files: [{
    name: "src",
    kind: "folder",
    children: [{
      name: "main.js",
      path: "src/main.js",
      value: 'import "./helper.js";',
    }, {
      name: "helper.js",
      value: "export const value = 1;",
    }],
  }],
  assets: [{ name: "background", svg: "<svg></svg>" }],
};

const normalized = normalizeStudioProject(project);
assert.equal(normalized.title, "My Game");
assert.deepEqual(normalized.folders, ["src", "assets"]);
assert.deepEqual(normalized.files.map(({ path }) => path), [
  "src/main.js",
  "src/helper.js",
  "assets/background.svg",
]);
assert.equal(normalized.files[0].value, 'import "./helper.js";');
assert.equal(parseStudioProjectJson(JSON.stringify(project)).files.length, 3);
assert.equal(studioProjectFolderName("My Game", ["my game"]), "My Game (2)");
assert.equal(studioProjectFolderName("../bad:name", []), "_bad_name");

assert.throws(() => normalizeStudioProject({ files: [{ name: "../escape.js" }] }), /安全でない/);
assert.throws(() => normalizeStudioProject({ files: [
  { name: "Main.js", value: "" },
  { name: "main.js", value: "" },
] }), /重複/);
assert.throws(() => normalizeStudioProject({ files: [{ name: "game.js", kind: "binary", data: "bad" }] }), /Base64/);
assert.throws(() => parseStudioProjectJson("{"), /解析できません/);

class MemoryPointer {
  folders = new Set([""]);
  entries = new Map();

  async listDirectory(path) {
    return [...this.entries.keys()]
      .filter((entryPath) => {
        const separator = entryPath.lastIndexOf("/");
        return (separator < 0 ? "" : entryPath.slice(0, separator)) === path;
      })
      .map((entryPath) => ({
        name: entryPath.slice(entryPath.lastIndexOf("/") + 1),
        kind: this.folders.has(entryPath) ? "directory" : "file",
      }));
  }

  async createFolder(parent, name) {
    const path = parent ? `${parent}/${name}` : name;
    this.folders.add(path);
    this.entries.set(path, null);
  }

  async createFile(parent, name) {
    this.entries.set(`${parent}/${name}`, "");
  }

  async writeFile(path, value) {
    if (this.failWrites) throw new Error("write failed");
    this.entries.set(path, value);
  }

  async writeBinaryFile(path, value) {
    this.entries.set(path, value);
  }

  async deleteFolder(path) {
    this.folders.delete(path);
    for (const key of [...this.entries.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) this.entries.delete(key);
    }
  }
}

const pointer = new MemoryPointer();
pointer.entries.set("My Game", null);
const imported = await writeStudioProject(pointer, "", {
  ...project,
  files: [...project.files, { name: "sprite.png", kind: "binary", data: "AQID", mimeType: "image/png" }],
});
assert.equal(imported.folderPath, "My Game (2)");
assert.equal(pointer.entries.get("My Game (2)/src/main.js"), 'import "./helper.js";');
assert.equal(pointer.entries.get("My Game (2)/assets/background.svg"), "<svg></svg>");
assert.equal(pointer.entries.get("My Game (2)/sprite.png").type, "image/png");
assert.deepEqual(
  [...new Uint8Array(await pointer.entries.get("My Game (2)/sprite.png").arrayBuffer())],
  [1, 2, 3],
);
const importedFromJson = await writeStudioProjectJson(pointer, "", JSON.stringify({
  title: "JSON load",
  files: [{ name: "main.js", value: "" }],
}));
assert.equal(importedFromJson.project.activeFile, "main.js");
assert.equal(pointer.entries.get("JSON load/main.js"), "");

const failingPointer = new MemoryPointer();
failingPointer.failWrites = true;
await assert.rejects(writeStudioProject(failingPointer, "", {
  title: "Failed import",
  files: [{ name: "main.js", value: "source" }],
}), /write failed/);
assert.equal(failingPointer.entries.has("Failed import"), false);

console.log("Monac Studio project import tests passed");
