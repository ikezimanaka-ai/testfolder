import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDaifuguAction, createDaifuguGame } from './game-modes.js';

test('Daifugu reuses the beta game rules and maps room members to game seats', () => {
  const players = [
    { id: 'host', name: 'Host' },
    { id: 'guest', name: 'Guest' }
  ];
  const game = createDaifuguGame(players);
  assert.equal(game.players.length, 2);
  assert.equal(game.players[0].roomPlayerId, 'host');
  assert.equal(game.players[1].roomPlayerId, 'guest');
  assert.equal(game.players[0].hand.length + game.players[1].hand.length, 54);
  assert.ok(Array.isArray(game.passed));

  assert.throws(() => applyDaifuguAction(game, 'guest', { type: 'pass' }), /あなたの手番/);
  const card = game.players[game.current].hand[0];
  const next = applyDaifuguAction(game, 'host', {
    type: 'play',
    cards: [{ id: card.id }]
  });
  assert.equal(next.players[0].hand.length + next.players[1].hand.length, 53);
  assert.equal(next.field.cards.length, 1);
});
