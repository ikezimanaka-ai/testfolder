const gameFiles = {
  "snake.js": { title: "へびゲーム", project: "snake-game" },
  "shooter.js": { title: "シューティング", project: "shooter-game" },
  "dodge-patterns.js": { title: "弾幕パターン", project: "dodge-patterns" },
  "calculator-quiz.js": { title: "計算クイズ", project: "calculator-quiz" },
  "desk-cleanup.js": { title: "デスク片付け", project: "desk-cleanup" },
};

for (const button of document.querySelectorAll("[data-project-source]")) {
  button.addEventListener("click", async () => {
    const status = document.querySelector("#project-download-status");
    const game = gameFiles[button.dataset.projectSource];
    if (!game) {
      status.textContent = "このサンプルは見つかりません。";
      return;
    }

    button.disabled = true;
    status.textContent = `${game.title}のソースコードを取得しています…`;
    try {
      const sourceUrl = new URL(`../../${button.dataset.projectSource}`, import.meta.url);
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = await response.text();
      const project = {
        title: game.project,
        activeFile: "main.js",
        files: [{ name: "main.js", path: "main.js", kind: "text", value: source }],
        assets: [],
      };
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${game.project}.json`;
      link.click();
      URL.revokeObjectURL(url);
      status.textContent = `${game.title}のJSONをダウンロードしました。Studioの「JSON読込」で開いてください。`;
    } catch (error) {
      status.textContent = `${game.title}をJSONにできませんでした: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
}

export default {
  slug: "12-import-example-games",
  title: "サンプルゲームを読み込む",
  summary: "examples内のゲームをJSONプロジェクトとしてダウンロードし、Studioへ取り込む方法を学びます。",
  explanation: [
    "Studioの`JSON読込`は、`title`、`activeFile`、`files`、`assets`を含むプロジェクトJSONを読み込みます。この章のダウンロードボタンは`examples`にあるゲームのJavaScriptソースを取得し、`main.js`としてプロジェクト形式にまとめます。ソースを複製して別管理するのではなく、ダウンロード時に元のゲームファイルを読み込むため、サンプル本体が更新された場合も最新のコードを取り込めます。",
    "ダウンロードしたJSONを読み込むには、`Game Engine Studio`を開いて上部の`JSON読込`を選び、ダウンロードした`.json`ファイルを指定します。読み込みが終わったら`実行`を押します。Studioのプレビューはゲームごとにiframeで隔離されているため、元のサンプルHTMLではなく、エンジンが提供する`#game`キャンバス上でゲームが起動します。",
    "元のゲームソースのimport文はそのままJSONに入ります。Studioは相対パスをプロジェクト内で解決し、`engine.js`と`ui-objects.js`をStudio側のモジュールへ接続します。そのため、サンプルゲームをStudio用に書き換えたり、`docs/editor.html`を変更したりする必要はありません。読み込んだプロジェクトを編集したら、必要に応じてStudioの`JSON書き出し`で変更後のコピーを保存できます。",
  ],
  links: [
    { label: "Game Engine Studioを開く", href: "../studio.html" },
    { label: "前章: Studioを使いこなす", href: "./11-studio-workflow.html" },
  ],
  exercises: [
    "へびゲームのJSONを読み込み、矢印キーで操作できることを確認する。",
    "シューティングを読み込み、コードを少し変更して実行結果を確かめる。",
    "読み込んだプロジェクトをJSON書き出しし、そのJSONから再度読み込めることを試す。",
  ],
  examples: [
    {
      title: "JSONプロジェクトの形",
      goal: "Studioがゲームのソースをどのようにプロジェクトとして扱うかを確認する。",
      note: "サンプルのダウンロードボタンはこの形式を使って、元のゲームソースをプロジェクトJSONにまとめます。",
      code: `import { Engine, Display, GameObject, Shapes } from "./engine.js";

const project = {
  title: "sample-project",
  activeFile: "main.js",
  files: [{
    name: "main.js",
    path: "main.js",
    kind: "text",
    value: "ゲームのJavaScriptソース",
  }],
  assets: [],
};

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("json-project", 640, 360, { background: "#0f172a" }));
engine.addObject(world, new GameObject({
  x: 320,
  y: 180,
  shapes: [Shapes.circle(36, { fill: "#38bdf8" })],
}));
engine.start();
console.log(JSON.stringify(project, null, 2));`,
    },
    {
      title: "サンプルのimportを保つ",
      goal: "エンジンとUIのimport文を含む既存ゲームをそのまま読み込む。",
      note: "たとえば`../engine.js`や`../ui-objects.js`のimportをStudioが解決するので、ソースを再編集せずに使えます。",
      code: `import { Engine, Display, GameObject, INPUT } from "../engine.js";
import { TextObject } from "../ui-objects.js";

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("imported-game", 640, 360, { background: "#102a43" }));
const player = engine.addObject(world, new GameObject({
  x: 320,
  y: 180,
  shapes: [document.createElementNS("http://www.w3.org/2000/svg", "circle")],
}));
player.shapes[0].setAttribute("r", 22);
player.shapes[0].setAttribute("fill", "#67e8f9");
engine.addObject(world, new TextObject("矢印キーで移動", { x: 20, y: 30, color: "#fff" }));
player.onUpdate = function (dt) {
  if (INPUT.onKey("ArrowLeft")) this.moveX(-180 * dt);
  if (INPUT.onKey("ArrowRight")) this.moveX(180 * dt);
};
engine.start();`,
    },
  ],
};
