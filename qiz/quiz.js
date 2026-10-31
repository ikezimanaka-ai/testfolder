(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const isHttpUrl = (value) => /^https?:/i.test(value);

  function markdownHtml(markdown, baseUrl) {
    const inline = (line) => {
      let result = esc(line);
      result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
      result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/__(.+?)__/g, "<strong>$1</strong>");
      result = result.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>").replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
      result = result.replace(/!?\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (match, label, rawUrl, title) => {
        let url;
        try { url = new URL(rawUrl, baseUrl || document.baseURI); } catch { return label; }
        if (!["http:", "https:", "blob:"].includes(url.protocol)) return label;
        const safe = esc(url.href);
        if (match.startsWith("!")) return `<img src="${safe}" alt="${label}"${title ? ` title="${esc(title)}"` : ""} loading="lazy">`;
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      });
      return result;
    };

    const lines = String(markdown ?? "").replace(/\r/g, "").split("\n");
    const html = [];
    let paragraph = [];
    let listType = null;
    let codeLines = null;
    const closeList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };
    const flushParagraph = () => { if (paragraph.length) { html.push(`<p>${paragraph.map(inline).join("<br>")}</p>`); paragraph = []; } };
    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        flushParagraph(); closeList();
        if (codeLines) { html.push(`<pre><code>${esc(codeLines.join("\n"))}</code></pre>`); codeLines = null; }
        else codeLines = [];
        continue;
      }
      if (codeLines) { codeLines.push(line); continue; }
      if (!line.trim()) { flushParagraph(); closeList(); continue; }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) { flushParagraph(); closeList(); const level = heading[1].length; html.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
      const quote = line.match(/^>\s?(.*)$/);
      if (quote) { flushParagraph(); closeList(); html.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }
      const item = line.match(/^\s*([-*+] |\d+\. )(.*)$/);
      if (item) {
        flushParagraph(); const nextType = /^\d/.test(item[1]) ? "ol" : "ul";
        if (listType !== nextType) { closeList(); html.push(`<${nextType}>`); listType = nextType; }
        html.push(`<li>${inline(item[2])}</li>`); continue;
      }
      closeList(); paragraph.push(line);
    }
    flushParagraph(); closeList();
    if (codeLines) html.push(`<pre><code>${esc(codeLines.join("\n"))}</code></pre>`);
    return html.join("\n");
  }

  function normalizeQuestion(raw, index) {
    if (!raw || typeof raw !== "object") throw new Error(`問題${index + 1}の形式が正しくありません。`);
    const prompt = raw.prompt ?? raw.sentence;
    const typeMap = { option1: "option1", option2: "option2", option3: "option3", Tinput: "Tinput", Ninput: "Ninput" };
    const type = typeMap[raw.type];
    if (!type) throw new Error(`問題${index + 1}の回答方法が不明です: ${raw.type}`);
    const options = Array.isArray(raw.options) ? raw.options.map(String) : [];
    const answer = Array.isArray(raw.answer) ? raw.answer.map(String) : raw.answer == null ? [] : [String(raw.answer)];
    if (!String(prompt ?? "").trim()) throw new Error(`問題${index + 1}の問題文が空です。`);
    if (!answer.length) throw new Error(`問題${index + 1}に正解がありません。`);
    if (["option1", "option2", "option3"].includes(type) && !options.length) throw new Error(`問題${index + 1}に選択肢がありません。`);
    if (type === "option1" && answer.length !== 1) throw new Error(`問題${index + 1}の単一選択の正解は1つにしてください。`);
    if (type === "option3" && raw.selectionCount != null && Number(raw.selectionCount) !== answer.length) throw new Error(`問題${index + 1}の指定選択数と正解数が一致しません。`);
    return { type, prompt: String(prompt), options, answer, explanation: String(raw.explanation ?? "") };
  }

  function normalizeQuiz(raw) {
    const title = String(raw?.title ?? raw?.name ?? "").trim();
    const questions = raw?.questions ?? raw?.content;
    if (!title) throw new Error("クイズタイトルがありません。");
    if (!Array.isArray(questions) || !questions.length) throw new Error("クイズに問題がありません。");
    return { title, questions: questions.map(normalizeQuestion) };
  }

  function grade(question, answer) {
    const expected = question.answer;
    if (question.type === "Tinput") return expected.some((value) => value.trim().toLocaleLowerCase() === String(answer[0] ?? "").trim().toLocaleLowerCase());
    if (question.type === "Ninput") {
      if (String(answer[0] ?? "").trim() === "") return false;
      const entered = Number(answer[0]);
      return Number.isFinite(entered) && expected.some((value) => Number.isFinite(Number(value)) && Number(value) === entered);
    }
    const actual = answer.map(String);
    if (question.type === "option2") {
      const a = [...actual].sort(); const b = [...expected].sort();
      return a.length === b.length && a.every((value, i) => value === b[i]);
    }
    return actual.length === expected.length && actual.every((value, i) => value === expected[i]);
  }

  function localFileIndex(files) {
    const map = new Map();
    for (const file of files) {
      map.set(file.name, file);
      map.set(file.webkitRelativePath || file.name, file);
      map.set((file.webkitRelativePath || file.name).replace(/^\.\//, ""), file);
    }
    return map;
  }

  async function parseJsonFile(file) { return JSON.parse(await file.text()); }

  async function loadLocalFiles(files) {
    const fileMap = localFileIndex(files);
    const jsonFiles = [...files].filter((file) => /\.json$/i.test(file.name));
    if (!jsonFiles.length) throw new Error("JSONファイルを選択してください。");
    let candidate = jsonFiles[0]; let raw = null; let parseError = null;
    for (const file of jsonFiles) {
      try {
        const parsed = await parseJsonFile(file);
        if (Array.isArray(parsed.questions) && parsed.questions.length && typeof parsed.questions[0] === "string") { candidate = file; raw = parsed; break; }
        if (raw === null) { candidate = file; raw = parsed; }
      } catch (error) { parseError = error; }
    }
    if (raw === null) throw new Error(`JSONを読み込めません: ${parseError?.message || "内容を確認してください。"}`);
    if (!Array.isArray(raw.questions) || !raw.questions.length || typeof raw.questions[0] !== "string") return { quiz: normalizeQuiz(raw), baseUrl: "" };
    const loaded = [];
    for (const ref of raw.questions) {
      let file;
      try { file = fileMap.get(decodeURIComponent(new URL(ref, `https://local.invalid/${candidate.webkitRelativePath || candidate.name}`).pathname).replace(/^\//, "")) || fileMap.get(ref) || fileMap.get(ref.split("/").pop()); } catch { file = fileMap.get(ref); }
      if (!file) throw new Error(`一覧JSONの問題ファイル「${ref}」が選択されていません。`);
      const value = await parseJsonFile(file);
      const parts = value.questions ?? value.content;
      if (Array.isArray(parts)) loaded.push(...parts);
      else if (value.type) loaded.push(value);
      else throw new Error(`「${file.name}」はクイズJSONまたは問題JSONではありません。`);
    }
    return { quiz: normalizeQuiz({ title: raw.title ?? raw.name ?? "クイズ", questions: loaded }), baseUrl: "" };
  }

  async function loadUrl(urlValue) {
    let url;
    try { url = new URL(urlValue); } catch { throw new Error("有効なURLを入力してください。"); }
    if (!isHttpUrl(url.href)) throw new Error("httpまたはhttpsのURLを入力してください。");
    const response = await fetch(url.href);
    if (!response.ok) throw new Error(`読み込みに失敗しました (${response.status})。`);
    const raw = await response.json();
    if (Array.isArray(raw.questions) && raw.questions.length && typeof raw.questions[0] === "string") {
      const loaded = [];
      for (const ref of raw.questions) {
        const questionUrl = new URL(ref, url);
        const child = await fetch(questionUrl.href);
        if (!child.ok) throw new Error(`問題ファイルを読み込めません: ${questionUrl.href}`);
        const quizPart = await child.json();
        const questions = quizPart.questions ?? quizPart.content;
        if (Array.isArray(questions)) loaded.push(...questions);
        else if (quizPart.type) loaded.push(quizPart);
        else throw new Error(`問題ファイルの形式が正しくありません: ${questionUrl.href}`);
      }
      return { quiz: normalizeQuiz({ title: raw.title ?? raw.name ?? "クイズ", questions: loaded }), baseUrl: url.href };
    }
    return { quiz: normalizeQuiz(raw), baseUrl: url.href };
  }

  const app = byId("app");
  if (app) {
    const quizPanel = byId("quiz");
    const status = byId("load-status");
    let quiz = null; let baseUrl = ""; let activeQuestions = []; let answers = []; let position = 0; let results = [];
    const dom = new Deal(quizPanel);
    const renderMarkdown = (target, text) => { target.classList.add("markdown"); target.innerHTML = markdownHtml(text, baseUrl); };
    function startSession(indices) {
      activeQuestions = indices.slice(); answers = []; results = []; position = 0; renderQuestion();
    }
    function renderQuestion() {
      if (position >= activeQuestions.length) { renderResults(); return; }
      const qIndex = activeQuestions[position]; const question = quiz.questions[qIndex]; const selected = [];
      dom.DELETE(); quizPanel.classList.remove("hidden");
      const top = dom.CE("div", { class: "quiz-top" });
      top.appendChild(Object.assign(document.createElement("h2"), { textContent: quiz.title }));
      top.appendChild(Object.assign(document.createElement("span"), { className: "progress", textContent: `問題 ${position + 1} / ${activeQuestions.length}` }));
      const track = dom.CE("div", { class: "progress-track" }); const fill = document.createElement("span"); fill.style.width = `${((position + 1) / activeQuestions.length) * 100}%`; track.appendChild(fill);
      const prompt = dom.CE("div", { class: "question-prompt" }); renderMarkdown(prompt, question.prompt);
      const choices = dom.CE("div", { class: "answers" });
      const updateSelection = () => {
        [...choices.children].forEach((button) => {
          const value = button.dataset.value; const idx = selected.indexOf(value);
          button.classList.toggle("selected", idx >= 0);
          button.querySelector(".answer-index").textContent = question.type === "option3" && idx >= 0 ? String(idx + 1) : button.dataset.label;
          button.setAttribute("aria-pressed", String(idx >= 0));
        });
      };
      if (["option1", "option2", "option3"].includes(question.type)) {
        if (question.type === "option3") dom.CE("p", { class: "ordered-hint", text: `選択した順に並びます。${question.answer.length}個選んでください。` });
        question.options.forEach((option, index) => {
          const button = document.createElement("button"); button.type = "button"; button.className = "answer-choice"; button.dataset.value = option; button.dataset.label = String.fromCharCode(65 + (index % 26));
          button.innerHTML = `<span class="answer-index">${esc(button.dataset.label)}</span><span>${esc(option)}</span>`;
          button.addEventListener("click", () => {
            const existing = selected.indexOf(option);
            if (question.type === "option1") selected.splice(0, selected.length, option);
            else if (existing >= 0) selected.splice(existing, 1);
            else if (selected.length < question.answer.length || question.type === "option2") selected.push(option);
            updateSelection();
          });
          choices.appendChild(button);
        });
      } else {
        const input = document.createElement("input"); input.type = question.type === "Ninput" ? "number" : "text"; input.step = "any"; input.placeholder = question.type === "Ninput" ? "数値を入力" : "回答を入力"; input.setAttribute("aria-label", "回答");
        choices.appendChild(input);
      }
      const actions = dom.CE("div", { class: "quiz-actions" });
      const back = document.createElement("button"); back.type = "button"; back.className = "button secondary"; back.textContent = "読み込み画面へ"; back.addEventListener("click", () => { quizPanel.classList.add("hidden"); window.scrollTo({ top: 0, behavior: "smooth" }); });
      const submit = document.createElement("button"); submit.type = "button"; submit.className = "button"; submit.textContent = "回答する";
      actions.append(back, submit);
      submit.addEventListener("click", () => {
        let userAnswer;
        if (["option1", "option2", "option3"].includes(question.type)) userAnswer = selected.slice();
        else userAnswer = [choices.querySelector("input").value];
        if (!userAnswer.length || (question.type === "option3" && userAnswer.length !== question.answer.length)) { setStatus("回答を選択してください。"); return; }
        setStatus(""); answers[qIndex] = userAnswer;
        const correct = grade(question, userAnswer); results.push({ index: qIndex, answer: userAnswer, correct });
        submit.remove(); back.remove();
        const feedback = dom.CE("div", { class: `feedback ${correct ? "correct" : "incorrect"}` });
        feedback.appendChild(Object.assign(document.createElement("strong"), { textContent: correct ? "正解" : "不正解" }));
        const answerText = document.createElement("p"); answerText.append("正解: ", question.answer.join(" → ")); feedback.appendChild(answerText);
        if (question.explanation) renderMarkdown(feedback.appendChild(document.createElement("div")), question.explanation);
        const next = document.createElement("button"); next.type = "button"; next.className = "button"; next.textContent = position + 1 === activeQuestions.length ? "結果を見る" : "次の問題へ"; next.addEventListener("click", () => { position += 1; renderQuestion(); });
        actions.appendChild(next);
      });
    }
    function renderResults() {
      dom.DELETE(); const correct = results.filter((result) => result.correct).length; const percent = Math.round(correct / Math.max(results.length, 1) * 100);
      const top = dom.CE("div", { class: "quiz-top" }); top.appendChild(Object.assign(document.createElement("h2"), { textContent: "クイズ結果" })); top.appendChild(Object.assign(document.createElement("span"), { className: "progress", textContent: quiz.title }));
      const summary = dom.CE("div", { class: "result-summary" }); const ring = document.createElement("div"); ring.className = "score-ring"; ring.style.setProperty("--score", `${percent}%`); ring.appendChild(Object.assign(document.createElement("strong"), { textContent: `${percent}%` })); summary.appendChild(ring);
      const text = document.createElement("div"); text.innerHTML = `<h2>${correct} / ${results.length} 問正解</h2><p class="summary-count">この挑戦の正答率</p>`; summary.appendChild(text);
      const actions = dom.CE("div", { class: "result-actions" });
      const retryButton = (label, indices) => { const button = document.createElement("button"); button.type = "button"; button.className = "button secondary"; button.textContent = label; button.disabled = !indices.length; button.addEventListener("click", () => startSession(indices)); actions.appendChild(button); };
      retryButton("間違えた問題を解き直す", results.filter((r) => !r.correct).map((r) => r.index));
      const list = dom.CE("ol", { class: "result-list" });
      results.forEach((result, resultIndex) => {
        const question = quiz.questions[result.index]; const item = document.createElement("li"); item.className = "result-item";
        const line = document.createElement("div"); line.className = "result-item-top";
        line.appendChild(Object.assign(document.createElement("span"), { className: `result-state ${result.correct ? "correct" : "incorrect"}`, textContent: result.correct ? "正解" : "不正解" }));
        const title = document.createElement("h3"); renderMarkdown(title, question.prompt); line.appendChild(title); item.appendChild(line);
        const details = document.createElement("div"); details.className = "markdown"; details.innerHTML = `<p>あなたの回答: ${esc(result.answer.join(" → ") || "未回答")}</p><p>正解: ${esc(question.answer.join(" → "))}</p>${question.explanation ? `<div>${markdownHtml(question.explanation, baseUrl)}</div>` : ""}`; item.appendChild(details);
        const retry = document.createElement("button"); retry.type = "button"; retry.className = "button secondary retry-single"; retry.textContent = "この問題だけ解き直す"; retry.addEventListener("click", () => startSession([result.index])); item.appendChild(retry);
        const includeLabel = document.createElement("label"); includeLabel.className = "retry-single"; includeLabel.style.display = "block"; includeLabel.style.marginTop = "8px"; const check = document.createElement("input"); check.type = "checkbox"; check.className = "retry-select"; check.value = String(result.index); check.style.width = "auto"; check.style.marginRight = "8px"; includeLabel.append(check, `指定して解き直す (問題 ${resultIndex + 1})`); item.appendChild(includeLabel);
        list.appendChild(item);
      });
      const selectedButton = document.createElement("button"); selectedButton.type = "button"; selectedButton.className = "button secondary"; selectedButton.textContent = "チェックした問題を解き直す"; selectedButton.disabled = true; actions.appendChild(selectedButton);
      list.addEventListener("change", () => { selectedButton.disabled = list.querySelectorAll(".retry-select:checked").length === 0; });
      selectedButton.addEventListener("click", () => {
        const selectedIndices = [...list.querySelectorAll(".retry-select:checked")].map((input) => Number(input.value));
        if (selectedIndices.length) startSession(selectedIndices); else setStatus("解き直す問題にチェックを入れてください。");
      });
      dom.CE("h2", { text: "問題一覧" }); dom.CE("p", { class: "muted", text: "各問題を個別に解き直すか、チェックしてまとめて再挑戦できます。" }); quizPanel.appendChild(summary); quizPanel.appendChild(actions); quizPanel.appendChild(list);
    }
    function setStatus(message) { status.textContent = message; }
    async function withLoad(loadTask) {
      setStatus("読み込み中…");
      try { const result = await loadTask(); quiz = result.quiz; baseUrl = result.baseUrl; setStatus(`${quiz.title} (${quiz.questions.length}問) を読み込みました。`); startSession(quiz.questions.map((_, i) => i)); }
      catch (error) { setStatus(error.message || "読み込みに失敗しました。"); }
    }
    byId("url-form").addEventListener("submit", (event) => { event.preventDefault(); withLoad(() => loadUrl(byId("quiz-url").value.trim())); });
    byId("local-files").addEventListener("change", (event) => { const files = event.target.files; if (files?.length) withLoad(() => loadLocalFiles(files)); event.target.value = ""; });
  }

  const editor = byId("editor-questions");
  if (editor) {
    const template = byId("question-template"); const titleInput = byId("quiz-title"); const status = byId("editor-status");
    function refreshNumbers() { [...editor.children].forEach((card, i) => { card.querySelector(".question-number").textContent = String(i + 1); }); }
    function updateCard(card) {
      const type = card.querySelector(".type-input").value; const optionField = card.querySelector(".options-field");
      optionField.classList.toggle("hidden", !["option1", "option2", "option3"].includes(type));
      card.querySelector(".answer-label").textContent = type === "option3" ? "正解順 (1行に1つ)" : ["option1", "option2"].includes(type) ? "正解 (選択肢と同じ表記)" : "正解 (1行に1つ、別解も可)";
      const prompt = card.querySelector(".prompt-input").value; const explanation = card.querySelector(".explanation-input").value;
      card.querySelector(".markdown-preview").innerHTML = `<strong>問題文</strong>${markdownHtml(prompt || "プレビュー", "")}${explanation ? `<hr><strong>解説</strong>${markdownHtml(explanation, "")}` : ""}`;
    }
    function addCard(data = {}) {
      const card = template.content.firstElementChild.cloneNode(true);
      card.querySelector(".prompt-input").value = data.prompt ?? data.sentence ?? "";
      card.querySelector(".type-input").value = data.type || "option1";
      card.querySelector(".options-input").value = (data.options || []).join("\n");
      card.querySelector(".answer-input").value = (Array.isArray(data.answer) ? data.answer : data.answer == null ? [] : [data.answer]).join("\n");
      card.querySelector(".explanation-input").value = data.explanation || "";
      card.addEventListener("input", () => updateCard(card)); card.addEventListener("change", () => updateCard(card));
      card.querySelector(".remove-question").addEventListener("click", () => { card.remove(); refreshNumbers(); });
      editor.appendChild(card); refreshNumbers(); updateCard(card);
    }
    function editorData() {
      const questions = [...editor.children].map((card, index) => {
        const type = card.querySelector(".type-input").value;
        const question = { type, prompt: card.querySelector(".prompt-input").value.trim(), answer: card.querySelector(".answer-input").value.split("\n").map((item) => item.trim()).filter(Boolean), explanation: card.querySelector(".explanation-input").value.trim() };
        if (["option1", "option2", "option3"].includes(type)) question.options = card.querySelector(".options-input").value.split("\n").map((item) => item.trim()).filter(Boolean);
        return normalizeQuestion(question, index);
      });
      return normalizeQuiz({ title: titleInput.value.trim(), questions });
    }
    byId("add-question").addEventListener("click", () => addCard());
    byId("download-json").addEventListener("click", () => {
      try { const data = editorData(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${data.title.replace(/[\\/:*?"<>|]/g, "_") || "quiz"}.json`; link.click(); URL.revokeObjectURL(url); status.textContent = "JSONをダウンロードしました。"; }
      catch (error) { status.textContent = error.message; }
    });
    byId("import-json").addEventListener("change", async (event) => {
      const file = event.target.files?.[0]; if (!file) return;
      try { const data = normalizeQuiz(await parseJsonFile(file)); titleInput.value = data.title; editor.replaceChildren(); data.questions.forEach(addCard); status.textContent = `${data.questions.length}問を読み込みました。`; }
      catch (error) { status.textContent = error.message; }
      event.target.value = "";
    });
    addCard();
  }
})();
