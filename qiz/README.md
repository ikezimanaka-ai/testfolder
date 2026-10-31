# DomDealer Quiz

`domDeal.js`を使った、JSONクイズのプレイヤーと作成画面です。静的ホスティング上で動作します。

## 起動

このフォルダをWebサーバーで開き、`index.html`へアクセスします。クイズ作成は`create.html`です。WebからJSONを取得する場合は、ホスト側でCORSが許可されている必要があります。

## クイズJSON

```json
{
  "title": "サンプルクイズ",
  "questions": [
    {
      "type": "option1",
      "prompt": "日本の首都は？\n\n![東京](./tokyo.jpg)",
      "options": ["東京", "大阪", "京都"],
      "answer": ["東京"],
      "explanation": "**東京**が首都です。"
    }
  ]
}
```

回答形式は`option1`(単一選択)、`option2`(複数選択)、`option3`(正解配列の順に選択)、`Tinput`(テキスト)、`Ninput`(数値)です。複数の`answer`は入力問題で許容する別解として扱います。`option2`は選択順を問いません。`option3`では正解配列の長さだけ選び、順序も一致する必要があります。

## 複数クイズ一覧JSON

```json
{
  "title": "まとめクイズ",
  "questions": ["./qiz1.json", "./qiz2.json"]
}
```

各参照先はクイズJSONで、一覧の`title`が結果画面のタイトルになります。URL読込では一覧ファイルのURLを基準に相対URLを解決します。ローカル読込では一覧JSONと参照するJSONを同時に選択します。クイズ単体JSONもそのまま選べます。旧形式の`name` / `content` / `sentence`も読み込みます。

問題文と解説は見出し、強調、コード、箇条書き、引用、リンク、画像のMarkdownに対応します。相対画像URLはWebではクイズファイルを基準に解決します。
