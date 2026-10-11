import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles.css';
import * as THREE from 'three';
import { World, DEFAULT_MODE, prefersReducedMotion, type View } from './scene';
import { buildChapters, type Chapter, type PinDef } from './chapters';
import { t, setLang, initialLang, onLangChange, getLang, LANGS, dictFor, cjkFontCss, type Lang } from './i18n';
import { loader } from './loader';

// this module runs once its chunk (code + bundled OSM data) has downloaded and parsed
loader.step('app', 'done'); loader.step('data', 'done'); loader.step('scene', 'active');

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
let stageScale = 1; // current stage scale (the bottom-right strip is unscaled, so the scale bar is sized in screen px)
function fit() {
  const m = mqMobile.matches; if (m !== mobile) setMobile(m);
  if (mobile) { // native CSS-px layout: the stage is the viewport, nothing is scaled
    stage.style.transform = ''; stageScale = 1;
    world.setStageSize(stage.clientWidth, stage.clientHeight); world.setPixelRatio(1);
    layoutMobile(true); return;
  }
  world.setStageSize(1920, 1080);
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `translate(${(window.innerWidth - 1920 * s) / 2}px, ${(window.innerHeight - 1080 * s) / 2}px) scale(${s})`;
  world.setPixelRatio(s);
  placeCredit(s);
  placeFurniture(s);
}
// OSM credit: unscaled text in the stage's bottom-right corner, level with the footer line (right of the
// "Illustrative block massing" note, below the reset / scale furniture). When the stage is letterboxed with
// room to spare (narrow / portrait windows) it sits just below the stage instead, so it never covers the tabs.
function placeCredit(s: number) {
  const el = document.getElementById('map-strip'); if (!el) return; stageScale = s;
  const gapX = (window.innerWidth - 1920 * s) / 2, gapY = (window.innerHeight - 1080 * s) / 2;
  const below = gapY >= 24;
  el.style.right = `${Math.round(gapX + Math.max(8, 48 * s))}px`;
  // inside: level with the footer note (12 px up at full size), always below the chapter labels / arrows; on very small
  // stages the text shrinks (min 9 px) so it still fits in the strip under the rail
  const fs = Math.max(9, Math.min(11, 15 * s)); const lh = Math.round(fs * 1.35);
  el.style.fontSize = below ? '' : `${fs}px`; el.style.lineHeight = below ? '' : `${lh}px`;
  el.style.bottom = below ? `${Math.round(gapY - 20)}px` : `${Math.round(gapY + Math.max(1, Math.min(12 * s, 40 * s - lh - 1)))}px`;
  el.classList.toggle('below-stage', below);
}
// compass + RESET VIEW: on small / touch screens the uniformly scaled stage would shrink the compass to ~12 px, so the
// furniture is counter-scaled to a minimum on-screen compass of 42 px (reset stays half that height, to its left and
// centred), lifted so it stays 8 px clear of the chapter bar, with a >= 44 px invisible touch target on RESET VIEW. The
// side panel's max height is capped to end above it. The touch target is >= 44 screen px at every size.
const COMPASS_MIN_PX = 42, TOUCH_MIN_PX = 44;
function placeFurniture(s: number) {
  const f = document.querySelector<HTMLElement>('.map-furniture'); const bar = document.querySelector<HTMLElement>('.bottom-bar');
  const sp = document.getElementById('side-panel'); const btn = document.getElementById('btn-reset');
  if (!f || !bar || !sp || !btn) return;
  const k = Math.max(1, COMPASS_MIN_PX / (60 * s));
  const local = k * s; // screen px per furniture px
  f.style.setProperty('--reset-hit-y', `${Math.max(8, (TOUCH_MIN_PX / local - 30) / 2)}px`);
  f.style.setProperty('--reset-hit-x', `${Math.max(4, (TOUCH_MIN_PX / local - btn.offsetWidth) / 2)}px`);
  if (k === 1) { f.style.transform = ''; f.style.bottom = ''; sp.style.maxHeight = ''; return; }
  const half = 30 * k; const barTop = 1080 - 22 - bar.offsetHeight; // stage px
  const c = Math.min(1080 - 128 - 30, barTop - 8 / s - half); // centre line of compass + reset
  f.style.transform = `scale(${k})`; f.style.bottom = `${1080 - c - 30}px`;
  const cs = getComputedStyle(sp); const extra = cs.boxSizing === 'border-box' ? 0 : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  sp.style.maxHeight = `${Math.min(720, c - half - 8 / s - (parseFloat(cs.top) || 150) - extra)}px`;
}
// narrow / touch viewports (phones, small tablets, short landscape phones) get the native mobile layout
const mqMobile = window.matchMedia('(max-width: 768px), (max-height: 500px) and (max-width: 1024px)');
let mobile = false;
window.addEventListener('resize', fit); mqMobile.addEventListener?.('change', fit);

const textPanel = $('#text-panel'); const sidePanel = $('#side-panel');

// ---------- pins ----------
const pinLayer = $('#pins');
interface PinEl { def: PinDef; el: HTMLElement; tag: HTMLElement; stem: HTMLElement; pos: THREE.Vector3; w: number; h: number }
let pinEls: PinEl[] = [];
function measurePins() { for (const p of pinEls) { p.w = p.tag.offsetWidth; p.h = p.tag.offsetHeight; } }
function setPins(defs: PinDef[]) {
  for (const p of pinEls) { p.el.classList.add('hidden'); const el = p.el; setTimeout(() => el.remove(), 400); }
  pinEls = defs.map((def) => {
    const el = document.createElement('div'); el.className = `pin ${def.kind} hidden`;
    el.innerHTML = `<div class="stem"></div><div class="dot"></div><div class="tag"${def.color ? ` style="background:${def.color}"` : ''}><div class="t"></div>${def.value ? '<div class="v"></div>' : ''}</div>`;
    (el.querySelector('.t') as HTMLElement).textContent = def.title;
    if (def.value) (el.querySelector('.v') as HTMLElement).textContent = def.value;
    if (def.icon) (el.querySelector('.v') ?? el.querySelector('.t'))!.insertAdjacentHTML('afterbegin', def.icon); // own SVG markup (linePill), not user data
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
  const tpOpen = !mobile && !panelState.tp; const spOpen = !mobile && !panelState.sp && sidePanel.childElementCount > 0;
  const panels = mobile
    ? [rectOf(header), rectOf(bottomBar), ...(sheet.offsetHeight > 0 ? [rectOf(sheet)] : [])]
    : [...(tpOpen ? [rectOf(textPanel)] : []), ...(spOpen ? [rectOf(sidePanel)] : [])];
  const W = world.stageSize.w;
  const items = pinEls.map((p) => ({ p, s: world.project(p.pos) })).sort((a, b) => b.s.y - a.s.y);
  const side = spOpen ? rectOf(sidePanel) : null;
  for (const { p, s } of items) {
    if (!s.visible) { p.el.style.opacity = '0'; continue; }
    p.el.style.opacity = '';
    // flip the tag to the left of its stem when it would run under the side panel
    const flip = !!side && s.x + p.w > side.x0 - 8 && s.x - p.w > 0;
    let x0 = flip ? s.x - p.w : s.x; let x1 = flip ? s.x : s.x + p.w;
    // mobile: keep every tag on screen (slide it left of its stem near the right edge)
    if (mobile) { x0 = clamp(s.x - 1, 6, Math.max(6, W - 6 - p.w)); x1 = x0 + p.w; }
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
    p.tag.style.left = mobile ? `${(x0 - s.x).toFixed(1)}px` : flip ? `${-p.w + 1}px` : '-1px';
  }
}

// ---------- collapsible panels ----------
// state: true = collapsed. Persisted; chapter changes never force panels open.
const panelState: { tp: boolean; sp: boolean } = (() => { try { return { tp: false, sp: false, ...JSON.parse(localStorage.getItem('mv-panels') || '{}') }; } catch { return { tp: false, sp: false }; } })();
const tpToggle = $('#tp-toggle'), spToggle = $('#sp-toggle'), btnMap = $('#btn-maponly');
const TEXT_RIGHT = 96 + 520, SIDE_LEFT = 1920 - 48 - 360;
function applyPanels(instant = false) {
  const hasSide = sidePanel.childElementCount > 0;
  if (mobile) { // the sheet replaces both panels; 'map only' hides the sheet
    stage.classList.remove('tp-collapsed', 'sp-collapsed'); stage.classList.toggle('no-side', !hasSide);
    btnMap.setAttribute('aria-pressed', String(sheetHidden)); btnMap.setAttribute('aria-expanded', String(!sheetHidden));
    layoutMobile(instant); return;
  }
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
function toggleMapOnly() { if (mobile) { sheetHidden = !sheetHidden; applyPanels(); return; } const hasSide = sidePanel.childElementCount > 0; const all = panelState.tp && (panelState.sp || !hasSide); setPanels(!all, !all); }
tpToggle.addEventListener('click', () => setPanels(!panelState.tp, panelState.sp));
spToggle.addEventListener('click', () => setPanels(panelState.tp, !panelState.sp));
btnMap.addEventListener('click', toggleMapOnly);

// ---------- mobile layout ----------
// The stage becomes the (dynamic) viewport. The text panel and the side panel move into one bottom sheet above the
// chapter rail (a card at the bottom left on short landscape screens): collapsed to a peek (chapter number + headline),
// expandable to ~60 % of the height and scrollable inside. Less-used header tools move into an overflow menu.
const root = document.documentElement;
const sheet = $('#sheet'), sheetBody = $('#sheet-body'), sheetHandle = $('#sheet-handle');
const topTools = $('#top-tools'), moreBtn = $('#btn-more'), moreMenu = $('#more-menu');
const footNote = $('.bottom-bar .credit'), bottomBar = $('.bottom-bar'), header = $('#top-buttons');
const MENU_IDS = ['btn-trains', 'btn-maponly', 'btn-autoplay', 'btn-sound', 'btn-fullscreen'];
const DESK_ORDER = ['lang-switch', 'btn-maponly', 'btn-trains', 'btn-autoplay', 'btn-sound', 'btn-theme', 'btn-fullscreen', 'btn-more', 'more-menu'];
let sheetOpen = false, sheetHidden = false;
function menuLabels() {
  for (const id of MENU_IDS) {
    const b = document.getElementById(id)!; let l = b.querySelector<HTMLElement>('.mi-label');
    if (!l) { l = document.createElement('span'); l.className = 'mi-label'; l.setAttribute('aria-hidden', 'true'); b.append(l); }
    l.textContent = (b.getAttribute('aria-label') || b.title).replace(/\s*\([A-Z]\)$/, '');
  }
}
function setMobile(m: boolean) {
  mobile = m; root.classList.toggle('mobile', m);
  const strip = $('#map-strip'); const furn = $('.map-furniture');
  strip.removeAttribute('style'); strip.classList.remove('below-stage'); furn.style.transform = ''; furn.style.bottom = ''; sidePanel.style.maxHeight = '';
  if (m) {
    sheetBody.append(textPanel, sidePanel, footNote);
    menuLabels(); for (const id of MENU_IDS) moreMenu.append(document.getElementById(id)!);
  } else {
    stage.insertBefore(textPanel, tpToggle); stage.insertBefore(sidePanel, tpToggle); bottomBar.append(footNote);
    for (const id of DESK_ORDER) topTools.append(document.getElementById(id)!);
    closeMenu(); world.setDistanceScale(1); stage.style.removeProperty('--m-above');
  }
  if (current >= 0) { renderText(chapters[current]); applyPanels(true); }
}
function peekHeight() {
  const hl = textPanel.querySelector<HTMLElement>('.headline');
  return Math.round(sheetHandle.offsetHeight + (hl ? hl.offsetTop + hl.offsetHeight : 48) + 14);
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function layoutMobile(instant = false) {
  if (!mobile) return;
  const W = stage.clientWidth, H = stage.clientHeight; const landscape = W > H;
  const headerBottom = header.offsetTop + header.offsetHeight; const railTop = bottomBar.offsetTop;
  const peek = peekHeight();
  const room = railTop - headerBottom - (landscape ? 16 : 8);
  const open = Math.min(room, Math.max(peek, Math.round(H * (landscape ? 1 : 0.6))));
  const sh = sheetHidden ? 0 : sheetOpen ? open : Math.min(peek, room);
  sheet.style.height = `${sh}px`; sheet.classList.toggle('is-hidden', sheetHidden);
  sheetBody.classList.toggle('scroll', sheetOpen);
  // compass / reset and the credit + scale strip sit just above whatever covers the bottom of the map
  const above = (H - railTop) + (landscape ? 0 : sh);
  root.style.setProperty('--m-above', `${above}px`);
  // camera framing: pull every preset back so its subject fits the free area (between header and the collapsed sheet)
  const peekCover = landscape ? 0 : sheetHidden ? 0 : Math.min(peek, room);
  const freeH = Math.max(1, railTop - peekCover - headerBottom);
  const k = clamp(Math.max(0.8 / (W / H), 0.73 / (freeH / H)), 0.9, 2.6);
  world.setDistanceScale(k);
  // centre the projection on the area the map can actually be seen in
  const coverB = H - railTop + (landscape ? 0 : sh);
  const coverL = landscape && sheetOpen && !sheetHidden ? sheet.offsetLeft + sheet.offsetWidth : 0;
  world.setViewShift(coverL / 2, instant || prefersReducedMotion(), (headerBottom - coverB) / 2);
}
function setSheet(open: boolean) {
  sheetOpen = open; sheet.classList.toggle('open', open);
  sheetHandle.setAttribute('aria-expanded', String(open));
  const T = t().ui; sheetHandle.setAttribute('aria-label', open ? T.sheetCollapse : T.sheetExpand);
  if (!open) sheetBody.scrollTop = 0;
  layoutMobile();
}
let suppressClick = false;
sheetHandle.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } setSheet(!sheetOpen); });
// gestures on the sheet: swipe left / right on the peek (handle, chapter label, headline) = next / previous chapter;
// swipe up / down = expand / collapse; a tap on the collapsed sheet expands it.
let g: { x: number; y: number; id: number; peek: boolean } | null = null;
sheet.addEventListener('pointerdown', (e) => {
  const tgt = e.target as HTMLElement;
  const peek = !!tgt.closest('.sheet-handle, .chapter-label, .headline') || !sheetOpen;
  if (tgt.closest('input, select, textarea, a, .side-panel button, [role="button"]') && sheetOpen) return;
  g = { x: e.clientX, y: e.clientY, id: e.pointerId, peek };
});
sheet.addEventListener('pointercancel', () => { g = null; });
sheet.addEventListener('pointerup', (e) => {
  if (!g || e.pointerId !== g.id) return; const dx = e.clientX - g.x, dy = e.clientY - g.y; const wasPeek = g.peek; g = null;
  if (!wasPeek) return;
  if (Math.abs(dx) > 48 && Math.abs(dx) > 1.4 * Math.abs(dy)) { suppressClick = true; setTimeout(() => (suppressClick = false), 400); stopAutoplay(); goTo(current + (dx < 0 ? 1 : -1)); return; }
  if (Math.abs(dy) > 36 && Math.abs(dy) > Math.abs(dx)) { suppressClick = true; setTimeout(() => (suppressClick = false), 400); setSheet(dy < 0); return; }
  if (!sheetOpen && Math.hypot(dx, dy) < 10 && !(e.target as HTMLElement).closest('.sheet-handle')) setSheet(true);
});
// overflow menu
function closeMenu() { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); }
moreBtn.addEventListener('click', (e) => { e.stopPropagation(); const open = moreMenu.hidden; moreMenu.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open)); if (open) (moreMenu.querySelector('button') as HTMLButtonElement | null)?.focus(); });
moreMenu.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) setTimeout(closeMenu, 120); });
document.addEventListener('pointerdown', (e) => { if (!moreMenu.hidden && !(e.target as HTMLElement).closest('#more-menu, #btn-more')) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !moreMenu.hidden) { closeMenu(); moreBtn.focus(); } });
// keep the current chapter tab in view in the scrollable mobile rail
function centreTab(i: number) {
  if (!mobile) return; const el = tabs.children[i] as HTMLElement | undefined; if (!el) return;
  tabs.scrollTo({ left: el.offsetLeft - (tabs.clientWidth - el.offsetWidth) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

// ---------- compass & scale bar ----------
const needle = $('#north-needle'); const scaleBar = $('#scale-bar'); const scaleLabel = $('#scale-label');
function updateFurniture() {
  needle.setAttribute('transform', `rotate(${((world.northAngle() * 180) / Math.PI).toFixed(1)})`);
  const ppm = world.pxPerMetre();
  const px = ppm * stageScale; // screen px per metre (the strip sits outside the scaled stage)
  const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((m) => m * px >= 48) ?? 1000;
  const w = `${(nice * px).toFixed(1)}px`; if (scaleBar.style.width !== w) { scaleBar.style.width = w; scaleLabel.textContent = `${nice} m`; }
}
// RESET VIEW: only while the user has moved the camera away from this chapter's preset. userMoved is set by
// OrbitControls 'start' (drag, wheel, touch, keys) and cleared on chapter change and on reset; the button also hides
// whenever the camera is back near the preset or a flight is animating.
const btnReset = $('#btn-reset') as HTMLButtonElement;
let userMoved = false;
function updateResetBtn() {
  // on the 00 turntable the bearing changes by itself, so only pitch / zoom / target count as 'moved'
  const show = userMoved && current >= 0 && !world.isFlying() && !world.isNear(chapters[current].view, !!chapters[current].turntable);
  if (btnReset.classList.contains('is-hidden') === show) {
    if (!show && document.activeElement === btnReset) btnReset.blur();
    btnReset.classList.toggle('is-hidden', !show); btnReset.setAttribute('aria-hidden', String(!show)); btnReset.tabIndex = show ? 0 : -1;
  }
}
world.onFrame.push(updatePins, updateFurniture, updateResetBtn);

// ---------- chapters ----------
const tabs = $('#chapter-tabs');
let current = -1;
const pad = (n: number) => String(n).padStart(2, '0');
function buildTabs() {
  tabs.innerHTML = '';
  chapters.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'tab'; b.type = 'button'; b.innerHTML = `<i class="bar" aria-hidden="true"></i><span class="n">${pad(c.id)}</span><span class="lbl">${c.tab}</span>`;
    b.addEventListener('click', () => { stopAutoplay(); goTo(i); }); tabs.append(b);
  });
  [...tabs.children].forEach((t, k) => (k === current ? t.setAttribute('aria-current', 'step') : t.removeAttribute('aria-current')));
}
buildTabs();
$('#btn-prev').addEventListener('click', () => { stopAutoplay(); goTo(current - 1); });
$('#btn-next').addEventListener('click', () => { stopAutoplay(); goTo(current + 1); });
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
    ${c.source ? `<div class="source">${c.source}</div>` : ''}`;
  fitHeadline();
  // shrink any figure that does not fit its 180 px column (long ranges, long units)
  textPanel.querySelectorAll<HTMLElement>('.stat .fig').forEach((f) => {
    let size = parseFloat(getComputedStyle(f).fontSize);
    while (f.scrollWidth > f.parentElement!.clientWidth + 1 && size > 26) { size -= 3; f.style.fontSize = `${size}px`; }
  });
}
// headline lines are set one per span; if a line would wrap in the 520 px text column (long EN / MS titles), step the
// headline size down (min 38 px) so every line stays on one line. Re-run when web fonts finish loading.
function fitHeadline() {
  const hl = textPanel.querySelector<HTMLElement>('.headline'); if (!hl) return;
  hl.style.fontSize = '';
  if (mobile) { layoutMobile(); return; } // mobile headlines wrap at a fixed size; the sheet peek follows their height
  const spans = [...hl.children] as HTMLElement[];
  const widest = () => Math.max(...spans.map((s) => { s.style.whiteSpace = 'nowrap'; const w = s.scrollWidth; s.style.whiteSpace = ''; return w; }));
  let size = parseFloat(getComputedStyle(hl).fontSize);
  while (widest() > hl.clientWidth + 1 && size > 38) { size -= 2; hl.style.fontSize = `${size}px`; }
}
document.fonts?.addEventListener('loadingdone', fitHeadline);
function goTo(i: number, instant = false) {
  i = (i + chapters.length) % chapters.length; if (i === current) return;
  current = i; const c = chapters[i]; runCleanups(); userMoved = false; // the camera flies to the new preset
  [...tabs.children].forEach((t, k) => (k === i ? t.setAttribute('aria-current', 'step') : t.removeAttribute('aria-current')));
  centreTab(i);
  const swap = () => {
    renderText(c); mountPanel(c); if (mobile && !sheetOpen) sheetBody.scrollTop = 0;
    textPanel.classList.remove('out'); sidePanel.classList.remove('out');
  };
  setPins(c.pins);
  world.setTurntable(!!c.turntable); // off when leaving 00: the next flight starts from the current bearing
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
// trains on the LRT viaduct: on by default, user choice persisted
const btnTrains = $('#btn-trains');
const applyTrains = (on: boolean) => { world.setTrains(on); btnTrains.setAttribute('aria-pressed', String(on)); };
applyTrains(localStorage.getItem('mv-trains') !== 'off');
btnTrains.addEventListener('click', () => { const on = !world.trainsVisible; localStorage.setItem('mv-trains', on ? 'on' : 'off'); applyTrains(on); });
const btnAuto = $('#btn-autoplay'), btnSound = $('#btn-sound'), btnTheme = $('#btn-theme'), btnFs = $('#btn-fullscreen');
let autoplay = false; let autoStart = 0; const AUTO_MS = 10000;
// autoplay progress fills the current chapter's bar (Banqiao: button.run + --pr)
const setRun = (on: boolean, k = 0) => { for (const [n, t] of [...tabs.children].entries()) { const el = t as HTMLElement; el.classList.toggle('run', on && n === current); if (on && n === current) el.style.setProperty('--pr', `${Math.min(1, k) * 100}%`); } };
function stopAutoplay() { autoplay = false; btnAuto.setAttribute('aria-pressed', 'false'); btnAuto.querySelector('.ico')!.textContent = '▶'; setRun(false); }
btnAuto.addEventListener('click', () => { autoplay = !autoplay; btnAuto.setAttribute('aria-pressed', String(autoplay)); btnAuto.querySelector('.ico')!.textContent = autoplay ? '❚❚' : '▶'; autoStart = performance.now(); if (!autoplay) setRun(false); });
(function tick() {
  if (autoplay) { const k = (performance.now() - autoStart) / AUTO_MS; setRun(true, k); if (k >= 1) goTo(current + 1); }
  requestAnimationFrame(tick);
})();
world.onUserInteract = () => { stopAutoplay(); userMoved = true; };

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
$('#btn-reset').addEventListener('click', () => { userMoved = false; updateResetBtn(); world.flyTo(chapters[current].view); });

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
  $('#top-tools').setAttribute('aria-label', U.toolbar);
  for (const [id, txt] of [['#btn-autoplay', U.autoplay], ['#btn-sound', U.sound], ['#btn-theme', U.theme], ['#btn-fullscreen', U.fullscreen], ['#btn-maponly', U.mapOnly], ['#btn-trains', U.trains]] as const) { $(id).title = txt; $(id).setAttribute('aria-label', txt); }
  langSwitch.setAttribute('aria-label', U.language);
  langSwitch.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
  $('#compass').title = U.compass; $('#north').setAttribute('aria-label', U.northArrow); $('#north-n').textContent = U.north;
  $('#btn-reset').textContent = U.reset; $('#btn-reset').title = U.resetTitle;
  tabs.setAttribute('aria-label', U.chapters); stage.setAttribute('aria-label', U.stage);
  $('#credit-prefix').textContent = U.creditPrefix; $('#osm-credit').setAttribute('aria-label', U.osmCreditAria);
  moreBtn.title = U.more; moreBtn.setAttribute('aria-label', U.more); moreMenu.setAttribute('aria-label', U.more);
  sheetHandle.setAttribute('aria-label', sheetOpen ? U.sheetCollapse : U.sheetExpand); menuLabels();
  $('#btn-prev').setAttribute('aria-label', U.prevChapter); $('#btn-next').setAttribute('aria-label', U.nextChapter); $('.rail').setAttribute('aria-label', U.chaptersNav);
  applyPanels(true);
}
applyStaticText();
onLangChange(() => {
  applyStaticText();
  chapters = buildChapters(); buildTabs();
  const c = chapters[current]; renderText(c); mountPanel(c); setPins(c.pins);
});

// ---------- start ----------
fit();
const fromHash = parseInt((params.get('chapter') ?? location.hash.slice(1)) || '0', 10);
const startIdx = Math.max(0, chapters.findIndex((c) => c.id === fromHash));
goTo(startIdx, true);
const mv = { ready: false, revealed: false, goTo: (id: number) => goTo(chapters.findIndex((c) => c.id === id), true), chapters: chapters.map((c) => c.id), setLang: (l: Lang) => setLang(l), lang: getLang, world };
(window as unknown as { __mv: unknown }).__mv = mv;

// ---------- loader hand-off: reveal only when fonts, scene, camera and first frames are ready ----------
const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
const framesRendered = (n: number) => new Promise<void>((resolve) => { let k = 0; const f = () => { if (++k >= n) { world.onFrame.splice(world.onFrame.indexOf(f), 1); resolve(); } }; world.onFrame.push(f); });
async function finishBoot() {
  loader.step('scene', 'done'); loader.step('fonts', 'active');
  const faces = ['400 16px "IBM Plex Sans"', '600 16px "IBM Plex Sans"', '400 16px "IBM Plex Mono"', '500 16px "IBM Plex Mono"', '600 16px "IBM Plex Mono"'];
  const cjk = getLang() === 'zh' ? cjkFontCss().then(() => Promise.all(['400', '600'].map((w) => document.fonts.load(`${w} 16px "Noto Sans SC"`, stage.textContent || '中文')))) : Promise.resolve();
  // bounded: on a very slow connection the page continues with fallback fonts
  await withTimeout(Promise.all([...faces.map((f) => document.fonts.load(f)), cjk]).then(() => document.fonts.ready), 8000).catch(() => {});
  loader.step('fonts', 'done'); loader.step('frame', 'active');
  // re-lay out with the real fonts (stat figure fitting and pin sizes depend on glyph widths)
  renderText(chapters[current]); measurePins();
  await framesRendered(3);
  loader.step('frame', 'done');
  mv.ready = true;
  loader.onReveal(() => { mv.revealed = true; });
  loader.ready();
}
void finishBoot();
