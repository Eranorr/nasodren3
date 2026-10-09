/*
 * EKRAN TESTİ
 * Bütün ekranları (ana ekran, koleksiyon, harita, bölüm girişi, oyun, duraklat, sonuç, oyun sonu)
 * telefon, yatay telefon, tablet ve masaüstü boyutlarında açar; her tıklanabilir öğe için ölçer:
 * ekranın/kartın içinde mi, başka bir öğenin altında mı, rozet bildirimi ya da ekran mesajı üstüne biniyor mu,
 * yazısı kesik mi. Her ekran için bütün boyutları yan yana gösteren bir kontrol görüntüsü de üretir.
 *
 * Kullanım:
 *   npm run dev -- --port 5199            (ayrı bir terminalde)
 *   npm i --no-save playwright-core       (bir kez)
 *   node tools/ekran-testi.mjs [boyutlar=320x568,...] [ekranlar=home,map,...]
 * Çıktı: ekran-testi/ klasörü (görüntüler ve _sheet-*.png kontrol sayfaları). Sorun yoksa "SORUN YOK" yazar.
 */
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('playwright-core bulunamadı: npm i --no-save playwright-core'); process.exit(1); }
import fs from 'fs';
import { fileURLToPath } from 'url';
const DIR = fileURLToPath(new URL('../ekran-testi/', import.meta.url)).replace(/\\/g, '/');
fs.mkdirSync(DIR, { recursive: true });
const GAME = (process.env.GAME_URL || 'http://localhost:5199/') + '#debug';
const SIZES = (process.argv[2] || '320x568,360x640,375x667,390x844,412x915,568x320,640x360,844x390,768x1024,1024x768,1280x800,1366x768,1920x1080').split(',').map(s => s.split('x').map(Number));
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;

const ready = async p => { await p.goto(GAME); await p.waitForFunction(() => window.__ns); await p.waitForTimeout(350); };
const withProg = async p => p.evaluate(() => { const g = window.__ns.prog; g.done[0] = g.done[1] = g.done[2] = true; g.mask[0] = 7; g.mask[1] = 3; g.facts[0] = g.facts[1] = true; });
const SCREENS = {
  home: async p => {},
  collectSkins: async p => { await p.click('#btnCollect'); },
  collectBadges: async p => { await p.click('#btnCollect'); await p.click('.tab[data-tab="badges"]'); },
  collectFacts: async p => { await withProg(p); await p.click('#btnCollect'); await p.click('.tab[data-tab="facts"]'); },
  map: async p => { await withProg(p); await p.click('#btnAdventure'); await p.waitForTimeout(150); },
  intro1: async p => { await withProg(p); await p.click('#btnAdventure'); await p.evaluate(() => document.querySelector('.node[data-lv="0"]').click()); },
  intro4: async p => { await withProg(p); await p.click('#btnAdventure'); await p.evaluate(() => document.querySelector('.node[data-lv="3"]').click()); },
  endlessIntro: async p => { await p.click('#btnEndless'); },
  play: async p => { await p.evaluate(() => window.__ns.play(2)); await p.waitForTimeout(1200); await p.evaluate(() => window.__ns.callout('Bağışıklık hücresi geldi', 'Topla, virüsler bir süre çoğalamasın')); await p.waitForTimeout(400); },
  pause: async p => { await p.evaluate(() => window.__ns.play(2)); await p.waitForTimeout(600); await p.click('#btnPause'); },
  result: async p => { await p.evaluate(() => { window.__ns.play(0); window.__ns.run(); }); await p.waitForTimeout(1900); },
  resultLast: async p => { await p.evaluate(() => { window.__ns.play(5); window.__ns.run(); }); await p.waitForTimeout(1900); },
  over: async p => { await p.evaluate(() => { window.__ns.play(2); window.__ns.die('wall'); }); await p.waitForTimeout(1100); },
};

// sayfada: etkin ekrandaki tıklanabilir her öğe için görünürlük, örtülme, yazı kesilmesi
const audit = () => {
  const issues = [];
  const ov = document.querySelector('.overlay.show');
  const root = ov || document.getElementById('app');
  const els = [...root.querySelectorAll('.btn, .icon, .tab, .link, .skin')];
  if (!ov) els.push(...document.querySelectorAll('#hud .icon, #hud .pill'));
  const vw = innerWidth, vh = innerHeight;
  const name = e => (e.id || e.dataset.tab || e.textContent.trim().slice(0, 18) || e.className);
  for (const e of els) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const scroller = e.closest('.card, .sheet');
    const inScroll = scroller && scroller.scrollHeight > scroller.clientHeight + 1;
    const inActions = !!e.closest('.actions, .head, .tabs');
    // kaydırılabilir kart içindeki sıradan içerik (koleksiyon kartları, harita) kaydırınca görünür; sabit alan her zaman görünmeli
    const mustSee = !inScroll || inActions || e.classList.contains('tab');
    if (mustSee) {
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + .5 || r.bottom > vh + .5) { issues.push(`ekran dışı: ${name(e)}`); continue; }
      if (scroller) { const s = scroller.getBoundingClientRect(); if (r.top < s.top - .5 || r.bottom > s.bottom + .5) { issues.push(`kart dışında: ${name(e)}`); continue; } }
      const pts = [[.5, .5], [.15, .25], [.85, .25], [.15, .75], [.85, .75]];
      for (const [fx, fy] of pts) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy, t = document.elementFromPoint(x, y);
        if (t && t !== e && !e.contains(t)) { issues.push(`üstü kapalı: ${name(e)} ← ${t.id || t.className || t.tagName}`); break; }
      }
    }
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') issues.push(`yazı kesik: ${name(e)}`);
  }
  // dokunmayı engellemeyen ama görüntüyü örten katmanlar (rozet bildirimi, ekran mesajı) bir düğmeye biniyor mu
  for (const id of ['toast', 'callout']) {
    const t = document.getElementById(id), tr = t.getBoundingClientRect(), st = getComputedStyle(t);
    if (!tr.width || parseFloat(st.opacity) < .05 || (id === 'toast' && !t.classList.contains('on'))) continue;
    for (const e of els) { const r = e.getBoundingClientRect(); if (r.width && r.left < tr.right && r.right > tr.left && r.top < tr.bottom && r.bottom > tr.top) { issues.push(id + ' örtüyor: ' + name(e)); break; } }
  }
  // görünen metinlerin okunabilir boyutta olması
  for (const e of root.querySelectorAll('p, span, b, li, strong, h2')) {
    const r = e.getBoundingClientRect(); if (!r.width || !e.textContent.trim()) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11) { issues.push(`küçük yazı ${fs}px: ${e.textContent.trim().slice(0, 20)}`); break; }
  }
  return issues;
};

const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = {}; let total = 0;
for (const [w, h] of SIZES) {
  const mobile = Math.min(w, h) < 500;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
  for (const [scr, go] of Object.entries(SCREENS)) {
    if (ONLY && !ONLY.includes(scr)) continue;
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.evaluate(() => { try { localStorage.clear(); } catch {} }).catch(() => {});
    await ready(p); await p.evaluate(() => { try { localStorage.clear(); } catch {} });
    await ready(p);
    try { await go(p); await p.waitForTimeout(250); } catch (e) { errs.push('gezinme: ' + String(e).split('\n')[0]); }
    await p.screenshot({ path: `${DIR}${scr}-${w}x${h}.png` });
    const iss = [...await p.evaluate(audit), ...errs];
    if (iss.length) { (report[scr] ||= []).push(`${w}x${h}: ${iss.join(' | ')}`); total += iss.length; }
    await p.close();
  }
  await ctx.close();
}
// ekran başına kontrol sayfası
const page = await b.newPage({ viewport: { width: 1800, height: 900 } });
for (const scr of Object.keys(SCREENS)) {
  if (ONLY && !ONLY.includes(scr)) continue;
  const imgs = SIZES.map(([w, h]) => { const d = fs.readFileSync(`${DIR}${scr}-${w}x${h}.png`).toString('base64'); return `<figure><img src="data:image/png;base64,${d}" style="height:${w > h ? 260 : 420}px"><figcaption>${w}×${h}</figcaption></figure>`; }).join('');
  await page.setContent(`<body style="margin:0;background:#333;font:13px sans-serif;color:#fff"><h3 style="margin:6px 10px">${scr}</h3><div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px;align-items:flex-start">${imgs}</div>
    <style>figure{margin:0}img{display:block;border:1px solid #777}</style></body>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}_sheet-${scr}.png`, fullPage: true });
}
await b.close();
console.log(total ? JSON.stringify(report, null, 1) : 'SORUN YOK');
