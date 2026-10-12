// v4 checks for the animated LRT trains (track following, station stop, spacing, toggle,
// reduced motion, pause) plus the v4 screenshots (trains close-ups, KJ17 stop, overview + mosques).
// KTM Komuter trains (both lines): 5/6-car sets, on the KTM tracks, stops at KB01 / KD01, spacing, speed profile,
// toggle / layer visibility, pause, reduced motion; screenshots shots-v4/ktm-*.png. Exits 1 on a KTM failure or console error.
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
await page.evaluate(() => window.__mv.goTo(5)); await sleep(300);
const tog2 = await page.evaluate(() => window.__mv.world.trains.group.visible);
console.log('toggle', JSON.stringify(tog), 'after chapter change visible:', tog2);
for (const l of ['zh', 'ms']) { await page.evaluate((l) => window.__mv.setLang(l), l); await sleep(200); console.log('label', l, await page.evaluate(() => document.querySelector('#btn-trains').getAttribute('aria-label'))); }
await page.close();

// reduced motion: static, one train standing at KJ17
const rmp = await open('reduced-motion', 'chapter=3&lang=en', { rm: true });
const rm = await rmp.evaluate(async () => { const tr = window.__mv.world.trains; const a = tr.state(); await new Promise((r) => setTimeout(r, 1200)); const b = tr.state(); return { same: JSON.stringify(a) === JSON.stringify(b), trains: b.map((x) => `${x.track}/${x.cars}car/${x.speedHint}`) }; });
console.log('reduced motion', JSON.stringify(rm));
await rmp.close();

// ---------- KTM Komuter trains ----------
const bad = [];
const kp = await open('ktm', 'chapter=3&lang=en');
const K = await kp.evaluate(() => {
  const w = window.__mv.world; const tr = w.ktmTrains; const tracks = w.ktmTracks; const lines = w.ktmTrackLine; const P = tr.spec;
  const st = { 1: [343.3, 85.5], 2: [-281.4, 95.4] }; // KB01 / KD01 (stations.json)
  const res = { spec: { carLen: P.carLen, carW: P.carW, carH: P.carH, floor: P.floor, vMax: P.vMax, accel: P.accel, decel: P.decel, dwell: P.dwell, headway: P.headway, pattern: P.pattern },
    tracks: tracks.map((t, k) => ({ line: lines[k], lengthInMap: t.inEnd - t.inStart, stopAt: t.stop - t.inStart, stopToStationM: +Math.hypot(t.x[t.stop] - st[lines[k]][0], -t.z[t.stop] - st[lines[k]][1]).toFixed(1), tunnelM: t.hide.reduce((a, b) => a + b, 0), deckMin: +Math.min(...t.y.slice(t.inStart, t.inEnd)).toFixed(2), deckMax: +Math.max(...t.y.slice(t.inStart, t.inEnd)).toFixed(2), deckAtStop: +t.y[t.stop].toFixed(2) })) };
  // nearest KTM track point (any track) and the track y there
  const nearest = (x, z) => { let b = Infinity, y = 0; for (const t of tracks) for (let i = 0; i < t.n; i++) { const d = Math.hypot(t.x[i] - x, t.z[i] - z); if (d < b) { b = d; y = t.y[i]; } } return { d: b, y }; };
  const inMap = (x) => x.head > tracks[x.track].inStart && x.tail < tracks[x.track].inEnd;
  let minGap = Infinity, maxStopErr = 0, maxOnMap = 0, maxOff = 0, maxDy = 0, carsSeen = {}, dwellByTrack = [0, 0, 0, 0], stopsByLine = { 1: 0, 2: 0 }, checkedCars = 0;
  const seen = new Set();
  for (let t = 1000; t < 2800; t += 0.5) {
    tr.debugFreeze(t); const s = tr.state(); maxOnMap = Math.max(maxOnMap, s.filter(inMap).length);
    for (let k = 0; k < tracks.length; k++) {
      const a = s.filter((x) => x.track === k).sort((p, q) => q.head - p.head);
      for (let i = 1; i < a.length; i++) minGap = Math.min(minGap, a[i - 1].tail - a[i].head);
      for (const x of a) if (x.speedHint === 'dwell') { dwellByTrack[k]++; maxStopErr = Math.max(maxStopErr, Math.abs((x.head + x.tail) / 2 - tracks[k].stop)); const key = `${k}:${Math.floor((t - tr.dwellTime(k, 0)) / P.headway + 0.5)}`; if (!seen.has('d' + key)) { seen.add('d' + key); stopsByLine[lines[k]]++; } }
      for (const x of a) carsSeen[x.cars] = (carsSeen[x.cars] || 0) + 1; // samples per train size
    }
    if (t % 5 === 0) {
      tr.update();
      for (const im of [tr.cab, tr.mid]) for (let i = 0; i < im.count; i++) { const e = im.instanceMatrix.array; const x = e[i * 16 + 12], y = e[i * 16 + 13], z = e[i * 16 + 14]; if (Math.abs(x) > 500 || Math.abs(z) > 500) continue; const n = nearest(x, z); checkedCars++; maxOff = Math.max(maxOff, n.d); maxDy = Math.max(maxDy, Math.abs(y - n.y)); }
    }
  }
  // speed / acceleration of one train through its stop (per 0.5 s)
  const k0 = 0; const t0 = tr.dwellTime(k0, 0) + 6 * P.headway - 60; let vMax = 0, aMax = 0, prevV = null; const prof = [];
  const headAt = (t) => { tr.debugFreeze(t); return tr.state().filter((x) => x.track === k0).sort((p, q) => Math.abs((p.head + p.tail) / 2 - tracks[k0].stop) - Math.abs((q.head + q.tail) / 2 - tracks[k0].stop))[0]?.head ?? null; };
  for (let t = t0; t <= t0 + 120; t += 0.5) { const h0 = headAt(t), h1 = headAt(t + 0.5); if (h0 == null || h1 == null || Math.abs(h1 - h0) > 50) { prevV = null; continue; } const v = (h1 - h0) / 0.5; vMax = Math.max(vMax, v); if (prevV != null) aMax = Math.max(aMax, Math.abs(v - prevV) / 0.5); prevV = v; if ((t - t0) % 10 === 0) prof.push(`${(t - t0).toFixed(0)}s:${(v * 3.6).toFixed(0)}km/h`); }
  tr.debugFreeze(tr.dwellTime(0, 0) + 40); const q0 = performance.now(); for (let i = 0; i < 2000; i++) tr.update(); const perUpdateMs = (performance.now() - q0) / 2000;
  tr.debugFreeze(null);
  return { ...res, minGapM: +minGap.toFixed(1), maxStopErrM: +maxStopErr.toFixed(2), dwellSamplesByTrack: dwellByTrack, stopsByLine, maxTrainsOnMap: maxOnMap, carsSeen, carsChecked: checkedCars, maxCarOffTrackM: +maxOff.toFixed(2), maxCarHeightOffM: +maxDy.toFixed(2), vMaxKmh: +(vMax * 3.6).toFixed(1), aMax: +aMax.toFixed(2), speedThroughStop: prof.join(' '), perUpdateMs: +perUpdateMs.toFixed(4), drawCalls: w.renderer.info.render.calls };
});
console.log('ktm analysis', JSON.stringify(K)); if (K.minGapM == null) console.log('ktm: never two trains on one track inside the extended track');
if (K.tracks.length !== 4 || K.tracks.filter((t) => t.line === 1).length !== 2) bad.push('KTM: expected 2 tracks per line');
for (const [k, t] of K.tracks.entries()) { if (t.stopToStationM > 15) bad.push(`KTM track ${k}: stop ${t.stopToStationM} m from its station`); if (t.deckAtStop > 1) bad.push(`KTM track ${k}: not at grade at the stop (${t.deckAtStop} m)`); }
if (!(K.minGapM == null || K.minGapM > 50)) bad.push(`KTM: trains too close on one track (min gap ${K.minGapM} m)`);
if (!(K.maxStopErrM < 1)) bad.push(`KTM: dwell position off the platform centre by ${K.maxStopErrM} m`);
if (K.dwellSamplesByTrack.some((n) => n === 0) || !(K.stopsByLine[1] > 0 && K.stopsByLine[2] > 0)) bad.push(`KTM: not every track stops (${JSON.stringify(K.dwellSamplesByTrack)})`);
if (!(K.carsSeen[5] > 0 && K.carsSeen[6] > 0) || Object.keys(K.carsSeen).some((c) => c !== '5' && c !== '6')) bad.push(`KTM: car counts ${JSON.stringify(K.carsSeen)}`);
if (!(K.maxTrainsOnMap >= 1 && K.maxTrainsOnMap <= 4)) bad.push(`KTM: ${K.maxTrainsOnMap} trains on the map at once`);
if (!(K.carsChecked > 100 && K.maxCarOffTrackM < 1.5 && K.maxCarHeightOffM < 0.3)) bad.push(`KTM: cars leave the track (off ${K.maxCarOffTrackM} m, dy ${K.maxCarHeightOffM} m, ${K.carsChecked} cars)`);
if (!(K.vMaxKmh <= K.spec.vMax * 3.6 + 0.5 && K.aMax <= Math.max(K.spec.accel, K.spec.decel) + 0.05)) bad.push(`KTM: speed ${K.vMaxKmh} km/h / accel ${K.aMax} m/s² beyond the profile`);
// moves in real time, pauses when hidden, toggle and chapter visibility
const kr = await kp.evaluate(async () => {
  const w = window.__mv.world; const tr = w.ktmTrains; const sig = () => JSON.stringify(tr.state().map((x) => [x.track, Math.round(x.head * 10)]));
  tr.time = tr.dwellTime(0, 0) + 10 * tr.spec.headway + 40; // a moment with trains departing
  const a = tr.clock, s1 = sig(); await new Promise((r) => setTimeout(r, 1500)); const b = tr.clock, s2 = sig();
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); await new Promise((r) => setTimeout(r, 400)); const c = tr.clock; await new Promise((r) => setTimeout(r, 600)); const d = tr.clock; delete document.hidden;
  return { advanced: +(b - a).toFixed(2), moved: s1 !== s2, advancedHidden: +(d - c).toFixed(3), visible: tr.group.visible, carsDrawn: tr.cab.count + tr.mid.count };
});
console.log('ktm clock', JSON.stringify(kr));
if (!(kr.advanced > 1 && kr.moved)) bad.push('KTM: trains do not move'); if (kr.advancedHidden !== 0) bad.push('KTM: clock runs while the tab is hidden'); if (!kr.visible) bad.push('KTM: trains hidden in 03');
await kp.click('#btn-trains');
const kt = await kp.evaluate(() => ({ ktm: window.__mv.world.ktmTrains.group.visible, lrt: window.__mv.world.trains.group.visible }));
await kp.click('#btn-trains');
const kt2 = await kp.evaluate(() => ({ ktm: window.__mv.world.ktmTrains.group.visible, lrt: window.__mv.world.trains.group.visible }));
await kp.evaluate(() => window.__mv.goTo(2)); await sleep(400);
const k02 = await kp.evaluate(() => { const w = window.__mv.world; const on = w.ktmTrains.group.visible; w.setMode({ rails: { ...w.mode.rails, ktm: 'hidden' } }); const off = w.ktmTrains.group.visible; w.setMode({ rails: { ...w.mode.rails, ktm: 'highlight' } }); return { on, offWhenKtmHidden: !off, lrtStill: w.trains.group.visible }; });
console.log('ktm toggle', JSON.stringify({ off: kt, on: kt2, ch02: k02 }));
if (kt.ktm || kt.lrt || !kt2.ktm || !kt2.lrt) bad.push('KTM: trains toggle does not switch the KTM trains'); if (!k02.on || !k02.offWhenKtmHidden || !k02.lrtStill) bad.push('KTM: visibility does not follow the KTM layer');
await kp.close();
// reduced motion: static, one train standing at each KTM station
const krm = await open('ktm-reduced-motion', 'chapter=3&lang=en', { rm: true });
const krmR = await krm.evaluate(async () => { const tr = window.__mv.world.ktmTrains; const tracks = window.__mv.world.ktmTracks; const lines = window.__mv.world.ktmTrackLine; const a = JSON.stringify(tr.state()); await new Promise((r) => setTimeout(r, 1200)); const s = tr.state(); return { same: a === JSON.stringify(s), atStations: s.filter((x) => x.speedHint === 'dwell').map((x) => `line ${lines[x.track]} track ${x.track} ${x.cars}car`), onMap: s.filter((x) => x.head > tracks[x.track].inStart && x.tail < tracks[x.track].inEnd).length }; });
console.log('ktm reduced motion', JSON.stringify(krmR));
if (!krmR.same) bad.push('KTM: trains move under reduced motion'); if (!(krmR.atStations.some((x) => x.startsWith('line 1')) && krmR.atStations.some((x) => x.startsWith('line 2')))) bad.push('KTM: reduced motion does not show a train at each station');
await krm.close();

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

// KTM screenshots: close-up at Mid Valley (KB01), 02 Transit hub with LRT + KTM trains, mobile 390×844
const focusKtm = (sel) => {
  const w = window.__mv.world; const tr = w.ktmTrains; const tracks = w.ktmTracks; w.controls.minDistance = 30; w.controls.maxPolarAngle = 1.45;
  const pick = (t) => { tr.debugFreeze(t); return tr.state().find((x) => x.track === sel.track && (sel.state ? x.speedHint === sel.state : true) && (sel.dStop == null || Math.abs((x.head + x.tail) / 2 - tracks[x.track].stop - sel.dStop) < 4)); };
  let t = sel.t ?? 1000; let x = pick(t); for (let i = 0; !x && i < 8000; i++) { t += 0.25; x = pick(t); }
  const tk = tracks[x.track]; const s = Math.round((x.head + x.tail) / 2 + (sel.shift ?? 0));
  const dx = tk.x[s + 5] - tk.x[s - 5], dz = tk.z[s + 5] - tk.z[s - 5]; const L = Math.hypot(dx, dz);
  let ox = (-dz / L) * (sel.side ?? 1), oz = (dx / L) * (sel.side ?? 1); const a = sel.yaw ?? 0.6; [ox, oz] = [ox * Math.cos(a) - oz * Math.sin(a), oz * Math.cos(a) + ox * Math.sin(a)];
  w.flyTo({ target: [tk.x[s], tk.y[s] + 2, tk.z[s]], azimuth: Math.atan2(ox, oz), polar: sel.polar ?? 1.2, distance: sel.dist ?? 160 }, true);
  window.__picked = { t, train: x };
};
// a moment with KTM trains out in the open on both lines, where the 02 view sees them (Line 2 south of the towers,
// Line 1 clear of the Mid Valley roof and the tunnel), and an LRT train standing at KJ17
const bothLines = `(() => { const w = window.__mv.world; const k = w.ktmTrains, tk = w.ktmTracks, ln = w.ktmTrackLine; let best = 0, bt = 0;
  const open = (x) => { const t = tk[x.track]; const c = Math.round((x.head + x.tail) / 2); if (x.tail < t.inStart + 20 || x.head > t.inEnd - 20 || t.hide[c]) return false; const n = -t.z[c]; return ln[x.track] === 2 ? n < -120 : (n > 200 || n < -200); };
  for (let t = 1000; t < 1360; t += 1) { k.debugFreeze(t); const s = k.state().filter(open);
    const l = new Set(s.map((x) => ln[x.track])); const sc = l.size * 10 + s.length; if (sc > best) { best = sc; bt = t; } }
  k.debugFreeze(bt); w.trains.debugFreeze(w.trains.dwellTime(0, 0) + 8); window.__picked = { t: bt, train: { cars: 0, speedHint: 'scene', track: -1, head: 0 } }; })()`;
await shot('ktm-mid-valley-close', 'chapter=3&lang=en&theme=light', `(${focusKtm})({ track: 0, state: 'braking', dStop: -70, shift: 10, polar: 1.25, dist: 140, yaw: -0.8, side: -1 })`, { panels: mapOnly });
await shot('ktm-kd01-close', 'chapter=3&lang=en&theme=light', `(${focusKtm})({ track: 2, state: 'accel', dStop: 110, polar: 1.15, dist: 200, yaw: 0.6 })`, { panels: mapOnly });
await shot('ktm-02-transit-hub', 'chapter=2&lang=en&theme=light', bothLines);
await shot('ktm-02-transit-hub-dark', 'chapter=2&lang=en&theme=dark', bothLines);
{
  const p = await browser.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[ktm-mobile] console.${m.type()}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[ktm-mobile] pageerror: ${e.message}`));
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await p.evaluateOnNewDocument(() => { try { localStorage.removeItem('mv-panels'); localStorage.removeItem('mv-trains'); } catch { /* about:blank */ } });
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(`${base}?skipLoader=1&chapter=2&lang=en&theme=light`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  await p.evaluate(bothLines); await sleep(2600);
  console.log('ktm mobile', JSON.stringify(await p.evaluate(() => ({ mobile: document.documentElement.classList.contains('mobile'), ktmVisible: window.__mv.world.ktmTrains.group.visible, carsDrawn: window.__mv.world.ktmTrains.cab.count + window.__mv.world.ktmTrains.mid.count, t: window.__picked.t }))));
  await p.screenshot({ path: 'shots-v4/ktm-mobile-390x844.png' }); await p.close();
}

await browser.close();
console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (trains check).');
console.log(bad.length ? `KTM FAIL:\n${bad.join('\n')}` : 'KTM trains OK');
if (bad.length || errors.length) process.exitCode = 1;
