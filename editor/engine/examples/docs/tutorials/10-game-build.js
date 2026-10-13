export default {
  slug: "10-game-build",
  title: "ゲームを組み立てる",
  summary: "入口にあるゲームを、部品ごとに分解して組み立てる流れを学びます。",
  explanation: [
    "ゲームは「見た目」「入力」「衝突」「スコア」「終了判定」の5つを組み合わせて作ります。最初に`Player`をどう動かすか、次に敵や障害物をどう出現させるか、最後に点数やゲームオーバー条件をどう処理するかを分けて考えると、複雑に感じる作品も整理しやすくなります。たとえば回避ゲームなら「Player」「Enemy」「Spawner」「Score」「GameOver」の5つが基本です。シューティングなら「Ship」「Bullet」「Enemy」「HitCheck」「Wave」が中心になります。",
    "このプロジェクトでは、ページ一覧にあるゲームの種類を見て、どの要素が共通化できるかを見抜くのが重要です。問題回答ゲームは`INPUT`と`TextObject`、回避ゲームは移動と当たり判定、対戦ゲームはターンと状態遷移、ミッション型ゲームは条件とタスク管理を中心に考えます。つまり、ゲームの見た目が違っても、内部では同じような部品が使えることが多いのです。チュートリアルを読み進めると、これらの部品がそれぞれどこから来たものかが分かるようになります。",
    'エディタページを使うときは、まず`main.js`にコードを書く前に、ファイルツリーから`＋ JS`で役割ごとのファイルを作ります。例として`player.js`、`enemy.js`、`score.js`、`main.js`のように分けると、ゲームの状態が追いやすくなります。必要に応じてSVGアセットを`＋ 新しいSVG`で作り、そのURLを`GameStudio.assetUrl("ship")`や`data:` URLとして使うと、見た目の素材とロジックをきれいに分離できます。作業の流れは、まず形を作る→動かす→当たる→点数をつける→調整する、という順番がわかりやすいです。',
    "チュートリアルを使って作るときは、最初の一歩として小さな図形の動きだけを試し、その後に敵を増やし、次に当たり判定、最後にスコアや終了条件を足すのが安全です。複雑なゲームを一括で作ろうとすると、どこで壊れたかわからなくなるため、機能ごとに切り分けて確認します。完成形に近いゲームのコードを見ると、各章の小さな例がどこに使われているかが連続して見えるようになります。これで、ゲームの本体ページの見た目は違っても、作り方の骨格が同じであることがわかるようになります。",
  ],
  exercises: [
    "回避ゲームの構成を`Player`・`Enemy`・`Score`・`Main`に分解し、どこでループと描画を持つべきか説明する。",
    "題材としてシューティング、スネーク、計算問題のどれを選ぶか決め、必要な部品をリストアップする。",
    "Studioで`main.js`と`assets`を分けて、小さなゲームの骨組みを作り、次にSVG素材を入れて見た目を整える。",
  ],
  examples: [
    {
      title: "小さな回避ゲームを組み立てる",
      goal: "入力・移動・敵生成・衝突・スコアの基本を1つのサンプルにまとめる。",
      note: "この例はゲームの骨格を示すものです。実際のゲームでは敵や背景をファイル分割して作ります。",
      code: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";

class Player extends GameObject {
  constructor() {
    super({ x: 120, y: 260, tags: ["player"], shapes: [Shapes.circle(18, { fill: "#38bdf8" })] });
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-220 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(220 * dt);
    if (INPUT.onKey("ArrowUp")) this.moveY(-220 * dt);
    if (INPUT.onKey("ArrowDown")) this.moveY(220 * dt);
  }
}

class Enemy extends GameObject {
  constructor(x, y) {
    super({ x, y, tags: ["enemy"], shapes: [Shapes.circle(12, { fill: "#f87171" })] });
    this.speedY = 140 + Math.random() * 80;
  }
  onUpdate(dt) {
    this.moveY(this.speedY * dt);
    if (this.y > 420) this.destroy();
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#0f172a" }));
let score = 0;
const player = engine.addObject(world, new Player());
engine.setDebug({ hitboxes: true, fps: true });

setInterval(() => {
  const enemy = new Enemy(Math.random() * 600 + 20, -20);
  engine.addObject(world, enemy);
}, 600);

engine.onUpdate = (dt) => {
  for (const object of world.objects) {
    if (object.tags.includes("enemy") && object.touching("player")) {
      score = Math.max(0, score - 1);
      object.destroy();
    }
  }
  if (Math.random() < 0.08 * dt) {
    score += 1;
  }
};

engine.start();`,
    },
    {
      title: "ゲームを段階的に作る",
      goal: "最初に小さいコアを作り、だんだん部品を足していくことを体験する。",
      note: "ゴールを見据えたとき、どの部品をあとで差し込むかが見えやすくなります。",
      code: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";

class Hero extends GameObject {
  constructor() {
    super({ x: 320, y: 220, tags: ["hero"], shapes: [Shapes.rect(38, 38, { fill: "#a78bfa" })] });
    this.vx = 0;
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.vx = -180;
    else if (INPUT.onKey("ArrowRight")) this.vx = 180;
    else this.vx *= 0.85;
    this.moveX(this.vx * dt);
    this.rotation += 60 * dt;
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#111827" }));
engine.addObject(world, new Hero());
engine.start();`,
    },
  ],
};
