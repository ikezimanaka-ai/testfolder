const explanation = [
  "この実例集は、コードを書き換えてCanvasの変化を確かめるための小さな作業場です。各例には別々のMonacoエディターと実行ボタン、隔離されたCanvasプレビューがあります。一方の例を実行し直しても、もう一方のCanvasやコードは置き換わりません。章の説明を読み、最初の例をそのまま動かし、それから数値や色を一つだけ変えて差を観察するのが基本です。コードの変更はこのブラウザー内に保存されるので、ページを開き直して続けられます。「初期コード」を押すと、その例だけを最初の状態へ戻せます。何か表示されなくなったときは、まず初期コードに戻してから、直前に変えた行を一つずつ調べると原因を切り分けやすくなります。",
  "最初に出会うEngineは、Canvasのサイズ調整、フレーム更新、DisplayとObjectの描画をまとめる中心です。`new Engine(canvas, fps, logicalWidth, logicalHeight)`の第1引数はHTMLCanvasElement、第2引数は目標の更新頻度、第3・第4引数はゲーム内の論理幅と高さです。論理サイズはブラウザー上の実ピクセル数ではありません。たとえば800×450の論理画面を、400×225の小さな枠に表示しても、ゲーム内の座標を半分に書き換える必要はありません。Canvasが大きくなった場合も同じです。Engineは縦横比を守って表示するため、画面の形が異なると上下または左右に余白ができます。余白をゲーム画面の一部と誤解しないことが、座標を扱う最初のコツです。",
  "`Display`はゲーム画面内の領域と、その領域に属するObjectをまとめます。たいていのゲームでは、背景やキャラクターを置くworldと、スコアやメニューを置くhudを別々に用意すると整理しやすくなります。`engine.newDisplay(new Display(\"world\", width, height, options))`で登録し、返されたDisplayにObjectを追加します。DisplayのxとyはCanvas上にその領域を置く位置で、ObjectのxとyはそのDisplay内での位置です。つまりDisplayを移動すれば、中のObjectすべてをまとめて移動できます。Displayの大きさを超えた描画はクリップされますが、更新そのものが止まるわけではありません。表示領域とゲームの更新範囲は同じ概念ではないと覚えておきましょう。",
  "最初の例では、論理サイズと実Canvasサイズの関係、Engineの作成、Displayの登録、矩形形状を持つGameObjectの配置、そしてstartの順序を確認できます。Objectの`Shapes.rect(width, height)`は中心を原点とした矩形を作るため、Objectの位置が図形の中心になります。例の正方形の位置を変えると図形全体が移動しますが、矩形の寸法はそのままです。`engine.start()`を呼ぶまでは通常フレーム更新されないため、全てのDisplayと初期Objectを先に作り、それから開始するのが見通しの良い順番です。色は図形定義のfillで指定します。Canvas背景の色とObject自身の塗り色を分けて考えると、画面のどの層の見た目を変えているのかが明確になります。",
  "二つ目の例は、同じCanvasに小さなworldとHUD Displayを重ねます。Displayは追加された順に描画されるので、後から登録したHUDはworldより手前に見えます。片方のDisplayの位置・幅・高さを変え、内側のObjectを同じままにして、クリップ領域や配置がどう変化するかを試してください。片方のDisplayの背景色を設定しても、もう片方のDisplayの背景やObjectは消えません。ゲームを複数のレイヤーに分けるのは、ただ見た目を重ねるだけでなく、背景・プレイ領域・操作表示を別々に管理する助けになります。ただし、Displayを増やしすぎて一つのObjectごとにレイヤーを作る必要はありません。動作や描画順、クリップ範囲が異なるまとまりごとに分けるのが実用的です。",
  "この章では、まずEngineを一つ作り、Displayを登録し、図形を一つ置いて起動するという最小構成を身体で覚えます。値を試すときは、論理画面サイズ、Displayのサイズ、Displayの位置、Objectの位置、shapeの大きさを一度に全部変えず、一項目ずつ変更してください。画面が見切れたらDisplayのクリップ範囲、Objectの場所、図形自体の座標のどこを変えたか確認します。実際のCanvasサイズと論理サイズが異なる状態を作ることも大切です。プレビュー枠を狭くしても同じゲーム内座標を使えることがこの設計の利点です。次の章では、矩形以外のShapeを組み合わせて絵を描きます。この章で作ったEngineとDisplayの骨格は、そのまま次の例でも繰り返し使います。",
];

export default {
  slug: "01-engine",
  title: "最初の画面とEngine",
  summary: "Engine、Display、論理座標、Canvasプレビューの土台を作ります。",
  explanation,
  exercises: [
    "1つ目の例で論理サイズを640×360から320×180へ変更し、Objectの座標を変えずに表示を確認する。",
    "2つ目の例でHUDの位置とサイズを変更し、ObjectがDisplay境界でクリップされる様子を調べる。",
    "Displayをもう一枚作って背景色を指定し、登録順を入れ替えて重なり順を比べる。",
  ],
  examples: [
    {
      title: "EngineとDisplayを作る",
      goal: "最小のCanvasゲームを起動し、中心基準の矩形を描く。",
      note: "Engineは論理サイズを基準にCanvasへ描画します。Display内のObjectはそのDisplayの座標系で置きます。",
      code: `import { Engine, Display, GameObject, Shapes } from "./engine.js";

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, {
  background: "#172554",
}));
engine.addObject(world, new GameObject({
  x: 320, y: 180,
  shapes: [Shapes.rect(120, 80, { fill: "#38bdf8" })],
}));
engine.start();`,
    },
    {
      title: "worldとHUDを重ねる",
      goal: "Displayの原点・位置・大きさと描画順を確かめる。",
      note: "Displayは追加順に描画されます。小さなHUD Displayからはみ出す図形の部分は表示されません。",
      code: `import { Engine, Display, GameObject, Shapes } from "./engine.js";
import { TextObject } from "./ui-objects.js";

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, {
  background: "#064e3b",
}));
engine.addObject(world, new GameObject({
  x: 320, y: 180,
  shapes: [Shapes.circle(110, { fill: "#16a34a" })],
}));
const hud = engine.newDisplay(new Display("hud", 220, 90, {
  x: 24, y: 24, background: "#0f172acc",
}));
engine.addObject(hud, new TextObject("SCORE 000", {
  x: 14, y: 34, fontSize: 22, color: "#fef3c7",
}));
engine.start();`,
    },
  ],
};
