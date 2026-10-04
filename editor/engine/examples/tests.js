import { Engine, Display, GameObject } from "../engine.js";
import {
  TextObject, BarObject, ButtonObject, RectObject, CircleObject,
  PolygonObject, SliderObject, TextInputObject, NumberInputObject,
} from "../ui-objects.js";

const canvas = document.querySelector("#test-canvas");
const status = document.querySelector("#status");
let engine;
let display;
let demoObjects = [];

function add(object) {
  demoObjects.push(engine.addObject(display, object));
  return demoObjects.at(-1);
}

function label(text, x, y, options = {}) {
  return add(new TextObject(text, { x, y, fontSize: 18, color: "#cbd5e1", ...options }));
}

function setup() {
  engine?.destroy();
  demoObjects = [];
  engine = new Engine(canvas, 60, 800, 450);
  display = engine.newDisplay(new Display("examples", 800, 450, { background: "#111827" }));
}

function addShapeExamples() {
  label("Canvas Shape Objects", 44, 55);
  add(new RectObject(130, 74, {
    x: 125, y: 145, radius: 14, style: { fill: "#2563eb", stroke: "#93c5fd", "stroke-width": 3 },
  }));
  add(new CircleObject(38, { x: 280, y: 145, fill: "#f472b6" }));
  add(new PolygonObject([[0, -42], [44, 35], [-44, 35]], {
    x: 420, y: 145, style: { fill: "#fbbf24", stroke: "#fef3c7", "stroke-width": 3 },
  }));
  const spinner = add(new CircleObject(20, { x: 560, y: 145, fill: "#34d399", rotation: 20 }));
  spinner.onUpdate = (dt) => { spinner.rotation += 120 * dt; };
  label("GameObject由来の回転・サイズ変更も描画と判定へ反映", 44, 225, { fontSize: 16 });
}

function addControlExamples() {
  label("Canvas SliderObject", 44, 65);
  const slider = add(new SliderObject({
    x: 44, y: 90, width: 300, min: 0, max: 100, step: 5, value: 65,
  }));
  const sliderValue = add(new TextObject("65", { x: 365, y: 109, fontSize: 20, color: "#38bdf8" }));
  slider.onChange = (value) => { sliderValue.text = `音量: ${value}`; };
  label("TextInputObject（Canvas描画、内部入力は視覚的に非表示）", 44, 185, { fontSize: 16 });
  const textInput = add(new TextInputObject({
    x: 44, y: 205, width: 340, value: "", placeholder: "Canvasをクリックして入力",
  }));
  const inputValue = add(new TextObject("", { x: 44, y: 275, fontSize: 17, color: "#cbd5e1" }));
  textInput.onInput = (value) => { inputValue.text = `入力: ${value}`; };
  label("NumberInputObject", 44, 335, { fontSize: 16 });
  const numberInput = add(new NumberInputObject({
    x: 44, y: 355, width: 180, value: "10", min: 0, max: 999,
  }));
  const numberValue = add(new TextObject("数値: 10", { x: 250, y: 382, fontSize: 17, color: "#cbd5e1" }));
  numberInput.onInput = (value) => { numberValue.text = `数値: ${value}`; };
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
  else if (kind === "shapes") addShapeExamples();
  else if (kind === "controls") addControlExamples();
  else {
    addTextExamples();
    addBarExamples();
    addButtonExamples();
  }
  engine.start();
  status.textContent = kind === "controls"
    ? "スライダーはドラッグ、入力欄はクリックして入力できます。入力欄にフォーカス枠は表示されません。"
    : `${kind} の例を表示中。ボタンはマウスを重ねてアニメーションを確認できます。`;
}

for (const button of document.querySelectorAll("[data-example]")) {
  button.addEventListener("click", () => {
    document.querySelector(".example.active")?.classList.remove("active");
    button.classList.add("active");
    showExample(button.dataset.example);
  });
}

showExample("all");
