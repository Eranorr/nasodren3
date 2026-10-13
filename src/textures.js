/* Bütün dokular açılışta bir kez, 2D canvas ile çizilir; PNG yok. */
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
C.mucus = [11, 23, 37].map(sd => { const [c, x] = cnv(), rnd = seeded(sd);
  blob(x, TS / 2, TS * .54, TS * .4, 4, .08, rnd);
  x.fillStyle = rg(x, TS * .4, TS * .38, 4, TS / 2, TS / 2, TS * .5, [[0, '#F0F28C'], [.55, '#C3CF3E'], [1, '#8F9A1C']]); x.fill();
  x.lineWidth = 10; x.strokeStyle = '#5E6810'; x.stroke();
  eyes(x, TS / 2, TS * .5, TS * .13, TS * .085, 'grumpy');
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .03; x.lineCap = 'round'; x.beginPath(); x.arc(TS / 2, TS * .75, TS * .07, Math.PI + .5, -.5); x.stroke();
  return c; });
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
  x.lineWidth = 7; x.strokeStyle = '#8A2A12'; x.stroke();
  eyes(x, cx, cy - r * .05, r * .38, r * .24, 'grumpy');
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .03; x.beginPath(); x.arc(cx, cy + r * .6, r * .2, Math.PI + .5, -.5); x.stroke();
  return c; })();
// virüs yapışmış mukus: hafif mor ton + köşede küçük virüs
C.infected = C.mucus.map(m => { const [c, x] = cnv();
  x.drawImage(m, 0, 0);
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(130,60,170,.28)'; x.fillRect(0, 0, TS, TS);
  x.globalCompositeOperation = 'source-over'; x.drawImage(C.virus, TS * .5, -TS * .02, TS * .52, TS * .52);
  return c; });

/* Sıklamen yılan: baş = sarkık sıklamen çiçeği; ağzı (yüz) önde, taç yaprakları geriye kıvrılıp alev gibi savrulur.
   Baş dokularında ileri = dokunun üstü; çiçeğin merkezi (HEAD_Y) üst tarafta, yapraklar arkaya uzanır. Gövde = sap + yaprak + tomurcuk, kuyruk = yumru */
export const HEAD_Y = 34;
// açı, boy, en, uç kıvrımı (eksi: uç arkaya, gövde eksenine doğru kıvrılır)
const PETALS = [[-1.1, 62, 17, 14], [-.55, 72, 17, 7], [0, 78, 16, 0], [.55, 72, 17, -7], [1.1, 62, 17, -14]];
function petalPath(x, w, y0, y1, b) {                 // yerel +y yönünde, ortası dolgun, ucu sivri; b: ucun yana kıvrılması
  const L = y1 - y0;
  x.beginPath(); x.moveTo(-w * .25, y0);
  x.bezierCurveTo(w * 1.15, y0 + L * .1, w * 1.05 + b * .45, y0 + L * .62, b + w * .2, y1 - 3);
  x.quadraticCurveTo(b + w * .05, y1 + 2, b - w * .22, y1 - 4);
  x.bezierCurveTo(-w * 1.0 + b * .45, y0 + L * .66, -w * 1.1, y0 + L * .1, w * .25, y0);
  x.closePath();
}
// gri tonlu: görünüm rengiyle tint edilir; koyu gri kontur tintle taç yaprağın koyu tonuna döner
C.petals = (() => { const [c, x] = cnv();
  for (const k of [0, 4, 1, 3, 2]) {
    const [a, l, w, b] = PETALS[k], y0 = 10, y1 = y0 + l;
    x.save(); x.translate(TS / 2, HEAD_Y); x.rotate(-a);
    petalPath(x, w, y0, y1, b);
    const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#c4c4c4'); g.addColorStop(.35, '#f0f0f0'); g.addColorStop(1, '#ffffff');
    x.fillStyle = g; x.fill();
    // burgu: yaprağın bir yarısı gölgede, gölge ucuna doğru öbür yana geçer
    x.save(); x.clip();
    x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(w * .55, y0 + l * .35, -w * .55 + b * .3, y0 + l * .65, b, y1 + 4);
    x.lineTo(b - w * 2, y1 + 4); x.lineTo(-w * 2, y0); x.closePath();
    x.fillStyle = 'rgba(0,0,0,.14)'; x.fill();
    x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(w * .4, y0 + l * .3); x.quadraticCurveTo(w * .45 + b * .35, y0 + l * .6, b + w * .15, y0 + l * .86); x.stroke();
    x.restore();
    petalPath(x, w, y0, y1, b); x.lineWidth = 3.5; x.lineJoin = 'round'; x.strokeStyle = '#646464'; x.stroke();
    x.restore();
  }
  return c; })();
// sıklamene özgü koyu "göz": taç yaprak diplerinde alev biçimli leke, ince damarlarla yaprağa yayılır
C.eye = (() => { const [c, x] = cnv();
  for (const [a, l, w, b] of PETALS) {
    x.save(); x.translate(TS / 2, HEAD_Y); x.rotate(-a);
    const e = 12 + l * .42, g = x.createLinearGradient(0, 12, 0, e); g.addColorStop(0, '#fff'); g.addColorStop(.5, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(-w * .8, 12);
    x.quadraticCurveTo(-w * .75, 12 + l * .25, b * .15, e); x.quadraticCurveTo(w * .75, 12 + l * .25, w * .8, 12); x.closePath(); x.fill();
    const g2 = x.createLinearGradient(0, 16, 0, 12 + l * .6); g2.addColorStop(0, 'rgba(255,255,255,.9)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
    x.strokeStyle = g2; x.lineWidth = 2; x.lineCap = 'round';
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * w * .35, 18); x.quadraticCurveTo(s * w * .45, 12 + l * .35, s * w * .3 + b * .25, 12 + l * .6); x.stroke(); }
    x.restore();
  }
  x.fillStyle = '#fff'; x.beginPath(); x.arc(TS / 2, HEAD_Y, 24, 0, 6.28); x.fill();
  return c; })();
// başçık (anter) konisi: sarkık çiçeğin ağzından öne çıkan sarı uç; tint edilmez, başla birlikte döner
C.anther = (() => { const [c, x] = cnv(), cx = TS / 2, cy = HEAD_Y - 21;
  x.lineJoin = 'round';
  for (const [dx, h] of [[-6, 10], [6, 10], [0, 13]]) {
    x.beginPath(); x.moveTo(cx + dx - 4, cy + 6); x.quadraticCurveTo(cx + dx - 3, cy + 6 - h, cx + dx, cy + 4 - h); x.quadraticCurveTo(cx + dx + 3, cy + 6 - h, cx + dx + 4, cy + 6); x.closePath();
    x.fillStyle = '#F8C72E'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#B07A0C'; x.stroke();
  }
  return c; })();
C.face2 = (() => { const [c, x] = cnv();
  eyes(x, TS / 2, TS * .45, TS * .15, TS * .11, 'happy');
  x.fillStyle = 'rgba(255,150,190,.6)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(TS / 2 + s * TS * .27, TS * .6, TS * .07, TS * .045, 0, 0, 6.28); x.fill(); }
  x.strokeStyle = '#2B0F22'; x.lineWidth = TS * .035; x.lineCap = 'round'; x.beginPath(); x.arc(TS / 2, TS * .58, TS * .09, .25, Math.PI - .25); x.stroke();
  return c; })();
// kalp biçimli, gümüş desenli sıklamen yaprağı; sapı alt ortada
C.leaf = (() => { const [c, x] = cnv();
  x.lineCap = 'round';
  x.strokeStyle = '#1F5E33'; x.lineWidth = 10; x.beginPath(); x.moveTo(64, 98); x.lineTo(64, 125); x.stroke();
  x.strokeStyle = '#4BA85E'; x.lineWidth = 5; x.beginPath(); x.moveTo(64, 98); x.lineTo(64, 123); x.stroke();
  const heart = (s) => { x.save(); x.translate(64, 64); x.scale(s, s); x.translate(-64, -64);
    x.beginPath(); x.moveTo(64, 98); x.bezierCurveTo(42, 116, 8, 100, 12, 70); x.bezierCurveTo(16, 42, 46, 26, 64, 7);
    x.bezierCurveTo(82, 26, 112, 42, 116, 70); x.bezierCurveTo(120, 100, 86, 116, 64, 98); x.closePath(); x.restore(); };
  heart(1); const g = x.createLinearGradient(0, 8, 0, 110); g.addColorStop(0, '#5DBB6C'); g.addColorStop(1, '#2F8045'); x.fillStyle = g; x.fill();
  x.save(); heart(1); x.clip();
  x.fillStyle = 'rgba(10,60,30,.22)'; x.fillRect(64, 0, 64, TS);                                  // orta damarın bir yanı gölgede
  // sıklamen yaprağının gümüş, çam ağacı biçimli deseni
  x.beginPath(); x.moveTo(64, 30);
  for (const [dx, y] of [[16, 44], [10, 46], [28, 62], [20, 64], [36, 82], [16, 84], [22, 94]]) x.lineTo(64 + dx, y);
  x.lineTo(64, 90);
  for (const [dx, y] of [[-22, 94], [-16, 84], [-36, 82], [-20, 64], [-28, 62], [-10, 46], [-16, 44]]) x.lineTo(64 + dx, y);
  x.closePath(); x.lineJoin = 'round'; x.lineWidth = 7; x.strokeStyle = 'rgba(220,242,226,.6)'; x.stroke();
  x.strokeStyle = 'rgba(20,80,40,.55)'; x.lineWidth = 2.5;                                         // damarlar
  x.beginPath(); x.moveTo(64, 98); x.lineTo(64, 16); x.stroke();
  for (const [y, dx, dy] of [[78, 40, -6], [58, 34, -12], [40, 20, -12]]) for (const s of [-1, 1]) { x.beginPath(); x.moveTo(64, y); x.quadraticCurveTo(64 + s * dx * .5, y + dy * .2, 64 + s * dx, y + dy); x.stroke(); }
  x.restore();
  heart(1); x.lineWidth = 5; x.lineJoin = 'round'; x.strokeStyle = '#1F5E33'; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.ellipse(40, 58, 9, 5, -.8, 0, 6.28); x.fill();
  return c; })();
// tomurcuk: alt ortadan çıkıp kıvrılan sap (budStem, tint edilmez) ve ucunda sarkan, burgulu kapalı çiçek (bud, taç yaprak rengiyle tint edilir)
C.budStem = (() => { const [c, x] = cnv();
  x.lineCap = 'round';
  const stem = () => { x.beginPath(); x.moveTo(64, 125); x.bezierCurveTo(60, 80, 70, 34, 92, 30); x.quadraticCurveTo(104, 30, 102, 46); };
  stem(); x.strokeStyle = '#1F5E33'; x.lineWidth = 10; x.stroke();
  stem(); x.strokeStyle = '#4BA85E'; x.lineWidth = 5; x.stroke();
  // çanak yapraklar
  x.lineJoin = 'round';
  for (const s of [-1, 1]) {
    x.beginPath(); x.moveTo(102, 44); x.quadraticCurveTo(102 + s * 13, 46, 102 + s * 9, 58); x.quadraticCurveTo(102 + s * 3, 52, 102, 44);
    x.fillStyle = '#4BA85E'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#1F5E33'; x.stroke();
  }
  return c; })();
C.bud = (() => { const [c, x] = cnv();
  x.beginPath(); x.moveTo(102, 50); x.bezierCurveTo(118, 56, 116, 80, 103, 96); x.bezierCurveTo(90, 80, 88, 56, 102, 50); x.closePath();
  const g = x.createLinearGradient(0, 50, 0, 96); g.addColorStop(0, '#bdbdbd'); g.addColorStop(.5, '#f0f0f0'); g.addColorStop(1, '#ffffff'); x.fillStyle = g; x.fill();
  x.save(); x.clip(); x.strokeStyle = 'rgba(0,0,0,.16)'; x.lineWidth = 3;
  for (const o of [-6, 4]) { x.beginPath(); x.moveTo(102 + o, 52); x.quadraticCurveTo(110 + o, 72, 100 + o * .4, 96); x.stroke(); }
  x.restore();
  x.lineWidth = 3; x.lineJoin = 'round'; x.strokeStyle = '#646464'; x.stroke();
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
