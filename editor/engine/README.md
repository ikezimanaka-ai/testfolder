# Minimal SVG Game Engine

依存パッケージなしのブラウザ用ES Modulesサンプルです。`Engine`の理論サイズを基準に、Canvasの実サイズへ縦横比を維持したcontain表示を行います。

## 起動

`game-engine`フォルダーで静的サーバーを起動し、表示されたURLをブラウザで開きます。例:

```powershell
python -m http.server 8000
```

## 基本API

```js
import { Engine, Display, GameObject } from "./engine.js";

const engine = new Engine(canvas, 60, 800, 450);
const display = engine.newDisplay(new Display("world", 400, 300), 100, 50);
const object = engine.addObject(display, new GameObject({
  x: 20, y: 30, tags: ["player"], shapes: [svgShape]
}));
```

DisplayとObjectの座標・サイズは論理座標です。Displayは理論範囲外にも配置でき、ObjectはDisplay内の任意位置に置けます。表示時はSVGのviewBoxがCanvasへcontain配置されるため、余白が生じる場合があります。

`onStart`はEngine開始時に1回、`onUpdate(dt, engine)`は各フレームに実行されます。`dt`の単位は秒です。Objectには`moveX`、`moveY`、`moveTo`、`move`、`touchTag`、`touching`、`getObject`があります。

キーボード入力は`INPUT.onKey(keyid)`で現在押されているかを判定できます。`keyid`には`"ArrowLeft"`、`"Space"`、`"a"`などの`KeyboardEvent.key`または`"KeyA"`などの`KeyboardEvent.code`を指定します。押下された瞬間だけを調べる`INPUT.pressed(keyid)`、離された瞬間だけを調べる`INPUT.released(keyid)`も利用できます。

## API・オンラインエディター

[examples/docs/docs.html](./examples/docs/docs.html)を開くと、全APIの説明とMonaco Editorを表示します。左側のコードを変更して「実行」を押すと、右側のプレビューでコードを実行できます。Monaco Editor本体は静的配信で利用できるCDNから読み込みます。プレビューは同一オリジンのsandbox iframeで実行されるため、ローカル開発用として利用してください。

- [examples/docs/docs.html](./examples/docs/docs.html): Engine、Display、GameObject、INPUT、座標系、ライフサイクル、当たり判定の詳細説明
- [examples/docs/tests.html](./examples/docs/tests.html): 理論サイズ、Display順、移動、dt、表示変換、タグ判定、キーボード、複数SVG形状の個別テスト
- [examples/docs/editor.html](./examples/docs/editor.html): Monaco Editorでコードを編集してプレビュー実行
- [ui-objects.js](./ui-objects.js): TextObject、BarObject、ButtonObjectの継承用UI Object
- 各ゲームページ: ゲーム画面、スコア、入力、再開ボタンをCanvas内のSVG Objectだけで表示・操作

SVG要素はObjectの`shapes`へ複数指定できます。接触判定は各SVG要素の変換済み境界矩形による近似判定です。複雑なpathの輪郭そのものを厳密に判定するものではありません。

## UI Object

```js
import { TextObject, BarObject, ButtonObject } from "./ui-objects.js";

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
```

`TextObject`は文字列、色、フォントサイズ、フォント、寄せ方向を持ちます。`BarObject.value`は0〜1で表示割合を変えられます。`ButtonObject`は`shadow`、`background`、`hoverBackground`、`pressedBackground`、`hoverScale`、`hoverLift`で見た目とhover/押下アニメーションを設定できます。独自のUIは、これらのクラスまたは`GameObject`を`extends`して作成します。
