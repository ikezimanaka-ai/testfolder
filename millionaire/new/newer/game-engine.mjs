export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

const RANK_VALUE = new Map(RANKS.map((rank, index) => [rank, index]));
const RED_SUITS = new Set(["♥", "♦"]);
const MAX_PLAYERS = 10;
let onlineState = null;

export function createDeck() {
  const cards = SUITS.flatMap((suit) => RANKS.map((rank) => ({
    id: `${suit}:${rank}`,
    suit,
    rank,
    joker: false
  })));
  cards.push(
    { id: "joker-1", suit: "", rank: "Joker", joker: true },
    { id: "joker-2", suit: "", rank: "Joker", joker: true }
  );
  return cards;
}

function shuffled(cards, random) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [cards[index], cards[target]] = [cards[target], cards[index]];
  }
  return cards;
}

export function createGame(playerCount = 4, difficulty = "normal", random = Math.random) {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > MAX_PLAYERS) {
    throw new RangeError(`参加人数は2〜${MAX_PLAYERS}人にしてください。`);
  }
  if (!["easy", "normal", "hard"].includes(difficulty)) {
    throw new RangeError("CPUレベルが正しくありません。");
  }
  if (typeof random !== "function") throw new TypeError("乱数生成関数が必要です。");

  const players = Array.from({ length: playerCount }, (_, id) => ({
    id,
    name: id === 0 ? "あなた" : `CPU ${id}`,
    human: id === 0,
    hand: [],
    place: null
  }));
  shuffled(createDeck(), random).forEach((card, index) => {
    players[index % playerCount].hand.push(card);
  });
  players.forEach((player) => player.hand.sort(compareCards));

  return {
    players,
    current: 0,
    field: null,
    lastPlayer: null,
    passed: new Set(),
    revolution: false,
    jConstraint: null,
    suitLock: null,
    sequenceLock: false,
    pending: null,
    selectedIds: new Set(),
    difficulty,
    placements: [],
    logs: [`ゲーム開始。${playerCount}人で対戦します。あなたの手番です。`],
    finished: false,
    notice: ""
  };
}

function compareCards(left, right) {
  const leftValue = left.joker ? RANKS.length : RANK_VALUE.get(left.rank);
  const rightValue = right.joker ? RANKS.length : RANK_VALUE.get(right.rank);
  return leftValue - rightValue || SUITS.indexOf(left.suit) - SUITS.indexOf(right.suit);
}

function livingPlayers(state) {
  return state.players.filter((player) => player.hand.length > 0 && !player.left);
}

function nextLiving(state, fromId, predicate = () => true) {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const id = (fromId + offset) % state.players.length;
    const player = state.players[id];
    if (player.hand.length && !player.left && predicate(player)) return id;
  }
  return null;
}

function effectiveRank(card) {
  if (!card.joker) return card.rank;
  if (card.declaration?.rank === "2") return "Joker";
  return card.declaration?.rank ?? null;
}

function effectiveSuit(card) {
  return card.joker ? card.declaration?.suit ?? null : card.suit;
}

function physicalCardLabel(card) {
  return card.joker ? `Joker(${card.declaration.suit}${card.declaration.rank})` : `${card.suit}${card.rank}`;
}

function getGroupRank(cards) {
  const ranks = new Set(cards.map(effectiveRank));
  return ranks.size === 1 ? [...ranks][0] : null;
}

function getSingleSuit(cards) {
  const suits = new Set(cards.map(effectiveSuit));
  return suits.size === 1 ? [...suits][0] : null;
}

function isStaircase(cards) {
  if (cards.length !== 4) return false;
  const suits = new Set(cards.map(effectiveSuit));
  const values = cards.map((card) => RANK_VALUE.get(effectiveRank(card)));
  if (suits.size !== 1 || values.some((value) => value === undefined)) return false;
  values.sort((left, right) => left - right);
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

function isFourOfAKind(cards) {
  return cards.length === 4 && Boolean(getGroupRank(cards));
}

function setShapeIsValid(cards) {
  if (!cards.length || cards.length > 4) return false;
  if (cards.length === 4 && isStaircase(cards)) return true;
  if (!getGroupRank(cards)) return false;
  const suits = cards.map(effectiveSuit);
  return new Set(suits).size === cards.length;
}

function strength(rank, revolution) {
  const value = rank === "Joker" ? RANKS.length : RANK_VALUE.get(rank);
  return revolution ? RANKS.length - 1 - value : value;
}

function isPhysicalJokerCounter(field, cards) {
  return field?.cards.length === 1 &&
    field.cards[0].joker &&
    cards.length === 1 &&
    !cards[0].joker &&
    cards[0].id === "♠:3";
}

function isJokerDeclarationValid(card, declaration) {
  return !card.joker || (
    declaration &&
    RANK_VALUE.has(declaration.rank) &&
    SUITS.includes(declaration.suit)
  );
}

function buildPlayCards(player, cardIds, declarations) {
  if (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.length > 4) {
    return { error: "一度に出せるカードは1〜4枚です。" };
  }
  if (new Set(cardIds).size !== cardIds.length || cardIds.some((id) => typeof id !== "string")) {
    return { error: "カードの選択が重複しているか、不正です。" };
  }
  const cards = [];
  for (const id of cardIds) {
    const card = player.hand.find((candidate) => candidate.id === id);
    if (!card) return { error: "手札にないカードは出せません。" };
    const declaration = card.joker ? declarations?.[id] : null;
    if (!isJokerDeclarationValid(card, declaration)) {
      return { error: "Jokerごとに3〜2の数字と柄を指定してください。" };
    }
    cards.push(card.joker ? { ...card, declaration: { rank: declaration.rank, suit: declaration.suit } } : { ...card });
  }
  if (!setShapeIsValid(cards)) {
    return { error: "同じ数字の組、または同じ柄の4枚階段を出してください。" };
  }
  return { cards };
}

function canPlay(state, cards) {
  const field = state.field;
  if (!field) return { ok: true };
  if (isPhysicalJokerCounter(field, cards)) return { ok: true, jokerCounter: true };

  const previousRank = getGroupRank(field.cards);
  const nextRank = getGroupRank(cards);
  if (field.cards.length !== cards.length) {
    if (previousRank === "8" && field.cards.length <= 2 &&
      cards.length === field.cards.length * 2 &&
      getGroupRank(cards) === "4") {
      return { ok: true, eightCounter: true };
    }
    return { ok: false, reason: `場と同じ${field.cards.length}枚を出してください。` };
  }

  const previousIsStaircase = isStaircase(field.cards);
  const nextIsStaircase = isStaircase(cards);
  if (previousIsStaircase !== nextIsStaircase) {
    return { ok: false, reason: "組には組、階段には同じ柄の階段で応答してください。" };
  }

  if (state.suitLock && cards.some((card) => effectiveSuit(card) !== state.suitLock)) {
    return { ok: false, reason: `${state.suitLock}のカードだけ出せます（柄縛り）。` };
  }
  if (state.jConstraint) {
    const direction = state.jConstraint.direction;
    const outOfRange = cards.some((card) => {
      const value = RANK_VALUE.get(effectiveRank(card));
      return direction === "under" ? value > RANK_VALUE.get("J") : value < RANK_VALUE.get("J");
    });
    if (outOfRange) {
      return { ok: false, reason: `Jの指定により、J${direction === "under" ? "以下" : "以上"}を出してください。` };
    }
  }
  if (getGroupRank(field.cards) === "8") {
    return { ok: false, reason: "8切りは、場の枚数の2倍の4でのみ防げます。" };
  }

  if (previousIsStaircase) {
    const start = Math.min(...field.cards.map((card) => RANK_VALUE.get(effectiveRank(card))));
    const expected = start + (state.revolution ? -field.cards.length : field.cards.length);
    const newStart = isStaircase(cards)
      ? Math.min(...cards.map((card) => RANK_VALUE.get(effectiveRank(card))))
      : null;
    return newStart === expected && getSingleSuit(cards) === getSingleSuit(field.cards)
      ? { ok: true }
      : { ok: false, reason: `同じ柄で階段を続けて${RANKS[expected] ?? "出せる数字がありません"}から出してください。` };
  }

  if (state.sequenceLock) {
    const direction = state.revolution ? -1 : 1;
    const expected = RANK_VALUE.get(previousRank) + direction;
    if (!nextRank || RANK_VALUE.get(nextRank) !== expected) {
      return { ok: false, reason: `数字縛り中です。次は${RANKS[expected] ?? "出せる数字がありません"}です。` };
    }
  } else if (!state.jConstraint &&
    strength(nextRank, state.revolution) <= strength(previousRank, state.revolution)) {
    return { ok: false, reason: "場より強い数字を出してください。" };
  }
  return { ok: true };
}

function addLog(state, text) {
  state.logs.unshift(text);
  if (state.logs.length > 100) state.logs.length = 100;
}

function assignPlacement(state, player) {
  if (player.hand.length !== 0 || player.place !== null) return;
  player.place = state.placements.length + 1;
  state.placements.push(player.id);
  addLog(state, `${player.name}は${player.place}位で上がりです。`);
}

function checkFinished(state) {
  const remaining = livingPlayers(state);
  if (remaining.length > 1) return false;
  if (remaining.length === 1) {
    const last = remaining[0];
    if (last.place === null) {
      last.place = state.placements.length + 1;
      state.placements.push(last.id);
    }
  }
  state.finished = true;
  state.current = null;
  state.pending = null;
  addLog(state, "ゲーム終了。順位が確定しました。");
  return true;
}

function clearField(state, restartFrom = state.lastPlayer) {
  state.field = null;
  state.lastPlayer = null;
  state.passed.clear();
  state.jConstraint = null;
  state.suitLock = null;
  state.sequenceLock = false;
  state.current = restartFrom === null
    ? (livingPlayers(state)[0]?.id ?? null)
    : state.players[restartFrom]?.hand.length
      ? restartFrom
      : nextLiving(state, restartFrom);
}

function advanceAfterPlay(state, playerId) {
  if (checkFinished(state)) return;
  const next = nextLiving(state, playerId);
  state.current = next;
  if (next === null) return;
  if (state.passed.has(next)) resolvePassedTurn(state);
}

function resolvePassedTurn(state) {
  if (!state.field) return;
  const responders = livingPlayers(state).filter((player) => player.id !== state.lastPlayer);
  if (responders.every((player) => state.passed.has(player.id))) {
    const lastPlayer = state.lastPlayer;
    addLog(state, "全員がパスしたため場が流れます。");
    clearField(state, lastPlayer);
    checkFinished(state);
    return;
  }
  const next = nextLiving(state, state.current, (player) => !state.passed.has(player.id));
  if (next === null) {
    const lastPlayer = state.lastPlayer;
    addLog(state, "全員がパスしたため場が流れます。");
    clearField(state, lastPlayer);
    checkFinished(state);
  } else {
    state.current = next;
  }
}

function beginEffect(state, playerId, cards, moveInfo) {
  if (moveInfo.jokerCounter) {
    const player = state.players[playerId];
    addLog(state, `${player.name}が実物のスペードの3でJokerを返しました。`);
    clearField(state, playerId);
    checkFinished(state);
    return;
  }

  if (moveInfo.eightCounter) {
    addLog(state, "4で8切りを防ぎました。");
    clearField(state, playerId);
    checkFinished(state);
    return;
  }

  const groupRank = getGroupRank(cards);
  if (cards.length === 4 && (isFourOfAKind(cards) || isStaircase(cards))) {
    state.revolution = !state.revolution;
    addLog(state, `革命${state.revolution ? "が起きました" : "が終わりました"}。`);
  }

  if (["3", "6", "9"].includes(groupRank) && cards.length >= 2) {
    addLog(state, `${groupRank}の複数出しで場が流れます。`);
    clearField(state, playerId);
    checkFinished(state);
    return;
  }

  state.field = { cards, playerId, rank: groupRank };
  state.lastPlayer = playerId;
  state.passed.clear();

  const previous = moveInfo.previousCards;
  if (previous) {
    const previousSuit = getSingleSuit(previous);
    const nextSuit = getSingleSuit(cards);
    if (isStaircase(cards) || (previousSuit && previousSuit === nextSuit)) {
      state.suitLock = nextSuit;
    }
    if (!isStaircase(previous) && !isStaircase(cards)) {
      const beforeRank = getGroupRank(previous);
      const currentRank = getGroupRank(cards);
      const direction = state.revolution ? -1 : 1;
      if (beforeRank && currentRank &&
        RANK_VALUE.get(currentRank) === RANK_VALUE.get(beforeRank) + direction) {
        state.sequenceLock = true;
      }
    }
  }

  const activeOpponents = Math.max(0, livingPlayers(state).length - 1);
  if (groupRank === "5") {
    const skipped = Math.min(cards.length, activeOpponents);
    addLog(state, `${playerName(state, playerId)}の5効果で${skipped}人を飛ばして場を流します。`);
    clearField(state, skipFrom(state, playerId, skipped));
    checkFinished(state);
    return;
  }
  if (groupRank === "J") {
    state.pending = { type: "threshold", playerId };
    return;
  }
  if (groupRank === "7") {
    state.pending = { type: "give", playerId, count: cards.length };
    return;
  }
  if (groupRank === "10") {
    state.pending = { type: "discard", playerId, count: cards.length };
    return;
  }
  if (groupRank === "Q") {
    state.pending = { type: "q", playerId, count: cards.length };
    return;
  }

  advanceAfterPlay(state, playerId);
}

function playerName(state, id) {
  return state.players[id]?.name ?? `プレイヤー${id + 1}`;
}

function skipFrom(state, playerId, numberToSkip) {
  let from = playerId;
  for (let count = 0; count < numberToSkip; count += 1) {
    const next = nextLiving(state, from);
    if (next === null) return playerId;
    from = next;
  }
  return nextLiving(state, from) ?? from;
}

export function playCards(state, playerId, cardIds, declarations = {}) {
  const invalid = validateTurn(state, playerId);
  if (invalid) return invalid;
  const player = state.players[playerId];
  const built = buildPlayCards(player, cardIds, declarations);
  if (built.error) return fail(state, built.error);
  const moveInfo = canPlay(state, built.cards);
  if (!moveInfo.ok) return fail(state, moveInfo.reason);

  state.notice = "";
  const ids = new Set(cardIds);
  const previousCards = state.field?.cards ?? null;
  player.hand = player.hand.filter((card) => !ids.has(card.id));
  player.hand.sort(compareCards);
  assignPlacement(state, player);
  state.selectedIds.clear();
  state.jConstraint = null;
  state.field = null;
  if (!moveInfo.jokerCounter) {
    addLog(state, `${player.name}が${built.cards.map(physicalCardLabel).join("・")}を出しました。`);
  }
  state.pending = null;
  beginEffect(state, playerId, built.cards, { ...moveInfo, previousCards });
  if (!state.finished && !state.pending && player.hand.length === 0) checkFinished(state);
  return { ok: true };
}

function validateTurn(state, playerId) {
  if (!state || state.finished) return { ok: false, reason: "ゲームは終了しています。" };
  if (!Number.isInteger(playerId) || state.current !== playerId) return fail(state, "あなたの手番ではありません。");
  if (state.pending) return fail(state, "効果の選択を完了してください。");
  const player = state.players[playerId];
  if (!player || player.hand.length === 0) return fail(state, "手札がないプレイヤーは行動できません。");
  return null;
}

function fail(state, reason) {
  if (state) state.notice = reason;
  return { ok: false, reason };
}

export function passTurn(state, playerId) {
  const invalid = validateTurn(state, playerId);
  if (invalid) return invalid;
  state.notice = "";
  const player = state.players[playerId];
  state.selectedIds.clear();
  if (!state.field) {
    state.jConstraint = null;
    addLog(state, `${player.name}はパスしました。`);
    state.current = nextLiving(state, playerId);
    checkFinished(state);
    return { ok: true };
  }
  if (playerId === state.lastPlayer) return fail(state, "最後に出した人は場が流れるまでパスできません。");
  state.passed.add(playerId);
  state.jConstraint = null;
  addLog(state, `${player.name}はパスしました。`);
  resolvePassedTurn(state);
  return { ok: true };
}

export function resolveEffect(state, playerId, choice = {}) {
  if (!state || state.finished || !state.pending) return fail(state, "選択が必要な効果はありません。");
  const pending = state.pending;
  if (pending.playerId !== playerId || state.current !== playerId) return fail(state, "この効果を選択できる手番ではありません。");
  const player = state.players[playerId];

  if (pending.type === "threshold") {
    if (!["under", "over"].includes(choice.direction)) {
      return fail(state, "Jの指定は「J以上」または「J以下」を選んでください。");
    }
    state.jConstraint = { direction: choice.direction };
    addLog(state, `Jの効果で次の人はJ${choice.direction === "under" ? "以下" : "以上"}を出します。`);
  } else if (pending.type === "give" || pending.type === "discard") {
    const ids = choice.cardIds;
    if (!Array.isArray(ids) || ids.length > pending.count || new Set(ids).size !== ids.length) {
      return fail(state, `効果で選べるカードは最大${pending.count}枚です。`);
    }
    const cards = ids.map((id) => player.hand.find((card) => card.id === id));
    if (cards.some((card) => !card)) return fail(state, "選択したカードが手札にありません。");
    if (pending.type === "give") {
      const targets = livingPlayers(state).filter((candidate) => candidate.id !== playerId);
      const targetId = choice.targetId;
      if (!targets.length && cards.length === 0) {
        addLog(state, "渡す相手がいないため7の効果を終了しました。");
      } else if (!Number.isInteger(targetId) || !targets.some((target) => target.id === targetId)) {
        return fail(state, "カードを渡す相手を選んでください。");
      } else {
        const idsToTransfer = new Set(ids);
        player.hand = player.hand.filter((card) => !idsToTransfer.has(card.id));
        state.players[targetId].hand.push(...cards);
        state.players[targetId].hand.sort(compareCards);
        addLog(state, `${player.name}が${playerName(state, targetId)}へ${cards.length}枚渡しました。`);
      }
    } else {
      const idsToDiscard = new Set(ids);
      player.hand = player.hand.filter((card) => !idsToDiscard.has(card.id));
      addLog(state, `${player.name}は10の効果で${cards.length}枚捨てました。`);
    }
  } else if (pending.type === "q") {
    const ranks = choice.ranks;
    if (!Array.isArray(ranks) || ranks.length > pending.count ||
      new Set(ranks).size !== ranks.length ||
      ranks.some((rank) => !RANK_VALUE.has(rank) && rank !== "Joker")) {
      return fail(state, `Qの効果では最大${pending.count}種類の数字を選べます。`);
    }
    const selectedRanks = new Set(ranks);
    for (const target of state.players) {
      target.hand = target.hand.filter((card) => !selectedRanks.has(card.joker ? "Joker" : card.rank));
    }
    addLog(state, `Qの効果で全員が${ranks.length ? ranks.join("・") : "カードを選ばず"}捨てました。`);
  }

  state.notice = "";
  state.selectedIds.clear();
  state.pending = null;
  for (const target of state.players) assignPlacement(state, target);
  if (checkFinished(state)) return { ok: true };
  advanceAfterPlay(state, playerId);
  return { ok: true };
}

export function toggleSelectedCard(state, cardId) {
  const player = state.players[0];
  if (!player?.hand.some((card) => card.id === cardId)) return false;
  if (state.selectedIds.has(cardId)) state.selectedIds.delete(cardId);
  else state.selectedIds.add(cardId);
  state.notice = "";
  return true;
}

function combinations(cards, size) {
  const result = [];
  function collect(start, selected) {
    if (selected.length === size) {
      result.push(selected);
      return;
    }
    for (let index = start; index <= cards.length - (size - selected.length); index += 1) {
      collect(index + 1, [...selected, cards[index]]);
    }
  }
  collect(0, []);
  return result;
}

function cpuMoves(state, player) {
  const required = state.field?.cards.length ?? null;
  const jokers = player.hand.filter((card) => card.joker);
  const natural = player.hand.filter((card) => !card.joker);
  const candidates = [];

  for (const rank of RANKS) {
    const rankCards = natural.filter((card) => card.rank === rank);
    for (let count = 1; count <= 4; count += 1) {
      if (required !== null && count !== required) continue;
      for (let jokerCount = 0; jokerCount <= Math.min(jokers.length, count); jokerCount += 1) {
        const naturalCount = count - jokerCount;
        for (const naturalSet of combinations(rankCards, naturalCount)) {
          for (const jokerSet of combinations(jokers, jokerCount)) {
            const usedSuits = new Set(naturalSet.map((card) => card.suit));
            const freeSuits = SUITS.filter((suit) => !usedSuits.has(suit));
            if (freeSuits.length < jokerCount) continue;
            const assign = (index, declarations) => {
              if (index === jokerSet.length) {
                const ids = [...naturalSet, ...jokerSet].map((card) => card.id);
                const declarationMap = Object.fromEntries(jokerSet.map((card, jokerIndex) => [card.id, declarations[jokerIndex]]));
                candidates.push({ ids, declarations: declarationMap });
                return;
              }
              for (const suit of freeSuits) {
                if (declarations.some((entry) => entry.suit === suit)) continue;
                assign(index + 1, [...declarations, { rank, suit }]);
              }
            };
            assign(0, []);
          }
        }
      }
    }
  }

  if (required === null || required === 4) {
    for (const suit of SUITS) {
      for (let start = 0; start <= RANKS.length - 4; start += 1) {
        const run = RANKS.slice(start, start + 4);
        const chosen = [];
        const declarations = {};
        let valid = true;
        for (const rank of run) {
          const card = natural.find((candidate) => candidate.suit === suit && candidate.rank === rank);
          if (card) chosen.push(card);
          else {
            const joker = jokers.find((candidate) => !chosen.some((entry) => entry.id === candidate.id));
            if (!joker) {
              valid = false;
              break;
            }
            chosen.push(joker);
            declarations[joker.id] = { rank, suit };
          }
        }
        if (valid && chosen.some((card) => card.joker)) {
          candidates.push({ ids: chosen.map((card) => card.id), declarations });
        }
      }
    }
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const built = buildPlayCards(player, candidate.ids, candidate.declarations);
    if (built.error || !canPlay(state, built.cards).ok) continue;
    const key = candidate.ids.slice().sort().join("|");
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

export function runCpuTurn(state) {
  if (state.finished || state.pending || state.current === null || state.players[state.current].human) return false;
  const player = state.players[state.current];
  const moves = cpuMoves(state, player);
  if (!moves.length) return passTurn(state, player.id).ok;

  let move = moves[0];
  if (state.difficulty !== "easy") {
    move = moves.reduce((best, candidate) => {
      const bestCardCount = best.ids.length;
      const candidateCardCount = candidate.ids.length;
      const bestRank = Math.max(...best.ids.map((id) => {
        const card = player.hand.find((entry) => entry.id === id);
        return RANK_VALUE.get(card.joker ? best.declarations[id]?.rank : card.rank) ?? 0;
      }));
      const candidateRank = Math.max(...candidate.ids.map((id) => {
        const card = player.hand.find((entry) => entry.id === id);
        return RANK_VALUE.get(card.joker ? candidate.declarations[id]?.rank : card.rank) ?? 0;
      }));
      return candidateCardCount > bestCardCount ||
        (state.difficulty === "hard" && candidateCardCount === bestCardCount && candidateRank < bestRank)
        ? candidate
        : best;
    }, moves[0]);
  }
  const result = playCards(state, player.id, move.ids, move.declarations);
  if (!result.ok) return false;

  while (state.pending && state.players[state.pending.playerId] && !state.players[state.pending.playerId].human) {
    const pending = state.pending;
    const actor = state.players[pending.playerId];
    if (pending.type === "threshold") {
      resolveEffect(state, actor.id, { direction: actor.hand.length > 5 ? "under" : "over" });
    } else if (pending.type === "give") {
      const target = livingPlayers(state).filter((candidate) => candidate.id !== actor.id)
        .sort((left, right) => right.hand.length - left.hand.length)[0];
      const chosen = actor.hand.slice(-pending.count);
      resolveEffect(state, actor.id, { targetId: target?.id, cardIds: chosen.map((card) => card.id) });
    } else if (pending.type === "discard") {
      const chosen = actor.hand.slice(0, pending.count);
      resolveEffect(state, actor.id, { cardIds: chosen.map((card) => card.id) });
    } else {
      const rank = actor.hand.find((card) => !card.joker)?.rank ?? "Joker";
      resolveEffect(state, actor.id, { ranks: [rank] });
    }
  }
  return true;
}

export function getCardPresentation(card) {
  if (card.joker) {
    const declaration = card.declaration;
    return {
      label: declaration ? `JOKER ${declaration.suit}${declaration.rank}` : "JOKER",
      rank: declaration?.rank ?? "★",
      suit: declaration?.suit ?? "★",
      red: declaration ? RED_SUITS.has(declaration.suit) : false,
      joker: true
    };
  }
  return { label: `${card.suit}${card.rank}`, rank: card.rank, suit: card.suit, red: RED_SUITS.has(card.suit), joker: false };
}

export function getRuleCombinations(state) {
  const field = state?.field;
  if (!field?.cards?.length || state.finished || state.pending) return [];
  if (field.cards.length === 1 && field.cards[0].joker) {
    return [{ label: "♠3（実物のスペードの3でJoker返し）", type: "counter" }];
  }
  const groupRank = getGroupRank(field.cards);
  if (groupRank === "8" && field.cards.length <= 2) {
    return field.cards.length * 2 <= 4
      ? [{
        label: `4を${field.cards.length * 2}枚（8切り返し）`,
        type: "counter"
      }]
      : [];
  }
  if (groupRank === "8") return [];

  const previousIsStaircase = isStaircase(field.cards);
  if (previousIsStaircase) {
    const start = Math.min(...field.cards.map((card) => RANK_VALUE.get(effectiveRank(card))));
    const nextStart = start + (state.revolution ? -field.cards.length : field.cards.length);
    const ranks = RANKS.slice(nextStart, nextStart + 4);
    if (ranks.length !== 4 || nextStart < 0 || nextStart + 4 > RANKS.length) return [];
    if (state.jConstraint && ranks.some((rank) => state.jConstraint.direction === "under"
      ? RANK_VALUE.get(rank) > RANK_VALUE.get("J")
      : RANK_VALUE.get(rank) < RANK_VALUE.get("J"))) return [];
    const suit = effectiveSuit(field.cards[0]);
    return [{
      label: `${suit}${ranks.join("・")}の階段`,
      type: "staircase"
    }];
  }

  const count = field.cards.length;
  const previousRank = groupRank;
  const direction = state.revolution ? -1 : 1;
  const nextSequenceRank = previousRank && RANK_VALUE.has(previousRank)
    ? RANK_VALUE.get(previousRank) + direction
    : null;
  const hasJConstraint = Boolean(state.jConstraint);
  const validRank = (rank) => {
    const value = RANK_VALUE.get(rank);
    if (hasJConstraint && (state.jConstraint.direction === "under"
      ? value > RANK_VALUE.get("J")
      : value < RANK_VALUE.get("J"))) return false;
    if (state.sequenceLock) return value === nextSequenceRank;
    if (hasJConstraint) return true;
    return strength(rank, state.revolution) > strength(previousRank, state.revolution);
  };
  const suitOptions = state.suitLock ? 1 : 4;
  const combinationsByRank = RANKS.filter(validRank).map((rank) => ({
    label: count === 1
      ? `${rank}（${suitOptions}柄${state.suitLock ? "" : "＋Joker宣言"}）`
      : `${rank}を${count}枚（同数字・柄違い${state.suitLock ? "" : "・Joker代用可"}）`,
    type: "group",
    rank
  })).filter((entry) => !(state.suitLock && count > 1));

  return combinationsByRank;
}

export function createOnlineGame(names, random = Math.random) {
  if (!Array.isArray(names) || names.length < 2 || names.length > MAX_PLAYERS ||
    names.some((name) => typeof name !== "string" || !name.trim())) {
    throw new RangeError(`オンラインゲームは2〜${MAX_PLAYERS}人で、全員の名前が必要です。`);
  }
  onlineState = createGame(names.length, "normal", random);
  onlineState.players.forEach((player, index) => {
    player.name = names[index].trim().slice(0, 24);
    player.human = true;
    player.left = false;
  });
  onlineState.logs = [`ゲーム開始。${names.length}人で対戦します。`];
  return getOnlineSnapshot();
}

export function getOnlineSnapshot(viewerId = null, revealHands = false) {
  if (!onlineState) return null;
  const state = onlineState;
  const copyCard = (card) => ({
    ...card,
    ...(card.declaration ? { declaration: { ...card.declaration } } : {})
  });
  return {
    current: state.current,
    field: state.field ? {
      ...state.field,
      cards: state.field.cards.map(copyCard)
    } : null,
    lastPlayer: state.lastPlayer,
    passed: [...state.passed],
    revolution: state.revolution,
    jConstraint: state.jConstraint ? { ...state.jConstraint } : null,
    suitLock: state.suitLock,
    sequenceLock: state.sequenceLock,
    pending: state.pending ? { ...state.pending, from: state.pending.playerId } : null,
    finished: state.finished,
    placements: [...state.placements],
    logs: state.logs.slice(0, 40),
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      ...(player.id === viewerId || (state.finished && revealHands)
        ? { hand: player.hand.map(copyCard) }
        : {}),
      left: Boolean(player.left),
      out: !player.hand.length && !player.left,
      place: player.place
    }))
  };
}

export function applyOnlineAction(playerId, action) {
  const state = onlineState;
  if (!state || state.finished) return { ok: false, reason: "ゲームは進行中ではありません。" };
  const player = state.players[playerId];
  if (!Number.isInteger(playerId) || !player || player.left ||
    (!player.hand.length && state.pending?.playerId !== playerId)) {
    return { ok: false, reason: "このプレイヤーは参加していません。" };
  }

  let result;
  if (state.pending) {
    if (state.pending.playerId !== playerId || action?.type !== "effect") {
      return { ok: false, reason: "効果の選択を待っています。" };
    }
    result = resolveEffect(state, playerId, action);
  } else if (action?.type === "pass") {
    result = passTurn(state, playerId);
  } else if (action?.type === "play" && Array.isArray(action.cards)) {
    const declarations = {};
    const ids = [];
    for (const selection of action.cards) {
      if (!selection || typeof selection.id !== "string") {
        return { ok: false, reason: "選択したカードが正しくありません。" };
      }
      ids.push(selection.id);
      const card = player.hand.find((candidate) => candidate.id === selection.id);
      if (card?.joker) {
        declarations[selection.id] = {
          rank: selection.assignedRank,
          suit: selection.assignedSuit
        };
      }
    }
    result = playCards(state, playerId, ids, declarations);
  } else {
    return { ok: false, reason: "操作内容が正しくありません。" };
  }

  return result.ok
    ? { ok: true, snapshot: getOnlineSnapshot() }
    : result;
}

export function markOnlinePlayerLeft(playerId) {
  const state = onlineState;
  if (!state || state.finished) return getOnlineSnapshot();
  const player = state.players[playerId];
  if (!player || player.left) return getOnlineSnapshot();

  player.left = true;
  state.passed.delete(playerId);
  state.selectedIds.clear();
  if (state.pending?.playerId === playerId) state.pending = null;
  addLog(state, `${player.name}がゲーム途中で退出しました。`);

  if (state.lastPlayer === playerId && state.field) {
    addLog(state, "場を出したプレイヤーが退出したため、場を流します。");
    clearField(state, playerId);
  } else if (state.current === playerId) {
    if (state.field) {
      const responders = livingPlayers(state).filter((candidate) => candidate.id !== state.lastPlayer);
      if (responders.every((candidate) => state.passed.has(candidate.id))) {
        const lastPlayer = state.lastPlayer;
        addLog(state, "退出により残りの参加者が全員パスしたため場が流れます。");
        clearField(state, lastPlayer);
      } else {
        state.current = nextLiving(state, playerId, (candidate) => !state.passed.has(candidate.id));
      }
    } else {
      state.current = nextLiving(state, playerId);
    }
  } else if (state.field) {
    const responders = livingPlayers(state).filter((candidate) => candidate.id !== state.lastPlayer);
    if (responders.every((candidate) => state.passed.has(candidate.id))) {
      const lastPlayer = state.lastPlayer;
      addLog(state, "退出により残りの参加者が全員パスしたため場が流れます。");
      clearField(state, lastPlayer);
    }
  }

  checkFinished(state);
  return getOnlineSnapshot();
}
