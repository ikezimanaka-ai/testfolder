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

test('late arrivals spectate a running game and can join the next one', () => {
  let state = start();
  state = addPlayer(state, 'guest', 'Guest');
  state = TowerEngine.apply(state, { type: 'start-game', actorId: 'host', mode: 'memory' });
  state = addPlayer(state, 'late', 'Late player');
  assert.equal(state.players.find(player => player.id === 'late').spectator, true);
  assert.throws(() => TowerEngine.apply(state, {
    type: 'game-action', actorId: 'late', gameAction: 'flip', cardId: state.game.board[0].id
  }), /観戦中/);

  state = TowerEngine.apply(state, { type: 'end-game', actorId: 'host' });
  state = TowerEngine.apply(state, { type: 'start-game', actorId: 'host', mode: 'memory' });
  assert.equal(state.game.players.includes('late'), true);
  assert.equal(state.players.find(player => player.id === 'late').spectator, false);
});

test('memory game validates turn order, reveals pairs, and hides no public board state', () => {
  let state = start();
  state = addPlayer(state, 'guest', 'Guest');
  state = TowerEngine.apply(state, { type: 'start-game', actorId: 'host', mode: 'memory' });
  const pairKey = state.game.board[0].matchKey;
  const pair = state.game.board.filter(card => card.matchKey === pairKey).slice(0, 2);
  const concealed = TowerEngine.publicState(state, 'guest').game.board.find(card => card.id === pair[0].id);
  assert.equal(concealed.rank, undefined);
  assert.equal(concealed.matchKey, undefined);
  assert.throws(() => TowerEngine.apply(state, {
    type: 'game-action', actorId: 'guest', gameAction: 'flip', cardId: pair[0].id
  }), /あなたの番/);
  state = TowerEngine.apply(state, { type: 'game-action', actorId: 'host', gameAction: 'flip', cardId: pair[0].id });
  state = TowerEngine.apply(state, { type: 'game-action', actorId: 'host', gameAction: 'flip', cardId: pair[1].id });
  assert.equal(state.game.scores.host, 1);
  assert.equal(state.game.board.filter(card => card.matchKey === pairKey).every(card => card.matched), true);
  assert.equal(TowerEngine.publicState(state, 'guest').game.board.find(card => card.id === pair[0].id).matched, true);
});

test('old maid deals one joker, hides opponents’ card faces, and only draws from the next player', () => {
  let state = start();
  state = addPlayer(state, 'guest', 'Guest');
  state = addPlayer(state, 'guest2', 'Guest 2');
  state = addPlayer(state, 'guest3', 'Guest 3');
  state = TowerEngine.apply(state, { type: 'start-game', actorId: 'host', mode: 'old-maid' });
  const game = state.game;
  assert.equal(game.players.flatMap(player => player.hand).filter(card => card.joker).length, 1);
  const current = game.players[game.current];
  let next = null;
  for (let offset = 1; offset < game.players.length; offset += 1) {
    const candidate = game.players[(game.current + offset) % game.players.length];
    if (candidate.hand.length) {
      next = candidate;
      break;
    }
  }
  assert.ok(next);
  const target = next.hand[0];
  const hadMatch = current.hand.some(card => !card.joker && !target.joker && card.rank === target.rank);
  const guestView = TowerEngine.publicState(state, current.id);
  const hiddenTarget = guestView.game.players.find(player => player.id === next.id).hand[0];
  assert.equal(hiddenTarget.rank, undefined);
  assert.throws(() => TowerEngine.apply(state, {
    type: 'game-action', actorId: current.id, gameAction: 'draw', cardId: 'not-in-hand'
  }), /相手の手札にありません/);
  const totalCards = game.players.reduce((sum, player) => sum + player.hand.length, 0);
  state = TowerEngine.apply(state, { type: 'game-action', actorId: current.id, gameAction: 'draw', cardId: target.id });
  assert.equal(state.game.players.reduce((sum, player) => sum + player.hand.length, 0), totalCards - (hadMatch ? 2 : 0));
  assert.equal(state.game.discardCount, game.discardCount + (hadMatch ? 2 : 0));
  assert.equal(state.game.players.find(player => player.id === next.id).hand.some(card => card.id === target.id), false);
  assert.equal(state.game.players.find(player => player.id === current.id).hand.some(card => card.id === target.id), !hadMatch);
});

test('mahjong wall has 136 tiles with three red fives and conceals private hands', () => {
  let state = start();
  state = TowerEngine.apply(state, { type: 'add-mahjong-wall', actorId: 'host' });
  assert.equal(state.mahjongTiles.length, 136);
  assert.equal(state.mahjongTiles.filter(tile => tile.red).length, 3);
  state = addPlayer(state, 'guest', 'Guest');
  state = TowerEngine.apply(state, { type: 'draw-mahjong-tile', actorId: 'host' });
  const tile = state.mahjongTiles.find(item => item.zone === 'hand');
  const guestView = TowerEngine.publicState(state, 'guest');
  const hidden = guestView.mahjongTiles.find(item => item.id === tile.id);
  assert.equal(hidden.asset, undefined);
  state = TowerEngine.apply(state, { type: 'play-mahjong-tile', actorId: 'host', tileId: tile.id });
  assert.equal(state.mahjongTiles.find(item => item.id === tile.id).zone, 'table');
  state = TowerEngine.apply(state, { type: 'clear-table', actorId: 'host' });
  assert.equal(state.mahjongTiles.find(item => item.id === tile.id).zone, 'wall');
});

test('starts a four-player riichi round, conceals hands, and advances draw/discard turns', () => {
  let state = start();
  state = addPlayer(state, 'south', 'South');
  state = addPlayer(state, 'west', 'West');
  state = addPlayer(state, 'north', 'North');
  state = TowerEngine.apply(state, { type: 'add-mahjong-wall', actorId: 'host' });
  state = TowerEngine.apply(state, { type: 'start-mahjong-round', actorId: 'host' });

  assert.equal(state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === 'host').length, 14);
  for (const id of ['south', 'west', 'north']) {
    assert.equal(state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === id).length, 13);
  }
  assert.equal(state.mahjongTiles.filter(tile => tile.zone === 'wall').length, 83);
  assert.equal(state.mahjongGame.liveWallRemaining, 69);
  assert.equal(TowerEngine.publicState(state, 'south').mahjongTiles.find(tile => tile.zone === 'hand' && tile.ownerId === 'host').asset, undefined);
  const deadWallTile = state.mahjongTiles.find(tile => tile.deadWall);
  assert.equal(TowerEngine.publicState(state, 'south').mahjongTiles.find(tile => tile.id === deadWallTile.id).asset, undefined);

  const dealerTile = state.mahjongTiles.find(tile => tile.zone === 'hand' && tile.ownerId === 'host');
  state = TowerEngine.apply(state, { type: 'discard-mahjong-tile', actorId: 'host', tileId: dealerTile.id });
  assert.equal(state.mahjongGame.currentPlayerId, 'south');
  assert.equal(state.mahjongGame.phase, 'draw');
  assert.equal(state.mahjongTiles.find(tile => tile.id === dealerTile.id).zone, 'river');

  state = TowerEngine.apply(state, { type: 'draw-mahjong-tile', actorId: 'south' });
  assert.equal(state.mahjongGame.phase, 'discard');
  assert.equal(state.mahjongGame.liveWallRemaining, 68);
  assert.equal(state.mahjongTiles.filter(tile => tile.zone === 'hand' && tile.ownerId === 'south').length, 14);
  assert.throws(() => TowerEngine.apply(state, {
    type: 'draw-mahjong-tile', actorId: 'south'
  }), /捨て牌を選ぶ番/);
});

test('calls a valid pon from the latest discard and displays its tiles publicly', () => {
  let state = start();
  state = addPlayer(state, 'south', 'South');
  state = addPlayer(state, 'west', 'West');
  state = addPlayer(state, 'north', 'North');
  state = TowerEngine.apply(state, { type: 'add-mahjong-wall', actorId: 'host' });
  state = TowerEngine.apply(state, { type: 'start-mahjong-round', actorId: 'host' });

  const copies = state.mahjongTiles.filter(tile => tile.suit === 'man' && tile.rank === 1);
  state.mahjongTiles.forEach(tile => {
    if (copies.slice(0, 3).includes(tile)) {
      tile.zone = 'hand';
      tile.ownerId = 'south';
      delete tile.deadWall;
    }
  });
  const calledTile = copies[0];
  calledTile.zone = 'river';
  calledTile.ownerId = 'host';
  calledTile.riverIndex = 0;
  state.mahjongGame.lastDiscardId = calledTile.id;
  state.mahjongGame.currentPlayerId = 'south';
  state.mahjongGame.currentIndex = 1;
  state.mahjongGame.phase = 'draw';

  state = TowerEngine.apply(state, {
    type: 'call-mahjong-meld',
    actorId: 'south',
    kind: 'pon',
    tileIds: copies.slice(1, 3).map(tile => tile.id),
    calledTileId: calledTile.id
  });
  const meldTiles = state.mahjongTiles.filter(tile => tile.meldId && tile.ownerId === 'south');
  assert.equal(meldTiles.length, 3);
  assert.ok(meldTiles.every(tile => tile.zone === 'meld' && tile.meldKind === 'pon'));
  assert.equal(state.mahjongGame.currentPlayerId, 'south');
  assert.equal(state.mahjongGame.phase, 'discard');
  assert.equal(TowerEngine.publicState(state, 'west').mahjongTiles.filter(tile => tile.zone === 'meld').length, 3);
});

test('calls a daiminkan, takes a replacement draw, and resets all Mahjong tiles', () => {
  let state = start();
  state = addPlayer(state, 'south', 'South');
  state = addPlayer(state, 'west', 'West');
  state = addPlayer(state, 'north', 'North');
  state = TowerEngine.apply(state, { type: 'add-mahjong-wall', actorId: 'host' });
  state = TowerEngine.apply(state, { type: 'start-mahjong-round', actorId: 'host' });

  const copies = state.mahjongTiles.filter(tile => tile.suit === 'pin' && tile.rank === 1);
  const calledTile = copies[0];
  calledTile.zone = 'river';
  calledTile.ownerId = 'host';
  calledTile.riverIndex = 0;
  for (const tile of copies.slice(1)) {
    tile.zone = 'hand';
    tile.ownerId = 'south';
    delete tile.deadWall;
  }
  delete calledTile.deadWall;
  state.mahjongTiles.forEach(tile => { delete tile.deadWall; });
  const wallTiles = state.mahjongTiles.filter(tile => tile.zone === 'wall');
  wallTiles.slice(-14).forEach(tile => { tile.deadWall = true; });
  const liveWallBeforeKan = wallTiles.length - 14;
  state.mahjongGame.liveWallRemaining = liveWallBeforeKan;
  state.mahjongGame.rinshanRemaining = 4;
  state.mahjongGame.lastDiscardId = calledTile.id;
  state.mahjongGame.currentPlayerId = 'south';
  state.mahjongGame.currentIndex = 1;
  state.mahjongGame.phase = 'draw';

  state = TowerEngine.apply(state, {
    type: 'call-mahjong-meld',
    actorId: 'south',
    kind: 'kan',
    tileIds: copies.slice(1).map(tile => tile.id),
    calledTileId: calledTile.id
  });
  assert.equal(state.mahjongGame.phase, 'draw');
  assert.equal(state.mahjongGame.replacementDrawPending, true);

  state = TowerEngine.apply(state, { type: 'draw-mahjong-tile', actorId: 'south' });
  assert.equal(state.mahjongGame.phase, 'discard');
  assert.equal(state.mahjongGame.liveWallRemaining, liveWallBeforeKan - 1);
  assert.equal(state.mahjongGame.rinshanRemaining, 3);
  assert.equal(state.mahjongGame.replacementDrawPending, false);
  assert.equal(state.mahjongTiles.filter(tile => tile.zone === 'wall' && !tile.deadWall).length, liveWallBeforeKan - 1);
  assert.equal(state.mahjongTiles.filter(tile => tile.zone === 'wall' && tile.deadWall).length, 14);

  state = TowerEngine.apply(state, { type: 'reset-mahjong-round', actorId: 'host' });
  assert.equal(state.mahjongGame, null);
  assert.ok(state.mahjongTiles.every(tile => tile.zone === 'wall' && tile.ownerId === null));
  assert.ok(state.mahjongTiles.every(tile => !tile.deadWall));
  assert.ok(state.mahjongTiles.every(tile => !('meldId' in tile) && !('riverIndex' in tile)));
});

test('bet pot moves wallet coins and can be awarded or refunded without changing total value', () => {
  let state = start();
  state = addPlayer(state, 'guest', 'Guest');
  state = TowerEngine.apply(state, { type: 'add-wallet-coins', actorId: 'host', amount: 30 });
  state = TowerEngine.apply(state, { type: 'add-wallet-coins', actorId: 'guest', amount: 20 });
  state = TowerEngine.apply(state, { type: 'add-bet', actorId: 'host', amount: 10 });
  state = TowerEngine.apply(state, { type: 'add-bet', actorId: 'guest', amount: 7 });
  assert.equal(state.gamePot.amount, 17);
  state = TowerEngine.apply(state, { type: 'start-game', actorId: 'host', mode: 'memory' });
  state = TowerEngine.apply(state, { type: 'end-game', actorId: 'host' });
  state = TowerEngine.apply(state, { type: 'settle-pot', actorId: 'host', winnerId: 'guest' });
  assert.equal(state.players.find(player => player.id === 'guest').coins, 30);
  assert.equal(state.gamePot.amount, 0);

  state = TowerEngine.apply(state, { type: 'add-bet', actorId: 'host', amount: 5 });
  state = TowerEngine.apply(state, { type: 'start-game', actorId: 'host', mode: 'memory' });
  state = TowerEngine.apply(state, { type: 'end-game', actorId: 'host' });
  state = TowerEngine.apply(state, { type: 'settle-pot', actorId: 'host', refund: true });
  assert.equal(state.players.find(player => player.id === 'host').coins, 20);
});
