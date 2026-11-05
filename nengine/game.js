import { INPUT, Shapes } from "../editor/engine/engine.js";
import { GameEngine, Scene, programURL } from "./object-program.js";
import { ButtonObject, HazardObject, PanelObject, PlayerObject, ShapeObject, TextObject, WarningObject } from "./game-objects.js";
import { COMBINATION_COUNT, PATTERNS, fireAttack, makeCombination, prepareAttack } from "./attacks.js";

const WIDTH = 960;
const HEIGHT = 620;
const ARENA = { x: 42, y: 48, width: 876, height: 524 };
const canvas = document.querySelector("#game");
window.addEventListener("error", (event) => console.error("[Game] uncaught error", event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => console.error("[Game] unhandled promise rejection", event.reason));
const engine = new GameEngine(canvas, 60, WIDTH, HEIGHT);
console.info("[Game] Engine created", { canvas, width: WIDTH, height: HEIGHT });
const settings = { health: 3, speed: 1, best: readBest() };
const crazy = "正気か？ああそう。まあやりたいのならば・・・";
const crazyParts = crazy.split("。");
const crazyLine1 = `${crazyParts[0]}。`;
const crazyLine2 = crazyParts.slice(1).join("。");

function readBest() { try { return Number(localStorage.getItem("warning-object-best") || 0) || 0; } catch { return 0; } }
function saveBest(value) { try { localStorage.setItem("warning-object-best", String(value)); } catch { /* The run remains playable when storage is unavailable. */ } }
function scoreText(value) { return Math.floor(value).toString().padStart(6, "0"); }

function addStars(scene) {
  const shapes = [];
  for (let i = 0; i < 92; i += 1) {
    const x = Math.random() * WIDTH, y = Math.random() * HEIGHT;
    const r = Math.random() * 1.5 + 0.35;
    shapes.push(Shapes.circle(r, { cx: x, cy: y, fill: i % 7 === 0 ? "#72ecff" : "#a8bad4", opacity: Math.random() * 0.65 + 0.22 }));
  }
  scene.addObject(new ShapeObject(shapes, { collisionShapes: [] }));
}

function addArena(scene) {
  scene.addObject(new ShapeObject([
    Shapes.rectAt(0, 0, WIDTH, HEIGHT, { fill: "#080d18" }),
    Shapes.rectAt(ARENA.x, ARENA.y, ARENA.width, ARENA.height, { fill: "#0a1220", stroke: "#334761", "stroke-width": 1 }),
    ...Array.from({ length: 17 }, (_, index) => Shapes.line(ARENA.x + 24 + index * 48, ARENA.y, ARENA.x + 24 + index * 48, ARENA.y + ARENA.height, { stroke: "#18283b", "stroke-width": 1 })),
    ...Array.from({ length: 10 }, (_, index) => Shapes.line(ARENA.x, ARENA.y + 24 + index * 48, ARENA.x + ARENA.width, ARENA.y + 24 + index * 48, { stroke: "#18283b", "stroke-width": 1 })),
  ], { collisionShapes: [] }));
}

const menu = engine.addScene("menu", new Scene("menu", WIDTH, HEIGHT));
addStars(menu);
menu.addObject(new PanelObject(WIDTH / 2, HEIGHT / 2, 550, 486, { color: "#0b1422", border: "#26384e", radius: 14 }));
menu.addObject(new ShapeObject([Shapes.text("!", { x: 0, y: 0, fill: "#ff6b85", fontSize: 72, fontFamily: "monospace", align: "middle", baseline: "middle" })], { x: WIDTH / 2, y: 126, collisionShapes: [] }));
menu.addObject(new TextObject("WARNING!", { x: WIDTH / 2, y: 186, size: 36, color: "#f4f7fb", font: "sans-serif" }));
menu.addObject(new TextObject("予告を見て、避けろ。", { x: WIDTH / 2, y: 226, size: 18, color: "#9eb0c8", font: "sans-serif" }));
menu.addObject(new TextObject("生き残った時間がスコアになる。", { x: WIDTH / 2, y: 254, size: 14, color: "#71839b", font: "sans-serif" }));
menu.addObject(new TextObject("体力", { x: 314, y: 322, size: 15, color: "#dce6f2", align: "start", font: "sans-serif" }));
const healthValue = menu.addObject(new TextObject("", { x: WIDTH / 2, y: 355, size: 26, color: "#ff7185" }));
const speedValue = menu.addObject(new TextObject("", { x: WIDTH / 2, y: 424, size: 17, color: "#72ecff" }));
menu.addObject(new ButtonObject("−", 382, 355, 46, 40, () => { settings.health = Math.max(1, settings.health - 1); refreshSettings(); }, { background: "#1a2b40", color: "#e8f1fa", border: "#38506b", size: 22 }));
menu.addObject(new ButtonObject("+", 578, 355, 46, 40, () => { settings.health += 1; refreshSettings(); }, { background: "#1a2b40", color: "#e8f1fa", border: "#38506b", size: 22 }));
menu.addObject(new TextObject("全体速度", { x: 314, y: 394, size: 15, color: "#dce6f2", align: "start", font: "sans-serif" }));
menu.addObject(new ButtonObject("−", 382, 424, 46, 38, () => { settings.speed = Math.max(0.35, Math.round((settings.speed - 0.05) * 100) / 100); refreshSettings(); }, { background: "#1a2b40", color: "#e8f1fa", border: "#38506b", size: 22 }));
menu.addObject(new ButtonObject("+", 578, 424, 46, 38, () => { settings.speed = Math.round((settings.speed + 0.05) * 100) / 100; refreshSettings(); }, { background: "#1a2b40", color: "#e8f1fa", border: "#38506b", size: 22 }));
const crazyLine1Text = menu.addObject(new TextObject("", { x: 642, y: 412, size: 10, color: "#ff8da7", align: "start", font: "sans-serif", opacity: 0 }));
const crazyLine2Text = menu.addObject(new TextObject("", { x: 642, y: 428, size: 10, color: "#ff8da7", align: "start", font: "sans-serif", opacity: 0 }));
const refreshSettings = () => {
  healthValue.setText(`♥  ${settings.health}`);
  speedValue.setText(`全体速度   ${Math.round(settings.speed * 100)}%`);
  const isCrazy = settings.speed >= 2;
  crazyLine1Text.setText(isCrazy ? crazyLine1 : "");
  crazyLine2Text.setText(isCrazy ? crazyLine2 : "");
  crazyLine1Text.opacity = isCrazy ? 1 : 0;
  crazyLine2Text.opacity = isCrazy ? 1 : 0;
  engine.timeScale = settings.speed;
};
menu.addObject(new ButtonObject("ゲーム開始  →", WIDTH / 2, 491, 248, 50, () => startRun(), { background: "#72ecff", color: "#07121b", size: 16 }));
menu.addObject(new TextObject("WASD / 矢印で移動     Spaceでダッシュ", { x: WIDTH / 2, y: 548, size: 13, color: "#95a6bb" }));
menu.addObject(new TextObject(`${PATTERNS.length}種の攻撃  ·  ${COMBINATION_COUNT}+通りの組み合わせ`, { x: WIDTH / 2, y: 572, size: 11, color: "#5f738d" }));
refreshSettings();

const play = engine.addScene("play", new Scene("play", WIDTH, HEIGHT));
addArena(play);
play.arena = ARENA;
play.status = "ready";
play.paused = false;
play.gameTime = 0;
play.score = 0;
play.best = settings.best;
play.comboNumber = 0;
play.usedSignatures = [];
play.nextAttackAt = 1.4;
play.hazards = [];
play.warningObjects = [];
play.player = play.addObject(new PlayerObject(play, WIDTH / 2, HEIGHT / 2));

const scoreReadout = play.addObject(new TextObject("SCORE  000000", { x: 62, y: 25, size: 14, color: "#eef5fc", align: "start" }));
const bestReadout = play.addObject(new TextObject(`BEST  ${scoreText(settings.best)}`, { x: 330, y: 25, size: 13, color: "#93a5bc", align: "start" }));
const lifeReadout = play.addObject(new TextObject("", { x: 760, y: 25, size: 15, color: "#ff6b85", align: "end" }));
const setReadout = play.addObject(new TextObject("SET 0", { x: 895, y: 25, size: 12, color: "#72ecff", align: "end" }));
const pausePanel = play.addObject(new PanelObject(WIDTH / 2, HEIGHT / 2, 300, 190, { color: "#0b1422", border: "#49627e", radius: 12, opacity: 0 }));
const pauseTitle = play.addObject(new TextObject("PAUSED", { x: WIDTH / 2, y: 284, size: 28, color: "#f4f7fb", font: "sans-serif", opacity: 0 }));
const resumeButton = play.addObject(new ButtonObject("続ける", WIDTH / 2, 360, 176, 48, () => togglePause(), { opacity: 0 }));
const pauseButton = play.addObject(new ButtonObject("Ⅱ", 888, 24, 40, 32, () => togglePause(), { background: "#142237", color: "#dce6f2", border: "#334761", size: 15 }));
play.registerCommand("tickScene", function () { tickPlayScene(this); });
play.setProgram(programURL("./programs/play-scene.js"));

const over = engine.addScene("over", new Scene("over", WIDTH, HEIGHT));
addStars(over);
over.addObject(new PanelObject(WIDTH / 2, HEIGHT / 2, 450, 356, { color: "#0b1422", border: "#26384e", radius: 14 }));
over.addObject(new TextObject("RUN COMPLETE", { x: WIDTH / 2, y: 180, size: 12, color: "#72ecff" }));
over.addObject(new TextObject("GAME OVER", { x: WIDTH / 2, y: 228, size: 36, color: "#f4f7fb", font: "sans-serif" }));
over.addObject(new TextObject("SURVIVAL SCORE", { x: WIDTH / 2, y: 289, size: 11, color: "#8c9db4" }));
const finalScore = over.addObject(new TextObject("000000", { x: WIDTH / 2, y: 337, size: 44, color: "#72ecff" }));
const finalBest = over.addObject(new TextObject("BEST  000000", { x: WIDTH / 2, y: 376, size: 12, color: "#9bacc2" }));
over.addObject(new ButtonObject("もう一度挑戦  →", WIDTH / 2, 429, 238, 47, () => startRun()));
over.addObject(new ButtonObject("設定に戻る", WIDTH / 2, 486, 172, 40, () => engine.switchScene("menu"), { background: "#1a2b40", color: "#dce6f2", border: "#38506b", size: 13 }));
over.registerCommand("tickScene", function () {});
over.setProgram(programURL("./programs/gameover-scene.js"));

menu.registerCommand("tickScene", function () { if (INPUT.pressed("Enter")) startRun(); });
menu.setProgram(programURL("./programs/menu-scene.js"));

function startRun() {
  console.info("[Game] starting run", { health: settings.health, speed: settings.speed });
  play.status = "playing"; play.paused = false; play.gameTime = 0; play.score = 0;
  play.comboNumber = 0; play.usedSignatures = []; play.nextAttackAt = 1.4;
  play.player.x = WIDTH / 2; play.player.y = HEIGHT / 2;
  play.player.health = settings.health; play.player.maxHealth = settings.health;
  play.player.invulnerable = 0; play.player.dashTime = 0; play.player.dashCooldown = 0;
  play.player.faceX = 1; play.player.faceY = 0;
  for (const hazard of [...play.hazards, ...play.warningObjects]) hazard.destroy();
  play.hazards.length = 0; play.warningObjects.length = 0;
  pausePanel.opacity = 0; pauseTitle.opacity = 0; resumeButton.opacity = 0;
  engine.timeScale = settings.speed;
  engine.switchScene("play");
}

function togglePause() {
  if (play.status !== "playing") return;
  play.paused = !play.paused;
  engine.timeScale = play.paused ? 0 : settings.speed;
  pausePanel.opacity = play.paused ? 1 : 0;
  pauseTitle.opacity = play.paused ? 1 : 0;
  resumeButton.opacity = play.paused ? 1 : 0;
}

function nextComboSize() {
  if (play.gameTime < 20) return 1;
  if (play.gameTime < 48) return 2;
  if (play.gameTime < 160) return 3;
  return 4;
}

function queueCombination() {
  const combo = makeCombination(nextComboSize(), Math.random, new Set(play.usedSignatures.slice(-8)));
  play.usedSignatures.push(combo.signature);
  if (play.usedSignatures.length > 24) play.usedSignatures.shift();
  play.comboNumber += 1;
  const intensity = 1 + Math.min(0.55, play.gameTime / 170);
  combo.patterns.forEach((pattern, index) => {
    const attack = prepareAttack(pattern, WIDTH, HEIGHT, play.player, Math.random, intensity);
    const warning = play.addObject(new WarningObject(play, attack, index * 0.58));
    play.warningObjects.push(warning);
  });
  play.nextAttackAt = play.gameTime + Math.max(1.25, 2.4 - play.gameTime * 0.005) + combo.patterns.length * 0.38;
}

function tickPlayScene(scene) {
  if (scene.status !== "playing") return;
  if (INPUT.pressed("Escape") || INPUT.pressed("KeyP")) { togglePause(); return; }
  if (scene.paused) return;
  const dt = scene._frameDelta;
  scene.gameTime += dt;
  scene.score = Math.floor(scene.gameTime * 100);
  if (scene.gameTime >= scene.nextAttackAt) queueCombination();
  scene.hazards = scene.hazards.filter((hazard) => !hazard._removed);
  scene.warningObjects = scene.warningObjects.filter((warning) => !warning._removed);
  for (const hazard of scene.hazards) {
    if (scene.player.invulnerable <= 0 && isCollision(scene.player, hazard)) {
      scene.player.health -= 1;
      scene.player.invulnerable = 1.05;
      scene.player.opacity = 0.45;
      if (scene.player.health <= 0) { finishRun(); return; }
      break;
    }
  }
  scoreReadout.setText(`SCORE  ${scoreText(scene.score)}`);
  lifeReadout.setText(scene.player.health > 8 ? `♥ × ${scene.player.health}` : Array.from({ length: scene.player.health }, () => "♥").join(" "));
  bestReadout.setText(`BEST  ${scoreText(settings.best)}`);
  setReadout.setText(`SET ${scene.comboNumber}  ·  ${scene.gameTime < 20 ? "SINGLE" : `${nextComboSize()}× MIX`}`);
}

function finishRun() {
  play.status = "over";
  settings.best = Math.max(settings.best, play.score);
  saveBest(settings.best);
  finalScore.setText(scoreText(play.score));
  finalBest.setText(`BEST  ${scoreText(settings.best)}`);
  engine.timeScale = settings.speed;
  engine.switchScene("over");
}

play.activateAttack = function (attack) {
  for (const spec of fireAttack(attack, Math.min(2.4, 1 + play.gameTime / 95))) play.spawnHazard(spec);
};
play.spawnHazard = function (spec) {
  const hazard = this.addObject(new HazardObject(this, spec));
  this.hazards.push(hazard);
  return hazard;
};
play.spawnBullet = function (spec) { return this.spawnHazard(spec); };
play.spawnRadial = function (x, y, count, speed, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.PI * 2 * i / count;
    this.spawnBullet({ kind: "bullet", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 5, color });
  }
};

function isCollision(player, hazard) {
  const dx = player.x - hazard.x, dy = player.y - hazard.y;
  if (hazard.kind === "beam") {
    const px = Math.max(hazard.x - hazard.width / 2, Math.min(player.x, hazard.x + hazard.width / 2));
    const py = Math.max(hazard.y - hazard.height / 2, Math.min(player.y, hazard.y + hazard.height / 2));
    return Math.hypot(player.x - px, player.y - py) < player.radius * (hazard.danger ?? 1);
  }
  if (hazard.kind === "sweep") return Math.abs(hazard.horizontal ? dy : dx) < 24 + player.radius;
  if (hazard.kind === "mine" && !hazard.exploded) return Math.hypot(dx, dy) < hazard.radius + player.radius;
  return hazard.kind === "bullet" && (hazard.delay ?? 0) <= 0 && Math.hypot(dx, dy) < player.radius + hazard.radius * 0.8;
}

engine.start("menu");
