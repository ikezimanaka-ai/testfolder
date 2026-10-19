# Browser filesystem API

`filesystem-api.js` は、ユーザーが選択したフォルダを参照・編集するための非同期
`createPointer()` 関数を提供します。ブラウザの File System Access API を使い、
ブラウザ標準のフォルダ選択ダイアログとフォルダ削除確認以外の UI は持ちません。

```js
import { createPointer } from "./filesystem-api.js";

const pointer = await createPointer(); // ディレクトリ選択ダイアログを開く。
console.log(pointer.name); // 選択したフォルダ名。
const entries = await pointer.listDirectory(""); // 直下の項目を取得。
const text = await pointer.readFile("README.md");
await pointer.writeFile("README.md", `${text}\n`);
const icon = await pointer.getFile("icon.png"); // File: size、type、arrayBuffer() などを参照。
await pointer.writeBinaryFile("icon.png", icon);
await pointer.createFolder("", "src");
await pointer.createFolder("src", "components");
await pointer.createFile("src/components", "Button.js");
await pointer.copyEntry("src/components/Button.js", "src", "Button-copy.js");
await pointer.moveEntry("src/Button-copy.js", "src/components");
await pointer.editFile("src/components/Button.js", [
  { start: 0, end: 0, text: "export default function Button() {}\n" },
]);
await pointer.renameFile("src/components/Button.js", "ActionButton.js");
await pointer.deleteFile("src/components/ActionButton.js");
await pointer.deleteFolder("src/components"); // 再帰削除前に確認を行う。
```

すべてのパスは選択したディレクトリを基準とした相対パスです。
`listDirectory(path)` は直下の項目を `{ name, kind }` の配列で返し、フォルダを先に名前順で並べます。
`readFile(path)` と `writeFile(path, contents)` は UTF-8 テキストの読み書きを行います。
`writeFile` は既存ファイルを上書きし、テキスト以外の値は拒否します。
`getFile(path)` はブラウザーの `File` を返し、`writeBinaryFile(path, blob)` は `Blob` の内容をバイナリとして保存します。
`writeBinaryFile` はファイルがまだない場合に作成します。
`copyEntry(sourcePath, destinationDirectory, newName)` はファイルまたはフォルダを再帰的にコピーし、
`moveEntry(sourcePath, destinationDirectory)` は内容を保ったまま移動します。移動先の同名項目は上書きせず、
大文字/小文字だけが異なる名前も重複として扱います。フォルダを自身またはその子孫へコピー/移動することも拒否します。
`createFile` と `createFolder` では、最初の引数が既存の親ディレクトリのパスで、
`""` は選択中のディレクトリそのものを意味します。親ディレクトリは自動作成されないため、
必要な親から順に作成してください。リネーム系メソッドは、既存の相対パスと新しい
ベース名を受け取ります。

`editFile(path, edits)` は現在の UTF-16 テキストを読み込み、その元のテキストに対して
編集操作をまとめて適用します。各操作は `{ start, end, text }` の形式で、
`end` は排他的です。重なり合う範囲、同じ挿入位置の重複、範囲外オフセットは
拒否されます。編集はまとめて適用されるため、呼び出し側は同じ元のファイル内容を
基準にすべてのオフセットを計算する必要があります。

`deleteFolder(path)` はブラウザの標準 `confirm()` ダイアログで確認を求めた後に、
フォルダを再帰的に削除します。ユーザーがキャンセルした場合は `false` を返し、
削除後は `true` を返します。ファイルやフォルダのリネームには File System Access
ハンドルの `move()` メソッドを使い、このメソッドをサポートしないブラウザでは
明示的なエラーを返します。

この API は secure context かつ `showDirectoryPicker()` と File System Access API
をサポートするブラウザが必要です。モックベースのテストは次のコマンドで実行します。

```sh
node editor/engine/filesystem/filesystem-api.test.mjs
```

英語版は [README.en.md](./README.en.md) を参照してください。
