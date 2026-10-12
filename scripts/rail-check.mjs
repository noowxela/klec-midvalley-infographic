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
const OFFICIAL = { '--c-lrt': 'rgb(224, 17, 95)', '--c-ktm1': 'rgb(60, 90, 159)', '--c-ktm2': 'rgb(220, 36, 32)', '--c-klia-transit': 'rgb(51, 168, 181)', '--c-skypark': 'rgb(139, 69, 19)' }; // 7 KLIA Transit, 10 Skypark (Wikipedia Module:Adjacent stations/KLRT)
// Mid Valley (official KB01) is shown publicly as 'KTM · 10' (stop 10 from Batu Caves) and Abdullah Hukum KTM (KD01) as
// 'KTM · 16' (stop 16 from Tanjung Malim); KB01 / KD01 may appear only in a .source note
const PIN = { KJ17: OFFICIAL['--c-lrt'], 'KTM · 16': OFFICIAL['--c-ktm2'], 'KTM · 10': OFFICIAL['--c-ktm1'] };
const BADGE = { KJ17: OFFICIAL['--c-lrt'], 16: OFFICIAL['--c-ktm2'], 10: OFFICIAL['--c-ktm1'] };
const PILL = { 1: OFFICIAL['--c-ktm1'], 2: OFFICIAL['--c-ktm2'], 5: OFFICIAL['--c-lrt'], 7: OFFICIAL['--c-klia-transit'], 10: OFFICIAL['--c-skypark'] };
async function open(name, q, { w = 1920, h = 1080, dark = false, dpr = 1 } = {}) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.evaluateOnNewDocument(() => localStorage.removeItem('mv-panels'));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
  await page.goto(`${base}?skipLoader=1&${q}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.revealed === true, { timeout: 20000 });
  await sleep(2600); // camera flight
  return page;
}
const probe = () => {
  const rgb = (c) => { const d = document.createElement('div'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
  const vars = Object.fromEntries(['--c-lrt', '--c-ktm1', '--c-ktm2', '--c-klia-transit', '--c-skypark', '--train-accent'].map((k) => [k, rgb(`var(${k})`)]));
  const pins = [...document.querySelectorAll('.pin.station')].map((p) => ({ t: p.querySelector('.t').textContent, v: p.querySelector('.v')?.textContent ?? '', bg: getComputedStyle(p.querySelector('.tag')).backgroundColor, r: getComputedStyle(p.querySelector('.tag')).borderRadius, fw: getComputedStyle(p.querySelector('.t')).fontWeight }));
  const badges = [...document.querySelectorAll('.station-list .badge')].map((b) => ({ code: b.textContent, bg: getComputedStyle(b).backgroundColor, fw: getComputedStyle(b).fontWeight, r: getComputedStyle(b).borderRadius, c: getComputedStyle(b).color }));
  const legend = [...document.querySelectorAll('.legend-row')].map((r) => { const sw = r.querySelector('.swatch'), lp = r.querySelector('.line-pill .lp-bg'); return [r.textContent, sw ? getComputedStyle(sw).backgroundColor : lp ? `pill ${getComputedStyle(lp).fill}` : null]; });
  // label overlap: visible pin tags against each other and against the open panels / top bar / bottom rail
  const R = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const vis = [...document.querySelectorAll('.pin')].filter((p) => !p.classList.contains('hidden') && !p.classList.contains('occluded'));
  const txt = (e) => (e ? [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('') : '');
  const tags = vis.map((p) => ({ t: `${txt(p.querySelector('.t'))} ${txt(p.querySelector('.v'))}`.trim(), r: R(p.querySelector('.tag')) }));
  const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const overlaps = [];
  for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) if (hit(tags[i].r, tags[j].r)) overlaps.push(`${tags[i].t} x ${tags[j].t}`);
  for (const sel of ['.text-panel', '.side-panel', '.bottom-bar', '.top-bar', 'header']) for (const e of document.querySelectorAll(sel)) { const r = R(e); if (r[2] - r[0] < 1 || getComputedStyle(e).visibility === 'hidden') continue; for (const t of tags) if (hit(t.r, r)) overlaps.push(`${t.t} x ${sel}`); }
  const pills = [...document.querySelectorAll('svg.line-pill')].map((s) => ({ n: s.querySelector('text').textContent, aria: s.getAttribute('aria-label'), suspended: s.classList.contains('suspended'), role: s.getAttribute('role'), fill: getComputedStyle(s.querySelector('.lp-bg')).fill, where: s.closest('.pin') ? 'pin' : s.closest('.legend-row') ? 'legend' : s.closest('.station-list') ? 'stations' : s.closest('.toggle') ? 'toggle' : 'other' }));
  // user-facing KB01 outside source notes (aria labels and titles included)
  const kb = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) if (/KB01|KD01/.test(n.textContent) && !n.parentElement.closest('.source, script, style')) kb.push(n.parentElement.className || n.parentElement.tagName);
  for (const e of document.querySelectorAll('[aria-label], [title], [alt]')) for (const a of ['aria-label', 'title', 'alt']) if (/KB01|KD01/.test(e.getAttribute(a) || '')) kb.push(`${a}@${e.tagName}`);
  const hint = document.querySelector('#text-panel .hint')?.textContent ?? null;
  const tp = document.querySelector('#text-panel').getBoundingClientRect(), bar = document.querySelector('.bottom-bar').getBoundingClientRect(), sp = document.querySelector('#side-panel');
  const fit = { textBottom: Math.round(tp.bottom), barTop: Math.round(bar.top), sideScroll: sp.scrollHeight > sp.clientHeight + 1 };
  const side = { n: document.getElementById('side-panel').childElementCount, toggle: getComputedStyle(document.getElementById('sp-toggle')).display };
  const mvc = []; { const w = document.createTreeWalker(document.getElementById('stage'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.parentElement.closest('.source')) continue; if (/Mid Valley City/.test(n.textContent) && n.parentElement.getClientRects().length) mvc.push(n.textContent.trim().slice(0, 80)); } }
  return { mvc, side, vars, pins, badges, legend, tags: tags.map((t) => t.t), overlaps, pills, kb, hint, fit, chapter: window.__mv?.current ?? null };
};
const check = (name, s) => {
  for (const [k, v] of Object.entries(OFFICIAL)) if (s.vars[k] !== v) bad.push(`${name} ${k}=${s.vars[k]}`);
  if (s.vars['--train-accent'] !== OFFICIAL['--c-lrt']) bad.push(`${name} train-accent`);
  for (const p of s.pins) { const code = Object.keys(PIN).find((c) => `${p.t} ${p.v}`.includes(c)); if (!code) bad.push(`${name} pin without code: ${p.t}`); else if (p.bg !== PIN[code]) bad.push(`${name} pin ${code} ${p.bg}`); }
  if (s.overlaps.length) bad.push(`${name} label overlap: ${s.overlaps.join('; ')}`);
  for (const pl of s.pills) { if (!pl.aria || pl.role !== 'img') bad.push(`${name} pill ${pl.n} without aria`); if (pl.fill !== PILL[pl.n]) bad.push(`${name} pill ${pl.n} fill ${pl.fill}`); }
  // keyboard hint lives on 00 Overview (the first page) only
  if (/^00-/.test(name) !== !!s.hint) bad.push(`${name} hint ${s.hint ? 'present' : 'missing'}`);
  if (s.fit.textBottom > s.fit.barTop - 8) bad.push(`${name} text panel overflows (${s.fit.textBottom} vs bar ${s.fit.barTop})`);
  if (s.kb.length) bad.push(`${name} user-facing KB01/KD01: ${s.kb.join(', ')}`);
  // legends: KD / KB line letters are fine only with our station's stop number (KD · 16, KB · 10)
  for (const [t] of s.legend) if (/\bK[BD]\b(?! · \d)/.test(t)) bad.push(`${name} legend line letters without stop number: ${t}`);
  if (/^02-/.test(name)) for (const c of ['KD · 16', 'KB · 10']) if (!s.legend.some(([t]) => t.includes(c))) bad.push(`${name} legend missing ${c}`);
  // 01 Landmarks: the Mid Valley Megamall label is shown; no 'Mid Valley City' landmark label
  if (/^00-/.test(name) && (s.side.n || s.side.toggle !== 'none')) bad.push(`${name} side panel on 00 (${JSON.stringify(s.side)})`);
  if (/^01-/.test(name)) { const mm = s.tags.filter((t) => /^(Mid Valley Megamall|谷中城购物广场)/.test(t)); if (mm.length !== 1) bad.push(`${name} Mid Valley Megamall labels: ${mm.length} (want exactly 1)`); }
  // no 'Mid Valley City' wording anywhere on screen outside source notes (v16)
  if (s.mvc.length) bad.push(`${name} Mid Valley City on screen: ${s.mvc.join(' | ')}`);
  // 02: KLIA Transit (7) and the suspended Skypark Line (10): legend rows with pills, on-map labels, suspended mark
  if (/^02-/.test(name)) {
    for (const n of ['7', '10']) if (!s.legend.some(([, c]) => c === `pill ${PILL[n]}`) || !s.pills.some((pl) => pl.n === n)) bad.push(`${name} no line ${n} pill`);
    if (s.pills.some((pl) => pl.n === '10' && !pl.suspended)) bad.push(`${name} line 10 pill not marked suspended`);
    if (!s.legend.some(([t]) => /KLIA Transit|吉隆坡机场支线/.test(t))) bad.push(`${name} legend missing KLIA Transit`);
    if (!s.legend.some(([t]) => /Skypark|天空花园线/.test(t) && /suspended|暂停|digantung/.test(t))) bad.push(`${name} legend missing suspended Skypark`);
    if (!s.tags.some((t) => /KLIA Transit|吉隆坡机场支线/.test(t))) bad.push(`${name} no visible KLIA Transit label`);
    if (!s.tags.some((t) => /Skypark|天空花园线/.test(t))) bad.push(`${name} no visible Skypark label`);
  }
  if (/^02-/.test(name)) for (const c of ['KJ17', 'KTM · 16', 'KTM · 10']) if (!s.tags.some((t) => t.includes(c))) bad.push(`${name} no visible ${c} label`);
  for (const b of s.badges) { if (BADGE[b.code] && b.bg !== BADGE[b.code]) bad.push(`${name} badge ${b.code} ${b.bg}`); if (b.code === '—') bad.push(`${name} badge without code`); }
};
for (const [name, q, opt] of [
  ['00-overview-en', 'chapter=0&lang=en', {}],
  ['00-overview-zh', 'chapter=0&lang=zh', {}],
  ['00-overview-ms', 'chapter=0&lang=ms', {}],
  ['00-overview-zh-1440x900', 'chapter=0&lang=zh', { w: 1440, h: 900 }],
  ['00-overview-ms-1440x900-dark', 'chapter=0&lang=ms', { w: 1440, h: 900, dark: true }],
  ['01-landmarks-en', 'chapter=1&lang=en', {}],
  ['01-landmarks-zh', 'chapter=1&lang=zh', {}],
  ['01-landmarks-ms', 'chapter=1&lang=ms', {}],
  ['01-landmarks-ms-1440x900', 'chapter=1&lang=ms', { w: 1440, h: 900 }],
  ['02-transit-hub-en', 'chapter=2&lang=en', {}],
  ['03-location-en', 'chapter=3&lang=en', {}],
  ['02-transit-hub-zh', 'chapter=2&lang=zh', {}],
  ['02-transit-hub-ms', 'chapter=2&lang=ms', {}],
  ['02-transit-hub-en-1440x900', 'chapter=2&lang=en', { w: 1440, h: 900 }],
  ['02-transit-hub-en-dark', 'chapter=2&lang=en', { dark: true }],
  ['03-location-zh-dark', 'chapter=3&lang=zh', { dark: true }],
]) {
  const p = await open(name, q, opt);
  const s = await p.evaluate(probe); check(name, s);
  console.log(name, JSON.stringify(s));
  await p.screenshot({ path: `shots-rail/rail-${name}.png` });
  await p.close();
}
// pill close-ups: map labels + legend (01, 3x) and the station list (02, 3x), light and dark
for (const [name, q, dark] of [['02-en', 'chapter=2&lang=en', false], ['02-en-dark', 'chapter=2&lang=en', true], ['03-en', 'chapter=3&lang=en', false]]) {
  const p = await open(`crop-${name}`, q, { dpr: 3, dark });
  const boxes = await p.evaluate(() => [...document.querySelectorAll('.pin.station .tag, .side-panel .legend-row, .station-list li, .toggle')].filter((e) => e.querySelector('svg.line-pill')).map((e) => { const r = e.getBoundingClientRect(); return { x: r.left - 6, y: r.top - 6, width: r.width + 12, height: r.height + 12, k: e.closest('.pin') ? 'pin' : e.className }; }));
  let i = 0; for (const b of boxes) await p.screenshot({ path: `shots-rail/pill-${name}-${b.k.replace(/\W+/g, '')}-${i++}.png`, clip: b });
  await p.close();
}
// standalone pills, large, for the side-by-side with Alex's reference icons
{
  const p = await open('pills-large', 'chapter=2&lang=en', { dpr: 2 });
  const html = await p.evaluate(() => [1, 2, 5].map((n) => { const s = [...document.querySelectorAll('.side-panel svg.line-pill')].find((x) => x.querySelector('text').textContent === String(n)).cloneNode(true); const v = n === 5 ? '--c-lrt' : `--c-ktm${n}`; const col = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); s.innerHTML = s.innerHTML.replaceAll(`var(${v})`, col); s.setAttribute('style', 'height:48px;width:92px'); return s.outerHTML; }));
  await p.setContent(`<body style="margin:0;background:#f2f4f6">${html.map((x, i) => `<div id="p${i + 1}" style="display:inline-block;padding:16px 10px">${x}</div>`).join('')}</body>`);
  for (const n of [1, 2, 3]) await (await p.$(`#p${n}`)).screenshot({ path: `shots-rail/pill-large-${[1, 2, 5][n - 1]}.png` });
  await p.close();
}
await browser.close();
if (bad.length) { console.log('BAD', bad.join(' | ')); process.exitCode = 1; } else console.log('rail OK (official colours on vars, pins, badges, train accent)');
const errs = errors.filter((e) => !e.startsWith('[pills-large]')); // the standalone pill page is setContent (no favicon)
console.log(errs.length ? errs.join('\n') : 'No console errors or warnings (rail check).');
process.exit(process.exitCode ?? 0);
