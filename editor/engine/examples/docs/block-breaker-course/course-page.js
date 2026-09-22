import { lessons } from "./lesson-content.js";

const pageNumber = Number(document.body.dataset.lesson);
const lesson = lessons[pageNumber - 1];
if (!lesson) throw new Error(`Lesson ${pageNumber} does not exist.`);

document.title = `ブロック崩し講座 ${pageNumber}`;
const previous = pageNumber > 1 ? `<a href="page-${pageNumber - 1}.html">前へ</a>` : "";
const next = pageNumber < lessons.length ? `<a href="page-${pageNumber + 1}.html">次へ</a>` : "";

const sectionHtml = lesson.sections.map(([heading, text, code]) => `
  <section class="lesson-section">
    <h2>${heading}</h2>
    <p>${text}</p>
    ${code ? `<pre><code>${escapeHtml(code)}</code></pre>` : ""}
  </section>
`).join("");

document.querySelector("#lesson").innerHTML = `
  <div class="kicker">Lesson ${pageNumber}</div>
  <h1>${pageNumber}. ${lesson.title}</h1>
  <p class="lead">${lesson.summary}</p>
  <section class="card lesson-intro">
    <h2>今回できるようになること</h2>
    <p>${lesson.goal}</p>
  </section>
  ${sectionHtml}
  <section class="card exercise">
    <h2>自分で確認する</h2>
    <p>${lesson.exercise}</p>
    <p>コードを貼るだけで終わらせず、変更前に結果を予想し、実行後に何が変わったかを説明してください。分からないときは、表示、更新、入力、判定、状態のどこで止まっているかを一つずつ確認します。</p>
  </section>
  <nav class="nav" aria-label="ページ移動">
    ${previous}<a href="../index.html">一覧</a>${next}
  </nav>
`;

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}