// Chapter definitions. Numbering follows the full plan; only built chapters are listed.
// Every figure is computed from the processed data in ./data (see source lines); all text comes from ./i18n.
import { buildings, lines, areas, routes, walks, anchors, meta, stats, station, findPlace, fmt, type XY, type Route, type Building, type Share } from './data';
import type { SceneMode, View, World } from './scene';
import { t, getLang } from './i18n';
import { sunPosition, mytDate, solarNoon, compassIndex } from './sun';
import { groundSamples, routeSampleSets } from './shade';
import climate from './data/climate.json';

export interface PinDef { id: string; title: string; value?: string; at: [number, number, number]; kind: 'station' | 'major' | 'minor'; color?: string }
export interface StatDef { fig: string; unit?: string; cap: string }
export interface Chapter {
  id: number; label: string; tab: string; title: string[]; lead: string; stats: StatDef[]; hint?: string; source: string;
  view: View; mode: Partial<SceneMode>; pins: PinDef[]; panel?: (el: HTMLElement, world: World, ctx: PanelCtx) => void;
}
export interface PanelCtx { flyTo: (v: View) => void; chapterView: View; onCleanup: (f: () => void) => void }

const D = (n: XY, y = 0): [number, number, number] => [n[0], y, -n[1]];
const lineColor = { lrt: 'var(--c-lrt)', ktm: 'var(--c-ktm)', erl: 'var(--c-erl)' } as const;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- static derived figures (language independent) ----------
const kj17 = station('KJ17'); const kb01 = station('KB01'); const kd01 = station('KD01');
const tallestNamed = (() => {
  const seen = new Set<string>(); const out: Building[] = [];
  for (const b of [...buildings].filter((b) => b.name && b.heightSource !== 'estimate').sort((a, b) => b.height - a.height)) {
    if (seen.has(b.name!)) continue; seen.add(b.name!); out.push(b);
  }
  return out.slice(0, 10);
})();
const routeBridgeEnclosed = routes[0]?.segments.find((s) => s.cls === 'bridge-enclosed');
const legsTotal = routes.reduce((s, r) => s + r.length, 0);
const legsSheltered = routes.reduce((s, r) => s + r.shelteredM, 0);
const walkTotals = (() => {
  const total = walks.reduce((s, r) => s + r.length, 0);
  const bi = walks.reduce((s, r) => s + (r.byShare.bridge || 0) + (r.byShare.indoor || 0), 0);
  return { total, bridgeIndoorPct: total ? Math.round((bi / total) * 100) : 0, min: Math.min(...walks.map((w) => w.length)), max: Math.max(...walks.map((w) => w.length)) };
})();
const ecoTower = anchors.ECO?.label.match(/\((.*)\)/)?.[1] ?? '';
const SUN_YEAR = 2026;
const PRESETS = { mar: [3, 20], jun: [6, 21], dec: [12, 21] } as const;
type PresetKey = keyof typeof PRESETS;
const noon = Object.fromEntries((Object.keys(PRESETS) as PresetKey[]).map((k) => [k, solarNoon(SUN_YEAR, PRESETS[k][0], PRESETS[k][1], meta.center.lat, meta.center.lon)])) as Record<PresetKey, ReturnType<typeof solarNoon>>;
const noonDir = (k: PresetKey): 'N' | 'S' => (Math.cos((noon[k].pos.azimuth * Math.PI) / 180) > 0 ? 'N' : 'S');
const shadowTower = buildings.filter((b) => b.heightSource === 'cited' && b.name && !/Tower of Light/.test(b.name)).sort((a, b) => b.height - a.height)[0];
const wettestIdx = climate.precipitationMm.indexOf(Math.max(...climate.precipitationMm));

// ---------- helpers ----------
const longestNamed = <T extends { name: string | null; pts: XY[] }>(arr: T[], name: string) => {
  const cand = arr.filter((a) => a.name === name); if (!cand.length) return null;
  const L = (a: T) => a.pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - a.pts[i - 1][0], p[1] - a.pts[i - 1][1]) : 0), 0);
  const best = cand.sort((a, b) => L(b) - L(a))[0]; return best.pts[Math.floor(best.pts.length / 2)];
};
const centroid = (ring: XY[]): XY => { const s = ring.reduce((m, p) => [m[0] + p[0], m[1] + p[1]], [0, 0]); return [s[0] / ring.length, s[1] / ring.length]; };
const precinct = (name: string) => areas.precincts.find((p) => p.name === name);
const nn = <T,>(a: (T | null | undefined)[]) => a.filter((x): x is T => !!x);
const h = (tag: string, attrs: Record<string, string> = {}, html = '') => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.innerHTML = html; return e; };
function toggle(parent: HTMLElement, label: string, checked: boolean, onChange: (v: boolean) => void, swatch?: string) {
  const l = h('label', { class: 'toggle' }); const i = h('input', { type: 'checkbox', role: 'switch' }) as HTMLInputElement; i.checked = checked;
  i.addEventListener('change', () => onChange(i.checked)); l.append(i);
  if (swatch) l.append(h('span', { class: 'swatch', style: `background:${swatch}` }));
  l.append(document.createTextNode(label)); parent.append(l); return i;
}
const boundsView = (pts: XY[], minD = 420): View => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2; const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return { target: [cx, 0, -cy], azimuth: 0.2, polar: 0.78, distance: Math.max(minD, span * 3.4) };
};
const routePts = (r: Route) => r.segments.flatMap((s) => s.pts);
const srcShort = (url: string) => (/skyscrapercenter/.test(url) ? 'CTBUH' : /wikipedia/.test(url) ? 'Wikipedia' : /starproperty/.test(url) ? 'StarProperty' : /igbproperty/.test(url) ? 'IGB' : /cbd\.my/.test(url) ? 'cbd.my' : /scraperbase/.test(url) ? 'Scraperbase' : 'source');
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function heightLabel(b: Pick<Building, 'height' | 'heightSource' | 'levels' | 'heightRef'>) {
  const T = t().heights; const r = b.heightRef;
  if (b.heightSource === 'cited' && r) {
    if (r.unit === 'floors' && r.storeyHeight) return T.citedFloors(b.height, r.value, r.storeyHeight, srcShort(r.url));
    return r.ctbuhEstimated ? T.citedEst(b.height, srcShort(r.url)) : T.citedM(b.height, srcShort(r.url));
  }
  return b.heightSource === 'osm' ? T.osm(b.height) : b.heightSource === 'levels' ? T.levels(b.height, b.levels) : T.estimate(b.height);
}
export function routeName(r: Route) {
  const A = t().anchor; const name = (k: string) => (k === 'ECO' ? A.ECO(ecoTower) : A[k as 'KJ17'] ?? k);
  return `${name(r.from)} → ${name(r.to)}`;
}
const SHARE_ORDER: Share[] = ['bridge', 'indoor', 'covered', 'open'];
function shareBar(r: { byShare: Partial<Record<Share, number>>; length: number }) {
  const T = t();
  const bar = h('div', { class: 'share-bar', role: 'img', 'aria-label': SHARE_ORDER.map((k) => `${T.shares[k]} ${fmt(r.byShare[k] || 0)} m`).join(', ') });
  for (const k of SHARE_ORDER) { const v = r.byShare[k] || 0; if (v > 0) bar.append(h('span', { class: `share-${k}`, style: `width:${(v / r.length) * 100}%` })); }
  const legend = h('div', { class: 'share-legend' });
  for (const k of SHARE_ORDER) legend.append(h('div', { class: 'legend-row' }, `<span class="swatch box share-${k}"></span><span class="lg-name">${T.shares[k]}</span><span class="lg-val">${fmt(r.byShare[k] || 0)} m · ${pct(r.byShare[k] || 0, r.length)}%</span>`));
  return [bar, legend];
}

// ---------- chapters (rebuilt on language change) ----------
export function buildChapters(): Chapter[] {
  const T = t(); const N = T.names; const U = T.units;
  const OSM_SRC = T.common.osmSrc(stats.fetchedDate);
  const stationPin = (ref: string, line: 'lrt' | 'ktm', title: string, value?: string): PinDef | null => {
    const s = station(ref); if (!s) return null;
    return { id: `st-${ref}`, title, value: value ?? `${ref} · ${T.common.osm}`, at: D(s.c, 13), kind: 'station', color: lineColor[line] };
  };
  const placePin = (name: string, title = name, value?: string, kind: PinDef['kind'] = 'major'): PinDef | null => {
    const p = findPlace(name); if (!p) return null;
    return { id: `pl-${name}`, title, value, at: D(p.c, p.height + 3), kind };
  };
  const textPin = (id: string, title: string, at: XY | null, y = 2, value?: string): PinDef | null => (at ? { id, title, value, at: D(at, y), kind: 'minor' } : null);
  const corePins = () => nn([
    stationPin('KJ17', 'lrt', N.kj17, 'LRT · KJ17'),
    placePin('Strata Office', N.ecoCity, undefined, 'major'),
    placePin('The Gardens Mall', N.gardens),
    placePin('Mid Valley Megamall', N.megamall),
    stationPin('KB01', 'ktm', N.kb01, 'KTM · KB01'),
  ]);
  const tallestNames = stats.citedTallest.map((b) => b.name).join(' · ');
  const tallestH = stats.citedTallest[0]?.height;

  const describeLeg = (r: Route) => {
    let s = Object.entries(r.byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${fmt(v)} m ${T.ch5.cls[k] || k}`).join(', ') + '.';
    if (r.withinEcoCityM > 0) s += ` ${T.ch5.inEco(r.withinEcoCityM)}`;
    if (r.overWaterM > 0) s += ` ${T.ch5.overRiver(r.overWaterM)}`;
    return s;
  };

  return [
    // ---------------- 00 cover ----------------
    {
      id: 0, label: T.ch0.label, tab: T.ch0.tab, title: T.ch0.title, lead: T.ch0.lead,
      stats: [
        { fig: fmt(stats.buildingCount), unit: U.blocks, cap: T.ch0.statBlocks },
        ...(tallestH ? [{ fig: fmt(tallestH), unit: U.m, cap: T.ch0.statTallest(tallestNames) }] : []),
        { fig: fmt(stats.routeTotalM), unit: U.m, cap: T.ch0.statWalk(fmt(stats.routeMinutes)) },
      ],
      hint: T.ch0.hint,
      source: T.ch0.source(OSM_SRC, stats.heightCited),
      view: { target: [0, 0, -40], azimuth: -0.72, polar: 0.95, distance: 1950 },
      mode: { rails: { lrt: 'highlight', ktm: 'highlight', erl: 'context' }, footways: 'hidden', routeSet: 'none', xray: false, buildingStyle: 'default', precincts: false },
      pins: corePins(),
      panel: (el) => {
        const s1 = h('section'); s1.append(h('h3', {}, T.ch0.studyArea));
        s1.append(h('div', { class: 'small' }, T.ch0.studyText(meta.center.lat.toFixed(4), meta.center.lon.toFixed(4), fmt(meta.halfSizeM * 2), `S ${meta.bbox.south} · W ${meta.bbox.west} · N ${meta.bbox.north} · E ${meta.bbox.east}`)));
        const s2 = h('section'); s2.append(h('h3', {}, T.ch0.onModel));
        const L = T.ch0.legend;
        for (const [sw, txt] of [['var(--scene-building)', L.building], ['var(--c-water)', L.water], ['var(--c-green)', L.green], ['var(--c-lrt)', L.lrt], ['var(--c-ktm)', L.ktm]] as const)
          s2.append(h('div', { class: 'legend-row' }, `<span class="swatch box" style="background:${sw}"></span>${txt}`));
        const s3 = h('section'); s3.append(h('h3', {}, T.ch0.quality));
        s3.append(h('div', { class: 'small' }, T.ch0.qualityText(stats.heightCited, stats.heightOsm, stats.heightLevels, stats.heightEstimate)));
        el.append(s1, s2, s3);
      },
    },
    // ---------------- 01 location ----------------
    {
      id: 1, label: T.ch1.label, tab: T.ch1.tab, title: T.ch1.title, lead: T.ch1.lead,
      stats: [
        { fig: fmt(stats.stationCount), unit: U.stations, cap: T.ch1.statStations(nn([kj17, kd01, kb01]).map((s) => s.ref).join(', ')) },
        ...(stats.straightKJ17toKB01 ? [{ fig: fmt(stats.straightKJ17toKB01), unit: U.m, cap: T.ch1.statStraight }] : []),
        { fig: fmt(stats.railCorridors), unit: U.lines, cap: T.ch1.statCorridors },
      ],
      source: T.ch1.source(OSM_SRC),
      view: { target: [30, 0, -20], azimuth: -0.06, polar: 0.5, distance: 2250 },
      mode: { rails: { lrt: 'highlight', ktm: 'highlight', erl: 'context' }, footways: 'hidden', routeSet: 'none', xray: false, buildingStyle: 'default', precincts: true },
      pins: nn([
        stationPin('KJ17', 'lrt', N.kj17, T.ch1.pinLrtLine),
        stationPin('KD01', 'ktm', N.kj17, T.ch1.pinKtm('KD01')),
        stationPin('KB01', 'ktm', N.kb01, T.ch1.pinKtm('KB01')),
        textPin('lbl-river', N.river, longestNamed(lines.waterLines, 'Klang River'), 1),
        textPin('lbl-fed', N.fedHwy, longestNamed(lines.roads, 'Lebuhraya Persekutuan'), 1, N.fedHwy === N.fedHwyLocal ? undefined : N.fedHwyLocal),
        textPin('lbl-bangsar', N.bangsar, longestNamed(lines.roads, 'Jalan Bangsar'), 1),
        precinct('KL Eco City') ? textPin('lbl-eco', N.ecoCity, centroid(precinct('KL Eco City')!.ring), 70, T.ch1.precinctPin) : null,
        precinct('Mid Valley City') ? textPin('lbl-mvc', N.mvCity, centroid(precinct('Mid Valley City')!.ring), 120, T.ch1.precinctPin) : null,
      ]),
      panel: (el, world) => {
        const s1 = h('section'); s1.append(h('h3', {}, T.common.layers));
        toggle(s1, N.lrtLine, true, (v) => world.setMode({ rails: { ...world.mode.rails, lrt: v ? 'highlight' : 'hidden' } }), 'var(--c-lrt)');
        toggle(s1, N.ktm, true, (v) => world.setMode({ rails: { ...world.mode.rails, ktm: v ? 'highlight' : 'hidden' } }), 'var(--c-ktm)');
        toggle(s1, N.erl, true, (v) => world.setMode({ rails: { ...world.mode.rails, erl: v ? 'context' : 'hidden' } }), 'var(--c-erl)');
        toggle(s1, T.ch1.precinctToggle, true, (v) => world.setMode({ precincts: v }));
        const s2 = h('section'); s2.append(h('h3', {}, T.ch1.stationsInOsm));
        const ul = h('ul', { class: 'station-list' });
        for (const [s, line] of [[kj17, 'lrt'], [kd01, 'ktm'], [kb01, 'ktm']] as const) if (s)
          ul.append(h('li', {}, `<span class="badge" style="background:${lineColor[line]}">${s.ref ?? '—'}</span><div><div>${s.name}</div><div class="small">${s.operator ?? T.ch1.operatorMissing}</div></div>`));
        s2.append(ul, h('div', { class: 'small' }, T.ch1.stationsNote));
        el.append(s1, s2);
      },
    },
    // ---------------- 03 massing ----------------
    {
      id: 3, label: T.ch3.label, tab: T.ch3.tab, title: T.ch3.title, lead: T.ch3.lead,
      stats: [
        ...(tallestH ? [{ fig: fmt(tallestH), unit: U.m, cap: T.ch3.statTallest(tallestNames) }] : []),
        { fig: fmt(stats.heightCited), unit: U.blocks, cap: T.ch3.statCited(stats.citedNamed) },
        { fig: fmt(stats.heightEstimate), unit: U.blocks, cap: T.ch3.statEstimate },
      ],
      source: T.ch3.source(OSM_SRC, meta.heightSourcesFetched),
      view: { target: [-30, 80, -70], azimuth: -0.38, polar: 1.08, distance: 1750 },
      mode: { rails: { lrt: 'context', ktm: 'context', erl: 'hidden' }, footways: 'hidden', routeSet: 'none', xray: false, buildingStyle: 'default', precincts: false },
      pins: nn(tallestNamed.filter((b) => b.precinct).slice(0, 8).map((b) => placePin(b.name!, b.name!, heightLabel(b)))),
      panel: (el, world) => {
        const s1 = h('section'); s1.append(h('h3', {}, T.ch3.display));
        const legend = h('div', { class: 'src-legend', style: 'display:none' });
        for (const [k, txt] of [['cited', T.ch3.legendCited(stats.heightCited)], ['osm', T.ch3.legendOsm(stats.heightOsm)], ['levels', T.ch3.legendLevels(stats.heightLevels)], ['estimate', T.ch3.legendEstimate(stats.heightEstimate)]] as const)
          legend.append(h('div', { class: 'legend-row' }, `<span class="swatch box" style="background:var(--src-${k})"></span>${txt}`));
        const slider = h('div', { class: 'slider', style: 'margin-top:14px' });
        slider.innerHTML = `<label for="thr">${T.ch3.thresholdLabel}</label><output id="thr-out">${T.ch3.off}</output><input id="thr" type="range" min="0" max="240" step="5" value="0" aria-label="${T.ch3.thresholdAria}"/>`;
        const inp = slider.querySelector('input') as HTMLInputElement; const out = slider.querySelector('output')!;
        const src = toggle(s1, T.ch3.colourBySource, false, (v) => { legend.style.display = v ? 'block' : 'none'; if (v) { inp.value = '0'; out.textContent = T.ch3.off; } world.setMode({ buildingStyle: v ? 'source' : 'default' }); });
        src.id = 'src-toggle';
        s1.append(legend, slider);
        inp.addEventListener('input', () => {
          const v = +inp.value; out.textContent = v ? T.ch3.thresholdOut(v, buildings.filter((b) => b.height >= v).length) : T.ch3.off;
          if (v) { src.checked = false; legend.style.display = 'none'; }
          world.setMode({ buildingStyle: v ? 'threshold' : 'default', threshold: v });
        });
        const s2 = h('section'); s2.append(h('h3', {}, T.ch3.tallest));
        const max = tallestNamed[0]?.height || 1; const bars = h('div', { class: 'bars' });
        for (const b of tallestNamed) bars.append(h('span', { class: 'name', title: b.name! }, b.name!), h('span', {}, `<div class="bar ${b.heightSource}" style="width:${(b.height / max) * 100}%"></div>`), h('span', { class: 'val' }, `${b.heightSource === 'osm' || (b.heightSource === 'cited' && b.heightRef?.unit === 'm' && !b.heightRef.ctbuhEstimated) ? '' : '≈'}${fmt(b.height)} m`));
        s2.append(bars, h('div', { class: 'small', style: 'margin-top:10px' }, T.ch3.barsNote));
        if (buildings.some((b) => b.name === 'MidValley Tower of Light' && b.heightSource === 'cited')) s2.append(h('div', { class: 'small warn', style: 'margin-top:8px' }, T.ch3.conflict));
        el.append(s1, s2);
      },
    },
    // ---------------- 05 connections ----------------
    {
      id: 5, label: T.ch5.label, tab: T.ch5.tab, title: T.ch5.title, lead: T.ch5.lead(fmt(stats.routeTotalM)),
      stats: [
        { fig: fmt(stats.routeTotalM), unit: U.m, cap: T.ch5.statLength },
        { fig: `≈${fmt(stats.routeMinutes)}`, unit: U.min, cap: T.ch5.statTime },
        { fig: fmt(stats.routeBridgeShare), unit: U.pct, cap: T.ch5.statBridge(stats.routeBridgeM) },
      ],
      source: T.ch5.source(OSM_SRC),
      view: { target: [8, 0, -70], azimuth: 0, polar: 0.62, distance: 1900 },
      mode: { rails: { lrt: 'context', ktm: 'context', erl: 'hidden' }, footways: 'faint', routeSet: 'legs', routeFocus: null, xray: true, buildingStyle: 'default', precincts: false },
      pins: nn([
        stationPin('KJ17', 'lrt', T.anchor.KJ17, T.ch5.pinStart),
        placePin('The Gardens Mall', N.gardens, routes[0] ? T.ch5.pinFromLrt(routes[0].length) : undefined),
        placePin('Mid Valley Megamall', N.megamall, routes[1] ? T.ch5.pinPlus(routes[1].length) : undefined),
        stationPin('KB01', 'ktm', T.anchor.KB01, routes[2] ? T.ch5.pinEnd(routes[2].length) : T.common.end),
        routeBridgeEnclosed ? textPin('lbl-bridge', T.ch5.bridgePin, routeBridgeEnclosed.pts[Math.floor(routeBridgeEnclosed.pts.length / 2)], 12, T.ch5.bridgeValue(routeBridgeEnclosed.length)) : null,
      ]),
      panel: (el, world, ctx) => {
        const s1 = h('section'); s1.append(h('h3', {}, T.ch5.steps));
        const ol = h('ol', { class: 'step-list' });
        routes.forEach((r, i) => {
          const li = h('li', { tabindex: '0', role: 'button', 'aria-label': T.common.focusStep(i + 1) }, `<span class="step-n">${i + 1}</span><div><div class="step-title">${routeName(r)}</div><div class="step-meta">${fmt(r.length)} m · ≈${fmt(r.minutes, 1)} min</div><div class="step-desc">${describeLeg(r)}</div></div>`);
          const act = () => { const on = !li.classList.contains('active'); ol.querySelectorAll('li').forEach((x) => x.classList.remove('active')); if (on) li.classList.add('active'); world.setMode({ routeFocus: on ? i : null }); ctx.flyTo(on ? boundsView(routePts(r)) : ctx.chapterView); };
          li.addEventListener('click', act); li.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') act(); });
          ol.append(li);
        });
        s1.append(ol);
        const s2 = h('section'); s2.append(h('h3', {}, T.common.layers));
        toggle(s2, T.ch5.allFootways, false, (v) => world.setMode({ footways: v ? 'show' : 'faint' }), 'var(--ink)');
        toggle(s2, T.ch5.xray, true, (v) => world.setMode({ xray: v }));
        s2.append(h('div', { class: 'small', style: 'margin-top:8px' }, T.ch5.layersNote(meta.counts.footbridges, meta.counts.indoorCorridors)));
        el.append(s1, s2);
      },
    },
    // ---------------- 06 walking routes ----------------
    {
      id: 6, label: T.ch6.label, tab: T.ch6.tab, title: T.ch6.title, lead: T.ch6.lead,
      stats: [
        { fig: fmt(walks.length), unit: U.routes, cap: T.ch6.statCount },
        { fig: `${fmt(walkTotals.min)}–${fmt(walkTotals.max)}`, unit: U.m, cap: T.ch6.statRange },
        { fig: fmt(walkTotals.bridgeIndoorPct), unit: U.pct, cap: T.ch6.statShare },
      ],
      source: T.ch6.source(OSM_SRC, ecoTower),
      view: { target: [-20, 0, -40], azimuth: 0.15, polar: 0.72, distance: 1500 },
      mode: { rails: { lrt: 'context', ktm: 'context', erl: 'hidden' }, footways: 'faint', routeSet: 'walks', walkFocus: walks[0]?.id ?? null, xray: true, buildingStyle: 'default', precincts: false },
      pins: nn([
        stationPin('KJ17', 'lrt', T.anchor.KJ17, 'KJ17'),
        stationPin('KB01', 'ktm', T.anchor.KB01, 'KB01'),
        placePin('The Gardens Mall', N.gardens),
        placePin('Mid Valley Megamall', N.megamall),
        anchors.ECO ? placePin(ecoTower, T.anchor.ECO(ecoTower)) : null,
      ]),
      panel: (el, world, ctx) => {
        const s1 = h('section'); s1.append(h('h3', {}, T.ch6.pick));
        const list = h('div', { class: 'route-pick', role: 'radiogroup', 'aria-label': T.ch6.pickAria });
        const detail = h('div', { class: 'route-detail' });
        const show = (r: Route, fly: boolean) => {
          list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === r.id)));
          world.setMode({ walkFocus: r.id }); world.replayWalk();
          if (fly) ctx.flyTo(boundsView(routePts(r), 900));
          detail.innerHTML = '';
          const kv = h('dl', { class: 'kv' });
          for (const [k, v] of [[T.ch6.length, `${fmt(r.length)} m`], [T.ch6.time, `≈${fmt(r.minutes, 1)} min`], [T.ch6.straight, `${fmt(r.straightLine)} m`], [T.ch6.detour, `× ${fmt(r.length / r.straightLine, 2)}`]] as const) kv.append(h('dt', {}, k), h('dd', {}, v));
          const play = h('button', { class: 'text-btn mono play-btn', type: 'button' }, `↻ ${T.ch6.replay}`);
          play.addEventListener('click', () => world.replayWalk());
          detail.append(kv, h('h3', { style: 'margin-top:16px' }, T.ch6.shareHead), ...shareBar(r), play);
        };
        for (const r of walks) {
          const b = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', class: 'route-btn', 'data-id': r.id }, `<span class="rb-name">${routeName(r)}</span><span class="rb-val">${fmt(r.length)} m</span>`);
          b.addEventListener('click', () => show(r, true)); list.append(b);
        }
        s1.append(list);
        const s2 = h('section'); s2.append(detail);
        const s3 = h('section'); s3.append(h('div', { class: 'small' }, T.ch6.notModelled));
        el.append(s1, s2, s3);
        if (walks[0]) show(walks[0], false);
      },
    },
    // ---------------- 07 sun & shade ----------------
    {
      id: 7, label: T.ch7.label, tab: T.ch7.tab, title: T.ch7.title,
      lead: T.ch7.lead(meta.center.lat.toFixed(1), fmt(noon.jun.pos.altitude, 1), fmt(noon.dec.pos.altitude, 1)),
      stats: (['mar', 'jun', 'dec'] as PresetKey[]).map((k) => ({ fig: fmt(noon[k].pos.altitude, 1), unit: U.deg, cap: T.ch7.statNoon(T.ch7.presetDates[k], T.ch7.dir[noonDir(k)]) })),
      source: T.ch7.source(meta.center.lat.toFixed(4), meta.center.lon.toFixed(4), groundSamples.length),
      view: { target: [-20, 0, -40], azimuth: -0.35, polar: 0.78, distance: 1900 },
      mode: { rails: { lrt: 'context', ktm: 'context', erl: 'hidden' }, footways: 'hidden', routeSet: 'none', xray: false, buildingStyle: 'default', precincts: false, shadeDots: true, muteWater: true, sun: null },
      pins: shadowTower ? nn([placePin(shadowTower.name!, shadowTower.name!, heightLabel(shadowTower))]) : [],
      panel: (el, world, ctx) => {
        const S = T.ch7;
        let preset: PresetKey = 'jun'; let minutes = 9 * 60; let playing = false; let raf = 0; let lastShade = 0; let pending = 0;
        world.setShadeSamples(groundSamples);
        // date presets
        const s1 = h('section'); s1.append(h('h3', {}, S.date));
        const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': S.date });
        for (const k of Object.keys(PRESETS) as PresetKey[]) {
          const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === preset), 'data-k': k }, `${S.presets[k]}<small>${S.presetDates[k]}</small>`);
          b.addEventListener('click', () => { preset = k; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.k === k))); update(true); });
          seg.append(b);
        }
        s1.append(seg);
        const slider = h('div', { class: 'slider', style: 'margin-top:14px' });
        slider.innerHTML = `<label for="sun-time">${S.time}</label><output id="sun-time-out"></output><input id="sun-time" type="range" min="${7 * 60}" max="${19 * 60}" step="5" value="${minutes}" aria-label="${S.timeAria}"/>`;
        const inp = slider.querySelector('input') as HTMLInputElement; const out = slider.querySelector('output')!;
        const playBtn = h('button', { type: 'button', class: 'text-btn mono play-btn', 'aria-pressed': 'false' }, `▶ ${S.play}`);
        s1.append(slider, playBtn);
        // readouts
        const s2 = h('section');
        const kv = h('dl', { class: 'kv' }); s2.append(kv);
        // sidewalk shade
        const s3 = h('section'); s3.append(h('h3', {}, S.sidewalkShade));
        const big = h('div', { class: 'big-num' }); const bigBar = h('div', { class: 'meter' }, '<span></span>');
        const head = h('div', { class: 'shade-head' }); head.append(big, h('div', {}, `<div class="legend-row"><span class="swatch box" style="background:var(--c-amber)"></span>${S.dotsLegend.lit}</div><div class="legend-row"><span class="swatch box" style="background:var(--c-shade)"></span>${S.dotsLegend.shade}</div>`));
        s3.append(head, bigBar, h('div', { class: 'small' }, S.sidewalkNote(groundSamples.length)));
        const s4 = h('section'); s4.append(h('h3', {}, S.routeShade));
        const rlist = h('div', { class: 'mini-bars' }); s4.append(rlist, h('div', { class: 'small', style: 'margin-top:6px' }, S.routeShadeNote));
        el.append(s1, s2, s3, s4);

        const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        function shade(alt: number, az: number) {
          const g = world.shadeTest(groundSamples, alt, az); world.setShadeResult(g);
          const p = pct(g.filter(Boolean).length, g.length);
          big.innerHTML = alt > 0 ? `${fmt(p)}<span class="unit">%</span>` : `<span class="small">${S.belowHorizon}</span>`;
          (bigBar.firstElementChild as HTMLElement).style.width = `${alt > 0 ? p : 0}%`;
          rlist.innerHTML = '';
          for (const set of routeSampleSets) {
            const name = set.route ? routeName(set.route) : T.ch8.legsName;
            if (!set.pts.length) { rlist.append(h('div', { class: 'mb-row' }, `<span class="mb-name" title="${name}">${name}</span><span class="mb-val muted">${S.fullyCovered}</span>`)); continue; }
            const r = world.shadeTest(set.pts, alt, az); const rp = pct(r.filter(Boolean).length, r.length);
            rlist.append(h('div', { class: 'mb-row' }, `<span class="mb-name" title="${name} · ${S.exposedM(set.exposedM)}">${name}<small>${S.exposedM(set.exposedM)}</small></span><span class="meter sm"><span style="width:${alt > 0 ? rp : 0}%"></span></span><span class="mb-val">${alt > 0 ? `${rp}%` : '—'}</span>`));
          }
          lastShade = performance.now();
        }
        function update(forceShade = false) {
          const [mo, d] = PRESETS[preset];
          const pos = sunPosition(mytDate(SUN_YEAR, mo, d, minutes), meta.center.lat, meta.center.lon);
          world.setMode({ sun: { altitude: pos.altitude, azimuth: pos.azimuth } });
          out.textContent = `${hhmm(minutes)} · ${S.presetDates[preset]}`; inp.value = String(minutes);
          const up = pos.altitude > 0;
          kv.innerHTML = '';
          const shadowLen = shadowTower && up ? shadowTower.height / Math.tan((pos.altitude * Math.PI) / 180) : null;
          for (const [k, v] of [
            [S.altitude, `${fmt(pos.altitude, 1)}°${up ? '' : ` (${S.belowHorizon})`}`],
            [S.azimuth, `${fmt(pos.azimuth, 0)}° ${T.compass16[compassIndex(pos.azimuth)]}`],
            ...(shadowTower ? [[S.shadow(shadowTower.height, shadowTower.name!), shadowLen != null ? `${fmt(shadowLen)} m` : '—']] : []),
          ] as [string, string][]) kv.append(h('dt', {}, k), h('dd', {}, v));
          // shade raycasting is the expensive part: throttle while playing / dragging
          clearTimeout(pending);
          if (forceShade || performance.now() - lastShade > 180) shade(pos.altitude, pos.azimuth);
          else pending = window.setTimeout(() => shade(pos.altitude, pos.azimuth), 200);
        }
        inp.addEventListener('input', () => { minutes = +inp.value; update(); });
        inp.addEventListener('change', () => { minutes = +inp.value; update(true); });
        const stop = () => { playing = false; cancelAnimationFrame(raf); clearTimeout(raf); playBtn.setAttribute('aria-pressed', 'false'); playBtn.textContent = `▶ ${S.play}`; };
        playBtn.addEventListener('click', () => {
          if (playing) { stop(); update(true); return; }
          playing = true; playBtn.setAttribute('aria-pressed', 'true'); playBtn.textContent = `❚❚ ${S.pause}`;
          if (minutes >= 19 * 60) minutes = 7 * 60;
          if (reduced()) { // discrete half-hour steps, no continuous motion
            const step = () => { if (!playing) return; minutes = Math.min(19 * 60, minutes + 30); update(true); if (minutes >= 19 * 60) stop(); else raf = window.setTimeout(step, 1200); };
            raf = window.setTimeout(step, 600);
          } else {
            let last = performance.now();
            const tick = (now: number) => { if (!playing) return; minutes = Math.min(19 * 60, minutes + ((now - last) / 1000) * 30); last = now; minutes = Math.round(minutes); update(); if (minutes >= 19 * 60) { stop(); update(true); } else raf = requestAnimationFrame(tick); };
            raf = requestAnimationFrame(tick);
          }
        });
        ctx.onCleanup(() => { stop(); clearTimeout(pending); });
        (window as unknown as { __sun: unknown }).__sun = { set: (k: PresetKey, m: number) => { preset = k; minutes = m; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.k === k))); update(true); } };
        update(true);
      },
    },
    // ---------------- 08 rain & monsoon ----------------
    {
      id: 8, label: T.ch8.label, tab: T.ch8.tab, title: T.ch8.title,
      lead: T.ch8.lead(fmt(climate.yearPrecipitationMm), fmt(climate.yearPrecipitationDays, 1), T.monthsLong[wettestIdx]),
      stats: [
        { fig: fmt(stats.shelteredFootPct), unit: U.pct, cap: T.ch8.statFoot(stats.shelteredFootM, stats.footwayM) },
        { fig: fmt(pct(legsSheltered, legsTotal)), unit: U.pct, cap: T.ch8.statLegs },
        { fig: fmt(climate.yearPrecipitationMm), unit: U.mm, cap: T.ch8.statRain(T.ch8.station) },
      ],
      source: T.ch8.source(OSM_SRC, T.ch8.station, climate.period, climate.fetched),
      view: { target: [-10, 0, -60], azimuth: 0.12, polar: 0.66, distance: 1650 },
      mode: { rails: { lrt: 'context', ktm: 'context', erl: 'hidden' }, footways: 'rain', routeSet: 'walks', walkFocus: null, routeStyle: 'rain', muteWater: true, xray: true, buildingStyle: 'default', precincts: false },
      pins: nn([
        stationPin('KJ17', 'lrt', T.anchor.KJ17, 'KJ17'),
        stationPin('KB01', 'ktm', T.anchor.KB01, 'KB01'),
        placePin('The Gardens Mall', N.gardens),
        placePin('Mid Valley Megamall', N.megamall),
      ]),
      panel: (el, world, ctx) => {
        const R = T.ch8;
        const s1 = h('section'); s1.append(h('h3', {}, R.routes));
        s1.append(h('div', { class: 'legend-row' }, `<span class="swatch box" style="background:var(--c-covered)"></span>${R.legendCovered}<span class="swatch box" style="background:var(--c-open);margin-left:14px"></span>${R.legendOpen}`));
        const list = h('div', { class: 'route-pick rain', role: 'radiogroup', 'aria-label': R.pickAria });
        const items: { id: string; name: string; cov: number; all: number; apply: () => void }[] = [
          { id: 'legs', name: R.legsName, cov: legsSheltered, all: legsTotal, apply: () => { world.setMode({ routeSet: 'legs', walkFocus: null }); ctx.flyTo(boundsView(routes.flatMap(routePts), 520)); } },
          ...walks.map((w) => ({ id: w.id, name: routeName(w), cov: w.shelteredM, all: w.length, apply: () => { world.setMode({ routeSet: 'walks', walkFocus: w.id }); ctx.flyTo(boundsView(routePts(w), 520)); } })),
        ];
        for (const it of items) {
          const p = pct(it.cov, it.all);
          const b = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', class: 'route-btn', 'data-id': it.id },
            `<span class="rb-name">${it.name}</span><span class="rb-val">${p}%</span><span class="cov-bar"><span style="width:${p}%"></span></span><span class="rb-sub">${R.coveredOf(it.cov, it.all)}</span>`);
          b.addEventListener('click', () => {
            const on = b.getAttribute('aria-checked') !== 'true';
            list.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false'));
            if (on) { b.setAttribute('aria-checked', 'true'); it.apply(); } else { world.setMode({ routeSet: 'walks', walkFocus: null }); ctx.flyTo(ctx.chapterView); }
          });
          list.append(b);
        }
        s1.append(list);
        const s2 = h('section'); s2.append(h('h3', {}, R.climate));
        const max = Math.max(...climate.precipitationMm); const chart = h('div', { class: 'rain-chart', role: 'img', 'aria-label': climate.precipitationMm.map((v, i) => `${T.months[i]} ${fmt(v, 1)} mm`).join(', ') });
        climate.precipitationMm.forEach((v, i) => {
          const mon = climate.monsoonMonths.includes(i + 1);
          chart.append(h('div', { class: `rc-col${mon ? ' monsoon' : ''}`, title: `${T.months[i]}: ${fmt(v, 1)} mm · ${fmt(climate.precipitationDays[i], 1)} ${U.days}` }, `<span class="rc-val">${fmt(v)}</span><span class="rc-bar" style="height:${(v / max) * 100}%"></span><span class="rc-m">${T.months[i]}</span>`));
        });
        s2.append(chart, h('div', { class: 'small', style: 'margin-top:8px' }, R.climateNote(R.station, climate.period, fmt(climate.yearPrecipitationDays, 1))));
        const s3 = h('section'); s3.append(h('h3', {}, T.common.layers));
        toggle(s3, R.allWays, true, (v) => world.setMode({ footways: v ? 'rain' : 'hidden' }), 'var(--c-covered)');
        toggle(s3, R.xray, true, (v) => world.setMode({ xray: v }));
        el.append(s1, s2, s3);
      },
    },
  ];
}

export const currentLang = getLang;
