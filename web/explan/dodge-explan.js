const root = new Deal(document.getElementById("app"));
const main = root.CE("main");
new Deal(main).CE("h1", { text: "回避ゲームの仕組み" });
new Deal(main).CE("p", { html: '実際に遊ぶページは <a href="../dodge.html">dodge.html</a> です。このページでは、<code>dodge.js</code> が Engine をどう使っているかを、ゲームの動きとコードを対応させて説明します。' });

function chapter(title, html) {
  const section = new Deal(main).CE("section");
  new Deal(section).CE("h2", { text: title });
  new Deal(section).CE("div", { html });
}

chapter("1. 画面を三つの役割に分ける", `<p>最初に <code>canvas</code> を作り、<code>Engine</code> を作ります。その上に背景用の Display と物体用の Display を重ねます。背景は毎フレーム変わらないので一番下、プレイヤーと障害物はその上です。</p>
<pre>const engine = new GameEngine.Engine({ fps: 60, canvas });
const background = engine.createDisplay({ transparent: false, blend: "normal" });
const actors = engine.createDisplay({ transparent: true, blend: "normal" });</pre>
<p>Display を分ける理由は、背景と動く物体の責任を分けるためです。今の Engine はどちらも毎フレーム描きますが、後で背景を画像キャッシュにする改良もしやすくなります。</p>`);

chapter("2. dtで速さを一定にする", `<p>プレイヤーは「1フレームに4」ではなく「1秒に280ピクセル」と考えます。<code>dt</code> は前回の更新から経過した秒数なので、移動量は <code>speed * dt</code> です。パソコンの速さが違っても、時間を基準にするので動きが安定します。</p>
<pre>player.move(dx * PLAYER_SPEED * dt, dy * PLAYER_SPEED * dt);
obstacle.move(-OBSTACLE_SPEED * dt, 0);</pre>
<p>Engine の <code>onUpdate</code> は毎回 <code>(dt, input)</code> を渡します。ゲーム側は独自の <code>requestAnimationFrame</code> を作らず、ここに更新処理を登録できます。</p>`);

chapter("3. 障害物を右から出す", `<p><code>spawnTimer</code> を減らし、0以下になったら新しい障害物を一つ作ります。大きさと高さをランダムにして、同じ場所から機械的に出ないようにします。障害物の中心を Canvas の右端より外に置くのは、出現した瞬間に半分だけ見える状態を避けるためです。</p>
<pre>if (spawnTimer <= 0) {
  spawnObstacle();
  spawnTimer = 0.65 + Math.random() * 0.5;
}</pre>
<p>左端を越えた障害物は <code>removeFrom(actors)</code> で Display から削除し、配列からも外します。これを忘れると、見えない障害物がずっとメモリに残ります。</p>`);

chapter("4. 当たり判定と無敵時間", `<p>毎回の更新で、各障害物に対して <code>player.intersectsObject(obstacle)</code> を呼びます。衝突したら被弾数を1増やし、<code>invincible = 1.2</code> とします。無敵時間が0より大きい間は、衝突しても新しい被弾を増やしません。</p>
<pre>if (invincible <= 0 && player.intersectsObject(obstacle)) {
  hitCount += 1;
  invincible = INVINCIBLE_SECONDS;
}</pre>
<p>無敵中にプレイヤーを点滅させるのは、見た目で「今は当たらない」と伝えるためです。<code>visible</code> を一定周期で切り替えています。3回目の被弾で <code>running = false</code> と <code>engine.stop()</code> を呼びます。</p>`);

chapter("5. 入力と画面端", `<p>矢印キーまたは WASD が押されているかを <code>InputManager.isKeyPressed</code> で調べます。斜め移動では x と y を両方1にすると速度が約1.41倍になるため、<code>Math.hypot</code> で長さを割って速度を正規化しています。</p>
<pre>const length = Math.hypot(dx, dy);
player.move((dx / length) * PLAYER_SPEED * dt,
            (dy / length) * PLAYER_SPEED * dt);</pre>
<p>その後、プレイヤーの中心を画面内に戻します。幅の半分を使うので、中心だけでなく四角全体が画面内に収まります。</p>`);

chapter("6. リスタートの流れ", `<p>開始ボタンは、まず古い障害物を削除し、プレイヤーを作り直し、スコアと被弾数を0へ戻します。それから <code>engine.start()</code> を呼びます。Engine 側にも二重起動防止があるので、連打してもループが二つになりません。</p>
<div class="note">改造例: <code>HIT_LIMIT</code> を5にすると5回まで耐えられます。<code>INVINCIBLE_SECONDS</code> を2にすると、被弾後の安全時間が長くなります。<code>OBSTACLE_SPEED</code> を上げると難しくなります。</div>`);

new Deal(main).CE("p", { html: '<a href="../dodge.html">ゲームを遊ぶ</a> / <a href="./index.html">← 補助教材一覧</a> / <a href="../guide.html#demo">総合ガイドのデモ章</a>' });
