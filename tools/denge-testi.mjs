/*
 * DENGE TESTİ
 * Her bölümü demo botuyla hızlandırılmış oynatıp kazanılabilirliği ölçer.
 * Bot mukusa, altına ve bağışıklık hücresine yönelir; virüsten ve tıkaçtan kaçınır; ortalama bir insandan beceriksizdir,
 * yani mutlak sayılar değil bölümler arası eğri anlamlıdır.
 *
 * Kullanım:
 *   npm run dev -- --port 5199            (ayrı bir terminalde)
 *   npm i --no-save playwright-core       (bir kez)
 *   node tools/denge-testi.mjs [deneme=10] [bölümler=1,2,3,4,5,6]
 *
 * Tarayıcı: CHROME ortam değişkeni (varsayılan Windows Chrome yolu), adres: GAME_URL.
 * Yalnızca #debug adresindeki window.__ns kancasıyla çalışır.
 */
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('playwright-core bulunamadı: npm i --no-save playwright-core'); process.exit(1); }

const N = +(process.argv[2] || 10);
const LEVELS = (process.argv[3] || '1,2,3,4,5,6').split(',').map(v => v === 'e' ? 'endless' : +v - 1);

const b = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await b.newPage({ viewport: { width: 420, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto((process.env.GAME_URL || 'http://localhost:5199/') + '#debug');
await page.waitForFunction(() => window.__ns);

for (const lvl of LEVELS) {
  const runs = [];
  for (let r = 0; r < N; r++) runs.push(await page.evaluate(([i]) => { window.__ns.play(i); return window.__ns.run(i === 'endless' ? 120000 : 300000); }, [lvl]).catch(e => ({ state: 'hata', reason: String(e) })));
  const won = runs.filter(x => x.state === 'result');
  const reasons = {};
  for (const x of runs) if (x.state !== 'result') reasons[x.reason || x.state] = (reasons[x.reason || x.state] || 0) + 1;
  const avg = (arr, k) => arr.length ? (arr.reduce((a, x) => a + x[k], 0) / arr.length).toFixed(1) : '-';
  console.log(`${lvl === 'endless' ? 'serbest' : 'bölüm ' + (lvl + 1)}: kazanma ${won.length}/${N}  süre ${avg(won, 'time')} sn  bağışıklık ${avg(runs, 'immunes')}  çoğalma ${avg(runs, 'replicated')}  virüs çarpma ${avg(runs, 'hits')}  ilerleme ${avg(runs, 'eaten')}/${runs[0].target}  ölüm ${JSON.stringify(reasons)}`);
}
if (errors.length) console.log('SAYFA HATALARI:\n' + [...new Set(errors)].join('\n'));
await b.close();
