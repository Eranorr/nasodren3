/* =========================================================================
   ÇOK OYUNCULU BAĞLANTI: Supabase Realtime (Presence + Broadcast). Ayrı bir aktarım sunucusu yok,
   statik barındırmada (GitHub Pages, Cloudflare Pages) da çalışır.
   Her oda bir kanal: "snake:room:KOD" (paylaşılan Supabase projesinde diğer oyunların odalarıyla çakışmasın diye önekli).
   - Presence: yalnızca odada kim var. Kayıt girişte bir kez yazılır: Supabase sık güncellenen kaydı olan kanalı kapatıyor
     (denendi: birkaç track() sonrası CLOSED). Ev sahibi her istemcide aynı kuralla hesaplanır: en erken katılan.
   - Broadcast: oyun anı iletileri (start, st, fin, away). Tur ve ara durumu bunlardan izlenir.
     Gönderilen yalnızca takma ad, akışın hücreleri, nesneler, skor; hiçbir şey saklanmaz.
   Turun oyuncuları "start" iletisinde gelir (ids). Tur sürerken katılan turu oynamaz, lobide bekler; tur sürdükçe
   oynayanlara gösterilmez (tur sonucunu bekletmesin), tur bitince sıradaki tura katılır.
   main.js'e açılan arayüz ve ileti biçimleri eski aktarım sunucusununkiyle aynı:
     net.open / net.on(fn) / net.send(m) / net.close()
     { t: 'room' | 'players' | 'start' | 'st' | 'fin' | 'away' | 'error' | 'closed', ... }
   Merkezi otorite olmadığı için "oda dolu" / "tur sürüyor" denetimleri istemcide yapılır (eski sunucuda da hile koruması yoktu).
   ========================================================================= */
import { supabase, SUPABASE_OK } from './supabase.js';

const MAX_PLAYERS = 3, CODE_ABC = 'ABCDEFGHJKLMNPRSTUVYZ23456789';   // karışmayan harfler (I/1, O/0 yok)
const JOIN_TIMEOUT = 10000;   // kanala bu sürede girilemezse vazgeç (ms); arada gelen hatalarda kütüphane kendisi yeniden dener
const JOIN_WAIT = 3000;    // katılırken odada kimse görünmezse "oda yok" demeden önce bekleme (ms): kanal ilk anda boş durum bildirir
const START_IN = 6000;     // tur başı bekleme: bölümün bilgisini okumaya ve hazırlanmaya

let handler = () => {}, channel = null, me = null, stage = 'idle';   // stage: idle | joining | tracked | joined
let round = null, shown = 0, away = {}, lastRound = 0;   // round: süren turun oyuncuları { ids, fin }; shown: main.js'e son bildirilen oyuncu sayısı
let removing = Promise.resolve(), attempt = 0;   // önceki kanalın kapanışı; attempt: son giriş denemesi (eskisi yarıda kalsın)
const deliver = m => setTimeout(() => handler(m), 0);   // kendi iletimiz de (start, fin) sunucudan gelmiş gibi, sırayla
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Oyuncu';
const newId = () => Date.now() % 1000000 * 1000 + ((Math.random() * 1000) | 0);   // sayı olmalı: mp.totals kimliğe göre tutulur
function newCode() { let c = ''; for (let i = 0; i < 4; i++) c += CODE_ABC[(Math.random() * CODE_ABC.length) | 0]; return c; }

// kanaldaki herkes, katılış sırasıyla. Bir oyuncunun birden çok kaydı olabilir (bağlantı yenilenince eskisi bir süre kalır): en yenisi (v)
const newest = a => (a || []).reduce((x, y) => (!x || (y.v | 0) > (x.v | 0) ? y : x), null);
const everyone = () => Object.values(channel ? channel.presenceState() : {}).map(newest).filter(Boolean).sort((a, b) => a.joinedAt - b.joinedAt || a.id - b.id);
// tur, oyuncularından biri hâlâ odada, ara vermemiş ve bitirmemişken sürer (eski sunucudaki roundDone)
function live() {
  if (!round) return false;
  const list = everyone();
  if ([...round.ids].some(id => { const p = list.find(q => q.id === id); return p && !away[id] && !round.fin.has(id); })) return true;
  round = null; return false;
}
// main.js'in gördüğü oda: turu oynayan için tur sürerken yalnızca turun oyuncuları. Herkes aynı durumdan aynı ev sahibini bulur
function roster() {
  const list = live() && me && round.ids.has(me.id) ? everyone().filter(p => round.ids.has(p.id)) : everyone();
  return { host: list.length ? list[0].id : 0, players: list.map(p => ({ id: p.id, name: p.name, color: p.color, away: !!away[p.id] })) };
}
function players(extra) { const r = roster(); shown = r.players.length; handler({ t: 'players', ...r, ...extra }); }
// tur bitince o sırada katılmış olanlar görünür olur
const recheck = () => { if (stage === 'joined' && roster().players.length !== shown) players(); };
function teardown() {
  const ch = channel; channel = null; me = null; stage = 'idle'; round = null; away = {}; lastRound = 0; attempt++;
  if (ch) removing = supabase.removeChannel(ch).catch(() => {});
}

async function enter(code, name, create) {
  if (!SUPABASE_OK) { deliver({ t: 'error', msg: 'Çok oyunculu şu an kullanılamıyor.' }); return; }
  teardown();
  const mine = attempt, topic = 'snake:room:' + code;
  stage = 'joining';
  // supabase.channel() aynı adlı kanal hâlâ kayıtlıysa onu (eski oyuncu listesiyle) geri verir: önce kapanışı bekle
  await removing;
  const stale = supabase.getChannels().find(c => c.topic === 'realtime:' + topic);
  if (stale) await supabase.removeChannel(stale).catch(() => {});
  if (mine !== attempt) return;   // bu arada ayrıldı ya da başka bir odaya girdi
  const id = newId(), ch = supabase.channel(topic, { config: { presence: { key: String(id) }, broadcast: { self: false } } });
  channel = ch;
  const fail = msg => { if (channel !== ch) return; teardown(); handler({ t: 'error', msg }); };
  let waiting = null;
  setTimeout(() => { if (channel === ch && stage !== 'joined') fail('Sunucuya bağlanılamadı. İnternet bağlantını kontrol edip yeniden dene.'); }, JOIN_TIMEOUT);
  // odadakileri (henüz kendimizi eklemedik) denetle, sonra kendini ekle
  const admit = others => {
    if (!create) {
      if (!others.length) return fail('Bu kodla bir oda bulunamadı.');
      if (others.length >= MAX_PLAYERS) return fail('Oda dolu (en fazla 3 oyuncu).');
    }
    const used = new Set(others.map(p => p.color));
    // saatleri farklı cihazlarda ev sahibi kaymasın: katılan, odadakilerin hepsinden sonra gelmiş sayılır
    const at = Math.max(Date.now(), ...others.map(p => p.joinedAt + 1));
    me = { id, name: cleanName(name), color: [0, 1, 2].find(c => !used.has(c)) ?? 0, joinedAt: at, v: 0 };
    stage = 'tracked';
    ch.track(me).catch(() => fail('Odaya girilemedi. Yeniden dene.'));
  };

  ch.on('broadcast', { event: 'msg' }, ({ payload: m }) => {
    if (channel !== ch || stage !== 'joined' || !m || typeof m.t !== 'string') return;
    if (m.t === 'start') {
      round = { ids: new Set(Array.isArray(m.ids) ? m.ids : []), fin: new Set() }; lastRound = Math.max(lastRound, m.round | 0);
      if (!round.ids.has(id)) return;   // tur bizi görmeden başladı: bitince sıradakine katılırız
    }
    if (m.t === 'fin' && round) round.fin.add(m.from);
    if (m.t === 'away') away[m.from] = !!m.on;
    if (round && !round.ids.has(id) && live()) return;   // oynamadığımız turun iletileri
    handler(m);
    if (m.t === 'fin' || m.t === 'away') recheck();
  });
  ch.on('presence', { event: 'leave' }, ({ currentPresences, leftPresences }) => {
    // kaydını güncelleyen oyuncu için de eski kaydın "leave"i gelir: yalnızca hiç kaydı kalmayan ayrılmıştır
    if (channel !== ch || stage !== 'joined' || (currentPresences && currentPresences.length)) return;
    const left = leftPresences && leftPresences[0] ? leftPresences[0].id : undefined;
    if (left !== undefined && left !== id) players({ left });
  });
  ch.on('presence', { event: 'sync' }, () => {
    if (channel !== ch) return;
    if (stage === 'joining') {
      const others = everyone();
      if (create || others.length) { clearTimeout(waiting); return admit(others); }
      // kanal girişte önce boş bir durum bildirir, odadakiler biraz sonra gelir: hemen "oda yok" deme
      waiting = waiting || setTimeout(() => { if (channel === ch && stage === 'joining') admit(everyone()); }, JOIN_WAIT);
      return;
    }
    if (stage === 'tracked') {
      if (!everyone().some(p => p.id === id)) return;   // kendi kaydımız henüz yayılmadı
      stage = 'joined';
      const r = roster(); shown = r.players.length;
      handler({ t: 'room', code, you: id, ...r, round: 0 });
      return;
    }
    if (stage === 'joined') players();
  });
  ch.subscribe(status => {
    if (channel !== ch) return;
    // odadayken bağlantı giderse kütüphane kendisi yeniden bağlanır; dönünce kaydımızı yeniden gönderiyoruz
    if (status === 'SUBSCRIBED' && me && stage !== 'joining') ch.track(me).catch(() => {});
    else if (status === 'CLOSED') { teardown(); handler({ t: 'closed' }); }
  });
}

// sayfa kapanırken odadan hemen çık: diğerleri bağlantının zaman aşımını beklemesin
addEventListener('pagehide', () => { if (channel) { try { channel.untrack(); } catch {} teardown(); } });

const broadcast = m => channel.send({ type: 'broadcast', event: 'msg', payload: m }).catch(() => {});
export const net = {
  get open() { return !!channel && stage === 'joined'; },
  on(fn) { handler = fn; },
  send(m) {
    if (m.t === 'create') return enter(newCode(), m.name, true);
    if (m.t === 'join') return enter(String(m.code || '').toUpperCase().trim().slice(0, 4), m.name, false);
    if (!channel || stage !== 'joined' || !me) return;
    switch (m.t) {
      case 'leave': try { channel.untrack(); } catch {} teardown(); break;
      case 'start': {   // yalnızca ev sahibi; herkes aynı bölümü aynı tohumla, aynı anda başlatır
        const r = roster();
        if (r.host !== me.id || r.players.length < 2 || live()) return;
        const s = { t: 'start', round: ++lastRound, level: Math.max(0, m.level | 0), seed: (Math.random() * 2 ** 31) | 0, in: START_IN, ids: r.players.map(p => p.id) };
        round = { ids: new Set(s.ids), fin: new Set() };
        broadcast(s); deliver(s);
        break;
      }
      case 'st': broadcast({ ...m, from: me.id }); break;   // akışın anlık durumu: yalnızca diğerlerine
      case 'fin': {   // tur bitti (çıkışa vardı ya da takıldı): herkese, kendimize de
        if (!round || !round.ids.has(me.id) || round.fin.has(me.id)) return;
        const f = { t: 'fin', from: me.id, ok: !!m.ok, time: +m.time || 0, eaten: m.eaten | 0, score: m.score | 0 };
        round.fin.add(me.id);
        broadcast(f); deliver(f); setTimeout(recheck, 0);
        break;
      }
      case 'away': away[me.id] = !!m.on; broadcast({ t: 'away', from: me.id, on: !!m.on }); setTimeout(recheck, 0); break;   // diğerleri haberdar olur
    }
  },
  close() { teardown(); },
};
