# Multi-poker deployment

このゲームは `test.html` と同じSupabase Realtime broadcastで通信します。SupabaseのCDNと接続情報を読み込めるHTTP配信が必要です。

```sh
npm install
PORT=3000 npm start
```

以前のNode.js WebSocketサーバーを使う構成も残していますが、現在のブラウザ画面はSupabase Realtimeを使うため、公開ドメイン側でWebSocketプロキシを設定する必要はありません。

`room.html` と `index.html` は `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` を利用します。SupabaseのRealtime broadcastが制限されている場合は、Supabase側のRealtime設定を確認してください。
