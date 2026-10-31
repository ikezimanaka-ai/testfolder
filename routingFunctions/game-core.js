export const WIDTH = 1000;
export const HEIGHT = 625;
export const PLOT = { left: 58, right: 968, top: 142, bottom: 500, xMin: -49, xMax: 49, yMin: -20, yMax: 20 };
export const FLOOR_Y = PLOT.bottom;
export const CHECKPOINT_STEP = 10;
export const CHECKPOINT_KEY = "graph-dodger-highest-stage";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function formatTerm(coefficient, variable, power = "") {
  if (!coefficient) return "";
  const magnitude = Math.abs(coefficient);
  const prefix = coefficient < 0 ? "−" : "+";
  const factor = variable && magnitude === 1 ? "" : Number.isInteger(magnitude) ? magnitude : `(1/${Math.round(1 / magnitude)})`;
  return `${prefix}${factor}${variable}${power}`;
}

function formatPolynomial(terms) {
  const result = terms.map(([coefficient, variable, power]) => formatTerm(coefficient, variable, power)).filter(Boolean).join("");
  return result.startsWith("+") ? result.slice(1) : result || "0";
}

function functionFormula(label, fn, amplitude = 1) { return { kind: "function", label: `y = ${label}`, fn, amplitude }; }

const formulaFamilies = [
  { at: 1, name: "一次関数", make: n => {
    const lines = [[2, 1], [-3, 4], [5, -2], [-1, -5], [4, 7], [-6, 3], [3, -8], [-2, 9]];
    if (n % 12 === 8) { const y = [15, -12, 6, -4][Math.floor(n / 12) % 4]; return functionFormula(String(y), () => y); }
    if (n % 12 === 9) { const x = [20, -15, 5, -2][Math.floor(n / 12) % 4]; return { kind: "vertical", value: x, label: `x = ${x}` }; }
    const [a, b] = lines[n % lines.length];
    return functionFormula(formatPolynomial([[a, "x"], [b, ""]]), x => a * x + b);
  } },
  { at: 3, name: "二次関数", make: n => {
    const rows = [[1 / 2, -4], [-1 / 3, 3], [2, -7], [-1, 8], [3, -9], [-2, 1], [1 / 4, 5]];
    const [a, b] = rows[n % rows.length];
    return functionFormula(formatPolynomial([[a, "x", "²"], [b, ""]]), x => a * x ** 2 + b);
  } },
  { at: 6, name: "三次関数", make: n => {
    const rows = [[1 / 2, -4], [-1 / 3, 7], [2, -2], [-2, 6], [1, 3], [-1, -5], [1 / 4, 1]];
    const [a, b] = rows[n % rows.length];
    return functionFormula(formatPolynomial([[a, "x", "³"], [b, ""]]), x => a * x ** 3 + b);
  } },
  { at: 9, name: "三角関数", make: n => {
    const rows = [[30, 2, 0], [45, 1, 2], [-35, 3, -1], [55, 2, 1]];
    const [a, b, c] = rows[n % rows.length], name = n % 2 ? "cos" : "sin";
    return functionFormula(`${a}${name}(${b}x${c < 0 ? `−${Math.abs(c)}` : c ? `+${c}` : ""})`, x => a * Math[name](b * x + c));
  } },
  { at: 12, name: "正接関数", make: n => {
    const [a, b, c] = [[2, 1, 0], [-3, 2, 1], [5, 1, -2]][n % 3];
    return functionFormula(`${a}tan(${b}x${c < 0 ? `−${Math.abs(c)}` : c ? `+${c}` : ""})`, x => clamp(a * Math.tan(b * x + c), -30, 30));
  } },
  { at: 15, name: "絶対値・平方根", make: n => n % 2
    ? functionFormula("−4√|x|+8", x => -4 * Math.sqrt(Math.abs(x)) + 8)
    : functionFormula("−2|x−3|+8", x => -2 * Math.abs(x - 3) + 8) },
  { at: 18, name: "分数・指数・対数", make: n => [
    functionFormula(`12/(x−2)+3`, x => clamp(12 / (x - 2) + 3, -30, 30)),
    functionFormula(`3eˣ−2`, x => clamp(3 * Math.exp(x) - 2, -30, 30)),
    functionFormula(`4ln(x+5)−3`, x => x + 5 > 0 ? 4 * Math.log(x + 5) - 3 : NaN),
  ][n % 3] },
  { at: 22, name: "合成関数", make: n => [
    functionFormula(`3sin(2x)+x²−4`, x => 3 * Math.sin(2 * x) + x ** 2 - 4),
    functionFormula(`2tan(x)+3x−1`, x => clamp(2 * Math.tan(x) + 3 * x - 1, -30, 30)),
    functionFormula(`12|sin(3x)|−26`, x => 12 * Math.abs(Math.sin(3 * x)) - 26),
  ][n % 3] },
  { at: 27, name: "高次・区分関数", make: n => [
    functionFormula(`x⁴−5x²+4`, x => x ** 4 - 5 * x ** 2 + 4),
    functionFormula(`x+5 (x<0), x²−3 (x≥0)`, x => x < 0 ? x + 5 : x ** 2 - 3),
    functionFormula(`2ln(|x|+1)+3cos(2x)`, x => 2 * Math.log(Math.abs(x) + 1) + 3 * Math.cos(2 * x)),
  ][n % 3] },
];

export function formulaDifficulty(stage) {
  let index = 0;
  formulaFamilies.forEach((family, i) => { if (stage >= family.at) index = i; });
  return { index, name: formulaFamilies[index].name, unlocked: index + 1 };
}

export function createFormula(stage, sequence = 0) {
  const eligible = formulaFamilies.filter(family => stage >= family.at);
  const family = eligible[sequence % eligible.length];
  const result = family.make(Math.floor(sequence / eligible.length));
  return { ...result, family: family.name, stage, sequence };
}

export function formulaPoint(formula, screenX) {
  if (formula.kind === "vertical") return NaN;
  const x = PLOT.xMin + ((screenX - PLOT.left) / (PLOT.right - PLOT.left)) * (PLOT.xMax - PLOT.xMin);
  let y = formula.fn(x);
  if (!Number.isFinite(y)) return NaN;
  y = clamp(y, PLOT.yMin - 100, PLOT.yMax + 100);
  return PLOT.bottom - ((y - PLOT.yMin) / (PLOT.yMax - PLOT.yMin)) * (PLOT.bottom - PLOT.top);
}

export function formulaHitsPlayer(formula, player) {
  if (formula.kind === "vertical") {
    const x = PLOT.left + ((formula.value - PLOT.xMin) / (PLOT.xMax - PLOT.xMin)) * (PLOT.right - PLOT.left);
    return Math.abs(player.x - x) < player.radius + 8 && player.y + player.radius >= PLOT.top && player.y - player.radius <= PLOT.bottom;
  }
  return Math.abs(player.y - formulaPoint(formula, player.x)) < player.radius + 8;
}

export function stageDuration(stage) {
  return clamp(26 - Math.floor((stage - 1) / 5) * 1.2, 14, 26);
}

export function hazardInterval(stage) {
  return clamp(5.2 - Math.floor((stage - 1) / 4) * 0.38, 1.8, 5.2);
}

export function formulaWarningDuration(stage) {
  return Math.max(1.05, 2.8 - Math.max(0, stage - 1) * 0.055);
}

export const HAZARD_DURATION = 1.225;

export function hazardsPerBurst(stage) {
  if (stage < 3) return 2;
  if (stage < 8) return 3;
  if (stage < 18) return 4;
  return 5;
}

export function createHazardBurst(stage, sequence, count) {
  if (stage < 3) {
    const linePairs = [[1, 0, -30], [-1, -20, 20], [2, -10, 30], [-2, -30, 10], [3, 0, 24], [-3, -24, 8]];
    const [a, ...roots] = linePairs[Math.floor(sequence / 2) % linePairs.length];
    return Array.from({ length: count }, (_, i) => {
      const b = -20 - a * roots[i % roots.length];
      const sign = b < 0 ? "−" : "+";
      const constant = Math.abs(b);
      const coefficient = a === 1 ? "" : a === -1 ? "−" : String(Math.abs(a));
      const label = `y = ${coefficient}x${b ? `${sign}${constant}` : ""}`;
      return { kind: "function", label, fn: x => a * x + b, family: "一次関数", stage, sequence: sequence + i };
    });
  }
  if (stage < 6) {
    const wave = Math.floor(sequence / count);
    const a = [-1 / 2, -1 / 3, -1 / 4, -1 / 2][wave % 4];
    const rootSets = [[12, 24, 36, 6], [-36, -24, -12, -6], [-30, -18, -6, 30], [6, 18, 30, -30]];
    const roots = rootSets[wave % rootSets.length];
    return Array.from({ length: count }, (_, i) => {
      const root = roots[i % roots.length];
      const b = Math.round(-20 - a * root ** 2);
      const label = formatPolynomial([[a, "x", "²"], [b, ""]]);
      return { kind: "function", label: `y = ${label}`, fn: x => a * x ** 2 + b, family: "二次関数", stage, sequence: sequence + i };
    });
  }
  if (stage < 9) {
    const wave = Math.floor(sequence / count);
    const a = [1 / 4, -1 / 4, 1 / 3][wave % 3];
    const rootSets = [[-32, -16, 16, 32, 0], [36, 24, -12, -24, 0], [-30, -15, 15, 30, 0]];
    const roots = rootSets[wave % rootSets.length];
    return Array.from({ length: count }, (_, i) => {
      const root = roots[i % roots.length];
      const b = Math.round(-20 - a * root ** 3);
      const label = formatPolynomial([[a, "x", "³"], [b, ""]]);
      return { kind: "function", label: `y = ${label}`, fn: x => a * x ** 3 + b, family: "三次関数", stage, sequence: sequence + i };
    });
  }
  return Array.from({ length: count }, (_, i) => createFormula(stage, sequence + i));
}

export function damageForStage(stage) {
  return 1 + Math.floor(Math.max(0, stage - 1) / 8);
}

export function availableCheckpoints(highestStage) {
  const checkpoints = [1];
  for (let stage = CHECKPOINT_STEP; stage <= highestStage; stage += CHECKPOINT_STEP) checkpoints.push(stage);
  return checkpoints;
}

export function readHighestStage(storage = globalThis.localStorage) {
  try { return Math.max(1, Number(storage?.getItem(CHECKPOINT_KEY)) || 1); }
  catch { return 1; }
}

export function saveHighestStage(stage, storage = globalThis.localStorage) {
  const highest = Math.max(readHighestStage(storage), Math.floor(stage));
  try { storage?.setItem(CHECKPOINT_KEY, String(highest)); } catch { /* Private browsing may disable storage. */ }
  return highest;
}

export const CARD_POOL = [
  { id: "heart", title: "予備の心臓", description: "最大HP +1", color: "#ff8295", apply: s => { s.maxHp += 1; s.hp += 1; } },
  { id: "speed", title: "軽量シューズ", description: "移動速度 +12%", color: "#7de4c2", apply: s => { s.speed *= 1.12; } },
  { id: "jump", title: "エアステップ", description: "空中ジャンプ +1回", color: "#8ca2ff", apply: s => { s.extraJumps += 1; } },
  { id: "shield", title: "継続シールド", description: "シールド +1（次の周回にも持ち越し）", color: "#63d9ff", apply: s => { s.shields += 1; } },
  { id: "resolve", title: "不屈の余裕", description: "ダメージ後の無敵時間 +0.45秒", color: "#c49aff", apply: s => { s.invulnerabilityBonus += 0.45; } },
];

export function createRunState(stage = 1) {
  return { stage, hp: 3, maxHp: 3, speed: 300, extraJumps: 0, shields: 0, invulnerabilityBonus: 0, jumpsUsed: 0, mode: "ground", score: 0 };
}

export function advanceJumpPhysics({ vy = 0, onGround = true, jumpHeld = false, jumpPressed = false, jumpReleased = false, jumpReleasedSinceLift = false } = {}) {
  let nextVy = vy;
  let nextOnGround = onGround;
  let nextJumpReleased = jumpReleasedSinceLift;

  if (jumpPressed && nextOnGround) {
    nextVy = 20;
    nextOnGround = false;
    nextJumpReleased = false;
  }

  if (!nextOnGround) {
    if (jumpReleased) nextJumpReleased = true;
    const decay = nextJumpReleased || !jumpHeld ? 3 : 1;
    nextVy -= decay;
  }

  return { vy: nextVy, onGround: nextOnGround, jumpReleased: nextJumpReleased };
}

export function drawCards(seed, count = 3) {
  const cards = [...CARD_POOL];
  let value = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280;
  const result = [];
  while (result.length < Math.min(count, cards.length)) {
    value = (value * 9301 + 49297) % 233280;
    const index = value % cards.length;
    result.push(cards.splice(index, 1)[0]);
  }
  return result;
}

export function applyDamage(state, stage) {
  if (state.shields > 0) {
    state.shields -= 1;
    return { kind: "shield", amount: 0 };
  }
  const amount = damageForStage(stage);
  state.hp = Math.max(0, state.hp - amount);
  return { kind: "hp", amount };
}
