const SVG_EDITABLE_ATTRIBUTES = Object.freeze({
  rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width"],
  circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
  ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width"],
  line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
  polygon: ["fill", "stroke", "stroke-width"],
  polyline: ["fill", "stroke", "stroke-width"],
  path: ["fill", "stroke", "stroke-width"],
  text: ["x", "y", "font-size", "fill", "stroke", "stroke-width"],
  tspan: ["x", "y", "dx", "dy", "font-size", "fill", "stroke", "stroke-width"],
  image: ["x", "y", "width", "height"],
});

const PATH_COMMAND_ARGUMENTS = Object.freeze({
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
});

const SVG_POSITION_ATTRIBUTES = Object.freeze({
  rect: ["x", "y"],
  circle: ["cx", "cy"],
  ellipse: ["cx", "cy"],
  line: ["x1", "y1", "x2", "y2"],
  text: ["x", "y"],
  tspan: ["x", "y"],
  image: ["x", "y"],
});

export function isSvgPath(path) {
  return typeof path === "string" && /\.svg$/i.test(path);
}

export function svgModeForPath(path, requestedMode) {
  if (!isSvgPath(path)) return "text";
  return requestedMode === "text" ? "text" : "gui";
}

export function svgEditableAttributes(elementName) {
  return SVG_EDITABLE_ATTRIBUTES[elementName?.toLowerCase()] || [];
}

export function svgPositionAttributes(elementName) {
  return SVG_POSITION_ATTRIBUTES[elementName?.toLowerCase()] || [];
}

export function parseSvgPoints(value) {
  if (typeof value !== "string") return null;
  const tokens = value.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || [];
  const remainder = value.replace(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, "")
    .replace(/[\s,]+/g, "");
  if (remainder || tokens.length % 2 !== 0) return null;
  const numbers = tokens.map(Number);
  if (numbers.some((number) => !Number.isFinite(number))) return null;
  return Array.from({ length: numbers.length / 2 }, (_, index) => ({
    x: numbers[index * 2],
    y: numbers[index * 2 + 1],
  }));
}

export function serializeSvgPoints(points) {
  if (!Array.isArray(points) || points.some((point) =>
    !Number.isFinite(point.x) || !Number.isFinite(point.y)
  )) {
    throw new TypeError("SVG points must contain finite coordinates.");
  }
  return points.map(({ x, y }) => `${formatSvgNumber(x)},${formatSvgNumber(y)}`).join(" ");
}

export function parseSvgPath(value) {
  if (typeof value !== "string") return null;
  const tokens = value.match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || [];
  const remainder = value.replace(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, "")
    .replace(/[\s,]+/g, "");
  if (remainder) return null;

  const segments = [];
  let index = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let subpathX = 0;
  let subpathY = 0;
  let previousCommand = "";
  let previousControl = null;
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++];
    if (!command) return null;
    const upper = command.toUpperCase();
    const arity = PATH_COMMAND_ARGUMENTS[upper];
    if (arity === undefined) return null;
    const relative = command !== upper;
    if (upper === "Z") {
      segments.push({ command: "Z" });
      x = subpathX;
      y = subpathY;
      previousCommand = upper;
      previousControl = null;
      command = "";
      continue;
    }
    if (index + arity > tokens.length || /^[a-z]$/i.test(tokens[index])) return null;
    const values = tokens.slice(index, index + arity).map(Number);
    if (values.some((number) => !Number.isFinite(number))) return null;
    index += arity;

    if (upper === "A") return null;
    const offsetX = relative ? x : 0;
    const offsetY = relative ? y : 0;
    let segment;
    if (upper === "M" || upper === "L") {
      const point = { x: values[0] + offsetX, y: values[1] + offsetY };
      segment = { command: upper, point };
      x = point.x;
      y = point.y;
      if (upper === "M") {
        subpathX = x;
        subpathY = y;
      }
    } else if (upper === "H" || upper === "V") {
      const point = upper === "H"
        ? { x: values[0] + offsetX, y }
        : { x, y: values[0] + offsetY };
      segment = { command: "L", point };
      x = point.x;
      y = point.y;
    } else if (upper === "C" || upper === "S") {
      const control1 = upper === "C"
        ? { x: values[0] + offsetX, y: values[1] + offsetY }
        : {
          x: ["C", "S"].includes(previousCommand) && previousControl
            ? 2 * x - previousControl.x
            : x,
          y: ["C", "S"].includes(previousCommand) && previousControl
            ? 2 * y - previousControl.y
            : y,
        };
      const control2 = upper === "C"
        ? { x: values[2] + offsetX, y: values[3] + offsetY }
        : { x: values[0] + offsetX, y: values[1] + offsetY };
      const point = upper === "C"
        ? { x: values[4] + offsetX, y: values[5] + offsetY }
        : { x: values[2] + offsetX, y: values[3] + offsetY };
      segment = { command: "C", control1, control2, point };
      previousControl = control2;
      x = point.x;
      y = point.y;
    } else if (upper === "Q" || upper === "T") {
      const control = upper === "Q"
        ? { x: values[0] + offsetX, y: values[1] + offsetY }
        : {
          x: ["Q", "T"].includes(previousCommand) && previousControl
            ? 2 * x - previousControl.x
            : x,
          y: ["Q", "T"].includes(previousCommand) && previousControl
            ? 2 * y - previousControl.y
            : y,
        };
      const point = upper === "Q"
        ? { x: values[2] + offsetX, y: values[3] + offsetY }
        : { x: values[0] + offsetX, y: values[1] + offsetY };
      segment = { command: "Q", control, point };
      previousControl = control;
      x = point.x;
      y = point.y;
    }
    segments.push(segment);
    if (!["C", "S", "Q", "T"].includes(upper)) previousControl = null;
    previousCommand = upper;
    if (upper === "M") command = relative ? "l" : "L";
  }
  if (!segments.length || segments[0].command !== "M") return null;
  return segments;
}

export function serializeSvgPath(segments) {
  if (!Array.isArray(segments)) throw new TypeError("SVG path segments are required.");
  return segments.map((segment) => {
    if (segment.command === "Z") return "Z";
    const points = segment.command === "M" || segment.command === "L"
      ? [segment.point]
      : segment.command === "C"
        ? [segment.control1, segment.control2, segment.point]
        : segment.command === "Q"
          ? [segment.control, segment.point]
          : null;
    if (!points || points.some((point) =>
      !Number.isFinite(point.x) || !Number.isFinite(point.y)
    )) {
      throw new TypeError("SVG path contains an unsupported or invalid segment.");
    }
    return `${segment.command}${points.map(({ x, y }) =>
      `${formatSvgNumber(x)} ${formatSvgNumber(y)}`
    ).join(" ")}`;
  }).join(" ");
}

function formatSvgNumber(value) {
  return String(Number(value.toPrecision(8)));
}

export function buildSvgTransform(base, values, centerX, centerY) {
  const numbers = [
    values.translateX,
    values.translateY,
    values.scaleX,
    values.scaleY,
    values.rotation,
    values.skewX,
    values.skewY,
    centerX,
    centerY,
  ];
  if (numbers.some((number) => !Number.isFinite(number))) {
    throw new TypeError("SVG transform values must be finite numbers.");
  }
  if (values.scaleX <= 0 || values.scaleY <= 0 || Math.abs(values.skewX) >= 90 || Math.abs(values.skewY) >= 90) {
    throw new RangeError("SVG scale must be positive and skew angles must be between -90 and 90 degrees.");
  }
  return [
    `translate(${values.translateX} ${values.translateY})`,
    base || "",
    `translate(${centerX} ${centerY})`,
    `rotate(${values.rotation})`,
    `skewX(${values.skewX})`,
    `skewY(${values.skewY})`,
    `scale(${values.scaleX} ${values.scaleY})`,
    `translate(${-centerX} ${-centerY})`,
  ].filter(Boolean).join(" ");
}

export function translateSvgCoordinate(value, offset) {
  if (!Number.isFinite(offset)) throw new TypeError("SVG coordinate offset must be finite.");
  if (value !== undefined && typeof value !== "string") return null;
  const coordinate = value?.trim() || "0";
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(coordinate)) return null;
  const translated = Number(coordinate) + offset;
  if (!Number.isFinite(translated)) return null;
  return String(Number(translated.toPrecision(8)));
}
