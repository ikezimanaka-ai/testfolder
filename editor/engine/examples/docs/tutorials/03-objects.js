export default {
  slug: "03-objects",
  title: "GameObjectと更新",
  summary: "クラス、状態、タグ、onStartとonUpdateを使って再利用できるObjectを作ります。",
  explanation: [
    "GameObjectは見た目だけでなく、ゲーム中の状態と動作をまとめる単位です。`new GameObject({ ... })`へx,y、tags、shapesなどを渡せますが、同じ種類の敵やアイテムを何個も作る場合はクラスを定義する方が重複を減らせます。`class Coin extends GameObject`のように継承し、constructorで共通の初期値を`super({...})`へ渡します。個体差はconstructorの引数として受け取り、色・位置・値などを保存します。クラスを使う利点は、全インスタンスの共通ルールを一か所に書けることです。変更時に複数の生成箇所を探し回らなくて済み、何のObjectなのかも名前から把握しやすくなります。",
    "constructorはObjectが作られる瞬間に呼ばれます。一方`onStart(engine)`はEngineが始まる際、そのObjectの初期化を行う場所です。たとえば開始時刻を記録したり、必要な子Objectを作ったりできます。ゲーム中の更新は`onUpdate(dt, engine)`に書きます。dtは前フレームからの経過秒数なので、速度を毎秒180単位にしたい場合は`180 * dt`を使います。FPSが変動しても、単純に毎フレーム180を足すより移動速度が安定します。更新関数の`this`は対象GameObject自身を指し、`this.x`、`this.y`、`this.moveX(...)`のように状態を変更します。`engine`引数を使えば他のDisplayやゲーム全体の状態にもアクセスできます。",
    "GameObjectのプロパティは、ゲームロジックが変化させる状態です。例では`phase`を角度として持たせ、時間経過に合わせて増やし、そこから位置や回転を計算します。`rotation`、`scaleX`、`scaleY`、`opacity`などを毎フレーム少しずつ変えるだけでも、移動以外のアニメーションを作れます。Objectに`tags`を付けると、後で同じ種類のObjectを検索しやすくなります。タグは名前の配列として初期化され、Engine側ではSetとして使われます。タグを何に使うかはあらかじめ揃えておくと便利です。たとえば\"enemy\"、\"collectible\"、\"player\"のように対象の役割を表し、表示色やクラス名とは別にゲーム上の分類を表現します。",
    "複数のObjectを同じDisplayに登録すると、それぞれが独立して更新・描画されます。`engine.addObject(world, object)`の戻り値は追加されたObject自身なので、必要なら変数に保存して後から状態を変更できます。開始後に追加したObjectは初期化も行われるため、ゲーム途中に敵を生成することもできます。消すときは`destroy()`を呼ぶとDisplayから除去されます。単に透明度を0にするだけだと見えなくても一覧や検索に残ることがあるので、再利用する意図がなければdestroyが分かりやすい選択です。使わなくなったObjectを適切に除去することは、Object数の増加による更新コストを抑え、衝突検索に意図しない相手が混ざるのも防ぎます。",
    "最初の例では、Coinというクラスを二つ生成し、同じ形状と更新ロジックを共有しながら、初期位置や色を変えています。コイン自身がelapsedを管理し、`onUpdate`内でy座標にsin波を加えて上下に浮かせます。二つ目の例では、BadgeのクラスでonStartが初回に一度だけ呼ばれること、onUpdateが繰り返されることをTextObjectの文字で観察できます。画面のログやコンソールだけでなく、ゲームCanvas上に状態を描けば、実行中の挙動を見ながらデバッグできます。ゲーム本体でconsole.logを多用すると大量の出力になることがあるため、必要な状態だけテキストObjectに反映する方法も役立ちます。",
    "実験では、Coinの浮き幅・速さ・色を変えたり、生成数を増やしたりします。各Objectの初期位置が異なっても同じ更新関数が使われることを確かめてください。Badgeの例では、onStartの中身をonUpdateへ移した場合に何が違うか想像し、初期化が毎フレーム必要かを考えます。クラスのプロパティ名や綴りが違うと、JavaScriptは別の値として扱うことにも注意します。何度も使う処理を小さなメソッドに分けると、更新処理の流れを追いやすくなります。状態が増えてきたら、変更する場所をメソッドにまとめ、constructorは初期値の設定に集中させると保守しやすくなります。プロパティ名は役割が分かる語を選び、同じ状態を重複して持たないようにしましょう。次の章では、INPUTからキーボードの状態を読み、dtを使った操作可能な移動やアニメーションを加えます。",
  ],
  exercises: [
    "Coinを3個に増やし、それぞれ色と初期位置をconstructorの引数で変える。",
    "BadgeのopacityまたはscaleXをonUpdateで変え、一定範囲で繰り返す動きを作る。",
    "クリックなどでCoinを消す想定をし、destroy()とopacity=0の使い分けを説明する。",
  ],
  examples: [
    {
      title: "Coinクラスを再利用する",
      goal: "constructorで個体差を受け取り、dtに基づいて状態を更新する。",
      note: "位置と浮遊時間はインスタンスごとに保存されますが、描画形状と更新処理はクラスで共有します。",
      code: `import { Engine, Display, GameObject, Shapes } from "./engine.js";

class Coin extends GameObject {
  constructor(x, color) {
    super({ x, y: 180, tags: ["coin"], shapes: [Shapes.circle(24, { fill: color })] });
    this.homeY = 180;
    this.elapsed = Math.random() * 3;
  }
  onUpdate(dt) {
    this.elapsed += dt;
    this.y = this.homeY + Math.sin(this.elapsed * 2) * 18;
    this.rotation += 35 * dt;
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#172554" }));
engine.addObject(world, new Coin(230, "#facc15"));
engine.addObject(world, new Coin(410, "#f472b6"));
engine.start();`,
    },
    {
      title: "onStartと状態をCanvasに表示する",
      goal: "初回処理と毎フレーム更新を分け、カウンターを表示する。",
      note: "onStartは開始時に一度、onUpdateはフレームごとに呼ばれます。dtは秒単位です。",
      code: `import { Engine, Display, GameObject } from "./engine.js";
import { TextObject } from "./ui-objects.js";

class ClockLabel extends TextObject {
  constructor() {
    super("準備中", { x: 320, y: 190, anchor: "middle", fontSize: 30, color: "#a7f3d0" });
    this.elapsed = 0;
  }
  onStart() {
    this.text = "スタート";
  }
  onUpdate(dt) {
    this.elapsed += dt;
    this.text = "経過: " + this.elapsed.toFixed(1) + " 秒";
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#064e3b" }));
engine.addObject(world, new ClockLabel());
engine.start();`,
    },
  ],
};
