/* Dokular açılışta bir kez, 2D canvas ile çizilir; yalnızca sıklamen yılan çizimden gelir (src/assets/yilan, main.js). */
export const TS = 128;
export function cnv() { const c = document.createElement('canvas'); c.width = c.height = TS; return [c, c.getContext('2d')]; }
export function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function blob(x, cx, cy, r, bumps, amp, rnd) {
  x.beginPath(); const n = 56, ph = rnd() * 6.28;
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2, rr = r * (1 + amp * Math.sin(a * bumps + ph) + amp * .5 * Math.sin(a * (bumps + 2) + ph * 2));
    const X = cx + Math.cos(a) * rr, Y = cy + Math.sin(a) * rr; i ? x.lineTo(X, Y) : x.moveTo(X, Y);
  }
  x.closePath();
}
// aynı şekli dolgu, kırpma ve kontur için tekrar kullanmak üzere Path2D olarak
function blobPath(...a) { const p = new Path2D(); blob({ beginPath() {}, moveTo: (X, Y) => p.moveTo(X, Y), lineTo: (X, Y) => p.lineTo(X, Y), closePath: () => p.closePath() }, ...a); return p; }
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
// oyundaki öğe dokusu: öğenin arkasına yumuşak bir hale (toplanabilirlerde açık, virüste koyu) eklenir; öğe dokunun
// 1/HALO'su kadar yer kaplar. Küçük ekranda ve koyu sinüs zemininde öğeler seçilsin diye. DOM ikonları halesiz dokuyu kullanır.
export const HALO = 1.6;
export function halo(src, rgb, a) {
  const S = Math.round(TS * HALO), c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = rg(x, S / 2, S / 2, 0, S / 2, S / 2, S / 2, [[0, `rgba(${rgb},${a})`], [.55, `rgba(${rgb},${a * .8})`], [1, `rgba(${rgb},0)`]]);
  x.fillRect(0, 0, S, S); x.drawImage(src, (S - TS) / 2, (S - TS) / 2);
  return c;
}
export const C = {};
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
// virüs (toplanan; src/assets/bacteria.png'den oyunun diliyle uyarlandı): yeşilin koyu tonunda tek kontur, yumuşak geçiş,
// sol üstte parlama; yumrulu kısa kollar, açık benekler, yeşil irisli tek iri göz ve dişli geniş sırıtış. (Kodda tür adı 'mucus'.)
// mood: 'grin' tahtada, 'scared' akış yaklaşınca, 'dizzy' toplanıp yıkanırken
const V_OUT = '#3B861C', V_MID = '#9BD443', V_INK = '#2B0F22';
function virusTex(sd, mood) { const [c, x] = cnv(), rnd = seeded(sd), cx = TS / 2, cy = TS * .52, r = TS * .315, off = rnd() * 6.28, KR = TS * .054;
  const arms = [...Array(8)].map((_, i) => { const a = i / 8 * Math.PI * 2 + off + (rnd() - .5) * .25, b = (rnd() - .5) * .45;
    return [cx + Math.cos(a) * r * .8, cy + Math.sin(a) * r * .8, cx + Math.cos(a + b) * r * 1.16, cy + Math.sin(a + b) * r * 1.16, cx + Math.cos(a + b * .5) * r * 1.36, cy + Math.sin(a + b * .5) * r * 1.36]; });
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (const [w, col] of [[12, V_OUT], [5, V_MID]]) for (const [x0, y0, qx, qy, x1, y1] of arms) {
    x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(qx, qy, x1, y1); x.stroke();
  }
  for (const [, , , , x1, y1] of arms) {
    x.beginPath(); x.arc(x1, y1, KR, 0, 6.28);
    x.fillStyle = rg(x, x1 - KR * .4, y1 - KR * .4, 1, x1, y1, KR, [[0, '#F1FDBE'], [1, V_MID]]); x.fill();
    x.lineWidth = 4; x.strokeStyle = V_OUT; x.stroke();
  }
  const body = blobPath(cx, cy, r, 6, .03, rnd);
  x.fillStyle = rg(x, cx - r * .4, cy - r * .45, 4, cx, cy, r * 1.05, [[0, '#F1FDBE'], [.55, V_MID], [1, '#6DB02A']]); x.fill(body);
  x.save(); x.clip(body);
  for (const [px, py, pr] of [[-.74, .16, .15], [-.58, -.42, .08], [.72, .02, .12], [.62, -.5, .07], [-.3, .78, .1], [.4, .74, .09], [.82, .42, .06]]) {   // benekler
    x.fillStyle = 'rgba(64,135,26,.42)'; x.beginPath(); x.arc(cx + px * r, cy + py * r, pr * r, 0, 6.28); x.fill();
    x.fillStyle = 'rgba(240,255,200,.55)'; x.beginPath(); x.arc(cx + px * r - pr * r * .3, cy + py * r - pr * r * .3, pr * r * .35, 0, 6.28); x.fill();
  }
  x.restore();
  x.lineWidth = 8; x.strokeStyle = V_OUT; x.stroke(body);
  x.fillStyle = 'rgba(255,255,255,.8)'; x.beginPath(); x.ellipse(cx - r * .56, cy - r * .58, r * .22, r * .12, -.6, 0, 6.28); x.fill();
  // tek iri göz
  const ey = cy - r * .17, er = TS * (mood === 'scared' ? .13 : .118);
  x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx, ey, er, er * 1.06, 0, 0, 6.28); x.fill();
  x.lineWidth = 3.5; x.strokeStyle = V_OUT; x.stroke();
  if (mood === 'dizzy') {   // sarmal göz
    x.strokeStyle = V_INK; x.lineWidth = TS * .022; x.beginPath();
    for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 4.2, rr = er * .08 + er * .62 * i / 40; i ? x.lineTo(cx + Math.cos(a) * rr, ey + Math.sin(a) * rr) : x.moveTo(cx, ey); }
    x.stroke();
  } else {
    const k = mood === 'scared' ? .55 : 1, ix = cx + er * .1 * k, iy = ey + er * .1 * k;
    x.fillStyle = rg(x, ix - er * .2, iy - er * .2, 1, ix, iy, er * .64 * k, [[0, '#B6EE6A'], [1, '#3F9C22']]); x.beginPath(); x.arc(ix, iy, er * .64 * k, 0, 6.28); x.fill();
    x.fillStyle = V_INK; x.beginPath(); x.arc(ix, iy, er * .34 * k, 0, 6.28); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(ix - er * .2 * k, iy - er * .22 * k, er * .16, 0, 6.28); x.fill();
  }
  // ağız
  const my = cy + r * .36;
  if (mood === 'grin') {
    const mw = TS * .15, mouth = new Path2D();
    mouth.moveTo(cx - mw, my); mouth.quadraticCurveTo(cx, my + TS * .025, cx + mw, my); mouth.quadraticCurveTo(cx, my + TS * .19, cx - mw, my); mouth.closePath();
    x.fillStyle = '#6B1A3A'; x.fill(mouth);
    x.save(); x.clip(mouth);
    x.fillStyle = '#F27A9B'; x.beginPath(); x.ellipse(cx, my + TS * .135, mw * .55, TS * .05, 0, 0, 6.28); x.fill();
    x.fillStyle = '#fff'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(cx + s * mw * .66, my); x.lineTo(cx + s * mw * .3, my + 2); x.lineTo(cx + s * mw * .47, my + TS * .06); x.closePath(); x.fill(); }
    x.restore();
    x.lineWidth = TS * .024; x.strokeStyle = V_INK; x.stroke(mouth);
  } else if (mood === 'scared') {   // küçük titrek "o" ağız ve ter damlası
    x.fillStyle = '#6B1A3A'; x.beginPath(); x.ellipse(cx, my + TS * .04, TS * .045, TS * .055, 0, 0, 6.28); x.fill();
    x.lineWidth = TS * .022; x.strokeStyle = V_INK; x.stroke();
    const sx = cx + r * .78, sy = cy - r * .62;
    x.beginPath(); x.moveTo(sx, sy - TS * .06); x.quadraticCurveTo(sx + TS * .045, sy + TS * .01, sx, sy + TS * .03); x.quadraticCurveTo(sx - TS * .045, sy + TS * .01, sx, sy - TS * .06);
    x.fillStyle = '#BFE8FF'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#2B73B0'; x.stroke();
  } else {   // sersem dalgalı ağız
    x.strokeStyle = V_INK; x.lineWidth = TS * .024; x.beginPath();
    for (let i = 0; i <= 20; i++) { const X = cx - TS * .1 + i / 20 * TS * .2, Y = my + TS * .04 + Math.sin(i / 20 * Math.PI * 3) * TS * .018; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }
    x.stroke();
  }
  return c;
}
C.mucus = [11, 23, 37].map(sd => virusTex(sd, 'grin'));
C.mucusScared = [11, 23, 37].map(sd => virusTex(sd, 'scared'));
C.mucusDizzy = [11, 23, 37].map(sd => virusTex(sd, 'dizzy'));
// temizlik pırıltısı: dört köşeli yıldızcık
C.sparkle = (() => { const [c, x] = cnv(), m = TS / 2;
  x.fillStyle = rg(x, m, m, 0, m, m, m, [[0, 'rgba(255,255,255,.7)'], [.35, 'rgba(255,255,230,.18)'], [1, 'rgba(255,255,230,0)']]); x.fillRect(0, 0, TS, TS);
  x.beginPath(); x.moveTo(m, 6); x.quadraticCurveTo(m + 7, m - 7, TS - 6, m); x.quadraticCurveTo(m + 7, m + 7, m, TS - 6); x.quadraticCurveTo(m - 7, m + 7, 6, m); x.quadraticCurveTo(m - 7, m - 7, m, 6);
  x.fillStyle = '#fff'; x.fill();
  return c; })();
C.gold = (() => { const [c, x] = cnv();
  x.fillStyle = rg(x, TS / 2, TS / 2, 0, TS / 2, TS / 2, TS / 2, [[0, 'rgba(255,220,120,.55)'], [1, 'rgba(255,220,120,0)']]); x.fillRect(0, 0, TS, TS);
  flower(x, TS / 2, TS / 2, TS * .46, '#A8650A');   // kontur
  flower(x, TS / 2, TS / 2, TS * .4, rg(x, TS / 2, TS / 2, 2, TS / 2, TS / 2, TS * .45, [[0, '#FFF3C4'], [.6, '#F8C537'], [1, '#D8920F']]), '#D6227F');
  return c; })();
C.serum = (() => { const [c, x] = cnv();
  x.beginPath(); x.moveTo(TS / 2, TS * .08); x.bezierCurveTo(TS * .8, TS * .4, TS * .84, TS * .62, TS * .82, TS * .66);
  x.arc(TS / 2, TS * .64, TS * .32, .1, Math.PI - .1); x.bezierCurveTo(TS * .16, TS * .62, TS * .2, TS * .4, TS / 2, TS * .08);
  const g = x.createLinearGradient(0, TS * .08, 0, TS * .96); g.addColorStop(0, '#DDF2FF'); g.addColorStop(1, '#5AAEEB'); x.fillStyle = g; x.fill();
  x.lineWidth = 9; x.strokeStyle = '#2B73B0'; x.stroke();
  eyes(x, TS / 2, TS * .62, TS * .12, TS * .07, 'happy');
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .03; x.lineCap = 'round'; x.beginPath(); x.arc(TS / 2, TS * .72, TS * .06, .3, Math.PI - .3); x.stroke();
  return c; })();
C.breeze = (() => { const [c, x] = cnv();
  x.save(); x.translate(TS / 2, TS / 2); x.rotate(-.7);
  x.beginPath(); x.moveTo(0, -TS * .42); x.bezierCurveTo(TS * .36, -TS * .2, TS * .3, TS * .3, 0, TS * .42); x.bezierCurveTo(-TS * .3, TS * .3, -TS * .36, -TS * .2, 0, -TS * .42);
  const g = x.createLinearGradient(-TS * .3, 0, TS * .3, 0); g.addColorStop(0, '#7BE3A8'); g.addColorStop(1, '#2FAE6E'); x.fillStyle = g; x.fill();
  x.lineWidth = 9; x.strokeStyle = '#17703F'; x.stroke();
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
C.petal = (() => { const [c, x] = cnv();
  x.translate(TS / 2, TS / 2); x.beginPath(); x.moveTo(0, TS * .42); x.bezierCurveTo(TS * .34, TS * .1, TS * .22, -TS * .38, 0, -TS * .44); x.bezierCurveTo(-TS * .22, -TS * .38, -TS * .34, TS * .1, 0, TS * .42);
  const g = x.createLinearGradient(0, -TS * .44, 0, TS * .42); g.addColorStop(0, '#F9B7D3'); g.addColorStop(1, '#E6559A'); x.fillStyle = g; x.fill();
  return c; })();
// mukus damlası (tahtada gezinen): sarımsı, yarı saydam, güler yüzlü damla. Virüslere yapışıp onları yakalar. (Kodda tür adı hâlâ 'virus'.)
C.virus = (() => { const [c, x] = cnv(), cx = TS / 2;
  const drop = new Path2D(); drop.moveTo(cx, TS * .1); drop.bezierCurveTo(TS * .66, TS * .3, TS * .86, TS * .5, TS * .86, TS * .64);
  drop.bezierCurveTo(TS * .86, TS * .84, TS * .7, TS * .94, cx, TS * .94); drop.bezierCurveTo(TS * .3, TS * .94, TS * .14, TS * .84, TS * .14, TS * .64);
  drop.bezierCurveTo(TS * .14, TS * .5, TS * .34, TS * .3, cx, TS * .1); drop.closePath();
  x.fillStyle = rg(x, TS * .4, TS * .5, 4, cx, TS * .62, TS * .44, [[0, '#FFF8C8'], [.55, '#F6DA62'], [1, '#D6A824']]); x.fill(drop);
  x.lineWidth = 8; x.strokeStyle = '#94700F'; x.lineJoin = 'round'; x.stroke(drop);
  x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.ellipse(TS * .34, TS * .5, TS * .05, TS * .1, .35, 0, 6.28); x.fill();
  x.beginPath(); x.arc(TS * .37, TS * .67, TS * .025, 0, 6.28); x.fill();
  eyes(x, cx, TS * .63, TS * .12, TS * .075, 'happy');
  x.fillStyle = 'rgba(255,140,120,.5)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * TS * .23, TS * .74, TS * .055, TS * .035, 0, 0, 6.28); x.fill(); }
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .03; x.lineCap = 'round'; x.beginPath(); x.arc(cx, TS * .74, TS * .06, .3, Math.PI - .3); x.stroke();
  return c; })();
// mukusa yakalanmış virüs: virüs, sarımsı yarı saydam bir mukus kabarcığının içinde
C.infected = C.mucus.map((m, i) => { const [c, x] = cnv(), rnd = seeded(51 + i);
  x.drawImage(m, TS * .08, TS * .08, TS * .84, TS * .84);
  const glob = blobPath(TS / 2, TS / 2, TS * .45, 5, .05, rnd);
  x.fillStyle = rg(x, TS * .38, TS * .34, 4, TS / 2, TS / 2, TS * .46, [[0, 'rgba(255,250,210,.25)'], [.7, 'rgba(246,218,98,.42)'], [1, 'rgba(214,168,36,.6)']]); x.fill(glob);
  x.lineWidth = 6; x.strokeStyle = '#94700F'; x.stroke(glob);
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.arc(TS / 2, TS / 2, TS * .36, Math.PI * 1.1, Math.PI * 1.4); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.75)'; for (const [px, py, pr] of [[.72, .3, .03], [.78, .4, .018], [.26, .74, .022]]) { x.beginPath(); x.arc(TS * px, TS * py, TS * pr, 0, 6.28); x.fill(); }
  return c; });

// saponin köpüğü
C.bubble = (() => { const [c, x] = cnv();
  x.beginPath(); x.arc(64, 64, 56, 0, 6.28);
  x.fillStyle = rg(x, 64, 64, 20, 64, 64, 56, [[0, 'rgba(200,236,250,.15)'], [.8, 'rgba(170,224,245,.35)'], [1, 'rgba(255,255,255,.7)']]); x.fill();
  x.lineWidth = 6; x.strokeStyle = 'rgba(110,196,226,.9)'; x.stroke();
  x.strokeStyle = '#fff'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.arc(64, 64, 38, Math.PI * 1.1, Math.PI * 1.45); x.stroke();
  return c; })();
// akışın kuyruğu ayrılınca hücrede kısa süre açan çiçek
C.bloom = (() => { const [c, x] = cnv(); flower(x, 64, 64, 56, '#ffffff', '#F4B81F'); return c; })();
// bağışıklık hücresi (akyuvar): tırtıklı zarlı, içinde loblu çekirdek görünen güler yüzlü hücre; virüslerin çoğalmasını bir süre durdurur
C.immune = (() => { const [c, x] = cnv(), rnd = seeded(23);
  x.fillStyle = rg(x, TS / 2, TS / 2, TS * .3, TS / 2, TS / 2, TS / 2, [[0, 'rgba(180,160,255,.35)'], [1, 'rgba(180,160,255,0)']]); x.fillRect(0, 0, TS, TS);
  blob(x, TS / 2, TS / 2, TS * .45, 9, .045, rnd);
  x.fillStyle = rg(x, TS * .4, TS * .36, 4, TS / 2, TS / 2, TS * .5, [[0, '#FFFFFF'], [.6, '#EDE5FF'], [1, '#C9B6F7']]); x.fill();
  x.lineWidth = 9; x.strokeStyle = '#6346B8'; x.stroke();
  // loblu çekirdek (üç yuvarlak parça) ve tanecikler
  x.fillStyle = 'rgba(130,95,210,.45)';
  for (const [cx, cy, r] of [[TS * .3, TS * .64, TS * .13], [TS * .5, TS * .73, TS * .14], [TS * .7, TS * .64, TS * .13]]) { x.beginPath(); x.arc(cx, cy, r, 0, 6.28); x.fill(); }
  x.fillStyle = 'rgba(140,105,215,.45)';
  for (const [cx, cy] of [[TS * .3, TS * .3], [TS * .72, TS * .34], [TS * .25, TS * .45], [TS * .78, TS * .48]]) { x.beginPath(); x.arc(cx, cy, 3, 0, 6.28); x.fill(); }
  x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.ellipse(TS * .36, TS * .27, 10, 6, -.6, 0, 6.28); x.fill();
  eyes(x, TS / 2, TS * .46, TS * .1, TS * .065, 'happy');
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .026; x.lineCap = 'round'; x.beginPath(); x.arc(TS / 2, TS * .56, TS * .055, .3, Math.PI - .3); x.stroke();
  return c; })();
// şişkin mukoza: komşu hücrelerle üst üste binip kesintisiz, kabarık bir bant oluşturur
C.swell = (() => { const [c, x] = cnv(), rnd = seeded(41);
  blob(x, TS / 2, TS / 2, TS * .47, 6, .05, rnd);
  x.fillStyle = rg(x, TS * .38, TS * .34, 4, TS / 2, TS / 2, TS * .52, [[0, '#F58A9F'], [.55, '#DC5272'], [1, '#B8324F']]); x.fill();
  x.lineWidth = 3; x.strokeStyle = 'rgba(150,30,60,.55)'; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.4)'; x.beginPath(); x.ellipse(TS * .36, TS * .32, 14, 8, -.6, 0, 6.28); x.fill();
  x.fillStyle = 'rgba(140,20,50,.25)'; for (const [px, py] of [[78, 70], [52, 82], [84, 46]]) { x.beginPath(); x.arc(px, py, 5, 0, 6.28); x.fill(); }
  return c; })();
