// Chapter rail check (Banqiao-style bottom bar): labels unclipped in every language at 1920x1080 and 1440x900,
// current-bar / aria-current / prev-next / arrow keys / autoplay progress, mobile scroll; screenshots to shots-bar/.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/bar-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots-bar', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = []; const bad = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(name, q, { w = 1920, h = 1080, dpr = 1, dark = false } = {}) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.evaluateOnNewDocument(() => localStorage.removeItem('mv-panels'));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  return page;
}
const barState = () => {
  const tabs = [...document.querySelectorAll('#chapter-tabs .tab')];
  return {
    clipped: tabs.filter((t) => { const l = t.querySelector('.lbl'); return l.scrollWidth > l.clientWidth + 0.5 || t.scrollWidth > t.clientWidth + 0.5; }).map((t) => t.textContent),
    wrapped: tabs.filter((t) => t.getBoundingClientRect().height > 0 && t.querySelector('.lbl').getClientRects().length > 1).map((t) => t.textContent),
    current: tabs.findIndex((t) => t.getAttribute('aria-current') === 'step'), currentCount: tabs.filter((t) => t.getAttribute('aria-current') === 'step').length,
    barW: tabs.map((t) => Math.round(t.querySelector('.bar').getBoundingClientRect().width)),
    tabsScroll: (() => { const n = document.getElementById('chapter-tabs'); return [n.scrollWidth, n.clientWidth]; })(),
    style: (() => { const t = tabs.find((x) => x.getAttribute('aria-current') === 'step'), o = tabs.find((x) => x.getAttribute('aria-current') !== 'step'); const c = (e, p) => getComputedStyle(e, p); return { cur: [c(t).color, c(t).fontWeight, c(t).fontSize, c(t.querySelector('.n')).fontSize, c(t.querySelector('.bar')).height, c(t.querySelector('.bar')).backgroundColor], other: [c(o).color, c(o, '::before').height, c(o, '::before').backgroundColor] }; })(),
  };
};
// 1. labels fit in every language at both desktop sizes
for (const [w, h] of [[1920, 1080], [1440, 900]]) for (const lang of ['en', 'zh', 'ms']) {
  const p = await open(`fit-${lang}-${w}`, `chapter=0&lang=${lang}`, { w, h }); await sleep(400);
  const s = await p.evaluate(barState);
  console.log('fit', w, lang, JSON.stringify({ clipped: s.clipped, wrapped: s.wrapped, tabsScroll: s.tabsScroll }));
  if (s.clipped.length || s.wrapped.length) bad.push(`fit ${w} ${lang}`);
  await p.close();
}
// 2. behaviour
{
  const p = await open('behaviour', 'chapter=0&lang=en'); await sleep(500);
  const log = [];
  const st = async (what) => { const s = await p.evaluate(barState); log.push(`${what}: cur=${s.current} n=${s.currentCount} bar=${s.barW[s.current]}`); return s; };
  const s0 = await st('start'); console.log('style', JSON.stringify(s0.style));
  await p.keyboard.press('ArrowRight'); await sleep(900); const s1 = await st('ArrowRight');
  await p.keyboard.press('ArrowLeft'); await sleep(900); const s2 = await st('ArrowLeft');
  await p.click('#btn-next'); await sleep(900); const s3 = await st('next button');
  await p.click('#btn-prev'); await sleep(900); const s4 = await st('prev button');
  await p.click('#chapter-tabs .tab:nth-child(6)'); await sleep(900); const s5 = await st('click tab 6');
  await p.click('#btn-autoplay'); await sleep(3000); const s6 = await p.evaluate(() => { const t = document.querySelector('.tab[aria-current="step"]'); return { run: t.classList.contains('run'), pr: t.style.getPropertyValue('--pr'), barW: Math.round(t.querySelector('.bar').getBoundingClientRect().width), tabW: Math.round(t.getBoundingClientRect().width) }; });
  await p.screenshot({ path: 'shots-bar/bar-autoplay-progress-en-crop.png', clip: { x: 0, y: 960, width: 1920, height: 120 } });
  await p.click('#btn-autoplay'); await sleep(300); const s7 = await p.evaluate(() => { const t = document.querySelector('.tab[aria-current="step"]'); return { run: t.classList.contains('run'), barW: Math.round(t.querySelector('.bar').getBoundingClientRect().width), tabW: Math.round(t.getBoundingClientRect().width) }; });
  const aria = await p.evaluate(() => ({ prev: document.getElementById('btn-prev').getAttribute('aria-label'), next: document.getElementById('btn-next').getAttribute('aria-label'), nav: document.querySelector('.rail').getAttribute('aria-label') }));
  console.log(log.join(' | ')); console.log('autoplay running', JSON.stringify(s6), 'stopped', JSON.stringify(s7), 'aria', JSON.stringify(aria));
  const ok = s1.current === 1 && s2.current === 0 && s3.current === 1 && s4.current === 0 && s5.current === 5 && [s0, s1, s2, s3, s4, s5].every((s) => s.currentCount === 1) && s6.run && s6.barW > 0 && s6.barW < s6.tabW && !s7.run && s7.barW === s7.tabW;
  if (!ok) bad.push('behaviour');
  await p.close();
}
// 3. screenshots: full view + bar crop
const shots = [
  ['bar-en-light', 'chapter=0&lang=en'], ['bar-zh-light', 'chapter=9&lang=zh'], ['bar-ms-1440x900', 'chapter=7&lang=ms', { w: 1440, h: 900 }],
  ['bar-en-dark', 'chapter=5&lang=en&theme=dark', { dark: true }], ['bar-zh-dark', 'chapter=0&lang=zh&theme=dark', { dark: true }],
  ['bar-en-mobile-390x844', 'chapter=3&lang=en', { w: 390, h: 844, dpr: 2 }],
];
for (const [name, q, o = {}] of shots) {
  const p = await open(name, q, o); await sleep(2000);
  const w = o.w || 1920, h = o.h || 1080;
  await p.screenshot({ path: `shots-bar/${name}-full.png` });
  const r = await p.evaluate(() => { const b = document.querySelector('.bottom-bar').getBoundingClientRect(); const c = document.getElementById('osm-credit').getBoundingClientRect(); return { top: Math.min(b.top, c.top), bottom: Math.max(b.bottom, c.bottom) }; });
  const pad = 14 * Math.min(w / 1920, h / 1080) + 6; const y = Math.max(0, r.top - pad - 10), y2 = Math.min(h, r.bottom + pad);
  await p.screenshot({ path: `shots-bar/${name}-crop.png`, clip: { x: 0, y, width: w, height: y2 - y } });
  const s = await p.evaluate(barState); console.log('shot', name, JSON.stringify({ clipped: s.clipped, current: s.current, tabsScroll: s.tabsScroll }));
  await p.close();
}
console.log(bad.length ? `BAD: ${bad.join(', ')}` : 'bar OK (labels fit EN/zh/ms at 1920x1080 and 1440x900; arrows, prev/next, click, autoplay bar)');
console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (bar check).');
await browser.close();
