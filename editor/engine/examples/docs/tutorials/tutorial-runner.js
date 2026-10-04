const ENGINE_URL = new URL("../../../engine.js", import.meta.url).href;
const UI_URL = new URL("../../../ui-objects.js", import.meta.url).href;
const MONACO_VERSION = "0.52.2";
const chapters = ["01-engine", "02-shapes", "03-objects", "04-input-motion", "05-collision", "06-ui", "07-appearance-assets", "08-debug-gameplay"];
const CODE_THEME = "VSCode-2026Dark";
const codeTheme = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6A9955" },
    { token: "keyword", foreground: "569CD6" },
    { token: "string", foreground: "CE9178" },
    { token: "number", foreground: "B5CEA8" },
    { token: "regexp", foreground: "D16969" },
    { token: "type.identifier", foreground: "4EC9B0" },
    { token: "identifier", foreground: "9CDCFE" },
    { token: "delimiter", foreground: "D4D4D4" },
  ],
  colors: {
    "editor.background": "#181818",
    "editor.foreground": "#D4D4D4",
    "editorLineNumber.foreground": "#858585",
    "editorLineNumber.activeForeground": "#C6C6C6",
    "editor.selectionBackground": "#264F78",
    "editorCursor.foreground": "#AEAFAD",
  },
};

function moduleDataUrl(source) {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:text/javascript;base64,${btoa(binary)}`;
}

const tutorialModules = Promise.all([ENGINE_URL, UI_URL].map(async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`モジュールを読み込めません (${response.status}): ${url}`);
  return response.text();
})).then(([engineSource, uiSource]) => ({
  engine: moduleDataUrl(engineSource),
  ui: moduleDataUrl(uiSource.replace(/from\s+(["'])\.\/engine\.js\1/g, 'from "engine"')),
}));

if (typeof window.require === "function") {
  window.require.config({ paths: { vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs` } });
}

function renderText(parent, tag, text, className = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function appendHighlightedCode(target, source) {
  const tokenPattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|static|super|switch|this|throw|true|try|typeof|var|void|while|yield)\b|\b\d+(?:\.\d+)?\b|\b[A-Z][A-Za-z0-9_]*\b)/g;
  let offset = 0;
  for (const match of source.matchAll(tokenPattern)) {
    target.append(document.createTextNode(source.slice(offset, match.index)));
    const token = document.createElement("span");
    const value = match[0];
    token.className = value.startsWith("//") || value.startsWith("/*")
      ? "syntax-comment"
      : /^(["'`])/.test(value) ? "syntax-string"
        : /^\d/.test(value) ? "syntax-number"
          : /^[A-Z]/.test(value) && !/^(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|let|new|null|of|return|static|super|switch|this|throw|true|try|typeof|var|void|while|yield)$/.test(value)
            ? "syntax-type" : "syntax-keyword";
    token.textContent = value;
    target.append(token);
    offset = match.index + value.length;
  }
  target.append(document.createTextNode(source.slice(offset)));
}

function renderCodeSnippet(parent, source) {
  const wrapper = document.createElement(source.includes("\n") ? "div" : "span");
  wrapper.className = `tutorial-code-snippet${source.includes("\n") ? " multiline" : ""}`;
  const code = document.createElement("code");
  code.className = "tutorial-code-content";
  code.dataset.source = source;
  appendHighlightedCode(code, source);
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "tutorial-code-copy";
  copy.textContent = "コピー";
  copy.title = "コードをクリップボードにコピー";
  copy.setAttribute("aria-label", "コードをコピー");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(source);
      copy.textContent = "コピー済み";
      copy.classList.remove("copy-error");
    } catch (error) {
      copy.textContent = "失敗";
      copy.classList.add("copy-error");
      copy.title = `コピーできませんでした: ${error.message}`;
    }
    setTimeout(() => {
      copy.textContent = "コピー";
      copy.title = "コードをクリップボードにコピー";
    }, 1600);
  });
  wrapper.append(code, copy);
  parent.append(wrapper);
  return code;
}

function renderExplanationParagraph(parent, text) {
  const paragraph = document.createElement("p");
  const fragments = text.split(/`([^`]+)`/g);
  for (let index = 0; index < fragments.length; index++) {
    if (index % 2) renderCodeSnippet(paragraph, fragments[index]);
    else paragraph.append(document.createTextNode(fragments[index]));
  }
  parent.append(paragraph);
}

function configureCodeTheme() {
  monaco.editor.defineTheme(CODE_THEME, codeTheme);
  monaco.editor.setTheme(CODE_THEME);
}

async function applyMonacoSyntaxHighlighting() {
  if (typeof window.require !== "function") return;
  window.require(["vs/editor/editor.main"], async () => {
    configureCodeTheme();
    const snippets = document.querySelectorAll(".tutorial-code-content");
    await Promise.all([...snippets].map(async (code) => {
      const source = code.dataset.source;
      try {
        code.innerHTML = await monaco.editor.colorize(source, "javascript", { theme: CODE_THEME });
      } catch (error) {
        console.warn("Could not syntax-highlight a tutorial snippet; using the built-in highlighter.", error);
      }
    }));
  }, (error) => {
    console.warn("Monaco is unavailable; tutorial code snippets use the built-in syntax highlighter.", error);
  });
}

function renderChapter(chapter) {
  document.title = `${chapter.title} | Canvas Engine Studio 実例集`;
  document.querySelector("#chapter-title").textContent = chapter.title;
  document.querySelector("#chapter-summary").textContent = chapter.summary;
  const explanation = document.querySelector("#chapter-explanation");
  for (const paragraph of chapter.explanation) renderExplanationParagraph(explanation, paragraph);
  applyMonacoSyntaxHighlighting();
  const exerciseList = document.createElement("ol");
  for (const exercise of chapter.exercises) renderText(exerciseList, "li", exercise);
  document.querySelector("#chapter-exercises").replaceChildren(exerciseList);
  const chapterIndex = chapters.indexOf(chapter.slug);
  const configureLink = (selector, chapterId, label) => {
    const link = document.querySelector(selector);
    if (chapterId < 0 || chapterId >= chapters.length) {
      link.removeAttribute("href");
      link.textContent = label;
      link.setAttribute("aria-disabled", "true");
      return;
    }
    link.href = `./${chapters[chapterId]}.html`;
    link.textContent = label;
  };
  configureLink("#previous-chapter", chapterIndex - 1, "← 前の章");
  configureLink("#pagination-previous", chapterIndex - 1, "← 前の章");
  configureLink("#next-chapter", chapterIndex + 1, "次の章 →");
  configureLink("#pagination-next", chapterIndex + 1, "次の章 →");
  const examples = document.querySelector("#chapter-examples");
  for (const [index, item] of chapter.examples.entries()) {
    const card = document.createElement("article");
    card.className = "example-card";
    card.dataset.example = String(index);
    const heading = document.createElement("header");
    heading.className = "example-heading";
    renderText(heading, "h3", `${index + 1}. ${item.title}`);
    renderText(heading, "p", item.goal);

    const workbench = document.createElement("div");
    workbench.className = "example-workbench";
    const codeColumn = document.createElement("section");
    codeColumn.className = "code-column";
    const editorContainer = document.createElement("div");
    editorContainer.className = "editor-container";
    editorContainer.setAttribute("aria-label", `${item.title}のコードエディター`);
    const fallback = document.createElement("textarea");
    fallback.className = "code-fallback";
    fallback.spellcheck = false;
    fallback.setAttribute("aria-label", `${item.title}のJavaScriptコード`);
    fallback.value = item.code;
    editorContainer.append(fallback);
    codeColumn.append(editorContainer);

    const controls = document.createElement("div");
    controls.className = "example-controls";
    const run = document.createElement("button");
    run.type = "button";
    run.textContent = "▶ 実行";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "初期コード";
    reset.title = "編集を取り消して初期コードに戻す";
    const status = renderText(controls, "span", "編集内容は自動保存", "example-status");
    controls.prepend(run, reset);
    codeColumn.append(controls);

    const previewColumn = document.createElement("section");
    previewColumn.className = "preview-column";
    renderText(previewColumn, "div", "Canvas プレビュー", "preview-heading");
    const iframe = document.createElement("iframe");
    iframe.className = "example-preview";
    iframe.title = `${item.title}のCanvas実行結果`;
    iframe.setAttribute("sandbox", "allow-scripts");
    previewColumn.append(iframe);
    const runtimeLog = renderText(previewColumn, "pre", "", "runtime-log");
    workbench.append(codeColumn, previewColumn);
    card.append(heading, workbench, renderText(card, "p", item.note, "explanation-note"));
    examples.append(card);

    const storageKey = `engine-tutorial:${chapter.slug}:${index}`;
    let editor = null;
    let execution = 0;
    let saveTimer = 0;
    const savedCode = localStorage.getItem(storageKey);
    if (savedCode !== null) fallback.value = savedCode;
    const readCode = () => editor ? editor.getValue() : fallback.value;
    const writeCode = (source) => {
      if (editor) editor.setValue(source);
      else fallback.value = source;
    };
    const persist = () => {
      try {
        localStorage.setItem(storageKey, readCode());
        status.textContent = "この例を保存しました";
        status.classList.remove("error");
      } catch (error) {
        status.textContent = `保存できません: ${error.message}`;
        status.classList.add("error");
      }
    };
    const scheduleSave = () => {
      status.textContent = "未保存";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 400);
    };
    fallback.addEventListener("input", scheduleSave);
    reset.addEventListener("click", () => {
      writeCode(item.code);
      persist();
      execute();
    });
    run.addEventListener("click", execute);

    async function execute() {
      const current = ++execution;
      runtimeLog.textContent = "";
      runtimeLog.classList.remove("error");
      status.textContent = "実行中…";
      try {
        const modules = await tutorialModules;
        if (current !== execution) return;
        const safeCode = readCode().replace(/<\/script/gi, "<\\/script");
        const bridge = `<script>
          (() => {
            const example = ${JSON.stringify(index)};
            const send = (kind, value) => parent.postMessage({ engineTutorial: ${JSON.stringify(chapter.slug)}, example, execution: ${current}, kind, value: String(value) }, "*");
            for (const level of ["log","info","warn","error"]) {
              const original = console[level].bind(console);
              console[level] = (...args) => { original(...args); send(level, args.map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" ")); };
            }
            addEventListener("error", event => send("error", event.message + (event.lineno ? " (line " + event.lineno + ")" : "")));
            addEventListener("unhandledrejection", event => send("error", String(event.reason?.stack || event.reason)));
          })();
        </script>`;
        const importMap = `<script type="importmap">${JSON.stringify({ imports: { "./engine.js": modules.engine, "./ui-objects.js": modules.ui, engine: modules.engine } })}</script>`;
        iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#020617}canvas{display:block;width:100%;height:100%;outline:none}</style></head><body><canvas id="game" tabindex="0"></canvas>${bridge}${importMap}<script type="module">${safeCode}</script></body></html>`;
        persist();
      } catch (error) {
        status.textContent = "モジュール読み込みエラー";
        status.classList.add("error");
        runtimeLog.textContent = error.message;
        runtimeLog.classList.add("error");
      }
    }

    window.addEventListener("message", (event) => {
      if (event.source !== iframe.contentWindow || event.data?.engineTutorial !== chapter.slug ||
          event.data.example !== index || event.data.execution !== execution) return;
      if (event.data.kind === "error") {
        runtimeLog.classList.add("error");
        status.textContent = "実行時エラー";
        status.classList.add("error");
      }
      runtimeLog.textContent += `${event.data.kind}: ${event.data.value}\n`;
    });

    if (typeof window.require === "function") {
      window.require(["vs/editor/editor.main"], () => {
        if (!editorContainer.isConnected) return;
        configureCodeTheme();
        editor = monaco.editor.create(editorContainer, {
          value: fallback.value,
          language: "javascript",
          theme: CODE_THEME,
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
        });
        fallback.remove();
        editor.onDidChangeModelContent(scheduleSave);
      }, () => {
        status.textContent = "Monacoを読み込めないためテキスト編集を使用中";
      });
    } else {
      status.textContent = "Monacoを読み込めないためテキスト編集を使用中";
    }
    execute();
  }
}

const chapterModule = document.body.dataset.chapter;
try {
  const chapter = await import(`./${chapterModule}.js`);
  renderChapter(chapter.default);
} catch (error) {
  document.querySelector("#chapter-title").textContent = "章を読み込めません";
  document.querySelector("#chapter-explanation").replaceChildren();
  renderText(document.querySelector("#chapter-explanation"), "p", error.message);
}
