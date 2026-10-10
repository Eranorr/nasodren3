/*
 * MÜZİK DİNLE
 * Oyunun prosedürel müziğini sahne sahne WAV dosyasına çizer (OfflineAudioContext): oyunu oynamadan dinlemek
 * ve ses seviyesini ölçmek için. Her dosya bir tam döngü (16 ölçü: önce eşlik, sonra ezgi).
 *
 * Kullanım:
 *   npm run dev -- --port 5199            (ayrı bir terminalde)
 *   node tools/muzik-dinle.mjs [sahneler=menu,act0,act1,act2,win]
 * Çıktı: muzik-dinle/<sahne>.wav ve her sahne için tepe/ortalama seviye.
 */
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('playwright-core bulunamadı: npm i --no-save playwright-core'); process.exit(1); }
import fs from 'fs';
import { fileURLToPath } from 'url';
const DIR = fileURLToPath(new URL('../muzik-dinle/', import.meta.url));
fs.mkdirSync(DIR, { recursive: true });
const SCENES = (process.argv[2] || 'menu,act0,act1,act2,win').split(',');
const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage();
await p.goto((process.env.GAME_URL || 'http://localhost:5199/') + '#debug'); await p.waitForFunction(() => window.__ns);
for (const sc of SCENES) {
  const r = await p.evaluate(async sc => {
    const SR = 44100, bpm = { menu: 72, act0: 84, act1: 90, act2: 96, win: 92 }[sc] || 90, SEC = Math.ceil(16 * 4 * 60 / bpm) + 3;
    const ctx = new OfflineAudioContext(2, SR * SEC, SR), m = window.__ns.createMusic(ctx, ctx.destination);
    m.setScene(sc); m.prerender(SEC - 3);
    const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), pcm = new Int16Array(L.length * 2);
    let peak = 0, sum = 0;
    for (let i = 0; i < L.length; i++) { pcm[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; peak = Math.max(peak, Math.abs(L[i])); sum += L[i] * L[i]; }
    const h = new DataView(new ArrayBuffer(44)), w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); h.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVEfmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 2, true);
    h.setUint32(24, SR, true); h.setUint32(28, SR * 4, true); h.setUint16(32, 4, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.byteLength, true);
    const all = new Uint8Array(44 + pcm.byteLength); all.set(new Uint8Array(h.buffer)); all.set(new Uint8Array(pcm.buffer), 44);
    let s = ''; for (let i = 0; i < all.length; i += 8192) s += String.fromCharCode(...all.subarray(i, i + 8192));
    return { b64: btoa(s), peak: 20 * Math.log10(peak), rms: 10 * Math.log10(sum / L.length), sec: SEC };
  }, sc);
  fs.writeFileSync(DIR + sc + '.wav', Buffer.from(r.b64, 'base64'));
  console.log(`${sc}: ${r.sec} sn  tepe ${r.peak.toFixed(1)} dBFS  ortalama ${r.rms.toFixed(1)} dBFS  -> muzik-dinle/${sc}.wav`);
}
await b.close();
