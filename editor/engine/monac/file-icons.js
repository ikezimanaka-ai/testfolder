import setiTheme from "./assets/vs-seti-icon-theme.json" with { type: "json" };

export const setiIconTheme = setiTheme;
const setiExtensionsByLength = Object.keys(setiTheme.fileExtensions)
  .sort((left, right) => right.length - left.length);

const LANGUAGE_ID_BY_EXTENSION = {
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
  jsx: "javascriptreact",
  md: "markdown",
  mjs: "javascript",
  mts: "typescript",
  py: "python",
  scss: "scss",
  sh: "shellscript",
  sql: "sql",
  ts: "typescript",
  tsx: "typescriptreact",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

export function extensionForFileName(name, extraExtensions = []) {
  const basename = name.split(/[\\/]/).pop().toLowerCase();
  const customExtensions = [...new Set(extraExtensions)]
    .map((extension) => extension.toLowerCase().replace(/^\./, ""))
    .sort((left, right) => right.length - left.length);
  const matchingCustomExtension = customExtensions.find((extension) =>
    extension && basename.endsWith(`.${extension}`)
  );
  if (matchingCustomExtension) return matchingCustomExtension;
  for (const extension of setiExtensionsByLength) {
    if (basename.endsWith(`.${extension.toLowerCase()}`)) return extension.toLowerCase();
  }

  const dotIndex = basename.lastIndexOf(".");
  return dotIndex < 0 ? "" : basename.slice(dotIndex + 1);
}

export function resolveFileIcon(name, customExtensions = []) {
  const basename = name.split(/[\\/]/).pop().toLowerCase();
  const extension = extensionForFileName(basename, customExtensions);
  const customExtension = customExtensions.some(
    (item) => item.toLowerCase().replace(/^\./, "") === extension,
  );
  const languageId = LANGUAGE_ID_BY_EXTENSION[extension];
  const iconId = customExtension
    ? null
    : setiTheme.fileNames[basename] ||
      setiTheme.fileExtensions[extension] ||
      setiTheme.languageIds[languageId] ||
      setiTheme.file;

  return {
    extension,
    icon: iconId ? setiTheme.iconDefinitions[iconId] : null,
    custom: customExtension,
  };
}
