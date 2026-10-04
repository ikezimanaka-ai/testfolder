# Canvas 2D Game Engine

依存パッケージなしのブラウザ用ES Modulesエンジンです。Canvas 2DでObjectを描画し、`Engine → Display → GameObject` の構成でゲームやUIを作れます。

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
