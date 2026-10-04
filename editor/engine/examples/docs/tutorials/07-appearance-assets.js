export default {
  slug: "07-appearance-assets",
  title: "見た目と外部素材",
  summary: "回転・拡縮・skew・モザイクと、URL／SVG素材、スプライトアニメーションを使います。",
  explanation: [
    "Objectの見た目はshapeの色や寸法だけでなく、GameObjectの変形プロパティでも調整できます。`rotation`は度数法の回転角、`scaleX`と`scaleY`は横・縦の拡大率、`skewX`と`skewY`は傾き、`opacity`は透明度です。これらはObjectの原点を中心に適用され、表示と当たり判定に反映されます。rotationを90にすると90度回転し、scaleXを2にすると横に2倍伸びます。opacityは通常0〜1で、0は完全透明、1は不透明です。毎フレーム値を変えれば回転アニメーションにもなります。見た目を動かすと判定位置も変わるので、衝突を持つObjectではDebug表示をオンにして、変形後の判定形状が期待通りか確認してください。",
    "`mosaic = true`はObjectを低解像度で描画して、モザイク状の見た目にする効果です。ピクセルアート風の演出や、ダメージを受けたときの一時的な表示変化に使えます。特定の描画だけを低解像度にするため、ゲーム全体のCanvasサイズを変更する必要はありません。モザイク化した場合も、当たり判定そのものが粗くなるわけではなく、元のcollisionShapesによる幾何判定は維持されます。見た目の処理と判定は別々であると理解しておきましょう。回転・拡大縮小・透明度と組み合わせる場合は、効果を一つずつ加え、描画負荷や読みやすさを見ながら調整します。強い効果を多用すると画面の情報が読みづらくなるため、重要な状態変化を伝える目的で使うとよいです。",
    "画像は`engine.loadImage(url)`で読み込み、ImageObjectにURLを渡して表示できます。SVGは`engine.loadSVG(url)`で読み込めるほか、SVGを画像データURLとして扱う方法もあります。ファイル選択ダイアログを使わず、プロジェクト内のURLやStudioのアセットURLから読み込めます。外部サイトの素材を使うときは、配信元がアクセスを許可しているか、利用ライセンスやフォントの条件が適切かを確認してください。Canvasは画像の輪郭ピクセルを衝突判定に直接使わず、ImageObjectの矩形など指定されたcollisionShapesを使います。透明な余白を含む画像では、必要なら判定を別shapeとして設定してください。読み込み完了前は画像がまだ表示されないため、非同期ロードが終わった後のonLoadで状態を更新する方法もあります。",
    "SVGはコードで直接生成してdata:image/svg+xml URLにできます。単純なアイコンや図形なら、外部ファイルを準備しなくても例の中で完結します。URLにする前にSVG文字列をencodeURIComponentでエンコードします。画像として読み込んだSVGの中に任意のscriptなどが実行されるような使い方は避け、信頼できる素材のみを使ってください。StudioのSVG Editorは名前付きアセットとしてSVGを保存し、`GameStudio.assetUrl(\"asset-name\")`でプレビュー実行コードからURLを得られます。このチュートリアルのサンプルは独立実行環境なので、アセットを持たない例では小さなdata URIを使います。生成したSVGをObjectのshapesに直接入れる方法と、画像URLとして表示する方法は異なり、後者はImageObjectなどを使います。",
    "アニメーション画像を複数のファイルやSVGフレームで用意するときは`SpriteAnimationObject(frames, options)`が使えます。framesは画像URLの配列で、frameDurationは各フレームを表示する秒数です。loopをfalseにすると最後のフレームで停止できます。ロードに失敗した場合はloadErrorやonLoadErrorで扱えます。フレーム切り替えはdtを使って進むため、フレームレートによらず時間ベースです。例ではSVGのdata URLを二つ作り、簡単なアニメーション表示を実行します。素材を複数用意できないときも、SVGデータを少し変えて複数の画像URLを作ると仕組みを試せます。大量の巨大画像を一度に読み込むとメモリを使うため、実ゲームでは画像寸法や枚数を必要な範囲に抑えるようにします。",
    "外部フォントは`engine.loadFont(family, url)`で読み込めます。成功後はTextObjectのfontFamilyに指定したfamily名を使います。フォントURLが404になる、CORSで拒否される、ネットワークがオフラインといった場合は、標準フォントへ戻すなどの設計が必要です。ゲームを作る際は、フォントのライセンスと配信元の安定性を確認してください。この章ではフォントのロード自体を必須にせず、変形、モザイク、画像、SVG、アニメーションの動作を試します。見た目と素材ロードの問題を区別するため、まず色付きShapeでObjectの位置と変形を確かめ、その後に画像を加えます。次の章ではDebug表示、ログ、状態管理の基礎を組み合わせ、小さなゲームとして仕上げます。",
  ],
  exercises: [
    "回転するObjectにscaleXとskewYを加え、debug hitboxが見た目に追従することを確認する。",
    "SVG data URIの色やviewBoxを変え、ImageObjectの大きさとcollisionShapesを別々に調整する。",
    "SpriteAnimationObjectのframeDurationとloopを変更し、再生速度と最後のフレームの挙動を比較する。",
  ],
  examples: [
    {
      title: "変形とモザイクを切り替える",
      goal: "回転・拡縮・skew・opacityを時間で変え、キーでモザイクを切り替える。",
      note: "見た目の変形は当たり判定にも反映されます。表示されない場合はCanvasをクリックしてSpaceを押します。",
      code: `import { Engine, Display, GameObject, INPUT, Shapes } from "./engine.js";

class Effect extends GameObject {
  constructor(x, color) {
    super({ x, y: 180, shapes: [Shapes.rect(90, 70, { fill: color })] });
    this.phase = 0;
  }
  onUpdate(dt) {
    this.phase += dt;
    this.rotation = this.phase * 50;
    this.scaleX = 1 + Math.sin(this.phase * 2) * .35;
    this.skewY = Math.sin(this.phase) * 12;
    this.opacity = .65 + Math.sin(this.phase * 3) * .25;
    this.mosaic = INPUT.onKey("Space");
  }
}

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("effects", 640, 360, { background: "#0f172a" }));
engine.addObject(world, new Effect(235, "#38bdf8"));
engine.addObject(world, new Effect(405, "#f472b6"));
engine.setDebug({ hitboxes: true });
engine.start();`,
    },
    {
      title: "SVGデータURLとスプライトアニメ",
      goal: "小さなSVGを画像として読み、SpriteAnimationObjectでフレームを切り替える。",
      note: "画像のロードは非同期です。短いフレーム時間にしすぎると変化が速くなります。",
      code: `import { Engine, Display } from "./engine.js";
import { SpriteAnimationObject } from "./ui-objects.js";

const svgUrl = (color, angle) => {
  const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <g transform="rotate(\${angle} 32 32)" fill="\${color}">
      <path d="M32 3 40 24 61 32 40 40 32 61 24 40 3 32 24 24Z"/>
      <circle cx="32" cy="32" r="7" fill="#fff"/>
    </g>
  </svg>\`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
};

const engine = new Engine(document.querySelector("#game"), 60, 640, 360);
const world = engine.newDisplay(new Display("animation", 640, 360, { background: "#172554" }));
engine.addObject(world, new SpriteAnimationObject([
  svgUrl("#facc15", 0), svgUrl("#fb7185", 22), svgUrl("#38bdf8", 45),
], {
  x: 260, y: 95, width: 120, height: 120, frameDuration: .28, loop: true,
}));
engine.start();`,
    },
  ],
};
