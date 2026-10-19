import assert from "node:assert/strict";
import { createPointer } from "./filesystem-api.js";

class MockFileHandle {
  constructor(name, contents = "") {
    this.name = name;
    this.kind = "file";
    this.contents = contents;
  }

  async getFile() {
    const type = this.name.toLowerCase().endsWith(".png") ? "image/png" : "text/plain";
    return new File([this.contents], this.name, { type });
  }

  async createWritable() {
    let nextContents = "";
    return {
      write: async (contents) => {
        nextContents = contents instanceof Blob
          ? contents
          : contents && typeof contents.text === "function"
            ? await contents.text()
            : contents;
      },
      close: async () => {
        this.contents = nextContents;
      },
    };
  }

  async move(newName) {
    this.parent.entries.delete(this.name);
    this.name = newName;
    this.parent.entries.set(newName, this);
  }
}

class MockDirectoryHandle {
  constructor(name = "") {
    this.name = name;
    this.kind = "directory";
    this.entries = new Map();
  }

  async getDirectoryHandle(name, options = {}) {
    let handle = this.entries.get(name);
    if (!handle && options.create) {
      handle = new MockDirectoryHandle(name);
      handle.parent = this;
      this.entries.set(name, handle);
    }
    if (!handle || handle.kind !== "directory") {
      throw new Error(`Directory not found: ${name}`);
    }
    return handle;
  }

  async getFileHandle(name, options = {}) {
    let handle = this.entries.get(name);
    if (!handle && options.create) {
      handle = new MockFileHandle(name);
      handle.parent = this;
      this.entries.set(name, handle);
    }
    if (!handle || handle.kind !== "file") {
      throw new Error(`File not found: ${name}`);
    }
    return handle;
  }

  async removeEntry(name, options = {}) {
    const handle = this.entries.get(name);
    if (!handle) {
      throw new Error(`Entry not found: ${name}`);
    }
    if (handle.kind === "directory" && handle.entries.size && !options.recursive) {
      throw new Error("Directory is not empty.");
    }
    this.entries.delete(name);
  }

  async *values() {
    yield* this.entries.values();
  }

  async move(newName) {
    this.parent.entries.delete(this.name);
    this.name = newName;
    this.parent.entries.set(newName, this);
  }
}

const root = new MockDirectoryHandle();
const pointer = await createPointer(root);
const previousConfirm = globalThis.confirm;
const previousPicker = globalThis.showDirectoryPicker;

try {
  if (previousPicker === undefined) {
    await assert.rejects(createPointer(), /File System Access API/);
  }

  await pointer.createFolder("", "docs");
  await pointer.createFolder("", "assets");
  await pointer.createFolder("docs", "drafts");
  const file = await pointer.createFile("docs/drafts", "notes.txt");
  assert.equal(file.contents, "");
  await pointer.createFile("", "readme.txt");
  assert.deepEqual(await pointer.listDirectory(""), [
    { name: "assets", kind: "directory" },
    { name: "docs", kind: "directory" },
    { name: "readme.txt", kind: "file" },
  ]);
  assert.deepEqual(await pointer.listDirectory("docs/drafts"), [
    { name: "notes.txt", kind: "file" },
  ]);
  assert.equal(await pointer.readFile("docs/drafts/notes.txt"), "");
  const metadataFile = await pointer.getFile("docs/drafts/notes.txt");
  assert.equal(metadataFile.name, "notes.txt");
  assert.equal(metadataFile.size, 0);

  file.contents = "hello world";
  await pointer.editFile("docs/drafts/notes.txt", [
    { start: 0, end: 5, text: "goodbye" },
    { start: 6, end: 11, text: "there" },
  ]);
  assert.equal(file.contents, "goodbye there");
  assert.equal(await pointer.readFile("docs/drafts/notes.txt"), "goodbye there");
  assert.equal((await pointer.createFile("docs/drafts", "notes.txt")).contents, "goodbye there");

  await assert.rejects(
    pointer.editFile("docs/drafts/notes.txt", [
      { start: 0, end: 5, text: "x" },
      { start: 4, end: 8, text: "y" },
    ]),
    RangeError,
  );
  await assert.rejects(pointer.deleteFile("../outside.txt"), TypeError);
  await assert.rejects(pointer.listDirectory("../outside"), TypeError);
  await assert.rejects(pointer.readFile("../outside.txt"), TypeError);
  await assert.rejects(pointer.deleteFile("\\\\outside.txt"), TypeError);
  await assert.rejects(pointer.createFolder("", "../outside"), TypeError);
  await assert.rejects(
    pointer.editFile("docs/drafts/notes.txt", [{ start: 0, end: 99, text: "x" }]),
    TypeError,
  );
  await pointer.writeFile("docs/drafts/notes.txt", "saved");
  assert.equal(file.contents, "saved");
  await assert.rejects(pointer.writeFile("docs/drafts/notes.txt", 123), TypeError);
  const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  await pointer.writeBinaryFile(
    "docs/drafts/custom.png",
    new Blob([pngSignature], { type: "image/png" }),
  );
  const storedPng = await pointer.getFile("docs/drafts/custom.png");
  assert.equal(storedPng.type, "image/png");
  assert.equal(storedPng.size, pngSignature.length);
  assert.deepEqual(
    new Uint8Array(await storedPng.arrayBuffer()),
    pngSignature,
  );
  await assert.rejects(pointer.writeBinaryFile("docs/drafts/invalid.png", "not a Blob"), TypeError);
  await pointer.createFolder("", "copy-destination");
  await pointer.copyEntry("docs", "copy-destination");
  assert.equal(await pointer.readFile("copy-destination/docs/drafts/notes.txt"), "saved");
  await assert.rejects(pointer.copyEntry("docs", "", "DOCS"), /already exists/);
  await assert.rejects(pointer.copyEntry("docs", "docs/drafts"), TypeError);

  await pointer.createFile("", "same-name");
  await pointer.writeFile("same-name", "file contents");
  await pointer.createFolder("", "same-name");
  await pointer.createFile("same-name", "inside.txt");
  const sameNameEntries = (await pointer.listDirectory("")).filter(
    (entry) => entry.name === "same-name",
  );
  assert.deepEqual(sameNameEntries, [
    { name: "same-name", kind: "directory" },
    { name: "same-name", kind: "file" },
  ]);
  assert.equal(await pointer.readFile("same-name"), "file contents");
  assert.equal(await pointer.readFile("same-name/inside.txt"), "");
  await assert.rejects(
    pointer.copyEntry("same-name", "copy-destination"),
    /specify its kind/,
  );
  await pointer.createFolder("", "folder-first");
  await pointer.createFile("", "folder-first");
  assert.deepEqual(
    (await pointer.listDirectory("")).filter((entry) => entry.name === "folder-first"),
    [
      { name: "folder-first", kind: "directory" },
      { name: "folder-first", kind: "file" },
    ],
  );

  await pointer.createFolder("", "copy-file-destination");
  await pointer.createFolder("copy-file-destination", "same-name");
  await pointer.copyEntry("same-name", "copy-file-destination", "same-name", "file");
  assert.equal(
    (await pointer.listDirectory("copy-file-destination")).filter(
      (entry) => entry.name === "same-name",
    ).length,
    2,
  );
  assert.equal(await pointer.readFile("copy-file-destination/same-name"), "file contents");
  assert.deepEqual(
    await pointer.listDirectory("copy-file-destination/same-name"),
    [],
  );

  await pointer.createFolder("", "copy-folder-destination");
  await pointer.createFile("copy-folder-destination", "same-name");
  await pointer.writeFile("copy-folder-destination/same-name", "existing file");
  await pointer.copyEntry("same-name", "copy-folder-destination", "same-name", "directory");
  assert.equal(
    (await pointer.listDirectory("copy-folder-destination")).filter(
      (entry) => entry.name === "same-name",
    ).length,
    2,
  );
  assert.equal(await pointer.readFile("copy-folder-destination/same-name/inside.txt"), "");

  await pointer.renameFile("same-name", "renamed-same");
  await pointer.renameFolder("same-name", "renamed-same");
  assert.deepEqual(
    (await pointer.listDirectory("")).filter((entry) => entry.name === "renamed-same"),
    [
      { name: "renamed-same", kind: "directory" },
      { name: "renamed-same", kind: "file" },
    ],
  );
  await pointer.createFolder("", "move-file-destination");
  await pointer.createFolder("move-file-destination", "renamed-same");
  assert.equal(await pointer.moveEntry("renamed-same", "move-file-destination", "file"), true);
  assert.equal(
    await pointer.readFile("move-file-destination/renamed-same"),
    "file contents",
  );
  await pointer.createFolder("", "move-folder-destination");
  await pointer.createFile("move-folder-destination", "renamed-same");
  await pointer.writeFile("move-folder-destination/renamed-same", "file remains");
  assert.equal(
    await pointer.moveEntry("renamed-same", "move-folder-destination", "directory"),
    true,
  );
  assert.deepEqual(
    (await pointer.listDirectory("move-folder-destination")).filter(
      (entry) => entry.name === "renamed-same",
    ),
    [
      { name: "renamed-same", kind: "directory" },
      { name: "renamed-same", kind: "file" },
    ],
  );
  await pointer.deleteFile("move-file-destination/renamed-same");
  assert.deepEqual(
    (await pointer.listDirectory("move-file-destination")).filter(
      (entry) => entry.name === "renamed-same",
    ),
    [{ name: "renamed-same", kind: "directory" }],
  );

  assert.equal(
    await pointer.moveEntry(
      "copy-destination/docs/drafts/notes.txt",
      "copy-destination/docs/drafts",
    ),
    false,
  );
  await pointer.createFolder("", "archive");
  assert.equal(await pointer.moveEntry("copy-destination/docs", "archive"), true);
  assert.equal(await pointer.readFile("archive/docs/drafts/notes.txt"), "saved");
  await assert.rejects(
    pointer.moveEntry("archive/docs", "archive/docs/drafts"),
    TypeError,
  );

  await pointer.renameFile("docs/drafts/notes.txt", "renamed.txt");
  assert.equal((await pointer.createFile("docs", "placeholder.txt")).name, "placeholder.txt");
  await assert.rejects(pointer.renameFile("docs/drafts/renamed.txt", "bad/name"), TypeError);
  await pointer.renameFolder("docs/drafts", "working");
  assert.equal(root.entries.get("docs").entries.has("working"), true);

  globalThis.confirm = () => false;
  assert.equal(await pointer.deleteFolder("docs"), false);
  assert.equal(root.entries.has("docs"), true);

  globalThis.confirm = () => true;
  assert.equal(await pointer.deleteFolder("docs"), true);
  assert.equal(root.entries.has("docs"), false);
  await pointer.createFolder("", "batch-delete");
  globalThis.confirm = () => {
    throw new Error("batch deletion must use the caller's confirmation");
  };
  assert.equal(await pointer.deleteFolder("batch-delete", { confirm: false }), true);
  assert.equal(root.entries.has("batch-delete"), false);

  await pointer.createFile("", "to-delete.txt");
  await pointer.deleteFile("to-delete.txt");
  assert.equal(root.entries.has("to-delete.txt"), false);

  const pickerRoot = new MockDirectoryHandle("picked");
  globalThis.showDirectoryPicker = async () => pickerRoot;
  const pickedPointer = await createPointer();
  assert.equal(pickedPointer.name, "picked");
  await pickedPointer.createFile("", "picker-check.txt");
  assert.equal(pickerRoot.entries.has("picker-check.txt"), true);
  delete globalThis.showDirectoryPicker;
} finally {
  if (previousConfirm === undefined) {
    delete globalThis.confirm;
  } else {
    globalThis.confirm = previousConfirm;
  }
  if (previousPicker === undefined) {
    delete globalThis.showDirectoryPicker;
  } else {
    globalThis.showDirectoryPicker = previousPicker;
  }
}

console.log("filesystem-api tests passed");
