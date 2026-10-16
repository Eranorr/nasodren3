/* =========================================================================
   ANA MENÜ: İNSAN YÜZÜ VE SİNÜSLER
   Önden bakışta yüz; içinde oyunun bölümleri olan boşluklar röntgen gibi görünür: alında frontal sinüsler, gözlerin
   arasında etmoid hücreler, yanaklarda maksiller sinüsler, ortada burun boşluğu. Sinüsler kanallarla (frontal kanal,
   maksiller ostium) burun boşluğuna açılır; menüdeki akış bu boşluklarda gezinir.
   Bütün ölçüler hücre biriminde (tahta 26×35 hücre, yüzün ekseni x = 13). Çizim ve çarpışma ızgarası aynı şekillerden
   üretilir: merkezi bir boşluğun içinde kalan hücre oynanır.
   ========================================================================= */
import { COLS, ROWS } from './content.js';

const CX = 13;
const mirror = pts => pts.map((v, i) => i % 2 ? v : CX * 2 - v);

// noktalar arasından orta noktalara eğri: köşesiz, pürüzsüz kapalı hat (bölüm zeminindeki çizimle aynı yöntem)
function smooth(o) {
  const n = o.length / 2, p = new Path2D();
  const P = i => [o[(i % n) * 2], o[(i % n) * 2 + 1]], M = i => { const a = P(i), b = P(i + 1); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  p.moveTo(...M(n - 1));
  for (let i = 0; i < n; i++) p.quadraticCurveTo(...P(i), ...M(i));
  p.closePath();
  return p;
}
function rrect(x0, y0, x1, y1, r) { const p = new Path2D(); p.roundRect(x0, y0, x1 - x0, y1 - y0, r); return p; }

const FRONTAL = [12.0, 6.5, 11.7, 2.6, 10.2, 1.3, 7.6, 1.2, 4.9, 2.2, 4.3, 4.0, 5.4, 5.6, 8.4, 6.1];
const MAXILLARY = [1.6, 15.3, 5.8, 14.9, 9.9, 15.0, 10.0, 19.4, 8.6, 21.9, 4.6, 21.8, 1.6, 19.8, 1.1, 17.0];
const ORBIT = [5.4, 11.2, 3.4];   // göz çukuru: duvar (yalnızca çizimde gölge)

// Oynanan boşluklar. Kanallar en az iki hücre geniş: menüdeki akış dönebilsin.
const CAVITIES = [
  rrect(10.9, 7.6, 15.1, 22.0, 1.6),                     // burun boşluğu, burun deliklerine iner
  smooth(FRONTAL), smooth(mirror(FRONTAL)),               // frontal sinüsler (aralarında kemik bölme)
  rrect(10.0, 5.6, 12.0, 8.6, .6), rrect(14.0, 5.6, 16.0, 8.6, .6),   // frontal kanallar: burun boşluğuna iner
  rrect(8.9, 7.9, 11.2, 14.1, .9), rrect(14.8, 7.9, 17.1, 14.1, .9),  // etmoid hücreler (sınır; çizimde petek)
  smooth(MAXILLARY), smooth(mirror(MAXILLARY)),           // maksiller sinüsler
  rrect(9.2, 15.1, 11.6, 16.9, .5), rrect(14.4, 15.1, 16.8, 16.9, .5),  // maksiller ostium: üst iç duvarda
];
const ETMOID = [0, 1].map(s => CAVITIES[5 + s]);
const probe = document.createElement('canvas').getContext('2d');   // dönüşümsüz: noktalar hücre biriminde sınanır

// oyunun çarpışma ızgarası: '.' boşluk, '#' duvar
export const FACE_GRID = (() => {
  const rows = [];
  for (let y = 0; y < ROWS; y++) {
    let r = '';
    for (let c = 0; c < COLS; c++) r += CAVITIES.some(p => probe.isPointInPath(p, c + .5, y + .5)) ? '.' : '#';
    rows.push(r);
  }
  return rows;
})();
// sinüslerden süzülen parçacıkların vardığı yer: burun deliklerinin üstündeki son sıra
// etmoidin oynanan hücreleri: her biri çizimde küçük bir hava hücresi
const ETMOID_CELLS = [];
for (let y = 0; y < ROWS; y++) for (let c = 0; c < COLS; c++)
  if (FACE_GRID[y][c] === '.' && ETMOID.some(p => probe.isPointInPath(p, c + .5, y + .5))) ETMOID_CELLS.push([c + .5, y + .5]);
export const FACE_SINK = (() => { const y = FACE_GRID.findLastIndex(r => r.includes('.')), out = []; for (let x = 0; x < COLS; x++) if (FACE_GRID[y][x] === '.') out.push(x, y); return out; })();
// ekrana sığdırılan bölge (hücre biriminde): bütün baş ve yalnızca sinüslerden ağza kadar olan kesit
export const FACE_BOX = { x0: -5, x1: 31, whole: [-11.5, 36], crop: [-.5, 27], cy: 12.5 };

const SKIN = '#FCDCC6', SKIN_D = '#F2BFA4', HAIR = '#6A2C4E', INK = '#3A1530';

// head: başın hattı (çene, şakaklar)
function headPath() {
  const p = new Path2D();
  p.moveTo(CX, -9.6);
  p.bezierCurveTo(4, -9.6, -3.6, -2.4, -3.6, 9);
  p.bezierCurveTo(-3.6, 19, -1.9, 25.2, 3.4, 29.6);
  p.bezierCurveTo(6.4, 32.2, 9.6, 33.3, CX, 33.3);
  p.bezierCurveTo(16.4, 33.3, 19.6, 32.2, 22.6, 29.6);
  p.bezierCurveTo(27.9, 25.2, 29.6, 19, 29.6, 9);
  p.bezierCurveTo(29.6, -2.4, 22, -9.6, CX, -9.6);
  p.closePath();
  return p;
}

/* x: hedef tuval; k: hücre başına piksel; ox, oy: tahtanın (0,0) hücresinin tuvaldeki yeri */
export function drawFace(x, k, ox, oy, seed) {
  x.save(); x.setTransform(k, 0, 0, k, ox, oy); x.lineCap = x.lineJoin = 'round';
  const head = headPath();
  // omuzlar ve boyun: siklamenin akış rengi (teal) bir yaka
  x.fillStyle = '#1FB5A0'; x.beginPath(); x.moveTo(-6, 48); x.bezierCurveTo(-5, 38.5, 3, 35.6, 8, 35); x.lineTo(18, 35); x.bezierCurveTo(23, 35.6, 31, 38.5, 32, 48); x.closePath(); x.fill();
  x.fillStyle = SKIN_D; x.beginPath(); x.moveTo(7.6, 28); x.lineTo(7.6, 35.2); x.quadraticCurveTo(CX, 38.6, 18.4, 35.2); x.lineTo(18.4, 28); x.closePath(); x.fill();
  // arka saç
  x.fillStyle = HAIR; x.beginPath(); x.ellipse(CX, 5, 18.4, 16.6, 0, Math.PI * .94, Math.PI * 2.06); x.closePath(); x.fill();
  // kulaklar
  for (const s of [-1, 1]) {
    const ex = CX + s * 16.7;
    x.fillStyle = SKIN; x.beginPath(); x.ellipse(ex, 13.6, 1.9, 3.5, s * .12, 0, 6.29); x.fill();
    x.strokeStyle = SKIN_D; x.lineWidth = .45; x.beginPath(); x.ellipse(ex + s * .2, 13.6, .9, 2.2, s * .12, -1.2, 1.9); x.stroke();
  }
  // yüz: kenara doğru hafif gölgeli ten
  const g = x.createRadialGradient(CX, 13, 4, CX, 13, 22);
  g.addColorStop(0, SKIN); g.addColorStop(.75, SKIN); g.addColorStop(1, SKIN_D);
  x.fillStyle = g; x.fill(head);
  // ön saç: alnın üstünde yumuşak dalgalı perçem
  x.fillStyle = HAIR; x.beginPath(); x.moveTo(-3.9, 7.5);
  x.bezierCurveTo(-4.4, -6.5, 5, -10.6, CX, -10.4); x.bezierCurveTo(21, -10.6, 30.4, -6.5, 29.9, 7.5);
  x.quadraticCurveTo(28.4, 1.2, 25.4, -1.4); x.quadraticCurveTo(22.2, -1.2, 19.8, -3.6); x.quadraticCurveTo(16.2, -1.8, 12.6, -3.8);
  x.quadraticCurveTo(8.8, -1.6, 5.4, -3.4); x.quadraticCurveTo(2.4, -1.2, .4, -1.2); x.quadraticCurveTo(-2.6, 1.4, -3.9, 7.5);
  x.closePath(); x.fill();
  // yanak allığı
  x.fillStyle = 'rgba(255,128,160,.28)';
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(CX + s * 11.9, 22.6, 2.3, 1.3, 0, 0, 6.29); x.fill(); }
  // göz çukuru: röntgendeki gibi hafif gölge halkası
  for (const s of [-1, 1]) {
    const ex = CX + s * (CX - ORBIT[0]);
    const og = x.createRadialGradient(ex, ORBIT[1], ORBIT[2] * .55, ex, ORBIT[1], ORBIT[2] * 1.05);
    og.addColorStop(0, 'rgba(214,120,120,0)'); og.addColorStop(.8, 'rgba(214,120,120,.13)'); og.addColorStop(1, 'rgba(214,120,120,0)');
    x.fillStyle = og; x.beginPath(); x.arc(ex, ORBIT[1], ORBIT[2] * 1.05, 0, 6.29); x.fill();
  }

  // sinüsler: kemik gibi açık bir ışıma, ince gül rengi kenar, üstüne mukoza (bölümlerin zeminiyle aynı renkler)
  const shapes = CAVITIES.filter(p => !ETMOID.includes(p)), cells = ETMOID_CELLS;   // etmoid: ince kemik bölmeli küçük hava hücreleri, petek gibi
  for (const [cx, cy] of cells) { const p = new Path2D(); p.arc(cx, cy, .68, 0, 6.29); shapes.push(p); }
  x.save(); x.shadowColor = 'rgba(255,255,255,.95)'; x.shadowBlur = k * .9; x.strokeStyle = 'rgba(255,248,244,.95)'; x.lineWidth = .7;
  for (const p of shapes) x.stroke(p);
  x.restore();
  x.strokeStyle = '#E48AA0'; x.lineWidth = .3; for (const p of shapes) x.stroke(p);
  // mukoza ayrı bir katmanda: lekeler yalnızca boşlukların üstüne düşsün
  const L = document.createElement('canvas'); L.width = x.canvas.width; L.height = x.canvas.height;
  const l = L.getContext('2d'); l.setTransform(k, 0, 0, k, ox, oy);
  l.fillStyle = '#F6C3BF'; for (const p of shapes) l.fill(p);
  l.globalCompositeOperation = 'source-atop'; l.globalAlpha = .45;
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let j = 0; j < 170; j++) { l.fillStyle = rnd() < .5 ? '#FAD3CF' : '#F0B4B3'; l.beginPath(); l.arc(rnd() * 26, rnd() * 23, .35 + rnd() * .6, 0, 6.29); l.fill(); }
  l.globalAlpha = 1;
  // etmoid hücrelerinin arasındaki ince bölmeler
  l.strokeStyle = 'rgba(228,138,160,.55)'; l.lineWidth = .1;
  for (const [cx, cy] of cells) { l.beginPath(); l.arc(cx, cy, .68, 0, 6.29); l.stroke(); }
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(L, 0, 0); x.restore();

  // kaşlar
  x.strokeStyle = HAIR; x.lineWidth = .62;
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(CX + s * 10.6, 8.3); x.quadraticCurveTo(CX + s * 7.6, 6.5, CX + s * 4.6, 7.6); x.stroke(); }
  // gözler: gülen, kapalı göz kavisleri ve kirpikler
  x.strokeStyle = INK; x.lineWidth = .42;
  for (const s of [-1, 1]) {
    const ex = CX + s * (CX - ORBIT[0]), ey = 11.9;
    x.beginPath(); x.moveTo(ex - 2.1, ey); x.quadraticCurveTo(ex, ey - 2.1, ex + 2.1, ey); x.stroke();
    x.beginPath(); x.moveTo(ex + s * 2.1, ey); x.quadraticCurveTo(ex + s * 2.7, ey - .2, ex + s * 2.9, ey - .9); x.stroke();   // dış köşede kirpik
  }
  // burun: kanatlar, uç ve delikler (burun boşluğu deliklere iner)
  x.strokeStyle = '#E3A48E'; x.lineWidth = .32;
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(CX + s * 2.4, 20.2); x.bezierCurveTo(CX + s * 3.4, 20.7, CX + s * 3.5, 22.2, CX + s * 2.3, 22.8); x.stroke(); }
  x.fillStyle = 'rgba(226,150,130,.35)'; x.beginPath(); x.ellipse(CX, 23.15, 2.1, .5, 0, 0, 6.29); x.fill();   // burun ucunun gölgesi
  x.fillStyle = '#9C4A5E';
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(CX + s * 1.05, 22.45, .62, .34, s * -.25, 0, 6.29); x.fill(); }
  // ağız: hafif gülümseme
  x.strokeStyle = INK; x.lineWidth = .42;
  x.beginPath(); x.moveTo(CX - 3.2, 25.6); x.quadraticCurveTo(CX, 28, CX + 3.2, 25.6); x.stroke();
  x.strokeStyle = 'rgba(214,120,130,.6)'; x.lineWidth = .3;
  for (const s of [-1, 1]) { x.beginPath(); x.arc(CX + s * 3.5, 25.4, .45, s < 0 ? -.4 : Math.PI - 1.2, s < 0 ? 1.2 : Math.PI + .4); x.stroke(); }
  x.restore();
}
