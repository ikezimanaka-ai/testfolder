const isDirectoryHandle = (handle) =>
  handle && typeof handle.getDirectoryHandle === "function";

function normalizeRelativePath(path, { allowEmpty = false } = {}) {
  if (typeof path !== "string") {
    throw new TypeError("Path must be a string.");
  }
  const portablePath = path.replaceAll("\\", "/");
  if (
    path.includes("\0") ||
    portablePath.startsWith("/") ||
    /^[a-zA-Z]:/.test(portablePath)
  ) {
    throw new TypeError("Path must be relative to the selected folder.");
  }

  const segments = portablePath.split("/");
  const normalized = [];
  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      throw new TypeError("Path must not escape the selected folder.");
    }
    normalized.push(segment);
  }

  if (!allowEmpty && normalized.length === 0) {
    throw new TypeError("Path must identify a file or folder.");
  }
  return normalized;
}

function validateName(name) {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new TypeError("Name must be a non-empty single path segment.");
  }
  return name;
}

async function getDirectory(root, segments) {
  let directory = root;
  for (const segment of segments) {
    const entry = await findPhysicalEntry(directory, segment, "directory");
    directory = entry ?? await directory.getDirectoryHandle(segment);
  }
  return directory;
}

async function getParentAndName(root, path) {
  const segments = normalizeRelativePath(path);
  const name = segments.pop();
  return { parent: await getDirectory(root, segments), name };
}

async function getEntry(parent, name, kind) {
  let match = null;
  for await (const entry of parent.values()) {
    if ((!kind || entry.kind === kind) && logicalEntryName(entry) === name) {
      if (match && !kind) {
        throw new TypeError(`Entry "${name}" has both file and folder forms; specify its kind.`);
      }
      match = entry;
    }
  }
  if (match) return match;
  throw new Error(`Entry not found: ${name}`);
}

function parentPathValue(segments) {
  return segments.slice(0, -1).join("/");
}

// Filesystems cannot store a file and directory with the same physical name.
const VIRTUAL_ENTRY_PREFIX = ".__monac_virtual__";

function virtualStorageName(name, kind) {
  const encodedName = Array.from(new TextEncoder().encode(name), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${VIRTUAL_ENTRY_PREFIX}${kind === "directory" ? "d" : "f"}__${encodedName}`;
}

function logicalEntryName(entry) {
  const prefix = entry.kind === "directory"
    ? `${VIRTUAL_ENTRY_PREFIX}d__`
    : `${VIRTUAL_ENTRY_PREFIX}f__`;
  if (!entry.name.startsWith(prefix)) return entry.name;
  const encoded = entry.name.slice(prefix.length);
  if (!/^(?:[0-9a-f]{2})+$/i.test(encoded)) return entry.name;
  const bytes = Uint8Array.from(encoded.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded && decoded !== "." && decoded !== ".." &&
      !decoded.includes("/") && !decoded.includes("\\") && !decoded.includes("\0")
      ? decoded
      : entry.name;
  } catch {
    return entry.name;
  }
}

function logicalEntry(entry) {
  return { name: logicalEntryName(entry), kind: entry.kind };
}

async function findEntry(parent, name, kind) {
  for await (const entry of parent.values()) {
    if (entry.kind === kind && logicalEntryName(entry) === name) return entry;
  }
  return null;
}

async function ensureEntryDoesNotExist(parent, name, kind, excludedEntry = null) {
  for await (const entry of parent.values()) {
    if (
      entry !== excludedEntry &&
      entry.kind === kind &&
      logicalEntryName(entry).toLowerCase() === name.toLowerCase()
    ) {
      throw new Error(`An entry named "${name}" already exists.`);
    }
  }
}

async function storageNameFor(parent, name, kind, excludedEntry = null) {
  await ensureEntryDoesNotExist(parent, name, kind, excludedEntry);
  const otherKind = kind === "file" ? "directory" : "file";
  const oppositeEntry = await findEntry(parent, name, otherKind);
  if (name.startsWith(VIRTUAL_ENTRY_PREFIX) || oppositeEntry) {
    return virtualStorageName(name, kind);
  }
  return name;
}

async function findPhysicalEntry(parent, name, kind) {
  for await (const entry of parent.values()) {
    if (entry.kind === kind && logicalEntryName(entry) === name) return entry;
  }
  return null;
}

async function getFileHandle(parent, name, options = {}) {
  const existing = await findPhysicalEntry(parent, name, "file");
  if (existing) return existing;
  if (!options.create) throw new Error(`File not found: ${name}`);
  const physicalName = await storageNameFor(parent, name, "file");
  return parent.getFileHandle(physicalName, { create: true });
}

function applyEdits(original, edits) {
  if (!Array.isArray(edits)) {
    throw new TypeError("Edits must be an array of { start, end, text } objects.");
  }

  const ordered = edits.map((edit) => {
    if (
      !edit ||
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      typeof edit.text !== "string" ||
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > original.length
    ) {
      throw new TypeError("Each edit must have valid integer offsets and string text.");
    }
    return { start: edit.start, end: edit.end, text: edit.text };
  });

  ordered.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      current.start < previous.end ||
      (current.start === previous.start &&
        (current.start === current.end || previous.start === previous.end))
    ) {
      throw new RangeError("Edits must not overlap or insert at the same offset.");
    }
  }

  let result = original;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const { start, end, text } = ordered[index];
    result = result.slice(0, start) + text + result.slice(end);
  }
  return result;
}

async function writeContents(fileHandle, contents) {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(contents);
    await writable.close();
  } catch (error) {
    if (typeof writable.abort === "function") {
      await writable.abort();
    }
    throw error;
  }
}

async function writeText(fileHandle, contents) {
  await writeContents(fileHandle, contents);
}

async function copyEntryHandle(source, destination, name) {
  if (source.kind === "directory") {
    const target = await destination.getDirectoryHandle(name, { create: true });
    try {
      for await (const child of source.values()) {
        await copyEntryHandle(child, target, child.name);
      }
    } catch (error) {
      await destination.removeEntry(name, { recursive: true });
      throw error;
    }
    return target;
  }

  const target = await destination.getFileHandle(name, { create: true });
  let writable;
  try {
    writable = await target.createWritable();
    await writable.write(await source.getFile());
    await writable.close();
  } catch (error) {
    const errors = [error];
    if (writable && typeof writable.abort === "function") {
      try {
        await writable.abort();
      } catch (abortError) {
        errors.push(abortError);
      }
    }
    try {
      await destination.removeEntry(name);
    } catch (cleanupError) {
      errors.push(cleanupError);
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Could not complete or clean up the copied file.");
    }
    throw error;
  }
  return target;
}

function requireMove(handle) {
  if (typeof handle.move !== "function") {
    throw new Error("This browser does not support renaming File System Access handles.");
  }
}

export async function createPointer(directoryHandle) {
  const root =
    directoryHandle ??
    (typeof globalThis.showDirectoryPicker === "function"
      ? await globalThis.showDirectoryPicker()
      : null);

  if (!isDirectoryHandle(root)) {
    throw new Error("A browser with the File System Access API is required.");
  }

  return Object.freeze({
    name: typeof root.name === "string" ? root.name : "",

    async listDirectory(relativePath = "") {
      const directory = await getDirectory(
        root,
        normalizeRelativePath(relativePath, { allowEmpty: true }),
      );
      const entries = [];
      for await (const handle of directory.values()) {
        entries.push(logicalEntry(handle));
      }
      return entries.sort(
        (left, right) =>
          Number(right.kind === "directory") - Number(left.kind === "directory") ||
          left.name.localeCompare(right.name),
      );
    },

    async readFile(relativePath) {
      const { parent, name } = await getParentAndName(root, relativePath);
      const fileHandle = await getFileHandle(parent, name);
      return (await fileHandle.getFile()).text();
    },

    async getFile(relativePath) {
      const { parent, name } = await getParentAndName(root, relativePath);
      const fileHandle = await getFileHandle(parent, name);
      return fileHandle.getFile();
    },

    async writeFile(relativePath, contents) {
      if (typeof contents !== "string") {
        throw new TypeError("File contents must be a string.");
      }
      const { parent, name } = await getParentAndName(root, relativePath);
      const fileHandle = await getFileHandle(parent, name);
      await writeText(fileHandle, contents);
    },

    async writeBinaryFile(relativePath, contents) {
      if (!(contents instanceof Blob)) {
        throw new TypeError("Binary file contents must be a Blob.");
      }
      const { parent, name } = await getParentAndName(root, relativePath);
      const fileHandle = await getFileHandle(parent, name, { create: true });
      await writeContents(fileHandle, contents);
    },

    async copyEntry(sourcePath, destinationDirectoryPath, newName, sourceKind) {
      const sourceSegments = normalizeRelativePath(sourcePath);
      const destinationSegments = normalizeRelativePath(destinationDirectoryPath, {
        allowEmpty: true,
      });
      const { parent: sourceParent, name: sourceName } = await getParentAndName(
        root,
        sourcePath,
      );
      const source = await getEntry(sourceParent, sourceName, sourceKind);
      const destination = await getDirectory(
        root,
        destinationSegments,
      );
      const sourcePathValue = sourceSegments.join("/");
      const destinationPathValue = destinationSegments.join("/");
      if (
        source.kind === "directory" &&
        (destinationPathValue === sourcePathValue ||
          destinationPathValue.startsWith(`${sourcePathValue}/`))
      ) {
        throw new TypeError("A folder cannot be copied into itself.");
      }
      const targetName = validateName(newName ?? sourceName);
      const targetStorageName = await storageNameFor(destination, targetName, source.kind);
      return copyEntryHandle(source, destination, targetStorageName);
    },

    async moveEntry(sourcePath, destinationDirectoryPath, sourceKind) {
      const sourceSegments = normalizeRelativePath(sourcePath);
      const destinationSegments = normalizeRelativePath(destinationDirectoryPath, {
        allowEmpty: true,
      });
      const sourcePathValue = sourceSegments.join("/");
      const destinationPathValue = destinationSegments.join("/");
      const { parent: sourceParent, name: sourceName } = await getParentAndName(
        root,
        sourcePath,
      );
      const source = await getEntry(sourceParent, sourceName, sourceKind);
      if (destinationPathValue === parentPathValue(sourceSegments)) return false;
      if (
        source.kind === "directory" &&
        (destinationPathValue === sourcePathValue ||
          destinationPathValue.startsWith(`${sourcePathValue}/`))
      ) {
        throw new TypeError("A folder cannot be moved into itself.");
      }

      const destination = await getDirectory(root, destinationSegments);
      const targetStorageName = await storageNameFor(destination, sourceName, source.kind);
      await copyEntryHandle(source, destination, targetStorageName);
      try {
        await sourceParent.removeEntry(source.name, {
          recursive: source.kind === "directory",
        });
      } catch (error) {
        try {
          await destination.removeEntry(targetStorageName, {
            recursive: source.kind === "directory",
          });
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "The entry was copied but could not be moved or rolled back.",
          );
        }
        throw error;
      }
      return true;
    },

    async editFile(relativePath, edits) {
      const { parent, name } = await getParentAndName(root, relativePath);
      const fileHandle = await getFileHandle(parent, name);
      const original = await (await fileHandle.getFile()).text();
      await writeText(fileHandle, applyEdits(original, edits));
    },

    async createFolder(relativePath, folderName) {
      const parent = await getDirectory(
        root,
        normalizeRelativePath(relativePath, { allowEmpty: true }),
      );
      const name = validateName(folderName);
      const existing = await findEntry(parent, name, "directory");
      if (existing) return existing;
      const storageName = await storageNameFor(parent, name, "directory");
      return parent.getDirectoryHandle(storageName, { create: true });
    },

    async createFile(relativePath, filename) {
      const parent = await getDirectory(
        root,
        normalizeRelativePath(relativePath, { allowEmpty: true }),
      );
      const name = validateName(filename);
      const existing = await findEntry(parent, name, "file");
      if (existing) return existing;
      const storageName = await storageNameFor(parent, name, "file");
      const fileHandle = await parent.getFileHandle(storageName, {
        create: true,
      });
      return fileHandle;
    },

    async deleteFile(relativePath) {
      const { parent, name } = await getParentAndName(root, relativePath);
      const file = await findEntry(parent, name, "file");
      if (!file) throw new Error(`File not found: ${name}`);
      await parent.removeEntry(file.name);
    },

    async deleteFolder(relativePath, { confirm = true } = {}) {
      const { parent, name } = await getParentAndName(root, relativePath);
      const folder = await findEntry(parent, name, "directory");
      if (!folder) throw new Error(`Folder not found: ${name}`);
      if (confirm && typeof globalThis.confirm !== "function") {
        throw new Error("A confirmation dialog is required before deleting a folder.");
      }
      if (confirm && !globalThis.confirm(`「${name}」とその中のすべての項目を削除しますか？`)) {
        return false;
      }
      await parent.removeEntry(folder.name, { recursive: true });
      return true;
    },

    async renameFile(relativePath, newName) {
      const { parent, name } = await getParentAndName(root, relativePath);
      const fileHandle = await getFileHandle(parent, name);
      requireMove(fileHandle);
      const targetName = validateName(newName);
      const targetStorageName = await storageNameFor(parent, targetName, "file", fileHandle);
      await fileHandle.move(targetStorageName);
    },

    async renameFolder(relativePath, newName) {
      const { parent, name } = await getParentAndName(root, relativePath);
      const directoryHandle = await findPhysicalEntry(parent, name, "directory");
      if (!directoryHandle) throw new Error(`Folder not found: ${name}`);
      requireMove(directoryHandle);
      const targetName = validateName(newName);
      const targetStorageName = await storageNameFor(parent, targetName, "directory", directoryHandle);
      await directoryHandle.move(targetStorageName);
    },
  });
}
