(() => {
  const params = new URLSearchParams(location.search);
  let savedConfig = {};
  try {
    savedConfig = JSON.parse(localStorage.getItem('card-supabase-config') || '{}');
  } catch {
    localStorage.removeItem('card-supabase-config');
  }
  const SUPABASE_URL = params.get('supabaseUrl') || savedConfig.url || 'https://ljmtejqgkyyivhpmfdxh.supabase.co';
  const SUPABASE_KEY = params.get('supabaseKey') || savedConfig.key || 'sb_publishable_aIwwiXKEap4gclC1PhRReg_Rc1q8wSs';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  function createChannel(name, onMessage, onStatus) {
    const channel = client.channel(name);
    const pending = [];
    let subscribed = false;
    channel.on('broadcast', { event: 'message' }, packet => onMessage(packet.payload));
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        subscribed = true;
        pending.splice(0).forEach(payload => channel.send({ type: 'broadcast', event: 'message', payload }));
      }
      onStatus?.(status, status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
        ? `Supabase Realtimeに接続できません: ${SUPABASE_URL}`
        : null);
    });
    return {
      send(payload) {
        if (!subscribed) pending.push(payload);
        else channel.send({ type: 'broadcast', event: 'message', payload });
      }
    };
  }

  window.CardRealtime = {
    config: { url: SUPABASE_URL, key: SUPABASE_KEY },
    connect(room, onMessage, onStatus) { return createChannel(`card-${room}`, onMessage, onStatus); },
    lobby(onMessage, onStatus) { return createChannel('card-lobby', onMessage, onStatus); }
  };
})();
