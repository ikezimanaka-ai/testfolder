# website の仕組み

このディレクトリは、ブラウザだけで動く Canvas ベースのゲーム実験場です。実装は大きく二つの段階に分かれています。

画面を見ながらやさしく読みたい場合は、[説明ページ（guide.html）](guide.html) を開いてください。左側に詳しい説明、右側に各章へ移動できるリンクがあります。この README は、仕様をすばやく検索したいときの詳しいリファレンスです。

コードを実際に試しながら読みたい場合は、[補助教材一覧（explan/index.html）](explan/index.html) も使えます。DOM の `GET`、Canvas の `CD1` / `CD3`、Engine の開始・停止・キー操作を分けて試せます。

1. `index.html` と `script.js` は、DOM ヘルパーで Canvas を作り、`canvasDealer.js` の描画 API を試す最小例です。
2. `demo.html` と `engine.js` は、ゲームオブジェクト、表示レイヤー、入力、ゲームループまで含むゲームエンジンのデモです。

`scriptdemo.js` は 1 と 2 を組み合わせた別デモですが、現在の `index.html` からは読み込まれていません。

## まず動かす

HTTP サーバーのドキュメントルートをこのプロジェクトのルートにして、次を開きます。

- [`website/index.html`](index.html): 青い長方形を一つ描く最小描画デモ
- [`website/demo.html`](demo.html): オブジェクトの選択、ドラッグ、キー移動、レイヤー効果のデモ
- [`website/editor.html`](editor.html): Objectテンプレート、Display、Engineコードを編集するGUI
- [`website/help.html`](help.html): Object、Display、Engine、Input、Utilsの標準API一覧
- [`website/dodge.html`](dodge.html): 矢印キー/WASDで障害物をよけるゲーム
- [`website/explan/dodge.html`](explan/dodge.html): 回避ゲームの仕組みの解説

ES Modules やビルドツールは使っていないため、単純な静的 HTTP サーバーで十分です。`file://` でも動くブラウザはありますが、外部スクリプトのロード確認を含むため HTTP 経由で確認する方が確実です。

例:

```sh
python3 -m http.server 8000 --directory .
```

その後 `http://localhost:8000/website/demo.html` を開きます。

## ファイルの役割

| ファイル | 役割 | 直接使う主なもの |
| --- | --- | --- |
| [`index.html`](index.html) | 最小描画例の HTML。`domDeal.js` と `script.js` を順に読む | `Deal`, `createDisplay` |
| [`script.js`](script.js) | DOM 作成、Canvas のレスポンシブ調整、`canvasDealer.js` のロード | `createDisplay`, `initializeCanvas`, `initCanvasDealerAndDraw` |
| [`canvasDealer.js`](canvasDealer.js) | Canvas 2D 描画の薄いラッパー | `CD1`, `CD2`, `CD3` |
| [`ui.js`](ui.js) | Canvas内UIの共通クラス | `CanvasButton`, `CanvasLabel`, `CanvasPanel`, `CanvasUI` |
| [`engine.js`](engine.js) | ゲーム状態、表示レイヤー、入力、FPS ループ | `GameObject`, `Display`, `InputManager`, `Engine`, `Utils` |
| [`demo.html`](demo.html) | `engine.js` を直接使う操作デモ | `GameEngine.Engine` など |
| [`scriptdemo.js`](scriptdemo.js) | DOM を通常 API で作る Engine デモ | `initEngineDemo` |
| [`gameDealer.js`](gameDealer.js) | `canvasDealer` を保持する未完成の拡張ポイント | `GameDealer` |
| [`styles.css`](styles.css) | Canvas の枠と全要素の初期余白を設定 | `canvas`, `*` |
| [`../qs/domDeal.js`](../qs/domDeal.js) | DOM 作成・検索ヘルパー。`website/index.html` が読み込む | `Deal` |

## 全体の実行順

### 最小描画 (`index.html`)

```text
index.html
  1. ../qs/domDeal.js を読む -> Deal がグローバルに定義される
  2. script.js を読む
  3. createDisplay()
       -> Deal(body).CE() で #display を作る
       -> CCE() で #display の中に #canvas を作る
       -> CE() で canvasDealer.js の script 要素を追加する
  4. script.js が script 要素の load を待つ
  5. initializeCanvas()
  6. new CD3(canvas, 800, 600)
  7. drawRectangle(50, 50, 200, 100, "blue")
```

`canvas.width` / `height` は実際の描画バッファ、`canvas.style.width` / `height` は画面上の表示サイズです。`script.js` は最大論理サイズを 800 x 600 とし、画面の縦横比を 4:3 に保ったまま小さくします。`CD3` は論理座標を実際の Canvas 座標へ変換します。

### Engine デモ (`demo.html`)

```text
demo.html
  -> engine.js
  -> new GameEngine.Engine({ fps: 30, canvas })
  -> createDisplay() で bg と ui を登録
  -> GameObject を作り、copy() して各 Display に追加
  -> E.start()
       -> requestAnimationFrame
       -> fps 間隔に達したら _renderFrame()
            -> Display ごとに一時 Canvas へ drawTo()
            -> 上位 Display の blend を合成
            -> メイン Canvas へ描く
            -> InputManager.update()
  -> 別の requestAnimationFrame で操作を読む
```

`Engine` は `onUpdate(fn)` でゲーム側の更新処理を登録できます。登録した関数には秒単位の `dt` と入力が渡されます。Engine は入力を収集して更新と描画を繰り返しますが、移動やゲームルールの具体的な内容は `demo.html` や `dodge.js` のようにアプリケーション側で `move()` / `moveTo()` を呼び出して実装します。

Canvas 内のボタンや文字を共通化したい場合は [`ui.js`](ui.js) を使います。`CanvasButton` は矩形、文字、ホバー色、押下色、クリック callback を持ち、`CanvasUI` は複数の UI 要素を描画と入力判定の順番にまとめます。`bindTo(canvas)` を一度呼ぶだけで、座標変換付きの pointer イベントも登録できます。回避ゲームの開始ボタンが使用例です。

```js
const ui = new CanvasUI();
ui.add(new CanvasButton({
  x: 580, y: 20, width: 190, height: 48,
  text: "開始",
  onClick: () => startGame()
}));
display.addDrawable(ctx => ui.draw(ctx));
ui.bindTo(canvas);
```

## DOM ヘルパー `Deal`

定義は [`../qs/domDeal.js`](../qs/domDeal.js) にあります。コンストラクターへ DOM 要素、ID、または簡単なセレクターを渡すと、その要素を操作するオブジェクトになります。

```js
const root = new Deal(document.body);
root.CE("div", {
  id: "display",
  class: "game",
  text: "ゲーム",
  styles: { backgroundColor: "black" },
  attrs: { "data-screen": "main" }
});
root.CCE("#display", "canvas", { id: "canvas" });
```

### 公開メソッド

| メソッド | 用途 | 戻り値 |
| --- | --- | --- |
| `new Deal(target)` | 操作対象を選ぶ。`target` は要素、ID、`.class`、タグ、`a|b` の階層指定 | `Deal` |
| `exists()` | 対象要素があるかを alert で表示 | `undefined` |
| `CE(tag, options)` | 自分自身の子に要素を作る | 作成した要素 |
| `CCE(selector, tag, options)` | selector の子に要素を一つ作る | 作成した要素 / `null` |
| `CCEAll(selector, tag, options)` | 複数対象それぞれに要素を作る | 要素配列 |
| `GET(selector)` | 要素の tag、id、class、text、html、attributes を読む | 情報オブジェクト / `null` |
| `SET(selector, options)` | 既存要素へ options を適用する | 対象要素 / `null` |
| `MODIFY(selector, options)` | `SET` の別名 | `SET` と同じ |
| `RELATED(selector, relation)` | parent、children、siblings などを取得 | 要素 / 要素配列 / `null` |

`options` で使える主な項目は `id`, `class`, `text`, `html`, `attrs`, `styles`, `children`, `append` です。`append: false` にすると作成だけして親へ追加しません。

セレクターには `#id`、`.class`、CSS タグセレクター、階層の `#parent|.child`、関係指定の `#canvas>>parent` を使えます。内部の `_resolveSelector`、`_getElement`、`_applyOptions` などは実装を理解するための補助メソッドで、アプリケーションから直接呼ぶ必要はありません。

## Canvas 描画 `CD1` / `CD2` / `CD3`

### `CD1`: 生の Canvas 座標

```js
const drawer = new CD1(canvas);
drawer.drawRectangle(10, 20, 100, 40, "red");
drawer.drawCircle(100, 100, 20, "blue");
drawer.drawLine(0, 0, 200, 100, "black", 2);
drawer.drawText("hello", 10, 180);
drawer.clearCanvas();
```

メソッドは `CanvasRenderingContext2D` にほぼ一対一で対応します。

- `constructor(canvas)`: `canvas.getContext("2d")` を保存
- `drawRectangle(x, y, width, height, color)`: `fillRect`
- `drawCircle(x, y, radius, color)`: パスを作り `arc` と `fill`
- `clearCanvas()`: Canvas 全体を透明にする
- `drawText(text, x, y, font, color)`: `font` と `fillStyle` を設定して文字を描く
- `drawImage(image, x, y, width, height)`: 省略時は画像自身のサイズ
- `drawLine(x1, y1, x2, y2, color, lineWidth)`: `moveTo` / `lineTo` / `stroke`

### `CD2`: 入力形式を増やす

`CD2` は `CD1` を内部に持ち、通常の描画を委譲します。`drawImage` だけは入力を判定します。

```js
const drawer = new CD2(canvas);
drawer.drawImage(new Image(), 20, 20);       // Image として描画
drawer.drawImage([80, 40, "green"], 20, 80); // 長方形として描画
drawer.clear();
```

配列形式は `[width, height, color]` の3要素だけです。それ以外は `Invalid image format` を出して何も描きません。`instanceof Image` に依存するため、別 window の Image や画像 URL の文字列は画像として扱われません。

### `CD3`: 論理座標から実座標へ

ゲーム内の座標系を 800 x 600 に固定し、画面の Canvas サイズが変わっても同じ値で描きたい場合に使います。

```js
const drawer = new CD3(canvas, 800, 600);
drawer.drawRectangle(50, 50, 200, 100, "blue");
```

変換は次の通りです。

```text
scaleX = canvas.width  / logicalWidth
scaleY = canvas.height / logicalHeight
実 x  = 論理 x * scaleX
実 y  = 論理 y * scaleY
```

`worldToCanvasX` と `worldToCanvasY` は座標変換、`worldToCanvasSize(value, axis)` は幅・高さ変換です。円の半径だけは `min(scaleX, scaleY)` を使うため、縦横比が違っても円が楕円になりにくい設計です。`CD3` は生成時に倍率を計算するので、Canvas のサイズを後から変えた場合は作り直してください。

## Engine のデータモデル

### `GameObject`

ゲーム内の一つのオブジェクトです。`x` と `y` は左上ではなく中心座標です。見た目は矩形、円、画像を選べ、`colliders` で複数の矩形・円・多角形を組み合わせられます。

```js
const object = new GameEngine.GameObject({
  tag: ["player"], x: 100, y: 80,
  width: 60, height: 40, angle: 0, visible: true
});
```

初期値は `id` が自動採番、座標と角度が 0、サイズが指定なしなら 10 x 10、`visible` が true です。`radius` を指定するとサイズの初期値が直径になります。`tag` は文字列なら配列へ変換され、配列ならコピーされます。

| メソッド | 使い方と理由 |
| --- | --- |
| `getInfo()` | コピーに使う基本状態を新しいオブジェクトで取得 |
| `copy(overrides)` | 元を変更せず複製。`overrides` で座標などを上書き |
| `removeFrom(display)` | 指定Displayから削除。省略時は所属中のDisplayから削除 |
| `remove()` | 所属中のDisplayから削除 |
| `setId(id)` | IDを変更。使用中のIDならエラー |
| `isCopy` | `copy()` で生まれたObjectなら `true`。`addObjectById()` は `false` |
| `initialPrograms` | Display追加時に一度だけ実行するコード配列 |
| `programs` | 毎フレーム実行するコード配列 |
| `move(dx, dy)` | 現在位置から相対移動 |
| `moveTo(x, y)` | 絶対座標へ移動。ドラッグに向く |
| `rotateTo(angle)` / `rotateBy(d)` | 角度を絶対指定 / 相対変更。描画時に度からラジアンへ変換 |
| `containsPoint(px, py)` | 複合コライダーのいずれかに点が含まれるか判定 |
| `intersectsObject(other)` | 複合コライダー同士の交差判定。矩形・円・多角形に対応 |
| `touchesTag(tag, display)` | 指定タグのObjectに触れているか判定 |
| `touchesColor(color, tolerance, display)` | 指定RGB色のObjectに触れているか判定。R/G/B全てが許容差以内 |
| `isColorWithinTolerance(color, tolerance)` | 自分の色が指定色から許容差以内か判定 |
| `setImage(image)` / `loadImage(url)` | Image要素・URL画像をObjectへ設定 |
| `touchesDisplayEdge(display)` | 矩形のいずれかが Display の端に触れるか判定 |
| `draw(ctx)` | visible のとき画像またはコライダー形状を回転込みで描画 |

`onCopy` が関数なら `copy()` の最後に複製先へ呼ばれます。タグ追加やコピー時の初期化に使えます。コピーは元とは別の ID を持ちますが、`copy({ id: 10 })` のように明示した場合はその ID を使います。Object専用の値は `setPrivate(name, value)` / `getPrivate(name, fallback)` / `hasPrivate(name)` で管理し、他のObjectの公開プロパティからは見えません。

### `Display`

オブジェクトをまとめる表示レイヤーです。配列の後ろに追加した Display ほど上に描かれ、`Engine._renderFrame()` がその順序を使います。

```js
const display = engine.createDisplay({
  name: "background", width: 640, height: 360,
  transparent: true, blend: "normal"
});
display.addObject(object);
// Engineへ登録したテンプレートはIDで追加できます
display.addObject("player");
```

公開メソッドは `listObjects()`（配列のコピー）、`findByTag(tag)`、`findByCondition(fn)`、`pauseAll()`、`resumeAll()`、`hideObject(id)`、`showObject(id)`、`addObject(obj)`、`addObjectFromPrototype(proto, overrides)`、`addDrawable(fn)`、`delete()` です。`addDrawable(fn)` は、矩形オブジェクト以外の HUD や背景情報を context へ描く関数を登録するために使います。

`hideObject` は `_hidden` に ID を入れるだけなので、オブジェクト自体を削除しません。`addObjectFromPrototype` は `proto.copy()` を使うため、プロトタイプを汚染せず同型のオブジェクトを作れます。

現在の実装では `pauseAll()` / `resumeAll()` は `paused` フラグを変更するだけで、`drawTo()` はそのフラグを参照しません。また `Display` 自身に更新処理はありません。Engine の更新コールバックで一時停止を実現するには、アプリ側の更新処理で `display.paused` を確認する必要があります。

### `InputManager`

`Engine` が `this.input` として公開します。`start()` の最初のフレームで Canvas に接続されます。

Programs と Engine 起動コードでは `INPUT` を使えます。`INPUT.mouse()` は `{x, y, pressed, justClicked, lastClickTime}` のコピーを返し、`INPUT.key(key)` は指定キーが押されている間 `true` を返します。

```js
const mouse = INPUT.mouse();
if (INPUT.key("ArrowLeft")) self.move(-100 * dt, 0);
```

```js
if (engine.input.mouse.justClicked) {
  const x = engine.input.mouse.x;
  const y = engine.input.mouse.y;
}
if (engine.input.isKeyPressed("ArrowLeft")) object.move(-4, 0);
```

状態は `mouse.x`, `mouse.y`, `mouse.pressed`, `mouse.justClicked`, `mouse.lastClickTime` と、押下中キーの `Set` で保持します。`attachTo(element)` は pointerdown/up/move を要素へ登録し、keydown/keyup は window へ登録します。再接続前に `detach()` を呼ぶため、同じ入力イベントが二重登録されません。

- `isKeyPressed(key)`: `keys.has(key)`
- `timeSinceLastClick()`: 最後のクリックからのミリ秒。クリック前は `Infinity`
- `update()`: 毎フレーム `justClicked` だけを false に戻す

マウス座標は `getBoundingClientRect()` の左上からの距離を、Canvas 内部サイズとの比率で補正して保存します。Canvas を CSS で縮小表示しても、内部のゲーム座標に近い値を得られます。

### `Utils`

```js
GameEngine.Utils.distancePoints(ax, ay, bx, by)
GameEngine.Utils.distancePointToObject(px, py, object)
GameEngine.Utils.distanceObjectToObject(a, b)
GameEngine.Utils.angleToDxDy(angleDeg, distance)
```

距離は `Math.hypot`、角度は度をラジアンへ変換して `cos` / `sin` で移動量にします。0度は右方向、90度は下方向です。`distancePointToObject` は名前に反してオブジェクトの中心までの距離であり、矩形の最近点までの距離ではありません。

### `Engine`

```js
const engine = new GameEngine.Engine({ fps: 60, canvas });
const layer = engine.createDisplay({ width: 640, height: 360 });
layer.addObject(new GameEngine.GameObject({ x: 100, y: 100 }));
engine.start();
// 終了時
engine.stop();
```

`constructor` は Canvas の 2D context、Display 配列、InputManager を作ります。`addDisplay(display)` は Display に Engine と入力を関連付けて登録します。`createDisplay(spec)` は `new Display(spec)` と `addDisplay` を一度に行います。

`start()` は Canvas がないと例外を投げます。`requestAnimationFrame` の時刻差が `1000 / fps` 未満のフレームは描画を飛ばし、達したフレームだけ `_renderFrame()` を実行します。`stop()` はフラグを下げ、予約済みの animation frame をキャンセルします。

`_renderFrame()` の描画手順は次の通りです。

1. メイン Canvas を `clearRect` する。
2. 各 Display 用にオフスクリーン Canvas を作る。
3. `transparent` なら透明、false なら白背景にして `drawTo()` する。
4. 上位 Display の `blend` が `blur` / `transparent` / `fill` の場合、上位レイヤーの占有矩形をクリップ範囲として合成する。
5. 合成結果をメイン Canvas の `(0, 0)` に描く。
6. `InputManager.update()` で一時的なクリックフラグを消す。

利用できる `blend` は実装上 `normal`, `blur`, `transparent`, `fill` です。Display の矩形サイズはメイン Canvas へそのまま描かれ、位置合わせも `(0, 0)` 固定です。したがって、すべての Display を同じサイズ・同じ座標系で作るのが前提です。

## `demo.html` を読み解く

デモは最小ゲームを組み立てる見本です。

```js
const proto = new GameEngine.GameObject({
  tag: ["box"], x: 100, y: 80, width: 60, height: 40
});
proto.onCopy = copy => copy.tag.push("copied");
d1.addObject(proto.copy({ x: 120, y: 180 }));
```

このコードで元の `proto` は変更されず、各コピーに固有 ID と `copied` タグが付きます。`pickTopObjectAt` は Display を後ろから、各 Display のオブジェクトを後ろから調べます。これで画面上で後から描かれるものを優先して選択できます。

ドラッグ開始時はクリック位置とオブジェクト中心の差を `dragOffset` に保存します。その差を維持したまま `moveTo` するため、クリックした場所がオブジェクトの中心へ瞬間移動しません。キー操作は毎フレーム押下中のキーを読み、Shift で速度を4倍、Control で4分の1にします。

## 1 から再構築する順番

1. `canvas` 要素を HTML に置き、幅と高さを決める。
2. `canvas.getContext("2d")` を取得し、`fillRect` で長方形を描く。
3. `CD1` 相当のクラスに図形、文字、画像、線、消去を移す。
4. 論理座標が必要なら `scaleX` / `scaleY` を導入し、`CD3` 相当の変換を全描画メソッドへ適用する。
5. `GameObject` に中心座標、サイズ、タグ、可視性、移動、当たり判定を持たせる。
6. `Display` にオブジェクト配列を持たせ、`drawTo(ctx)` で順番に描く。
7. `InputManager` で pointer と keyboard のイベントを状態へ変換する。
8. `requestAnimationFrame` と経過時間による FPS 制限を `Engine` に実装する。
9. Display ごとにオフスクリーン Canvas を作り、レイヤーを順番に合成する。
10. `demo.html` のように、入力をゲームルールへ接続する。

最初から `Deal` や Engine を再現する必要はありません。DOM と描画が動いたことを確認してから、状態、入力、レイヤーの順に追加すると、どの段階で壊れたかを切り分けやすくなります。

## 再構築時に確認するチェックリスト

- `domDeal.js` が `website/index.html` から `../qs/domDeal.js` として解決できるか
- `canvasDealer.js` を使う前に読み込みが完了しているか
- Canvas の内部サイズと CSS 表示サイズを意図的に分けているか
- `CD3` の論理サイズと Display のサイズが一致しているか
- GameObject の `(x, y)` が中心座標であることを全コードで守っているか
- Display の追加順とクリック選択の探索順が一致しているか
- `justClicked` を毎フレーム消すタイミングが、ゲーム側の入力処理より後になっているか
- `engine.stop()` を呼び、animation frame を終了できるか
- `Image` のロード完了後に `drawImage` を呼んでいるか
- `pauseAll()` を使う場合、アプリ側の更新処理が `paused` を確認しているか

## 現在の制限と未完成部分

- `GameDealer` はコンストラクターで `canvasDealer` を保持するだけで、描画メソッドはまだありません。
- `GameObject.draw()` は `color` で色を変えられる矩形描画です。画像や種類ごとの描画はアプリ側で拡張する必要があります。
- `Engine` は表示を更新するが、`GameObject.programs` を実行しません。
- Display のオフスクリーン Canvas は Engine 起動後にキャッシュして再利用します。ただし多数のレイヤーや大きなエフェクトでは負荷が高くなる可能性があります。
- `blend` は一般的な Canvas `globalCompositeOperation` の完全な実装ではなく、占有矩形への簡易効果です。
- Canvas を CSS で縮小した場合も入力座標は補正されますが、複雑な CSS 変形や複数 Canvas の座標変換はアプリ側で確認が必要です。
- `scriptdemo.js` の DOM 作成は `Deal` を使わず、`document.createElement` と `Object.assign` を使います。`domDeal.js` を使った構築例は `script.js` です。

この README は現在のコードの挙動を説明しています。仕様を変更した場合は、特に「全体の実行順」「公開メソッド」「現在の制限」を同時に更新してください。