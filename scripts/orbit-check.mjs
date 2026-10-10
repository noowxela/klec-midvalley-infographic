// 00 turntable check: the bearing advances on 00 (about 360° / 75 s), Reset view never appears by itself, the orbit
// pauses while the mouse is held and resumes a few seconds after release, stops on 01 (camera stays put after the
// flight), pauses while the tab is hidden, and does not run under prefers-reduced-motion. Compass follows the bearing;
// trains keep moving. Two 00 screenshots a few seconds apart -> shots-orbit/.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/orbit-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots-orbit', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = []; const bad = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(name, q, { rm = false } = {}) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, ...(rm ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [])]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('mv-panels'); } catch { /* opaque frames */ } });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  await sleep(2500);
  return page;
}
const st = (p) => p.evaluate(() => {
  const w = window.__mv.world; const v = w.currentView(); const b = document.getElementById('btn-reset');
  const n = document.getElementById('north-needle'); const tr = w.trains?.debugState?.() ?? null;
  return { az: v.azimuth, polar: v.polar, dist: v.distance, reset: !b.classList.contains('is-hidden'), needle: n.getAttribute('transform') || getComputedStyle(n).transform, north: w.northAngle(), active: w.turntableActive(), trainClock: w.trains?.clock ?? null, tr };
});
const dAz = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const RATE = (2 * Math.PI) / 75;
// 1. 00: advances at ~RATE, pitch / distance unchanged, Reset hidden, compass follows, screenshots
{
  const p = await open('orbit-00', 'chapter=0&lang=en');
  const a = await st(p); await p.screenshot({ path: 'shots-orbit/v15-00-orbit-a.png' });
  const t0 = Date.now(); await sleep(4000);
  const b = await st(p); const dt = (Date.now() - t0) / 1000; await p.screenshot({ path: 'shots-orbit/v15-00-orbit-b.png' });
  const rate = dAz(a.az, b.az) / Math.max(dt, b.trainClock - a.trainClock); // train clock = real frame time between the two reads
  console.log('00 advance', JSON.stringify({ dAzDeg: +(dAz(a.az, b.az) * 180 / Math.PI).toFixed(1), secs: +dt.toFixed(1), periodS: +(2 * Math.PI / rate).toFixed(1), dPolar: +(b.polar - a.polar).toFixed(4), dDist: +(b.dist - a.dist).toFixed(1), reset: [a.reset, b.reset], north: [+a.north.toFixed(3), +b.north.toFixed(3)], active: b.active, trainsAdvancedS: +(b.trainClock - a.trainClock).toFixed(1) }));
  if (!(rate > RATE * 0.6 && rate < RATE * 1.6)) bad.push(`00 rate ${rate}`);
  if (Math.abs(b.polar - a.polar) > 0.002 || Math.abs(b.dist - a.dist) > 2) bad.push('00 pitch/distance drift');
  if (a.reset || b.reset) bad.push('00 reset shown by the orbit');
  if (Math.abs(dAz(a.north, b.north)) < 0.1) bad.push('compass did not rotate with the orbit');
  if (!(b.trainClock - a.trainClock > dt * 0.7)) bad.push(`trains not running during the orbit (${a.trainClock} -> ${b.trainClock})`);
  // pause while the mouse is held down (no movement), resume ~3 s after release
  const x = 1300, y = 540; await p.mouse.move(x, y); await p.mouse.down(); await sleep(300);
  const h1 = await st(p); await sleep(1200); const h2 = await st(p); await p.mouse.up();
  await sleep(1500); const r1 = await st(p); await sleep(3000); const r2 = await st(p); await sleep(1000); const r3 = await st(p);
  console.log('00 hold/resume', JSON.stringify({ heldDeg: +(dAz(h1.az, h2.az) * 180 / Math.PI).toFixed(2), activeHeld: h2.active, activeAfter1_5s: r1.active, activeAfter4_5s: r2.active, resumedDeg: +(dAz(r2.az, r3.az) * 180 / Math.PI).toFixed(2), reset: [h2.reset, r3.reset] }));
  if (Math.abs(dAz(h1.az, h2.az)) > 0.01 || h2.active) bad.push('orbit did not pause while held');
  if (r1.active) bad.push('orbit resumed too early');
  if (!r2.active || dAz(r2.az, r3.az) < RATE * 0.5) bad.push('orbit did not resume');
  if (h2.reset || r3.reset) bad.push('reset shown without a pitch/zoom/target change');
  // wheel zoom pauses too, and does count as a change (Reset shows)
  await p.mouse.move(x, y); await p.mouse.wheel({ deltaY: -400 }); await sleep(800); const z = await st(p);
  console.log('00 zoom', JSON.stringify({ active: z.active, reset: z.reset }));
  if (z.active) bad.push('orbit not paused after zoom'); if (!z.reset) bad.push('reset not shown after zoom on 00');
  // hidden tab: pause
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
  const v1 = await st(p); await sleep(5000); const v2 = await st(p);
  console.log('00 hidden', JSON.stringify({ active: v2.active, dDeg: +(dAz(v1.az, v2.az) * 180 / Math.PI).toFixed(2) }));
  if (v2.active || Math.abs(dAz(v1.az, v2.az)) > 0.01) bad.push('orbit ran while hidden');
  await p.evaluate(() => { delete document.hidden; });
  // leaving 00: flight to 01 lands and the bearing then stays put
  const before = await st(p); await p.click('#chapter-tabs .tab:nth-child(2)'); await sleep(300); // a real (animated) chapter change
  const f = await p.evaluate(() => window.__mv.world.isFlying());
  await sleep(2600); const s1 = await st(p); await sleep(2500); const s2 = await st(p);
  console.log('01 after leaving 00', JSON.stringify({ flyingAtStart: f, flightFromDeg: +(before.az * 180 / Math.PI).toFixed(1), landedDeg: +(s2.az * 180 / Math.PI).toFixed(1), dDeg: +(dAz(s1.az, s2.az) * 180 / Math.PI).toFixed(3), active: s2.active, reset: s2.reset }));
  if (!f) bad.push('no flight to 01'); if (Math.abs(dAz(s1.az, s2.az)) > 0.002 || s2.active) bad.push('orbit still running on 01'); if (s2.reset) bad.push('reset shown on 01 after flight');
  // back to 00: orbit restarts after the flight, from the preset bearing
  await p.click('#chapter-tabs .tab:nth-child(1)'); await sleep(2600); const g1 = await st(p); await sleep(2000); const g2 = await st(p);
  console.log('back to 00', JSON.stringify({ startDeg: +(g1.az * 180 / Math.PI).toFixed(1), advDeg: +(dAz(g1.az, g2.az) * 180 / Math.PI).toFixed(2) }));
  if (dAz(g1.az, g2.az) < RATE * 0.5) bad.push('orbit did not restart on 00');
  await p.close();
}
// 2. reduced motion: no orbit on 00
{
  const p = await open('orbit-00-rm', 'chapter=0&lang=en', { rm: true });
  const a = await st(p); await sleep(3000); const b = await st(p);
  console.log('00 reduced motion', JSON.stringify({ dDeg: +(dAz(a.az, b.az) * 180 / Math.PI).toFixed(3), active: b.active }));
  if (Math.abs(dAz(a.az, b.az)) > 0.001 || b.active) bad.push('orbit ran under reduced motion');
  await p.close();
}
await browser.close();
if (bad.length) { console.log('BAD', bad.join(' | ')); process.exitCode = 1; } else console.log('orbit OK (advances on 00, pauses on hold / zoom / hidden, resumes, stops on 01, no Reset by itself, off under reduced motion)');
console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (orbit check).');
process.exit(process.exitCode ?? 0);
