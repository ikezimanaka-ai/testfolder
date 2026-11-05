export const PATTERNS = [
  { id: "hbeam", name: "横断ビーム", color: "#ffd34e", mark: "━", form: "beam" },
  { id: "vbeam", name: "縦断ビーム", color: "#59e6ad", mark: "┃", form: "beam" },
  { id: "aim", name: "狙い撃ち", color: "#ff596f", mark: "➤", form: "shot" },
  { id: "fan", name: "扇状弾", color: "#ff9052", mark: "◀", form: "shot" },
  { id: "ring", name: "全方位リング", color: "#bd83ff", mark: "✦", form: "ring" },
  { id: "doubleRing", name: "二重リング", color: "#c879ff", mark: "✺", form: "ring" },
  { id: "spiral", name: "螺旋弾", color: "#5dbdff", mark: "↻", form: "spiral" },
  { id: "cross", name: "十字弾", color: "#ff668c", mark: "+", form: "cross" },
  { id: "xCross", name: "X字弾", color: "#ff7b58", mark: "×", form: "cross" },
  { id: "sweepH", name: "横掃射", color: "#ffe15d", mark: "↔", form: "sweep" },
  { id: "sweepV", name: "縦掃射", color: "#58edbd", mark: "↕", form: "sweep" },
  { id: "lanes", name: "交互レーン", color: "#72dcff", mark: "▥", form: "lane" },
  { id: "rain", name: "流星雨", color: "#a3e859", mark: "☄", form: "rain" },
  { id: "pincer", name: "両側挟み撃ち", color: "#ff8ab3", mark: "⇥", form: "pincer" },
  { id: "mines", name: "遅延マイン", color: "#ffbf55", mark: "◉", form: "mine" },
  { id: "homing", name: "追尾オーブ", color: "#82a5ff", mark: "◎", form: "homing" },
  { id: "split", name: "分裂弾", color: "#e6a2ff", mark: "✣", form: "split" },
  { id: "bounce", name: "反射弾", color: "#72f0e0", mark: "◇", form: "bounce" },
  { id: "burst", name: "遅延バースト", color: "#ff7373", mark: "✹", form: "burst" },
  { id: "diagonal", name: "斜めレーン", color: "#f5a8ff", mark: "╱", form: "rain" },
  { id: "rotatingCross", name: "回転クロス", color: "#83c3ff", mark: "✥", form: "cross" },
  { id: "wave", name: "波紋リング", color: "#77e6ff", mark: "◌", form: "ring" },
  { id: "tripleAim", name: "三連追撃", color: "#ff657d", mark: "»", form: "shot" },
  { id: "sideFan", name: "サイドファン", color: "#ffc477", mark: "◁", form: "pincer" },
];

export const COMBINATION_COUNT = PATTERNS.length + PATTERNS.length * (PATTERNS.length - 1) / 2;
const randomBetween = (rng, min, max) => min + rng() * (max - min);

export function makeCombination(size, rng = Math.random, avoid = new Set()) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pool = [...PATTERNS];
    const patterns = [];
    while (patterns.length < Math.min(size, pool.length)) patterns.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const signature = patterns.map(({ id }) => id).sort().join("+");
    if (!avoid.has(signature)) return { signature, patterns };
  }
  const patterns = PATTERNS.slice(0, Math.max(1, Math.min(size, PATTERNS.length)));
  return { signature: patterns.map(({ id }) => id).sort().join("+"), patterns };
}

export function prepareAttack(pattern, width, height, player, rng = Math.random, intensity = 1) {
  const pad = 52;
  const x = randomBetween(rng, width * 0.2, width * 0.8);
  const y = randomBetween(rng, height * 0.2, height * 0.8);
  const angle = Math.atan2(player.y - y, player.x - x);
  const attack = { pattern, x, y, angle, width, height, intensity, rng, duration: Math.max(0.78, 1.2 - (intensity - 1) * 0.1) };
  switch (pattern.id) {
    case "hbeam": case "sweepH": {
      attack.y = randomBetween(rng, pad + 24, height - pad - 24);
      attack.min = Math.max(pad + 24, attack.y - 84);
      attack.max = Math.min(height - pad - 24, attack.y + 84);
      attack.direction = rng() < 0.5 ? -1 : 1;
      break;
    }
    case "vbeam": case "sweepV": {
      attack.x = randomBetween(rng, pad + 24, width - pad - 24);
      attack.min = Math.max(pad + 24, attack.x - 84);
      attack.max = Math.min(width - pad - 24, attack.x + 84);
      attack.direction = rng() < 0.5 ? -1 : 1;
      break;
    }
    case "lanes": attack.safeLane = Math.floor(rng() * 6); break;
    case "mines": attack.spots = Array.from({ length: Math.max(2, Math.round(intensity * 2)) }, () => ({ x: randomBetween(rng, pad + 24, width - pad - 24), y: randomBetween(rng, pad + 24, height - pad - 24) })); break;
    case "rain": case "diagonal": attack.edge = rng() < 0.6 ? "top" : "left"; break;
    case "pincer": case "sideFan": attack.y = randomBetween(rng, pad + 28, height - pad - 28); break;
  }
  return attack;
}

export function fireAttack(attack, difficulty = 1) {
  const { pattern, x, y, angle, width, height, intensity, rng } = attack;
  const result = [];
  const speed = (150 + difficulty * 12) * intensity;
  const count = (base) => Math.max(3, Math.min(18, Math.round(base * intensity)));
  const add = (px, py, direction, velocity = speed, extra = {}) => result.push({ kind: "bullet", x: px, y: py, vx: Math.cos(direction) * velocity, vy: Math.sin(direction) * velocity, radius: 6, color: pattern.color, ...extra });
  const fan = (originX, originY, direction, n, spread, velocity = speed, extra = {}) => {
    for (let i = 0; i < n; i += 1) add(originX, originY, direction + (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1)), velocity, extra);
  };
  const radial = (originX, originY, n, velocity = speed, rotation = 0, extra = {}) => {
    for (let i = 0; i < n; i += 1) add(originX, originY, rotation + Math.PI * 2 * i / n, velocity, extra);
  };
  switch (pattern.id) {
    case "hbeam": result.push({ kind: "beam", x: width / 2, y: attack.y, width: width - 104, height: 30, life: 0.72, color: pattern.color }); break;
    case "vbeam": result.push({ kind: "beam", x: attack.x, y: height / 2, width: 30, height: height - 104, life: 0.72, color: pattern.color }); break;
    case "sweepH": case "sweepV": {
      const horizontal = pattern.id === "sweepH";
      result.push({ kind: "sweep", horizontal, x: horizontal ? width / 2 : attack.x, y: horizontal ? attack.y : height / 2, min: attack.min, max: attack.max, direction: attack.direction, width: horizontal ? width - 84 : 38, height: horizontal ? 38 : height - 96, life: 2.8, color: pattern.color });
      break;
    }
    case "aim": fan(x, y, angle, 1, 0, speed * 1.1); break;
    case "fan": fan(x, y, angle, count(7), Math.PI / 2.4); break;
    case "ring": radial(x, y, count(14), speed * 0.82, rng() * Math.PI); break;
    case "doubleRing": radial(x, y, count(12), speed * 0.72, 0), radial(x, y, count(12), speed, Math.PI / 12); break;
    case "spiral": for (let i = 0; i < count(20); i += 1) add(x, y, angle + i * 0.39, speed * 0.75, { delay: i * 0.07 }); break;
    case "cross": radial(x, y, 4, speed); break;
    case "xCross": radial(x, y, 4, speed, Math.PI / 4); break;
    case "rotatingCross": radial(x, y, 4, speed, rng() * Math.PI / 2); break;
    case "lanes": {
      const laneWidth = (width - 104) / 6;
      for (let lane = 0; lane < 6; lane += 1) if (lane !== attack.safeLane) result.push({ kind: "beam", x: 52 + laneWidth * (lane + 0.5), y: height / 2, width: laneWidth - 5, height: height - 104, life: 0.95, color: pattern.color, danger: 0.7 });
      break;
    }
    case "rain": case "diagonal": {
      for (let i = 0; i < count(pattern.id === "rain" ? 13 : 10); i += 1) {
        const bx = attack.edge === "top" ? randomBetween(rng, 56, width - 56) : 52;
        const by = attack.edge === "top" ? 52 : randomBetween(rng, 60, height - 60);
        const direction = attack.edge === "top" ? Math.PI / 2 + (pattern.id === "diagonal" ? 0.4 : randomBetween(rng, -0.3, 0.3)) : randomBetween(rng, -0.3, 0.3);
        add(bx, by, direction, speed * 0.8, { delay: i * 0.1 });
      }
      break;
    }
    case "pincer": add(52, attack.y, 0); add(width - 52, attack.y, Math.PI); break;
    case "sideFan": fan(52, attack.y, 0, 5, 0.72, speed * 0.86), fan(width - 52, attack.y, Math.PI, 5, 0.72, speed * 0.86); break;
    case "mines": for (const spot of attack.spots) result.push({ kind: "mine", ...spot, radius: 29, fuse: 0.95, burstCount: count(10), speed: speed * 0.78, color: pattern.color }); break;
    case "homing": for (let i = 0; i < 3; i += 1) add(x + randomBetween(rng, -30, 30), y + randomBetween(rng, -30, 30), angle + randomBetween(rng, -0.35, 0.35), speed * 0.7, { homing: 2.6 }); break;
    case "split": for (let i = -1; i <= 1; i += 1) add(x, y, angle + i * 0.22, speed * 0.75, { splitAt: 1.05 }); break;
    case "bounce": fan(x, y, angle, count(5), 0.9, speed, { bounces: 2 }); break;
    case "burst": result.push({ kind: "mine", x, y, radius: 30, fuse: 0.85, burstCount: count(16), speed, color: pattern.color }); break;
    case "wave": radial(x, y, count(10), speed * 0.78, rng() * Math.PI); break;
    case "tripleAim": for (let i = -1; i <= 1; i += 1) add(x, y, angle + i * 0.13, speed * 1.1, { delay: (i + 1) * 0.18 }); break;
  }
  return result;
}
