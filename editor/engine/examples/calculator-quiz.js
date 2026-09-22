import { Engine, Display } from "../engine.js";
import { TextObject, ButtonObject } from "../ui-objects.js";

const canvas = document.querySelector("#game");
const engine = new Engine(canvas, 60, 800, 450);
const world = engine.newDisplay(new Display("quiz", 800, 450, { background: "#172554" }));
const question = engine.addObject(world, new TextObject("問題を出すを押してください", { x: 400, y: 100, anchor: "middle", fontSize: 36, color: "#f8fafc" }));
const answerView = engine.addObject(world, new TextObject("入力: ", { x: 400, y: 180, anchor: "middle", fontSize: 30, color: "#bae6fd" }));
const result = engine.addObject(world, new TextObject("Canvasをクリックしてからキーボード入力", { x: 400, y: 225, anchor: "middle", fontSize: 18, color: "#bfdbfe" }));
const scoreView = engine.addObject(world, new TextObject("スコア: 0 / 0", { x: 400, y: 410, anchor: "middle", fontSize: 18, color: "#cbd5e1" }));
let answer = 0;
let typed = "";
let score = 0;
let count = 0;
let active = false;

const newButton = engine.addObject(world, new ButtonObject("問題を出す", { x: 190, y: 275, width: 180, height: 55 }));
const submitButton = engine.addObject(world, new ButtonObject("答える", { x: 430, y: 275, width: 180, height: 55, background: "#0f766e", hoverBackground: "#14b8a6" }));

function newQuestion() {
  const a = 2 + Math.floor(Math.random() * 9);
  const b = 2 + Math.floor(Math.random() * 9);
  answer = a + b;
  typed = "";
  active = true;
  question.text = `${a} + ${b} = ?`;
  result.text = "数字・-・.を入力して「答える」";
  canvas.focus();
}

function submitAnswer() {
  if (!active) return;
  if (typed.trim() === "" || Number.isNaN(Number(typed))) {
    result.text = "数字を入力してください";
    return;
  }
  const correct = Number(typed) === answer;
  score += correct ? 1 : 0;
  count++;
  active = false;
  result.text = correct ? "せいかい！" : `ざんねん。正解は ${answer}`;
  scoreView.text = `スコア: ${score} / ${count}`;
}

canvas.addEventListener("keydown", (event) => {
  if (event.key === "Backspace") typed = typed.slice(0, -1);
  else if (/^[0-9.-]$/.test(event.key)) typed += event.key;
  else if (event.key === "Enter") submitAnswer();
  else if (!["Tab", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
});
newButton.onClick = newQuestion;
submitButton.onClick = submitAnswer;
world.onUpdate = () => { answerView.text = `入力: ${typed || "_"}`; };
engine.start();
canvas.focus();
