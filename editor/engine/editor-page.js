const starterCode = `import { Engine, Display, GameObject, INPUT } from "./engine.js";

const shape = document.createElementNS("http://www.w3.org/2000/svg", "circle");
shape.setAttribute("r", 24);

class Player extends GameObject {
  constructor() {
    super({ x: 120, y: 120, tags: ["player"], shapes: [shape] });
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-180 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(180 * dt);
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const display = engine.newDisplay(new Display("world", 640, 360, { background: "#182744" }));
const player = engine.addObject(display, new Player());
player.element.setAttribute("fill", "#62d6ff");
engine.start();`;

const status = document.querySelector("#status");
const preview = document.querySelector("#preview");
let editor;

function run() {
  const code = editor.getValue();
  const encoded = encodeURIComponent(code);
  const engineUrl = new URL("../engine.js", location.href).toString();
  preview.srcdoc = `<!doctype html><html><body style="margin:0"><canvas id="game" style="width:100vw;height:100vh"></canvas>
<script type="importmap">{"imports":{"./engine.js":"${engineUrl}"}}</script>
<script type="module">${code.replace(/<\/script/gi, "<\\\\/script")}</script></body></html>`;
  void encoded;
  status.textContent = " 実行しました";
}

window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
window.require(["vs/editor/editor.main"], () => {
  editor = monaco.editor.create(document.querySelector("#editor"), {
    value: starterCode,
    language: "javascript",
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: false },
  });
  document.querySelector("#run").addEventListener("click", run);
  run();
});
