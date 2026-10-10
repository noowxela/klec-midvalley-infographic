// v7 checks: minimum loader duration (unthrottled load timeline + mid-load shot) and the mosque-on-car-park shots.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/v7-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots-v7', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function newPage(name, { dark = false, rm = false, cpu = 1 } = {}) {
  const page = await browser.newPage();
  if (cpu > 1) await page.emulateCPUThrottling(cpu); // slow-device case: the scene is genuinely not ready at the minimum
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, ...(rm ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('mv-panels'); } catch {} });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  return page;
}

// ---------- 1. loader timeline on a normal (unthrottled) load ----------
async function timeline(name, q, opts = {}, shotAt = []) {
  const page = await newPage(name, opts);
  const samples = []; const shots = [...shotAt];
  await page.goto(`${base}?${q}`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => { const el = document.getElementById('loader'); const L = window.__loader; return { t: Math.round(performance.now()), loader: !!el && !el.hidden, done: !!el?.classList.contains('is-done'), fill: el ? el.querySelector('.ld-fill').style.width : null, steps: el ? [...el.querySelectorAll('.ld-steps li')].map((li) => (li.className === 'done' ? '●' : li.className === 'active' ? '◐' : '○')).join('') : '', slow: !!el?.classList.contains('is-slow'), appReady: !!window.__mv?.ready, revealedAt: L?.revealedAt != null ? Math.round(L.revealedAt) : null, minMs: L?.minMs }; });
    samples.push(s);
    while (shots.length && s.t >= shots[0].t) { const sh = shots.shift(); await page.screenshot({ path: `shots-v7/${sh.name}.png` }); console.log('shot', sh.name, 'at', s.t, 'ms', s.fill, s.steps); }
    if (!s.loader && s.revealedAt != null) break;
    await sleep(100);
  }
  await sleep(150); for (const sh of shots) await page.screenshot({ path: `shots-v7/${sh.name}.png` });
  const ready = samples.find((s) => s.appReady); const rev = samples.find((s) => s.revealedAt != null);
  const every = samples.filter((s, i) => i % 5 === 0 || s === ready || s === rev).map((s) => `${s.t}:${s.fill}:${s.steps}${s.done ? ':fade' : ''}`);
  console.log(name, JSON.stringify({ minMs: samples.at(-1).minMs, appReadyAt: ready?.t ?? null, revealedAt: rev?.revealedAt ?? null, slowShown: samples.some((s) => s.slow) }));
  console.log('  ', every.join('  '));
  await page.close();
}
await timeline('loader-en', 'chapter=0&lang=en', {}, [{ t: 1000, name: 'loader-mid-1s-en' }, { t: 1500, name: 'loader-mid-1.5s-en' }, { t: 2700, name: 'loader-mid-2.7s-en' }]);
await timeline('loader-zh-dark', 'chapter=0&lang=zh', { dark: true }, [{ t: 1500, name: 'loader-mid-1.5s-zh-dark' }]);
await timeline('loader-en-reduced-motion', 'chapter=0&lang=en', { rm: true }, [{ t: 750, name: 'loader-mid-0.75s-en-reduced-motion' }]);
await timeline('loader-skip', 'skipLoader=1&chapter=0&lang=en');
await timeline('loader-en-cpu20x', 'chapter=0&lang=en', { cpu: 20 }); // scene genuinely slow: reveal must wait for ready (> 3 s)
if (process.env.LOADER_ONLY) { await browser.close(); console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (v7 loader).'); process.exit(0); }

// ---------- 2. mosque on the car park ----------
async function shot(name, q, setup, opts = {}) {
  const page = await newPage(name, opts);
  if (opts.panels) await page.evaluateOnNewDocument((p) => localStorage.setItem('mv-panels', p), opts.panels);
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  if (setup) await page.evaluate(setup);
  await sleep(2600);
  await page.screenshot({ path: `shots-v7/${name}.png` }); console.log('saved', name);
  return page;
}
const mapOnly = JSON.stringify({ tp: true, sp: true });
const close = `(() => { const w = window.__mv.world; w.trains.debugFreeze(w.trains.dwellTime(0, 0) + 8); w.controls.minDistance = 40; w.flyTo({ target: [-100, 14, -305], azimuth: 0.55, polar: 1.02, distance: 230 }, true); })()`;
for (const [n, q] of [['mosque-on-car-park-close-light', 'chapter=1&lang=en&theme=light'], ['mosque-on-car-park-close-dark', 'chapter=1&lang=en&theme=dark']]) await (await shot(n, q, close, { panels: mapOnly })).close();
const ctx = `(() => { const w = window.__mv.world; w.trains.debugFreeze(w.trains.dwellTime(0, 0) + 8); })()`;
for (const [n, q] of [['01-landmarks-en', 'chapter=1&lang=en'], ['01-landmarks-zh', 'chapter=1&lang=zh'], ['01-landmarks-ms-dark', 'chapter=1&lang=ms&theme=dark']]) {
  const p = await shot(n, q, ctx);
  if (n === '01-landmarks-en') console.log('pins', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.pin')].filter((x) => /Masjid/.test(x.textContent)).map((x) => ({ t: x.textContent.trim(), occluded: x.classList.contains('occluded') })))), '\nlegend', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.ov-legend-row')].map((r) => r.textContent))));
  await p.close();
}
// ch09 shadows around the mosque (late afternoon, June) to show the raised block casting its shadow
const sh = await shot('09-shadows-mosque-on-car-park', 'chapter=9&lang=en', `(() => { document.querySelector('.seg button[data-k="jun"]').click(); const i = document.getElementById('sun-time'); i.value = '1020'; i.dispatchEvent(new Event('change')); const w = window.__mv.world; w.controls.minDistance = 40; w.flyTo({ target: [-100, 10, -300], azimuth: 0.4, polar: 0.85, distance: 420 }, true); })()`, { panels: mapOnly });
await sh.close();
console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (v7).');
await browser.close();
