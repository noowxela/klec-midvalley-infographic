// Attribution check: corner OSM credit visible and clear of the UI on every chapter / language / layout;
// chapter source lines no longer repeat the OSM line; screenshots to shots-credit/.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/credit-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots-credit', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = []; const bad = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OSM_LINE = { en: 'Map data © OpenStreetMap contributors (ODbL), Overpass API pull 2026-10-10.', zh: '地图数据 © OpenStreetMap 贡献者（ODbL），Overpass API 下载于 2026-10-10。', ms: 'Data peta © penyumbang OpenStreetMap (ODbL), dimuat turun melalui Overpass API pada 2026-10-10.' };
const osmOk = (r, chapter, lang) => (chapter === 0 ? r.sourceText.startsWith(OSM_LINE[lang]) && r.sourceText.split('OpenStreetMap').length === 2 : !r.sourceHasOsm);
async function open(name, q, { w = 1920, h = 1080, panels = null, dpr = 1 } = {}) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.evaluateOnNewDocument((p) => { localStorage.removeItem('mv-panels'); if (p) localStorage.setItem('mv-panels', p); }, panels);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  return page;
}
const probe = () => {
  const c = document.getElementById('osm-credit'); const r = c.getBoundingClientRect(); const cs = getComputedStyle(c);
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const others = ['#lang-switch', '#top-tools', '.mark', '#scalebar', '#tp-toggle', '#sp-toggle', '#side-panel', '#text-panel', '.map-furniture', '#chapter-tabs', '#credit-prefix', '#btn-prev', '#btn-next'];
  const overlaps = [];
  for (const sel of others) for (const el of document.querySelectorAll(sel)) {
    const o = el.getBoundingClientRect(); const st = getComputedStyle(el);
    if (!o.width || !o.height || st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
    if (sel === '#side-panel' && document.getElementById('stage').classList.contains('sp-collapsed')) continue;
    if (sel === '#text-panel' && document.getElementById('stage').classList.contains('tp-collapsed')) continue;
    if (r.x < o.right && r.right > o.x && r.y < o.bottom && r.bottom > o.y) overlaps.push(sel);
  }
  return { text: c.textContent, href: c.href, target: c.target, rel: c.rel, aria: c.getAttribute('aria-label'), rect: [r.x, r.y, r.width, r.height].map(Math.round),
    inView: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, visible: cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0, onTop: hit === c, font: cs.fontSize, color: cs.color, overlaps,
    // the original OSM source line is kept in 00 Overview only (Alex); every other chapter must not repeat it
    sourceText: document.querySelector('#text-panel .source')?.textContent || '',
    sourceHasOsm: [...document.querySelectorAll('#text-panel .source')].some((s) => /OpenStreetMap|Overpass|开放街图/.test(s.textContent)) };
};
// 1. every chapter × language: credit OK and no repeated OSM line in the text panel
const p = await open('all', 'chapter=0&lang=en');
for (const lang of ['en', 'zh', 'ms']) {
  await p.evaluate((l) => window.__mv.setLang(l), lang); await sleep(400);
  for (const id of await p.evaluate(() => window.__mv.chapters)) {
    await p.evaluate((i) => window.__mv.goTo(i), id); await sleep(900);
    const r = await p.evaluate(probe);
    const ok = r.visible && r.inView && r.onTop && !r.overlaps.length && osmOk(r, id, lang) && r.text === '© OpenStreetMap contributors';
    if (!ok) bad.push(`${lang} #${id} ${JSON.stringify(r)}`);
    if (id === 1) console.log(lang, 'landmarks data note', JSON.stringify(await p.evaluate(() => ({ data: document.querySelector('.ov-data')?.textContent, links: [...document.querySelectorAll('.ov-data a')].map((a) => `${a.href} ${a.target} ${a.rel}`), sideScroll: (() => { const s = document.getElementById('side-panel'); return s.scrollHeight > s.clientHeight + 1; })(), sideBottom: Math.round(document.getElementById('side-panel').getBoundingClientRect().bottom) }))));
  }
}
await p.close();
console.log(bad.length ? 'BAD\n' + bad.join('\n') : 'credit OK on every chapter x language (visible, in view, on top, no overlaps); OSM source line only in 00 (exact, once), absent elsewhere');

// 2. screenshots + layout probes
const collapsed = JSON.stringify({ tp: true, sp: true });
const shots = [
  ['00-overview-en-panels-open', 'chapter=0&lang=en'], ['00-overview-en-panels-collapsed', 'chapter=0&lang=en', { panels: collapsed }],
  ['07-sun-en-panels-open', 'chapter=7&lang=en'], ['07-sun-en-panels-collapsed', 'chapter=7&lang=en', { panels: collapsed }],
  ['00-overview-zh-panels-open', 'chapter=0&lang=zh'], ['00-overview-zh-panels-collapsed', 'chapter=0&lang=zh', { panels: collapsed }],
  ['07-sun-zh-panels-open', 'chapter=7&lang=zh'], ['04-massing-ms-dark', 'chapter=4&lang=ms&theme=dark'],
  ['00-overview-en-1440x900', 'chapter=0&lang=en', { w: 1440, h: 900 }],
  ['00-overview-en-mobile-390x844', 'chapter=0&lang=en', { w: 390, h: 844, dpr: 2 }], ['07-sun-en-mobile-landscape-844x390-dark', 'chapter=7&lang=en&theme=dark', { w: 844, h: 390, dpr: 2 }],
];
for (const [name, q, o = {}] of shots) {
  const pg = await open(name, q, o); await sleep(2200);
  const r = await pg.evaluate(probe);
  const ch = +new URLSearchParams(q).get('chapter'), lg = new URLSearchParams(q).get('lang');
  console.log(name, JSON.stringify({ rect: r.rect, font: r.font, inView: r.inView, onTop: r.onTop, overlaps: r.overlaps, osmLineOk: osmOk(r, ch, lg) }));
  if (!(r.inView && r.onTop && !r.overlaps.length && osmOk(r, ch, lg))) bad.push(name);
  await pg.screenshot({ path: `shots-credit/${name}.png` });
  // close-up crop of the corner credit (2x) for the open EN overview
  if (name === '00-overview-en-panels-open') await pg.screenshot({ path: `shots-credit/${name}-corner-crop.png`, clip: { x: r.rect[0] - 300, y: r.rect[1] - 120, width: r.rect[2] + 340, height: r.rect[3] + 150 } });
  if (name === '00-overview-en-panels-open') console.log('attrs', JSON.stringify({ href: r.href, target: r.target, rel: r.rel, aria: r.aria, text: r.text }));
  await pg.close();
}
console.log(bad.length ? `BAD layouts: ${bad.length}` : 'all layouts OK');
console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (credit check).');
await browser.close();
