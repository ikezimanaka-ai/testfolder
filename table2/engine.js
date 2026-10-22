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
      players: [{ ...host, coins: 0, spectator: false }],
      objects: [],
      cards: [],
      decks: [],
      mahjongTiles: [],
      game: null,
      gamePot: { amount: 0, contributions: {}, locked: false },
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

  function createPlayingCard(id, suit, rank, extra = {}) {
    return { id, deckId: 'game', suit, rank, zone: 'hand', ownerId: null, faceUp: false, ...extra };
  }

  function makeGameDeck(includeJoker = false) {
    const deck = [];
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank += 1) {
        deck.push(createPlayingCard(makeId(), suit, rank));
      }
    }
    if (includeJoker) deck.push(createPlayingCard(makeId(), 'j', 1, { joker: true }));
    return shuffled(deck);
  }

  function nextGamePlayer(game, fromIndex, predicate = () => true) {
    for (let offset = 1; offset <= game.players.length; offset += 1) {
      const index = (fromIndex + offset) % game.players.length;
      const player = game.players[index];
      if (player && !player.left && predicate(player)) return index;
    }
    return null;
  }

  function endGame(game, winnerId = null, message = '') {
    game.status = 'finished';
    game.winnerId = winnerId;
    if (message) game.message = message;
  }

  function createMahjongWall() {
    const tiles = [];
    for (const suit of ['man', 'pin', 'sou']) {
      for (let rank = 1; rank <= 9; rank += 1) {
        for (let copyIndex = 0; copyIndex < 4; copyIndex += 1) {
          const red = rank === 5 && copyIndex === 0;
          tiles.push({
            id: makeId(), suit, rank, red, asset: red ? `aka${['man', 'pin', 'sou'].indexOf(suit) + 1}` : `${suit}${rank}`,
            zone: 'wall', ownerId: null, x: 50, y: 50
          });
        }
      }
    }
    for (let rank = 1; rank <= 7; rank += 1) {
      for (let copyIndex = 0; copyIndex < 4; copyIndex += 1) {
        tiles.push({ id: makeId(), suit: 'ji', rank, red: false, asset: `ji${rank}`, zone: 'wall', ownerId: null, x: 50, y: 50 });
      }
    }
    return shuffled(tiles);
  }

  function removeMatchingPairs(hand) {
    const ranks = new Map();
    for (const card of hand) {
      if (card.joker) continue;
      const group = ranks.get(card.rank) || [];
      group.push(card);
      ranks.set(card.rank, group);
    }
    const removed = [];
    for (const group of ranks.values()) {
      while (group.length >= 2) removed.push(...group.splice(0, 2));
    }
    return { kept: hand.filter(card => !removed.includes(card)), removed };
  }

  function createMemoryGame(players) {
    const board = [];
    for (const suit of suits.slice(0, 2)) {
      for (let rank = 1; rank <= 13; rank += 1) {
        for (let copyIndex = 0; copyIndex < 2; copyIndex += 1) {
          board.push({
            id: makeId(), suit, rank, matchKey: `${suit}-${rank}`,
            faceUp: false, matched: false, matchedBy: null
          });
        }
      }
    }
    return {
      mode: 'memory', status: 'playing', players: players.map(player => player.id),
      current: 0, board: shuffled(board), selected: [], scores: Object.fromEntries(players.map(player => [player.id, 0])),
      message: `${players[0].name}の番です。`
    };
  }

  function createOldMaidGame(players) {
    const deck = makeGameDeck(true);
    const gamePlayers = players.map(player => ({ id: player.id, name: player.name, hand: [] }));
    deck.forEach((card, index) => gamePlayers[index % gamePlayers.length].hand.push(card));
    for (const player of gamePlayers) {
      const { kept } = removeMatchingPairs(player.hand);
      player.hand = kept;
    }
    const game = {
      mode: 'old-maid', status: 'playing', players: gamePlayers, current: 0,
      discardCount: deck.length - gamePlayers.reduce((sum, player) => sum + player.hand.length, 0),
      message: `${gamePlayers[0].name}から始めます。`
    };
    game.current = nextGamePlayer(game, gamePlayers.length - 1, player => player.hand.length > 0) ?? 0;
    if (gamePlayers.filter(player => player.hand.length > 0).length <= 1) {
      const loser = gamePlayers.find(player => player.hand.some(card => card.joker));
      endGame(game, gamePlayers.find(player => player.id !== loser?.id)?.id || null, '配牌でゲームが終了しました。');
    }
    return game;
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
        else next.players.push({
          id: action.player.id, name, coins: 0,
          spectator: next.game?.status === 'playing'
        });
        if (next.game?.status === 'playing') {
          const gamePlayerIds = next.game.mode === 'daifugu'
            ? next.game.daifugu?.players?.map(player => player.roomPlayerId) || []
            : next.game.players?.map(player => typeof player === 'string' ? player : player.id) || [];
          if (gamePlayerIds.includes(action.player.id)) {
            next.players.find(player => player.id === action.player.id).spectator = false;
          }
        }
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
          if (next.game?.status === 'playing') {
            endGame(next.game, null, '参加者が退出したためゲームを終了しました。');
            next.gamePot.locked = next.gamePot.amount > 0;
            next.players.forEach(player => { player.spectator = false; });
          }
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
        const tile = next.mahjongTiles.find(item => item.id === action.objectId && item.zone === 'table');
        const target = object || card || tile;
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
        const tile = next.mahjongTiles.find(item => item.id === action.objectId && item.zone === 'table');
        if (!card && !tile) throw new Error('回収するものが見つかりません。');
        if (tile) {
          tile.zone = 'hand';
          tile.ownerId = action.actorId;
          break;
        }
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
      case 'start-game': {
        assertHost(next, action.actorId);
        if (next.game?.status === 'playing') throw new Error('進行中のゲームを先に終了してください。');
        if (next.gamePot.locked) {
          throw new Error('次のゲームを始める前に賭け金を精算してください。');
        }
        if (!['daifugu', 'memory', 'old-maid'].includes(action.mode)) throw new Error('ゲームを選択してください。');
        const players = next.players.filter(player => !player.spectator);
        if (players.length < 2) throw new Error('ゲーム開始には参加者が2人以上必要です。');
        if (players.length > 10) throw new Error('ゲーム参加者は10人までです。');
        next.players.forEach(player => { player.spectator = false; });
        if (action.mode === 'daifugu') {
          if (!Array.isArray(action.daifugu?.players) || action.daifugu.players.length !== players.length) {
            throw new Error('大富豪のゲーム状態を初期化できませんでした。');
          }
          next.game = { mode: action.mode, status: 'playing', daifugu: action.daifugu };
        } else if (action.mode === 'memory') {
          next.game = createMemoryGame(players);
        } else {
          next.game = createOldMaidGame(players);
        }
        if (next.game.status === 'finished') next.gamePot.locked = next.gamePot.amount > 0;
        break;
      }
      case 'end-game': {
        assertHost(next, action.actorId);
        if (!next.game || next.game.status !== 'playing') throw new Error('進行中のゲームはありません。');
        endGame(next.game, null, 'ホストがゲームを終了しました。');
        next.gamePot.locked = next.gamePot.amount > 0;
        next.players.forEach(player => { player.spectator = false; });
        break;
      }
      case 'daifugu-state': {
        assertHost(next, action.actorId);
        if (next.game?.mode !== 'daifugu' || next.game.status !== 'playing' ||
          !Array.isArray(action.daifugu?.players) || action.daifugu.players.length !== next.game.daifugu.players.length) {
          throw new Error('大富豪の更新データが不正です。');
        }
        next.game.daifugu = action.daifugu;
        if (action.daifugu.finished) {
          next.game.status = 'finished';
          next.gamePot.locked = next.gamePot.amount > 0;
          next.game.message = '大富豪が終了しました。';
          const winnerIndex = action.daifugu.placements?.[0];
          next.game.winnerId = Number.isInteger(winnerIndex)
            ? action.daifugu.players[winnerIndex]?.roomPlayerId || null
            : null;
          next.players.forEach(player => { player.spectator = false; });
        }
        break;
      }
      case 'game-action': {
        const game = next.game;
        if (!game || game.status !== 'playing') throw new Error('進行中のゲームはありません。');
        if (next.players.find(player => player.id === action.actorId)?.spectator) throw new Error('観戦中はゲームに参加できません。');
        if (game.mode === 'memory') {
          if (game.players[game.current] !== action.actorId) throw new Error('あなたの番ではありません。');
          if (action.gameAction === 'flip') {
            if (game.selected.length >= 2 || game.pendingMismatch || typeof action.cardId !== 'string') {
              throw new Error('今はその牌をめくれません。');
            }
            const card = game.board.find(item => item.id === action.cardId && !item.matched && !item.faceUp);
            if (!card) throw new Error('選んだカードはめくれません。');
            card.faceUp = true;
            game.selected.push(card.id);
            if (game.selected.length === 2) {
              const [first, second] = game.selected.map(id => game.board.find(item => item.id === id));
              if (first.matchKey === second.matchKey) {
                first.matched = true;
                second.matched = true;
                first.matchedBy = action.actorId;
                second.matchedBy = action.actorId;
                game.scores[action.actorId] = (game.scores[action.actorId] || 0) + 1;
                game.selected = [];
                game.message = `${next.players.find(player => player.id === action.actorId).name}がペアを取りました。もう一度どうぞ。`;
                if (game.board.every(item => item.matched)) {
                  const best = Math.max(...Object.values(game.scores));
                  const winners = Object.entries(game.scores).filter(([, score]) => score === best).map(([id]) => id);
                  endGame(game, winners.length === 1 ? winners[0] : null, winners.length > 1 ? '引き分けです。' : 'すべてのペアがそろいました。');
                  next.gamePot.locked = next.gamePot.amount > 0;
                  next.players.forEach(player => { player.spectator = false; });
                }
              } else {
                game.pendingMismatch = true;
                game.message = 'ペアではありません。確認したら次の人へ進んでください。';
              }
            } else {
              game.message = 'もう1枚めくってください。';
            }
          } else if (action.gameAction === 'continue') {
            if (!game.pendingMismatch || game.selected.length !== 2) throw new Error('次の人に進める状態ではありません。');
            for (const id of game.selected) {
              const card = game.board.find(item => item.id === id);
              if (card) card.faceUp = false;
            }
            game.selected = [];
            game.pendingMismatch = false;
            game.current = (game.current + 1) % game.players.length;
            game.message = `${next.players.find(player => player.id === game.players[game.current])?.name || '次の人'}の番です。`;
          } else {
            throw new Error('神経衰弱の操作が正しくありません。');
          }
        } else if (game.mode === 'old-maid') {
          const playerIndex = game.players.findIndex(player => player.id === action.actorId);
          if (playerIndex !== game.current) throw new Error('あなたの番ではありません。');
          if (action.gameAction !== 'draw' || typeof action.cardId !== 'string') throw new Error('引くカードを選んでください。');
          const targetIndex = nextGamePlayer(game, playerIndex, player => player.id !== action.actorId && player.hand.length > 0);
          if (targetIndex === null) throw new Error('カードを引く相手がいません。');
          const target = game.players[targetIndex];
          const cardIndex = target.hand.findIndex(card => card.id === action.cardId);
          if (cardIndex < 0) throw new Error('選んだカードは相手の手札にありません。');
          const [drawn] = target.hand.splice(cardIndex, 1);
          const player = game.players[playerIndex];
          player.hand.push(drawn);
          const pairIndex = player.hand.findIndex((card, index) => index !== player.hand.length - 1 &&
            !card.joker && !drawn.joker && card.rank === drawn.rank);
          if (pairIndex >= 0) {
            player.hand.splice(Math.max(pairIndex, player.hand.length - 1), 1);
            player.hand.splice(Math.min(pairIndex, player.hand.length - 1), 1);
            game.discardCount = (game.discardCount || 0) + 2;
            game.message = `${player.name}が同じ数字のペアを捨てました。`;
          } else {
            game.message = `${player.name}が1枚引きました。`;
          }
          const remaining = game.players.filter(candidate => candidate.hand.length > 0);
          if (remaining.length <= 1) {
            const loser = remaining[0];
            endGame(game, game.players.find(candidate => candidate.id !== loser?.id)?.id || null,
              loser ? `${loser.name}がババを持ったままです。` : 'ババ抜きが終了しました。');
            next.gamePot.locked = next.gamePot.amount > 0;
            next.players.forEach(candidate => { candidate.spectator = false; });
          } else {
            game.current = nextGamePlayer(game, playerIndex);
            game.message += ` ${game.players[game.current].name}の番です。`;
          }
        } else {
          throw new Error('このゲームの操作はゲーム画面から行ってください。');
        }
        break;
      }
      case 'draw-mahjong-tile': {
        const wallTile = next.mahjongTiles.find(tile => tile.zone === 'wall');
        if (!wallTile) throw new Error('牌山に牌がありません。');
        wallTile.zone = 'hand';
        wallTile.ownerId = action.actorId;
        break;
      }
      case 'play-mahjong-tile': {
        const tile = next.mahjongTiles.find(item => item.id === action.tileId && item.zone === 'hand' && item.ownerId === action.actorId);
        if (!tile) throw new Error('自分の手牌から牌を選んでください。');
        tile.zone = 'table';
        tile.x = clamp(action.x ?? 50);
        tile.y = clamp(action.y ?? 50);
        break;
      }
      case 'add-mahjong-wall': {
        assertHost(next, action.actorId);
        if (next.mahjongTiles.some(tile => tile.zone !== 'wall')) throw new Error('手牌や場の牌がある間は牌山を作り直せません。');
        next.mahjongTiles = createMahjongWall();
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
      case 'add-bet': {
        const amount = Math.floor(Number(action.amount));
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000) {
          throw new Error('賭け金は1〜10,000枚で指定してください。');
        }
        const player = next.players.find(item => item.id === action.actorId);
        if (next.gamePot.locked) throw new Error('ゲーム終了後の賭け金を先に精算してください。');
        if (player.spectator && next.game?.status === 'playing') throw new Error('観戦中は賭け金を出せません。');
        if ((Number(player.coins) || 0) < amount) throw new Error('所持コインが足りません。');
        if (!Number.isSafeInteger(next.gamePot.amount + amount)) throw new Error('賭け金の合計が上限を超えます。');
        player.coins -= amount;
        next.gamePot.amount += amount;
        next.gamePot.contributions[action.actorId] = (next.gamePot.contributions[action.actorId] || 0) + amount;
        break;
      }
      case 'settle-pot': {
        assertHost(next, action.actorId);
        if (next.game?.status !== 'finished' || next.gamePot.amount < 1) throw new Error('精算できる賭け金がありません。');
        if (action.refund === true) {
          for (const [playerId, amount] of Object.entries(next.gamePot.contributions)) {
            const contributor = next.players.find(player => player.id === playerId);
            if (contributor) {
              if (!Number.isSafeInteger(contributor.coins + amount)) throw new Error('返金後の所持コインが上限を超えます。');
              contributor.coins += amount;
            }
          }
        } else {
          const winner = next.players.find(player => player.id === action.winnerId);
          const gamePlayerIds = next.game.mode === 'daifugu'
            ? next.game.daifugu.players.map(player => player.roomPlayerId)
            : next.game.mode === 'memory'
              ? next.game.players
              : next.game.players.map(player => player.id);
          if (!winner || !gamePlayerIds.includes(winner.id)) throw new Error('勝者を選択してください。');
          const recordedWinner = next.game.winnerId || (next.game.mode === 'daifugu'
            ? next.game.daifugu.placements?.[0] !== undefined
              ? next.game.daifugu.players[next.game.daifugu.placements[0]]?.roomPlayerId
              : null
            : null);
          if (recordedWinner && winner.id !== recordedWinner) throw new Error('ゲーム結果の勝者に賭け金を渡してください。');
          if (!Number.isSafeInteger(winner.coins + next.gamePot.amount)) throw new Error('受け取り後の所持コインが上限を超えます。');
          winner.coins += next.gamePot.amount;
        }
        next.gamePot = { amount: 0, contributions: {}, locked: false };
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
        next.mahjongTiles.forEach(tile => {
          if (tile.zone === 'table') {
            tile.zone = 'wall';
            tile.ownerId = null;
            tile.x = 50;
            tile.y = 50;
          }
        });
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
    result.mahjongTiles = result.mahjongTiles.map(tile => (
      tile.zone === 'hand' && tile.ownerId !== viewerId
        ? { id: tile.id, zone: 'hand', ownerId: tile.ownerId }
        : tile
    ));
    if (result.game?.mode === 'memory') {
      result.game.board = result.game.board.map(card => (
        !card.faceUp && !card.matched
          ? { id: card.id, faceUp: false, matched: false }
          : card
      ));
    } else if (result.game?.mode === 'daifugu' && result.game.daifugu) {
      result.game.daifugu.players = result.game.daifugu.players.map(player => (
        player.roomPlayerId !== viewerId && !result.game.daifugu.finished
          ? { ...player, handCount: player.hand.length, hand: undefined }
          : player
      ));
    } else if (result.game?.mode === 'old-maid') {
      result.game.players = result.game.players.map(player => (
        player.id !== viewerId && result.game.status === 'playing'
          ? { ...player, hand: player.hand.map(card => ({ id: card.id })) }
          : player
      ));
    }
    return result;
  }

  return { createState, apply, publicState };
});
