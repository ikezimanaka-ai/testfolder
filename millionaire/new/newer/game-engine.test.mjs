import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOnlineAction,
  createDeck,
  createGame,
  createOnlineGame,
  getOnlineSnapshot,
  getRuleCombinations,
  markOnlinePlayerLeft,
  passTurn,
  playCards,
  resolveEffect
} from "./game-engine.mjs";

const deck = createDeck();
const card = (id) => {
  const result = deck.find((entry) => entry.id === id);
  assert.ok(result, `unknown card: ${id}`);
  return result;
};

function gameWithHands(...hands) {
  const state = createGame(hands.length, "normal", () => 0);
  state.players.forEach((player, index) => {
    player.hand = hands[index].map((id) => card(id));
    player.place = null;
  });
  state.current = 0;
  state.placements = [];
  state.finished = false;
  return state;
}

test("deck contains 52 distinct ordinary cards and two physical Jokers", () => {
  const cards = createDeck();
  assert.equal(cards.length, 54);
  assert.equal(new Set(cards.map((entry) => entry.id)).size, 54);
  assert.equal(cards.filter((entry) => entry.joker).length, 2);
});

test("Joker declarations are required, but do not change the physical card identity", () => {
  const state = gameWithHands(["joker-1", "♥:4"], ["♠:3", "♥:5"]);
  const missingDeclaration = playCards(state, 0, ["joker-1"]);
  assert.equal(missingDeclaration.ok, false);
  assert.equal(state.players[0].hand.length, 2);

  const declared = playCards(state, 0, ["joker-1"], {
    "joker-1": { rank: "3", suit: "♠" }
  });
  assert.equal(declared.ok, true);
  assert.equal(state.field.cards[0].joker, true);
  assert.deepEqual(state.field.cards[0].declaration, { rank: "3", suit: "♠" });
});

test("only the actual spade three counters a single physical Joker", () => {
  const state = gameWithHands(["joker-1", "♥:4"], ["♠:3", "♥:5"]);
  assert.equal(playCards(state, 0, ["joker-1"], {
    "joker-1": { rank: "3", suit: "♠" }
  }).ok, true);
  assert.equal(state.current, 1);
  assert.equal(playCards(state, 1, ["♠:3"]).ok, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 1);
  assert.match(state.logs[0], /実物のスペードの3/);
});

test("multiple 3s clear immediately and the player who played them leads", () => {
  const state = gameWithHands(["♠:3", "♥:3", "♣:4"], ["♠:5", "♣:6"]);
  assert.equal(playCards(state, 0, ["♠:3", "♥:3"]).ok, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 0);
  assert.equal(state.players[0].place, null);
});

test("four-of-a-kind revolution still applies when its 3 effect clears the field", () => {
  const state = gameWithHands(["♠:3", "♥:3", "♦:3", "♣:3", "♠:4"], ["♠:5", "♣:6"]);
  assert.equal(playCards(state, 0, ["♠:3", "♥:3", "♦:3", "♣:3"]).ok, true);
  assert.equal(state.revolution, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 0);
});

test("a Joker declared as 5 takes the 5 effect while remaining a Joker", () => {
  const state = gameWithHands(
    ["joker-1", "♠:5", "♥:4"],
    ["♠:6"],
    ["♠:7"],
    ["♠:8"]
  );
  assert.equal(playCards(state, 0, ["joker-1", "♠:5"], {
    "joker-1": { rank: "5", suit: "♥" }
  }).ok, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 3);
  assert.equal(state.players[0].hand.some((entry) => entry.id === "joker-1"), false);
  assert.match(state.logs[0], /5効果/);
});

test("a 5 skips the requested number of active players, then clears the field", () => {
  const state = gameWithHands(
    ["♠:5", "♥:5", "♣:4"],
    ["♠:6"],
    ["♠:7"],
    ["♠:8"]
  );
  assert.equal(playCards(state, 0, ["♠:5", "♥:5"]).ok, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 3);
});

test("a 5 skips the sole opponent and returns the lead to its player", () => {
  const state = gameWithHands(["♠:5", "♥:4"], [], [], ["♠:6"]);
  assert.equal(playCards(state, 0, ["♠:5"]).ok, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 0);
});

test("four matching 4s can clear a pair of 8s and return the lead to the 4-player", () => {
  const state = gameWithHands(
    ["♠:8", "♥:8", "♦:6"],
    ["♠:4", "♥:4", "♦:4", "♣:4", "♥:5"]
  );
  assert.equal(playCards(state, 0, ["♠:8", "♥:8"]).ok, true);
  assert.equal(playCards(state, 1, ["♠:4", "♥:4", "♦:4", "♣:4"]).ok, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 1);
  assert.equal(state.lastPlayer, null);
  assert.match(state.logs[0], /防ぎました/);
});

test("a single Joker can be played above a 2 and it can be answered by ♠3", () => {
  const state = gameWithHands(["♠:2", "♠:3", "♥:4"], ["joker-1", "♥:5"]);
  assert.equal(playCards(state, 0, ["♠:2"]).ok, true);
  assert.equal(playCards(state, 1, ["joker-1"], {
    "joker-1": { rank: "2", suit: "♠" }
  }).ok, true);
  assert.equal(state.field.rank, "Joker");
  assert.equal(playCards(state, 0, ["♠:3"]).ok, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 0);
});

test("an 8 answered with 4 clears the field and returns the lead to the 4-player", () => {
  const state = gameWithHands(
    ["♠:8", "♥:4"],
    ["♠:4", "♥:4", "♦:5"]
  );
  assert.equal(playCards(state, 0, ["♠:8"]).ok, true);
  assert.equal(playCards(state, 1, ["♠:4", "♥:4"]).ok, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 1);
  assert.equal(state.lastPlayer, null);
});

test("a staircase cannot answer a four-of-a-kind field", () => {
  const state = gameWithHands(
    ["♠:4", "♥:4", "♦:4", "♣:4", "♠:A"],
    ["♠:5", "♠:6", "♠:7", "♠:8", "♥:A"]
  );
  assert.equal(playCards(state, 0, ["♠:4", "♥:4", "♦:4", "♣:4"]).ok, true);
  const result = playCards(state, 1, ["♠:5", "♠:6", "♠:7", "♠:8"]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /階段/);
  assert.equal(state.players[1].hand.length, 5);
});

test("a staircase response must continue with the same suit", () => {
  const state = gameWithHands(
    ["♠:3", "♠:4", "♠:5", "♠:6", "♠:A"],
    ["♥:7", "♥:8", "♥:9", "♥:10", "♥:A"]
  );
  assert.equal(playCards(state, 0, ["♠:3", "♠:4", "♠:5", "♠:6"]).ok, true);
  const result = playCards(state, 1, ["♥:7", "♥:8", "♥:9", "♥:10"]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /同じ柄/);
});

test("passing by all responders clears the field and returns the lead", () => {
  const state = gameWithHands(["♠:6", "♥:4"], ["♠:7", "♥:5"]);
  assert.equal(playCards(state, 0, ["♠:6"]).ok, true);
  assert.equal(passTurn(state, 1).ok, true);
  assert.equal(state.field, null);
  assert.equal(state.current, 0);
});

test("J effect requires a valid direction and applies to the next play", () => {
  const state = gameWithHands(["♠:J", "♥:4"], ["♠:10", "♥:Q"]);
  assert.equal(playCards(state, 0, ["♠:J"]).ok, true);
  assert.equal(resolveEffect(state, 0, { direction: "sideways" }).ok, false);
  assert.equal(resolveEffect(state, 0, { direction: "under" }).ok, true);
  assert.equal(playCards(state, 1, ["♥:Q"]).ok, false);
  assert.equal(playCards(state, 1, ["♠:10"]).ok, true);
});

test("Q treats a declared Joker as a physical Joker when discarding", () => {
  const state = gameWithHands(["♠:Q", "♥:4"], ["joker-1", "♥:5"]);
  assert.equal(playCards(state, 0, ["♠:Q"]).ok, true);
  assert.equal(resolveEffect(state, 0, { ranks: ["Joker"] }).ok, true);
  assert.deepEqual(state.players[1].hand.map((entry) => entry.id), ["♥:5"]);
  assert.equal(state.current, 1);
});

test("invalid actions do not remove cards from a hand", () => {
  const state = gameWithHands(["♠:3", "♥:4"], ["♣:4", "♦:5"]);
  const result = playCards(state, 0, ["♠:3", "♣:4"]);
  assert.equal(result.ok, false);
  assert.equal(state.players[0].hand.length, 2);
});

test("online snapshots keep private hands hidden and safely advance after a player leaves", () => {
  const initial = createOnlineGame(["Alpha", "Bravo", "Charlie"]);
  assert.equal(initial.players[0].hand, undefined);
  assert.equal(getOnlineSnapshot(0).players[0].hand.length, 18);
  assert.equal(initial.players[1].hand, undefined);

  const pass = applyOnlineAction(0, { type: "pass" });
  assert.equal(pass.ok, true);
  assert.equal(pass.snapshot.current, 1);
  const afterLeave = markOnlinePlayerLeft(1);
  assert.equal(afterLeave.players[1].left, true);
  assert.equal(afterLeave.current, 2);
});

test("an unrelated online departure does not skip the player whose turn it is", () => {
  createOnlineGame(["Alpha", "Bravo", "Charlie", "Delta"]);
  const hand = getOnlineSnapshot(0).players[0].hand;
  const leadCard = hand.find((entry) => !entry.joker && ["3", "4", "6", "8", "9", "K", "A", "2"].includes(entry.rank));
  assert.ok(leadCard);
  assert.equal(applyOnlineAction(0, { type: "play", cards: [{ id: leadCard.id }] }).ok, true);
  assert.equal(getOnlineSnapshot().current, 1);

  assert.equal(markOnlinePlayerLeft(2).current, 1);
  assert.equal(markOnlinePlayerLeft(1).current, 3);
});

test("online play preserves physical Joker identity and its separate declaration", () => {
  createOnlineGame(["Alpha", "Bravo"], () => 0);
  const joker = getOnlineSnapshot(0).players[0].hand.find((entry) => entry.joker);
  assert.ok(joker);
  const result = applyOnlineAction(0, {
    type: "play",
    cards: [{ id: joker.id, assignedRank: "3", assignedSuit: "♠" }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.field.cards[0].id, joker.id);
  assert.equal(result.snapshot.field.cards[0].joker, true);
  assert.deepEqual(result.snapshot.field.cards[0].declaration, { rank: "3", suit: "♠" });
});

test("rule combination suggestions ignore players' hands and disappear on an empty field", () => {
  const state = gameWithHands(["♠:6", "♥:4"], ["♠:7", "♥:5"]);
  assert.deepEqual(getRuleCombinations(state), []);
  assert.equal(playCards(state, 0, ["♠:6"]).ok, true);
  const suggestions = getRuleCombinations(state);
  assert.ok(suggestions.some((entry) => entry.rank === "7"));
  state.players[0].hand = [];
  assert.deepEqual(getRuleCombinations(state), suggestions);
});

test("rule combination suggestions show only the physical spade-three counter for a Joker", () => {
  const state = gameWithHands(["joker-1", "♥:4"], ["♠:3", "♥:5"]);
  assert.equal(playCards(state, 0, ["joker-1"], {
    "joker-1": { rank: "K", suit: "♦" }
  }).ok, true);
  assert.deepEqual(getRuleCombinations(state), [{
    label: "♠3（実物のスペードの3でJoker返し）",
    type: "counter"
  }]);
});

test("completed online games reveal every remaining hand only in the final snapshot", () => {
  createOnlineGame(["Alpha", "Bravo"], () => 0);
  assert.equal(getOnlineSnapshot().players.every((player) => player.hand === undefined), true);
  const finished = markOnlinePlayerLeft(1);
  assert.equal(finished.finished, true);
  assert.equal(getOnlineSnapshot().players.every((player) => player.hand === undefined), true);
  const revealed = getOnlineSnapshot(null, true);
  assert.equal(revealed.players.every((player) => Array.isArray(player.hand)), true);
});

test("offline final standings retain the final hands for the results view", () => {
  const state = gameWithHands(["♠:3"], ["♥:4"]);
  assert.equal(playCards(state, 0, ["♠:3"]).ok, true);
  assert.equal(state.finished, true);
  assert.deepEqual(state.placements, [0, 1]);
  assert.deepEqual(state.players.map((player) => player.hand.map((entry) => entry.id)), [[], ["♥:4"]]);
});
