import * as PIXI from 'pixi.js';
import { COLS, ROWS, ACTS, LEVELS, DEMO, FACTS, INFO, HOWTO, CLOSING, TIPS, SKINS, BADGES, ITEM_INFO, GOAL_TEXT, REASONS } from './content.js';
import { prog, save, totalStars, addScore, cleanName } from './save.js';
import { initAudio, playSfx, setVolumes, musicScene, musicDuck, audioHidden } from './audio.js';
import { createMusic } from './music.js';
import { TS, cnv, seeded, C, HALO, halo } from './textures.js';
import { FACE_GRID, FACE_SINK, FACE_BOX, drawFace } from './face.js';
import { net } from './net.js';
// sıklamen yılan: src/assets/siklamen_yilan.png çiziminden çıkarılan parçalar (tools/yilan-parcalari.py)
import YILAN from './assets/yilan/yilan.json';
import basURL from './assets/yilan/bas.png';
import yaprak1URL from './assets/yilan/yaprak1.png';
import tomurcukURL from './assets/yilan/tomurcuk.png';
import yaprak2URL from './assets/yilan/yaprak2.png';
import tomurcuk2URL from './assets/yilan/tomurcuk2.png';
import sapURL from './assets/yilan/sap.png';
import kuyrukURL from './assets/yilan/kuyruk.png';

// Mobilde konsol: adrese ?eruda ekle (yalnızca geliştirme modunda)
if (import.meta.env.DEV && /eruda/.test(location.search + location.hash)) import('eruda').then(m => m.default.init());

(async () => {
'use strict';

const MAXSEG = COLS * ROWS + 64;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const COMBO_WINDOW = 2600;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEBUG = /debug/.test(location.hash) || /debug/.test(location.search);
const sfx = name => { if (!prog.muted && mode !== 'demo') playSfx(name); };
const buzz = ms => { if (prog.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch {} };

// DOM ikonları aynı dokulardan
const ICON = { mucus: C.mucus[0], gold: C.gold, serum: C.serum, breeze: C.breeze, polyp: C.polyp[0], septum: C.septum, plug: C.plug, crust: C.crust,
  virus: C.virus, infected: C.infected[0], immune: C.immune, swell: C.swell };
const iconURL = {};
for (const k in ICON) iconURL[k] = ICON[k].toDataURL();
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
for (const k of ['ball', 'face', 'soft', 'dot', 'septum', 'crust', 'plug', 'portal', 'petal', 'bubble', 'bloom', 'swell']) T[k] = PIXI.Texture.from(C[k]);
// tahtadaki öğeler haleli: toplanabilirler açık bir ışıkla, virüs koyu bir gölgeyle zeminden ayrılır
const HALO_RGB = { mucus: '255,250,214', infected: '236,220,255', gold: '255,236,160', serum: '226,244,255', breeze: '222,250,232', immune: '240,234,255' };
for (const k of ['gold', 'serum', 'breeze', 'immune']) T[k] = PIXI.Texture.from(halo(C[k], HALO_RGB[k], .85));
T.virus = PIXI.Texture.from(halo(C.virus, '60,8,30', .4)); T.virusBare = PIXI.Texture.from(C.virus);   // virusBare: akışın taşıdığı virüs
T.mucus = C.mucus.map(c => PIXI.Texture.from(halo(c, HALO_RGB.mucus, .85)));
T.infected = C.infected.map(c => PIXI.Texture.from(halo(c, HALO_RGB.infected, .85)));
T.polyp = C.polyp.map(c => PIXI.Texture.from(c));
// sıklamen yılanın parçaları; taç yapraklı olanlar görünümün rengine boyanır (yilanDoku)
const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
const YI = {};
await Promise.all(Object.entries({ bas: basURL, yaprak1: yaprak1URL, tomurcuk: tomurcukURL, yaprak2: yaprak2URL, tomurcuk2: tomurcuk2URL, sap: sapURL, kuyruk: kuyrukURL }).map(async ([k, u]) => {
  const im = await loadImg(u), c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); YI[k] = c;
}));
T.stem = PIXI.Texture.from(YI.sap); T.tail = PIXI.Texture.from(YI.kuyruk);

const petalLayer = new PIXI.Container();
const board = new PIXI.Container();
// Şekilli bölümde "sinüsün içindeyiz": ekranı dolduran doku (bleedS), ostiumdan sızan ışık (lightS kapalı, lightOpenS açık ostium)
const bleedS = new PIXI.Sprite(), lightS = new PIXI.Sprite(), lightOpenS = new PIXI.Sprite();
lightS.anchor.set(.5); lightOpenS.anchor.set(.5);
const oppLayer = new PIXI.Container();   // çok oyunculu: diğer oyuncuların tahtaları
app.stage.addChild(bleedS, petalLayer, board, oppLayer);
const shadowG = new PIXI.Graphics(), baseG = new PIXI.Graphics(), inflamG = new PIXI.Graphics(), rimG = new PIXI.Graphics();   // inflamG: iltihap kızarıklığı, bölüm bitince solar
const bloomLayer = new PIXI.Container(), gateLayer = new PIXI.Container();
const obsLayer = new PIXI.Container(), itemLayer = new PIXI.Container(), moverLayer = new PIXI.Container(), virusLayer = new PIXI.Container();
const snakeLayer = new PIXI.Container(), maskG = new PIXI.Graphics(), fxLayer = new PIXI.Container(), popLayer = new PIXI.Container(), flashG = new PIXI.Graphics();
const floorLayer = new PIXI.Container(), floorMaskG = new PIXI.Graphics();   // zemin yuvarlak köşelere kırpılır
const floorS = new PIXI.Sprite();   // şekilli bölümde pürüzsüz hatlı sinüs zemini (drawSinusFloor)
const driftLayer = new PIXI.Container();   // ostiuma süzülen parçacıklar
floorLayer.addChild(baseG, floorS, inflamG, bloomLayer, driftLayer); floorLayer.mask = floorMaskG;
board.addChild(shadowG, floorLayer, floorMaskG, rimG, lightS, lightOpenS, gateLayer, obsLayer, itemLayer, moverLayer, virusLayer, snakeLayer, maskG, fxLayer, popLayer, flashG);
snakeLayer.mask = maskG; flashG.alpha = 0; inflamG.alpha = 0;
const gateMaskG = new PIXI.Graphics(); board.addChild(gateMaskG); gateLayer.mask = gateMaskG;   // ostium ışıması çerçevenin dışına taşmasın

// Arka planda süzülen siklamen yaprakları (12 sprite)
const PETALS = [];
for (let i = 0; i < 12; i++) {
  const s = new PIXI.Sprite(T.petal); s.anchor.set(.5); s.alpha = .28; petalLayer.addChild(s);
  PETALS.push({ s, x: Math.random(), y: Math.random(), v: .00002 + Math.random() * .00003, r: Math.random() * 6, vr: (Math.random() - .5) * .001, sz: 18 + Math.random() * 26, ph: Math.random() * 6 });
}


const gateGlow = new PIXI.Sprite(T.soft), gateRing = new PIXI.Sprite(T.portal);
gateGlow.anchor.set(.5); gateRing.anchor.set(.5); gateGlow.tint = 0x2FD6BE; gateRing.tint = 0x0E9C88;
gateLayer.addChild(gateGlow, gateRing); gateLayer.visible = false;

const decoLayer = new PIXI.Container(), budLayer = new PIXI.Container(), bodyLayer = new PIXI.Container(), lumpLayer = new PIXI.Container();   // deco: sapın üstündeki yapraklar, bud: arkasındaki tomurcuklar; lump: gövdede taşınan virüsler
const bodyPool = [], lumpPool = [], DECOS = [];
const bodySprite = i => { let s = bodyPool[i]; if (!s) { s = new PIXI.Sprite(T.ball); s.anchor.set(.5); bodyLayer.addChild(s); bodyPool[i] = s; } return s; };
// sap: boyunca kesit dokusu gerilen şerit; kuyruk: çizimdeki sivri uç, aynı şeridin son parçası
function ropeMesh(tex) {
  const geometry = new PIXI.MeshGeometry({ positions: new Float32Array(4), uvs: new Float32Array(4), indices: new Uint32Array(0) });
  const m = new PIXI.Mesh({ geometry, texture: tex }); m.cap = 0; return m;
}
const stemMesh = ropeMesh(T.stem), tailMesh = ropeMesh(T.tail);
const headFlower = new PIXI.Sprite();
headFlower.anchor.set(YILAN.head.ax, YILAN.head.ay);   // çapa: baş hücresinin merkezi; çiçek önde (dokunun solu), sap arkadan (sağdan) girer
const headBase = new PIXI.Sprite(T.ball), headFace = new PIXI.Sprite(T.face);
for (const s of [headBase, headFace]) s.anchor.set(.5);
snakeLayer.addChild(budLayer, tailMesh, stemMesh, bodyLayer, decoLayer, lumpLayer, headFlower, headBase, headFace);
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
let cell = 20, boardW = 0, boardH = 0, baseX = 0, baseY = 0, calloutBand = 0;   // calloutBand: tahtanın üstünde mesajlara ayrılan şerit
let mode = 'demo';               // demo | adventure | versus (çevrim içi çok oyunculu)
let state = 'demo';              // demo | intro | play | exiting | dying | result | over | paused
let pausedFrom = null, cfg = DEMO, levelIdx = 0, score = 0, cleared = false;   // score: koşu boyunca (1. bölümden ölene ya da bitirene kadar) birikir
const bx = new Int16Array(MAXSEG), by = new Int16Array(MAXSEG), px = new Int16Array(MAXSEG), py = new Int16Array(MAXSEG);
const ix = new Float32Array(MAXSEG), iy = new Float32Array(MAXSEG);
let len = 0, prevLen = 0, grow = 0, dir = 0, moveDir = 0, queue = [];
let acc = 0, gameTime = 0, levelStart = 0;
let rnd = Math.random;            // nesne ve virüs kuraları: çok oyunculu turda herkes aynı tohumla başlar
let viewR = { x: 0, y: 0, w: 0, h: 0 };   // tahtanın ekrandaki alanı: tek oyunculuda bütün ekran, çok oyunculuda kendi sütunun
// Bölüm başı: akış oyuncu ilk yönü verene kadar bekler (waiting), sonra yavaş başlayıp birkaç saniyede bölümün hızına çıkar
let waiting = false;
const WARM_MS = 3500, WARM_SLOW = .8;   // ilk adım %80 daha yavaş, 3,5 sn'de normal hız
let eaten = 0, target = 0, exitOpen = false, exitX = 0, exitY = 0, exitDir = 0, exitSteps = 0, exits = [];   // exits: tahta dışındaki çıkış hücreleri; exitX/Y ilki
let combo = 0, lastEat = -1e9, boostUntil = 0, slowUntil = 0, breezeUntil = 0, immuneUntil = 0;
let stepCount = 0, autoBot = false, deathReason = '', frozen = false;   // autoBot: denge testi için botun bölüm oynaması, frozen: görünüm denetimi için durdurma (yalnızca #debug)
const obstacle = new Uint8Array(COLS * ROWS), swellAt = new Uint8Array(COLS * ROWS), visited = new Uint8Array(COLS * ROWS), scratch = new Uint8Array(COLS * ROWS);
let swellStage = 0;   // swellAt: şişlik hücresinin çekileceği aşama (1 iç, 2 dış katman)

// Tahtanın yuvarlak köşeleri: yarıçap hücre biriminde. Yayın dışında kalan köşe hücreleri duvardır (her köşede 8 hücre,
// tamamen çerçevenin altında kalır). Yayın üstüne denk gelen hücrelerde oynanır ama nesne, virüs ve çıkış çıkmaz.
const CORNER = 7;
const cornerWall = new Uint8Array(COLS * ROWS), rimCell = new Uint8Array(COLS * ROWS);
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
  const ex = CORNER - Math.min(x + .5, COLS - x - .5), ey = CORNER - Math.min(y + .5, ROWS - y - .5);
  if (ex <= 0 || ey <= 0) continue;
  const d = Math.hypot(ex, ey);
  if (d > CORNER + .2) cornerWall[y * COLS + x] = 1; else if (d > CORNER - .3) rimCell[y * COLS + x] = 1;
}
let items = [], movers = [], viruses = [];
let carriedAt = [], hurtUntil = 0;   // carriedAt: virüslü mukusun yutulduğu adım (gövdede ilerler)
let lv = null;                         // bölüm istatistikleri
let gameSneezes = 0;

function stepDur() {
  if (state === 'exiting') return 45;
  let d = cfg.step;
  if (mode !== 'demo') { const w = Math.min(1, (gameTime - levelStart) / WARM_MS); d *= 1 + WARM_SLOW * (1 - w) * (1 - w); }
  if (gameTime < boostUntil) d *= .62;
  if (gameTime < slowUntil) d *= 1.4;
  return d;
}
const running = () => state === 'play' || state === 'exiting' || state === 'demo';

/* =========================================================================
   YERLEŞİM
   ========================================================================= */
function layout() {
  const W = app.screen.width, H = app.screen.height;
  faceLaid = !!cfg.face;
  viewR = mode === 'versus' ? mpRects(W, H)[0] : { x: 0, y: 0, w: W, h: H };
  if (cfg.face) return faceLayout(W, H);
  if (mode === 'versus') return mpSelfLayout(W, H);
  const w = viewR.w, h = viewR.h;
  // dikey ekranda tahtanın üstünde mesaj şeridi ayrılır: ekran mesajı tahtanın üst kısmını (çoğu bölümde ostiumu) kapatmasın.
  // Yatay ekranda mesajlar tahtanın yanındaki boşluğa yazılır.
  const band = h >= w * .9 ? Math.min(64, Math.round(h * .08)) : 0;
  cell = Math.max(8, Math.floor(Math.min((w - 24) / COLS, (h - band - 36) / ROWS)));
  boardW = COLS * cell; boardH = ROWS * cell;
  const pad = Math.round(cell * .34), slack = h - boardH;
  calloutBand = Math.min(Math.max(0, slack - pad * 2 - 8), 100);
  baseX = Math.round(viewR.x + (w - boardW) / 2); baseY = Math.round(viewR.y + calloutBand + (slack - calloutBand) / 2) - 2;
  const cr = CORNER * cell;   // zeminin köşe yarıçapı; çerçeve aynı merkezli yaylarla dışa doğru büyür
  shadowG.clear().roundRect(-pad, -pad + cell * .28, boardW + pad * 2, boardH + pad * 2, cr + pad).fill({ color: 0x9C3C62, alpha: .16 });
  rimG.clear().roundRect(-pad, -pad, boardW + pad * 2, boardH + pad * 2, cr + pad).stroke({ width: pad, color: 0xE06C8F, alignment: 1 })
    .roundRect(-pad * .5, -pad * .5, boardW + pad, boardH + pad, cr + pad * .5).stroke({ width: 2, color: 0xFFFFFF, alpha: .5 });
  drawBoard();
  flashG.clear().roundRect(-pad, -pad, boardW + pad * 2, boardH + pad * 2, cr + pad).fill(0xFF3355);
  placeObstacleSprites();
  for (const it of items) { placeItem(it, true); }
  for (const m of movers) m.s.width = m.s.height = cell * 1.1;
  placeGate();
  applyInside();
  if (mode === 'versus') mpLayout(W, H);
}
// çok oyunculu: tahta kendi kartının içinde (kart üstünde ad etiketi şeridi); çerçeve yerine kartın gölgesi ve ince kenarı
function mpSelfLayout(W, H) {
  const R = viewR, rad = R.rad;
  cell = R.cell; boardW = COLS * cell; boardH = ROWS * cell; calloutBand = 0;
  baseX = Math.round(R.x + (R.w - boardW) / 2); baseY = Math.round(R.y + R.hd + (R.h - R.hd - boardH) / 2);
  const vx = R.x - baseX, vy = R.y - baseY;
  shadowG.clear().roundRect(vx, vy + 6, R.w, R.h, rad).fill({ color: 0x6E2A4A, alpha: .22 });
  mpSelfRim();
  drawBoard();
  flashG.clear().roundRect(vx, vy, R.w, R.h, rad).fill(0xFF3355);
  placeObstacleSprites();
  for (const it of items) placeItem(it, true);
  for (const m of movers) m.s.width = m.s.height = cell * 1.1;
  placeGate();
  applyInside();
  mpLayout(W, H);
}
/* Ana menü: yüz, menü kartlarının bıraktığı en geniş boşluğa yerleşir (dikeyde başlığın altı ile kartın üstü, yatayda
   kartların yanı). Yer varsa bütün baş, yoksa sinüslerden ağza kadar olan kesit sığdırılır; baş kartların altına taşar. */
let faceLaid = false;
function faceLayout(w, h) {
  const st = stageEl.getBoundingClientRect(), home = $('scrHome'), fw = FACE_BOX.x1 - FACE_BOX.x0;
  const fit = (aw, ah) => { const whole = Math.min(aw / fw, ah / (FACE_BOX.whole[1] - FACE_BOX.whole[0]));
    return whole >= 12 ? whole : Math.min(aw / fw, ah / (FACE_BOX.crop[1] - FACE_BOX.crop[0])); };
  let best = { x: 0, y: 0, w, h, c: fit(w, h) * .9 };   // yer yoksa ekranın tamamı (kartların arkasında)
  if (home.classList.contains('show')) {
    const [br, sh] = [home.querySelector('.brand'), home.querySelector('.sheet')].map(e => { const b = e.getBoundingClientRect(); return { l: b.left - st.left, r: b.right - st.left, t: b.top - st.top, b: b.bottom - st.top }; });
    const cand = [], R = Math.max(br.r, sh.r), L = Math.min(br.l, sh.l);
    if (sh.t > br.b) cand.push({ x: 0, y: Math.max(0, br.b), w, h: Math.min(h, sh.t) - Math.max(0, br.b) });
    cand.push({ x: R, y: 0, w: w - R, h }, { x: 0, y: 0, w: L, h });
    for (const c of cand) if (c.w > 0 && c.h > 0) { c.c = fit(c.w - 8, c.h - 8); if (c.c > best.c && c.c >= 7) best = c; }
  }
  cell = Math.max(6, Math.floor(best.c));
  boardW = COLS * cell; boardH = ROWS * cell; calloutBand = 0;
  baseX = Math.round(best.x + best.w / 2 - 13 * cell); baseY = Math.round(best.y + best.h / 2 - FACE_BOX.cy * cell);
  shadowG.clear(); rimG.clear(); flashG.clear();
  drawBoard(); placeObstacleSprites();
  for (const it of items) placeItem(it, true);
  applyInside();
}
// Zemin hücrelere bölünmeden tek parça, düz bir mukoza yüzeyi olarak çizilir; ızgaraya bağlı olmayan hafif lekeler doku verir.
// Şekilli bölümde zemin, görseldeki sinüs hattıyla birebir çizilir (drawSinusFloor); dışı düz renktir.
const isWall = i => obstacle[i] === 5;
function drawBoard() {
  const rnd = seeded(7), FLOOR = 0xF6C3BF;
  baseG.clear(); floorS.visible = !!(cfg.shape || cfg.face);
  if (mode === 'versus') baseG.roundRect(viewR.x - baseX, viewR.y - baseY, viewR.w, viewR.h, viewR.rad).fill(CARD_BG);   // kartın zemini
  if (cfg.face) drawFaceFloor();
  else if (!cfg.shape) {
    baseG.rect(0, 0, boardW, boardH).fill({ color: FLOOR });
    for (let k = 0; k < COLS * ROWS / 5; k++) {
      const x = rnd() * COLS, y = rnd() * ROWS, r = cell * (.35 + rnd() * .6), light = rnd() < .5;
      if (!isWall((y | 0) * COLS + (x | 0))) baseG.circle(x * cell, y * cell, r).fill({ color: light ? 0xFAD3CF : 0xF0B4B3, alpha: .45 });
    }
  } else {
    drawSinusFloor();   // dış alan saydam: altındaki ekran boyu doku (bleedS) görünür
  }
  inflamG.clear().rect(0, 0, boardW, boardH).fill({ color: 0xE0304F });
}
// Sinüs zemini: shape.outline hattı (ostium kanalı dahil), kenarda ince açık bir çizgi ve dışa sönen bir ışımayla canvas'a çizilir.
// Çarpışma ızgarada kalır (shape.grid): merkezi hattın içinde kalan hücreler oynanır.
let floorTex = null;
function drawSinusFloor() {
  // tuval ekran boyunda: ostium kanalı tahtanın kenarında bitmez, ekranın kenarına kadar uzanır
  const res = app.renderer.resolution, cv = sinusCanvas(cell * res, baseX * res, baseY * res, Math.ceil(app.screen.width * res), Math.ceil(app.screen.height * res));
  if (floorTex) floorTex.destroy(true);
  floorTex = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: cv }) });
  floorS.texture = floorTex; floorS.position.set(-baseX, -baseY); floorS.width = app.screen.width; floorS.height = app.screen.height;
}
// k: hücre başına piksel, offX/offY: tahtanın tuvaldeki yeri, cw/ch: tuval boyu
function sinusCanvas(k, offX, offY, cw, ch) {
  const o = cfg.shape.outline, n = o.length / 2, path = new Path2D();
  // noktalar arasından orta noktalara eğri: köşesiz, pürüzsüz hat
  const P = i => [o[(i % n) * 2] * k + offX, o[(i % n) * 2 + 1] * k + offY], M = i => { const a = P(i), b = P(i + 1); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  let area = 0; for (let i = 0; i < n; i++) { const a = P(i), b = P(i + 1); area += a[0] * b[1] - b[0] * a[1]; }
  path.moveTo(...M(n - 1));
  for (let i = 0; i < n; i++) path.quadraticCurveTo(...P(i), ...M(i));
  path.closePath();
  // kanalın tahta dışındaki uzantısı: hatla aynı yönde çizilir ki nonzero dolguda birleşsin
  let gx0 = COLS, gx1 = -1;
  cfg.shape.grid.forEach(row => { for (let x = 0; x < COLS; x++) if (row[x] === '=') { gx0 = Math.min(gx0, x); gx1 = Math.max(gx1, x); } });
  if (gx1 >= 0) {
    const x0 = gx0 * k + offX, x1 = (gx1 + 1) * k + offX, y0 = exitY < 0 ? -k : ROWS * k + offY - k, y1 = exitY < 0 ? offY + k : ch + k;
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; if (area < 0) pts.reverse();
    path.moveTo(...pts[0]); for (const q of pts.slice(1)) path.lineTo(...q); path.closePath();
  }
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const x = cv.getContext('2d'), rnd = seeded(11);
  x.save(); x.shadowColor = 'rgba(250,214,222,.95)'; x.shadowBlur = k * .7; x.fillStyle = '#F6C3BF'; x.fill(path); x.restore();   // dış ışıma
  x.save(); x.clip(path); x.globalAlpha = .45;
  for (let j = 0; j < COLS * ROWS / 5; j++) {
    const sx = rnd() * cw, sy = rnd() * ch, r = k * (.35 + rnd() * .6);
    x.fillStyle = rnd() < .5 ? '#FAD3CF' : '#F0B4B3'; x.beginPath(); x.arc(sx, sy, r, 0, 6.28); x.fill();
  }
  x.globalAlpha = .9; x.strokeStyle = '#FCE6E2'; x.lineWidth = k * .18; x.stroke(path);   // iç kenar çizgisi (kırpıldığı için yarısı görünür)
  x.restore();
  return cv;
}
// ana menüdeki yüz: ekran boyu tuvale bir kez çizilir
function drawFaceFloor() {
  const res = app.renderer.resolution, cv = document.createElement('canvas');
  cv.width = Math.ceil(app.screen.width * res); cv.height = Math.ceil(app.screen.height * res);
  drawFace(cv.getContext('2d'), cell * res, baseX * res, baseY * res, 11);
  if (floorTex) floorTex.destroy(true);
  floorTex = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: cv }) });
  floorS.texture = floorTex; floorS.position.set(-baseX, -baseY); floorS.width = app.screen.width; floorS.height = app.screen.height;
}
/* =========================================================================
   SİNÜSÜN İÇİNDEYİZ (şekilli bölümler): çerçeve ve taç yaprakları gizlenir, doku ekranı doldurur;
   zeminde parçacıklar ostiuma süzülür (mukosiliyer temizlik);
   tek ışık ostiumdan sızar, ostium açılınca genişler; sahne yavaş bir nefes ritmiyle kabarıp iner.
   ========================================================================= */
const BREATH_MS = 4500;
let ostX = 0, ostY = 0, lightOpen = 0, bleedTex = null, lightTexs = [];
const flowBuf = new Int16Array(COLS * ROWS), farCells = [], drift = [];
for (let i = 0; i < 26; i++) { const s = new PIXI.Sprite(T.dot); s.anchor.set(.5); s.tint = 0xFFF4F2; driftLayer.addChild(s); drift.push({ s, x: 0, y: 0, tx: 0, ty: 0, v: 1, a: 0, ph: 0, sz: .2 }); }

function applyInside() {
  const on = !!cfg.shape, face = !!cfg.face, vs = mode === 'versus', full = on && !vs;   // full: ekranı kaplayan "sinüsün içindeyiz"
  document.body.classList.toggle('inside', full);
  petalLayer.visible = !full; shadowG.visible = rimG.visible = !full && !face; inflamG.visible = !on && !face;
  bleedS.visible = lightS.visible = lightOpenS.visible = full; driftLayer.visible = (on || face) && !REDUCED;   // hareket azaltılmışsa parçacık yok
  if (face) {   // menüdeki yüz: çerçeve yok; sinüslerden süzülen parçacıklar kanallardan burun deliklerine iner
    floorMaskG.clear().rect(-baseX, -baseY, app.screen.width, app.screen.height).fill(0xffffff);
    maskG.clear().rect(-baseX, -baseY, app.screen.width, app.screen.height).fill(0xffffff);
    floorS.tint = 0xFFFFFF; buildFlow(FACE_SINK);
    for (const p of drift) respawnDrift(p, true);
    return;
  }
  // maskeler: şekilli bölümde çerçeve yok, zemin köşesiz ve ostium ışıması ekran boyunca serbest; diğerlerinde yuvarlak çerçeve
  const pad = Math.round(cell * .34), cr = CORNER * cell;
  floorMaskG.clear();
  const vx = viewR.x - baseX, vy = viewR.y - baseY;   // kendi alanı (çok oyunculuda sütun): kanal ve ışıma bunun dışına taşmaz
  const area = g => vs ? g.roundRect(vx, vy, viewR.w, viewR.h, viewR.rad) : g.rect(vx, vy, viewR.w, viewR.h);   // çok oyunculuda kartın köşeleri
  if (on) area(floorMaskG).fill(0xffffff); else floorMaskG.roundRect(0, 0, boardW, boardH, cr).fill(0xffffff);
  maskG.clear();   // akış: şekilli bölümde ekranın kenarına kadar kanalda görünür, diğerlerinde tahtada kırpılır
  if (on) area(maskG).fill(0xffffff); else maskG.rect(-2, -2, boardW + 4, boardH + 4).fill(0xffffff);
  gateMaskG.clear();
  if (on) area(gateMaskG).fill(0xffffff);
  else gateMaskG.roundRect(-pad, -pad, boardW + pad * 2, boardH + pad * 2, cr + pad).fill(0xffffff);
  if (!on) { floorS.tint = 0xFFFFFF; return; }
  // ostiumun sinüse açılan iç ucu (kanalın şekle değen ucu), hücre biriminde
  let sx = 0, n = 0, inner = null;
  cfg.shape.grid.forEach((row, y) => { for (let x = 0; x < COLS; x++) if (row[x] === '=') { sx += x; n++; inner = inner === null ? y : (exitY < 0 ? Math.max(inner, y) : Math.min(inner, y)); } });
  ostX = sx / n + .5; ostY = inner + (exitY < 0 ? 1 : 0);
  const sink = []; cfg.shape.grid.forEach((row, y) => { for (let x = 0; x < COLS; x++) if (row[x] === '=') sink.push(x, y); });
  buildFlow(sink); buildBleed(); buildLight();
  for (const p of drift) respawnDrift(p, true);
}
// ekranı dolduran doku: ortası sinüsün dış rengi, kenarlara doğru koyulaşır (vinyet)
function buildBleed() {
  const w = Math.ceil(app.screen.width), h = Math.ceil(app.screen.height), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'), cx = baseX + boardW / 2, cy = baseY + boardH / 2, R = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, '#C65A7C'); g.addColorStop(.55, '#B54E70'); g.addColorStop(1, '#7E2A4B');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const rnd = seeded(5); x.globalAlpha = .18;   // hafif, büyük lekeler: düz değil canlı doku
  for (let i = 0; i < 26; i++) { x.fillStyle = rnd() < .5 ? '#D46A8C' : '#9E3A5F'; x.beginPath(); x.arc(rnd() * w, rnd() * h, cell * (1.5 + rnd() * 3), 0, 6.28); x.fill(); }
  if (bleedTex) bleedTex.destroy(true);
  bleedS.texture = bleedTex = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: cv }) });
  bleedS.width = w; bleedS.height = h;
}
// ostiumdan sızan ışık: ortası saydam, dışa doğru koyulaşan karanlık; kapalı ve açık ostium için iki doku
function buildLight() {
  const gx = ostX * cell, gy = ostY * cell, w = app.screen.width, h = app.screen.height;
  const H = Math.hypot(Math.max(gx + baseX, w - gx - baseX), Math.max(gy + baseY, h - gy - baseY)) * 1.05;
  const make = (r0, r1, dark) => {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    const g = x.createRadialGradient(256, 256, 0, 256, 256, 256), a = Math.min(.9, r0 * cell / H), b = Math.min(.99, r1 * cell / H);
    g.addColorStop(0, 'rgba(42,7,22,0)'); g.addColorStop(a, 'rgba(42,7,22,0)');
    g.addColorStop((a + b) / 2, `rgba(42,7,22,${dark * .4})`); g.addColorStop(b, `rgba(42,7,22,${dark})`); g.addColorStop(1, `rgba(42,7,22,${dark})`);
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    return new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: c }) });
  };
  for (const t of lightTexs) t.destroy(true);
  lightTexs = [make(2.5, 15, .34), make(6, 24, .22)];
  lightS.texture = lightTexs[0]; lightOpenS.texture = lightTexs[1];
  for (const sp of [lightS, lightOpenS]) { sp.position.set(gx, gy); sp.width = sp.height = H * 2; }
  lightS.baseScale = lightS.scale.x;
}
// ostiuma akış: varış hücrelerinden (ostium '=', menüde burun delikleri) geriye yol mesafesi (duvar dışındaki her hücre geçilir)
function buildFlow(sink) {
  flowBuf.fill(-1); farCells.length = 0;
  const g = cfg.shape ? cfg.shape.grid : FACE_GRID, q = sink.slice();
  for (let i = 0; i < q.length; i += 2) flowBuf[q[i + 1] * COLS + q[i]] = 0;
  for (let h = 0; h < q.length;) {
    const x = q[h++], y = q[h++], d0 = flowBuf[y * COLS + x];
    for (let d = 0; d < 4; d++) {
      const X = x + DX[d], Y = y + DY[d], i = Y * COLS + X;
      if (X < 0 || Y < 0 || X >= COLS || Y >= ROWS || flowBuf[i] >= 0 || g[Y][X] === '#') continue;
      flowBuf[i] = d0 + 1; q.push(X, Y);
    }
  }
  for (let i = 0; i < flowBuf.length; i++) if (flowBuf[i] > 6) farCells.push(i);
}
function respawnDrift(p, scatter) {
  if (!farCells.length) return;
  const i = farCells[(Math.random() * farCells.length) | 0];
  p.x = p.tx = i % COLS; p.y = p.ty = (i / COLS) | 0; p.a = scatter ? Math.random() : 0;
  p.v = .45 + Math.random() * .4; p.ph = Math.random() * 6.28; p.sz = .12 + Math.random() * .14;
}
function nextDrift(p) {
  const x = p.tx, y = p.ty, f = flowBuf[y * COLS + x];
  if (f <= 0) return respawnDrift(p, false);
  const opts = [];
  for (let d = 0; d < 4; d++) { const X = x + DX[d], Y = y + DY[d]; if (X >= 0 && Y >= 0 && X < COLS && Y < ROWS && flowBuf[Y * COLS + X] >= 0 && flowBuf[Y * COLS + X] < f) opts.push(X, Y); }
  if (!opts.length) return respawnDrift(p, false);
  const k = ((Math.random() * opts.length / 2) | 0) * 2; p.tx = opts[k]; p.ty = opts[k + 1];
}
function updateInside(dt, now) {
  if (!cfg.shape && !cfg.face) return;
  // nefes: ışık ve karanlık birkaç saniyede bir hafifçe kabarıp iner
  const br = REDUCED ? 0 : Math.sin(now * 6.283 / BREATH_MS);
  if (cfg.shape) lightOpen += ((exitOpen ? 1 : 0) - lightOpen) * (1 - Math.exp(-dt * .003));
  const sc = (lightS.baseScale || lightS.scale.x) * (1 + .025 * br);
  lightS.scale.set(sc); lightOpenS.scale.set(sc);
  lightS.alpha = (1 - lightOpen) * (.92 - .08 * br); lightOpenS.alpha = lightOpen * (.92 - .08 * br);
  if (REDUCED) return;
  for (const p of drift) {
    const k = p.v * dt / 1000, dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d <= k) { p.x = p.tx; p.y = p.ty; nextDrift(p); } else { p.x += dx / d * k; p.y += dy / d * k; }
    p.a = Math.min(1, p.a + dt / 700);
    const near = flowBuf[Math.round(p.y) * COLS + Math.round(p.x)];   // ostiuma yaklaşınca söner
    p.s.alpha = (cfg.face ? .7 : .32) * p.a * Math.min(1, Math.max(0, near) / 3);
    p.s.position.set((p.x + .5 + Math.sin(now * .0013 + p.ph) * .18) * cell, (p.y + .5 + Math.cos(now * .0011 + p.ph) * .18) * cell);
    p.s.width = p.s.height = cell * p.sz * (1 + .15 * br);
  }
}
new ResizeObserver(() => { app.renderer.resize(Math.max(1, stageEl.clientWidth), Math.max(1, stageEl.clientHeight)); layout(); }).observe(stageEl);

/* =========================================================================
   BÖLÜM KURULUMU
   ========================================================================= */
// engel türleri: 1 polip, 2 sert mukus, 3 raf, 5 duvar (çizilmez, tahtanın parçası), 6 şişlik, 7 ostium tıkacı
const TEXOF = { 1: i => T.polyp[i % 3], 2: () => T.crust, 3: () => T.septum, 6: () => T.swell, 7: () => T.swell };
function placeObstacleSprites() {
  let k = 0;
  for (let i = 0; i < obstacle.length; i++) {
    const v = obstacle[i]; if (!v || v === 5) continue;
    let s = obsPool[k]; if (!s) { s = new PIXI.Sprite(T.dot); s.anchor.set(.5); obsLayer.addChild(s); obsPool[k] = s; }
    s.texture = TEXOF[v](i); s.visible = true;
    s.position.set(((i % COLS) + .5) * cell, (((i / COLS) | 0) + .5) * cell);
    s.width = s.height = cell * (v === 3 ? 1.04 : v >= 6 ? 1.3 : 1.08); s.rotation = v === 3 ? 0 : (i * 1.7) % 6.28;
    s.tint = v === 7 ? 0xFFD2B4 : v === 6 && swellAt[i] === 2 ? 0xE6E6E6 : 0xFFFFFF;
    k++;
  }
  for (; k < obsPool.length; k++) obsPool[k].visible = false;
}

function setupBoard(c) {
  cfg = c;
  obstacle.fill(0); swellAt.fill(0); swellStage = 0;
  if (c.shape || c.face) buildShape(c.shape || { grid: FACE_GRID });
  if (!c.face) for (let i = 0; i < obstacle.length; i++) if (cornerWall[i]) obstacle[i] = 5;
  for (const r of c.obs) {
    const kind = (r.w === 1 || r.h === 1) && r.w * r.h > 2 ? 3 : 1;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) obstacle[y * COLS + x] = kind;
  }
  for (const m of movers) m.s.destroy(); movers = [];
  for (const [x, y, d] of (c.movers || [])) {
    const s = new PIXI.Sprite(T.plug); s.anchor.set(.5); moverLayer.addChild(s);
    movers.push({ x, y, dx: d, px: x, py: y, s, ph: Math.random() * 6 });
  }
  placeObstacleSprites(); drawBoard();

  visited.fill(0); freshCell.fill(0);
  for (const b of BLOOMS) { b.life = 0; b.s.visible = false; }
  for (const it of items) it.s.destroy(); items = [];
  for (const v of viruses) v.s.destroy(); viruses = []; carriedAt = []; hurtUntil = 0;
  len = 4; grow = 0; dir = moveDir = 0; queue.length = 0; stepCount = 0;
  const [sx, sy] = c.start || [COLS >> 1, ROWS - 4];
  for (let i = 0; i < len; i++) { bx[i] = sx; by[i] = sy + i; px[i] = bx[i]; py[i] = by[i]; }
  prevLen = len;
  for (let i = 0; i < len; i++) visit(bx[i], by[i], true);
  target = c.target; eaten = 0; exitOpen = false; gateLayer.visible = !!c.shape; placeGate();   // şekilli bölümde ostium baştan görünür, kapalı
  combo = 0; lastEat = -1e9; boostUntil = slowUntil = breezeUntil = immuneUntil = 0; acc = 0;
  levelStart = gameTime; cleared = false;
  lv = { sneezes: 0, golds: 0, hardened: 0, maxLen: len, trapped: 0, carried: 0, expelled: 0, replicated: 0, hits: 0, immunes: 0, immuneSeen: 0 };
  spawn('mucus'); spawn('mucus');
  for (let i = 0; i < (c.virus || 0); i++) spawnVirus();
  if (!!c.face !== faceLaid) layout(); else applyInside();   // menüdeki yüz ile bölümlerin hücre boyu farklı
  renderSnake(1, 16, performance.now());
}

/* =========================================================================
   SİNÜS ŞEKLİ: duvar, şişkin mukoza katmanları (bölüm swell: true verirse) ve ostium
   ========================================================================= */
const SWELL_AT = [.4, .8];          // şişliğin iç ve dış katmanının çekildiği tıkanıklık oranları (bölüm swellAt ile değiştirebilir)
function buildShape(shape) {
  exits = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = shape.grid[y][x];
    if (ch === '#') obstacle[y * COLS + x] = 5;
    else if (ch === '=') {
      obstacle[y * COLS + x] = 7;
      if (y === 0) exits.push([x, -1]); else if (y === ROWS - 1) exits.push([x, ROWS]);
      else if (x === 0) exits.push([-1, y]); else if (x === COLS - 1) exits.push([COLS, y]);
    }
  }
  if (exits.length) [exitX, exitY] = exits[0];
  if (!cfg.swell) return;
  // duvara ya da kanala bitişik iki katman şişkin mukoza: önce dış katman, sonra onun içi
  const closed = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || obstacle[y * COLS + x] === 5 || obstacle[y * COLS + x] === 7;
  const layer = (stage, touches) => {
    const mark = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x; if (obstacle[i]) continue;
      for (let d = 0; d < 4; d++) if (touches(x + DX[d], y + DY[d])) { mark.push(i); break; }
    }
    for (const i of mark) { obstacle[i] = 6; swellAt[i] = stage; }
  };
  layer(2, closed);
  layer(1, (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && swellAt[y * COLS + x] === 2);
}
function shrinkFx(x, y) {
  const p = PARTS[partCursor = (partCursor + 1) % PARTS.length];
  p.s.visible = true; p.s.texture = T.swell; p.s.tint = 0xFFFFFF; p.s.position.set((x + .5) * cell, (y + .5) * cell);
  p.s.rotation = ((y * COLS + x) * 1.7) % 6.28; p.vr = 0; p.vx = p.vy = 0; p.max = p.life = 450; p.size = cell * 1.3;
}
function recedeSwelling() {
  const at = cfg.swellAt || SWELL_AT;
  while (swellStage < 2 && eaten / target >= at[swellStage]) {
    const stage = ++swellStage; let n = 0;
    for (let i = 0; i < obstacle.length; i++) if (obstacle[i] === 6 && swellAt[i] === stage) {
      obstacle[i] = 0; const x = i % COLS, y = (i / COLS) | 0;
      shrinkFx(x, y); if (n++ % 4 === 0) foam((x + .5) * cell, (y + .5) * cell, 1, .5);
    }
    placeObstacleSprites(); sfx('open');
    callout(stage === 1 ? 'Şişlik çekiliyor' : 'Sinüs genişledi', stage === 1 ? 'Akışa yer açıldı' : 'Ostiuma giden yol açılıyor');
  }
}
function openOstium() {
  for (let i = 0; i < obstacle.length; i++) if (obstacle[i] === 7) { obstacle[i] = 0; shrinkFx(i % COLS, (i / COLS) | 0); foam(((i % COLS) + .5) * cell, (((i / COLS) | 0) + .5) * cell, 2, .5); }
  placeObstacleSprites();
}

/* =========================================================================
   NESNELER
   ========================================================================= */
function bodyAt(x, y, skipTail) { const n = skipTail ? len - 1 : len; for (let i = 0; i < n; i++) if (bx[i] === x && by[i] === y) return true; return false; }
function itemAt(x, y) { for (const it of items) if (it.x === x && it.y === y) return it; return null; }
function moverAt(x, y) { for (const m of movers) if (m.x === x && m.y === y) return m; return null; }
// iki ya da daha fazla yanı duvar, engel ya da şişlik olan hücre: köşe, cep ya da çıkmaz
function tightCell(x, y) {
  let n = 0;
  for (let d = 0; d < 4; d++) { const X = x + DX[d], Y = y + DY[d]; if (X < 0 || Y < 0 || X >= COLS || Y >= ROWS || obstacle[Y * COLS + X]) n++; }
  return n >= 2;
}
function occupied(x, y) { return obstacle[y * COLS + x] || bodyAt(x, y) || itemAt(x, y) || moverAt(x, y) || virusAt(x, y); }

function spawn(type) {
  for (let pass = 0; pass < 2; pass++) {
    const cand = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (occupied(x, y) || rimCell[y * COLS + x]) continue;
      if (pass === 0 && Math.abs(x - bx[0]) + Math.abs(y - by[0]) < 3) continue;
      if (pass === 0 && movers.some(m => m.y === y)) continue;          // tıkaç hattına mukus bırakma
      if (pass === 0 && tightCell(x, y)) continue;                      // köşeye ve çıkmaza mukus bırakma: uzun akışla dönmek zor
      cand.push(x, y);
    }
    if (!cand.length) continue;
    const k = ((rnd() * cand.length / 2) | 0) * 2;
    const vr = (rnd() * 3) | 0, tex = type === 'mucus' ? T.mucus[vr] : T[type];
    const s = new PIXI.Sprite(tex); s.anchor.set(.5); itemLayer.addChild(s);
    const life = type === 'gold' ? 6000 : type === 'serum' || type === 'breeze' || type === 'immune' ? 8000 : Infinity;
    const it = { type, x: cand[k], y: cand[k + 1], s, born: gameTime, life, ph: Math.random() * 6.28, pop: 0, var: vr, infected: false };
    placeItem(it, true); items.push(it);
    return it;
  }
  return null;
}
function placeItem(it, snap) {
  it.tx = (it.x + .5) * cell; it.ty = (it.y + .5) * cell;
  if (snap) { it.cx = it.tx; it.cy = it.ty; it.s.position.set(it.tx, it.ty); }
  it.base = cell * HALO * (it.type === 'mucus' ? 1.5 : 1.45);   // doku haleli: öğenin kendisi hücreden biraz büyük görünür
}
function removeItem(it) { it.s.destroy(); const i = items.indexOf(it); if (i >= 0) items.splice(i, 1); }
const countType = t => items.reduce((n, it) => n + (it.type === t), 0);

function openExit() {
  exitOpen = true;
  if (cfg.shape) openOstium(); else pickExit();
  gateLayer.visible = true; placeGate();
  for (const it of items.slice()) if ((it.type === 'mucus' && !it.infected) || it.type === 'immune') removeItem(it);   // virüslü olanlar kalır, hâlâ taşınabilir
  callout('Ostium açıldı!', 'Akışı parlayan çıkışa götür'); sfx('open'); hudBar();
}
function pickExit() {
  const opts = [];
  const free = (x, y) => !obstacle[y * COLS + x] && !rimCell[y * COLS + x];
  for (let x = 1; x < COLS - 1; x++) { if (free(x, 0)) opts.push([x, -1]); if (free(x, ROWS - 1)) opts.push([x, ROWS]); }
  for (let y = 1; y < ROWS - 1; y++) { if (free(0, y)) opts.push([-1, y]); if (free(COLS - 1, y)) opts.push([COLS, y]); }
  const d = o => Math.abs(o[0] - bx[0]) + Math.abs(o[1] - by[0]);
  opts.sort((a, b) => d(b) - d(a));
  [exitX, exitY] = opts[(Math.random() * Math.min(12, opts.length)) | 0];
  exits = [[exitX, exitY]];
}
const isExit = (x, y) => exits.some(e => e[0] === x && e[1] === y);
const exitEdge = (x, y) => exits.some(e => Math.min(COLS - 1, Math.max(0, e[0])) === x && Math.min(ROWS - 1, Math.max(0, e[1])) === y);
function placeGate() {
  if (!gateLayer.visible) return;
  const ex = exits.reduce((a, e) => a + e[0], 0) / exits.length, ey = exits.reduce((a, e) => a + e[1], 0) / exits.length, k = exits.length > 1 ? 1.5 : 1;
  const gx = (Math.min(Math.max(ex, 0), COLS - 1) + .5) * cell, gy = (Math.min(Math.max(ey, 0), ROWS - 1) + .5) * cell;
  gateGlow.position.set(gx, gy); gateRing.position.set(gx, gy);
  gateGlow.width = gateGlow.height = cell * 3.2 * k; gateRing.width = gateRing.height = cell * 1.25 * k;
}

/* =========================================================================
   BAĞIŞIKLIK HÜCRESİ: virüslü bölümde çıkar. Alınınca virüsler bir süre çoğalamaz.
   Virüse karşı antibiyotik değil, vücudun kendi savunması çalışır.
   ========================================================================= */
const IMMUNE_MS = 8000;
function maybeImmune() {
  // sinüste virüs varken çıkar: serbest, mukusa yapışmış ya da akışın taşıdığı
  const virusNow = viruses.length || carriedAt.length || items.some(it => it.infected);
  if (!cfg.immune || exitOpen || !virusNow || countType('immune') || gameTime < immuneUntil || Math.random() >= cfg.immune) return;
  if (spawn('immune') && !lv.immuneSeen++) callout('Bağışıklık hücresi geldi', 'Topla, virüsler bir süre çoğalamasın');
}
function takeImmune(it) {
  const cx = (it.x + .5) * cell, cy = (it.y + .5) * cell;
  removeItem(it); lv.immunes++; immuneUntil = gameTime + IMMUNE_MS;
  for (const v of viruses) burst((v.x + .5) * cell, (v.y + .5) * cell, 8, 0xB49AEE);   // savunma virüslere ulaşır
  burst(cx, cy, 16, 0xB49AEE); sfx('immune');
  callout('Bağışıklık devrede', 'Virüsler bir süre çoğalamaz');
  prog.immunes++; if (prog.immunes >= 10) award('immune10');
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
  if (state === 'exiting') { advance(exitDir, false); vacated(px[prevLen - 1], py[prevLen - 1]); stepMovers(); stepViruses(); if (mode === 'versus') mpSend(); if (++exitSteps > len + 2) finishLevel(); return; }
  if (mode === 'demo' || autoBot) dir = botDir();
  else if (queue.length) dir = queue.shift();
  const nx = bx[0] + DX[dir], ny = by[0] + DY[dir];
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
    if (exitOpen && isExit(nx, ny)) {
      state = 'exiting'; exitDir = moveDir = dir; exitSteps = 0;
      const bonus = len * 5 + lv.carried * 40 * (1 + levelIdx); score += bonus; hudScore();
      popup('+' + bonus, (bx[0] + .5) * cell, (by[0] + .5) * cell, 0x7CF2DD);
      if (lv.carried) {
        lv.expelled = lv.carried; prog.viruses += lv.carried; if (prog.viruses >= 20) award('virus20');
        callout(`${lv.carried} virüs dışarı atıldı`, 'Mukus yakaladı, akış ostiumdan taşıdı');
      }
      burst((nx + .5) * cell, (ny + .5) * cell, 26, 0x2FD6BE); petalBurst((bx[0] + .5) * cell, (by[0] + .5) * cell, 22);
      advance(dir, false); sfx('exit'); return;
    }
    return die('wall');
  }
  const ob = obstacle[ny * COLS + nx];
  if (ob) return die(ob === 2 ? 'crust' : ob === 5 ? 'wall' : ob >= 6 ? 'swell' : 'polyp');
  if (moverAt(nx, ny)) return die('plug');
  const willGrow = grow > 0;
  for (let i = 1; i < (willGrow ? len : len - 1); i++) if (bx[i] === nx && by[i] === ny) return die('self');
  const hitV = gameTime >= hurtUntil ? virusAt(nx, ny) : null;
  advance(dir, willGrow, nx, ny); moveDir = dir;
  if (!willGrow) vacated(px[prevLen - 1], py[prevLen - 1]);
  if (willGrow) grow--;
  if (len > lv.maxLen) lv.maxLen = len;
  visit(nx, ny);
  const it = itemAt(nx, ny); if (it) consume(it);
  if (hitV) virusHit(hitV);
  if (gameTime < breezeUntil) pullItems();
  stepMovers(); stepViruses();
  if (mode !== 'demo' && len >= 40) award('len40');
  if (mode === 'demo' && len > (cfg.face ? 16 : 30)) setupBoard(DEMO);
  if (mode === 'versus') mpSend();   // menüdeki sinüsler dar: akış kısa kalsın
}
function stepMovers() {
  for (const m of movers) {
    m.px = m.x; m.py = m.y;
    if (stepCount % 2) continue;
    const blocked = x => x < 0 || x >= COLS || obstacle[m.y * COLS + x] || bodyAt(x, m.y) || itemAt(x, m.y) || moverAt(x, m.y) || virusAt(x, m.y);
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
  const tier = 1 + levelIdx;
  if (it.type === 'mucus') {
    eaten += it.infected && mode !== 'demo' ? 2 : 1; grow += 2;   // virüslü mukus tıkanıklığı iki kat azaltır
    combo = (gameTime - lastEat < COMBO_WINDOW) ? combo + 1 : 1; lastEat = gameTime;
    let pts = 10 * tier + (combo > 1 ? combo * 5 : 0);
    if (it.infected) {
      lv.carried++; carriedAt.push(stepCount); pts += 20 * tier;
      if (lv.carried === 1) callout('Virüs yakalandı!', 'Sinüs rahatladı, çıkışa taşı');
    }
    burst(cx, cy, 7, 0xC3CF3E); foam(cx, cy, 8, .6); sfx('eat');
    if (mode !== 'demo') award('first');
    if (combo >= 3 && combo % 3 === 0) {
      boostUntil = gameTime + 1400; pts += 25 * tier;
      lv.sneezes++; gameSneezes++;
      if (mode !== 'demo') { callout('Hapşırma refleksi!', 'Akış bir anlığına hızlandı'); if (gameSneezes >= 5) award('sneeze5'); sneeze(dir); }
      sfx('sneeze');
      if (mode === 'demo') { burst((bx[0] + .5) * cell, (by[0] + .5) * cell, 18, 0xF06AAE); petalBurst((bx[0] + .5) * cell, (by[0] + .5) * cell, 12); }
    }
    score += pts; if (mode !== 'demo') popup('+' + pts, cx, cy, 0xFFFFFF);
    removeItem(it);
    if (cfg.swell) recedeSwelling();
    if (eaten >= target) { if (!exitOpen) openExit(); }
    else if (eaten + countType('mucus') < target) spawn('mucus');
    if (!exitOpen) {
      if (!countType('gold') && rnd() < cfg.gold) spawn('gold');
      if (!countType('serum') && rnd() < cfg.serum) spawn('serum');
      if (!countType('breeze') && rnd() < cfg.breeze) spawn('breeze');
      maybeImmune();
    }
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
  } else if (it.type === 'immune') takeImmune(it);
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
  if (obstacle[y * COLS + x] || bodyAt(x, y) || moverAt(x, y) || virusAt(x, y)) return false;
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
    if (emptyCell(x, y) && !rimCell[y * COLS + x] && Math.abs(x - bx[0]) + Math.abs(y - by[0]) >= 7 && !movers.some(m => m.y === y)) cand.push(x, y);
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
  flashG.alpha = .22; if (mode !== 'demo') quake(.55); sfx('hurt');
  if (mode !== 'demo') buzz(30);
  callout('Virüse çarptın', 'Akış kısaldı. Virüsü mukusa yakalat');
  removeVirus(v); spawnVirus();          // virüs sekip uzağa savrulur
}
function updateViruses(dt) {
  if (!cfg.virus) return;
  if (cfg.replicate) for (const v of viruses.slice()) {
    if (gameTime < immuneUntil) { v.rep += dt; continue; }   // bağışıklık devredeyken çoğalamaz
    if (gameTime < v.rep) continue;
    v.rep = gameTime + cfg.replicate;
    if (viruses.length >= cfg.virusMax) continue;
    const opts = [];
    for (let d = 0; d < 4; d++) if (emptyCell(v.x + DX[d], v.y + DY[d])) opts.push(d);
    if (!opts.length) continue;
    const d = opts[(Math.random() * opts.length) | 0], n = addVirus(v.x + DX[d], v.y + DY[d]);
    n.px = v.x; n.py = v.y; lv.replicated++;
    burst((n.x + .5) * cell, (n.y + .5) * cell, 10, 0xF2683A); sfx('replicate');
    if (lv.replicated === 1) callout('Virüs çoğaldı', 'Bağışıklık hücresi çoğalmayı durdurur');
    maybeImmune();
  }
}
function renderViruses(a, dt, now) {
  for (const v of viruses) {
    v.pop = Math.min(1, v.pop + dt / 280);
    const popS = v.pop < 1 ? 1 - Math.pow(1 - v.pop, 3) + Math.sin(v.pop * Math.PI) * .25 : 1;
    const left = v.rep - gameTime;     // çoğalmadan hemen önce şişip titrer
    const guarded = gameTime < immuneUntil;   // bağışıklık etkisi: virüsler soluk, çoğalma titremesi yok
    v.s.tint = guarded ? 0xD8E6FF : 0xFFFFFF; v.s.alpha = guarded ? .75 : 1;
    const swell = cfg.replicate && !guarded && left < 1500 ? (1 - Math.max(0, left) / 1500) * .22 * (.6 + .4 * Math.sin(now * .03)) : 0;
    v.s.position.set((v.px + (v.x - v.px) * a + .5) * cell, (v.py + (v.y - v.py) * a + .5) * cell);
    v.s.width = v.s.height = cell * HALO * 1.3 * popS * (1 + .05 * Math.sin(now * .006 + v.ph) + swell);
    v.s.rotation = Math.sin(now * .002 + v.ph) * .5;
  }
}

// akış zeminde iz bırakmaz; yalnızca ilk geçtiği hücrede kuyruk ayrılınca kısa süre çiçek açar (vacated)
function visit(x, y, instant) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  const i = y * COLS + x; if (visited[i]) return;
  visited[i] = 1; if (!instant) freshCell[i] = 1;
}

/* Demo botu: hedefe yönel, sıkışacağı yönlerden flood-fill ile kaçın */
function flood(sx, sy, limit) {
  scratch.fill(0);
  for (let i = 0; i < len - 1; i++) scratch[by[i] * COLS + bx[i]] = 1;
  for (let i = 0; i < obstacle.length; i++) if (obstacle[i]) scratch[i] = 1;
  const q = [sx, sy]; scratch[sy * COLS + sx] = 1; let n = 0, h = 0;
  while (h < q.length && n < limit) {
    const x = q[h++], y = q[h++]; n++;
    if (exitOpen && exitEdge(x, y)) return limit;   // açık çıkışa varan yol çıkmaz sokak değil
    for (let d = 0; d < 4; d++) { const X = x + DX[d], Y = y + DY[d]; if (X < 0 || Y < 0 || X >= COLS || Y >= ROWS || scratch[Y * COLS + X]) continue; scratch[Y * COLS + X] = 1; q.push(X, Y); }
  }
  return n;
}
// engelleri dolaşan yol mesafesi (gövde yok sayılır); ulaşılamayan hücre -1
const distBuf = new Int16Array(COLS * ROWS);
function distField(sx, sy) {
  distBuf.fill(-1);
  const q = [sx, sy]; distBuf[sy * COLS + sx] = 0; let h = 0;
  while (h < q.length) {
    const x = q[h++], y = q[h++], d0 = distBuf[y * COLS + x];
    for (let d = 0; d < 4; d++) {
      const X = x + DX[d], Y = y + DY[d], i = Y * COLS + X;
      if (X < 0 || Y < 0 || X >= COLS || Y >= ROWS || distBuf[i] >= 0 || obstacle[i]) continue;
      distBuf[i] = d0 + 1; q.push(X, Y);
    }
  }
  return distBuf;
}
function botDir() {
  const hx = bx[0], hy = by[0];
  // hedef: çıkış açıksa çıkış, değilse yol mesafesiyle en yakın mukus, altın ya da bağışıklık hücresi; virüsten ve tıkaçtan kaçın.
  // Mesafe duvarların etrafından ölçülür (şekilli sinüslerde düz mesafe yanıltır).
  let tx, ty, md = 1e9;
  if (exitOpen) { tx = Math.min(COLS - 1, Math.max(0, exitX)); ty = Math.min(ROWS - 1, Math.max(0, exitY)); }
  else {
    const fromHead = distField(hx, hy);
    for (const it of items) if (it.type === 'mucus' || it.type === 'gold' || it.type === 'immune') {
      const k = fromHead[it.y * COLS + it.x]; if (k >= 0 && k < md) { md = k; tx = it.x; ty = it.y; }
    }
  }
  const toTarget = tx !== undefined ? distField(tx, ty).slice() : null;
  let best = dir, bestS = -1e9;
  for (let d = 0; d < 4; d++) {
    if (d === (moveDir + 2) % 4) continue;
    const nx = hx + DX[d], ny = hy + DY[d];
    if (exitOpen && isExit(nx, ny)) return d;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || obstacle[ny * COLS + nx] || bodyAt(nx, ny, true) || moverAt(nx, ny)) continue;
    const space = flood(nx, ny, 120), it = itemAt(nx, ny);
    const td = toTarget ? toTarget[ny * COLS + nx] : 0;
    let s = (toTarget ? (td >= 0 ? -td : -200) : 0) + (space < len + 6 ? -500 + space : 0) + (d === moveDir ? .3 : 0);
    if (gameTime >= hurtUntil && virusAt(nx, ny)) s -= 100;
    if (moverAt(nx - 1, ny) || moverAt(nx + 1, ny)) s -= 60;
    if (s > bestS) { bestS = s; best = d; }
  }
  return best;
}

/* =========================================================================
   OYUN SONU / BÖLÜM SONU
   ========================================================================= */
function die(reason) {
  deathReason = reason;
  if (mode === 'demo') { state = 'dying'; burst((bx[0] + .5) * cell, (by[0] + .5) * cell, 20, 0xF06AAE); setTimeout(() => { if (mode === 'demo') { setupBoard(DEMO); state = 'demo'; } }, 700); return; }
  state = 'dying'; flashG.alpha = .5; quake(.85); sfx('die');
  burst((bx[0] + .5) * cell, (by[0] + .5) * cell, 34, 0xFF4A6A);
  buzz(70);
  if (mode === 'versus') return mpFinish(false);
  prog.best = Math.max(prog.best, score); save();
  setTimeout(() => {
    state = 'over';
    $('overReason').textContent = REASONS[reason];
    $('ovScore').textContent = score; $('ovBest').textContent = prog.best; $('ovLevel').textContent = `${levelIdx + 1}/${LEVELS.length}`;
    $('ovTip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
    musicScene('menu');   // koşu bitti: sakin menü müziği
    askName({ s: score, l: levelIdx, f: false }, () => { state = 'over'; show('scrOver'); });
  }, 800);
}

function evalGoal([t, v], st) {
  return { time: st.time <= v, sneeze: st.sneezes >= v, gold: st.golds >= v, len: st.maxLen >= v, nohard: st.hardened === 0, virus: st.expelled >= v, noinfect: st.replicated === 0, immune: st.immunes >= v }[t];
}
function finishLevel() {
  state = 'result'; cleared = true;
  if (mode === 'versus') return mpFinish(true);
  const L = LEVELS[levelIdx];
  const st = { ...lv, time: Math.round((gameTime - levelStart) / 1000) };
  const got = [true, evalGoal(L.obj[0], st), evalGoal(L.obj[1], st)];
  const mask = got.reduce((m, g, i) => m | (g ? 1 << i : 0), 0);
  prog.mask[levelIdx] |= mask; prog.done[levelIdx] = true; prog.best = Math.max(prog.best, score);
  const newFact = !prog.facts[levelIdx]; prog.facts[levelIdx] = true;
  save();
  if (mask === 7) award('perfect');
  if (prog.done.every(Boolean)) award('all');
  if (totalStars() >= 10) award('stars10');
  if (totalStars() >= LEVELS.length * 3) award('starsAll');

  $('tResult').textContent = L.name + ' temizlendi';
  const goals = [['Bölümü tamamla', true], [GOAL_TEXT[L.obj[0][0]](L.obj[0][1]), got[1]], [GOAL_TEXT[L.obj[1][0]](L.obj[1][1]), got[2]]];
  $('reGoals').innerHTML = goals.map(([t, g]) => `<li><span class="st ${g ? 'on' : ''}">★</span>${t}<span class="ok ${g ? 'y' : 'n'}">${g ? '✓' : '✗'}</span></li>`).join('');
  $('reVirusWrap').style.display = L.virus ? '' : 'none'; $('reVirus').textContent = lv.expelled;
  $('reScore').textContent = score; $('reLen').textContent = lv.maxLen; $('reTime').textContent = st.time + ' sn';
  $('reFactTitle').textContent = newFact ? 'Yeni bilgi kartı açıldı' : 'Biliyor muydunuz?';
  $('reFact').querySelector('.em').textContent = FACTS[levelIdx][0];
  $('reFactText').textContent = FACTS[levelIdx][1];
  const last = levelIdx === LEVELS.length - 1;
  if (last) musicScene('win');
  $('btnNext').textContent = last ? 'Ana menüye dön' : 'Sonraki: ' + LEVELS[levelIdx + 1].name;
  $('reClose').style.display = last ? '' : 'none';
  // önce sinüsün açıldığı an, sonra sonuç kartı
  exitFx(); callout(L.name + ' açıldı!', 'Hava yeniden akıyor');
  setTimeout(() => {
    gateLayer.visible = false;
    if (state !== 'result') return;
    const reveal = () => {
      state = 'result';
      const starsEl = $('reStars'); starsEl.classList.remove('go');
      [...starsEl.children].forEach((s, i) => s.classList.toggle('on', got[i]));
      void starsEl.offsetWidth; starsEl.classList.add('go');
      got.forEach((g, i) => g && setTimeout(() => sfx('star'), 200 + i * 180));
      show('scrResult');
    };
    // oyun bitti: tüm bölümler boyunca biriken skor tabloya
    if (last) askName({ s: score, l: levelIdx, f: true }, reveal); else reveal();
  }, REDUCED ? 300 : 1500);
}
// ostium açıldı: çıkışta köpük ve taç yaprakları
function exitFx() {
  const ox = Math.min(COLS - 1, Math.max(0, exitX)), oy = Math.min(ROWS - 1, Math.max(0, exitY));
  sfx('breeze'); foam((ox + .5) * cell, (oy + .5) * cell, 10, 1.5); petalBurst((ox + .5) * cell, (oy + .5) * cell, 16);
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
/* =========================================================================
   KAMERA: sarsıntı her karede rastgele titreme değil; yaylı bir itiş ve yumuşak gürültü.
   Hapşırma iki aşamalı: "ha..." (tahta bir an geri çekilip içe toplanır), ardından "hapşu!" (akışın yönünde güçlü itiş,
   hafif büyüme ve dönme; yay birkaç salınımla yerine oturur), burundan öne püsküren damlacıklar ve genişleyen bir hava dalgası.
   Çarpma ve ölüm: sönen bir sarsıntı (trauma). Hareket azaltılmışsa kamera kıpırdamaz.
   ========================================================================= */
const cam = { x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, z: 0, vz: 0, trauma: 0 };
const CAM_W = 2 * Math.PI * 5.2, CAM_Z = .26, ZOOM_W = 2 * Math.PI * 6.5, ZOOM_Z = .38;   // yayın sıklığı (rad/sn) ve sönümü
const SNEEZE_LEAD = 150;   // "ha..." ile "hapşu!" arası (ms); ses de aynı aralıkla çalar
let sneezeAt = 0, sneezeDir = 0, pre = 0;   // pre: "ha..." sırasında geri çekilme (0..1)
const waveG = new PIXI.Graphics(); fxLayer.addChild(waveG);
let wave = null;
function quake(t) { if (!REDUCED) cam.trauma = Math.min(1, cam.trauma + t); }
function sneeze(d) {
  sneezeDir = d; sneezeAt = performance.now() + SNEEZE_LEAD;
}
const PRE_PULL = .3, PRE_ZOOM = -.016;   // nefes alırken geri çekilme (hücre) ve içe toplanma
function sneezeBlast() {
  const d = sneezeDir, hx = (bx[0] + .5) * cell, hy = (by[0] + .5) * cell, side = Math.random() < .5 ? -1 : 1;
  buzz(35);
  if (!REDUCED) {   // geri çekilmiş yerden bırakılır, üstüne öne doğru itiş
    cam.x -= DX[d] * cell * PRE_PULL; cam.y -= DY[d] * cell * PRE_PULL; cam.z += PRE_ZOOM; pre = 0;
    cam.vx += DX[d] * cell * 44; cam.vy += DY[d] * cell * 44; cam.vz += 2; cam.vr += side * .9; quake(.32);
    wave = { x: hx + DX[d] * cell * .6, y: hy + DY[d] * cell * .6, t: 0 };
  }
  spray(hx, hy, d, 26); petalBurst(hx, hy, 12); burst(hx, hy, 10, 0xF06AAE);
}
// hapşırma damlacıkları: başın önünde dar bir koni içinde hızla saçılır
function spray(x, y, d, n) {
  const a0 = Math.atan2(DY[d], DX[d]);
  for (let k = 0; k < n; k++) {
    const p = PARTS[partCursor = (partCursor + 1) % PARTS.length];
    const a = a0 + (Math.random() - .5) * 1.1, sp = (.18 + Math.random() * .42) * cell;
    p.s.visible = true; p.s.texture = T.dot; p.s.tint = Math.random() < .6 ? 0xFFFFFF : 0xD9F6EF; p.s.position.set(x, y); p.s.rotation = 0; p.vr = 0;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.max = p.life = 380 + Math.random() * 360; p.size = cell * (.12 + Math.random() * .2);
  }
}
const camNoise = (t, s) => Math.sin(t * 17.3 + s) * .55 + Math.sin(t * 29.1 + s * 2.3) * .3 + Math.sin(t * 47.7 + s * 3.1) * .15;
function updateCamera(dt, now) {
  if (sneezeAt) {
    const k = 1 - (sneezeAt - now) / SNEEZE_LEAD;
    if (k >= 1) { sneezeAt = 0; pre = 0; if (state === 'play' || state === 'exiting') sneezeBlast(); }
    else if (!REDUCED) pre = Math.max(0, k) * Math.max(0, k);   // yavaşça başlayıp hızlanan nefes
  }
  for (let left = dt; left > 0; left -= 8) {   // yay küçük adımlarla: kare hızı düşse de aynı salınım
    const h = Math.min(8, left) / 1000;
    cam.vx += (-CAM_W * CAM_W * cam.x - 2 * CAM_Z * CAM_W * cam.vx) * h; cam.x += cam.vx * h;
    cam.vy += (-CAM_W * CAM_W * cam.y - 2 * CAM_Z * CAM_W * cam.vy) * h; cam.y += cam.vy * h;
    cam.vr += (-CAM_W * CAM_W * cam.r - 2 * CAM_Z * CAM_W * cam.vr) * h; cam.r += cam.vr * h;
    cam.vz += (-ZOOM_W * ZOOM_W * cam.z - 2 * ZOOM_Z * ZOOM_W * cam.vz) * h; cam.z += cam.vz * h;
  }
  cam.trauma = Math.max(0, cam.trauma - dt * .0017);
  const q = cam.trauma * cam.trauma, t = now / 1000;
  const px0 = -DX[sneezeDir] * cell * PRE_PULL * pre, py0 = -DY[sneezeDir] * cell * PRE_PULL * pre;
  const ox = cam.x + px0 + q * cell * .9 * camNoise(t, 1), oy = cam.y + py0 + q * cell * .9 * camNoise(t, 7), rot = cam.r + q * .03 * camNoise(t, 13);
  board.pivot.set(boardW / 2, boardH / 2);
  board.position.set(baseX + boardW / 2 + ox, baseY + boardH / 2 + oy);
  board.rotation = rot; board.scale.set(1 + cam.z + PRE_ZOOM * pre);
  // hava dalgası: başın önünden genişleyip söner
  waveG.clear();
  if (wave) {
    wave.t += dt; const k = wave.t / 460;
    if (k >= 1) wave = null;
    else { const e = 1 - (1 - k) * (1 - k); waveG.circle(wave.x, wave.y, cell * (.6 + 6.5 * e)).stroke({ width: cell * (.42 - .3 * k), color: 0xFFFFFF, alpha: .55 * (1 - k) }); }
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
// akışın ilk geçtiği hücre, kuyruk oradan ayrılınca kısa süre çiçek açar
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
  placeCallout();
  calloutEl.classList.remove('go'); void calloutEl.offsetWidth; calloutEl.classList.add('go');
}
// Yer varsa tahtanın üstündeki şeritte; yoksa (yatay ekran) tahtanın üstünde, başın ve ostiumun uzağındaki bantta
function placeCallout() {
  const gutter = baseX - Math.round(cell * .34) - 12;
  const side = mode !== 'versus' && calloutBand < 60 && gutter >= 120;
  calloutEl.style.left = side ? Math.round(baseX + boardW + cell * .34 + 6 + gutter / 2) + 'px' : mode === 'versus' ? Math.round(viewR.x + viewR.w / 2) + 'px' : '';
  calloutEl.style.maxWidth = side ? Math.round(gutter - 8) + 'px' : '';
  calloutEl.classList.toggle('side', side);
  const h = calloutEl.offsetHeight;
  if (side) { calloutEl.style.top = Math.round(baseY + boardH * .3) + 'px'; return; }
  if (calloutBand >= h + 4) { calloutEl.style.top = Math.round(viewR.y + (calloutBand - h) / 2 + 2) + 'px'; return; }   // şerit kendi alanının üstünde
  const hy = baseY + (by[0] + .5) * cell, gy = gateLayer.visible ? baseY + gateGlow.y : -1e9;
  const score = y => Math.abs(y + h / 2 - hy) - (Math.abs(y + h / 2 - gy) < cell * 4 ? 1e4 : 0);
  const top = baseY + boardH * .1, bottom = baseY + boardH * .72;
  calloutEl.style.top = Math.round(score(top) >= score(bottom) ? top : bottom) + 'px';
}
const toastQ = []; let toastBusy = false;
function award(id) {
  if (prog.badges[id]) return;
  prog.badges[id] = Date.now(); save();
  const b = BADGES.find(b => b[0] === id); toastQ.push(b);
  if (!toastBusy) nextToast();
}
function nextToast() {
  const b = toastQ.shift(); if (!b) { toastBusy = false; return; }
  toastBusy = true; sfx('badge');
  $('toastEm').textContent = b[1]; $('toastTitle').textContent = 'Rozet: ' + b[2]; $('toastDesc').textContent = b[3];
  // oyun sırasında altta (üst bilgiyi ve mesajları örtmesin), kart açıkken üstte (kartın düğmelerini örtmesin)
  $('toast').classList.toggle('low', state === 'play' || state === 'exiting'); $('toast').classList.add('on');
  setTimeout(() => { $('toast').classList.remove('on'); setTimeout(nextToast, 400); }, 2300);
}

/* =========================================================================
   RENDER
   ========================================================================= */
function rgb(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
function mixc(a, b, t) { return ((a[0] + (b[0] - a[0]) * t) << 16) | ((a[1] + (b[1] - a[1]) * t) << 8) | (a[2] + (b[2] - a[2]) * t); }
function hsl(h) { const f = n => { const k = (n + h * 12) % 12; return Math.round(255 * (.62 - .38 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return (f(0) << 16) | (f(8) << 8) | f(4); }
const WHITE = [255, 255, 255], BOOSTC = rgb(0xF06AAE);
const WILT = rgb(0x9C8F96);
let skin = SKINS[0], skinBody = WHITE;
let headRot = Math.PI, headFlip = 1, headFlipS = 1, headPulse = 0;

/* Sıklamen yılanın taç yaprak rengi: çizimdeki pembe (PINK) görünümün rengine taşınır; ton kaydırılır, doygunluk ve
   açıklık oranlanır, gölge/ışık farkı korunur. Yeşil ve sarı pikseller (yaprak, sap, başçıklar) değişmez. */
const PINK = 0xF8157E;
function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function fromHsl(h, s, l) {
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h * 12) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
const yilanCache = {};
// hueAt verilirse (gökkuşağı önizlemesi) ton soldan sağa değişir
function yilanCanvas(name, petal, hueAt) {
  const key = name + ':' + petal + (hueAt ? ':r' : '');
  if (yilanCache[key]) return yilanCache[key];
  const src = YI[name];
  if (petal === PINK && !hueAt) return yilanCache[key] = src;
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
  const [h0, s0, l0] = toHsl(...rgb(PINK));
  let [ht, st, lt] = toHsl(...rgb(petal)); lt = Math.min(lt, .86);   // beyaz bile gölgesini korusun
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (!d[i + 3] || r < g + 25 || b < g - 10) continue;   // yalnızca pembe/mor
    let [h, s, l] = toHsl(r, g, b);
    h = (h + (hueAt ? hueAt((i >> 2) % c.width / c.width) : ht) - h0 + 2) % 1; s = Math.min(1, s * st / s0);
    l = l <= l0 ? l * lt / l0 : lt + (l - l0) * (1 - lt) / (1 - l0);
    [d[i], d[i + 1], d[i + 2]] = fromHsl(h, s, l);
  }
  x.putImageData(im, 0, 0);
  return yilanCache[key] = c;
}
const yilanTex = {};
function yilanDoku(name, petal) { const key = name + ':' + petal; return yilanTex[key] || (yilanTex[key] = PIXI.Texture.from(yilanCanvas(name, petal))); }
// gökkuşağı: 24 ton, çizimdeki pembenin doygunluğu ve açıklığıyla
const RAINBOW = Array.from({ length: 24 }, (_, i) => { const [, s, l] = toHsl(...rgb(PINK)), [r, g, b] = fromHsl(i / 24, s, l); return (r << 16) | (g << 8) | b; });
const petalOf = (ph, now) => skin.petal === -1 ? RAINBOW[Math.floor(((now * .0003 + ph) % 1) * 24)] : skin.petal;

/* Gövde yolu: segment merkezlerinden geçen, köşeleri çeyrek eğriyle yuvarlatılmış çizgi. u = baştan uzaklık (segment
   indeksi, hücre); segment i, u = i'de. Süsler de u ile yerleşir, böylece gövdeyle birlikte ilerler. */
const PT = { x: 0, y: 0, tx: 1, ty: 0 };
function pathAt(u) {
  const n = len, X = i => (ix[i] + .5) * cell, Y = i => (iy[i] + .5) * cell;
  if (u >= n - 1) {   // kuyruk ucunun ötesi: son yönde düz devam
    const dx = X(n - 1) - X(n - 2), dy = Y(n - 1) - Y(n - 2), m = Math.hypot(dx, dy) || 1, e = (u - n + 1) * cell;
    PT.tx = dx / m; PT.ty = dy / m; PT.x = X(n - 1) + PT.tx * e; PT.y = Y(n - 1) + PT.ty * e; return PT;
  }
  if (n < 3 || u < .5 || u > n - 1.5) {   // uçlarda düz parça (baştan ilk köşeye, son köşeden kuyruğa)
    const j = n < 3 || u < .5 ? 0 : n - 2;
    let ax = X(j), ay = Y(j), bx_ = X(j + 1), by_ = Y(j + 1), s = u - j;
    if (n >= 3) {
      if (j === 0) { bx_ = (ax + bx_) / 2; by_ = (ay + by_) / 2; s = u / .5; }
      else { ax = (ax + bx_) / 2; ay = (ay + by_) / 2; s = (u - (n - 1.5)) / .5; }
    }
    const dx = bx_ - ax, dy = by_ - ay, m = Math.hypot(dx, dy) || 1;
    PT.x = ax + dx * s; PT.y = ay + dy * s; PT.tx = dx / m; PT.ty = dy / m; return PT;
  }
  const i = Math.max(1, Math.min(n - 2, Math.round(u)));
  const cx = X(i), cy = Y(i), ax = (X(i - 1) + cx) / 2, ay = (Y(i - 1) + cy) / 2, bx_ = (cx + X(i + 1)) / 2, by_ = (cy + Y(i + 1)) / 2;
  const s = u - (i - .5), t = 1 - s;
  PT.x = t * t * ax + 2 * t * s * cx + s * s * bx_; PT.y = t * t * ay + 2 * t * s * cy + s * s * by_;
  let dx = t * (cx - ax) + s * (bx_ - cx), dy = t * (cy - ay) + s * (by_ - cy), m = Math.hypot(dx, dy);
  if (m < 1e-6) { dx = bx_ - ax; dy = by_ - ay; m = Math.hypot(dx, dy) || 1; }
  PT.tx = dx / m; PT.ty = dy / m; return PT;
}
// u0..u1 arasını şerit olarak örnekler; yarı genişlik hw(u) (px), doku boyunca 0..1
function fillRope(mesh, u0, u1, hw) {
  const g = mesh.geometry, steps = Math.max(1, Math.ceil((u1 - u0) / .2)), nv = (steps + 1) * 2;
  if (mesh.cap < nv) {
    mesh.cap = nv + 64;
    g.positions = new Float32Array(mesh.cap * 2); g.uvs = new Float32Array(mesh.cap * 2);
    const ind = new Uint32Array((mesh.cap / 2 - 1) * 6);
    for (let k = 0, q = 0; k < mesh.cap / 2 - 1; k++, q += 6) { const a = k * 2; ind[q] = a; ind[q + 1] = a + 1; ind[q + 2] = a + 2; ind[q + 3] = a + 1; ind[q + 4] = a + 3; ind[q + 5] = a + 2; }
    g.indices = ind;
  }
  const P = g.positions, U = g.uvs;
  for (let k = 0; k <= steps; k++) {
    const u = u0 + (u1 - u0) * k / steps, p = pathAt(u), w = hw(u), nx = -p.ty * w, ny = p.tx * w, o = k * 4, f = k / steps;
    P[o] = p.x - nx; P[o + 1] = p.y - ny; P[o + 2] = p.x + nx; P[o + 3] = p.y + ny;
    U[o] = f; U[o + 1] = 0; U[o + 2] = f; U[o + 3] = 1;
  }
  const last = steps * 4;   // kullanılmayan köşeler son noktaya toplanır: alanı sıfır üçgenler
  for (let o = last + 4; o < mesh.cap * 2; o += 2) { if (P[o] === P[last] && P[o + 1] === P[last + 1]) break; P[o] = P[last]; P[o + 1] = P[last + 1]; }
  g.getBuffer('aPosition').update(); g.getBuffer('aUV').update();
}

// Süsler (j: 0 yaprak, 1 tomurcuk, 2 yaprak, 3 sarkan tomurcuk). Çiçeğin hemen arkasında hep bir yaprak ve altında sarkan
// küçük tomurcuk durur (başlangıçtaki kısa yılanda da); arkasından çizimdeki sıra (tomurcuk, yaprak, sarkan tomurcuk, yaprak)
// PERIOD hücrede bir tekrarlanır. Sonrakiler ancak arkası kuyruğa değmeyecek kadar yer olunca açar.
const DECO_TEX = ['yaprak1', 'tomurcuk', 'yaprak2', 'tomurcuk2'], PERIOD = 8.3;
const DECO_BACK = YILAN.deco.map(d => (1 - d.ax) * d.size);
const START = [[0, 1.75], [3, 2.45]];                      // [süs, baştan uzaklık (hücre)]
const SHIFT = START[0][1] - YILAN.deco[0].u;                 // çizimdeki dizi ilk yaprağa göre öne çekilir
const MODULE = [1, 2, 3, 0].map(j => [j, YILAN.deco[j].u + (j ? 0 : PERIOD) + SHIFT]);
const decoAt = k => k < START.length ? START[k] : (([j, u]) => [j, u + Math.floor((k - START.length) / 4) * PERIOD])(MODULE[(k - START.length) % 4]);
// çizimdeki boyutlara göre ölçek: baş (çiçek), süsler (yaprak/tomurcuk), süslerin gövdedeki aralığı, sap kalınlığı ve kuyruk boyu
const YK = { head: .8, deco: .72, gap: 1, stem: .9, tail: .8 };
function decoSprite(k) {
  let d = DECOS[k];
  if (!d) {
    d = DECOS[k] = { s: new PIXI.Sprite(), g: k < START.length ? 1 : 0, flip: 1, f: 1, tex: '' };
    const m = YILAN.deco[decoAt(k)[0]]; d.s.anchor.set(m.ax, m.ay); (m.back ? budLayer : decoLayer).addChildAt(d.s, 0);   // kuyruğa yakın olan altta
  }
  return d;
}
// çiçek ve süsler hep "yukarı" baksın: sap sağa giderken (çizimin tersi) dikeyde aynalanır; dikeyde son hâli korunur
const flipFor = (cos, cur) => cos < -.3 ? -1 : cos > .3 ? 1 : cur;

function renderSnake(alpha, dt, now) {
  for (let i = 0; i < len; i++) {
    let fx = i < prevLen ? px[i] : bx[i], fy = i < prevLen ? py[i] : by[i];
    if (Math.abs(fx - bx[i]) + Math.abs(fy - by[i]) > 1.5) { fx = bx[i]; fy = by[i]; }   // ani konum değişimi (ör. virüs çarpınca kısalma): sıçra
    ix[i] = fx + (bx[i] - fx) * alpha; iy[i] = fy + (by[i] - fy) * alpha;
  }
  const boosting = gameTime < boostUntil, hurt = gameTime < hurtUntil;
  const flower = !skin.classic, wilt = hurt ? mixc(WHITE, WILT, .5) : 0xffffff;
  const hx = (ix[0] + .5) * cell, hy = (iy[0] + .5) * cell;
  headPulse = Math.max(0, headPulse - dt * .004);
  stemMesh.visible = tailMesh.visible = decoLayer.visible = budLayer.visible = headFlower.visible = flower;
  bodyLayer.visible = headBase.visible = headFace.visible = !flower;
  if (flower) {
    // sap baştan kuyruğa hafifçe incelir; kuyruk çizimdeki sivri uç, gövdenin son hücresini doldurur (kısa gövdede kısalır)
    const sc = cell / YILAN.cell, uEnd = Math.max(1, len - 1) + .5, tailLen = Math.min(YILAN.tail.len * YK.tail, uEnd * .55), uTail = uEnd - tailLen;
    const [h0, h1] = YILAN.stem.h, B = YILAN.stem.band * cell * YK.stem;
    fillRope(stemMesh, 0, uTail + .05, u => B * (h0 + (h1 - h0) * Math.min(1, u / Math.max(uTail, .01))));
    fillRope(tailMesh, uTail, uEnd, () => B * h1);
    stemMesh.tint = tailMesh.tint = wilt;
    let k = 0;
    for (; ; k++) {
      const [j, u0] = decoAt(k), u = u0 * YK.gap, start = k < START.length;
      if (u >= (start ? uEnd : uTail)) break;
      const d = decoSprite(k), p = pathAt(u), want = start || u + DECO_BACK[j] * YK.deco <= uTail + .1 ? 1 : 0;
      d.g += (want - d.g) * Math.min(1, dt * .01);
      d.flip = flipFor(p.tx, d.flip); d.f += (d.flip - d.f) * Math.min(1, dt * .012);
      const pc = YILAN.deco[j].back ? petalOf(k * .17, now) : PINK, tex = DECO_TEX[j] + pc;
      if (d.tex !== tex) { d.tex = tex; d.s.texture = yilanDoku(DECO_TEX[j], pc); }
      d.s.visible = d.g > .02; d.s.position.set(p.x, p.y);
      d.s.rotation = Math.atan2(p.ty, p.tx) + Math.sin(now * .003 + k * 1.7) * .05 * d.g;
      d.s.scale.set(sc * YK.deco * d.g, sc * YK.deco * d.g * d.f); d.s.tint = wilt;
    }
    for (; k < DECOS.length; k++) { DECOS[k].s.visible = false; DECOS[k].g = 0; }
    // çiçek ileri yöne döner, ağzı önde; yürürken hafifçe nefes alır, yiyince açılır
    const vx = ix[0] - ix[1], vy = iy[0] - iy[1], mv = Math.abs(vx) + Math.abs(vy);
    const target = mv > .05 && mv < 1.5 ? Math.atan2(vy, vx) : Math.atan2(DY[moveDir], DX[moveDir]);
    headRot += Math.atan2(Math.sin(target - headRot), Math.cos(target - headRot)) * Math.min(1, dt * .025);
    headFlip = flipFor(-Math.cos(headRot), headFlip); headFlipS += (headFlip - headFlipS) * Math.min(1, dt * .012);
    const open = (boosting ? 1.12 : 1) * (hurt ? .88 : 1) * (1 + headPulse * .1), fl = Math.sin(now * .018) * .03;
    headFlower.texture = yilanDoku('bas', petalOf(0, now));
    headFlower.position.set(hx, hy); headFlower.rotation = headRot + Math.PI;
    headFlower.scale.set(sc * YK.head * open * (1 + fl), sc * YK.head * open * (1 - fl * .6) * headFlipS);
    headFlower.tint = wilt;
  } else {
    // klasik akış: toplardan gövde
    const n = (len - 1) * 2;
    let used = 0;
    for (let k = n; k >= 1; k--) {
      const i = Math.floor(k / 2), f = k / 2 - i; let x = ix[i], y = iy[i];
      if (f > 0) {
        if (Math.abs(ix[i] - ix[i + 1]) + Math.abs(iy[i] - iy[i + 1]) > 1.5) continue;
        x += (ix[i + 1] - x) * f; y += (iy[i + 1] - y) * f;
      }
      const t = k / (n + 1), s = bodySprite(used++), w = .5 + .5 * Math.sin(now * .008 - k * .45);
      s.visible = true; s.position.set((x + .5) * cell, (y + .5) * cell); s.width = s.height = cell * (.9 - .36 * t);
      s.tint = boosting ? mixc(BOOSTC, WHITE, w * .4) : mixc(skinBody, WHITE, w * .22);
    }
    for (let j = used; j < bodyPool.length; j++) bodyPool[j].visible = false;
    const lx = DX[moveDir] * cell * .1, ly = DY[moveDir] * cell * .08;
    headBase.tint = skin.head; headBase.width = headBase.height = cell * 1.2; headBase.position.set(hx, hy);
    headFace.position.set(hx + lx, hy + ly); headFace.width = headFace.height = cell * 1.2;
    headFace.scale.x = Math.abs(headFace.scale.x) * (moveDir === 3 ? -1 : 1);
  }
  // yutulan virüs gövdede kuyruğa doğru ilerler, en eskisi en arkada
  for (let j = 0; j < carriedAt.length; j++) {
    let s = lumpPool[j]; if (!s) { s = new PIXI.Sprite(T.virusBare); s.anchor.set(.5); lumpLayer.addChild(s); lumpPool[j] = s; }
    const i = Math.max(1, Math.min(len - 1 - j, 1 + stepCount - carriedAt[j]));
    s.visible = true; s.position.set((ix[i] + .5) * cell, (iy[i] + .5) * cell);
    s.width = s.height = cell * .58; s.rotation = now * .002 + j * 1.3;
  }
  for (let j = carriedAt.length; j < lumpPool.length; j++) lumpPool[j].visible = false;
  snakeLayer.alpha = hurt ? (Math.sin(now * .04) > 0 ? 1 : .45) : 1;
}

function updateFx(dt, now) {
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
  if (gateLayer.visible) {
    const p = .5 + .5 * Math.sin(now * .006);
    gateGlow.alpha = exitOpen ? .5 + .5 * p : .12 + .08 * p; gateRing.alpha = exitOpen ? 1 : .4; gateRing.rotation = exitOpen ? -now * .005 : -now * .0008;
  }
  // iltihap kızarıklığı oyun boyunca sabit (mukus topladıkça zemin açılmaz), yalnızca bölüm temizlenince kaybolur
  const inflam = mode !== 'demo' && !cleared ? .3 : 0;
  inflamG.alpha += (inflam - inflamG.alpha) * (cleared ? 1 - Math.exp(-dt * .004) : ek);
  if (cfg.shape) {   // şekilli bölümde kızarıklık ekranın tamamına değil yalnız sinüsün zeminine
    const k = Math.min(1, inflamG.alpha / .3), g = Math.round(255 - 95 * k), b = Math.round(255 - 85 * k);
    floorS.tint = (255 << 16) | (g << 8) | b;
  }
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
  updateCamera(dt, now);
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
// simülasyon çizimden ayrı: denge testi aynı fonksiyonu çizimsiz hızlı çalıştırır
function simTick(dt) {
  let alpha = 1;
  if (!running() || frozen) return alpha;
  if (waiting) { if (!autoBot) return alpha; go(); }   // denge testinde bot beklemeden başlar
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
  return alpha;
}
app.ticker.add((tk) => {
  const dt = Math.min(tk.deltaMS, 100), now = performance.now();
  const alpha = simTick(dt);
  renderSnake(running() ? alpha : 1, dt, now);
  for (const m of movers) { const a = running() ? alpha : 1; m.s.position.set((m.px + (m.x - m.px) * a + .5) * cell, (m.py + (m.y - m.py) * a + .5) * cell + Math.sin(now * .008 + m.ph) * cell * .04); m.s.width = m.s.height = cell * 1.1; m.s.scale.x = Math.abs(m.s.scale.x) * (m.dx < 0 ? -1 : 1); }
  renderViruses(running() ? alpha : 1, dt, now);
  if (mode === 'versus') mpRender(dt, now);
  updateFx(dt, now);
  updateInside(dt, now);
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
  if (waiting) { go(); if (d === dir || d === (dir + 2) % 4) return; }   // ilk dokunuş başlatır; geriye (gövdeye) doğruysa akış yukarı gider
  const last = queue.length ? queue[queue.length - 1] : dir;
  if (d === last || d === (last + 2) % 4) return;
  if (queue.length < 3) queue.push(d);
}
const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code in KEYS && state === 'play') { e.preventDefault(); pushDir(KEYS[e.code]); return; }
  if (e.code === 'Escape' && state === 'paused' && (current === 'scrSettings' || current === 'scrConfirm')) { e.preventDefault(); show('scrPause'); return; }
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
  if (id) $('toast').classList.remove('low');   // kart açılınca bildirim kartın düğmelerinin üstünden kalksın
  $('hud').classList.toggle('off', mode === 'demo');
  const b = id && kbMode && $(id).querySelector('.btn'); if (b) setTimeout(() => b.focus({ preventScroll: true }), 30);
}
let lastScore = -1;
function hudScore() { if (score !== lastScore) { $('hudScore').textContent = score; lastScore = score; } }
function hudLevel() { $('hudLevel').textContent = mode === 'versus' ? `${mp.round}. tur · ${cfg.name}` : `${levelIdx + 1}. ${cfg.name}`; }
function hudBar() {
  const fill = $('hudFill'), lab = $('hudBarLabel');
  if (exitOpen) { fill.classList.add('open'); fill.style.transform = 'scaleX(1)'; lab.textContent = 'Ostium açık'; return; }
  const r = Math.max(0, 1 - eaten / target);
  fill.classList.remove('open'); fill.style.transform = `scaleX(${r})`; lab.textContent = `Tıkanıklık %${Math.round(r * 100)}`;
}
function updateChips() {
  const set = (id, until, dur = 6000) => {
    const el = $(id), left = until - gameTime, on = left > 0 && mode !== 'demo';
    el.classList.toggle('on', on); if (on) el.querySelector('b').style.transform = `scaleX(${left / dur})`;
  };
  set('chipSerum', slowUntil); set('chipBreeze', breezeUntil); set('chipImmune', immuneUntil, IMMUNE_MS);
  const vOn = !!cfg.virus && mode !== 'demo';
  $('chipVirus').classList.toggle('on', vOn); $('chipCarry').classList.toggle('on', vOn && carriedAt.length > 0);
  if (vOn) { $('chipVirusN').textContent = viruses.length; $('chipCarryN').textContent = carriedAt.length; }
}
function setMute() { $('muteWave').style.display = prog.muted ? 'none' : ''; $('btnMute').setAttribute('aria-label', prog.muted ? 'Sesi aç' : 'Sesi kapat'); }
function hideHint() { if ($('hint').classList.contains('on')) { $('hint').classList.remove('on'); prog.seenTut = true; save(); } }

function homeStats() {
  $('hsStarsTotal').textContent = LEVELS.length * 3;
  $('hsStars').textContent = totalStars(); $('hsBest').textContent = prog.best;
}
function goHome() { mode = 'demo'; rnd = Math.random; mpClear(); applySkin(0); document.body.classList.remove('versus'); setupBoard(DEMO); state = 'demo'; homeStats(); show('scrHome'); layout(); musicScene('menu'); musicDuck(false); }

function legendKeys(c) {
  const k = ['mucus'];
  if (c.gold) k.push('gold'); if (c.serum) k.push('serum'); if (c.breeze) k.push('breeze');
  if (c.obs.some(r => !((r.w === 1 || r.h === 1) && r.w * r.h > 2))) k.push('polyp');
  if (c.obs.some(r => (r.w === 1 || r.h === 1) && r.w * r.h > 2)) k.push('septum');
  if (c.virus) k.push('virus', 'infected');
  if (c.immune) k.push('immune');
  if (c.movers) k.push('plug'); if (c.harden) k.push('crust');
  if (c.swell) k.push('swell');
  return k;
}
// bölümde yalnızca yeni olanı göster: önceki bölümlerde anlatılanlar tekrarlanmaz
function legendFor(c, prev = []) {
  const old = prev.flatMap(legendKeys), k = legendKeys(c).filter(t => !old.includes(t));
  return k.map(t => `<div><img alt="" src="${iconURL[t]}"><span><b>${ITEM_INFO[t][0]}</b><span>${ITEM_INFO[t][1]}</span></span></div>`).join('');
}
// Oyun tek koşu: 1. bölümden başlar, ölünce biter (bölüm tekrarı yok). base: önceki bölümlerden gelen skor
function openIntro(i, base = 0) {
  mode = 'adventure'; levelIdx = i; score = base; lastScore = -1; gameSneezes = 0;
  musicScene('act' + LEVELS[i].act); musicDuck(false);   // her perdenin kendi parçası
  setupBoard(LEVELS[i]); state = 'intro';
  const L = LEVELS[i];
  $('inKicker').textContent = `${L.act + 1}. perde: ${ACTS[L.act]} · Bölüm ${i + 1}/${LEVELS.length}`;
  $('tIntro').textContent = L.name;
  $('inDesc').textContent = L.desc + (i === 0 ? ' Masaüstünde ok tuşları ya da WASD kullanabilirsin. Akış takılırsa oyun biter: bütün bölümleri tek seferde geçmeye çalış.' : '');
  const legend = legendFor(L, LEVELS.slice(0, i));
  $('inLegend').innerHTML = legend; $('inNew').style.display = legend ? '' : 'none';
  $('inGoalsWrap').style.display = '';
  const m = prog.mask[i];
  $('inGoals').innerHTML = [['Bölümü tamamla', m & 1], [GOAL_TEXT[L.obj[0][0]](L.obj[0][1]), m & 2], [GOAL_TEXT[L.obj[1][0]](L.obj[1][1]), m & 4]]
    .map(([t, g]) => `<li><span class="st ${g ? 'on' : ''}">★</span>${t}</li>`).join('');
  $('inBack').style.display = i ? 'none' : '';   // koşunun ortasında geri dönüş yok
  hudLevel(); hudScore(); hudBar(); show('scrIntro');
}
function begin() {
  initAudio(); show(null); state = 'play'; levelStart = gameTime; acc = 0;
  waiting = mode === 'adventure';
  if (!waiting) return;
  const touch = matchMedia('(pointer: coarse)').matches;
  $('hintText').textContent = levelIdx === 0 && !prog.seenTut
    ? (touch ? 'Yön vermek için kaydır' : 'Yön vermek için ok tuşlarını ya da WASD\'yi kullan')
    : (touch ? 'Başlamak için kaydır' : 'Başlamak için bir yön tuşuna bas');
  $('hint').classList.add('on');
}
// ilk yön verildi: süre ve hızlanma buradan sayılır
function go() { waiting = false; levelStart = gameTime; acc = 0; hideHint(); }
function newRun() { initAudio(); openIntro(0); begin(); }
function togglePause(force) {
  if (mode === 'versus') return;   // çevrim içi tur herkes için aynı anda akar
  if (state === 'play' || state === 'exiting') { pausedFrom = state; state = 'paused'; show('scrPause'); musicDuck(true); }
  else if (state === 'paused' && force !== true) { state = pausedFrom; show(null); musicDuck(false); }
}

// Bilgilendirme: antibiyotik ve sinüzit (sitenin metinleri, kaynaklarıyla) ve nasıl oynanır
let infoTab = 'learn';
function openInfo(t) {
  if (t) infoTab = t;
  document.querySelectorAll('[data-info]').forEach(b => b.setAttribute('aria-selected', b.dataset.info === infoTab));
  const body = $('infoBody');
  if (infoTab === 'learn') {
    body.innerHTML = '<div class="facts">' + INFO.map(([em, t, tx, src]) =>
      `<div class="fact"><div class="em">${em}</div><div><strong>${t}</strong><p>${tx}</p>${src ? `<span class="src">Kaynak: ${src}</span>` : ''}</div></div>`).join('') + '</div>'
      + `<div class="tip close" style="margin:12px 0 0"><b>Unutma:</b> ${CLOSING} <a href="https://yasasinsaglik.com/antibiyotik-direnci" target="_blank" rel="noopener">Daha fazlası</a></div>`
      + '<p class="legal">Bu bilgiler genel bilgilendirme amaçlıdır; tanı koymaz, tedavi önermez. Sağlığınızla ilgili konularda eczacınıza ve doktorunuza danışın.</p>';
  } else {
    body.innerHTML = '<ol class="steps">' + HOWTO.map(t => `<li>${t}</li>`).join('') + '</ol>'
      + '<p class="sub">Oyunda neler var?</p><div class="legend">'
      + Object.keys(ITEM_INFO).filter(k => k !== 'swell').map(k => `<div><img alt="" src="${iconURL[k]}"><span><b>${ITEM_INFO[k][0]}</b><span>${ITEM_INFO[k][1]}</span></span></div>`).join('') + '</div>';
  }
  $('scrInfo').querySelector('.card').scrollTop = 0;
  show('scrInfo');
}
document.querySelectorAll('[data-info]').forEach(b => b.onclick = () => openInfo(b.dataset.info));

// görünüm seçimi (koleksiyon) kaldırıldı: akış hep ilk görünümle çizilir; diğerleri yalnızca görünüm denetiminde (#debug)
function applySkin(i = 0) {
  skin = SKINS[i] || SKINS[0]; skinBody = skin.classic ? rgb(skin.body) : WHITE;
}

// ilk kez oynayan doğrudan oyuna girer; sonrakilerde 1. bölümün tanıtımı
$('btnAdventure').onclick = () => { initAudio(); if (!prog.done[0]) newRun(); else openIntro(0); };
$('btnInfo').onclick = () => openInfo();
document.querySelectorAll('[data-back]').forEach(b => b.onclick = goHome);
$('btnStart').onclick = begin;
$('btnNext').onclick = () => { if (levelIdx < LEVELS.length - 1) openIntro(levelIdx + 1, score); else goHome(); };
$('btnRetry').onclick = newRun;   // ölüm kaydedildi: yeni koşu 1. bölümden
$('btnOverBack').onclick = goHome;
$('btnResume').onclick = () => togglePause();
$('btnPauseSettings').onclick = () => openSettings('scrPause');
$('btnQuit').onclick = () => show('scrConfirm');   // ana menüye dönmeden önce sor: oyun biter
$('btnConfirmNo').onclick = () => show('scrPause');
$('btnConfirmYes').onclick = goHome;
$('btnPause').onclick = () => togglePause();
const applyVolumes = () => setVolumes(prog.sfxVol, prog.musicVol, prog.muted);
$('btnMute').onclick = () => { prog.muted = !prog.muted; save(); setMute(); initAudio(); applyVolumes(); };

/* =========================================================================
   AYARLAR: ses, ses efektleri ve müzik seviyesi (müzik sonraki güncellemede), titreşim. Yalnızca bu cihazda.
   ========================================================================= */
let settingsFrom = 'scrHome';
function syncSettings() {
  $('setSound').setAttribute('aria-checked', !prog.muted);
  $('setSfx').value = Math.round(prog.sfxVol * 100); $('setSfxOut').textContent = $('setSfx').value + '%';
  $('setMusic').value = Math.round(prog.musicVol * 100); $('setMusicOut').textContent = $('setMusic').value + '%';
  $('setVibrate').setAttribute('aria-checked', !!prog.vibrate);
  $('setVibrateRow').style.display = 'vibrate' in navigator ? '' : 'none';   // titreşimi desteklemeyen cihazda gizli
}
function openSettings(from) { settingsFrom = from; syncSettings(); show('scrSettings'); }
$('setSound').onclick = () => { prog.muted = !prog.muted; save(); setMute(); syncSettings(); initAudio(); applyVolumes(); if (!prog.muted) playSfx('eat'); };
$('setSfx').oninput = () => { prog.sfxVol = $('setSfx').value / 100; $('setSfxOut').textContent = $('setSfx').value + '%'; applyVolumes(); };
$('setSfx').onchange = () => { save(); initAudio(); if (!prog.muted) playSfx('eat'); };   // bırakınca örnek ses
$('setMusic').oninput = () => { prog.musicVol = $('setMusic').value / 100; $('setMusicOut').textContent = $('setMusic').value + '%'; applyVolumes(); save(); };
$('setVibrate').onclick = () => { prog.vibrate = !prog.vibrate; save(); syncSettings(); buzz(30); };
$('settingsBack').onclick = () => { if (settingsFrom === 'scrPause' && state === 'paused') show('scrPause'); else goHome(); };
$('btnSettings').onclick = () => openSettings('scrHome');

/* =========================================================================
   SKOR TABLOSU: ölünce ya da oyun bitince isim zorunlu; liste yalnızca bu cihazda
   ========================================================================= */
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let nameDone = null, boardMine = null, boardThen = null;
function askName(entry, then) {
  state = 'name';
  $('nmKicker').textContent = entry.f ? 'Tüm sinüsler açıldı!' : 'Akış takıldı';
  $('nmScore').textContent = entry.s;
  $('nmSub').textContent = entry.f ? 'Skor · tüm bölümler' : `Skor · ${entry.l + 1}. bölüm`;
  $('nameInput').value = ''; $('btnSaveName').disabled = true;
  nameDone = n => openBoard(addScore('adventure', { ...entry, n }), then);
  show('scrName'); setTimeout(() => $('nameInput').focus({ preventScroll: true }), 60);
}
$('nameInput').oninput = () => { $('btnSaveName').disabled = !cleanName($('nameInput').value); };
$('nameForm').onsubmit = (e) => {
  e.preventDefault();
  const n = cleanName($('nameInput').value), f = nameDone;
  if (!n || !f) { $('nameInput').focus(); return; }
  nameDone = null; $('nameInput').blur(); f(n);
};
// mine: az önce kaydedilen skor (vurgulanır); then: varsa "Devam" ile dönülecek ekran, yoksa ana menüden açılmıştır
function openBoard(mine = null, then = null) {
  boardMine = mine; boardThen = then;
  $('boardBack').style.display = then ? 'none' : ''; $('boardActions').style.display = then ? '' : 'none';
  renderBoard(); show('scrBoard');
  // küçük ekranda kendi satırı görünsün: yalnızca kart kayar
  const card = $('scrBoard').querySelector('.card'), me = $('boardList').querySelector('.me');
  card.scrollTop = 0;
  if (me) card.scrollTop = Math.max(0, me.getBoundingClientRect().top - card.getBoundingClientRect().top - card.clientHeight / 2);
  if (then && kbMode) setTimeout(() => $('btnBoardNext').focus({ preventScroll: true }), 30);
}
function renderBoard() {
  const list = prog.scores.adventure, mine = boardMine;
  const row = (e, i) => `<li class="${mine && e.id === mine.id ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm"><b>${esc(e.n)}</b></span><span class="sc">${e.s}</span></li>`;
  let html = list.slice(0, 10).map(row).join('');
  const at = mine ? list.findIndex(e => e.id === mine.id) : -1;
  if (at >= 10) html += row(list[at], at);   // ilk 10'da değilse kendi satırı altta
  $('boardList').innerHTML = html || '<li class="empty">Henüz skor yok. İlk sen ol!</li>';
  $('boardRank').textContent = mine ? (mine.rank === 1 ? 'Tablonun zirvesindesin!' : `Sıran: ${mine.rank}.`) : '';
  $('boardRank').style.display = mine ? '' : 'none';
}
$('btnBoard').onclick = () => openBoard();
$('btnBoardNext').onclick = () => { const f = boardThen; boardThen = null; if (f) f(); };

document.addEventListener('visibilitychange', () => {
  if (document.hidden) togglePause(true); audioHidden(document.hidden);
  // çevrim içi: sekme arka plandayken bu cihazda oyun donar (tarayıcı çizimi durdurur); odadakiler haberdar olur ve oynamaya devam eder
  if (mp.code && net.open) {
    mp.away[mp.you] = document.hidden; net.send({ t: 'away', on: document.hidden });
    if (!document.hidden && mode === 'versus' && (state === 'play' || state === 'exiting')) callout('Oyuna döndün', 'Akış kaldığı yerden sürüyor');
    if (mode === 'versus') mpRoundOver();
  }
});
// tarayıcı sesi ancak bir dokunuştan sonra açar: ilk dokunuşta ya da tuşta müzik başlar
for (const t of ['pointerdown', 'keydown']) addEventListener(t, () => initAudio(), true);
addEventListener('blur', () => togglePause(true));


/* =========================================================================
   ÇOK OYUNCULU (ÇEVRİM İÇİ): oda kodu ile 2-3 oyuncu, her biri kendi cihazından.
   Ekran oyunculara bölünür: kendi tahtan solda (dikey telefonda altta), diğerlerininki yanında canlı izlenir.
   Herkes aynı bölümü aynı tohumla aynı anda başlatır; mukusu temizleyip ostiumdan ilk çıkan turu kazanır.
   Akış takılan turun dışında kalır, diğerlerini izler. Puan: 1. 3, 2. 2, 3. 1 puan; bitiremeyen 0.
   Her cihaz kendi oyununu oynatır; ağdan yalnızca diğerlerinin akışı, nesneleri ve ilerlemesi gelir.
   ========================================================================= */
const MP_COLORS = [0xF8157E, 0xA066D6, 0x1FB5A0], MP_CSS = ['#F8157E', '#A066D6', '#1FB5A0'], MP_SKIN = [0, 3, 7];   // görünümler: Magenta, Mor, Turkuaz
const mp = { code: '', you: 0, host: 0, players: [], round: 0, level: 0, totals: {}, fins: {}, ranks: {}, away: {}, over: false, views: new Map(), boxes: new Map(), sentAt: 0, timers: [] };
const me = () => mp.players.find(p => p.id === mp.you);
const others = () => mp.players.filter(p => p.id !== mp.you);

/* Kartların yerleşimi. Dönen: [kendi kartın, diğer oyuncular...] (cell: hücre boyu, hd: kartın üstündeki ad/skor şeridi).
   Bilgisayar ve tablet: sahne ekranı kaplamaz; eşit kartlar aralarında ve çevrelerinde boşlukla ortalanır (en çok %86 x %90).
   Telefon: kendi tahtan tek oyunculudakine yakın boyda olsun diye önce o yerleşir (kenar boşluğu 6 px), rakipler kalan yere:
   dikeyde üstte yan yana, yatayda yanında. Rakip tahtası en az MIN_CELL hücre boyunda kalır. */
const CARD_BG = 0x8A2F52, MIN_CELL = 3;
function mpRects(W, H) {
  const n = Math.max(2, mp.players.length), k = n - 1, phone = Math.min(W, H) < 520;
  const CW = COLS + (phone ? .6 : 1.4), CH = ROWS + (phone ? .5 : 1);   // kartın tahta çevresindeki payı (hücre)
  const m = phone ? 6 : Math.round(Math.max(10, Math.min(W, H) * .03)), g = phone ? 6 : Math.round(Math.max(8, Math.min(18, W * .014)));
  const hd = c => { const w = c * CW; return w >= 300 ? (phone ? 56 : 62) : w >= 171 ? 54 : 46; };   // ad + skor satırı ve tıkanıklık çubuğu (style.css .opp eşikleri)
  const aw = phone ? W - 2 * m : Math.min(W - 2 * m, W * .86), ah = phone ? H - 2 * m : Math.min(H - 2 * m, H * .9);
  const card = (x, y, c) => { const w = Math.round(c * CW), h = Math.round(c * CH) + hd(c); return { x: Math.round(x), y: Math.round(y), w, h, cell: c, hd: hd(c), rad: Math.round(Math.max(phone ? 10 : 12, Math.min(26, w * .07))) }; };
  const fitRow = (j, w, h) => { let c = Math.min((w - (j - 1) * g) / j / CW, (h - 34) / CH); c = Math.min(c, (h - hd(c)) / CH); return c; };
  const row = cards => {   // kartları yan yana, dikeyde ortalı diz
    const total = cards.reduce((t, r) => t + r.w, 0) + (cards.length - 1) * g; let x = (W - total) / 2;
    for (const r of cards) { r.x = Math.round(x); r.y = Math.round((H - r.h) / 2); x += r.w + g; }
    return cards;
  };
  if (!phone) {
    const c = Math.floor(fitRow(n, aw, ah));
    if (W >= H * .95 || c >= 10) return row(Array.from({ length: n }, () => card(0, 0, c)));
  } else if (W >= H) {   // yatay telefon: kendi kartın yüksekliği doldurur, rakipler yanında
    let cb = Math.floor(Math.min((ah - 54) / CH, (aw - k * (g + MIN_CELL * CW)) / CW));
    const cs = Math.min(cb, (aw - cb * CW - k * g) / k / CW, (ah - 46) / CH);
    return row([card(0, 0, cb), ...Array.from({ length: k }, () => card(0, 0, cs))]);
  }
  // dikey: kendi kartın altta büyük, rakipler üstte yan yana
  let cb = Math.floor(Math.min(aw / CW, (ah - hd(14)) / CH)), cs = 0;
  for (; cb > 6; cb--) {
    const left = ah - (cb * CH + hd(cb)) - g;
    cs = fitRow(k, aw, left);
    if (cs >= (phone ? MIN_CELL : cb * .42)) break;
  }
  cs = Math.max(MIN_CELL, Math.min(cs, cb * .6));
  const big = card(0, 0, cb), sw = Math.round(cs * CW), sh = Math.round(cs * CH) + hd(cs), rowW = k * sw + (k - 1) * g;
  const y0 = (H - (sh + g + big.h)) / 2, xs = (W - rowW) / 2;
  big.x = Math.round((W - big.w) / 2); big.y = Math.round(y0 + sh + g);
  return [big, ...Array.from({ length: k }, (_, i) => card(xs + i * (sw + g), y0, cs))];
}
const ITEM_TEX = { m: () => T.mucus[0], i: () => T.infected[0], gold: () => T.gold, serum: () => T.serum, breeze: () => T.breeze, immune: () => T.immune };
function mpView(p) {
  let v = mp.views.get(p.id); if (v) return v;
  const c = new PIXI.Container(), shadow = new PIXI.Graphics(), bg = new PIXI.Graphics(), floor = new PIXI.Sprite(), plugs = new PIXI.Container(), things = new PIXI.Container(), stem = new PIXI.Graphics(), head = new PIXI.Sprite(), mask = new PIXI.Graphics();
  head.anchor.set(YILAN.head.ax, YILAN.head.ay);
  c.addChild(bg, floor, plugs, things, stem, head); oppLayer.addChild(shadow, c);   // maske yok: telefonda her maske ayrı bir çizim geçişi
  const tag = mpBox(p.id).tag;
  v = { id: p.id, c, shadow, bg, floor, plugs, things, stem, head, mask, tag, tex: null, pool: [], cells: [], prev: [], at: 0, dur: 150, rot: -Math.PI / 2, flip: 1, eaten: 0, target: 1, open: false, cell: 10, ox: 0, oy: 0 };
  mp.views.set(p.id, v); return v;
}
// her oyuncunun sütununda DOM katmanı: üstte ad etiketi, ortada tur sonu yazısı (bitirdi / takıldı)
function mpBox(id) {
  let b = mp.boxes.get(id); if (b) return b;
  const box = document.createElement('div'), tag = document.createElement('div'), msg = document.createElement('div');
  box.className = 'col' + (id === mp.you ? ' self' : ''); tag.className = 'opp'; msg.className = 'colmsg';
  box.append(tag, msg); $('opps').appendChild(box);
  b = { box, tag, msg }; mp.boxes.set(id, b); return b;
}
function place(el, r, color) {
  Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', borderRadius: r.rad + 'px' });
  el.style.setProperty('--hd', r.hd + 'px'); el.style.setProperty('--pc', MP_HEAD[color]);   // CSS değişkenleri yalnızca setProperty ile yazılır
}
const MP_HEAD = ['#D0106C', '#8550C4', '#138F80'];   // başlık şeridi: oyuncu renginin beyaz yazıyı taşıyan koyu tonu
function mpLayout(W, H) {
  const rects = mpRects(W, H), list = others();
  for (const [id, v] of mp.views) if (!list.some(p => p.id === id)) mpDrop(id);
  for (const id of [...mp.boxes.keys()]) if (!mp.players.some(p => p.id === id)) { mp.boxes.get(id).box.remove(); mp.boxes.delete(id); }
  const mine = me();
  if (mine) { const b = mpBox(mine.id); place(b.box, rects[0], mine.color); mpSelfHead(); mpMark(mine.id); mpSelfRim(); }
  list.forEach((p, i) => {
    const r = rects[i + 1], v = mpView(p);
    if (!r) { v.c.visible = v.shadow.visible = false; return; }
    v.c.visible = true;
    v.cell = r.cell;
    v.ox = r.x + (r.w - COLS * v.cell) / 2; v.oy = r.y + r.hd + (r.h - r.hd - ROWS * v.cell) / 2;
    v.shadow.clear().roundRect(r.x, r.y + 6, r.w, r.h, r.rad).fill({ color: 0x6E2A4A, alpha: .22 }); v.shadow.visible = true;
    v.bg.clear().roundRect(r.x, r.y, r.w, r.h, r.rad).fill(CARD_BG).roundRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, r.rad).stroke({ width: 3, color: MP_COLORS[p.color] });
    if (cfg.shape) {   // aynı bölümün zemini, bu sütuna göre
      const res = app.renderer.resolution, cv = sinusCanvas(v.cell * res, (v.ox - r.x) * res, (v.oy - r.y) * res, Math.ceil(r.w * res), Math.ceil(r.h * res));
      { const x = cv.getContext('2d'); x.globalCompositeOperation = 'destination-in'; x.beginPath(); x.roundRect(0, 0, cv.width, cv.height, r.rad * res); x.fill(); }   // kartın köşeleri
      if (v.tex) v.tex.destroy(true);
      v.floor.texture = v.tex = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: cv }) });
      v.floor.position.set(r.x, r.y); v.floor.width = r.w; v.floor.height = r.h;
      // kapalı ostium: tıkaç hücreleri, ostium açılınca kalkar
      v.plugs.removeChildren().forEach(o => o.destroy());
      cfg.shape.grid.forEach((row, y) => { for (let x = 0; x < COLS; x++) if (row[x] === '=') {
        const s = new PIXI.Sprite(T.swell); s.anchor.set(.5); s.tint = 0xFFD2B4; s.rotation = ((y * COLS + x) * 1.7) % 6.28;
        s.position.set(v.ox + (x + .5) * v.cell, v.oy + (y + .5) * v.cell); s.width = s.height = v.cell * 1.3; v.plugs.addChild(s);
      } });
    }
    place(mpBox(p.id).box, r, p.color);
    mpTag(p); mpMark(p.id);
  });
}
function mpDrop(id) {
  const v = mp.views.get(id); if (!v) return;
  v.c.destroy({ children: true }); v.shadow.destroy(); if (v.tex) v.tex.destroy(true); mp.views.delete(id);
  const b = mp.boxes.get(id); if (b) { b.box.remove(); mp.boxes.delete(id); }
}
function mpClear() {
  for (const id of [...mp.views.keys()]) mpDrop(id);
  for (const b of mp.boxes.values()) b.box.remove(); mp.boxes.clear();
  for (const t of mp.timers) clearTimeout(t); mp.timers = [];
}
// kart başlığı: solda ad, sağda skor; altında tıkanıklık çubuğu (yazısı içinde). Değişmedikçe yeniden yazılmaz
function mpHead(el, p, name, score, eaten, target, open) {
  const f = mp.fins[p.id], r = Math.max(0, 1 - eaten / Math.max(1, target)), away = !f && mp.away[p.id];
  const note = f ? (f.ok ? `Ostiumdan çıktı · ${secs(f.time)} sn` : 'Akış takıldı') : away ? 'Ara verdi' : open ? 'Ostium açık' : `Tıkanıklık %${Math.round(r * 100)}`;
  const short = f ? (f.ok ? `Çıktı · ${secs(f.time)}` : 'Takıldı') : away ? 'Ara' : open ? 'Açık' : `%${Math.round(r * 100)}`;   // çok dar kart
  const fill = f ? (f.ok ? 1 : r) : open ? 1 : r, done = (f && f.ok) || open;
  const html = `<div class="hl"><b>${esc(name)}</b><em>${score}</em></div>`
    + `<div class="pb${done ? ' open' : ''}"><i style="transform:scaleX(${fill.toFixed(3)})"></i><span class="lg">${note}</span><span class="sm">${short}</span></div>`;
  if (el._h !== html) { el._h = html; el.innerHTML = html; }
}
function mpTag(p) {
  const v = mp.views.get(p.id); if (!v) return;
  mpHead(v.tag, p, p.name, v.score || 0, v.eaten, v.target, v.open);
}
// kendi kartının kenarı senin renginde
function mpSelfRim() {
  const R = viewR, mine = me(); if (mode !== 'versus' || !R.rad) return;
  rimG.clear().roundRect(R.x - baseX + 1.5, R.y - baseY + 1.5, R.w - 3, R.h - 3, R.rad).stroke({ width: 3, color: MP_COLORS[mine ? mine.color : 0] });
}
let selfKey = '';
function mpSelfHead() {
  const mine = me(), b = mine && mp.boxes.get(mine.id); if (!b) return;
  const key = `${score}|${eaten}|${target}|${exitOpen}|${!!mp.fins[mine.id]}`;
  if (key === selfKey && b.tag._h) return; selfKey = key;
  mpHead(b.tag, mine, 'Sen', score, eaten, target, exitOpen);
}
// tur sonu yazısı: oyuncu ostiumdan çıkınca ya da akışı takılınca kendi sütununun ortasında
const MEDAL = ['🥇', '🥈', '🥉'], secs = t => String(t).replace('.', ',');
function mpMark(id) {
  const b = mp.boxes.get(id), f = mp.fins[id]; if (!b) return;
  const v = mp.views.get(id); if (v) v.drawn = -1;
  const away = !f && !!mp.away[id] && id !== mp.you;
  b.box.classList.toggle('done', !!f && f.ok); b.box.classList.toggle('dead', !!f && !f.ok); b.box.classList.toggle('away', away);
  if (away) { b.msg.innerHTML = `<span class="md">⏸️</span><b>Ara verdi</b><span>Oyundan ayrıldı · sen devam et</span>`; return; }
  if (!f) { b.msg.innerHTML = ''; return; }
  const self = id === mp.you, r = mp.ranks[id];
  b.msg.innerHTML = f.ok
    ? `<span class="md">${MEDAL[r - 1] || '🏁'}</span><b>${self ? 'Ostiumdan çıktın!' : 'Ostiumdan çıktı!'}</b><span>${r}. sıra · ${secs(f.time)} sn</span>`
    : `<span class="md">😵</span><b>Akış takıldı</b><span>${self ? 'Bu turun dışındasın' : 'Bu turun dışında'}</span>`;
}
// kendi durumunu odaya bildir (her adımda, en sık 60 ms'de bir)
function mpSend(force) {
  const now = performance.now(); if (!force && now - mp.sentAt < 60) return; mp.sentAt = now;
  const c = []; for (let i = 0; i < len; i++) c.push(bx[i], by[i]);
  const it = items.map(o => [o.type === 'mucus' ? (o.infected ? 'i' : 'm') : o.type, o.x, o.y]);
  const vs = []; for (const v of viruses) vs.push(v.x, v.y);
  net.send({ t: 'st', c, it, v: vs, e: eaten, T: target, s: score, d: Math.round(stepDur()), x: exitOpen ? 1 : 0 });
}
function mpState(m) {
  const p = mp.players.find(q => q.id === m.from); if (!p || !Array.isArray(m.c)) return;
  const v = mpView(p);
  v.prev = v.cells.length ? v.cells : m.c; v.cells = m.c; v.at = performance.now(); v.dur = Math.max(40, Math.min(400, m.d | 0));
  v.eaten = m.e | 0; v.target = Math.max(1, m.T | 0); v.open = !!m.x; v.score = m.s | 0;
  // nesneler ve virüsler
  const want = [...(m.it || []).map(([k, x, y]) => [ITEM_TEX[k] ? ITEM_TEX[k]() : T.mucus[0], x, y, 1.45]), ...[...Array(((m.v || []).length / 2) | 0)].map((_, i) => [T.virus, m.v[i * 2], m.v[i * 2 + 1], 1.3])];
  want.forEach(([tex, x, y, k], i) => {
    let s = v.pool[i]; if (!s) { s = new PIXI.Sprite(tex); s.anchor.set(.5); v.things.addChild(s); v.pool[i] = s; }
    s.texture = tex; s.visible = true; s.position.set(v.ox + (x + .5) * v.cell, v.oy + (y + .5) * v.cell); s.width = s.height = v.cell * k;
  });
  for (let i = want.length; i < v.pool.length; i++) v.pool[i].visible = false;
  mpTag(p);
}
// diğer oyuncuların akışı: iki durum arasında yumuşak geçiş, sap şerit, baş görünümün çiçeği
function mpRender(dt, now) {
  mpSelfHead();
  for (const p of others()) {
    const v = mp.views.get(p.id); if (!v || !v.cells.length) continue;
    const a = Math.min(1, (now - v.at) / v.dur);
    if (v.drawn === v.at && a >= 1 && v.rotDone) continue;   // durum değişmedi: geçen karedeki çizim duruyor
    const pts = [];
    for (let i = 0; i < v.cells.length / 2; i++) {
      let fx = v.prev[i * 2], fy = v.prev[i * 2 + 1];
      const tx = v.cells[i * 2], ty = v.cells[i * 2 + 1];
      if (fx === undefined || Math.abs(fx - tx) + Math.abs(fy - ty) > 1.5) { fx = tx; fy = ty; }
      const y = fy + (ty - fy) * a; if (y < -.5) break;   // ostiumdan çıkan kısım kartın başlığına taşmasın
      pts.push(v.ox + (fx + (tx - fx) * a + .5) * v.cell, v.oy + (y + .5) * v.cell);
    }
    const n = pts.length / 2;
    v.head.visible = n > 0; v.stem.clear();
    if (a >= 1) v.drawn = v.at;
    if (!n) continue;
    if (n > 1) {
      v.stem.moveTo(pts[0], pts[1]); for (let i = 1; i < n; i++) v.stem.lineTo(pts[i * 2], pts[i * 2 + 1]);
      v.stem.stroke({ width: v.cell * .5, color: 0x2F7A3A, cap: 'round', join: 'round' });
      v.stem.moveTo(pts[0], pts[1]); for (let i = 1; i < n; i++) v.stem.lineTo(pts[i * 2], pts[i * 2 + 1]);
      v.stem.stroke({ width: v.cell * .24, color: 0x7CCB6E, cap: 'round', join: 'round' });
    }
    const dx = n > 1 ? pts[0] - pts[2] : 0, dy = n > 1 ? pts[1] - pts[3] : -1;
    v.rotDone = true;
    if (Math.abs(dx) + Math.abs(dy) > .01) { const t = Math.atan2(dy, dx), d = Math.atan2(Math.sin(t - v.rot), Math.cos(t - v.rot)); v.rot += d * Math.min(1, dt * .025); v.rotDone = Math.abs(d) < .01; }
    v.flip = flipFor(-Math.cos(v.rot), v.flip);
    const sc = v.cell / YILAN.cell * YK.head, f = mp.fins[p.id];
    v.head.texture = yilanDoku('bas', MP_COLORS[p.color]); v.head.position.set(pts[0], pts[1]);
    v.head.rotation = v.rot + Math.PI; v.head.scale.set(sc, sc * v.flip);
    v.stem.alpha = v.head.alpha = f && !f.ok ? .45 : 1;
  }
  for (const v of mp.views.values()) { v.plugs.visible = !v.open; v.floor.tint = floorS.tint; }   // iltihap kızarıklığı herkeste aynı
}
function mpFinish(ok) {
  const time = Math.round((gameTime - levelStart) / 100) / 10;
  if (ok) exitFx();   // sonuç, sütunun ortasındaki yazıda (mpMark)
  else setTimeout(() => { if (mode === 'versus') state = 'out'; }, 800);
  mpSend(true);
  net.send({ t: 'fin', ok, time, eaten, score });
}
function mpRoundOver() {
  const ids = mp.players.map(p => p.id);
  if (mp.over || !ids.length || !ids.every(id => mp.fins[id] || mp.away[id])) return false;
  mp.over = true;   // tur bir kez sonuçlanır (oyuncu çıkışı ya da geç gelen ileti puanı ikinci kez eklemesin)
  const NONE = { ok: false, eaten: -1, away: true };   // turu bitirmeden ara veren
  const fin = id => mp.fins[id] || NONE;
  const order = ids.slice().sort((a, b) => { const A = fin(a), B = fin(b); return (B.ok - A.ok) || (A.ok ? mp.ranks[a] - mp.ranks[b] : B.eaten - A.eaten); });
  const pts = [3, 2, 1];
  order.forEach((id, i) => { mp.totals[id] = (mp.totals[id] || 0) + (fin(id).ok ? pts[i] || 0 : 0); });
  const name = id => esc((mp.players.find(p => p.id === id) || { name: '?' }).name);
  const dot = id => `<i class="dot" style="background:${MP_CSS[(mp.players.find(p => p.id === id) || { color: 0 }).color]}"></i>`;
  const win = order.find(id => fin(id).ok);
  $('mprKicker').textContent = `${mp.round}. tur · ${cfg.name}`;
  $('tMpr').textContent = win === undefined ? 'Kimse çıkamadı' : win === mp.you ? 'Turu kazandın!' : `${(mp.players.find(p => p.id === win) || {}).name} kazandı`;
  $('mprList').innerHTML = order.map((id, i) => { const f = fin(id);
    return `<li class="${id === mp.you ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${dot(id)}<b>${name(id)}</b><small>${f.ok ? secs(f.time) + ' sn' : f.away ? 'ara verdi' : 'takıldı'}</small></span><span class="sc">+${f.ok ? pts[i] || 0 : 0}</span></li>`; }).join('');
  const tot = ids.slice().sort((a, b) => (mp.totals[b] || 0) - (mp.totals[a] || 0));
  $('mprTotal').innerHTML = tot.map(id => `<span>${dot(id)}${name(id)} <b>${mp.totals[id] || 0}</b></span>`).join('');
  const fact = FACTS[mp.level] || FACTS[0];   // oynanan bölümün bilgi kartı
  $('mprFact').querySelector('.em').textContent = fact[0]; $('mprFact').querySelector('p').textContent = fact[1];
  mpResultButtons();
  const t = setTimeout(() => { if (mode === 'versus') { state = 'result'; show('scrMpResult'); } }, 1400); mp.timers.push(t);
  return true;
}
function mpResultButtons() {
  const host = mp.host === mp.you, enough = mp.players.length >= 2;
  $('btnMpNext').style.display = host ? '' : 'none'; $('btnMpNext').disabled = !enough;
  $('mprWait').textContent = !enough ? 'Odada tek kaldın; yeni bir oyuncu katılınca devam edebilirsin.' : host ? '' : 'Ev sahibinin yeni turu başlatması bekleniyor.';
}
function mpStartRound(m) {
  mpClear(); mp.fins = {}; mp.ranks = {}; mp.over = false; mp.round = m.round; mp.level = m.level;
  mode = 'versus'; document.body.classList.add('versus');
  levelIdx = m.level; score = 0; lastScore = -1; gameSneezes = 0; rnd = seeded(m.seed);
  applySkin(MP_SKIN[(me() || { color: 0 }).color]);
  musicScene('act' + LEVELS[m.level].act); musicDuck(false);
  setupBoard(LEVELS[m.level]); layout(); state = 'intro'; show(null);
  hudLevel(); hudScore(); hudBar();
  for (const p of others()) { const v = mpView(p); v.cells = []; v.prev = []; v.stem.clear(); v.head.texture = PIXI.Texture.EMPTY; }
  mpLayout(app.screen.width, app.screen.height);
  // bölümün bilgisi ve geri sayım: herkes aynı anda başlar
  const L = LEVELS[m.level], wait = Math.max(0, m.in | 0), at = (ms, f) => mp.timers.push(setTimeout(f, ms));
  $('mpiKicker').textContent = `${m.round}. tur · ${ACTS[L.act]} · Bölüm ${m.level + 1}/${LEVELS.length}`;
  $('tMpi').textContent = L.name; $('mpiDesc').textContent = L.desc;
  $('mpiLegend').innerHTML = legendFor(L);
  show('scrMpIntro');
  for (let k = Math.ceil(wait / 1000); k >= 1; k--) at(wait - k * 1000, () => { const el = $('mpCount'); el.textContent = k; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); if (k <= 3) sfx('star'); });
  at(wait, () => { if (mode !== 'versus') return; if (current === 'scrMpIntro') show(null); state = 'play'; levelStart = gameTime; acc = 0; waiting = false; callout('Akış başladı!', 'Mukusu topla, ostiumdan ilk sen çık'); mpSend(true); });
}
// bağlantıdan gelenler
net.on(m => {
  switch (m.t) {
    case 'room':
      mp.code = m.code; mp.you = m.you; mp.host = m.host; mp.players = m.players; mp.round = m.round || 0; mp.totals = {};
      mp.away = {}; for (const p of m.players) if (p.away) mp.away[p.id] = true;
      mpLobby(); break;
    case 'players': {
      mp.host = m.host; mp.players = m.players;
      for (const p of m.players) if (p.id !== mp.you) mp.away[p.id] = !!p.away;
      if (m.left !== undefined) { mpDrop(m.left); delete mp.fins[m.left]; }
      if (mode === 'versus') {
        layout();
        if (state !== 'intro' && state !== 'play' && state !== 'exiting') mpResultButtons();
        if ((state === 'play' || state === 'exiting' || state === 'result' || state === 'out' || state === 'dying') && current !== 'scrMpResult') mpRoundOver();
      } else mpLobby();
      break;
    }
    case 'start': mpStartRound(m); break;
    case 'away': {
      mp.away[m.from] = m.on;
      const p = mp.players.find(q => q.id === m.from);
      if (p && mode === 'versus') {
        mpTag(p); mpMark(p.id);
        if (!mp.fins[p.id] && !mp.over) callout(m.on ? `${p.name} oyuna ara verdi` : `${p.name} oyuna döndü`, m.on ? 'Sen oynamaya devam et' : '');
        mpRoundOver();
      }
      break;
    }
    case 'st': if (mode === 'versus') mpState(m); break;
    case 'fin': {
      mp.fins[m.from] = m;
      if (m.ok) mp.ranks[m.from] = Object.values(mp.fins).filter(f => f.ok).length;   // varış sırası
      mpMark(m.from);
      const p = mp.players.find(q => q.id === m.from); if (p && p.id !== mp.you) { mpTag(p); if (m.ok && mode === 'versus' && state === 'play') callout(`${p.name} ostiumdan çıktı`, 'Acele et!'); }
      if (mode === 'versus') mpRoundOver();
      break;
    }
    case 'error': mpError(m.msg); break;
    case 'closed':
      if (mode === 'versus') { goHome(); openMp(); mpError('Bağlantı koptu. Yeniden oda kurabilir ya da katılabilirsin.'); }
      else if (mp.code) { mp.code = ''; mpLobby(); mpError('Bağlantı koptu.'); }
      else mpError('Sunucuya bağlanılamadı. Biraz sonra yeniden dene.');
      break;
  }
});
function mpError(msg) { $('mpErr').textContent = msg || ''; }
function mpLobby() {
  const inRoom = !!mp.code;
  $('mpJoin').style.display = inRoom ? 'none' : ''; $('mpRoom').style.display = inRoom ? '' : 'none';
  if (!inRoom) return;
  mpError('');
  $('mpCodeShow').textContent = mp.code;
  $('mpList').innerHTML = mp.players.map(p => `<li class="${p.id === mp.you ? 'me' : ''}"><span class="nm"><i class="dot" style="background:${MP_CSS[p.color]}"></i><b>${esc(p.name)}</b><small>${p.id === mp.host ? 'ev sahibi' : ''}${p.id === mp.you ? (p.id === mp.host ? ' · sen' : 'sen') : ''}</small></span>${mp.round ? `<span class="sc">${mp.totals[p.id] || 0}</span>` : ''}</li>`).join('')
    + (mp.players.length < 3 ? '<li class="empty">Arkadaşlarını bekliyorsun…</li>' : '');
  const host = mp.host === mp.you;
  $('btnMpStart').style.display = host ? '' : 'none'; $('btnMpStart').disabled = mp.players.length < 2;
  $('mpWait').textContent = host ? (mp.players.length < 2 ? 'Turu başlatmak için en az bir arkadaşın katılmalı.' : '') : 'Ev sahibinin turu başlatması bekleniyor.';
}
function openMp() {
  $('mpName').value = $('mpName').value || prog.mpName || '';
  mpLobby(); mpError(''); show('scrMp');
}
const mpNameOk = () => { const n = cleanName($('mpName').value); if (!n) { mpError('Önce bir takma ad yaz.'); $('mpName').focus(); return null; } prog.mpName = n; save(); return n; };
$('btnMulti').onclick = () => { initAudio(); openMp(); };
$('btnMpCreate').onclick = () => { const n = mpNameOk(); if (n) { mpError('Bağlanıyor…'); net.send({ t: 'create', name: n }); } };
$('btnMpJoin').onclick = () => {
  const n = mpNameOk(); if (!n) return;
  const c = $('mpCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 4) { mpError('Oda kodu 4 karakter.'); $('mpCode').focus(); return; }
  mpError('Bağlanıyor…'); net.send({ t: 'join', code: c, name: n });
};
$('mpCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
$('mpCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnMpJoin').click(); });
$('btnMpStart').onclick = () => { initAudio(); net.send({ t: 'start', level: 0 }); };
$('btnMpNext').onclick = () => net.send({ t: 'start', level: (mp.level + 1) % LEVELS.length });
const mpLeave = () => { net.send({ t: 'leave' }); net.close(); mp.code = ''; mp.players = []; mp.round = 0; goHome(); };
$('mpBack').onclick = () => { if (mp.code) mpLeave(); else goHome(); };
$('btnMpLeave').onclick = mpLeave;

// #debug: tarayıcı konsolu ve denge testi (tools/denge-testi.mjs) için kancalar
if (DEBUG) window.__ns = {
  step, botDir, addVirus, prog, createMusic,
  get st() { return { state, mode, len, eaten, target, exitOpen, score, levelIdx, reason: deathReason, cell }; }, mp, bot(on) { autoBot = on; },
  items: () => items.map(i => [i.type, i.x, i.y]), viruses: () => viruses.map(v => [v.x, v.y]),
  head: () => [bx[0], by[0]], body: () => Array.from({ length: len }, (_, i) => [bx[i], by[i]]), obs: (x, y) => obstacle[y * COLS + x],
  mover: (x, y) => !!moverAt(x, y), exit: () => exits, setDir: d => { dir = d; queue.length = 0; }, dir: () => dir,
  carried: () => carriedAt.length, lv: () => lv, spawn, callout, die, sneeze: () => sneeze(dir), cam: () => ({ ...cam, pre }),
  snakeBox: () => { const r = snakeLayer.getBounds(); return [r.x, r.y, r.width, r.height]; },
  // yılanı verilen hücrelere yerleştirip oyunu dondurur (görünüm denetimi)
  YK,
  pose(cells, skinIdx) { frozen = true; len = prevLen = cells.length; cells.forEach(([x, y], i) => { bx[i] = px[i] = x; by[i] = py[i] = y; }); if (skinIdx !== undefined) applySkin(skinIdx); },
  // bölümü bot oynar
  play(i) { openIntro(i); begin(); autoBot = true; }, intro: openIntro,
  run(maxMs = 300000) {
    const t0 = gameTime;
    while ((state === 'play' || state === 'exiting') && gameTime - t0 < maxMs) simTick(16);
    autoBot = false;
    return { state, reason: deathReason, time: Math.round((gameTime - t0) / 1000), eaten, target, len, score, immunes: lv.immunes, hits: lv.hits, expelled: lv.expelled, hardened: lv.hardened, replicated: lv.replicated };
  },
};

$('reCloseText').textContent = CLOSING;
setMute(); applyVolumes(); applySkin(); layout(); goHome();
})();
