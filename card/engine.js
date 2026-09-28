(() => {
  const suits = ['s', 'h', 'd', 'c'];
  const ranks = Array.from({ length: 13 }, (_, index) => index + 1);
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = () => crypto.randomUUID();

  function makeDeck({ jokers = 0, pairs = false } = {}) {
    const cards = suits.flatMap(suit => ranks.map(rank => ({ id: id(), suit, rank, kind: 'card' })));
    if (pairs) return cards.slice(0, 26).flatMap(card => [clone(card), { ...clone(card), id: id() }]);
    return cards.concat(Array.from({ length: jokers }, () => ({ id: id(), joker: true, kind: 'card' })));
  }
  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }
  function createState(game, player) {
    return { revision: 0, game, phase: 'waiting', hostId: player.id, players: [player], cards: [], coins: [], table: [], turn: null, direction: 1, log: [] };
  }
  function publicState(state, viewerId) {
    const hidden = state.game === 'old-maid' || state.game === 'poker';
    return {
      ...clone(state),
      cards: state.cards.map(card => {
        const visible = card.visibility === 'public' || card.ownerId === viewerId || !hidden;
        return visible ? clone(card) : { id: card.id, kind: 'card', ownerId: card.ownerId, zone: card.zone, faceDown: true };
      })
    };
  }
  function nextTurn(state, { skip = 0, toPlayerId = null, reverse = false } = {}) {
    const active = state.players.filter(player => !player.left);
    if (!active.length) return null;
    if (reverse) state.direction *= -1;
    if (toPlayerId && active.some(player => player.id === toPlayerId)) return toPlayerId;
    let index = Math.max(0, active.findIndex(player => player.id === state.turn));
    for (let count = 0; count <= skip; count += 1) index = (index + state.direction + active.length) % active.length;
    return active[index].id;
  }
  function assertPlayer(state, playerId) {
    if (!state.players.some(player => player.id === playerId && !player.left)) throw new Error('プレイヤーが見つかりません');
  }
  function card(state, cardId) {
    const target = state.cards.find(item => item.id === cardId);
    if (!target) throw new Error('カードが見つかりません');
    return target;
  }
  function reduce(state, action) {
    const next = clone(state);
    assertPlayer(next, action.actorId);
    if (action.type === 'start') {
      if (next.hostId !== action.actorId) throw new Error('ホストのみ開始できます');
      next.cards = shuffle(makeDeck(action.options || {}));
      next.cards.forEach(item => {
        item.zone = next.game === 'concentration' ? 'table' : 'deck';
        item.visibility = 'private';
        item.faceDown = next.game === 'concentration';
        item.ownerId = null;
      });
      next.phase = 'playing';
      next.turn = next.game === 'poker' ? null : next.players[0].id;
    } else if (action.type === 'deal') {
      if (next.game !== 'poker' && next.turn !== action.actorId) throw new Error('あなたのターンではありません');
      const amount = Math.max(1, Math.min(52, Number(action.amount) || 1));
      const target = action.targetPlayerId || action.actorId;
      assertPlayer(next, target);
      const deck = next.cards.filter(item => item.zone === 'deck');
      deck.slice(0, amount).forEach(item => { item.zone = 'hand'; item.ownerId = target; item.visibility = 'private'; });
    } else if (action.type === 'draw-card') {
      if (next.game !== 'old-maid' || next.turn !== action.actorId) throw new Error('ババ抜きのターン操作が不正です');
      const target = next.players.find(player => player.id === action.targetPlayerId && !player.left);
      if (!target || target.id === action.actorId) throw new Error('引く相手が見つかりません');
      const available = next.cards.filter(item => item.zone === 'hand' && item.ownerId === target.id);
      if (!available.length) throw new Error('相手の手札がありません');
      const drawn = available[Math.floor(Math.random() * available.length)];
      drawn.ownerId = action.actorId;
      next.turn = nextTurn(next);
    } else if (action.type === 'place-card') {
      if (next.game !== 'poker' && next.turn !== action.actorId) throw new Error('あなたのターンではありません');
      const target = card(next, action.cardId);
      if (target.ownerId && target.ownerId !== action.actorId && next.hostId !== action.actorId) throw new Error('他人のカードは移動できません');
      target.zone = 'table'; target.ownerId = null; target.visibility = action.visibility === 'public' ? 'public' : 'private';
    } else if (action.type === 'collect-card') {
      const target = card(next, action.cardId);
      target.zone = 'discard'; target.ownerId = action.targetPlayerId || action.actorId; target.visibility = 'private';
    } else if (action.type === 'collect-all-cards') {
      next.cards.forEach(item => { if (item.zone === 'table' || item.zone === 'hand') { item.zone = 'discard'; item.ownerId = null; item.visibility = 'private'; } });
    } else if (action.type === 'place-coins') {
      const amount = Number(action.amount);
      if (!Number.isInteger(amount) || amount < 1) throw new Error('コイン数が不正です');
      const player = next.players.find(item => item.id === action.actorId);
      if ((player.coins || 0) < amount) throw new Error('コインが不足しています');
      player.coins -= amount; next.coins.push({ id: id(), amount, ownerId: action.actorId, zone: 'table' });
    } else if (action.type === 'collect-coins') {
      const stack = next.coins.find(item => item.id === action.coinId && item.zone === 'table');
      if (!stack) throw new Error('コインが見つかりません');
      if (stack.ownerId !== action.actorId && next.hostId !== action.actorId) throw new Error('他人のコインは回収できません');
      stack.zone = 'wallet'; next.players.find(item => item.id === stack.ownerId).coins += stack.amount;
    } else if (action.type === 'turn') {
      if (next.turn !== action.actorId) throw new Error('あなたのターンではありません');
      next.turn = nextTurn(next, action);
    } else if (action.type === 'reveal') {
      if (next.game !== 'poker' && next.turn !== action.actorId) throw new Error('あなたのターンではありません');
      const target = card(next, action.cardId);
      if (target.zone !== 'table') throw new Error('卓上のカードのみめくれます');
      target.visibility = 'public'; target.faceDown = false;
    } else if (action.type === 'reset') {
      if (next.hostId !== action.actorId) throw new Error('ホストのみリセットできます');
      next.phase = 'waiting'; next.cards = []; next.coins = []; next.table = []; next.turn = null;
    } else throw new Error('未対応の操作です');
    next.revision += 1;
    next.log = [...next.log, { id: id(), actorId: action.actorId, type: action.type, at: Date.now() }].slice(-30);
    return next;
  }
  window.CardEngine = { makeDeck, shuffle, createState, publicState, reduce, nextTurn };
})();
