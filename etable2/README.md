# ETABLE2

ETABLE2 は `etable/` の Canvas 共有卓を Scene Engine ベースで移植したものです。ロビーと卓を Scene として切り替え、卓上オブジェクトと共有ゲーム状態には既存の TABLE 2 ロジックを使います。この README を ETABLE2、Scene Engine、Canvas Object Engine、UI Objects の機能/API ガイドとします。旧版の案内は [`etable/README.md`](../etable/README.md) を参照してください。

## 起動

リポジトリルートで静的 HTTP サーバーを起動し、`/etable2/` を開きます。

```sh
python3 -m http.server 8000
```

`playground.html` は Engine と UI Object を試す独立ページです。ブラウザのモジュール読み込みと画像読み込みのため、`file://` ではなく HTTP 経由で開いてください。

## ETABLE 機能

- **ロビーと共有卓**: プレイヤー名・ルーム ID を入力し、公開ルームを一覧・参加できます。招待リンクの作成、卓の作成・退出、参加者の表示、接続状態の表示に対応します。
- **共有オブジェクト**: 卓上のオブジェクトを配置、選択、移動、回転、拡大縮小、削除、回収できます。カード、麻雀牌、コイン、描画、画像を扱います。ドラッグとクリック操作は Scene Engine の Canvas 上で行います。
- **カードと配牌**: 山札・手札、裏表、選択、回収、配牌人数・各人枚数・残り枚数、ランク除外などを扱います。Daifugu と Old Maid の手札表示はスクロールできます。
- **コインと賭け金**: 財布への追加・返却、卓上コインの投入、プレイヤー間の移動、賭け・ポット操作を行えます。
- **描画・画像**: ペン色と太さを選んで共有卓に描画します。画像ファイルを選択して卓に配置できます。
- **チャット**: ルームチャットと参加者宛てのダイレクトメッセージを扱います。
- **ゲーム**: 大富豪、神経衰弱、ババ抜き、リバーシ、テキサスホールデム、5枚ドローポーカー、麻雀を含みます。人間が1人でも開始でき、足りない席はCPUが補います。ゲーム画面の「ルール」から採用ルールと参照元を確認できます。
- **入力と操作**: テキスト・数値入力、Tab によるフォーカス移動、Enter による送信、Escape によるフォーカス解除、入力欄外クリックによるフォーカス解除を備えます。テキスト欄はブラウザ標準入力を使うため日本語 IME を利用できます。Canvas スクロール領域はホイール入力に対応します。

## マルチプレイヤー設定

SkyWay のブラウザ用 App ID / トークンは、信頼できるサーバー側から注入する必要があります。`app.js` に Secret Key や固定トークンを置かないでください。現在は認証情報を空にしており、ロビー表示とローカル UI は起動しますが、公開ルームの作成・参加はサーバー側トークン連携を設定するまで無効です。

## Engine 構成と API

### Scene Engine (`editor/engine/scene-engine/engine.js`)

画面単位の遷移と描画を担います。ETABLE2 は `lobby` と `table` を登録して利用します。

- `Scene(name, hooks)`: Scene を作成します。`onEnter(engine, data)`、`onUpdate(dt, engine, data)`、`onExit(engine, data)`、任意の `onRender(engine, data)` と `data` を受け取ります。
- `SceneEngine(options)`: `canvas`, `width`, `height`, `fps`, `background`, `autoStart`, `initialScene` を設定します。
- `registerScene(name, hooksOrScene)`, `getScene(name)`, `hasScene(name)`: Scene を登録・取得・確認します。
- `start(initialScene?)`, `switchScene(name)`: ループを開始し、Scene を切り替えます。
- `update(dt?)`, `render()`: 1フレームの更新・描画を実行します。
- `stop()`: アニメーションループを停止します。
- `INPUT`: `onKey(key)`, `pressed(key)`, `released(key)`, `endFrame()`, `clear()` でキーボード状態を扱います。入力欄と IME composition 中はゲームキーとして扱いません。

### Canvas Object Engine (`editor/engine/engine.js`)

Scene Engine が画面遷移を担当するのに対し、Canvas Object Engine はオブジェクト、入力、衝突判定、タイマーを管理します。`ui-objects.js` の各クラスはこの Engine を基底にしています。

- `Engine(canvas, fps, logicalWidth, logicalHeight)`: Canvas を初期化し、論理座標へのポインター変換、親要素サイズへの追従、描画、画像ロード、入力を管理します。
- `newDisplay(display)`, `addObject(object)`, `getObjects(tag?)`, `render()`, `start()`, `stop()`, `destroy()`: Display とオブジェクト、ループを管理します。
- `pointerToLogical(event)`: CSS 表示座標を論理座標へ変換します。`loadImage(url)`, `loadSVG(url)`, `loadFont(family, url, descriptors?)` は素材を読み込みます。`setDebug(...)` と `getObjects(criteria?)` はデバッグ表示・オブジェクト調査に使います。
- `createTimer()`: `elapsed`, `reset()`, `pause()`, `resume()`, `delete()` を備える経過時間タイマーを作成します。
- 衝突・ヒットテスト API は `GameObject` の `containsPoint`, `intersects`, `touching`, `touchTag` と Engine の Canvas ポインターヒットテストを通じて利用します。
- `Display(name, width, height)`: `addObject`, `removeObject`, `getObjects`, `bringToFront`, `sendToBack` で表示レイヤー内の順序を管理します。
- `GameObject(options)` (`ObjectBase` は別名): `x`, `y`, `width`, `height`, `rotation`, `scaleX/Y`, `skewX/Y`, `opacity`, `tags`, `shapes`, `collisionShapes` を持ちます。`moveX`, `moveY`, `moveTo`, `move`, `offsetFromAngle`, `hasTag`, `hasTags`, `setPrivate`, `getPrivate`, `destroy`, `containsPoint`, `intersects`, `touching`, `touchTag` を使えます。`onStart`, `onUpdate`, `onDestroy` は拡張用フックです。
- `Shapes`: `rect`, `rectAt`, `roundRect`, `circle`, `ellipse`, `line`, `polygon`, `text` の形状ファクトリーです。
- `INPUT`: `onKey`, `pressed`, `released`, `endFrame`, `clear` と `pointerDown()`, `pointerPressed()`, `pointerReleased()`、`pointer` の論理座標・ボタン状態を提供します。

### UI Objects (`editor/engine/ui-objects.js`)

すべての Object は `GameObject` の座標・変形・タグ・不透明度・衝突設定を継承します。描画は Canvas 上で行い、ボタンや入力欄はアクセシビリティとブラウザ入力のため DOM イベント/入力要素も使います。

| クラス | 用途と主な設定 |
| --- | --- |
| `ShapeObject` | 任意の `Shapes` 形状。`shape`, `overrides` を指定します。 |
| `RectObject` | 矩形。`width`, `height`, `x`, `y`, `radius`。 |
| `CircleObject` | 円。`radius` と `overrides`。 |
| `EllipseObject` | 楕円。`rx`, `ry` と `overrides`。 |
| `LineObject` | 線分。`x1`, `y1`, `x2`, `y2` と `overrides`。 |
| `PolygonObject` | 多角形。点配列と `overrides`。 |
| `TextObject` | テキスト。`text`, `fontSize`, `fontFamily`, `fontWeight`, `fontStyle`, `color`, `anchor`, `baseline`。改行を描画します。 |
| `BarObject` | 0〜1 に制限した進捗バー。`value`, `width`, `height`, `background`, `fill`, `radius`。 |
| `ButtonObject` | ホバー・押下アニメーション付きボタン。`label`, 寸法、配色、`onClick`。 |
| `SliderObject` | ドラッグ式スライダー。`min`, `max`, `step`, `value`, `onChange`。 |
| `TextInputObject` | IME 対応テキスト入力。`value`, `placeholder`, `label`, `maxLength`, `onInput`, `onChange` と `focus()` / `blur()`。 |
| `NumberInputObject` | 数値欄。テキスト入力設定に加えて `min`, `max`, `step`, `numberValue`。 |
| `ImageObject` | URL 画像。`src`, 寸法、`onLoad`, `onLoadError`。 |
| `SpriteAnimationObject` | URL フレーム配列のアニメーション。`frameDuration` 秒、`loop`、`frameIndex`。 |
| `CanvasScrollArea` | Canvas コンテンツのクリップとスクロールバー。`configure`, `contains`, `scrollBy`, `handleWheel`, `draw`。 |

入力欄は Canvas 表示位置・論理サイズに追従する透明なブラウザ入力を重ねます。日本語入力では `compositionstart`〜`compositionend` を尊重し、変換中に値を書き戻して変換を壊さないようにしてください。`NumberInputObject` は `input[type=number]` を使い、数値として解釈できない composition 中の値は共有状態に反映しません。入力欄以外へのポインター操作では `blur()` を呼びます。数値欄には `setSelectionRange()` を呼べません。

## Playground

[`playground.html`](./playground.html) では Scene 遷移用 Engine と Object/UI Engine を分けて表示し、全 UI Object クラスを同時に試せます。テキスト欄で IME、数値欄、ボタン、スライダー、スクロール領域、画像/アニメーション、形状、デバッグ hitbox、タイマーを操作できます。画像デモには既存カード素材を使用します。

## 制限

- 麻雀はWRC 2025の赤牌なし設定、基本形・七対子・国士無双、役・符・点数、ドラ、立直、ロン／ツモ、フリテンを実装しています。対局中の鳴き優先、流局時のノーテン精算、連荘と半荘の自動進行は未対応です。CPU麻雀は和了機会を判定しますが、打牌・鳴きの戦略は簡易です。
- ドローポーカーは全員アンティ、交換前後の固定リミットベット、1回の交換に対応します。ホールデムはポストフロップ順、オールイン、サイドポット、同点時の端数配分に対応します。
- ルールパネルは採用設定を表示します。対局ロジックの適用範囲は `extra-games.js` と `mahjong-rules.js` にあり、未対応の麻雀進行ルールは上記の通りです。
- SkyWay 認証はサーバー連携未設定時に使えません。ローカル UI の動作と実際のネットワーク共有は別です。
- Playground は API 操作用のデモです。メイン卓の操作は卓 UI と既存共有ゲームロジックに従います。

## テスト

リポジトリルートから実行します。

```sh
node --test table2/engine.test.cjs table2/game-modes.test.mjs millionaire/beta/game-engine.test.mjs editor/engine/scene-engine/scene-manager.test.mjs etable2/extra-games.test.mjs
node --experimental-default-type=module --test editor/engine/ui-objects.test.mjs
```

`etable2/extra-games.test.mjs` はリバーシ、麻雀和了評価・槓・ドラのみの不成立、ホールデム進行、ドローのベット／交換、役とキッカー比較を検証します。HTTP のブラウザ確認ではルール表示と各画面操作を確認してください。SkyWay を使うには前述の信頼済みトークン連携が必要です。
