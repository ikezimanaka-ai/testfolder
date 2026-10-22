import {
  createGame,
  passTurn,
  playCards,
  resolveEffect
} from '../millionaire/beta/game-engine.js';

function serialize(state) {
  return {
    ...state,
    passed: [...state.passed],
    selectedIds: [...state.selectedIds]
  };
}

function restore(snapshot) {
  return {
    ...snapshot,
    passed: new Set(snapshot.passed || []),
    selectedIds: new Set(snapshot.selectedIds || [])
  };
}

export function createDaifuguGame(players) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 10) {
    throw new RangeError('大富豪は2〜10人で遊べます。');
  }
  const state = createGame(players.length);
  state.players.forEach((player, index) => {
    player.id = index;
    player.roomPlayerId = players[index].id;
    player.name = players[index].name;
    player.human = true;
    player.left = false;
  });
  state.logs = [`ゲーム開始。${players.length}人で対戦します。`];
  return serialize(state);
}

export function applyDaifuguAction(snapshot, actorId, action) {
  const state = restore(snapshot);
  const player = state.players.find(candidate => candidate.roomPlayerId === actorId);
  if (!player || player.left) throw new Error('この大富豪に参加していません。');
  let result;
  if (action?.type === 'pass') {
    result = passTurn(state, player.id);
  } else if (action?.type === 'play' && Array.isArray(action.cards)) {
    const cardIds = action.cards.map(card => card?.id);
    const declarations = Object.fromEntries(action.cards
      .filter(card => card?.assignedRank && card?.assignedSuit)
      .map(card => [card.id, { rank: card.assignedRank, suit: card.assignedSuit }]));
    result = playCards(state, player.id, cardIds, declarations);
  } else if (action?.type === 'effect') {
    result = resolveEffect(state, player.id, action.choice || {});
  } else {
    throw new Error('大富豪の操作が正しくありません。');
  }
  if (!result.ok) throw new Error(result.reason || '大富豪の操作に失敗しました。');
  return serialize(state);
}

export function publicDaifuguState(snapshot, viewerId) {
  const visible = JSON.parse(JSON.stringify(snapshot));
  visible.players = visible.players.map(player => ({
    ...player,
    ...(player.roomPlayerId === viewerId || visible.finished ? {} : { hand: undefined })
  }));
  return visible;
}
