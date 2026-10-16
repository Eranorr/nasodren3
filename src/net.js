/* =========================================================================
   ÇOK OYUNCULU BAĞLANTI: aktarım sunucusuyla (server/relay.mjs) WebSocket.
   Gönderilen yalnızca oyun anı: takma ad, akışın hücreleri, tahtadaki nesneler, skor. Sunucu hiçbir şey saklamaz.
   Adres VITE_MP_URL ile verilir; verilmezse sayfanın açıldığı makinenin 8787 portu.
   ========================================================================= */
const URL_ = import.meta.env.VITE_MP_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:8787`;

let ws = null, handler = () => {}, queue = [];
export const net = {
  get open() { return !!ws && ws.readyState === 1; },
  on(fn) { handler = fn; },
  // bağlanır (açık değilse) ve iletiyi gönderir; bağlantı kurulamazsa { t: 'error' } gelir
  send(m) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return; }
    queue.push(m);
    if (ws && ws.readyState === 0) return;
    try { ws = new WebSocket(URL_); } catch { queue = []; handler({ t: 'error', msg: 'Sunucuya bağlanılamadı.' }); return; }
    const me = ws;
    me.onopen = () => { for (const q of queue) me.send(JSON.stringify(q)); queue = []; };
    me.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } handler(m); };
    me.onclose = () => { if (ws !== me) return; ws = null; queue = []; handler({ t: 'closed' }); };
    me.onerror = () => {};
  },
  close() { const w = ws; ws = null; queue = []; if (w) try { w.close(); } catch {} },
};
