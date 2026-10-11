// Mobile layout check (html.mobile): native CSS-px layout on phones / small tablets / short landscape phones.
// At 360x640, 390x844, 430x932, 844x390 and 768x1024: map canvas >= 50 % of the visible area with the sheet collapsed,
// rail tabs >= 44 px tall, every tap target >= 40 px, no horizontal page overflow, sheet expands / collapses (tap and
// swipe), chapter switching by tap, swipe and prev / next, current tab scrolled into view, no overlaps between rail,
// sheet peek, compass / reset, credit strip and header, pin tags on screen, overflow menu; EN / zh / ms, dark, reduced
// motion; no console errors. Screenshots to shots-mobile/.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/mobile-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const mac = process.platform === 'darwin';
const chrome = process.env.CHROME_PATH || (mac ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const gl = mac ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];
const OUT = 'shots-mobile'; mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', ...gl] });
const errors = []; const fails = []; let checks = 0;
const ok = (cond, msg, extra) => { checks++; if (!cond) { fails.push(msg + (extra !== undefined ? ` ${JSON.stringify(extra)}` : '')); console.log('FAIL', msg, extra ?? ''); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = [[360, 640], [390, 844], [430, 932], [844, 390], [768, 1024]];

async function open(w, h, q = '', { dark = false, reduced = false } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`${w}x${h}${q} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${w}x${h}${q} ${m.type()}: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${w}x${h} HTTP ${r.status()} ${r.url()}`); });
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${base}?skipLoader=1${dark ? '&theme=dark' : ''}${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv && window.__mv.revealed, { timeout: 90000 });
  await sleep(900);
  return page;
}
const settle = (page, ms = 700) => page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);
// wait until the sheet has stopped animating (software GL can make CSS transitions run slow)
const sheetStill = (page) => page.evaluate(() => new Promise((res) => { let last = '', n = 0, k = 0; const f = () => { const r = document.getElementById('sheet').getBoundingClientRect(); const s = `${r.top}|${r.height}`; n = s === last ? n + 1 : 0; last = s; if (n >= 3 || ++k > 60) res(); else setTimeout(f, 80); }; f(); }));
const hash = (page) => page.evaluate(() => location.hash);

// geometry snapshot of the furniture
const geo = (page) => page.evaluate(() => {
  const R = (el) => { if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, w: r.width, h: r.height } : null; };
  const W = innerWidth, H = innerHeight;
  const sheet = R(document.getElementById('sheet')), rail = R(document.querySelector('.bottom-bar')), tools = R(document.getElementById('top-tools')), brand = R(document.querySelector('.brand'));
  const compass = R(document.getElementById('compass')), strip = R(document.getElementById('map-strip')), reset = R(document.getElementById('btn-reset')), canvas = R(document.querySelector('#gl canvas'));
  // visible map area: canvas inside the viewport minus everything that covers it (4 px grid union)
  const covers = [sheet, rail, tools, brand].filter(Boolean); let vis = 0, tot = 0;
  for (let y = 2; y < H; y += 4) for (let x = 2; x < W; x += 4) { tot++; if (canvas && x >= canvas.x0 && x < canvas.x1 && y >= canvas.y0 && y < canvas.y1 && !covers.some((c) => x >= c.x0 && x < c.x1 && y >= c.y0 && y < c.y1)) vis++; }
  const tabs = [...document.querySelectorAll('#chapter-tabs .tab')].map((t) => ({ h: t.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(t.querySelector('.lbl')).fontSize), clipped: t.querySelector('.lbl').scrollWidth > t.querySelector('.lbl').clientWidth + 1 }));
  const cur = document.querySelector('#chapter-tabs .tab[aria-current="step"]'); const tr = document.getElementById('chapter-tabs').getBoundingClientRect(); const cr = cur?.getBoundingClientRect();
  const pins = [...document.querySelectorAll('#pins .pin:not(.hidden)')].filter((p) => p.style.opacity !== '0').map((p) => { const r = p.querySelector('.tag').getBoundingClientRect(); return { t: p.querySelector('.t').textContent, x0: r.left, x1: r.right }; });
  return { W, H, mobile: document.documentElement.classList.contains('mobile'), sheet, rail, tools, brand, compass, strip, reset, mapFrac: vis / tot,
    scrollW: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), tabs, curInView: !!cr && cr.left >= tr.left - 1 && cr.right <= tr.right + 1,
    pins, sheetOpen: document.getElementById('sheet').classList.contains('open'), body: (() => { const b = document.getElementById('sheet-body'); return { sh: b.scrollHeight, ch: b.clientHeight, ov: getComputedStyle(b).overflowY }; })() };
});
// every visible, enabled tap target on screen (buttons, links, inputs, role=button) and its size
const tapTargets = (page) => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, a[href], input, select, [role="button"], [role="radio"], [tabindex="0"]')) {
    if (el.closest('#loader')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('[hidden]')) continue;
    // inline text links inside running text are exempt (WCAG 2.5.8 'inline' exception)
    if (el.tagName === 'A' && cs.display === 'inline' && (el.parentElement?.textContent.trim().length ?? 0) > el.textContent.trim().length + 20) continue;
    // a switch inside a <label> is operated through the whole label row
    const lab = el.closest('label'); const box = lab || el;
    let r = box.getBoundingClientRect();
    // an absolutely positioned ::after that pads the element counts as part of its touch target (RESET VIEW)
    const af = getComputedStyle(box, '::after');
    if (af.content !== 'none' && af.position === 'absolute') { const px = (v) => Math.min(0, parseFloat(v) || 0); r = new DOMRect(r.left + px(af.left), r.top + px(af.top), r.width - px(af.left) - px(af.right), r.height - px(af.top) - px(af.bottom)); } if (!r.width || !r.height) continue;
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    // only what is actually reachable (not under the collapsed sheet's clip or another layer)
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy); if (!hit || !(hit === box || box.contains(hit) || hit.contains(box))) continue;
    if (el.type === 'range') { if (r.height < 40) out.push({ id: el.id || el.className || el.tagName, w: r.width, h: r.height }); continue; }
    if (r.width < 40 - 0.5 || r.height < 40 - 0.5) out.push({ id: box.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
  }
  return out;
});
const inter = (a, b) => a && b && a.x0 < b.x1 - 0.5 && a.x1 > b.x0 + 0.5 && a.y0 < b.y1 - 0.5 && a.y1 > b.y0 + 0.5;
function overlaps(g, tag) {
  const items = { rail: g.rail, sheet: g.sheet, compass: g.compass, strip: g.strip, tools: g.tools, brand: g.brand, reset: g.reset };
  const names = Object.keys(items);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) ok(!inter(items[names[i]], items[names[j]]), `${tag}: ${names[i]} overlaps ${names[j]}`, [items[names[i]], items[names[j]]]);
}
async function swipe(page, x0, y0, x1, y1) {
  await page.touchscreen.touchStart(x0, y0);
  for (let k = 1; k <= 6; k++) { await page.touchscreen.touchMove(x0 + ((x1 - x0) * k) / 6, y0 + ((y1 - y0) * k) / 6); await sleep(16); }
  await page.touchscreen.touchEnd(); await settle(page, 500);
}

for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`; const page = await open(w, h);
  let g = await geo(page);
  ok(g.mobile, `${tag}: mobile layout active`);
  ok(g.scrollW <= w, `${tag}: no horizontal overflow`, g.scrollW);
  ok(g.mapFrac >= 0.5, `${tag}: map >= 50 % visible with the sheet collapsed`, +g.mapFrac.toFixed(3));
  ok(g.tabs.every((t) => t.h >= 44), `${tag}: rail tabs >= 44 px`, g.tabs.map((t) => t.h));
  ok(g.tabs.every((t) => t.fs >= 13), `${tag}: tab labels >= 13 px`, g.tabs.map((t) => t.fs));
  ok(g.tabs.every((t) => !t.clipped), `${tag}: tab labels not clipped`);
  ok(g.rail && g.rail.y1 <= h + 0.5 && g.rail.y0 >= h - 120, `${tag}: rail at the bottom`, g.rail);
  const peekOk = (s) => !!s && (w > h ? (s.w * s.h) / (w * h) < 0.3 && s.h < h * 0.4 : s.h < h * 0.3);
  ok(peekOk(g.sheet), `${tag}: collapsed sheet is a peek`, g.sheet);
  ok(g.compass && g.compass.w >= 40, `${tag}: compass >= 40 px`, g.compass?.w);
  ok(g.pins.every((p) => p.x0 >= -0.5 && p.x1 <= w + 0.5), `${tag}: pin tags on screen`, g.pins.filter((p) => p.x0 < 0 || p.x1 > w));
  overlaps(g, `${tag} collapsed`);
  let small = await tapTargets(page); ok(small.length === 0, `${tag}: tap targets >= 40 px (collapsed)`, small);
  // tap the handle: expand, scrollable body, furniture moves above the sheet
  await page.tap('#sheet-handle'); await settle(page, 300); await sheetStill(page);
  g = await geo(page);
  ok(g.sheetOpen && g.sheet.h >= Math.min(h * 0.5, h - 200), `${tag}: sheet expands on tap`, g.sheet?.h);
  ok(g.body.ov === 'auto' && g.body.sh >= g.body.ch, `${tag}: expanded sheet scrolls inside`, g.body);
  overlaps(g, `${tag} expanded`);
  small = await tapTargets(page); ok(small.length === 0, `${tag}: tap targets >= 40 px (expanded, chapter 00)`, small);
  await page.tap('#sheet-handle'); await settle(page, 300); await sheetStill(page);
  g = await geo(page); ok(!g.sheetOpen && peekOk(g.sheet), `${tag}: sheet collapses on tap`, g.sheet);
  // swipe up / down on the handle
  await sheetStill(page);
  const hr = await page.$eval('#sheet-handle', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await swipe(page, hr.x, hr.y, hr.x, hr.y - 160); await sheetStill(page);
  if (!(await geo(page)).sheetOpen) { // software GL can drop a synthetic touch sequence under load: retry once, and say so
    console.log(`note ${tag}: swipe up not registered on the first synthetic attempt; retrying once`);
    await settle(page, 600); await swipe(page, hr.x, hr.y, hr.x, hr.y - 160); await sheetStill(page);
  }
  ok((await geo(page)).sheetOpen, `${tag}: swipe up expands the sheet`);
  await sheetStill(page);
  const hr2 = await page.$eval('#sheet-handle', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await swipe(page, hr2.x, hr2.y, hr2.x, hr2.y + 160); await sheetStill(page);
  ok(!(await geo(page)).sheetOpen, `${tag}: swipe down collapses the sheet`);
  // chapter switching: tap a tab, swipe the peek, prev / next; the current tab stays in view
  await page.tap('#chapter-tabs .tab:nth-child(3)'); await settle(page, 900);
  ok((await hash(page)) === '#02', `${tag}: tap on tab 02 opens chapter 02`, await hash(page));
  await sheetStill(page);
  const pk = await page.$eval('#sheet', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 60, w: r.width }; });
  await swipe(page, pk.x + pk.w * 0.3, pk.y, pk.x - pk.w * 0.3, pk.y + 4); await settle(page, 900);
  ok((await hash(page)) === '#03', `${tag}: swipe left on the sheet peek -> next chapter`, await hash(page));
  await swipe(page, pk.x - pk.w * 0.3, pk.y, pk.x + pk.w * 0.3, pk.y); await settle(page, 900);
  ok((await hash(page)) === '#02', `${tag}: swipe right on the sheet peek -> previous chapter`, await hash(page));
  ok(!(await geo(page)).sheetOpen, `${tag}: horizontal swipe does not open the sheet`);
  for (let k = 0; k < 6; k++) { await page.tap('#btn-next'); await settle(page, 250); }
  await settle(page, 900);
  g = await geo(page);
  ok((await hash(page)) === '#08', `${tag}: next button reaches chapter 08`, await hash(page));
  ok(g.curInView, `${tag}: current tab scrolled into view`);
  await page.tap('#btn-prev'); await settle(page, 900); ok((await hash(page)) === '#07', `${tag}: prev button`, await hash(page));
  // every chapter: overlaps, pins on screen and tap targets with the sheet collapsed and expanded
  for (let id = 0; id <= 8; id++) {
    await page.evaluate((id) => window.__mv.goTo(id), id); await settle(page, 600);
    g = await geo(page); overlaps(g, `${tag} ch${id}`);
    ok(g.pins.every((p) => p.x0 >= -0.5 && p.x1 <= w + 0.5), `${tag} ch${id}: pin tags on screen`, g.pins.filter((p) => p.x0 < 0 || p.x1 > w));
    ok(g.scrollW <= w, `${tag} ch${id}: no horizontal overflow`, g.scrollW);
    await page.tap('#sheet-handle'); await settle(page, 300); await sheetStill(page);
    small = await tapTargets(page); ok(small.length === 0, `${tag} ch${id}: tap targets >= 40 px (expanded)`, small);
    // scroll the sheet to the bottom and check again (side-panel controls)
    await page.evaluate(() => { const b = document.getElementById('sheet-body'); b.scrollTop = b.scrollHeight; }); await settle(page, 200);
    small = await tapTargets(page); ok(small.length === 0, `${tag} ch${id}: tap targets >= 40 px (expanded, scrolled)`, small);
    await page.tap('#sheet-handle'); await settle(page, 300); await sheetStill(page);
  }
  // overflow menu
  await page.tap('#btn-more'); await settle(page, 300);
  const menu = await page.evaluate(() => { const m = document.getElementById('more-menu'); const r = m.getBoundingClientRect(); return { hidden: m.hidden, r: { x0: r.left, x1: r.right, y1: r.bottom }, items: [...m.querySelectorAll('button')].map((b) => ({ id: b.id, h: b.getBoundingClientRect().height, label: b.querySelector('.mi-label')?.textContent })) }; });
  ok(!menu.hidden && menu.items.length === 5, `${tag}: overflow menu opens with 5 tools`, menu.items.map((i) => i.id));
  ok(menu.items.every((i) => i.h >= 44 && i.label), `${tag}: menu items >= 44 px with labels`, menu.items);
  ok(menu.r.x0 >= 0 && menu.r.x1 <= w && menu.r.y1 <= h, `${tag}: menu on screen`, menu.r);
  const tr0 = await page.$eval('#btn-trains', (b) => b.getAttribute('aria-pressed'));
  await page.tap('#btn-trains'); await settle(page, 300);
  ok((await page.$eval('#btn-trains', (b) => b.getAttribute('aria-pressed'))) !== tr0, `${tag}: trains toggle works from the menu`);
  ok(await page.$eval('#more-menu', (m) => m.hidden), `${tag}: menu closes after a choice`);
  await page.close();
}

// screenshots + language / theme / reduced-motion variants
const shots = [];
async function shot(page, name) { await settle(page, 400); await page.screenshot({ path: `${OUT}/${name}.png` }); shots.push(`${OUT}/${name}.png`); }
{
  const page = await open(390, 844);
  for (const id of [0, 2, 7]) {
    await page.evaluate((id) => window.__mv.goTo(id), id); await settle(page, 1500); await shot(page, `390x844-${String(id).padStart(2, '0')}-collapsed`);
    await page.tap('#sheet-handle'); await settle(page, 900); await shot(page, `390x844-${String(id).padStart(2, '0')}-expanded`);
    await page.tap('#sheet-handle'); await settle(page, 600);
  }
  await page.tap('#btn-more'); await shot(page, '390x844-menu'); await page.close();
}
for (const lang of ['zh', 'ms']) {
  const page = await open(360, 640, `&lang=${lang}`);
  const g = await geo(page);
  ok(g.scrollW <= 360 && g.tabs.every((t) => !t.clipped), `360x640 ${lang}: no overflow, tabs unclipped`);
  overlaps(g, `360x640 ${lang}`);
  const head = await page.evaluate(() => { const b = document.querySelector('.brand').getBoundingClientRect(), t = document.getElementById('top-tools').getBoundingClientRect(); return { b: b.right, t: t.left, tr: t.right }; });
  ok(head.b <= head.t && head.tr <= 360, `360x640 ${lang}: header fits`, head);
  await shot(page, `360x640-${lang}-00`);
  await page.evaluate(() => window.__mv.goTo(4)); await settle(page, 1200); await shot(page, `360x640-${lang}-04`);
  await page.tap('#sheet-handle'); await settle(page, 900); await shot(page, `360x640-${lang}-04-expanded`);
  await page.close();
}
{
  const page = await open(390, 844, '&chapter=2', { dark: true }); await settle(page, 600); await shot(page, '390x844-dark-02');
  await page.tap('#sheet-handle'); await settle(page, 900); await shot(page, '390x844-dark-02-expanded'); await page.close();
}
{
  const page = await open(844, 390, '&chapter=2'); await shot(page, '844x390-02');
  await page.tap('#sheet-handle'); await settle(page, 900); await shot(page, '844x390-02-expanded'); await page.close();
  const p2 = await open(667, 375, '&chapter=6'); const g = await geo(p2); ok(g.mobile && g.mapFrac >= 0.5 && g.scrollW <= 667, '667x375: mobile, map >= 50 %, no overflow', { f: g.mapFrac, sw: g.scrollW }); overlaps(g, '667x375'); await shot(p2, '667x375-06'); await p2.close();
}
{
  const page = await open(390, 844, '', { reduced: true });
  const r = await page.evaluate(() => ({ tr: getComputedStyle(document.getElementById('sheet')).transitionDuration, orbit: window.__mv.world.turntableActive() }));
  ok(r.tr === '0s' && !r.orbit, '390x844 reduced motion: no sheet animation, no orbit', r);
  await page.tap('#sheet-handle'); await settle(page, 200); ok((await geo(page)).sheetOpen, 'reduced motion: sheet still expands');
  await page.close();
}
// desktop is unchanged: no mobile class, scaled stage, sheet / more hidden
{
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => errors.push(`1440 pageerror: ${e.message}`));
  await page.goto(`${base}?skipLoader=1`, { waitUntil: 'networkidle0' }); await page.waitForFunction(() => window.__mv && window.__mv.revealed, { timeout: 90000 });
  const d = await page.evaluate(() => ({ mobile: document.documentElement.classList.contains('mobile'), tf: document.getElementById('stage').style.transform, sheet: getComputedStyle(document.getElementById('sheet')).display, more: getComputedStyle(document.getElementById('btn-more')).display, tp: document.getElementById('text-panel').parentElement.id, tools: document.getElementById('top-tools').children.length }));
  ok(!d.mobile && d.tf.includes('scale') && d.sheet === 'none' && d.more === 'none' && d.tp === 'stage', '1440x900: desktop layout unchanged', d);
  await page.close();
}
await browser.close();
const uniq = [...new Set(errors)];
ok(uniq.length === 0, 'no console errors or warnings', uniq.slice(0, 8));
console.log(`\nshots:\n${shots.join('\n')}`);
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log(`${fails.length} FAILED`); process.exit(1); }
console.log('mobile-check OK');
