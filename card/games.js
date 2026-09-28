(() => {
  const definitions = {
    poker: { label: 'Poker', mode: 'realtime', options: { jokers: 0 }, description: '手札とコインを使うリアルタイム卓' },
    'old-maid': { label: 'ババ抜き', mode: 'turn', options: { jokers: 1 }, description: '順番にカードを引き、ペアを捨てるターン制ゲーム' },
    concentration: { label: '神経衰弱', mode: 'turn', options: { pairs: true }, description: '卓上に伏せたカードをめくるターン制ゲーム' }
  };
  window.CardGames = { definitions, get(name) { return definitions[name] || definitions.poker; } };
})();
