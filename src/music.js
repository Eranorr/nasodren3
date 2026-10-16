/* =========================================================================
   MÜZİK: dosyasız, prosedürel.
   Herkese hitap etsin, uzun dinlemede yormasın diye sert dalga (kare, testere) yok; kalimba benzeri tıngırtı, sıcak pad,
   yuvarlak bas, hafif shaker; majör, tanıdık akor yürüyüşleri.
   - menü ve kazanma sakin (72 ve 92 bpm); 16 ölçülük döngünün ilk 8 ölçüsü yalnızca eşlik, sonraki 8 ölçüde ezgi girer
   - bölümler (drive) harekete geçirir: 112-124 bpm, her vuruşta yumuşak, tok bir vuruş (kick), 2. ve 4. vuruşta hafif el
     şaklaması, 8'lik zıplayan bas, vuruşla nefes alan pad; ezgi 4. ölçüde girer, cümle sonlarında kısa bir yükseliş (riser)
   - her sahnenin elle yazılmış kendi ezgisi var: oyuncu parçayı tanır
   Ses seviyesi ve susturma bu modülün işi değil: çıkış düğümü (müzik kanalı) audio.js'te kısılır.
   ========================================================================= */
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// akorlar: köke göre yarım ton, ölçü başına bir akor (8 ölçü)
const I = [0, 4, 7, 11], ii = [2, 5, 9, 12], iii = [4, 7, 11, 14], IV = [5, 9, 12, 16], V = [7, 11, 14, 17], vi = [9, 12, 16, 19];
export const SCENES = {
  menu: { key: 53, bpm: 72, arp: 'sparse', shaker: false, chords: [I, IV, vi, IV, I, iii, IV, V] },
  act0: { key: 48, bpm: 112, arp: 'drive',  shaker: true, drive: true, chords: [I, V, vi, IV, I, V, IV, IV] },   // Tıkanıklık
  act1: { key: 50, bpm: 118, arp: 'drive',  shaker: true, drive: true, chords: [vi, IV, I, V, vi, IV, ii, V] },  // Virüs
  act2: { key: 52, bpm: 124, arp: 'bright', shaker: true, drive: true, chords: [I, iii, IV, V, vi, IV, ii, V] },  // Direnç
  win:  { key: 55, bpm: 92, arp: 'bright', shaker: false, chords: [I, V, vi, iii, IV, I, ii, V] },
};
const STEPS = 8;                                // ölçüde 8'lik nota
const ARP = { sparse: [0, null, null, 2, null, null, 1, null], flow: [0, 2, 1, 2, 3, 2, 1, 2], bright: [0, 1, 2, 3, 2, 1, 2, 3], drive: [0, 2, 1, 3, 0, 2, 3, 4] };

/* Ezgiler elle yazıldı: her ölçü [adım, uzunluk, derece] üçlüleri (8'lik ızgara, derece 1 = tonik, 8 = bir oktav üst).
   Güçlü vuruşlarda (adım 0 ve 4) akor tonu; küçük adımlarla dalgalanan, söylenebilir çizgi; cümle sonu döngünün başına bağlanır. */
const MELODY = {
  menu: [[[0, 3, 3], [3, 1, 5], [4, 4, 5]], [[0, 2, 6], [2, 2, 5], [4, 4, 4]], [[0, 3, 3], [3, 1, 2], [4, 4, 1]], [[0, 6, 4]],
         [[0, 2, 3], [2, 2, 5], [4, 4, 8]], [[0, 3, 7], [3, 1, 6], [4, 4, 5]], [[0, 2, 6], [2, 2, 4], [4, 4, 3]], [[0, 4, 2], [4, 4, 5]]],
  act0: [[[0, 2, 1], [2, 2, 3], [4, 3, 5], [7, 1, 6]], [[0, 3, 5], [3, 1, 4], [4, 4, 2]], [[0, 2, 3], [2, 2, 1], [4, 2, 3], [6, 2, 5]], [[0, 6, 6], [6, 2, 5]],
         [[0, 2, 8], [2, 1, 7], [3, 1, 6], [4, 4, 5]], [[0, 2, 5], [2, 1, 6], [3, 1, 5], [4, 4, 2]], [[0, 2, 4], [2, 2, 3], [4, 2, 4], [6, 2, 6]], [[0, 2, 6], [2, 2, 5], [4, 4, 8]]],
  act1: [[[0, 3, 6], [3, 1, 5], [4, 4, 3]], [[0, 2, 4], [2, 2, 5], [4, 2, 3], [6, 2, 2]], [[0, 3, 3], [3, 1, 2], [4, 4, 1]], [[0, 4, 2], [4, 4, 5]],
         [[0, 2, 6], [2, 2, 8], [4, 4, 6]], [[0, 3, 6], [3, 1, 5], [4, 4, 4]], [[0, 2, 2], [2, 2, 3], [4, 2, 4], [6, 2, 6]], [[0, 6, 5]]],
  act2: [[[0, 1, 5], [1, 1, 5], [2, 2, 8], [4, 2, 7], [6, 2, 5]], [[0, 2, 3], [2, 2, 5], [4, 4, 7]], [[0, 2, 6], [2, 1, 5], [3, 1, 4], [4, 4, 3]], [[0, 4, 2], [4, 4, 5]],
         [[0, 2, 6], [2, 2, 8], [4, 2, 6], [6, 2, 5]], [[0, 3, 4], [3, 1, 3], [4, 4, 1]], [[0, 2, 2], [2, 2, 4], [4, 2, 6], [6, 2, 4]], [[0, 4, 5], [4, 2, 7], [6, 2, 9]]],
  win:  [[[0, 1, 1], [1, 1, 3], [2, 2, 5], [4, 4, 8]], [[0, 2, 7], [2, 2, 6], [4, 4, 5]], [[0, 2, 6], [2, 1, 5], [3, 1, 6], [4, 4, 8]], [[0, 3, 7], [3, 1, 5], [4, 4, 3]],
         [[0, 2, 4], [2, 2, 6], [4, 4, 8]], [[0, 2, 5], [2, 2, 3], [4, 4, 1]], [[0, 2, 2], [2, 2, 4], [4, 4, 6]], [[0, 4, 5], [4, 4, 2]]],
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const degree = d => MAJOR[(d - 1) % 7] + 12 * Math.floor((d - 1) / 7);
// dışa açık: test aracı ezgiyi kontrol eder
export function makeMelody(name) {
  return MELODY[name].flatMap((bar, b) => bar.map(([st, len, d]) => ({ bar: b, st, len, n: degree(d) })));
}

export function createMusic(ctx, destination) {
  const master = ctx.createGain(); master.gain.value = 0;
  const duck = ctx.createGain(); duck.gain.value = 1;          // duraklatmada kısılır
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200; tone.Q.value = .5;   // tiz uçları yumuşat
  const comp = ctx.createDynamicsCompressor();
  try { comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = .02; comp.release.value = .3; } catch {}
  master.connect(tone).connect(comp).connect(duck).connect(destination);
  const drum = ctx.createGain(); drum.connect(master);   // vuruşlar yankısız: tok ve net kalsın
  // küçük oda yankısı: üretilmiş darbe yanıtı, dosya yok
  const verb = ctx.createConvolver(), verbIn = ctx.createGain(); verbIn.gain.value = .22;
  { const len = (ctx.sampleRate * 2.2) | 0, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; }
  verbIn.connect(verb).connect(master);
  // ezgiye hafif eko
  const echo = ctx.createDelay(1.5), echoFb = ctx.createGain(), echoLp = ctx.createBiquadFilter(), echoOut = ctx.createGain();
  echoFb.gain.value = .22; echoLp.type = 'lowpass'; echoLp.frequency.value = 1800; echoOut.gain.value = .25;
  echo.connect(echoLp).connect(echoFb).connect(echo); echoLp.connect(echoOut).connect(master);
  const nlen = (ctx.sampleRate * .2) | 0, noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < nlen; i++) d[i] = Math.random() * 2 - 1; }

  let scene = SCENES.menu, sceneName = 'menu', melody = makeMelody('menu'), voice = bus(false);
  let running = false, timer = 0, nextTime = 0, step = 0;

  // sahne değişince eski notalar sönerken yenisi başlasın
  function bus(fadeIn) {
    const g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(fadeIn ? .0001 : 1, t); if (fadeIn) g.gain.linearRampToValueAtTime(1, t + 1.2);
    g.connect(master); g.connect(verbIn); return g;
  }
  function retire(g) {
    const t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(.0001, t + 1.2);
    setTimeout(() => { try { g.disconnect(); } catch {} }, 2500);
  }
  const env = (g, t, peak, a, d) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
  const osc = (type, f, t, dur, out) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(out); o.start(t); o.stop(t + dur + .05); return o; };

  function pad(t, chord, dur, sd) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = .4;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.026, t + dur * .35); g.gain.setValueAtTime(.026, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    lp.connect(g);
    if (scene.drive) {   // vuruşla nefes alan pad: her vuruşta kısılıp yeniden açılır
      const pm = ctx.createGain(); g.connect(pm).connect(voice);
      for (let k = 0; k < 4; k++) { const tb = t + k * sd * 2; pm.gain.setValueAtTime(.4, tb); pm.gain.linearRampToValueAtTime(1, tb + sd * 1.6); }
    } else g.connect(voice);
    for (const n of chord) for (const det of [-6, 6]) osc('triangle', mtof(scene.key + n) * Math.pow(2, det / 1200), t, dur, lp);
  }
  function bass(t, n, dur, vol = .085) {
    const g = ctx.createGain(); env(g, t, vol, dur < .3 ? .01 : .03, dur); g.connect(voice);
    osc('sine', mtof(scene.key + n - 12), t, dur + .1, g);
    const h = ctx.createGain(); env(h, t, .012, .03, dur * .6); h.connect(voice); osc('triangle', mtof(scene.key + n), t, dur, h);   // küçük hoparlörde de duyulsun
  }
  function pluck(t, n, vol) {   // kalimba: temel + kısa sönen üst kısmi
    const f = mtof(scene.key + n + 12), g = ctx.createGain(); env(g, t, vol, .005, .7); g.connect(voice);
    osc('sine', f, t, .75, g);
    const p = ctx.createGain(); env(p, t, vol * .25, .003, .12); p.connect(voice); osc('sine', f * 3.98, t, .15, p);
  }
  function lead(t, n, dur) {
    const f = mtof(scene.key + n + 12), g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.04, t + .05); g.gain.setValueAtTime(.04, t + Math.max(.06, dur - .12)); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .3);
    lp.connect(g); g.connect(voice); g.connect(echo);
    const o = osc('triangle', f, t, dur + .35, lp), vib = ctx.createOscillator(), vg = ctx.createGain();   // hafif vibrato
    vib.frequency.value = 5; vg.gain.value = f * .004; vib.connect(vg).connect(o.frequency); vib.start(t + .15); vib.stop(t + dur + .4);
  }
  function kick(t, vol) {   // yumuşak, tok vuruş: alçalan sinüs, tıkırtısız
    const g = ctx.createGain(), o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(46, t + .13);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + .32);
    o.connect(g).connect(drum); o.start(t); o.stop(t + .36);
  }
  function clap(t, vol) {   // hafif el şaklaması: kısa, orta frekansta süzülmüş gürültü
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf;
    f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = .8; env(g, t, vol, .003, .11); s.connect(f).connect(g); g.connect(drum); g.connect(verbIn);
    s.start(t); s.stop(t + .16);
  }
  function riser(t, dur) {   // cümle sonunda yükselen hışırtı: bir sonraki bölüme hazırlar
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true;
    f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3200, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.022, t + dur * .95); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .03);
    s.connect(f).connect(g).connect(voice); s.start(t); s.stop(t + dur + .05);
  }
  function shaker(t, vol) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf;
    f.type = 'highpass'; f.frequency.value = 7000; env(g, t, vol, .004, .05); s.connect(f).connect(g).connect(voice); s.start(t); s.stop(t + .08);
  }

  function playStep(t, sd) {
    const inBar = step % STEPS, bar = Math.floor(step / STEPS) % 16, b8 = bar % 8, chord = scene.chords[b8];
    if (inBar === 0) pad(t, chord, sd * STEPS * 1.08, sd);
    if (scene.drive) {
      if (inBar % 2 === 0) kick(t, inBar === 0 ? .24 : .18);                                 // her vuruş
      if (inBar === 2 || inBar === 6) clap(t, .028);                                        // 2. ve 4. vuruş
      bass(t, chord[0] + (inBar % 2 ? 12 : 0) + (inBar === 7 && b8 % 2 ? 7 : 0), sd * .8, .06);   // 8'lik zıplayan bas
      if (b8 === 7 && inBar === 4) riser(t, sd * 4);
    } else {
      if (inBar === 0) bass(t, chord[0], sd * 3.2);
      if (inBar === 4) bass(t, chord[0] + (b8 % 2 ? 7 : 0), sd * 3);
    }
    const a = ARP[scene.arp][inBar];
    if (a !== null) pluck(t, chord[a % chord.length] + (a >= chord.length ? 12 : 0), inBar === 0 ? .05 : .036);
    if (scene.shaker && (scene.drive || inBar % 2 === 1)) shaker(t, inBar % 2 ? (inBar === 3 || inBar === 7 ? .008 : .006) : .003);
    if (bar >= (scene.drive ? 4 : 8)) for (const m of melody) if (m.bar === b8 && m.st === inBar) lead(t, m.n, m.len * sd * .95);   // ezgi: bölümlerde erken girer
  }
  function schedule() {
    if (!running) return;
    const sd = 60 / scene.bpm / 2;
    while (nextTime < ctx.currentTime + .6) {
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + .05;
      playStep(nextTime, sd); nextTime += sd; step++;
    }
    echo.delayTime.value = sd * 3;
  }
  function ramp(node, to, secs) {
    const t = ctx.currentTime; node.gain.cancelScheduledValues(t); node.gain.setValueAtTime(node.gain.value, t); node.gain.linearRampToValueAtTime(to, t + secs);
  }
  return {
    // menu | act0 | act1 | act2 | win
    setScene(name) {
      if (name === sceneName || !SCENES[name]) return;
      sceneName = name; scene = SCENES[name]; melody = makeMelody(name); step = 0;
      if (!running) return;
      retire(voice); voice = bus(true); nextTime = ctx.currentTime + .1;
    },
    start() {
      if (running) return;
      running = true; step = 0; nextTime = ctx.currentTime + .15; ramp(master, 1, 2);
      schedule(); timer = setInterval(schedule, 100);
    },
    duck(on) { ramp(duck, on ? .35 : 1, .4); },
    get running() { return running; },
    // test aracı için: zamanlayıcı olmadan sec saniyelik müziği sıraya koyar (OfflineAudioContext ile çizim)
    prerender(sec) { running = true; master.gain.value = 1; step = 0; nextTime = .1; const sd = 60 / scene.bpm / 2; echo.delayTime.value = sd * 3; while (nextTime < sec) { playStep(nextTime, sd); nextTime += sd; step++; } running = false; },
  };
}
