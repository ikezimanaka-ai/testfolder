export function treeEntryKey(path, kind) {
  return `${kind}\0${path}`;
}

export function canDropTreeEntries(entries, targetPath) {
  return entries.length > 0 && entries.every((entry) =>
    !(entry.kind === "directory" && (
      entry.path === targetPath ||
      targetPath.startsWith(`${entry.path}/`)
    ))
  );
}

export function updateTreeSelection(
  rows,
  selectedEntries,
  anchorPath,
  path,
  kind,
  { shift = false, additive = false } = {},
) {
  const nextEntries = new Map(selectedEntries);
  const key = treeEntryKey(path, kind);
  if (shift) {
    const anchorIndex = rows.findIndex((row) =>
      treeEntryKey(row.dataset.path, row.dataset.kind) === anchorPath
    );
    const targetIndex = rows.findIndex((row) =>
      treeEntryKey(row.dataset.path, row.dataset.kind) === key
    );
    if (anchorIndex >= 0 && targetIndex >= 0) {
      if (!additive) nextEntries.clear();
      for (const row of rows.slice(
        Math.min(anchorIndex, targetIndex),
        Math.max(anchorIndex, targetIndex) + 1,
      )) {
        nextEntries.set(treeEntryKey(row.dataset.path, row.dataset.kind), {
          path: row.dataset.path,
          kind: row.dataset.kind,
        });
      }
      return {
        entries: nextEntries,
        anchorPath,
        path,
        kind,
      };
    }
  }

  if (additive) {
    if (nextEntries.has(key)) nextEntries.delete(key);
    else nextEntries.set(key, { path, kind });
  } else {
    nextEntries.clear();
    nextEntries.set(key, { path, kind });
  }
  return { entries: nextEntries, anchorPath: key, path, kind };
}

export function orderedSelectedEntries(rows, selectedEntries) {
  const ordered = rows
    .filter((row) => selectedEntries.has(treeEntryKey(row.dataset.path, row.dataset.kind)))
    .map((row) => ({ path: row.dataset.path, kind: row.dataset.kind }));
  for (const entry of selectedEntries.values()) {
    if (!ordered.some((selected) =>
      selected.path === entry.path && selected.kind === entry.kind
    )) ordered.push({ ...entry });
  }
  const directories = new Set(ordered
    .filter((entry) => entry.kind === "directory")
    .map((entry) => entry.path));
  return ordered.filter((entry) => {
    let separatorIndex = entry.path.lastIndexOf("/");
    while (separatorIndex >= 0) {
      const ancestorPath = entry.path.slice(0, separatorIndex);
      if (directories.has(ancestorPath)) return false;
      separatorIndex = ancestorPath.lastIndexOf("/");
    }
    return true;
  });
}

export function batchRenameNames(baseName, count) {
  if (typeof baseName !== "string" || !baseName || !Number.isInteger(count) || count < 1) {
    throw new TypeError("A base name and positive item count are required.");
  }
  const dotIndex = baseName.lastIndexOf(".");
  const stem = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
  const extension = dotIndex > 0 ? baseName.slice(dotIndex) : "";
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? baseName : `${stem}${index + 1}${extension}`
  );
}

export function availableCopyName(name, kind, existingNames) {
  if (typeof name !== "string" || !name || !Array.isArray(existingNames)) {
    throw new TypeError("A name and list of existing names are required.");
  }
  const occupied = new Set(existingNames
    .filter((entry) => typeof entry === "string" || entry.kind === kind)
    .map((entry) => (typeof entry === "string" ? entry : entry.name).toLowerCase()));
  if (!occupied.has(name.toLowerCase())) return name;

  const dotIndex = kind === "file" ? name.lastIndexOf(".") : -1;
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex) : "";
  let number = 2;
  let candidate = `${stem}(${number})${extension}`;
  while (occupied.has(candidate.toLowerCase())) {
    number += 1;
    candidate = `${stem}(${number})${extension}`;
  }
  return candidate;
}
