(() => {
  const params = new URLSearchParams(location.search);
  const roomId = (params.get('roomid') || 'demo-table').toLowerCase();
  const me = sessionStorage.getItem('card-player-id') || crypto.randomUUID();
  const name = (params.get('name') || localStorage.getItem('card-player-name') || 'PLAYER').slice(0, 16);
  sessionStorage.setItem('card-player-id', me);
  let state = { revision: 0, game: 'poker', phase: 'waiting', hostId: me, players: [{ id: me, name, coins: 500 }], cards: [], coins: [], turn: null, direction: 1, log: [] };
  const $ = selector => document.querySelector(selector);
  const channel = CardRealtime.connect(roomId, handleMessage, (status, errorMessage) => {
    $('#connectionLabel').textContent = status === 'SUBSCRIBED' ? 'オンライン' : '接続エラー';
    if (errorMessage) notify(`${errorMessage} URLとDNS設定を確認してください`);
    if (status === 'SUBSCRIBED') send({ type: 'join', player: { id: me, name, coins: 500 } });
  });
  const lobby = CardRealtime.lobby(() => {});
  function send(message) { channel.send({ ...message, from: me }); }
  function notify(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 2400); }
  function image(card) { return card.faceDown || !card.suit ? '../cards/back@2x.png' : `../cards/${card.suit}${String(card.rank).padStart(2, '0')}@2x.png`; }
  function handleMessage(message) {
    if (message.type === 'join' && state.hostId === me && !state.players.some(player => player.id === message.player.id)) { state.players.push(message.player); broadcast(); }
    if (message.type === 'request' && state.hostId === me) { try { state = CardEngine.reduce(state, message.action); broadcast(); } catch (error) { channel.send({ type: 'error', message: error.message, to: message.from }); } }
    if (message.type === 'state') { state = message.state; render(); }
    if (message.type === 'error' && message.to === me) notify(message.message);
  }
  function broadcast() { state.revision += 1; channel.send({ type: 'state', state: CardEngine.publicState(state, me) }); render(); }
  function request(type, data = {}) { send({ type: 'request', action: { type, actorId: me, ...data } }); }
  function render() {
    $('#revisionLabel').textContent = `REV ${state.revision}`; $('#roomLabel').textContent = `TABLE ${roomId.toUpperCase()}`; $('#playerCount').textContent = String(state.players.length).padStart(2, '0'); $('#message').textContent = state.phase === 'waiting' ? '参加者を待っています' : `${CardGames.get(state.game).label} · ${state.phase}`; $('#phaseLabel').textContent = state.phase === 'playing' ? 'PLAYING' : '待機中'; $('#coinValue').textContent = state.coins.filter(item => item.zone === 'table').reduce((sum, item) => sum + item.amount, 0);
    $('#playerList').innerHTML = state.players.map(player => `<div class="player ${player.id === me ? 'active' : ''}"><span class="avatar">${player.name.slice(0, 2)}</span><span class="player-name">${player.name}<small>${state.turn === player.id ? ' · TURN' : ''}</small></span><span class="player-coins">${player.coins || 0}</span></div>`).join('');
    const hand = state.cards.filter(card => card.zone === 'hand' && card.ownerId === me); $('#handCount').textContent = `${hand.length} cards`; $('#hand').innerHTML = hand.map(card => `<button class="playing-card" data-card="${card.id}"><img src="${image(card)}" alt="card"></button>`).join('');
    $('#tableCards').innerHTML = state.cards.filter(card => card.zone === 'table').map(card => `<button class="playing-card table-card" data-card="${card.id}"><img src="${image(card)}" alt="table card"></button>`).join('');
    document.querySelectorAll('[data-card]').forEach(button => button.onclick = () => request(state.game === 'concentration' ? 'reveal' : 'place-card', { cardId: button.dataset.card, visibility: state.game === 'concentration' ? 'public' : 'private' }));
  }
  $('#gameSelect').onchange = event => { if (state.hostId === me) { state.game = event.target.value; state.phase = 'waiting'; broadcast(); } };
  $('#startButton').onclick = () => request('start', { options: CardGames.get($('#gameSelect').value).options });
  $('#resetButton').onclick = () => request('reset');
  $('#dealButton').onclick = () => request('deal', { amount: state.game === 'concentration' ? 0 : 5 });
  $('#coinButton').onclick = () => request('place-coins', { amount: 10 });
  $('#turnButton').onclick = () => {
    if (state.game === 'old-maid') {
      const target = state.players.find(player => player.id !== me && !player.left);
      if (target) request('draw-card', { targetPlayerId: target.id });
    } else request('turn', { skip: 0 });
  };
  $('#collectAllButton').onclick = () => request('collect-all-cards');
  render();
})();
