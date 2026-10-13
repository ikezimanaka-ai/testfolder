# Canvas 2D Game Engine

依存パッケージなしのブラウザ用ES Modulesエンジンです。Canvas 2DでObjectを描画し、`Engine → Display → GameObject` の構成でゲームやUIを作れます。

## ページ構成の整理（ユーザー向けの見方）

このプロジェクトは、機能の説明・サンプルゲーム・学習用コース・エディタが混ざっていて、見た目の整理がやや分かりにくい状態です。実際の利用者は「ゲームを遊ぶ」「解説を見る」「コードを試す」「講座を進める」の4系統に分けて見ると理解しやすいです。

### 1. 入口ページ（最初に見るページ）

- [index.html](./index.html): プロジェクト全体の入口。ページ一覧を見て、どの種類のページに移るかを選ぶ用のナビゲーション。
- [examples/index.html](./examples/index.html): サンプルゲームとドキュメントを一括で見る一覧ページ。ユーザー向けの「ホーム」に近い役割。

> こちらは「どのページへ行くかの入口」であり、実際のゲームや解説本体ではありません。現状では [index.html](./index.html) と [examples/index.html](./examples/index.html) が似た役割を持っているので、利用者から見るとやや重複に感じます。

### 2. ゲーム本体（遊ぶ用）

- [examples/calculator-quiz.html](./examples/calculator-quiz.html): 電卓風の計算問題ゲーム。ルールは簡単で、答えを早く入力するための演習型。
- [examples/shooter.html](./examples/shooter.html): 連続で迫る敵を避けながら攻撃するミニシューター。動きや弾幕が中心。
- [examples/dodge-patterns.html](./examples/dodge-patterns.html): 攻撃パターンを避けるゲーム。シューターと似ているが、攻撃の読み方・回避のタイミングが中心。
- [examples/snake.html](./examples/snake.html): 代表的なヘビゲーム。操作が単純で、ルール理解がしやすい。
- [examples/desk-cleanup.html](./examples/desk-cleanup.html): 机を片付ける系のゲーム。見た目・操作の意味がややユニークで、他のゲームより「ミッション」寄り。
- [examples/multi-poker.html](./examples/multi-poker.html): 2〜8人CPU対戦の大富豪風ゲーム。対象は他の簡易ゲームよりも複雑で、対戦・ルール管理が中心。

これらは「ゲームを実際に遊ぶページ」であり、見た目の違いよりもゲームジャンルの違いが大きいです。いずれも同じゲームエンジンで動くが、目的が「問題回答」「回避」「対戦」「ミッション」などに分かれています。

### 3. ゲームの解説ページ（それぞれのゲームを理解する用）

- [examples/calculator-quiz-explanation.html](./examples/calculator-quiz-explanation.html): 問題生成や入力判定などの考え方を説明する解説。
- [examples/shooter-explanation.html](./examples/shooter-explanation.html): 敵の出現、攻撃、当たり判定の設計を説明する解説。
- [examples/dodge-patterns-explanation.html](./examples/dodge-patterns-explanation.html): パターン読解と回避の工夫を説明する解説。
- [examples/snake-explanation.html](./examples/snake-explanation.html): 進行方向・尾の制御・衝突判定の説明が中心。
- [examples/desk-cleanup-explanation.html](./examples/desk-cleanup-explanation.html): 片付けタスクの難易度とゲーム設計の意図を説明する解説。

解説ページは「本体ゲームの後に読む」系で、該当するゲーム本体とセットで理解するとわかりやすいです。ゲーム本体は体験、解説は設計思想という役割分担になっています。

### 4. ドキュメント / テスト / エディタ系

- [examples/docs/docs.html](./examples/docs/docs.html): Engine のAPI詳細説明ページ。新しい説明の中心として使うのが自然。
- [examples/docs/tests.html](./examples/docs/tests.html): UI Object や Canvas 図形、入力機能の実例テスト。
- [examples/docs/editor.html](./examples/docs/editor.html): Monaco Editor を使ってコードを書き、プレビューを即実行できるページ。
- [examples/docs/studio.html](./examples/docs/studio.html): エディタ + プレビュー + Object一覧 + コンソール + SVGアセット操作をまとめた開発向けStudio。
- [examples/docs/tutorials/index.html](./examples/docs/tutorials/index.html): 8章の短いステップで実際に動かしながら学ぶチュートリアル一覧。

この系統は「ゲームのプレイ」のカテゴリではなく、「仕組みを知る・作る・確認する」カテゴリです。特に [examples/docs/studio.html](./examples/docs/studio.html) は機能の検証や開発に近く、他のゲームページと役割が大きく違います。

> 注意点: [docs/docs.html](./docs/docs.html), [docs/editor.html](./docs/editor.html), [docs/tests.html](./docs/tests.html) という同系統のファイルが別フォルダにあります。現状では [examples/docs](./examples/docs) 系がより新しく機能が拡張されているため、ユーザー向けの「正本」はそちらと見てよいです。 [docs](./docs) は旧版または簡易版として扱うのが自然です。

### 5. 学習コース・講座系

- [examples/block-breaker-course/index.html](./examples/block-breaker-course/index.html): ブロック崩しの講座入口。
- [examples/block-breaker-course/pages/page-1.html](./examples/block-breaker-course/pages/page-1.html) 〜 [examples/block-breaker-course/pages/page-20.html](./examples/block-breaker-course/pages/page-20.html): 1〜20の段階的なレッスン。ゲーム作りの流れを学ぶための教材。
- [examples/block-breaker-course/exam](./examples/block-breaker-course/exam): 検定・試験向けページ。

この系統は「ゲームの一例を学ぶ」ための構造化講座で、単発のサンプルゲームとは別のカテゴリです。演習形式で進めるため、既存の解説ページよりも長く、かつ段階的に理解する用途が強いです。

### 6. 補助ファイル（ユーザーが直接見るものではない）

- [engine.js](./engine.js): 実際のゲームエンジン本体。
- [ui-objects.js](./ui-objects.js): UI部品の定義。ボタン、バー、入力欄など。
- [main.js](./main.js): 画面やページ制御の入口スクリプト。
- [editor-page.js](./editor-page.js): エディタ系ページの補助処理。

これらは「ページの中身」を支える実装側であり、ユーザー向けの見え方としては隠し要素に近いです。説明ページやゲームページの違いを理解するには、まず見えるページ群を分けて見るのが正しいです。

### まとめ：現状のおすすめ整理

1. 入口: [index.html](./index.html) / [examples/index.html](./examples/index.html)
2. ゲーム本体: [examples/*.html](./examples) の playable pages
3. 解説: 各ゲームの explanation pages
4. ドキュメント/エディタ: [examples/docs](./examples/docs) 系
5. 教育コース: [examples/block-breaker-course](./examples/block-breaker-course)

この整理にすると、ドキュメント・ゲーム・コースの違いが明確になり、重複して見えるファイルの位置関係も自然に理解できます。

## 起動

`game-engine`フォルダーで静的サーバーを起動し、表示されたURLをブラウザで開きます。例:

```powershell
python -m http.server 8000
```

## 基本API

```js
import { Engine, Display, GameObject, Shapes } from "./engine.js";

const engine = new Engine(canvas, 60, 800, 450);
const display = engine.newDisplay(new Display("world", 400, 300), 100, 50);
const object = engine.addObject(display, new GameObject({
  x: 20, y: 30, tags: ["player"], shapes: [Shapes.circle(18, { fill: "#38bdf8" })]
}));
```

`engine.js`は`Shapes.rect`、`Shapes.circle`、`Shapes.ellipse`、`Shapes.line`、`Shapes.polygon`、`Shapes.text`を提供します。DisplayとObjectの座標・サイズは論理座標です。Canvasは縦横比を維持してcontain表示し、余白が生じる場合があります。Displayは自身の幅・高さで描画をclipするため、範囲外にはみ出した内容は表示されません。

`onStart`はEngine開始時に1回、`onUpdate(dt, engine)`は各フレームに実行されます。`dt`の単位は秒です。Engine作成時のFPS引数は更新頻度の上限です（正の値）。既定の60 FPSならブラウザーの描画タイミングに合わせ、30 FPSを指定すれば最大30 FPSで更新します。端末の処理能力やブラウザーのタブ休止で実際のFPSが下がることはあり、ソフトウェアから最低FPSを保証することはできません。Objectには`moveX`、`moveY`、`moveTo`、`move`、`touchTag`、`touching`、`getObject`、`setPrivate` / `SetPrivate`、`destroy`があります。破棄したObjectは更新ループから回収されます。矩形・円・楕円・多角形形状から衝突判定を計算し、Objectの回転・拡縮・skewも判定へ反映します。`shapes`へ渡す既存のSVG形状も互換描画できます。  

キーボード入力は`INPUT.onKey(keyid)`で現在押されているかを判定できます。`keyid`には`"ArrowLeft"`、`"Space"`、`"a"`などの`KeyboardEvent.key`または`"KeyA"`などの`KeyboardEvent.code`を指定します。押下された瞬間だけを調べる`INPUT.pressed(keyid)`、離された瞬間だけを調べる`INPUT.released(keyid)`も利用できます。

## アセット・デバッグ

`engine.loadImage(url)`と`engine.loadSVG(url)`はURLから画像を読み込みます。`engine.loadFont("GameFont", "https://example.com/game.woff2")`はURLのWebフォントを読み込みます。file inputは不要です。Canvasで輪郭ピクセルを読み取る機能は使わないため、クロスオリジン画像も通常の表示に利用できます（配信元がアクセスを拒否する場合を除く）。

`engine.setDebug({ hitboxes: true, displays: true, fps: true })`で当たり判定形状、Display境界、FPSを表示できます。`object.mosaic = true`、`rotation`、`scaleX` / `scaleY`、`skewX` / `skewY`、`opacity`で見た目を調整できます。Objectへ独自Canvas描画を追加する場合は`onDraw(ctx, dt, engine)`を使います。

## API・オンラインエディター

[examples/docs/docs.html](./examples/docs/docs.html)を開くと、全APIの説明とMonaco Editorを表示します。左側のコードを変更して「実行」を押すと、右側のプレビューでコードを実行できます。Monaco Editor本体は静的配信で利用できるCDNから読み込みます。プレビューは同一オリジンのsandbox iframeで実行されるため、ローカル開発用として利用してください。

- [examples/docs/docs.html](./examples/docs/docs.html): Engine、Display、GameObject、INPUT、座標系、ライフサイクル、当たり判定の詳細説明
- [examples/docs/tests.html](./examples/docs/tests.html): UI Object、Canvas図形、入力コントロールの実例
- [examples/canvas-tests.html](./examples/canvas-tests.html): Canvas描画、Displayクリップ、当たり判定、URLアセットの動作テスト
- [examples/docs/editor.html](./examples/docs/editor.html): Monaco Editorでコードを編集してプレビュー実行
- [examples/docs/studio.html](./examples/docs/studio.html): Monaco、Canvasプレビュー、SVGアセットEditor、ソース構造、実行中Object一覧、診断・コンソールを統合したStudio
- [examples/docs/tutorials/index.html](./examples/docs/tutorials/index.html): Studioの使い方を8章・16個のMonaco＋Canvas実行例で学ぶ実例集
- [ui-objects.js](./ui-objects.js): 図形、TextObject、BarObject、ButtonObject、SliderObject、TextInputObject、NumberInputObject、ImageObject、SpriteAnimationObject
- 各ゲームページ: ゲーム画面、スコア、入力、再開ボタンをCanvasで表示・操作
- [examples/multi-poker.html](./examples/multi-poker.html): 場が空くたびに枚数を選べる、階段だけ同柄で続ける制限、パスを順番に回す2〜8人CPU対戦のMulti Poker風大富豪

SVG要素はObjectの`shapes`へ複数指定でき、Canvas互換描画へ変換されます。SVG pathや外部SVG画像の当たり判定は矩形近似です。標準のCanvas形状では円・楕円を多角形近似し、矩形・多角形などの衝突形状同士をSATで判定します。

Studioの実行コードでは`GameStudio.log(...)`、`GameStudio.warn(...)`、`GameStudio.error(...)`でログを表示できます。SVGアセットは`GameStudio.assetUrl("asset-name")`で画像URLへ変換し、`engine.loadSVG(...)`などへ渡せます。プレビュー内のObjects一覧は読み取り専用です。

## UI Object

```js
import { TextObject, BarObject, ButtonObject, SliderObject, TextInputObject } from "./ui-objects.js";

const title = engine.addObject(display, new TextObject("タイトル", {
  x: 40, y: 60, fontSize: 32, color: "#fff"
}));
const health = engine.addObject(display, new BarObject({
  x: 40, y: 90, width: 240, value: .75, fill: "#22c55e"
}));
const button = engine.addObject(display, new ButtonObject("開始", {
  x: 40, y: 140, shadow: true, hoverScale: 1.05
}));
button.onClick = () => console.log("clicked");
const volume = engine.addObject(display, new SliderObject({
  x: 40, y: 220, width: 240, min: 0, max: 100, value: 65
}));
const name = engine.addObject(display, new TextInputObject({
  x: 40, y: 270, width: 240, placeholder: "名前を入力"
}));
```

`TextObject`は文字列、色、フォントサイズ、フォント、寄せ方向を持ちます。`BarObject.value`は0〜1で表示割合を変えられます。`ButtonObject`はhover/押下状態とクリックを提供します。`SliderObject`はCanvas上でドラッグでき、`TextInputObject`と`NumberInputObject`は見た目をCanvasで描き、文字入力には視覚的に隠したネイティブ入力要素を内部利用します。独自UIは各クラスまたは`GameObject`を継承して作成できます。
