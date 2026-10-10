/* =========================================================================
   KAYIT: yalnızca bu cihazda (localStorage). Oyun veri toplamaz, sunucuya bir şey gönderilmez.
   ========================================================================= */
import { LEVELS } from './content.js';

const KEY = 'siklamen_akis_v1';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const N = LEVELS.length;
export const prog = Object.assign({ mask: Array(N).fill(0), done: Array(N).fill(false), facts: Array(N).fill(false),
  badges: {}, skin: 0, golds: 0, serums: 0, immunes: 0, viruses: 0, best: 0, seenTut: false, muted: false,
  sfxVol: .8, musicVol: .6, vibrate: true,   // ayarlar
  scores: { adventure: [] } }, store.get(KEY, {}));
export const save = () => store.set(KEY, prog);
export const bits = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
export const totalStars = () => prog.mask.reduce((a, m) => a + bits(m), 0);

// Skor tablosu: bölümler boyunca biriken skor; yalnızca bu cihazda
const KEEP = 50;
export const cleanName = s => s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
export function addScore(mode, e) {
  const list = prog.scores[mode] || (prog.scores[mode] = []), id = Date.now() + Math.random();
  list.push({ ...e, id, d: Date.now() });
  list.sort((a, b) => b.s - a.s || a.d - b.d);   // eşit skorda önce yapan üstte
  const rank = list.findIndex(x => x.id === id) + 1;
  list.length = Math.min(list.length, KEEP); save();
  return { id, rank };
}
