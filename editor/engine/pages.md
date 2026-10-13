# ページ一覧

この一覧は、現時点で存在する HTML ページを対象に、ページの役割と「解説ページがあるか」「ある場合は何を説明しているか」をまとめたものです。

> 基本方針
> - 入口系: どこへ進むかを選ぶページ
> - ゲーム本体: 実際に遊ぶページ
> - 解説系: ゲームの設計や仕組みを説明するページ
> - ドキュメント/エディタ系: API・開発・検証用
> - コース系: 1ステップずつ学ぶ教材
> - 旧版/重複系: 新しいページがあるため、参考として残っているもの

---

## 1. 入口ページ

### [index.html](./index.html)
- 種別: 入口ページ
- 役割: プロジェクト全体の入口。どのカテゴリのページに進むかを選ぶナビゲーション。
- 解説の有無: なし
- 解説の内容: 入口の案内そのものなので、専用の解説はない。

### [examples/index.html](./examples/index.html)
- 種別: 入口ページ
- 役割: サンプルゲームとドキュメントを一覧で見られる「ユーザー向けホーム」相当。
- 解説の有無: なし
- 解説の内容: 何がどこにあるかの一覧を示すだけで、各ゲームの詳細説明は別ページに分かれている。

---

## 2. ゲーム本体（遊ぶ用）

### [examples/calculator-quiz.html](./examples/calculator-quiz.html)
- 種別: ゲーム本体
- 役割: 電卓風の計算問題ゲーム。早押し入力を重視する演習型。
- 解説の有無: あり
- 解説ページ: [examples/calculator-quiz-explanation.html](./examples/calculator-quiz-explanation.html)
- 解説の内容: 問題生成、入力判定、スコア設計、ゲームのルール設計の説明。

### [examples/shooter.html](./examples/shooter.html)
- 種別: ゲーム本体
- 役割: 敵を避けながら攻撃するミニシューティングゲーム。
- 解説の有無: あり
- 解説ページ: [examples/shooter-explanation.html](./examples/shooter-explanation.html)
- 解説の内容: 敵の出現、弾幕、当たり判定、攻撃と回避の設計意図。

### [examples/dodge-patterns.html](./examples/dodge-patterns.html)
- 種別: ゲーム本体
- 役割: 攻撃パターンを避けるゲーム。読みと回避タイミングが中心。
- 解説の有無: あり
- 解説ページ: [examples/dodge-patterns-explanation.html](./examples/dodge-patterns-explanation.html)
- 解説の内容: パターン読解、回避のタイミング、設計の考え方。

### [examples/snake.html](./examples/snake.html)
- 種別: ゲーム本体
- 役割: 代表的なスネークゲーム。
- 解説の有無: あり
- 解説ページ: [examples/snake-explanation.html](./examples/snake-explanation.html)
- 解説の内容: 進行方向の制御、尾の動き、衝突判定とゲームループの説明。

### [examples/desk-cleanup.html](./examples/desk-cleanup.html)
- 種別: ゲーム本体
- 役割: 机を片付けるミッション型ゲーム。
- 解説の有無: あり
- 解説ページ: [examples/desk-cleanup-explanation.html](./examples/desk-cleanup-explanation.html)
- 解説の内容: 片付けタスクの難易度設定、ゲームの意図とミッション設計。

### [examples/canvas-tests.html](./examples/canvas-tests.html)
- 種別: テスト/検証ページ
- 役割: Canvas 描画、Display クリップ、当たり判定、URL アセットの動作確認。
- 解説の有無: なし
- 解説の内容: 本ページ自体が検証用のデモであり、専用の解説ページは用意されていない。

### [examples/multi-poker.html](./examples/multi-poker.html)
- 種別: ゲーム本体
- 役割: 2〜8人CPU対戦の大富豪風ゲーム。
- 解説の有無: なし
- 解説の内容: ルールや対戦ロジックの説明ページは現時点では用意されていない。

---

## 3. 解説ページ（ゲームの仕組みを見るページ）

### [examples/calculator-quiz-explanation.html](./examples/calculator-quiz-explanation.html)
- 種別: 解説ページ
- 役割: 電卓ゲームの設計意図とルールの説明。
- 解説の有無: そのページ自体が解説
- 解説の内容: 問題生成、時間制御、入力判定、答えの計算・スコア付けの考え方。

### [examples/shooter-explanation.html](./examples/shooter-explanation.html)
- 種別: 解説ページ
- 役割: シューティングゲームの処理設計の説明。
- 解説の有無: そのページ自体が解説
- 解説の内容: 敵の出現頻度、弾と当たり判定、回避の設計。

### [examples/dodge-patterns-explanation.html](./examples/dodge-patterns-explanation.html)
- 種別: 解説ページ
- 役割: パターン読みと回避の説明。
- 解説の有無: そのページ自体が解説
- 解説の内容: 予測可能な攻撃パターンと回避の時間配分。

### [examples/snake-explanation.html](./examples/snake-explanation.html)
- 種別: 解説ページ
- 役割: スネークゲームの基本ロジック説明。
- 解説の有無: そのページ自体が解説
- 解説の内容: 進行方向制御、尾の追従、衝突判定の設計。

### [examples/desk-cleanup-explanation.html](./examples/desk-cleanup-explanation.html)
- 種別: 解説ページ
- 役割: 机の片付けゲームの設計意図の説明。
- 解説の有無: そのページ自体が解説
- 解説の内容: 難易度、ミッションの意味、入力と条件判定の関係。

---

## 4. ドキュメント / テスト / エディタ系

### [engine/docs/docs.html](./docs/docs.html)
- 種別: ドキュメント旧版
- 役割: Engine API の詳細説明。
- 解説の有無: あり（本文が解説）
- 解説の内容: Engine、Display、GameObject、INPUT、座標系、ライフサイクル、当たり判定の説明。

### [engine/docs/editor.html](./docs/editor.html)
- 種別: エディタ旧版
- 役割: Monaco Editor を使ったコード編集とプレビュー。
- 解説の有無: あり（ページ内の説明が補足）
- 解説の内容: コードを書いて即座にプレビューで試すためのエディタ機能そのもの。

### [engine/docs/tests.html](./docs/tests.html)
- 種別: テスト旧版
- 役割: UI や Canvas 図形、入力機能の検証。
- 解説の有無: あり（検証画面として説明付き）
- 解説の内容: Canvas 図形、入力、UI オブジェクトの挙動確認。

### [examples/docs/docs.html](./examples/docs/docs.html)
- 種別: ドキュメント
- 役割: 最新の API 説明ページ。
- 解説の有無: あり（本文が解説）
- 解説の内容: Engine、Display、GameObject、INPUT、座標系、ライフサイクル、当たり判定の詳説。

### [examples/docs/tests.html](./examples/docs/tests.html)
- 種別: テスト
- 役割: UI Object、Canvas 図形、入力コントロールの実例検証。
- 解説の有無: あり（例がそのまま解説）
- 解説の内容: 各 UI と描画関数の実用例を確認できるページ。

### [examples/docs/editor.html](./examples/docs/editor.html)
- 種別: エディタ
- 役割: Monaco Editorでコード編集・プレビュー実行。
- 解説の有無: あり（手順や機能がページ内に説明）
- 解説の内容: コードを編集し、そのまま実行結果を見るための開発用ページ。

### [examples/docs/studio.html](./examples/docs/studio.html)
- 種別: Studio / 開発支援ページ
- 役割: エディタ + プレビュー + Object一覧 + コンソール + SVG アセット操作をまとめた開発向け環境。
- 解説の有無: あり（ページ内の説明/ワークフローにより解説）
- 解説の内容: 開発と検証を一枚にまとめたStudioの使い方と診断機能。

### [examples/docs/tutorials/index.html](./examples/docs/tutorials/index.html)
- 種別: チュートリアル入口
- 役割: 8章のチュートリアル一覧。
- 解説の有無: あり（チュートリアル本体が解説）
- 解説の内容: Engine の使い方を段階的に学ぶための章立てと各実例。

---

## 5. チュートリアルページ一覧

### [examples/docs/tutorials/01-engine.html](./examples/docs/tutorials/01-engine.html)
- 種別: チュートリアル
- 役割: Engine の基本構成を学ぶ。
- 解説の有無: あり（そのページ自体がチュートリアル）
- 解説の内容: Engine の生成、Display、GameObject の使い方。

### [examples/docs/tutorials/02-shapes.html](./examples/docs/tutorials/02-shapes.html)
- 種別: チュートリアル
- 役割: 図形の描画と Shapes API を学ぶ。
- 解説の有無: あり
- 解説の内容: rect / circle / ellipse / line / polygon / text の使い方。

### [examples/docs/tutorials/03-objects.html](./examples/docs/tutorials/03-objects.html)
- 種別: チュートリアル
- 役割: GameObject の扱いとオブジェクト管理を学ぶ。
- 解説の有無: あり
- 解説の内容: 配置、移動、タグ、更新処理の基本。

### [examples/docs/tutorials/04-input-motion.html](./examples/docs/tutorials/04-input-motion.html)
- 種別: チュートリアル
- 役割: 入力と移動の基本を学ぶ。
- 解説の有無: あり
- 解説の内容: キーボード入力、移動処理、フレーム時間の扱い。

### [examples/docs/tutorials/05-collision.html](./examples/docs/tutorials/05-collision.html)
- 種別: チュートリアル
- 役割: 当たり判定の仕組みを学ぶ。
- 解説の有無: あり
- 解説の内容: 矩形・円・多角形の衝突判定とSATの考え方。

### [examples/docs/tutorials/06-ui.html](./examples/docs/tutorials/06-ui.html)
- 種別: チュートリアル
- 役割: UI オブジェクトの基本を学ぶ。
- 解説の有無: あり
- 解説の内容: TextObject、BarObject、ButtonObject、SliderObject などの使い方。

### [examples/docs/tutorials/07-appearance-assets.html](./examples/docs/tutorials/07-appearance-assets.html)
- 種別: チュートリアル
- 役割: 見た目とアセットの扱いを学ぶ。
- 解説の有無: あり
- 解説の内容: 色、opacity、スケール、SVG画像、フォント読み込み。

### [examples/docs/tutorials/08-debug-gameplay.html](./examples/docs/tutorials/08-debug-gameplay.html)
- 種別: チュートリアル
- 役割: デバッグとゲームプレイ改善を学ぶ。
- 解説の有無: あり
- 解説の内容: hitbox表示、FPS表示、ログ、オブジェクト診断。

### [examples/docs/tutorials/chapter-template.html](./examples/docs/tutorials/chapter-template.html)
- 種別: テンプレート
- 役割: 新しいチュートリアル章の雛形。
- 解説の有無: なし
- 解説の内容: 章作成用の雛形で、実行用ページではない。

---

## 6. 学習コース（ブロック崩し講座）

### [examples/block-breaker-course/index.html](./examples/block-breaker-course/index.html)
- 種別: 講座入口
- 役割: ブロック崩し講座の入口ページ。
- 解説の有無: あり（講座の導入ページ）
- 解説の内容: どのページから学習を進めるか、講座全体の構成を説明する。

### [examples/block-breaker-course/pages/page-1.html](./examples/block-breaker-course/pages/page-1.html) 〜 [examples/block-breaker-course/pages/page-20.html](./examples/block-breaker-course/pages/page-20.html)
- 種別: 講座ページ
- 役割: 1〜20の段階的なレッスン。
- 解説の有無: あり（各ページ自体が解説）
- 解説の内容: ブロック崩しを作るためのステップごとの説明とコード例。ページごとにテーマが分かれている。

### [examples/block-breaker-course/exam/_layout.html](./examples/block-breaker-course/exam/_layout.html)
- 種別: 試験レイアウト
- 役割: 検定・試験向けの共通レイアウト。
- 解説の有無: なし
- 解説の内容: 画面の骨格を作るテンプレートであり、個別の解説ページではない。

### [examples/block-breaker-course/exam/forexample.html](./examples/block-breaker-course/exam/forexample.html)
- 種別: 例示ページ
- 役割: 検定や試験の例示を表示するためのページ。
- 解説の有無: なし
- 解説の内容: 例示そのものが目的で、専用の解説ページは別に設けられていない。

---

## 7. 旧版・重複ページ

以下は新しい版と同じ役割を持つ重複ページで、現状では新しい方を優先して読むのが自然です。

### [examples/docs/block-breaker-course/index.html](./examples/docs/block-breaker-course/index.html)
- 種別: 講座入口（新しい参考版）
- 役割: ドキュメント系の配下にあるブロック崩し講座入口。
- 解説の有無: あり
- 解説の内容: 上部の同名ページと同様の講座構成を持つが、ドキュメント配下に置かれている。

### [examples/docs/block-breaker-course/pages/page-1.html](./examples/docs/block-breaker-course/pages/page-1.html) 〜 [examples/docs/block-breaker-course/pages/page-20.html](./examples/docs/block-breaker-course/pages/page-20.html)
- 種別: 講座ページ（新しい参考版）
- 役割: 上部のブロック崩し講座のコピー版。
- 解説の有無: あり
- 解説の内容: 同じくステップ式の学習ページ。新旧どちらを使うかは整理段階の課題。

### [examples/docs/block-breaker-course/exam/_layout.html](./examples/docs/block-breaker-course/exam/_layout.html)
- 種別: 試験レイアウト（新しい参考版）
- 役割: 旧版と同じく、試験/検定の共通レイアウト。
- 解説の有無: なし
- 解説の内容: レイアウト・テンプレートであり、独立した解説ページはない。

### [examples/docs/block-breaker-course/exam/forexample.html](./examples/docs/block-breaker-course/exam/forexample.html)
- 種別: 例示ページ（新しい参考版）
- 役割: 試験用の例示表示。
- 解説の有無: なし
- 解説の内容: 例示を見るためのページそのもの。

---

## 8. 総括

### 役割の分け方
- 入口: [index.html](./index.html), [examples/index.html](./examples/index.html)
- ゲーム本体: [examples/*.html](./examples)
- 解説: [examples/*-explanation.html](./examples)
- ドキュメント/検証/エディタ: [examples/docs](./examples/docs), [docs](./docs)
- 講座: [examples/block-breaker-course](./examples/block-breaker-course)

### 解説があるかどうかの判断基準
- ある: ゲーム本体と対応する explanation ページが存在する
- ある: チュートリアルページ自体が説明になっている
- ある: ドキュメント/Studio の本文が説明の中心になっている
- ない: 入口ページ、テンプレート、例示ページ、専用の説明を持たない検証ページ

### まとめ
- 「ゲームを遊ぶ系」と「ゲームの仕組みを知る系」は分離されている。
- ドキュメント/エディタ系は新旧の複数バージョンがある。
- ブロック崩し講座も新旧のコピーがあり、ユーザー向けには新しい方を中心に見るのが自然。
- したがって、現在の整理としては [examples/index.html](./examples/index.html) を入口にし、ゲーム本体と解説ページをセットで見るのが最もわかりやすい。
