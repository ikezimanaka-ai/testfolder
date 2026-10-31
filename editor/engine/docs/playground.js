import { Engine, Display, GameObject, ObjectBase, Shapes, INPUT } from "../engine.js";
import {
  ShapeObject, RectObject, CircleObject, EllipseObject, LineObject, PolygonObject,
  TextObject, BarObject, ButtonObject, SliderObject, TextInputObject, NumberInputObject,
  ImageObject, SpriteAnimationObject, CanvasScrollArea,
} from "../ui-objects.js";
import { Scene, SceneEngine, INPUT as SceneInput } from "../scene-engine/engine.js";

let canvas = document.querySelector("#test-canvas");
const stage = document.querySelector("#stage");
const code = document.querySelector("#code");
const status = document.querySelector("#status");
const logPanel = document.querySelector("#log");
const examplesElement = document.querySelector("#examples");
const titleElement = document.querySelector("#selected-title");
const modeElement = document.querySelector("#canvas-mode");
const runButton = document.querySelector("#run");
let selectedSample = null;
let activeEngine = null;
let activeSceneEngine = null;
let activeMode = "objects";
let runGeneration = 0;

const samples = [
  {
    id: "scene-lifecycle", group: "SceneEngine / Scene", title: "シーン登録と切り替え", description: "Sceneのenter/update/exit/render、登録・検索・切り替えを確認。Enterで切り替え。", mode: "scene",
    source: `const title = new Scene("title", {
  data: { count: 0 },
  onEnter(engine) { log("title: enter"); },
  onUpdate(dt, engine, data) {
    data.count += dt;
    if (SceneInput.pressed("Enter")) engine.switchScene("play");
  },
  onExit() { log("title: exit"); },
  onRender(engine) {
    const ctx = engine.ctx;
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, engine.width, engine.height);
    ctx.fillStyle = "#f8fafc"; ctx.font = "bold 38px sans-serif";
    ctx.fillText("TITLE SCENE", 260, 180);
    ctx.font = "18px sans-serif"; ctx.fillText("EnterでPlayへ", 330, 225);
    ctx.fillText("経過: " + this.data.count.toFixed(1) + "秒", 330, 265);
  },
});
sceneEngine.registerScene("title", title);
sceneEngine.registerScene("play", {
  onEnter() { log("play: enter"); },
  onUpdate() { if (SceneInput.pressed("Escape")) sceneEngine.switchScene("title"); },
  onRender(engine) {
    engine.ctx.fillStyle = "#164e63"; engine.ctx.fillRect(0, 0, engine.width, engine.height);
    engine.ctx.fillStyle = "white"; engine.ctx.font = "28px sans-serif";
    engine.ctx.fillText("PLAY — Escapeで戻る", 210, 220);
  },
});
log("hasScene(title):", sceneEngine.hasScene("title"));
log("getScene(title):", sceneEngine.getScene("title").name);
sceneEngine.start("title");` ,
  },
  {
    id: "scene-input", group: "SceneEngine / Scene", title: "SceneEngine 入力・更新・描画", description: "INPUT.onKey/pressed/releasedとupdate、render、stop/startを試す。矢印キーで移動。", mode: "scene",
    source: `let x = 400, y = 225;
sceneEngine.registerScene("input-demo", {
  onUpdate(dt, engine) {
    if (SceneInput.onKey("ArrowLeft")) x -= 180 * dt;
    if (SceneInput.onKey("ArrowRight")) x += 180 * dt;
    if (SceneInput.onKey("ArrowUp")) y -= 180 * dt;
    if (SceneInput.onKey("ArrowDown")) y += 180 * dt;
    if (SceneInput.pressed(" ")) log("pressed Space");
    if (SceneInput.released(" ")) log("released Space");
    if (SceneInput.released("ArrowLeft")) log("released ArrowLeft");
  },
  onRender(engine) {
    engine.ctx.fillStyle = "#111827"; engine.ctx.fillRect(0, 0, engine.width, engine.height);
    engine.ctx.fillStyle = "#38bdf8"; engine.ctx.beginPath(); engine.ctx.arc(x, y, 24, 0, Math.PI * 2); engine.ctx.fill();
    engine.ctx.fillStyle = "white"; engine.ctx.font = "16px sans-serif"; engine.ctx.fillText("矢印キーで移動 / Spaceを押す", 24, 35);
  },
});
sceneEngine.start("input-demo");
log("running:", sceneEngine.running, "fps:", sceneEngine.fps);
// 手動更新: sceneEngine.update(1 / 60)
// 停止/再開: sceneEngine.stop(); sceneEngine.start();` ,
  },
  {
    id: "shapes", group: "図形・GameObject", title: "Shapes / 図形Object", description: "Shapesの各ビルダーとRect/Circle/Ellipse/Line/Polygonを描画。", mode: "objects",
    source: `add(new TextObject("Shapes と UI Shape Objects", { x: 30, y: 38, fontSize: 22, color: "#e2e8f0" }));
add(new RectObject(120, 72, { x: 105, y: 125, radius: 12, style: { fill: "#2563eb", stroke: "#bfdbfe", "stroke-width": 3 } }));
add(new CircleObject(34, { x: 245, y: 125, fill: "#f472b6" }));
add(new EllipseObject(48, 26, { x: 365, y: 125, fill: "#34d399" }));
add(new LineObject(435, 95, 535, 155, { style: { stroke: "#facc15", "stroke-width": 7 } }));
add(new PolygonObject([[0, -38], [42, 32], [-42, 32]], { x: 630, y: 125, style: { fill: "#fb923c", stroke: "#ffedd5", "stroke-width": 2 } }));
const custom = new ShapeObject(Shapes.roundRect(90, 48, 12, { fill: "#8b5cf6" }), { x: 170, y: 260 });
add(custom);
const custom2 = new GameObject({ x: 350, y: 260, shapes: [Shapes.circle(28, { fill: "#22d3ee" })] });
add(custom2);
log("Shapes API:", Object.keys(Shapes).join(", "));` ,
  },
  {
    id: "game-object", group: "図形・GameObject", title: "GameObject 移動・タグ・判定", description: "移動、角度指定、タグ検索、衝突、破棄、privateデータを確認。", mode: "objects",
    source: `const mover = add(new CircleObject(25, { x: 150, y: 170, fill: "#38bdf8", tags: ["player"] }));
const target = add(new RectObject(90, 60, { x: 300, y: 170, style: { fill: "#f97316" }, tags: ["target", "solid"] }));
mover.moveX(30).moveY(20).moveTo(150, 170).move(10, 0).offsetFromAngle(0, 5);
log("move result:", mover.x.toFixed(0), mover.y.toFixed(0));
log("fromAngleDistance:", JSON.stringify(GameObject.fromAngleDistance(90, 20)));
log("hasTag/hasTags:", target.hasTag("target"), target.hasTags(["target", "solid"]));
log("getObject(target):", mover.getObject("target").length);
log("touching/touchTag:", mover.touching("target").length, mover.touchTag("target"));
log("intersects/containsPoint:", mover.intersects(target), target.containsPoint(310, 180));
mover.setPrivate({ score: 3, label: "player" });
log("private:", mover.getPrivate("score"), mover.getPrivate("missing", "fallback"));
const clone = new ObjectBase({ tags: ["alias"] });
log("ObjectBase alias:", clone instanceof GameObject);
// mover.destroy() でオブジェクトを破棄できます。` ,
  },
  {
    id: "display-engine", group: "Engine / Display", title: "Display・Engine・タイマー・デバッグ", description: "Display管理、検索、描画順、タイマー、デバッグ、ポインター座標を確認。", mode: "objects",
    source: `const back = add(new RectObject(140, 100, { x: 200, y: 200, fill: "#1d4ed8", tags: ["box"] }));
const front = add(new CircleObject(34, { x: 200, y: 200, fill: "#facc15", tags: ["badge"] }));
log("engine.getObjects(box):", engine.getObjects("box").length);
log("display.getObjects(badge):", display.getObjects("badge").length);
display.sendToBack(front); display.bringToFront(front);
const second = engine.newDisplay(new Display("overlay", 800, 450, { x: 0, y: 0, background: null }));
const label = engine.addObject(second, new TextObject("second Display", { x: 24, y: 38, fontSize: 18, color: "#fff" }));
log("newDisplay/addObject:", second.id, label.text);
engine.setDebug({ hitboxes: true, displays: true, fps: true });
log("debug:", JSON.stringify(engine.debug));
const timer = engine.createTimer();
setTimeout(() => { log("timer elapsed:", timer.elapsed.toFixed(2)); timer.pause(); timer.reset(); timer.resume(); timer.delete(); log("timer deleted:", timer.deleted); }, 700);
log("pointerToLogical:", JSON.stringify(engine.pointerToLogical({ clientX: 100, clientY: 100 })));
// engine.stop(); engine.start(); engine.render(); engine.resize();` ,
  },
  {
    id: "text", group: "UI Objects", title: "TextObject", description: "文字、複数行、alignment、更新、継承とライフサイクル。", mode: "objects",
    source: `const heading = add(new TextObject("TextObject", { x: 34, y: 70, fontSize: 38, color: "#f8fafc", fontWeight: "bold" }));
add(new TextObject("middle / cyan", { x: 400, y: 155, fontSize: 26, color: "#67e8f9", anchor: "middle" }));
add(new TextObject("右寄せ\\n2行表示", { x: 740, y: 215, fontSize: 23, color: "#fbbf24", anchor: "end" }));
const clock = add(new TextObject("", { x: 34, y: 300, fontSize: 20, color: "#a7f3d0" }));
clock.onUpdate = (dt, currentEngine) => { clock.text = "dt = " + currentEngine.dt.toFixed(3) + " 秒"; };
heading.onStart = () => log("TextObject onStart");
heading.onDestroy = () => log("TextObject onDestroy");
class BadgeText extends TextObject { onStart() { this.text = "★ " + this.text; } }
add(new BadgeText("継承したObject", { x: 34, y: 380, fontSize: 24, color: "#fef08a" }));` ,
  },
  {
    id: "bar", group: "UI Objects", title: "BarObject", description: "value、色、サイズを変えてバーの状態を表示。", mode: "objects",
    source: `add(new TextObject("BarObject / value: 0〜1", { x: 35, y: 70, fontSize: 24, color: "white" }));
add(new BarObject({ x: 40, y: 110, width: 430, height: 32, value: .72, fill: "#22c55e" }));
add(new BarObject({ x: 40, y: 180, width: 430, height: 32, value: .38, fill: "#f97316", background: "#431407", radius: 14 }));
const animated = add(new BarObject({ x: 40, y: 250, width: 430, height: 32, value: 0, fill: "#38bdf8" }));
animated.onUpdate = () => { animated.value = (Math.sin(performance.now() / 700) + 1) / 2; };
log("初期value:", animated.value);` ,
  },
  {
    id: "button", group: "UI Objects", title: "ButtonObject", description: "hover/押下アニメーション、クリックコールバックを操作。", mode: "objects",
    source: `add(new TextObject("Canvas上のボタンを押してください", { x: 32, y: 58, fontSize: 22, color: "white" }));
const button = add(new ButtonObject("Click me", { x: 220, y: 150, width: 220, height: 64, background: "#7c3aed", hoverBackground: "#a78bfa", hoverScale: 1.08, hoverLift: -4 }));
button.onClick = () => log("onClick! button label:", button.label);
add(new ButtonObject("Flat Button", { x: 220, y: 270, shadow: false, background: "#475569", hoverBackground: "#0ea5e9", hoverScale: 1 }));
log("ButtonObject:", button.label, "hoverScale:", button.hoverScale);` ,
  },
  {
    id: "slider", group: "UI Objects", title: "SliderObject", description: "スライダーをドラッグし、onChangeで値を確認。", mode: "objects",
    source: `add(new TextObject("スライダーをドラッグ", { x: 40, y: 70, fontSize: 24, color: "white" }));
const slider = add(new SliderObject({ x: 45, y: 135, width: 460, min: 0, max: 100, step: 5, value: 65 }));
const value = add(new TextObject("65", { x: 535, y: 155, fontSize: 26, color: "#38bdf8" }));
slider.onChange = (next) => { value.text = String(next); log("slider value:", next); };
log("範囲:", slider.min, "〜", slider.max, "step:", slider.step);` ,
  },
  {
    id: "inputs", group: "UI Objects", title: "TextInput / NumberInput", description: "Canvasの入力欄をクリックして文字・数値を入力。", mode: "objects",
    source: `add(new TextObject("Canvas上の入力欄をクリック", { x: 35, y: 60, fontSize: 23, color: "white" }));
const textInput = add(new TextInputObject({ x: 40, y: 100, width: 340, value: "", placeholder: "テキストを入力", label: "名前" }));
const textValue = add(new TextObject("入力: (なし)", { x: 40, y: 175, fontSize: 19, color: "#a5f3fc" }));
textInput.onInput = (value) => { textValue.text = "入力: " + value; };
textInput.onChange = (value) => log("TextInput change:", value);
const numberInput = add(new NumberInputObject({ x: 40, y: 250, width: 220, value: "10", min: 0, max: 999, step: 1, label: "数量" }));
const numberValue = add(new TextObject("数値: 10", { x: 290, y: 278, fontSize: 19, color: "#86efac" }));
numberInput.onInput = (value) => { numberValue.text = "数値: " + value; };
numberInput.onChange = () => log("numberValue:", numberInput.numberValue);
numberInput.numberValue = 42;
numberValue.text = "数値: " + numberInput.numberValue;
log("numberValue getter:", numberInput.numberValue);` ,
  },
  {
    id: "images", group: "UI Objects", title: "Image / SpriteAnimation", description: "SVGデータURL画像を読み込み、画像表示とフレームアニメーションを確認。", mode: "objects",
    source: `const svg = (color, face) => "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="36" fill="' + color + '"/><text x="40" y="51" text-anchor="middle" font-size="34">' + face + '</text></svg>'
);
const a = svg("#38bdf8", "A"), b = svg("#f472b6", "B");
const [loadedImage, loadedSvg] = await Promise.all([engine.loadImage(a), engine.loadSVG(b)]);
log("loadImage / loadSVG:", loadedImage.width, loadedSvg.width);
try {
  const fontUrl = new URL("../monac/assets/seti.woff", location.href).href;
  await engine.loadFont("PlaygroundIcons", fontUrl);
  log("loadFont:", "PlaygroundIcons loaded");
} catch (error) { log("loadFont:", error.message); }
add(new TextObject("ImageObject", { x: 35, y: 55, fontSize: 22, color: "white" }));
add(new ImageObject(a, { x: 80, y: 85, width: 100, height: 100, onLoad: () => log("Image loaded") }));
add(new TextObject("SpriteAnimationObject", { x: 300, y: 55, fontSize: 22, color: "white" }));
const animation = add(new SpriteAnimationObject([a, b], { x: 350, y: 85, width: 110, height: 110, frameDuration: .4, loop: true }));
animation.onLoad = () => log("animation frames:", animation.images.length);
log("frameDuration:", animation.frameDuration, "loop:", animation.loop);` ,
  },
  {
    id: "scroll-area", group: "Canvas utilities", title: "CanvasScrollArea", description: "Canvas領域のクリップ、スクロール、ホイール入力を確認。", mode: "objects",
    source: `const area = new CanvasScrollArea({ x: 70, y: 70, width: 520, height: 300, contentHeight: 650 });
const draw = engine.render.bind(engine);
let offset = 0;
const renderRows = () => {
  area.offset = offset;
  area.draw(engine.ctx, () => {
    for (let i = 0; i < 13; i++) {
      engine.ctx.fillStyle = i % 2 ? "#1e293b" : "#334155";
      engine.ctx.fillRect(area.x + 8, area.y + i * 48, area.width - 20, 38);
      engine.ctx.fillStyle = "white"; engine.ctx.font = "16px sans-serif";
      engine.ctx.fillText("行 " + (i + 1), area.x + 20, area.y + i * 48 + 25);
    }
  });
};
engine.render = () => { draw(); renderRows(); };
const wheel = (event) => {
  const point = engine.pointerToLogical(event);
  if (area.handleWheel(event, point, 1)) { offset = area.offset; engine.render(); }
};
canvas.addEventListener("wheel", wheel, { passive: false });
log("contains:", area.contains({ x: 100, y: 100 }), "maxOffset:", area.maxOffset);
log("scrollBy(80):", area.scrollBy(80), "offset:", area.offset);
offset = 0; engine.render();
// Canvas上でホイールすると内容をスクロールします。` ,
  },
  {
    id: "input-api", group: "Input API", title: "キー・ポインター入力", description: "Engine INPUTのキー状態とポインター状態をCanvas上で確認。", mode: "objects",
    source: `const marker = add(new CircleObject(18, { x: 400, y: 230, fill: "#facc15" }));
const text = add(new TextObject("矢印キー移動 / クリック状態を確認", { x: 30, y: 48, fontSize: 20, color: "white" }));
marker.onUpdate = (dt) => {
  if (INPUT.onKey("ArrowLeft")) marker.x -= 180 * dt;
  if (INPUT.onKey("ArrowRight")) marker.x += 180 * dt;
  if (INPUT.onKey("ArrowUp")) marker.y -= 180 * dt;
  if (INPUT.onKey("ArrowDown")) marker.y += 180 * dt;
  if (INPUT.released("ArrowLeft")) log("released ArrowLeft");
  const p = INPUT.pointer;
  text.text = "key left=" + INPUT.onKey("ArrowLeft") + " pressed=" + INPUT.pressed("ArrowLeft") + " pointer=" + p.x.toFixed(0) + "," + p.y.toFixed(0) + " down=" + INPUT.pointerDown();
  if (INPUT.pointerPressed()) log("pointerPressed", p.x, p.y);
  if (INPUT.pointerReleased()) log("pointerReleased", p.x, p.y);
};
log("INPUT methods:", "onKey / pressed / released / pointerDown / pointerPressed / pointerReleased / endFrame / clear");` ,
  },
  {
    id: "utilities", group: "Canvas utilities", title: "Canvas描画・描画順・destroy", description: "GameObjectの描画フックとオブジェクトの追加・破棄を確認。", mode: "objects",
    source: `const object = add(new GameObject({
  x: 400, y: 225, width: 90, height: 90,
  shapes: [Shapes.circle(42, { fill: "#a78bfa" })],
  tags: ["custom"],
  onUpdate(dt) { this.rotation += 40 * dt; },
  onDraw(ctx) { ctx.fillStyle = "white"; ctx.font = "14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("onDraw", 0, 5); },
  onDestroy() { log("onDestroy called"); },
}));
log("custom count:", engine.getObjects("custom").length);
setTimeout(() => { object.destroy(); engine.render(); log("destroyed:", object._removed); }, 2500);
log("Display start/update/draw and Engine lifecycle run automatically in this playground.");` ,
  },
];

const groups = [...new Set(samples.map((sample) => sample.group))];
for (const group of groups) {
  const heading = document.createElement("h3");
  heading.className = "group-title";
  heading.textContent = group;
  examplesElement.append(heading);
  for (const sample of samples.filter((entry) => entry.group === group)) {
    const button = document.createElement("button");
    button.className = "example";
    button.dataset.sample = sample.id;
    const name = document.createElement("strong");
    name.textContent = sample.title;
    const detail = document.createElement("small");
    detail.textContent = sample.description;
    button.append(name, detail);
    button.addEventListener("click", () => selectSample(sample));
    examplesElement.append(button);
  }
}

function selectSample(sample) {
  selectedSample = sample;
  code.value = sample.source;
  titleElement.textContent = sample.title;
  document.querySelector(".example.active")?.classList.remove("active");
  examplesElement.querySelector(`[data-sample="${sample.id}"]`)?.classList.add("active");
  status.classList.remove("error");
  status.textContent = `${sample.title} のコードを読み込みました。実行してCanvasで確認してください。`;
}

function log(...values) {
  const line = values.map((value) => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === "object" && value !== null) {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
  }).join(" ");
  logPanel.textContent += `${line}\n`;
  logPanel.scrollTop = logPanel.scrollHeight;
}

function teardown() {
  activeEngine?.destroy();
  activeEngine = null;
  activeSceneEngine?.stop();
  activeSceneEngine = null;
  const nextCanvas = canvas.cloneNode(false);
  nextCanvas.width = 800;
  nextCanvas.height = 450;
  canvas.replaceWith(nextCanvas);
  canvas = nextCanvas;
  canvas.width = 800;
  canvas.height = 450;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b1120";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

async function run() {
  if (!selectedSample) return;
  runButton.disabled = true;
  runButton.textContent = "実行中…";
  status.classList.remove("error");
  logPanel.textContent = "";
  try {
    teardown();
    const generation = ++runGeneration;
    activeMode = selectedSample.mode;
    modeElement.textContent = `${activeMode === "scene" ? "SceneEngine" : "Engine + UI Objects"} / 800 × 450`;
    let engine = null;
    let display = null;
    let sceneEngine = null;
    if (activeMode === "scene") {
      sceneEngine = activeSceneEngine = new SceneEngine({ canvas, width: 800, height: 450, background: "#0b1120" });
    } else {
      engine = activeEngine = new Engine(canvas, 60, 800, 450);
      display = engine.newDisplay(new Display("playground", 800, 450, { background: "#0b1120" }));
    }
    const add = (object, overrides = {}) => {
      if (!engine || !display) throw new Error("このサンプルはSceneEngineモードです。");
      return engine.addObject(display, object, overrides);
    };
    const env = {
      engine, display, canvas, sceneEngine, add,
      log: (...values) => { if (generation === runGeneration) log(...values); },
      Engine, Display, GameObject, ObjectBase, Shapes, INPUT,
      Scene, SceneEngine, SceneInput,
      ShapeObject, RectObject, CircleObject, EllipseObject, LineObject, PolygonObject,
      TextObject, BarObject, ButtonObject, SliderObject, TextInputObject, NumberInputObject,
      ImageObject, SpriteAnimationObject, CanvasScrollArea,
    };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const execute = new AsyncFunction("env", `
      const { engine, display, canvas, sceneEngine, add, log,
        Engine, Display, GameObject, ObjectBase, Shapes, INPUT,
        Scene, SceneEngine, SceneInput, ShapeObject, RectObject, CircleObject,
        EllipseObject, LineObject, PolygonObject, TextObject, BarObject,
        ButtonObject, SliderObject, TextInputObject, NumberInputObject,
        ImageObject, SpriteAnimationObject, CanvasScrollArea } = env;
      ${code.value}
    `);
    await execute(env);
    if (engine) engine.start();
    status.textContent = `${selectedSample.title} を実行しました。Canvasを操作して動作を試せます。`;
  } catch (error) {
    status.classList.add("error");
    status.textContent = `${selectedSample.title} の実行に失敗しました。`;
    log(`${error.name}: ${error.message}`);
    if (error.stack) log(error.stack.split("\n").slice(1, 4).join("\n"));
  } finally {
    runButton.disabled = false;
    runButton.textContent = "▶ 実行";
  }
}

runButton.addEventListener("click", run);
document.querySelector("#reset").addEventListener("click", () => {
  if (selectedSample) selectSample(selectedSample);
});
code.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    run();
  }
  if (event.key === "Tab") {
    event.preventDefault();
    const start = code.selectionStart;
    const end = code.selectionEnd;
    code.setRangeText("  ", start, end, "end");
  }
});
window.addEventListener("beforeunload", teardown);

selectSample(samples[0]);
