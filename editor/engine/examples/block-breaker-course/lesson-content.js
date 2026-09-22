export const lessons = [
	{
		title: "全体像をつかもう",
		summary: "ブロック崩しを、入力・更新・衝突・描画という小さな責任に分けて設計します。",
		goal: "Engine、Display、GameObjectの役割を説明し、空の画面を起動できるようになる。",
		sections: [
			["完成形から逆算する", "ブロック崩しは、ボール、バー、ブロック、壁、スコア、終了条件を持つ小さなゲームです。最初から全部を一つの関数に詰め込むと、ボールが動かない原因と衝突の原因を区別できません。今回は完成形を部品へ分解し、各ページで一つずつ追加します。"],
			["Engineの三層", "EngineはCanvasのサイズと毎フレームの進行を管理します。Displayは一つの舞台で、GameObjectは舞台上の役者です。Engineを起動し、Displayを登録し、そのDisplayへオブジェクトを追加する順序を守ると、描画と更新の流れを追いやすくなります。"],
			["最初の起動", "HTMLには描画領域としてcanvasを一つ置き、JavaScriptではその要素をEngineへ渡します。論理サイズを800×450に固定すると、座標計算は画面の実ピクセル数に影響されません。contain表示なので、ウィンドウを広げてもゲーム内の座標系は変わりません。"],
			["コード例", "最小の起動コードは次の形です。newDisplayを呼ぶだけではループは始まらないため、最後にstartを呼びます。", `import { Engine, Display } from "../../engine.js";\n\nconst canvas = document.querySelector("#game");\nconst engine = new Engine(canvas, 60, 800, 450);\nconst world = engine.newDisplay(new Display("world", 800, 450, {\n  background: "#0f172a"\n}));\nengine.start();`],
			["確認する", "画面が空でも、背景色が表示されれば起動は成功です。表示されないときはcanvasのid、module scriptのパス、静的サーバーの起動を確認します。file://でES Modulesを開くと制限されることがあるため、python -m http.serverなどで開いてください。"]
		],
		exercise: "背景色を変更し、論理サイズを600×400に変えても画面が崩れないことを確認する。"
	},
	{
		title: "ボールを動かす",
		summary: "GameObjectを継承し、速度を毎秒の値としてdtで移動させます。",
		goal: "ボールを表示し、フレームレートに依存しない移動を作る。",
		sections: [
			["形とデータを分ける", "円のSVG要素は見た目と衝突形状の両方に使えます。GameObjectのxとyは配置、tagsは検索、shapesは接触判定の候補です。shapeを作る関数を分けると、半径を変えるときに生成処理を探し回らずに済みます。"],
			["dtは秒", "Engineは前フレームからの経過時間を秒で渡します。vx=220なら、dtが1/60秒のフレームでは約3.67ピクセル動きます。毎フレーム3ピクセルと書くより、速度×dtと書くほうが60fpsでも120fpsでも同じ速さになります。"],
			["Ballクラス", "constructorでは初期位置、タグ、shapeを親へ渡し、vxとvyを自分の状態として持ちます。onUpdateは毎フレーム呼ばれるため、ここで座標へ速度×dtを加えます。まだ壁反射を入れず、まず動くことだけを確かめます。", `function makeCircle(radius) {\n  const shape = document.createElementNS(\n    "http://www.w3.org/2000/svg", "circle"\n  );\n  shape.setAttribute("cx", 0);\n  shape.setAttribute("cy", 0);\n  shape.setAttribute("r", radius);\n  return shape;\n}\n\nclass Ball extends GameObject {\n  constructor(x, y) {\n    super({ x, y, tags: ["ball"], shapes: [makeCircle(8)] });\n    this.vx = 220;\n    this.vy = -180;\n  }\n  onUpdate(dt) {\n    this.x += this.vx * dt;\n    this.y += this.vy * dt;\n  }\n}`],
			["登録してから装飾する", "engine.addObject(world, new Ball(400, 300))の戻り値が、実際に登録されたBallです。createElementはaddObjectの中で呼ばれるため、elementへfillを設定するのは追加後です。生成前にelementへ触るとnullになります。"],
			["確認する", "ボールが画面外へ消えても、このページでは問題ありません。次のページで境界を設計します。速度を一度だけ変更し、変化が毎秒の速さとして説明できるか確認してください。"]
		],
		exercise: "vxを0にして上下だけ、vyを0にして左右だけ動かし、xとyが独立した値だと観察する。"
	},
	{
		title: "バーを作る",
		summary: "矩形のGameObjectとINPUT.onKeyを組み合わせ、左右に動くバーを作ります。",
		goal: "キーボード入力を読む場所と、プレイヤーの境界を決める。",
		sections: [
			["バーの基準点", "course.jsのmakeRectはx=-width/2、y=-height/2の矩形を作るため、xとyはバーの中心です。中心基準なら左右端はx±width/2です。この基準を忘れると、画面端に置いたつもりのバーが半分はみ出します。"],
			["入力の読み方", "INPUT.onKey（ArrowLeft）は押している間ずっと真です。連続移動に向いているため、PaddleのonUpdateで読みます。keydownイベントの中で座標を変えるのではなく、入力はINPUTへ記録し、更新タイミングをEngineへ任せます。"],
			["Paddleのコード", `class Paddle extends GameObject {\n  constructor() {\n    super({\n      x: 400, y: 420, width: 120, height: 16,\n      tags: ["paddle"], shapes: [makeRect(120, 16)]\n    });\n  }\n  onUpdate(dt) {\n    if (INPUT.onKey("ArrowLeft")) this.moveX(-260 * dt);\n    if (INPUT.onKey("ArrowRight")) this.moveX(260 * dt);\n    this.x = Math.max(60, Math.min(740, this.x));\n  }\n}`],
			["ブラウザの既定動作", "engine.jsのInputは矢印キーとスペースのpreventDefaultを行います。これでページスクロールがゲーム操作に混ざりません。描画層のSVGもpointerdown、selectstart、dragstartを抑止しているため、バーや文字をドラッグして選択する操作にはなりません。"],
			["確認する", "左右キーを押し続け、バーが画面外へ出ないことを確認します。キーを離したあとに止まること、ウィンドウの外へフォーカスを移して戻ったあとにキーが押しっぱなしにならないことも確認します。"]
		],
		exercise: "バーの幅を160に変更し、境界値をwidth/2を使う式へ書き換える。"
	},
	{
		title: "当たり判定を作る",
		summary: "タグで候補を絞り、shapesの境界矩形を使うtouchingを読みます。",
		goal: "ボールとバーの接触を検出し、重なったままにならない反射を考える。",
		sections: [
			["touchingの意味", "ball.touchTag（paddle）は、ballと同じDisplayにあるpaddleタグのオブジェクトを探し、shape同士の境界矩形が重なったかを返します。輪郭を完全に計算する判定ではなく、まずゲームを組み立てるための近似判定です。"],
			["タグは検索の契約", "タグ名の誤字はエラーにならず、相手がいない結果になります。「paddle」と「paddel」のような違いは見つけにくいため、タグを定数へまとめるか、クラスのconstructorで必ず同じ文字列を設定します。"],
			["反射の最小コード", `world.onUpdate = () => {\n  if (!ball.touchTag("paddle")) return;\n  ball.vy = -Math.abs(ball.vy);\n  ball.y = paddle.y - paddle.height / 2 - 8;\n};`],
			["なぜ位置を戻すか", "速度だけ反転すると、ボールがバーへめり込んだフレームで何度も接触することがあります。反射後にボールの中心をバーの上側へ戻すと、次のフレームでは重なりが解消されます。shapeの半径やバーの半高さを、見た目と同じ値から計算してください。"],
			["確認する", "まずボールをバーへ当てやすい初期位置に置き、vyが正から負へ変わることを観察します。複数フレーム連続で反射しないことが重要です。"]
		],
		exercise: "バーの中心から外れた場所へ当たったときだけvxも変更し、反射方向が変わるようにする。"
	},
	{
		title: "ブロックを並べる",
		summary: "同じクラスをループで生成し、タグと配置規則でステージを作ります。",
		goal: "手作業の重複をなくし、行・列からブロック配置を計算する。",
		sections: [
			["Blockクラス", "ブロックは矩形、タグ、位置だけを持つ単純なGameObjectから始めます。ブロック自身にボールを探させるのではなく、world側がボールとの関係を管理すると、消滅や得点の順序を一か所で読めます。"],
			["行と列", "列番号colと行番号rowを使い、x=startX+col*gapX、y=startY+row*gapYとします。論理画面が800幅、10列なら、左右の余白とブロック幅を含めてgapを決めます。数式にすれば、列数を変えても配置全体が崩れません。", `for (let row = 0; row < 5; row++) {\n  for (let col = 0; col < 10; col++) {\n    const x = 80 + col * 64;\n    const y = 60 + row * 28;\n    const block = engine.addObject(world, new Block(x, y));\n    block.element.setAttribute("fill", colors[row % colors.length]);\n  }\n}`],
			["配列を管理する", "world.objectsにはボール、バー、ブロック、文字がすべて入ります。getObjects（block）ならタグで候補を絞れます。表示順は追加順なので、背景を先に、ブロックや文字を後に追加すると重なり順が自然になります。"],
			["配置を検証する", "生成直後にブロックのxとyを一度表示して、最初の列と最後の列が期待した位置にあるか確認します。見た目だけでなく、論理座標の計算結果を確認すると、余白や間隔のずれを早く見つけられます。"],
			["確認する", "行数、列数、gapを一つずつ変更します。ブロック同士が重なる場合は、幅とgapの関係を計算し直します。"]
		],
		exercise: "行ごとに色を変え、上の行を高得点にするためのscoreValueをBlockへ追加する。"
	},
	{
		title: "ブロックを壊す",
		summary: "接触したブロックを一度だけ無効化し、衝突処理の更新順を整えます。",
		goal: "ブロックの消滅、反射、スコア加算を一つの衝突イベントにまとめる。",
		sections: [
			["消すとは何か", "DOM要素をremoveするだけでは、world.objectsに元のGameObjectが残ります。以後の判定候補から外すため、消滅フラグを持たせる、opacityを0にする、tagsをclearするなど、ゲームデータとして無効化する処理が必要です。"],
			["一回だけ処理する", "同じフレームに複数ブロックと重なった場合、最初に見つかった一つだけ壊すのか、すべて壊すのかを決めます。最小版では一つだけにして、処理後にball.vyを反転します。二重反射を防ぐため、反射もループの外で一度だけ行います。"],
			["衝突処理の例", `const hit = world.getObjects("block").find((block) =>\n  !block.destroyed && ball.touching("block").includes(block)\n);\nif (hit) {\n  hit.destroyed = true;\n  hit.opacity = 0;\n  hit.tags.clear();\n  hit.element.remove();\n  ball.vy *= -1;\n  score += hit.scoreValue;\n}`],
			["配列走査中の削除", "配列からspliceする設計もできますが、走査中の削除は次の要素を飛ばしやすい問題があります。まずはdestroyedで無効化し、描画要素を取り除く方式が読みやすいです。後で大量オブジェクトが必要になったら、削除をフレーム末尾へ集めます。"],
			["確認する", "一つのブロックへボールを当て、opacity、tags、scoreの三つが一度だけ変わるか確認します。"]
		],
		exercise: "ブロックごとにscoreValueを持たせ、上段だけ10点になるようにする。"
	},
	{
		title: "壁と天井を作る",
		summary: "画面の境界を速度反転と位置補正で扱い、ボールを場外へ逃がしません。",
		goal: "左右と上の壁で反射し、めり込みによる振動を防ぐ。",
		sections: [
			["境界の定義", "論理画面はx=0から800、y=0から450です。ボールが半径8なら、中心xの許容範囲は8から792です。中心を画面端まで許すと、円の半分が画面外へ出ます。"],
			["速度反転と補正", "左壁へ出たらx=radius、vx=Math.abs(vx)、右壁ならx=width-radius、vx=-Math.abs(vx)とします。先に位置を範囲内へ戻し、その後に速度を反転すると、次フレームでも同じ壁に触れ続ける振動を避けられます。", `if (ball.x < ball.radius) {\n  ball.x = ball.radius;\n  ball.vx = Math.abs(ball.vx);\n}\nif (ball.x > 800 - ball.radius) {\n  ball.x = 800 - ball.radius;\n  ball.vx = -Math.abs(ball.vx);\n}\nif (ball.y < ball.radius) {\n  ball.y = ball.radius;\n  ball.vy = Math.abs(ball.vy);\n}`],
			["責任の置き場所", "ボールだけで完結する壁反射はBall.onUpdateに置いても構いません。画面の幅をworldから読む、壁オブジェクトとの接触を統一する、という設計ならworld側へ置きます。どちらを選んでも一か所に固定し、二重反射させないことが大切です。"],
			["壁を通り抜けるとき", "一度の移動距離がボールの直径より大きいと、前のフレームでは内側、次のフレームでは外側という状態になることがあります。まず速度を抑え、必要になったら移動を小さなステップへ分けるか、交差した境界から内側へ補正する方法を検討します。"],
			["確認する", "速度を大きくして角へ向け、ボールが壁をすり抜けないことを確認します。dtが大きいと一度に壁を越えるため、補正が必要です。"]
		],
		exercise: "画面左右に見える壁のrectを追加し、見た目と境界計算の関係を比較する。"
	},
	{
		title: "ゲームオーバー",
		summary: "ボールが下端へ落ちたときの終了状態を、停止と表示に分けて扱います。",
		goal: "playingからgameoverへ遷移し、停止後に入力や更新が続かないようにする。",
		sections: [
			["下端は壁ではない", "上・左・右は反射しますが、下端はボールを失う場所です。ball.y > height + radiusをゲームオーバー条件にすると、円全体が下へ抜けたことを判定できます。バーに当たらなかった結果として扱い、単純な画面外判定と混同しないようにします。"],
			["状態を持つ", "startedという真偽値だけでも小さなゲームは作れますが、ready、playing、gameover、clearのような状態名にすると条件が読めます。状態は文字列や定数としてデータに持ち、表示文言から逆算しません。"],
			["停止処理", `let state = "playing";\n\nfunction gameOver() {\n  state = "gameover";\n  status.text = "Game Over";\n  engine.stop();\n}\n\nworld.onUpdate = (dt) => {\n  if (state !== "playing") return;\n  if (ball.y > 450 + ball.radius) gameOver();\n};`],
			["再開を考える", "Engine.stopはrequestAnimationFrameを止めます。再開するなら同じオブジェクトをリセットしてengine.startを呼ぶ設計か、DisplayとGameObjectを作り直す設計かを選びます。まずは一回終了するだけにして、次の状態管理ページで再開を追加します。"],
			["確認する", "ボールを意図的に下へ落とし、Game Over表示後に位置が変わらないことを確認します。停止処理がonUpdateの後半にある場合、同じフレームの残り処理が走る点にも注意します。"]
		],
		exercise: "残機livesを3にして、0になるまでリセットして続行する仕様を設計する。"
	},
	{
		title: "クリア判定",
		summary: "残りブロック数をゲームデータとして数え、clear状態へ遷移します。",
		goal: "最後のブロックを壊した瞬間にクリアを確定する。",
		sections: [
			["残り数を数える", "world.objects.everyで毎フレーム判定する方法は簡単ですが、destroyedフラグを正しく更新する必要があります。別にremainingBlocksを持つなら、生成時に増やし、破壊時に一度だけ減らします。二つの値がずれないよう、変更箇所を限定します。"],
			["終了条件の順番", "同じフレームで最後のブロックを壊し、ボールも下へ落ちる可能性があります。どちらを優先するかを決め、通常はブロック破壊後にremainingBlocks===0を判定してclearを先に確定します。仕様はコードより先に文章で決めます。"],
			["判定コード", `function destroyBlock(block) {\n  if (block.destroyed) return;\n  block.destroyed = true;\n  block.tags.clear();\n  block.element.remove();\n  remainingBlocks -= 1;\n  if (remainingBlocks === 0) finish("clear");\n}`],
			["表示は状態を読む", "status.textをClear!へ変える処理は結果を知らせる表示です。clearを決める処理とTextObjectを更新する処理を分けると、将来サウンドや次ステージを追加しても判定が散らばりません。"],
			["確認する", "ブロックを一つだけ残したステージで、最後の一つが消えた直後にclearになることを確認します。壊したブロックが再び候補にならないことも見ます。"]
		],
		exercise: "clear時にengine.stopする代わりに、スペースで次のステージを作る状態遷移を追加する。"
	},
	{
		title: "スコア表示",
		summary: "TextObjectを使って数値を描画し、ルールの状態と表示を同期させます。",
		goal: "スコアをデータとして持ち、ブロック破壊の結果を画面へ反映する。",
		sections: [
			["TextObjectの役割", "TextObjectはSVG textを内部に持つGameObjectです。text、color、fontSize、anchorを設定でき、updateElementが毎フレームtextを読み直します。DOMを直接探して書き換えるのではなく、scoreText.text=String(score)のようにデータから更新します。"],
			["得点の設計", "すべてのブロックを1点にするのか、行や種類で点数を変えるのかを先に決めます。Block.scoreValueをデータとして持たせ、衝突処理がscore += block.scoreValueを行えば、表示側は点数の決め方を知りません。"],
			["表示コード", `const scoreText = engine.addObject(world, new TextObject("Score: 0", {\n  x: 18, y: 28, fontSize: 18, color: "#e2e8f0"\n}));\n\nfunction addScore(value) {\n  score += value;\n  scoreText.text = \`Score: \${score}\`;\n}`],
			["文字の基準線", "TextObjectのxとyはtext要素の基準位置です。y=28なら上端から28付近にベースラインが来ます。文字のshapeは空なので、scoreText自体を衝突対象として使う設計にはしません。表示と物理を分ける理由がここにあります。"],
			["確認する", "ブロックを一つ壊して表示が増えること、複数回当てても一度しか増えないこと、長いスコアでも画面内に収まることを確認します。"]
		],
		exercise: "残りブロック数とハイスコアを追加し、数値の更新元をそれぞれ一か所にする。"
	},
	{
		title: "コードを分ける",
		summary: "クラスと責任を分離し、完成版が大きくなっても読み返せる構造にします。",
		goal: "Ball、Paddle、Block、ルール処理の境界を説明できるようになる。",
		sections: [
			["一つの関数に詰めない", "onUpdateに入力、移動、壁、衝突、スコア、勝敗を全部書くと、順序は分かっても変更の影響範囲が分かりません。まずupdatePaddle、updateBall、handleCollisions、checkResultのように処理を動詞で分けます。"],
			["クラスの責任", "Ballは速度と移動、Paddleは入力と範囲、Blockは表示と点数を持つのが自然です。複数のオブジェクトを同時に見る衝突や勝敗はworldのルール処理へ置きます。BallがPaddleを直接消すような相互依存は避けます。"],
			["小さな関数", `function updatePaddle(paddle, dt) {\n  if (INPUT.onKey("ArrowLeft")) paddle.moveX(-260 * dt);\n  if (INPUT.onKey("ArrowRight")) paddle.moveX(260 * dt);\n  paddle.x = Math.max(60, Math.min(740, paddle.x));\n}\n\nfunction checkClear(blocks) {\n  return blocks.every((block) => block.destroyed);\n}`],
			["引数を渡す", "外側の変数を何でも読む関数は、別ステージで再利用しにくくなります。必要なball、paddle、blocksを引数で渡すと、どのデータを変更する処理かが明確です。引数が増えすぎたらworldStateへまとめます。"],
			["確認する", "関数を分けたあとも、分ける前と同じ初期位置・速度で同じ結果になるか比較します。整理とルール変更を同時に行わないことが、原因を追うコツです。"]
		],
		exercise: "course.jsの長い処理から、壁反射だけをbounceFromWalls関数へ切り出す。"
	},
	{
		title: "状態管理",
		summary: "ready、playing、gameover、clearを状態遷移として表現します。",
		goal: "状態ごとに入力・更新・表示を制限し、終了後の処理漏れを防ぐ。",
		sections: [
			["状態はルール", "状態は画面の見た目ではなく、ゲームが何を許すかを表します。readyならボールを待機させ、playingなら更新し、gameoverなら入力をリスタートだけにし、clearなら次のステージへの入力だけを受けます。"],
			["遷移表", "ready→playingはスペース、playing→gameoverは落下、playing→clearは残り0、gameover→readyはリスタートです。遷移できない組み合わせも表に書くと、clear後に得点が増えるような漏れを見つけられます。"],
			["定数で表す", `const STATE = Object.freeze({\n  READY: "ready",\n  PLAYING: "playing",\n  GAME_OVER: "gameover",\n  CLEAR: "clear"\n});\nlet state = STATE.READY;\n\nif (state === STATE.READY && INPUT.pressed("Space")) {\n  state = STATE.PLAYING;\n}`],
			["表示の同期", "stateを変更する関数transitionToを作り、そこでstatus.textやengineの停止を行うと、状態変更の副作用を一か所に集められます。表示文言を見てstateを決めるのではなく、stateから表示を決めてください。"],
			["確認する", "ready中にボールが動かない、gameover後にブロックが壊れない、clear後にスコアが増えないことをそれぞれ確認します。"]
		],
		exercise: "Pキーで一時停止するpaused状態を追加し、停止中も表示だけが更新されるようにする。"
	},
	{
		title: "角度で反射を考える",
		summary: "バーの当たった位置からvxを変え、毎回同じ垂直反射にならないようにします。",
		goal: "速度ベクトルとバー上の相対位置を使って反射を設計する。",
		sections: [
			["速度はベクトル", "vxとvyは別の数値ですが、合わせて速度ベクトルを表します。vyだけ反転すると、バーのどこへ当たっても同じ角度です。バーの中心からの距離を使えば、左右へ打ち分けられます。"],
			["相対位置", "offset=(ball.x-paddle.x)/(paddle.width/2)とすると、中心で0、左端で-1、右端で1に近い値になります。Math.maxとMath.minで-1から1へ制限し、offset*maxHorizontalSpeedをvxにします。"],
			["反射コード", `const offset = Math.max(-1, Math.min(1,\n  (ball.x - paddle.x) / (paddle.width / 2)\n));\nball.vx = offset * 300;\nball.vy = -Math.abs(ball.vy);`],
			["速度の下限", "offsetが0だとvxが0になり、ボールが垂直に往復することがあります。完全に垂直を許すか、Math.signを使って小さなvxを与えるかを決めます。プレイヤーが打ち分けられることと、長時間同じ場所を往復しないことのバランスを試します。"],
			["確認する", "バーの左、中央、右へ当て、vxの符号と大きさが変わることを確認します。速度が無限に増えないよう、上限も決めてください。"]
		],
		exercise: "当たった位置で色を変え、左半分なら青、右半分なら赤の表示にする。"
	},
	{
		title: "キー入力を整理",
		summary: "押下中・押した瞬間・離した瞬間を使い分け、入力をゲーム状態へ接続します。",
		goal: "連続操作と一回だけの操作を混同しない。",
		sections: [
			["三つの入力API", "INPUT.onKeyは押下中、pressedは押されたフレーム、releasedは離されたフレームです。バー移動はonKey、開始やリスタートはpressed、チャージやキーを離した瞬間の発射はreleasedが向いています。"],
			["フレーム末尾", "Engineの_frameは各DisplayをupdateしたあとINPUT.endFrameを呼びます。pressedとreleasedは次のフレームまでの一回分です。自分でclearすると他のオブジェクトが読む前に消えるので、INPUTの寿命を勝手に変更しません。"],
			["キーの識別", "KeyboardEvent.keyのArrowLeftや空白文字と、KeyboardEvent.codeのKeyAやSpaceを使えます。大文字小文字やSpaceとスペース文字の違いに注意し、プロジェクト内で使う表記を決めます。"],
			["フォーカスと選択", "このエンジンのゲームUIはHTMLボタンではなくSVGの描画要素です。svgElementでtabindex=-1とfocusable=falseを設定し、pointerdown時に既定フォーカスを抑止します。文字やボタンをマウスで選択できないため、通常のDOM UIと同じ選択挙動になりません。"],
			["確認する", "矢印キーを押し続けたときだけバーが動き、スペースを一度押すと一度だけreadyからplayingへ変わることを確認します。"]
		],
		exercise: "A/Dキーを追加し、Arrowキーと同じ連続移動を別の入力でも実現する。"
	},
	{
		title: "1フレームの流れ",
		summary: "Engineの更新順を追い、入力・移動・衝突・描画がいつ起きるかを理解します。",
		goal: "一フレームの処理を順番に説明し、更新順によるバグを見つける。",
		sections: [
			["フレームの順序", "requestAnimationFrameが呼ばれるとdtを計算し、Display.updateを順番に実行し、最後にINPUT.endFrameを呼びます。Display.updateではonUpdate、各ObjectのonUpdate、updateElementの順です。この順序を前提にコードを書きます。"],
			["入力を読む位置", "Paddle.onUpdateで入力を読むと、同じフレームの移動へ反映されます。world.onUpdateで衝突を見るなら、各ObjectのonUpdateより前に呼ばれる点に注意します。衝突が一つ前の位置で判定される構造なら、処理位置を調整します。"],
			["描画への反映", "onUpdateでxを変更しても、表示要素を毎回自分でtransformする必要はありません。Display.updateの後半でupdateElementが呼ばれ、x、y、rotation、scale、opacityをSVGへ反映します。データを変更するだけにすると責任が明確です。"],
			["dtの上限", "Engineは一度に大きすぎるdtを0.25秒へ制限します。タブから戻った直後にボールが画面を飛び越えるのを軽減するためです。それでも高速物体では壁やブロックを通り抜けるため、速度上限や小刻みな計算が必要になります。"],
			["確認する", "一時的にTextObjectへdtとball.xを表示し、フレームごとに値が更新されることを確認します。観察後はログや表示を残しすぎないようにします。"]
		],
		exercise: "更新順を入れ替えた場合に、バー反射の結果がどう変わるかを予想して試す。"
	},
	{
		title: "関数化",
		summary: "移動、境界、衝突、勝敗を関数に分け、完成版へ拡張しやすくします。",
		goal: "一つの変更が一つの関数へ閉じる形に整理する。",
		sections: [
			["関数化の基準", "関数へ分ける単位は、コードの長さだけではありません。入力を読む、境界へ戻す、反射する、破壊する、状態を変えるという意味のまとまりで分けます。名前から副作用が推測できるようにします。"],
			["純粋な計算", "clamp(value,min,max)やgetPaddleOffset(ball,paddle)のように、引数だけから結果を返す関数は試しやすいです。ゲームオブジェクトを直接変更する関数とは分け、計算と変更の境界を作ります。"],
			["処理例", `function clamp(value, min, max) {\n  return Math.max(min, Math.min(max, value));\n}\n\nfunction movePaddle(paddle, dt) {\n  const direction = Number(INPUT.onKey("ArrowRight"))\n    - Number(INPUT.onKey("ArrowLeft"));\n  paddle.x = clamp(paddle.x + direction * 260 * dt, 60, 740);\n}`],
			["戻り値で伝える", "destroyBlock(block)が破壊したかをbooleanで返せば、呼び出し側は破壊時だけscoreや反射を実行できます。関数の内部で画面全体の処理まで行うより、戻り値や状態変化を契約として決めるほうが再利用できます。"],
			["確認する", "関数を一つずつ切り出し、各段階でゲームが同じように動くことを確認します。関数化は動作を変えない整理から始めます。"]
		],
		exercise: "壁反射関数を作り、左・右・上それぞれの境界ケースを小さな入力で確認する。"
	},
	{
		title: "難易度を上げる",
		summary: "速度、配置、ブロック耐久、ステージ数をデータとして調整します。",
		goal: "ルールを直接書き換えず、設定値から難易度を変えられるようにする。",
		sections: [
			["難易度の軸", "速さ、バー幅、ブロック行数、ブロックの耐久、残機が代表的な軸です。一度に全部を変えると手触りの原因が分からないため、まず一つだけ変更し、プレイ時間やクリア率を観察します。"],
			["設定オブジェクト", `const levelConfig = {\n  ballSpeed: 260,\n  paddleWidth: 120,\n  rows: 5,\n  columns: 10,\n  lives: 3\n};`],
			["設定を読む", "BallのconstructorへballSpeedを渡し、PaddleへpaddleWidthを渡します。クラス内部に数値をコピーすると設定変更が反映されないため、生成時に値を渡すか、levelConfigを明示的に参照します。"],
			["難しさと公平さ", "速度を上げると反応時間が短くなります。バー幅を狭くするだけでなく、初期角度、ブロック間隔、残機との組み合わせを考えます。プレイヤーが原因を理解できる表示や、開始前の待機状態も難易度の一部です。"],
			["確認する", "同じステージを設定値だけでEasyとHardに切り替え、コードのルール部分を変更せずに挙動が変わることを確認します。"]
		],
		exercise: "3段階のlevelConfigを作り、ステージ開始時に選んだ設定をBallとPaddleへ渡す。"
	},
	{
		title: "改善ループ",
		summary: "予想、実行、観察、最小修正のループでゲームの手触りを調整します。",
		goal: "動いたコードを観察可能にし、変更の影響を説明できるようにする。",
		sections: [
			["まず予想する", "ボール速度を20%上げる前に、クリア時間、バーへの到達頻度、壁反射の角度がどう変わるか予想します。結果が予想と違った部分が、次に調べる場所です。感覚だけで複数の値を変更すると、改善の理由が残りません。"],
			["観察する値", "ball.x、ball.y、vx、vy、state、remainingBlocks、touchingの件数を必要な場面だけ表示します。毎フレームconsole.logを出すと読みにくいため、衝突時や状態変更時だけ記録します。"],
			["小さな変更", "速度、色、行数、反射角のように変更対象を一つへ限定します。問題が出たら直前の変更だけを戻せる状態にしておくと、原因をすぐ比較できます。"],
			["見た目の調整", "SVGのfill、opacity、TextObjectのfontSizeは描画の変更です。ゲームルールの変更と別に試すと、色を変えたら判定が壊れたという誤解を避けられます。描画要素を毎フレーム作り直さず、既存オブジェクトの値を更新します。"],
			["確認する", "一つの変更について、変更前の予想、実行結果、次の仮説を短く記録します。"]
		],
		exercise: "ボール速度だけを変え、クリアまでの時間とゲームオーバー回数を比較する。"
	},
	{
		title: "完成形を見る",
		summary: "これまでの部品を一つのゲームループへ組み合わせ、完成版の読み方を身につけます。",
		goal: "完成コードを上からではなく、初期化・更新・状態遷移の順に読めるようにする。",
		sections: [
			["初期化を読む", "まずimport、shape関数、クラス定義、canvas取得、Engine生成、Display生成、オブジェクト追加を探します。初期化の順序が分かると、どの値が生成時に固定され、どの値が毎フレーム変わるかが見えます。"],
			["更新を読む", "次にonUpdateを探し、Inputを読む場所、位置を変える場所、境界を直す場所、他オブジェクトを探す場所を分けて読みます。すべての処理を一度に理解する必要はありません。値の所有者を追います。"],
			["完成版の骨格", `const engine = new Engine(canvas, 60, 800, 450);\nconst world = engine.newDisplay(new Display("world", 800, 450));\nconst ball = engine.addObject(world, new Ball(400, 300));\nconst paddle = engine.addObject(world, new Paddle());\ncreateBlocks(world);\ninstallRules({ engine, world, ball, paddle });\nengine.start();`],
			["読み替える", "完成版の関数名や数値をそのまま暗記する必要はありません。自分のゲームで必要なオブジェクト、状態、終了条件に置き換えます。EngineのAPI契約であるnewDisplay、addObject、start、onUpdate、touchingは変えず、ゲーム固有のルールを組み替えます。"],
			["確認する", "完成形を、起動、ボール、バー、ブロック、衝突、終了の順に説明できるか確認します。"]
		],
		exercise: "完成版からブロック生成だけを外し、ボールとバーの検証ステージを作る。"
	},
	{
		title: "自分のゲームに広げていこう",
		summary: "Engineの契約を保ったまま、アイテム、複数ステージ、演出へ発展させます。",
		goal: "新機能を入力・状態・データ・描画・終了条件に分解して設計する。",
		sections: [
			["新機能を五つに分ける", "アイテムを追加するなら、入力は不要か、状態は落下中か取得済みか、データは効果時間か、描画は形と文字か、終了条件は画面外かを分けます。この分類を先に行うと、GameObjectへ何を持たせるべきかが決まります。"],
			["アイテムの例", "落下するItem extends GameObjectを作り、itemタグとshapeを設定します。worldの衝突処理でpaddle.touching（item）を調べ、取得したらpaddle.widthを広げ、durationを減らします。効果時間が0になったら元へ戻すという状態を持たせます。"],
			["複数ステージ", "ステージデータを行列や設定オブジェクトで表し、createLevel(config)がBlockを生成するようにします。Displayを作り直す方法と、既存オブジェクトを消して再利用する方法があります。まずは作り直すほうが初期状態を保証しやすいです。"],
			["DOMではなく描画へ", "文字やボタンもSVGのGameObjectとしてDisplayへ置けば、ゲームの論理座標、更新順、フォーカス抑止を共通化できます。ButtonObjectはpointerイベントでonClickを呼びますが、HTMLのbuttonのようにタブ移動や文字選択を持たせない設計です。"],
			["最終チェック", "起動、キー入力、壁反射、バー反射、ブロック消滅、スコア、gameover、clear、リトライ、リサイズを順番に確認します。新しい機能を足したあとも、1フレームの流れと状態遷移の表へ戻れば、原因を小さく切り分けられます。"],
			["次に作るもの", "ここからは、サウンド、パーティクル、複数ボール、ステージ選択、ランキングなどを追加できます。機能を増やすほど、データと描画を分け、タグと状態を明確にする価値が大きくなります。まず検証用の小さなステージで試してから本編へ移してください。"]
		],
		exercise: "アイテムを一つ追加し、取得後5秒だけバーが1.5倍になる機能を、五つの分類から設計して実装する。"
	}
];
