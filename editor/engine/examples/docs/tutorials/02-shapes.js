export default {
  slug: "02-shapes",
  title: "図形と座標",
  summary: "ShapesでCanvasの絵を組み立て、Object位置と図形内座標の関係をつかみます。",
  explanation: [
    "ゲーム画面は、画像素材がなくても単純な図形を組み合わせれば作れます。エンジンの`Shapes`は矩形、角丸矩形、円、楕円、線、多角形、テキストなどの図形定義を作る道具です。`shapes`配列に複数の図形を入れると、それらは一つのGameObjectとして描画されます。たとえば敵機を三角形と小さな円で表現したり、キャラクターを胴体・目・口の複数図形に分けたりできます。図形の色や線色、線幅はshapeの第2引数で設定します。見た目とObjectの状態を分離できるので、キャラクターを動かすと部品をまとめて移動でき、個別の図形を毎フレーム作り直す必要もありません。",
    "`Shapes.rect(width, height)`はObjectの原点を中心とする矩形です。幅120、高さ60なら中心から左右に60、上下に30伸びます。この中心基準はキャラクターやボールなど、回転させる図形に便利です。これに対して`Shapes.rectAt(x, y, width, height)`はDisplay内の原点から見た図形の左上を指定します。UIパネルや床のように、左上位置を基準に配置したいときに使いやすい形です。同じ幅と高さでも、この二つではObject座標に対する図形の位置が異なります。Objectのx,yを変えたとき、どちらの端や中心が動くのかを意識してください。座標が意図とずれた場合は、shape座標が中心基準か左上基準かを最初に確認すると解決しやすくなります。",
    "円と楕円は原点中心の`Shapes.circle(radius)`と`Shapes.ellipse(rx, ry)`を使います。円は同じ半径を上下左右に持ち、楕円は横方向と縦方向に別の半径を持ちます。円を`scaleX`だけ拡大しても楕円にできますが、形状自体の半径を指定したほうが、当たり判定やデザインの意図を読み取りやすくなります。線は`Shapes.line(x1, y1, x2, y2, style)`で2点を結び、多角形は点の配列を`Shapes.polygon([[x1,y1], ...])`へ渡します。多角形は最後の点と最初の点が結ばれて閉じます。線や輪郭だけを描く場合は`fill: \"none\"`にし、`stroke`と`stroke-width`で線を調整します。閉じた塗り図形と開いた線図形を混同しないのがポイントです。",
    "TextをCanvasへ出す方法は二通りあります。小さな装飾であれば`Shapes.text(\"文字\", x, y, style)`を他のshapeと並べられます。一方、テキストの内容や色をゲーム中に変える表示には`TextObject`が便利です。TextObjectの`x,y`は文字列の基準位置で、`anchor`をstart、middle、endに設定すると横方向の揃え方を決められます。サイズは`fontSize`、フォントは`fontFamily`、色は`color`で指定します。スコアのように頻繁に更新する文字を図形配列の作り直しで表すより、文字Objectの`text`だけを書き換える方が、何が変化するのか明確です。図形の座標と文字のベースラインは別の考え方なので、サンプルを一つずつ動かしてから、意図する配置のルールを決めましょう。",
    "第一の例は、図形を一個ずつ別Objectにしなくても、一つのObjectの中に矩形・円・線を持てることを示します。原点が中央にある部品は、`Shapes.rect`や`Shapes.circle`で同じ場所を基準に重ねられます。二つ目の例は、`rectAt`で左上を指定する背景パネル、楕円、塗りなし多角形、TextObjectを組み合わせます。最初にObjectを作り、shapeを加える手順と、TextObjectを別のObjectとして作る手順の違いを比べてください。図形配列内の複数要素は一緒に変形・透明化されます。テキストは独立したObjectなので、他の部品に影響せず内容や位置を更新できます。ゲームの見た目をどの単位で分割するかは、後で操作や判定をどう扱いたいかで考えると良いでしょう。",
    "実験では、一つ目の矩形サイズを変更し、位置を回転中心として色々な角度に傾けてください。次に`rect`を`rectAt`へ置き換え、同じx,yで図形がどう移動するか確認します。円の半径や楕円のrx/ry、polygonの各点、stroke幅、fillを順番に変えてみます。図形を追加したのに見えないときは、画面の外に置かれていないか、塗りがnone/transparentになっていないか、Displayのclip範囲を超えていないか、色が背景と同化していないか確認します。例のコードはJavaScriptなので、カンマや角括弧の対応も診断表示に出ます。次の章では、図形をGameObjectのクラスにまとめ、位置や状態を毎フレーム更新する方法を学びます。",
  ],
  exercises: [
    "二つ目の例の多角形を、点を追加して六角形にする。最後に始点と終点が結ばれることを確認する。",
    "TextObjectのanchorとxを変え、中央揃えのラベルを作る。Canvas幅を変えても中央に来る式を考える。",
    "同じ見た目をShapes配列一つのObjectと、部品別Objectで作り、移動・回転の違いを比べる。",
  ],
  examples: [
    {
      title: "図形を重ねて一つのObjectにする",
      goal: "中心基準の矩形・円と線を組み合わせ、図形単位のスタイルを試す。",
      note: "Shapes配列内の全図形は一つのGameObjectに属します。x,yを変えると一緒に移動します。",
      code: `import { Engine, Display, GameObject, Shapes } from "./engine.js";

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#0f172a" }));
engine.addObject(world, new GameObject({
  x: 320, y: 180, rotation: -8,
  shapes: [
    Shapes.rect(190, 88, { fill: "#7c3aed", stroke: "#c4b5fd", "stroke-width": 4 }),
    Shapes.circle(24, { fill: "#facc15" }),
    Shapes.line(-85, 0, 85, 0, { stroke: "#ffffff", "stroke-width": 3 }),
  ],
}));
engine.start();`,
    },
    {
      title: "左上座標・楕円・多角形・文字",
      goal: "rectAtとTextObjectを使い、左上基準の画面部品を組む。",
      note: "rectAtのx,yは左上です。TextObjectは内容を後から更新できる別Objectです。",
      code: `import { Engine, Display, GameObject, Shapes } from "./engine.js";
import { TextObject } from "./ui-objects.js";

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#1e293b" }));
engine.addObject(world, new GameObject({
  x: 0, y: 0,
  shapes: [Shapes.rectAt(35, 35, 570, 290, { fill: "#334155" })],
}));
engine.addObject(world, new GameObject({
  x: 320, y: 165,
  shapes: [
    Shapes.ellipse(115, 68, { fill: "#0ea5e9" }),
    Shapes.polygon([[-70, 15], [0, -55], [70, 15]], { fill: "none", stroke: "#f8fafc", "stroke-width": 5 }),
  ],
}));
engine.addObject(world, new TextObject("Shapes と TextObject", {
  x: 320, y: 285, anchor: "middle", fontSize: 24, color: "#fef3c7",
}));
engine.start();`,
    },
  ],
};
