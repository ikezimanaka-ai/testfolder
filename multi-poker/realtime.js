(() => {
  const SUPABASE_URL = 'https://ljmtejqgkyyivhpmfdxh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_aIwwiXKEap4gclC1PhRReg_Rc1q8wSs';
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
      onStatus?.(status);
    });
    return {
      send(payload) {
        if (!subscribed) {
          pending.push(payload);
          return;
        }
        channel.send({ type: 'broadcast', event: 'message', payload });
      }
    };
  }

  window.FeltRealtime = {
    connect(roomName, onMessage, onStatus) {
      return createChannel(`felt-${roomName}`, onMessage, onStatus);
    },
    lobby(onMessage, onStatus) {
      return createChannel('felt-lobby', onMessage, onStatus);
    }
  };
})();
