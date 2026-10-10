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
  // pin the OS colour scheme to light (the page now follows prefers-color-scheme when no theme is saved)
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, ...(rm ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[${name}] requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  await page.evaluateOnNewDocument(() => localStorage.removeItem('mv-panels'));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  return page;
}
const shots = [
  // v5: overview legend moved to the side panel
  { name: 'v5-00-overview-en', q: 'chapter=0&lang=en' },
  { name: 'v5-00-overview-en-1440x900', q: 'chapter=0&lang=en', w: 1440, h: 900 },
  { name: 'v5-00-overview-zh', q: 'chapter=0&lang=zh' },
  { name: 'v5-00-overview-ms-dark', q: 'chapter=0&lang=ms&theme=dark' },
  { name: 'v14-01-landmarks-en-side-collapsed', q: 'chapter=1&lang=en', act: async (p) => { await p.click('#sp-toggle'); } },
  // v3: overview + renumbered cover
  { name: '00-overview', q: 'chapter=0&lang=en' },
  { name: '00-overview-dark', q: 'chapter=0&lang=en&theme=dark' },
  { name: '00-overview-zh', q: 'chapter=0&lang=zh' },
  { name: '00-overview-ms', q: 'chapter=0&lang=ms' },
  { name: '02-cover', q: 'chapter=2&lang=en' },
  // smaller left-panel text (compare with before-*.png)
  { name: 'after-01-cover-en-1440x900', q: 'chapter=2&lang=en', w: 1440, h: 900 },
  { name: 'after-04-massing-ms', q: 'chapter=5&lang=ms' },
  { name: 'after-08-sun-zh', q: 'chapter=9&lang=zh' },
  { name: '10-rain-ms', q: 'chapter=10&lang=ms' },
  // collapsible panels
  { name: '05-massing-panels-open', q: 'chapter=5&lang=en' },
  { name: '05-massing-left-collapsed', q: 'chapter=5&lang=en', act: async (p) => { await p.click('#tp-toggle'); } },
  { name: '05-massing-map-only', q: 'chapter=5&lang=en', act: async (p) => { await p.click('#btn-maponly'); } },
  { name: '08-walking-map-only-key-M', q: 'chapter=8&lang=en', act: async (p) => { await p.keyboard.press('m'); }, wait: 4500 },
  { name: '07-connections-left-collapsed-dark', q: 'chapter=7&lang=en&theme=dark', act: async (p) => { await p.click('#tp-toggle'); } },
  { name: '09-sun-right-collapsed-zh', q: 'chapter=9&lang=zh', act: async (p) => { await p.click('#sp-toggle'); } },
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
        return { textBottom: Math.round(tp.bottom), barTop: Math.round(bar.top), sideScroll: sp.scrollHeight > sp.clientHeight + 1, headlineLines: lines, tabsOverflow, statsOverflow, htmlLang: document.documentElement.lang, headline: hl.textContent, headlinePx: parseFloat(getComputedStyle(hl).fontSize), cjkOk: document.fonts.check(`600 ${getComputedStyle(hl).fontSize} "Noto Sans SC"`, hl.textContent) };
      });
      fit.push({ lang, id, ...r, ok: r.textBottom < r.barTop - 8 && !r.tabsOverflow && !r.statsOverflow && (id !== 0 || r.headlineLines.every((n) => n === 1)) && (lang !== 'zh' || r.cjkOk) });
    }
    await page.close();
  }
  for (const f of fit) console.log('fit', f.lang, String(f.id).padStart(2, '0'), f.ok ? 'OK ' : 'BAD', JSON.stringify(f));
  // 00 headline at 1920x1080 and 1440x900 in every language: one line per span, CJK glyphs loaded; v13 shots of 00
  for (const [w, h] of [[1920, 1080], [1440, 900]]) for (const lang of ['en', 'zh', 'ms']) {
    const page = await open(`h00-${lang}-${w}`, `chapter=0&lang=${lang}`, w, h);
    const r = await page.evaluate(() => { const hl = document.querySelector('.headline'); const lh = parseFloat(getComputedStyle(hl).lineHeight); const tp = document.querySelector('#text-panel').getBoundingClientRect();
      return { text: [...hl.children].map((s) => s.textContent), lines: [...hl.children].map((s) => Math.round(s.getBoundingClientRect().height / (lh * (tp.width / document.querySelector('#text-panel').offsetWidth)))), px: parseFloat(getComputedStyle(hl).fontSize), widest: Math.max(...[...hl.children].map((s) => s.scrollWidth)), col: hl.clientWidth, cjk: document.fonts.check(`600 54px "Noto Sans SC"`, hl.textContent) }; });
    const ok = r.lines.every((n) => n === 1) && r.widest <= r.col + 1 && (lang !== 'zh' || r.cjk);
    console.log('headline00', lang, `${w}x${h}`, ok ? 'OK ' : 'BAD', JSON.stringify(r));
    if (w === 1920) await page.screenshot({ path: `shots/v13-00-overview-${lang}.png` });
    await page.close();
  }
  // keyboard check: Space/ArrowRight change chapter; arrows inside sliders must not
  const page = await open('keys', 'chapter=0&lang=en');
  await page.keyboard.press('Space'); await sleep(600);
  const h1 = await page.evaluate(() => location.hash);
  await page.keyboard.press('ArrowRight'); await sleep(900);
  const h2 = await page.evaluate(() => location.hash);
  await page.evaluate(() => window.__mv.goTo(5)); await sleep(600);
  await page.focus('#thr'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await sleep(600);
  const h3 = await page.evaluate(() => location.hash); const thr = await page.$eval('#thr', (e) => e.value);
  await page.evaluate(() => window.__mv.goTo(9)); await sleep(800);
  const before = await page.$eval('#sun-time', (e) => e.value);
  await page.focus('#sun-time'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await sleep(600);
  const h4 = await page.evaluate(() => location.hash); const after = await page.$eval('#sun-time', (e) => e.value);
  console.log('keys: Space ->', h1, '| ArrowRight ->', h2, '| arrows in #thr ->', h3, 'value', thr, '| arrows in #sun-time ->', h4, 'value', before, '->', after);
  // M toggles map-only, but not while the slider has focus; chapter change keeps panels collapsed
  await page.keyboard.press('m'); await sleep(300);
  const m1 = await page.evaluate(() => document.querySelector('#stage').className);
  await page.$eval('#sun-time', (e) => e.blur()); await page.keyboard.press('m'); await sleep(300);
  const m2 = await page.evaluate(() => document.querySelector('#stage').className);
  await page.keyboard.press('ArrowRight'); await sleep(900);
  const m3 = await page.evaluate(() => [location.hash, document.querySelector('#stage').className, document.querySelector('#tp-toggle').getAttribute('aria-expanded'), localStorage.getItem('mv-panels')].join(' | '));
  await page.keyboard.press('m'); await sleep(300);
  console.log('M key: in slider ->', JSON.stringify(m1), '| on body ->', JSON.stringify(m2), '| next chapter ->', m3);
  // language switch at runtime
  await page.click('#lang-switch button[data-lang="ms"]'); await sleep(500);
  const ls = await page.evaluate(() => ({ lang: document.documentElement.lang, stored: localStorage.getItem('mv-lang'), tab: document.querySelector('.tab[aria-current]')?.textContent }));
  console.log('lang switch:', JSON.stringify(ls));
  await page.click('#lang-switch button[data-lang="en"]');
  await page.close();
}
await browser.close();
console.log(errors.length ? `ERRORS/WARNINGS (${errors.length}):\n` + errors.join('\n') : 'No console errors or warnings.');
