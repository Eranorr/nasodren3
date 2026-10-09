/* =========================================================================
   SES
   ========================================================================= */
let actx = null, noiseBuf = null;
export function initAudio() {
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
// susturma ve demo kontrolü çağıran tarafta
export function playSfx(name) {
  if (!actx) return;
  switch (name) {
    case 'eat':    tone('triangle', 440, 800, 0.09, 0.14); break;
    case 'gold':   [660, 880, 1175].forEach((f, i) => tone('triangle', f, f * 1.01, 0.12, 0.1, i * 0.06)); break;
    case 'serum':  tone('sine', 700, 320, 0.25, 0.12); break;
    case 'breeze': tone('sine', 300, 900, 0.35, 0.08); tone('sine', 450, 1300, 0.35, 0.05, 0.05); break;
    case 'exit':   tone('triangle', 300, 1200, 0.5, 0.12); break;
    case 'open':   tone('sine', 500, 1000, 0.3, 0.1); tone('sine', 750, 1500, 0.3, 0.07, 0.1); break;
    case 'harden': tone('square', 160, 110, 0.18, 0.05); break;
    case 'star':   tone('triangle', 880, 1320, 0.16, 0.1); break;
    case 'badge':  [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.14, 0.08, i * 0.07)); break;
    case 'trap':   tone('sine', 620, 240, 0.18, 0.1); tone('triangle', 900, 900, 0.06, 0.05, 0.08); break;
    case 'hurt':   tone('square', 320, 110, 0.22, 0.06); break;
    case 'replicate': tone('triangle', 180, 360, 0.2, 0.06); tone('triangle', 240, 480, 0.2, 0.05, 0.08); break;
    case 'immune': [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f * 1.02, 0.12, 0.07, i * 0.06)); break;   // savunma devrede
    case 'die':    tone('sawtooth', 240, 50, 0.45, 0.1); break;
    case 'sneeze': {
      const t = actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.3); f.Q.value = 0.9;
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      s.connect(f).connect(g).connect(actx.destination); s.start(t); break;
    }
  }
}
