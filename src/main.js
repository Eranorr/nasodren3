import * as PIXI from 'pixi.js';

// Mobilde konsol: adrese ?eruda ekle (yalnızca geliştirme modunda)
if (import.meta.env.DEV && /eruda/.test(location.search + location.hash)) import('eruda').then(m => m.default.init());

(async () => {
'use strict';

/* =========================================================================
   İÇERİK
   ========================================================================= */
const COLS = 18, ROWS = 24, MAXSEG = COLS * ROWS + 64;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const COMBO_WINDOW = 2600;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEBUG = /debug/.test(location.hash) || /debug/.test(location.search);
const R = (x, y, w, h) => ({ x, y, w, h });

const LEVELS = [
  { name: 'Burun boşluğu', desc: 'Isınma turu. Kaydırarak yön ver, mukusları topla, sonra açılan ostiumdan akışı dışarı çıkar.',
    target: 6, step: 150, obs: [], gold: .35, serum: 0, breeze: 0, obj: [['clean', 25], ['time', 50]] },
  { name: 'Alt konka', desc: 'Konkalar burnun yan duvarlarındaki kıvrımlı raflardır. Aralarından dolaşarak ilerle. İlk virüs de burada: mukusa yapışınca onu toplayıp çıkışa taşı. Virüse kafa atarsan drenaj kısalır.',
    target: 8, step: 138, obs: [R(0,7,6,1), R(12,12,6,1), R(0,17,5,1)], gold: .25, serum: .18, breeze: 0, virus: 1, virusEvery: 3, obj: [['sneeze', 1], ['clean', 30]] },
  { name: 'Maksiller sinüs', desc: 'Sinüslerin en büyüğü. Polipler yolu daraltıyor. Virüslerin yapışması için biraz mukus bırak, sonra hepsini dışarı taşı.',
    target: 10, step: 128, obs: [R(3,7,2,2), R(13,7,2,2), R(3,15,2,2), R(13,15,2,2)], gold: .55, serum: .12, breeze: .14, virus: 2, virusEvery: 3, obj: [['virus', 2], ['gold', 2]] },
  { name: 'Etmoid hücreler', desc: 'Bal peteğine benzeyen küçük hücreler. Virüsler temizlenmemiş dokuda çoğalır; önce alanı temizle.',
    target: 12, step: 120, obs: [R(2,6,5,1), R(11,6,5,1), R(3,12,5,1), R(10,12,5,1), R(2,17,4,1), R(12,17,4,1)], gold: .25, serum: .16, breeze: .14, virus: 2, replicate: 14000, virusMax: 5, obj: [['clean', 40], ['noinfect', 0]] },
  { name: 'Frontal sinüs', desc: 'Tıkaçlar ileri geri geziniyor. Önlerine çıkma, arkalarından geç.',
    target: 12, step: 116, obs: [R(3,10,2,2), R(13,10,2,2)], movers: [[2,5,1], [15,15,-1]], gold: .25, serum: .2, breeze: .14, virus: 2, replicate: 12000, virusMax: 5, obj: [['sneeze', 2], ['clean', 35]] },
  { name: 'Sfenoid sinüs', desc: 'Burada uzun süre bekleyen mukus sertleşir ve yolu kapatır. Titremeye başlayanı önce topla.',
    target: 12, step: 112, obs: [R(3,5,2,1), R(13,5,2,1), R(5,10,2,1), R(11,10,2,1), R(3,15,2,1), R(13,15,2,1)], harden: 9000, gold: .2, serum: .2, breeze: .2, virus: 2, replicate: 12000, virusMax: 5, obj: [['nohard', 0], ['time', 75]] },
  { name: 'Sinüs kanalları', desc: 'Bir bölme alanı ikiye ayırıyor. Kanallardan birine gir, diğerinden aynı yönde çık.',
    target: 12, step: 118, obs: [R(0,11,18,1)], portals: [[4,16], [13,5]], gold: .3, serum: .12, breeze: .16, virus: 2, replicate: 11000, virusMax: 6, obj: [['clean', 40], ['virus', 3]] },
  { name: 'Ostium labirenti', desc: 'Final. Polipler, tıkaçlar, sertleşen mukus ve virüsler bir arada. Akışı sonuna kadar taşı.',
    target: 16, step: 108, obs: [R(3,6,2,2), R(13,6,2,2), R(2,13,4,1), R(12,13,4,1), R(6,3,6,1)], movers: [[2,17,1]], harden: 10000, gold: .25, serum: .2, breeze: .2, virus: 3, replicate: 10000, virusMax: 7, obj: [['virus', 4], ['clean', 45]] },
];
const ENDLESS = { name: 'Serbest akış', desc: 'Bölüm yok, çıkış yok. Ne kadar çok mukus toplarsan akış o kadar hızlanır. Virüslü mukusu topla, akış onu kuyruktan dışarı atar. Rekorunu kovala.',
  target: Infinity, step: 135, obs: [], gold: .22, serum: .14, breeze: .14, virus: 1, replicate: 13000, virusMax: 6, respawn: 10000 };
const DEMO = { name: 'demo', target: Infinity, step: 118, obs: [], gold: 0, serum: 0, breeze: 0 };

// Kullanma talimatı çizgisinde kalan, kesinlik ya da tedavi vaadi içermeyen bilgi kartları
const FACTS = [
  ['🌸', 'Nasodren, sıklamen (Cyclamen europaeum) yumrusundan elde edilen bir özüt içerir ve burun ile sinüslerdeki mukusun boşaltılmasına yardımcı olur.'],
  ['🌬️', 'Burnun yan duvarlarında konka denen kıvrımlı yapılar vardır. Soluduğumuz havayı ısıtıp nemlendirirler.'],
  ['🗺️', 'Yüzümüzde dört çift sinüs bulunur: maksiller, etmoid, frontal ve sfenoid. En büyüğü maksiller sinüstür.'],
  ['🕸️', 'Mukus havadaki tozu ve mikropları yakalar. Silya denen minik tüycükler onu sürekli burun boşluğuna doğru taşır.'],
  ['🚪', 'Sinüsler ostium adı verilen küçük kanallarla burun boşluğuna açılır. Bu kanallar daraldığında mukus içeride birikebilir.'],
  ['🧼', 'Sıklamen özütündeki saponinler yüzey aktif maddelerdir; sabuna benzer şekilde yüzey gerilimini düşürürler.'],
  ['💧', 'Uygulamadan birkaç dakika sonra burun akıntısı başlayabilir. Bu, mukusun dışarı atıldığını gösterir.'],
  ['🤧', 'Uygulamadan hemen sonra kısa süreli hapşırma, yanma hissi ya da göz sulanması görülebilir. Beklenmeyen bir etki olursa hekiminize veya eczacınıza danışın.'],
];
const TIPS = [
  'Üç mukusu art arda hızlıca topla, hapşırma refleksi tetiklenir ve bonus puan kazanırsın.',
  'Kuyruğunu kenarlara yaslayarak ilerlersen ortada manevra alanın kalır.',
  'Altın sıklamen yanıp sönmeye başladıysa kaybolmak üzeredir.',
  'Serum fizyolojik akışı yavaşlatır; dar geçitlerden önce almak işe yarar.',
  'Ferah esinti yakındaki mukusu sana doğru çeker.',
  'Tıkaçlar sadece yatay gider. Geçtikleri anda arkalarından dal.',
  'Kanala girdiğin yönde, diğer kanaldan çıkarsın.',
  'Titreyen mukus birazdan sertleşecek. Önce onu topla.',
  'Parmağını kaldırmadan kaydırmaya devam edersen art arda dönüş yapabilirsin.',
  'Virüsler mukusa yapışır. Virüslü mukusu toplayıp çıkışa taşırsan bonus alırsın.',
  'Temizlediğin dokuda virüsler çoğalamaz. Şişip titreyen virüs çoğalmak üzere.',
  'Virüse kafa atma, drenaj kısalır. Onları mukusa yönlendir.',
];
const SKINS = [
  // petal: taç yaprak, eye: yaprak dibindeki koyu leke, disc: yüzün olduğu orta kısım. petal -1 = gökkuşağı
  { name: 'Magenta',     need: 0,  petal: 0xF075B5, eye: 0x7E0B45, disc: 0xD6227F },
  { name: 'Pembe',       need: 4,  petal: 0xF9A3CB, eye: 0xC2185B, disc: 0xF06AAE },
  { name: 'Beyaz',       need: 8,  petal: 0xFFFFFF, eye: 0xC2185B, disc: 0xFBE3EE },
  { name: 'Mor',         need: 12, petal: 0xA066D6, eye: 0x4A1A7A, disc: 0x8446C2 },
  { name: 'Kırmızı',     need: 18, petal: 0xE8434F, eye: 0x7D0F22, disc: 0xC9283A },
  { name: 'Gökkuşağı',   need: 24, petal: -1,       eye: 0x5A1A6E, disc: 0x7A3FD1 },
  { name: 'Klasik akış', need: 0,  classic: true, body: 0x1FB5A0, head: 0xD6227F },
];
const BADGES = [
  ['first',   '💧', 'İlk damla',       'İlk mukusunu topla'],
  ['sneeze5', '🤧', 'Hapşırma ustası', 'Tek oyunda 5 hapşırma refleksi'],
  ['gold10',  '🌼', 'Altın toplayıcı', 'Toplam 10 altın sıklamen'],
  ['len40',   '〰️', 'Uzun akış',       'Drenajı 40 uzunluğa ulaştır'],
  ['clean60', '✨', 'Tertemiz',        'Bir bölümde alanın %60\'ı'],
  ['serum5',  '🧊', 'Sakin akış',      'Toplam 5 serum fizyolojik'],
  ['portal10','🌀', 'Kanal gezgini',   'Kanallardan 10 kez geç'],
  ['perfect', '🏅', 'Kusursuz',        'Bir bölümde üç yıldız'],
  ['all8',    '🗺️', 'Tüm sinüsler',    'Sekiz bölümü de bitir'],
  ['stars15', '⭐', 'Yıldız avcısı',   '15 yıldız topla'],
  ['stars24', '👑', 'Sıklamen uzmanı', '24 yıldızın hepsi'],
  ['endless', '🏃', 'Maraton',         'Serbest akışta 1000 puan'],
  ['virus20', '🦠', 'Kapı dışarı',     'Toplam 20 virüsü dışarı taşı'],
];
const ITEM_INFO = {
  mucus:  ['Mukus', 'Topla, drenaj uzar'],
  gold:   ['Altın sıklamen', 'Kısa süre görünür, bol puan'],
  serum:  ['Serum fizyolojik', 'Akış 6 sn yavaşlar'],
  breeze: ['Ferah esinti', 'Yakındaki mukusu çeker'],
  polyp:  ['Polip', 'Çarpma, etrafından dolan'],
  septum: ['Bölme', 'Çarpma, etrafından dolan'],
  plug:   ['Tıkaç', 'İleri geri gider'],
  portal: ['Kanal', 'Birinden gir, diğerinden çık'],
  crust:  ['Sert mukus', 'Bekleyen mukus sertleşir'],
  virus:  ['Virüs', 'Çarpma, mukusa yapışmasını bekle'],
  infected: ['Virüslü mukus', 'Topla, çıkışa taşı: bonus'],
};

/* =========================================================================
   KAYIT
   ========================================================================= */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const prog = Object.assign({ mask: Array(8).fill(0), done: Array(8).fill(false), badges: {}, skin: 0, golds: 0, serums: 0, portals: 0,
  best: 0, endlessBest: 0, seenTut: false, muted: false, viruses: 0, facts: Array(8).fill(false) }, store.get('ns_prog2', {}));
const save = () => store.set('ns_prog2', prog);
const bits = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
const totalStars = () => prog.mask.reduce((a, m) => a + bits(m), 0);
const unlocked = i => i === 0 || prog.done[i - 1];

window.dataLayer = window.dataLayer || [];
function track(event, props = {}) {
  const p = { event: 'nasodren_snake_' + event, ...props, t: Date.now() };
  window.dataLayer.push(p); if (DEBUG) console.debug('[track]', p);
}

/* =========================================================================
   SES
   ========================================================================= */
let actx = null, noiseBuf = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.4, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  } catch { actx = null; }
}
function tone(type, f0, f1, dur, vol = 0.12, delay = 0) {
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function sfx(name) {
  if (prog.muted || !actx || mode === 'demo') return;
  switch (name) {
    case 'eat':    tone('triangle', 440, 800, 0.09, 0.14); break;
    case 'gold':   [660, 880, 1175].forEach((f, i) => tone('triangle', f, f * 1.01, 0.12, 0.1, i * 0.06)); break;
    case 'serum':  tone('sine', 700, 320, 0.25, 0.12); break;
    case 'breeze': tone('sine', 300, 900, 0.35, 0.08); tone('sine', 450, 1300, 0.35, 0.05, 0.05); break;
    case 'exit':   tone('triangle', 300, 1200, 0.5, 0.12); break;
    case 'open':   tone('sine', 500, 1000, 0.3, 0.1); tone('sine', 750, 1500, 0.3, 0.07, 0.1); break;
    case 'portal': tone('sine', 900, 250, 0.22, 0.09); break;
    case 'harden': tone('square', 160, 110, 0.18, 0.05); break;
    case 'star':   tone('triangle', 880, 1320, 0.16, 0.1); break;
    case 'badge':  [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.14, 0.08, i * 0.07)); break;
    case 'trap':   tone('sine', 620, 240, 0.18, 0.1); tone('triangle', 900, 900, 0.06, 0.05, 0.08); break;
    case 'hurt':   tone('square', 320, 110, 0.22, 0.06); break;
    case 'replicate': tone('triangle', 180, 360, 0.2, 0.06); tone('triangle', 240, 480, 0.2, 0.05, 0.08); break;
    case 'die':    tone('sawtooth', 240, 50, 0.45, 0.1); break;
    case 'sneeze': {
      const t = actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.3); f.Q.value = 0.9;
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      s.connect(f).connect(g).connect(actx.destination); s.start(t); break;
    }
  }
}

/* =========================================================================
   DOKULAR (açılışta bir kez, 2D canvas)
   ========================================================================= */
const TS = 128;
function cnv() { const c = document.createElement('canvas'); c.width = c.height = TS; return [c, c.getContext('2d')]; }
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function blob(x, cx, cy, r, bumps, amp, rnd) {
  x.beginPath(); const n = 56, ph = rnd() * 6.28;
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, rr = r * (1 + amp * Math.sin(a * bumps + ph) + amp * .5 * Math.sin(a * (bumps + 2) + ph * 2));
    const X = cx + Math.cos(a) * rr, Y = cy + Math.sin(a) * rr; i ? x.lineTo(X, Y) : x.moveTo(X, Y);
  }
  x.closePath();
}
function rg(x, x0, y0, r0, x1, y1, r1, stops) { const g = x.createRadialGradient(x0, y0, r0, x1, y1, r1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
function eyes(x, cx, cy, gap, r, mood) {
  for (const s of [-1, 1]) {
    const ex = cx + s * gap;
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, cy, r, r * 1.12, 0, 0, 6.28); x.fill();
    x.fillStyle = '#2B0F22'; x.beginPath(); x.arc(ex + r * .12, cy + r * .12, r * .55, 0, 6.28); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(ex - r * .1, cy - r * .2, r * .2, 0, 6.28); x.fill();
    if (mood === 'grumpy') {
      x.strokeStyle = '#2B0F22'; x.lineWidth = r * .38; x.lineCap = 'round';
      x.beginPath(); x.moveTo(ex - s * r * 1.05, cy - r * 1.35); x.lineTo(ex + s * r * .75, cy - r * .85); x.stroke();
    }
  }
}
function flower(x, cx, cy, r, fill, center, n = 5, rot = -Math.PI / 2) {
  for (let i = 0; i < n; i++) {
    x.save(); x.translate(cx, cy); x.rotate(i / n * Math.PI * 2 + rot + Math.PI / 2);
    x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(r * .6, -r * .25, r * .5, -r * 1.05, 0, -r); x.bezierCurveTo(-r * .5, -r * 1.05, -r * .6, -r * .25, 0, 0);
    x.fillStyle = fill; x.fill(); x.restore();
  }
  if (center) { x.fillStyle = center; x.beginPath(); x.arc(cx, cy, r * .22, 0, 6.28); x.fill(); }
}
const C = {};
// yılan gövdesi: gri tonlu, tint ile renklenir (görünümler tek doku ile)
C.ball = (() => { const [c, x] = cnv();
  x.fillStyle = rg(x, TS * .38, TS * .32, 4, TS / 2, TS / 2, TS / 2, [[0, '#ffffff'], [.55, '#e8e8e8'], [.9, '#b4b4b4'], [1, '#9a9a9a']]);
  x.beginPath(); x.arc(TS / 2, TS / 2, TS / 2 - 2, 0, 6.28); x.fill();
  x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.ellipse(TS * .36, TS * .3, TS * .12, TS * .07, -.6, 0, 6.28); x.fill();
  return c; })();
C.face = (() => { const [c, x] = cnv();
  flower(x, TS / 2, TS * .16, TS * .17, '#FFD4E8', '#F4B81F', 3, -Math.PI / 2 - Math.PI / 3); // taç
  eyes(x, TS / 2, TS * .47, TS * .15, TS * .11, 'happy');
  x.fillStyle = 'rgba(255,140,180,.55)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(TS / 2 + s * TS * .27, TS * .62, TS * .07, TS * .045, 0, 0, 6.28); x.fill(); }
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .035; x.lineCap = 'round'; x.beginPath(); x.arc(TS / 2, TS * .6, TS * .09, .25, Math.PI - .25); x.stroke();
  return c; })();
C.soft = (() => { const [c, x] = cnv();
  x.fillStyle = rg(x, TS / 2, TS / 2, 0, TS / 2, TS / 2, TS / 2, [[0, 'rgba(255,255,255,1)'], [.5, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
  x.fillRect(0, 0, TS, TS); return c; })();
C.dot = (() => { const [c, x] = cnv(); x.fillStyle = '#fff'; x.beginPath(); x.arc(TS / 2, TS / 2, TS / 2 - 2, 0, 6.28); x.fill(); return c; })();
C.mucus = [11, 23, 37].map(sd => { const [c, x] = cnv(), rnd = seeded(sd);
  blob(x, TS / 2, TS * .54, TS * .4, 4, .08, rnd);
  x.fillStyle = rg(x, TS * .4, TS * .38, 4, TS / 2, TS / 2, TS * .5, [[0, '#F0F28C'], [.55, '#C3CF3E'], [1, '#8F9A1C']]); x.fill();
  x.lineWidth = 4; x.strokeStyle = '#7C8617'; x.stroke();
  eyes(x, TS / 2, TS * .5, TS * .13, TS * .085, 'grumpy');
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .03; x.lineCap = 'round'; x.beginPath(); x.arc(TS / 2, TS * .75, TS * .07, Math.PI + .5, -.5); x.stroke();
  return c; });
C.gold = (() => { const [c, x] = cnv();
  x.fillStyle = rg(x, TS / 2, TS / 2, 0, TS / 2, TS / 2, TS / 2, [[0, 'rgba(255,220,120,.55)'], [1, 'rgba(255,220,120,0)']]); x.fillRect(0, 0, TS, TS);
  flower(x, TS / 2, TS / 2, TS * .4, rg(x, TS / 2, TS / 2, 2, TS / 2, TS / 2, TS * .45, [[0, '#FFF3C4'], [.6, '#F8C537'], [1, '#D8920F']]), '#D6227F');
  return c; })();
C.serum = (() => { const [c, x] = cnv();
  x.beginPath(); x.moveTo(TS / 2, TS * .08); x.bezierCurveTo(TS * .8, TS * .4, TS * .84, TS * .62, TS * .82, TS * .66);
  x.arc(TS / 2, TS * .64, TS * .32, .1, Math.PI - .1); x.bezierCurveTo(TS * .16, TS * .62, TS * .2, TS * .4, TS / 2, TS * .08);
  const g = x.createLinearGradient(0, TS * .08, 0, TS * .96); g.addColorStop(0, '#DDF2FF'); g.addColorStop(1, '#5AAEEB'); x.fillStyle = g; x.fill();
  x.lineWidth = 4; x.strokeStyle = '#3F8FCC'; x.stroke();
  eyes(x, TS / 2, TS * .62, TS * .12, TS * .07, 'happy');
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .03; x.lineCap = 'round'; x.beginPath(); x.arc(TS / 2, TS * .72, TS * .06, .3, Math.PI - .3); x.stroke();
  return c; })();
C.breeze = (() => { const [c, x] = cnv();
  x.save(); x.translate(TS / 2, TS / 2); x.rotate(-.7);
  x.beginPath(); x.moveTo(0, -TS * .42); x.bezierCurveTo(TS * .36, -TS * .2, TS * .3, TS * .3, 0, TS * .42); x.bezierCurveTo(-TS * .3, TS * .3, -TS * .36, -TS * .2, 0, -TS * .42);
  const g = x.createLinearGradient(-TS * .3, 0, TS * .3, 0); g.addColorStop(0, '#7BE3A8'); g.addColorStop(1, '#2FAE6E'); x.fillStyle = g; x.fill();
  x.lineWidth = 4; x.strokeStyle = '#1F8A55'; x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 4; x.beginPath(); x.moveTo(0, -TS * .34); x.quadraticCurveTo(TS * .04, 0, 0, TS * .36); x.stroke();
  x.restore();
  x.strokeStyle = '#fff'; x.lineWidth = 5; x.lineCap = 'round';
  x.beginPath(); x.arc(TS * .26, TS * .28, TS * .1, Math.PI * .8, Math.PI * 2.1); x.stroke();
  return c; })();
C.polyp = [5, 9, 13].map(sd => { const [c, x] = cnv(), rnd = seeded(sd);
  blob(x, TS / 2, TS / 2, TS * .45, 5, .06, rnd);
  x.fillStyle = rg(x, TS * .38, TS * .34, 4, TS / 2, TS / 2, TS * .52, [[0, '#F58FA6'], [.6, '#D9577A'], [1, '#B23A5E']]); x.fill();
  x.lineWidth = 4; x.strokeStyle = '#9C2E50'; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(TS * .36, TS * .32, 12, 7, -.6, 0, 6.28); x.fill();
  return c; });
C.septum = (() => { const [c, x] = cnv();
  x.beginPath(); x.roundRect(4, 4, TS - 8, TS - 8, 30);
  const g = x.createLinearGradient(0, 0, 0, TS); g.addColorStop(0, '#E87995'); g.addColorStop(1, '#BF456A'); x.fillStyle = g; x.fill();
  x.lineWidth = 4; x.strokeStyle = '#9C2E50'; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.roundRect(18, 14, TS - 36, 16, 8); x.fill();
  return c; })();
C.crust = (() => { const [c, x] = cnv(), rnd = seeded(77);
  blob(x, TS / 2, TS / 2, TS * .44, 6, .09, rnd);
  x.fillStyle = rg(x, TS * .4, TS * .36, 4, TS / 2, TS / 2, TS * .5, [[0, '#C8B377'], [.6, '#9C8446'], [1, '#6E5A2A']]); x.fill();
  x.lineWidth = 4; x.strokeStyle = '#5A4920'; x.stroke();
  x.strokeStyle = 'rgba(60,45,15,.55)'; x.lineWidth = 3;
  for (let i = 0; i < 4; i++) { x.beginPath(); const a = rnd() * 6.28; x.moveTo(TS / 2, TS / 2); x.lineTo(TS / 2 + Math.cos(a) * 34, TS / 2 + Math.sin(a) * 34); x.stroke(); }
  return c; })();
C.plug = (() => { const [c, x] = cnv(), rnd = seeded(3);
  blob(x, TS / 2, TS * .54, TS * .42, 7, .05, rnd);
  x.fillStyle = rg(x, TS * .4, TS * .36, 4, TS / 2, TS / 2, TS * .5, [[0, '#C9B3EA'], [.6, '#9474C4'], [1, '#6B4E9C']]); x.fill();
  x.lineWidth = 4; x.strokeStyle = '#553A84'; x.stroke();
  eyes(x, TS / 2, TS * .5, TS * .14, TS * .09, 'grumpy');
  x.fillStyle = '#2B0F22'; x.beginPath(); x.roundRect(TS * .38, TS * .7, TS * .24, TS * .06, 4); x.fill();
  return c; })();
C.portal = (() => { const [c, x] = cnv();
  for (let i = 0; i < 3; i++) {
    x.strokeStyle = ['rgba(255,255,255,1)', 'rgba(255,255,255,.7)', 'rgba(255,255,255,.4)'][i]; x.lineWidth = 9 - i * 2; x.lineCap = 'round';
    x.beginPath(); x.arc(TS / 2, TS / 2, TS * (.42 - i * .12), i * 2, i * 2 + Math.PI * 1.35); x.stroke();
    x.beginPath(); x.arc(TS / 2, TS / 2, TS * (.42 - i * .12), i * 2 + Math.PI, i * 2 + Math.PI * 2.35); x.stroke();
  }
  return c; })();
C.fresh = (() => { const [c, x] = cnv();
  x.beginPath(); x.roundRect(6, 6, TS - 12, TS - 12, 34);
  const g = x.createLinearGradient(0, 0, 0, TS); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#CFF3EA'); x.fillStyle = g; x.fill();
  return c; })();
C.petal = (() => { const [c, x] = cnv();
  x.translate(TS / 2, TS / 2); x.beginPath(); x.moveTo(0, TS * .42); x.bezierCurveTo(TS * .34, TS * .1, TS * .22, -TS * .38, 0, -TS * .44); x.bezierCurveTo(-TS * .22, -TS * .38, -TS * .34, TS * .1, 0, TS * .42);
  const g = x.createLinearGradient(0, -TS * .44, 0, TS * .42); g.addColorStop(0, '#F9B7D3'); g.addColorStop(1, '#E6559A'); x.fillStyle = g; x.fill();
  return c; })();
C.virus = (() => { const [c, x] = cnv(), cx = TS / 2, cy = TS / 2, r = TS * .28;
  x.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    x.strokeStyle = '#B8401F'; x.lineWidth = 7; x.beginPath(); x.moveTo(cx + ca * r * .8, cy + sa * r * .8); x.lineTo(cx + ca * r * 1.42, cy + sa * r * 1.42); x.stroke();
    x.fillStyle = '#FFB13D'; x.beginPath(); x.arc(cx + ca * r * 1.48, cy + sa * r * 1.48, TS * .06, 0, 6.28); x.fill();
    x.lineWidth = 3; x.stroke();
  }
  x.beginPath(); x.arc(cx, cy, r, 0, 6.28);
  x.fillStyle = rg(x, cx - r * .35, cy - r * .4, 3, cx, cy, r, [[0, '#FFB07A'], [.6, '#F2683A'], [1, '#C8432A']]); x.fill();
  x.lineWidth = 4; x.strokeStyle = '#9E3218'; x.stroke();
  eyes(x, cx, cy - r * .05, r * .38, r * .24, 'grumpy');
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .03; x.beginPath(); x.arc(cx, cy + r * .6, r * .2, Math.PI + .5, -.5); x.stroke();
  return c; })();
// virüs yapışmış mukus: hafif mor ton + köşede küçük virüs
C.infected = C.mucus.map(m => { const [c, x] = cnv();
  x.drawImage(m, 0, 0);
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(130,60,170,.28)'; x.fillRect(0, 0, TS, TS);
  x.globalCompositeOperation = 'source-over'; x.drawImage(C.virus, TS * .5, -TS * .02, TS * .52, TS * .52);
  return c; });

/* Sıklamen yılan: baş = geriye kıvrık taç yapraklı çiçek (ileri = dokunun üstü), gövde = sap + yaprak, kuyruk = yumru */
const PETAL_ANG = [-.78, -.39, 0, .39, .78];        // taç yapraklar geriye doğru yelpaze
function petalPath(x, w, y0, y1) {                    // yerel +y yönünde, hafif burgulu taç yaprak
  const L = y1 - y0;
  x.beginPath(); x.moveTo(0, y0);
  x.bezierCurveTo(w * 1.15, y0 + L * .2, w * 1.05, y0 + L * .72, w * .3, y1 - 1);
  x.quadraticCurveTo(0, y1 + 3, -w * .35, y1 - 3);
  x.bezierCurveTo(-w * .95, y0 + L * .75, -w * .9, y0 + L * .2, 0, y0);
}
// gri tonlu: görünüm rengiyle tint edilir, dipler koyu kalır
C.petals = (() => { const [c, x] = cnv();
  for (const k of [0, 4, 1, 3, 2]) {
    x.save(); x.translate(TS / 2, TS / 2); x.rotate(-PETAL_ANG[k]);
    petalPath(x, 19, 6, 59);
    const g = x.createLinearGradient(0, 8, 0, 58); g.addColorStop(0, '#bdbdbd'); g.addColorStop(.45, '#efefef'); g.addColorStop(1, '#ffffff');
    x.fillStyle = g; x.fill(); x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,.2)'; x.stroke();
    x.strokeStyle = 'rgba(0,0,0,.09)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 30); x.quadraticCurveTo(3, 44, 1, 55); x.stroke();
    x.restore();
  }
  return c; })();
// sıklamene özgü koyu "göz": taç yaprak diplerinde
C.eye = (() => { const [c, x] = cnv();
  x.fillStyle = '#fff';
  for (const a of PETAL_ANG) { x.save(); x.translate(TS / 2, TS / 2); x.rotate(-a); x.beginPath(); x.ellipse(0, 25, 8, 10, 0, 0, 6.28); x.fill(); x.restore(); }
  x.beginPath(); x.arc(TS / 2, TS / 2, 23, 0, 6.28); x.fill();
  return c; })();
C.face2 = (() => { const [c, x] = cnv();
  eyes(x, TS / 2, TS * .45, TS * .15, TS * .11, 'happy');
  x.fillStyle = 'rgba(255,150,190,.6)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(TS / 2 + s * TS * .27, TS * .6, TS * .07, TS * .045, 0, 0, 6.28); x.fill(); }
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .035; x.lineCap = 'round'; x.beginPath(); x.arc(TS / 2, TS * .58, TS * .09, .25, Math.PI - .25); x.stroke();
  return c; })();
// kalp biçimli, gümüş desenli sıklamen yaprağı; sapı alt ortada
C.leaf = (() => { const [c, x] = cnv();
  x.strokeStyle = '#3F8A4F'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(64, 98); x.lineTo(64, 125); x.stroke();
  const heart = (s) => { x.save(); x.translate(64, 64); x.scale(s, s); x.translate(-64, -64);
    x.beginPath(); x.moveTo(64, 98); x.bezierCurveTo(42, 116, 8, 100, 14, 70); x.bezierCurveTo(20, 40, 50, 22, 64, 8);
    x.bezierCurveTo(78, 22, 108, 40, 114, 70); x.bezierCurveTo(120, 100, 86, 116, 64, 98); x.restore(); };
  heart(1); const g = x.createLinearGradient(0, 8, 0, 110); g.addColorStop(0, '#46A45F'); g.addColorStop(1, '#2C7442'); x.fillStyle = g; x.fill();
  x.lineWidth = 3; x.strokeStyle = '#1F5E33'; x.stroke();
  heart(.62); x.lineWidth = 9; x.strokeStyle = 'rgba(214,236,222,.55)'; x.stroke();          // gümüş halka
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3; x.beginPath(); x.moveTo(64, 96); x.lineTo(64, 22); x.stroke();
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(64, 70); x.quadraticCurveTo(64 + s * 22, 58, 64 + s * 36, 64); x.stroke(); }
  return c; })();
// yumru: ürün özütünün geldiği yer
C.tuber = (() => { const [c, x] = cnv();
  x.strokeStyle = '#7A5534'; x.lineWidth = 3; x.lineCap = 'round';
  for (const [a, l] of [[-.5, 26], [0, 32], [.45, 24], [.9, 18], [-.95, 18]]) { x.beginPath(); x.moveTo(64 + Math.sin(a) * 30, 78); x.quadraticCurveTo(64 + Math.sin(a) * 40, 78 + l * .6, 64 + Math.sin(a) * 46, 78 + l); x.stroke(); }
  x.beginPath(); x.ellipse(64, 66, 44, 32, 0, 0, 6.28);
  x.fillStyle = rg(x, 50, 52, 4, 64, 66, 48, [[0, '#C79563'], [.6, '#9A6B3E'], [1, '#6E4825']]); x.fill();
  x.lineWidth = 3; x.strokeStyle = '#5A3A1E'; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(48, 54, 12, 6, -.4, 0, 6.28); x.fill();
  x.fillStyle = 'rgba(90,58,30,.45)'; for (const [px, py] of [[78, 60], [56, 76], [86, 74]]) { x.beginPath(); x.arc(px, py, 2.5, 0, 6.28); x.fill(); }
  return c; })();
// saponin köpüğü
C.bubble = (() => { const [c, x] = cnv();
  x.beginPath(); x.arc(64, 64, 56, 0, 6.28);
  x.fillStyle = rg(x, 64, 64, 20, 64, 64, 56, [[0, 'rgba(200,236,250,.15)'], [.8, 'rgba(170,224,245,.35)'], [1, 'rgba(255,255,255,.7)']]); x.fill();
  x.lineWidth = 6; x.strokeStyle = 'rgba(110,196,226,.9)'; x.stroke();
  x.strokeStyle = '#fff'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.arc(64, 64, 38, Math.PI * 1.1, Math.PI * 1.45); x.stroke();
  return c; })();
// temizlenen hücrede kısa süre açan çiçek
C.bloom = (() => { const [c, x] = cnv(); flower(x, 64, 64, 56, '#ffffff', '#F4B81F'); return c; })();

// DOM ikonları aynı dokulardan
const ICON = { mucus: C.mucus[0], gold: C.gold, serum: C.serum, breeze: C.breeze, polyp: C.polyp[0], septum: C.septum, plug: C.plug, portal: C.portal, crust: C.crust, virus: C.virus, infected: C.infected[0] };
const iconURL = {};
for (const k in ICON) iconURL[k] = ICON[k].toDataURL();
{ const [c, x] = cnv(); x.fillStyle = '#8A5CF6'; x.beginPath(); x.arc(TS/2,TS/2,TS/2,0,6.28); x.fill(); x.drawImage(C.portal, 0, 0); iconURL.portal = c.toDataURL(); }
document.querySelectorAll('img[data-icon]').forEach(im => im.src = iconURL[im.dataset.icon]);

/* =========================================================================
   PIXI
   ========================================================================= */
try { await Promise.race([document.fonts.load('800 32px "Baloo 2"'), new Promise(r => setTimeout(r, 1500))]); } catch {}
const stageEl = document.getElementById('stage');
const app = new PIXI.Application();
await app.init({
  width: Math.max(1, stageEl.clientWidth), height: Math.max(1, stageEl.clientHeight),
  backgroundAlpha: 0, antialias: false, autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  powerPreference: 'high-performance', preference: 'webgl',
});
stageEl.prepend(app.canvas);
app.ticker.maxFPS = 0;

const T = {};
for (const k of ['ball', 'face', 'soft', 'dot', 'gold', 'serum', 'breeze', 'septum', 'crust', 'plug', 'portal', 'fresh', 'petal', 'virus', 'petals', 'eye', 'face2', 'leaf', 'tuber', 'bubble', 'bloom']) T[k] = PIXI.Texture.from(C[k]);
T.mucus = C.mucus.map(c => PIXI.Texture.from(c));
T.infected = C.infected.map(c => PIXI.Texture.from(c));
T.polyp = C.polyp.map(c => PIXI.Texture.from(c));

const petalLayer = new PIXI.Container();
const board = new PIXI.Container();
app.stage.addChild(petalLayer, board);
const shadowG = new PIXI.Graphics(), baseG = new PIXI.Graphics(), rimG = new PIXI.Graphics();
const cleanLayer = new PIXI.Container(), bloomLayer = new PIXI.Container(), gateLayer = new PIXI.Container(), portalLayer = new PIXI.Container();
const obsLayer = new PIXI.Container(), itemLayer = new PIXI.Container(), moverLayer = new PIXI.Container(), virusLayer = new PIXI.Container();
const snakeLayer = new PIXI.Container(), maskG = new PIXI.Graphics(), fxLayer = new PIXI.Container(), popLayer = new PIXI.Container(), flashG = new PIXI.Graphics();
board.addChild(shadowG, baseG, cleanLayer, bloomLayer, rimG, portalLayer, gateLayer, obsLayer, itemLayer, moverLayer, virusLayer, snakeLayer, maskG, fxLayer, popLayer, flashG);
snakeLayer.mask = maskG; flashG.alpha = 0;

// Arka planda süzülen sıklamen yaprakları (12 sprite)
const PETALS = [];
for (let i = 0; i < 12; i++) {
  const s = new PIXI.Sprite(T.petal); s.anchor.set(.5); s.alpha = .28; petalLayer.addChild(s);
  PETALS.push({ s, x: Math.random(), y: Math.random(), v: .00002 + Math.random() * .00003, r: Math.random() * 6, vr: (Math.random() - .5) * .001, sz: 18 + Math.random() * 26, ph: Math.random() * 6 });
}

const cleanSprites = [];
for (let i = 0; i < COLS * ROWS; i++) { const s = new PIXI.Sprite(T.fresh); s.anchor.set(.5); s.visible = false; cleanLayer.addChild(s); cleanSprites.push(s); }

const gateGlow = new PIXI.Sprite(T.soft), gateRing = new PIXI.Sprite(T.portal);
gateGlow.anchor.set(.5); gateRing.anchor.set(.5); gateGlow.tint = 0x2FD6BE; gateRing.tint = 0x0E9C88;
gateLayer.addChild(gateGlow, gateRing); gateLayer.visible = false;

const leafLayer = new PIXI.Container(), bodyLayer = new PIXI.Container(), lumpLayer = new PIXI.Container();   // lump: gövdede taşınan virüsler
const bodyPool = [], leafPool = [], lumpPool = [];
function bodySprite(i) { let s = bodyPool[i]; if (!s) { s = new PIXI.Sprite(T.ball); s.anchor.set(.5); bodyLayer.addChild(s); bodyPool[i] = s; } return s; }
function leafSprite(i) { let s = leafPool[i]; if (!s) { s = new PIXI.Sprite(T.leaf); s.anchor.set(.5, .97); leafLayer.addChild(s); leafPool[i] = s; } return s; }
const tuber = new PIXI.Sprite(T.tuber), headPetals = new PIXI.Sprite(T.petals), headEye = new PIXI.Sprite(T.eye);
const headBase = new PIXI.Sprite(T.ball), headFace = new PIXI.Sprite(T.face2);
for (const s of [tuber, headPetals, headEye, headBase, headFace]) s.anchor.set(.5);
snakeLayer.addChild(leafLayer, bodyLayer, tuber, lumpLayer, headPetals, headEye, headBase, headFace);

const BLOOMS = [];
for (let i = 0; i < 40; i++) { const s = new PIXI.Sprite(T.bloom); s.anchor.set(.5); s.visible = false; bloomLayer.addChild(s); BLOOMS.push({ s, life: 0 }); }
const BUBBLES = [];

const PARTS = [];
for (let i = 0; i < 200; i++) { const s = new PIXI.Sprite(T.dot); s.anchor.set(.5); s.visible = false; fxLayer.addChild(s); PARTS.push({ s, vx: 0, vy: 0, vr: 0, life: 0, max: 1, size: 1 }); }
for (let i = 0; i < 70; i++) { const s = new PIXI.Sprite(T.bubble); s.anchor.set(.5); s.visible = false; fxLayer.addChild(s); BUBBLES.push({ s, vx: 0, vy: 0, life: 0, max: 1, size: 1, ph: 0 }); }
const POPS = [];
for (let i = 0; i < 8; i++) {
  const t = new PIXI.BitmapText({ text: '+0', style: { fontFamily: 'Baloo 2, Arial', fontSize: 34, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x3A1530, width: 6 } } });
  t.anchor.set(.5); t.visible = false; popLayer.addChild(t); POPS.push({ t, life: 0 });
}
const obsPool = [];

/* =========================================================================
   DURUM
   ========================================================================= */
let cell = 20, boardW = 0, boardH = 0, baseX = 0, baseY = 0;
let mode = 'demo';               // demo | adventure | endless
let state = 'demo';              // demo | intro | play | exiting | dying | result | over | paused
let pausedFrom = null, cfg = DEMO, levelIdx = 0, score = 0;
const bx = new Int16Array(MAXSEG), by = new Int16Array(MAXSEG), px = new Int16Array(MAXSEG), py = new Int16Array(MAXSEG);
const ix = new Float32Array(MAXSEG), iy = new Float32Array(MAXSEG);
let len = 0, prevLen = 0, grow = 0, dir = 0, moveDir = 0, queue = [];
let acc = 0, gameTime = 0, levelStart = 0;
let eaten = 0, target = 0, exitOpen = false, exitX = 0, exitY = 0, exitDir = 0, exitSteps = 0;
let combo = 0, lastEat = -1e9, boostUntil = 0, slowUntil = 0, breezeUntil = 0;
let shake = 0, stepCount = 0;
const obstacle = new Uint8Array(COLS * ROWS), cleaned = new Uint8Array(COLS * ROWS), scratch = new Uint8Array(COLS * ROWS);
let cleanedCount = 0, freeCells = 1;
const cleanAnims = [];
let items = [], movers = [], portals = [], viruses = [];
let carriedAt = [], hurtUntil = 0, virusWait = 0;   // carriedAt: virüslü mukusun yutulduğu adım (gövdede ilerler)
let lv = null;                         // bölüm istatistikleri
let gameSneezes = 0;

function stepDur() {
  if (state === 'exiting') return 45;
  let d = mode === 'endless' ? Math.max(68, cfg.step - eaten * 2.2) : cfg.step;
  if (gameTime < boostUntil) d *= .62;
  if (gameTime < slowUntil) d *= 1.4;
  return d;
}
const running = () => state === 'play' || state === 'exiting' || state === 'demo';

/* =========================================================================
   YERLEŞİM
   ========================================================================= */
function layout() {
  const w = app.screen.width, h = app.screen.height;
  cell = Math.max(8, Math.floor(Math.min((w - 24) / COLS, (h - 28) / ROWS)));
  boardW = COLS * cell; boardH = ROWS * cell;
  baseX = Math.round((w - boardW) / 2); baseY = Math.round((h - boardH) / 2) - 2;
  board.position.set(baseX, baseY);
  const pad = Math.round(cell * .34);
  shadowG.clear().roundRect(-pad, -pad + cell * .28, boardW + pad * 2, boardH + pad * 2, cell * .9).fill({ color: 0x9C3C62, alpha: .16 });
  rimG.clear().roundRect(-pad, -pad, boardW + pad * 2, boardH + pad * 2, cell * .9).stroke({ width: pad, color: 0xE06C8F, alignment: 1 })
    .roundRect(-pad * .5, -pad * .5, boardW + pad, boardH + pad, cell * .75).stroke({ width: 2, color: 0xFFFFFF, alpha: .5 });
  const rnd = seeded(7), shades = [0xF7C6C1, 0xF5C0BC, 0xF8CBC6, 0xF6C3BF];
  baseG.clear().roundRect(0, 0, boardW, boardH, cell * .5).fill({ color: 0xEBA3A6 });
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    baseG.roundRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3, cell * .3).fill({ color: shades[(rnd() * 4) | 0] });
  maskG.clear().rect(-2, -2, boardW + 4, boardH + 4).fill(0xffffff);
  flashG.clear().roundRect(-pad, -pad, boardW + pad * 2, boardH + pad * 2, cell * .9).fill(0xFF3355);
  for (let i = 0; i < cleanSprites.length; i++) cleanSprites[i].position.set(((i % COLS) + .5) * cell, (((i / COLS) | 0) + .5) * cell);
  for (const a of cleanAnims) a.done = false;
  for (let i = 0; i < cleanSprites.length; i++) if (cleaned[i]) cleanSprites[i].width = cleanSprites[i].height = cell * .94;
  placeObstacleSprites();
  for (const it of items) { placeItem(it, true); }
  for (const m of movers) m.s.width = m.s.height = cell * 1.1;
  placePortals(); placeGate();
}
new ResizeObserver(() => { app.renderer.resize(Math.max(1, stageEl.clientWidth), Math.max(1, stageEl.clientHeight)); layout(); }).observe(stageEl);

/* =========================================================================
   BÖLÜM KURULUMU
   ========================================================================= */
const TEXOF = { 1: i => T.polyp[i % 3], 2: () => T.crust, 3: () => T.septum };
function placeObstacleSprites() {
  let k = 0;
  for (let i = 0; i < obstacle.length; i++) {
    const v = obstacle[i]; if (!v) continue;
    let s = obsPool[k]; if (!s) { s = new PIXI.Sprite(T.dot); s.anchor.set(.5); obsLayer.addChild(s); obsPool[k] = s; }
    s.texture = TEXOF[v](i); s.visible = true;
    s.position.set(((i % COLS) + .5) * cell, (((i / COLS) | 0) + .5) * cell);
    s.width = s.height = cell * (v === 3 ? 1.04 : 1.08); s.rotation = v === 3 ? 0 : (i * 1.7) % 6.28;
    k++;
  }
  for (; k < obsPool.length; k++) obsPool[k].visible = false;
}
function isPortal(x, y) { for (const p of portals) if (p.x === x && p.y === y) return true; return false; }

function setupBoard(c) {
  cfg = c;
  obstacle.fill(0);
  for (const r of c.obs) {
    const kind = (r.w === 1 || r.h === 1) && r.w * r.h > 2 ? 3 : 1;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) obstacle[y * COLS + x] = kind;
  }
  for (const m of movers) m.s.destroy(); movers = [];
  for (const [x, y, d] of (c.movers || [])) {
    const s = new PIXI.Sprite(T.plug); s.anchor.set(.5); moverLayer.addChild(s);
    movers.push({ x, y, dx: d, px: x, py: y, s, ph: Math.random() * 6 });
  }
  portalLayer.removeChildren().forEach(s => s.destroy()); portals = [];
  for (const [x, y] of (c.portals || [])) {
    const g = new PIXI.Sprite(T.soft), r = new PIXI.Sprite(T.portal); g.anchor.set(.5); r.anchor.set(.5);
    g.tint = 0xB79BFF; r.tint = 0x7A4FE0; portalLayer.addChild(g, r); portals.push({ x, y, g, r });
  }
  freeCells = 0; for (let i = 0; i < obstacle.length; i++) if (!obstacle[i] && !isPortal(i % COLS, (i / COLS) | 0)) freeCells++;
  placeObstacleSprites(); placePortals();

  cleaned.fill(0); cleanedCount = 0; cleanAnims.length = 0; freshCell.fill(0);
  for (const b of BLOOMS) { b.life = 0; b.s.visible = false; }
  for (const s of cleanSprites) { s.visible = false; }
  for (const it of items) it.s.destroy(); items = [];
  for (const v of viruses) v.s.destroy(); viruses = []; carriedAt = []; hurtUntil = 0; virusWait = 0;
  len = 4; grow = 0; dir = moveDir = 0; queue.length = 0; stepCount = 0;
  for (let i = 0; i < len; i++) { bx[i] = 9; by[i] = ROWS - 4 + i; px[i] = bx[i]; py[i] = by[i]; }
  prevLen = len;
  for (let i = 0; i < len; i++) cleanCell(bx[i], by[i], true);
  target = c.target; eaten = 0; exitOpen = false; gateLayer.visible = false;
  combo = 0; lastEat = -1e9; boostUntil = slowUntil = breezeUntil = 0; acc = 0;
  levelStart = gameTime;
  lv = { sneezes: 0, golds: 0, hardened: 0, maxLen: len, trapped: 0, carried: 0, expelled: 0, replicated: 0, hits: 0 };
  spawn('mucus'); spawn('mucus');
  for (let i = 0; i < (c.virus || 0); i++) spawnVirus();
  renderSnake(1, 16, performance.now());
}
function placePortals() {
  for (const p of portals) {
    p.g.position.set((p.x + .5) * cell, (p.y + .5) * cell); p.r.position.copyFrom(p.g.position);
    p.g.width = p.g.height = cell * 2.6; p.r.width = p.r.height = cell * 1.3;
  }
}

/* =========================================================================
   NESNELER
   ========================================================================= */
function bodyAt(x, y, skipTail) { const n = skipTail ? len - 1 : len; for (let i = 0; i < n; i++) if (bx[i] === x && by[i] === y) return true; return false; }
function itemAt(x, y) { for (const it of items) if (it.x === x && it.y === y) return it; return null; }
function moverAt(x, y) { for (const m of movers) if (m.x === x && m.y === y) return m; return null; }
function occupied(x, y) { return obstacle[y * COLS + x] || isPortal(x, y) || bodyAt(x, y) || itemAt(x, y) || moverAt(x, y) || virusAt(x, y); }

function spawn(type) {
  for (let pass = 0; pass < 2; pass++) {
    const cand = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (occupied(x, y)) continue;
      if (pass === 0 && Math.abs(x - bx[0]) + Math.abs(y - by[0]) < 3) continue;
      if (pass === 0 && movers.some(m => m.y === y)) continue;          // tıkaç hattına mukus bırakma
      cand.push(x, y);
    }
    if (!cand.length) continue;
    const k = ((Math.random() * cand.length / 2) | 0) * 2;
    const vr = (Math.random() * 3) | 0, tex = type === 'mucus' ? T.mucus[vr] : T[type];
    const s = new PIXI.Sprite(tex); s.anchor.set(.5); itemLayer.addChild(s);
    const life = type === 'gold' ? 6000 : type === 'serum' || type === 'breeze' ? 8000 : Infinity;
    const it = { type, x: cand[k], y: cand[k + 1], s, born: gameTime, life, ph: Math.random() * 6.28, pop: 0, var: vr, infected: false };
    placeItem(it, true); items.push(it);
    return it;
  }
  return null;
}
function placeItem(it, snap) {
  it.tx = (it.x + .5) * cell; it.ty = (it.y + .5) * cell;
  if (snap) { it.cx = it.tx; it.cy = it.ty; it.s.position.set(it.tx, it.ty); }
  it.base = cell * (it.type === 'mucus' ? 1.22 : 1.18);
}
function removeItem(it) { it.s.destroy(); const i = items.indexOf(it); if (i >= 0) items.splice(i, 1); }
const countType = t => items.reduce((n, it) => n + (it.type === t), 0);

function openExit() {
  exitOpen = true;
  const opts = [];
  const free = (x, y) => !obstacle[y * COLS + x] && !isPortal(x, y);
  for (let x = 1; x < COLS - 1; x++) { if (free(x, 0)) opts.push([x, -1]); if (free(x, ROWS - 1)) opts.push([x, ROWS]); }
  for (let y = 1; y < ROWS - 1; y++) { if (free(0, y)) opts.push([-1, y]); if (free(COLS - 1, y)) opts.push([COLS, y]); }
  const d = o => Math.abs(o[0] - bx[0]) + Math.abs(o[1] - by[0]);
  opts.sort((a, b) => d(b) - d(a));
  [exitX, exitY] = opts[(Math.random() * Math.min(12, opts.length)) | 0];
  gateLayer.visible = true; placeGate();
  for (const it of items.slice()) if (it.type === 'mucus' && !it.infected) removeItem(it);   // virüslü olanlar kalır, hâlâ taşınabilir
  callout('Ostium açıldı!', 'Akışı parlayan çıkışa götür'); sfx('open'); hudBar();
}
function placeGate() {
  if (!exitOpen) return;
  const gx = (Math.min(Math.max(exitX, -.3), COLS - .7) + .5) * cell, gy = (Math.min(Math.max(exitY, -.3), ROWS - .7) + .5) * cell;
  gateGlow.position.set(gx, gy); gateRing.position.set(gx, gy);
  gateGlow.width = gateGlow.height = cell * 3.6; gateRing.width = gateRing.height = cell * 1.3;
}

/* =========================================================================
   SİMÜLASYON (sabit adım)
   ========================================================================= */
function advance(d, g, tx, ty) {
  for (let i = 0; i < len; i++) { px[i] = bx[i]; py[i] = by[i]; }
  prevLen = len;
  const n = g ? len + 1 : len;
  for (let i = n - 1; i > 0; i--) { bx[i] = bx[i - 1]; by[i] = by[i - 1]; }
  if (tx !== undefined) { bx[0] = tx; by[0] = ty; } else { bx[0] += DX[d]; by[0] += DY[d]; }
  len = n;
}
function step() {
  stepCount++;
  if (state === 'exiting') { advance(exitDir, false); vacated(px[prevLen - 1], py[prevLen - 1]); stepMovers(); stepViruses(); if (++exitSteps > len + 2) finishLevel(); return; }
  if (mode === 'demo') dir = botDir();
  else if (queue.length) dir = queue.shift();
  let nx = bx[0] + DX[dir], ny = by[0] + DY[dir];
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
    if (exitOpen && nx === exitX && ny === exitY) {
      state = 'exiting'; exitDir = moveDir = dir; exitSteps = 0;
      const bonus = len * 5 + lv.carried * 40 * (1 + levelIdx); score += bonus; hudScore();
      popup('+' + bonus, (bx[0] + .5) * cell, (by[0] + .5) * cell, 0x7CF2DD);
      if (lv.carried) {
        lv.expelled = lv.carried; prog.viruses += lv.carried; if (prog.viruses >= 20) award('virus20');
        callout(`${lv.carried} virüs dışarı atıldı`, 'Akış onları ostiumdan taşıdı');
      }
      burst((nx + .5) * cell, (ny + .5) * cell, 26, 0x2FD6BE); petalBurst((bx[0] + .5) * cell, (by[0] + .5) * cell, 22);
      advance(dir, false); sfx('exit'); return;
    }
    return die('wall');
  }
  let teleport = false;
  for (let k = 0; k < portals.length; k++) if (portals[k].x === nx && portals[k].y === ny) {
    const o = portals[k ^ 1]; burst((nx + .5) * cell, (ny + .5) * cell, 12, 0xB79BFF);
    nx = o.x; ny = o.y; teleport = true; break;
  }
  if (obstacle[ny * COLS + nx]) return die(obstacle[ny * COLS + nx] === 2 ? 'crust' : 'polyp');
  if (moverAt(nx, ny)) return die('plug');
  const willGrow = grow > 0;
  for (let i = 1; i < (willGrow ? len : len - 1); i++) if (bx[i] === nx && by[i] === ny) return die('self');
  const hitV = gameTime >= hurtUntil ? virusAt(nx, ny) : null;
  advance(dir, willGrow, nx, ny); moveDir = dir;
  if (!willGrow) vacated(px[prevLen - 1], py[prevLen - 1]);
  if (willGrow) grow--;
  if (len > lv.maxLen) lv.maxLen = len;
  if (teleport) { sfx('portal'); burst((nx + .5) * cell, (ny + .5) * cell, 12, 0xB79BFF); if (mode !== 'demo') { prog.portals++; if (prog.portals >= 10) award('portal10'); } }
  cleanCell(nx, ny);
  const it = itemAt(nx, ny); if (it) consume(it);
  if (hitV) virusHit(hitV);
  if (gameTime < breezeUntil) pullItems();
  stepMovers(); stepViruses(); expelTail();
  if (mode !== 'demo' && len >= 40) award('len40');
  if (mode === 'demo' && len > 30) setupBoard(DEMO);
}
function stepMovers() {
  for (const m of movers) {
    m.px = m.x; m.py = m.y;
    if (stepCount % 2) continue;
    const blocked = x => x < 0 || x >= COLS || obstacle[m.y * COLS + x] || isPortal(x, m.y) || bodyAt(x, m.y) || itemAt(x, m.y) || moverAt(x, m.y) || virusAt(x, m.y);
    let nx = m.x + m.dx;
    if (blocked(nx)) { m.dx = -m.dx; nx = m.x + m.dx; if (blocked(nx)) continue; }
    m.x = nx;
  }
}
function pullItems() {
  const hx = bx[0], hy = by[0];
  for (const it of items.slice()) {
    if (it.type !== 'mucus' && it.type !== 'gold') continue;
    const dx = hx - it.x, dy = hy - it.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) continue;
    const tries = Math.abs(dx) >= Math.abs(dy) ? [[Math.sign(dx), 0], [0, Math.sign(dy)]] : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
    for (const [sx, sy] of tries) {
      if (!sx && !sy) continue;
      const nx = it.x + sx, ny = it.y + sy;
      if (nx === hx && ny === hy) { it.x = nx; it.y = ny; placeItem(it); consume(it); break; }
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || occupied(nx, ny)) continue;
      it.x = nx; it.y = ny; placeItem(it); break;
    }
  }
}

function consume(it) {
  const cx = (it.x + .5) * cell, cy = (it.y + .5) * cell;
  headPulse = 1;
  const tier = mode === 'endless' ? 1 + Math.floor(eaten / 5) : 1 + levelIdx;
  if (it.type === 'mucus') {
    eaten++; grow += 2;
    combo = (gameTime - lastEat < COMBO_WINDOW) ? combo + 1 : 1; lastEat = gameTime;
    let pts = 10 * tier + (combo > 1 ? combo * 5 : 0);
    if (it.infected) {
      lv.carried++; carriedAt.push(stepCount); pts += 20 * tier;
      if (lv.carried === 1) callout('Virüs yakalandı!', mode === 'endless' ? 'Akış onu kuyruktan dışarı atacak' : 'Çıkışa taşı, bonus kazan');
    }
    burst(cx, cy, 7, 0xC3CF3E); foam(cx, cy, 8, .6); sfx('eat');
    if (mode !== 'demo') award('first');
    if (combo >= 3 && combo % 3 === 0) {
      boostUntil = gameTime + 1400; shake = REDUCED || mode === 'demo' ? 0 : 9; pts += 25 * tier;
      lv.sneezes++; gameSneezes++;
      if (mode !== 'demo') { callout('Hapşırma refleksi!', 'Akış bir anlığına hızlandı'); if (gameSneezes >= 5) award('sneeze5'); }
      sfx('sneeze'); burst((bx[0] + .5) * cell, (by[0] + .5) * cell, 18, 0xF06AAE); petalBurst((bx[0] + .5) * cell, (by[0] + .5) * cell, 12);
      if (mode !== 'demo' && navigator.vibrate) try { navigator.vibrate(25); } catch {}
    }
    score += pts; if (mode !== 'demo') popup('+' + pts, cx, cy, 0xFFFFFF);
    removeItem(it);
    if (eaten >= target) { if (!exitOpen) openExit(); }
    else if (eaten + countType('mucus') < target) spawn('mucus');
    if (!exitOpen) {
      if (!countType('gold') && Math.random() < cfg.gold) spawn('gold');
      if (!countType('serum') && Math.random() < cfg.serum) spawn('serum');
      if (!countType('breeze') && Math.random() < cfg.breeze) spawn('breeze');
    }
    if (mode === 'endless' && eaten % 5 === 0) callout('Akış hızlandı', 'Hız ' + (1 + eaten / 5));
  } else if (it.type === 'gold') {
    const pts = 50 * tier; score += pts; popup('+' + pts, cx, cy, 0xFFD24A);
    burst(cx, cy, 22, 0xF8C537); sfx('gold'); removeItem(it); lv.golds++;
    prog.golds++; if (prog.golds >= 10) award('gold10');
  } else if (it.type === 'serum') {
    slowUntil = gameTime + 6000; burst(cx, cy, 16, 0x5AAEEB); sfx('serum'); removeItem(it);
    callout('Serum fizyolojik', 'Akış yavaşladı, kontrol sende');
    prog.serums++; if (prog.serums >= 5) award('serum5');
  } else if (it.type === 'breeze') {
    breezeUntil = gameTime + 6000; burst(cx, cy, 16, 0x2FAE6E); sfx('breeze'); removeItem(it);
    callout('Ferah esinti', 'Yakındaki mukuslar sana geliyor');
  }
  if (mode === 'endless' && score >= 1000) award('endless');
  hudScore(); hudBar();
}
function harden(it) {
  obstacle[it.y * COLS + it.x] = 2; lv.hardened++;
  burst((it.x + .5) * cell, (it.y + .5) * cell, 14, 0x9C8446);
  removeItem(it); placeObstacleSprites(); sfx('harden');
  callout('Mukus sertleşti', 'Yol biraz daraldı');
  if (eaten + countType('mucus') < target) spawn('mucus');
}

/* =========================================================================
   VİRÜSLER: mukusa yapışır, akışla dışarı taşınır (akış virüsü yok etmez)
   ========================================================================= */
function virusAt(x, y) { for (const v of viruses) if (v.x === x && v.y === y) return v; return null; }
function virusCanEnter(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  if (obstacle[y * COLS + x] || isPortal(x, y) || bodyAt(x, y) || moverAt(x, y) || virusAt(x, y)) return false;
  const it = itemAt(x, y); return !it || (it.type === 'mucus' && !it.infected);
}
const emptyCell = (x, y) => virusCanEnter(x, y) && !itemAt(x, y);
function addVirus(x, y) {
  const s = new PIXI.Sprite(T.virus); s.anchor.set(.5); virusLayer.addChild(s);
  const v = { x, y, px: x, py: y, s, d: (Math.random() * 4) | 0, off: (Math.random() * 4) | 0, ph: Math.random() * 6.28, rep: gameTime + (cfg.replicate || 0), pop: 0 };
  viruses.push(v); return v;
}
function spawnVirus() {
  const cand = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (emptyCell(x, y) && Math.abs(x - bx[0]) + Math.abs(y - by[0]) >= 7 && !movers.some(m => m.y === y)) cand.push(x, y);
  if (!cand.length) return null;
  const k = ((Math.random() * cand.length / 2) | 0) * 2;
  return addVirus(cand[k], cand[k + 1]);
}
function removeVirus(v) { v.s.destroy(); const i = viruses.indexOf(v); if (i >= 0) viruses.splice(i, 1); }
function stepViruses() {
  const every = cfg.virusEvery || 2;
  for (const v of viruses.slice()) {
    v.px = v.x; v.py = v.y;
    if ((stepCount + v.off) % every) continue;
    const opts = [];
    for (let d = 0; d < 4; d++) if (virusCanEnter(v.x + DX[d], v.y + DY[d])) opts.push(d);
    if (!opts.length) continue;
    let d = -1, m = null, md = 9;            // 8 hücre içindeki en yakın temiz mukusa yönel
    for (const it of items) if (it.type === 'mucus' && !it.infected) { const k = Math.abs(it.x - v.x) + Math.abs(it.y - v.y); if (k < md) { md = k; m = it; } }
    if (m && Math.random() < .7) {
      const near = opts.filter(o => Math.abs(v.x + DX[o] - m.x) + Math.abs(v.y + DY[o] - m.y) < md);
      if (near.length) d = near[(Math.random() * near.length) | 0];
    }
    if (d < 0) {
      const fwd = opts.filter(o => o !== (v.d + 2) % 4), pool = fwd.length ? fwd : opts;
      d = pool.includes(v.d) && Math.random() < .55 ? v.d : pool[(Math.random() * pool.length) | 0];
    }
    v.d = d; v.x += DX[d]; v.y += DY[d];
    const it = itemAt(v.x, v.y); if (it) trapVirus(v, it);
  }
}
function trapVirus(v, it) {
  it.infected = true; it.s.texture = T.infected[it.var]; it.pop = .4;
  burst((it.x + .5) * cell, (it.y + .5) * cell, 12, 0xF2683A); sfx('trap'); removeVirus(v);
  if (!lv.trapped++) callout('Virüs mukusa yapıştı', 'Topla ve dışarı taşı');
}
function virusHit(v) {
  hurtUntil = gameTime + 1500; lv.hits++;
  const lost = Math.min(3, len - 4);
  if (lost > 0) { burst((bx[len - 1] + .5) * cell, (by[len - 1] + .5) * cell, 10, 0xF2683A); len -= lost; prevLen = Math.min(prevLen, len); }
  burst((bx[0] + .5) * cell, (by[0] + .5) * cell, 18, 0xF2683A);
  flashG.alpha = .22; shake = REDUCED || mode === 'demo' ? 0 : 6; sfx('hurt');
  if (mode !== 'demo' && navigator.vibrate) try { navigator.vibrate(30); } catch {}
  callout('Virüse çarptın', 'Drenaj kısaldı. Virüsü mukusa yakalat');
  removeVirus(v); spawnVirus();          // virüs sekip uzağa savrulur
}
// Serbest akışta çıkış yok: taşınan virüs kuyruğa ulaşınca dışarı atılır
function expelTail() {
  if (mode !== 'endless') return;
  while (carriedAt.length && 1 + stepCount - carriedAt[0] >= len) {
    carriedAt.shift(); lv.expelled++; prog.viruses++; if (prog.viruses >= 20) award('virus20');
    burst((bx[len - 1] + .5) * cell, (by[len - 1] + .5) * cell, 10, 0x2FD6BE); foam((bx[len - 1] + .5) * cell, (by[len - 1] + .5) * cell, 5, .5);
  }
}
function updateViruses(dt) {
  if (!cfg.virus) return;
  if (cfg.replicate) for (const v of viruses.slice()) {
    if (cleaned[v.y * COLS + v.x]) { v.rep += dt; continue; }   // temiz dokuda çoğalamaz
    if (gameTime < v.rep) continue;
    v.rep = gameTime + cfg.replicate;
    if (viruses.length >= cfg.virusMax) continue;
    const opts = [];
    for (let d = 0; d < 4; d++) if (emptyCell(v.x + DX[d], v.y + DY[d])) opts.push(d);
    if (!opts.length) continue;
    const d = opts[(Math.random() * opts.length) | 0], n = addVirus(v.x + DX[d], v.y + DY[d]);
    n.px = v.x; n.py = v.y; lv.replicated++;
    burst((n.x + .5) * cell, (n.y + .5) * cell, 10, 0xF2683A); sfx('replicate');
    if (lv.replicated === 1) callout('Virüs çoğaldı', 'Temizlenmiş dokuda çoğalamazlar');
  }
  if (cfg.respawn && !viruses.length) {
    if (!virusWait) virusWait = gameTime + cfg.respawn;
    else if (gameTime >= virusWait) { virusWait = 0; spawnVirus(); }
  }
}
function renderViruses(a, dt, now) {
  for (const v of viruses) {
    v.pop = Math.min(1, v.pop + dt / 280);
    const popS = v.pop < 1 ? 1 - Math.pow(1 - v.pop, 3) + Math.sin(v.pop * Math.PI) * .25 : 1;
    const left = v.rep - gameTime;     // çoğalmadan hemen önce şişip titrer
    const swell = cfg.replicate && left < 1500 && !cleaned[v.y * COLS + v.x] ? (1 - Math.max(0, left) / 1500) * .22 * (.6 + .4 * Math.sin(now * .03)) : 0;
    v.s.position.set((v.px + (v.x - v.px) * a + .5) * cell, (v.py + (v.y - v.py) * a + .5) * cell);
    v.s.width = v.s.height = cell * 1.05 * popS * (1 + .05 * Math.sin(now * .006 + v.ph) + swell);
    v.s.rotation = Math.sin(now * .002 + v.ph) * .5;
  }
}

function cleanCell(x, y, instant) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  const i = y * COLS + x; if (cleaned[i] || isPortal(x, y)) return;
  cleaned[i] = 1; cleanedCount++;
  const s = cleanSprites[i]; s.visible = true;
  if (instant) { s.width = s.height = cell * .94; s.alpha = 1; } else { s.alpha = 0; cleanAnims.push({ s, t: 0 }); freshCell[i] = 1; }
}

/* Demo botu: hedefe yönel, sıkışacağı yönlerden flood-fill ile kaçın */
function flood(sx, sy, limit) {
  scratch.fill(0);
  for (let i = 0; i < len - 1; i++) scratch[by[i] * COLS + bx[i]] = 1;
  for (let i = 0; i < obstacle.length; i++) if (obstacle[i]) scratch[i] = 1;
  const q = [sx, sy]; scratch[sy * COLS + sx] = 1; let n = 0, h = 0;
  while (h < q.length && n < limit) {
    const x = q[h++], y = q[h++]; n++;
    for (let d = 0; d < 4; d++) { const X = x + DX[d], Y = y + DY[d]; if (X < 0 || Y < 0 || X >= COLS || Y >= ROWS || scratch[Y * COLS + X]) continue; scratch[Y * COLS + X] = 1; q.push(X, Y); }
  }
  return n;
}
function botDir() {
  const m = items.find(i => i.type === 'mucus'); const hx = bx[0], hy = by[0];
  let best = dir, bestS = -1e9;
  for (let d = 0; d < 4; d++) {
    if (d === (moveDir + 2) % 4) continue;
    const nx = hx + DX[d], ny = hy + DY[d];
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || obstacle[ny * COLS + nx] || bodyAt(nx, ny, true)) continue;
    const space = flood(nx, ny, 120);
    let s = (m ? -(Math.abs(nx - m.x) + Math.abs(ny - m.y)) : 0) + (space < len + 6 ? -500 + space : 0) + (d === moveDir ? .3 : 0);
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

/* =========================================================================
   OYUN SONU / BÖLÜM SONU
   ========================================================================= */
const REASONS = { wall: 'Drenaj mukoza duvarına çarptı.', polyp: 'Drenaj bir engele takıldı.', self: 'Drenaj kendi kuyruğuna dolandı.', plug: 'Bir tıkaç akışın önünü kesti.', crust: 'Sertleşmiş mukusa çarptın.' };
function die(reason) {
  if (mode === 'demo') { state = 'dying'; burst((bx[0] + .5) * cell, (by[0] + .5) * cell, 20, 0xF06AAE); setTimeout(() => { if (mode === 'demo') { setupBoard(DEMO); state = 'demo'; } }, 700); return; }
  state = 'dying'; flashG.alpha = .5; shake = REDUCED ? 0 : 14; sfx('die');
  burst((bx[0] + .5) * cell, (by[0] + .5) * cell, 34, 0xFF4A6A);
  if (navigator.vibrate) try { navigator.vibrate(70); } catch {}
  let bestNow;
  if (mode === 'endless') { prog.endlessBest = Math.max(prog.endlessBest, score); bestNow = prog.endlessBest; }
  else { prog.best = Math.max(prog.best, score); bestNow = prog.best; }
  save();
  track('game_over', { mode, reason, level: levelIdx + 1, score, length: len, level_ms: Math.round(gameTime - levelStart) });
  setTimeout(() => {
    state = 'over';
    $('overReason').textContent = REASONS[reason];
    $('ovScore').textContent = score; $('ovBest').textContent = bestNow; $('ovLen').textContent = len;
    $('ovBestLabel').textContent = mode === 'endless' ? 'Serbest rekor' : 'Rekor';
    $('ovTip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
    $('btnOverBack').textContent = mode === 'endless' ? 'Ana menü' : 'Harita';
    show('scrOver');
  }, 800);
}

const GOAL_TEXT = {
  clean: v => `Temiz alan en az %${v}`, time: v => `${v} saniyenin altında bitir`, sneeze: v => `${v} hapşırma refleksi yap`,
  gold: v => `${v} altın sıklamen topla`, len: v => `Drenajı ${v} uzunluğa ulaştır`, nohard: () => 'Hiçbir mukus sertleşmesin',
  virus: v => `${v} virüsü dışarı taşı`, noinfect: () => 'Hiçbir virüs çoğalmasın',
};
function evalGoal([t, v], st) {
  return { clean: st.clean >= v, time: st.time <= v, sneeze: st.sneezes >= v, gold: st.golds >= v, len: st.maxLen >= v, nohard: st.hardened === 0, virus: st.expelled >= v, noinfect: st.replicated === 0 }[t];
}
function finishLevel() {
  state = 'result'; gateLayer.visible = false;
  const L = LEVELS[levelIdx];
  const st = { ...lv, clean: Math.round(cleanedCount / freeCells * 100), time: Math.round((gameTime - levelStart) / 1000) };
  const got = [true, evalGoal(L.obj[0], st), evalGoal(L.obj[1], st)];
  const mask = got.reduce((m, g, i) => m | (g ? 1 << i : 0), 0);
  const firstClear = !prog.done[levelIdx];
  prog.mask[levelIdx] |= mask; prog.done[levelIdx] = true; prog.best = Math.max(prog.best, score);
  const newFact = !prog.facts[levelIdx]; prog.facts[levelIdx] = true;
  save();
  if (st.clean >= 60) award('clean60');
  if (mask === 7) award('perfect');
  if (prog.done.every(Boolean)) award('all8');
  if (totalStars() >= 15) award('stars15');
  if (totalStars() >= 24) award('stars24');
  track('level_complete', { level: levelIdx + 1, score, stars: bits(mask), clean_pct: st.clean, time_s: st.time, first_clear: firstClear });

  $('tResult').textContent = L.name + ' temizlendi';
  const starsEl = $('reStars'); starsEl.classList.remove('go');
  [...starsEl.children].forEach((s, i) => s.classList.toggle('on', got[i]));
  void starsEl.offsetWidth; starsEl.classList.add('go');
  got.forEach((g, i) => g && setTimeout(() => sfx('star'), 200 + i * 180));
  const goals = [['Bölümü tamamla', true], [GOAL_TEXT[L.obj[0][0]](L.obj[0][1]), got[1]], [GOAL_TEXT[L.obj[1][0]](L.obj[1][1]), got[2]]];
  $('reGoals').innerHTML = goals.map(([t, g]) => `<li><span class="st ${g ? 'on' : ''}">★</span>${t}<span class="ok ${g ? 'y' : 'n'}">${g ? '✓' : '✗'}</span></li>`).join('');
  $('reVirusWrap').style.display = L.virus ? '' : 'none'; $('reVirus').textContent = lv.expelled;
  $('reScore').textContent = score; $('reClean').textContent = st.clean + '%'; $('reTime').textContent = st.time + ' sn';
  $('reFactTitle').textContent = newFact ? 'Yeni bilgi kartı açıldı' : 'Biliyor muydunuz?';
  $('reFact').querySelector('.em').textContent = FACTS[levelIdx][0];
  $('reFactText').textContent = FACTS[levelIdx][1];
  const last = levelIdx === LEVELS.length - 1;
  $('btnNext').textContent = last ? 'Tüm sinüsler temiz! Haritaya dön' : 'Sonraki bölüm: ' + LEVELS[levelIdx + 1].name;
  show('scrResult');
}

/* =========================================================================
   EFEKTLER
   ========================================================================= */
let partCursor = 0;
function burst(x, y, n, color) {
  for (let k = 0; k < n; k++) {
    const p = PARTS[partCursor = (partCursor + 1) % PARTS.length];
    const a = Math.random() * 6.28, sp = (.04 + Math.random() * .15) * cell;
    p.s.visible = true; p.s.tint = color; p.s.position.set(x, y); p.s.texture = T.dot; p.s.rotation = 0; p.vr = 0;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.max = p.life = 350 + Math.random() * 380; p.size = cell * (.14 + Math.random() * .22);
  }
}
// taç yaprak yağmuru (çıkış, hapşırma)
function petalBurst(x, y, n) {
  const c = skin.classic ? 0xF06AAE : skin.petal === -1 ? null : skin.petal;
  for (let k = 0; k < n; k++) {
    const p = PARTS[partCursor = (partCursor + 1) % PARTS.length];
    const a = Math.random() * 6.28, sp = (.05 + Math.random() * .16) * cell;
    p.s.visible = true; p.s.texture = T.petal; p.s.tint = c ?? hsl(Math.random()); p.s.position.set(x, y);
    p.s.rotation = Math.random() * 6.28; p.vr = (Math.random() - .5) * .2;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.max = p.life = 600 + Math.random() * 500; p.size = cell * (.35 + Math.random() * .3);
  }
}
// saponin köpüğü: yavaşça yükselip patlayan baloncuklar
let bubCursor = 0;
function foam(x, y, n, spread) {
  for (let k = 0; k < n; k++) {
    const b = BUBBLES[bubCursor = (bubCursor + 1) % BUBBLES.length];
    b.s.visible = true; b.s.position.set(x + (Math.random() - .5) * spread * cell, y + (Math.random() - .5) * spread * cell);
    b.vx = (Math.random() - .5) * .012 * cell; b.vy = -(.006 + Math.random() * .014) * cell;
    b.max = b.life = 650 + Math.random() * 550; b.size = cell * (.16 + Math.random() * .26); b.ph = Math.random() * 6.28;
  }
}
// temizlenen hücre, kuyruk oradan ayrılınca kısa süre çiçek açar
const freshCell = new Uint8Array(COLS * ROWS);
let bloomCursor = 0;
function vacated(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  const i = y * COLS + x;
  if (Math.random() < .22) foam((x + .5) * cell, (y + .5) * cell, 1, .4);
  if (!freshCell[i]) return;
  freshCell[i] = 0;
  const b = BLOOMS[bloomCursor = (bloomCursor + 1) % BLOOMS.length];
  b.s.visible = true; b.s.position.set((x + .5) * cell, (y + .5) * cell); b.s.rotation = Math.random() * 6.28;
  b.s.tint = skin.classic || skin.petal === -1 ? 0xFFC2DD : mixc(rgb(skin.petal), WHITE, .45); b.life = 520;
}
let popCursor = 0;
function popup(txt, x, y, color) {
  const p = POPS[popCursor = (popCursor + 1) % POPS.length];
  p.t.text = txt; p.t.tint = color; p.t.visible = true; p.t.position.set(x, y); p.life = 850; p.t.scale.set(Math.max(.5, cell / 36));
}
const calloutEl = document.getElementById('callout');
function callout(title, sub) {
  if (mode === 'demo') return;
  calloutEl.textContent = title;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; calloutEl.append(s); }
  calloutEl.classList.remove('go'); void calloutEl.offsetWidth; calloutEl.classList.add('go');
}
const toastQ = []; let toastBusy = false;
function award(id) {
  if (prog.badges[id]) return;
  prog.badges[id] = Date.now(); save();
  const b = BADGES.find(b => b[0] === id); toastQ.push(b); track('badge', { id });
  if (!toastBusy) nextToast();
}
function nextToast() {
  const b = toastQ.shift(); if (!b) { toastBusy = false; return; }
  toastBusy = true; sfx('badge');
  $('toastEm').textContent = b[1]; $('toastTitle').textContent = 'Rozet: ' + b[2]; $('toastDesc').textContent = b[3];
  $('toast').classList.add('on');
  setTimeout(() => { $('toast').classList.remove('on'); setTimeout(nextToast, 400); }, 2300);
}

/* =========================================================================
   RENDER
   ========================================================================= */
function rgb(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
function mixc(a, b, t) { return ((a[0] + (b[0] - a[0]) * t) << 16) | ((a[1] + (b[1] - a[1]) * t) << 8) | (a[2] + (b[2] - a[2]) * t); }
function hsl(h) { const f = n => { const k = (n + h * 12) % 12; return Math.round(255 * (.62 - .38 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return (f(0) << 16) | (f(8) << 8) | f(4); }
const WHITE = [255, 255, 255], BOOSTC = rgb(0xF06AAE);
const STEM = rgb(0x4BA85E), STEM_HI = rgb(0x9EDC8C), WILT = rgb(0x9C8F96);
let skin = SKINS[0], skinBody = WHITE;
let headRot = 0, headPulse = 0;

function renderSnake(alpha, dt, now) {
  for (let i = 0; i < len; i++) {
    let fx = i < prevLen ? px[i] : bx[i], fy = i < prevLen ? py[i] : by[i];
    if (Math.abs(fx - bx[i]) + Math.abs(fy - by[i]) > 1.5) { fx = bx[i]; fy = by[i]; }   // kanal geçişi: sıçra
    ix[i] = fx + (bx[i] - fx) * alpha; iy[i] = fy + (by[i] - fy) * alpha;
  }
  const count = len * 2 - 1, boosting = gameTime < boostUntil, hurt = gameTime < hurtUntil;
  const flower = !skin.classic, rainbow = skin.petal === -1;
  let used = 0;
  for (let k = count - 1; k >= 1; k--) {
    const i = k >> 1; let x, y;
    if (k & 1) {
      if (Math.abs(ix[i] - ix[i + 1]) + Math.abs(iy[i] - iy[i + 1]) > 1.5) continue;
      x = (ix[i] + ix[i + 1]) * .5; y = (iy[i] + iy[i + 1]) * .5;
    } else { x = ix[i]; y = iy[i]; }
    const t = k / count, s = bodySprite(used++);
    s.visible = true; s.position.set((x + .5) * cell, (y + .5) * cell);
    s.width = s.height = cell * (flower ? .7 - .26 * t : .9 - .36 * t);
    const w = .5 + .5 * Math.sin(now * .008 - k * .45);
    s.tint = boosting ? mixc(BOOSTC, WHITE, w * .4) : flower ? mixc(STEM, STEM_HI, w * .45) : mixc(skinBody, WHITE, w * .22);
  }
  for (let j = used; j < bodyPool.length; j++) bodyPool[j].visible = false;
  // her 3 segmentte bir, sırayla sağa sola açılan yaprak
  let nl = 0;
  if (flower) for (let i = 3; i < len - 1; i += 3) {
    const tx = ix[i - 1] - ix[i + 1], ty = iy[i - 1] - iy[i + 1];
    if (Math.abs(tx) + Math.abs(ty) > 3) continue;                      // kanal geçişi
    const s = leafSprite(nl++), side = (i / 3) & 1 ? 1 : -1, sz = cell * (1.5 - .55 * i / len);
    s.visible = true; s.position.set((ix[i] + .5) * cell, (iy[i] + .5) * cell);
    s.rotation = Math.atan2(ty, tx) + side * (Math.PI / 2 + .6) + Math.PI / 2 + Math.sin(now * .004 + i) * .12;
    s.width = sz * .85; s.height = sz; s.tint = hurt ? mixc(WHITE, WILT, .5) : 0xffffff;
  }
  for (let j = nl; j < leafPool.length; j++) leafPool[j].visible = false;
  tuber.visible = flower;
  if (flower) {
    const e = len - 1;
    tuber.position.set((ix[e] + .5) * cell, (iy[e] + .5) * cell);
    tuber.rotation = Math.atan2(iy[e - 1] - iy[e], ix[e - 1] - ix[e]) + Math.PI / 2;   // kökler geriye
    tuber.width = tuber.height = cell * 1.2;
  }
  // yutulan virüs gövdede kuyruğa doğru ilerler, en eskisi en arkada
  for (let j = 0; j < carriedAt.length; j++) {
    let s = lumpPool[j]; if (!s) { s = new PIXI.Sprite(T.virus); s.anchor.set(.5); lumpLayer.addChild(s); lumpPool[j] = s; }
    const i = Math.max(1, Math.min(len - 1 - j, 1 + stepCount - carriedAt[j]));
    s.visible = true; s.position.set((ix[i] + .5) * cell, (iy[i] + .5) * cell);
    s.width = s.height = cell * .58; s.rotation = now * .002 + j * 1.3;
  }
  for (let j = carriedAt.length; j < lumpPool.length; j++) lumpPool[j].visible = false;
  snakeLayer.alpha = hurt ? (Math.sin(now * .04) > 0 ? 1 : .45) : 1;
  const hx = (ix[0] + .5) * cell, hy = (iy[0] + .5) * cell;
  const lx = DX[moveDir] * cell * .1, ly = DY[moveDir] * cell * .08;
  headPetals.visible = headEye.visible = flower;
  headPulse = Math.max(0, headPulse - dt * .004);
  if (flower) {
    // taç yapraklar boyundan başa giden yönün tersine savrulur
    const vx = ix[0] - ix[1], vy = iy[0] - iy[1], m = Math.abs(vx) + Math.abs(vy);
    const target = m > .05 && m < 1.5 ? Math.atan2(vy, vx) + Math.PI / 2 : Math.atan2(DY[moveDir], DX[moveDir]) + Math.PI / 2;
    const d = Math.atan2(Math.sin(target - headRot), Math.cos(target - headRot));
    headRot += d * Math.min(1, dt * .025);
    const open = (boosting ? 1.16 : 1) * (hurt ? .84 : 1) * (1 + headPulse * .1), fl = Math.sin(now * .018) * .045;
    const petalC = rainbow ? hsl((now * .0003) % 1) : skin.petal;
    for (const s of [headPetals, headEye]) {
      s.position.set(hx, hy); s.rotation = headRot;
      s.width = cell * 3.1 * open * (1 + fl); s.height = cell * 3.1 * open * (1 - fl * .6);
    }
    headPetals.tint = hurt ? mixc(rgb(petalC), WILT, .55) : petalC; headEye.tint = skin.eye;
    headBase.tint = skin.disc; headBase.width = headBase.height = cell * 1.0;
  } else {
    headBase.tint = skin.head; headBase.width = headBase.height = cell * 1.2;
  }
  headBase.position.set(hx, hy);
  headFace.position.set(hx + lx, hy + ly); headFace.width = headFace.height = cell * (flower ? 1.0 : 1.2);
  headFace.scale.x = Math.abs(headFace.scale.x) * (moveDir === 3 ? -1 : 1);
}

function updateFx(dt, now) {
  for (let i = cleanAnims.length - 1; i >= 0; i--) {
    const a = cleanAnims[i]; a.t += dt; const k = Math.min(1, a.t / 320);
    const sc = k < .6 ? .5 + k / .6 * .62 : 1.12 - (k - .6) / .4 * .18;
    a.s.width = a.s.height = cell * .94 * sc; a.s.alpha = Math.min(1, k * 2.2);
    if (k >= 1) { a.s.width = a.s.height = cell * .94; a.s.alpha = 1; cleanAnims.splice(i, 1); }
  }
  const ek = 1 - Math.exp(-dt * .02);
  for (const it of items) {
    it.pop = Math.min(1, it.pop + dt / 260);
    const popS = it.pop < 1 ? 1 - Math.pow(1 - it.pop, 3) * 1 + Math.sin(it.pop * Math.PI) * .25 : 1;
    const w = Math.sin(now * .005 + it.ph);
    let jx = 0;
    it.cx += (it.tx - it.cx) * ek; it.cy += (it.ty - it.cy) * ek;
    if (it.type === 'mucus' && cfg.harden && running()) {
      const left = cfg.harden - (gameTime - it.born);
      if (left < 2600) { const f = 1 - left / 2600; jx = Math.sin(now * .06) * cell * .06 * f; it.s.tint = mixc(WHITE, rgb(0xB39A60), f); }
    }
    it.s.position.set(it.cx + jx, it.cy);
    it.s.width = it.s.height = it.base * popS * (1 + .06 * w);
    if (it.type !== 'mucus') {
      it.s.rotation = it.type === 'gold' ? now * .0015 : .14 * w;
      const left = it.born + it.life - gameTime;
      it.s.alpha = left < 1600 ? (Math.sin(now * .03) > 0 ? 1 : .3) : 1;
    }
  }
  for (const p of portals) { p.r.rotation = now * .004; p.g.alpha = .55 + .3 * Math.sin(now * .005); }
  if (gateLayer.visible) { const p = .5 + .5 * Math.sin(now * .006); gateGlow.alpha = .5 + .5 * p; gateRing.rotation = -now * .005; }
  for (const p of PARTS) {
    if (p.life <= 0) continue;
    p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
    const f = dt / 16.67; p.s.x += p.vx * f; p.s.y += p.vy * f; p.s.rotation += p.vr * f; p.vx *= Math.pow(.93, f); p.vy *= Math.pow(.93, f);
    const k = p.life / p.max; p.s.alpha = k; p.s.width = p.s.height = p.size * (.4 + .6 * k);
  }
  for (const b of BUBBLES) {
    if (b.life <= 0) continue;
    b.life -= dt; if (b.life <= 0) { b.s.visible = false; continue; }
    const f = dt / 16.67, k = b.life / b.max; b.s.x += (b.vx + Math.sin(now * .006 + b.ph) * .004 * cell) * f; b.s.y += b.vy * f;
    const popK = k < .15 ? 1 + (1 - k / .15) * .35 : 1;          // patlarken genişleyip kaybolur
    b.s.width = b.s.height = b.size * (.6 + .4 * Math.min(1, (1 - k) * 4)) * popK; b.s.alpha = k < .15 ? k / .15 : .9;
  }
  for (const b of BLOOMS) {
    if (b.life <= 0) continue;
    b.life -= dt; if (b.life <= 0) { b.s.visible = false; continue; }
    const k = 1 - b.life / 520;
    b.s.width = b.s.height = cell * .62 * Math.min(1, k * 3.2) * (1 + .1 * Math.sin(k * Math.PI));
    b.s.alpha = k < .55 ? .95 : .95 * (1 - (k - .55) / .45); b.s.rotation += dt * .002;
  }
  for (const p of POPS) { if (p.life <= 0) continue; p.life -= dt; p.t.y -= dt * .045 * (cell / 24); p.t.alpha = Math.min(1, p.life / 300); if (p.life <= 0) p.t.visible = false; }
  if (flashG.alpha > 0) flashG.alpha = Math.max(0, flashG.alpha - dt * .0011);
  if (shake > 0) { shake = Math.max(0, shake - dt * .035); board.position.set(baseX + (Math.random() - .5) * shake, baseY + (Math.random() - .5) * shake); }
  else if (board.x !== baseX || board.y !== baseY) board.position.set(baseX, baseY);
  if (!REDUCED) {
    const W = app.screen.width, H = app.screen.height;
    for (const p of PETALS) {
      p.y += p.v * dt; p.r += p.vr * dt; if (p.y > 1.08) { p.y = -.08; p.x = Math.random(); }
      p.s.position.set(p.x * W + Math.sin(now * .0006 + p.ph) * 24, p.y * H); p.s.rotation = p.r; p.s.width = p.s.height = p.sz;
    }
  } else if (!PETALS[0].placed) { const W = app.screen.width, H = app.screen.height; for (const p of PETALS) { p.s.position.set(p.x * W, p.y * H); p.s.width = p.s.height = p.sz; p.placed = true; } }
}

/* =========================================================================
   ANA DÖNGÜ
   ========================================================================= */
const fpsEl = $('fps'); let fpsAcc = 0, fpsFrames = 0, fpsWorst = 0, chipAcc = 0, fpsOn = DEBUG;
function setFps(on) { fpsOn = on; fpsAcc = fpsFrames = fpsWorst = 0; fpsEl.textContent = '… fps'; fpsEl.style.display = on ? 'block' : 'none'; }
setFps(fpsOn);
app.ticker.add((tk) => {
  const dt = Math.min(tk.deltaMS, 100), now = performance.now();
  let alpha = 1;
  if (running()) {
    gameTime += dt; acc += dt;
    let sd = stepDur(), n = 0;
    while (acc >= sd && n < 4) { acc -= sd; step(); n++; if (!running()) break; sd = stepDur(); }
    if (n === 4) acc = 0;
    if (running()) alpha = Math.min(1, acc / sd);
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (gameTime > it.born + it.life) removeItem(it);
      else if (it.type === 'mucus' && cfg.harden && state === 'play' && gameTime - it.born > cfg.harden) harden(it);
    }
    if (state === 'play') updateViruses(dt);
  }
  renderSnake(running() ? alpha : 1, dt, now);
  for (const m of movers) { const a = running() ? alpha : 1; m.s.position.set((m.px + (m.x - m.px) * a + .5) * cell, (m.py + (m.y - m.py) * a + .5) * cell + Math.sin(now * .008 + m.ph) * cell * .04); m.s.width = m.s.height = cell * 1.1; m.s.scale.x = Math.abs(m.s.scale.x) * (m.dx < 0 ? -1 : 1); }
  renderViruses(running() ? alpha : 1, dt, now);
  updateFx(dt, now);
  if ((chipAcc += dt) > 100) { chipAcc = 0; updateChips(); }
  if (fpsOn) {
    fpsAcc += tk.deltaMS; fpsFrames++; fpsWorst = Math.max(fpsWorst, tk.deltaMS);
    if (fpsAcc >= 500) { fpsEl.textContent = `${Math.round(fpsFrames * 1000 / fpsAcc)} fps  en kötü ${fpsWorst.toFixed(1)}ms  ${len} seg`; fpsAcc = fpsFrames = fpsWorst = 0; }
  }
});

/* =========================================================================
   GİRDİ
   ========================================================================= */
function pushDir(d) {
  if (state !== 'play') return;
  hideHint();
  const last = queue.length ? queue[queue.length - 1] : dir;
  if (d === last || d === (last + 2) % 4) return;
  if (queue.length < 3) queue.push(d);
}
const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
addEventListener('keydown', (e) => {
  if (e.code in KEYS && state === 'play') { e.preventDefault(); pushDir(KEYS[e.code]); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); }
  if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) setFps(!fpsOn);
});
let swX = 0, swY = 0, swOn = false;
stageEl.addEventListener('pointerdown', (e) => { swOn = true; swX = e.clientX; swY = e.clientY; initAudio(); });
stageEl.addEventListener('pointermove', (e) => {
  if (!swOn) return;
  const dx = e.clientX - swX, dy = e.clientY - swY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  pushDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  swX = e.clientX; swY = e.clientY;
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => stageEl.addEventListener(t, () => { swOn = false; }));

/* =========================================================================
   ARAYÜZ
   ========================================================================= */
function $(id) { return document.getElementById(id); }
let current = 'scrHome', kbMode = false;
addEventListener('keydown', () => { kbMode = true; }, true);
addEventListener('pointerdown', () => { kbMode = false; }, true);
function show(id) {
  current = id;
  for (const o of document.querySelectorAll('.overlay')) o.classList.toggle('show', o.id === id);
  $('hud').classList.toggle('off', mode === 'demo');
  const b = id && kbMode && $(id).querySelector('.btn'); if (b) setTimeout(() => b.focus({ preventScroll: true }), 30);
}
let lastScore = -1;
function hudScore() { if (score !== lastScore) { $('hudScore').textContent = score; lastScore = score; } }
function hudLevel() { $('hudLevel').textContent = mode === 'endless' ? 'Serbest akış' : `Bölüm ${levelIdx + 1}: ${cfg.name}`; }
function hudBar() {
  const fill = $('hudFill'), lab = $('hudBarLabel');
  if (mode === 'endless') { const tier = 1 + Math.floor(eaten / 5); fill.classList.remove('open'); fill.style.transform = `scaleX(${(eaten % 5) / 5})`; lab.textContent = `Hız ${tier}`; return; }
  if (exitOpen) { fill.classList.add('open'); fill.style.transform = 'scaleX(1)'; lab.textContent = 'Ostium açık'; return; }
  const r = Math.max(0, 1 - eaten / target);
  fill.classList.remove('open'); fill.style.transform = `scaleX(${r})`; lab.textContent = `Tıkanıklık %${Math.round(r * 100)}`;
}
function updateChips() {
  const set = (id, until) => {
    const el = $(id), left = until - gameTime, on = left > 0 && mode !== 'demo';
    el.classList.toggle('on', on); if (on) el.querySelector('b').style.transform = `scaleX(${left / 6000})`;
  };
  set('chipSerum', slowUntil); set('chipBreeze', breezeUntil);
  const vOn = !!cfg.virus && mode !== 'demo';
  $('chipVirus').classList.toggle('on', vOn); $('chipCarry').classList.toggle('on', vOn && carriedAt.length > 0);
  if (vOn) { $('chipVirusN').textContent = viruses.length; $('chipCarryN').textContent = carriedAt.length; }
}
function setMute() { $('muteWave').style.display = prog.muted ? 'none' : ''; $('btnMute').setAttribute('aria-label', prog.muted ? 'Sesi aç' : 'Sesi kapat'); }
function hideHint() { if ($('hint').classList.contains('on')) { $('hint').classList.remove('on'); prog.seenTut = true; save(); } }

function homeStats() {
  $('hsBadgesTotal').textContent = BADGES.length;
  $('hsStars').textContent = totalStars(); $('hsBadges').textContent = Object.keys(prog.badges).length; $('hsBest').textContent = Math.max(prog.best, prog.endlessBest);
  $('btnAdventure').textContent = prog.done.some(Boolean) ? 'Maceraya devam et' : 'Maceraya başla';
}
function goHome() { mode = 'demo'; setupBoard(DEMO); state = 'demo'; homeStats(); show('scrHome'); }

function starsHTML(m) { return [0, 1, 2].map(i => `<span class="${m >> i & 1 ? 'on' : ''}">★</span>`).join(''); }
function openMap() {
  const X = [30, 70, 30, 70, 30, 70, 30, 70], gap = 96, top = 40, H = top + gap * (LEVELS.length - 1) + 70;
  const next = prog.done.findIndex(d => !d);
  let svg = `<svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="`;
  LEVELS.forEach((_, i) => { const y = top + i * gap; svg += (i ? `C ${X[i - 1]} ${y - gap / 2}, ${X[i]} ${y - gap / 2}, ` : 'M ') + `${X[i]} ${y} `; });
  svg += `" fill="none" stroke="#F1D9E1" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 12" vector-effect="non-scaling-stroke"/></svg>`;
  const nodes = LEVELS.map((L, i) => {
    const lock = !unlocked(i), done = prog.done[i];
    return `<button class="node ${lock ? 'lock' : done ? 'done' : ''} ${i === next ? 'next' : ''}" style="left:${X[i]}%;top:${top + i * gap}px" data-lv="${i}" ${lock ? 'aria-disabled="true"' : ''} aria-label="Bölüm ${i + 1}: ${L.name}${lock ? ', kilitli' : ''}">
      <span class="disc">${lock ? '🔒' : i + 1}</span><span class="nm">${L.name}</span><span class="stars">${starsHTML(prog.mask[i])}</span></button>`;
  }).join('');
  $('map').style.height = H + 'px'; $('map').innerHTML = svg + nodes;
  $('map').querySelectorAll('.node').forEach(n => n.onclick = () => { const i = +n.dataset.lv; if (unlocked(i)) openIntro(i); });
  show('scrMap');
  setTimeout(() => { const n = $('map').querySelector('.next') || $('map').querySelector('.node'); n && n.scrollIntoView({ block: 'center' }); }, 40);
}
function legendFor(c) {
  const k = ['mucus'];
  if (c.gold) k.push('gold'); if (c.serum) k.push('serum'); if (c.breeze) k.push('breeze');
  if (c.obs.some(r => !((r.w === 1 || r.h === 1) && r.w * r.h > 2))) k.push('polyp');
  if (c.obs.some(r => (r.w === 1 || r.h === 1) && r.w * r.h > 2)) k.push('septum');
  if (c.virus) k.push('virus', 'infected');
  if (c.movers) k.push('plug'); if (c.portals) k.push('portal'); if (c.harden) k.push('crust');
  return k.map(t => `<div><img alt="" src="${iconURL[t]}"><span><b>${ITEM_INFO[t][0]}</b><span>${ITEM_INFO[t][1]}</span></span></div>`).join('');
}
let introBack = 'map';
function openIntro(i) {
  mode = 'adventure'; levelIdx = i; score = 0; lastScore = -1; gameSneezes = 0;
  setupBoard(LEVELS[i]); state = 'intro'; introBack = 'map';
  const L = LEVELS[i];
  $('inKicker').textContent = `Bölüm ${i + 1} / ${LEVELS.length}`;
  $('tIntro').textContent = L.name;
  $('inDesc').textContent = L.desc + (i === 0 ? ' Masaüstünde ok tuşları ya da WASD kullanabilirsin.' : '');
  $('inLegend').innerHTML = legendFor(L);
  $('inGoalsWrap').style.display = '';
  const m = prog.mask[i];
  $('inGoals').innerHTML = [['Bölümü tamamla', m & 1], [GOAL_TEXT[L.obj[0][0]](L.obj[0][1]), m & 2], [GOAL_TEXT[L.obj[1][0]](L.obj[1][1]), m & 4]]
    .map(([t, g]) => `<li><span class="st ${g ? 'on' : ''}">★</span>${t}</li>`).join('');
  hudLevel(); hudScore(); hudBar(); show('scrIntro');
}
function openEndless() {
  mode = 'endless'; levelIdx = 0; score = 0; lastScore = -1; gameSneezes = 0;
  setupBoard(ENDLESS); state = 'intro'; introBack = 'home';
  $('inKicker').textContent = `Rekor: ${prog.endlessBest}`;
  $('tIntro').textContent = ENDLESS.name; $('inDesc').textContent = ENDLESS.desc;
  $('inLegend').innerHTML = legendFor(ENDLESS); $('inGoalsWrap').style.display = 'none';
  hudLevel(); hudScore(); hudBar(); show('scrIntro');
}
function begin() {
  initAudio(); show(null); state = 'play'; levelStart = gameTime;
  if (mode === 'adventure' && levelIdx === 0 && !prog.seenTut) $('hint').classList.add('on');
  track('level_start', { mode, level: levelIdx + 1 });
}
function retry() { if (mode === 'endless') { openEndless(); begin(); } else { openIntro(levelIdx); begin(); } track('replay', { mode, level: levelIdx + 1 }); }
function togglePause(force) {
  if (state === 'play' || state === 'exiting') { pausedFrom = state; state = 'paused'; show('scrPause'); }
  else if (state === 'paused' && force !== true) { state = pausedFrom; show(null); }
}

let tab = 'skins';
function openCollect(t) {
  if (t) tab = t;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  const ts = totalStars(), body = $('collectBody');
  if (tab === 'skins') {
    body.innerHTML = `<p>Yıldız topladıkça yeni görünümler açılır. Şu an <b>${ts}</b> yıldızın var.</p><div class="grid">` + SKINS.map((s, i) => {
      const lock = ts < s.need, sw = `<img class="prev" alt="" src="${skinPreview(i)}">`;
      return `<button class="skin" data-skin="${i}" aria-pressed="${prog.skin === i}" ${lock ? 'disabled' : ''}>${sw}<b>${s.name}</b><span>${lock ? `${s.need} yıldızda açılır` : prog.skin === i ? 'Seçili' : 'Seçmek için dokun'}</span></button>`;
    }).join('') + '</div>';
    body.querySelectorAll('.skin').forEach(b => b.onclick = () => { prog.skin = +b.dataset.skin; save(); applySkin(); openCollect(); track('skin', { id: prog.skin }); });
  } else if (tab === 'badges') {
    body.innerHTML = '<div class="grid">' + BADGES.map(([id, em, nm, ds]) => `<div class="badge ${prog.badges[id] ? '' : 'lock'}"><span class="em">${em}</span><b>${nm}</b><span>${ds}</span></div>`).join('') + '</div>';
  } else {
    body.innerHTML = '<div class="facts">' + FACTS.map(([em, tx], i) => prog.facts[i]
      ? `<div class="fact"><div class="em">${em}</div><div><strong>${LEVELS[i].name}</strong><p>${tx}</p></div></div>`
      : `<div class="fact lock"><div class="em">🔒</div><div><strong>${LEVELS[i].name}</strong><p>Bu bölümü bitirince açılır.</p></div></div>`).join('') + '</div>';
  }
  show('scrCollect');
}
// koleksiyon kartı için başın küçük resmi (oyundaki dokulardan)
const previewCache = {};
function skinPreview(i) {
  if (previewCache[i]) return previewCache[i];
  const s = SKINS[i], [c, x] = cnv(), hex = v => '#' + v.toString(16).padStart(6, '0');
  const tinted = (src, fill) => { const [t, tx] = cnv(); tx.drawImage(src, 0, 0); tx.globalCompositeOperation = 'multiply'; tx.fillStyle = typeof fill === 'function' ? fill(tx) : fill; tx.fillRect(0, 0, TS, TS); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(src, 0, 0); return t; };
  const mid = (src, k) => x.drawImage(src, TS * (1 - k) / 2, TS * (1 - k) / 2, TS * k, TS * k);
  if (s.classic) { mid(tinted(C.ball, hex(s.head)), .9); mid(C.face, .9); }
  else {
    let pf = hex(s.petal);
    if (s.petal === -1) pf = g => { const lg = g.createLinearGradient(0, 0, TS, TS); ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'].forEach((col, k) => lg.addColorStop(k / 4, col)); return lg; };
    x.save(); x.translate(TS * .4, TS * .4); x.rotate(-.75); x.scale(1.25, 1.25); x.translate(-TS / 2, -TS / 2);
    x.drawImage(tinted(C.petals, pf), 0, 0); x.drawImage(tinted(C.eye, hex(s.eye)), 0, 0); x.restore();
    const d = TS * .46, o = TS * .4 - d / 2;
    x.drawImage(tinted(C.ball, hex(s.disc)), o, o, d, d); x.drawImage(C.face2, o, o, d, d);
  }
  return previewCache[i] = c.toDataURL();
}
function applySkin() {
  skin = SKINS[prog.skin] || SKINS[0]; skinBody = skin.classic ? rgb(skin.body) : WHITE;
  headFace.texture = skin.classic ? T.face : T.face2;
}

$('btnAdventure').onclick = () => { initAudio(); openMap(); };
$('btnEndless').onclick = () => { initAudio(); openEndless(); };
$('btnCollect').onclick = () => openCollect();
document.querySelectorAll('.tab').forEach(b => b.onclick = () => openCollect(b.dataset.tab));
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => {
  if (current === 'scrIntro' && introBack === 'map') openMap(); else goHome();
});
$('btnStart').onclick = begin;
$('btnNext').onclick = () => { if (levelIdx < LEVELS.length - 1) { openIntro(levelIdx + 1); } else goHomeMap(); };
$('btnReplay').onclick = retry;
$('btnMapFromResult').onclick = goHomeMap;
$('btnRetry').onclick = retry;
$('btnOverBack').onclick = () => mode === 'endless' ? goHome() : goHomeMap();
$('btnResume').onclick = () => togglePause();
$('btnRestart').onclick = retry;
$('btnQuit').onclick = goHome;
$('btnPause').onclick = () => togglePause();
$('btnMute').onclick = () => { prog.muted = !prog.muted; save(); setMute(); initAudio(); };
$('ctaLink').onclick = () => track('cta_click', { mode, score, level: levelIdx + 1 });
function goHomeMap() { mode = 'demo'; setupBoard(DEMO); state = 'demo'; openMap(); }

document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });
addEventListener('blur', () => togglePause(true));

if (DEBUG) window.__ns = { step, get st() { return { state, mode, len, eaten, target, exitOpen, score, levelIdx }; }, items: () => items.map(i => [i.type, i.x, i.y]),
  head: () => [bx[0], by[0]], body: () => Array.from({ length: len }, (_, i) => [bx[i], by[i]]), obs: (x, y) => obstacle[y * COLS + x] || (isPortal(x, y) ? 0 : 0),
  mover: (x, y) => !!moverAt(x, y), exit: () => [exitX, exitY], setDir: d => { dir = d; queue.length = 0; }, dir: () => dir, prog, botDir, viruses: () => viruses.map(v => [v.x, v.y]), carried: () => carriedAt.length, addVirus, lv: () => lv };

setMute(); applySkin(); layout(); goHome();
})();
