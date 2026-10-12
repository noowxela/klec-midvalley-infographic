// 05 Connections underground road cutaway check: cutaway + car flow on by default in 05 only, translucent ground,
// cut-section box, tunnel ribbons per kind, legend rows and toggles in EN/zh/ms, both cutaway labels visible without overlap,
// depth labelled as an estimate, sources in the source note, cars move (and stay put under reduced motion), toggles work,
// other chapters keep the cutaway off; desktop, dark and 390x844 mobile. No console errors. Screenshots to shots-cutaway/.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/cutaway-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'shots-cutaway'; mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = []; const bad = []; let n = 0;
const ok = (c, msg) => { n++; if (!c) bad.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(name, q, { w = 1920, h = 1080, dark = false, mobile = false, reduced = false } = {}) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.removeItem('mv-panels'));
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  await sleep(3000);
  return page;
}
const probe = () => {
  const w = window.__mv.world; const g = w.cutGroup; const cars = w.cars;
  const R = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const vis = [...document.querySelectorAll('.pin')].filter((p) => !p.classList.contains('hidden') && !p.classList.contains('occluded') && p.style.opacity !== '0');
  const tags = vis.map((p) => ({ id: p.dataset.id || '', t: p.querySelector('.tag')?.textContent || '', r: R(p.querySelector('.tag')) }));
  const overlaps = []; for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) if (hit(tags[i].r, tags[j].r)) overlaps.push(`${tags[i].t} x ${tags[j].t}`);
  const sec = document.querySelector('section.cutaway');
  const m0 = new Float32Array(16); if (cars) { const a = cars.mesh.instanceMatrix.array; for (let i = 0; i < 16; i++) m0[i] = a[i]; }
  return {
    mode: { cutaway: w.mode.cutaway, carFlow: w.mode.carFlow }, groupVisible: g.visible, meshes: g.children.length,
    ground: { transparent: w.mats.ground.transparent, opacity: w.mats.ground.opacity }, roadOpacity: w.mats.road.opacity,
    carsVisible: !!cars && cars.mesh.visible, carCount: cars ? cars.mesh.count : 0, car0: [...m0.slice(12, 15)],
    tags: tags.map((t) => t.t), overlaps,
    legend: sec ? [...sec.querySelectorAll('.legend-row')].map((r) => r.textContent) : [], toggles: sec ? sec.querySelectorAll('input[type=checkbox]').length : 0,
    note: sec?.querySelector('.small')?.textContent || '', source: document.querySelector('.source')?.textContent || document.body.textContent,
    scrollX: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
};
const EST = { en: /estimate|est\.\)/, zh: /估算/, ms: /anggaran/ };
const TITLE = { en: ['KL Eco City lower tier', 'Mid Valley basement access'], zh: ['吉隆坡生态城下层道路', '谷中城地下停车场通道'], ms: ['Tingkat bawah KL Eco City', 'Akses ruang bawah tanah Mid Valley'] };
for (const [name, lang, opt] of [['05-en', 'en', {}], ['05-zh', 'zh', {}], ['05-ms', 'ms', {}], ['05-en-1440x900', 'en', { w: 1440, h: 900 }], ['05-en-dark', 'en', { dark: true }], ['05-en-390x844', 'en', { w: 390, h: 844, mobile: true }]]) {
  const p = await open(name, `chapter=5&lang=${lang}`, opt);
  const s = await p.evaluate(probe);
  ok(s.mode.cutaway && s.mode.carFlow && s.groupVisible, `${name} cutaway not on`);
  ok(s.meshes >= 4, `${name} cutaway meshes ${s.meshes}`);
  ok(s.ground.transparent && s.ground.opacity < 1 && s.roadOpacity < 1, `${name} ground not translucent`);
  ok(s.carsVisible && s.carCount > 20, `${name} cars ${s.carCount}`);
  ok(s.legend.length >= 4, `${name} legend rows ${s.legend.length}`);
  ok(s.toggles === 2, `${name} cutaway toggles ${s.toggles}`);
  ok(EST[lang].test(s.note), `${name} depth not labelled estimate`);
  ok(/spsetia\.com/.test(s.source) && /Malaysia Property News/.test(s.source) && /tunnel=yes/.test(s.source), `${name} sources missing`);
  ok(!opt.mobile || !s.scrollX, `${name} horizontal scroll`);
  if (!opt.mobile) {
    for (const t of TITLE[lang]) ok(s.tags.some((x) => x.includes(t)), `${name} no visible label ${t}`);
    for (const t of s.tags.filter((x) => TITLE[lang].some((y) => x.includes(y)))) ok(EST[lang].test(t), `${name} label without estimate: ${t}`);
    ok(!s.overlaps.length, `${name} label overlap: ${s.overlaps.join('; ')}`);
  }
  await p.screenshot({ path: `${OUT}/${name}.png` });
  if (name === '05-en') {
    await sleep(1200); const s2 = await p.evaluate(probe);
    ok(s2.car0.some((v, i) => Math.abs(v - s.car0[i]) > 0.5), `${name} cars not moving`);
    // toggles: cars off, cutaway off restores the opaque ground
    const boxes = await p.$$('section.cutaway input[type=checkbox]');
    await boxes[1].click(); await sleep(200); let s3 = await p.evaluate(probe); ok(!s3.carsVisible && s3.groupVisible, `${name} car toggle`);
    await boxes[0].click(); await sleep(200); s3 = await p.evaluate(probe); ok(!s3.groupVisible && !s3.ground.transparent && s3.ground.opacity === 1, `${name} cutaway toggle`);
    await p.screenshot({ path: `${OUT}/${name}-off.png` });
  }
  await p.close();
}
// reduced motion: cars shown but standing still
{
  const p = await open('05-en-reduced', 'chapter=5&lang=en', { reduced: true });
  const a = await p.evaluate(probe); await sleep(1500); const b = await p.evaluate(probe);
  ok(a.carsVisible && a.car0.every((v, i) => Math.abs(v - b.car0[i]) < 1e-3), '05-en-reduced cars move under reduced motion');
  await p.close();
}
// other chapters: cutaway off, opaque ground
for (const c of [0, 1, 2, 3, 4, 6, 7, 8]) {
  const p = await open(`ch${c}`, `chapter=${c}&lang=en`);
  const s = await p.evaluate(probe);
  ok(!s.mode.cutaway && !s.groupVisible && !s.carsVisible && !s.ground.transparent && s.ground.opacity === 1 && !s.legend.length, `chapter ${c} shows the cutaway`);
  await p.close();
}
// leaving 05 for 06 turns it off again
{
  const p = await open('05-to-06', 'chapter=5&lang=en');
  await p.evaluate(() => window.__mv.goTo(6)); await sleep(1500);
  const s = await p.evaluate(probe); ok(!s.groupVisible && !s.ground.transparent, '05 -> 06 cutaway still on');
  await p.close();
}
await browser.close();
if (errors.length) { console.log(errors.join('\n')); }
console.log(bad.length ? `BAD ${bad.join(' | ')}` : `${n}/${n} checks passed`);
console.log(errors.length ? `${errors.length} console errors/warnings` : 'No console errors or warnings (cutaway check).');
process.exit(bad.length || errors.length ? 1 : 0);
