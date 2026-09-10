# Boxedwine WebAssembly runtime

このディレクトリには Boxedwine 26R1 のシングルスレッド Emscripten ビルドを同梱しています。

- `boxedwine-shell.js`
- `boxedwine.js`
- `boxedwine.wasm`
- `boxedwine.zip` (Wine 11 root filesystem)

`app.js` は公式シェルを初期化し、選択した EXE を `/d_drive` に書き込んで起動引数を渡します。

Boxedwine 本体: https://github.com/danoon2/Boxedwine
