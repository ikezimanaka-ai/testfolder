function validateEntryName(name) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim() === "." ||
    name.trim() === ".." ||
    name.trim().startsWith(".") ||
    name.includes("..") ||
    /[/\\\0]/.test(name)
  ) {
    throw new TypeError("Studio JSONに安全でないファイル名またはフォルダー名があります。");
  }
  return name.trim();
}

export function normalizeStudioProject(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.files)) {
    throw new TypeError("Studioプロジェクトのfiles配列がありません。");
  }

  const files = [];
  const folders = [];
  const paths = new Set();
  const entryKinds = new Map();
  const walk = (entries, parentPath = "") => {
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        throw new TypeError("Studioプロジェクトに不正な項目があります。");
      }
      const name = validateEntryName(entry.name);
      const path = parentPath ? `${parentPath}/${name}` : name;
      const key = path.toLocaleLowerCase();
      if (paths.has(key)) throw new TypeError(`同じパスが重複しています: ${path}`);
      paths.add(key);

      if (entry.kind === "folder") {
        entryKinds.set(key, "folder");
        folders.push(path);
        if (entry.children !== undefined && !Array.isArray(entry.children)) {
          throw new TypeError(`フォルダー ${path} のchildrenが配列ではありません。`);
        }
        walk(entry.children ?? [], path);
        continue;
      }

      entryKinds.set(key, "file");
      if (entry.kind === "binary") {
        const data = typeof entry.data === "string"
          ? entry.data
          : typeof entry.base64 === "string"
            ? entry.base64
            : "";
        if (!data || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
          throw new TypeError(`バイナリファイル ${path} のBase64データが不正です。`);
        }
        files.push({
          path,
          kind: "binary",
          data,
          mimeType: typeof entry.mimeType === "string" ? entry.mimeType : "application/octet-stream",
        });
        continue;
      }

      if (entry.kind === "folder") continue;
      if (entry.value !== undefined && typeof entry.value !== "string") {
        throw new TypeError(`ファイル ${path} の内容が文字列ではありません。`);
      }
      if (entry.encoding === "base64") {
        if (typeof entry.data !== "string" ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.data)) {
          throw new TypeError(`ファイル ${path} のBase64データが不正です。`);
        }
        files.push({ path, kind: "binary", data: entry.data, mimeType: "application/octet-stream" });
      } else {
        files.push({ path, kind: "text", value: entry.value ?? "" });
      }
    }
  };
  walk(value.files);
  if (!files.length) throw new TypeError("Studioプロジェクトに読み込めるファイルがありません。");

  const assets = value.assets ?? [];
  if (!Array.isArray(assets) || !assets.every((asset) =>
    asset && typeof asset.name === "string" && typeof asset.svg === "string"
  )) {
    throw new TypeError("StudioのSVGアセットが不正です。");
  }
  for (const asset of assets) {
    const name = validateEntryName(asset.name);
    if (entryKinds.has("assets") && entryKinds.get("assets") !== "folder") {
      throw new TypeError("SVGアセットの保存先「assets」がファイルとして使われています。");
    }
    if (!entryKinds.has("assets")) {
      entryKinds.set("assets", "folder");
      folders.push("assets");
    }
    const path = `assets/${name}.svg`;
    const key = path.toLocaleLowerCase();
    if (paths.has(key)) throw new TypeError(`SVGアセットのパスが重複しています: ${path}`);
    paths.add(key);
    files.push({ path, kind: "text", value: asset.svg });
  }

  const requestedActiveFile = typeof value.activeFile === "string"
    ? value.activeFile.replaceAll("\\", "/")
    : "";
  const activeFile = files.some((file) => file.path === requestedActiveFile)
    ? requestedActiveFile
    : files.find((file) => /\.(?:js|mjs)$/i.test(file.path))?.path ?? files[0].path;

  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : "Studio project",
    files,
    folders,
    activeFile,
  };
}

export function parseStudioProjectJson(source) {
  if (typeof source !== "string") throw new TypeError("Studio JSONは文字列で指定してください。");
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`Studio JSONを解析できません: ${error.message}`);
  }
  return normalizeStudioProject(value);
}

export function studioProjectFolderName(title, existingNames) {
  if (typeof title !== "string" || !Array.isArray(existingNames)) {
    throw new TypeError("プロジェクト名と既存名一覧が必要です。");
  }
  const base = title.trim()
    .replace(/[<>:"/\\|?*\0-\x1f]/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .trim() || "Studio project";
  const occupied = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  if (!occupied.has(base.toLocaleLowerCase())) return base;
  let number = 2;
  while (occupied.has(`${base} (${number})`.toLocaleLowerCase())) number += 1;
  return `${base} (${number})`;
}

function base64Blob(data, mimeType) {
  const binary = atob(data);
  return new Blob([
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  ], { type: mimeType });
}

export async function writeStudioProject(pointer, destination, project) {
  const normalized = normalizeStudioProject(project);
  const siblings = await pointer.listDirectory(destination);
  const folderName = studioProjectFolderName(normalized.title, siblings.map((entry) => entry.name));
  const folderPath = destination ? `${destination}/${folderName}` : folderName;
  await pointer.createFolder(destination, folderName);

  try {
    for (const folder of normalized.folders) {
      let parent = folderPath;
      for (const segment of folder.split("/")) {
        await pointer.createFolder(parent, segment);
        parent = `${parent}/${segment}`;
      }
    }
    for (const file of normalized.files) {
      const outputPath = `${folderPath}/${file.path}`;
      const separator = outputPath.lastIndexOf("/");
      const parent = outputPath.slice(0, separator);
      const name = outputPath.slice(separator + 1);
      await pointer.createFile(parent, name);
      if (file.kind === "binary") {
        await pointer.writeBinaryFile(outputPath, base64Blob(file.data, file.mimeType));
      } else {
        await pointer.writeFile(outputPath, file.value);
      }
    }
  } catch (error) {
    try {
      await pointer.deleteFolder(folderPath, { confirm: false });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Studioプロジェクトの読み込みに失敗し、途中フォルダー「${folderPath}」も削除できませんでした。`,
      );
    }
    throw error;
  }

  return { folderPath, project: normalized };
}

export async function writeStudioProjectJson(pointer, destination, source) {
  if (typeof source !== "string") throw new TypeError("Studio JSONは文字列で指定してください。");
  let project;
  try {
    project = JSON.parse(source);
  } catch (error) {
    throw new Error(`Studio JSONを解析できません: ${error.message}`);
  }
  return writeStudioProject(pointer, destination, project);
}
