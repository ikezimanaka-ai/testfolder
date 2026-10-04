export default {
  slug: "08-debug-gameplay",
  title: "デバッグとゲーム構成",
  summary: "ログ、FPS・hitbox表示、独自描画、スコアやゲーム状態を整理して小さなゲームにします。",
  explanation: [
    "ゲームは機能を足すほど、どの値がいつ変わったのか分かりにくくなります。デバッグでは、問題が起きる場所を絞り、観測できる形で状態を表示することが重要です。`engine.setDebug({ hitboxes: true, displays: true, fps: true })`は判定形状、Display境界、FPSをCanvasへ重ねます。判定が想定と違うときはhitboxes、Displayの位置や切り抜きが違うときはdisplaysをオンにします。FPSは端末や処理負荷によるフレーム頻度を観察する手がかりです。Debug描画は開発中に使い、最終版では必要な表示だけ残すとよいでしょう。フレームごとに大量のconsole.logを出すと確認しづらくなるので、表示する情報を絞ることが大切です。",
    "ログには通常のconsole.log、console.warn、console.errorが使えます。GameStudioの実行環境ではこれらがStudioのコンソールへ転送されます。ゲームの状態を伝えるメッセージには`GameStudio.log(...)`などを利用できます。たとえば開始・終了、ステージ移行、読み込み失敗など、一度だけ発生するイベントを記録するのに便利です。ゲーム中ずっと変化する数値はログを連続出力せず、TextObjectで画面に表示するか、Object Inspectorで状態を確認します。ログは「何が起きたか」、診断は「コードにどんな問題があるか」を見る領域です。SyntaxErrorや実行時例外が出たときは行番号と直前の編集箇所を確認し、問題が再現する最小のコードまで例を縮めると修正が簡単になります。",
    "ゲームの更新処理を整理するには、状態を明示します。たとえばplaying、paused、gameOverなどの状態を用意し、プレイ中だけ移動や衝突を処理します。スコア、残り時間、体力などは単一の変数や小さな状態Objectで管理し、画面表示へ反映します。表示文字列に直接ゲームルールを埋め込むのではなく、先にscoreを計算し、別の処理でTextObject.textを作ると役割が分かれます。更新順序も重要です。プレイヤーを動かしてから衝突を調べ、衝突結果でスコアを変更し、その後UIを更新する、と処理の順番を決めると一フレーム遅れの表示などを避けやすくなります。短い例では順番が簡単に見えますが、ゲームの規模が大きくなっても同じ考えが役立ちます。",
    "独自のCanvas描画が必要なときはGameObjectの`onDraw(ctx, dt, engine)`を利用できます。通常のShapesやUI Objectでは表しにくいエフェクト、細かな線、グラデーション、ゲージの装飾などを描画できます。Canvas contextの状態を変更したらsave/restoreで戻し、次のObjectに色やtransformが漏れないようにします。独自描画した内容に当たり判定が必要なら、見た目と別にcollisionShapesを用意します。onDrawだけでは形状判定の情報は自動で作られません。最初は標準Shapesで作り、表現できない部分だけonDrawにするのが扱いやすい選択です。Debug hitbox表示が独自描画に一致しなくても、collisionShapesが別なら仕様通りの場合があります。描画と判定が一致すべきか、意図的に異なるかを決めましょう。",
    "一つ目の例では、Debug表示をオンにしたうえでObject自身のonDrawを使ってsin波を線で描きます。二つ目はキーボード移動、コイン生成、衝突、スコア、残り時間をまとめた小さなゲームです。ゲームのルールはCoinやPlayerのクラスに置き、全体スコアや残り時間は外側で管理します。コードを変えた後に実行するとプレビューiframeが作り直されるので、状態は初期化されます。これは同じ条件で試し直せる利点があります。再実行を押して初期状態へ戻ることを利用し、毎回同じ動きを確かめてください。キー操作を使う場合はCanvasをクリックしてフォーカスを移します。接触時のタグ・位置・score変更を順に確認しましょう。",
    "ミニゲームへ機能を追加するときは、一度に大きなコードを書くより、まず一つのObjectを表示し、次に入力、次に衝突、最後にスコア表示というように積み重ねます。毎段階で実行して、動いていた状態を保ったまま次を足すと、原因となる変更を特定しやすくなります。問題が出たら、consoleのエラー、診断リスト、Debug表示、Objects一覧の順に手がかりを見てください。Object一覧は読み取り専用なので、状態を変えたい場合はコードを修正します。保存されたコードを初期コードに戻す前に、必要ならコピーやJSON書き出しを行います。この実例集は八章で基本的な描画・更新・入力・判定・UI・素材・Debugを一周しました。次は章の例を組み合わせ、独自ルールを持つ小さなゲームを作ってみましょう。",
  ],
  exercises: [
    "FPSとhitboxを表示した状態でミニゲームを実行し、Objectの移動と衝突形状を確認する。",
    "ゲーム状態をplaying/gameOverの二つに分け、終了後に移動・スコア加算を止める。",
    "独自描画に色や線幅を加えつつ、衝突判定をcollisionShapesで別に定義する。",
  ],
  examples: [
    {
      title: "Debug表示と独自Canvas描画",
      goal: "FPS・Display・hitboxを表示し、onDrawで波形を描く。",
      note: "onDrawでcontext状態を変更したらsave/restoreを使い、他のObjectへ影響させません。",
      code: `import { Engine, Display, GameObject, Shapes } from "./engine.js";
import { TextObject } from "./ui-objects.js";

class Wave extends GameObject {
  constructor() {
    super({
      x: 320, y: 190, tags: ["wave"],
      collisionShapes: [Shapes.ellipse(110, 45)],
    });
    this.time = 0;
  }
  onUpdate(dt) { this.time += dt; }
  onDraw(ctx) {
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= 220; x += 4) {
      const y = 35 + Math.sin(x * .045 + this.time * 3) * 18;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("debug", 640, 360, { background: "#0f172a" }));
engine.addObject(world, new Wave());
engine.addObject(world, new TextObject("FPS / Display / hitbox を表示中", {
  x: 16, y: 28, fontSize: 17, color: "#fef3c7",
}));
engine.setDebug({ hitboxes: true, displays: true, fps: true });
engine.start();`,
    },
    {
      title: "コイン収集ミニゲーム",
      goal: "Player・入力・タグ衝突・スコアとタイマーを組み合わせる。",
      note: "矢印キーで移動します。プレビューをクリックしてから操作してください。",
      code: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";
import { TextObject } from "./ui-objects.js";

class Coin extends GameObject {
  constructor(x, y) {
    super({ x, y, tags: ["coin"], shapes: [Shapes.circle(12, { fill: "#facc15" })] });
  }
}
class Player extends GameObject {
  constructor() {
    super({ x: 80, y: 180, tags: ["player"], shapes: [Shapes.circle(18, { fill: "#38bdf8" })] });
  }
  onUpdate(dt) {
    const speed = 175 * dt;
    if (INPUT.onKey("ArrowLeft")) this.moveX(-speed);
    if (INPUT.onKey("ArrowRight")) this.moveX(speed);
    if (INPUT.onKey("ArrowUp")) this.moveY(-speed);
    if (INPUT.onKey("ArrowDown")) this.moveY(speed);
    this.x = Math.max(18, Math.min(622, this.x));
    this.y = Math.max(18, Math.min(342, this.y));
    for (const coin of this.touching("coin")) {
      coin.destroy();
      score++;
      scoreText.text = "SCORE " + score;
    }
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("game", 640, 360, { background: "#064e3b" }));
let score = 0;
let time = 20;
const scoreText = engine.addObject(world, new TextObject("SCORE 0", { x: 16, y: 28, fontSize: 18, color: "#fef3c7" }));
const timeText = engine.addObject(world, new TextObject("", { x: 624, y: 28, anchor: "end", fontSize: 18, color: "#fef3c7" }));
engine.addObject(world, new Player());
for (const [x, y] of [[220, 90], [330, 270], [470, 120], [560, 280]]) engine.addObject(world, new Coin(x, y));
world.onUpdate = function (dt) {
  time = Math.max(0, time - dt);
  timeText.text = "TIME " + Math.ceil(time);
};
engine.setDebug({ hitboxes: true });
engine.start();`,
    },
  ],
};
