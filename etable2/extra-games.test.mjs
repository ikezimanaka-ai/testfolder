import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from 'node:module';
import { comparePokerHands, extendedApply, legalReversiMoves, publicPokerState, shufflePokerDeck } from './extra-games.js';
import { basePoints, evaluateMahjongWin } from './mahjong-rules.js';

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

test('WRC renhou is five han and does not combine with ordinary yaku', () => {
  const state=engine.createState('room',{id:'host',name:'Host'});
  state.players.push({id:'south',name:'South',coins:0,spectator:false});
  state.mahjongGame={playerIds:['host','south','cpu1','cpu2'],dealerId:'south',phase:'draw',status:'playing',lastDiscardId:'win',scores:{host:30000,south:30000}};
  const hand=[['man',2],['man',3],['man',4],['man',3],['man',4],['man',5],['pin',4],['pin',5],['pin',6],['sou',6],['sou',7],['sou',8],['pin',2]];
  state.mahjongTiles=hand.map(([suit,rank],index)=>({id:`h${index}`,suit,rank,zone:'hand',ownerId:'host'}));
  state.mahjongTiles.push({id:'win',suit:'pin',rank:2,zone:'river',ownerId:'south'});
  const next=extendedApply(state,{type:'mahjong-win',kind:'ron',actorId:'host'});
  assert.deepEqual(next.mahjongGame.winScore.yaku.map(item=>item.name),['人和']);
  assert.equal(next.mahjongGame.winScore.han,5);
});

test('mahjong evaluator counts an open kan as one meld and awards the honor triplet yaku', () => {
  const state = engine.createState('room', { id: 'host', name: 'Host' });
  state.players.push({ id:'south', name:'South', coins:0, spectator:false });
  state.mahjongGame = { playerIds:['host','south','cpu1','cpu2'], dealerId:'south', phase:'draw', status:'playing', seatWindByPlayer:{host:0}, roundWindIndex:0, honba:0, riichiSticks:0 };
  const hand=[['ji',1],['ji',1],['ji',1],['man',2],['man',3],['sou',6],['sou',7],['sou',8],['pin',5],['pin',5]];
  state.mahjongTiles=hand.map(([suit,rank],index)=>({id:`h${index}`,suit,rank,zone:'hand',ownerId:'host'}));
  for(let index=0;index<4;index++)state.mahjongTiles.push({id:`kan${index}`,suit:'sou',rank:1,zone:'meld',ownerId:'host',meldId:'k1',meldKind:'kan',called:index===0});
  const discard={id:'winning',suit:'man',rank:4,zone:'river',ownerId:'south'};state.mahjongTiles.push(discard);
  const score=evaluateMahjongWin(state,'host','ron',discard);
  assert.ok(score);
  assert.ok(score.yaku.some(item=>item.name.includes('役牌')));
  assert.ok(score.fu>=30);
});

test('WRC double-wind pair is worth two fu', () => {
  const state=engine.createState('room',{id:'host',name:'Host'});
  state.players.push({id:'south',name:'South',coins:0,spectator:false});
  state.mahjongGame={playerIds:['host','south','cpu1','cpu2'],dealerId:'south',phase:'draw',status:'playing',seatWindByPlayer:{host:0},roundWindIndex:0};
  const hand=[['ji',5],['ji',5],['ji',5],['man',2],['man',3],['sou',6],['sou',7],['sou',8],['ji',1],['ji',1]];
  state.mahjongTiles=hand.map(([suit,rank],index)=>({id:`h${index}`,suit,rank,zone:'hand',ownerId:'host'}));
  for(let index=0;index<4;index++)state.mahjongTiles.push({id:`kan${index}`,suit:'sou',rank:1,zone:'meld',ownerId:'host',meldId:'k1',meldKind:'kan',called:index===0});
  const winning={id:'winning',suit:'man',rank:4,zone:'river',ownerId:'south'};state.mahjongTiles.push(winning);
  const score=evaluateMahjongWin(state,'host','ron',winning);
  assert.equal(score.fu,50);
});

test('WRC rounds 4 han 30 fu and 3 han 60 fu up to mangan', () => {
  assert.equal(basePoints(4,30),2000);
  assert.equal(basePoints(3,60),2000);
});

test('mahjong rejects a dora-only hand', () => {
  const state=engine.createState('room',{id:'host',name:'Host'});state.players.push({id:'south',name:'South',coins:0,spectator:false});
  state.mahjongGame={playerIds:['host','south','cpu1','cpu2'],dealerId:'south',phase:'draw',status:'playing',doraIndicators:['dora'],seatWindByPlayer:{host:1},roundWindIndex:2,drawCountByPlayer:{host:1}};
  const hand=[['man',1],['man',2],['pin',4],['pin',5],['pin',6],['sou',4],['sou',5],['sou',6],['pin',7],['pin',8],['pin',9],['ji',2],['ji',2]];
  state.mahjongTiles=hand.map(([suit,rank],index)=>({id:`h${index}`,suit,rank,zone:'hand',ownerId:'host'}));
  state.mahjongTiles.push({id:'dora',suit:'man',rank:2,zone:'deadWall'});
  const discard={id:'win',suit:'man',rank:3,zone:'river',ownerId:'south'};state.mahjongTiles.push(discard);
  assert.equal(evaluateMahjongWin(state,'host','ron',discard),null);
});

test('mahjong pao splits a liable yakuman ron payment between the discarder and responsible player', () => {
  const state=engine.createState('room',{id:'winner',name:'Winner'});
  for(const id of ['discarder','liable','other'])state.players.push({id,name:id,coins:0,spectator:false});
  state.mahjongGame={playerIds:['winner','discarder','liable','other'],dealerId:'discarder',currentPlayerId:'winner',phase:'draw',status:'playing',scores:{winner:30000,discarder:30000,liable:30000,other:30000},roundWindIndex:0,seatWindByPlayer:{winner:1,discarder:0,liable:2,other:3},honba:0,riichiSticks:0,lastDiscardId:'win',paoResponsibility:{winner:{大三元:'liable'}}};
  const hand=[['man',1],['man',2],['man',3],['pin',5]];
  state.mahjongTiles=hand.map(([suit,rank],index)=>({id:`h${index}`,suit,rank,zone:'hand',ownerId:'winner'}));
  for(const [meldIndex,rank] of [5,6,7].entries())for(let copy=0;copy<3;copy++)state.mahjongTiles.push({id:`d${meldIndex}-${copy}`,suit:'ji',rank,zone:'meld',ownerId:'winner',meldId:`d${meldIndex}`,meldKind:'pon',called:copy===0});
  state.mahjongTiles.push({id:'win',suit:'pin',rank:5,zone:'river',ownerId:'discarder'});
  const next=extendedApply(state,{type:'mahjong-win',kind:'ron',actorId:'winner'});
  assert.equal(next.mahjongGame.winScore.payments.discarder,16000);
  assert.equal(next.mahjongGame.winScore.payments.liable,16000);
  assert.equal(next.mahjongGame.scores.winner,62000);
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
    const oldRound = state.game.round;
    while (state.game.status === 'playing' && state.game.round === oldRound) state = extendedApply(state, { type: 'poker-action', actorId: state.game.players[state.game.current], action: { kind: 'check' } });
    if (round === 'flop') assert.equal(state.game.community.length, 4);
    if (round === 'turn') assert.equal(state.game.community.length, 5);
  }
  assert.equal(state.game.status, 'finished');
  assert.ok(state.game.winners.length >= 1);
});

test('five-card draw antes, runs two betting rounds around one exchange, and determines a winner', () => {
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
  assert.equal(state.game.pot, 20);
  for (let i=0;i<2;i++) state = extendedApply(state, { type:'poker-action', actorId:state.game.players[state.game.current], action:{kind:'check'} });
  assert.equal(state.game.round,'draw');
  state = extendedApply(state, { type: 'poker-action', actorId: 'host', action: { kind: 'draw', cardIds: [discardedId] } });
  assert.equal(state.game.hands.host.length, 5);
  assert.ok(!state.game.hands.host.some(card => card.id === discardedId));
  assert.equal(state.game.discarded[0].id, discardedId);
  assert.equal(state.game.deck.length, 41);
  state = extendedApply(state, { type: 'poker-action', actorId: 'guest', action: { kind: 'draw', cardIds: [] } });
  assert.equal(state.game.round, 'bet2');
  for (let i=0;i<2;i++) state = extendedApply(state, { type:'poker-action', actorId:state.game.players[state.game.current], action:{kind:'check'} });
  assert.equal(state.game.status, 'finished');
  assert.ok(state.game.winners.length >= 1);
  assert.equal(Object.values(state.game.chips).reduce((a,b)=>a+b,0), 1000);
  const guestView = publicPokerState(state, 'guest');
  assert.equal(guestView.game.discarded[0].id, discardedId);
  assert.equal(guestView.game.deckCount, 41);
  assert.equal(guestView.game.deck.length, 0);
});

test('draw poker rejects exchanges larger than the remaining deck without mutating state', () => {
  let state = engine.createState('room', { id: 'host', name: 'Host' });
  state.players.push({ id: 'guest', name: 'Guest', coins: 0, spectator: false });
  state = extendedApply(state, { type: 'start-game', mode: 'draw-poker', actorId: 'host' });
  for (let i=0;i<2;i++) state = extendedApply(state, { type:'poker-action', actorId:state.game.players[state.game.current], action:{kind:'check'} });
  state.game.deck = state.game.deck.slice(0, 1);
  const selected = state.game.hands.host.slice(0, 2).map(card => card.id);
  assert.throws(() => extendedApply(state, { type: 'poker-action', actorId: 'host', action: { kind: 'draw', cardIds: selected } }), /交換用カードが足りません/);
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
