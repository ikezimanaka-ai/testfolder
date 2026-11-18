const ROLE_ORDER = [
  ["RoyalStraightFlush", "ロイヤルストレートフラッシュ", 50],
  ["FiveCard", "ファイブカード", 30],
  ["FourCard", "フォーカード", 20],
  ["FullHouse", "フルハウス", 15],
  ["Flush", "フラッシュ", 10],
  ["Straight", "ストレート", 8],
  ["ThreeCard", "スリーカード", 5],
  ["TwoPair", "ツーペア", 4],
  ["Pair", "ワンペア", 2],
  ["HighCard", "ノーペア", 1],
];
const JOKERS = [
  { id: "void", name: "空虚", description: "このカード以外のジョーカー空き枠数を倍率に乗算", price: 9 },
  { id: "greed", name: "強欲", description: "所持コイン5枚ごとに倍率 +1", price: 8 },
  { id: "darkness", name: "暗闇", description: "選んだカードのスートがすべて異なると倍率 +8", price: 7 },
  { id: "echo", name: "残響", description: "残りプレイ数を倍率に加算", price: 8 },
  { id: "spellbound", name: "渇望", description: "これまでに使ったスペル1枚ごとに倍率 +1", price: 8 },
  { id: "collector", name: "執着", description: "選んだスートの種類ごとに倍率 +2", price: 7 },
  { id: "arsenal", name: "殺戮", description: "5枚選んで出すと倍率 +10", price: 8 },
  { id: "ace", name: "傲慢", description: "選んだカードにAが含まれると倍率 +8", price: 7 },
  { id: "fortune", name: "悪運", description: "現在のスコア100点ごとに倍率 +1", price: 9 },
  { id: "mirror", name: "迷妄", description: "ストレートかフラッシュ系の役で倍率2倍", price: 10 },
  { id: "ashes", name: "灰燼", description: "残りリロール1回ごとに倍率 +4", price: 7 },
  { id: "crown", name: "虚栄", description: "選んだカードにKかAが含まれると倍率 +6", price: 10 },
  { id: "pairs", name: "執念", description: "ペア以上の役で倍率 +5", price: 9 },
  { id: "drought", name: "枯渇", description: "リロールを使い切ると倍率 +12", price: 9 },
  { id: "frenzy", name: "狂気", description: "2枚でプレイすると倍率 +25", price: 9 },
  { id: "anchor", name: "錨", description: "フラッシュかストレート系の役で倍率 +7", price: 10 },
  { id: "lastlight", name: "断末", description: "残りプレイ数が1回のとき倍率 +10", price: 11 },
];
const SPELLS = [
  { id: "sun", name: "太陽", description: "選んだカードの最大2枚をダイヤにする", price: 4 },
  { id: "moon", name: "月影", description: "選んだカードの数字を +2（上限14）", price: 10 },
  { id: "fool", name: "愚者", description: "直前の愚者以外のスペル効果を再使用", price: 2 },
  { id: "heart", name: "紅蓮", description: "選んだカードの最大2枚をハートにする", price: 4 },
  { id: "clover", name: "青葉", description: "選んだカードの最大2枚をクローバーにする", price: 4 },
  { id: "spade", name: "黒羽", description: "選んだカードの最大2枚をスペードにする", price: 4 },
  { id: "star", name: "星片", description: "選んだカードの数字を +1（上限14）", price: 6 },
  { id: "mirror", name: "鏡像", description: "選んだカードのスートを順に入れ替える", price: 5 },
  { id: "wild", name: "幻惑", description: "選んだカードのスートをランダムに変える", price: 5 },
  { id: "exchange", name: "交換", description: "選んだ先頭2枚のスートを入れ替える", price: 7 },
  { id: "cycle", name: "循環", description: "選んだカードのスートを逆順にずらす", price: 8 },
  { id: "clone", name: "複写", description: "選んだ2枚目のカードを1枚目と同じ内容にする", price: 8 },
//  { id: "flush", name: "染色", description: "選んだカードすべてを先頭カードと同じスートにする", price: 7 },
  { id: "multiplier-seal", name: "久遠", description: "選んだカード最大2枚に倍率シールを付ける", price: 5 },
  { id: "gold-seal", name: "黄金", description: "選んだカード最大2枚に黄金シールを付ける", price: 5 },
  { id: "purple-seal", name: "逃避", description: "選んだカード最大2枚に紫シールを付ける", price: 5 },
];
const SUIT_NAMES = { h: "♥", d: "♦", c: "♣", s: "♠" };
const SUIT_LABELS = { h: "ハート", d: "ダイヤ", c: "クローバー", s: "スペード" };
const SUITS = Object.keys(SUIT_NAMES);
const TARGET_SCORE = 500;
const TOTAL_PLAYS = 4;
const TOTAL_REROLLS = 2;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      const id = `${suit}${rank}`;
      deck.push({ suit, rank, id, special: null });
    }
  }
  return deck;
}
const state = {
  coins: 8,
  score: 0,
  target: TARGET_SCORE,
  playsLeft: TOTAL_PLAYS,
  rerollsLeft: TOTAL_REROLLS,
  masterDeck: makeDeck(),
  deck: [],
  hand: [],
  selected: new Set(),
  multipliers: Object.fromEntries(ROLE_ORDER.map(([id, , value]) => [id, value])),
  jokers: [],
  spells: [],
  spellsUsed: 0,
  spellHistory: [],
  history: [],
  shopOffer: { jokers: [], spells: [], upgrades: [] },
  gameNumber: 1,
  clears: 0,
  difficulty: "normal",
  finished: false,
  animating: false,
  animationSkip: false,
};

const $ = (id) => document.getElementById(id);
let toastTimer;

const customCardImages = new Map();

function cardPath(card) {
  const key = `${card.suit}${String(card.rank).padStart(2, "0")}`;
  return customCardImages.get(key) || `./Porcards/${key}.png`;
}
async function chooseCardFolder() {
  const message = $("card-folder-message");
  if (!window.showDirectoryPicker) {
    message.textContent = "このブラウザーではフォルダ選択に対応していません。対応ブラウザーの最新版をご利用ください。";
    return;
  }
  try {
    const directory = await window.showDirectoryPicker({ mode: "read" });
    const files = [];
    for await (const entry of directory.values()) {
      if (entry.kind === "file") files.push(entry);
    }

    const imageFiles = new Map();
    for (const fileHandle of files) {
      const match = fileHandle.name.match(/^([hdcs])(\d{2})\.(png|jpe?g|webp|gif)$/i);
      if (match) imageFiles.set(`${match[1].toLowerCase()}${match[2]}`, fileHandle);
    }
    if (!imageFiles.size) {
      message.textContent = "対応する画像が見つかりません。例: h02.png、d14.jpg（h/d/c/s + 2桁の数字）";
      return;
    }

    customCardImages.forEach((url) => URL.revokeObjectURL(url));
    customCardImages.clear();
    for (const [key, fileHandle] of imageFiles) {
      customCardImages.set(key, URL.createObjectURL(await fileHandle.getFile()));
    }
    message.textContent = `${imageFiles.size}枚のカード画像を読み込みました。見つからないカードは標準画像を使用します。`;
    renderHand();
    renderDeckViewer();
  } catch (error) {
    if (error.name !== "AbortError") message.textContent = "フォルダを読み込めませんでした。";
  }
}
function rankName(rank) {
  return rank === 14 ? "A" : rank === 13 ? "K" : rank === 12 ? "Q" : rank === 11 ? "J" : String(rank);
}
function specialName(special) {
  return { multiplier: "倍率", gold: "黄金", purple: "紫シール" }[special] || "";
}
function specialDescription(special) {
  return {
    multiplier: "役に含めると倍率 +2",
    gold: "ゲーム終了時に手札にあると +3コイン",
    purple: "役に出すかリロールするとランダムなスペルを獲得",
  }[special] || "";
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1000);
}
function setStatus(message) {
  $("status-message").textContent = message;
}
function sortHand(preserveSelection = false) {
  const selectedIds = preserveSelection
    ? new Set([...state.selected].map((index) => state.hand[index]?.id))
    : new Set();
  state.hand.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank);
  if (preserveSelection) {
    state.selected = new Set(state.hand.reduce((indices, card, index) => {
      if (selectedIds.has(card.id)) indices.push(index);
      return indices;
    }, []));
  }
}
function drawToTen() {
  while (state.hand.length < 10 && state.deck.length) state.hand.push(state.deck.pop());
  sortHand();
}
function targetForDifficulty() {
  const scale = { easy: 0.75, normal: 1, hard: 1.5 }[state.difficulty] || 1;
  return Math.round((TARGET_SCORE + state.clears * 150) * scale);
}
function showScreen(screenId) {
  ["title-screen", "settings-screen", "gameover-screen", "game-screen", "shop-screen"].forEach((id) => {
    $(id).classList.toggle("hidden", id !== screenId);
  });
}
function startGame() {
  state.score = 0;
  state.target = targetForDifficulty();
  state.playsLeft = TOTAL_PLAYS;
  state.rerollsLeft = TOTAL_REROLLS;
  state.deck = shuffle(state.masterDeck.map((card) => ({ ...card })));
  state.hand = [];
  state.selected.clear();
  state.spellHistory = [];
  state.history = [];
  state.finished = false;
  state.animating = false;
  drawToTen();
  showScreen("game-screen");
  $("game-title").textContent = `ゲーム ${state.gameNumber} · 目標スコアを超えよう`;
  setStatus("カードを2〜5枚選んでプレイしてください。");
  renderAll();
}
function renderAll() {
  $("coin-count").textContent = state.coins;
  $("score").textContent = state.score;
  $("target-score").textContent = state.target;
  $("plays-left").textContent = state.playsLeft;
  $("rerolls-left").textContent = state.rerollsLeft;
  $("deck-count").textContent = `山札 ${state.deck.length}枚`;
  $("score-progress").style.width = `${Math.min(100, (state.score / state.target) * 100)}%`;
  $("selected-count").textContent = state.selected.size;
  $("play-button").disabled = state.finished || state.animating || state.selected.size < 2 || state.selected.size > 5;
  $("reroll-button").disabled = state.finished || state.animating || state.rerollsLeft <= 0 || state.selected.size === 0;
  $("history-count").textContent = `${state.history.length} / ${TOTAL_PLAYS} 回`;
  renderScorePreview();
  renderHand();
  renderMultipliers();
  renderJokers();
  renderSpells();
  renderHistory();
}
function renderScorePreview() {
  if (state.animating) return;
  $("play-animation-result").classList.remove("hidden");
  const cards = [...state.selected].sort((a, b) => a - b).map((index) => state.hand[index]);
  const detail = $("animation-detail");
  if (cards.length === 0 || cards.length > 5) {
    detail.textContent = cards.length > 5 ? "一度に選べるのは5枚までです。" : "カードを選ぶと基礎点と役倍率を表示します。";
    $("score-base").textContent = "—";
    $("score-multiplier").textContent = "—";
    $("score-points").textContent = "—";
    $("animation-score").textContent = "";
    return;
  }
  const role = classify(cards);
  const roleInfo = ROLE_ORDER.find(([id]) => id === role);
  const base = cards.reduce((sum, card) => sum + card.rank, 0);
  const multiplier = state.multipliers[role];
  detail.textContent = `${roleInfo[1]} · 役倍率 ${multiplier}×`;
  $("score-base").textContent = base;
  $("score-multiplier").textContent = multiplier;
  $("score-points").textContent = base * multiplier;
  $("animation-score").textContent = "";
  $("multiplier-float").textContent = "";
}
function setScoreMultiplier(value, label = "") {
  const base = Number($("score-base").textContent) || 0;
  $("score-multiplier").textContent = value;
  $("score-points").textContent = base * value;
  const floating = $("multiplier-float");
  floating.textContent = label;
  if (label) {
    floating.classList.remove("is-floating");
    void floating.offsetWidth;
    floating.classList.add("is-floating");
  }
}
function renderHand() {
  const hand = $("hand");
  hand.replaceChildren();
  state.hand.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `playing-card${state.selected.has(index) ? " selected" : ""}${card.special ? ` special-${card.special}` : ""}`;
    button.dataset.cardId = card.id;
    button.setAttribute("aria-label", `${SUIT_LABELS[card.suit]}の${rankName(card.rank)}${card.special ? `、${specialDescription(card.special)}` : ""}`);
    if (card.special) button.title = specialDescription(card.special);
    const image = document.createElement("img");
    image.src = cardPath(card);
    image.alt = `${SUIT_LABELS[card.suit]}の${rankName(card.rank)}`;
    image.onerror = () => button.classList.add("image-missing");
    const fallback = document.createElement("span");
    fallback.className = "card-fallback";
    fallback.innerHTML = `${SUIT_NAMES[card.suit]}<small>${rankName(card.rank)} · ${card.rank}</small>`;
    button.append(image, fallback);
    if (card.special) {
      const badge = document.createElement("span");
      badge.className = "special-badge";
      badge.textContent = specialName(card.special);
      button.append(badge);
    }
    button.addEventListener("click", () => toggleCard(index));
    hand.append(button);
  });
}
function toggleCard(index) {
  if (state.finished || state.animating) return;
  if (state.selected.has(index)) state.selected.delete(index);
  else if (state.selected.size < 5) state.selected.add(index);
  else showToast("一度に選べるのは5枚までです。");
  renderAll();
}
function renderMultipliers() {
  $("multipliers").innerHTML = ROLE_ORDER.filter(([id]) => id !== "HighCard").map(([id, name]) =>
    `<div class="multiplier-item"><span>${name}</span><strong>${state.multipliers[id]}×</strong></div>`
  ).join("");
}
function renderJokers() {
  $("joker-slots").textContent = `${state.jokers.length} / 5`;
  const active = $("active-jokers");
  active.innerHTML = state.jokers.length ? state.jokers.map((joker, index) => {
    const hoverText = joker.id === "spellbound"
      ? `${joker.description}（現在の効果：倍率 +${state.spellsUsed}）`
      : joker.description;
    return `<div class="joker-chip" data-joker-index="${index}" title="${hoverText}"><strong>${joker.name}</strong><small>${joker.description}</small></div>`;
  }).join("") : '<span class="muted">まだ持っていません。ショップで手に入れよう。</span>';
}
function renderSpells() {
  const container = $("spell-inventory");
  if (!state.spells.length) {
    container.innerHTML = '<span class="muted">スペルカードはありません。ショップで購入できます。</span>';
    return;
  }
  container.innerHTML = state.spells.map((spell, index) => {
    const disabled = state.finished || state.animating || state.selected.size < 2 || (spell.id === "clone" && state.selected.size !== 2);
    return `<button class="spell-chip" data-spell-index="${index}" ${disabled ? "disabled" : ""}><strong>${spell.name}</strong><small>${spell.description}</small></button>`;
  }).join("");
  container.querySelectorAll("[data-spell-index]").forEach((button) => {
    button.addEventListener("click", () => useSpell(Number(button.dataset.spellIndex)));
  });
}
function renderHistory() {
  const history = $("play-history");
  if (!state.history.length) {
    history.innerHTML = '<span class="muted">カードを出すと記録が表示されます。</span>';
    return;
  }
  history.innerHTML = state.history.map((entry) =>
    `<div class="history-entry">${entry.role} · 基礎 ${entry.base} × ${entry.multiplier} = <strong>+${entry.points}</strong></div>`
  ).join("");
}
function classify(cards) {
  const ranks = cards.map((card) => card.rank).sort((a, b) => a - b);
  const counts = new Map();
  ranks.forEach((rank) => counts.set(rank, (counts.get(rank) || 0) + 1));
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = cards.length === 5 && cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(ranks)];
  const straight = cards.length === 5 && unique.length === 5 &&
    (unique[4] - unique[0] === 4 || unique.join(",") === "2,3,4,5,14");
  const royal = straight && unique.join(",") === "10,11,12,13,14";
  if (flush && royal) return "RoyalStraightFlush";
  if (groups[0] === 5) return "FiveCard";
  if (groups[0] === 4) return "FourCard";
  if (groups[0] === 3 && groups[1] === 2) return "FullHouse";
  if (flush) return "Flush";
  if (straight) return "Straight";
  if (groups[0] === 3) return "ThreeCard";
  if (groups[0] === 2 && groups[1] === 2) return "TwoPair";
  if (groups[0] === 2) return "Pair";
  return "HighCard";
}
function calculateJokerEffects(role, cards, startingMultiplier = state.multipliers[role]) {
  let multiplier = startingMultiplier;
  const distinctSuits = new Set(cards.map((card) => card.suit)).size;
  const effects = [];
  for (const [index, joker] of state.jokers.entries()) {
    const before = multiplier;
    if (joker.id === "void") multiplier *= Math.max(1, 5 - (state.jokers.length - 1));
    if (joker.id === "greed") multiplier += Math.floor(state.coins / 5);
    if (joker.id === "darkness" && distinctSuits === cards.length) multiplier += 8;
    if (joker.id === "echo") multiplier += state.playsLeft;
    if (joker.id === "spellbound") multiplier += state.spellsUsed;
    if (joker.id === "collector") multiplier += distinctSuits * 2;
    if (joker.id === "arsenal" && cards.length === 5) multiplier += 10;
    if (joker.id === "ace" && cards.some((card) => card.rank === 14)) multiplier += 8;
    if (joker.id === "fortune") multiplier += Math.floor(state.score / 100);
    if (joker.id === "mirror" && ["RoyalStraightFlush", "Flush", "Straight"].includes(role)) multiplier *= 2;
    if (joker.id === "ashes") multiplier += state.rerollsLeft * 4;
    if (joker.id === "crown" && cards.some((card) => card.rank >= 13)) multiplier += 6;
    if (joker.id === "pairs" && ["Pair", "TwoPair", "ThreeCard", "FullHouse", "FourCard", "FiveCard"].includes(role)) multiplier += 5;
    if (joker.id === "drought" && state.rerollsLeft === 0) multiplier += 12;
    if (joker.id === "frenzy" && cards.length === 2) multiplier += 25;
    if (joker.id === "anchor" && ["RoyalStraightFlush", "Flush", "Straight"].includes(role)) multiplier += 7;
    if (joker.id === "lastlight" && state.playsLeft === 1) multiplier += 10;
    if (multiplier !== before) {
      const label = joker.id === "void"
        ? `×${Math.max(1, 5 - (state.jokers.length - 1))}`
        : joker.id === "mirror" ? "×2" : `+${multiplier - before}×`;
      effects.push({ index, label, multiplier });
    }
  }
  return effects;
}
function calculateMultiplier(role, cards) {
  const startingMultiplier = state.multipliers[role] + cards.filter((card) => card.special === "multiplier").length * 2;
  const effects = calculateJokerEffects(role, cards, startingMultiplier);
  const multiplier = effects.length ? effects[effects.length - 1].multiplier : startingMultiplier;
  return Math.max(1, Math.floor(multiplier));
}
async function playSelected() {
  if (state.finished || state.animating || state.selected.size < 2 || state.selected.size > 5) return;
  const indices = [...state.selected].sort((a, b) => b - a);
  const cards = indices.map((index) => state.hand[index]);
  const role = classify(cards);
  const roleInfo = ROLE_ORDER.find(([id]) => id === role);
  const base = cards.reduce((sum, card) => sum + card.rank, 0);
  const multiplier = calculateMultiplier(role, cards);
  const points = base * multiplier;
  const purpleRewards = grantPurpleRewards(cards);
  state.animating = true;
  renderAll();
  await showPlayAnimation(cards, roleInfo[1], base, multiplier, points, purpleRewards);
  state.score += points;
  state.playsLeft--;
  state.history.push({ role: roleInfo[1], base, multiplier, points });
  for (const index of indices) state.hand.splice(index, 1);
  state.selected.clear();
  drawToTen();
  state.animating = false;
  setStatus(`${roleInfo[1]}！ 基礎 ${base} × ${multiplier} = ${points}点を獲得。`);
  renderAll();
  if (state.score >= state.target) finishGame(true);
  else if (state.playsLeft <= 0) finishGame(false);
}
function grantPurpleRewards(cards) {
  const rewards = [];
  cards.filter((card) => card.special === "purple").forEach(() => {
    const spell = SPELLS[Math.floor(Math.random() * SPELLS.length)];
    state.spells.push({ ...spell });
    rewards.push(spell);
  });
  return rewards;
}
function animationDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function showPlayAnimation(cards, roleNameText, base, multiplier, points, purpleRewards) {
  const result = $("play-animation-result");
  const detail = $("animation-detail");
  const score = $("animation-score");
  const role = ROLE_ORDER.find(([, name]) => name === roleNameText)?.[0];
  const roleMultiplier = state.multipliers[role];
  let currentMultiplier = roleMultiplier;
  state.animationSkip = false;
  result.classList.remove("hidden");
  $("skip-animation-button").classList.remove("hidden");
  detail.textContent = `${roleNameText} · 役倍率 ${roleMultiplier}×`;
  score.textContent = "";
  setScoreMultiplier(roleMultiplier);
  const pause = async (milliseconds = 2300) => {
    if (!state.animationSkip) await animationDelay(milliseconds);
  };

  for (const card of cards) {
    if (state.animationSkip) break;
    if (card.special !== "multiplier" && card.special !== "purple") continue;
    const button = [...$("hand").children].find((item) => item.dataset.cardId === card.id);
    if (!button) continue;
    const labelText = card.special === "multiplier" ? "+2×" : `+${purpleRewards.shift()?.name || "スペル"}`;
    detail.textContent = `${SUIT_LABELS[card.suit]}の${rankName(card.rank)} · ${specialName(card.special)}`;
    button.classList.add("is-revealing");
    const label = document.createElement("span");
    label.className = `card-float-label float-${card.special}`;
    label.textContent = labelText;
    button.append(label);
    if (card.special === "multiplier") {
      currentMultiplier += 2;
      setScoreMultiplier(currentMultiplier, "+2");
    }
    await pause();
    button.classList.remove("is-revealing");
    button.querySelector(".card-float-label")?.remove();
  }

  const jokerEffects = calculateJokerEffects(role, cards, roleMultiplier + cards.filter((card) => card.special === "multiplier").length * 2);
  for (const effect of jokerEffects) {
    if (state.animationSkip) break;
    const joker = state.jokers[effect.index];
    const chip = document.querySelector(`[data-joker-index="${effect.index}"]`);
    if (!chip) continue;
    detail.textContent = `${joker.name} · 効果を適用中`;
    const label = document.createElement("span");
    label.className = "joker-float-label float-multiplier";
    label.textContent = effect.label;
    chip.append(label);
    chip.classList.add("is-activating");
    currentMultiplier = effect.multiplier;
    setScoreMultiplier(currentMultiplier, effect.label);
    await pause();
    chip.classList.remove("is-activating");
    label.remove();
  }

  setScoreMultiplier(multiplier);
  detail.textContent = `${roleNameText} · 基礎点 ${base} × 倍率 ${multiplier}`;
  score.textContent = `+${points} 点　／　合計 ${state.score + points} 点`;
  if (!state.animationSkip) await animationDelay(900);
  result.classList.add("hidden");
  $("skip-animation-button").classList.add("hidden");
}

function rerollSelected() {
  if (state.finished || state.animating || state.rerollsLeft <= 0 || state.selected.size === 0) return;
  const indices = [...state.selected].sort((a, b) => b - a);
  const discarded = indices.map((index) => state.hand[index]);
  const rewards = grantPurpleRewards(discarded);
  for (const index of indices) state.deck.push(state.hand.splice(index, 1)[0]);
  shuffle(state.deck);
  state.rerollsLeft--;
  state.selected.clear();
  drawToTen();
  setStatus(`選んだ${indices.length}枚をリロールしました。${rewards.length ? ` 紫シールから${rewards.map((spell) => spell.name).join("・")}を獲得。` : ""}`);
  renderAll();
}
function useSpell(index) {
  if (state.finished || state.animating || state.selected.size < 2 || !state.spells[index]) return;
  const spell = state.spells[index];
  if (spell.id === "clone" && state.selected.size !== 2) {
    showToast("複写はカードをちょうど2枚選んでください。");
    return;
  }
  const cards = [...state.selected].sort((a, b) => a - b).map((cardIndex) => state.hand[cardIndex]);
  let effectSpell = spell;
  if (spell.id === "fool") {
    effectSpell = [...state.spellHistory].reverse().find((item) => item.id !== "fool");
    if (!effectSpell) {
      showToast("まねできるスペルがまだありません。");
      return;
    }
  }
  applySpell(effectSpell, cards);
  cards.forEach((card) => {
    const masterCard = state.masterDeck.find((item) => item.id === card.id);
    if (masterCard) Object.assign(masterCard, { suit: card.suit, rank: card.rank, special: card.special });
  });
  state.spells.splice(index, 1);
  state.spellHistory.push(spell);
  state.spellsUsed++;
  sortHand(true);
  setStatus(`${spell.name}を使用しました。カードを確認してプレイしてください。`);
  renderAll();
}
function applySpell(spell, cards) {
  const suitEffects = { sun: "d", heart: "h", clover: "c", spade: "s" };
  if (suitEffects[spell.id]) {
    cards.slice(0, 2).forEach((card) => { card.suit = suitEffects[spell.id]; });
  } else if (spell.id === "moon") {
    cards.forEach((card) => { card.rank = Math.min(14, card.rank + 2); });
  } else if (spell.id === "star") {
    cards.forEach((card) => { card.rank = Math.min(14, card.rank + 1); });
  } else if (spell.id === "mirror") {
    cards.forEach((card, index) => { card.suit = SUITS[(SUITS.indexOf(card.suit) + index + 1) % SUITS.length]; });
  } else if (spell.id === "wild") {
    cards.forEach((card) => { card.suit = SUITS[Math.floor(Math.random() * SUITS.length)]; });
  } else if (spell.id === "exchange" && cards.length >= 2) {
    [cards[0].suit, cards[1].suit] = [cards[1].suit, cards[0].suit];
  } else if (spell.id === "cycle") {
    cards.forEach((card, index) => { card.suit = SUITS[(SUITS.indexOf(card.suit) - index - 1 + SUITS.length) % SUITS.length]; });
  } else if (spell.id === "clone" && cards.length === 2) {
    Object.assign(cards[1], { suit: cards[0].suit, rank: cards[0].rank, special: cards[0].special });
  } else if (spell.id === "flush") {
    cards.forEach((card) => { card.suit = cards[0].suit; });
  } else {
    const specialEffects = {
      "multiplier-seal": "multiplier",
      "gold-seal": "gold",
      "purple-seal": "purple",
    };
    if (specialEffects[spell.id]) {
      cards.slice(0, 2).forEach((card) => { card.special = specialEffects[spell.id]; });
    }
  }
}
function randomInt(max) {
  return Math.floor(Math.random() * (max + 1));
}
function pickOffers(items, maxCount) {
  return shuffle([...items]).slice(0, randomInt(maxCount));
}
function cookieValue(name) {
  const item = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}
function writeCookie(name, value) {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Lax`;
}
function saveGame() {
  const saves = JSON.parse(cookieValue("poker_save_index") || "[]");
  const id = Date.now().toString();
  const defaultMultipliers = Object.fromEntries(ROLE_ORDER.map(([role, , value]) => [role, value]));
  const changedDeck = state.masterDeck.flatMap((card, index) => {
    const originalSuit = SUITS[Math.floor(index / 13)];
    const originalRank = (index % 13) + 2;
    return card.suit !== originalSuit || card.rank !== originalRank || card.special
      ? [[card.id, SUITS.indexOf(card.suit), card.rank, card.special]] : [];
  });
  const save = {
    id,
    time: new Date().toLocaleString("ja-JP"),
    coins: state.coins,
    clears: state.clears,
    gameNumber: state.gameNumber,
    difficulty: state.difficulty,
    spellsUsed: state.spellsUsed,
    deck: changedDeck,
    multipliers: Object.entries(state.multipliers).filter(([role, value]) => value !== defaultMultipliers[role]),
    jokers: state.jokers.map((joker) => joker.id),
    spells: state.spells.map((spell) => spell.id),
  };
  writeCookie(`poker_save_${id}`, JSON.stringify(save));
  saves.unshift(id);
  while (saves.length > 5) {
    const removed = saves.pop();
    document.cookie = `poker_save_${removed}=; max-age=0; path=/; SameSite=Lax`;
  }
  writeCookie("poker_save_index", JSON.stringify(saves));
}
function refreshSaveOptions() {
  const select = $("save-select");
  const saves = JSON.parse(cookieValue("poker_save_index") || "[]");
  select.replaceChildren();
  if (!saves.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "セーブデータがありません";
    select.append(option);
    $("load-save-button").disabled = true;
    return;
  }
  saves.forEach((id, index) => {
    try {
      const save = JSON.parse(cookieValue(`poker_save_${id}`));
      if (!save) return;
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${save.time || "セーブ"} · ${save.clears}勝`;
      select.append(option);
    } catch (_) { /* Ignore invalid or expired save entries. */ }
  });
  $("load-save-button").disabled = select.options.length === 0;
}
function loadGame() {
  const id = $("save-select").value;
  if (!id) return;
  try {
    const save = JSON.parse(cookieValue(`poker_save_${id}`));
    if (!save) throw new Error("missing save");
    state.coins = save.coins;
    state.clears = save.clears;
    state.gameNumber = save.gameNumber;
    state.difficulty = save.difficulty;
    state.spellsUsed = Math.max(0, Number(save.spellsUsed) || 0);
    state.masterDeck = makeDeck();
    (save.deck || []).forEach(([cardId, suitIndex, rank, special]) => {
      const card = state.masterDeck.find((item) => item.id === cardId);
      if (card) Object.assign(card, { suit: SUITS[suitIndex], rank, special: special || null });
    });
    state.multipliers = Object.fromEntries(ROLE_ORDER.map(([role, , value]) => [role, value]));
    (save.multipliers || []).forEach(([role, value]) => { state.multipliers[role] = value; });
    state.jokers = (save.jokers || []).map((jokerId) => JOKERS.find((joker) => joker.id === jokerId)).filter(Boolean);
    state.spells = (save.spells || []).map((spellId) => SPELLS.find((spell) => spell.id === spellId)).filter(Boolean);
    state.finished = false;
    $("difficulty-select").value = state.difficulty;
    $("save-message").textContent = "セーブデータをロードしました。";
    $("coin-count").textContent = state.coins;
    showScreen("title-screen");
  } catch (_) {
    $("save-message").textContent = "セーブデータを読み込めませんでした。";
  }
}
function finishGame(won) {
  if (state.finished) return;
  state.finished = true;
  const goldBonus = state.hand.filter((card) => card.special === "gold").length * 3;
  state.coins += goldBonus;
  $("game-screen").classList.add("hidden");
  if (!won) {
    $("gameover-summary").textContent = `最終スコア ${state.score} / 目標 ${state.target} · 今回は未達成です。${goldBonus ? ` 黄金カード報酬 +${goldBonus}コイン。` : ""}`;
    $("coin-count").textContent = state.coins;
    $("gameover-screen").classList.remove("hidden");
    return;
  }
  state.coins += 7;
  state.clears++;
  saveGame();
  state.shopOffer = {
    jokers: pickOffers(JOKERS, 3),
    spells: pickOffers(SPELLS, 5),
    upgrades: pickOffers(ROLE_ORDER.filter(([id]) => id !== "HighCard"), 2),
  };
  $("shop-screen").classList.remove("hidden");
  $("shop-title").textContent = "ゲームクリア！";
  $("shop-summary").textContent = `最終スコア ${state.score} / ${state.target} · 7コイン${goldBonus ? ` + 黄金カード報酬 ${goldBonus}コイン` : ""}を獲得しました。次の目標は${TARGET_SCORE + state.clears * 150}点です。`;
  renderShop();
  $("coin-count").textContent = state.coins;
}
function renderDeckViewer() {
  $("deck-view").innerHTML = SUITS.map((suit) => {
    const cards = state.masterDeck.filter((card) => card.suit === suit).sort((a, b) => a.rank - b.rank);
    return `<div class="deck-suit-group"><h4>${SUIT_NAMES[suit]} ${SUIT_LABELS[suit]}</h4><div class="deck-card-list">${cards.map((card) =>
      `<div class="deck-card" title="${SUIT_LABELS[card.suit]}の${rankName(card.rank)}"><img src="${cardPath(card)}" alt="${SUIT_LABELS[card.suit]}の${rankName(card.rank)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span>${SUIT_NAMES[card.suit]}${rankName(card.rank)}</span></div>`
    ).join("")}</div></div>`;
  }).join("");
}
function renderShop() {
  const owned = $("owned-jokers");
  owned.innerHTML = state.jokers.length ? state.jokers.map((joker, index) =>
    `<div class="shop-card owned-joker"><div><h4>${joker.name}</h4><p>${joker.description}</p></div><div class="shop-buy-row"><span class="shop-price">売却 +1 ◆</span><button class="button button-small sell-button" data-sell-index="${index}">売却</button></div></div>`
  ).join("") : '<p class="muted">所持ジョーカーはありません。</p>';
  owned.querySelectorAll("[data-sell-index]").forEach((button) => button.addEventListener("click", () => sellJoker(Number(button.dataset.sellIndex))));

  $("joker-shop").innerHTML = state.shopOffer.jokers.length ? state.shopOffer.jokers.map((joker) => {
    const disabled = state.jokers.length >= 5 || state.coins < joker.price;
    return `<article class="shop-card"><div><h4>${joker.name}</h4><p>${joker.description}</p></div><div class="shop-buy-row"><span class="shop-price">${joker.price} ◆</span><button class="button button-primary button-small" data-buy-joker="${joker.id}" ${disabled ? "disabled" : ""}>購入</button></div></article>`;
  }).join("") : '<p class="muted">今回はジョーカーの入荷がありません。</p>';
  $("joker-shop").querySelectorAll("[data-buy-joker]").forEach((button) => button.addEventListener("click", () => buyJoker(button.dataset.buyJoker)));

  $("upgrade-shop").innerHTML = state.shopOffer.upgrades.length ? state.shopOffer.upgrades.map(([id, name]) => {
    const price = upgradePrice(id);
    return `<div class="upgrade-item"><div>${name}<strong>${state.multipliers[id]}×</strong></div><button class="button button-primary button-small" data-upgrade="${id}" ${state.coins < price ? "disabled" : ""}>${price} ◆</button></div>`;
  }).join("") : '<p class="muted">今回は役強化の入荷がありません。</p>';
  $("upgrade-shop").querySelectorAll("[data-upgrade]").forEach((button) => button.addEventListener("click", () => buyUpgrade(button.dataset.upgrade)));

  $("spell-shop").innerHTML = state.shopOffer.spells.length ? state.shopOffer.spells.map((spell) =>
    `<article class="shop-card"><div><h4>${spell.name}</h4><p>${spell.description}</p></div><div class="shop-buy-row"><span class="shop-price">${spell.price} ◆</span><button class="button button-primary button-small" data-buy-spell="${spell.id}" ${state.coins < spell.price ? "disabled" : ""}>購入</button></div></article>`
  ).join("") : '<p class="muted">今回はスペルの入荷がありません。</p>';
  $("spell-shop").querySelectorAll("[data-buy-spell]").forEach((button) => button.addEventListener("click", () => buySpell(button.dataset.buySpell)));
  renderDeckViewer();
  $("coin-count").textContent = state.coins;
}
function upgradePrice(role) {
  const base = ROLE_ORDER.find(([id]) => id === role)[2];
  return 4 + Math.floor((state.multipliers[role] - base) / 2);
}
function buyJoker(id) {
  const offerIndex = state.shopOffer.jokers.findIndex((joker) => joker.id === id);
  const offer = state.shopOffer.jokers[offerIndex];
  if (!offer || state.coins < offer.price || state.jokers.length >= 5) return;
  state.coins -= offer.price;
  state.jokers.push({ ...offer });
  state.shopOffer.jokers.splice(offerIndex, 1);
  showToast(`${offer.name}を手に入れた。`);
  renderShop();
}
function sellJoker(index) {
  if (!state.jokers[index]) return;
  const [joker] = state.jokers.splice(index, 1);
  state.coins++;
  showToast(`${joker.name}を売却しました。`);
  renderShop();
}
function buyUpgrade(id) {
  const offerIndex = state.shopOffer.upgrades.findIndex(([role]) => role === id);
  const price = upgradePrice(id);
  if (offerIndex < 0 || !state.multipliers[id] || state.coins < price) return;
  state.coins -= price;
  state.multipliers[id] += 2;
  state.shopOffer.upgrades.splice(offerIndex, 1);
  showToast(`${ROLE_ORDER.find(([role]) => role === id)[1]}を強化しました。`);
  renderShop();
}
function buySpell(id) {
  const offerIndex = state.shopOffer.spells.findIndex((spell) => spell.id === id);
  const offer = state.shopOffer.spells[offerIndex];
  if (!offer || state.coins < offer.price) return;
  state.coins -= offer.price;
  state.spells.push({ ...offer });
  state.shopOffer.spells.splice(offerIndex, 1);
  showToast(`${offer.name}を購入しました。`);
  renderShop();
}

$("play-button").addEventListener("click", playSelected);
$("reroll-button").addEventListener("click", rerollSelected);
$("skip-animation-button").addEventListener("click", () => { state.animationSkip = true; });
$("start-game-button").addEventListener("click", startGame);
$("open-settings-button").addEventListener("click", () => {
  $("difficulty-select").value = state.difficulty;
  $("save-message").textContent = "";
  refreshSaveOptions();
  showScreen("settings-screen");
});
$("difficulty-select").addEventListener("change", (event) => {
  state.difficulty = event.target.value;
});
$("load-save-button").addEventListener("click", loadGame);
$("card-folder-button").addEventListener("click", chooseCardFolder);
$("settings-back-button").addEventListener("click", () => showScreen("title-screen"));
$("gameover-title-button").addEventListener("click", () => showScreen("title-screen"));
$("next-game-button").addEventListener("click", () => {
  state.gameNumber++;
  startGame();
});
$("coin-count").textContent = state.coins;
$("difficulty-select").value = state.difficulty;
showScreen("title-screen");
refreshSaveOptions();
