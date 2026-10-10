// v4 checks for the animated LRT trains (track following, station stop, spacing, toggle,
// reduced motion, pause) plus the v4 screenshots (trains close-ups, KJ17 stop, overview + mosques).
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/trains-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots-v4', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(name, q, { rm = false, panels = null, trains = null } = {}) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, ...(rm ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.evaluateOnNewDocument((panels, trains) => { localStorage.removeItem('mv-panels'); localStorage.removeItem('mv-trains'); if (panels) localStorage.setItem('mv-panels', panels); if (trains) localStorage.setItem('mv-trains', trains); }, panels, trains);
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  return page;
}

// ---------- analysis ----------
const page = await open('analysis', 'chapter=3&lang=en');
const A = await page.evaluate(() => {
  const w = window.__mv.world; const tr = w.trains; const tracks = w.lrtTracks;
  const res = { tracks: tracks.map((t) => ({ lengthInMap: t.inEnd - t.inStart, stopAt: t.stop - t.inStart, deckAtStop: +t.y[t.stop].toFixed(2), deckMin: +Math.min(...t.y.slice(t.inStart, t.inEnd)).toFixed(2), deckMax: +Math.max(...t.y.slice(t.inStart, t.inEnd)).toFixed(2) })) };
  // curvature: max turning per 20 m (deg) and its location
  res.curves = tracks.map((t) => { let best = 0, at = 0; for (let i = t.inStart + 150; i < t.inEnd - 150; i++) { const a1 = Math.atan2(t.z[i] - t.z[i - 10], t.x[i] - t.x[i - 10]), a2 = Math.atan2(t.z[i + 10] - t.z[i], t.x[i + 10] - t.x[i]); let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d; if (d > best) { best = d; at = i; } } return { maxTurnDegPer20m: +(best * 180 / Math.PI).toFixed(1), at: at - t.inStart, radiusM: Math.round(20 / best) }; });
  // sweep 20 min of simulated time
  let minGap = Infinity, minGapAt = null, maxStopErr = 0, dwellCount = 0, maxActive = 0, cars = { 2: 0, 4: 0 }, maxCarOffset = 0, maxCarOffsetAt = null, maxGapErr = 0;
  const seen = new Set();
  const nearestOff = (x, z) => { let b = Infinity; for (const t of tracks) for (let i = 0; i < t.n; i++) { const d = Math.hypot(t.x[i] - x, t.z[i] - z); if (d < b) b = d; } return b; };
  for (let t = 2000; t < 3200; t += 0.5) {
    tr.debugFreeze(t); const st = tr.state(); maxActive = Math.max(maxActive, st.length);
    for (const k of [0, 1]) {
      const s = st.filter((x) => x.track === k).sort((a, b) => b.head - a.head);
      for (let i = 1; i < s.length; i++) { const g = s[i - 1].tail - s[i].head; if (g < minGap) { minGap = g; minGapAt = t; } }
      for (const x of s) if (x.speedHint === 'dwell') { dwellCount++; maxStopErr = Math.max(maxStopErr, Math.abs((x.head + x.tail) / 2 - tracks[k].stop)); }
    }
    for (const x of st) { const key = `${x.track}:${Math.round(x.head - x.head % 1)}`; if (!seen.has(`${x.track}:${x.cars}:${Math.floor((t - 0) / 48)}`)) { seen.add(`${x.track}:${x.cars}:${Math.floor(t / 48)}`); cars[x.cars] = (cars[x.cars] || 0) + 1; } }
    if (t % 10 === 0) { // car centres vs track (chord offset in curves)
      tr.update();
      for (const im of [tr.cab, tr.mid]) for (let i = 0; i < im.count; i++) { const e = im.instanceMatrix.array; const x = e[i * 16 + 12], z = e[i * 16 + 14]; if (Math.abs(x) > 500 || Math.abs(z) > 500) continue; const off = nearestOff(x, z); if (off > maxCarOffset) { maxCarOffset = off; maxCarOffsetAt = [x.toFixed(0), (-z).toFixed(0)]; } }
    }
  }
  // speed profile of one train around the station (head position per second)
  const prof = []; const t0 = tr.dwellTime(0, 0) - 40;
  for (let t = t0; t <= t0 + 70; t += 2) { tr.debugFreeze(t); const s = tr.state().filter((x) => x.track === 0 && x.cars === 4).sort((a, b) => Math.abs(a.head - tracks[0].stop) - Math.abs(b.head - tracks[0].stop))[0]; tr.debugFreeze(t + 0.5); const s2 = tr.state().filter((x) => x.track === 0 && x.cars === 4).sort((a, b) => Math.abs(a.head - tracks[0].stop) - Math.abs(b.head - tracks[0].stop))[0]; prof.push(`${(t - t0).toFixed(0)}s:${((s2.head - s.head) * 2 * 3.6).toFixed(0)}km/h@${(s.head - s.cars * 8.9 - tracks[0].stop).toFixed(0)}m`); }
  // update cost
  tr.debugFreeze(tr.dwellTime(0, 0) + 30); const q0 = performance.now(); for (let i = 0; i < 2000; i++) tr.update(); const perUpdateMs = (performance.now() - q0) / 2000;
  tr.debugFreeze(null);
  return { ...res, minGapM: +minGap.toFixed(1), minGapAt, maxStopErrM: +maxStopErr.toFixed(2), dwellSamples: dwellCount, maxTrainsOnMap: maxActive, trainsBySize: cars, maxCarCentreOffsetM: +maxCarOffset.toFixed(2), maxCarOffsetAt, speedAroundKJ17: prof.join(' '), perUpdateMs: +perUpdateMs.toFixed(4), drawCalls: w.renderer.info.render.calls };
});
console.log('analysis', JSON.stringify(A));

// animation runs; pause when hidden; toggle
const run = await page.evaluate(async () => { const tr = window.__mv.world.trains; const a = tr.clock; await new Promise((r) => setTimeout(r, 1000)); const b = tr.clock;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); await new Promise((r) => setTimeout(r, 600)); const c = tr.clock; await new Promise((r) => setTimeout(r, 600)); const d = tr.clock;
  delete document.hidden; return { advancedVisible: +(b - a).toFixed(2), advancedHidden: +(d - c).toFixed(3) }; });
console.log('clock', JSON.stringify(run));
await page.click('#btn-trains');
const tog = await page.evaluate(() => ({ visible: window.__mv.world.trains.group.visible, pressed: document.querySelector('#btn-trains').getAttribute('aria-pressed'), label: document.querySelector('#btn-trains').getAttribute('aria-label'), stored: localStorage.getItem('mv-trains') }));
await page.evaluate(() => window.__mv.goTo(7)); await sleep(300);
const tog2 = await page.evaluate(() => window.__mv.world.trains.group.visible);
console.log('toggle', JSON.stringify(tog), 'after chapter change visible:', tog2);
for (const l of ['zh', 'ms']) { await page.evaluate((l) => window.__mv.setLang(l), l); await sleep(200); console.log('label', l, await page.evaluate(() => document.querySelector('#btn-trains').getAttribute('aria-label'))); }
await page.close();

// reduced motion: static, one train standing at KJ17
const rmp = await open('reduced-motion', 'chapter=3&lang=en', { rm: true });
const rm = await rmp.evaluate(async () => { const tr = window.__mv.world.trains; const a = tr.state(); await new Promise((r) => setTimeout(r, 1200)); const b = tr.state(); return { same: JSON.stringify(a) === JSON.stringify(b), trains: b.map((x) => `${x.track}/${x.cars}car/${x.speedHint}`) }; });
console.log('reduced motion', JSON.stringify(rm));
await rmp.close();

// ---------- screenshots ----------
async function shot(name, q, setup, opts = {}) {
  const p = await open(name, q, opts);
  if (setup) await p.evaluate(setup);
  await sleep(2600);
  const picked = await p.evaluate(() => window.__picked ? { t: window.__picked.t, cars: window.__picked.train.cars, state: window.__picked.train.speedHint, track: window.__picked.train.track, head: Math.round(window.__picked.train.head) } : null); if (picked) console.log('shot', name, JSON.stringify(picked));
  await p.screenshot({ path: `shots-v4/${name}.png` });
  await p.close();
}
// camera on a train: side-on three-quarter view
const focusTrain = (sel) => {
  const w = window.__mv.world; const tr = w.trains; const tracks = w.lrtTracks; w.controls.minDistance = 40;
  const pick = (t) => { tr.debugFreeze(t); return tr.state().find((x) => x.track === sel.track && x.cars === sel.cars && (sel.state ? x.speedHint === sel.state : true) && (x.tail > tracks[x.track].inStart + 40) && (x.head < tracks[x.track].inEnd - 40) && (sel.near == null || Math.abs((x.head + x.tail) / 2 - (tracks[x.track].inStart + sel.near)) < 60)); };
  let t = sel.t ?? 2000; let x = pick(t); for (let i = 0; !x && i < 4000; i++) { t += 0.5; x = pick(t); }
  const tk = tracks[x.track]; const s = Math.round((x.head + x.tail) / 2);
  const dx = tk.x[s + 5] - tk.x[s - 5], dz = tk.z[s + 5] - tk.z[s - 5]; const L = Math.hypot(dx, dz);
  let ox = -dz / L, oz = dx / L; const a = (sel.side ?? 1) * 1, c = Math.cos(0.55), sn = Math.sin(0.55); [ox, oz] = [a * (ox * c - oz * sn * a), a * (oz * c + ox * sn * a)];
  w.flyTo({ target: [tk.x[s], tk.y[s] + 2, tk.z[s]], azimuth: Math.atan2(ox, oz), polar: sel.polar ?? 1.05, distance: sel.dist ?? 150 }, true);
  window.__picked = { t, train: x };
};
const mapOnly = JSON.stringify({ tp: true, sp: true });
await shot('trains-4car-viaduct', 'chapter=3&lang=en', `(${focusTrain})({ track: 0, cars: 4, state: 'cruise', near: ${A.curves[0].at}, dist: 170 })`, { panels: mapOnly });
await shot('trains-2car-viaduct', 'chapter=3&lang=en', `(${focusTrain})({ track: 1, cars: 2, state: 'cruise', near: ${A.curves[1].at}, dist: 120, side: -1 })`, { panels: mapOnly });
await shot('trains-kj17-station-stop', 'chapter=3&lang=en', `(${focusTrain})({ track: 0, cars: 4, state: 'dwell', dist: 190, polar: 0.95 })`, { panels: mapOnly });
await shot('trains-kj17-station-stop-dark', 'chapter=3&lang=en&theme=dark', `(${focusTrain})({ track: 0, cars: 4, state: 'dwell', dist: 190, polar: 0.95 })`, { panels: mapOnly });
const ctx = `(() => { const w = window.__mv.world; w.trains.debugFreeze(w.trains.dwellTime(0, 0) + 8); })()`;
const mid = `(() => { const w = window.__mv.world; w.trains.debugFreeze(w.trains.dwellTime(0, 0) + 6); w.flyTo({ target: [-330, 10, -60], azimuth: -1.25, polar: 0.9, distance: 620 }, true); })()`;
await shot('trains-context', 'chapter=3&lang=en', mid, { panels: mapOnly });
await shot('trains-context-dark', 'chapter=3&lang=en&theme=dark', mid, { panels: mapOnly });
await shot('mosque-jamek-close', 'chapter=1&lang=en', `(() => { const w = window.__mv.world; w.controls.minDistance = 40; w.flyTo({ target: [-109, 0, -307], azimuth: 0.2, polar: 0.8, distance: 380 }, true); })()`, { panels: mapOnly });
await shot('mosque-annur-close', 'chapter=1&lang=en', `(() => { const w = window.__mv.world; w.controls.minDistance = 40; w.flyTo({ target: [-480, 0, -40], azimuth: 0.2, polar: 0.8, distance: 380 }, true); })()`, { panels: mapOnly });
await shot('trains-overview-context', 'chapter=0&lang=en', ctx);
await shot('trains-overview-context-dark', 'chapter=0&lang=en&theme=dark', ctx);
await shot('trains-location-context-map-only', 'chapter=3&lang=en', ctx, { panels: mapOnly });
await shot('01-landmarks-mosques', 'chapter=1&lang=en', ctx);
await shot('01-landmarks-mosques-zh', 'chapter=1&lang=zh', ctx);
await shot('01-landmarks-mosques-ms-dark', 'chapter=1&lang=ms&theme=dark', ctx);
// mosque pins: on screen and not hidden under a panel?
const mp = await open('mosque-pins', 'chapter=1&lang=en'); await sleep(1500);
console.log('mosque pins', JSON.stringify(await mp.evaluate(() => [...document.querySelectorAll('.pin')].filter((p) => /Masjid/.test(p.textContent)).map((p) => ({ text: p.querySelector('.t').textContent, occluded: p.classList.contains('occluded'), opacity: getComputedStyle(p).opacity, rect: (() => { const r = p.querySelector('.tag').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; })() })))));
await mp.close();

await browser.close();
console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (trains check).');
