/* =========================================================================
   KAYIT: ilerleme ve ayarlar yalnızca bu cihazda (localStorage).
   Skor tablosu: Supabase hazırsa herkese açık liste (snake_scores: ad, skor, bölüm); değilse ya da ulaşılamazsa bu cihazdaki liste.
   ========================================================================= */
import { LEVELS } from './content.js';
import { supabase, SUPABASE_OK } from './supabase.js';

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
// 6 bölümlük eski kayıt: etmoid bölümleri (5-6.) maksillerden sonra araya girdi, frontallerin yıldızları kaymasın
for (const [k, v] of [['mask', 0], ['done', false], ['facts', false]]) if (prog[k].length === 6 && N === 8) prog[k].splice(4, 0, v, v);
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

// Herkese açık skor tablosu. Ağ yanıt vermezse beklemeden null döner: çağıran bu cihazdaki listeye düşer
export const ONLINE = SUPABASE_OK;
const TABLE = 'snake_scores', WAIT = 10000;
const within = p => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('zaman aşımı')), WAIT))]);
export async function loadTop(n = 10) {
  if (!ONLINE) return null;
  try {
    const { data, error } = await within(supabase.from(TABLE).select('id,name,score').order('score', { ascending: false }).order('id').limit(n));
    if (error) throw error;
    return data.map(r => ({ id: r.id, n: r.name, s: r.score }));
  } catch (e) { console.warn('[skor] tablo okunamadı, bu cihazdaki liste gösteriliyor:', e); return null; }
}
// e: { n, s, l, f }. Dönen: { id, rank, n, s } (sıra: daha yüksek skorlar + eşit skorda önce yapanlar + 1)
export async function postScore(e) {
  if (!ONLINE) return null;
  try {
    const { data, error } = await within(supabase.from(TABLE).insert({ name: e.n, score: e.s, level: e.l | 0, finished: !!e.f }).select('id').single());
    if (error) throw error;
    const { count, error: err } = await within(supabase.from(TABLE).select('id', { count: 'exact', head: true }).or(`score.gt.${e.s},and(score.eq.${e.s},id.lt.${data.id})`));
    if (err) throw err;
    return { id: data.id, rank: (count | 0) + 1, n: e.n, s: e.s };
  } catch (err) { console.warn('[skor] gönderilemedi, yalnızca bu cihazda kaldı:', err); return null; }
}
