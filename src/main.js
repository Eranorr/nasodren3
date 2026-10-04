import * as PIXI from 'pixi.js';
import { COLS, ROWS, ACTS, LEVELS, ENDLESS, DEMO, FACTS, CLOSING, TIPS, SKINS, BADGES, ITEM_INFO, GOAL_TEXT, REASONS } from './content.js';
import { prog, save, totalStars, unlocked } from './save.js';
import { initAudio, playSfx } from './audio.js';
import { TS, cnv, seeded, C } from './textures.js';

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

// DOM ikonları aynı dokulardan
const ICON = { mucus: C.mucus[0], gold: C.gold, serum: C.serum, breeze: C.breeze, polyp: C.polyp[0], septum: C.septum, plug: C.plug, crust: C.crust,
  virus: C.virus, infected: C.infected[0], antibiotic: C.capsule, flora: C.flora, resist: C.resist, swell: C.swell };
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
for (const k of ['ball', 'face', 'soft', 'dot', 'gold', 'serum', 'breeze', 'septum', 'crust', 'plug', 'portal', 'fresh', 'petal', 'virus', 'petals', 'eye', 'face2', 'leaf', 'tuber', 'bubble', 'bloom', 'flora', 'resist', 'swell']) T[k] = PIXI.Texture.from(C[k]);
T.antibiotic = PIXI.Texture.from(C.capsule);
T.mucus = C.mucus.map(c => PIXI.Texture.from(c));
T.infected = C.infected.map(c => PIXI.Texture.from(c));
T.polyp = C.polyp.map(c => PIXI.Texture.from(c));

const petalLayer = new PIXI.Container();
const board = new PIXI.Container();
app.stage.addChild(petalLayer, board);
const shadowG = new PIXI.Graphics(), baseG = new PIXI.Graphics(), inflamG = new PIXI.Graphics(), rimG = new PIXI.Graphics();   // inflamG: iltihap kızarıklığı, temizlendikçe solar
const cleanLayer = new PIXI.Container(), bloomLayer = new PIXI.Container(), gateLayer = new PIXI.Container(), floraLayer = new PIXI.Container();
const obsLayer = new PIXI.Container(), itemLayer = new PIXI.Container(), moverLayer = new PIXI.Container(), virusLayer = new PIXI.Container();
const snakeLayer = new PIXI.Container(), maskG = new PIXI.Graphics(), fxLayer = new PIXI.Container(), popLayer = new PIXI.Container(), flashG = new PIXI.Graphics();
board.addChild(shadowG, baseG, inflamG, cleanLayer, bloomLayer, rimG, floraLayer, gateLayer, obsLayer, itemLayer, moverLayer, virusLayer, snakeLayer, maskG, fxLayer, popLayer, flashG);
snakeLayer.mask = maskG; flashG.alpha = 0; inflamG.alpha = 0;
const gateMaskG = new PIXI.Graphics(); board.addChild(gateMaskG); gateLayer.mask = gateMaskG;   // ostium ışıması çerçevenin dışına taşmasın

// Arka planda süzülen siklamen yaprakları (12 sprite)
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
let cell = 20, boardW = 0, boardH = 0, baseX = 0, baseY = 0, calloutBand = 0;   // calloutBand: tahtanın üstünde mesajlara ayrılan şerit
let mode = 'demo';               // demo | adventure | endless
let state = 'demo';              // demo | intro | play | exiting | dying | result | over | paused
let pausedFrom = null, cfg = DEMO, levelIdx = 0, score = 0;
const bx = new Int16Array(MAXSEG), by = new Int16Array(MAXSEG), px = new Int16Array(MAXSEG), py = new Int16Array(MAXSEG);
const ix = new Float32Array(MAXSEG), iy = new Float32Array(MAXSEG);
let len = 0, prevLen = 0, grow = 0, dir = 0, moveDir = 0, queue = [];
let acc = 0, gameTime = 0, levelStart = 0;
let eaten = 0, target = 0, exitOpen = false, exitX = 0, exitY = 0, exitDir = 0, exitSteps = 0, exits = [];   // exits: tahta dışındaki çıkış hücreleri; exitX/Y ilki
let combo = 0, lastEat = -1e9, boostUntil = 0, slowUntil = 0, breezeUntil = 0;
let shake = 0, stepCount = 0, autoBot = false, botBait = false, deathReason = '';   // autoBot: denge testi için botun bölüm oynaması (yalnızca #debug)
const obstacle = new Uint8Array(COLS * ROWS), swellAt = new Uint8Array(COLS * ROWS), cleaned = new Uint8Array(COLS * ROWS), scratch = new Uint8Array(COLS * ROWS);
let cleanedCount = 0, freeCells = 1, swellStage = 0;   // swellAt: şişlik hücresinin çekileceği aşama (1 iç, 2 dış katman)
const cleanAnims = [];
let items = [], movers = [], viruses = [], flora = [];
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
  // dikey ekranda tahtanın üstünde mesaj şeridi ayrılır: ekran mesajı tahtanın üst kısmını (çoğu bölümde ostiumu) kapatmasın.
  // Yatay ekranda mesajlar tahtanın yanındaki boşluğa yazılır.
  const band = h >= w * .9 ? Math.min(64, Math.round(h * .08)) : 0;
  cell = Math.max(8, Math.floor(Math.min((w - 24) / COLS, (h - band - 36) / ROWS)));
  boardW = COLS * cell; boardH = ROWS * cell;
  const pad = Math.round(cell * .34), slack = h - boardH;
  calloutBand = Math.min(Math.max(0, slack - pad * 2 - 8), 100);
  baseX = Math.round((w - boardW) / 2); baseY = Math.round(calloutBand + (slack - calloutBand) / 2) - 2;
  board.position.set(baseX, baseY);
  shadowG.clear().roundRect(-pad, -pad + cell * .28, boardW + pad * 2, boardH + pad * 2, cell * .9).fill({ color: 0x9C3C62, alpha: .16 });
  rimG.clear().roundRect(-pad, -pad, boardW + pad * 2, boardH + pad * 2, cell * .9).stroke({ width: pad, color: 0xE06C8F, alignment: 1 })
    .roundRect(-pad * .5, -pad * .5, boardW + pad, boardH + pad, cell * .75).stroke({ width: 2, color: 0xFFFFFF, alpha: .5 });
  drawBoard();
  maskG.clear().rect(-2, -2, boardW + 4, boardH + 4).fill(0xffffff);
  gateMaskG.clear().roundRect(-pad, -pad, boardW + pad * 2, boardH + pad * 2, cell * .9).fill(0xffffff);
  flashG.clear().roundRect(-pad, -pad, boardW + pad * 2, boardH + pad * 2, cell * .9).fill(0xFF3355);
  for (let i = 0; i < cleanSprites.length; i++) cleanSprites[i].position.set(((i % COLS) + .5) * cell, (((i / COLS) | 0) + .5) * cell);
  for (const a of cleanAnims) a.done = false;
  for (let i = 0; i < cleanSprites.length; i++) if (cleaned[i]) cleanSprites[i].width = cleanSprites[i].height = cell * .94;
  placeObstacleSprites();
  for (const it of items) { placeItem(it, true); }
  for (const m of movers) m.s.width = m.s.height = cell * 1.1;
  placeGate();
}
// Şekilli bölümde duvar koyu mukoza dokusu, boşluk yuvarlak hatlı açık zemin olarak çizilir
const isWall = i => obstacle[i] === 5;
function drawBoard() {
  const rnd = seeded(7), shades = [0xF7C6C1, 0xF5C0BC, 0xF8CBC6, 0xF6C3BF];
  baseG.clear();
  if (!cfg.shape) baseG.roundRect(0, 0, boardW, boardH, cell * .5).fill({ color: 0xEBA3A6 });
  else {
    baseG.roundRect(0, 0, boardW, boardH, cell * .5).fill({ color: 0xC65A7C });
    for (let i = 0; i < obstacle.length; i++) if (isWall(i))
      baseG.circle(((i % COLS) + .5) * cell + (rnd() - .5) * cell * .4, (((i / COLS) | 0) + .5) * cell + (rnd() - .5) * cell * .4, cell * (.3 + rnd() * .25)).fill({ color: rnd() < .5 ? 0xD06A8A : 0xB84E70, alpha: .7 });
    const h = cell * .24, g = cell * .06;
    for (let i = 0; i < obstacle.length; i++) if (!isWall(i)) baseG.roundRect((i % COLS) * cell - h, ((i / COLS) | 0) * cell - h, cell + h * 2, cell + h * 2, cell * .6).fill({ color: 0xF4BFCB });
    for (let i = 0; i < obstacle.length; i++) if (!isWall(i)) baseG.roundRect((i % COLS) * cell - g, ((i / COLS) | 0) * cell - g, cell + g * 2, cell + g * 2, cell * .45).fill({ color: 0xEBA3A6 });
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const sh = shades[(rnd() * 4) | 0];
    if (!isWall(y * COLS + x)) baseG.roundRect(x * cell + 1.5, y * cell + 1.5, cell - 3, cell - 3, cell * .3).fill({ color: sh });
  }
  inflamG.clear().roundRect(0, 0, boardW, boardH, cell * .5).fill({ color: 0xE0304F });
}
new ResizeObserver(() => { app.renderer.resize(Math.max(1, stageEl.clientWidth), Math.max(1, stageEl.clientHeight)); layout(); }).observe(stageEl);

/* =========================================================================
   BÖLÜM KURULUMU
   ========================================================================= */
// engel türleri: 1 polip, 2 sert mukus, 3 raf, 4 dirençli bakteri, 5 duvar (çizilmez, tahtanın parçası), 6 şişlik, 7 ostium tıkacı
const TEXOF = { 1: i => T.polyp[i % 3], 2: () => T.crust, 3: () => T.septum, 4: () => T.resist, 6: () => T.swell, 7: () => T.swell };
function placeObstacleSprites() {
  let k = 0;
  for (let i = 0; i < obstacle.length; i++) {
    const v = obstacle[i]; if (!v || v === 5) continue;
    let s = obsPool[k]; if (!s) { s = new PIXI.Sprite(T.dot); s.anchor.set(.5); obsLayer.addChild(s); obsPool[k] = s; }
    s.texture = TEXOF[v](i); s.visible = true;
    s.position.set(((i % COLS) + .5) * cell, (((i / COLS) | 0) + .5) * cell);
    s.width = s.height = cell * (v === 3 ? 1.04 : v === 4 ? 1.15 : v >= 6 ? 1.3 : 1.08); s.rotation = v === 3 || v === 4 ? 0 : (i * 1.7) % 6.28;
    s.tint = v === 7 ? 0xFFD2B4 : v === 6 && swellAt[i] === 2 ? 0xE6E6E6 : 0xFFFFFF;
    k++;
  }
  for (; k < obsPool.length; k++) obsPool[k].visible = false;
}

function setupBoard(c) {
  cfg = c;
  obstacle.fill(0); swellAt.fill(0); swellStage = 0;
  if (c.shape) buildShape(c.shape);
  for (const r of c.obs) {
    const kind = (r.w === 1 || r.h === 1) && r.w * r.h > 2 ? 3 : 1;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) obstacle[y * COLS + x] = kind;
  }
  for (const m of movers) m.s.destroy(); movers = [];
  for (const [x, y, d] of (c.movers || [])) {
    const s = new PIXI.Sprite(T.plug); s.anchor.set(.5); moverLayer.addChild(s);
    movers.push({ x, y, dx: d, px: x, py: y, s, ph: Math.random() * 6 });
  }
  freeCells = 0; for (let i = 0; i < obstacle.length; i++) if (!obstacle[i] || obstacle[i] >= 6) freeCells++;
  placeObstacleSprites(); drawBoard();

  cleaned.fill(0); cleanedCount = 0; cleanAnims.length = 0; freshCell.fill(0);
  for (const b of BLOOMS) { b.life = 0; b.s.visible = false; }
  for (const s of cleanSprites) { s.visible = false; }
  for (const it of items) it.s.destroy(); items = [];
  for (const v of viruses) v.s.destroy(); viruses = []; carriedAt = []; hurtUntil = 0; virusWait = 0;
  len = 4; grow = 0; dir = moveDir = 0; queue.length = 0; stepCount = 0;
  const [sx, sy] = c.start || [9, ROWS - 4];
  for (let i = 0; i < len; i++) { bx[i] = sx; by[i] = sy + i; px[i] = bx[i]; py[i] = by[i]; }
  prevLen = len;
  for (let i = 0; i < len; i++) cleanCell(bx[i], by[i], true);
  target = c.target; eaten = 0; exitOpen = false; gateLayer.visible = !!c.shape; placeGate();   // şekilli bölümde ostium baştan görünür, kapalı
  combo = 0; lastEat = -1e9; boostUntil = slowUntil = breezeUntil = 0; acc = 0;
  levelStart = gameTime;
  lv = { sneezes: 0, golds: 0, hardened: 0, maxLen: len, trapped: 0, carried: 0, expelled: 0, replicated: 0, hits: 0, ab: 0, abSeen: 0 };
  for (const f of flora) f.s.destroy(); flora = [];
  for (let i = 0; i < (c.flora || 0); i++) addFlora();
  spawn('mucus'); spawn('mucus');
  for (let i = 0; i < (c.virus || 0); i++) spawnVirus();
  renderSnake(1, 16, performance.now());
}

/* =========================================================================
   SİNÜS ŞEKLİ: duvar, şişkin mukoza katmanları ve ostium
   ========================================================================= */
const SWELL_AT = [.4, .8];          // şişliğin iç ve dış katmanının çekildiği tıkanıklık oranları
function buildShape(shape) {
  exits = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = shape[y][x];
    if (ch === '#') obstacle[y * COLS + x] = 5;
    else if (ch === '=') {
      obstacle[y * COLS + x] = 7;
      if (y === 0) exits.push([x, -1]); else if (y === ROWS - 1) exits.push([x, ROWS]);
      else if (x === 0) exits.push([-1, y]); else if (x === COLS - 1) exits.push([COLS, y]);
    }
  }
  [exitX, exitY] = exits[0];
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
  while (swellStage < 2 && eaten / target >= SWELL_AT[swellStage]) {
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
function floraAt(x, y) { for (const f of flora) if (f.x === x && f.y === y) return f; return null; }
function occupied(x, y) { return obstacle[y * COLS + x] || bodyAt(x, y) || itemAt(x, y) || moverAt(x, y) || virusAt(x, y); }

function spawn(type) {
  for (let pass = 0; pass < 2; pass++) {
    const cand = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (occupied(x, y)) continue;
      if (pass === 0 && Math.abs(x - bx[0]) + Math.abs(y - by[0]) < 3) continue;
      if (pass === 0 && movers.some(m => m.y === y)) continue;          // tıkaç hattına mukus bırakma
      if (pass === 0 && floraAt(x, y)) continue;
      cand.push(x, y);
    }
    if (!cand.length) continue;
    const k = ((Math.random() * cand.length / 2) | 0) * 2;
    const vr = (Math.random() * 3) | 0, tex = type === 'mucus' ? T.mucus[vr] : T[type];
    const s = new PIXI.Sprite(tex); s.anchor.set(.5); itemLayer.addChild(s);
    const life = type === 'gold' ? 6000 : type === 'serum' || type === 'breeze' || type === 'antibiotic' ? 8000 : Infinity;
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
  if (cfg.shape) openOstium(); else pickExit();
  gateLayer.visible = true; placeGate();
  for (const it of items.slice()) if ((it.type === 'mucus' && !it.infected) || it.type === 'antibiotic') removeItem(it);   // virüslü olanlar kalır, hâlâ taşınabilir
  callout('Ostium açıldı!', 'Akışı parlayan çıkışa götür'); sfx('open'); hudBar();
}
function pickExit() {
  const opts = [];
  const free = (x, y) => !obstacle[y * COLS + x];
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
   ANTİBİYOTİK VE DİRENÇ: kapsül virüse etki etmez. Alınırsa dokudaki zararsız
   bakterilerden biri dirençlenir ve geçilmez bir engele dönüşür
   ("direnç geliştiren kişi değil, bakteridir").
   ========================================================================= */
const nearObstacle = (x, y) => { for (let d = 0; d < 4; d++) { const X = x + DX[d], Y = y + DY[d]; if (X >= 0 && Y >= 0 && X < COLS && Y < ROWS && obstacle[Y * COLS + X]) return true; } return false; };
function floraCell() {
  // kenara ve engellere bitişik olmayan hücre: dirençlenince bir geçidi tamamen kapatmasın
  const cand = [];
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++)
    if (!occupied(x, y) && !floraAt(x, y) && !nearObstacle(x, y) && Math.abs(x - bx[0]) + Math.abs(y - by[0]) >= 5 && !movers.some(m => m.y === y)) cand.push(x, y);
  if (!cand.length) return null;
  const k = ((Math.random() * cand.length / 2) | 0) * 2;
  return [cand[k], cand[k + 1]];
}
function addFlora() {
  const c = floraCell(); if (!c) return null;
  const s = new PIXI.Sprite(T.flora); s.anchor.set(.5); floraLayer.addChild(s);
  const f = { x: c[0], y: c[1], s, ph: Math.random() * 6.28 }; flora.push(f); return f;
}
function maybeAntibiotic() {
  // sinüste virüs varken çıkar: serbest, mukusa yapışmış ya da akışın taşıdığı
  const virusNow = viruses.length || carriedAt.length || items.some(it => it.infected);
  if (!cfg.antibiotic || exitOpen || !virusNow || countType('antibiotic') || Math.random() >= cfg.antibiotic) return;
  if (spawn('antibiotic') && !lv.abSeen++) callout('Antibiyotik kapsülü', 'Virüse etki etmez, dokunma');
}
function makeResistant() {
  const ok = flora.filter(f => !occupied(f.x, f.y) && Math.abs(f.x - bx[0]) + Math.abs(f.y - by[0]) >= 4);
  let x, y;
  if (ok.length) {
    const f = ok[(Math.random() * ok.length) | 0]; x = f.x; y = f.y;
    f.s.destroy(); flora.splice(flora.indexOf(f), 1);
  } else { const c = floraCell(); if (!c) return; [x, y] = c; }
  obstacle[y * COLS + x] = 4; placeObstacleSprites();
  burst((x + .5) * cell, (y + .5) * cell, 18, 0x2F6B52); sfx('resist');
}
function takeAntibiotic(it) {
  const cx = (it.x + .5) * cell, cy = (it.y + .5) * cell;
  removeItem(it); lv.ab++;
  for (const v of viruses) burst((v.x + .5) * cell, (v.y + .5) * cell, 6, 0xFFFFFF);   // virüslere bir şey olmaz
  burst(cx, cy, 12, 0xFF8A95); popup('Etkisiz', cx, cy, 0xFF8A95); sfx('antibiotic');
  if (navigator.vibrate) try { navigator.vibrate(20); } catch {}
  makeResistant();
  callout('Antibiyotik virüse etki etmez', 'Dokudaki bir bakteri direnç kazandı');
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
        callout(`${lv.carried} virüs dışarı atıldı`, 'Akış onları ostiumdan taşıdı');
      }
      burst((nx + .5) * cell, (ny + .5) * cell, 26, 0x2FD6BE); petalBurst((bx[0] + .5) * cell, (by[0] + .5) * cell, 22);
      advance(dir, false); sfx('exit'); return;
    }
    return die('wall');
  }
  const ob = obstacle[ny * COLS + nx];
  if (ob) return die(ob === 2 ? 'crust' : ob === 4 ? 'resist' : ob === 5 ? 'wall' : ob >= 6 ? 'swell' : 'polyp');
  if (moverAt(nx, ny)) return die('plug');
  const willGrow = grow > 0;
  for (let i = 1; i < (willGrow ? len : len - 1); i++) if (bx[i] === nx && by[i] === ny) return die('self');
  const hitV = gameTime >= hurtUntil ? virusAt(nx, ny) : null;
  advance(dir, willGrow, nx, ny); moveDir = dir;
  if (!willGrow) vacated(px[prevLen - 1], py[prevLen - 1]);
  if (willGrow) grow--;
  if (len > lv.maxLen) lv.maxLen = len;
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
    if (cfg.shape) recedeSwelling();
    if (eaten >= target) { if (!exitOpen) openExit(); }
    else if (eaten + countType('mucus') < target) spawn('mucus');
    if (!exitOpen) {
      if (!countType('gold') && Math.random() < cfg.gold) spawn('gold');
      if (!countType('serum') && Math.random() < cfg.serum) spawn('serum');
      if (!countType('breeze') && Math.random() < cfg.breeze) spawn('breeze');
      maybeAntibiotic();
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
  } else if (it.type === 'antibiotic') takeAntibiotic(it);
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
  callout('Virüse çarptın', 'Akış kısaldı. Virüsü mukusa yakalat');
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
    maybeAntibiotic();
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
  const i = y * COLS + x; if (cleaned[i]) return;
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
  // hedef: çıkış açıksa çıkış, değilse yol mesafesiyle en yakın mukus ya da altın; kapsülden, virüsten ve tıkaçtan kaçın.
  // Mesafe duvarların etrafından ölçülür (şekilli sinüslerde düz mesafe yanıltır).
  let tx, ty, md = 1e9;
  if (exitOpen) { tx = Math.min(COLS - 1, Math.max(0, exitX)); ty = Math.min(ROWS - 1, Math.max(0, exitY)); }
  else {
    const fromHead = distField(hx, hy);
    for (const it of items) if (it.type === 'mucus' || it.type === 'gold' || (botBait && it.type === 'antibiotic')) {
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
    if (it && it.type === 'antibiotic') s += botBait ? 50 : -200;
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
  state = 'dying'; flashG.alpha = .5; shake = REDUCED ? 0 : 14; sfx('die');
  burst((bx[0] + .5) * cell, (by[0] + .5) * cell, 34, 0xFF4A6A);
  if (navigator.vibrate) try { navigator.vibrate(70); } catch {}
  let bestNow;
  if (mode === 'endless') { prog.endlessBest = Math.max(prog.endlessBest, score); bestNow = prog.endlessBest; }
  else { prog.best = Math.max(prog.best, score); bestNow = prog.best; }
  save();
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

function evalGoal([t, v], st) {
  return { clean: st.clean >= v, time: st.time <= v, sneeze: st.sneezes >= v, gold: st.golds >= v, len: st.maxLen >= v, nohard: st.hardened === 0, virus: st.expelled >= v, noinfect: st.replicated === 0, noab: st.ab === 0 }[t];
}
function finishLevel() {
  state = 'result';
  const L = LEVELS[levelIdx];
  const st = { ...lv, clean: Math.round(cleanedCount / freeCells * 100), time: Math.round((gameTime - levelStart) / 1000) };
  const got = [true, evalGoal(L.obj[0], st), evalGoal(L.obj[1], st)];
  const mask = got.reduce((m, g, i) => m | (g ? 1 << i : 0), 0);
  prog.mask[levelIdx] |= mask; prog.done[levelIdx] = true; prog.best = Math.max(prog.best, score);
  if (L.antibiotic && !lv.ab) prog.noab[levelIdx] = true;
  const newFact = !prog.facts[levelIdx]; prog.facts[levelIdx] = true;
  save();
  if (st.clean >= 60) award('clean60');
  if (mask === 7) award('perfect');
  if (LEVELS.every((l, i) => !l.antibiotic || prog.noab[i])) award('noab');
  if (prog.done.every(Boolean)) award('all');
  if (totalStars() >= 10) award('stars10');
  if (totalStars() >= LEVELS.length * 3) award('starsAll');

  $('tResult').textContent = L.name + ' temizlendi';
  const goals = [['Bölümü tamamla', true], [GOAL_TEXT[L.obj[0][0]](L.obj[0][1]), got[1]], [GOAL_TEXT[L.obj[1][0]](L.obj[1][1]), got[2]]];
  $('reGoals').innerHTML = goals.map(([t, g]) => `<li><span class="st ${g ? 'on' : ''}">★</span>${t}<span class="ok ${g ? 'y' : 'n'}">${g ? '✓' : '✗'}</span></li>`).join('');
  $('reVirusWrap').style.display = L.virus ? '' : 'none'; $('reVirus').textContent = lv.expelled;
  $('reScore').textContent = score; $('reClean').textContent = st.clean + '%'; $('reTime').textContent = st.time + ' sn';
  $('reFactTitle').textContent = newFact ? 'Yeni bilgi kartı açıldı' : 'Biliyor muydunuz?';
  $('reFact').querySelector('.em').textContent = FACTS[levelIdx][0];
  $('reFactText').textContent = FACTS[levelIdx][1];
  const last = levelIdx === LEVELS.length - 1;
  $('btnNext').textContent = last ? 'Haritaya dön' : 'Sonraki: ' + LEVELS[levelIdx + 1].name;
  $('btnMapFromResult').style.display = last ? 'none' : '';
  $('reClose').style.display = last ? '' : 'none';
  // önce sinüsün açıldığı an, sonra sonuç kartı
  revealWave(); callout(L.name + ' açıldı!', 'Hava yeniden akıyor');
  setTimeout(() => {
    gateLayer.visible = false;
    if (state !== 'result') return;
    const starsEl = $('reStars'); starsEl.classList.remove('go');
    [...starsEl.children].forEach((s, i) => s.classList.toggle('on', got[i]));
    void starsEl.offsetWidth; starsEl.classList.add('go');
    got.forEach((g, i) => g && setTimeout(() => sfx('star'), 200 + i * 180));
    show('scrResult');
  }, REDUCED ? 300 : 1500);
}
// ostiumdan içeri yayılan temizlik dalgası: kalan doku sırayla ferahlar
function revealWave() {
  const ox = Math.min(COLS - 1, Math.max(0, exitX)), oy = Math.min(ROWS - 1, Math.max(0, exitY));
  const dist = new Int16Array(COLS * ROWS).fill(-1), q = [ox, oy]; dist[oy * COLS + ox] = 0; let h = 0;
  while (h < q.length) {
    const x = q[h++], y = q[h++], d0 = dist[y * COLS + x];
    for (let d = 0; d < 4; d++) {
      const X = x + DX[d], Y = y + DY[d], i = Y * COLS + X;
      if (X < 0 || Y < 0 || X >= COLS || Y >= ROWS || dist[i] >= 0 || obstacle[i] === 5) continue;
      dist[i] = d0 + 1; q.push(X, Y);
    }
  }
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < 0 || cleaned[i]) continue;
    cleanCell(i % COLS, (i / COLS) | 0); cleanAnims[cleanAnims.length - 1].t = -dist[i] * 32; freshCell[i] = 0;
  }
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
  placeCallout();
  calloutEl.classList.remove('go'); void calloutEl.offsetWidth; calloutEl.classList.add('go');
}
// Yer varsa tahtanın üstündeki şeritte; yoksa (yatay ekran) tahtanın üstünde, başın ve ostiumun uzağındaki bantta
function placeCallout() {
  const gutter = baseX - Math.round(cell * .34) - 12;
  const side = calloutBand < 60 && gutter >= 120;
  calloutEl.style.left = side ? Math.round(baseX + boardW + cell * .34 + 6 + gutter / 2) + 'px' : '';
  calloutEl.style.maxWidth = side ? Math.round(gutter - 8) + 'px' : '';
  calloutEl.classList.toggle('side', side);
  const h = calloutEl.offsetHeight;
  if (side) { calloutEl.style.top = Math.round(baseY + boardH * .3) + 'px'; return; }
  if (calloutBand >= h + 4) { calloutEl.style.top = Math.round((calloutBand - h) / 2 + 2) + 'px'; return; }
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
const STEM = rgb(0x4BA85E), STEM_HI = rgb(0x9EDC8C), WILT = rgb(0x9C8F96);
let skin = SKINS[0], skinBody = WHITE;
let headRot = 0, headPulse = 0;

function renderSnake(alpha, dt, now) {
  for (let i = 0; i < len; i++) {
    let fx = i < prevLen ? px[i] : bx[i], fy = i < prevLen ? py[i] : by[i];
    if (Math.abs(fx - bx[i]) + Math.abs(fy - by[i]) > 1.5) { fx = bx[i]; fy = by[i]; }   // ani konum değişimi (ör. virüs çarpınca kısalma): sıçra
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
    if (Math.abs(tx) + Math.abs(ty) > 3) continue;                      // ani konum değişimi
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
    const a = cleanAnims[i]; a.t += dt; const k = Math.max(0, Math.min(1, a.t / 320));   // t < 0: dalgada sırasını bekliyor
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
  for (const f of flora) {
    f.s.position.set((f.x + .5) * cell, (f.y + .5) * cell + Math.sin(now * .003 + f.ph) * cell * .04);
    f.s.width = f.s.height = cell * 1.1; f.s.rotation = Math.sin(now * .0015 + f.ph) * .3; f.s.alpha = .9;
  }
  if (gateLayer.visible) {
    const p = .5 + .5 * Math.sin(now * .006);
    gateGlow.alpha = exitOpen ? .5 + .5 * p : .12 + .08 * p; gateRing.alpha = exitOpen ? 1 : .4; gateRing.rotation = exitOpen ? -now * .005 : -now * .0008;
  }
  // iltihap kızarıklığı tıkanıklıkla birlikte solar, bölüm sonunda tamamen kaybolur
  const inflam = mode === 'adventure' && state !== 'result' ? .3 * (1 - .6 * Math.min(1, eaten / target)) : 0;
  inflamG.alpha += (inflam - inflamG.alpha) * (state === 'result' ? 1 - Math.exp(-dt * .004) : ek);
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
// simülasyon çizimden ayrı: denge testi aynı fonksiyonu çizimsiz hızlı çalıştırır
function simTick(dt) {
  let alpha = 1;
  if (!running()) return alpha;
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
  if (id) $('toast').classList.remove('low');   // kart açılınca bildirim kartın düğmelerinin üstünden kalksın
  $('hud').classList.toggle('off', mode === 'demo');
  const b = id && kbMode && $(id).querySelector('.btn'); if (b) setTimeout(() => b.focus({ preventScroll: true }), 30);
}
let lastScore = -1;
function hudScore() { if (score !== lastScore) { $('hudScore').textContent = score; lastScore = score; } }
function hudLevel() { $('hudLevel').textContent = mode === 'endless' ? 'Serbest akış' : `${levelIdx + 1}. ${cfg.name}`; }
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
  const rOn = !!cfg.antibiotic && mode !== 'demo' && lv && lv.ab > 0;
  $('chipResist').classList.toggle('on', rOn); if (rOn) $('chipResistN').textContent = lv.ab;
}
function setMute() { $('muteWave').style.display = prog.muted ? 'none' : ''; $('btnMute').setAttribute('aria-label', prog.muted ? 'Sesi aç' : 'Sesi kapat'); }
function hideHint() { if ($('hint').classList.contains('on')) { $('hint').classList.remove('on'); prog.seenTut = true; save(); } }

function homeStats() {
  $('hsBadgesTotal').textContent = BADGES.length; $('hsStarsTotal').textContent = LEVELS.length * 3;
  $('hsStars').textContent = totalStars(); $('hsBadges').textContent = Object.keys(prog.badges).length; $('hsBest').textContent = Math.max(prog.best, prog.endlessBest);
  $('btnAdventure').textContent = prog.done.some(Boolean) ? 'Devam et' : 'Oyna';
}
function goHome() { mode = 'demo'; setupBoard(DEMO); state = 'demo'; homeStats(); show('scrHome'); }

function starsHTML(m) { return [0, 1, 2].map(i => `<span class="${m >> i & 1 ? 'on' : ''}">★</span>`).join(''); }
function openMap() {
  // perdeler arasında başlık için fazladan boşluk
  const X = [30, 70, 30, 70, 30, 70], gap = 96, actGap = 60, top = 84;
  const Y = LEVELS.map((L, i) => top + i * gap + L.act * actGap), H = Y[Y.length - 1] + 70;
  const next = prog.done.findIndex(d => !d);
  let svg = `<svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="`;
  LEVELS.forEach((_, i) => { const m = (Y[i - 1] + Y[i]) / 2; svg += (i ? `C ${X[i - 1]} ${m}, ${X[i]} ${m}, ` : 'M ') + `${X[i]} ${Y[i]} `; });
  svg += `" fill="none" stroke="#F1D9E1" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 12" vector-effect="non-scaling-stroke"/></svg>`;
  const nodes = LEVELS.map((L, i) => {
    const lock = !unlocked(i), done = prog.done[i];
    return `<button class="node ${lock ? 'lock' : done ? 'done' : ''} ${i === next ? 'next' : ''}" style="left:${X[i]}%;top:${Y[i]}px" data-lv="${i}" ${lock ? 'aria-disabled="true"' : ''} aria-label="Bölüm ${i + 1}: ${L.name}${lock ? ', kilitli' : ''}">
      <span class="disc">${lock ? '🔒' : i + 1}</span><span class="nm">${L.name}</span><span class="stars">${starsHTML(prog.mask[i])}</span></button>`;
  }).join('');
  const acts = ACTS.map((name, a) => { const i = LEVELS.findIndex(L => L.act === a); return `<div class="act" style="top:${Y[i] - 80}px"><span>${a + 1}. perde</span>${name}</div>`; }).join('');
  $('map').style.height = H + 'px'; $('map').innerHTML = svg + acts + nodes;
  $('map').querySelectorAll('.node').forEach(n => n.onclick = () => { const i = +n.dataset.lv; if (unlocked(i)) openIntro(i); });
  show('scrMap');
  setTimeout(() => { const n = $('map').querySelector('.next') || $('map').querySelector('.node'); n && n.scrollIntoView({ block: 'center' }); }, 40);
}
function legendKeys(c) {
  const k = ['mucus'];
  if (c.gold) k.push('gold'); if (c.serum) k.push('serum'); if (c.breeze) k.push('breeze');
  if (c.obs.some(r => !((r.w === 1 || r.h === 1) && r.w * r.h > 2))) k.push('polyp');
  if (c.obs.some(r => (r.w === 1 || r.h === 1) && r.w * r.h > 2)) k.push('septum');
  if (c.virus) k.push('virus', 'infected');
  if (c.antibiotic) k.push('antibiotic', 'flora', 'resist');
  if (c.movers) k.push('plug'); if (c.harden) k.push('crust');
  if (c.shape) k.push('swell');
  return k;
}
// bölümde yalnızca yeni olanı göster: önceki bölümlerde anlatılanlar tekrarlanmaz
function legendFor(c, prev = []) {
  const old = prev.flatMap(legendKeys), k = legendKeys(c).filter(t => !old.includes(t));
  return k.map(t => `<div><img alt="" src="${iconURL[t]}"><span><b>${ITEM_INFO[t][0]}</b><span>${ITEM_INFO[t][1]}</span></span></div>`).join('');
}
let introBack = 'map';
function openIntro(i) {
  mode = 'adventure'; levelIdx = i; score = 0; lastScore = -1; gameSneezes = 0;
  setupBoard(LEVELS[i]); state = 'intro'; introBack = 'map';
  const L = LEVELS[i];
  $('inKicker').textContent = `${L.act + 1}. perde: ${ACTS[L.act]} · Bölüm ${i + 1}/${LEVELS.length}`;
  $('tIntro').textContent = L.name;
  $('inDesc').textContent = L.desc + (i === 0 ? ' Masaüstünde ok tuşları ya da WASD kullanabilirsin.' : '');
  const legend = legendFor(L, LEVELS.slice(0, i));
  $('inLegend').innerHTML = legend; $('inNew').style.display = legend ? '' : 'none';
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
  $('inLegend').innerHTML = legendFor(ENDLESS); $('inNew').style.display = ''; $('inGoalsWrap').style.display = 'none';
  hudLevel(); hudScore(); hudBar(); show('scrIntro');
}
function begin() {
  initAudio(); show(null); state = 'play'; levelStart = gameTime;
  if (mode === 'adventure' && levelIdx === 0 && !prog.seenTut) {
    $('hintText').textContent = matchMedia('(pointer: coarse)').matches ? 'Yön vermek için kaydır' : 'Yön vermek için ok tuşlarını ya da WASD\'yi kullan';
    $('hint').classList.add('on');
  }
}
function retry() { if (mode === 'endless') { openEndless(); begin(); } else { openIntro(levelIdx); begin(); } }
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
    body.querySelectorAll('.skin').forEach(b => b.onclick = () => { prog.skin = +b.dataset.skin; save(); applySkin(); openCollect(); });
  } else if (tab === 'badges') {
    body.innerHTML = '<div class="grid">' + BADGES.map(([id, em, nm, ds]) => `<div class="badge ${prog.badges[id] ? '' : 'lock'}"><span class="em">${em}</span><b>${nm}</b><span>${ds}</span></div>`).join('') + '</div>';
  } else {
    body.innerHTML = '<div class="facts">' + `<div class="fact"><div class="em">🤝</div><div><strong>Unutma</strong><p>${CLOSING}</p></div></div>` + FACTS.map(([em, tx], i) => prog.facts[i]
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

// ilk kez oynayan doğrudan 1. bölüme girer; anlatım oyunun içinde
$('btnAdventure').onclick = () => { initAudio(); if (!prog.done[0]) { openIntro(0); begin(); } else openMap(); };
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
function goHomeMap() { mode = 'demo'; setupBoard(DEMO); state = 'demo'; openMap(); }

document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });
addEventListener('blur', () => togglePause(true));

// #debug: tarayıcı konsolu ve denge testi (tools/denge-testi.mjs) için kancalar
if (DEBUG) window.__ns = {
  step, botDir, addVirus, prog,
  get st() { return { state, mode, len, eaten, target, exitOpen, score, levelIdx, reason: deathReason }; },
  items: () => items.map(i => [i.type, i.x, i.y]), viruses: () => viruses.map(v => [v.x, v.y]), flora: () => flora.map(f => [f.x, f.y]),
  head: () => [bx[0], by[0]], body: () => Array.from({ length: len }, (_, i) => [bx[i], by[i]]), obs: (x, y) => obstacle[y * COLS + x],
  mover: (x, y) => !!moverAt(x, y), exit: () => exits, setDir: d => { dir = d; queue.length = 0; }, dir: () => dir,
  carried: () => carriedAt.length, lv: () => lv, spawn, callout, die,
  // bölümü bot oynar; bait: bot kapsüle yönelir (direnç akışını sınamak için)
  play(i, bait = false) { botBait = bait; if (i === 'endless') openEndless(); else openIntro(i); begin(); autoBot = true; },
  run(maxMs = 300000) {
    const t0 = gameTime;
    while ((state === 'play' || state === 'exiting') && gameTime - t0 < maxMs) simTick(16);
    autoBot = false;
    return { state, reason: deathReason, time: Math.round((gameTime - t0) / 1000), eaten, target, len, score, ab: lv.ab, hits: lv.hits, expelled: lv.expelled, hardened: lv.hardened, replicated: lv.replicated };
  },
};

$('reCloseText').textContent = CLOSING;
setMute(); applySkin(); layout(); goHome();
})();
