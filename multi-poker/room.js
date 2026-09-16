(() => {
  const roomList = document.querySelector('#roomList');
  const connectionLabel = document.querySelector('#connectionLabel');
  const playerNameInput = document.querySelector('#playerNameInput');
  const toast = document.querySelector('#roomToast');
  const playerId = sessionStorage.getItem('felt-player-id') || crypto.randomUUID();
  sessionStorage.setItem('felt-player-id', playerId);
  const lobby = window.FeltRealtime.lobby(handleMessage, status => {
    if (status === 'SUBSCRIBED') {
      connectionLabel.textContent = 'オンライン';
      connectionLabel.classList.add('is-online');
      lobby.send({ type: 'rooms' });
    }
  });

  function send(data) { lobby.send(data); }
  function enterRoom(roomId) {
    const name = (playerNameInput.value || localStorage.getItem('felt-player-name') || 'PLAYER').trim();
    localStorage.setItem('felt-player-name', name);
    location.href = `./index.html?roomid=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}`;
  }
  function renderRooms(rooms) {
    roomList.innerHTML = rooms.length ? rooms.map(room => `<article class="room-row"><div><p class="eyebrow">TABLE ${room.id.toUpperCase()}</p><h3>${room.name}</h3><span>${room.playing ? '対戦中' : '参加者を待機中'}</span></div><div class="room-meta"><strong>${room.players} / ${room.maxPlayers}</strong><button class="primary-button join-room" data-room="${room.id}" type="button">参加する <span>↗</span></button></div></article>`).join('') : '<p class="empty-state">公開中の部屋はありません。新しい部屋を作成してください。</p>';
    roomList.querySelectorAll('.join-room').forEach(button => button.addEventListener('click', () => enterRoom(button.dataset.room)));
  }
  function handleMessage(data) { if (data.type === 'room') renderRooms(data.rooms); }
  document.querySelector('#createRoomForm').addEventListener('submit', event => { event.preventDefault(); enterRoom(document.querySelector('#roomIdInput').value.trim()); });
  document.querySelector('#refreshRooms').addEventListener('click', () => send({ type: 'rooms' }));
  playerNameInput.value = localStorage.getItem('felt-player-name') || '';
})();
