import {
  RANKS,
  SUITS,
  createGame,
  getCardPresentation,
  getRuleCombinations,
  passTurn,
  playCards,
  resolveEffect,
  runCpuTurn,
  toggleSelectedCard
} from "./game-engine.mjs";
import { readShowCombinations, saveShowCombinations } from "./preferences.mjs";

const $ = (selector) => document.querySelector(selector);
const elements = {
  setup: $("#setup"),
  game: $("#game"),
  lobby: $("#online-lobby"),
  playerCount: $("#player-count"),
  cpuLevel: $("#cpu-level"),
  start: $("#start-game"),
  newGame: $("#new-game"),
  round: $("#round-info"),
  revolution: $("#revolution-banner"),
  notice: $("#notice"),
  table: $("#table"),
  fieldRule: $("#field-rule"),
  fieldCards: $("#field-cards"),
  hand: $("#hand"),
  selectionCount: $("#selection-count"),
  effects: $("#effect-controls"),
  play: $("#play"),
  pass: $("#pass"),
  log: $("#log"),
  combinationsSetup: $("#show-combinations-setup"),
  combinationsGame: $("#show-combinations-game"),
  combinations: $("#game-combinations"),
  revealedHands: $("#revealed-hands"),
  revealedHandsList: $("#revealed-hands-list")
};

let game = null;
let cpuTimer = null;
let showCombinations = readShowCombinations();
elements.combinationsSetup.checked = showCombinations;
elements.combinationsGame.checked = showCombinations;

function createCard(card, selected, interactive) {
  const presentation = getCardPresentation(card);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `card${presentation.red ? " red" : ""}${presentation.joker ? " joker" : ""}${selected ? " selected" : ""}`;
  button.setAttribute("aria-label", presentation.label);
  button.setAttribute("aria-pressed", String(selected));
  button.title = presentation.label;

  const rank = document.createElement("span");
  rank.className = "rank";
  rank.textContent = presentation.rank;
  const suit = document.createElement("span");
  suit.className = "suit";
  suit.textContent = presentation.suit;
  button.append(rank, suit);

  if (interactive) {
    button.addEventListener("click", () => {
      toggleSelectedCard(game, card.id);
      render();
    });
  } else {
    button.tabIndex = -1;
    button.setAttribute("aria-disabled", "true");
  }
  return button;
}

function addLabelledSelect(root, labelText, id, values, selectedValue, valueLabel = (value) => value) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  select.id = id;
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = valueLabel(value);
    option.selected = value === selectedValue;
    select.append(option);
  }
  label.append(select);
  root.append(label);
  return select;
}

function getJokerDefaults(selectedCards) {
  const jokers = selectedCards.filter((card) => card.joker);
  const natural = selectedCards.filter((card) => !card.joker);
  const declarations = new Map();
  let run = null;

  if (selectedCards.length === 4 && natural.length && natural.every((card) => card.suit === natural[0].suit)) {
    for (let start = 0; start <= RANKS.length - 4; start += 1) {
      const ranks = RANKS.slice(start, start + 4);
      if (natural.every((card) => ranks.includes(card.rank))) {
        run = { suit: natural[0].suit, missing: ranks.filter((rank) => !natural.some((card) => card.rank === rank)) };
        break;
      }
    }
  }
  const sameRank = natural.length > 0 && natural.every((card) => card.rank === natural[0].rank);
  const usedSuits = new Set(natural.map((card) => card.suit));
  const freeSuits = SUITS.filter((suit) => !usedSuits.has(suit));

  jokers.forEach((card, index) => {
    declarations.set(card.id, {
      rank: run?.missing[index] ?? (sameRank ? natural[0].rank : "3"),
      suit: run?.suit ?? freeSuits[index] ?? SUITS[index % SUITS.length]
    });
  });
  return declarations;
}

function renderJokerControls(root, selectedCards) {
  const jokers = selectedCards.filter((card) => card.joker);
  if (!jokers.length) return new Map();

  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Jokerの宣言（カード自体はJokerのまま）";
  fieldset.append(legend);
  const defaults = getJokerDefaults(selectedCards);
  const declarations = new Map();
  jokers.forEach((card, index) => {
    const row = document.createElement("div");
    row.className = "joker-choice";
    const rank = addLabelledSelect(row, `Joker ${index + 1}の数字`, `joker-rank-${index}`, RANKS,
      defaults.get(card.id).rank);
    const suit = addLabelledSelect(row, `Joker ${index + 1}の柄`, `joker-suit-${index}`, SUITS,
      defaults.get(card.id).suit);
    fieldset.append(row);
    declarations.set(card.id, { rank, suit });
  });
  root.append(fieldset);
  return declarations;
}

function renderEffectControls(root, selectedCards) {
  const pending = game.pending;
  const jokerControls = pending ? new Map() : renderJokerControls(root, selectedCards);
  if (pending?.playerId !== 0) return jokerControls;

  if (pending.type === "threshold") {
    addLabelledSelect(root, "次の人が出す数字", "effect-direction", ["over", "under"], "over",
      (value) => value === "over" ? "J以上" : "J以下");
  } else if (pending.type === "give") {
    const targets = game.players.filter((player) => player.id !== 0 && player.hand.length > 0);
    addLabelledSelect(root, "渡す相手", "give-target", targets.map((player) => String(player.id)),
      targets[0] ? String(targets[0].id) : "", (id) => game.players[Number(id)].name);
  } else if (pending.type === "q") {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `全員が捨てる数字（最大${pending.count}種類）`;
    fieldset.append(legend);
    for (const rank of [...RANKS, "Joker"]) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "q-rank";
      input.value = rank;
      input.addEventListener("change", () => {
        const checked = [...root.querySelectorAll('input[name="q-rank"]:checked')];
        if (checked.length > pending.count) input.checked = false;
      });
      label.append(input, document.createTextNode(rank));
      fieldset.append(label);
    }
    root.append(fieldset);
  }
  return jokerControls;
}

function renderPossibleCombinations() {
  const fieldIsOpen = Boolean(game?.field?.cards.length);
  elements.combinations.hidden = !showCombinations || !fieldIsOpen;
  if (elements.combinations.hidden) {
    elements.combinations.replaceChildren();
    return;
  }

  const heading = document.createElement("strong");
  heading.textContent = "ルール上出せる組み合わせ";
  const note = document.createElement("span");
  note.textContent = "（自分や他プレイヤーの手札は考慮しません）";
  const list = document.createElement("ul");
  const possibilities = getRuleCombinations(game);
  if (!possibilities.length) {
    const item = document.createElement("li");
    item.textContent = "出せる組み合わせはありません。";
    list.append(item);
  } else {
    possibilities.forEach(({ label }) => {
      const item = document.createElement("li");
      item.textContent = label;
      list.append(item);
    });
  }
  elements.combinations.replaceChildren(heading, note, list);
}

function renderRevealedHands() {
  elements.revealedHands.hidden = !game.finished;
  if (!game.finished) {
    elements.revealedHandsList.replaceChildren();
    return;
  }
  elements.revealedHandsList.replaceChildren(...game.players.map((player) => {
    const section = document.createElement("section");
    section.className = "revealed-player";
    const heading = document.createElement("h3");
    heading.textContent = `${player.place ? `${player.place}位：` : ""}${player.name}（${player.hand.length}枚）`;
    const cards = document.createElement("div");
    cards.className = "cards";
    player.hand.forEach((card) => cards.append(createCard(card, false, false)));
    if (!player.hand.length) {
      const empty = document.createElement("span");
      empty.className = "empty";
      empty.textContent = "手札なし";
      cards.append(empty);
    }
    section.append(heading, cards);
    return section;
  }));
}

function render() {
  if (!game) return;
  elements.setup.hidden = true;
  elements.game.hidden = false;
  const current = game.current === null ? null : game.players[game.current];
  const humanTurn = current?.id === 0;
  const human = game.players[0];
  const selectedCards = human.hand.filter((card) => game.selectedIds.has(card.id));
  const pending = game.pending;
  const choosingCards = pending?.playerId === 0 && ["give", "discard"].includes(pending.type);

  elements.round.textContent = `${game.revolution ? "革命中" : "通常"} / ${game.players.length}人`;
  elements.revolution.hidden = !game.revolution;
  elements.notice.textContent = game.finished
    ? "ゲーム終了。新しいゲームで再戦できます。"
    : pending?.playerId === 0
      ? pending.type === "threshold" ? "Jの効果：次の人に出す数字を指定してください。"
        : pending.type === "give" ? `7の効果：渡すカードを最大${pending.count}枚選んでください。`
          : pending.type === "discard" ? `10の効果：捨てるカードを最大${pending.count}枚選んでください。`
            : `Qの効果：捨てる数字を最大${pending.count}種類選んでください。`
      : game.notice || (current ? `${current.name}のターン` : "ゲーム終了");

  elements.table.replaceChildren();
  for (const player of game.players) {
    const seat = document.createElement("article");
    seat.className = `seat${player.id === game.current ? " active" : ""}${player.human ? " human" : ""}`;
    const name = document.createElement("div");
    name.className = "seat-name";
    const playerName = document.createElement("span");
    playerName.textContent = player.name;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = player.human ? "YOU" : "CPU";
    name.append(playerName, badge);
    const meta = document.createElement("div");
    meta.className = "seat-meta";
    meta.textContent = player.place ? `${player.place}位` : `${player.hand.length}枚`;
    seat.append(name, meta);
    elements.table.append(seat);
  }

  elements.fieldCards.replaceChildren();
  if (game.field) {
    game.field.cards.forEach((card) => elements.fieldCards.append(createCard(card, false, false)));
    const locks = [
      game.suitLock ? `${game.suitLock}縛り` : "",
      game.sequenceLock ? "数字縛り" : "",
      game.jConstraint ? `J${game.jConstraint.direction === "under" ? "以下" : "以上"}指定` : ""
    ].filter(Boolean);
    elements.fieldRule.textContent = `${game.field.cards.length}枚 / ${game.field.rank}${locks.length ? ` / ${locks.join("・")}` : ""}`;
  } else {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "場は空です";
    elements.fieldCards.append(empty);
    elements.fieldRule.textContent = "次は何枚でも出せます";
  }
  elements.combinationsGame.checked = showCombinations;
  renderPossibleCombinations();

  elements.hand.replaceChildren();
  human.hand.forEach((card) => {
    const selectable = !game.finished && humanTurn &&
      (!pending || choosingCards);
    elements.hand.append(createCard(card, game.selectedIds.has(card.id), selectable));
  });
  elements.selectionCount.textContent = `${game.selectedIds.size}枚選択`;
  elements.effects.replaceChildren();
  renderEffectControls(elements.effects, selectedCards);

  elements.play.textContent = pending?.playerId === 0 ? "効果を確定" : "出す";
  elements.play.disabled = game.finished || !humanTurn ||
    (pending ? pending.playerId !== 0 : game.selectedIds.size === 0);
  elements.pass.disabled = game.finished || !humanTurn || Boolean(pending);

  elements.log.replaceChildren();
  game.logs.forEach((message, index) => {
    const item = document.createElement("li");
    item.textContent = message;
    if (index === 0 && /上がり|終了/.test(message)) item.classList.add("winner");
    elements.log.append(item);
  });
  renderRevealedHands();

  if (!game.finished && current && !current.human && !pending && cpuTimer === null) {
    cpuTimer = window.setTimeout(() => {
      cpuTimer = null;
      runCpuTurn(game);
      render();
    }, 450);
  }
}

function handlePlay() {
  if (!game || game.current !== 0) return;
  const pending = game.pending;
  let result;
  if (pending?.playerId === 0) {
    if (pending.type === "threshold") {
      result = resolveEffect(game, 0, { direction: $("#effect-direction").value });
    } else if (pending.type === "give") {
      result = resolveEffect(game, 0, {
        targetId: Number($("#give-target").value),
        cardIds: [...game.selectedIds]
      });
    } else if (pending.type === "discard") {
      result = resolveEffect(game, 0, { cardIds: [...game.selectedIds] });
    } else {
      result = resolveEffect(game, 0, {
        ranks: [...document.querySelectorAll('input[name="q-rank"]:checked')].map((input) => input.value)
      });
    }
  } else {
    const human = game.players[0];
    const declarations = {};
    for (const id of game.selectedIds) {
      const card = human.hand.find((candidate) => candidate.id === id);
      if (card?.joker) {
        const index = human.hand.filter((candidate) =>
          candidate.joker && game.selectedIds.has(candidate.id)
        ).findIndex((candidate) => candidate.id === id);
        declarations[id] = {
          rank: $(`#joker-rank-${index}`).value,
          suit: $(`#joker-suit-${index}`).value
        };
      }
    }
    result = playCards(game, 0, [...game.selectedIds], declarations);
  }
  if (result?.ok) game.notice = "";
  render();
}

elements.start.addEventListener("click", () => {
  if (cpuTimer !== null) window.clearTimeout(cpuTimer);
  cpuTimer = null;
  game = createGame(Number(elements.playerCount.value), elements.cpuLevel.value);
  elements.lobby.hidden = true;
  render();
});
function updateCombinationSetting(enabled) {
  showCombinations = enabled;
  saveShowCombinations(enabled);
  elements.combinationsSetup.checked = enabled;
  elements.combinationsGame.checked = enabled;
  if (game) renderPossibleCombinations();
}
elements.combinationsSetup.addEventListener("change", () => {
  updateCombinationSetting(elements.combinationsSetup.checked);
});
elements.combinationsGame.addEventListener("change", () => {
  updateCombinationSetting(elements.combinationsGame.checked);
});
elements.newGame.addEventListener("click", () => {
  if (cpuTimer !== null) window.clearTimeout(cpuTimer);
  cpuTimer = null;
  game = null;
  elements.game.hidden = true;
  elements.setup.hidden = false;
  elements.lobby.hidden = false;
});
elements.play.addEventListener("click", handlePlay);
elements.pass.addEventListener("click", () => {
  if (!game) return;
  const result = passTurn(game, 0);
  if (result.ok) game.notice = "";
  render();
});
