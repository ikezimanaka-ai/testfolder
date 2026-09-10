# WINE DECK

静的ホスティング向けの Boxedwine Web ランチャーです。EXE ファイルをブラウザで選択し、ファイル名とサイズをローカル UI に表示します。

## 起動

`index.html` を静的サーバーから配信してください。ローカル確認は次のようにできます。

```sh
python3 -m http.server 4173
```

その後、`http://localhost:4173` を開きます。`file://` 直開きでは WebAssembly や fetch の制約が出るため、HTTP 配信を推奨します。

## Boxedwine の接続

公式 Boxedwine 26R1 Web 版のシングルスレッドランタイムを `runtime/` に同梱しています。`boxedwine-shell.js` が Wine ファイルシステムを初期化し、選択した EXE を `/d_drive` に配置して起動します。

マルチスレッド版を使う場合は、Boxedwine 公式リリースの `MultiThreaded/` 一式に差し替え、静的ホスティング側で COOP/COEP ヘッダーを設定してください。GitHub Pages などヘッダーを設定できない配信先では、現在のシングルスレッド版が適しています。

Boxedwine は GPL-2.0 のオープンソースプロジェクトです。配布時は Boxedwine のライセンスとビルド成果物の再配布条件を確認してください。
