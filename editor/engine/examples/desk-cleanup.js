import { Engine, Display, GameObject } from "../engine.js";
import { TextObject, ButtonObject } from "../ui-objects.js";

const NS = "http://www.w3.org/2000/svg";
const canvas = document.querySelector("#game");
const engine = new Engine(canvas, 60, 800, 450);
const world = engine.newDisplay(new Display("desk", 800, 450, { background: "#78350f" }));
const title = engine.addObject(world, new TextObject("物をドラッグして片づけよう", { x: 400, y: 35, anchor: "middle", fontSize: 26, color: "#fef3c7" }));
const status = engine.addObject(world, new TextObject("", { x: 400, y: 75, anchor: "middle", fontSize: 17, color: "#fde68a" }));

const tray = engine.addObject(world, new GameObject({
  x: 570,
  y: 120,
  width: 190,
  height: 270,
  shapes: [createShape("rect", { x: 0, y: 0, width: 190, height: 270, rx: 16, fill: "#365314", opacity: .9, stroke: "#bef264", "stroke-width": 3 })],
}));
const trayLabel = engine.addObject(world, new TextObject("ここへ片づける", { x: 665, y: 255, anchor: "middle", fontSize: 20, color: "#ecfccb" }));
const labels = ["本", "コップ", "ペン", "メモ", "時計", "おもちゃ", "鍵", "箱", "スマホ", "消しゴム"];
const items = [];
let cleaned = 0;
let dragging = null;

function createShape(name, attributes) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function pointerToLogical(event) {
  const bounds = engine.svg.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * engine.logicalWidth / bounds.width,
    y: (event.clientY - bounds.top) * engine.logicalHeight / bounds.height,
  };
}

function moveInsideCanvas(item, x, y) {
  item.moveTo(
    Math.max(0, Math.min(engine.logicalWidth - item.width, x)),
    Math.max(90, Math.min(engine.logicalHeight - item.height, y)),
  );
}

function isInsideTray(item) {
  return item.x >= tray.x && item.x <= tray.x + tray.width &&
    item.y >= tray.y && item.y <= tray.y + tray.height;
}

function finishDrag(item) {
  if (!dragging || dragging.item !== item) return;
  if (isInsideTray(item)) {
    item.opacity = 0;
    item.dragging = false;
    cleaned++;
    status.text = cleaned === labels.length ? "ぜんぶ片づいた！" : `片づけた数: ${cleaned} / ${labels.length}`;
  } else {
    status.text = "その場所に置きました。緑の箱へ運ぶと片づきます";
  }
  dragging = null;
}

window.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const point = pointerToLogical(event);
  moveInsideCanvas(dragging.item, point.x + dragging.offsetX, point.y + dragging.offsetY);
});

window.addEventListener("pointerup", () => {
  if (dragging) finishDrag(dragging.item);
});

window.addEventListener("pointercancel", () => {
  if (dragging) finishDrag(dragging.item);
});

labels.forEach((label, index) => {
  const item = engine.addObject(world, new ButtonObject(label, {
    x: 90 + (index % 4) * 105,
    y: 125 + Math.floor(index / 4) * 100,
    width: 86,
    height: 52,
    background: index % 2 ? "#b45309" : "#92400e",
    hoverBackground: "#d97706",
    shadow: true,
  }));
  item.startX = item.x;
  item.startY = item.y;
  item.onClick = null;
  item.element.addEventListener("pointerdown", (event) => {
    if (!item.opacity || dragging) return;
    event.preventDefault();
    const point = pointerToLogical(event);
    dragging = { item, offsetX: item.x - point.x, offsetY: item.y - point.y };
    item.dragging = true;
    item.element.setPointerCapture?.(event.pointerId);
    item.element.parentNode.append(item.element);
    status.text = "そのまま緑の箱へドラッグしてください";
  });
  item.element.addEventListener("pointermove", (event) => {
    if (!dragging || dragging.item !== item) return;
    const point = pointerToLogical(event);
    moveInsideCanvas(item, point.x + dragging.offsetX, point.y + dragging.offsetY);
  });
  item.element.addEventListener("pointerup", () => finishDrag(item));
  item.element.addEventListener("pointercancel", () => finishDrag(item));
  items.push(item);
});

status.text = `片づけた数: 0 / ${labels.length}　緑の箱へドラッグ`;
engine.start();
