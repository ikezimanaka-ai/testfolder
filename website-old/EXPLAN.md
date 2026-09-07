# Engine Object Editor 完全ガイド

対象: `website/editor.html` / `website/editor.js` / `website/editor.css`

この文書は、Editorを利用する人向けの操作説明であると同時に、Editorがどのようにテンプレート、Display、Canvas、Engine、ユーザープログラムを接続しているかを一から追える内部仕様書です。

## 1. Editorの役割

Editorは、ブラウザ上でCanvasゲームの次の要素を編集するGUIです。

- **Engine**: Displayの作成、ゲーム開始時の処理、毎フレームの全体処理
- **Object Template**: Objectの設計図。ID、タグ、位置、サイズ、見た目、当たり判定、プログラムを持つ
- **Display**: 実際のObjectを入れて描画するレイヤー
- **Initial Program**: ObjectがDisplayへ追加された直後に、そのObjectについて一度だけ実行するコード
- **Frame Program**: Display内に存在するObjectごとに、毎フレーム実行するコード

重要なのは、Object一覧に表示されるものは実体ではなくテンプレートだという点です。テンプレートを作っただけではCanvasに何も表示されません。Engine Initial ProgramでDisplayを作り、`display.addObjectById('テンプレートID')` を実行して初めて実体が作られます。

## 2. 起動方法

`editor.html`は通常の静的HTTPサーバーから開くのが確実です。`engine.js`と`editor.js`は相対パスで読み込まれ、Monaco EditorはCDNから読み込まれます。

```sh
python3 -m http.server 8000 --directory /home/user0518s/phoenix/playapp/games/testfolder
```

ブラウザで次を開きます。

```text
http://localhost:8000/website/editor.html
```

HTMLの読み込み順は次のとおりです。

```text
editor.css
  -> 画面のレイアウトとMonaco/textareaの表示を定義
engine.js
  -> GameObject, Display, InputManager, Engine, Utilsを定義
editor.js
  -> Engineを作り、画面イベントとEditorの動作を接続
```

Monaco Editorの読み込みに成功すると、JavaScriptの色付け・行番号・暗色テーマ・自動レイアウト付きのコード欄になります。CDNに接続できない場合は、`editor.js`が`monaco-fallback`クラスを`body`へ付け、非表示だった通常の`textarea`を表示します。入力内容を保持するため、コード取得・設定関数はMonacoとtextareaの両方に対応しています。

## 3. 画面の構成

### 3.1 左側 Inspector

最初はObject一覧の`Engine`が選択されます。左側にはEngineのコード欄が表示されます。

Objectを選択すると、次のObjectフォームに切り替わります。

| 項目 | 内容 |
| --- | --- |
| Object ID | テンプレートを指定する一意のID。空欄・重複不可 |
| Tag | カンマ区切りのタグ。例: `player, friendly` |
| X / Y | Objectの中心座標 |
| Width / Height | 描画・標準矩形コライダーのサイズ |
| Appearance / Collider | Rectangle、Circle、PNG/JPEG、CSV polygon |
| Color | 矩形・円・CSVポリゴンの色。カラーピッカー |
| Image file | PNG/JPEGを選ぶ。選択後は種類が`image`になる |
| Collision CSV | 1行に`x,y`を書くファイル。3点以上で多角形になる |
| Initial Programs | Object追加時に一度だけ動くコード |
| Frame Programs | そのObjectがDisplayに存在する間、毎フレーム動くコード |

X/Yは左上ではなく中心です。たとえば`x: 100, y: 80, width: 40, height: 20`なら、矩形はおよそ左上`(80,70)`、右下`(120,90)`に描画されます。

### 3.2 右側 Workspace

- **標準APIヘルプ**: `help.html`を別タブで開く
- **Guide**: `guide.html`を別タブで開く
- **Start**: Engineを初期化してゲームループを開始
- **Stop**: ゲームループを停止
- **Reset**: ループ停止、Display内の実体削除、起動済み状態の解除
- **Debug**: Canvas上のObjectにマウスを置いたとき変数を表示するモードを切り替え
- **Save**: 現在のEngineコードとテンプレートを`project.json`として保存
- **Load**: JSONファイルを選択して現在の内容を置き換える
- **Canvas**: Engineの描画結果。初期論理サイズは最大800 x 600、比率は4:3
- **Object Templates**: Engine行とObjectテンプレートの一覧
- **New Object**: 新しいObjectを作る

画面幅が760px以下になると、左右2列から縦積みに変わります。Canvasは表示領域に合わせて縮小されますが、Canvas内部の座標は表示倍率に合わせて入力位置を補正します。

## 4. 基本操作の手順

### 4.1 最小のObjectを表示する

1. `New Object`を押す。
2. Object IDを`player`などに変更する。
3. X/Y、Width/Height、色を設定する。
4. Object一覧の`Engine`を押す。
5. Engine Initial Programsへ次を書く。

```js
const main = engine.createDisplay({
  name: 'main',
  width: 800,
  height: 600,
  transparent: false,
});
main.addObjectById('player');
```

6. `Start`を押す。

`engine.createDisplay`はDisplayをEngineへ追加し、`main.addObjectById('player')`は`player`テンプレートをコピーしてDisplayへ追加します。この追加時に、playerのInitial Programが実行されます。

### 4.2 Objectを動かす

playerを選択し、Frame Programsへ次を書きます。

```js
if (INPUT.key('ArrowRight')) self.Xmove(120 * dt);
if (INPUT.key('ArrowLeft')) self.Xmove(-120 * dt);
```

`self`は現在処理中のObject、`dt`は秒単位の経過時間です。30 FPSならおおむね1フレーム`0.033`秒です。速度に`dt`を掛けることで、FPSに依存しにくい移動になります。

`Xmove`はXを増減します。`Ymove`はCanvas座標のYを減らすため、正の値で上へ移動します。一般的なCanvas座標どおり下へ移動したい場合は`self.move(0, speed * dt)`を使います。

### 4.3 Objectを増やす

Engine Initial Programで、テンプレートを何度でも追加できます。

```js
const main = engine.createDisplay({ name: 'main', width: 800, height: 600 });
main.addObjectById('player', { x: 100, y: 300 });
main.addObjectById('player', { x: 300, y: 300 });
```

同じテンプレートから作られても、追加された実体は別Objectです。`overrides`でコピー時の設定を上書きできます。

ObjectのFrame Programからも追加できます。

```js
if (INPUT.key('Space') && !self.getPrivate('fired', false)) {
  self.addObjectById('bullet', { x: self.x, y: self.y });
  self.setPrivate('fired', true);
}
if (!INPUT.key('Space')) self.setPrivate('fired', false);
```

ObjectがDisplayに所属していない状態で`self.addObjectById`を呼ぶとエラーになります。

### 4.4 Objectを削除する

```js
if (self.x > 850) self.remove();
```

- `self.remove()`: 自分が所属するDisplayから削除
- `self.removeFrom(display)`: 指定Displayから削除
- `self.remove()`はテンプレート自体を削除しない

### 4.5 右クリックで複製・削除する

Object一覧のObject行を右クリックするとコンテキストメニューが出ます。

- **複製**: 元Objectの設定をコピーし、IDに`_copy`などを付けた新テンプレートを作る
- **削除**: テンプレートを登録から外し、関連するMonacoモデルを破棄する

複製はテンプレートをコピーするだけで、Displayに実体を追加しません。

## 5. 4種類のプログラムと実行タイミング

Editorには、Engine用2種類とObject用2種類があります。

### 5.1 Engine Initial Program

Start時、まだ起動済みでなければ一度だけ実行されます。Editorでは入力内容を`engine.startupPrograms`へ1要素の配列として設定し、`engine.runStartupPrograms()`を呼びます。

主な用途:

- Displayを作る
- テンプレートをDisplayへ追加する
- Displayの共有状態を初期化する
- 背景やUIを登録する

```js
const main = engine.createDisplay({ name: 'main', width: 800, height: 600 });
main.score = 0;
main.addObjectById('player');
```

コードのスコープには、Display名をキーにした変数、`engine`、`INPUT`が入ります。Display名を`main`にすると、以後のEngine Frame Programで`main`として参照できます。

### 5.2 Engine Frame Program

Editorの`engine.onUpdate(runPrograms)`経由で、Engineの更新コールバック内に実行されます。Engine Initial Programが正常終了して`startupExecuted`がtrueになっているときだけ実行されます。

```js
main.timer = (main.timer || 0) + dt;
if (main.timer > 2) {
  main.timer = 0;
  main.addObjectById('enemy', { x: 800, y: 200 });
}
```

Engine Frame Programの実行時には、各Display名、`INPUT`、`engine`、`dt`が使えます。`this.something`と書いた場合、Editorの実行処理は`this.`を`engine.`へ置換します。ただし、最初から`engine.something`と書く方が明確です。

### 5.3 Object Initial Program

テンプレートから実体がDisplayへ追加されたとき、Engineの`runInitialPrograms`が一度だけ実行します。`object._initialProgramsRun`がtrueになったObjectには再実行しません。

```js
self.setPrivate('speed', 120);
self.setPrivate('cooldown', 0);
```

初期化したい値はPrivate値へ保存するのが安全です。`var`で宣言したローカル変数は、Frame Programの実行関数をまたいで自動的に持続する状態として扱わないでください。

`self.isCopy`は`self.copy()`で生成されたObjectならtrueです。ただし、テンプレートIDから`addObjectById`で追加される実体はfalseです。

### 5.4 Object Frame Program

毎フレーム、全Displayの全実体Objectについて実行されます。

```js
const speed = self.getPrivate('speed', 120);
self.move(speed * dt, 0);
if (self.x > display.width + self.width) self.remove();
```

実行時の主な値:

| 名前 | 意味 |
| --- | --- |
| `self` | 現在のObject |
| `display` | 現在のObjectが所属するDisplay |
| `engine` | Engineインスタンス |
| `dt` | 秒単位の経過時間 |
| `INPUT` | `mouse()`と`key()`を持つプログラム用入力API |
| Display名 | Engineコードで作ったDisplayへの参照を、スコープから取得 |

Editorは各プログラムを次のような形の動的関数として評価します。

```js
new Function('self', 'display', 'engine', 'dt', 'INPUT', 'scope', `
  return (function () {
    with (scope) { ${program} }
  }).call(self);
`)(object, display, engine, dt, engine.public.INPUT, scope);
```

つまり通常のJavaScriptファイルのトップレベルではなく、Engineが用意した引数・スコープの中で動きます。構文エラーや実行時エラーは捕捉され、Object側は`program-error`、Engine側は`engine-settings-error`へ表示されます。

## 6. 使用できる標準API

詳細なAPI一覧は画面上部の「標準APIヘルプ」で開ける`help.html`にもあります。ここではEditorのProgramsで特に使うものをまとめます。

### 6.1 Object API

| API | 説明 |
| --- | --- |
| `self.id` | ObjectのID |
| `self.tag` | タグ配列 |
| `self.x`, `self.y` | 中心座標 |
| `self.width`, `self.height` | サイズ |
| `self.color` | 色 |
| `self.visible` / `self.hidden` | 表示状態。`hidden = true`で非表示 |
| `self.angle` | 度単位の回転角 |
| `self.move(dx, dy)` | 相対移動 |
| `self.Xmove(distance)` | Xに加算。正で右 |
| `self.Ymove(distance)` | Yから減算。正で上 |
| `self.moveTo(x, y)` | 絶対移動 |
| `self.rotateTo(angle)` | 角度を指定 |
| `self.rotateBy(delta)` | 角度を相対変更 |
| `self.remove()` | 所属Displayから削除 |
| `self.removeFrom(display)` | 指定Displayから削除 |
| `self.copy(overrides)` | Objectを複製。Displayには自動追加しない |
| `self.addObjectById(id, overrides)` | 所属Displayへテンプレート実体を追加 |
| `self.setPrivate(name, value)` | Object専用状態を保存 |
| `self.getPrivate(name, fallback)` | Object専用状態を取得 |
| `self.hasPrivate(name)` | Private値の存在を確認 |
| `self.changePrivate(name, delta)` | 数値Private値を加減算 |
| `self.setScale(scale)` | 基準サイズに対して拡大縮小 |
| `self.containsPoint(x, y)` | 点がコライダー内部か判定 |
| `self.intersectsObject(other)` | 他Objectと衝突しているか判定 |
| `self.touchesTag(tag, display)` | 指定タグのObjectと接触しているか判定 |
| `self.isCollidingWith(tag, x, y, options, display)` | 仮の位置・サイズで衝突判定 |
| `self.isCollusion(...)` | `isCollidingWith`の互換名 |
| `self.touchesColor(color, tolerance, display)` | 指定色のObjectと接触しているか判定 |
| `self.isColorWithinTolerance(color, tolerance)` | 自身の色が指定色に近いか判定 |
| `self.touchesDisplayEdge(display)` | Displayの端に触れているか判定 |
| `self.setImage(image)` | Image要素またはURL文字列を画像として設定 |
| `self.loadImage(url)` | URL画像を非同期ロードして設定 |

`move`の引数はピクセル単位です。`rotateTo`と`rotateBy`の角度は度です。衝突は`colliders`に入っている形状のどれか一つでも交差すればtrueです。

### 6.2 Display API

Engine Initial/Frame Programでは、Display名を変数として使えます。

```js
const main = engine.createDisplay({
  name: 'main', width: 800, height: 600,
  transparent: false, blend: 'normal'
});
```

| API | 説明 |
| --- | --- |
| `display.listObjects()` | 所属Objectの配列コピー |
| `display.findByTag(tag)` | タグ一致Objectの配列 |
| `display.findByCondition(fn)` | 条件関数に一致するObjectの配列 |
| `display.addObject(object)` | GameObjectを直接追加 |
| `display.addObjectById(id, overrides)` | Engine登録テンプレートから追加 |
| `display.addObjectFromPrototype(proto, overrides)` | Prototypeをコピーして追加 |
| `display.addDrawable(fn)` | Canvas描画用関数を登録 |
| `display.pauseAll()` | pausedフラグをtrue |
| `display.resumeAll()` | pausedフラグをfalse |
| `display.hideObject(id)` | IDのObjectを描画から隠す |
| `display.showObject(id)` | IDのObjectを再表示 |
| `display.delete()` | EngineからDisplayを削除 |

`listObjects()`の戻り値は配列のコピーですが、配列内のObjectは実体です。Objectのプロパティを変更すると実体が変わります。

現在のEngineでは`pauseAll()`と`resumeAll()`はフラグを変えるだけで、標準のFrame Program実行を自動停止しません。停止条件が必要なら、コード側で`if (!main.paused) { ... }`のように確認します。

### 6.3 Engine API

| API | 説明 |
| --- | --- |
| `engine.createDisplay(spec)` | Displayを作成して登録 |
| `engine.addDisplay(display)` | 既存Displayを登録 |
| `engine.registerTemplate(object)` | Objectをテンプレートとして登録 |
| `engine.getTemplate(id)` | IDからテンプレート取得 |
| `engine.unregisterTemplate(id)` | 登録解除 |
| `engine.addStartupProgram(source)` | 起動コードを追加登録 |
| `engine.runStartupPrograms()` | 登録済み起動コードを実行 |
| `engine.onUpdate(fn)` | 更新関数を登録 |
| `engine.removeUpdate(fn)` | 更新関数を解除 |
| `engine.onRender(fn)` | 描画後Hookを登録 |
| `engine.start()` | ゲームループ開始 |
| `engine.stop()` | ゲームループ停止 |

Editor自身はEngineを`new Engine({ fps: 30, canvas })`で作ります。Engineは30 FPSを目標にし、更新関数へ秒単位の`dt`を渡します。

### 6.4 INPUT API

Programsからは`INPUT`を使います。

```js
const mouse = INPUT.mouse();
if (INPUT.key('ArrowLeft')) self.move(-120 * dt, 0);
if (mouse.justClicked) self.moveTo(mouse.x, mouse.y);
```

| API | 戻り値・意味 |
| --- | --- |
| `INPUT.mouse()` | `{ x, y, pressed, justClicked, lastClickTime }`のコピー |
| `INPUT.key(key)` | 指定キーが押されていればtrue |
| `engine.input.isKeyPressed(key)` | Engineコードから詳細入力状態を確認 |
| `engine.input.timeSinceLastClick()` | 最後のクリックからのms。未クリックはInfinity |

キーボードイベントはWindowで受け取り、PointerイベントはStart時にCanvasへ接続します。CanvasがCSSで縮小表示されても、マウス座標はCanvas内部サイズへ変換されます。Spaceは`'Space'`と`' '`の両方を扱えるように登録されます。

### 6.5 Utils

```js
GameEngine.Utils.distancePoints(ax, ay, bx, by);
GameEngine.Utils.distancePointToObject(px, py, object);
GameEngine.Utils.distanceObjectToObject(a, b);
GameEngine.Utils.angleToDxDy(angleDeg, distance);
```

`angleToDxDy`は0度が右、90度が下です。`distancePointToObject`はObjectの外周までではなく、中心までの距離です。

## 7. 見た目とコライダー

### Rectangle

`image-kind`がRectangleのとき、表示は矩形です。コライダーも幅・高さから自動的に矩形になります。

### Circle

Circleを選ぶと、半径は`min(width, height) / 2`です。幅と高さが異なる場合も円は小さい方に合わせます。

### PNG / JPEG

Image fileから画像を選ぶと、ブラウザ内のObject URLを作り、画像ロード後に`selected._imageElement`へ保存します。表示時は画像をObjectの幅・高さへ伸縮します。画像が読み込み中なら、画像要素がまだ描画されない場合があります。

### CSV polygon

CSVは次のような形式です。

```csv
-30,-20
30,-20
40,20
-40,20
```

各行をカンマで分け、数値として読める行だけを採用します。3点以上ならPolygonコライダーになります。座標はObject中心からの相対座標として扱われ、Objectの回転に合わせて変換されます。

CSVの行に3列以上あっても、先頭2列だけが`x,y`として使われます。3点未満の場合はCSVへ切り替わりません。

## 8. 衝突判定の仕組み

Objectは`colliders`配列を持ちます。Editorで通常作られるのは一つですが、Engine APIでは複数を持てます。複合判定は「Aのコライダーのどれか」と「Bのコライダーのどれか」の組み合わせを調べ、どれか一つが交差すればtrueです。

対応形状は次の3種類です。

- `rect`: 内部的には4頂点のPolygonへ変換
- `circle`: 中心と半径で判定
- `polygon`: 頂点列で判定

`containsPoint`は点と形状、`intersectsObject`は形状同士を判定します。Objectの中心座標を基準に形状を配置し、角度を度からラジアンへ変換してワールド座標へ移します。

`isCollidingWith`は現在のObjectをコピーした仮Objectを指定位置へ移動し、実際には移動せず衝突を調べます。

```js
const nextX = self.x + 100 * dt;
if (!self.isCollidingWith('wall', nextX, self.y)) {
  self.x = nextX;
}
```

## 9. Start / Stop / Reset / Debugの内部動作

### Start

1. `startupExecuted`がfalseなら`runEngineCode()`を呼ぶ。
2. 実行前に全Displayを削除し、Display内Objectを破棄する。
3. Engineコードを反映する。
4. Engine Initial Programを実行する。
5. 成功すれば`startupExecuted = true`。
6. `engine.start()`でrequestAnimationFrameループを開始する。

一度Startした後にEngine Initial Programを書き換えても、次のStartでは再実行されません。変更を反映するには`Reset`してからStartします。

### Stop

`engine.stop()`だけを呼びます。DisplayやObjectは残るため、Stop後に再度Startすると同じ実体がそのまま動きます。

### Reset

Engineを停止し、全Display内Objectを破棄してDisplay自体も削除し、`startupExecuted`をfalseに戻します。Debug tooltipも隠します。テンプレートは削除しません。

### Debug

Debugを有効にしてCanvas上のObjectへマウスを移動すると、最前面から探索して最初に見つかったObjectの情報を表示します。表示対象は、内部プロパティを除くObjectのプロパティと、`private.<name>`形式のPrivate値です。`programs`と`initialPrograms`は表示しません。

透明部分を持つ画像でも、選択判定は画像のアルファ値ではなくコライダーで行います。複数Displayが重なる場合は、後に登録されたDisplayを上位として探索します。

## 10. Save / LoadのJSON形式

Saveは次の形のJSONを作り、ブラウザのダウンロード機能で`project.json`として保存します。

```json
{
  "engine": {
    "initial": "const main = engine.createDisplay(...);",
    "frame": "main.score = (main.score || 0) + dt;"
  },
  "templates": [
    {
      "info": {
        "id": "player",
        "tag": ["player"],
        "x": 120,
        "y": 100,
        "angle": 0,
        "width": 40,
        "height": 40,
        "color": "#ef8354",
        "image": null,
        "colliders": [{ "type": "rect", "width": 40, "height": 40 }],
        "initialPrograms": [],
        "programs": []
      },
      "initialPrograms": [],
      "programs": []
    }
  ]
}
```

Loadの手順は次のとおりです。

1. `Load`を押す。
2. `.json`ファイルを選ぶ。
3. FileReaderでテキストとして読む。
4. JSON.parseでオブジェクト化する。
5. 現在のテンプレートを削除する。
6. EngineコードをEditorとEngineへ復元する。
7. 各`info`からGameObjectを作り直す。
8. テンプレートとして再登録する。
9. Engine行を選択する。

不正JSONの場合はalertで失敗を知らせます。

### 保存に関する注意

`getInfo()`はJSON化できる基本設定を保存しますが、ブラウザのImage要素そのものは保存しません。したがって、Editorでローカルファイルを選んだ画像の実体は、通常のSave/Loadでは復元されません。CSVの`_csvPoints`も`getInfo()`には含まれないため、Load後にCSVファイルを再選択する必要があります。画像やCSVを含むプロジェクトは、JSONと元ファイルを同じ作業単位で管理してください。

また、Private値、`_imageElement`、`_csvPoints`、`onCopy`関数はテンプレートJSONに保存されません。Private値はObject Initial Programで再初期化する設計にします。

## 11. `editor.js`の関数一覧

ここではEditor自身に定義されている名前付き関数を、ソースの順番に沿って全件説明します。`addEventListener`へ渡している短い無名関数も、後半のイベント一覧で分類します。

| 関数 | 役割 |
| --- | --- |
| `initializeCanvas()` | `.canvas-wrap`の表示領域と4:3比率からCanvas内部サイズを決め、`canvas.width/height`とCSSサイズを設定する。最大800 x 600 |
| `getProgram()` | 選択ObjectのMonaco Frame Program、またはfallback textareaの値を返す |
| `setProgram(value)` | 選択ObjectのIDごとのMonaco Modelを取得・作成し、Frame Programを表示する。Monaco未使用時はtextareaへ設定 |
| `getInitialProgram()` | 選択ObjectのMonaco Initial Program、またはfallback textareaの値を返す |
| `setInitialProgram(value)` | 選択ObjectのIDごとのMonaco Modelを取得・作成し、Initial Programを表示する |
| `getEngineInitialProgram()` | Engine Initial欄の現在値を返す |
| `getEngineFrameProgram()` | Engine Frame欄の現在値を返す |
| `setEngineInitialProgram(value)` | Engine Initial欄へ文字列を設定する |
| `setEngineFrameProgram(value)` | Engine Frame欄へ文字列を設定する |
| `setupMonaco()` | CDNのloader.jsを動的追加し、Monacoを初期化する。4つのエディタ、4つの変更監視、fallback処理を設定する |
| `escapeHtml(value)` | Object一覧やDebug tooltipへ安全に文字列を入れるため、`& < > " '`をHTMLエンティティへ変換する |
| `uniqueId(candidate)` | 既存テンプレートと重複しないIDを作る。重複時は`_2`, `_3`を付ける |
| `makeTemplate(source = null)` | 新規または既存Templateのコピーを作り、画像要素・CSV点列を可能な範囲で複製し、Engine登録・選択・一覧描画を行う |
| `selectTemplate(template)` | 選択Objectを変更し、フォームとObjectごとのMonaco Modelへ設定を反映する |
| `selectEngine()` | Object選択を解除し、Engine設定欄を表示する |
| `syncEnginePrograms()` | Engineコード欄をfallbackへ同期し、`engine.startupPrograms`と`engine.framePrograms`を更新する |
| `renderObjectList()` | Engine行と全テンプレート行を作り直し、クリック・右クリックイベントを設定する |
| `updateSelected()` | フォーム変更を選択中GameObjectへ反映する。ID検証、Engine登録し直し、タグ、数値、色、プログラム、コライダーを更新する |
| `deleteTemplate(template)` | templates配列、Engine登録、Monaco Model、GameObjectを削除し、必要なら別Objectを選択する |
| `clearRuntime()` | 全Display内の実体を破棄し、全Displayを削除する。テンプレートは残す |
| `runEngineCode()` | Runtimeをクリアし、Engineコードを同期してInitial Programを実行する。成功・失敗状態を設定する |
| `runPrograms(dt)` | Engine Frame Program、全実体ObjectのFrame Programを順に動的実行する。実行時エラーを画面へ表示する |
| `findObjectAt(event)` | Pointer座標をCanvas内部座標へ変換し、上位Display・上位Objectから点選択する |
| `showDebug(event)` | 最新Pointer座標を保存して`updateDebug()`を呼ぶ |
| `updateDebug()` | Debug有効時、Pointer下Objectの公開値とPrivate値からtooltip HTMLを作り配置する |
| `saveProject()` | Engineコードと全テンプレート情報をJSON化し、Blobを`project.json`としてダウンロードする |
| `loadProject()` | 選択JSONをFileReaderで読み、現在のテンプレートを消してEngineコードとテンプレートを復元する |

### 11.1 内部状態の変数

| 変数 | 内容 |
| --- | --- |
| `engine` | `new Engine({ fps: 30, canvas })`で作られる実行Engine |
| `templates` | Editor上のGameObjectテンプレート配列 |
| `selected` | 現在選択中のテンプレート。Engine選択時はnull |
| `contextTarget` | 右クリックメニューの対象テンプレート |
| `imageUrl` | 直前に選択した画像のObject URL |
| `debugEnabled` | Debug表示の有効・無効 |
| `startupExecuted` | Engine Initial Programを正常実行済みか |
| `pointerPosition` | Debug用の最後のPointer位置 |
| `programEditor`等 | Monacoの4つのエディタインスタンス |
| `programModels` | Object IDからFrame Program ModelへのMap |
| `initialProgramModels` | Object IDからInitial Program ModelへのMap |

Monaco ModelをObject IDごとに保持するため、Objectを切り替えてもコードが混線しません。ID変更時はMapのキーも移し替えます。

### 11.2 `updateSelected()`の処理順

1. Object IDをtrimする。
2. 空欄または他Objectとの重複なら、エラーを表示して元IDへ戻す。
3. IDが変わった場合、Engineから旧IDを解除し、ObjectのIDを変更して再登録する。
4. ID変更に合わせてMonaco ModelのMapキーを移す。
5. Tagをカンマで分解する。
6. X/Y/Width/HeightをNumber化する。空・無効値は0または10へフォールバックする。
7. Color、Initial Program、Frame Programを更新する。
8. Appearance / Colliderの種類に応じてコライダーを作る。
9. Rectangle/Circleなら`image = null`、Image/CSVなら`image = { kind }`にする。
10. Object一覧を再描画する。

Width/HeightにHTMLの`min="1"`はありますが、JavaScript側では無効値を10へ戻します。X/Yの無効値は0へ戻ります。

### 11.3 `runPrograms(dt)`の処理順

1. `startupExecuted`がfalseなら何もしない。
2. 全DisplayをDisplay名のオブジェクトへ変換し、`scope`を作る。
3. `scope.INPUT`へプログラム用入力APIを入れる。
4. Engine Frame Programを順番に実行する。
5. エラーがあればEngineエラー欄へ表示する。
6. 全Displayを登録順に巡回する。
7. 各Displayの`listObjects()`を取得する。
8. 各ObjectのFrame Programを順番に実行する。
9. エラーがあればObjectエラー欄へ表示する。

Engine Frame ProgramがObjectの追加・削除を行っても、そのフレームのObject走査はDisplayの現在の内容に対して続きます。ObjectのFrame Program中に`remove()`しても、対象がDisplay配列から外れるだけで、直ちにテンプレートは消えません。

### 11.4 `findObjectAt(event)`の選択順

1. Canvasの画面上の矩形を取得する。
2. Pointerの画面座標をCanvas内部座標へ比例変換する。
3. Display配列を後ろから調べる。
4. 各DisplayのObject配列を後ろから調べる。
5. `object.containsPoint(x, y)`がtrueのObjectを返す。

後に登録・追加されたものを上位として扱うため、描画の重なり順とおおむね一致します。

## 12. `editor.js`のイベント一覧

| 対象 | イベント | 動作 |
| --- | --- | --- |
| `window` | `resize` | `initializeCanvas()`でCanvasサイズを再計算 |
| New Object | `click` | `makeTemplate()` |
| Object削除 | `click` | 選択中Templateを削除 |
| 右クリック複製 | `click` | `contextTarget`を複製 |
| 右クリック削除 | `click` | `contextTarget`を削除 |
| `document` | `click` | コンテキストメニューを閉じる |
| Object form | `input` | `updateSelected()` |
| Image file | `change` | Object URLを作りImageをロードして種類をimageへ変更 |
| Collision CSV | `change` | CSVを読み、3点以上ならpolygonへ変更 |
| Start | `click` | 必要なら起動処理後にEngine開始 |
| Stop | `click` | Engine停止 |
| Reset | `click` | Runtimeを全消去して未起動へ戻す |
| Debug | `click` | Debugフラグとactiveクラスを反転 |
| エラー消去 | `click` | Object Frame Programエラー表示を空にする |
| Save | `click` | `saveProject()` |
| Load | `click` | hiddenなfile inputを開く |
| project file | `change` | `loadProject()` |
| Canvas | `pointermove` | Debug tooltipを更新 |
| Canvas | `pointerdown` | Canvasへfocus |
| Canvas | `keydown` | 矢印、Space、PageUp/Down、Home/Endのブラウザ既定動作を抑制 |
| Engine | update hook | `runPrograms(dt)` |
| Engine | render hook | `updateDebug()` |

## 13. 完全な実行フロー

```text
ページ読み込み
  -> initializeCanvas()
  -> new Engine({ fps: 30, canvas })
  -> 初期状態: templates=[], selected=null
  -> setupMonaco()
  -> selectEngine()
  -> renderObjectList()

New Object
  -> makeTemplate()
  -> new GameObject(spec)
  -> templatesへ追加
  -> engine.registerTemplate()
  -> selectTemplate()
  -> renderObjectList()

フォーム入力 / コード編集
  -> updateSelected()
  -> templateの値・programs・collidersを更新

Start
  -> runEngineCode()
  -> clearRuntime()
  -> syncEnginePrograms()
  -> engine.runStartupPrograms()
  -> Display作成
  -> addObjectById()
  -> Object Initial Program
  -> engine.start()
  -> 各tickでrunPrograms(dt)
  -> engine._renderFrame()
  -> updateDebug()

Reset
  -> engine.stop()
  -> 実体Object destroy
  -> Display.delete()
  -> startupExecuted=false
```

Engineの描画は、毎フレームCanvasをクリアし、Displayを登録順にオフスクリーンCanvasへ描き、順番に合成してからメインCanvasへ出します。EditorのFrame Programは描画前の更新段階で実行されます。

## 14. エラーとトラブルシューティング

### Canvasが空白

- Startを押したか確認する
- Engine Initial ProgramでDisplayを作ったか確認する
- `main.addObjectById('id')`のIDがObject IDと一致するか確認する
- Engineエラー表示に構文エラーがないか確認する
- Object Frame Programだけを書いて、実体追加を忘れていないか確認する

### 「IDは空欄にできず、重複もできません。」

Object IDを空にしたか、別Objectと同じIDにしました。IDはテンプレート検索のキーなので一意である必要があります。

### Objectが動かない

- Engine Initial Programが正常に実行されているか
- 実体ObjectがDisplayに入っているか
- Frame ProgramがObject側かEngine側かを意図どおり選んでいるか
- `self`、`display`、`engine`、`dt`の名前を間違えていないか
- `INPUT.key()`のキー名が正しいか

### Startを押し直してもコード変更が反映されない

StopはRuntimeを残します。Engine Initial Programの変更を反映するにはResetを押してからStartします。

### DebugでObjectが選べない

Debugを有効にし、実体のある位置へCanvas上のマウスを置きます。テンプレートだけではDebug対象になりません。画像の透明部分も、画像の見た目ではなくコライダーの内側だけが選択対象です。

### Load後に画像やCSV形状が戻らない

JSONにはブラウザ内のImage要素とCSVの一時点列が保存されません。元ファイルを再選択してください。

## 15. 最初に試すサンプル

### Engine Initial

```js
const main = engine.createDisplay({
  name: 'main',
  width: 800,
  height: 600,
  transparent: false,
});
main.addObjectById('player', { x: 120, y: 300 });
```

### Object Initial

```js
self.setPrivate('speed', 180);
self.setPrivate('cooldown', 0);
```

### Object Frame

```js
const speed = self.getPrivate('speed', 180);
if (INPUT.key('ArrowRight')) self.move(speed * dt, 0);
if (INPUT.key('ArrowLeft')) self.move(-speed * dt, 0);
if (self.x > display.width + self.width) self.remove();
```

### Engine Frame

```js
main.objectsAlive = main.listObjects().length;
```

この4つを別々に確認すると、Displayの生成、テンプレートからの実体化、Object状態の初期化、毎フレーム更新、Engine全体更新というEditorの基本構造を順番に確認できます。
