import assert from "node:assert/strict";
import {
  buildSvgTransform,
  isSvgPath,
  parseSvgPath,
  parseSvgPoints,
  serializeSvgPath,
  serializeSvgPoints,
  svgEditableAttributes,
  svgModeForPath,
  svgPositionAttributes,
  translateSvgCoordinate,
} from "./svg-editor.js";

assert.equal(isSvgPath("icon.svg"), true);
assert.equal(isSvgPath("assets/ICON.SVG"), true);
assert.equal(isSvgPath("icon.svg.txt"), false);
assert.equal(isSvgPath("icon.png"), false);

assert.equal(svgModeForPath("icon.svg"), "gui");
assert.equal(svgModeForPath("icon.svg", "text"), "text");
assert.equal(svgModeForPath("icon.svg", "unknown"), "gui");
assert.equal(svgModeForPath("icon.png", "gui"), "text");

assert.deepEqual(svgEditableAttributes("rect"), [
  "x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width",
]);
assert.deepEqual(svgEditableAttributes("CIRCLE"), [
  "cx", "cy", "r", "fill", "stroke", "stroke-width",
]);
assert.deepEqual(svgEditableAttributes("path"), ["fill", "stroke", "stroke-width"]);
assert.deepEqual(svgEditableAttributes("tspan"), [
  "x", "y", "dx", "dy", "font-size", "fill", "stroke", "stroke-width",
]);
assert.deepEqual(svgEditableAttributes("g"), []);
assert.deepEqual(svgPositionAttributes("rect"), ["x", "y"]);
assert.deepEqual(svgPositionAttributes("line"), ["x1", "y1", "x2", "y2"]);
assert.deepEqual(svgPositionAttributes("path"), []);
assert.equal(translateSvgCoordinate("10.5", -2.25), "8.25");
assert.equal(translateSvgCoordinate("", 4), "4");
assert.equal(translateSvgCoordinate("50%", 4), null);

assert.deepEqual(parseSvgPoints("0,0 10,0 10,20"), [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 20 },
]);
assert.equal(parseSvgPoints("0,0 10"), null);
assert.equal(serializeSvgPoints([{ x: 1.25, y: -2 }]), "1.25,-2");

const path = parseSvgPath("m 10 10 h 20 v 10 c 0 5 5 5 10 0 s 10 -5 10 0 q 5 5 10 0 t 10 0 z");
assert.deepEqual(path, [
  { command: "M", point: { x: 10, y: 10 } },
  { command: "L", point: { x: 30, y: 10 } },
  { command: "L", point: { x: 30, y: 20 } },
  {
    command: "C",
    control1: { x: 30, y: 25 },
    control2: { x: 35, y: 25 },
    point: { x: 40, y: 20 },
  },
  {
    command: "C",
    control1: { x: 45, y: 15 },
    control2: { x: 50, y: 15 },
    point: { x: 50, y: 20 },
  },
  {
    command: "Q",
    control: { x: 55, y: 25 },
    point: { x: 60, y: 20 },
  },
  {
    command: "Q",
    control: { x: 65, y: 15 },
    point: { x: 70, y: 20 },
  },
  { command: "Z" },
]);
assert.equal(serializeSvgPath(path), "M10 10 L30 10 L30 20 C30 25 35 25 40 20 C45 15 50 15 50 20 Q55 25 60 20 Q65 15 70 20 Z");
assert.equal(parseSvgPath("M0 0 A10 10 0 0 1 20 20"), null);
assert.deepEqual(parseSvgPath("M0 0 5 5 Z m2 3 l1 1"), [
  { command: "M", point: { x: 0, y: 0 } },
  { command: "L", point: { x: 5, y: 5 } },
  { command: "Z" },
  { command: "M", point: { x: 2, y: 3 } },
  { command: "L", point: { x: 3, y: 4 } },
]);
assert.equal(buildSvgTransform("", {
  translateX: 4,
  translateY: 5,
  scaleX: 2,
  scaleY: 3,
  rotation: 10,
  skewX: 2,
  skewY: 0,
}, 20, 30), "translate(4 5) translate(20 30) rotate(10) skewX(2) skewY(0) scale(2 3) translate(-20 -30)");
assert.throws(() => buildSvgTransform("", {
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  skewX: 90,
  skewY: 0,
}, 0, 0), RangeError);

console.log("Monac SVG editor tests passed");
