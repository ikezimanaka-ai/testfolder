import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from 'node:module';
import { comparePokerHands, extendedApply, legalReversiMoves, publicPokerState, shufflePokerDeck } from './extra-games.js';

const require = createRequire(import.meta.url);
const engine = require('../table2/engine.js');

test('reversi starts with legal moves and flips disks on a move', () => {
  let state = engine.createState('room', { id: 'host', name: 'Host' });
  state = engine.apply(state, { type: 'add-player', actorId: 'host', player: { id: 'guest', name: 'Guest' } });
  state = extendedApply(state, { type: 'start-game', mode: 'reversi', actorId: 'host' });
  assert.equal(state.game.mode, 'reversi');
  assert.equal(legalReversiMoves(state.game, 'host').length, 4);
  state = extendedApply(state, { type: 'reversi-move', actorId: 'host', x: 2, y: 3 });
  assert.equal(state.game.board[3][2], 'black');
  assert.equal(state.game.board[3][3], 'black');
  assert.equal(state.game.current, 1);
});

test('mahjong accepts a legal tanyao ron and completes the hand', () => {
  const state = engine.createState('room', { id: 'host', name: 'Host' });
  state.players.push({ id: 'south', name: 'South', coins: 0, spectator: false });
  state.mahjongGame = { currentPlayerId: 'host', phase: 'draw', lastDiscardId: 'win', status: 'playing' };
  const hand = [
    ['man',2],['man',3],['man',4],['man',3],['man',4],['man',5],
    ['pin',4],['pin',5],['pin',6],['sou',6],['sou',7],['sou',8],['pin',2]
  ];
  state.mahjongTiles = hand.map(([suit,rank],i)=>({id:`h${i}`,suit,rank,zone:'hand',ownerId:'host'}));
  state.mahjongTiles.push({id:'win',suit:'pin',rank:2,zone:'river',ownerId:'south'});
  const next = extendedApply(state,{type:'mahjong-win',kind:'ron',actorId:'host'});
  assert.equal(next.mahjongGame.status,'finished');
  assert.equal(next.mahjongGame.winnerId,'host');
  assert.equal(next.mahjongGame.winKind,'ron');
});

test('holdem starts a betting round, advances to the flop, and hides opponents cards', () => {
  let state = engine.createState('room', { id: 'host', name: 'Host' });
  state.players.push({ id: 'guest', name: 'Guest', coins: 0, spectator: false });
  state = extendedApply(state, { type: 'start-game', mode: 'holdem', actorId: 'host' });
  assert.equal(state.game.hands.host.length, 2);
  const view = publicPokerState(state, 'guest');
  assert.equal(view.game.hands.host[0].hidden, true);
  assert.equal(view.game.hands.guest[0].id, state.game.hands.guest[0].id);
  state = extendedApply(state, { type: 'poker-action', actorId: 'host', action: { kind: 'call' } });
  state = extendedApply(state, { type: 'poker-action', actorId: 'guest', action: { kind: 'check' } });
  assert.equal(state.game.community.length, 3);
  assert.equal(state.game.round, 'flop');
  for (const round of ['flop', 'turn', 'river']) {
    state = extendedApply(state, { type: 'poker-action', actorId: 'host', action: { kind: 'check' } });
    state = extendedApply(state, { type: 'poker-action', actorId: 'guest', action: { kind: 'check' } });
    if (round === 'flop') assert.equal(state.game.community.length, 4);
    if (round === 'turn') assert.equal(state.game.community.length, 5);
  }
  assert.equal(state.game.status, 'finished');
  assert.ok(state.game.winners.length >= 1);
});

test('five-card draw exchanges selected cards, publishes the dump, and determines a winner without betting', () => {
  let state = engine.createState('room', { id: 'host', name: 'Host' });
  state.players.push({ id: 'guest', name: 'Guest', coins: 0, spectator: false });
  state = extendedApply(state, { type: 'start-game', mode: 'draw-poker', actorId: 'host' });
  assert.equal(state.game.hands.host.length, 5);
  const privateView = publicPokerState(state, 'guest');
  assert.equal(privateView.game.hands.host[0].hidden, true);
  assert.equal(privateView.game.hands.guest[0].id, state.game.hands.guest[0].id);
  assert.equal(privateView.game.deck.length, 0);
  assert.equal(privateView.game.deckCount, 42);
  assert.throws(() => extendedApply(state, { type: 'add-bet', amount: 1, actorId: 'host' }), /賭け金を使いません/);
  const discardedId = state.game.hands.host[0].id;
  state = extendedApply(state, { type: 'poker-action', actorId: 'host', action: { kind: 'draw', cardIds: [discardedId] } });
  assert.equal(state.game.hands.host.length, 5);
  assert.ok(!state.game.hands.host.some(card => card.id === discardedId));
  assert.equal(state.game.discarded[0].id, discardedId);
  assert.equal(state.game.deck.length, 41);
  state = extendedApply(state, { type: 'poker-action', actorId: 'guest', action: { kind: 'draw', cardIds: [] } });
  assert.equal(state.game.status, 'finished');
  assert.ok(state.game.winners.length >= 1);
  assert.deepEqual(state.game.chips, { host: 500, guest: 500 });
  const guestView = publicPokerState(state, 'guest');
  assert.equal(guestView.game.discarded[0].id, discardedId);
  assert.equal(guestView.game.deckCount, 41);
  assert.equal(guestView.game.deck.length, 0);
});

test('draw poker rejects exchanges larger than the remaining deck without mutating state', () => {
  let state = engine.createState('room', { id: 'host', name: 'Host' });
  state.players.push({ id: 'guest', name: 'Guest', coins: 0, spectator: false });
  state = extendedApply(state, { type: 'start-game', mode: 'draw-poker', actorId: 'host' });
  state.game.deck = state.game.deck.slice(0, 1);
  const selected = state.game.hands.host.slice(0, 2).map(card => card.id);
  assert.throws(() => extendedApply(state, { type: 'poker-action', actorId: 'host', action: { kind: 'draw', cardIds: selected } }), /山札は残り1枚/);
  assert.equal(state.game.current, 0);
  assert.equal(state.game.hands.host.length, 5);
});

test('five-card hand ranking compares categories and kickers correctly', () => {
  const royalFlush = [10,11,12,13,1].map((rank,index)=>({suit:'s',rank,id:`r${index}`}));
  const fourAces = [1,1,1,1,13].map((rank,index)=>({suit:['s','h','d','c','s'][index],rank,id:`q${index}`}));
  assert.ok(comparePokerHands(royalFlush, fourAces) > 0);
  const pairWithAce = [{suit:'s',rank:1},{suit:'h',rank:1},{suit:'d',rank:13},{suit:'c',rank:10},{suit:'s',rank:8}];
  const pairWithKing = [{suit:'s',rank:1},{suit:'h',rank:1},{suit:'d',rank:13},{suit:'c',rank:10},{suit:'s',rank:7}];
  assert.ok(comparePokerHands(pairWithAce, pairWithKing) > 0);
  assert.equal(comparePokerHands(pairWithAce, pairWithAce), 0);
});

test('poker deck shuffling changes draw order without adding or losing cards', () => {
  const deck = Array.from({ length: 8 }, (_, id) => id);
  const shuffled = shufflePokerDeck(deck, () => 0);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), deck);
  assert.notDeepEqual(shuffled, deck);
});
