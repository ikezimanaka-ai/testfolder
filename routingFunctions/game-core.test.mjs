import test from "node:test";
import assert from "node:assert/strict";
import {
  PLOT, formulaDifficulty, createFormula, createHazardBurst, formulaPoint, formulaHitsPlayer, hazardsPerBurst, formulaWarningDuration, HAZARD_DURATION, damageForStage,
  availableCheckpoints, createRunState, CARD_POOL, applyDamage, drawCards, advanceJumpPhysics,
} from "./game-core.js";

test("function families unlock in increasing complexity", () => {
  assert.equal(formulaDifficulty(1).name, "一次関数");
  assert.equal(formulaDifficulty(3).name, "二次関数");
  assert.equal(formulaDifficulty(6).name, "三次関数");
  assert.equal(formulaDifficulty(9).name, "三角関数");
  assert.equal(formulaDifficulty(27).name, "高次・区分関数");
  assert.equal(createFormula(1).label, "y = 2x+1");
  assert.equal(createFormula(1, 8).label, "y = 15");
  assert.equal(createFormula(1, 9).label, "x = 20");
  assert.match(createFormula(3, 1).label, /^y = (?:−\d+|\(1\/\d+\))?x²/);
  assert.match(createFormula(3, 1).label, /^y = \(1\/2\)x²/);
  assert.match(createFormula(6, 8).label, /^y = 2x³−2$/);
  assert.match(createFormula(6, 2).label, /^y = \(1\/2\)x³−4$/);
  const openingPair = createHazardBurst(1, 0, 2);
  assert.deepEqual(openingPair.map(formula => formula.label), ["y = x−20", "y = x+10"]);
  assert.equal(openingPair[0].fn(0), -20);
  assert.equal(openingPair[1].fn(-30), -20);
  const quadraticBurst = createHazardBurst(3, 0, 3);
  assert.deepEqual(quadraticBurst.map((formula, i) => formula.fn([12, 24, 36][i])), [-20, -20, -20]);
});

test("graph coordinates and vertical-line collision use labeled axes", () => {
  const tangent = createFormula(12, 4);
  assert.match(tangent.label, /tan/);
  assert.ok(Number.isFinite(formulaPoint(tangent, (PLOT.left + PLOT.right) / 2)));
  const vertical = createFormula(1, 9);
  const x = PLOT.left + (20 - PLOT.xMin) / (PLOT.xMax - PLOT.xMin) * (PLOT.right - PLOT.left);
  assert.equal(formulaHitsPlayer(vertical, { x, y: 300, radius: 12 }), true);
  assert.equal(formulaHitsPlayer(vertical, { x: x - 100, y: 300, radius: 12 }), false);
  const horizontal = { kind: "function", fn: () => 0 };
  const playerX = (PLOT.left + PLOT.right) / 2;
  const player = { x: playerX, y: formulaPoint(horizontal, playerX), radius: 12 };
  assert.equal(formulaHitsPlayer(horizontal, player), true);
});

test("function count grows with stage difficulty and damage rises over time", () => {
  assert.equal(hazardsPerBurst(1), 2);
  assert.equal(hazardsPerBurst(3), 3);
  assert.equal(hazardsPerBurst(8), 4);
  assert.equal(hazardsPerBurst(18), 5);
  assert.ok(formulaWarningDuration(1) > formulaWarningDuration(20));
  assert.equal(Math.round(HAZARD_DURATION * 100), 123);
  assert.equal(damageForStage(1), 1);
  assert.ok(damageForStage(24) > damageForStage(1));
});

test("checkpoint options only include reached ten-stage boundaries", () => {
  assert.deepEqual(availableCheckpoints(1), [1]);
  assert.deepEqual(availableCheckpoints(29), [1, 10, 20]);
  assert.deepEqual(availableCheckpoints(30), [1, 10, 20, 30]);
});

test("cards stack, shields persist until they block a hit, and HP damage scales", () => {
  const state = createRunState();
  CARD_POOL.find(card => card.id === "heart").apply(state);
  CARD_POOL.find(card => card.id === "shield").apply(state);
  assert.equal(state.maxHp, 4);
  assert.equal(state.shields, 1);
  assert.equal(applyDamage(state, 12).kind, "shield");
  assert.equal(state.hp, 4);
  assert.equal(applyDamage(state, 12).amount, 2);
  assert.equal(state.hp, 2);
});

test("jump decay slows by 1 while held, then by 3 after release and stays that way until landing", () => {
  let state = { y: 0, vy: 20, onGround: false, jumpReleased: false };
  state = advanceJumpPhysics({ ...state, jumpHeld: true, jumpPressed: false, jumpReleased: false, jumpReleasedSinceLift: state.jumpReleased });
  assert.equal(state.vy, 19);
  state = advanceJumpPhysics({ ...state, jumpHeld: true, jumpPressed: false, jumpReleased: false, jumpReleasedSinceLift: state.jumpReleased });
  assert.equal(state.vy, 18);
  state = advanceJumpPhysics({ ...state, jumpHeld: false, jumpPressed: false, jumpReleased: true, jumpReleasedSinceLift: state.jumpReleased });
  assert.equal(state.vy, 15);
  state = advanceJumpPhysics({ ...state, jumpHeld: true, jumpPressed: false, jumpReleased: false, jumpReleasedSinceLift: state.jumpReleased });
  assert.equal(state.vy, 12);
  assert.equal(state.jumpReleased, true);
  state = advanceJumpPhysics({ ...state, jumpHeld: false, jumpPressed: false, jumpReleased: false, jumpReleasedSinceLift: state.jumpReleased });
  assert.equal(state.vy, 9);
});

test("card offers are distinct", () => {
  const cards = drawCards(10, 3);
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map(card => card.id)).size, 3);
});
