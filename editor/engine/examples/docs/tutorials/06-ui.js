export default {
  slug: "06-ui",
  title: "UI Objectと入力欄",
  summary: "Canvas上のボタン・バー・スライダー・文字／数値入力をゲーム状態につなぎます。",
  explanation: [
    "画面操作用のUIも、エンジンではGameObjectとしてDisplayに追加します。`ui-objects.js`からTextObject、BarObject、ButtonObject、SliderObject、TextInputObject、NumberInputObjectなどを読み込めます。ButtonObjectはボタンらしい描画とポインター操作を持ち、`onClick`に関数を設定するとクリック時に処理を行います。バーは`value`を0から1の割合として描きます。スライダーはmin、max、value、stepを指定し、利用者が動かすと`onChange`が呼ばれます。UIは通常のGameObjectと同じ座標系・描画順を使うため、背景Displayの上にHUD Displayを重ねたり、ボタンのタグで操作対象を検索したりできます。Canvas上で表示されるため、Webページ部品として別々にレイアウトする必要もありません。",
    "ButtonObjectのクリックはユーザーの操作に対して一度実行するイベントです。生成した後に`button.onClick = () => { ... }`を設定できます。ボタン処理の中では、スコア、ゲーム開始状態、音量設定など、必要な状態を更新します。更新後の値を表示するTextObjectやBarObjectは、onUpdateで状態を読み直すか、イベント内で直接更新します。イベントから複数のUIを更新するときは、それぞれの値がどこで変わるのか整理してください。Buttonの位置・幅・高さは判定範囲にも使われるため、表示と当たり判定が一致します。hover時の色、影、拡大などの見た目も設定できますが、最初はクリック後に何が変わるのかを明確にしてから装飾を追加すると、操作の意味が伝わりやすくなります。",
    "SliderObjectのvalueは指定したminからmaxまでの数値です。stepを設定すると一定刻みで値が変わります。音量を0から100、速度を50から300にするなど、用途に合わせた範囲を決めてください。onChangeは値が変わったときに呼ばれるため、その場でラベルを書き換えたり、ゲーム速度の変数へ反映できます。進捗や体力を表示するBarObjectは0〜1の割合を受け取るため、数値を範囲で割って変換します。たとえば体力が35/100ならvalueは0.35です。スライダーの範囲値とバーの割合を同じだと考えず、必要なら`(value - min) / (max - min)`の形で変換します。ゼロ幅の範囲など、割り算が成立しないケースにも注意します。",
    "テキスト入力は表示をCanvasで描きますが、日本語IMEやモバイルキーボードを安定させるため、内部で画面外のネイティブinputを利用します。ユーザーにはHTMLフォームを見せず、文字の見た目はCanvasに揃えます。クリックすると入力を始められ、TextInputObjectのvalueやonInputで変更を扱えます。フォーカス中は枠線が明るくなり、別の場所をクリックしたりObjectが非表示・破棄されたりすると元に戻ります。NumberInputObjectは数値入力で、min、max、stepの範囲を使えます。ゲーム操作のキーボード状態へ、入力欄に打った文字が漏れないようエンジンが制御します。プレビュー内のCanvasをクリックするとiframeにフォーカスされ、さらにCanvas内の文字欄をクリックして文字入力を試します。ブラウザーや入力方式による挙動があるため、フォーカス中でも矢印キーなどがゲーム移動に使われないことを確かめます。",
    "最初の例では、ボタンを押すとスコアが増え、テキストとバーが更新されます。これによりUIイベントとゲーム状態がつながります。二つ目の例ではスライダー、テキスト、数値入力を並べ、値を変更すると状態ラベルが更新されるようにします。各コントロールのonChange/onInputで値を受け取り、UIをCanvasで再描画します。文字列を画面に出すTextObjectのtextと、スライダーのvalue、数値入力のnumberValueがどう異なるか見比べてください。入力に使うObjectは見た目も判定領域も自分で持つため、DisplayやObjectの論理座標で配置します。幅・高さを小さくしすぎるとタッチしづらくなるので、画面の見た目だけでなく操作しやすさも考えましょう。",
    "UIを作るときは、見た目の順序と入力の使いやすさが大切です。背景を先に描き、パネル、ラベル、操作部品を順番に追加すると重なりが自然になります。操作対象同士が重なる場合は、手前にあるObjectが入力対象になるため、重なり順を調整してください。ゲームオーバーやポーズ中には入力を止めたいことがあります。ButtonのonClick内で状態を確認したり、操作用Displayを表示／非表示にしたりする設計が考えられます。入力値を毎フレーム読み取るのではなく、変更時のイベントを利用すると無駄な処理が減ります。次の章では画像・SVG・フォントなどの素材と変形を扱います。UIも画像素材や独自フォントを使ってゲームの世界観に合わせられます。",
  ],
  exercises: [
    "ボタンを押すたびにスコアを10ずつ増やし、100を超えたらButtonを無効化する状態を考える。",
    "Sliderの値を0〜100として表示し、BarObjectへ割合として反映する。",
    "TextInputObjectに日本語を入力し、数値入力中のゲームキー状態がどうなるか試す。",
  ],
  examples: [
    {
      title: "ボタンでスコアとバーを更新",
      goal: "onClickでゲーム状態を変え、TextObjectとBarObjectに反映する。",
      note: "ButtonObjectはCanvas上でクリックできます。ゲームプレビュー内のボタンを操作してください。",
      code: `import { Engine, Display } from "./engine.js";
import { TextObject, BarObject, ButtonObject } from "./ui-objects.js";

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("hud", 640, 360, { background: "#172554" }));
let score = 0;
const label = engine.addObject(world, new TextObject("SCORE 0", {
  x: 320, y: 100, anchor: "middle", fontSize: 30, color: "#fef3c7",
}));
const progress = engine.addObject(world, new BarObject({
  x: 180, y: 145, width: 280, value: 0, fill: "#22c55e",
}));
const button = engine.addObject(world, new ButtonObject("加点 +10", {
  x: 230, y: 205, width: 180, background: "#2563eb", shadow: true,
}));
button.onClick = () => {
  score = Math.min(100, score + 10);
  label.text = "SCORE " + score;
  progress.value = score / 100;
};
engine.start();`,
    },
    {
      title: "Sliderとテキスト／数値入力",
      goal: "UIから得た値をラベルに出し、NumberInputの範囲を設定する。",
      note: "文字欄をクリックすると入力できます。SliderはCanvas上でドラッグできます。",
      code: `import { Engine, Display } from "./engine.js";
import { TextObject, SliderObject, TextInputObject, NumberInputObject } from "./ui-objects.js";

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("controls", 640, 360, { background: "#0f172a" }));
const readout = engine.addObject(world, new TextObject("音量: 50", {
  x: 40, y: 55, fontSize: 23, color: "#f8fafc",
}));
const slider = engine.addObject(world, new SliderObject({
  x: 40, y: 80, width: 270, min: 0, max: 100, value: 50, step: 5,
}));
slider.onChange = (value) => { readout.text = "音量: " + value; };
engine.addObject(world, new TextObject("名前", { x: 40, y: 150, fontSize: 17, color: "#cbd5e1" }));
const name = engine.addObject(world, new TextInputObject({
  x: 40, y: 165, width: 250, placeholder: "ここをクリックして入力",
}));
const amount = engine.addObject(world, new NumberInputObject({
  x: 330, y: 165, width: 160, label: "数量", min: 0, max: 99, step: 1, value: "3",
}));
const amountLabel = engine.addObject(world, new TextObject("", { x: 330, y: 230, fontSize: 18, color: "#fde68a" }));
amount.onInput = () => { amountLabel.text = "数量: " + amount.numberValue; };
name.onInput = (value) => { readout.text = "こんにちは、" + (value || "ゲスト"); };
engine.start();`,
    },
  ],
};
