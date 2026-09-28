const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A","2"];
const VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index]));
const RED_SUITS = new Set(["♥", "♦"]);
const $ = (selector) => document.querySelector(selector);
let state = null;

function makeDeck() {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: `${suit}${rank}`, suit, rank })));
  return deck.concat([{ id: "joker-1", suit: "", rank: "Joker", joker: true }, { id: "joker-2", suit: "", rank: "Joker", joker: true }]);
}
function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
function playerName(index) { return index === 0 ? "あなた" : `CPU ${index}`; }
function createGame(count) {
  const deck = shuffle(makeDeck());
  const players = Array.from({ length: count }, (_, index) => ({ id: index, name: playerName(index), human: index === 0, hand: [] }));
  deck.forEach((card, index) => players[index % count].hand.push(card));
  players.forEach((player) => player.hand.sort(cardSort));
  return { players, current: 0, field: null, revolution: false, passCount: 0, lastPlayer: null, selected: new Set(), logs: [], pending: null, finished: false };
}
function cardSort(a, b) { return (VALUE[a.rank] ?? 99) - (VALUE[b.rank] ?? 99) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit); }
function activePlayers() { return state.players.filter((player) => player.hand.length); }
function nextPlayer(from = state.current) {
  for (let offset = 1; offset <= state.players.length; offset++) {
    const player = state.players[(from + offset) % state.players.length];
    if (player.hand.length) return player.id;
  }
  return from;
}
function strength(rank) {
  if (rank === "Joker") return 14;
  const normal = VALUE[rank];
  return state.revolution ? 12 - normal : normal;
}
function selectedCards(player = state.players[0]) { return player.hand.filter((card) => state.selected.has(card.id)); }
function naturalRank(cards) { return cards.find((card) => !card.joker)?.rank ?? null; }
function effectiveRank(cards) { return naturalRank(cards) ?? state.pending?.jokerRank ?? "A"; }
function specialEightCount(cards) {
  const rank = effectiveRank(cards);
  if (["3", "6", "9"].includes(rank) && cards.length >= 2) return Math.ceil(cards.length / 2);
  if (rank === "8") return cards.length;
  return 0;
}
function isFourBlock(cards) { return effectiveRank(cards) === "4" && cards.length >= 2; }
function isRevolution(cards) {
  if (cards.length !== 4) return false;
  const natural = cards.filter((card) => !card.joker);
  if (new Set(natural.map((card) => card.rank)).size === 1) return true;
  const sorted = natural.slice().sort((a, b) => VALUE[a.rank] - VALUE[b.rank]);
  return natural.length === 4 && new Set(natural.map((card) => card.suit)).size === 1 && sorted.every((card, index) => !index || VALUE[card.rank] === VALUE[sorted[index - 1].rank] + 1);
}
function isStaircase(cards) {
  if (cards.length < 2 || cards.some((card) => card.joker)) return false;
  const suits = new Set(cards.map((card) => card.suit));
  const values = cards.map((card) => VALUE[card.rank]).sort((a, b) => a - b);
  return suits.size === 1 && values.every((value, index) => !index || value === values[index - 1] + 1);
}
function staircaseStart(cards) {
  return Math.min(...cards.map((card) => VALUE[card.rank]));
}
function canPlay(cards, field = state.field) {
  if (!cards.length) return { ok: false, reason: "カードを選んでください。" };
  const rank = effectiveRank(cards);
  if (!field) {
    if (!isStaircase(cards) && new Set(cards.filter((card) => !card.joker).map((card) => card.rank)).size > 1) return { ok: false, reason: "同じ数字か、同じ柄の階段を選んでください。" };
    return { ok: true };
  }
  const previousRank = field.rank;
  const eightPower = specialEightCount(field.cards);
  if (eightPower && isFourBlock(cards) && cards.length === eightPower * 2) return { ok: true };
  if (field.cards.length !== cards.length) return { ok: false, reason: `場と同じ${field.cards.length}枚を出してください。` };
  const fieldIsStaircase = isStaircase(field.cards);
  if (fieldIsStaircase) {
    if (!isStaircase(cards) || staircaseStart(cards) !== staircaseStart(field.cards) + field.cards.length) {
      return { ok: false, reason: `階段の次は${RANKS[staircaseStart(field.cards) + field.cards.length]}から出してください。` };
    }
    return { ok: true };
  }
  if (previousRank === "Joker" && rank === "2" && cards.some((card) => card.suit === "♠")) return { ok: cards.length === 1, reason: "スペードの2でJokerを返せます。" };
  if (rank === "Joker") return { ok: false, reason: "Jokerの上にはスペードの2以外を出せません。" };
  if (previousRank === "Joker") return { ok: false, reason: "Jokerにはスペードの2だけを重ねられます。" };
  if (cards.every((card) => card.joker)) return { ok: true };
  if (state.pending?.threshold) {
    const value = VALUE[rank], threshold = VALUE[state.pending.threshold.rank];
    if (state.pending.threshold.direction === "under" ? value > threshold : value < threshold) return { ok: false, reason: "Jの指定に合わない強さです。" };
  }
  return strength(rank) > strength(previousRank) ? { ok: true } : { ok: false, reason: "場より強いカードを出してください。" };
}
function log(message) { state.logs.unshift(message); render(); }
function removeCards(player, cards) { const ids = new Set(cards.map((card) => card.id)); player.hand = player.hand.filter((card) => !ids.has(card.id)); }
function clearField() { state.field = null; state.passCount = 0; state.current = state.lastPlayer ?? state.current; }
function advance() { state.current = nextPlayer(state.current); render(); if (!state.finished && !state.players[state.current].human) window.setTimeout(cpuTurn, 500); }
function playCards(player, cards, options = {}) {
  const rank = effectiveRank(cards);
  removeCards(player, cards);
  state.lastPlayer = player.id;
  state.field = { cards: cards.slice(), rank, playerId: player.id };
  state.passCount = 0;
  state.pending = null;
  if (isRevolution(cards)) { state.revolution = !state.revolution; log(`${player.name}の革命！ 強さが反転しました。`); }
  else log(`${player.name}が ${cards.map(cardLabel).join(" ")} を出しました。`);
  const clearedByEffect = ["5"].includes(rank) || specialEightCount(cards) > 0;
  if (clearedByEffect) { log(rank === "5" ? "5効果で場が流れます。" : "8切りで場が流れます。"); clearField(); }
  if (player.hand.length === 0) { state.finished = true; log(`${player.name}の勝利！`); render(); return; }
  if (rank === "7" && !options.skipEffect) state.pending = { type: "give", count: cards.length, from: player.id };
  if (rank === "10" && !options.skipEffect) state.pending = { type: "discard", count: cards.length, from: player.id };
  if (rank === "J" && !options.skipEffect) state.pending = { type: "threshold", from: player.id };
  if (rank === "Q" && !options.skipEffect) state.pending = { type: "q", from: player.id };
  if (state.pending) { render(); if (!player.human) resolveCpuEffect(player); return; }
  if (clearedByEffect) { render(); if (!state.players[state.current].human) window.setTimeout(cpuTurn, 500); return; }
  advance();
}
function pass(player) {
  if (!state.field) return log("場が空のときはパスできません。");
  state.passCount++;
  log(`${player.name}はパス。`);
  if (state.passCount >= activePlayers().length) {
    clearField();
    log("最後に出した人もパスしたため場が流れました。最後に出した人から再開します。");
    render();
    if (!state.players[state.current].human) window.setTimeout(cpuTurn, 500);
    return;
  }
  advance();
}
function cardLabel(card) { return card.joker ? "Joker" : `${card.suit}${card.rank}`; }
function renderCard(card, selected = false, clickable = false) {
  const element = document.createElement("button");
  element.className = `card${RED_SUITS.has(card.suit) ? " red" : ""}${card.joker ? " joker" : ""}${selected ? " selected" : ""}`;
  element.type = "button";
  element.innerHTML = `<span class="rank">${card.joker ? "★" : card.rank}</span><span class="suit">${card.joker ? "JOKER" : card.suit}</span>`;
  if (clickable) element.addEventListener("click", () => { state.selected.has(card.id) ? state.selected.delete(card.id) : state.selected.add(card.id); render(); });
  return element;
}
function render() {
  if (!state) return;
  $("#setup").hidden = true; $("#game").hidden = false;
  $("#round-info").textContent = `${state.revolution ? "革命中" : "通常"} / ${state.players.length}人`;
  $("#notice").textContent = state.finished ? "ゲーム終了。新しいゲームで再戦できます。" : state.pending?.type === "give" ? "7の効果：渡すカードと相手を選んでください。" : state.pending?.type === "discard" ? "10の効果：捨てるカードを選んでください。" : `${state.players[state.current].name}のターン`;
  const table = $("#table"); table.replaceChildren();
  state.players.forEach((player) => { const seat = document.createElement("article"); seat.className = `seat${player.id === state.current ? " active" : ""}${player.human ? " human" : ""}`; seat.innerHTML = `<div class="seat-name"><span>${player.name}</span><span class="badge">${player.human ? "YOU" : "CPU"}</span></div><div class="seat-meta">${player.hand.length ? `${player.hand.length}枚` : "上がり"}</div>`; table.append(seat); });
  const field = $("#field-cards"); field.replaceChildren(); if (state.field?.cards.length) state.field.cards.forEach((card) => field.append(renderCard(card))); else field.innerHTML = '<span class="empty">場は空です</span>';
  $("#field-rule").textContent = state.field ? `${state.field.cards.length}枚 / ${state.field.rank}` : "次は何枚でも出せます";
  const hand = $("#hand"); hand.replaceChildren(); state.players[0].hand.forEach((card) => hand.append(renderCard(card, state.selected.has(card.id), state.players[0].id === state.current && !state.finished)));
  $("#selection-count").textContent = `${state.selected.size}枚選択`;
  $("#play").disabled = state.finished || state.players[state.current].id !== 0 || (Boolean(state.pending) && state.pending.from !== 0);
  $("#pass").disabled = state.finished || state.players[state.current].id !== 0 || !state.field || Boolean(state.pending);
  renderEffects(); $("#log").innerHTML = state.logs.map((message) => `<li${message.includes("勝利") ? ' class="winner"' : ""}>${message}</li>`).join("");
}
function renderEffects() {
  const root = $("#effect-controls"); root.replaceChildren();
  if (!state.pending || state.pending.from !== 0) return;
  if (state.pending.type === "threshold") {
    root.innerHTML = '<label>Jの指定 <select id="threshold-direction"><option value="over">以上</option><option value="under">以下</option></select> <select id="threshold-rank"></select></label>';
    $("#threshold-rank").innerHTML = RANKS.map((rank) => `<option>${rank}</option>`).join("");
  } else if (state.pending.type === "give") {
    root.innerHTML = '<label>渡す相手 <select id="give-target"></select></label>';
    $("#give-target").innerHTML = state.players.filter((player) => player.id !== 0 && player.hand.length).map((player) => `<option value="${player.id}">${player.name}</option>`).join("");
  } else if (state.pending.type === "joker") {
    root.innerHTML = '<label>Jokerの効果 <select id="joker-rank"></select></label>';
    $("#joker-rank").innerHTML = RANKS.map((rank) => `<option>${rank}</option>`).join("");
  } else if (state.pending.type === "q") {
    root.innerHTML = '<label>全員が捨てる数字 <select id="q-rank"></select></label>';
    $("#q-rank").innerHTML = RANKS.map((rank) => `<option>${rank}</option>`).join("");
  }
}
function commitHumanPlay() {
  const player = state.players[0], cards = selectedCards(player);
  const check = canPlay(cards);
  if (!check.ok) { $("#notice").textContent = check.reason; return; }
  if (cards.some((card) => card.joker) && !naturalRank(cards)) { state.pending = { type: "joker", from: 0 }; render(); return; }
  playCards(player, cards);
  state.selected.clear(); render();
}
function resolveHumanPending() {
  const player = state.players[0], pending = state.pending, cards = selectedCards(player);
  if (pending.type === "threshold") { pending.threshold = { direction: $("#threshold-direction").value, rank: $("#threshold-rank").value }; state.pending = null; log(`Jの効果：${pending.threshold.rank}${pending.threshold.direction === "under" ? "以下" : "以上"}を指定。`); advance(); }
  else if (pending.type === "give") { const target = state.players[Number($("#give-target").value)]; if (cards.length !== pending.count) return ($("#notice").textContent = `${pending.count}枚選んでください。`); removeCards(player, cards); target.hand.push(...cards); state.pending = null; log(`${target.name}へ${cards.length}枚渡しました。`); state.selected.clear(); advance(); }
  else if (pending.type === "discard") { if (cards.length !== pending.count) return ($("#notice").textContent = `${pending.count}枚選んでください。`); removeCards(player, cards); state.pending = null; log(`${cards.length}枚捨てました。`); state.selected.clear(); advance(); }
  else if (pending.type === "joker") { pending.jokerRank = $("#joker-rank").value; playCards(player, cards); state.selected.clear(); }
  else if (pending.type === "q") { const rank = $("#q-rank").value; state.players.forEach((target) => { target.hand = target.hand.filter((card) => card.rank !== rank); }); state.pending = null; log(`Qの効果：全員が${rank}を捨てました。`); advance(); }
}
function resolveCpuEffect(player) {
  const pending = state.pending;
  if (!pending || pending.from !== player.id) return;
  if (pending.type === "give") { const target = state.players.filter((candidate) => candidate.id !== player.id && candidate.hand.length).sort((a, b) => b.hand.length - a.hand.length)[0]; const cards = player.hand.slice(-pending.count); removeCards(player, cards); target.hand.push(...cards); log(`${player.name}が${target.name}へ${cards.length}枚渡しました。`); state.pending = null; advance(); }
  else if (pending.type === "discard") { const cards = player.hand.slice(0, pending.count); removeCards(player, cards); log(`${player.name}が${cards.length}枚捨てました。`); state.pending = null; advance(); }
  else if (pending.type === "threshold") { pending.threshold = { direction: "over", rank: "J" }; log(`${player.name}がJでQ以上を指定。`); state.pending = null; advance(); }
  else if (pending.type === "q") { const rank = RANKS.slice().sort((a, b) => player.hand.filter((card) => card.rank === b).length - player.hand.filter((card) => card.rank === a).length)[0]; state.players.forEach((target) => { target.hand = target.hand.filter((card) => card.rank !== rank); }); log(`${player.name}のQ効果で全員が${rank}を捨てました。`); state.pending = null; advance(); }
}
function legalMoves(player) {
  const groups = [];
  for (const rank of RANKS) groups.push(player.hand.filter((card) => card.rank === rank));
  const jokers = player.hand.filter((card) => card.joker);
  if (jokers.length) groups.push(jokers);
  for (const suit of SUITS) {
    const suited = player.hand.filter((card) => card.suit === suit).sort((a, b) => VALUE[a.rank] - VALUE[b.rank]);
    for (let start = 0; start < suited.length; start++) {
      for (let length = 2; length <= suited.length - start; length++) {
        const sequence = suited.slice(start, start + length);
        if (isStaircase(sequence)) groups.push(sequence);
      }
    }
  }
  const moves = [];
  groups.forEach((group) => { for (let count = 1; count <= group.length; count++) moves.push(group.slice(0, count)); });
  return moves.filter((cards) => canPlay(cards).ok);
}
function cpuTurn() {
  if (!state || state.finished || state.players[state.current].human || state.pending) return;
  const player = state.players[state.current], moves = legalMoves(player);
  if (!moves.length && state.field) return pass(player);
  const move = (moves.filter((cards) => cards.length === 1).sort((a, b) => strength(effectiveRank(a)) - strength(effectiveRank(b)))[0]) || moves[0];
  playCards(player, move); render();
}
$("#start-game").addEventListener("click", () => {
  state = createGame(Number($("#player-count").value));
  log(`ゲーム開始。${state.players.length}人。あなたが好きな枚数から始めます。`);
  render();
});
$("#new-game").addEventListener("click", () => { $("#game").hidden = true; $("#setup").hidden = false; });
$("#play").addEventListener("click", () => state.pending ? resolveHumanPending() : commitHumanPlay());
$("#pass").addEventListener("click", () => { pass(state.players[0]); state.selected.clear(); });
window.addEventListener("change", (event) => { if (event.target.id === "joker-rank") resolveHumanPending(); });
