import { Engine, Display, GameObject, Shapes, INPUT } from "../engine.js";
import {
  ButtonObject, SliderObject, TextInputObject, NumberInputObject, SpriteAnimationObject,
} from "../ui-objects.js";

const results = document.querySelector("#results");
const summary = document.querySelector("#summary");
const checks = [];

function assert(name, condition) {
  checks.push({ name, passed: Boolean(condition) });
}

function pixelsOnRow(engine, y, ...xs) {
  const py = Math.floor(engine._pixelRatio * (engine._offsetY + y * engine._scale));
  const row = engine.ctx.getImageData(0, py, engine.canvas.width, 1).data;
  return xs.map((x) => {
    const px = Math.floor(engine._pixelRatio * (engine._offsetX + x * engine._scale));
    return row.slice(px * 4, px * 4 + 4);
  });
}

async function run() {
  const engine = new Engine(document.querySelector("#test-canvas"), 60, 200, 100);
  const world = engine.newDisplay(new Display("clip", 20, 20, { x: 20, y: 20 }));
  engine.addObject(world, new GameObject({
    x: 19, y: 5,
    shapes: [Shapes.rectAt(0, 0, 12, 10, { fill: "#ff0000" })],
  }));
  engine.render();
  const [visible, clipped] = pixelsOnRow(engine, 27, 39.25, 42);
  assert("Canvas draws a shape inside its Display", visible[0] > 200 && visible[3] > 0);
  assert("Display clips pixels outside its bounds", clipped[3] === 0);

  const first = new GameObject({
    x: 40, y: 40, tags: ["enemy", "active"],
    shapes: [Shapes.rect(12, 12, { fill: "#38bdf8" })],
  });
  const second = new GameObject({
    x: 48, y: 40, tags: ["enemy"],
    shapes: [Shapes.circle(8, { fill: "#f472b6" })],
  });
  const distant = new GameObject({
    x: 80, y: 40, tags: ["enemy"],
    shapes: [Shapes.rect(10, 10)],
  });
  assert("Rect and circle collision uses shape geometry", first.intersects(second));
  assert("Separated shapes do not collide", !first.intersects(distant));
  assert("Point hit testing uses transformed geometry", first.containsPoint(40, 40));
  assert("Compound filters match tags and coordinates", first.hasTags(["enemy", "active"]) && first.x >= 0 && first.x <= 50);
  first.setPrivate("team", "blue");
  assert("SetPrivate and getPrivate retain custom values", first.getPrivate("team") === "blue");
  second.setPrivate("faction", "hostile");
  engine.addObject(world, first);
  engine.addObject(world, second);
  engine.addObject(world, distant);
  assert(
    "Touch queries combine tags, coordinate ranges, and custom values",
    first.touching({ tags: ["enemy"], x: { min: 40, max: 50 }, where: { faction: "hostile" } }).includes(second),
  );

  const skewed = new GameObject({
    x: 110, y: 40, rotation: 30, scaleX: 1.5, skewY: 8,
    shapes: [Shapes.rect(16, 16)],
  });
  const near = new GameObject({
    x: 124, y: 40, shapes: [Shapes.rect(10, 10)],
  });
  assert("Rotation, scale, and skew participate in collision", skewed.intersects(near));

  let lateStartCount = 0;
  engine.start();
  engine.addObject(world, new GameObject({ onStart() { lateStartCount++; } }));
  assert("Objects added after start run onStart immediately", lateStartCount === 1);

  const disposable = engine.addObject(world, new GameObject({ onUpdate() { this.destroy(); } }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert("Destroyed Objects are removed from the update list", !world.objects.includes(disposable));

  const slowCanvas = document.createElement("canvas");
  slowCanvas.style.display = "none";
  document.body.append(slowCanvas);
  const slowEngine = new Engine(slowCanvas, 20, 100, 60);
  const slowWorld = slowEngine.newDisplay(new Display("fps-cap", 100, 60));
  let slowFrames = 0;
  slowEngine.addObject(slowWorld, new GameObject({ onUpdate() { slowFrames++; } }));
  slowEngine.start();
  await new Promise((resolve) => setTimeout(resolve, 320));
  slowEngine.destroy();
  slowCanvas.remove();
  assert("FPS argument caps update frequency without ignoring low targets", slowFrames >= 4 && slowFrames <= 9);

  let buttonClicks = 0;
  const button = engine.addObject(world, new ButtonObject("test", { x: 0, y: 0, width: 5, height: 5 }));
  button.onClick = () => { buttonClicks++; };
  const slider = engine.addObject(world, new SliderObject({
    x: 6, y: 0, width: 12, height: 6, min: 0, max: 1, value: 0,
  }));
  const textInput = engine.addObject(world, new TextInputObject({
    x: 0, y: 9, width: 15, height: 8, label: "Test input",
  }));
  const numberInput = engine.addObject(world, new NumberInputObject({
    x: 0, y: 18, width: 15, height: 8, label: "Test number", min: 0, max: 50,
  }));
  const rect = engine.canvas.getBoundingClientRect();
  const dispatchPointer = (type, x, y) => {
    engine.canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse",
      clientX: rect.left + engine._offsetX + x * engine._scale,
      clientY: rect.top + engine._offsetY + y * engine._scale,
      button: 0, buttons: type === "pointerup" ? 0 : 1,
    }));
  };
  dispatchPointer("pointerdown", world.x + 2, world.y + 2);
  dispatchPointer("pointerup", world.x + 2, world.y + 2);
  assert("Canvas hit testing dispatches pointer events to Objects", buttonClicks === 1);
  dispatchPointer("pointerdown", world.x + 6 + 9, world.y + 3);
  assert("Slider value updates through Canvas pointer input", slider.value > .7);
  dispatchPointer("pointerdown", world.x + 2, world.y + 11);
  assert(
    "Canvas text fields focus an invisible native input without focus styling",
    document.activeElement === textInput.inputElement && textInput.inputElement.style.opacity === "0" &&
      textInput.inputElement.style.outline === "none",
  );
  numberInput.inputElement.value = "42";
  numberInput.inputElement.dispatchEvent(new Event("input", { bubbles: true }));
  assert(
    "NumberInputObject exposes a clamped numeric value",
    numberInput.inputElement.type === "number" && numberInput.numberValue === 42,
  );
  textInput.inputElement.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
  assert("Text entry keys do not leak into gameplay keyboard state", !INPUT.onKey("Space"));

  const svgData = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>')}`;
  const image = await engine.loadSVG(svgData);
  assert("SVG resources load from a URL", image.naturalWidth === 4);
  const animation = engine.addObject(world, new SpriteAnimationObject([svgData, svgData], {
    x: 1, y: 1, width: 4, height: 4, frameDuration: .01,
  }));
  await animation._loading;
  animation.onUpdate(.015);
  assert("SpriteAnimationObject advances frames using dt", animation.frameIndex === 1);
  engine.destroy();

  for (const result of checks) {
    const item = document.createElement("li");
    item.className = result.passed ? "pass" : "fail";
    item.textContent = `${result.passed ? "PASS" : "FAIL"} ${result.name}`;
    results.append(item);
  }
  const failed = checks.filter((result) => !result.passed);
  summary.textContent = `${checks.length - failed.length}/${checks.length} tests passed`;
  if (failed.length) throw new Error(`Engine tests failed: ${failed.map(({ name }) => name).join(", ")}`);
}

run().catch((error) => {
  summary.textContent = error.message;
  console.error(error);
});
