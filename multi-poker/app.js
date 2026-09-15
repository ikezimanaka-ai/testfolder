(() => {
  'use strict';

  const root = document.getElementById('appRoot');
  const roomId = window.__MULTI_POKER_ROOM_ID__ || (() => {
    const match = location.pathname.match(/\/multi-poker\/room\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  })();

  const SUITS = ['s', 'h', 'd', 'c'];
  const SUIT_NAMES = { s: 'スペード', h: 'ハート', d: 'ダイヤ', c: 'クラブ' };
  const RANK_NAMES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const HAND_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ', 'ファイブカード'];
  const defaultSettings = {
    cpuCount: 3,
    startingCoins: 500,
    ante: 10,
    betUnit: 10,
    turns: 1,
    maxDraw: 5,
    deckRanks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    cardCopies: 1,
    jokerCount: 0,
    limit: true,
  };

  function fetchJson(url, options) {
    return fetch(url, options).then((response) => response.json());
  }

  function renderLobby() {
    root.innerHTML = `
      <main class="app-shell lobby-shell">
        <header class="topbar">
          <div class="brand">
            <span class="brand-mark">♠</span>
            <div>
              <p class="eyebrow">MULTI TABLE LOBBY</p>
              <h1>FELT</h1>
            </div>
          </div>
          <div class="round-status">
            <span class="live-dot"></span>
            <span>部屋一覧</span>
          </div>
          <div class="header-actions">
            <button class="primary-button" id="newRoomButton">新しい部屋を作る</button>
          </div>
        </header>

        <section class="panel room-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">ROOM LIST</p>
              <h2>部屋</h2>
            </div>
            <span class="player-count" id="roomCount">00</span>
          </div>
          <div class="room-list" id="roomList"></div>
        </section>
      </main>
    `;

    const roomList = document.getElementById('roomList');
    const roomCount = document.getElementById('roomCount');
    const newRoomButton = document.getElementById('newRoomButton');

    const refresh = () => {
      fetchJson('/multi-poker/api/rooms')
        .then(({ rooms = [] }) => {
          roomCount.textContent = String(rooms.length).padStart(2, '0');
          roomList.innerHTML = rooms.length
            ? rooms.map((room) => `
              <div class="room-card">
                <div>
                  <p class="eyebrow">TABLE</p>
                  <h3>${room.id}</h3>
                </div>
                <div class="room-card-meta">
                  <span>プレイヤー: ${room.players || 1}</span>
                  <button class="secondary-button join-room" data-room-id="${room.id}">参加</button>
                </div>
              </div>
            `).join('')
            : '<div class="room-card empty-room"><p>まだ部屋がありません。新しい部屋を作って始めましょう。</p></div>';
        })
        .catch(() => {
          roomList.innerHTML = '<div class="room-card empty-room"><p>部屋一覧を取得できませんでした。</p></div>';
        });
    };

    newRoomButton.addEventListener('click', () => {
      const roomIdValue = `room-${Math.random().toString(36).slice(2, 8)}`;
      fetchJson('/multi-poker/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: roomIdValue }),
      }).then(({ ok, roomId: createdId }) => {
        if (ok) {
          window.location.href = `/multi-poker/room/${encodeURIComponent(createdId)}`;
        }
      });
    });

    roomList.addEventListener('click', (event) => {
      const button = event.target.closest('.join-room');
      if (!button) return;
      const targetRoom = button.dataset.roomId;
      if (targetRoom) {
        window.location.href = `/multi-poker/room/${encodeURIComponent(targetRoom)}`;
      }
    });

    refresh();
    setInterval(refresh, 5000);
  }

  function buildRoomPage() {
    root.innerHTML = `
      <div class="offline-loading" id="offlineLoading">
        <div class="offline-loading-mark">♠</div>
        <p class="eyebrow">ROOM ${roomId || 'LOBBY'}</p>
        <h2>カードを準備中</h2>
        <div class="loading-track"><span id="loadingProgress"></span></div>
        <p id="loadingStatus">ゲームファイルをキャッシュしています...</p>
      </div>
      <main class="app-shell">
        <header class="topbar">
          <div class="brand">
            <span class="brand-mark">♠</span>
            <div>
              <p class="eyebrow">MULTI TABLE</p>
              <h1>FELT</h1>
            </div>
          </div>
          <div class="round-status"><span class="live-dot"></span><span id="phaseLabel">卓を準備中</span><span class="round-count" id="roundLabel">ROUND 01</span></div>
          <div class="header-actions">
            <button class="secondary-button" id="backToLobbyButton" type="button">部屋一覧</button>
            <button class="icon-button" id="rulesButton" title="ルール説明" aria-label="ルール説明">?</button>
            <button class="icon-button" id="settingsButton" title="ルール設定" aria-label="ルール設定">⚙</button>
          </div>
        </header>

        <section class="table-layout">
          <aside class="players-panel panel">
            <div class="panel-heading"><div><p class="eyebrow">SEATED PLAYERS</p><h2>プレイヤー</h2></div><span class="player-count" id="playerCount">04</span></div>
            <div id="playerList" class="player-list"></div>
            <div class="legend"><span><i class="legend-dot you"></i>あなた</span><span><i class="legend-dot cpu"></i>CPU</span></div>
          </aside>

          <section class="felt-area">
            <div class="felt-glow"></div>
            <div class="table-header"><div><p class="eyebrow">FIVE CARD DRAW</p><h2 id="tableMessage">カードを選んで交換</h2></div><div class="ante-display"><span>ANTE</span><strong id="anteValue">10</strong></div></div>
            <div class="table-surface">
              <div class="table-rail"></div>
              <div class="card-zone deck-zone"><div class="deck-stack" id="deckStack"><img src="/cards/back@2x.png" alt="山札"><span class="deck-count" id="deckCount">52</span></div><span class="zone-label">DRAW PILE</span></div>
              <div class="pot-zone"><span class="zone-label">POT</span><div class="pot-chips" id="potChips"></div><strong class="pot-value" id="potValue">0</strong></div>
              <div class="card-zone discard-zone"><div class="discard-stack" id="discardStack"></div><span class="zone-label">DISCARD</span></div>
              <div class="center-message" id="centerMessage"><span class="center-kicker">WELCOME TO THE TABLE</span><strong>GOOD LUCK</strong></div>
            </div>
            <div class="action-bar"><div class="action-hint" id="actionHint">参加人数を選んでゲーム開始</div><div class="actions"><button class="secondary-button" id="foldButton">降りる</button><button class="primary-button" id="mainAction">ゲーム開始</button></div></div>
          </section>
        </section>

        <section style="height:300px"></section>

        <section class="hand-panel panel">
          <div class="hand-heading"><div><p class="eyebrow">YOUR HAND</p><h2>あなたのカード</h2></div><span class="selection-count" id="selectionCount">0 / 5 selected</span></div>
          <div class="hand-row" id="playerHand"></div>
          <div class="hand-footer"><p id="handEvaluation">カードが配られると役が表示されます</p><div class="quick-actions"><button class="ghost-button" id="clearSelection">選択解除</button><button class="swap-button" id="exchangeButton" disabled>交換して次のターンへ <span>↗</span></button></div></div>
        </section>

        <footer class="footer-bar"><span>FELT / MULTI TABLE v1.0</span><span>標準52枚デッキ · 5枚ドロー</span><span>ROOM ${roomId || 'LOBBY'}</span></footer>
      </main>

      <dialog id="settingsDialog" class="settings-dialog"><form method="dialog"><div class="dialog-top"><div><p class="eyebrow">TABLE CONFIGURATION</p><h2>ルール設定</h2></div><button class="close-button" value="cancel" aria-label="閉じる">×</button></div><div class="settings-grid"><label>CPU人数<select id="cpuCount"><option value="1">1 CPU</option><option value="2">2 CPU</option><option value="3" selected>3 CPU</option><option value="4">4 CPU</option><option value="5">5 CPU</option><option value="6">6 CPU</option></select></label><label>初期コイン<input id="startingCoins" type="number" min="100" step="50" value="500"></label><label>アンティ<input id="anteSetting" type="number" min="0" step="5" value="10"></label><label>ベット単位<input id="betUnit" type="number" min="1" step="1" value="10"></label><label>交換ラウンド数<input id="turns" type="number" min="1" max="5" value="1"></label><label>1回の最大交換枚数<input id="maxDraw" type="number" min="1" max="5" value="5"></label></div><details class="advanced-settings" open><summary>高度なデッキ設定</summary><p class="settings-note">使用するランクを選び、同じカードを複製できます。</p><div class="rank-picker"><label><input type="checkbox" name="deckRank" value="1" checked><span>A</span></label><label><input type="checkbox" name="deckRank" value="2" checked><span>2</span></label><label><input type="checkbox" name="deckRank" value="3" checked><span>3</span></label><label><input type="checkbox" name="deckRank" value="4" checked><span>4</span></label><label><input type="checkbox" name="deckRank" value="5" checked><span>5</span></label><label><input type="checkbox" name="deckRank" value="6" checked><span>6</span></label><label><input type="checkbox" name="deckRank" value="7" checked><span>7</span></label><label><input type="checkbox" name="deckRank" value="8" checked><span>8</span></label><label><input type="checkbox" name="deckRank" value="9" checked><span>9</span></label><label><input type="checkbox" name="deckRank" value="10" checked><span>10</span></label><label><input type="checkbox" name="deckRank" value="11" checked><span>J</span></label><label><input type="checkbox" name="deckRank" value="12" checked><span>Q</span></label><label><input type="checkbox" name="deckRank" value="13" checked><span>K</span></label></div><label>カードのコピー数<input id="cardCopies" type="number" min="1" max="4" value="1"></label><label>ジョーカー枚数<input id="jokerCount" type="number" min="0" max="2" value="0"></label><label class="check-row"><input id="limitToggle" type="checkbox" checked> ベット上限を有効にする</label></div><div class="dialog-bottom"><button id="applySettings" class="primary-button" type="button">適用</button></div></form></dialog>

      <dialog id="rulesDialog" class="settings-dialog rules-dialog"><form method="dialog"><div class="dialog-top"><div><p class="eyebrow">HOW TO PLAY</p><h2>ドローポーカーのルール</h2></div><button class="close-button" value="cancel" aria-label="閉じる">×</button></div><div class="rules-content"><section><span class="rule-number">01</span><div><h3>配布とアンティ</h3><p>全員に5枚ずつ配り、設定したアンティをポットに入れます。山札は52枚、ジョーカーを追加することもできます。</p></div></section><section><span class="rule-number">02</span><div><h3>交換ラウンド</h3><p>各ラウンドは「チェックまたは降りる」→「必ず1枚以上カード交換」の順です。設定した交換ラウンド数だけ繰り返します。</p></div></section><section><span class="rule-number">03</span><div><h3>ベット操作</h3><p>ベット中は画面右下の「チェック」または「降りる」を選びます。チェック後は必ずカード交換へ進みます。</p></div></section><section><span class="rule-number">04</span><div><h3>役の強さ</h3><p>ファイブカード ＞ ストレートフラッシュ ＞ フォーカード ＞ フルハウス ＞ フラッシュ ＞ ストレート ＞ スリーカード ＞ ツーペア ＞ ワンペア ＞ ハイカード</p></div></section><section><span class="rule-number">05</span><div><h3>ショーダウン</h3><p>最後の交換が終わるまで相手のカードは非公開です。ショーダウンで役を比較し、最も強い役のプレイヤーがポットを獲得します。</p></div></section></div><div class="dialog-bottom"><p>設定ボタンから卓のルールを変更できます</p><button class="primary-button" value="default">閉じる</button></div></form></dialog>
      <div class="toast" id="toast" role="status"></div>
    `;
  }

  function prepareOffline() {
    const status = document.getElementById('loadingStatus');
    const progress = document.getElementById('loadingProgress');
    const paths = ['/cards/back@2x.png', '/cards/j01@2x.png', '/cards/j02@2x.png'];
    SUITS.forEach((suit) => {
      for (let rank = 1; rank <= 13; rank++) paths.push(`/cards/${suit}${String(rank).padStart(2, '0')}@2x.png`);
    });

    let loaded = 0;
    const total = paths.length;
    const updateProgress = () => {
      loaded += 1;
      progress.style.width = `${Math.round((loaded / total) * 100)}%`;
      status.textContent = `カード画像を保存中... ${loaded} / ${total}`;
    };

    return Promise.all(paths.map((path) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        updateProgress();
        resolve();
      };
      image.onerror = () => reject(new Error(`カード画像を読み込めません: ${path}`));
      image.src = path;
    }))).then(() => {
      status.textContent = 'OFFLINE READY · Wifiを切ってプレイできます';
      return new Promise((resolve) => setTimeout(resolve, 350));
    }).then(() => {
      const loading = document.getElementById('offlineLoading');
      if (loading) loading.classList.add('ready');
    });
  }

  function makeDeck(settings) {
    const deck = [];
    for (let copy = 0; copy < settings.cardCopies; copy++) {
      settings.deckRanks.forEach((rank) => SUITS.forEach((suit) => deck.push({ suit, rank, id: `${suit}${rank}-${copy}` })));
    }
    for (let i = 0; i < settings.jokerCount; i++) deck.push({ joker: true, id: `joker-${i}` });
    return deck;
  }

  function shuffle(deck) {
    const next = [...deck];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function drawCard(state) {
    if (!state.deck.length && state.discard.length) state.deck = shuffle(state.discard.splice(0));
    const configuredDeck = makeDeck(state.settings);
    return state.deck.pop() || configuredDeck[Math.floor(Math.random() * configuredDeck.length)];
  }

  function sortRanks(cards) {
    return cards.filter((card) => !card.joker).map((card) => (card.rank === 1 ? 14 : card.rank)).sort((a, b) => b - a);
  }

  function evaluateHand(cards) {
    const jokers = cards.filter((card) => card.joker).length;
    const natural = cards.filter((card) => !card.joker);
    const ranks = sortRanks(cards);
    const counts = {};
    natural.forEach((card) => {
      counts[card.rank] = (counts[card.rank] || 0) + 1;
    });
    const groups = Object.values(counts).sort((a, b) => b - a);
    const suits = new Set(natural.map((card) => card.suit));
    let straightHigh = 0;
    for (let high = 14; high >= 5; high--) {
      const needed = [high, high - 1, high - 2, high - 3, high - 4];
      if (needed.filter((n) => ranks.includes(n)).length + jokers >= 5) {
        straightHigh = high;
        break;
      }
    }
    if (!straightHigh && ranks.includes(14) && ranks.includes(2) && ranks.includes(3) && ranks.includes(4) && (jokers >= 1 || ranks.includes(5))) {
      straightHigh = 5;
    }
    const flush = natural.length === 5 && suits.size === 1 || natural.length + jokers === 5 && suits.size <= 1;
    if (jokers && groups[0] === 4) return { rank: 9, name: HAND_NAMES[9], tiebreak: [14], wild: true };
    if (straightHigh && flush) return { rank: 8, name: HAND_NAMES[8], tiebreak: [straightHigh], wild: jokers > 0 };
    if (groups[0] + jokers >= 4) return { rank: 7, name: HAND_NAMES[7], tiebreak: [groups[0] === 4 ? Number(Object.keys(counts).find((key) => counts[key] === 4)) : 14], wild: jokers > 0 };
    if (groups[0] + jokers >= 3 && (groups[1] || 0) + Math.max(0, jokers - (3 - groups[0])) >= 2) return { rank: 6, name: HAND_NAMES[6], tiebreak: ranks, wild: jokers > 0 };
    if (flush) return { rank: 5, name: HAND_NAMES[5], tiebreak: ranks, wild: jokers > 0 };
    if (straightHigh) return { rank: 4, name: HAND_NAMES[4], tiebreak: [straightHigh], wild: jokers > 0 };
    if (groups[0] + jokers >= 3) return { rank: 3, name: HAND_NAMES[3], tiebreak: ranks, wild: jokers > 0 };
    if (groups[0] + jokers >= 2 && (groups[1] || 0) >= 2) return { rank: 2, name: HAND_NAMES[2], tiebreak: ranks, wild: jokers > 0 };
    if (groups[0] + jokers >= 2) return { rank: 1, name: HAND_NAMES[1], tiebreak: ranks, wild: jokers > 0 };
    return { rank: 0, name: HAND_NAMES[0], tiebreak: ranks, wild: false };
  }

  function compareHands(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
      if ((a.tiebreak[i] || 0) !== (b.tiebreak[i] || 0)) return (a.tiebreak[i] || 0) - (b.tiebreak[i] || 0);
    }
    return 0;
  }

  function saveBankrolls(state) {
    state.players.forEach((player) => {
      state.bankrolls[player.id] = player.coins;
    });
  }

  function takeAnte(state) {
    state.pot = 0;
    state.players.forEach((player) => {
      player.roundBet = 0;
      player.folded = false;
      player.spectating = false;
      player.inactive = player.coins < state.settings.ante;
      player.folded = player.inactive;
      if (player.inactive) return;
      player.coins -= state.settings.ante;
      state.pot += state.settings.ante;
    });
  }

  function dealHands(state) {
    state.players.filter((player) => !player.inactive).forEach((player) => {
      for (let i = 0; i < 5; i++) player.hand.push(drawCard(state));
    });
  }

  function foldPlayer(state, player) {
    player.folded = true;
    player.spectating = true;
    state.discard.push(...player.hand.splice(0));
  }

  function resolveParticipation(state) {
    const you = state.players[0];
    const active = state.players.filter((player) => !player.inactive);
    if (you.inactive) {
      state.phase = 'finished';
      document.getElementById('centerMessage').innerHTML = '<span class="center-kicker">OUT OF COINS</span><strong>YOU LOSE</strong>';
      showToast('アンティを払えないため敗北しました');
      return true;
    }
    if (active.length === 1) {
      state.winner = you.id;
      you.coins += state.pot;
      state.pot = 0;
      state.phase = 'finished';
      document.getElementById('centerMessage').innerHTML = '<span class="center-kicker">LAST PLAYER STANDING</span><strong>YOU WIN</strong>';
      showToast('あなた以外が参加できないため勝利しました');
      return true;
    }
    return false;
  }

  function newGame(state) {
    saveBankrolls(state);
    state.round += 1;
    state.turn = 0;
    state.phase = 'deal';
    state.winner = null;
    state.selected.clear();
    state.currentBet = 0;
    state.discard = [];
    state.deck = shuffle(makeDeck(state.settings));
    const createPlayer = (id, name, label) => ({ id, name, label, coins: Number(state.bankrolls[id] ?? state.settings.startingCoins), hand: [], folded: false, spectating: false, inactive: false, roundBet: 0 });
    state.players = [createPlayer('you', 'YOU', 'あなた'), createPlayer('cpu1', 'CPU 01', 'CPU')];
    for (let i = 2; i <= state.settings.cpuCount; i++) state.players.push(createPlayer(`cpu${i}`, `CPU ${String(i).padStart(2, '0')}`, 'CPU'));
    takeAnte(state);
    dealHands(state);
    renderPlayers(state, true);
    renderHand(state, true);
    updateTable(state);
    if (resolveParticipation(state)) {
      renderPlayers(state);
      updateTable(state);
      return;
    }
    setTimeout(() => {
      state.phase = 'bet';
      updateText(state);
    }, 500);
  }

  function renderPlayers(state, animate = false) {
    const playerCount = document.getElementById('playerCount');
    const playerList = document.getElementById('playerList');
    playerCount.textContent = String(state.players.length).padStart(2, '0');
    playerList.innerHTML = state.players.map((player, index) => {
      const showCards = state.phase === 'finished' || state.phase === 'showdown';
      const evaluation = showCards && player.hand.length ? evaluateHand(player.hand) : null;
      const miniHand = index === 0 ? '' : `<div class="opponent-hand">${player.hand.map((card) => `<img class="mini-card ${showCards ? 'revealed-card' : 'hidden-card'} ${animate ? 'cpu-deal-in' : ''}" src="${showCards ? imagePath(card) : '/cards/back@2x.png'}" alt="${showCards ? (card.joker ? 'ジョーカー' : 'CPUのカード') : '相手の伏せカード'}">`).join('')}</div><div class="opponent-evaluation">${evaluation ? evaluation.name : '非公開'}${evaluation?.wild ? ' · WILD' : ''}</div>`;
      return `<div class="player ${index === 0 ? 'active' : ''} ${player.folded || player.inactive ? 'folded' : ''} ${animate && index > 0 && !player.folded && !player.inactive ? 'cpu-draw-in' : ''}"><div class="player-main"><div class="avatar ${index === 0 ? 'you' : ''}">${index === 0 ? 'YOU' : 'C' + index}</div><div><div class="player-name">${player.label}</div><div class="player-state">${player.inactive ? 'OUT OF COINS' : player.spectating ? 'SPECTATING' : player.folded ? 'FOLDED' : index === 0 ? 'YOUR SEAT' : 'CPU PLAYER'}</div></div><div class="player-coins">◉ ${player.coins}</div></div>${miniHand}</div>`;
    }).join('');
  }

  function imagePath(card) {
    if (card.joker) return '/cards/j01@2x.png';
    return `/cards/${card.suit}${String(card.rank).padStart(2, '0')}@2x.png`;
  }

  function renderHand(state, animate = false) {
    const hand = state.players[0]?.hand || [];
    const playerHand = document.getElementById('playerHand');
    playerHand.innerHTML = hand.map((card, index) => `
      <div class="playing-card ${state.selected.has(index) ? 'selected' : ''} ${animate ? 'deal-in' : ''}" data-index="${index}" style="animation-delay:${index * 70}ms">
        <img src="${imagePath(card)}" alt="${card.joker ? 'ジョーカー' : SUIT_NAMES[card.suit] + (RANK_NAMES[card.rank] || card.rank)}">
      </div>
    `).join('');
    document.getElementById('selectionCount').textContent = `${state.selected.size} / 5 selected`;
    document.getElementById('exchangeButton').disabled = state.phase !== 'draw' || state.busy;
    const handValue = hand.length ? evaluateHand(hand) : null;
    document.getElementById('handEvaluation').textContent = handValue ? `${handValue.name}${handValue.wild ? ' · JOKER WILD' : ''}` : 'カードが配られると役が表示されます';
  }

  function renderDiscard(cards, state) {
    const discardStack = document.getElementById('discardStack');
    cards.forEach((card) => {
      const element = document.createElement('img');
      element.src = imagePath(card);
      element.alt = '捨て札';
      element.className = 'discard-in';
      discardStack.prepend(element);
    });
    while (discardStack.children.length > 3) discardStack.lastChild.remove();
  }

  function addChips(amount) {
    const chips = document.getElementById('potChips');
    chips.innerHTML = '';
    for (let i = 0; i < Math.min(8, Math.ceil(amount / 25)); i++) {
      const chip = document.createElement('i');
      chip.style.setProperty('--i', i);
      chip.className = 'chip-in';
      chip.style.animationDelay = `${i * 50}ms`;
      chips.appendChild(chip);
    }
  }

  function updateTable(state) {
    document.getElementById('potValue').textContent = String(state.pot);
    document.getElementById('anteValue').textContent = String(state.settings.ante);
    document.getElementById('deckCount').textContent = String(state.deck.length);
    addChips(state.pot);
    updateText(state);
  }

  function updateText(state) {
    const labels = { idle: '卓を準備中', deal: 'カードを配布中', bet: 'チェックまたは降りる', draw: 'カードを交換', showdown: 'ショーダウン', finished: 'ラウンド終了' };
    document.getElementById('phaseLabel').textContent = labels[state.phase] || labels.idle;
    document.getElementById('roundLabel').textContent = `ROUND ${String(state.round || 1).padStart(2, '0')}`;
    const hints = {
      idle: '参加人数を選んでゲーム開始',
      bet: `ターン ${state.turn + 1} / ${state.settings.turns} · チェックまたは降りる`,
      draw: `ターン ${state.turn + 1} / ${state.settings.turns} · カードを選択`,
      showdown: '全員のカードを公開中',
      finished: '勝者がポットを獲得しました',
    };
    document.getElementById('actionHint').textContent = hints[state.phase] || '';
    document.getElementById('tableMessage').textContent = state.phase === 'draw' ? '交換するカードを選択' : state.phase === 'finished' ? '次のラウンドへ' : (labels[state.phase] || 'カードを選んで交換');
    document.getElementById('mainAction').textContent = state.phase === 'idle' ? 'ゲーム開始' : state.phase === 'draw' ? '交換する' : state.phase === 'finished' ? '新しいゲーム' : 'チェック';
    document.getElementById('foldButton').disabled = state.phase !== 'bet';
  }

  function cpuBet(state) {
    state.players.slice(1).forEach((player) => {
      if (player.folded || player.inactive) return;
      const hand = evaluateHand(player.hand);
      if ((hand.rank === 0 && Math.random() < 0.4) || (hand.rank === 1 && Math.random() < 0.12)) {
        foldPlayer(state, player);
        return;
      }
      const aggression = hand.rank >= 2 ? 2 : 1;
      const amount = Math.min(player.coins, state.settings.betUnit * aggression);
      player.coins -= amount;
      player.roundBet += amount;
      state.pot += amount;
    });
  }

  function playerBet(state) {
    const amount = Math.min(state.players[0].coins, state.settings.betUnit);
    if (state.settings.limit && state.currentBet + amount > state.settings.ante * 10) return showToast('ベット上限に達しています');
    state.players[0].coins -= amount;
    state.players[0].roundBet += amount;
    state.currentBet += amount;
    state.pot += amount;
    cpuBet(state);
    renderPlayers(state);
    updateTable(state);
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function cpuDraw(state) {
    for (const player of state.players.slice(1)) {
      if (player.folded || player.inactive || player.spectating) continue;
      await wait(800);
      const hand = evaluateHand(player.hand);
      const keep = [];
      player.hand.forEach((card, index) => {
        if (card.joker || hand.rank >= 4 || (hand.rank === 1 && Math.random() > 0.35)) keep.push(index);
      });
      const replace = player.hand.map((_, index) => index).filter((index) => !keep.includes(index)).slice(0, state.settings.maxDraw);
      replace.forEach((index) => {
        state.discard.push(player.hand[index]);
        player.hand[index] = drawCard(state);
      });
      renderPlayers(state, true);
    }
  }

  async function doDraw(state) {
    if (state.busy) return;
    const indexes = [...state.selected].slice(0, state.settings.maxDraw);
    state.busy = true;
    document.getElementById('exchangeButton').disabled = true;
    const discarded = indexes.map((index) => state.players[0].hand[index]);
    state.discard.push(...discarded);
    renderDiscard(discarded, state);
    const replacements = indexes.map(() => drawCard(state));
    indexes.forEach((index, offset) => {
      state.players[0].hand[index] = replacements[offset];
    });
    state.selected.clear();
    renderHand(state, true);
    updateTable(state);
    showToast(indexes.length ? `${indexes.length}枚を交換しました` : 'カードを交換せず次のターンへ進みます');
    await cpuDraw(state);
    state.turn += 1;
    state.busy = false;
    if (state.turn >= state.settings.turns) {
      showdown(state);
      return;
    }
    state.phase = 'bet';
    renderPlayers(state, true);
    updateTable(state);
  }

  function showdown(state) {
    state.phase = 'showdown';
    const alive = state.players.filter((player) => !player.folded && !player.inactive && !player.spectating);
    alive.forEach((player) => {
      player.evaluation = evaluateHand(player.hand);
    });
    alive.sort((a, b) => compareHands(b.evaluation, a.evaluation));
    const winner = alive[0];
    if (!winner) return;
    state.winner = winner.id;
    winner.coins += state.pot;
    state.pot = 0;
    state.phase = 'finished';
    renderHand(state);
    renderPlayers(state);
    updateTable(state);
    document.getElementById('centerMessage').innerHTML = `<span class="center-kicker">WINNER · ${winner.name}</span><strong>${winner.evaluation.name}</strong>`;
    showToast(`${winner.label} が勝利。${winner.evaluation.name}でポット獲得`);
  }

  function action(state) {
    if (state.busy) return;
    if (state.phase === 'idle' || state.phase === 'finished') return newGame(state);
    if (state.phase === 'bet') {
      playerBet(state);
      state.phase = 'draw';
      renderHand(state);
      renderPlayers(state);
      updateTable(state);
      return;
    }
    if (state.phase === 'draw') return doDraw(state);
  }

  async function fold(state) {
    if (state.phase !== 'bet' || state.busy) return;
    state.busy = true;
    const player = state.players[0];
    const discarded = player.hand.slice();
    foldPlayer(state, player);
    if (discarded.length) renderDiscard(discarded, state);
    state.selected.clear();
    state.turn += 1;
    state.busy = false;
    const alive = state.players.filter((entry) => !entry.folded && !entry.inactive && !entry.spectating);
    if (!alive.length) {
      state.pot = 0;
      state.phase = 'finished';
      document.getElementById('centerMessage').innerHTML = '<span class="center-kicker">YOU FOLDED</span><strong>YOU LOSE</strong>';
      showToast('降りたため敗北しました');
    } else if (alive.length === 1) {
      state.winner = alive[0].id;
      alive[0].coins += state.pot;
      state.pot = 0;
      state.phase = 'finished';
      document.getElementById('centerMessage').innerHTML = `<span class="center-kicker">WINNER · ${alive[0].name}</span><strong>YOU LOSE</strong>`;
      showToast('降りたため敗北しました');
    } else if (state.turn >= state.settings.turns) {
      showdown(state);
      return;
    } else {
      state.phase = 'bet';
    }
    renderHand(state);
    renderPlayers(state);
    updateTable(state);
  }

  function showToast(text) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function syncSettingsForm(state) {
    document.getElementById('cpuCount').value = state.settings.cpuCount;
    document.getElementById('startingCoins').value = state.settings.startingCoins;
    document.getElementById('anteSetting').value = state.settings.ante;
    document.getElementById('betUnit').value = state.settings.betUnit;
    document.getElementById('turns').value = state.settings.turns;
    document.getElementById('maxDraw').value = state.settings.maxDraw;
    document.getElementById('cardCopies').value = state.settings.cardCopies;
    document.getElementById('jokerCount').value = state.settings.jokerCount;
    document.getElementById('limitToggle').checked = state.settings.limit;
    document.querySelectorAll('input[name="deckRank"]').forEach((input) => {
      input.checked = state.settings.deckRanks.includes(Number(input.value));
    });
  }

  function applySettings(state, event) {
    const deckRanks = [...document.querySelectorAll('input[name="deckRank"]:checked')].map((input) => Number(input.value));
    if (!deckRanks.length) {
      event?.preventDefault();
      showToast('使用するランクを1つ以上選択してください');
      return;
    }
    const nextSettings = {
      cpuCount: Number(document.getElementById('cpuCount').value),
      startingCoins: Number(document.getElementById('startingCoins').value),
      ante: Number(document.getElementById('anteSetting').value),
      betUnit: Number(document.getElementById('betUnit').value),
      turns: Number(document.getElementById('turns').value),
      maxDraw: Number(document.getElementById('maxDraw').value),
      deckRanks,
      cardCopies: Number(document.getElementById('cardCopies').value),
      jokerCount: Number(document.getElementById('jokerCount').value),
      limit: document.getElementById('limitToggle').checked,
    };
    const changed = JSON.stringify(nextSettings) !== JSON.stringify(state.settings);
    if (changed) {
      state.bankrolls = {};
      state.players = [];
    }
    state.settings = nextSettings;
    document.getElementById('settingsDialog').close();
    showToast(changed ? '設定を変更しました。次のゲームでコインをリセットします' : '設定を保存しました。コインを維持します');
    updateTable(state);
  }

  function initRoomGame() {
    const state = {
      settings: { ...defaultSettings },
      players: [],
      bankrolls: {},
      deck: [],
      discard: [],
      pot: 0,
      phase: 'idle',
      round: 0,
      turn: 0,
      selected: new Set(),
      currentBet: 0,
      winner: null,
      busy: false,
    };

    const peerKey = `multi-poker:${roomId}:peer`;
    const peerId = sessionStorage.getItem(peerKey) || `peer-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(peerKey, peerId);

    const signalState = {
      roomId,
      socket: null,
      peerId,
      hostId: `multi-poker-${roomId}-host`,
      authName: null,
      isHost: false,
      peers: new Set(),
      live: false,
    };

    const hostKey = `multi-poker:${roomId}:host`;
    const existingHost = sessionStorage.getItem(hostKey);
    if (!existingHost) {
      sessionStorage.setItem(hostKey, signalState.peerId);
      signalState.isHost = true;
    } else {
      signalState.isHost = existingHost === signalState.peerId;
    }
    signalState.authName = signalState.isHost ? signalState.hostId : `multi-poker-${roomId}-${signalState.peerId}`;

    function getPublicState() {
      return {
        phase: state.phase,
        players: state.players.map((player) => ({
          id: player.id,
          name: player.name,
          label: player.label,
          coins: player.coins,
          hand: player.hand.map((card) => ({ ...card })),
          folded: player.folded,
          inactive: player.inactive,
          spectating: player.spectating,
        })),
        pot: state.pot,
        deckCount: state.deck.length,
        settings: { ...state.settings },
        round: state.round,
        turn: state.turn,
      };
    }

    function applyRemoteState(remoteState) {
      if (!remoteState || !remoteState.players) return;
      state.phase = remoteState.phase || state.phase;
      state.pot = Number(remoteState.pot ?? state.pot);
      state.round = Number(remoteState.round ?? state.round);
      state.turn = Number(remoteState.turn ?? state.turn);
      state.settings = { ...state.settings, ...(remoteState.settings || {}) };
      state.players = remoteState.players.map((player) => ({
        id: player.id,
        name: player.name,
        label: player.label,
        coins: Number(player.coins ?? 0),
        hand: Array.isArray(player.hand) ? player.hand.map((card) => ({ ...card })) : [],
        folded: !!player.folded,
        inactive: !!player.inactive,
        spectating: !!player.spectating,
      }));
      renderPlayers(state);
      renderHand(state);
      updateTable(state);
    }

    function sendSignal(payload) {
      if (!signalState.socket || signalState.socket.readyState !== WebSocket.OPEN) return;
      signalState.socket.send(JSON.stringify({
        type: 'room-message',
        roomId,
        clientId: signalState.peerId,
        payload,
      }));
    }

    function broadcastRoomState() {
      if (!signalState.isHost) return;
      sendSignal({ type: 'room-state', roomId, state: getPublicState() });
    }

    function announcePresence() {
      if (!roomId) return;
      fetchJson('/multi-poker/api/rooms/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      }).catch(() => {});
    }

    function connectSignal() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}/multi-poker-ws`);
      signalState.socket = socket;

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          type: 'join-room',
          roomId,
          clientId: signalState.peerId,
        }));
      });

      socket.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'join-room-ack') {
            signalState.live = true;
            signalState.peers = new Set((data.members || []).filter((member) => member && member !== signalState.peerId));
            if (signalState.isHost) {
              broadcastRoomState();
            }
            return;
          }

          if (data.type === 'room-members') {
            signalState.peers = new Set((data.members || []).filter((member) => member && member !== signalState.peerId));
            return;
          }

          const sender = data.clientId || data.from || null;
          const payload = data.payload || data;
          if (!payload || payload.roomId !== roomId) return;
          if (sender === signalState.peerId) return;

          if (payload.type === 'join-request' && signalState.isHost) {
            signalState.peers.add(sender || payload.peerId || signalState.peerId);
            sendSignal({ type: 'room-accepted', roomId, state: getPublicState() });
            broadcastRoomState();
            return;
          }

          if (payload.type === 'room-state' && !signalState.isHost) {
            if (payload.state) applyRemoteState(payload.state);
            return;
          }

          if (payload.type === 'room-accepted' && !signalState.isHost) {
            signalState.live = true;
            if (payload.state) applyRemoteState(payload.state);
            return;
          }
        } catch (error) {
          console.warn('Signal message ignored', error);
        }
      });
    }

    function initHandlers() {
      document.getElementById('backToLobbyButton').addEventListener('click', () => {
        window.location.href = '/multi-poker/';
      });
      document.getElementById('mainAction').addEventListener('click', () => action(state));
      document.getElementById('foldButton').addEventListener('click', () => fold(state));
      document.getElementById('exchangeButton').addEventListener('click', () => doDraw(state));
      document.getElementById('clearSelection').addEventListener('click', () => {
        state.selected.clear();
        renderHand(state);
      });
      document.getElementById('settingsButton').addEventListener('click', () => {
        syncSettingsForm(state);
        document.getElementById('settingsDialog').showModal();
      });
      document.getElementById('rulesButton').addEventListener('click', () => document.getElementById('rulesDialog').showModal());
      document.getElementById('applySettings').addEventListener('click', (event) => applySettings(state, event));
      document.getElementById('playerHand').addEventListener('click', (event) => {
        const card = event.target.closest('.playing-card');
        if (!card || state.phase !== 'draw') return;
        const index = Number(card.dataset.index);
        if (state.selected.has(index)) state.selected.delete(index);
        else state.selected.add(index);
        renderHand(state);
      });
    }

    signalState.isHost = true;
    if (roomId) {
      fetchJson('/multi-poker/api/rooms')
        .then(({ rooms = [] }) => {
          if (!rooms.some((room) => room.id === roomId)) {
            return fetchJson('/multi-poker/api/rooms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId }),
            });
          }
          return { ok: true };
        })
        .catch(() => {})
        .finally(() => {
          try {
            connectSignal();
          } catch (error) {
            console.warn('Signal connection failed', error);
          }
        });
    }

    prepareOffline().then(() => {
      state.settings = { ...defaultSettings };
      state.players = [];
      state.bankrolls = {};
      newGame(state);
      initHandlers();
      announcePresence();
    }).catch((error) => {
      const status = document.getElementById('loadingStatus');
      status.textContent = 'カード画像を読み込めません。通信状態を確認してください。';
      console.error(error);
    });
  }

  if (roomId) {
    buildRoomPage();
    initRoomGame();
  } else {
    renderLobby();
  }
})();
