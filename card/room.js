(() => {
  const id = sessionStorage.getItem('card-player-id') || crypto.randomUUID();
  sessionStorage.setItem('card-player-id', id);
  const status = document.querySelector('#connectionLabel');
  const list = document.querySelector('#roomList');
  const lobby = CardRealtime.lobby(data => { if (data.type === 'rooms') render(data.rooms); }, (value, errorMessage) => {
    status.textContent = value === 'SUBSCRIBED' ? 'オンライン' : '接続エラー';
    if (errorMessage) renderError(`${errorMessage} URLとDNS設定を確認してください`);
    if (value === 'SUBSCRIBED') lobby.send({ type: 'rooms' });
  });
  function enter(room) { const name = (document.querySelector('#playerNameInput').value || localStorage.getItem('card-player-name') || 'PLAYER').trim(); localStorage.setItem('card-player-name', name); location.href = `./index.html?roomid=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`; }
  function render(rooms) { list.innerHTML = rooms.length ? rooms.map(room => `<article class="room-row"><div><p class="eyebrow">TABLE ${room.id.toUpperCase()}</p><h3>${room.name}</h3><span>${room.game || 'ゲーム未選択'} · ${room.players}人</span></div><div class="room-meta"><button class="primary-button join-room" data-room="${room.id}">参加する ↗</button></div></article>`).join('') : '<p class="empty-state">公開中の部屋はありません。</p>'; list.querySelectorAll('.join-room').forEach(button => button.onclick = () => enter(button.dataset.room)); }
  function renderError(message) { list.innerHTML = `<p class="empty-state connection-error">${message}<br><small>SupabaseのプロジェクトURLを ?supabaseUrl=... で指定できます。</small></p>`; }
  document.querySelector('#createRoomForm').onsubmit = event => { event.preventDefault(); enter(document.querySelector('#roomIdInput').value.trim()); };
  document.querySelector('#refreshRooms').onclick = () => lobby.send({ type: 'rooms' });
  document.querySelector('#playerNameInput').value = localStorage.getItem('card-player-name') || '';
})();
