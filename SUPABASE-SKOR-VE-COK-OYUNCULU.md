# Supabase ile Yüksek Skorlar + Çok Oyunculu — Uygulama Rehberi

Bu dosya, sitedeki bir oyuna **herkese açık skor tablosu** ve **oda kodlu çok oyunculu**
modu Supabase üzerinden eklemek için yazıldı. Başka bir oyunun sohbetine yapıştırıp
"bu oyuna da aynısını kur, önek şu olsun" demek yeterli olmalı.

Desen, nasodren3 (yılan oyunu, önek `snake`) üzerinde kuruldu ve **gerçek Supabase
projesine karşı, üç ayrı tarayıcıyla, art arda onlarca kez** test edildi. Aşağıdaki
"Tuzaklar" bölümündeki her madde bu testlerde yaşanmış bir hatadır; atlamayın.

---

## 1. Mimari özeti

- Sitedeki **bütün oyunlar tek bir Supabase projesini paylaşır.** Çakışmayı önlemek için
  her oyun kendi önekini kullanır:
  - Skor tablosu: `<önek>_scores` (örn. `snake_scores`, `volfied_scores`)
  - Oda kanalı: `<önek>:room:<KOD>` (örn. `snake:room:K7TN`)
- **Sunucu süreci yok.** Eski kurulumdaki Node/WebSocket aktarım sunucusu (`server/relay.mjs`)
  statik barındırmada (Cloudflare Pages, GitHub Pages) çalışmadığı için "Sunucuya
  bağlanılamadı" hatasının kök nedeniydi. Yerine Supabase Realtime kullanılır.
- Supabase ayarlı değilse oyun **çökmez**: skorlar cihazda (localStorage) kalır,
  "Çok oyunculu" düğmesi gizlenir.

## 2. Kimlik bilgileri (tüm oyunlar için ortak)

```
VITE_SUPABASE_URL=https://ylmiykrovhufmamispdn.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable__QKZhBJ8ipGBIF4rbmwoXg_SFHwagav
```

Bu "publishable" (anon) anahtardır; tarayıcıya gömülmesi güvenlidir, gizli değildir.
Yetkiyi tablodaki RLS kuralları belirler.

Değerlerin konacağı yerler:
- `.env.local` → yerel geliştirme (`*.local` zaten `.gitignore`'da).
- `.env.production` → **commit edilir.** Cloudflare Pages `npm run build` çalıştırırken
  Vite bu dosyayı kendisi okur; panelde ortam değişkeni tanımlamaya gerek kalmaz.
  (Panelde değişken tanımlanırsa o önceliklidir.)
- `.env.local.example` → yer tutucu değerlerle, commit edilir.

`npm install @supabase/supabase-js`

## 3. `src/supabase.js` — tek ortak istemci

```js
import { createClient } from '@supabase/supabase-js';

const URL_ = import.meta.env.VITE_SUPABASE_URL, KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const SUPABASE_OK = !!(URL_ && KEY_);
export const supabase = SUPABASE_OK ? createClient(URL_, KEY_, { realtime: { params: { eventsPerSecond: 20 } } }) : null;
if (!SUPABASE_OK && import.meta.env.DEV) console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY yok: skor tablosu yerel, çok oyunculu kapalı.');
```

## 4. `supabase/schema.sql` — skor tablosu

`<önek>` yerine oyunun önekini yaz. Supabase panelinde **SQL Editor → New query**'ye
yapıştırıp bir kez çalıştır. Sütunları oyuna göre uyarla (bizde `level` ve `finished`).
Ad uzunluğu sınırını oyundaki ad alanıyla **aynı** tut (bizde 14).

```sql
create table if not exists public.<önek>_scores (
  id         bigint generated always as identity primary key,
  name       text not null,
  score      integer not null,
  level      smallint not null default 0,
  finished   boolean not null default false,
  created_at timestamptz not null default now(),
  constraint <önek>_scores_name_len check (char_length(name) between 1 and 14),
  constraint <önek>_scores_score_range check (score >= 0 and score < 100000000),
  constraint <önek>_scores_level_range check (level between 0 and 63)
);

create index if not exists <önek>_scores_score_idx on public.<önek>_scores (score desc, id);

alter table public.<önek>_scores enable row level security;

drop policy if exists "<önek>_scores_select_all" on public.<önek>_scores;
create policy "<önek>_scores_select_all" on public.<önek>_scores
  for select using (true);

-- Herkes yeni skor ekleyebilir; güncelleme/silme politikası yok (= varsayılan red).
drop policy if exists "<önek>_scores_insert_anyone" on public.<önek>_scores;
create policy "<önek>_scores_insert_anyone" on public.<önek>_scores
  for insert with check (
    char_length(name) between 1 and 14
    and score >= 0 and score < 100000000
    and level between 0 and 63
  );
```

Çok oyunculu için **tablo gerekmez**; odalar yalnızca Realtime kanallarında yaşar.

## 5. Yüksek skorlar

### Okuma / yazma (`save.js` içinde)

```js
import { supabase, SUPABASE_OK } from './supabase.js';

export const ONLINE = SUPABASE_OK;
const TABLE = '<önek>_scores', WAIT = 10000;
// Supabase bazen yanıt vermiyor: sonsuza kadar beklemesin, yerel listeye düşsün
const within = p => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('zaman aşımı')), WAIT))]);

export async function loadTop(n = 10) {
  if (!ONLINE) return null;
  try {
    const { data, error } = await within(supabase.from(TABLE).select('id,name,score').order('score', { ascending: false }).order('id').limit(n));
    if (error) throw error;
    return data.map(r => ({ id: r.id, n: r.name, s: r.score }));
  } catch (e) { console.warn('[skor] tablo okunamadı:', e); return null; }
}

// Dönen: { id, rank, n, s }. Sıra = daha yüksek skorlar + eşit skorda önce kaydedilenler + 1
export async function postScore(e) {
  if (!ONLINE) return null;
  try {
    const { data, error } = await within(supabase.from(TABLE).insert({ name: e.n, score: e.s, level: e.l | 0, finished: !!e.f }).select('id').single());
    if (error) throw error;
    const { count, error: err } = await within(supabase.from(TABLE).select('id', { count: 'exact', head: true })
      .or(`score.gt.${e.s},and(score.eq.${e.s},id.lt.${data.id})`));
    if (err) throw err;
    return { id: data.id, rank: (count | 0) + 1, n: e.n, s: e.s };
  } catch (err) { console.warn('[skor] gönderilemedi:', err); return null; }
}
```

### Arayüz kuralları

- Skor **her zaman cihaza da** yazılır (mevcut localStorage listesi). Çevrim içi gönderim
  bunun üstüne yapılır. Okuma başarısız olursa tablo cihazdaki listeyi gösterir ve
  "Bağlantı kurulamadı: bu cihazdaki skorlar gösteriliyor" yazar.
- Kaydet düğmesi gönderim sürerken "Kaydediliyor…" olur ve devre dışı kalır; tablo
  açılırken "Yükleniyor…" gösterilir.
- Çevrim içi listede yalnızca ilk 10 gelir. Oyuncu ilk 10'da değilse, kendi satırını
  `postScore`'dan dönen `rank` ile listenin altına ekle ve vurgula.
- İsimleri ekrana basarken **HTML kaçışı** yap (başkalarının yazdığı adlar).
- **Yasal/gizlilik metinlerini güncelle.** Oyunda "adın hiçbir yere gönderilmez",
  "veri toplamaz" gibi cümleler varsa, Supabase açıkken bunlar artık yanlıştır. Yerine:
  "Takma adın ve skorun herkese açık skor tablosunda görünür; gerçek adını yazma."

## 6. Çok oyunculu — Supabase Realtime

### Model

- Her oda bir Realtime kanalı: `<önek>:room:<4 harfli KOD>`.
- **Presence = yalnızca odada kim var.** Her oyuncu girişte kendi kaydını bir kez yazar
  (`track`): `{ id, name, color, joinedAt, v }`.
- **Ev sahibi** her istemcide aynı kuralla hesaplanır: `joinedAt`'i en küçük olan.
  Ev sahibi ayrılınca sıradaki kendiliğinden devralır.
- **Broadcast = oyun iletileri** (`start`, `st` canlı durum, `fin` bitti, `away` ara verdi).
  Tur durumu ve "ara verdi" bilgisi Presence'a değil, bu iletilere göre izlenir.
- Turun oyuncuları `start` iletisinin içinde gelir (`ids`). Tur sürerken odaya giren
  turu oynamaz, lobide bekler, oynayanlara gösterilmez; tur bitince sonraki tura katılır.
- Hiçbir şey veritabanına yazılmaz; son oyuncu çıkınca oda biter.

### Oyun koduna açılan arayüz

`net.js`, eski WebSocket sunucusuyla **aynı arayüzü** korur. Böylece oyunun lobi ve tur
kodu hiç değişmez:

```
net.open / net.on(fn) / net.send(m) / net.close()
gönderilen: { t: 'create', name } | { t: 'join', code, name } | { t: 'leave' }
            { t: 'start', level } | { t: 'st', ... } | { t: 'fin', ok, time, ... } | { t: 'away', on }
gelen:      { t: 'room', code, you, host, players, round } | { t: 'players', host, players, left? }
            { t: 'start', round, level, seed, in, ids } | { t: 'st', from, ... } | { t: 'fin', from, ... }
            { t: 'away', from, on } | { t: 'error', msg } | { t: 'closed' }
```

Oyuncu kimlikleri **sayıdır** (oyun kodu toplam puanları `totals[id]` gibi kimliğe göre tutuyorsa şart).

### Tuzaklar (hepsi testte yaşandı)

1. **Presence kaydını sık güncelleme: Supabase kanalı kapatıyor.** Bir istemci birkaç kez
   `track()` çağırınca sunucu kanalını `CLOSED` yapıyor. Sonraki `track()` çağrıları
   `timed out` dönüyor, o istemci diğerlerinin Presence değişikliklerini almıyor ve
   ayrılanları görmüyor. Bu, saniyede 1 broadcast'te bile oluyor. Track olmadan saniyede
   16 broadcast ise sorunsuz. **Kural: `track()` yalnızca girişte bir kez** (bir de
   bağlantı yenilenince). `play`/`away`/`round` gibi değişen durumu Presence'a koyma.
2. **Kanala girince ilk Presence durumu boş gelir.** Gerçek liste ~0,5 sn sonra gelir.
   İlk boş duruma bakıp "oda yok" deme; birinin görünmesini 3 sn kadar bekle. (Referans
   uygulamadaki 650 ms yetmiyordu.)
3. **`supabase.channel(ad)` aynı adlı kanal hâlâ kayıtlıysa onu geri verir.**
   `removeChannel()` asenkrondur. Hemen ardından aynı odaya yeniden girilirse eski kanal
   ve bayat oyuncu listesi geri gelir. Yeni kanalı açmadan önce **önceki kapanışı bekle**,
   kalan aynı adlı kanalı da kaldır.
4. **Kaydını güncelleyen oyuncu için de `leave` olayı gelir** (eski kaydın). Gerçek
   ayrılma, yalnızca `currentPresences` boş olduğunda.
5. **Bir oyuncunun birden çok Presence kaydı olabilir** (bağlantı yenilenince eskisi bir
   süre kalır). `a[0]`'ı değil, en yenisini al: kayda artan bir `v` koy, en büyüğünü seç.
6. **`broadcast: { self: false }` ile kendi iletin sana geri gelmez.** Eski sunucu `start`
   ve `fin`'i gönderene de yolluyorduysa (oyun kodu buna dayanıyorsa), bunları yerelde de
   teslim et; yoksa ev sahibinin turu hiç başlamaz.
7. **Cihaz saatleri farklıdır.** Katılan oyuncu `joinedAt = max(şimdi, odadakilerin
   joinedAt'i + 1)` alsın; yoksa saati geride olan yeni gelen ev sahipliğini kapar.
8. **Girişteki tek bir `CHANNEL_ERROR`'da vazgeçme.** Kütüphane kendisi yeniden dener.
   Bunun yerine toplam 10 sn'lik bir giriş süresi koy. Odadayken bağlantı giderse de
   oyuncuyu menüye atma; kütüphane yeniden bağlanınca (`SUBSCRIBED`) kaydı bir kez
   yeniden gönder. Yalnızca `CLOSED`'da "bağlantı koptu" de.
9. **"Tur sürüyor" denetimini Presence'a bağlama.** Yayılma gecikmesi yüzünden ya lobide
   bekleyen meşru oyuncuyu atıyor ya da tur başlarken girileni kaçırıyor. Belirlenimci
   kural: `start` iletisindeki `ids` listesinde olan oynar, olmayan bekler.
10. **`pagehide`'da `untrack()` + kanalı kapat.** Yoksa sekmesi kapanan oyuncu diğerlerinde
    bağlantı zaman aşımına kadar (onlarca saniye) görünmeye devam eder.
11. **Kanal adında `:` sorun değil.** `snake:room:KOD` sorunsuz çalıştı.

### Tam uygulama: `src/net.js` (nasodren3, test edildi)

Taşırken değiştirilecekler: `'snake:room:'` öneki; `MAX_PLAYERS`; `cleanName` uzunluğu;
`start`/`st`/`fin`/`away` iletilerinin yük alanları (oyunun kendi verisi). Taşıma
katmanı (Presence, Broadcast, ev sahibi, tur takibi) olduğu gibi kalır.

```js
import { supabase, SUPABASE_OK } from './supabase.js';

const MAX_PLAYERS = 3, CODE_ABC = 'ABCDEFGHJKLMNPRSTUVYZ23456789';   // karışmayan harfler (I/1, O/0 yok)
const JOIN_TIMEOUT = 10000;   // kanala bu sürede girilemezse vazgeç (ms); arada gelen hatalarda kütüphane kendisi yeniden dener
const JOIN_WAIT = 3000;    // katılırken odada kimse görünmezse "oda yok" demeden önce bekleme (ms): kanal ilk anda boş durum bildirir
const START_IN = 6000;     // tur başı bekleme: bölümün bilgisini okumaya ve hazırlanmaya

let handler = () => {}, channel = null, me = null, stage = 'idle';   // stage: idle | joining | tracked | joined
let round = null, shown = 0, away = {}, lastRound = 0;   // round: süren turun oyuncuları { ids, fin }; shown: oyuna son bildirilen oyuncu sayısı
let removing = Promise.resolve(), attempt = 0;   // önceki kanalın kapanışı; attempt: son giriş denemesi (eskisi yarıda kalsın)
const deliver = m => setTimeout(() => handler(m), 0);   // kendi iletimiz de (start, fin) sunucudan gelmiş gibi, sırayla
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Oyuncu';
const newId = () => Date.now() % 1000000 * 1000 + ((Math.random() * 1000) | 0);   // sayı olmalı
function newCode() { let c = ''; for (let i = 0; i < 4; i++) c += CODE_ABC[(Math.random() * CODE_ABC.length) | 0]; return c; }

// kanaldaki herkes, katılış sırasıyla. Bir oyuncunun birden çok kaydı olabilir: en yenisi (v)
const newest = a => (a || []).reduce((x, y) => (!x || (y.v | 0) > (x.v | 0) ? y : x), null);
const everyone = () => Object.values(channel ? channel.presenceState() : {}).map(newest).filter(Boolean).sort((a, b) => a.joinedAt - b.joinedAt || a.id - b.id);
// tur, oyuncularından biri hâlâ odada, ara vermemiş ve bitirmemişken sürer
function live() {
  if (!round) return false;
  const list = everyone();
  if ([...round.ids].some(id => { const p = list.find(q => q.id === id); return p && !away[id] && !round.fin.has(id); })) return true;
  round = null; return false;
}
// oyunun gördüğü oda: turu oynayan için tur sürerken yalnızca turun oyuncuları. Herkes aynı durumdan aynı ev sahibini bulur
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
      case 'st': broadcast({ ...m, from: me.id }); break;   // anlık durum: yalnızca diğerlerine
      case 'fin': {   // tur bitti: herkese, kendimize de
        if (!round || !round.ids.has(me.id) || round.fin.has(me.id)) return;
        const f = { t: 'fin', from: me.id, ok: !!m.ok, time: +m.time || 0, eaten: m.eaten | 0, score: m.score | 0 };
        round.fin.add(me.id);
        broadcast(f); deliver(f); setTimeout(recheck, 0);
        break;
      }
      case 'away': away[me.id] = !!m.on; broadcast({ t: 'away', from: me.id, on: !!m.on }); setTimeout(recheck, 0); break;
    }
  },
  close() { teardown(); },
};
```

### Oyun tarafında

- "Çok oyunculu" düğmesinin görünürlüğünü **`SUPABASE_OK`'a** bağla, hostname'e değil.
- Canlı durum (`st`) iletisini en sık 60 ms'de bir gönder (saniyede ~16); bu hız sorunsuz.
- Eski relay sunucusunu kaldır: `server/relay.mjs`, `ws` bağımlılığı, `npm run mp` betiği,
  `vite.config`'teki relay eklentisi ve `/mp` proxy'si.

## 7. Yayın (Cloudflare Pages)

- Cloudflare Pages repoya bağlıysa her push'ta kendisi derler (`npm run build`, çıktı `dist`).
  **GitHub Actions deploy workflow'u ekleme**; gereksizdir ve GitHub Pages kapalıysa her
  push'ta hata verir.
- Supabase değerleri `.env.production`'da olduğu için panelde ayar gerekmez.
- Vite 8, Node 20.19 veya üstünü ister. Build düşerse Cloudflare'de `NODE_VERSION=22`
  ortam değişkeni ekle (ya da repoya `.node-version` dosyası koy).
- Değişiklikler yalnızca **yeni** bir build'e yansır; eski deployment satırında "Retry"
  yeni commit'i almaz.
- **Yayına çıktığını doğrula.** "Sunucuya bağlanılamadı" görüyorsan büyük ihtimalle eski
  sürüm yayındadır. Yayındaki JS dosyasında Supabase adresi var mı bak:
  ```powershell
  $u='https://<site>.pages.dev/'; $r = Invoke-WebRequest -UseBasicParsing $u
  $js = ([regex]'assets/index-[^"]+\.js').Match($r.Content).Value
  (Invoke-WebRequest -UseBasicParsing ($u + $js)).Content.Contains('ylmiykrovhufmamispdn')   # True olmalı
  ```

## 8. Test

Statik inceleme yetmez; buradaki hataların çoğu **10 çalıştırmada bir** ortaya çıktı.

- **REST kontrolü:** Tablo okunuyor mu? (Bu makinede Git Bash'teki `curl` Supabase'e
  ulaşamadı, PowerShell ulaştı.)
  ```powershell
  $K='sb_publishable__QKZhBJ8ipGBIF4rbmwoXg_SFHwagav'
  Invoke-WebRequest -UseBasicParsing "https://ylmiykrovhufmamispdn.supabase.co/rest/v1/<önek>_scores?select=id,name,score&limit=3" -Headers @{apikey=$K}
  ```
- **Tarayıcı testi (Playwright):** `npm i --no-save playwright-core`, dev sunucusunu aç,
  Edge'i kullan (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; Chrome
  kurulu değildi). Üç ayrı `browser.newContext()` ile şu senaryoyu otomatikleştir:
  1. Yanlış kodla katıl → "oda bulunamadı".
  2. A oda kurar, B katılır → iki tarafta 2 oyuncu, aynı ev sahibi, farklı renkler.
  3. A turu başlatır → iki tarafta aynı tur ve bölüm; B, A'nın canlı durumunu görüyor.
  4. Tur başlarken C katılmaya çalışır → reddedilir ya da lobide bekler, oynayanlara görünmez.
  5. İkisi de ölür → iki tarafta tur sonucu.
  6. C katılır → herkes 3 oyuncu görür; ikinci tur üç tarafta başlar.
  7. A'nın sekmesi kapanır → B ve C, ev sahibi olarak B'yi görür.
  
  Bu senaryoyu **en az 8–10 kez art arda** çalıştır.
- **Skor testi:** Ölünce ad gir → tablo "Herkese açık" diyor, kendi satırın vurgulu, sıra
  yazıyor; başka bir tarayıcı bağlamında menüden açınca skor görünüyor.
- **Test satırlarını sil.** RLS silmeye izin vermediği için panelden:
  ```sql
  delete from public.<önek>_scores where name = 'ZZ-Test';
  ```
