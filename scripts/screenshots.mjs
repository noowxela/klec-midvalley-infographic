// Headless screenshots of each chapter + console-error check.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/screenshots.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=metal', '--hide-scrollbars'] });
const errors = [];
const shots = [
  { name: '00-cover', q: 'chapter=0', w: 1920, h: 1080 },
  { name: '01-location', q: 'chapter=1', w: 1920, h: 1080 },
  { name: '03-massing', q: 'chapter=3', w: 1920, h: 1080 },
  { name: '05-connections', q: 'chapter=5', w: 1920, h: 1080 },
  { name: '05-connections-dark', q: 'chapter=5&theme=dark', w: 1920, h: 1080 },
  { name: '00-cover-laptop-1440x900', q: 'chapter=0', w: 1440, h: 900 },
  { name: '03-massing-height-source', q: 'chapter=3', w: 1920, h: 1080, click: '#side-panel .toggle input' },
];
for (const s of shots) {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${s.name}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${s.name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[${s.name}] requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1 });
  await page.goto(`${base}?${s.q}`, { waitUntil: 'networkidle0' });
  try { await page.waitForFunction(() => window.__mv?.ready === true, { timeout: 15000 }); } catch (e) { console.error(errors.join('\n')); await page.screenshot({ path: `shots/${s.name}-FAILED.png` }); throw e; }
  if (s.click) await page.click(s.click);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `shots/${s.name}.png` });
  console.log('saved', `shots/${s.name}.png`);
  await page.close();
}
// keyboard check: Space on body advances; arrows inside a slider must not change chapter
{
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`[keys] pageerror: ${e.message}`));
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`${base}?chapter=0`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__mv?.ready === true);
  await page.keyboard.press('Space'); await new Promise((r) => setTimeout(r, 600));
  const h1 = await page.evaluate(() => location.hash);
  await page.keyboard.press('ArrowRight'); await new Promise((r) => setTimeout(r, 900));
  const h2 = await page.evaluate(() => location.hash);
  await page.focus('#thr'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await new Promise((r) => setTimeout(r, 600));
  const h3 = await page.evaluate(() => location.hash); const thr = await page.$eval('#thr', (e) => e.value);
  console.log('keys: after Space', h1, '| after ArrowRight', h2, '| after arrows in slider', h3, 'slider value', thr);
  await page.close();
}
await browser.close();
console.log(errors.length ? `ERRORS/WARNINGS (${errors.length}):\n` + errors.join('\n') : 'No console errors or warnings.');
