import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles.css';
import * as THREE from 'three';
import { World, DEFAULT_MODE, prefersReducedMotion, type View } from './scene';
import { buildChapters, type Chapter, type PinDef } from './chapters';
import { t, setLang, initialLang, onLangChange, getLang, LANGS, dictFor, type Lang } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const stage = $('#stage');
const params = new URLSearchParams(location.search);

// ---------- theme (before the scene reads CSS variables) ----------
const storedTheme = params.get('theme') || localStorage.getItem('mv-theme');
if (storedTheme === 'dark' || storedTheme === 'light') document.documentElement.dataset.theme = storedTheme;

// ---------- language (before chapters are built) ----------
setLang(initialLang(), false);
let chapters: Chapter[] = buildChapters();

// ---------- fit the 1920x1080 stage to the window ----------
const world = new World($('#gl'));
function fit() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `translate(${(window.innerWidth - 1920 * s) / 2}px, ${(window.innerHeight - 1080 * s) / 2}px) scale(${s})`;
  world.setPixelRatio(s);
}
window.addEventListener('resize', fit); fit();

const textPanel = $('#text-panel'); const sidePanel = $('#side-panel');

// ---------- pins ----------
const pinLayer = $('#pins');
interface PinEl { def: PinDef; el: HTMLElement; tag: HTMLElement; stem: HTMLElement; pos: THREE.Vector3; w: number; h: number }
let pinEls: PinEl[] = [];
function setPins(defs: PinDef[]) {
  for (const p of pinEls) { p.el.classList.add('hidden'); const el = p.el; setTimeout(() => el.remove(), 400); }
  pinEls = defs.map((def) => {
    const el = document.createElement('div'); el.className = `pin ${def.kind} hidden`;
    el.innerHTML = `<div class="stem"></div><div class="dot"></div><div class="tag"${def.color ? ` style="background:${def.color}"` : ''}><div class="t"></div>${def.value ? '<div class="v"></div>' : ''}</div>`;
    (el.querySelector('.t') as HTMLElement).textContent = def.title;
    if (def.value) (el.querySelector('.v') as HTMLElement).textContent = def.value;
    if (def.color) (el.querySelector('.dot') as HTMLElement).style.background = def.color;
    if (def.accent) { (el.querySelector('.tag') as HTMLElement).style.borderLeft = `7px solid ${def.accent}`; (el.querySelector('.dot') as HTMLElement).style.background = def.accent; }
    pinLayer.append(el);
    const tag = el.querySelector('.tag') as HTMLElement;
    return { def, el, tag, stem: el.querySelector('.stem') as HTMLElement, pos: new THREE.Vector3(...def.at), w: 0, h: 0 };
  });
  requestAnimationFrame(() => { for (const p of pinEls) { p.w = p.tag.offsetWidth; p.h = p.tag.offsetHeight; p.el.classList.remove('hidden'); } });
}
const rectOf = (el: HTMLElement) => ({ x0: el.offsetLeft, y0: el.offsetTop, x1: el.offsetLeft + el.offsetWidth, y1: el.offsetTop + el.offsetHeight });
function updatePins() {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const tpOpen = !panelState.tp; const spOpen = !panelState.sp && sidePanel.childElementCount > 0;
  const panels = [...(tpOpen ? [rectOf(textPanel)] : []), ...(spOpen ? [rectOf(sidePanel)] : [])];
  const items = pinEls.map((p) => ({ p, s: world.project(p.pos) })).sort((a, b) => b.s.y - a.s.y);
  const side = spOpen ? rectOf(sidePanel) : null;
  for (const { p, s } of items) {
    if (!s.visible) { p.el.style.opacity = '0'; continue; }
    p.el.style.opacity = '';
    // flip the tag to the left of its stem when it would run under the side panel
    const flip = !!side && s.x + p.w > side.x0 - 8 && s.x - p.w > 0;
    const x0 = flip ? s.x - p.w : s.x; const x1 = flip ? s.x : s.x + p.w;
    let stem = p.def.kind === 'minor' ? 18 : 34;
    for (let k = 0; k < 8; k++) {
      const box = { x0: x0 - 2, x1: x1 + 2, y0: s.y - stem - p.h - 2, y1: s.y - stem + 2 };
      if (!placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) { placed.push(box); break; }
      stem += 30;
    }
    const top = s.y - stem - p.h;
    p.el.classList.toggle('occluded', panels.some((r) => x0 < r.x1 && x1 > r.x0 && top < r.y1 && s.y > r.y0));
    p.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    p.stem.style.height = `${stem}px`; p.tag.style.bottom = `${stem}px`;
    p.tag.style.left = flip ? `${-p.w + 1}px` : '-1px';
  }
}

// ---------- collapsible panels ----------
// state: true = collapsed. Persisted; chapter changes never force panels open.
const panelState: { tp: boolean; sp: boolean } = (() => { try { return { tp: false, sp: false, ...JSON.parse(localStorage.getItem('mv-panels') || '{}') }; } catch { return { tp: false, sp: false }; } })();
const tpToggle = $('#tp-toggle'), spToggle = $('#sp-toggle'), btnMap = $('#btn-maponly');
const TEXT_RIGHT = 96 + 520, SIDE_LEFT = 1920 - 48 - 360;
function applyPanels(instant = false) {
  const hasSide = sidePanel.childElementCount > 0;
  stage.classList.toggle('tp-collapsed', panelState.tp);
  stage.classList.toggle('sp-collapsed', panelState.sp);
  stage.classList.toggle('no-side', !hasSide);
  const T = t().ui;
  tpToggle.setAttribute('aria-expanded', String(!panelState.tp)); tpToggle.setAttribute('aria-label', panelState.tp ? T.showText : T.hideText); tpToggle.title = panelState.tp ? T.showText : T.hideText;
  spToggle.setAttribute('aria-expanded', String(!panelState.sp)); spToggle.setAttribute('aria-label', panelState.sp ? T.showSide : T.hideSide); spToggle.title = panelState.sp ? T.showSide : T.hideSide;
  const mapOnly = panelState.tp && (panelState.sp || !hasSide);
  btnMap.setAttribute('aria-pressed', String(mapOnly)); btnMap.setAttribute('aria-expanded', String(!mapOnly));
  // recentre the model in the free area between visible panels
  const left = panelState.tp ? 0 : TEXT_RIGHT; const right = hasSide && !panelState.sp ? SIDE_LEFT : 1920;
  world.setViewShift((left + right) / 2 - 960, instant || prefersReducedMotion());
}
function setPanels(tp: boolean, sp: boolean) { panelState.tp = tp; panelState.sp = sp; localStorage.setItem('mv-panels', JSON.stringify(panelState)); applyPanels(); }
function toggleMapOnly() { const hasSide = sidePanel.childElementCount > 0; const all = panelState.tp && (panelState.sp || !hasSide); setPanels(!all, !all); }
tpToggle.addEventListener('click', () => setPanels(!panelState.tp, panelState.sp));
spToggle.addEventListener('click', () => setPanels(panelState.tp, !panelState.sp));
btnMap.addEventListener('click', toggleMapOnly);

// ---------- compass & scale bar ----------
const needle = $('#north-needle'); const scaleBar = $('#scale-bar'); const scaleLabel = $('#scale-label');
function updateFurniture() {
  needle.setAttribute('transform', `rotate(${((world.northAngle() * 180) / Math.PI).toFixed(1)})`);
  const ppm = world.pxPerMetre();
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((m) => m * ppm >= 90) ?? 1000;
  scaleBar.style.width = `${(nice * ppm).toFixed(1)}px`; scaleLabel.textContent = `${nice} m`;
}
world.onFrame.push(updatePins, updateFurniture);

// ---------- chapters ----------
const tabs = $('#chapter-tabs'); const progressFill = $('#progress-fill');
let current = -1;
const pad = (n: number) => String(n).padStart(2, '0');
function buildTabs() {
  tabs.innerHTML = '';
  chapters.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'tab'; b.innerHTML = `<span class="n">${pad(c.id)}</span>${c.tab}`;
    b.addEventListener('click', () => { stopAutoplay(); goTo(i); }); tabs.append(b);
  });
  [...tabs.children].forEach((t, k) => (k === current ? t.setAttribute('aria-current', 'step') : t.removeAttribute('aria-current')));
}
buildTabs();
let cleanups: (() => void)[] = [];
const runCleanups = () => { for (const f of cleanups) f(); cleanups = []; };
function mountPanel(c: Chapter) {
  runCleanups(); sidePanel.innerHTML = '';
  world.setMode({ ...structuredClone(DEFAULT_MODE), ...c.mode });
  c.panel?.(sidePanel, world, { flyTo: (v: View) => world.flyTo(v), chapterView: c.view, onCleanup: (f) => cleanups.push(f) });
  applyPanels(true);
}

function renderText(c: Chapter) {
  const stats = c.stats.map((s) => `<div class="stat"><div class="fig">${s.fig}<span class="unit">${s.unit ?? ''}</span></div><div class="cap">${s.swatch ? `<span class="swatch box" style="background:${s.swatch}"></span>` : ''}${s.cap}</div></div>`).join('');
  const legend = c.legend ? `<div class="tp-legend"><div class="tp-legend-title">${c.legend.title}</div>${c.legend.items.map((i) => `<div class="tp-legend-row"><span class="swatch box" style="background:${i.swatch}"></span><span class="lg-label">${i.label}</span><span class="lg-desc">${i.desc}</span></div>`).join('')}</div>` : '';
  textPanel.innerHTML = `
    <div class="chapter-label"><span class="num">${pad(c.id)}</span><span class="rule"></span><span>${c.label}</span></div>
    <h1 class="headline">${c.title.map((x) => `<span>${x}</span>`).join('')}</h1>
    <p class="lead">${c.lead}</p>
    ${legend}
    <div class="stats">${stats}</div>
    ${c.hint ? `<div class="hint">${c.hint}</div>` : ''}
    <div class="source">${c.source}</div>`;
  // shrink any figure that does not fit its 180 px column (long ranges, long units)
  textPanel.querySelectorAll<HTMLElement>('.stat .fig').forEach((f) => {
    let size = parseFloat(getComputedStyle(f).fontSize);
    while (f.scrollWidth > f.parentElement!.clientWidth + 1 && size > 26) { size -= 3; f.style.fontSize = `${size}px`; }
  });
}
function goTo(i: number, instant = false) {
  i = (i + chapters.length) % chapters.length; if (i === current) return;
  current = i; const c = chapters[i]; runCleanups();
  [...tabs.children].forEach((t, k) => (k === i ? t.setAttribute('aria-current', 'step') : t.removeAttribute('aria-current')));
  progressFill.style.width = `${((i + 1) / chapters.length) * 100}%`;
  const swap = () => {
    renderText(c); mountPanel(c);
    textPanel.classList.remove('out'); sidePanel.classList.remove('out');
  };
  setPins(c.pins);
  world.flyTo(c.view, instant || prefersReducedMotion());
  if (instant || prefersReducedMotion()) swap();
  else { textPanel.classList.add('out'); sidePanel.classList.add('out'); setTimeout(swap, 380); }
  history.replaceState(null, '', `#${pad(c.id)}`);
  chime();
  if (autoplay) autoStart = performance.now();
}

// ---------- keyboard ----------
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  const inForm = !!t?.closest('input, select, textarea, [contenteditable="true"]');
  if (inForm) return; // sliders/inputs keep their own arrow & space behaviour
  const onButton = !!t?.closest('button, [role="button"]');
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !onButton)) { e.preventDefault(); stopAutoplay(); goTo(current + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); stopAutoplay(); goTo(current - 1); }
  else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'm' || e.key === 'M') toggleMapOnly();
});

// ---------- top buttons ----------
const btnAuto = $('#btn-autoplay'), btnSound = $('#btn-sound'), btnTheme = $('#btn-theme'), btnFs = $('#btn-fullscreen');
let autoplay = false; let autoStart = 0; const AUTO_MS = 10000; const autoFill = $('#autoplay-fill');
function stopAutoplay() { autoplay = false; btnAuto.setAttribute('aria-pressed', 'false'); btnAuto.querySelector('.ico')!.textContent = '▶'; autoFill.style.width = '0'; }
btnAuto.addEventListener('click', () => { autoplay = !autoplay; btnAuto.setAttribute('aria-pressed', String(autoplay)); btnAuto.querySelector('.ico')!.textContent = autoplay ? '❚❚' : '▶'; autoStart = performance.now(); if (!autoplay) autoFill.style.width = '0'; });
(function tick() {
  if (autoplay) { const k = (performance.now() - autoStart) / AUTO_MS; autoFill.style.width = `${Math.min(1, k) * 100}%`; if (k >= 1) goTo(current + 1); }
  requestAnimationFrame(tick);
})();
world.onUserInteract = () => stopAutoplay();

let sound = false; let actx: AudioContext | null = null;
btnSound.addEventListener('click', () => { sound = !sound; btnSound.setAttribute('aria-pressed', String(sound)); if (sound) { actx ??= new AudioContext(); chime(); } });
function chime() { // a soft synthesized two-note chime; no audio files
  if (!sound || !actx) return; const t = actx.currentTime;
  for (const [f, d] of [[660, 0], [990, 0.09]]) {
    const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.05, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6);
    o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + 0.65);
  }
}
const syncThemeBtn = () => btnTheme.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'dark'));
btnTheme.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; localStorage.setItem('mv-theme', next); syncThemeBtn();
  world.applyTheme(); world.setMode({}); // keep the current chapter's mode
});
syncThemeBtn();
function toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
btnFs.addEventListener('click', toggleFullscreen);
$('#btn-reset').addEventListener('click', () => world.flyTo(chapters[current].view));

// ---------- language switcher & static text ----------
const langSwitch = $('#lang-switch');
for (const l of LANGS) {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.lang = l; b.lang = l === 'zh' ? 'zh-Hans' : l;
  b.textContent = dictFor(l).switchLabel; b.title = dictFor(l).langName;
  b.addEventListener('click', () => setLang(l as Lang)); langSwitch.append(b);
}
function applyStaticText() {
  const T = t(); const U = T.ui;
  document.title = T.doc.title; document.querySelector('meta[name="description"]')?.setAttribute('content', T.doc.description);
  $('#brand-name').textContent = U.brand; $('#brand-sub').textContent = U.brandSub;
  $('#top-buttons').setAttribute('aria-label', U.toolbar);
  for (const [id, txt] of [['#btn-autoplay', U.autoplay], ['#btn-sound', U.sound], ['#btn-theme', U.theme], ['#btn-fullscreen', U.fullscreen], ['#btn-maponly', U.mapOnly]] as const) { $(id).title = txt; $(id).setAttribute('aria-label', txt); }
  langSwitch.setAttribute('aria-label', U.language);
  langSwitch.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
  $('#compass').title = U.compass; $('#north').setAttribute('aria-label', U.northArrow); $('#north-n').textContent = U.north;
  $('#btn-reset').textContent = U.reset; $('#btn-reset').title = U.resetTitle;
  tabs.setAttribute('aria-label', U.chapters); stage.setAttribute('aria-label', U.stage);
  $('#credit-prefix').textContent = U.creditPrefix; $('#credit-link').textContent = U.creditLink;
  applyPanels(true);
}
applyStaticText();
onLangChange(() => {
  applyStaticText();
  chapters = buildChapters(); buildTabs();
  const c = chapters[current]; renderText(c); mountPanel(c); setPins(c.pins);
});

// ---------- start ----------
const fromHash = parseInt((params.get('chapter') ?? location.hash.slice(1)) || '0', 10);
const startIdx = Math.max(0, chapters.findIndex((c) => c.id === fromHash));
goTo(startIdx, true);
(window as unknown as { __mv: unknown }).__mv = { ready: true, goTo: (id: number) => goTo(chapters.findIndex((c) => c.id === id), true), chapters: chapters.map((c) => c.id), setLang: (l: Lang) => setLang(l), lang: getLang };
