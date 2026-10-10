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
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('mv-panels'); } catch { /* opaque-origin frames */ } });
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
  for (const sel of ['#osm-credit', '#credit-prefix', '.bottom-bar', '#side-panel', '#compass', '.scalebar', '#map-strip', '#sp-toggle', '#tp-toggle', '#text-panel']) {
    const e = document.querySelector(sel); if (!e) continue; const r = R(e); if (r[2] - r[0] < 1) continue;
    if (sel !== '#side-panel' || !document.getElementById('stage').classList.contains('sp-collapsed')) if (hit(br, r)) overlaps.push(`reset x ${sel}`);
    if (!['#compass'].includes(sel) && hit(comp, r)) overlaps.push(`compass x ${sel}`);
  }
  // reset button = half the compass height; text not clipped
  // measure the label's glyph box against the button's padding box (scrollWidth would count the ::after touch target)
  function textClipped(el) {
    const rg = document.createRange(); rg.selectNodeContents(el); const t = rg.getBoundingClientRect(); const o = el.getBoundingClientRect();
    const bw = parseFloat(cs.borderLeftWidth) || 0;
    return t.width > 0 && (t.left < o.left + bw - 0.5 || t.right > o.right - bw + 0.5 || t.top < o.top - 0.5 || t.bottom > o.bottom + 0.5 || el.scrollWidth > el.clientWidth + 8.5);
  }
  // invisible touch target (::after) in screen px; stage scale s (the furniture is counter-scaled when 60 * s < 42)
  const af = getComputedStyle(b, '::after'), lk = (br[3] - br[1]) / (b.offsetHeight || 1);
  const hitH = Math.round((b.offsetHeight - parseFloat(af.top) - parseFloat(af.bottom)) * lk * 10) / 10, hitW = Math.round((b.offsetWidth - parseFloat(af.left) - parseFloat(af.right)) * lk * 10) / 10;
  const stageS = Math.min(innerWidth / 1920, innerHeight / 1080);
  const sizes = { stageS: Math.round(stageS * 1000) / 1000, hitH, hitW, compassH: Math.round((comp[3] - comp[1]) * 10) / 10, resetH: Math.round((br[3] - br[1]) * 10) / 10, clipped: textClipped(b) };
  // bottom-right strip: scale bar immediately right of the credit, same centre line; clear of rail, furniture, side panel
  const cred = R(document.getElementById('osm-credit')), sb = R(document.getElementById('scalebar')), strip = R(document.getElementById('map-strip'));
  const stripInfo = { rightOf: sb[0] >= cred[2] - 0.5 && sb[0] - cred[2] < 40, dyCentre: Math.round(((sb[1] + sb[3]) / 2 - (cred[1] + cred[3]) / 2) * 10) / 10, label: document.getElementById('scale-label').textContent, barW: Math.round(document.getElementById('scale-bar').getBoundingClientRect().width), inView: strip[0] >= 0 && strip[2] <= innerWidth && strip[3] <= innerHeight, hits: [] };
  for (const sel of ['#chapter-tabs', '#btn-prev', '#btn-next', '.map-furniture', '#compass', '#side-panel', '#sp-toggle', '#credit-prefix']) {
    const e = document.querySelector(sel); if (!e) continue; const r = R(e); if (r[2] - r[0] < 1) continue;
    if (sel === '#side-panel' && document.getElementById('stage').classList.contains('sp-collapsed')) continue;
    if (hit(strip, r)) stripInfo.hits.push(sel);
  }
  return { ...sizes, strip: stripInfo, visible: !b.classList.contains('is-hidden') && cs.visibility === 'visible', opacity: cs.opacity, tab: b.tabIndex, ariaHidden: b.getAttribute('aria-hidden'), text: b.textContent, trans: cs.transitionDuration,
    centreDy: Math.round(((br[1] + br[3]) / 2 - (comp[1] + comp[3]) / 2) * 10) / 10, gap: Math.round(comp[0] - br[2]), overlaps };
};
async function drag(p, dx = 220, dy = 30) {
  const v = p.viewport(); const x = v.width * 0.55, y = v.height * 0.5;
  await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 12; i++) await p.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12); await p.mouse.up(); await sleep(900);
}
const expect = (name, s, vis) => {
  if (Math.abs(s.resetH - s.compassH / 2) > 1) bad.push(`${name}: reset height ${s.resetH} vs compass ${s.compassH}/2`);
  if (s.clipped) bad.push(`${name}: reset text clipped`);
  if (60 * s.stageS < 42 && (s.compassH < 40 || s.compassH > 44.5)) bad.push(`${name}: small-screen compass ${s.compassH} px (want 40-44)`);
  if (s.hitH < 44 || s.hitW < 44) bad.push(`${name}: reset touch target ${s.hitW}x${s.hitH} px (< 44)`);
  if (!s.strip.rightOf || Math.abs(s.strip.dyCentre) > 1.5 || !s.strip.inView || s.strip.hits.length) bad.push(`${name}: strip ${JSON.stringify(s.strip)}`); if (s.visible !== vis) bad.push(`${name}: expected ${vis ? 'visible' : 'hidden'}`); if (!vis && s.tab !== -1) bad.push(`${name}: hidden but focusable`); if (vis && s.tab !== 0) bad.push(`${name}: visible but not focusable`); if (s.overlaps.length) bad.push(`${name}: ${s.overlaps.join(', ')}`); console.log(name, JSON.stringify(s)); };
const clipFurn = async (p, path, dpr = 1) => { const r = await p.evaluate(() => { const a = document.querySelector('.map-furniture').getBoundingClientRect(); return { x: a.left - 24, y: a.top - 24, width: a.width + 48, height: a.height + 48 }; }); await p.screenshot({ path, clip: r }); };

// 1. main flow, EN 1920x1080
{
  const p = await open('flow', 'chapter=2&lang=en', { dpr: 2 });
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
  await p.evaluate(() => window.__mv.goTo(3)); await sleep(300); expect('chapter-change (flying)', await p.evaluate(state), false);
  await sleep(2600); expect('chapter-change (settled)', await p.evaluate(state), false);
  const z0 = (await p.evaluate(state)).strip;
  await p.mouse.move(1100, 560); await p.mouse.wheel({ deltaY: -400 }); await sleep(900); const zs = await p.evaluate(state); expect('after-zoom', zs, true);
  if (zs.strip.label === z0.label && Math.abs(zs.strip.barW - z0.barW) < 2) bad.push(`scale bar did not update on zoom (${JSON.stringify(z0)} -> ${JSON.stringify(zs.strip)})`); else console.log('scale bar on zoom', z0.label, z0.barW, '->', zs.strip.label, zs.strip.barW);
  // back near the preset by hand: undo the zoom
  await p.mouse.wheel({ deltaY: 400 }); await sleep(1200); const back = await p.evaluate(state); console.log('zoom-undone', JSON.stringify(back));
  await p.close();
}
// 2. layouts: side panel collapsed, 1440x900, zh, mobile, dark, reduced motion
for (const [name, q, opt, setup] of [
  ['sp-collapsed-en', 'chapter=2&lang=en', {}, async (p) => { await p.click('#sp-toggle'); await sleep(600); }],
  ['zh-1440x900', 'chapter=3&lang=zh', { w: 1440, h: 900 }],
  ['ms-1920-dark', 'chapter=1&lang=ms', { dark: true }], // 00 turntable: bearing-only drags do not count (orbit-check)
  ['mobile-390x844', 'chapter=2&lang=en', { w: 390, h: 844, dpr: 2, mobile: true }],
  ['mobile-landscape-844x390', 'chapter=2&lang=en', { w: 844, h: 390, dpr: 2, mobile: true }],
  ['mobile-360x640-zh', 'chapter=3&lang=zh', { w: 360, h: 640, dpr: 2, mobile: true }],
  ['mobile-667x375-ms', 'chapter=4&lang=ms', { w: 667, h: 375, dpr: 2, mobile: true }],
  ['small-window-1100x700', 'chapter=2&lang=en', { w: 1100, h: 700 }],
  ['reduced-motion', 'chapter=2&lang=en', { rm: true }],
]) {
  const p = await open(name, q, opt); if (setup) await setup(p);
  expect(`${name} load`, await p.evaluate(state), false);
  await drag(p, opt.w && opt.w < 900 ? 80 : 220, 20);
  const s = await p.evaluate(state); expect(`${name} drag`, s, true);
  if (name === 'reduced-motion' && s.trans.split(',').some((t) => parseFloat(t) > 0)) bad.push('reduced motion: transition not instant');
  await p.screenshot({ path: `shots-compass/layout-${name}.png` });
  await p.close();
}
// 2b. v12 crops: compass + reset (visible), bottom-right strip, light and dark; full EN light; 1440x900; 390x844
for (const dark of [false, true]) {
  const p = await open(`v12-${dark ? 'dark' : 'light'}`, 'chapter=2&lang=en', { dpr: 3, dark });
  await drag(p);
  const cr = await p.evaluate(() => { const a = document.getElementById('btn-reset').getBoundingClientRect(), c = document.getElementById('compass').getBoundingClientRect(); return { x: a.left - 16, y: c.top - 12, width: c.right - a.left + 32, height: c.height + 24 }; });
  await p.screenshot({ path: `shots-compass/v12-compass-reset-${dark ? 'dark' : 'light'}.png`, clip: cr });
  const st = await p.evaluate(() => { const a = document.getElementById('map-strip').getBoundingClientRect(); return { x: a.left - 40, y: a.top - 14, width: a.width + 80, height: a.height + 28 }; });
  await p.screenshot({ path: `shots-compass/v12-strip-${dark ? 'dark' : 'light'}.png`, clip: st });
  await p.close();
}
for (const [name, q, opt] of [['v12-full-en-light', 'chapter=2&lang=en', {}], ['v12-1440x900-en', 'chapter=0&lang=en', { w: 1440, h: 900 }], ['v12-390x844-en', 'chapter=2&lang=en', { w: 390, h: 844, dpr: 2 }], ['v12-full-zh-light', 'chapter=3&lang=zh', {}]]) {
  const p = await open(name, q, opt); const s = await p.evaluate(state); expect(`${name} load`, s, false); await p.screenshot({ path: `shots-compass/${name}.png` }); await p.close();
}
// 2c. mobile: every chapter, portrait + landscape: compass 40-44 px, reset half that, >= 44 px touch target, no overlaps
// with the chapter bar / strip / panels (reset visible after a drag); v13 full shots + compass crops
{
  const probe = await open('count', 'chapter=0&lang=en'); const ids = await probe.evaluate(() => window.__mv.chapters); await probe.close();
  for (const [tag, w, h] of [['portrait-390x844', 390, 844], ['landscape-844x390', 844, 390]]) {
    for (const c of ids) {
      const p = await open(`m-${tag}-${c}`, `chapter=${c}&lang=en`, { w, h, dpr: 1, mobile: true });
      await drag(p, w < 600 ? 80 : 160, c === 0 ? 120 : 10); // 00 turntable ignores bearing: change the pitch there
      const s = await p.evaluate(state); expect(`mobile ${tag} ch${c}`, s, true);
      if (Math.abs(s.centreDy) > 1.5) bad.push(`mobile ${tag} ch${c}: reset not centred (dy ${s.centreDy})`);
      if (c === 2) console.log(`mobile ${tag}`, JSON.stringify({ compassH: s.compassH, resetH: s.resetH, hit: `${s.hitW}x${s.hitH}`, gap: s.gap, centreDy: s.centreDy }));
      await p.close();
    }
    for (const lang of ['en']) {
      const p = await open(`v13-${tag}`, `chapter=2&lang=${lang}`, { w, h, dpr: 3, mobile: true });
      await drag(p, w < 600 ? 80 : 160, 10); await sleep(400);
      await p.screenshot({ path: `shots-compass/v13-mobile-${tag}.png` });
      const cr = await p.evaluate(() => { const a = document.getElementById('btn-reset').getBoundingClientRect(), c = document.getElementById('compass').getBoundingClientRect(); return { x: a.left - 14, y: c.top - 14, width: c.right - a.left + 28, height: c.height + 28 }; });
      await p.screenshot({ path: `shots-compass/v13-mobile-compass-${tag}.png`, clip: cr });
      await p.close();
    }
  }
}
// 3. compass close-ups (3x), light and dark, two bearings
for (const dark of [false, true]) {
  const p = await open(`compass-${dark ? 'dark' : 'light'}`, 'chapter=2&lang=en', { dpr: 3, dark });
  const clip = await p.evaluate(() => { const r = document.getElementById('compass').getBoundingClientRect(); return { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 }; });
  await p.screenshot({ path: `shots-compass/compass-${dark ? 'dark' : 'light'}-a.png`, clip });
  await drag(p, 300, 0); await p.screenshot({ path: `shots-compass/compass-${dark ? 'dark' : 'light'}-b.png`, clip });
  await p.close();
}
await browser.close();
if (bad.length) { console.log('BAD', bad.join(' | ')); process.exitCode = 1; } else console.log('compass/reset OK (hidden on load + after chapter change + after click; visible + focusable after drag/zoom; no overlaps)');
console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (compass check).');
process.exit(process.exitCode ?? 0);
