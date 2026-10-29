/* =========================================================================
   SES
   ========================================================================= */
import { createMusic } from './music.js';
import hapsirmaURL from './assets/hapsirma.wav';

let actx = null, noiseBuf = null, sneezeBuf = null, sfxBus = null, musicBus = null, music = null, hidden = false, scene = 'menu', ducked = false;
const vol = { sfx: .8, music: .6, muted: false };
// iki ayrı ses kanalı: efektler ve müzik. Susturma ikisini de kapatır.
export function setVolumes(sfx, mus, muted) {
  vol.sfx = sfx; vol.music = mus; vol.muted = !!muted;
  if (!sfxBus) return;
  const t = actx.currentTime;
  for (const [b, v] of [[sfxBus, muted ? 0 : sfx], [musicBus, muted ? 0 : mus * .9]]) { b.gain.cancelScheduledValues(t); b.gain.setTargetAtTime(v, t, .05); }
}
// sahne: menu | act0 | act1 | act2 | win. Ses başlamadan çağrılırsa saklanır.
export function musicScene(name) { scene = name; if (music) music.setScene(name); }
export function musicDuck(on) { ducked = on; if (music) music.duck(on); }
// sekme gizlenince ses tamamen durur, geri gelince devam eder
export function audioHidden(h) { hidden = h; if (actx) { if (h) actx.suspend(); else actx.resume(); } }
export function initAudio() {
  if (actx) { if (actx.state === 'suspended' && !hidden) actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    sfxBus = actx.createGain(); musicBus = actx.createGain();
    sfxBus.connect(actx.destination); musicBus.connect(actx.destination); setVolumes(vol.sfx, vol.music, vol.muted);
    music = createMusic(actx, musicBus); music.setScene(scene); music.duck(ducked); music.start();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.4, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    // gerçek hapşırma kaydı; yüklenene kadar (ya da yüklenemezse) sentez yedeği çalar
    fetch(hapsirmaURL).then(r => r.arrayBuffer()).then(a => actx.decodeAudioData(a)).then(b => { sneezeBuf = b; }, () => {});
  } catch { actx = null; }
}
const SNEEZE_ONSET = 0.11;
function tone(type, f0, f1, dur, vol = 0.12, delay = 0) {
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
}
// susturma ve demo kontrolü çağıran tarafta
export function playSfx(name, k = 0) {
  if (!actx) return;
  switch (name) {
    case 'clean': {   // virüs toplandı: köpüklü "blop", ardından seri arttıkça incelen bir pırıltı
      tone('sine', 240, 620, 0.09, 0.13);
      const f = 1250 * Math.pow(1.06, Math.min(k, 8));
      tone('triangle', f, f * 1.02, 0.12, 0.05, 0.07); tone('triangle', f * 1.5, f * 1.5, 0.1, 0.035, 0.12);
      break;
    }
    case 'gold':   [660, 880, 1175].forEach((f, i) => tone('triangle', f, f * 1.01, 0.12, 0.1, i * 0.06)); break;
    case 'serum':  tone('sine', 700, 320, 0.25, 0.12); break;
    case 'breeze': tone('sine', 300, 900, 0.35, 0.08); tone('sine', 450, 1300, 0.35, 0.05, 0.05); break;
    case 'exit':   tone('triangle', 300, 1200, 0.5, 0.12); break;
    case 'open':   tone('sine', 500, 1000, 0.3, 0.1); tone('sine', 750, 1500, 0.3, 0.07, 0.1); break;
    case 'harden': tone('square', 160, 110, 0.18, 0.05); break;
    case 'star':   tone('triangle', 880, 1320, 0.16, 0.1); break;
    case 'badge':  [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.14, 0.08, i * 0.07)); break;
    case 'trap':   tone('sine', 620, 240, 0.18, 0.1); tone('triangle', 900, 900, 0.06, 0.05, 0.08); break;
    case 'bump':   tone('sine', 420, 220, 0.16, 0.09); tone('triangle', 300, 160, 0.14, 0.05, 0.06); break;   // mukus damlası yutuldu: puan gitti
    case 'replicate': tone('triangle', 180, 360, 0.2, 0.06); tone('triangle', 240, 480, 0.2, 0.05, 0.08); break;
    case 'immune': [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f * 1.02, 0.12, 0.07, i * 0.06)); break;   // savunma devrede
    case 'die':    tone('sawtooth', 240, 50, 0.45, 0.1); break;
    case 'sneeze': {   // "ha..." kısa bir nefes alma, ardından "hapşu!" (ekrandaki itişle aynı anda: main.js SNEEZE_LEAD)
      const t0 = actx.currentTime, d = 0.15, t = t0 + d;
      if (sneezeBuf) {   // kayıtta "hapşu!" 0.11 sn'de başlar; her seferinde biraz farklı perde, sert "ş" yumuşatılır
        const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(), r = 0.94 + Math.random() * 0.12;
        s.buffer = sneezeBuf; s.playbackRate.value = r; f.type = 'lowpass'; f.frequency.value = 6500; g.gain.value = 0.5;
        s.connect(f).connect(g).connect(sfxBus); s.start(Math.max(t0, t - SNEEZE_ONSET / r)); break;
      }
      const i = actx.createBufferSource(), fi = actx.createBiquadFilter(), gi = actx.createGain();
      i.buffer = noiseBuf; fi.type = 'bandpass'; fi.frequency.setValueAtTime(600, t0); fi.frequency.exponentialRampToValueAtTime(1600, t); fi.Q.value = 1.4;
      gi.gain.setValueAtTime(0.0001, t0); gi.gain.exponentialRampToValueAtTime(0.09, t - 0.02); gi.gain.exponentialRampToValueAtTime(0.0001, t);
      i.connect(fi).connect(gi).connect(sfxBus); i.start(t0); i.stop(t + 0.02);
      const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(650, t + 0.32); f.Q.value = 0.9;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.42, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      s.connect(f).connect(g).connect(sfxBus); s.start(t); break;
    }
  }
}
