export default {
  slug: "09-file-structure-svg",
  title: "ファイル構造とSVGアセット",
  summary: "JSファイルを分け、SVGをファイルとして扱い、コードから読み込む方法を学びます。",
  explanation: [
    "ゲームを作るときは、すべてのコードを1つの`main.js`に詰め込むより、役割ごとに分けたほうが管理しやすくなります。たとえば`main.js`は開始処理と画面の接続、`player.js`はプレイヤーの動き、`enemy.js`は敵の生成、`ui.js`はスコア表示とメニューなどに分けると、1つの機能を確認しやすくなります。Studioの左側のファイルツリーでは、`＋ JS`でファイルを追加し、`main.js`がエントリーポイントになるように整理します。`engine.js`と`ui-objects.js`はエンジン本体として予約済みで、ユーザーコード側では必要に応じて追加ファイルを作ります。",
    "ファイル分割のポイントは、依存の方向を揃えることです。`main.js`から`player.js`へ依存を持ち、`player.js`が`engine.js`だけを使うようにすると、見通しがよくなります。逆に、敵コードがプレイヤーを直接知りすぎると、データの流れが複雑になります。小さなゲームでも、オブジェクトの状態・入力・描画・衝突判定をそれぞれ別ファイルに分けると、デバッグしやすくなります。ルールの中で「何を描くか」「何を判定するか」「何を勝敗に使うか」をファイルごとに割り当てると、作業の順番も組み立てやすくなります。",
    "SVGアセットは、Studioの`SVGアセット`タブで`＋ 新しいSVG`を押して作成できます。図形ツールを選び、矩形・円・線・多角形を組み合わせて素材を作成し、`SVGソース`でテキストにして微調整します。多角形は`多角形`ツールを選んだ状態で、3点以上をクリックして、最後にダブルクリックで確定します。最初の点に戻ると閉じて、`polygon`として保存されます。慣れないうちは、床ブロックや矢印、ロケットの形を小さく作って、使うときにどう見えるかを確認するとよいです。",
    '作成したSVGはコード側で使うときに、`GameStudio.assetUrl("asset-name")`でURLへ変換します。たとえば`const shipUrl = GameStudio.assetUrl("ship")`のようにして、`engine.loadSVG(shipUrl)`や`ImageObject`に渡せます。コード上でSVG文字列を直接書く場合は`data:image/svg+xml;charset=utf-8,` + `encodeURIComponent(svgText)`の形にしてURL化します。実際のプロジェクトでは、図形の素材をSVGとして作るならアセット化し、ロジックコードはゲームの制御に集中させるのが分かりやすいです。アセット名は`ship`, `bullet`, `background`のように、用途がはっきり分かるものにしておくと、あとから見直ししやすくなります。',
    'この章で大事なのは、`見た目`と`ロジック`を分けることです。SVG素材は「何を描くか」、JavaScriptは「どう動くか」を担当し、`Shapes`や`GameObject`はその2つを繋ぐ役割です。たとえば背景に使うSVGを1枚作り、`game`の描画の中で`engine.loadSVG`して使うと、画像やスプライトの管理が楽になります。最初から複雑なロジックを全部書くより、まずはアセットを作って試し、その後でゲームの状態をどう表示するかを決めると、迷いが少なくなります。次章では、これらの要素を組み合わせて、実際のゲームを1つずつ組み立てる流れを見ます。',
  ],
  exercises: [
    'Studioのプロジェクトツリーで`＋ JS`と`＋ 新しいSVG`を使い、簡単な`main.js`と`player.svg`を作成する。',
    '作ったSVGを`GameStudio.assetUrl("player")`経由か、`data:` URL経由で読み込み、`engine.loadSVG`で表示する。',
    '多角形のSVGを2つほど作り、同じような図形でも角の数や位置の違いで見え方が変わることを確認する。',
  ],
  examples: [
    {
      title: "SVGのURLを読み込む",
      goal: "文字列のSVGをURLへ変換し、画像として描画する。",
      note: 'Studioでは同じ処理を`GameStudio.assetUrl("ship")`に置き換えればよいです。',
      code: `import { Engine, Display, GameObject, Shapes } from "./engine.js";

const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <path d="M48 10 L74 52 L48 82 L22 52 Z" fill="#38bdf8" stroke="#0f172a" stroke-width="3"/>
  <circle cx="48" cy="34" r="8" fill="#e0f2fe"/>
</svg>\`;
const imageUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

class Ship extends GameObject {
  constructor() {
    super({ x: 180, y: 180, width: 96, height: 96, tags: ["ship"] });
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#0f172a" }));
const ship = engine.addObject(world, new Ship());
ship.width = 96;
ship.height = 96;
ship.setPrivate("spriteUrl", imageUrl);
ship.onDraw = (ctx) => {
  const img = new Image();
  img.onload = () => ctx.drawImage(img, ship.x - 48, ship.y - 48, 96, 96);
  img.src = imageUrl;
};
engine.start();`,
    },
    {
      title: "多角形を作ってSVGにする",
      goal: "図形ツールの基本を理解し、見た目の作成に使えるようにする。",
      note: "多角形は3点以上をクリックし、ダブルクリックで確定。ここでは点の並び順が見た目と一致することが重要です。",
      code: `import { Engine, Display, GameObject, Shapes } from "./engine.js";

const triangle = Shapes.polygon([[0, -26], [22, 18], [-22, 18]], { fill: "#facc15", stroke: "#111827", "stroke-width": 2 });
const hex = Shapes.polygon([[-22, -18], [0, -28], [22, -18], [22, 18], [0, 28], [-22, 18]], { fill: "#34d399" });

class Marker extends GameObject {
  constructor(x, y, shape) {
    super({ x, y, shapes: [shape] });
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#172554" }));
engine.addObject(world, new Marker(180, 180, triangle));
engine.addObject(world, new Marker(460, 180, hex));
engine.start();`,
    },
  ],
};
