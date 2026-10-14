((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TowerEngine = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const suits = ['s', 'h', 'd', 'c'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const makeId = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));

  function createState(roomId, host) {
    return {
      roomId,
      hostId: host.id,
      revision: 0,
      players: [{ ...host, coins: 0 }],
      objects: [],
      cards: [],
      decks: [],
      strokes: [],
      publicListing: true,
      closed: false
    };
  }

  function assertPlayer(state, playerId) {
    if (!state.players.some(player => player.id === playerId)) throw new Error('部屋の参加者が見つかりません。');
  }

  function assertHost(state, playerId) {
    if (state.hostId !== playerId) throw new Error('この操作はホストのみ実行できます。');
  }

  function getDeckCards(state, deckId) {
    return state.cards.filter(card => card.deckId === deckId && card.zone === 'deck');
  }

  function shuffled(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function apply(state, action) {
    const next = copy(state);
    if (!action || typeof action.type !== 'string' || typeof action.actorId !== 'string') {
      throw new Error('操作データが不正です。');
    }
    assertPlayer(next, action.actorId);

    switch (action.type) {
      case 'add-player': {
        assertHost(next, action.actorId);
        if (typeof action.player?.id !== 'string' || typeof action.player?.name !== 'string') {
          throw new Error('参加者データが不正です。');
        }
        const name = action.player.name.trim().slice(0, 24);
        if (!name) throw new Error('名前を入力してください。');
        const existing = next.players.find(player => player.id === action.player.id);
        if (existing) existing.name = name;
        else next.players.push({ id: action.player.id, name, coins: 0 });
        break;
      }
      case 'remove-player':
        assertHost(next, action.actorId);
        if (action.playerId === next.hostId) {
          next.closed = true;
          next.objects = [];
          next.cards = [];
          next.decks = [];
          next.players = [];
        } else {
          next.players = next.players.filter(player => player.id !== action.playerId);
          next.cards.forEach(card => {
            if (card.ownerId === action.playerId) {
              card.ownerId = null;
              card.zone = 'deck';
              card.faceUp = false;
            }
          });
        }
        break;
      case 'add-label': {
        const label = String(action.label || '').trim().slice(0, 40);
        if (!label) throw new Error('ネームプレートの文字を入力してください。');
        next.objects.push({
          id: makeId(), kind: 'label', label, ownerId: action.actorId,
          ownerName: next.players.find(player => player.id === action.actorId).name,
          x: clamp(action.x ?? 50), y: clamp(action.y ?? 50)
        });
        break;
      }
      case 'add-image': {
        if (typeof action.assetId !== 'string' || !action.assetId) throw new Error('画像データがありません。');
        next.objects.push({
          id: makeId(), kind: 'image', assetId: action.assetId, ownerId: action.actorId,
          ownerName: next.players.find(player => player.id === action.actorId).name,
          x: clamp(action.x ?? 50), y: clamp(action.y ?? 50), scale: 1
        });
        break;
      }
      case 'scale-image': {
        const image = next.objects.find(item => item.id === action.objectId && item.kind === 'image');
        if (!image) throw new Error('拡大縮小する画像が見つかりません。');
        image.scale = Math.max(0.4, Math.min(2.5, Number(action.scale) || 1));
        break;
      }
      case 'move-object': {
        const object = next.objects.find(item => item.id === action.objectId);
        const card = next.cards.find(item => item.id === action.objectId && item.zone === 'table');
        const target = object || card;
        if (!target) throw new Error('移動するものが見つかりません。');
        target.x = clamp(action.x);
        target.y = clamp(action.y);
        break;
      }
      case 'collect-object': {
        const objectIndex = next.objects.findIndex(item => item.id === action.objectId);
        if (objectIndex >= 0) {
          next.objects.splice(objectIndex, 1);
          break;
        }
        const card = next.cards.find(item => item.id === action.objectId && item.zone === 'table');
        if (!card) throw new Error('回収するものが見つかりません。');
        card.zone = 'hand';
        card.ownerId = action.actorId;
        card.faceUp = false;
        break;
      }
      case 'add-deck': {
        if (next.decks.length >= 2) throw new Error('トランプの箱は2箱までです。');
        const deckId = makeId();
        next.decks.push({ id: deckId, index: next.decks.length + 1 });
        const deckCards = [];
        for (const suit of suits) {
          for (let rank = 1; rank <= 13; rank += 1) {
            deckCards.push({
              id: makeId(), deckId, suit, rank, zone: 'deck', ownerId: null,
              faceUp: false, x: 50, y: 50
            });
          }
        }
        next.cards.push(...shuffled(deckCards));
        break;
      }
      case 'remove-deck': {
        const deckIndex = next.decks.findIndex(deck => deck.id === action.deckId);
        if (deckIndex < 0) throw new Error('トランプの箱が見つかりません。');
        next.decks.splice(deckIndex, 1);
        next.cards = next.cards.filter(card => card.deckId !== action.deckId);
        next.decks.forEach((deck, index) => { deck.index = index + 1; });
        break;
      }
      case 'draw-card': {
        const deck = next.decks.find(item => item.id === action.deckId);
        if (!deck) throw new Error('トランプの箱が見つかりません。');
        const card = getDeckCards(next, deck.id)[0];
        if (!card) throw new Error('箱にカードが残っていません。');
        card.zone = 'hand';
        card.ownerId = action.actorId;
        card.faceUp = false;
        card.x = clamp(action.x ?? 50);
        card.y = clamp(action.y ?? 50);
        break;
      }
      case 'play-card': {
        const card = next.cards.find(item => item.id === action.cardId && item.zone === 'hand');
        if (!card || card.ownerId !== action.actorId) throw new Error('自分の手札からカードを選んでください。');
        card.zone = 'table';
        card.ownerId = action.actorId;
        card.ownerName = next.players.find(player => player.id === action.actorId).name;
        card.faceUp = false;
        card.x = clamp(action.x ?? 50);
        card.y = clamp(action.y ?? 50);
        break;
      }
      case 'flip-card': {
        const card = next.cards.find(item => item.id === action.cardId && item.zone === 'table');
        if (!card) throw new Error('卓上のカードが見つかりません。');
        card.faceUp = !card.faceUp;
        break;
      }
      case 'add-wallet-coins': {
        const amount = Math.floor(Number(action.amount));
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000) {
          throw new Error('コインケースから出す枚数は1〜10,000枚で指定してください。');
        }
        const player = next.players.find(item => item.id === action.actorId);
        player.coins = (Number(player.coins) || 0) + amount;
        break;
      }
      case 'deal': {
        const deck = next.decks.find(item => item.id === action.deckId);
        if (!deck) throw new Error('トランプの箱が見つかりません。');
        const players = next.players;
        const reserve = Math.max(0, Math.min(52, Math.floor(Number(action.reserve) || 0)));
        const excludedRanks = new Set(
          String(action.excludeRanks || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean)
        );
        const rankNames = new Map([[1, 'A'], [11, 'J'], [12, 'Q'], [13, 'K']]);
        const available = getDeckCards(next, deck.id).filter(card => {
          const rankName = rankNames.get(card.rank) || String(card.rank);
          return !excludedRanks.has(rankName);
        });
        const distributable = available.slice(0, Math.max(0, available.length - reserve));
        const perPlayer = action.mode === 'each'
          ? Math.max(0, Math.min(52, Math.floor(Number(action.perPlayer) || 0)))
          : Infinity;
        let dealt = 0;
        for (const [index, card] of distributable.entries()) {
          if (index >= players.length * perPlayer) break;
          card.zone = 'hand';
          card.ownerId = players[index % players.length].id;
          card.faceUp = false;
          dealt += 1;
        }
        if (dealt === 0) throw new Error('配れるカードがありません。');
        break;
      }
      case 'collect-all-cards':
        for (const card of next.cards) {
          card.zone = 'deck';
          card.ownerId = null;
          card.faceUp = false;
          card.x = 50;
          card.y = 50;
        }
        next.cards = next.decks.flatMap(deck => shuffled(next.cards.filter(card => card.deckId === deck.id)));
        break;
      case 'place-coins': {
        const amount = Math.floor(Number(action.amount));
        if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 10000) {
          throw new Error('場に出すコインは-10,000〜10,000枚（0以外）で指定してください。');
        }
        const player = next.players.find(item => item.id === action.actorId);
        player.coins = (Number(player.coins) || 0) - amount;
        next.objects.push({
          id: makeId(), kind: 'coin', amount, ownerId: action.actorId,
          ownerName: player.name,
          x: clamp(action.x ?? 50), y: clamp(action.y ?? 50)
        });
        break;
      }
      case 'collect-coins': {
        const index = next.objects.findIndex(item => item.id === action.objectId && item.kind === 'coin');
        if (index < 0) throw new Error('コインが見つかりません。');
        const [coin] = next.objects.splice(index, 1);
        const player = next.players.find(item => item.id === action.actorId);
        player.coins = (Number(player.coins) || 0) + coin.amount;
        break;
      }
      case 'return-wallet-coins': {
        const amount = Math.floor(Number(action.amount));
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000) {
          throw new Error('コインケースに戻す枚数は1〜10,000枚で指定してください。');
        }
        const player = next.players.find(item => item.id === action.actorId);
        if ((Number(player.coins) || 0) < amount) throw new Error('コインが足りません。');
        player.coins -= amount;
        break;
      }
      case 'return-all-wallet-coins': {
        const player = next.players.find(item => item.id === action.actorId);
        if (!Number.isSafeInteger(player.coins) || player.coins <= 0) {
          throw new Error('コインケースに戻せるコインがありません。');
        }
        player.coins = 0;
        break;
      }
      case 'set-public-listing':
        assertHost(next, action.actorId);
        next.publicListing = Boolean(action.enabled);
        break;
      case 'add-stroke': {
        const color = typeof action.color === 'string' && /^#[0-9a-f]{6}$/i.test(action.color)
          ? action.color
          : '#f4f1d0';
        const width = Math.max(1, Math.min(20, Number(action.width) || 4));
        const points = Array.isArray(action.points)
          ? action.points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
            .slice(0, 2000).map(point => ({ x: clamp(point.x), y: clamp(point.y) }))
          : [];
        if (!points.length) throw new Error('線を描画できませんでした。');
        next.strokes.push({
          id: String(action.strokeId || makeId()),
          actorId: action.actorId,
          color,
          width,
          points
        });
        break;
      }
      case 'append-stroke': {
        const stroke = next.strokes.find(item => item.id === action.strokeId && item.actorId === action.actorId);
        if (!stroke) throw new Error('描画中の線が見つかりません。');
        if (!Array.isArray(action.points)) throw new Error('描画点が不正です。');
        const additions = action.points
          .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
          .slice(0, 100).map(point => ({ x: clamp(point.x), y: clamp(point.y) }));
        stroke.points.push(...additions);
        stroke.points = stroke.points.slice(-2000);
        break;
      }
      case 'erase-stroke': {
        const x = clamp(action.x);
        const y = clamp(action.y);
        const radius = Math.max(1, Math.min(10, Number(action.radius) || 2));
        next.strokes = next.strokes.filter(stroke => !stroke.points.some(point => (
          Math.hypot(point.x - x, point.y - y) <= radius
        )));
        break;
      }
      case 'clear-strokes':
        assertHost(next, action.actorId);
        next.strokes = [];
        break;
      case 'clear-table':
        assertHost(next, action.actorId);
        for (const object of next.objects) {
          if (object.kind !== 'coin') continue;
          const owner = next.players.find(player => player.id === object.ownerId);
          if (owner) owner.coins = (Number(owner.coins) || 0) + object.amount;
        }
        next.objects = [];
        for (const card of next.cards) {
          if (card.zone === 'table') {
            card.zone = 'deck';
            card.ownerId = null;
            card.faceUp = false;
          }
        }
        next.cards = next.decks.flatMap(deck => shuffled(next.cards.filter(card => card.deckId === deck.id)));
        next.strokes = [];
        break;
      default:
        throw new Error('未対応の操作です。');
    }

    next.revision = state.revision + 1;
    return next;
  }

  function publicState(state, viewerId) {
    const result = copy(state);
    result.cards = result.cards.map(card => (
      card.zone === 'hand' && card.ownerId !== viewerId
        ? { id: card.id, deckId: card.deckId, zone: 'hand', ownerId: card.ownerId, faceUp: false }
        : card
    ));
    return result;
  }

  return { createState, apply, publicState };
});
