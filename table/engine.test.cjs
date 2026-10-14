const test = require('node:test');
const assert = require('node:assert/strict');
const TowerEngine = require('./engine.js');

function start() {
  return TowerEngine.createState('test-room', { id: 'host', name: 'Host' });
}

function addPlayer(state, id, name) {
  return TowerEngine.apply(state, {
    type: 'add-player',
    actorId: 'host',
    player: { id, name }
  });
}

test('draws into a private hand, plays face down, flips, moves, and collects a card', () => {
  let state = start();
  state = TowerEngine.apply(state, { type: 'add-deck', actorId: 'host' });
  assert.equal(state.cards.length, 52);
  assert.equal(state.decks.length, 1);

  const deckId = state.decks[0].id;
  state = TowerEngine.apply(state, { type: 'draw-card', actorId: 'host', deckId, x: 20, y: 35 });
  let card = state.cards.find(item => item.zone === 'hand' && item.ownerId === 'host');
  assert.ok(card);
  assert.equal(card.x, 20);
  state = TowerEngine.apply(state, { type: 'play-card', actorId: 'host', cardId: card.id, x: 150, y: -5 });
  card = state.cards.find(item => item.id === card.id);
  assert.equal(card.zone, 'table');
  assert.equal(card.faceUp, false);
  assert.equal(card.ownerName, 'Host');
  assert.equal(card.x, 100);
  assert.equal(card.y, 0);
  state = TowerEngine.apply(state, { type: 'flip-card', actorId: 'host', cardId: card.id });
  assert.equal(state.cards.find(item => item.id === card.id).faceUp, true);
  state = TowerEngine.apply(state, { type: 'flip-card', actorId: 'host', cardId: card.id });
  assert.equal(state.cards.find(item => item.id === card.id).faceUp, false);
  state = TowerEngine.apply(state, { type: 'move-object', actorId: 'host', objectId: card.id, x: 75, y: 60 });
  assert.equal(state.cards.find(item => item.id === card.id).x, 75);
  state = TowerEngine.apply(state, { type: 'collect-object', actorId: 'host', objectId: card.id });
  card = state.cards.find(item => item.id === card.id);
  assert.equal(card.zone, 'hand');
  assert.equal(card.ownerId, 'host');
});

test('supports two decks and lets any participant deal with reserve and exclusions', () => {
  let state = start();
  state = addPlayer(state, 'guest', 'Guest');
  state = TowerEngine.apply(state, { type: 'add-deck', actorId: 'host' });
  state = TowerEngine.apply(state, { type: 'add-deck', actorId: 'host' });
  assert.equal(state.cards.length, 104);
  assert.throws(() => TowerEngine.apply(state, { type: 'add-deck', actorId: 'host' }), /2箱まで/);

  const deckId = state.decks[0].id;
  state = TowerEngine.apply(state, {
    type: 'deal',
    actorId: 'host',
    deckId,
    mode: 'each',
    perPlayer: 5,
    reserve: 1,
    excludeRanks: 'A'
  });
  assert.equal(state.cards.filter(card => card.zone === 'hand' && card.ownerId === 'host').length, 5);
  assert.equal(state.cards.filter(card => card.zone === 'hand' && card.ownerId === 'guest').length, 5);
  assert.equal(state.cards.filter(card => card.zone === 'deck' && card.deckId === deckId).length, 42);
  state = TowerEngine.apply(state, {
    type: 'deal',
    actorId: 'guest',
    deckId,
    mode: 'each',
    perPlayer: 1
  });
  assert.equal(state.cards.filter(card => card.zone === 'hand' && card.ownerId === 'host').length, 6);
  assert.equal(state.cards.filter(card => card.zone === 'hand' && card.ownerId === 'guest').length, 6);
});

test('hides other players’ hand faces in the recipient-specific state', () => {
  let state = start();
  state = addPlayer(state, 'guest', 'Guest');
  state = TowerEngine.apply(state, { type: 'add-deck', actorId: 'host' });
  state = TowerEngine.apply(state, {
    type: 'deal',
    actorId: 'host',
    deckId: state.decks[0].id,
    mode: 'each',
    perPlayer: 1
  });
  const guestCard = state.cards.find(card => card.zone === 'hand' && card.ownerId === 'guest');

  const guestView = TowerEngine.publicState(state, 'guest');
  const hostView = TowerEngine.publicState(state, 'host');
  const hidden = hostView.cards.find(card => card.id === guestCard.id);
  const visible = guestView.cards.find(card => card.id === guestCard.id);
  assert.equal(hidden.zone, 'hand');
  assert.equal(hidden.suit, undefined);
  assert.equal(hidden.rank, undefined);
  assert.equal(visible.suit, guestCard.suit);
  assert.equal(visible.rank, guestCard.rank);
});

test('places nameplates and coin stacks and rejects invalid input', () => {
  let state = start();
  state = TowerEngine.apply(state, { type: 'add-label', actorId: 'host', label: 'Table note', x: 10, y: 20 });
  state = TowerEngine.apply(state, { type: 'place-coins', actorId: 'host', amount: 37 });
  assert.equal(state.objects.find(item => item.kind === 'label').label, 'Table note');
  assert.equal(state.objects.find(item => item.kind === 'label').ownerName, 'Host');
  assert.equal(state.objects.find(item => item.kind === 'coin').amount, 37);
  assert.equal(state.objects.find(item => item.kind === 'coin').ownerName, 'Host');
  assert.throws(() => TowerEngine.apply(state, { type: 'place-coins', actorId: 'host', amount: 0 }), /10,000/);
  assert.throws(() => TowerEngine.apply(state, { type: 'add-label', actorId: 'host', label: ' ' }), /文字/);
  const coin = state.objects.find(item => item.kind === 'coin');
  state = TowerEngine.apply(state, { type: 'collect-coins', actorId: 'host', objectId: coin.id });
  assert.equal(state.objects.some(item => item.kind === 'coin'), false);
});

test('tracks personal coins, allows negative table stacks, and returns coins to the case', () => {
  let state = start();
  state = TowerEngine.apply(state, { type: 'add-wallet-coins', actorId: 'host', amount: 20 });
  state = TowerEngine.apply(state, { type: 'place-coins', actorId: 'host', amount: 7 });
  assert.equal(state.players[0].coins, 13);
  let coin = state.objects.find(item => item.kind === 'coin');
  state = TowerEngine.apply(state, { type: 'collect-coins', actorId: 'host', objectId: coin.id });
  assert.equal(state.players[0].coins, 20);

  state = TowerEngine.apply(state, { type: 'place-coins', actorId: 'host', amount: -4 });
  assert.equal(state.players[0].coins, 24);
  coin = state.objects.find(item => item.kind === 'coin');
  assert.equal(coin.amount, -4);
  state = TowerEngine.apply(state, { type: 'collect-coins', actorId: 'host', objectId: coin.id });
  assert.equal(state.players[0].coins, 20);
  state = TowerEngine.apply(state, { type: 'return-wallet-coins', actorId: 'host', amount: 15 });
  assert.equal(state.players[0].coins, 5);
  assert.throws(() => TowerEngine.apply(state, { type: 'return-wallet-coins', actorId: 'host', amount: 6 }), /足りません/);
});

test('returns all personal coins and clears the table for the host only', () => {
  let state = start();
  state = addPlayer(state, 'guest', 'Guest');
  state = TowerEngine.apply(state, { type: 'add-wallet-coins', actorId: 'host', amount: 30 });
  state = TowerEngine.apply(state, { type: 'add-wallet-coins', actorId: 'guest', amount: 50 });
  state = TowerEngine.apply(state, { type: 'place-coins', actorId: 'host', amount: 10 });
  state = TowerEngine.apply(state, { type: 'place-coins', actorId: 'guest', amount: 20 });
  state = TowerEngine.apply(state, { type: 'add-label', actorId: 'host', label: 'Remove me' });
  state = TowerEngine.apply(state, { type: 'add-deck', actorId: 'host' });
  const deckId = state.decks[0].id;
  state = TowerEngine.apply(state, { type: 'draw-card', actorId: 'host', deckId });
  state = TowerEngine.apply(state, {
    type: 'add-stroke',
    actorId: 'guest',
    strokeId: 'table-ink',
    points: [{ x: 15, y: 15 }, { x: 20, y: 20 }]
  });

  assert.throws(() => TowerEngine.apply(state, { type: 'clear-table', actorId: 'guest' }), /ホストのみ/);
  state = TowerEngine.apply(state, { type: 'clear-table', actorId: 'host' });
  assert.equal(state.objects.length, 0);
  assert.equal(state.strokes.length, 0);
  assert.equal(state.players.find(player => player.id === 'host').coins, 30);
  assert.equal(state.players.find(player => player.id === 'guest').coins, 50);
  assert.equal(state.cards.find(card => card.zone === 'table'), undefined);
  assert.equal(state.cards.filter(card => card.zone === 'deck' && card.deckId === deckId).length, 51);
  assert.equal(state.cards.filter(card => card.zone === 'hand' && card.ownerId === 'host').length, 1);

  state = TowerEngine.apply(state, { type: 'return-all-wallet-coins', actorId: 'host' });
  assert.equal(state.players.find(player => player.id === 'host').coins, 0);
  assert.throws(() => TowerEngine.apply(state, { type: 'return-all-wallet-coins', actorId: 'host' }), /ありません/);
});

test('scales images, removes their deck, and enforces drawing clear permissions', () => {
  let state = start();
  state = TowerEngine.apply(state, { type: 'add-image', actorId: 'host', assetId: 'asset' });
  const imageId = state.objects[0].id;
  state = TowerEngine.apply(state, { type: 'scale-image', actorId: 'host', objectId: imageId, scale: 2 });
  assert.equal(state.objects[0].scale, 2);

  state = addPlayer(state, 'guest', 'Guest');
  state = TowerEngine.apply(state, {
    type: 'add-stroke',
    actorId: 'guest',
    strokeId: 'line',
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }]
  });
  assert.equal(state.strokes.length, 1);
  assert.throws(() => TowerEngine.apply(state, { type: 'clear-strokes', actorId: 'guest' }), /ホストのみ/);
  state = TowerEngine.apply(state, { type: 'clear-strokes', actorId: 'host' });
  assert.equal(state.strokes.length, 0);
  state = TowerEngine.apply(state, { type: 'add-deck', actorId: 'host' });
  const deckId = state.decks[0].id;
  state = TowerEngine.apply(state, { type: 'draw-card', actorId: 'host', deckId });
  state = TowerEngine.apply(state, { type: 'remove-deck', actorId: 'host', deckId });
  assert.equal(state.decks.length, 0);
  assert.equal(state.cards.length, 0);
});

test('restricts participant management to the host but allows shared object manipulation', () => {
  let state = start();
  state = addPlayer(state, 'guest', 'Guest');
  assert.throws(() => TowerEngine.apply(state, {
    type: 'add-player',
    actorId: 'guest',
    player: { id: 'impostor', name: 'Impostor' }
  }), /ホストのみ/);
  assert.throws(() => TowerEngine.apply(state, {
    type: 'remove-player',
    actorId: 'guest',
    playerId: 'host'
  }), /ホストのみ/);

  state = TowerEngine.apply(state, { type: 'add-label', actorId: 'host', label: 'Host label' });
  const label = state.objects[0];
  state = TowerEngine.apply(state, {
    type: 'move-object',
    actorId: 'guest',
    objectId: label.id,
    x: 20,
    y: 20
  });
  assert.equal(state.objects[0].x, 20);
  state = TowerEngine.apply(state, { type: 'collect-object', actorId: 'guest', objectId: label.id });
  assert.equal(state.objects.length, 0);
});

test('returns every card to its deck and disbands the room when the host leaves', () => {
  let state = start();
  state = addPlayer(state, 'guest', 'Guest');
  state = TowerEngine.apply(state, { type: 'add-deck', actorId: 'host' });
  state = TowerEngine.apply(state, { type: 'draw-card', actorId: 'host', deckId: state.decks[0].id });
  state = TowerEngine.apply(state, { type: 'collect-all-cards', actorId: 'host' });
  assert.equal(state.cards.every(card => card.zone === 'deck' && !card.ownerId), true);
  state = TowerEngine.apply(state, { type: 'remove-player', actorId: 'host', playerId: 'host' });
  assert.equal(state.closed, true);
  assert.equal(state.players.length, 0);
  assert.equal(state.cards.length, 0);
});
