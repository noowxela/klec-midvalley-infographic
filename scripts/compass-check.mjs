// Compass + RESET VIEW check: hidden on load and after a chapter change, visible (and focusable) after the user
// moves the camera, hidden again after clicking it; no overlap with the credit, bottom bar, side panel or compass
// (panel open / collapsed, 1440x900, mobile); compass close-ups light / dark. Screenshots to shots-compass/.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/compass-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots-compass', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = []; const bad = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(name, q, { w = 1920, h = 1080, dark = false, dpr = 1, rm = false, mobile = false } = {}) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, ...(rm ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.evaluateOnNewDocument(() => localStorage.removeItem('mv-panels'));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  await sleep(2500);
  return page;
}
const state = () => {
  const b = document.getElementById('btn-reset'); const cs = getComputedStyle(b);
  const R = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const hit = (a, c) => a[0] < c[2] && a[2] > c[0] && a[1] < c[3] && a[3] > c[1];
  const br = R(b), comp = R(document.getElementById('compass'));
  const overlaps = [];
  for (const sel of ['#osm-credit', '#credit-prefix', '.bottom-bar', '#side-panel', '#compass', '.scalebar', '#sp-toggle']) {
    const e = document.querySelector(sel); if (!e) continue; const r = R(e); if (r[2] - r[0] < 1) continue;
    if (sel !== '#side-panel' || !document.getElementById('stage').classList.contains('sp-collapsed')) if (hit(br, r)) overlaps.push(`reset x ${sel}`);
    if (!['#compass'].includes(sel) && hit(comp, r)) overlaps.push(`compass x ${sel}`);
  }
  return { visible: !b.classList.contains('is-hidden') && cs.visibility === 'visible', opacity: cs.opacity, tab: b.tabIndex, ariaHidden: b.getAttribute('aria-hidden'), text: b.textContent, trans: cs.transitionDuration,
    centreDy: Math.round(((br[1] + br[3]) / 2 - (comp[1] + comp[3]) / 2) * 10) / 10, gap: Math.round(comp[0] - br[2]), overlaps };
};
async function drag(p, dx = 220, dy = 30) {
  const v = p.viewport(); const x = v.width * 0.55, y = v.height * 0.5;
  await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 12; i++) await p.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12); await p.mouse.up(); await sleep(900);
}
const expect = (name, s, vis) => { if (s.visible !== vis) bad.push(`${name}: expected ${vis ? 'visible' : 'hidden'}`); if (!vis && s.tab !== -1) bad.push(`${name}: hidden but focusable`); if (vis && s.tab !== 0) bad.push(`${name}: visible but not focusable`); if (s.overlaps.length) bad.push(`${name}: ${s.overlaps.join(', ')}`); console.log(name, JSON.stringify(s)); };
const clipFurn = async (p, path, dpr = 1) => { const r = await p.evaluate(() => { const a = document.querySelector('.map-furniture').getBoundingClientRect(); return { x: a.left - 24, y: a.top - 24, width: a.width + 48, height: a.height + 48 }; }); await p.screenshot({ path, clip: r }); };

// 1. main flow, EN 1920x1080
{
  const p = await open('flow', 'chapter=1&lang=en', { dpr: 2 });
  expect('load', await p.evaluate(state), false);
  await clipFurn(p, 'shots-compass/reset-before-drag-en.png');
  await p.screenshot({ path: 'shots-compass/full-before-drag-en.png' });
  await drag(p);
  const s = await p.evaluate(state); expect('after-drag', s, true);
  if (Math.abs(s.centreDy) > 1.5) bad.push(`reset not centred with compass (dy ${s.centreDy})`);
  await clipFurn(p, 'shots-compass/reset-after-drag-en.png');
  await p.screenshot({ path: 'shots-compass/full-after-drag-en.png' });
  await p.focus('#btn-reset'); if (!(await p.evaluate(() => document.activeElement?.id === 'btn-reset'))) bad.push('reset not keyboard-focusable');
  await p.keyboard.press('Enter'); await sleep(200);
  expect('after-click (immediate)', await p.evaluate(state), false);
  await sleep(2400); expect('after-click (settled)', await p.evaluate(state), false);
  await drag(p); expect('drag-2', await p.evaluate(state), true);
  await p.evaluate(() => window.__mv.goTo(2)); await sleep(300); expect('chapter-change (flying)', await p.evaluate(state), false);
  await sleep(2600); expect('chapter-change (settled)', await p.evaluate(state), false);
  await p.mouse.move(1100, 560); await p.mouse.wheel({ deltaY: -400 }); await sleep(900); expect('after-zoom', await p.evaluate(state), true);
  // back near the preset by hand: undo the zoom
  await p.mouse.wheel({ deltaY: 400 }); await sleep(1200); const back = await p.evaluate(state); console.log('zoom-undone', JSON.stringify(back));
  await p.close();
}
// 2. layouts: side panel collapsed, 1440x900, zh, mobile, dark, reduced motion
for (const [name, q, opt, setup] of [
  ['sp-collapsed-en', 'chapter=1&lang=en', {}, async (p) => { await p.click('#sp-toggle'); await sleep(600); }],
  ['zh-1440x900', 'chapter=2&lang=zh', { w: 1440, h: 900 }],
  ['ms-1920-dark', 'chapter=0&lang=ms', { dark: true }],
  ['mobile-390x844', 'chapter=1&lang=en', { w: 390, h: 844, dpr: 2 }],
  ['mobile-landscape-844x390', 'chapter=1&lang=en', { w: 844, h: 390, dpr: 2 }],
  ['reduced-motion', 'chapter=1&lang=en', { rm: true }],
]) {
  const p = await open(name, q, opt); if (setup) await setup(p);
  expect(`${name} load`, await p.evaluate(state), false);
  await drag(p, opt.w && opt.w < 900 ? 80 : 220, 20);
  const s = await p.evaluate(state); expect(`${name} drag`, s, true);
  if (name === 'reduced-motion' && s.trans.split(',').some((t) => parseFloat(t) > 0)) bad.push('reduced motion: transition not instant');
  await p.screenshot({ path: `shots-compass/layout-${name}.png` });
  await p.close();
}
// 3. compass close-ups (3x), light and dark, two bearings
for (const dark of [false, true]) {
  const p = await open(`compass-${dark ? 'dark' : 'light'}`, 'chapter=1&lang=en', { dpr: 3, dark });
  const clip = await p.evaluate(() => { const r = document.getElementById('compass').getBoundingClientRect(); return { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 }; });
  await p.screenshot({ path: `shots-compass/compass-${dark ? 'dark' : 'light'}-a.png`, clip });
  await drag(p, 300, 0); await p.screenshot({ path: `shots-compass/compass-${dark ? 'dark' : 'light'}-b.png`, clip });
  await p.close();
}
await browser.close();
if (bad.length) { console.log('BAD', bad.join(' | ')); process.exitCode = 1; } else console.log('compass/reset OK (hidden on load + after chapter change + after click; visible + focusable after drag/zoom; no overlaps)');
console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (compass check).');
process.exit(process.exitCode ?? 0);
