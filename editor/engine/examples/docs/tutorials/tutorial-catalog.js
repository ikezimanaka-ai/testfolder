const chapters = [
  ["01-engine", "最初の画面とEngine", "Engine・Display・Canvas、論理座標と起動の基本"],
  ["02-shapes", "図形と座標", "矩形、円、線、多角形、テキストの描画"],
  ["03-objects", "GameObjectと更新", "状態・タグ・クラス継承・ライフサイクル"],
  ["04-input-motion", "入力とアニメーション", "キー入力・dt・移動・見た目の変化"],
  ["05-collision", "当たり判定と検索", "collisionShapes、タグ、条件付き接触判定"],
  ["06-ui", "UI Objectと入力欄", "Button、Slider、TextInput、数値入力"],
  ["07-appearance-assets", "見た目と外部素材", "変形、モザイク、画像・SVG・フォント"],
  ["08-debug-gameplay", "デバッグとゲーム構成", "FPS、判定表示、スコア、ループと整理"],
];

const container = document.querySelector("#chapter-catalog");
for (const [slug, title, description] of chapters) {
  const link = document.createElement("a");
  link.className = "chapter-card";
  link.href = `./${slug}.html`;
  const number = document.createElement("div");
  number.className = "chapter-number";
  number.textContent = `CHAPTER ${slug.slice(0, 2)}`;
  const heading = document.createElement("h2");
  heading.textContent = title;
  const text = document.createElement("p");
  text.textContent = description;
  const meta = document.createElement("div");
  meta.className = "chapter-meta";
  meta.textContent = "2つの編集・実行サンプル";
  link.append(number, heading, text, meta);
  container.append(link);
}
