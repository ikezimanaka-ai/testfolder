import assert from "node:assert/strict";
import {
  availableCopyName,
  batchRenameNames,
  canDropTreeEntries,
  orderedSelectedEntries,
  treeEntryKey,
  updateTreeSelection,
} from "./file-tree-selection.js";

const rows = [
  { dataset: { path: "src", kind: "directory" } },
  { dataset: { path: "src/main.js", kind: "file" } },
  { dataset: { path: "README.md", kind: "file" } },
  { dataset: { path: "notes.txt", kind: "file" } },
];

let selection = updateTreeSelection(rows, new Map(), "", "src", "directory");
selection = updateTreeSelection(
  rows,
  selection.entries,
  selection.anchorPath,
  "README.md",
  "file",
  { shift: true },
);
assert.deepEqual([...selection.entries.keys()], [
  treeEntryKey("src", "directory"),
  treeEntryKey("src/main.js", "file"),
  treeEntryKey("README.md", "file"),
]);
assert.deepEqual(orderedSelectedEntries(rows, selection.entries), [
  { path: "src", kind: "directory" },
  { path: "README.md", kind: "file" },
]);

selection = updateTreeSelection(
  rows,
  selection.entries,
  selection.anchorPath,
  "notes.txt",
  "file",
  { additive: true },
);
assert.equal(selection.entries.has(treeEntryKey("notes.txt", "file")), true);
selection = updateTreeSelection(
  rows,
  selection.entries,
  selection.anchorPath,
  "README.md",
  "file",
  { additive: true },
);
assert.equal(selection.entries.has(treeEntryKey("README.md", "file")), false);

const sameNameRows = [
  { dataset: { path: "A", kind: "directory" } },
  { dataset: { path: "A", kind: "file" } },
  { dataset: { path: "B", kind: "file" } },
];
let sameNameSelection = updateTreeSelection(sameNameRows, new Map(), "", "A", "file");
sameNameSelection = updateTreeSelection(
  sameNameRows,
  sameNameSelection.entries,
  sameNameSelection.anchorPath,
  "B",
  "file",
  { shift: true },
);
assert.deepEqual(orderedSelectedEntries(sameNameRows, sameNameSelection.entries), [
  { path: "A", kind: "file" },
  { path: "B", kind: "file" },
]);
sameNameSelection = updateTreeSelection(
  sameNameRows,
  new Map(),
  "",
  "A",
  "directory",
);
sameNameSelection = updateTreeSelection(
  sameNameRows,
  sameNameSelection.entries,
  sameNameSelection.anchorPath,
  "A",
  "file",
  { additive: true },
);
assert.deepEqual(orderedSelectedEntries(sameNameRows, sameNameSelection.entries), [
  { path: "A", kind: "directory" },
  { path: "A", kind: "file" },
]);

assert.deepEqual(batchRenameNames("File.txt", 4), [
  "File.txt",
  "File2.txt",
  "File3.txt",
  "File4.txt",
]);
assert.deepEqual(batchRenameNames("folder", 3), ["folder", "folder2", "folder3"]);
assert.throws(() => batchRenameNames("", 1), TypeError);

assert.equal(canDropTreeEntries([{ path: "folder", kind: "file" }], "folder"), true);
assert.equal(canDropTreeEntries([{ path: "folder", kind: "directory" }], "folder"), false);
assert.equal(canDropTreeEntries([{ path: "folder", kind: "directory" }], "folder/child"), false);

assert.equal(availableCopyName("A.html", "file", [{ name: "index.html", kind: "file" }]), "A.html");
assert.equal(availableCopyName("A.html", "file", [{ name: "A.html", kind: "file" }]), "A(2).html");
assert.equal(
  availableCopyName("A.html", "file", [
    { name: "A.html", kind: "file" },
    { name: "A(2).html", kind: "file" },
  ]),
  "A(3).html",
);
assert.equal(
  availableCopyName("A.html", "file", [{ name: "A.html", kind: "directory" }]),
  "A.html",
);
assert.equal(
  availableCopyName("folder", "directory", [{ name: "folder", kind: "directory" }]),
  "folder(2)",
);

console.log("file-tree-selection tests passed");
