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
function createGame(count, difficulty = "normal") {
  const deck = shuffle(makeDeck());
  const players = Array.from({ length: count }, (_, index) => ({ id: index, name: playerName(index), human: index === 0, hand: [] }));
  deck.forEach((card, index) => players[index % count].hand.push(card));
  players.forEach((player) => player.hand.sort(cardSort));
  return { players, current: 0, field: null, revolution: false, passCount: 0, lastPlayer: null, selected: new Set(), logs: [], pending: null, jConstraint: null, suitLock: null, sequenceLock: false, difficulty, finished: false };
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
function cardRank(card) { return card.joker ? card.assignedRank ?? null : card.rank; }
function cardSuit(card) { return card.joker ? card.assignedSuit ?? "" : card.suit; }
function qRank(card) { return card.joker ? "Joker" : card.rank; }
function naturalRank(cards) { return cards.map(cardRank).find(Boolean) ?? null; }
function effectiveRank(cards) { return naturalRank(cards); }
function specialEightCount(cards) {
  const rank = singleRank(cards);
  if (["3", "6", "9"].includes(rank) && cards.length >= 2) return Math.ceil(cards.length / 2);
  if (rank === "8") return cards.length;
  return 0;
}
function isFourBlock(cards) { return singleRank(cards) === "4" && cards.length >= 2; }
function isRevolution(cards) {
  if (cards.length !== 4) return false;
  const ranks = cards.map(cardRank);
  if (ranks.every(Boolean) && new Set(ranks).size === 1) return true;
  const sorted = cards.slice().sort((a, b) => VALUE[cardRank(a)] - VALUE[cardRank(b)]);
  return sorted.every((card, index) => cardRank(card) && cardSuit(card) === cardSuit(sorted[0]) && (!index || VALUE[cardRank(card)] === VALUE[cardRank(sorted[index - 1])] + 1));
}
function isStaircase(cards) {
  if (cards.length < 2 || cards.some((card) => !cardRank(card) || cardRank(card) === "Joker" || !cardSuit(card))) return false;
  const suits = new Set(cards.map(cardSuit));
  const values = cards.map(cardRank).map((rank) => VALUE[rank]).sort((a, b) => a - b);
  return suits.size === 1 && values.every((value, index) => !index || value === values[index - 1] + 1);
}
function staircaseStart(cards) {
  return Math.min(...cards.map((card) => VALUE[cardRank(card)]));
}
function singleRank(cards) {
  const ranks = new Set(cards.map(cardRank).filter(Boolean));
  return ranks.size === 1 ? [...ranks][0] : null;
}
function singleSuit(cards) {
  const suits = new Set(cards.map(cardSuit).filter(Boolean));
  return suits.size === 1 ? [...suits][0] : null;
}
function canPlay(cards, field = state.field) {
  if (!cards.length) return { ok: false, reason: "カードを選んでください。" };
  if (cards.some((card) => card.joker && (!card.assignedRank || !card.assignedSuit))) return { ok: false, reason: "Jokerの数字と柄を指定してください。" };
  const rank = effectiveRank(cards);
  if (!isStaircase(cards) && new Set(cards.map(cardRank)).size > 1) return { ok: false, reason: "同じ数字か、同じ柄の階段を選んでください。" };
  if (!field) {
    return { ok: true };
  }
  const previousRank = field.rank;
  const previousRoleRank = singleRank(field.cards) ?? (field.cards.length === 1 ? effectiveRank(field.cards) : null);
  if (previousRoleRank === "5" || (["3", "6", "9"].includes(previousRoleRank) && field.cards.length >= 2)) return { ok: false, reason: `${previousRoleRank}の効果で場が流れます。` };
  if (state.suitLock && cards.some((card) => cardSuit(card) !== state.suitLock)) return { ok: false, reason: `${state.suitLock}で出してください。` };
  const fieldIsStaircase = isStaircase(field.cards);
  const previousGroupRank = singleRank(field.cards), nextGroupRank = singleRank(cards), direction = state.revolution ? -1 : 1;
  if (state.sequenceLock && !fieldIsStaircase && (!previousGroupRank || !nextGroupRank || VALUE[nextGroupRank] !== VALUE[previousGroupRank] + direction)) return { ok: false, reason: `次は${direction > 0 ? "一つ上" : "一つ下"}の数字を出してください。` };
  if (state.jConstraint && cards.some((card) => {
    const value = cardRank(card) === "Joker" ? 14 : VALUE[cardRank(card)];
    return state.jConstraint.direction === "under" ? value > VALUE.J : value < VALUE.J;
  })) return { ok: false, reason: `Jの指定により、J${state.jConstraint.direction === "under" ? "以下" : "以上"}を出してください。` };
  if (previousRoleRank === "8") {
    const eightPower = field.cards.length <= 2 ? field.cards.length : 0;
    if (eightPower && isFourBlock(cards) && cards.length === eightPower * 2) return { ok: true };
    return { ok: false, reason: "8切りは指定枚数の4でのみ防げます。" };
  }
  if (field.cards.length !== cards.length) return { ok: false, reason: `場と同じ${field.cards.length}枚を出してください。` };
  if (fieldIsStaircase) {
    const expectedStart = state.revolution ? staircaseStart(field.cards) - field.cards.length : staircaseStart(field.cards) + field.cards.length;
    if (!isStaircase(cards) || staircaseStart(cards) !== expectedStart) {
      return { ok: false, reason: `階段の次は${RANKS[expectedStart] ?? "出せる数字がありません"}から出してください。` };
    }
    return { ok: true };
  }
  if (state.jConstraint) return { ok: true };
  return strength(rank) > strength(previousRank) ? { ok: true } : { ok: false, reason: "場より強いカードを出してください。" };
}
function log(message) { state.logs.unshift(message); render(); }
function removeCards(player, cards) { const ids = new Set(cards.map((card) => card.id)); player.hand = player.hand.filter((card) => !ids.has(card.id)); }
function finishIfPlayerOut() {
  const winners = state.players.filter((player) => player.hand.length === 0);
  if (!winners.length) return false;
  state.finished = true;
  log(`${winners.map((player) => player.name).join("、")}の勝利！`);
  return true;
}
function clearField() { state.field = null; state.passCount = 0; state.current = state.lastPlayer ?? state.current; state.jConstraint = null; state.suitLock = null; state.sequenceLock = false; }
function advance() { state.current = nextPlayer(state.current); render(); if (!state.finished && !state.players[state.current].human) window.setTimeout(cpuTurn, 500); }
function playCards(player, cards, options = {}) {
  const rank = effectiveRank(cards);
  const roleRank = singleRank(cards) ?? (cards.length === 1 ? rank : null);
  const previousField = state.field;
  const previousGroupRank = previousField ? singleRank(previousField.cards) : null, playedGroupRank = singleRank(cards);
  const previousSuit = previousField ? singleSuit(previousField.cards) : null, playedSuit = singleSuit(cards);
  const direction = state.revolution ? -1 : 1;
  if (!state.sequenceLock && previousGroupRank && playedGroupRank && VALUE[playedGroupRank] === VALUE[previousGroupRank] + direction) state.sequenceLock = true;
  if (isStaircase(cards)) state.sequenceLock = true;
  if (!state.suitLock && playedSuit && ((cards.length >= 2) || (previousSuit && previousSuit === playedSuit))) state.suitLock = playedSuit;
  state.jConstraint = null;
  removeCards(player, cards);
  state.lastPlayer = player.id;
  state.field = { cards: cards.slice(), rank, playerId: player.id };
  state.passCount = 0;
  state.pending = null;
  if (isRevolution(cards)) { state.revolution = !state.revolution; log(`${player.name}の革命！ ${cards.map(cardLabel).join(" ")}で強さが反転しました。`); }
  else log(`${player.name}が ${cards.map(cardLabel).join(" ")} を出しました。`);
  const clearedByEffect = roleRank === "5" || (roleRank !== "8" && specialEightCount(cards) > 0);
  if (clearedByEffect) { log(roleRank === "5" ? "5効果で場が流れます。" : `${roleRank}効果で場が流れます。`); clearField(); }
  if (finishIfPlayerOut()) return;
  if (roleRank === "7" && !options.skipEffect) state.pending = { type: "give", count: cards.length, from: player.id };
  if (roleRank === "10" && !options.skipEffect) state.pending = { type: "discard", count: cards.length, from: player.id };
  if (roleRank === "J" && !options.skipEffect) state.pending = { type: "threshold", from: player.id };
  if (roleRank === "Q" && !options.skipEffect) state.pending = { type: "q", count: cards.length, from: player.id, ranks: [] };
  if (state.pending) { render(); if (!player.human) resolveCpuEffect(player); return; }
  if (clearedByEffect) { render(); if (!state.players[state.current].human) window.setTimeout(cpuTurn, 500); return; }
  advance();
}
function pass(player) {
  if (!state.field) return log("場が空のときはパスできません。");
  if (state.jConstraint && player.id !== state.field.playerId) state.jConstraint = null;
  state.passCount++;
  log(`${player.name}はパス。`);
  const passesRequired = state.field.rank === "8" ? activePlayers().length - 1 : activePlayers().length;
  if (state.passCount >= passesRequired) {
    const clearedEight = state.field.rank === "8";
    clearField();
    log(clearedEight ? "8切りを防ぐカードが出なかったため場が流れました。最後に出した人から再開します。" : "最後に出した人もパスしたため場が流れました。最後に出した人から再開します。");
    render();
    if (!state.players[state.current].human) window.setTimeout(cpuTurn, 500);
    return;
  }
  advance();
}
function cardLabel(card) { return card.joker ? `Joker(${cardSuit(card)}${cardRank(card) ?? "未指定"})` : `${card.suit}${card.rank}`; }
function renderCard(card, selected = false, clickable = false) {
  const element = document.createElement("button");
  element.className = `card${RED_SUITS.has(card.suit) ? " red" : ""}${card.joker ? " joker" : ""}${selected ? " selected" : ""}`;
  element.type = "button";
  element.innerHTML = `<span class="rank">${card.joker ? cardRank(card) ?? "★" : card.rank}</span><span class="suit">${card.joker ? `JOKER ${cardSuit(card)}` : card.suit}</span>`;
  if (clickable) element.addEventListener("click", () => { state.selected.has(card.id) ? state.selected.delete(card.id) : state.selected.add(card.id); render(); });
  return element;
}
function render() {
  if (!state) return;
  $("#setup").hidden = true; $("#game").hidden = false;
  $("#round-info").textContent = `${state.revolution ? "革命中" : "通常"} / ${state.players.length}人`;
  $("#notice").textContent = state.finished ? "ゲーム終了。新しいゲームで再戦できます。" : state.pending?.type === "give" ? `7の効果：渡すカードを最大${state.pending.count}枚選んでください。` : state.pending?.type === "discard" ? `10の効果：捨てるカードを最大${state.pending.count}枚選んでください。` : state.pending?.type === "q" ? `Qの効果：捨てる数字を最大${state.pending.count}種類選んでください。` : `${state.players[state.current].name}のターン`;
  const table = $("#table"); table.replaceChildren();
  state.players.forEach((player) => { const seat = document.createElement("article"); seat.className = `seat${player.id === state.current ? " active" : ""}${player.human ? " human" : ""}`; seat.innerHTML = `<div class="seat-name"><span>${player.name}</span><span class="badge">${player.human ? "YOU" : "CPU"}</span></div><div class="seat-meta">${player.hand.length ? `${player.hand.length}枚` : "上がり"}</div>`; table.append(seat); });
  const field = $("#field-cards"); field.replaceChildren(); if (state.field?.cards.length) state.field.cards.forEach((card) => field.append(renderCard(card))); else field.innerHTML = '<span class="empty">場は空です</span>';
  $("#field-rule").textContent = state.field ? `${state.field.cards.length}枚 / ${state.field.rank}` : "次は何枚でも出せます";
  const hand = $("#hand"); hand.replaceChildren(); state.players[0].hand.forEach((card) => hand.append(renderCard(card, state.selected.has(card.id), state.players[0].id === state.current && !state.finished && (!state.pending || ["give", "discard"].includes(state.pending.type)))));
  $("#selection-count").textContent = `${state.selected.size}枚選択`;
  $("#play").textContent = state.pending ? "効果を確定" : "出す";
  $("#play").disabled = state.finished || state.players[state.current].id !== 0 || (Boolean(state.pending) && state.pending.from !== 0);
  $("#pass").disabled = state.finished || state.players[state.current].id !== 0 || !state.field || Boolean(state.pending);
  renderEffects(); $("#log").innerHTML = state.logs.map((message) => `<li${message.includes("勝利") ? ' class="winner"' : ""}>${message}</li>`).join("");
}
function renderEffects() {
  const root = $("#effect-controls"); root.replaceChildren();
  if (!state.pending || state.pending.from !== 0) return;
  if (state.pending.type === "threshold") {
    root.innerHTML = '<label>次の人が出す数字 <select id="threshold-direction"><option value="over">J以上</option><option value="under">J以下</option></select></label>';
  } else if (state.pending.type === "give") {
    root.innerHTML = '<label>渡す相手 <select id="give-target"></select></label>';
    $("#give-target").innerHTML = state.players.filter((player) => player.id !== 0 && player.hand.length).map((player) => `<option value="${player.id}">${player.name}</option>`).join("");
  } else if (state.pending.type === "joker") {
    const jokerCards = state.pending.cardIds.map((id) => state.players[0].hand.find((card) => card.id === id));
    root.innerHTML = `<fieldset><legend>Jokerの数字と柄を指定</legend>${jokerCards.map((card, index) => `<label>Joker ${index + 1} <select id="joker-suit-${index}"><option value="" selected disabled>柄</option>${SUITS.map((suit) => `<option value="${suit}">${suit}</option>`).join("")}</select> <select id="joker-rank-${index}"><option value="" selected disabled>数字</option>${[...RANKS, "Joker"].map((rank) => `<option value="${rank}">${rank}</option>`).join("")}</select></label>`).join(" ")}</fieldset><button id="cancel-joker" class="secondary" type="button">カード選択に戻る</button>`;
    $("#cancel-joker").addEventListener("click", cancelHumanJoker);
  } else if (state.pending.type === "q") {
    root.innerHTML = `<fieldset><legend>全員が捨てる数字（最大${state.pending.count}種類）</legend>${[...RANKS, "Joker"].map((rank) => `<label><input type="checkbox" name="q-rank" value="${rank}"${state.pending.ranks.includes(rank) ? " checked" : ""}>${rank}</label>`).join(" ")}</fieldset>`;
  }
}
function commitHumanPlay() {
  const player = state.players[0], cards = selectedCards(player);
  if (cards.some((card) => card.joker)) { state.pending = { type: "joker", from: 0, cardIds: cards.filter((card) => card.joker).map((card) => card.id) }; render(); return; }
  const check = canPlay(cards);
  if (!check.ok) { $("#notice").textContent = check.reason; return; }
  playCards(player, cards);
  state.selected.clear(); render();
}
function cancelHumanJoker() {
  if (state?.pending?.type !== "joker") return;
  state.pending.cardIds.forEach((id) => {
    const card = state.players[0].hand.find((candidate) => candidate.id === id);
    if (card) { delete card.assignedSuit; delete card.assignedRank; }
  });
  state.pending = null;
  render();
}
function resolveHumanPending() {
  const player = state.players[0], pending = state.pending, cards = selectedCards(player);
  if (pending.type === "threshold") { state.jConstraint = { direction: $("#threshold-direction").value }; state.pending = null; log(`Jの効果：次の人はJ${state.jConstraint.direction === "under" ? "以下" : "以上"}を出します。`); advance(); }
  else if (pending.type === "give") { const target = state.players[Number($("#give-target").value)]; if (cards.length > pending.count) return ($("#notice").textContent = `最大${pending.count}枚まで選べます。`); removeCards(player, cards); target.hand.push(...cards); state.pending = null; log(`${target.name}へ${cards.length}枚渡しました。`); state.selected.clear(); if (finishIfPlayerOut()) return; advance(); }
  else if (pending.type === "discard") { if (cards.length > pending.count) return ($("#notice").textContent = `最大${pending.count}枚まで選べます。`); removeCards(player, cards); state.pending = null; log(`${cards.length}枚捨てました。`); state.selected.clear(); if (finishIfPlayerOut()) return; advance(); }
  else if (pending.type === "joker") {
    const jokers = pending.cardIds.map((id) => player.hand.find((card) => card.id === id));
    jokers.forEach((card, index) => { card.assignedSuit = $(`#joker-suit-${index}`).value; card.assignedRank = $(`#joker-rank-${index}`).value; });
    const check = canPlay(cards);
    if (!check.ok) {
      jokers.forEach((card) => { delete card.assignedSuit; delete card.assignedRank; });
      render();
      $("#notice").textContent = check.reason;
      return;
    }
    state.pending = null;
    playCards(player, cards);
    state.selected.clear();
    render();
  }
  else if (pending.type === "q") { const ranks = pending.ranks; if (ranks.length > pending.count) return ($("#notice").textContent = `最大${pending.count}種類まで選べます。`); state.players.forEach((target) => { target.hand = target.hand.filter((card) => !ranks.includes(qRank(card))); }); state.pending = null; state.selected.clear(); log(ranks.length ? `Qの効果：全員が${ranks.join("・")}を捨てました。` : "Qの効果：捨てる数字は選びませんでした。"); if (finishIfPlayerOut()) return; advance(); }
}
function chooseCpuQRanks(player, count) {
  return [...RANKS, "Joker"].map((rank) => {
    const own = player.hand.filter((card) => qRank(card) === rank).length;
    const opponents = state.players.filter((other) => other.id !== player.id).reduce((total, other) => total + other.hand.filter((card) => qRank(card) === rank).length, 0);
    return { rank, score: opponents * 60 + own * 45 };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, count).map((entry) => entry.rank);
}
function chooseCpuJDirection(player) {
  if (state.difficulty === "easy") return Math.random() < 0.5 ? "under" : "over";
  if (state.difficulty !== "hard") return "over";
  const next = state.players[nextPlayer(player.id)];
  const under = next.hand.filter((card) => card.joker || VALUE[cardRank(card)] <= VALUE.J).length;
  const over = next.hand.filter((card) => card.joker || VALUE[cardRank(card)] >= VALUE.J).length;
  return under <= over ? "under" : "over";
}
function handStructure(hand) {
  let score = 0;
  const ranks = new Map();
  hand.forEach((card) => { const rank = cardRank(card); if (rank) ranks.set(rank, (ranks.get(rank) ?? 0) + 1); });
  ranks.forEach((count) => { if (count > 1) score += count * 10 + (count === 4 ? 16 : 0); });
  for (const suit of SUITS) {
    const values = [...new Set(hand.filter((card) => !card.joker && card.suit === suit).map((card) => VALUE[card.rank]))].sort((a, b) => a - b);
    let run = 1;
    values.forEach((value, index) => {
      if (index && value === values[index - 1] + 1) { run++; score += 5; }
      else run = 1;
    });
  }
  return score;
}
function scoreCpuMove(player, cards, level) {
  const ids = new Set(cards.map((card) => card.id));
  const remaining = player.hand.filter((card) => !ids.has(card.id));
  const rank = singleRank(cards) ?? (cards.length === 1 ? effectiveRank(cards) : null), cardCost = cards.reduce((total, card) => total + (card.joker ? 16 : strength(cardRank(card)) + 1), 0);
  let score = cards.length * 90 - cardCost * (level === "hard" ? 2 : 1.1);
  if (!remaining.length) return 1000000;
  if (level === "hard") score += (handStructure(remaining) - handStructure(player.hand)) * 2;
  if (rank === "5") score += 150;
  else if (["3", "6", "9"].includes(rank) && cards.length >= 2) score += 130;
  else if (rank === "8") score += 70;
  else if (rank === "7" || rank === "10") score += cards.length * 45;
  else if (rank === "Q") score += chooseCpuQRanks({ ...player, hand: remaining }, cards.length).reduce((sum, value) => {
    const own = remaining.filter((card) => qRank(card) === value).length;
    const enemy = state.players.filter((other) => other.id !== player.id).reduce((total, other) => total + other.hand.filter((card) => qRank(card) === value).length, 0);
    return sum + own * 45 + enemy * 60;
  }, 0);
  else if (rank === "J") score += level === "hard" ? 75 : 35;
  if (isRevolution(cards)) score += state.revolution ? -15 : 35;
  if (state.players.some((other) => other.id !== player.id && other.hand.length <= 2)) score += cards.length * 8;
  return score;
}
function hardResponsePenalty(player, cards) {
  const rank = singleRank(cards) ?? (cards.length === 1 ? effectiveRank(cards) : null);
  if (rank === "5" || (["3", "6", "9"].includes(rank) && cards.length >= 2)) return 0;
  const saved = { players: state.players, field: state.field, revolution: state.revolution, passCount: state.passCount, jConstraint: state.jConstraint, suitLock: state.suitLock, sequenceLock: state.sequenceLock };
  try {
    state.players = saved.players.map((other) => ({ ...other, hand: other.hand.slice() }));
    const actor = state.players.find((other) => other.id === player.id);
    removeCards(actor, cards);
    const previousField = state.field, previousRank = previousField ? singleRank(previousField.cards) : null, playedRank = singleRank(cards);
    const previousSuit = previousField ? singleSuit(previousField.cards) : null, playedSuit = singleSuit(cards), direction = state.revolution ? -1 : 1;
    state.suitLock = state.suitLock ?? (previousSuit && previousSuit === playedSuit ? playedSuit : null);
    state.sequenceLock = state.sequenceLock || Boolean(previousRank && playedRank && VALUE[playedRank] === VALUE[previousRank] + direction);
    state.revolution = isRevolution(cards) ? !state.revolution : state.revolution;
    state.field = { cards: cards.slice(), rank, playerId: player.id };
    state.passCount = 0;
    state.jConstraint = rank === "J" ? { direction: chooseCpuJDirection(actor) } : null;
    if (rank === "7") {
      const target = state.players.filter((other) => other.id !== player.id && other.hand.length).sort((a, b) => b.hand.length - a.hand.length)[0];
      if (target) { const gifted = actor.hand.slice(-cards.length); removeCards(actor, gifted); target.hand.push(...gifted); }
    } else if (rank === "10") removeCards(actor, actor.hand.slice(0, cards.length));
    else if (rank === "Q") {
      const ranks = chooseCpuQRanks(actor, cards.length);
      state.players.forEach((other) => { other.hand = other.hand.filter((card) => !ranks.includes(qRank(card))); });
    }
    if (!actor.hand.length) return -1000;
    if (state.players.some((other) => other.id !== player.id && !other.hand.length)) return 1000;
    const responder = state.players[nextPlayer(player.id)];
    if (responder.id === player.id) return 0;
    const responses = legalMoves(responder);
    if (!responses.length) return 0;
    return responses.some((move) => move.length === responder.hand.length) ? 600 : 65 + Math.min(150, responses.length * 3);
  } finally {
    Object.assign(state, saved);
  }
}
function chooseCpuMove(player, moves) {
  if (state.difficulty === "easy") return moves[Math.floor(Math.random() * moves.length)];
  const level = state.difficulty === "hard" ? "hard" : "normal";
  const scored = moves.map((cards) => ({ cards, score: scoreCpuMove(player, cards, level) })).sort((a, b) => b.score - a.score);
  if (level === "normal") return scored[0].cards;
  return scored.slice(0, 12).map((candidate) => ({ ...candidate, score: candidate.score - hardResponsePenalty(player, candidate.cards) })).sort((a, b) => b.score - a.score)[0].cards;
}
function resolveCpuEffect(player) {
  const pending = state.pending;
  if (!pending || pending.from !== player.id) return;
  if (pending.type === "give") { const target = state.players.filter((candidate) => candidate.id !== player.id && candidate.hand.length).sort((a, b) => b.hand.length - a.hand.length)[0]; const cards = player.hand.slice(-pending.count); removeCards(player, cards); target.hand.push(...cards); log(`${player.name}が${target.name}へ${cards.length}枚渡しました。`); state.pending = null; if (finishIfPlayerOut()) return; advance(); }
  else if (pending.type === "discard") { const cards = player.hand.slice(0, pending.count); removeCards(player, cards); log(`${player.name}が${cards.length}枚捨てました。`); state.pending = null; if (finishIfPlayerOut()) return; advance(); }
  else if (pending.type === "threshold") { state.jConstraint = { direction: chooseCpuJDirection(player) }; log(`${player.name}がJでJ${state.jConstraint.direction === "under" ? "以下" : "以上"}を指定。`); state.pending = null; advance(); }
  else if (pending.type === "q") { const ranks = chooseCpuQRanks(player, pending.count); state.players.forEach((target) => { target.hand = target.hand.filter((card) => !ranks.includes(qRank(card))); }); log(`${player.name}のQ効果で全員が${ranks.join("・")}を捨てました。`); state.pending = null; if (finishIfPlayerOut()) return; advance(); }
}
function combinations(cards) {
  const result = [];
  function collect(start, selected) {
    if (selected.length) result.push(selected);
    for (let index = start; index < cards.length; index++) collect(index + 1, [...selected, cards[index]]);
  }
  collect(0, []);
  return result;
}
function legalMoves(player) {
  const candidates = [], jokers = player.hand.filter((card) => card.joker);
  for (const rank of [...RANKS, "Joker"]) {
    const sameRank = player.hand.filter((card) => !card.joker && card.rank === rank);
    const wilds = jokers.map((card) => ({ ...card, assignedRank: rank }));
    if (sameRank.length || wilds.length) candidates.push(...combinations([...sameRank, ...wilds]));
  }
  for (const suit of SUITS) {
    const suited = player.hand.filter((card) => !card.joker && card.suit === suit).sort((a, b) => VALUE[a.rank] - VALUE[b.rank]);
    for (let start = 0; start < suited.length; start++) {
      for (let length = 2; length <= suited.length - start; length++) {
        const sequence = suited.slice(start, start + length);
        if (isStaircase(sequence)) candidates.push(sequence);
      }
    }
    for (let start = 0; start < RANKS.length; start++) {
      for (let length = 2; length <= RANKS.length - start; length++) {
        const usedJokers = new Set();
        const sequence = RANKS.slice(start, start + length).map((rank) => {
          const natural = player.hand.find((card) => !card.joker && card.suit === suit && card.rank === rank);
          if (natural) return natural;
          const joker = jokers.find((card) => !usedJokers.has(card.id));
          if (!joker) return null;
          usedJokers.add(joker.id);
          return { ...joker, assignedSuit: suit, assignedRank: rank };
        });
        if (sequence.every(Boolean) && sequence.some((card) => card.joker)) candidates.push(sequence);
      }
    }
  }
  const moves = [], seen = new Set();
  candidates.forEach((selection) => {
    let variants = [selection];
    selection.filter((card) => card.joker).forEach((joker) => {
      variants = variants.flatMap((variant) => {
        const suits = state.suitLock ? [state.suitLock] : SUITS;
        return suits.map((suit) => variant.map((card) => card.id === joker.id ? { ...card, assignedSuit: suit } : card));
      });
    });
    variants.forEach((cards) => {
      if (!canPlay(cards).ok) return;
      const key = cards.map((card) => `${card.id}${card.joker ? `:${card.assignedSuit}:${card.assignedRank}` : ""}`).sort().join("|");
      if (!seen.has(key)) { seen.add(key); moves.push(cards); }
    });
  });
  return moves;
}
function cpuTurn() {
  if (!state || state.finished || state.players[state.current].human || state.pending) return;
  const player = state.players[state.current], moves = legalMoves(player);
  if (!moves.length && state.field) return pass(player);
  const move = chooseCpuMove(player, moves);
  playCards(player, move); render();
}
$("#start-game").addEventListener("click", () => {
  state = createGame(Number($("#player-count").value), $("#cpu-level").value);
  log(`ゲーム開始。${state.players.length}人。あなたが好きな枚数から始めます。`);
  render();
});
$("#new-game").addEventListener("click", () => { $("#game").hidden = true; $("#setup").hidden = false; });
$("#play").addEventListener("click", () => state.pending ? resolveHumanPending() : commitHumanPlay());
$("#pass").addEventListener("click", () => { pass(state.players[0]); state.selected.clear(); });
window.addEventListener("change", (event) => { if (event.target.id === "joker-rank") resolveHumanPending(); });
window.addEventListener("change", (event) => {
  if (event.target.name === "q-rank" && state?.pending?.type === "q") {
    const ranks = [...document.querySelectorAll('input[name="q-rank"]:checked')].map((input) => input.value);
    if (ranks.length > state.pending.count) event.target.checked = false;
    state.pending.ranks = [...document.querySelectorAll('input[name="q-rank"]:checked')].map((input) => input.value);
  }
});
