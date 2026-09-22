import { Engine, Display, GameObject } from "../engine.js";
import { TextObject, BarObject, ButtonObject } from "../ui-objects.js";

const canvas = document.querySelector("#test-canvas");
const status = document.querySelector("#status");
let engine;
let display;
let demoObjects = [];

function svg(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function add(object) {
  demoObjects.push(engine.addObject(display, object));
  return demoObjects.at(-1);
}

function label(text, x, y, options = {}) {
  return add(new TextObject(text, { x, y, fontSize: 18, color: "#cbd5e1", ...options }));
}

function setup() {
  engine?.stop();
  engine?._resizeObserver.disconnect();
  engine?.svg.remove();
  demoObjects = [];
  engine = new Engine(canvas, 60, 800, 450);
  display = engine.newDisplay(new Display("examples", 800, 450, { background: "#111827" }));
}

function addTextExamples() {
  add(new TextObject("TextObject", { x: 44, y: 70, fontSize: 34, color: "#f8fafc", fontFamily: "sans-serif" }));
  label("文字列、色、サイズ、フォント、anchorをプロパティで設定できます", 44, 105, { fontSize: 17 });
  add(new TextObject("中央揃え", { x: 400, y: 165, fontSize: 26, color: "#67e8f9", anchor: "middle" }));
  const clock = add(new TextObject("", { x: 44, y: 420, fontSize: 16, color: "#94a3b8" }));
  clock.onUpdate = (_, currentEngine) => { clock.text = `engine.dt = ${currentEngine.dt.toFixed(3)}s`; };
}

function addBarExamples() {
  label("BarObject / valueを0〜1で指定", 44, 205);
  add(new BarObject({ x: 44, y: 225, width: 330, height: 28, value: .72, fill: "#22c55e" }));
  const animated = add(new BarObject({ x: 44, y: 285, width: 330, height: 28, value: 0, fill: "#38bdf8" }));
  animated.onUpdate = (dt) => { animated.value = (Math.sin(performance.now() / 700) + 1) / 2; };
  add(new BarObject({ x: 44, y: 345, width: 330, height: 28, value: .38, fill: "#f97316", background: "#431407" }));
}

function addButtonExamples(mode = "all") {
  const addButton = (labelText, x, y, options) => {
    const button = add(new ButtonObject(labelText, { x, y, ...options }));
    button.onClick = () => { status.textContent = `クリック: ${labelText}`; };
    return button;
  };
  if (mode === "all" || mode === "button-shadow") {
    label("影あり：hoverで拡大＋上へ移動", 440, 55);
    addButton("Shadow Button", 440, 75, { shadow: true, hoverScale: 1.06, hoverLift: -4 });
  }
  if (mode === "all" || mode === "button-flat") {
    label("影なし：hoverで色変化", 440, 165);
    addButton("Flat Button", 440, 185, { shadow: false, background: "#475569", hoverBackground: "#0ea5e9", hoverScale: 1 });
  }
  if (mode === "all" || mode === "button-press") {
    label("押下：hoverで縮小、押下中は濃色", 440, 275);
    addButton("Press Button", 440, 295, { shadow: true, hoverScale: .97, hoverLift: 1, background: "#7c3aed", hoverBackground: "#8b5cf6", pressedBackground: "#4c1d95" });
  }
}

class BadgeText extends TextObject {
  constructor(text, overrides = {}) {
    super(text, { fontSize: 22, color: "#fef08a", ...overrides });
  }
  onStart() {
    this.text = `★ ${this.text}`;
  }
}

function addInheritedExample() {
  label("TextObjectを継承したBadgeText", 44, 55);
  add(new BadgeText("ユーザー定義の派生Object", { x: 44, y: 105 }));
  label("class BadgeText extends TextObject { ... }", 44, 145, { color: "#facc15" });
}

function showExample(kind) {
  setup();
  if (kind === "text") addTextExamples();
  else if (kind === "bar") addBarExamples();
  else if (kind === "button-shadow" || kind === "button-flat" || kind === "button-press") addButtonExamples(kind);
  else if (kind === "inherit") addInheritedExample();
  else {
    addTextExamples();
    addBarExamples();
    addButtonExamples();
  }
  engine.start();
  status.textContent = `${kind} の例を表示中。ボタンはマウスを重ねてアニメーションを確認できます。`;
}

for (const button of document.querySelectorAll("[data-example]")) {
  button.addEventListener("click", () => {
    document.querySelector(".example.active")?.classList.remove("active");
    button.classList.add("active");
    showExample(button.dataset.example);
  });
}

showExample("all");
