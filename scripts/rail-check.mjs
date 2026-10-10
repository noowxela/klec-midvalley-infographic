// Rail colours / station codes check: official KVITS colours on CSS vars, station pins and badges;
// screenshots of 00 Overview, 01 Transit hub (+ 02 Location for the KD01/KB01 pins and badges) to shots-rail/.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/rail-check.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots-rail', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = []; const bad = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// official colours (Wikipedia, Klang Valley Integrated Transit System, "System network" table)
const OFFICIAL = { '--c-lrt': 'rgb(224, 17, 95)', '--c-ktm1': 'rgb(60, 90, 159)', '--c-ktm2': 'rgb(220, 36, 32)' };
const PIN = { KJ17: OFFICIAL['--c-lrt'], KD01: OFFICIAL['--c-ktm2'], KB01: OFFICIAL['--c-ktm1'] };
async function open(name, q, { w = 1920, h = 1080, dark = false } = {}) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.evaluateOnNewDocument(() => localStorage.removeItem('mv-panels'));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  await sleep(2600); // camera flight
  return page;
}
const probe = () => {
  const rgb = (c) => { const d = document.createElement('div'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
  const vars = Object.fromEntries(['--c-lrt', '--c-ktm1', '--c-ktm2', '--train-accent'].map((k) => [k, rgb(`var(${k})`)]));
  const pins = [...document.querySelectorAll('.pin.station')].map((p) => ({ t: p.querySelector('.t').textContent, v: p.querySelector('.v')?.textContent ?? '', bg: getComputedStyle(p.querySelector('.tag')).backgroundColor, r: getComputedStyle(p.querySelector('.tag')).borderRadius, fw: getComputedStyle(p.querySelector('.t')).fontWeight }));
  const badges = [...document.querySelectorAll('.station-list .badge')].map((b) => ({ code: b.textContent, bg: getComputedStyle(b).backgroundColor, fw: getComputedStyle(b).fontWeight, r: getComputedStyle(b).borderRadius, c: getComputedStyle(b).color }));
  const legend = [...document.querySelectorAll('.legend-row')].map((r) => [r.textContent, getComputedStyle(r.querySelector('.swatch')).backgroundColor]);
  return { vars, pins, badges, legend };
};
const check = (name, s) => {
  for (const [k, v] of Object.entries(OFFICIAL)) if (s.vars[k] !== v) bad.push(`${name} ${k}=${s.vars[k]}`);
  if (s.vars['--train-accent'] !== OFFICIAL['--c-lrt']) bad.push(`${name} train-accent`);
  for (const p of s.pins) { const code = Object.keys(PIN).find((c) => `${p.t} ${p.v}`.includes(c)); if (!code) bad.push(`${name} pin without code: ${p.t}`); else if (p.bg !== PIN[code]) bad.push(`${name} pin ${code} ${p.bg}`); }
  for (const b of s.badges) { if (PIN[b.code] && b.bg !== PIN[b.code]) bad.push(`${name} badge ${b.code} ${b.bg}`); if (b.code === '—') bad.push(`${name} badge without code`); }
};
for (const [name, q, opt] of [
  ['00-overview-en', 'chapter=0&lang=en', {}],
  ['01-transit-hub-en', 'chapter=1&lang=en', {}],
  ['02-location-en', 'chapter=2&lang=en', {}],
  ['01-transit-hub-en-dark', 'chapter=1&lang=en', { dark: true }],
  ['02-location-zh-dark', 'chapter=2&lang=zh', { dark: true }],
]) {
  const p = await open(name, q, opt);
  const s = await p.evaluate(probe); check(name, s);
  console.log(name, JSON.stringify(s));
  await p.screenshot({ path: `shots-rail/rail-${name}.png` });
  await p.close();
}
await browser.close();
if (bad.length) { console.log('BAD', bad.join(' | ')); process.exitCode = 1; } else console.log('rail OK (official colours on vars, pins, badges, train accent)');
console.log(errors.length ? errors.join('\n') : 'No console errors or warnings (rail check).');
