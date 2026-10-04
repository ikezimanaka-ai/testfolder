export default {
  slug: "04-input-motion",
  title: "入力とアニメーション",
  summary: "INPUTでキー操作を読み、dtを使って滑らかな移動や時間ベースの変化を作ります。",
  explanation: [
    "ゲーム操作は、ブラウザーのキーイベントを直接各Objectが購読する代わりに、エンジンの`INPUT`から状態を読む方法が使えます。`INPUT.onKey(\"ArrowLeft\")`は左キーが押されている間trueです。`INPUT.pressed(\"Space\")`は押された瞬間、`INPUT.released(\"Space\")`は離された瞬間を検出します。押しっぱなしで移動を続ける操作はonKey、一度押した時だけジャンプや発射を行う操作はpressedを使います。複数Objectが入力を別々に聞くのではなく、一つの入力状態を共有するため、操作のルールをクラスごとに整理しやすくなります。文字入力欄にフォーカスしているときは、入力中のキーがゲーム操作に混ざらないようエンジン側で抑制しています。",
    "キーを押している間の移動量には、経過時間dtを掛けます。`this.x += speed * dt`ならspeedを1秒当たりの移動量として考えられます。例えばspeedが180、dtが1/60秒なら1フレームに約3論理単位進みます。フレームレートが下がればそのフレームのdtは長くなり、時間当たりの総移動量はおおむね保たれます。反対に毎フレーム一定量を足す実装では、FPSが高い端末ほど速く進んでしまいます。dtは秒なので、アニメーションの角度も「毎秒何度変えるか」を決めてから掛けると、数値の意味が明瞭になります。異常に長い停止後のdtには上限があるため、復帰直後に大きく飛ぶのも防がれます。",
    "プレイヤーの移動では、入力を受け取り、速度を掛け、必要なら画面端で値を制限します。論理座標の幅を使えばCanvasの表示倍率に関係なく同じ端で止められます。図形を中心基準で作った場合はObjectの中心位置がx,yなので、端の計算には半径や半幅を考慮します。左上基準で作った場合とは式が異なります。何を中心とする座標なのかを先に決めると、境界制限や衝突判定が簡単になります。入力を複数キーに割り当てる時は、同時押しで斜め移動が速くならないようベクトルを正規化する方法もありますが、まずは一軸ずつ動かして入力状態を理解するのがよいでしょう。",
    "Spaceのような一回押し操作は、`INPUT.pressed(\"Space\")`を使うと一度のキー押下につき一回だけ反応させられます。押したままの複数フレームすべてで何かを生成したい場合はonKeyが適します。この違いは弾を発射する、メニューを確定する、ジャンプを始めるといった動きで特に重要です。pressed/releasedはエンジンのフレーム処理後に整理されるため、フレーム更新の中で調べます。例では押した回数をCanvas上のTextObjectへ表示し、キーリピートでは一回扱いになるか観察できます。ブラウザーやOSの入力設定によってキーリピートの体感は違いますが、押下瞬間の状態を使えばゲーム側の判定を安定させられます。",
    "二つのサンプルは、押し続ける操作と押した瞬間の操作を分けて示します。最初は矢印キーでPlayerを動かし、画面外に出ないよう中心基準の半径分を引いて位置を制限します。速度を変更し、dtを掛けたままの動きと掛けない動きの違いを考えてください。二つ目ではSpaceを押した回数に応じて星を一つ作ります。GameObjectを後から追加する例にもなっているため、開始後のaddObjectが使えることを確認できます。キー入力はページ全体ではなく、Canvasプレビュー内の隔離された実行画面に届きます。操作が反応しない場合は、例のCanvasをクリックしてフォーカスを移し、キーイベントがどのウィンドウに届いているかを確かめましょう。",
    "アニメーションでは、見た目の変化も時間で制御します。回転なら`this.rotation += angularSpeed * dt`、点滅なら経過時間からsin値を計算してopacityに設定できます。位置をsin波で変える場合は、移動位置を直接累積するのでなく、基準位置と時間から毎フレーム計算すると、周期がずれにくくなります。例に加えて`scaleX`と`scaleY`を変え、脈打つ図形を作ることもできます。キー名はブラウザーが返す文字列を使います。大文字小文字を区別するキーでは`event.key`と`event.code`の使い分けも検討できますが、この教材では矢印キーとSpaceを使って基本の状態管理を練習します。Canvas外をクリックしたりウィンドウを切り替えたりしたとき、押したままのキーが残らないかも確認しておくと安心です。次の章では移動したObjectどうしの衝突を調べます。境界制限、時間ベースの移動、キー操作は、ゲームのほとんどの操作可能なサンプルで繰り返し使う基礎になるので、コードを少し書き換えて自分の速度や入力キーを試してください。",
  ],
  exercises: [
    "Playerに上下キーを追加し、斜め移動の速度が速くなりすぎないようベクトルを補正する。",
    "Spaceで一度だけ反応する処理と、Spaceを押し続ける間反応する処理を比較する。",
    "回転に加えてscaleXをsin波で変え、毎秒一定周期で脈打つ図形を作る。",
  ],
  examples: [
    {
      title: "矢印キーで移動するPlayer",
      goal: "onKeyとdtを使い、円の中心をCanvas範囲内に保つ。",
      note: "キー入力を試すときはプレビューCanvasをクリックしてから矢印キーを押します。",
      code: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";

class Player extends GameObject {
  constructor() {
    super({ x: 320, y: 180, shapes: [Shapes.circle(22, { fill: "#38bdf8" })] });
    this.speed = 190;
  }
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-this.speed * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(this.speed * dt);
    if (INPUT.onKey("ArrowUp")) this.moveY(-this.speed * dt);
    if (INPUT.onKey("ArrowDown")) this.moveY(this.speed * dt);
    this.x = Math.max(22, Math.min(618, this.x));
    this.y = Math.max(22, Math.min(338, this.y));
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#0f172a" }));
engine.addObject(world, new Player());
engine.start();`,
    },
    {
      title: "Spaceを押した瞬間に追加する",
      goal: "pressedで一度だけ反応し、開始後にObjectを追加する。",
      note: "onKeyへ置き換えると、押し続けている間はフレームごとに星が増えます。",
      code: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";
import { TextObject } from "./ui-objects.js";

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#172554" }));
let count = 0;
const label = engine.addObject(world, new TextObject("Space: 0", {
  x: 20, y: 34, fontSize: 22, color: "#fef3c7",
}));
world.onUpdate = function () {
  if (!INPUT.pressed("Space")) return;
  count++;
  label.text = "Space: " + count;
  engine.addObject(this, new GameObject({
    x: 70 + Math.random() * 500, y: 70 + Math.random() * 250,
    rotation: Math.random() * 360,
    shapes: [Shapes.polygon([[0, -13], [4, -4], [13, 0], [4, 4], [0, 13], [-4, 4], [-13, 0], [-4, -4]], { fill: "#facc15" })],
  }));
};
engine.start();`,
    },
  ],
};
