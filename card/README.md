# Card Table Engine

`card/` は `multi-poker` の卓UIと `FeltRealtime` の Supabase Realtime broadcast を使う、複数カードゲーム用の共通基盤です。

## 対応ゲーム

- Poker: リアルタイム操作（ターンなし）
- ババ抜き: ターン制
- 神経衰弱: ターン制、卓上に伏せてランダム配置する構成

ゲーム固有の定義は [`games.js`](./games.js)、状態遷移と操作APIは [`engine.js`](./engine.js) に分離しています。新しいゲームは `CardGames.definitions` に定義を追加し、必要な reducer/action を汎用APIへ接続します。

## 共通操作

`deal`、`place-card`、`collect-card`、`collect-all-cards`、`place-coins`、`collect-coins`、`turn`、`reveal`、`reset` を使用します。ホストが `request` を受けて `CardEngine.reduce` を実行し、`revision` 付きの状態を broadcast します。

## 公開範囲と信頼モデル

手札などの非公開カードは `publicState(state, viewerId)` で受信者ごとに伏せます。画面で隠すだけでなく、非公開のカード内容を他の受信者へ送らない設計です。

Supabase Realtime broadcast はクライアント間の中継であり、現状は完全な認証済みゲームサーバーではありません。ホスト検証・所有権検証・revision を整合性保護として使いますが、競技用途ではサーバー側 reducer と認証を追加してください。

## 起動

リポジトリルートをHTTP配信し、`card/room.html` を開きます。既存の `multi-poker` と同じ Supabase CDN 接続設定を利用します。

### `ERR_NAME_NOT_RESOLVED` が出る場合

このエラーは、SupabaseのWebSocket処理ではなく、設定されたプロジェクトURLのDNS解決に失敗している状態です。Supabase Dashboardの **Project URL** と publishable key を確認し、現在のURLが無効・削除済み・DNSから見えない場合は新しい値に置き換えてください。確認用にURLをクエリで上書きできます。

```text
/card/room.html?supabaseUrl=https%3A%2F%2FYOUR_PROJECT_REF.supabase.co&supabaseKey=YOUR_PUBLISHABLE_KEY
```

クエリの値はページ内で優先されます。ブラウザの開発者ツールで `aozojlamhwltfafnxlrt.supabase.co` が解決できない場合、コード変更では復旧できず、正しいプロジェクトURLまたはDNS/ネットワーク設定が必要です。
