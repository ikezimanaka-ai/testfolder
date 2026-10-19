# Browser filesystem API

`filesystem-api.js` exposes an asynchronous `createPointer()` function for
browsing and editing a folder selected by the user. It uses the browser File
System Access API and does not provide a UI beyond the browser's native folder
picker and folder-deletion confirmation.

```js
import { createPointer } from "./filesystem-api.js";

const pointer = await createPointer(); // Opens the directory picker.
console.log(pointer.name); // Name of the selected folder.
const entries = await pointer.listDirectory(""); // List entries directly inside it.
const text = await pointer.readFile("README.md");
await pointer.writeFile("README.md", `${text}\n`);
const icon = await pointer.getFile("icon.png"); // File: inspect size, type, arrayBuffer(), etc.
await pointer.writeBinaryFile("icon.png", icon);
await pointer.createFolder("", "src");
await pointer.createFolder("src", "components");
await pointer.createFile("src/components", "Button.js");
await pointer.copyEntry("src/components/Button.js", "src", "Button-copy.js");
await pointer.moveEntry("src/Button-copy.js", "src/components");
await pointer.editFile("src/components/Button.js", [
  { start: 0, end: 0, text: "export default function Button() {}\n" },
]);
await pointer.renameFile("src/components/Button.js", "ActionButton.js");
await pointer.deleteFile("src/components/ActionButton.js");
await pointer.deleteFolder("src/components"); // Confirms before recursive deletion.
```

All paths are relative to the selected directory. `listDirectory(path)` returns
direct child entries as `{ name, kind }`, with directories sorted before files
and names sorted within each group. `readFile(path)` and
`writeFile(path, contents)` read and write UTF-8 text; `writeFile` replaces the
existing file and rejects non-string contents.
`getFile(path)` returns the browser `File`, and `writeBinaryFile(path, blob)`
writes a `Blob` as binary, creating the file if it does not exist.
`copyEntry(sourcePath, destinationDirectory, newName)` recursively copies files
or folders, and `moveEntry(sourcePath, destinationDirectory)` moves an entry
without overwriting an existing item (including names that differ only by
letter case). Copying or moving a folder into itself or one of its descendants
is rejected. For `createFile` and `createFolder`, the
first argument is the existing parent directory path; `""`
means the selected directory itself. Parent directories are not created
automatically, so create them from the top down as needed. Rename methods take
the existing relative path and the new basename.

`editFile(path, edits)` reads the current UTF-16 text and applies all edit
operations against that original text. Each operation is `{ start, end, text }`;
`end` is exclusive. Overlapping ranges, repeated insertion offsets, and
out-of-range offsets are rejected. Edits are applied together, so callers
should calculate every offset from the same original file contents.

`deleteFolder(path)` asks for confirmation using the browser's native
`confirm()` dialog, then recursively deletes the folder. It returns `false` if
the user cancels and `true` after deletion. File and folder rename use the
File System Access handle `move()` method; browsers that do not support it
receive an explicit error.

The API requires a secure context and a browser that supports
`showDirectoryPicker()` and the File System Access API. Run the mock-based
tests with:

```sh
node editor/engine/filesystem/filesystem-api.test.mjs
```

The Japanese version is in [README.md](./README.md).
