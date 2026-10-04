export default {
  slug: "05-collision",
  title: "当たり判定と検索",
  summary: "図形から計算する衝突、タグ検索、複合条件、見た目と判定形状の分離を学びます。",
  explanation: [
    "衝突判定は、Objectの見た目のピクセルを直接比べるのではなく、`collisionShapes`に設定された図形の座標を使って計算します。未指定なら描画用の`shapes`が判定形状になります。矩形や多角形は図形の頂点を使って判定し、円・楕円も近似頂点を使うため、回転や拡大縮小を反映できます。図形形状が接触したかどうかは`a.intersects(b)`で調べられます。自分に接触している他Object一覧が必要なら`a.touching(criteria)`を使います。どちらもDisplay内の座標・形状を使うので、実際の画面ピクセル倍率に左右されません。まずは簡単な円や矩形から始め、図形が重なるときだけ処理が発生するのをCanvas上で見てください。",
    "描画形状と衝突形状を分けると、見た目の細かさと操作のしやすさを別々に調整できます。たとえば複雑な宇宙船をpolygon複数個で描きつつ、判定は少し小さなellipse一個にすることができます。キャラクターの画像全体を厳密に判定しようとすると作業が増え、透明な余白まで当たりと扱って操作しづらくなることもあります。`collisionShapes: [Shapes.circle(r)]`のように定義すれば、簡潔な円判定だけを使えます。反対に、判定が小さすぎると画面上で触れて見えるのに衝突しない印象になります。ルールとしてわかりやすく、プレイヤーに納得される大きさを選びます。衝突箱をdebug表示して、目視と判定のずれを確かめるのが実用的です。",
    "タグはObjectを役割で分類するSetです。`tags: [\"player\"]`、`tags: [\"enemy\"]`、`tags: [\"collectible\"]`のように付けると、`touching(\"enemy\")`や`display.getObjects(\"collectible\")`のように対象を検索できます。検索条件をオブジェクトにして、座標範囲や任意の値も組み合わせられます。`touching({ tags: [\"enemy\"], x: { min: 100, max: 300 } })`のような条件で、タグとx範囲の両方に合う接触対象を調べられます。プライベートな追加値は`setPrivate`と`getPrivate`に保持できます。たとえばteamやfactionなど、見た目・描画に直結しない判定条件を保存できます。条件検索を使いすぎるとルールが読みにくくなるので、よく使う役割をタグにし、特別な追加条件だけをcriteriaとして指定するのがおすすめです。",
    "最初の例ではPlayerが矢印キーで移動し、壁との接触を画面上で知らせます。例は毎フレーム壁との接触を調べますが、衝突開始時だけ音を鳴らすなどの処理を作る場合は、直前フレームの接触状態も保存して変化した瞬間を区別します。二つ目では描画用shapeとcollisionShapesを別々に設定し、タグ検索で敵だけを対象にします。タグが異なるObjectを追加し、検索結果に含まれないことを確認してください。GameObject自体を移動させたあとも形状の判定位置が追従すること、rotationやscaleを変えると変換後の形状を判定することも試せます。Shapeは中心基準か左上基準かを正しく使い、表示座標とcollisionShapesの座標を同じローカル座標系で書きます。",
    "衝突相手を消すときは`destroy()`を呼べます。複数の接触対象を同じフレームですべて消す場合、配列に残った参照を使って二重処理しないよう、`destroyed`のような状態で一度だけ反応させる手もあります。タグをクリアしたりopacityを0にする方法もありますが、表示だけ消しても検索には残る場合があるため、役割に応じて処理を選んでください。プレイヤーが敵に当たった場合はダメージ、弾が敵に当たった場合は双方を除去、プレイヤーがコインに当たった場合はスコア加算、と対象の組み合わせごとにルールが変わります。タグを使うと、全Objectを総当たりするだけでなく「この種類の接触を処理する」という意図がコードに表れます。",
    "当たり判定を調べるときは、見た目が交差しているかだけでなく、Objectの座標、ローカルshape座標、変形、Display位置、判定形状の種類を一つずつ確認します。debug表示を使い、期待する当たり判定輪郭がCanvasのどこにあるのか重ねて見ると原因が見つかりやすくなります。対象が多くなったらタグで先に候補を絞り、必要な判定だけを行います。衝突イベントそのものを大量に表示するとログが埋まるため、まず色変更やカウンターで検証し、仕組みが動いてからログを必要に応じて加えましょう。この章の例を変えて、接触する図形を矩形から円へ替える、判定サイズを見た目の半分にする、タグを変えるなどの比較をしてください。次の章では、ボタンやスライダーをCanvas上に作り、ユーザー入力を受け付けます。",
  ],
  exercises: [
    "PlayerのcollisionShapesを小さくし、見た目と判定範囲の違いをDebugで確認する。",
    "enemyタグ以外のObjectを追加してtouching(\"enemy\")の結果に入らないことを確かめる。",
    "衝突した相手をdestroyし、毎フレーム同じ衝突が再処理されないことを確認する。",
  ],
  examples: [
    {
      title: "移動して壁に触れる",
      goal: "touchingで接触相手を調べ、衝突時の見た目を変える。",
      note: "ObjectはcollisionShapesがなければshapesを判定形状として使います。",
      code: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";

class Player extends GameObject {
  constructor() {
    super({ x: 120, y: 180, tags: ["player"], shapes: [Shapes.circle(22, { fill: "#38bdf8" })] });
    this.speed = 180;
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-this.speed * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(this.speed * dt);
    const hit = this.touching("wall").length > 0;
    this.shapes[0].fill = hit ? "#ef4444" : "#38bdf8";
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#0f172a" }));
engine.addObject(world, new Player());
engine.addObject(world, new GameObject({
  x: 390, y: 180, tags: ["wall"],
  shapes: [Shapes.rect(60, 180, { fill: "#64748b" })],
}));
engine.setDebug({ hitboxes: true });
engine.start();`,
    },
    {
      title: "描画と判定を分けて敵だけを検索",
      goal: "見た目はpolygon、判定は円にしてタグで敵に接触したか調べる。",
      note: "touchingは接触しているObjectの配列を返します。判定形状は描画用Shapeと分けて設定できます。",
      code: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";
import { TextObject } from "./ui-objects.js";

class Ship extends GameObject {
  constructor() {
    super({
      x: 110, y: 180, tags: ["player"],
      shapes: [Shapes.polygon([[20, 0], [-18, -14], [-10, 0], [-18, 14]], { fill: "#38bdf8" })],
      collisionShapes: [Shapes.circle(12)],
    });
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowRight")) this.moveX(170 * dt);
    const enemies = this.touching({ tags: ["enemy"] });
    status.text = enemies.length ? "敵に接触！" : "右へ移動して敵に触れる";
    this.opacity = enemies.length ? .55 : 1;
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#172554" }));
const status = engine.addObject(world, new TextObject("", { x: 18, y: 30, fontSize: 18, color: "#fef3c7" }));
engine.addObject(world, new Ship());
engine.addObject(world, new GameObject({
  x: 390, y: 180, tags: ["enemy"],
  shapes: [Shapes.circle(34, { fill: "#fb7185" })],
}));
engine.setDebug({ hitboxes: true });
engine.start();`,
    },
  ],
};
