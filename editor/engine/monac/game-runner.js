function normalizePath(path) {
  if (typeof path !== "string" || !path || path.includes("\0") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    throw new TypeError("実行モジュールのパスが不正です。");
  }
  const parts = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new TypeError("実行モジュールがワークスペースの外を参照しています。");
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function base64DataUrl(source) {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:text/javascript;base64,${btoa(binary)}`;
}

function resolveImport(fromPath, specifier, modulePaths) {
  const parts = fromPath.split("/").slice(0, -1);
  let escapedRoot = false;
  for (const part of specifier.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length) parts.pop();
      else escapedRoot = true;
    } else {
      parts.push(part);
    }
  }
  const resolved = parts.join("/");
  if (modulePaths.has(resolved)) return `workspace/${resolved}`;
  if (/^(?:\.\.\/)*engine\.js$/.test(specifier) || resolved === "engine.js") return "game-engine/engine.js";
  if (/^(?:\.\.\/)*ui-objects\.js$/.test(specifier) || resolved === "ui-objects.js") return "game-engine/ui-objects.js";
  if (escapedRoot) {
    const tail = specifier.split("/").at(-1);
    if (tail === "engine.js") return "game-engine/engine.js";
    if (tail === "ui-objects.js") return "game-engine/ui-objects.js";
  }
  throw new Error(`「${fromPath}」から相対モジュール「${specifier}」を解決できません。`);
}

function rewriteImports(source, fromPath, modulePaths) {
  return source.replace(/(\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])([^"']+)\2/g, (match, prefix, quote, specifier) => {
    if (!specifier.startsWith(".")) return match;
    const moduleId = resolveImport(fromPath, specifier, modulePaths);
    return `${prefix}${quote}${moduleId}${quote}`;
  });
}

function relativeImportSpecifiers(source) {
  return [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])([^"']+)\1/g)]
    .map((match) => match[2])
    .filter((specifier) => specifier.startsWith("."));
}

function safeJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
  })[character]);
}

export function buildRunnerDocument({ entryPath, files, engineSource, uiSource, assets = {}, token }) {
  if (!Array.isArray(files) || typeof engineSource !== "string" || typeof uiSource !== "string") {
    throw new TypeError("実行ファイルとGame Engineモジュールが必要です。");
  }
  if (typeof token !== "string" || !token) throw new TypeError("実行タブの識別子が必要です。");
  const modules = new Map();
  for (const file of files) {
    if (!file || typeof file.path !== "string" || typeof file.value !== "string") {
      throw new TypeError("実行対象に不正なJavaScriptファイルがあります。");
    }
    const path = normalizePath(file.path);
    if (!/\.(?:c?js|mjs)$/i.test(path)) continue;
    if (modules.has(path)) throw new TypeError(`実行モジュールが重複しています: ${path}`);
    modules.set(path, file.value);
  }
  const normalizedEntry = normalizePath(entryPath);
  if (!modules.has(normalizedEntry)) throw new Error(`実行ファイルが見つかりません: ${normalizedEntry}`);
  const modulePaths = new Set(modules.keys());
  const reachablePaths = new Set();
  const pendingPaths = [normalizedEntry];
  while (pendingPaths.length) {
    const path = pendingPaths.pop();
    if (reachablePaths.has(path)) continue;
    const source = modules.get(path);
    if (source === undefined) throw new Error(`実行モジュールが見つかりません: ${path}`);
    reachablePaths.add(path);
    for (const specifier of relativeImportSpecifiers(source)) {
      const moduleId = resolveImport(path, specifier, modulePaths);
      if (moduleId.startsWith("workspace/")) {
        pendingPaths.push(moduleId.slice("workspace/".length));
      }
    }
  }
  const imports = {
    "game-engine/engine.js": base64DataUrl(engineSource),
    "game-engine/ui-objects.js": base64DataUrl(rewriteImports(uiSource, "ui-objects.js", modulePaths)),
  };
  for (const path of reachablePaths) {
    const source = modules.get(path);
    imports[`workspace/${path}`] = base64DataUrl(rewriteImports(source, path, modulePaths));
  }
  const safeAssets = safeJson(assets);
  const safeToken = safeJson(token);
  const entryModule = safeJson(`workspace/${normalizedEntry}`);
  const importMap = safeJson({ imports });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#020617}canvas{display:block;width:100%;height:100%}</style><script type="importmap">${importMap}</script></head><body><canvas id="game" tabindex="0"></canvas><script>(()=>{const token=${safeToken};const send=(type,payload={})=>parent.postMessage({source:"monac-game-runner",token,type,payload},"*");const print=value=>{try{return typeof value==="string"?value:JSON.stringify(value,(_key,item)=>typeof item==="bigint"?String(item)+"n":item)??String(value)}catch{return String(value)}};const sendLog=(level,args)=>send("log",{level,args:args.map(print)});const assets=Object.freeze(${safeAssets});globalThis.GameStudio=Object.freeze({assets,log:(...args)=>sendLog("log",args),warn:(...args)=>sendLog("warn",args),error:(...args)=>sendLog("error",args),assetUrl(name){const svg=assets[name];if(typeof svg!=="string")throw new Error("SVG asset not found: "+name);return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)}});addEventListener("error",event=>send("error",{message:event.message||"Runtime error",line:event.lineno||0}));addEventListener("unhandledrejection",event=>send("error",{message:String(event.reason?.stack||event.reason),line:0}));})();</script><script type="module">import(${entryModule}).catch(error=>parent.postMessage({source:"monac-game-runner",token:${safeToken},type:"error",payload:{message:String(error.stack||error),line:0}},"*"));</script></body></html>`;
}
