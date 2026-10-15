const svgDataUri = (svgText) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;

const studioWorkflowDiagram = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="300" viewBox="0 0 760 300">
  <defs>
    <linearGradient id="g1" x1="0" x2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="760" height="300" fill="#020817"/>
  <rect x="24" y="36" width="170" height="220" rx="12" fill="#111c2e" stroke="#2a3a51"/>
  <text x="40" y="68" fill="#7dd3fc" font-size="18" font-family="sans-serif">プロジェクト</text>
  <rect x="40" y="90" width="136" height="26" rx="6" fill="#1e293b" stroke="#38bdf8"/>
  <text x="52" y="108" fill="#e2e8f0" font-size="14" font-family="sans-serif">main.js</text>
  <rect x="40" y="124" width="136" height="26" rx="6" fill="#1e293b" stroke="#38bdf8"/>
  <text x="52" y="142" fill="#e2e8f0" font-size="14" font-family="sans-serif">player.js</text>
  <rect x="40" y="158" width="136" height="26" rx="6" fill="#1e293b" stroke="#38bdf8"/>
  <text x="52" y="176" fill="#e2e8f0" font-size="14" font-family="sans-serif">enemy.js</text>
  <rect x="40" y="192" width="136" height="26" rx="6" fill="#1e293b" stroke="#38bdf8"/>
  <text x="52" y="210" fill="#e2e8f0" font-size="14" font-family="sans-serif">assets/</text>

  <rect x="230" y="44" width="240" height="200" rx="12" fill="#0b1120" stroke="#2a3a51"/>
  <text x="248" y="74" fill="#fdba74" font-size="18" font-family="sans-serif">エディタ</text>
  <rect x="250" y="92" width="200" height="118" rx="10" fill="#111827" stroke="#38bdf8"/>
  <text x="268" y="118" fill="#e2e8f0" font-size="14" font-family="sans-serif">main.js</text>
  <text x="268" y="146" fill="#94a3b8" font-size="12" font-family="sans-serif">GameStudio.log()</text>
  <text x="268" y="170" fill="#94a3b8" font-size="12" font-family="sans-serif">Player</text>
  <text x="268" y="194" fill="#94a3b8" font-size="12" font-family="sans-serif">Input</text>

  <rect x="510" y="50" width="210" height="120" rx="12" fill="#111827" stroke="#2a3a51"/>
  <text x="532" y="84" fill="#c4b5fd" font-size="18" font-family="sans-serif">プレビュー</text>
  <rect x="532" y="98" width="160" height="44" rx="10" fill="#0f172a" stroke="#38bdf8"/>
  <circle cx="566" cy="121" r="16" fill="#38bdf8"/>
  <rect x="588" y="108" width="72" height="12" rx="6" fill="#f8fafc" opacity="0.8"/>
  <rect x="588" y="124" width="52" height="10" rx="5" fill="#f8fafc" opacity="0.6"/>

  <rect x="510" y="188" width="210" height="70" rx="12" fill="#111827" stroke="#2a3a51"/>
  <text x="532" y="214" fill="#86efac" font-size="18" font-family="sans-serif">インスペクター</text>
  <text x="532" y="236" fill="#d1fae5" font-size="12" font-family="sans-serif">objects: 3</text>
  <text x="532" y="252" fill="#d1fae5" font-size="12" font-family="sans-serif">player.x = 180</text>

  <path d="M196 130 H230" stroke="#7dd3fc" stroke-width="4" stroke-linecap="round"/>
  <path d="M470 130 H510" stroke="#7dd3fc" stroke-width="4" stroke-linecap="round"/>
  <path d="M615 170 V188" stroke="#7dd3fc" stroke-width="4" stroke-linecap="round"/>
</svg>
`);

const assetsFlowDiagram = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="260" viewBox="0 0 760 260">
  <rect width="760" height="260" fill="#020817"/>
  <rect x="24" y="70" width="160" height="120" rx="14" fill="#111c2e" stroke="#2a3a51"/>
  <text x="48" y="104" fill="#fbd38d" font-size="18" font-family="sans-serif">SVG Editor</text>
  <path d="M52 122 L78 122 L92 138 L112 138 L128 122 L146 122" stroke="#38bdf8" stroke-width="4" fill="none"/>
  <circle cx="90" cy="150" r="22" fill="#38bdf8" opacity="0.9"/>
  <circle cx="132" cy="150" r="16" fill="#f472b6" opacity="0.9"/>

  <path d="M184 130 H254" stroke="#7dd3fc" stroke-width="4" stroke-linecap="round"/>
  <path d="M250 130 L270 130" stroke="#7dd3fc" stroke-width="4" stroke-linecap="round"/>

  <rect x="254" y="70" width="170" height="120" rx="14" fill="#111827" stroke="#2a3a51"/>
  <text x="284" y="104" fill="#7dd3fc" font-size="18" font-family="sans-serif">ファイルツリー</text>
  <rect x="276" y="118" width="126" height="28" rx="7" fill="#1e293b" stroke="#38bdf8"/>
  <text x="300" y="136" fill="#e2e8f0" font-size="14" font-family="sans-serif">ship.svg</text>

  <path d="M424 130 H494" stroke="#7dd3fc" stroke-width="4" stroke-linecap="round"/>

  <rect x="494" y="50" width="240" height="160" rx="14" fill="#111827" stroke="#2a3a51"/>
  <text x="520" y="82" fill="#a7f3d0" font-size="18" font-family="sans-serif">コード側</text>
  <text x="522" y="118" fill="#e2e8f0" font-size="13" font-family="monospace">const shipUrl =</text>
  <text x="522" y="142" fill="#e2e8f0" font-size="13" font-family="monospace">GameStudio.assetUrl("ship");</text>
  <rect x="520" y="162" width="180" height="24" rx="8" fill="#0f172a" stroke="#34d399"/>
  <text x="536" y="178" fill="#d1fae5" font-size="12" font-family="sans-serif">画像として描画</text>
</svg>
`);

const polygonWorkflowDiagram = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="260" viewBox="0 0 760 260">
  <rect width="760" height="260" fill="#020817"/>
  <path d="M110 148 L170 80 L232 148 L192 190 L146 188 Z" fill="#facc15" stroke="#f8fafc" stroke-width="3"/>
  <circle cx="140" cy="106" r="5" fill="#f8fafc"/>
  <circle cx="171" cy="80" r="5" fill="#f8fafc"/>
  <circle cx="214" cy="118" r="5" fill="#f8fafc"/>
  <circle cx="192" cy="190" r="5" fill="#f8fafc"/>
  <circle cx="146" cy="188" r="5" fill="#f8fafc"/>
  <text x="95" y="220" fill="#e2e8f0" font-size="18" font-family="sans-serif">1. 点を打つ</text>

  <path d="M370 150 L465 88 L544 150 L498 194 L410 192 Z" fill="#38bdf8" stroke="#f8fafc" stroke-width="3"/>
  <text x="405" y="220" fill="#e2e8f0" font-size="18" font-family="sans-serif">2. 位置を整える</text>

  <path d="M610 144 L650 90 L702 120 L708 184 L648 210 L612 178 Z" fill="#f472b6" stroke="#f8fafc" stroke-width="3"/>
  <text x="614" y="220" fill="#e2e8f0" font-size="18" font-family="sans-serif">3. SVGとして保存</text>
</svg>
`);

export default {
  slug: "11-studio-workflow",
  title: "Studioを使いこなす",
  summary: "プロジェクト管理、実行、診断、SVGエディタ、オブジェクト一覧を使ってゲーム作りを進める流れを学びます。",
  explanation: [
    "Studioは、1つの大きなコード欄ではなく、プロジェクトとして管理するための作業場です。左側の`プロジェクト`パネルでは`＋ JS`で新しいJavaScriptファイルを追加し、`main.js`から役割ごとに分けて管理できます。たとえば`main.js`が入口、`player.js`が移動、`enemy.js`が生成、`ui.js`が表示とすると、1つのゲームのコードを見通しよく保てます。コードを編集するときは、ファイルツリーで選んだファイルがエディタに読み込まれ、右側のCanvasで実行結果を見る形です。",
    "Studioの大きな強みは、コードと実行結果を並べて見られることです。`インスペクター`では、コード中の関数や変数、実行中に存在するObjectを確認できます。たとえば敵が出ていないときは、`objects`パネルで何が生成されているかを見ると、ゲームの状態が把握しやすくなります。`コンソール`や`診断`では、エラー文や`GameStudio.log()`の出力が残るため、バグの切り分けがしやすくなります。最初は表示が増えてうるさく見えても、問題の粒度を広げずに追えるので、あとから整理しやすいです。",
    "Studioでは複数のゲームを別々のプロジェクトとして管理できます。`プロジェクト一覧`から新しいプロジェクトを作成したり、不要なプロジェクトを削除したりできます。編集内容は下書きとして自動保存され、`Ctrl+S`または`保存`を押すと変更履歴に記録されます。`変更履歴`から過去の状態を選んで戻すと、その状態を新しい履歴として残すため、戻したあとでも以前の変更を確認できます。",
    "SVGアセット編集は`SVGアセット`タブで行います。矩形・円・線・多角形を描けば、ゲーム中の見た目を少しずつ作れます。特に多角形は、点の順番と閉じる位置が重要です。`多角形`ツールを選んで点を打ち、最後にダブルクリックすると確定されます。点が交差したり順番が崩れると、形が急に変わって見えるので、少しずつ修正しながら見た目を確認するとよいです。こちらはただの素材作成ではなく、ゲームの見た目とロジックの境界をつくる作業でもあります。",
    "Studioでゲームを作る手順は、だいたい次の流れになります。まず`main.js`に最小構成を作る→Canvasで動くことを確認する→`Player`や`Enemy`を分けて整理する→SVGを追加して見た目を整える→コンソールとインスペクターで調整する、という流れです。最初から全部を作ろうとせず、小さな円や四角が動く状態を作ってから、次に敵やUIやスコアを足していくと、どこで不具合が起きたかを特定しやすくなります。Studioは、この順番を自然に支えるための開発環境です。",
    "作成したSVGは、単に「編集画面の中にある素材」ではなく、ファイルとして保存されます。`SVGアセット`で保存したら、ファイルツリーに`ship.svg`や`background.svg`のような項目として残り、後で`GameStudio.assetUrl('ship')`のようにURLに変換して使えます。つまり、見た目とロジックを分離するための構成が自然に作れます。ここで`image`や`SVG`の仕組みを詳しく知りたいなら、見た目と外部素材の解説と、ファイル構造とSVGアセットの章を見てください。",
  ],
  media: [
    {
      title: "Studioの基本の流れ",
      alt: "プロジェクト、エディタ、プレビュー、インスペクターの4つが連携している図",
      caption: "左のファイルツリーから、中央のコード、右の実行結果を結びつけて動かします。",
      src: studioWorkflowDiagram,
    },
    {
      title: "SVGをファイルとして保存する流れ",
      alt: "SVG Editorからファイルツリーを経由してコード側へ渡る図",
      caption: "作成したSVGはファイルとして残り、`GameStudio.assetUrl()`でコードから使えます。",
      src: assetsFlowDiagram,
    },
    {
      title: "多角形の作り方",
      alt: "多角形の点を打つ→位置を整える→SVGとして保存する図",
      caption: "多角形は点の順序が重要。順番が崩れると見た目が変わるので、少しずつ修正して確認します。",
      src: polygonWorkflowDiagram,
    },
  ],
  links: [
    { label: "プロジェクト一覧", href: "../projects.html" },
    { label: "見た目と外部素材の解説", href: "./07-appearance-assets.html" },
    { label: "ファイル構造とSVGアセットの解説", href: "./09-file-structure-svg.html" },
    { label: "Studio本体の操作ページ", href: "../studio.html" },
  ],
  exercises: [
    "`＋ JS`と`＋ 新しいSVG`で、`main.js`と`background.svg`を作り、ファイルの役割が分かる構成にする。",
    "`Ctrl+S`で変更履歴を作り、`変更履歴`から過去の状態へ戻して履歴が残ることを確認する。",
    "`GameStudio.log`で経過を出し、`インスペクター`からObjectの数と位置を確認する。",
    "SVGエディタで多角形を作り、点の順番が見た目にどう影響するかを試す。",
    "`GameStudio.assetUrl('ship')`のようにして作成したSVGを、別ファイルから参照する流れを試す。",
  ],
  examples: [
    {
      title: "プロジェクトの最小構成を作る",
      goal: "コードを分けて管理しながら、ゲームの骨格を作る。",
      note: "Studioでは、こうした最小構成をまず作ってから、次に敵やUIを足していきます。",
      code: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";

GameStudio.log("Studioで最小構成を作成");

class Player extends GameObject {
  constructor() {
    super({ x: 180, y: 220, tags: ["player"], shapes: [Shapes.circle(18, { fill: "#38bdf8" })] });
  }

  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-220 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(220 * dt);
    if (INPUT.onKey("ArrowUp")) this.moveY(-220 * dt);
    if (INPUT.onKey("ArrowDown")) this.moveY(220 * dt);
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#0f172a" }));
engine.addObject(world, new Player());
engine.start();`,
    },
    {
      title: "SVGアセットを読み込む",
      goal: "SVGを素材として使い、ゲームの見た目を整える。",
      note: "Studioの`SVGアセット`タブで作った素材は、`GameStudio.assetUrl('player')`で使いまわせます。画像は一度だけ読み込んで再利用すると、ちらつきが出にくくなります。",
      code: `import { Engine, Display, GameObject, INPUT } from "./engine.js";

const shipUrl = GameStudio.assetUrl("ship");

class Ship extends GameObject {
  constructor() {
    super({ x: 320, y: 180, width: 80, height: 80, tags: ["ship"] });
    this.spriteUrl = shipUrl;
    this.img = new Image();
    this.img.src = this.spriteUrl;
  }

  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-220 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(220 * dt);
    if (INPUT.onKey("ArrowUp")) this.moveY(-220 * dt);
    if (INPUT.onKey("ArrowDown")) this.moveY(220 * dt);
  }

  onDraw(ctx) {
    if (this.img && this.img.width) {
      ctx.drawImage(this.img, this.x - 40, this.y - 40, 80, 80);
    }
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#111827" }));
engine.addObject(world, new Ship());
engine.start();`,
    },
  ],
};
