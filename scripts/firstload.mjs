// Cold, throttled first-load capture: screencast frames bucketed every 250 ms.
// Usage: node scripts/firstload.mjs <outDir> [query] [extra: rm|nowebgl]
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const [outDir = 'shots-load', q = 'chapter=0&lang=en', extra = ''] = process.argv.slice(2);
const base = process.env.BASE || 'http://127.0.0.1:4173/';
mkdirSync(outDir, { recursive: true });
const args = ['--hide-scrollbars', '--use-angle=metal', '--ignore-gpu-blocklist'];
if (extra.includes('nowebgl')) args.push('--disable-webgl', '--disable-3d-apis');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const [VW, VH] = (process.env.VIEW || '1920x1080').split('x').map(Number);
await page.setViewport({ width: VW, height: VH });
if (process.env.STORE) await page.evaluateOnNewDocument((kv) => { try { for (const [k, v] of Object.entries(JSON.parse(kv))) localStorage.setItem(k, v); } catch {} }, process.env.STORE);
// colour scheme is pinned (headless Chrome follows the OS setting otherwise)
const media = [{ name: 'prefers-color-scheme', value: extra.includes('dark') ? 'dark' : 'light' }];
if (extra.includes('rm')) media.push({ name: 'prefers-reduced-motion', value: 'reduce' });
await page.emulateMediaFeatures(media);
const cdp = await page.createCDPSession();
await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); await cdp.send('Network.clearBrowserCache');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: +(process.env.LAT || 150), downloadThroughput: (+(process.env.KBPS || 1600) * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: +(process.env.CPU || 4) });
const frames = []; let t0 = null;
cdp.on('Page.screencastFrame', async (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {} });
await page.goto('about:blank');
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1, maxWidth: VW, maxHeight: VH });
const start = Date.now() / 1000;
const marks = {};
page.on('domcontentloaded', () => { marks.domcontentloaded = Date.now() / 1000 - start; });
page.on('load', () => { marks.load = Date.now() / 1000 - start; });
await page.goto(`${base}?${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch((e) => errors.push('goto: ' + e.message));
const deadline = Date.now() + 40000;
while (Date.now() < deadline) {
  const st = await page.evaluate(() => ({ ready: !!window.__mv?.ready, loaderGone: !document.getElementById('loader') || document.getElementById('loader').hidden, err: !!document.querySelector('#loader.is-error') })).catch(() => ({}));
  if (st.ready && marks.ready == null) marks.ready = Date.now() / 1000 - start;
  if (st.err && marks.error == null) marks.error = Date.now() / 1000 - start;
  if ((st.ready && st.loaderGone) || st.err) { await new Promise((r) => setTimeout(r, 1500)); break; }
  await new Promise((r) => setTimeout(r, 200));
}
await cdp.send('Page.stopScreencast');
// keep one frame per 250 ms bucket
t0 = start; const kept = new Map();
for (const f of frames) { const b = Math.floor((f.t - t0) / 0.25); if (b >= 0) kept.set(b, f); }
const list = [...kept.entries()].sort((a, b) => a[0] - b[0]);
for (const [b, f] of list) writeFileSync(`${outDir}/f-${String(b * 250).padStart(5, '0')}ms.jpg`, Buffer.from(f.data, 'base64'));
writeFileSync(`${outDir}/marks.json`, JSON.stringify({ marks, frames: list.length, errors }, null, 1));
console.log(outDir, JSON.stringify(marks), 'frames', list.length, errors.length ? errors : 'no errors');
await browser.close();
