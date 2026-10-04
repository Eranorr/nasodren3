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
export const prog = Object.assign({ mask: Array(N).fill(0), done: Array(N).fill(false), facts: Array(N).fill(false), noab: Array(N).fill(false),
  badges: {}, skin: 0, golds: 0, serums: 0, viruses: 0, best: 0, endlessBest: 0, seenTut: false, muted: false }, store.get(KEY, {}));
export const save = () => store.set(KEY, prog);
export const bits = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
export const totalStars = () => prog.mask.reduce((a, m) => a + bits(m), 0);
export const unlocked = i => i === 0 || prog.done[i - 1];
