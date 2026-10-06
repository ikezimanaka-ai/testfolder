// モジュールの取り出し (CDN利用時)
document.addEventListener("DOMContentLoaded", () => {
const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = skyway_room;

async function main() {
  if (!window.SKYWAY_CONFIG) {
    const response = await fetch("./online-config.local.js", { cache: "no-store" });
    if (!response.ok) throw new Error("online-config.local.js を設定してください。");
    await import("./online-config.local.js");
  }
  const config = window.SKYWAY_CONFIG;
  if (!config?.appId || !config?.secret) {
    throw new Error("SkyWay設定の appId または secret がありません。");
  }
  // 1. SkyWayコンテキストの初期化 (開発用API)
  const context = await SkyWayContext.CreateForDevelopment(config.appId, config.secret);

  // 2. ルームの検索または作成 (P2P通信またはSFU通信を指定)
  const room = await SkyWayRoom.FindOrCreate(context, {
    type: "p2p", // 少人数カードゲームなら "p2p" でOK
    name: "daifugo-room-001" // ルーム名
  });

  // 3. ルームに入室 (Memberオブジェクトを取得)
  const me = await room.join({ name: "Player1" });
  console.log("入室成功! ID:", me.id);

  // 4. データストリーム(DataChannel)の作成と公開 (Publish)
  const dataStream = await SkyWayStreamFactory.createDataStream();
  await me.publish(dataStream);

  // カードを出すボタンを押したときの通信処理例
  document.getElementById("send-btn").onclick = () => {
    const cardData = { type: "PLAY_CARDS", cards: ["S3", "H3"] };
    // 文字列としてデータを送信
    dataStream.write(JSON.stringify(cardData));
  };

  // 5. 他のプレイヤーがデータを公開したら自動受信 (Subscribe)
  room.onStreamPublished.add(async (e) => {
    // 自分が配信したデータは無視
    if (e.publication.publisher.id === me.id) return;

    // 他人のデータ通信を受信 (Subscribe)
    if (e.publication.contentType === "data") {
      const { stream } = await me.subscribe(e.publication.id);
      
      // データ受信時の処理を設定
      stream.onData.add((data) => {
        const message = JSON.parse(data);
        console.log("相手から受信したデータ:", message);
        
        if (message.type === "PLAY_CARDS") {
          // 場のカードを更新するなどのUI処理を実行
        }
      });
    }
  });
}

main().catch((error) => console.error("SkyWay接続に失敗しました。", error));
});