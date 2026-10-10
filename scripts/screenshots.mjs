// Headless screenshots, console-error check in every chapter × language, text-fit check, keyboard check.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/screenshots.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:4173/';
const only = process.env.SHOTS_ONLY ? new RegExp(process.env.SHOTS_ONLY) : null;
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(name, q, w = 1920, h = 1080, rm = false) {
  const page = await browser.newPage();
  if (rm) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[${name}] requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(`${base}?${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.ready === true, { timeout: 20000 });
  return page;
}
const shots = [
  { name: '00-cover', q: 'chapter=0&lang=en' },
  { name: '03-massing', q: 'chapter=3&lang=en' },
  { name: '03-massing-cited-colours', q: 'chapter=3&lang=en', act: async (p) => { await p.click('#src-toggle'); } },
  { name: '05-connections', q: 'chapter=5&lang=en' },
  { name: '06-walking-kj17-megamall', q: 'chapter=6&lang=en', wait: 5000 },
  { name: '06-walking-kb01-gardens', q: 'chapter=6&lang=en', act: async (p) => { await sleep(800); await p.click('.route-btn[data-id="w-kb01-gardens"]'); }, wait: 5500 },
  { name: '07-sun-jun21-0900', q: 'chapter=7&lang=en', act: async (p) => { await p.evaluate(() => window.__sun.set('jun', 540)); } },
  { name: '07-sun-dec21-1630', q: 'chapter=7&lang=en', act: async (p) => { await p.evaluate(() => window.__sun.set('dec', 990)); } },
  { name: '07-sun-mar20-1300', q: 'chapter=7&lang=en', act: async (p) => { await p.evaluate(() => window.__sun.set('mar', 780)); } },
  { name: '08-rain', q: 'chapter=8&lang=en' },
  { name: '08-rain-dark', q: 'chapter=8&lang=en&theme=dark' },
  { name: '03-massing-cited-dark', q: 'chapter=3&lang=en&theme=dark', act: async (p) => { await p.click('#src-toggle'); } },
  { name: '00-cover-zh', q: 'chapter=0&lang=zh' },
  { name: '07-sun-zh', q: 'chapter=7&lang=zh', act: async (p) => { await p.evaluate(() => window.__sun.set('dec', 990)); } },
  { name: '06-walking-zh', q: 'chapter=6&lang=zh', wait: 5000 },
  { name: '00-cover-ms', q: 'chapter=0&lang=ms' },
  { name: '08-rain-ms', q: 'chapter=8&lang=ms' },
  { name: '03-massing-ms', q: 'chapter=3&lang=ms' },
  { name: '07-sun-reduced-motion-play', q: 'chapter=7&lang=en', rm: true, act: async (p) => { await p.click('#side-panel .play-btn'); }, wait: 3000 },
];
for (const s of shots) {
  if (only && !only.test(s.name)) continue;
  const page = await open(s.name, s.q, s.w, s.h, s.rm);
  if (s.act) await s.act(page);
  await sleep(s.wait ?? 2500);
  await page.screenshot({ path: `shots/${s.name}.png` });
  console.log('saved', `shots/${s.name}.png`);
  await page.close();
}
// every chapter in every language: console errors + text fit
if (!only) {
  const fit = [];
  for (const lang of ['en', 'zh', 'ms']) {
    const page = await open(`fit-${lang}`, `chapter=0&lang=${lang}`);
    const ids = await page.evaluate(() => window.__mv.chapters);
    for (const id of ids) {
      await page.evaluate((i) => window.__mv.goTo(i), id); await sleep(900);
      const r = await page.evaluate(() => {
        const tp = document.querySelector('#text-panel').getBoundingClientRect(); const bar = document.querySelector('.bottom-bar').getBoundingClientRect();
        const sp = document.querySelector('#side-panel'); const hl = document.querySelector('.headline');
        const lines = [...hl.children].map((s) => Math.round(s.getBoundingClientRect().height / parseFloat(getComputedStyle(hl).lineHeight)));
        const tabs = document.querySelector('#chapter-tabs'); const tabsOverflow = tabs.scrollWidth > tabs.clientWidth + 1;
        const statsOverflow = [...document.querySelectorAll('.stat .fig')].some((f) => f.scrollWidth > f.parentElement.clientWidth + 2);
        return { textBottom: Math.round(tp.bottom), barTop: Math.round(bar.top), sideScroll: sp.scrollHeight > sp.clientHeight + 1, headlineLines: lines, tabsOverflow, statsOverflow, htmlLang: document.documentElement.lang };
      });
      fit.push({ lang, id, ...r, ok: r.textBottom < r.barTop - 8 && !r.tabsOverflow && !r.statsOverflow });
    }
    await page.close();
  }
  for (const f of fit) console.log('fit', f.lang, String(f.id).padStart(2, '0'), f.ok ? 'OK ' : 'BAD', JSON.stringify(f));
  // keyboard check: Space/ArrowRight change chapter; arrows inside sliders must not
  const page = await open('keys', 'chapter=0&lang=en');
  await page.keyboard.press('Space'); await sleep(600);
  const h1 = await page.evaluate(() => location.hash);
  await page.keyboard.press('ArrowRight'); await sleep(900);
  const h2 = await page.evaluate(() => location.hash);
  await page.evaluate(() => window.__mv.goTo(3)); await sleep(600);
  await page.focus('#thr'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await sleep(600);
  const h3 = await page.evaluate(() => location.hash); const thr = await page.$eval('#thr', (e) => e.value);
  await page.evaluate(() => window.__mv.goTo(7)); await sleep(800);
  const before = await page.$eval('#sun-time', (e) => e.value);
  await page.focus('#sun-time'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await sleep(600);
  const h4 = await page.evaluate(() => location.hash); const after = await page.$eval('#sun-time', (e) => e.value);
  console.log('keys: Space ->', h1, '| ArrowRight ->', h2, '| arrows in #thr ->', h3, 'value', thr, '| arrows in #sun-time ->', h4, 'value', before, '->', after);
  // language switch at runtime
  await page.click('#lang-switch button[data-lang="ms"]'); await sleep(500);
  const ls = await page.evaluate(() => ({ lang: document.documentElement.lang, stored: localStorage.getItem('mv-lang'), tab: document.querySelector('.tab[aria-current]')?.textContent }));
  console.log('lang switch:', JSON.stringify(ls));
  await page.click('#lang-switch button[data-lang="en"]');
  await page.close();
}
await browser.close();
console.log(errors.length ? `ERRORS/WARNINGS (${errors.length}):\n` + errors.join('\n') : 'No console errors or warnings.');
