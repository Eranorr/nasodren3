/*
 * ÇOK OYUNCULU AKTARIM SUNUCUSU
 * Oda kodu ile en fazla 3 oyuncuyu bir araya getirir ve oyuncuların akış durumunu odadaki diğerlerine iletir.
 * Hiçbir şey saklamaz ve günlüğe yazmaz: oda yalnızca bellekte durur, son oyuncu çıkınca silinir. Hesap, kayıt, çerez yok.
 * Oyun mantığı tarayıcıda: sunucu yalnızca odayı, ev sahibini ve turun başlangıcını bilir.
 *
 * Kullanım:  npm run dev / npm run preview   → kendiliğinden başlar, Vite /mp yolunu buraya yönlendirir (ayrı sunucu gerekmez)
 *            npm run mp                      → tek başına (varsayılan port 8787; PORT ortam değişkeniyle değişir)
 * Aynı makinede birden çok Vite sunucusu açıksa hepsi aynı aktarım sunucusunu (8787) kullanır.
 * Oyun, adresi VITE_MP_URL ile alır (ör. wss://oyun.example.com); verilmezse sayfayı veren sunucunun /mp yoluna bağlanır.
 */
import { WebSocketServer } from 'ws';
import { pathToFileURL } from 'node:url';

const MAX_PLAYERS = 3, MAX_MSG = 4096, CODE_ABC = 'ABCDEFGHJKLMNPRSTUVYZ23456789';   // karışmayan harfler (I/1, O/0 yok)
const rooms = new Map();   // kod → { code, players: Map(id → oyuncu), host, phase: 'lobby' | 'round', round }
let nextId = 1;
export const RELAY_PORT = +process.env.PORT || 8787;

const send = (p, m) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(m)); };
const toRoom = (room, m, except) => { for (const p of room.players.values()) if (p !== except) send(p, m); };
const roster = room => [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, away: p.away }));
// tur, herkes bitirince (ostiumdan çıktı ya da takıldı) ya da kalanlar oyuna ara verdiyse biter
const roundDone = room => [...room.players.values()].every(q => q.fin || q.away);
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Oyuncu';
function newCode() {
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_ABC[(Math.random() * CODE_ABC.length) | 0]; if (!rooms.has(c)) return c; }
}
function enter(room, p, name) {
  const used = new Set([...room.players.values()].map(q => q.color));
  p.color = [0, 1, 2].find(c => !used.has(c)); p.name = cleanName(name); p.room = room;
  room.players.set(p.id, p);
  send(p, { t: 'room', code: room.code, you: p.id, host: room.host, players: roster(room), round: room.round });
  toRoom(room, { t: 'players', host: room.host, players: roster(room) }, p);
}
function leave(p) {
  const room = p.room; if (!room) return;
  room.players.delete(p.id); p.room = null;
  if (!room.players.size) { rooms.delete(room.code); return; }
  if (room.host === p.id) room.host = room.players.keys().next().value;
  toRoom(room, { t: 'players', host: room.host, players: roster(room), left: p.id });
  if (room.phase === 'round' && roundDone(room)) room.phase = 'lobby';
}

// opts: WebSocketServer seçenekleri ({ port } ya da { noServer: true })
export function createRelay(opts) {
  const wss = new WebSocketServer({ ...opts, maxPayload: MAX_MSG });
  wss.on('connection', ws => {
    const p = { id: nextId++, ws, name: '', color: 0, room: null, fin: false, away: false, n: 0, t0: Date.now() };
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', raw => {
      // basit hız sınırı: saniyede 40 iletiden fazlası yok sayılır
      const now = Date.now(); if (now - p.t0 > 1000) { p.t0 = now; p.n = 0; } if (++p.n > 40) return;
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      const room = p.room;
      switch (m.t) {
        case 'create': {
          if (room) leave(p);
          const r = { code: newCode(), players: new Map(), host: p.id, phase: 'lobby', round: 0 };
          rooms.set(r.code, r); enter(r, p, m.name); break;
        }
        case 'join': {
          if (room) leave(p);
          const r = rooms.get(String(m.code || '').toUpperCase().trim());
          if (!r) return send(p, { t: 'error', msg: 'Bu kodla bir oda bulunamadı.' });
          if (r.players.size >= MAX_PLAYERS) return send(p, { t: 'error', msg: 'Oda dolu (en fazla 3 oyuncu).' });
          if (r.phase === 'round') return send(p, { t: 'error', msg: 'Bu odada tur sürüyor; bitince yeniden dene.' });
          enter(r, p, m.name); break;
        }
        case 'leave': leave(p); break;
        case 'start': {   // yalnızca ev sahibi; herkes aynı bölümü aynı tohumla, 3 sn sonra başlatır
          if (!room || room.host !== p.id || room.phase === 'round' || room.players.size < 2) return;
          room.phase = 'round'; room.round++;
          for (const q of room.players.values()) q.fin = false;
          toRoom(room, { t: 'start', round: room.round, level: Math.max(0, Math.min(7, m.level | 0)), seed: (Math.random() * 2 ** 31) | 0, in: 6000 });   // 6 sn: bölümün bilgisini okumaya ve hazırlanmaya
          break;
        }
        case 'st':    // akışın anlık durumu: yalnızca diğerlerine
          if (room && room.phase === 'round') toRoom(room, { ...m, from: p.id }, p); break;
        case 'fin': { // tur bitti (çıkışa vardı ya da takıldı): herkese
          if (!room || room.phase !== 'round' || p.fin) return;
          p.fin = true;
          toRoom(room, { t: 'fin', from: p.id, ok: !!m.ok, time: +m.time || 0, eaten: m.eaten | 0, score: m.score | 0 });
          if (roundDone(room)) room.phase = 'lobby';
          break;
        }
        case 'away': {   // sekme arka plana alındı ya da geri gelindi: diğerleri haberdar olur, oynamaya devam eder
          if (!room) return;
          p.away = !!m.on;
          toRoom(room, { t: 'away', from: p.id, on: p.away }, p);
          if (room.phase === 'round' && roundDone(room)) room.phase = 'lobby';
          break;
        }
      }
    });
    ws.on('close', () => leave(p));
    ws.on('error', () => {});
  });
  // kopan bağlantıları temizle: 20 sn'de bir yoklanır, yanıt vermeyen kapatılır
  const beat = setInterval(() => {
    for (const ws of wss.clients) { if (ws.isAlive === false) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  }, 20000);
  wss.on('close', () => clearInterval(beat));
  return wss;
}

// Vite eklentisi: aktarım sunucusunu 8787'de başlatır, Vite de /mp yolunu oraya yönlendirir.
// Port doluysa (başka bir npm run dev / preview ya da npm run mp) o sunucu kullanılır: aynı makinedeki
// bütün sunucular tek aktarım sunucusunu, yani aynı odaları görür.
export function relayPlugin() {
  const ensure = () => {
    if (globalThis.__mpRelay) return;   // Vite yapılandırmayı yeniden yükleyince ikinci kez başlatılmaz
    const wss = globalThis.__mpRelay = createRelay({ port: RELAY_PORT });
    wss.on('error', e => { wss.close(); globalThis.__mpRelay = null; if (e.code !== 'EADDRINUSE') console.error('Aktarım sunucusu:', e.message); });
  };
  // yönlendirme başarısızsa (sunucuyu tutan süreç kapandıysa) burada yeniden başlatılır; oyuncu yeniden denediğinde bağlanır
  const proxy = { '/mp': { target: `http://127.0.0.1:${RELAY_PORT}`, ws: true, configure: p => p.on('error', ensure) } };
  return { name: 'mp-relay', config: () => ({ server: { proxy }, preview: { proxy } }), configureServer: ensure, configurePreviewServer: ensure };
}

// doğrudan çalıştırıldıysa (npm run mp) tek başına dinle
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createRelay({ port: RELAY_PORT });
  console.log(`Çok oyunculu aktarım sunucusu: ws://localhost:${RELAY_PORT}`);
}
