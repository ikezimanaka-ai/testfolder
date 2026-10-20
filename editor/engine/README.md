# Canvas 2D Game Engine

このプロジェクトは「コア機能の利用」と「各ゲームの具体例」を分けて見るのがわかりやすいです。

## まず見るべき入口

- [index.html](./index.html): プロジェクト全体の入口
- [examples/index.html](./examples/index.html): ゲームと機能の利用例の一覧
- [examples/docs/tutorials/index.html](./examples/docs/tutorials/index.html): 機能別チュートリアルの入口
- [examples/docs/studio.html](./examples/docs/studio.html): 作成・編集・SVGアセット・プレビューをまとめて試すページ

## 使うものと、使い方の分け方

### 1. 初期からあるJSファイル（仕組みの説明は不要）

- [engine.js](./engine.js): エンジン本体。`Engine`, `Display`, `GameObject`, `INPUT`, `Shapes` の基本を使う。
- [ui-objects.js](./ui-objects.js): `TextObject`, `ButtonObject`, `BarObject`, `SliderObject` 等のUI部品。
- [examples/docs/docs.html](./examples/docs/docs.html): 使い方を確認する参照ページ。
- [examples/docs/tests.html](./examples/docs/tests.html): 図形やUIのテストページ。
- [examples/docs/studio.html](./examples/docs/studio.html): 作成時の実務用ページ。

> ここでは「内部実装の説明」よりも、「どのファイルを使うか」と「何をインポートするか」を見ます。

### 2. ゲームごとの使い方とコード例

各ゲームページには、ゲームの見た目だけでなく「どんな機能を使っているか」と「関連する説明ページ」があるのが正しい使い方です。

- [examples/calculator-quiz.html](./examples/calculator-quiz.html)
  - 使う機能: `TextObject`, `ButtonObject`, `INPUT`
  - 使い方: 表示とボタンの組み合わせ、入力の判定
  - 参考: [examples/calculator-quiz-explanation.html](./examples/calculator-quiz-explanation.html), [examples/docs/tutorials/06-ui.html](./examples/docs/tutorials/06-ui.html), [examples/docs/tutorials/04-input-motion.html](./examples/docs/tutorials/04-input-motion.html)
  - 例:
    ```js
    const question = engine.addObject(world, new TextObject("問題", { x: 400, y: 100, anchor: "middle" }));
    const button = engine.addObject(world, new ButtonObject("問題を出す", { x: 190, y: 275 }));
    ```

- [examples/shooter.html](./examples/shooter.html)
  - 使う機能: `INPUT`, `GameObject`, `BarObject`, `Shapes`
  - 使い方: キー入力、弾の生成、敵の出現、HP表示
  - 参考: [examples/shooter-explanation.html](./examples/shooter-explanation.html), [examples/docs/tutorials/04-input-motion.html](./examples/docs/tutorials/04-input-motion.html), [examples/docs/tutorials/05-collision.html](./examples/docs/tutorials/05-collision.html)
  - 例:
    ```js
    if (INPUT.onKey("ArrowLeft")) this.moveX(-260 * dt);
    if (INPUT.onKey("Space") && cooldown <= 0) {
      engine.addObject(world, new Shot(this.x, this.y));
    }
    ```

- [examples/dodge-patterns.html](./examples/dodge-patterns.html)
  - 使う機能: `Shapes.polygon`, `GameObject`, `TextObject`
  - 使い方: 見た目の図形と回避タイミング
  - 参考: [examples/dodge-patterns-explanation.html](./examples/dodge-patterns-explanation.html), [examples/docs/tutorials/02-shapes.html](./examples/docs/tutorials/02-shapes.html), [examples/docs/tutorials/05-collision.html](./examples/docs/tutorials/05-collision.html)
  - 例:
    ```js
    shapes: [Shapes.polygon([[-14, 0], [0, -18], [14, 0]], { fill: "#facc15" })]
    ```

- [examples/snake.html](./examples/snake.html)
  - 使う機能: `GameObject`, `INPUT`, 配列管理
  - 使い方: 蛇の本体を配列で保持し、入力で方向転換する
  - 参考: [examples/snake-explanation.html](./examples/snake-explanation.html), [examples/docs/tutorials/03-objects.html](./examples/docs/tutorials/03-objects.html), [examples/docs/tutorials/04-input-motion.html](./examples/docs/tutorials/04-input-motion.html)
  - 例:
    ```js
    const body = [];
    for (let i = 0; i < 100; i++) {
      body.push(engine.addObject(world, new GameObject({ shapes: [square("#4ade80")] })));
    }
    ```

- [examples/desk-cleanup.html](./examples/desk-cleanup.html)
  - 使う機能: `GameObject`, `ButtonObject`, `TextObject`, ミッション条件
  - 使い方: 指定範囲へ移動させるミッションゲーム
  - 参考: [examples/desk-cleanup-explanation.html](./examples/desk-cleanup-explanation.html), [examples/docs/tutorials/06-ui.html](./examples/docs/tutorials/06-ui.html), [examples/docs/tutorials/09-file-structure-svg.html](./examples/docs/tutorials/09-file-structure-svg.html)
  - 例:
    ```js
    const tray = engine.addObject(world, new GameObject({ ... }));
    const item = engine.addObject(world, new ButtonObject(label, { x, y, ... }));
    ```

## 使う順番のおすすめ

1. [examples/index.html](./examples/index.html) でどのゲームを見たいか決める
2. ゲーム本体ページを開いて動きを確認する
3. 対応する解説ページを読む
4. 機能のチュートリアルで使い方を確認する
5. [examples/docs/studio.html](./examples/docs/studio.html) で自分のコードを書いて試す

## 開発用/学習用の入り口

- [examples/docs/studio.html](./examples/docs/studio.html): 実際にJSファイルを管理しながら試すページ
- [examples/docs/editor.html](./examples/docs/editor.html): そのままコード編集して実行するページ
- [examples/docs/tutorials/index.html](./examples/docs/tutorials/index.html): 機能ごとの短い実例
- [examples/block-breaker-course/index.html](./examples/block-breaker-course/index.html): 作品を作る練習用の講座

## 典型的な使い方

```js
import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";
import { TextObject, ButtonObject } from "./ui-objects.js";

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("world", 640, 360, { background: "#0f172a" }));

const label = engine.addObject(world, new TextObject("START", { x: 320, y: 120, anchor: "middle" }));
const button = engine.addObject(world, new ButtonObject("開始", { x: 240, y: 180 }));

class Player extends GameObject {
  onUpdate(dt) {
    if (INPUT.onKey("ArrowLeft")) this.moveX(-180 * dt);
    if (INPUT.onKey("ArrowRight")) this.moveX(180 * dt);
  }
}

engine.addObject(world, new Player({ x: 320, y: 220, shapes: [Shapes.circle(18, { fill: "#38bdf8" })] }));
```

この方法で、コアファイルは「何が使えるか」を見るのに使い、ゲームページとチュートリアルは「どう使うか」を見るために使うのが整理しやすいです。
